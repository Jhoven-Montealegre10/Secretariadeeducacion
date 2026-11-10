# Configuración y despliegue seguro

## 1. Entornos

| Entorno | `NODE_ENV` | Datos | Notas |
|---|---|---|---|
| Desarrollo | `development` | Locales, ficticios | Migraciones automáticas; correo guardado en `storage/correo-desarrollo/` |
| Pruebas | `test` | En memoria, ficticios | `npm test`; nunca usa datos reales |
| Preproducción | `production` | Copia **anonimizada** | Para pruebas de seguridad (ZAP, pentest) y de restauración |
| Producción | `production` | Reales | Migraciones explícitas, HTTPS, Swagger sin "Try it out" |

No use datos personales reales fuera de producción. Si necesita una copia, anonimice antes las tablas `pqrsd` y `usuarios`.

## 2. Requisitos del servidor

- Linux, **Node.js 22.13+**, proxy inverso con TLS (Nginx o Apache), ClamAV (recomendado), servidor SMTP institucional.
- Usuario de sistema sin privilegios (p. ej. `semibague`), sin shell interactivo.
- Carpeta de datos fuera del código (p. ej. `/var/lib/semibague`) propiedad de ese usuario, permisos `0750`.

## 3. Secretos y variables

1. `npm ci --omit=dev`
2. `npm run generate-keys` y guarde los valores en el **gestor de secretos** institucional o en `/etc/semibague/semibague.env` (propietario `root`, grupo `semibague`, permisos `0640`).
3. Guarde una copia de `DATA_ENCRYPTION_KEY` **separada de las copias de la base de datos**. Sin ella no se pueden leer las PQRSD ni los segundos factores.
4. Complete las variables a partir de `.env.example` (valores ficticios). El servidor **no arranca** en producción si faltan secretos o si `APP_URL` no usa `https://`.

## 4. Base de datos y migraciones

```bash
sudo -u semibague env $(cat /etc/semibague/semibague.env | xargs) npm run migrate
sudo -u semibague env $(cat /etc/semibague/semibague.env | xargs) npm run seed          # solo la primera vez
sudo -u semibague env $(cat /etc/semibague/semibague.env | xargs) npm run create-admin  # primer administrador
```

- En producción las migraciones **no** se aplican solas (`AUTO_MIGRATE=false`): el servidor se niega a iniciar si hay pendientes.
- Haga una copia de seguridad **antes** de cada migración.
- El archivo SQLite queda con permisos `0600`. No se expone ningún puerto de base de datos.
- Si se migra a PostgreSQL en el futuro: usuario de aplicación con permisos `SELECT/INSERT/UPDATE/DELETE` solamente, sin `DDL`, y otro usuario para migraciones.

## 5. Servicio (systemd)

```ini
[Unit]
Description=Portal SEM Ibagué
After=network.target

[Service]
User=semibague
Group=semibague
WorkingDirectory=/opt/semibague
EnvironmentFile=/etc/semibague/semibague.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/semibague

[Install]
WantedBy=multi-user.target
```

## 6. Proxy inverso (Nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name portal.example.gov.co;
  ssl_certificate     /etc/ssl/semibague/fullchain.pem;
  ssl_certificate_key /etc/ssl/semibague/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 25m;          # mayor carga permitida (10 archivos se validan uno a uno en la app)
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
}
server { listen 80; server_name portal.example.gov.co; return 301 https://$host$request_uri; }
```

Con un proxy, defina `TRUST_PROXY=1` (número exacto de proxies) para que los límites por IP usen la IP real.
La aplicación solo debe escuchar en `127.0.0.1`.

## 7. Copias de seguridad y restauración

Respaldar diariamente, cifrado y fuera del servidor:
- `/var/lib/semibague/semibague.sqlite` (use `sqlite3 semibague.sqlite ".backup respaldo.sqlite"` para una copia consistente),
- `/var/lib/semibague/media/` y `/var/lib/semibague/uploads/`.

**Prueba de restauración (trimestral, en preproducción):** restaure la copia en un servidor limpio con la misma
`DATA_ENCRYPTION_KEY`, ejecute `npm run migrate`, inicie, ingrese al panel con MFA, abra una PQRSD y una imagen, y
ejecute **Auditoría → Verificar integridad**. Registre fecha y resultado.

## 8. Lista de verificación antes de publicar

- [ ] `npm run verify` sin errores (lint, tipos, pruebas, contrato OpenAPI, dependencias).
- [ ] `NODE_ENV=production`, `APP_URL` con https, `TRUST_PROXY` correcto, `AUTO_MIGRATE=false`.
- [ ] `API_DOCS_TRY_IT_OUT=false` (por defecto en producción) y `CORS_ORIGINS` vacío salvo integraciones aprobadas.
- [ ] `SMTP_URL` configurado y probado (recuperación e invitaciones).
- [ ] `MALWARE_SCAN_COMMAND` configurado y probado con el archivo EICAR.
- [ ] Certificado TLS válido y redirección de HTTP a HTTPS.
- [ ] Primer administrador creado y con MFA configurado; ningún usuario de prueba.
- [ ] Escaneo DAST (OWASP ZAP) en preproducción sin hallazgos altos.
- [ ] Copia de seguridad automática y una restauración probada.

## 9. Operación

- Actualice dependencias mensualmente (`npm audit`, `npm outdated`) y ejecute `npm run verify` antes de desplegar.
- Revise la auditoría (accesos denegados, logins fallidos) y verifique su integridad periódicamente.
- Si agrega un CDN o caché, configure la purga de la URL de la página o noticia al publicar.
- El modo depuración no existe en producción: los errores solo muestran un código de referencia; el detalle técnico queda en el registro del servidor (sin cuerpos ni cabeceras de las peticiones).
