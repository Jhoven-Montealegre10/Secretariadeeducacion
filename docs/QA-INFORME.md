# Informe final de QA — versión 4 (TypeScript + NestJS + PostgreSQL)

Fecha: 11 de noviembre de 2026 · Rama: `claude/kind-mendel-0rz0tx` · El commit exacto se ve en el historial de la rama
(este informe se publica en el mismo commit que las últimas correcciones).

## 1. Entorno

| Elemento | Valor |
|---|---|
| Sistema | Linux (contenedor de desarrollo), 4 CPU, 16 GB RAM |
| Node.js | 24.22.2 LTS |
| PostgreSQL | 16.15, servidor local de **pruebas** (puerto 54329), bases temporales por ejecución |
| Navegador E2E | Chromium 153 (Playwright 1.63.0) |
| Datos | Siempre ficticios. Cada archivo de integración y cada ejecución E2E/carga crea su base `semibague_test_*` y la elimina al terminar |

## 2. Módulos verificados

Sitio público (inicio, páginas, noticias, normatividad, buscador, mapa, PQRSD, 404), autenticación (contraseña,
MFA, códigos de recuperación, recuperación por correo, expiración y cierre de sesión), Mi cuenta, usuarios, roles y
permisos, multimedia, páginas, noticias, sliders, estadísticas, auditoría, API REST y su documentación, salud y
métricas, migración SQLite → PostgreSQL, respaldo y restauración de SQLite, concurrencia y carga.

## 3. Tipos de prueba y resultados

| Tipo | Herramienta | Aprobadas | Fallidas | No ejecutadas / bloqueadas |
|---|---|---|---|---|
| Estático: lint (ESLint + reglas de seguridad), formato, tipos estrictos, compilación | ESLint, Prettier, `tsc` | sin errores | 0 | — |
| Unitarias (dominio, infraestructura, servicios con dependencias simuladas, escáner antimalware) | `node:test` | **60** | 0 | 0 |
| Integración contra PostgreSQL real (migraciones, migración de datos, repositorios, transacciones, sesiones, MFA, permisos, API, archivos, concurrencia, contrato OpenAPI, regresiones de QA y de seguridad) | `node:test` + supertest | **123** | 0 | 0 |
| E2E en navegador (panel, sitio, permisos saltando la interfaz, sin conexión, reinicio, escritorio/tableta/móvil, accesibilidad, consola y registro) | Playwright (Chromium) | **32** | 0 | 2 (ver §6) |
| Contrato OpenAPI sincronizado con el código | `npm run openapi:check` | 70 operaciones (6 públicas) | 0 | — |
| Dependencias | `npm audit` | 0 vulnerabilidades | — | — |
| Carga (entorno autorizado) | autocannon | 5 escenarios + concurrencia, 0 errores | 0 | — |
| QA independiente (agente distinto, sin acceso de escritura al repositorio) | manual + scripts propios | 92 de 124 en la primera ronda | 24 casos → 17 defectos | 1 bloqueado, 7 no ejecutados |

### Comandos de reproducción

```bash
export TEST_PG_ADMIN_URL=postgres://postgres:<clave>@127.0.0.1:5432/postgres   # SOLO un servidor de pruebas
npm ci && npm run verify          # lint, formato, tipos, build, unitarias, integración, OpenAPI, audit
npm run test:e2e                  # E2E_BROWSER=chromium|firefox|webkit; informe en test-results/e2e/
npm run test:load                 # informe en test-results/carga/informe-carga.json
```

La CI (`.github/workflows/ci.yml`) ejecuta lo mismo con un servicio PostgreSQL 16 y E2E en Chromium, Firefox y WebKit.

**Resultado en la CI de GitHub (ejecución 12, commit `f35f0c4`): todo aprobado.** Pasaron `verificar` (lint, formato, tipos, build, unitarias, integración con PostgreSQL, roles y migraciones, deriva del esquema, contrato OpenAPI y auditoría de dependencias) y las E2E en **Chromium, Firefox y WebKit**.

