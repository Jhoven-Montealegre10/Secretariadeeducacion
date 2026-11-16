# Gestión de secretos y rotación de claves

## 1. Principios

- **Ningún secreto en el código, en Git, en el frontend ni en `.env`.** En producción el portal **no arranca** si
  encuentra un secreto en una variable de entorno; tampoco si el archivo del secreto permite escritura a
  cualquier usuario.
- Los secretos los guarda un **gestor de secretos** y los entrega al servidor como **archivos de solo lectura**:
  HashiCorp Vault (con Vault Agent), AWS Secrets Manager, Azure Key Vault, GCP Secret Manager, secretos de
  Docker/Kubernetes o `LoadCredential=` de systemd. El gestor los guarda cifrados, controla quién los lee y
  registra cada acceso.
- **Rotación:** cada secreto tiene un ciclo de vida. Hay claves vigentes y anteriores, de modo que rotar no
  interrumpe el servicio (las sesiones abiertas, los enlaces enviados y los datos cifrados siguen funcionando).
- Las herramientas **nunca muestran valores**: solo el identificador de cada clave y su **huella SHA-256**
  (primeros 16 caracteres hexadecimales), que sirve para comprobar qué clave hay en cada servidor sin revelarla.

### Hash, cifrado y secretos: qué se usa para qué

| Necesidad | Técnica | Por qué |
|---|---|---|
| Contraseñas de las personas usuarias | **Argon2id** (hash lento con sal) | Se guarda solo el hash. SHA-256 sería demasiado rápido: facilitaría ataques de fuerza bruta |
| Tokens de recuperación, códigos de recuperación, ID de sesión, índices de búsqueda, cadena de auditoría | **HMAC-SHA-256** con clave derivada | Se guarda solo el hash con clave: aunque alguien lea la base no puede usarlos |
| Datos personales (PQRSD) y secretos MFA | **AES-256-GCM** | Deben poder leerse: se cifran (no se pueden “hashear”) |
| Contraseña de PostgreSQL, clave de datos, secreto de sesión, SMTP | **Gestor de secretos + archivos + rotación** | La aplicación necesita el valor original para usarlos; por eso no se guardan como hash sino protegidos y rotados |
| Identificar una clave sin revelarla | **Huella SHA-256** | Comparar servidores y auditar rotaciones |

## 2. Secretos del portal

| Secreto | Contenido | Rotación |
|---|---|---|
| `DATA_ENCRYPTION_KEYS` | Llavero de claves de 32 bytes, una por línea `kAAAAMMDDhhmm:BASE64[:retirada]`. La primera activa es la vigente | `npm run secrets -- rotar-datos` (recomendado cada 90 días; el portal avisa al superar `SECRETS_MAX_AGE_DAYS`) |
| `SESSION_SECRETS` | Secretos de firma de la cookie de sesión, uno por línea. El primero firma, todos verifican | `npm run secrets -- rotar-sesion` (conserva 2 anteriores) |
| `DB_PASSWORD` | Contraseña de `semibague_app` | `npm run secrets -- rotar-bd`. **Dinámica:** se relee en cada conexión nueva, sin reiniciar |
| `DB_MIGRATION_PASSWORD` | Contraseña de `semibague_migrator` (solo en el paso de despliegue) | `npm run secrets -- rotar-bd --migraciones` |
| `SMTP_URL` | `smtps://usuario:clave@servidor:465` (o `smtp://…:587` con STARTTLS; TLS obligatorio) | En el proveedor de correo y en el gestor |
| `DB_ADMIN_URL` | Conexión de un administrador de PostgreSQL. **Solo** para `rotar-bd`; nunca en el servicio | En el gestor |

Formatos anteriores aceptados: `DATA_ENCRYPTION_KEY` (una sola clave en base64, se trata como `k0`) y
`SESSION_SECRET`. Los datos cifrados por la versión 3 (formato `v1`) se siguen leyendo y pasan al formato
nuevo (`v2:<id>:…`) con `npm run secrets -- recifrar`.

## 3. Cómo llega cada secreto a la aplicación

Orden de búsqueda para un secreto `NOMBRE`:

1. `NOMBRE_FILE=/ruta/absoluta` (p. ej. `/run/secrets/db_password` en Docker/Kubernetes);
2. `SECRETS_DIR/NOMBRE` (o en minúsculas): carpeta que monta el gestor;
3. `CREDENTIALS_DIRECTORY/NOMBRE`: la crea systemd con `LoadCredential=`;
4. variable de entorno `NOMBRE`: **solo en desarrollo y pruebas**.

### Ejemplo con systemd (sin escribir secretos en el disco del servicio)

