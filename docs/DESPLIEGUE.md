# Instalación, configuración, despliegue seguro y operación

## 1. Entornos

| Entorno | `NODE_ENV` | Base de datos | Notas |
|---|---|---|---|
| Desarrollo | `development` | PostgreSQL local (`semibague_dev`) | `AUTO_MIGRATE=true` permitido; correos en `storage/correo-desarrollo/` |
| Pruebas | `test` | PostgreSQL de **pruebas**: una base temporal por archivo de prueba, eliminada al terminar | `TEST_PG_ADMIN_URL`; nunca datos reales |
| Preproducción | `production` | Copia **anonimizada** | Ensayo de migración, DAST, pruebas de carga y de restauración |
| Producción | `production` | Real | Migraciones explícitas, TLS, Swagger sin "Try it out" |

No use datos personales reales fuera de producción; anonimice `pqrsd` y `usuarios` antes de copiar.

## 2. Requisitos

- Linux, **Node.js 24 LTS** (o 26 LTS), **PostgreSQL 16** (15–18), proxy inverso con TLS (Nginx/Apache), ClamAV
  (obligatorio para cargar archivos en producción), SMTP institucional. Usuario de sistema sin privilegios (`semibague`), sin shell.
- Carpeta de archivos fuera del código (p. ej. `/var/lib/semibague/{media,uploads}`) propiedad de `semibague`, `0750`.

## 3. Instalación y comandos

```bash
npm ci                         # instala exactamente lo del package-lock.json
npm run build                  # compila TypeScript a dist/
npm run generate-keys          # SESSION_SECRET, DATA_ENCRYPTION_KEY y contraseñas de BD (al gestor de secretos)
npm run migrate                # aplica migraciones con la cuenta de MIGRACIONES
npm run seed                   # instituciones de referencia (solo instalación nueva)
npm run create-admin           # primer administrador (no hay usuarios por defecto)
npm start                      # node dist/src/main.js
```

| Comando | Uso |
|---|---|
| `npm run dev` | compila y arranca en desarrollo |
| `npm run migrate:status` / `migrate:revert` | ver migraciones / revertir la última (solo con respaldo previo) |
| `npm run migrate:check` | falla si las entidades y el esquema difieren (sin crear archivos) |
| `npm run lint`, `format:check`, `typecheck` | calidad estática |
| `npm run test:unit` / `test:integration` / `test` | pruebas (integración contra PostgreSQL real) |
| `npm run test:e2e` / `test:load` | navegador (Playwright) / carga (autocannon), en entorno de pruebas |
| `npm run openapi:export` / `openapi:check` | regenerar / verificar `docs/openapi*.json` |
| `npm run verify` | todo lo anterior salvo E2E y carga, más `npm audit` |
| `npm run test:coverage` / `quality` | pruebas con cobertura (c8) / verificación completa con cobertura |
| `npm run backup:sqlite`, `migrate:from-sqlite` | migración desde la versión 3 (ver `docs/migracion/`) |

### Antimalware (obligatorio en producción)

Configure `MALWARE_SCAN_COMMAND` con la ruta absoluta de `clamdscan` y mantenga sus firmas actualizadas.
Con `NODE_ENV=production`, si el comando está vacío o falla (incluido un tiempo agotado), las cargas se rechazan
con `503 MALWARE_SCAN_UNAVAILABLE` y no se guarda nada. El portal y el acceso al panel siguen disponibles. Un archivo
detectado como infectado se rechaza con `422`. Desarrollo y pruebas permiten trabajar sin el escáner instalado.
Antes de publicar, compruebe el escaneo con ClamAV real y una muestra EICAR en preproducción.

## 4. PostgreSQL seguro

1. **Roles de mínimo privilegio** (una vez, como DBA):
   ```bash
   psql -v app_password='…' -v migrator_password='…' -v db_name=semibague -f scripts/postgres/01-crear-roles-y-base.sql
   ```
   - `semibague_owner` (sin inicio de sesión): dueño del esquema `portal`.
   - `semibague_migrator`: solo para migraciones; actúa como el dueño (DDL).
   - `semibague_app`: la aplicación; solo `SELECT/INSERT/UPDATE/DELETE`, sin superusuario, sin crear objetos, y
     **sin UPDATE/DELETE/TRUNCATE** sobre `auditoria_eventos` (además hay triggers que lo impiden).
2. **Red:** el puerto 5432 nunca se publica en Internet. `listen_addresses` solo en la interfaz privada y
   `pg_hba.conf` con `hostssl … scram-sha-256` únicamente desde el servidor de la aplicación
   (ejemplo en `scripts/postgres/pg_hba.ejemplo.conf`). Firewall: solo app → BD:5432.
3. **TLS con validación de certificado:** `ssl = on` en PostgreSQL y en la aplicación `DB_SSL=verify-full` y
   `DB_SSL_CA_FILE=/etc/semibague/pg-ca.pem`. El arranque en producción **falla** si la BD es remota y `DB_SSL` no es
   `verify-full`.
4. **Credenciales separadas:** `DB_USER/DB_PASSWORD` (app) y `DB_MIGRATION_USER/DB_MIGRATION_PASSWORD` (migraciones,
   solo en el paso de despliegue; no las deje en el entorno del servicio).
5. **Límites:** `DB_POOL_MAX` por instancia (por defecto 10). Con N instancias: N × `DB_POOL_MAX` + migraciones +
   monitoreo < `max_connections` (y el `CONNECTION LIMIT` del rol app, 200 por defecto). Tiempos:
   `DB_STATEMENT_TIMEOUT_MS=10000`, `DB_LOCK_TIMEOUT_MS=5000`, `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=15000`,
   `DB_CONNECTION_TIMEOUT_MS=5000`. Si se agotan, la API responde `503 SERVICE_BUSY` con `Retry-After` (sin detalles).

