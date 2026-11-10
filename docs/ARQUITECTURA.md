# Arquitectura

## Visión general

El portal es una aplicación **Node.js 22 + Express 5** con renderizado en el servidor (EJS) para el sitio público,
una **API REST versionada** (`/api/v1`) y un **panel de administración** (SPA en JavaScript sin dependencias) que
consume esa API. Base de datos **SQLite** con migraciones versionadas; archivos en disco fuera de la carpeta pública.

Se conservó el stack existente (decisión justificada en `docs/01-DIAGNOSTICO-INICIAL.md`): funciona, está probado y
no había una necesidad técnica de reemplazarlo. Se reorganizó en capas y se amplió.

```
 Navegador (sitio público)          Navegador (panel /admin)            Integraciones futuras
        │ HTML (EJS)                         │ fetch JSON + cookie + CSRF          │ JSON (solo /api/v1/public)
        ▼                                    ▼                                     ▼
 ┌─────────────────────────────────── PRESENTACIÓN (src/presentation) ───────────────────────────────────┐
 │  web/controllers (sitio, PQRSD, shell del panel)      api/v1/controllers (REST + OpenAPI generado)     │
 │  views (EJS)       middleware: seguridad, sesión, CSRF, límites, errores, analítica                    │
 └───────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                                 ▼   mismos servicios para sitio, panel y API
 ┌─────────────────────────────────── APLICACIÓN (src/application) ─────────────────────────────────────┐
 │  authService · userService · roleService · mediaService · pageService · newsService · sliderService   │
 │  statsService · documentService · pqrsdService · searchService · auditService · authorization          │
 └───────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
                                                 ▼
 ┌──────────────── DOMINIO (src/domain) ────────────────┐    ┌──── INFRAESTRUCTURA (src/infrastructure) ────┐
 │ permisos, errores, reglas de contenido (bloques,     │◄───│ repositorios SQL, migraciones, Argon2id,      │
 │ slugs, enlaces seguros), política de contraseñas     │    │ TOTP, AES-GCM/HMAC, sanitizador, archivos,     │
 └──────────────────────────────────────────────────────┘    │ sharp, antimalware, correo, sesiones          │
                                                             └───────────────────────────────────────────────┘
```

`src/container.js` es la **raíz de composición**: crea los repositorios y la infraestructura y los inyecta en los
servicios (inversión de dependencias). Es el único módulo que conoce las implementaciones concretas.

## Cómo se aplica MVC

| MVC | Sitio público | Panel (SPA) | API REST |
|---|---|---|---|
| **Modelo** | Dominio + servicios + repositorios | Los mismos, vía API | Los mismos |
| **Vista** | Plantillas EJS (`src/presentation/views`) | Vistas JS (`public/assets/admin/views`) que construyen el DOM con `textContent` | JSON definido por DTO estrictos (`api/v1/schemas`) |
| **Controlador** | `web/controllers/*` | `api/v1/controllers/*` (el panel no tiene controladores propios) | `api/v1/controllers/*` |

Frontend y backend están separados en el panel: el servidor solo entrega la estructura (`admin/app.ejs`) y todas las
operaciones se hacen contra la API. El sitio público usa renderizado en el servidor y **comparte los mismos servicios**,
por lo que un borrador o un archivo privado nunca llegan al público por ninguna de las dos vías.

## Estructura de carpetas