```ini
# /etc/systemd/system/semibague.service (fragmento)
[Service]
User=semibague
EnvironmentFile=/etc/semibague/semibague.env          # SOLO configuración no secreta (.env.example)
LoadCredential=SESSION_SECRETS:/etc/semibague/secretos/SESSION_SECRETS
LoadCredential=DATA_ENCRYPTION_KEYS:/etc/semibague/secretos/DATA_ENCRYPTION_KEYS
LoadCredential=DB_PASSWORD:/etc/semibague/secretos/DB_PASSWORD
LoadCredential=SMTP_URL:/etc/semibague/secretos/SMTP_URL
```

systemd copia cada credencial a una carpeta privada del proceso (`$CREDENTIALS_DIRECTORY`), legible solo por
el servicio. La carpeta `/etc/semibague/secretos` debe ser `0700` de `root`.

### Ejemplo con HashiCorp Vault Agent

Vault Agent escribe cada secreto como archivo (plantilla) y lo **renueva** cuando Vault lo rota; con el motor de
**credenciales dinámicas de PostgreSQL**, Vault crea contraseñas de vida corta para `semibague_app` y el portal las
usa en la siguiente conexión sin reiniciar (`DB_PASSWORD_FILE` apuntando al archivo que escribe el agente).

### Ejemplo con Docker / Kubernetes

Monte los secretos como archivos (`/run/secrets/…`) y defina `SECRETS_DIR=/run/secrets` o `NOMBRE_FILE`.
No use `environment:` / `env:` para secretos.

## 4. Procedimientos

### Instalación inicial

```bash
npm run secrets -- generar --dir /etc/semibague/secretos   # crea los archivos 0600 (no sobrescribe)
npm run secrets -- estado                                  # origen, identificadores, huellas y edad
```

Importe esos archivos al gestor de secretos y guarde una copia de `DATA_ENCRYPTION_KEYS` **separada de los
respaldos de la base de datos** (sin ella no se pueden leer las PQRSD ni los segundos factores).

### Rotar la clave de datos (cada 90 días o ante sospecha de filtración)

```bash
npm run secrets -- rotar-datos      # agrega una clave vigente y vuelve a cifrar MFA y PQRSD con ella
# reiniciar la aplicación (cada instancia, de forma escalonada)
npm run secrets -- recifrar         # incluye lo guardado durante el reinicio (repetible, sin riesgo)
npm run secrets -- estado           # comprobar que la clave anterior ya no cifra ningún dato
npm run secrets -- retirar-datos <id-anterior>
```

Mientras la clave anterior siga activa, los enlaces de recuperación, los códigos de recuperación y las sesiones
creados con ella siguen funcionando. Al **retirarla** deja de cifrar y descifrar; se conserva solo para verificar
la cadena de auditoría antigua (cada evento guarda el identificador de la clave que lo firmó). Si quedan códigos
de recuperación firmados con esa clave, la herramienta lo advierte: pida a esas personas que generen códigos
nuevos en “Mi cuenta” (siguen entrando con su aplicación autenticadora) o use `--forzar`.

### Rotar el secreto de sesión

```bash
npm run secrets -- rotar-sesion     # luego reiniciar; las sesiones abiertas siguen válidas
```

### Rotar la contraseña de PostgreSQL (sin reiniciar)

```bash
npm run secrets -- rotar-bd                 # semibague_app
npm run secrets -- rotar-bd --migraciones   # semibague_migrator
```

Genera una contraseña aleatoria, la cambia en PostgreSQL (`ALTER ROLE` con `DB_ADMIN_URL`) y reescribe el archivo
de forma atómica (0600). Las conexiones nuevas del portal la leen al abrirse; las ya abiertas siguen válidas.

### Rotación periódica automática

Programe la rotación con un temporizador de systemd o el planificador del gestor de secretos, por ejemplo:

```ini
# /etc/systemd/system/semibague-rotar-bd.timer   → contraseña de la base de datos cada semana
[Timer]
OnCalendar=weekly
RandomizedDelaySec=1h
Persistent=true
```

La clave de datos se rota con el procedimiento anterior (incluye un reinicio), idealmente en una ventana de
mantenimiento trimestral. El portal registra un aviso al arrancar si la clave vigente supera `SECRETS_MAX_AGE_DAYS`.

### Ante una filtración

1. Rotar de inmediato el secreto afectado (`rotar-bd`, `rotar-sesion` o `rotar-datos`).
2. Para la clave de datos: `recifrar` y luego `retirar-datos <id>` con `--forzar`.
3. Para la sesión: además del reinicio, quite del archivo los secretos anteriores (cierra todas las sesiones).
4. Revisar la bitácora de auditoría y los registros de acceso del gestor de secretos.
