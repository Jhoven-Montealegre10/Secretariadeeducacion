# API REST v1

- Generada con `@nestjs/swagger` desde los mismos esquemas Zod que validan cada ruta (decorador `@Endpoint`).
- Especificación OpenAPI 3.0 exportable: `docs/openapi.json` (completa) y `docs/openapi-publica.json` (pública).
- Swagger UI: **`/api/docs`** (solo operaciones públicas, abierta) y **`/admin/api-docs`** (completa, requiere sesión del panel).
- Regenerar después de cambiar endpoints: `npm run openapi:export`. Verificar sincronía: `npm run openapi:check`.

## Público y privado

| Grupo | Prefijo | Acceso |
|---|---|---|
| Público | `/api/v1/public/*` | Sin autenticación. Solo contenido **publicado** y solo campos aptos para visitantes (noticias, páginas, sliders, normatividad, instituciones). Solo `GET`. |
| Autenticación | `/api/v1/auth/*` | Inicio de sesión en dos pasos, recuperación, cierre de sesión. |
| Mi cuenta | `/api/v1/cuenta/*` | Usuario autenticado sobre su propia cuenta. |
| Administración | `/api/v1/{usuarios,roles,permisos,medios,paginas,noticias,sliders,documentos,pqrsd,estadisticas,auditoria,sistema}` | Sesión con segundo factor + permiso por módulo/acción (ver `docs/PERMISOS.md`). |

## Autenticación para el panel

1. `GET /api/v1/auth/csrf` → token CSRF (crea la cookie de sesión `sem.sid`; en producción `__Host-sem.sid`, HttpOnly, Secure, SameSite=Strict).
2. `POST /api/v1/auth/login` `{ email, password }` + cabecera `X-CSRF-Token` → `siguientePaso: "mfa" | "configurar_mfa"`. Aún **no** hay acceso.
3. `POST /api/v1/auth/mfa/verificar` `{ codigo }` (o `{ codigoRecuperacion }`) → sesión completa y nuevo token CSRF.
   Primer ingreso: `POST /auth/mfa/configuracion` (QR) y `POST /auth/mfa/activar` `{ codigo }` (devuelve 10 códigos de recuperación).
4. Todas las peticiones `POST/PUT/PATCH/DELETE` llevan `X-CSRF-Token`.
5. `POST /api/v1/auth/logout` destruye la sesión.

Las sesiones expiran tras **30 min** de inactividad y **8 h** como máximo (configurable), y se revocan al cambiar rol,
permisos, contraseña, segundo factor o al desactivar al usuario.

## Convenciones

- **Respuesta:** `{ "data": ... }` o, en listados, `{ "data": [...], "meta": { page, pageSize, total, totalPages } }`.
- **Error:** `{ "error": { "code", "message", "details"?: [{ campo, mensaje }], "requestId" } }` con códigos 400, 401, 403, 404, 409, 413, 422, 429, 500 y 503 (`SERVICE_BUSY`: base de datos ocupada; reintente según `Retry-After`).
- **Paginación:** `page` (≥ 1), `pageSize` (1–100; la API pública máx. 50). **Orden:** `sort=campo` o `sort=-campo`, solo valores listados en la especificación. **Búsqueda:** `q`.
- **Validación:** todas las entradas se validan con esquemas estrictos (campos desconocidos → 422). Las salidas son DTO explícitos: nunca se devuelven hashes, secretos MFA, tokens ni datos internos.
- **GET nunca modifica datos.**
- **Conflictos:** duplicados, recursos en uso, último administrador → `409` con `details`. Las operaciones compuestas son transaccionales.
- **Ediciones simultáneas (desde 1.1, compatible):** usuarios, roles, medios, páginas, noticias y sliders devuelven
  `version`. Envíela en `PUT/PATCH` (en sliders también al agregar, editar, ordenar o eliminar diapositivas; en el DELETE
  de diapositiva como `?version=`). Si otra persona guardó antes: `409` con `code: "EDIT_CONFLICT"` y
  `details.versionActual`; recargue antes de volver a guardar. Sin `version`, el último guardado prevalece (clientes antiguos).
- **Archivos:** `multipart/form-data` (campos `archivos` para multimedia —hasta 10— y `archivo` para reemplazos y PDF).
- **Límites:** 600 peticiones/15 min por IP en la API; login 10/15 min; MFA 10/15 min; recuperación 5/h; cargas 60/h; cuerpo JSON 100 KB (páginas 1 MB, noticias 512 KB); imágenes 8 MB, audio 20 MB, PDF 10 MB.

## Operación

- `GET /api/v1/sistema/metricas` (permiso `system.read`): latencia y errores por ruta, pool de PostgreSQL, memoria, CPU y caché.
- `GET /health/live` y `/health/ready` (fuera de `/api`, sin datos sensibles).
- Respuestas privadas con `Cache-Control: no-store`; las públicas pueden almacenarse en caché por el navegador o un CDN.

## Política de versionado y compatibilidad

- `v1` es estable. Se consideran **compatibles** y se publican sin cambiar de versión: endpoints nuevos, campos nuevos
  **opcionales** en las solicitudes, campos nuevos en las respuestas, valores nuevos en enumeraciones documentadas como ampliables.
- Un cambio **incompatible** (quitar o renombrar campos, cambiar tipos o significado, endurecer validaciones existentes)
  se publica como `/api/v2`. `v1` se mantiene al menos **6 meses** después de publicar `v2`, y sus respuestas incluyen
  las cabeceras `Deprecation` y `Sunset` con la fecha de retiro.
- Los consumidores deben ignorar campos desconocidos en las respuestas.

## Integraciones con otros sistemas

- **CORS cerrado por defecto.** Solo se habilita para la API pública de lectura y para los orígenes exactos listados en
  `CORS_ORIGINS`. Nunca `*` y nunca con credenciales.
- Un sistema externo **no debe usar** credenciales personales de administradores ni la sesión del panel.
- **Pendiente** (no implementado en esta entrega): credenciales de integración por consumidor (clave de API con hash,
  permisos limitados al rol técnico del consumidor, rotación y revocación). Hasta entonces, las integraciones solo
  pueden usar la API pública de lectura. Diseño propuesto en `docs/SEGURIDAD-AUDITORIA.md` (pendiente P-07).