La CI en tres navegadores encontró y permitió corregir:
- **Defecto real en Firefox:** el `pattern` del slug y del ancla (`[a-z0-9-]+`) es inválido con la bandera `v` de HTML. Firefox lo ignoraba, así que esos campos no se validaban en el navegador. Corregido como `[a-z0-9\-]+`. El servidor ya lo validaba.
- **Inestabilidad de la propia prueba:**
  - esperas a un aviso genérico, que ahora esperan el texto exacto;
  - navegaciones que interrumpían peticiones en curso, que ahora esperan a que la red quede inactiva;
  - dependencia del mapa real de Google, que en la E2E ahora se responde con una página local.
- **Avisos ajenos a la aplicación en WebKit:**
  - El motor de captura de pantalla de WebKit inserta un estilo que la CSP bloquea. Solo ese aviso, solo en WebKit y solo durante la captura, se informa aparte en `avisosDeCapturaWebkit`.
  - WebKit redacta como «internal error» el fallo de red que provoca a propósito la prueba «sin conexión». Solo se acepta durante esa prueba.

La CSP no se relajó. Cualquier otro error de consola o violación de CSP sigue haciendo fallar la prueba.

## 4. Pruebas de carga

Una instancia, `DB_POOL_MAX=10`, caché pública de 60 s, 15 s por escenario.

| Escenario | Conexiones | Sol/s | p50 | p97,5 | p99 | máx (ms) | Errores | Conexiones PG máx |
|---|---|---|---|---|---|---|---|---|
| Inicio (HTML, caché) | 50 | 588 | 84 | 109 | 114 | 937 | 0 | 2 |
| API pública de noticias | 50 | 3 008 | 16 | 24 | 27 | 245 | 0 | 2 |
| Detalle de noticia (HTML) | 50 | 590 | 87 | 100 | 106 | 800 | 0 | 1 |
| Búsqueda (sin caché, PostgreSQL) | 25 | 430 | 55 | 91 | 98 | 147 | 0 | 10 |
| Panel: listado autenticado | 20 | 736 | 26 | 38 | 43 | 73 | 0 | 10 |
| 30 ediciones simultáneas de una página | 30 | — | — | — | — | 83 total | 0 (1 × 200, 29 × 409) | — |

**Supuestos y límites de estas cifras (leer antes de usarlas):**
- El generador de carga corrió **en el mismo proceso** que el servidor (comparten CPU y event loop): las cifras
  subestiman la capacidad; el uso de CPU (≈100 % de un núcleo) mezcla ambos.
- `NODE_ENV=test`: Express no guarda en caché las plantillas compiladas (sí lo hace en producción), lo que encarece las páginas HTML.
- PostgreSQL local sin red, sin TLS y sin proxy; datos sintéticos (40 noticias).
- El límite general por IP se elevó solo en ese proceso porque todo sale de una IP; los límites sensibles no cambiaron
  y su bloqueo se prueba en `rate-limit.test.ts`.
- El pool llegó a 10 conexiones sin solicitudes en espera ni tiempos agotados.
- **No se garantiza un número de usuarios concurrentes.** Debe repetirse en preproducción con la infraestructura real.

## 5. Defectos

### 5.1 Encontrados por la QA independiente

La QA la hizo un agente distinto del que desarrolló, sin escribir en el repositorio. Probó con tres perfiles
(administrador, editor y anónimo) contra un servidor y una base propios. Su informe completo, con las credenciales de
la base de pruebas omitidas, está en [`docs/qa/INFORME-QA-INDEPENDIENTE.md`](qa/INFORME-QA-INDEPENDIENTE.md).
Cada corrección tiene una prueba de regresión y la re-verificó el mismo agente.

