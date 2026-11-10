# Matriz de permisos

Generada a partir del catálogo en `src/domain/permissions.js` (única fuente de verdad). La autorización se verifica
**en el backend** en dos niveles: en cada ruta (`auth: 'modulo.accion'` en `defineRoute`) y de nuevo en el servicio
sobre cada recurso (`authorize(actor, permiso)`). Ocultar opciones en el panel es solo comodidad.

**Denegación por defecto:** lo que no está concedido explícitamente está prohibido.

## Correspondencia con lo solicitado

| Funcionalidad | Administrador | Editor | Permisos |
|---|:-:|:-:|---|
| Acceder al dashboard | Sí | Sí | `dashboard.access` |
| Gestionar usuarios y roles | Sí | No | `users.*`, `roles.*` |
| Consultar estadísticas | Sí | No | `stats.read` |
| Subir multimedia y actualizar sus datos | Sí | Sí | `media.upload`, `media.update` |
| Crear, editar y publicar páginas y noticias | Sí | Sí | `pages.create/update/publish`, `news.create/update/publish` |
| Gestionar imágenes y contenido de sliders | Sí | Sí | `sliders.create/update` (agregar, reemplazar, ordenar, activar/desactivar) |
| Eliminar definitivamente contenidos o archivos | Sí | No | `*.delete` |
| Consultar la auditoría | Sí | No | `audit.read` |
| Consultar métricas de operación del servidor | Sí | No | `system.read` |
| Ver datos personales de PQRSD y responder | Sí | No | `pqrsd.read`, `pqrsd.respond` |

## Detalle por módulo y acción

| Módulo | Acción | Permiso | Administrador | Editor |
|---|---|---|:-:|:-:|
| Panel | Acceder al panel | `dashboard.access` | Sí | Sí |
| Usuarios | Consultar | `users.read` | Sí | No |
| Usuarios | Crear | `users.create` | Sí | No |
| Usuarios | Actualizar | `users.update` | Sí | No |
| Usuarios | Eliminar | `users.delete` | Sí | No |
| Roles y permisos | Consultar | `roles.read` | Sí | No |
| Roles y permisos | Crear | `roles.create` | Sí | No |
| Roles y permisos | Actualizar | `roles.update` | Sí | No |
| Roles y permisos | Eliminar | `roles.delete` | Sí | No |
| Estadísticas | Consultar | `stats.read` | Sí | No |
| Auditoría | Consultar | `audit.read` | Sí | No |
| Sistema | Consultar métricas de operación | `system.read` | Sí | No |
| Multimedia | Consultar | `media.read` | Sí | Sí |
| Multimedia | Subir | `media.upload` | Sí | Sí |
| Multimedia | Actualizar y reemplazar | `media.update` | Sí | Sí |
| Multimedia | Eliminar definitivamente | `media.delete` | Sí | No |
| Páginas | Consultar | `pages.read` | Sí | Sí |
| Páginas | Crear | `pages.create` | Sí | Sí |
| Páginas | Editar | `pages.update` | Sí | Sí |
| Páginas | Publicar | `pages.publish` | Sí | Sí |
| Páginas | Eliminar definitivamente | `pages.delete` | Sí | No |
| Noticias | Consultar | `news.read` | Sí | Sí |
| Noticias | Crear | `news.create` | Sí | Sí |
| Noticias | Editar | `news.update` | Sí | Sí |
| Noticias | Publicar | `news.publish` | Sí | Sí |
| Noticias | Eliminar definitivamente | `news.delete` | Sí | No |
| Sliders | Consultar | `sliders.read` | Sí | Sí |
| Sliders | Crear | `sliders.create` | Sí | Sí |
| Sliders | Editar | `sliders.update` | Sí | Sí |
| Sliders | Eliminar definitivamente | `sliders.delete` | Sí | No |
| Normatividad | Consultar | `documents.read` | Sí | Sí |
| Normatividad | Publicar | `documents.create` | Sí | Sí |
| Normatividad | Eliminar definitivamente | `documents.delete` | Sí | No |
| PQRSD | Consultar datos personales | `pqrsd.read` | Sí | No |
| PQRSD | Responder | `pqrsd.respond` | Sí | No |

## Reglas adicionales (verificadas con pruebas en `tests/authorization.test.js`)

- El rol **Administrador** es del sistema: no se elimina y sus permisos no se modifican.
- El administrador puede crear **roles adicionales** con permisos explícitos por módulo y acción.
- Un rol solo se elimina si **ningún usuario** lo tiene asignado (si no, `409`).
- Nunca queda el sistema **sin un administrador activo**; nadie se desactiva, elimina ni cambia su propio rol.
- **Sin escalada de privilegios:** nadie asigna un rol ni concede permisos que no tenga.
- Un editor no puede modificar su rol con una petición manipulada: los esquemas de entrada son estrictos y rechazan campos no permitidos (`422`), y `PATCH /usuarios/{id}` exige `users.update`.
- Cambiar el rol, los permisos de un rol, desactivar a un usuario, cambiar o recuperar la contraseña, o cambiar el segundo factor **revoca o revalida de inmediato** las sesiones afectadas.
- Solo un administrador puede desactivar, cambiar de rol o eliminar a otro administrador.


## Aplicación técnica (versión 4)

- Guard global de NestJS (`SecurityGuard`): **toda ruta sin declaración se rechaza**; luego límite, acceso o permiso y CSRF.
- Los servicios vuelven a comprobar el permiso (`authorize`) y las reglas sobre el recurso concreto, por lo que llamar a la API directamente, saltando la interfaz, no evita ninguna regla (probado en `test/integration/authorization.test.ts` y en E2E).
- El permiso `system.read` es nuevo; la migración `DatosIniciales` lo asigna al rol Administrador. Al migrar desde la versión 3, la herramienta agrega al rol Administrador los permisos nuevos (hoy `system.read`), porque ese rol no se puede editar desde el panel; el informe de migración lo registra en `permisosAgregadosAlAdministrador`.
