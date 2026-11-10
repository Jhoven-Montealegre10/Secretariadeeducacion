# Diagnóstico inicial y revisión de seguridad (antes de los cambios)

Fecha: 2026-11-10 · Revisión sobre `main` en el commit `d9a714c` (PR #2 unido).
Referencias: OWASP ASVS 4.0.3 (nivel 2) y OWASP Top 10 2021.

## 1. Stack encontrado

| Capa | Tecnología |
|---|---|
| Servidor | Node.js 22, Express 5 |
| Vistas | EJS renderizado en el servidor |
| Base de datos | SQLite (`node:sqlite`), esquema creado con `CREATE TABLE IF NOT EXISTS` al arrancar |
| Sesiones | `express-session` con almacén propio en SQLite |
| Seguridad | helmet (CSP estricta), CSRF por token sincronizador, express-rate-limit, scrypt, AES-256-GCM |
| Pruebas | `node:test` + supertest (25 pruebas, todas pasan) |
| Dependencias | 6 de producción; `npm audit`: 0 vulnerabilidades |

## 2. Estructura encontrada

`src/models` (acceso a datos), `src/controllers` (públicos y `admin/`), `src/routes`, `src/middleware`,
`src/services` (cifrado, validación, sesiones) y `src/views`. Es un MVC funcional, pero **sin capa de
servicios de aplicación**: los controladores llaman directamente a los modelos y contienen reglas de negocio
(por ejemplo, la política de contraseñas está en `authController`).

## 3. Funcionalidades: existentes, faltantes y a corregir

| Requisito | Estado | Observación |
|---|---|---|
| Sitio público con diseño GOV.CO | Existe | Se conserva |
| PQRSD con cifrado de datos personales | Existe | Se conserva; se integra con el nuevo sistema de permisos |
| Normatividad (PDF) | Existe | Se conserva; se integra con la API |
| Panel `/admin` (noticias, documentos, PQRSD) | Parcial | Formularios del servidor; no consume una API |
| Login | Parcial | Usa scrypt en vez de Argon2id; sin MFA; sin recuperación |
| Roles | Parcial | Solo `admin`/`editor` fijos en un `CHECK` de la tabla; no hay permisos por módulo/acción |
| Gestión de usuarios y roles | Falta | Solo por script de consola |
| Biblioteca multimedia | Falta | Solo PDF de normatividad |
| Páginas editables | Falta | Las páginas institucionales están escritas en plantillas EJS |
| Noticias con imagen y galería | Parcial | Solo texto plano, sin imágenes ni estado borrador explícito |
| Sliders | Falta | — |
| Estadísticas | Falta | — |
| API REST, OpenAPI, Swagger | Falta | — |
| Migraciones versionadas | Falta | Esquema implícito en `db.js` |
| Linter, formateador, tipos | Falta | — |

## 4. Hallazgos de seguridad iniciales

Gravedad según impacto y probabilidad (Crítica, Alta, Media, Baja, Informativa).
"Confirmado" significa que se reprodujo con una prueba o lectura directa del código.

| ID | Ubicación | Hallazgo | Gravedad | Evidencia | Estado |
|---|---|---|---|---|---|
| D-01 | `src/routes/admin.js` | El rol **editor puede eliminar definitivamente** noticias y documentos (`POST /admin/noticias/:id/eliminar`, `/admin/documentos/:id/eliminar` no exigen rol). Contradice la matriz de permisos solicitada. | Media | Las rutas solo tienen `requireAuth` | Confirmado |
| D-02 | `src/models/Usuario.js` | **Sin segundo factor** para el panel (ASVS V2.8, Top 10 A07). | Alta | No existe código MFA | Confirmado |
| D-03 | `src/services/crypto.js` | Contraseñas con scrypt; el requisito pide **Argon2id**. scrypt es seguro, pero no cumple el estándar del proyecto. | Media | `hashPassword` usa `scryptSync` | Confirmado |
| D-04 | `src/controllers/admin/authController.js` | **No bloquea contraseñas comunes** o comprometidas (ASVS 2.1.7). | Media | Solo verifica longitud y clases de caracteres | Confirmado |
| D-05 | `src/middleware/auth.js` | **Las sesiones no se revocan** al cambiar contraseña, rol o desactivar el usuario (ASVS 3.3.3). La sesión solo guarda `userId`. | Media | Al cambiar contraseña la otra sesión sigue activa | Confirmado |
| D-06 | `app.js` | **Sin duración máxima absoluta** de sesión: `rolling: true` la renueva indefinidamente mientras haya actividad (ASVS 3.3.1/3.3.2). | Baja | Cookie `maxAge` 2 h renovable | Confirmado |
| D-07 | `src/models/db.js` | **Auditoría modificable**: la tabla `auditoria` admite `UPDATE`/`DELETE`, no guarda el resultado ni el recurso, y no registra accesos denegados (ASVS 7.3). | Baja | Esquema sin restricciones | Confirmado |
| D-08 | `src/controllers/admin/authController.js` | **Sin recuperación de acceso** segura: un usuario que olvida la contraseña depende de la consola del servidor. | Media (disponibilidad) | No existe flujo | Confirmado |
| D-09 | `src/middleware/rateLimits.js` | Los límites de peticiones viven en memoria: se reinician al reiniciar y no se comparten entre procesos. | Baja | `express-rate-limit` con `MemoryStore` | Riesgo pendiente (aceptable en 1 instancia) |
| D-10 | `src/models/db.js` | **Sin migraciones versionadas**: no hay forma segura de evolucionar el esquema en producción. | Baja | `CREATE TABLE IF NOT EXISTS` | Confirmado |
| D-11 | `src/views/**` | Mensajes de error construidos con `<%-` (sin escapar). Hoy son textos fijos del servidor, sin datos del usuario. | Informativa | `err()` en las vistas | Sin impacto actual; se elimina en el rediseño |

No se encontraron vulnerabilidades críticas. Las pruebas existentes confirman la ausencia de inyección SQL,
XSS reflejado, CSRF y exposición de archivos del servidor en los flujos actuales.

## 5. Decisión de arquitectura

Se **conserva** el stack (Express + EJS + SQLite) y el diseño institucional, porque funcionan y están probados.
No se reemplaza el proyecto. Se reorganiza el código en capas (presentación, aplicación, dominio,
infraestructura), se agrega la API REST y se reescribe el panel para que consuma esa API.