| ID | Sev. | Defecto | Corrección | Regresión | Re-verificación |
|---|---|---|---|---|---|
| QA-01 | Media | Fecha inexistente (2026-02-30) → 500 | Validación de fecha real; códigos PG de fecha/texto inválidos → 400 | `qa-regresion.test.ts` | Corregido |
| QA-02 | Media | Byte NUL → 500 (también anónimo) | Rechazo temprano en consulta y cuerpo | `qa-regresion.test.ts` | Corregido |
| QA-03 | Media | Contraseñas comunes en español o derivadas del nombre aceptadas | Diccionario es-ES, palabras institucionales y regla de dominio contra contraseñas basadas en datos propios o de la entidad | unitaria + integración | Corregido* |
| QA-04 | Baja | Error de contraseña asociado al campo equivocado | Campo `nueva` | integración | Corregido |
| QA-05 | Baja | Nombres de archivo con ñ/tildes corruptos | Multipart en UTF-8 | integración | Corregido |
| QA-06 | Baja | Escape no cerraba el submenú | Escape cierra, devuelve el foco y actualiza `aria-expanded`; oculta el submenú aunque el foco siga en el botón (QA-06b) | E2E | Corregido* |
| QA-07 | Baja | Interbloqueo (503) al desactivarse mutuamente dos administradores | Operaciones sobre cuentas serializadas con bloqueo consultivo | integración | Corregido |
| QA-08 | Baja | Slug automático: 409 en creaciones paralelas | Reintento con el siguiente sufijo | integración | Corregido |
| QA-09 | Mejora | Se aceptaba la misma contraseña | Rechazo | integración | Corregido |
| QA-10 | Baja | 413 con código `BAD_REQUEST` | `PAYLOAD_TOO_LARGE` | integración | Corregido |
| QA-11 | Baja | Ruta inexistente del panel mostraba el Resumen | «Sin acceso / no existe» | E2E | Corregido |
| QA-12 | Mejora | Slider para una página inexistente | 422 | unitaria + integración | Corregido |
| QA-13 | Baja | Imagen de una noticia programada visible antes de su fecha | Se publica solo cuando la noticia es visible | integración | Corregido |
| QA-14 | Baja | Documentación desalineada | Corregida | — | Corregido |
| QA-15 | Mejora | `security.txt` sin `Expires` | Agregado | integración | Corregido |
| QA-16 | Mejora | Saltar al contenido no movía el foco | `tabindex="-1"` en `<main>` | E2E | Corregido |
| QA-17 | Mejora | Consulta de PQRSD estricta con mayúsculas y espacios | Normalización | integración | Corregido |
| QA-18 | Baja | `/admin/paginas/xyz` (y variantes: 0, negativos, inexistentes) mostraba un mensaje técnico | «No existe» para todo identificador inválido o inexistente | E2E | Corregido (3.ª ronda) |
| QA-19 | Baja | El submenú no se cerraba al salir con Tab (2.ª ronda) | Cierre al perder el foco | E2E | Corregido (3.ª ronda) |

\* QA-03 y QA-06 necesitaron rondas adicionales: palabras institucionales, QA-06b y QA-06c (ver §5.3).

### 5.2 Encontrados durante el desarrollo de esta fase

| ID | Sev. | Hallazgo | Estado |
|---|---|---|---|
| F4-01 | Alta | TypeORM registraba los parámetros de las consultas fallidas | Corregido (`SafeQueryLogger`), con prueba |
| F4-02 | Media | El administrador migrado no podía recibir el permiso nuevo `system.read` | Corregido en la herramienta de migración, con prueba |
| F4-03 | Media | ID de sesión guardado en claro | Corregido (HMAC), con prueba |
| F4-04 | Media | Límites de intentos por proceso | Corregido (PostgreSQL), con prueba |
| R-01 | Baja | Regresión propia: el filtro de NUL hacía que `/media/x%00.js` respondiera 422 en vez de 404 | Corregido sin cambiar la prueba que lo detectó |

Los fallos que aparecieron al escribir las pruebas E2E fueron de la propia prueba (selectores, una expresión regular
y un agente HTTP atado a un servidor cerrado); la aplicación se comportaba correctamente, como muestran las capturas.

### 5.3 Segunda y tercera re-verificación

- **Segunda ronda:** QA-06b quedó corregido. QA-18 y la regla de palabras institucionales quedaron parciales. Aparecieron dos defectos nuevos de severidad baja:
  - QA-06c: el submenú se veía abierto con el foco en el botón aunque `aria-expanded` era `false`.
  - QA-19: el submenú no se cerraba al salir con Tab.
- **Correcciones:**
  - El submenú depende solo de su estado explícito: se quitó la regla CSS `:focus-within` y se cierra al salir con Tab o con Escape.
  - Todo identificador inválido o inexistente del panel muestra «No existe».
  - Para aceptar una contraseña deben quedar al menos 8 letras propias al quitar los datos del usuario, las palabras de la entidad y los dígitos.
  - En esta ronda se detectó además que la verificación E2E de QA-06b no comprobaba nada (su localizador no encontraba el submenú). Se corrigió, y ahora la prueba exige encontrar exactamente un submenú.