## 5. Migraciones

- `synchronize` está desactivado siempre; el esquema solo cambia con archivos de `src/infrastructure/database/migrations/`.
- En producción (`AUTO_MIGRATE=false`) el servidor **no arranca** si hay migraciones pendientes.
- Haga un respaldo **antes** de cada migración. Cada migración corre en su propia transacción (`transaction: each`).
- Nueva migración: cambiar las entidades → `npx typeorm migration:generate -d dist/src/infrastructure/database/migration-cli.js src/infrastructure/database/migrations/<Nombre>` → revisar el SQL → `npm run migrate:check` debe quedar sin diferencias.

## 6. Servicio (systemd)

```ini
[Unit]
Description=Portal SEM Ibagué
After=network-online.target

[Service]
User=semibague
Group=semibague
WorkingDirectory=/opt/semibague
EnvironmentFile=/etc/semibague/semibague.env
ExecStart=/usr/bin/node --enable-source-maps dist/src/main.js
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/semibague
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

Varias instancias: sesiones, límites sensibles, auditoría y caché ya funcionan en múltiples instancias (PostgreSQL y
`LISTEN/NOTIFY`). Comparta `/var/lib/semibague` (NFS o almacenamiento de objetos montado) y defina `INSTANCE_ID` distinto.

## 7. Proxy inverso (Nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name portal.example.gov.co;
  ssl_certificate     /etc/ssl/semibague/fullchain.pem;
  ssl_certificate_key /etc/ssl/semibague/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 25m;
  proxy_read_timeout 30s;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
  }
  location /health/ { allow 10.0.0.0/8; deny all; proxy_pass http://127.0.0.1:3000; }
}
server { listen 80; server_name portal.example.gov.co; return 301 https://$host$request_uri; }
```

`TRUST_PROXY=1` (número exacto de proxies). La aplicación escucha en `127.0.0.1` en producción.

## 8. Salud, registros y monitoreo

| Recurso | Uso | Información expuesta |
|---|---|---|
| `GET /health/live` | el proceso responde | `{"estado":"ok"}` |
| `GET /health/ready` | además BD disponible y sin migraciones pendientes (503 si no) | solo `estado` |
| `GET /api/v1/sistema/metricas` (permiso `system.read`, administradores) | latencia p50/p95/p99 y errores 5xx por ruta (últimos 5 min), pool de PostgreSQL (conexiones, libres, en espera), conexiones del servidor, memoria, CPU, retraso del event loop, caché y cola de estadísticas | sin datos personales |

Registros (stdout → journald): errores 5xx con ID de solicitud, solicitudes lentas (≥ 1 s), consultas lentas
(≥ `DB_SLOW_QUERY_MS`) y fallidas **sin parámetros**. Nunca se registran cuerpos, cabeceras, contraseñas, tokens ni IP.
`LOG_REQUESTS=true` registra todas las solicitudes (método, patrón de ruta, estado, duración). Alertas sugeridas:
`/health/ready` ≠ 200, 5xx > 1 %, `enEspera` del pool > 0 sostenido, p95 > 1 s, disco de `/var/lib/semibague` > 80 %.

## 9. Copias de seguridad y restauración

Diario, cifrado, fuera del servidor, retención sugerida: 7 diarias, 4 semanales, 12 mensuales.

```bash
pg_dump -Fc -h db.interna -U semibague_migrator -d semibague -f semibague-$(date +%F).dump   # BD
tar -C /var/lib/semibague -czf archivos-$(date +%F).tgz media uploads                       # archivos
```

Opcional: archivado continuo de WAL (PITR) con la herramienta institucional. Guarde `DATA_ENCRYPTION_KEY` **aparte**.

**Prueba de restauración (trimestral, en preproducción):**
`createdb … && pg_restore -d semibague_restore semibague-AAAA-MM-DD.dump`, restaurar archivos, misma
`DATA_ENCRYPTION_KEY`, `npm run migrate`, iniciar, ingresar con MFA, abrir una PQRSD y una imagen y ejecutar
**Auditoría → Verificar integridad**. Registrar fecha y resultado. La suite de integración prueba en cada ejecución el
ciclo respaldo → restauración de SQLite y la migración (ver `docs/QA-INFORME.md`).

## 10. Lista de verificación antes de publicar

- [ ] `npm run verify` sin errores; E2E y carga ejecutadas en preproducción.
- [ ] `NODE_ENV=production`, `APP_URL` https, `TRUST_PROXY` correcto, `AUTO_MIGRATE=false`.
- [ ] PostgreSQL: roles de mínimo privilegio, `pg_hba` restringido, puerto no público, `DB_SSL=verify-full`.
- [ ] Credenciales de migración fuera del entorno del servicio.
- [ ] `API_DOCS_TRY_IT_OUT=false` y `CORS_ORIGINS` vacío salvo integraciones aprobadas.
- [ ] SMTP y antimalware (`MALWARE_SCAN_COMMAND`, probado con EICAR) configurados.
- [ ] TLS válido y redirección HTTP → HTTPS. `/health/*` solo desde la red interna.
- [ ] Primer administrador con MFA; ningún usuario de prueba.
- [ ] DAST (OWASP ZAP) en preproducción sin hallazgos altos.
- [ ] Respaldos automáticos y una restauración probada.

## 11. Actualización de dependencias

Ver `docs/VERSIONES.md`: revisión mensual (`npm outdated`, `npm audit`), una mayor a la vez, `npm run verify` +
E2E + carga en preproducción, versiones exactas y lockfile versionado.