```
app.js                      Arranque: migraciones + contenedor + app HTTP
server.js                   Servidor HTTP con tiempos máximos (slowloris)
src/
  config/                   Configuración y secretos (solo variables de entorno)
  container.js              Inyección de dependencias
  domain/                   Reglas sin dependencias de infraestructura
    permissions.js          Catálogo de permisos (módulo.acción) y roles iniciales
    content.js              Estados, slugs reservados, enlaces seguros, esquema de bloques
    passwordPolicy.js       Política de contraseñas (evaluador inyectado)
    errors.js               Errores del dominio → códigos HTTP
  application/              Casos de uso: validan reglas, autorizan sobre cada recurso, auditan
  infrastructure/
    database/               Conexión, transacciones reentrantes, migrador y migrations/NNN_*.sql|js
    repositories/           Acceso a datos con SQL parametrizado; mapean snake_case → camelCase
    security/               Argon2id, TOTP, AES-256-GCM/HMAC, fortaleza de contraseñas, sanitizador HTML
    storage/                Disco con nombres aleatorios, detección de tipo real, sharp, antimalware
    mail/, session/         Correo (SMTP) y almacén de sesiones
  presentation/
    http/app.js             Cadena de middleware
    http/middleware/        Cabeceras/CSP, sesión, CSRF, límites, cargas, CORS, analítica, errores
    http/api/               defineRoute (ruta + OpenAPI en una sola declaración), openapi.js, Swagger
    http/api/v1/            controllers/ y schemas/ (DTO de entrada y salida)
    http/web/               Rutas y controladores HTML
    views/                  Plantillas EJS (bloques, slider, páginas, errores, shell del panel)
public/assets/              CSS, JS del sitio (sin scripts en línea) y SPA del panel (admin/)
scripts/                    migrate, create-admin, seed, generate-keys, export-openapi
tests/                      Pruebas de seguridad y de flujos críticos (node:test + supertest)
docs/                       Diagnóstico, arquitectura, permisos, API, estadísticas, auditoría, despliegue, OpenAPI
```

## Flujo de una petición de la API

`límite de peticiones → autenticación/permiso de la ruta → CSRF → cuerpo (tamaño limitado) → validación Zod →
controlador → servicio (autoriza el recurso, aplica reglas, transacción, auditoría) → repositorio (SQL parametrizado)
→ presentador (DTO) → validación estricta de la salida (fuera de producción) → JSON`

## Sincronía entre código y documentación

Cada endpoint se declara una sola vez con `route({...}, handler)` (`src/presentation/http/api/defineRoute.js`). Esa
declaración registra la ruta en Express **y** su operación OpenAPI con los mismos esquemas Zod. Además:

- fuera de producción, cada respuesta se valida contra su esquema estricto: un campo no documentado hace fallar las pruebas;
- `tests/platform.test.js` compara rutas implementadas con rutas documentadas;
- `npm run openapi:check` falla si `docs/openapi.json` no coincide con el código.

## Convenciones

- **camelCase** en variables, funciones y propiedades; **PascalCase** en clases (`AppError`, `SqliteSessionStore`).
  La base de datos usa snake_case (convención SQL); los repositorios convierten a camelCase en un único punto (`toCamel`).
- Vocabulario del **dominio en español** (`titulo`, `fechaPublicacion`, `crear`), términos técnicos en inglés
  (`middleware`, `repository`, `route`), igual que la API pública.
- Los controladores son pequeños: validan forma, delegan en un servicio y presentan el resultado.
- Las vistas no consultan la base de datos: reciben datos ya preparados por el controlador.
- Errores centralizados en `errorHandler.js`; los servicios lanzan errores del dominio.
- Cambios de esquema solo mediante **migraciones nuevas** (las aplicadas no se editan; el migrador verifica su suma).
- Herramientas: ESLint (+ `eslint-plugin-security`), Prettier, TypeScript en modo `checkJs`. `npm run verify` las ejecuta todas.

## Editor de páginas por bloques

Una página es una lista de bloques validada por `src/domain/content.js`: sección (título, fondo, ancla), texto
enriquecido, aviso, imagen, galería, audio, tarjetas, acordeón, tabla, botón y dos bloques automáticos (directorio de
instituciones y datos de contacto con mapa). Las cinco páginas institucionales existentes se migraron a bloques
(`migrations/007_paginas.js`) conservando contenido, diseño y anclas. El HTML de los bloques se sanitiza al guardar y al leer.

## Caché y publicación

No hay caché del lado del servidor: el sitio se genera en cada petición desde la base de datos, por lo que publicar o
editar se refleja de inmediato. Las respuestas privadas llevan `Cache-Control: no-store`. Si en el futuro se agrega un
CDN o proxy con caché, se debe purgar la ruta afectada al publicar (ver `docs/DESPLIEGUE.md`).
