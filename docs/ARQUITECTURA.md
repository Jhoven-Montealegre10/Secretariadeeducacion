# Arquitectura

## Visión general

Monolito modular en **TypeScript + NestJS 12** sobre **Node.js 24 LTS**, con **PostgreSQL 16** como única base de datos
(TypeORM para conexión y migraciones versionadas), renderizado en el servidor (EJS, diseño GOV.CO sin cambios) para el
sitio público, **API REST versionada** (`/api/v1`, OpenAPI 3.0 + Swagger UI) y un **panel** (SPA sin dependencias) que
consume esa API. Los archivos (imágenes, audio, PDF) se guardan en disco fuera de la carpeta pública; la base solo guarda
sus metadatos. No hay servicios adicionales: la caché, los límites compartidos y las sesiones usan PostgreSQL.

```
 Navegador (sitio)              Navegador (panel /admin)              Integraciones (solo lectura)
      │ HTML                          │ JSON + cookie + X-CSRF-Token          │ JSON /api/v1/public
      ▼                               ▼                                       ▼
┌──────────────────────── PRESENTACIÓN  src/presentation ────────────────────────────────────────┐
│ app.setup.ts: ID de solicitud → métricas → helmet/CSP → estáticos → cuerpos → sesión (PG)       │
│               → actor (revalidado en BD) → analítica → CORS público                             │
│ SecurityGuard (global): denegación por defecto → límites → acceso/permiso → CSRF                 │
│ ApiInterceptor: archivos → validación Zod → controlador → sobre {data,meta} → contrato de salida │
│ ErrorFilter: códigos y mensajes sin detalles internos; 403 auditados; 503 si la BD está ocupada  │
│ http/api/controllers (REST)   web/*.controller.ts (sitio, PQRSD, panel)   observability/*       │
└───────────────────────────────────────┬────────────────────────────────────────────────────────┘
                                        ▼  los mismos servicios para sitio, panel y API
┌──────────────────────── APLICACIÓN  src/application ───────────────────────────────────────────┐
│ AuthService · UserService · RoleService · MediaService · PageService · NewsService ·            │
│ SliderService · StatsService · DocumentService · PqrsdService · SearchService · AuditService     │
│ authorize(): permiso por operación y por recurso · transacciones cortas · bloqueo optimista      │
└───────────────────────────────────────┬────────────────────────────────────────────────────────┘
                 ▼                                                     ▼
┌──── DOMINIO  src/domain ─────────────┐          ┌──── INFRAESTRUCTURA  src/infrastructure ───────────────┐
│ permisos, errores, publicación,      │◄─────────│ database: Db (transacciones + AsyncLocalStorage),       │
│ slugs, enlaces seguros, bloques,     │          │   entidades, migraciones, data-source, logger seguro   │
│ política de contraseñas (sin I/O)    │          │ repositories: SQL explícito y parametrizado ($1…)       │
└──────────────────────────────────────┘          │ cache (LISTEN/NOTIFY) · session (PG) · security · storage│
                                                  │ mail                                                    │
                                                  └─────────────────────────────────────────────────────────┘
```

## Módulos NestJS (`src/app.module.ts`)

| Módulo | Contenido |
|---|---|
| `ConfigModule` (global) | Configuración tipada (`loadConfig`), validada; el arranque falla en producción si falta algo |
| `TypeOrmModule` + `DatabaseModule` (global) | Pool de PostgreSQL, `Db`, `PublicCache`, reloj inyectable |
| `SecurityModule`, `StorageModule`, `MailModule` (globales) | Cifrado, hash, TOTP, sanitizador; disco, imágenes, antimalware; correo |
| `PersistenceModule` (global) | Los 12 repositorios y la auditoría |
| `IdentityModule` | Autenticación, usuarios, roles, estadísticas |
| `ContentModule` | Multimedia, páginas, noticias, sliders |
| `CitizenModule` | Normatividad, PQRSD, instituciones, buscador |
| `HttpModule` | Controladores (el orden define la precedencia de rutas), guard, interceptor, filtro, métricas |

## MVC