- **Tercera ronda:** QA-06c, QA-19, las variantes de QA-18 y la regla de contraseñas quedaron **corregidos**, sin regresiones ni defectos nuevos y sin errores en el registro del servidor.

**Estado final:** los 20 defectos reportados (QA-01 a QA-19, más QA-06b y QA-06c) están corregidos y re-verificados por el agente independiente.

**Observación O-5 (abierta, no es un defecto):** la frase «tolima ibague colegios publicos» se acepta: mezcla dos palabras de la entidad con dos comunes y tiene más de 8 letras propias. Se mantiene así a propósito. Las frases largas son la recomendación de NIST SP 800-63B, y las demás defensas siguen activas: Argon2id, MFA obligatorio, bloqueo tras 5 intentos y límites por IP. Si la entidad quiere una regla más estricta, puede subir el mínimo de letras propias en `src/domain/password-policy.ts`.

### Correcciones de seguridad recibidas desde `main`

`main` recibió, sobre la versión 3 en JavaScript, correcciones de seguridad (commit `140b6b5`) que la versión 4 no
tenía. Al fusionar se detectaron y se trasladaron a TypeScript, con pruebas de regresión contra PostgreSQL
(`test/integration/seguridad-regresiones.test.ts`, 8 pruebas, y 3 pruebas unitarias del escáner):

- **Escalada en la gestión de usuarios (alta):** un rol con `users.update` podía cambiar el correo, restablecer
  el MFA o reenviar la invitación de un administrador o de un usuario con más permisos, y así tomar su cuenta.
- **Enrolamiento MFA concurrente (alta):** una segunda sesión de primer ingreso podía sobrescribir el segundo
  factor que la otra acababa de configurar.
- **Enlaces de recuperación vigentes (media):** cambiar la contraseña, el correo o el rol no invalidaba los
  enlaces de recuperación enviados antes.
- **Antimalware opcional en producción (media):** sin escáner configurado, las cargas se aceptaban sin analizar.
  Ahora responden 503.

Cobertura medida con c8 (versión 4): 94,13 % de líneas, 89,70 % de funciones y 85,39 % de ramas.

## 6. Limitaciones y lo que no se ejecutó (no cuenta como aprobado)

| Elemento | Motivo | Cómo cubrirlo |
|---|---|---|
| E2E en Firefox y WebKit en este entorno | Solo Chromium está instalado aquí | **Ejecutadas y aprobadas en la CI** (ejecución 12) |
| Error 500 provocado en el navegador | No se puede provocar de forma segura sin alterar el código | Filtro de errores cubierto por pruebas unitarias; contratos validados en cada respuesta |
| Expiración real a los 30 min y 8 h, desbloqueo a los 15 min | Esperas largas; se simularon manipulando la sesión y el bloqueo en la BD | Prueba manual en preproducción |
| SMTP real y antimalware (ClamAV) | No configurados en el entorno de pruebas | Lista de verificación de `DESPLIEGUE.md` §10 (EICAR) |
| Cookie `__Host-`/`Secure` y HSTS | Solo se activan con `NODE_ENV=production` y HTTPS | Verificación en preproducción |
| Mapa de Google (Contacto) | En la E2E se sustituye por una página local (no se prueba el servicio de Google) | Preproducción |
| DAST (OWASP ZAP) y pentest externo | No ejecutados | Pendiente P-11 de `SEGURIDAD-AUDITORIA.md` |
| Respaldo y restauración de PostgreSQL en la infraestructura real | No disponible aquí (sí se probaron respaldo, restauración y migración de SQLite) | `DESPLIEGUE.md` §9 |
| Carga representativa de producción | Ver supuestos en §4 | Repetir en preproducción |

## 7. Conclusión

- Los flujos críticos pasan sin fallos en todas las suites ejecutadas: ingreso con MFA, permisos (también al llamar
  la API directamente), publicación, archivos, migración de datos y concurrencia.
- No quedan defectos críticos ni altos conocidos. Los defectos medios y bajos encontrados se corrigieron y se re-verificaron.
- Quedan las limitaciones de la §6 y los pendientes de `docs/SEGURIDAD-AUDITORIA.md` §6.
- Esto no garantiza que no existan otros defectos: el alcance es el descrito en este informe.
