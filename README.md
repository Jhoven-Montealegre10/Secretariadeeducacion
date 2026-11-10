# Portal web – Secretaría de Educación Municipal de Ibagué

Portal institucional con identidad **GOV.CO**, **panel de administración propio**, **API REST versionada con
OpenAPI/Swagger**, arquitectura por capas (MVC) y controles de seguridad verificados con pruebas.

**Versión 4:** TypeScript + **NestJS 12** sobre **Node.js 24 LTS**, **PostgreSQL 16** con **TypeORM** (migraciones
versionadas). Diseño, contenidos y funciones de la versión anterior se conservan; los datos de SQLite se migran con una
herramienta verificada (`docs/migracion/`).

## Qué incluye

| Módulo | Funciones |
|---|---|
| **Sitio público** | Inicio con noticias y slider, páginas institucionales editables, noticias, normatividad, PQRSD, buscador, transparencia. Responsive y accesible. |
| **Acceso al panel** | Argon2id, **MFA TOTP obligatorio**, códigos de recuperación, recuperación por correo de un solo uso, sesiones en PostgreSQL revocables. |
| **Usuarios y roles** | Invitación, edición, desactivación, eliminación, restablecimiento de MFA; permisos por módulo y acción. |
| **Multimedia** | Imágenes y audios (validación por contenido, re-codificación, antimalware), búsqueda, reemplazo, aviso de uso. |
| **Páginas / Noticias / Sliders** | Editor por bloques, borradores y vista previa protegida, publicación automática en el inicio, sliders por ubicación. |
| **Ediciones simultáneas** | Bloqueo optimista: si otra persona guardó antes, `409 EDIT_CONFLICT` y aviso en el panel. |
| **Estadísticas** | Visitas sin cookies ni IP, por lotes en segundo plano. |
| **Auditoría** | Bitácora de solo inserción (triggers + permisos de PostgreSQL) con cadena HMAC verificable. |
| **API REST** | `/api/v1` pública y privada, 70 operaciones; Swagger en `/api/docs` (pública) y `/admin/api-docs` (completa). |
| **Operación** | `/health/live`, `/health/ready`, métricas en `/api/v1/sistema/metricas`, caché pública con invalidación. |

## Inicio rápido (desarrollo)

Requisitos: **Node.js 24 LTS** (o 26) y **PostgreSQL 16**.

```bash
npm ci
npm run generate-keys                       # secretos → .env (ver .env.example)
psql -v app_password=… -v migrator_password=… -v db_name=semibague_dev \
     -f scripts/postgres/01-crear-roles-y-base.sql   # roles de mínimo privilegio (como DBA)
npm run migrate                             # esquema (cuenta de migraciones)
npm run seed                                # instituciones de referencia
npm run build && npm run create-admin       # primer administrador
npm run dev                                 # http://localhost:3000 — panel en /admin
```

## Calidad y verificación

```bash
npm run verify            # lint + formato + tipos + build + pruebas + contrato OpenAPI + npm audit
npm run test:unit         # 55 pruebas de dominio, infraestructura y servicios (sin BD)
npm run test:integration  # 104 pruebas contra PostgreSQL real (requiere TEST_PG_ADMIN_URL de un servidor de PRUEBAS)
npm run test:e2e          # navegador real (Playwright): panel, sitio, permisos, escritorio/tableta/móvil
npm run test:load         # carga con autocannon en entorno autorizado
```

Resultados de la última verificación: [`docs/QA-INFORME.md`](docs/QA-INFORME.md).

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y [`docs/adr/`](docs/adr/) | Capas, módulos NestJS, persistencia, concurrencia, decisiones |
| [`docs/VERSIONES.md`](docs/VERSIONES.md) | Versiones, compatibilidad y política de actualización |
| [`docs/API.md`](docs/API.md), [`docs/openapi.json`](docs/openapi.json) | Uso de la API, errores, versionado, conflictos de edición |
| [`docs/PERMISOS.md`](docs/PERMISOS.md) | Matriz de permisos |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Instalación, PostgreSQL seguro, servicio, proxy, salud, monitoreo, respaldos, restauración |
| [`docs/migracion/`](docs/migracion/) | Inventario de SQLite, runbook de corte y reversión |
| [`docs/ESTADISTICAS.md`](docs/ESTADISTICAS.md) | Métricas, privacidad y limitaciones |
| [`docs/SEGURIDAD-AUDITORIA.md`](docs/SEGURIDAD-AUDITORIA.md) | Auditoría de seguridad y pendientes |
| [`docs/QA-INFORME.md`](docs/QA-INFORME.md) | Informe final de QA (incluye la revisión independiente) |

## Pendientes antes de publicar

Ver `docs/SEGURIDAD-AUDITORIA.md` y la lista de verificación de `docs/DESPLIEGUE.md` §10: SMTP y antimalware, DAST en
preproducción, restauración probada, ensayo de migración con la copia real y carga del contenido oficial.