| MVC | Sitio público | Panel (SPA) | API REST |
|---|---|---|---|
| **Modelo** | Dominio + servicios + repositorios | Los mismos, vía API | Los mismos |
| **Vista** | EJS (`views/`), sin lógica de negocio | `public/assets/admin/views/*` | DTO estrictos (`http/api/schemas`) |
| **Controlador** | `presentation/web/*.controller.ts` | — (usa la API) | `presentation/http/api/controllers/*` |

Los controladores son delgados: leen la entrada validada, llaman a un servicio y presentan el resultado.

## Una sola declaración por ruta

`@Endpoint('put', '/api/v1/paginas/{id}', { auth: 'pages.update', request: {…}, response: {…} })` registra la ruta en
Nest, su permiso, su límite, CSRF, la validación Zod de entrada, el contrato de salida y la documentación OpenAPI.
Una ruta sin `@Endpoint`/`@WebRoute` es rechazada por el guard (denegación por defecto) y las pruebas comprueban que
cada ruta implementada está documentada y viceversa.

## Persistencia y concurrencia

- **SQL explícito y parametrizado** en repositorios (`$1…`), con listas blancas para ordenar/agrupar. TypeORM aporta el
  pool, las entidades (fuente del esquema) y las migraciones. `synchronize` está desactivado siempre.
- **Transacciones cortas** (`Db.transaction`, reentrante con AsyncLocalStorage). La E/S externa (correo, imágenes,
  archivos) ocurre fuera; los efectos externos se difieren con `afterCommit` (borrar archivos, invalidar caché).
- **Bloqueo optimista:** columnas `version` en usuarios, roles, medios, noticias, páginas y sliders. El cliente envía la
  versión que editó; si otro guardó antes → `409 EDIT_CONFLICT`. Las filas se bloquean con `SELECT … FOR UPDATE` solo
  durante la transacción de guardado. Reglas como "siempre un administrador activo" bloquean las filas que comprueban.
- **Índices** derivados de las consultas reales (listados por estado/fecha, trigramas para ILIKE, claves foráneas).
- **Sin N+1:** relaciones con JOIN, subconsultas agregadas (`array_agg`) y `= ANY($1)`; inserciones en lote con `unnest`.
- **Límites:** pool por instancia (`DB_POOL_MAX`), `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`,
  paginación máxima 100, cuerpos JSON por ruta (100 KB–1 MB), cargas de hasta 25 MB por solicitud.

## Caché pública

En memoria por instancia, solo de contenido publicado (páginas, noticias, sliders, normatividad, instituciones), TTL
corto y tamaño máximo. Cada cambio invalida tras el COMMIT y notifica a las demás instancias por `LISTEN/NOTIFY`.
Las respuestas privadas llevan `Cache-Control: no-store` y nunca se guardan.

## Procesos en segundo plano

Estadísticas por lotes (búfer en memoria, inserción con `unnest`, purga diaria con bloqueo consultivo), limpieza de
sesiones vencidas y de contadores de límites. No requieren un proceso aparte.

## Estructura de carpetas

```
src/
  main.ts                    Arranque (verifica migraciones; escucha en 127.0.0.1 en producción)
  app.module.ts              Módulos e inyección de dependencias
  config/                    configuration.ts (variables de entorno), site.ts (datos institucionales)
  domain/                    Reglas puras
  application/               Casos de uso (servicios)
  infrastructure/
    database/                data-source, db.service, sql, entities/, migrations/, safe-logger
    repositories/            identity · content · citizen
    cache/ session/ security/ storage/ mail/
  presentation/
    http/                    app.setup, route-spec, api/ (controllers, schemas, openapi), security/, errors/, observability/
    web/                     Controladores HTML y helpers de vistas
views/                       Plantillas EJS (sin cambios de diseño)
public/                      CSS, JS del sitio y SPA del panel
scripts/                     create-admin, seed, generate-keys, export-openapi, postgres/, migracion/
test/                        unit/, integration/ (PostgreSQL real), e2e/ (Playwright), load/ (autocannon), support/, fixtures/
docs/                        Arquitectura, ADR, versiones, API, permisos, despliegue, migración, QA, seguridad
```

Decisiones detalladas en [`docs/adr/`](adr/).
