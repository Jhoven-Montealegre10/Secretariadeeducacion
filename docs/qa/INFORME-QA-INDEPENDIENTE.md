# Informe de QA independiente: portal SEM Ibagué, versión 4 (TypeScript, NestJS y PostgreSQL)

## 1. Entorno y alcance

| Elemento | Valor |
|---|---|
| Fechas de ejecución | 10 y 11 de noviembre de 2026. Hubo una pausa por un límite de uso; luego se reinició el entorno con la misma base de datos. |
| URL probada | `http://127.0.0.1:3300` (`NODE_ENV=development`), compilado `dist/` del repositorio `/home/user/Secretariadeeducacion` (HEAD `7f45167`) |
| Base de datos | PostgreSQL `semibague_qa` (esquema `portal`) en `127.0.0.1:54329`. Solo usé el superusuario para leer (estado de usuarios, tabla `limites_tasa` y `medios`). |
| Herramientas | Node 24.22.2, `fetch` y un cliente HTTP propio (`lib.js`) que usa varias IP de origen `127.0.0.x` para no agotar los límites por IP, Playwright con Chromium (escritorio 1366×800 y `devices['Pixel 7']`), curl y psql |
| Perfiles | **Administrador** (`qa-admin@example.gov.co`); **Editor** (`qa-editor@example.gov.co`, creado desde el panel); **Anónimo**. Perfiles auxiliares creados por API: `qa-editor2` (editor para Mi cuenta y MFA), `qa-comunica` (rol personalizado "Comunicaciones QA"), `qa-gestor` (rol "Gestor de usuarios QA" para probar la escalada) y `qa-admin3` (segundo administrador para la concurrencia) |
| Evidencias | Scripts `t-*.js` y `ui-*.js`; capturas en `shots/` (115 archivos); copia del registro de la segunda sesión en `server-sesion2.log.txt`; salida de recorridos en `ui-public.json` y `ui-admin.out`. Todo está en `qa/`. |

No modifiqué el repositorio. `git status` está limpio en todo momento. Los datos que creé (noticias, páginas, medios, usuarios y roles de QA) quedan en la base `semibague_qa`.

> **Nota sobre el registro:** el `server.log` de la primera sesión se perdió con el reinicio. Las líneas de esa sesión que se citan abajo (QA-01 y QA-07) las copié en el momento en que ocurrieron. QA-01 se reprodujo además en la segunda sesión y está en `server-sesion2.log.txt`.

---

## 2. Resumen

| Resultado | Casos |
|---|---|
| Aprobado | **92** |
| Fallido | **24** (varios casos comparten defecto) |
| Bloqueado | **1** |
| No ejecutado | **7** (E-06 = X-04, contado una vez) |
| **Total** | **124** |

Defectos: **0 críticos, 0 altos, 4 medios, 7 bajos y 6 mejoras** (17 en total; lista en la sección 4).

La autorización por permisos, el CSRF, el MFA, el control de versiones (409 EDIT_CONFLICT), la sanitización contra XSS y la protección de archivos privados funcionan bien en todo lo probado. Los fallos se concentran en dos puntos:

- **Validación de entrada que llega a PostgreSQL sin filtrar:** fechas inexistentes y el byte NUL producen 500, en algunos casos desde endpoints públicos y anónimos.
- **La política de contraseñas:** acepta contraseñas comunes en español o derivadas del nombre del usuario.

---

## 3. Matriz ejecutada

Leyenda: **A** = aprobado, **F** = fallido, **B** = bloqueado, **N** = no ejecutado. Perfil: Adm = administrador, Ed = editor, Anón = anónimo.

### 3.1 Sitio público

| # | Perfil | Caso y pasos resumidos | Res. |
|---|---|---|---|
| P-01 | Anón | Inicio, `/secretaria`, `/tramites`, `/comunidad`, `/transparencia`, `/contacto`, `/atencion`, `/normatividad`, `/mapa-del-sitio`: todas responden 200, con un único `h1`, `lang` y título correctos | A |
| P-02 | Anón | Rastreo de los 63 enlaces internos y de sus anclas (`#mision`, `#matricula`…): ninguno roto, ninguna ancla faltante (`ui-public.json`) | A |
| P-03 | Anón | Imágenes rotas (también forzando la carga diferida) y `img` sin `alt`: ninguna | A |
| P-04 | Anón | Consola del navegador en las 18 URL × 2 dispositivos: solo los 404 esperados de las páginas inexistentes; sin errores JS ni violaciones de CSP | A |
| P-05 | Anón | Submenús de escritorio: se abren con el ratón (hover) y con Enter/clic; Tab entra al submenú; los enlaces llevan a la sección correcta | A |
| P-06 | Anón | Submenús con Escape y clic fuera: Escape no cierra el submenú si el foco está dentro, y `aria-expanded` sigue en `true` | **F** (QA-06) |
| P-07 | Anón | Móvil (Pixel 7): botón "☰ Menú", menú y submenú desplegables, navegación; sin desborde horizontal en ninguna página. Las tablas anchas quedan dentro de un contenedor con desplazamiento propio. | A |
| P-08 | Anón | Accesibilidad básica: enlace de salto como primer elemento de tabulación, foco visible (contorno sólido de 3 px), controles de tamaño de letra y contraste, todos los campos con etiqueta, sin `id` duplicados | A |
| P-09 | Anón | El enlace "Saltar al contenido" no mueve el foco al `<main>` (`activeElement` = BODY) | **F** (QA-16, mejora) |
| P-10 | Anón | Noticias: listado de 9 por página, paginación `?page=2`, `page` inválido vuelve a la página 1 sin error; detalle con imagen y galería | A |
| P-11 | Anón | Normatividad: listado y filtro `q`; descarga del PDF con `Content-Type: application/pdf` y CSP `sandbox` | A |
| P-12 | Anón | Buscador: `q=matrícula`, `q=a` (menos de 2 caracteres, sin buscar), `q=<script>` (escapado), `q=' OR 1=1--` (200, sin efecto) | A |
| P-13 | Anón | Buscador y API pública con un byte NUL (`/buscar?q=ab%00`, `/api/v1/public/noticias?q=%00`, `/api/v1/public/documentos?q=%00`) responden 500 | **F** (QA-02) |
| P-14 | Anón | 404 en `/no-existe` y `/noticias/no-existe` con la página de error del sitio | A |
| P-15 | Anón | PQRSD con el formulario vacío: errores por campo, `aria-invalid` y `aria-describedby`; con datos inválidos se conservan los valores ya escritos | A |
| P-16 | Anón | Radicación de una PQRSD válida: radicado `SEM-2026-12498397`; la confirmación no se repite al recargar | A |
| P-17 | Anón | Consulta con radicado y documento correctos (muestra el estado y luego la respuesta escapada), con documento incorrecto o radicado inexistente ("No encontramos…", 404), y sin CSRF (403) | A |
| P-18 | Anón | Consulta con el radicado en minúsculas o el documento con espacios: no se encuentra la solicitud | **F** (QA-17, mejora) |
| P-19 | Anón | PQRSD: campo trampa (`sitio_web`) descartado sin radicar; `tipo` fuera de la lista y mensaje de más de 5000 caracteres dan 422; límite de 5 por hora por IP (429 en la sexta) | A |
| P-20 | Anón | Mapa de Google en `/contacto` y en `datosContacto` | **B**: el entorno no tiene salida a internet (`ERR_TUNNEL_CONNECTION_FAILED`) |
| P-21 | Anón | `robots.txt` y `security.txt` responden; a `security.txt` le falta `Expires` | **F** (QA-15, mejora) |

### 3.2 Panel: autenticación y Mi cuenta

| # | Perfil | Caso | Res. |
|---|---|---|---|
| A-01 | Anón | Ingreso en la interfaz con contraseña incorrecta: mensaje genérico, sin enumeración de cuentas (correo desconocido y contraseña errónea tardan lo mismo, unos 190 ms, y dan el mismo 401) | A |
| A-02 | Adm | Primer ingreso: configuración del MFA con QR y clave manual; código erróneo da 422; el código correcto activa el MFA y muestra 10 códigos de recuperación; "Ir al panel" está deshabilitado hasta confirmar que se guardaron | A |
| A-03 | Ed | Invitación por correo de desarrollo, definición de la contraseña (mínimo 12 caracteres, coincidencia de las dos entradas), MFA y panel con el menú reducido | A |
| A-04 | Ed | El enlace de invitación ya usado se rechaza con "El enlace no es válido o expiró" | A |
| A-05 | Ed/Adm | Política de fortaleza: rechaza `password1234567`, `123456789012` y el correo como contraseña; **acepta** `contraseña123456`, `administrador1` y `QA Editor Dos QA Editor Dos` | **F** (QA-03) |
| A-06 | — | Sin acceso a la API antes del MFA (401); TOTP erróneo da 401; enviar los dos campos da 422; el código TOTP no se puede reutilizar en otra sesión | A |
| A-07 | Adm | Código de recuperación válido (acepta minúsculas y sin guion); reutilizarlo da 401 | A |
| A-08 | Ed | Bloqueo de la cuenta tras 5 contraseñas erróneas, aun desde IP distintas; con la contraseña correcta sigue respondiendo 401 genérico | A |
| A-09 | Anón | Límite de ingreso por IP: el intento 11 responde 429 con `Retry-After: 899` | A |
| A-10 | — | Cookie `HttpOnly; SameSite=Strict`; el identificador de sesión cambia tras la contraseña y tras el MFA; la cookie previa al ingreso deja de servir | A |
| A-11 | Ed2 | Cierre de sesión: sin CSRF da 403; con CSRF da 204; la cookie antigua da 401; en la interfaz, "Atrás" vuelve a `/admin/login` | A |
| A-12 | Anón | Recuperación de contraseña: correo desconocido o cuenta inactiva dan 202 sin enviar correo; el enlace sirve una sola vez; la contraseña débil se rechaza; la sesión abierta se revoca tras el restablecimiento | A |
| A-13 | Ed2 | Mi cuenta, nombre: se guarda; vacío da 422; con `<img onerror>` se guarda pero se muestra escapado; agregar `email` da 422 | A |
| A-14 | Ed2 | Cambio de contraseña: actual incorrecta da 422, menos de 12 o más de 128 caracteres da 422, contraseña común da 422; si es válida, las otras sesiones dan 401 y la actual sigue | A |
| A-15 | Ed | En la interfaz, el error de contraseña débil se asocia al campo `password` y no a `nueva` | **F** (QA-04) |
| A-16 | Ed2 | La nueva contraseña puede ser igual a la actual | **F** (QA-09, mejora) |
| A-17 | Ed2 | Reautenticación (REAUTH_REQUIRED sin ella; REAUTH_FAILED si es errónea), regeneración de códigos (invalida los anteriores), cambio de dispositivo MFA (el secreto anterior deja de valer) | A |

### 3.3 Usuarios y roles

| # | Perfil | Caso | Res. |
|---|---|---|---|
| U-01 | Adm | Crear un usuario desde la interfaz con rol Editor; el correo duplicado (aun en mayúsculas) da 409 con mensaje en un aviso | A |
| U-02 | Adm | Editar, versión vieja (409 EDIT_CONFLICT), desactivar (sesiones revocadas, ingreso rechazado), eliminar (luego 404) | A |
| U-03 | Adm | No puede desactivarse, cambiar su propio rol ni eliminarse (403 con mensaje claro) | A |
| U-04 | Adm | Validación: correo inválido, campo extra o rol inexistente dan 422 | A |
| U-05 | Adm | Rol personalizado con permisos explícitos: el usuario con ese rol solo puede lo concedido (crear noticias sí; publicar, páginas o sliders da 403) | A |
| U-06 | Adm | Al cambiar los permisos de un rol se revocan de inmediato las sesiones de sus usuarios (401) | A |
| U-07 | Adm | Rol Administrador no editable ni eliminable (403); rol en uso da 409; nombre de rol duplicado da 409; permiso inexistente da 422 | A |
| U-08 | Gestor | Sin escalada: no puede asignar Administrador ni Editor (le faltan permisos), no puede modificar a un administrador, ni ampliar los permisos de su propio rol o de un rol nuevo (403) | A |
| U-09 | Ed | Llamadas directas a usuarios, roles, permisos, auditoría, estadísticas, métricas, PQRSD y a todos los `DELETE` de contenido: **28 llamadas, todas 403** | A |
| U-10 | Ed | En el panel, el menú no muestra módulos de administración; las rutas directas muestran "Sin acceso" | A |
| U-11 | Adm | Último administrador: dos administradores se desactivan mutuamente a la vez; uno queda activo, pero ocurre un *deadlock* (503) | **F** (QA-07) |

### 3.4 Multimedia

| # | Perfil | Caso | Res. |
|---|---|---|---|
| M-01 | Ed | Subir JPG, PNG, WebP, MP3, WAV y OGG válidos (201, privados por defecto, con miniatura); hasta 10 archivos a la vez; 11 archivos dan 422 | A |
| M-02 | Ed | Rechazos: SVG, SVG enviado como `image/png`, EXE renombrado a `.png`, PHP o HTML renombrados a imagen, PDF (422); PNG de 9,6 MB da 413 | A |
| M-03 | Ed | JPG con HTML añadido al final: se recodifica y la carga útil desaparece | A |
| M-04 | Ed | Nombre de archivo con ñ o tildes: el nombre original y el visible quedan con caracteres corruptos (`foto-Ã±andÃº`) | **F** (QA-05) |
| M-05 | Ed | Búsqueda (`q`), filtro por tipo, orden permitido; `sort` u otros valores fuera de la lista dan 422; `pageSize` 0 o 101 da 422 | A |
| M-06 | Ed | Editar el texto alternativo en el diálogo (aviso "Archivo actualizado"); con `version` vieja da 409; campo extra da 422 | A |
| M-07 | Ed | Reemplazar el archivo manteniendo los usos; reemplazar por otro tipo o por SVG da 422; la URL pública anterior deja de servir | A |
| M-08 | Adm/Ed | Eliminar: el editor recibe 403; con usos, 409 con la lista de dónde se usa; sin usos, 204 | A |
| M-09 | Anón | Archivo privado en `/media/…` y `/api/v1/medios/{id}/archivo` da 404 y 401; si es público o se usa en contenido publicado, 200 con CSP `sandbox` y `nosniff` | A |
| M-10 | Anón | Imagen usada solo por una noticia con fecha futura: accesible públicamente antes de la publicación | **F** (QA-13) |
| M-11 | Adm | El nombre visible `<script>alert(1)</script>` se muestra escapado en la cuadrícula; no se ejecuta ningún diálogo | A |

### 3.5 Páginas (editor por bloques)

| # | Perfil | Caso | Res. |
|---|---|---|---|
| G-01 | Ed | Crear con los 11 tipos de bloque por API; en la interfaz: título, texto con negrita y bloque de tabla, guardar borrador | A |
| G-02 | Ed/Anón | Vista previa protegida (200 para el editor, 401 para anónimos); el borrador da 404 en público | A |
| G-03 | Ed | Publicar (visible) y pasar a borrador (404 en público) desde la interfaz | A |
| G-04 | Ed | XSS: `<script>`, `onerror`, `onclick`, `javascript:`, `<iframe>`, `<svg onload>` se eliminan; enlaces `javascript:` en tarjetas o botones dan 422; el contenido de las tablas se escapa | A |
| G-05 | Ed | Slug duplicado da 409; reservados (`admin`, `api`, `noticias`, `buscar`, `media`, `health`…) dan 422; formato inválido o más de 80 caracteres dan 422; slug automático sin tildes | A |
| G-06 | Ed | Páginas del sistema: no se eliminan ni cambian de slug (403); sí se pueden pasar a borrador, como documenta el mensaje | A |
| G-07 | Ed | Bloque desconocido, medio inexistente o audio usado como imagen dan 422; cuerpo de más de 1 MB da 413 pero con `code` `BAD_REQUEST` | **F** (QA-10) |
| G-08 | Ed/Adm | Conflicto de versión por API (409 EDIT_CONFLICT) y en la interfaz con dos pestañas (aviso claro: "Sus cambios no se guardaron…") | A |
| G-09 | Ed | Título con byte NUL da 500 | **F** (QA-02) |

### 3.6 Noticias

| # | Perfil | Caso | Res. |
|---|---|---|---|
| N-01 | Ed | Crear con imagen principal y galería; el contenido se sanea; slug automático | A |
| N-02 | Anón | En el inicio, las publicadas aparecen ordenadas de la más reciente a la más antigua | A |
| N-03 | Anón | Fecha futura y borrador no aparecen en el inicio, el listado, el detalle ni la API pública (404) | A |
| N-04 | Anón | API pública: estructura `{data, meta}`, `pageSize` 51 da 422, sin campos internos (`slug, titulo, resumen, categoria, fechaPublicacion, imagen, url`) | A |
| N-05 | Ed | Validación: categoría fuera de la lista o imagen o foto de audio dan 422; campo extra da 422 | A |
| N-06 | Ed | Fechas inexistentes (`2026-02-30`, `2026-04-31`, `2025-02-29`) dan **500** | **F** (QA-01) |
| N-07 | Ed/Adm | Conflicto de versión (409); sin `version` gana el último guardado, como documenta la API | A |
| N-08 | Ed | El título repetido genera el slug `-2` si se crea en secuencia, pero 409 si se crea en paralelo | **F** (QA-08) |

### 3.7 Sliders

| # | Perfil | Caso | Res. |
|---|---|---|---|
| S-01 | Ed | Crear por ubicación (`inicio`, `pagina:contacto`, `pagina:secretaria`); ubicación ocupada da 409; formato inválido da 422 | A |
| S-02 | Ed | Agregar 3 diapositivas, reordenar, orden incompleto o ajeno (422), desactivar una; enlace `javascript:` o audio dan 422 | A |
| S-03 | Anón | El inicio y `/secretaria` muestran las diapositivas activas en el orden definido; las inactivas no aparecen | A |
| S-04 | Ed | Eliminar una diapositiva o un slider da 403 (sin `*.delete`); el administrador elimina (204) | A |
| S-05 | Ed | Versión vieja da 409 en diapositivas, orden y slider | A |
| S-06 | Ed | Se acepta un slider para una página inexistente (`pagina:no-existe`) sin aviso | **F** (QA-12, mejora) |

### 3.8 Estadísticas, auditoría, normatividad y PQRSD en el panel

| # | Perfil | Caso | Res. |
|---|---|---|---|
| E-01 | Adm | Estadísticas por defecto y con filtros en la interfaz; rango invertido da 422 con aviso; más de 366 días da 422; rango vacío muestra "vacío" | A |
| E-02 | Adm | Estadísticas con fecha inexistente (`desde=2026-02-30`, `hasta=2026-04-31`) dan 500 | **F** (QA-01) |
| E-03 | Adm | Auditoría: listado, filtros (resultado, usuario, acción, `q`, fechas), paginación, `pageSize` 101 da 422 | A |
| E-04 | Adm | Auditoría con fecha inexistente da 500 | **F** (QA-01) |
| E-05 | Adm | "Verificar integridad" en la interfaz: "La bitácora está íntegra"; API `{integra:true}` | A |
| E-06 | Adm | Detectar una alteración real de la bitácora | **N**: requiere modificar la base y el superusuario es solo de lectura |
| E-07 | Ed/Adm | Normatividad: PDF válido 201; JPG o texto disfrazados de PDF dan 422; año fuera de rango da 422; el editor no puede eliminar (403) | A |
| E-08 | Ed | Normatividad con fecha inexistente da 500 | **F** (QA-01) |
| E-09 | Adm | PQRSD en el panel: datos personales descifrados solo para el administrador, nombre con HTML escapado, respuesta con estado de la lista y consulta pública de la respuesta | A |
| E-10 | Adm | Métricas del sistema (`system.read`) | A |

### 3.9 API y contrato

| # | Perfil | Caso | Res. |
|---|---|---|---|
| API-01 | Todos | Estructura `{data}` y `{data, meta}`; errores con `{error:{code, message, details?, requestId}}` en todos los casos observados | A |
| API-02 | Ed/Adm | CSRF: sin token o con token falso, 403 `CSRF_INVALID` (inicio de sesión, cargas, cierre de sesión, formularios web) | A |
| API-03 | Ed/Adm | Esquemas estrictos: campos extra dan 422 en todos los recursos probados | A |
| API-04 | Ed/Adm/Anón | Paginación: `pageSize` mayor de 100 (privada) o 50 (noticias públicas) da 422; `page` 0, `abc` o `1e999` dan 422 | A |
| API-05 | Anón | `/api/v1/public/documentos` acepta `pageSize=100`, aunque `docs/API.md` dice "la API pública máx. 50" | **F** (QA-14) |
| API-06 | Anón | Endpoints privados sin sesión dan 401; `/api/v1/openapi.json` redirige al ingreso; `/api/v1/openapi-publica.json` 200 | A |
| API-07 | — | La especificación servida en `/api/v1/openapi.json` es idéntica a `docs/openapi.json` (OpenAPI 3.0.0, 70 operaciones); los códigos observados están dentro de los declarados, salvo los 500 de QA-01 y QA-02 | A |
| API-08 | Anón/Adm | Swagger en `/api/docs` y `/admin/api-docs` carga sin errores de consola ni de CSP | A |
| API-09 | Adm | Ruta desconocida del panel (`/admin/inexistente`) muestra el Resumen en lugar de "no existe" | **F** (QA-11) |

### 3.10 Seguridad superficial

| # | Perfil | Caso | Res. |
|---|---|---|---|
| SEC-01 | Anón | Cabeceras: CSP estricta (`script-src 'self'`), `nosniff`, `frame-ancestors 'none'`, `X-Frame-Options`, `Referrer-Policy`, COOP, CORP, `Permissions-Policy`; **sin `X-Powered-By`** | A |
| SEC-02 | Adm/Ed | Respuestas sin hashes, secretos MFA ni tokens (usuarios, sesión, roles); `Cache-Control: no-store` en las respuestas privadas | A |
| SEC-03 | Anón | `/.env`, `/package.json`, `/.git/config`, `/src/main.ts`, `/dist/…`, `/views/…`, `/storage/`, recorrido de rutas `../` (también codificado) en `/media` y `/assets`: todos 404 | A |
| SEC-04 | Anón | Errores sin trazas: 500 genérico con `requestId`; JSON mal formado da 400; UTF-8 inválido da 400 con la página de error del sitio | A |
| SEC-05 | Anón | `TRACE`, `OPTIONS` y `PUT` sobre `/` dan 404; CORS sin `Access-Control-Allow-Origin` para un origen ajeno | A |
| SEC-06 | — | El registro no contiene contraseñas, códigos ni tokens (búsqueda en `server.log`: solo aparece el nombre de la ruta `/cuenta/password`) | A |
| SEC-07 | Anón | Entradas con NUL o fechas imposibles producen 500 (el detalle está en QA-01 y QA-02) | **F** |

### 3.11 Concurrencia

| # | Perfil | Caso | Res. |
|---|---|---|---|
| C-01 | Ed+Adm | 4 PUT simultáneos de una página con la misma `version`: 1×200 y 3×409 EDIT_CONFLICT, versión final correcta | A |
| C-02 | Ed+Adm | Lo mismo en noticias (5 PUT), orden del slider (2) y medios (3): exactamente un 200 | A |
| C-03 | Ed/Adm | Creación simultánea con el mismo slug, rol, correo o ubicación de slider: un 201 y el resto 409, sin 500 | A |
| C-04 | Anón | 240 GET públicos simultáneos desde 200 IP: 240×200 en unos 0,6 s | A |
| C-05 | Ed | 8 cargas de archivos simultáneas: 8×201 | A |
| C-06 | Ed | Edición en dos pestañas del panel: la segunda recibe un aviso de conflicto claro | A |
| C-07 | Adm | Desactivación cruzada simultánea de dos administradores (*deadlock*) | **F** (QA-07) |

### 3.12 Registro del servidor y consola

| # | Caso | Res. |
|---|---|---|
| L-01 | Consola del navegador en el panel (18 rutas × administrador, editor y móvil): sin errores ni advertencias, salvo los 4xx esperados de validaciones provocadas | A |
| L-02 | Registro: todos los `ERROR` corresponden a QA-01 (22008 fecha fuera de rango), QA-02 (22021 byte NUL) y QA-07 (40P01 *deadlock*). No hay otros errores inesperados. Los `WARN 23505` de las pruebas de concurrencia son esperados (se traducen a 409). Hay además `WARN MALWARE_SCAN_COMMAND no configurado`, que es esperable en desarrollo. | F (ya cubierto) |

### 3.13 No ejecutado y bloqueado

| # | Caso | Motivo |
|---|---|---|
| X-01 | Expiración de sesión (30 min de inactividad y 8 h absolutas) | Tiempo de espera fuera del alcance de la sesión (sí observé indirectamente que las sesiones del navegador del día anterior habían expirado) |
| X-02 | Desbloqueo de la cuenta a los 15 minutos | Tiempo |
| X-03 | Límite general de la API (600 por 15 min) y de cargas (60 por hora) hasta el 429 | No quise agotar los límites compartidos que usaban las demás pruebas |
| X-04 | Detección de alteración de la bitácora (E-06) | Requiere escribir en la base con superusuario (no autorizado) |
| X-05 | Envío real por SMTP y análisis antimalware | No configurados en el entorno (correo a archivo, `MALWARE_SCAN_COMMAND` vacío) |
| X-06 | Visualización del PDF en el visor de Chrome con CSP `sandbox` | Chromium sin interfaz descarga los PDF; no se puede verificar que el visor funcione con `sandbox` |
| X-07 | Cookie `Secure` / `__Host-` y HSTS | Solo se aplican en producción (`NODE_ENV=production`); el entorno es de desarrollo |
| P-20 | Mapa de Google | **Bloqueado**: sin salida a internet |

---

## 4. Defectos

### QA-01: Una fecha inexistente con formato válido produce un error 500 en cuatro módulos
- **Severidad:** media
- **Módulos afectados:**
  - `POST/PUT /api/v1/noticias` (`fechaPublicacion`)
  - `POST /api/v1/documentos` (`fecha`)
  - `GET /api/v1/estadisticas` (`desde`/`hasta`)
  - `GET /api/v1/auditoria` (`desde`/`hasta`)
- **Pasos:**
  1. Con sesión de editor o administrador, enviar `POST /api/v1/noticias` con `{"titulo":"Fecha prueba","resumen":"Resumen suficientemente largo","contenido":"<p>Contenido suficientemente largo para la prueba</p>","fechaPublicacion":"2026-02-30"}`.
  2. Repetir con `2026-04-31` y `2025-02-29`, y con `GET /api/v1/estadisticas?desde=2026-02-30&hasta=2026-03-01`, `GET /api/v1/auditoria?desde=2026-02-30` y la carga de documentos con `fecha=2026-02-30`.
- **Esperado:** 422 `VALIDATION_ERROR` con `details:[{campo:"fechaPublicacion", mensaje:"Fecha inválida"}]`, igual que ocurre con `2026-13-01` y `2026-00-10`.
- **Obtenido:** 500 `INTERNAL_ERROR`. El esquema solo valida el patrón `\d{4}-\d{2}-\d{2}` o el mes, y PostgreSQL rechaza la fecha. En cambio, `2028-02-29` (año bisiesto) funciona.
- **Evidencia (registro):**
  ```
  ERROR [HTTP] [9b7b6ee1-…] POST /api/v1/noticias: QueryFailedError: date/time field value out of range: "2026-02-30"
  ERROR [HTTP] [84102439-…] GET /api/v1/estadisticas: QueryFailedError: date/time field value out of range: "2026-02-30"
  ERROR [HTTP] [8dac5057-…] GET /api/v1/auditoria: QueryFailedError: date/time field value out of range: "2026-02-30 00:00:00"
  ERROR [HTTP] [0d138fcf-…] POST /api/v1/documentos: QueryFailedError: date/time field value out of range: "2026-02-30"
  ```
  Reproducido en la segunda sesión: `server-sesion2.log.txt` (`2026-04-31`, `2025-02-29`). Scripts: `t-news2.js`, `t-docs.js`.

### QA-02: Un byte NUL (`\u0000`) en búsquedas o textos produce un error 500, también en endpoints públicos sin autenticación
- **Severidad:** media. Lo puede provocar cualquier visitante y llena el registro de errores.
- **Pasos:**
  1. Como anónimo, abrir `curl "http://127.0.0.1:3300/buscar?q=ab%00"`.
  2. Abrir también `GET /api/v1/public/noticias?q=%00` y `GET /api/v1/public/documentos?q=%00`.
  3. Con sesión, llamar `GET /api/v1/medios?q=%00`, `/api/v1/paginas?q=%00`, `/api/v1/noticias?q=%00`, y `POST /api/v1/paginas` con `{"titulo":"Titulo\u0000nulo"}` (también en noticias).
- **Esperado:** 422 (o eliminar el carácter) sin error del servidor.
- **Obtenido:** 500 `INTERNAL_ERROR` en todos los casos. `/noticias?q=%00` y `/normatividad?q=…` (HTML) responden 200, y la PQRSD con NUL se radica.
- **Evidencia (`server-sesion2.log.txt`):**
  ```
  ERROR [HTTP] [84ba3cb0-…] GET /buscar: QueryFailedError: invalid byte sequence for encoding "UTF8": 0x00
  ERROR [HTTP] [cb11fd41-…] GET /api/v1/public/noticias: QueryFailedError: invalid byte sequence for encoding "UTF8": 0x00
  ERROR [HTTP] [947a6818-…] GET /api/v1/public/documentos: QueryFailedError: …0x00
  ERROR [HTTP] [42d63c08-…] POST /api/v1/paginas: QueryFailedError: …0x00
  ```

### QA-03: La política de contraseñas acepta contraseñas comunes en español y derivadas del nombre del usuario
- **Severidad:** media. Contradice "se rechazan contraseñas comunes o derivadas de los datos del usuario" (`src/domain/password-policy.ts`, `docs/SEGURIDAD-AUDITORIA.md` D-04).
- **Pasos:**
  1. Abrir el enlace de invitación (`/admin/restablecer#token=…`) y definir la contraseña `contraseña123456`.
  2. En Mi cuenta (usuario "QA Editor Dos"), cambiar la contraseña a `QA Editor Dos QA Editor Dos`.
- **Esperado:** rechazo con "La contraseña es demasiado común…".
- **Obtenido:**
  - Ambas se aceptan (200). La cuenta del editor de QA quedó con `contraseña123456`.
  - Con el evaluador del propio proyecto (`password-strength.service.js`): `contraseña123456` da puntuación 4, `administrador1` da 4, `Contraseña2024!` da 4, y `QA Editor Dos QA Editor Dos` con los datos del usuario da 3 (el mínimo es 3).
  - Sí se rechazan `password1234567`, `secretaria2024`, `ibague12345678` y el correo.
  - Parece que el diccionario no incluye contraseñas comunes en español y que repetir el nombre basta para pasar.
- **Evidencia:** salidas de `editor-reset.js` y `t-account.js` ("pw = nombre 200").

### QA-04: En el cambio de contraseña, el error de contraseña débil se asocia al campo `password` en vez de `nueva`
- **Severidad:** baja (interfaz y accesibilidad)
- **Pasos:** en Mi cuenta, con la contraseña actual correcta, escribir la nueva `password1234567` y pulsar "Cambiar contraseña".
- **Esperado:** el campo "Nueva contraseña" queda marcado (`aria-invalid`) con el mensaje junto a él; en la API, `details[0].campo = "nueva"` (el nombre del campo enviado).
- **Obtenido:**
  - API: `422 {"details":[{"campo":"password","mensaje":"La contraseña es demasiado común…"}]}`.
  - En el panel no se marca ningún campo y el aviso muestra el texto técnico "**password:** La contraseña es demasiado común…".
- **Evidencia:** `shots/ui-cuenta-pw-debil.png` y la salida de `ui-flows.js` ("field errors: ''").

### QA-05: Los nombres de archivo con ñ o tildes se guardan con caracteres corruptos
- **Severidad:** baja
- **Pasos:** en Multimedia, subir `foto-ñandú.jpg` desde el navegador (también ocurre por API con `nombre con espacios y ñ.jpg`).
- **Esperado:** `nombreOriginal: "foto-ñandú.jpg"` y nombre visible `foto-ñandú`.
- **Obtenido:**
  ```
  201 {"nombreVisible":"foto-Ã±andÃº","nombreOriginal":"foto-Ã±andÃº.jpg", …}
  ```
  El nombre de la parte multipart se interpreta como latin1. El nombre visible corrupto aparece en el panel y en el selector de medios.
- **Evidencia:** salida de `ui-up2.js` y `shots/ui-media-nombre-acentos.png`. Ejemplos en la base: medios id 8 y 25.

### QA-06: El submenú del menú principal no se cierra con Escape y `aria-expanded` no se actualiza
- **Severidad:** baja (accesibilidad, WCAG 4.1.2 y 2.1.1)
- **Pasos:**
  1. En escritorio, enfocar "La Secretaría" con el teclado y pulsar Enter; luego Tab para entrar al submenú.
  2. Pulsar Escape.
  3. Aparte: abrir el submenú con clic y luego hacer clic fuera.
- **Esperado:** Escape cierra el submenú y devuelve el foco al botón; `aria-expanded="false"` tras cerrar.
- **Obtenido:**
  - Tras Escape, el submenú sigue visible (lo mantiene abierto el foco interno) y `aria-expanded` sigue en `true`.
  - Tras el clic fuera, el submenú se oculta pero `aria-expanded` queda en `true`.
  - El código de `public/assets/js/main.js` quita la clase `open` en Escape y en el clic fuera, pero no actualiza `aria-expanded` ni mueve el foco.
- **Evidencia:** salida de `ui-menu.js` ("escape: visible true expanded true"; "click outside: visible false expanded true").

### QA-07: Desactivar a la vez a dos administradores entre sí produce un *deadlock* y un 503
- **Severidad:** baja. La regla "siempre queda un administrador activo" se mantiene, pero el resultado es un error de base de datos.
- **Pasos:** con dos administradores A y B con sesión, enviar en paralelo `PATCH /api/v1/usuarios/{B}` `{"activo":false}` (desde A) y `PATCH /api/v1/usuarios/{A}` `{"activo":false}` (desde B).
- **Esperado:** una operación 200 y la otra 409 o 403 con el mensaje de último administrador.
- **Obtenido:** `200` y `503 SERVICE_BUSY "El servicio está ocupado…"`. El registro muestra:
  ```
  WARN [PostgreSQL] Consulta fallida [40P01]: SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.slug = 'admi…
  WARN [PostgreSQL] Consulta lenta (1001 ms) …
  ERROR [HTTP] [416c6d12-…] PATCH /api/v1/usuarios/1: QueryFailedError: deadlock detected
  ```
- **Evidencia:** `t-conc.js`. Estado final en la base: `qa-admin` activo y `qa-admin3` inactivo.

### QA-08: El slug automático de noticias se comporta distinto en secuencia y en paralelo
- **Severidad:** baja
- **Pasos:**
  1. Crear dos noticias seguidas con el mismo título y sin `slug`: la segunda recibe `…-2` (201).
  2. Crear 4 noticias simultáneas con el mismo título.
- **Esperado:** el mismo comportamiento: slugs `-2`, `-3`… o 409 en ambos casos.
- **Obtenido:** en paralelo, `201, 409 CONFLICT, 409 CONFLICT, 409 CONFLICT`. Un usuario que guarde a la vez que otro recibe "Ya existe…" aunque no eligió el slug.
- **Evidencia:** `t-conc.js` y `t-news2.js` ("slug dup 201 noticia-qa-de-hoy-2").

### QA-09: Se acepta cambiar la contraseña por la misma contraseña actual
- **Severidad:** mejora
- **Pasos:** `PUT /api/v1/cuenta/password` con `{"actual":X,"nueva":X}`.
- **Esperado:** 422 "La nueva contraseña debe ser distinta de la actual".
- **Obtenido:** 200; además se cierran las demás sesiones aunque no hubo cambio real. También se puede volver de inmediato a la contraseña anterior.
- **Evidencia:** `t-account2.js` ("pw igual actual 200").

### QA-10: Un cuerpo demasiado grande devuelve 413 con el código `BAD_REQUEST`
- **Severidad:** baja
- **Pasos:** `POST /api/v1/paginas` con un bloque de texto de 1,1 MB.
- **Esperado:** `413` con `code:"PAYLOAD_TOO_LARGE"` y un mensaje sobre el tamaño, como en multimedia ("El archivo supera el máximo de 8 MB…").
- **Obtenido:** `413 {"error":{"code":"BAD_REQUEST","message":"La solicitud no es válida."}}`. El código no corresponde al estado y el mensaje no orienta al usuario.
- **Evidencia:** `t-pages.js` ("1.1MB body 413 … BAD_REQUEST").

### QA-11: Una ruta inexistente del panel muestra el Resumen
- **Severidad:** baja
- **Pasos:** con sesión, abrir `/admin/inexistente` (o cualquier `/admin/xyz`).
- **Esperado:** "Sin acceso: no tiene permisos para esta sección **o la sección no existe**" (mensaje previsto en `app.js`).
- **Obtenido:** se muestra el Resumen ("Hola, QA"), porque cualquier ruta `/admin/*` coincide con el prefijo de la ruta `/admin`. El usuario no se entera de que el enlace está mal.
- **Evidencia:** `ui-admin.out` y `shots/panel-admin-desktop_admin_inexistente.png`.

### QA-12: Se puede crear un slider para una página que no existe
- **Severidad:** mejora
- **Pasos:** `POST /api/v1/sliders` con `{"nombre":"Inexistente","ubicacion":"pagina:no-existe"}`.
- **Esperado:** 422 "La página no existe", o al menos una advertencia.
- **Obtenido:** 201; el slider queda huérfano y nunca se muestra.
- **Evidencia:** `t-sliders.js`. Queda como slider id 2.

### QA-13: La imagen de una noticia con fecha futura es pública antes de su publicación
- **Severidad:** baja. Riesgo de fuga de contenido embargado; el nombre del archivo es aleatorio, lo que reduce el riesgo.
- **Pasos:**
  1. Subir una imagen nueva (privada); `/media/<archivo>` da 404.
  2. Crear una noticia `estado:"publicada"` con `fechaPublicacion:"2026-12-31"` e `imagenId` de esa imagen.
  3. Abrir `/media/<archivo>` como anónimo.
- **Esperado:** 404 hasta la fecha de publicación (la noticia responde 404).
- **Obtenido:** la noticia da 404, pero **la imagen da 200**. El uso queda registrado como `"publicado":true` aunque la noticia todavía no es visible.
- **Evidencia:**
  ```
  antes 404 · noticia 201 anuncio-embargado-qa · noticia publica 404 · imagen publica 200 /media/3abcda3e23ef8e9dc17ae73dac918b3d.jpg
  usos [{"entidad":"noticia","entidadId":25,"titulo":"Anuncio embargado QA","publicado":true}]
  ```

### QA-14: La documentación no coincide con la API pública de documentos ni con la ruta de las pruebas
- **Severidad:** baja (documentación)
- **Diferencias:**
  1. `docs/API.md`: "`pageSize` (1–100; la API pública máx. 50)". Sin embargo, `GET /api/v1/public/documentos?pageSize=100` da 200; la especificación declara un máximo de 100 para ese endpoint, mientras que `/public/noticias` sí limita a 50.
  2. `docs/PERMISOS.md`, título de la sección: "verificadas con pruebas en `tests/authorization.test.js`". El repositorio tiene `test/` (no `tests/`) y la misma página cita después `test/integration/authorization.test.ts`.
- **Esperado:** documentación y comportamiento alineados (o un límite de 50 en todos los endpoints públicos).
- **Evidencia:** `t-docs.js` ("public pageSize=100 200").

### QA-15: A `security.txt` le falta el campo obligatorio `Expires`
- **Severidad:** mejora
- **Pasos:** `GET /.well-known/security.txt`.
- **Esperado:** según RFC 9116, `Contact` y **`Expires`** son obligatorios.
- **Obtenido:** solo contiene `Contact`, `Preferred-Languages` y `Policy`.

### QA-16: El enlace "Saltar al contenido principal" no mueve el foco al contenido
- **Severidad:** mejora (accesibilidad)
- **Pasos:** en el inicio, pulsar Tab (el foco va al enlace de salto) y luego Enter.
- **Esperado:** el foco pasa a `<main id="contenido">` (con `tabindex="-1"`), para que los lectores de pantalla anuncien el contenido.
- **Obtenido:** la página se desplaza a `#contenido`, pero `document.activeElement` es `BODY`.
- **Evidencia:** `ui-menu.js` ("after skip … focus BODY").

### QA-17: La consulta de PQRSD no tolera minúsculas en el radicado ni espacios en el documento
- **Severidad:** mejora (usabilidad ciudadana)
- **Pasos:** en `/atencion`, consultar `sem-2026-12498397` con el documento ` 1234567890 ` (con espacios).
- **Esperado:** encontrar la solicitud (normalizar a mayúsculas y quitar los espacios).
- **Obtenido:** "No encontramos una solicitud con esos datos".
- **Evidencia:** `ui-pqrsd.js` ("consulta lowercase/espacios: false").

---

## 5. Observaciones que no son defectos

- `contraseña123456` es la contraseña actual del editor de QA, por QA-03.
- Las contraseñas de las cuentas auxiliares están en `editor2-pw.txt` y en `onboard.js`.
- La cuenta `qa-editor` quedó bloqueada 15 minutos durante la prueba A-08. Ya pasó ese tiempo.
- El límite de MFA (10 por 15 min) se comparte con el cambio de contraseña y la reautenticación (cubeta `mfa`). Un usuario que se equivoque varias veces escribiendo una contraseña nueva débil recibe 429. Es coherente con la documentación, pero conviene tenerlo en cuenta en el soporte.
- Una página del sistema (p. ej. `/secretaria`) se puede pasar a borrador y queda en 404 mientras el menú sigue enlazándola. El mensaje del sistema lo permite de forma explícita, así que no lo reporto como defecto; convendría advertirlo en la interfaz.
- Sin `version`, el último guardado prevalece, tal como documenta `docs/API.md` (compatibilidad con clientes antiguos).
- Un editor puede abrir la especificación completa (`/api/v1/openapi.json`, `/admin/api-docs`). La documentación dice "completa, requiere sesión del panel", así que es conforme.

---

## 6. Re-verificación (11 de noviembre de 2026)

**Contexto**

- **Versión probada:** la que corre en `http://127.0.0.1:3300` (arranque `2:43:03 AM` UTC), con la misma base `semibague_qa`.
- **Cambios en el repositorio:** a la fecha de esta re-verificación el repositorio tiene modificaciones sin confirmar en 24 archivos, más `test/integration/qa-regresion.test.ts`. No los toqué.
- **Navegador:** todas las pruebas usaron contextos de Playwright nuevos (sin caché), así que se cargaron los JS y CSS actualizados.
- **Scripts:** `rv-api.js`, `rv-auth.js`, `rv-auth2.js`, `rv-ui.js` y `rv-menu2.js`. Además repetí `ui-menu.js`, `ui-public.js` y `ui-admin.js`.
- **Salidas:** `rv-ui-public.out` y `rv-ui-admin.out`.
- **Registro:** `server-reverificacion.log.txt`.

### 6.1 Resultado por defecto

| ID | Resultado | Evidencia |
|---|---|---|
| QA-01 | **Corregido** | Se responde `422 VALIDATION_ERROR` con `campo: fechaPublicacion`, `fecha`, `query.desde` o `query.hasta` y el mensaje "Fecha inválida" para:<br>• noticias con `2026-02-30`, `2026-04-31` y `2025-02-29`;<br>• documentos con `2026-02-30`;<br>• estadísticas con `desde=2026-02-30` y `hasta=2026-04-31`;<br>• auditoría con `desde=2026-02-30`.<br>`2028-02-29` sigue aceptándose (201); los rangos válidos de estadísticas y auditoría dan 200; un documento válido da 201. Ningún `ERROR` en el registro. |
| QA-02 | **Corregido** | Un byte NUL en `q` da 422 "La solicitud contiene caracteres no válidos.":<br>• para anónimos en `/buscar?q=ab%00` (página de error HTML), `/api/v1/public/noticias` y `/api/v1/public/documentos`;<br>• con sesión en medios, páginas y noticias;<br>• también en títulos de página y de noticia con NUL.<br>Las búsquedas válidas siguen dando 200. |
| QA-03 | **Corregido** | Se rechazan con 422 y `campo: "nueva"`:<br>• por comunes: `contraseña123456`, `administrador1`, `Contraseña2024!` ("demasiado común");<br>• por basarse en el usuario: `Mariana Restrepo Mariana Restrepo`, `mariana restrepo 2026`, `qa-rv qa-rv qa-rv` ("no puede basarse en su nombre o su correo").<br>En el restablecimiento por enlace se rechazan `contraseña123456` y `Joaquin Salazar Joaquin Salazar`. Una frase larga válida da 200. Ver la observación O-1. |
| QA-04 | **Corregido** | La API ahora devuelve `details[0].campo = "nueva"`. En el panel, el campo "Nueva contraseña" queda con `aria-invalid=true`, borde rojo y el mensaje debajo (`shots/rv-qa04-cuenta.png`). Ver la observación O-2. |
| QA-05 | **Corregido** | Por API, `acción-ñandú RV.jpg` se guarda como `nombreOriginal "acción-ñandú RV.jpg"` y nombre visible `acción-ñandú RV`. Por el navegador, `foto-ñandú-rv.jpg` se guarda como `nombreVisible "foto-ñandú-rv"` (id 33, `shots/rv-qa05-multimedia.png`). Ver la observación O-3. |
| QA-06 | **Parcial** | Ya funciona: Escape devuelve el foco al botón "La Secretaría" y `aria-expanded` pasa a `false`, también tras un clic fuera. Pero el submenú **sigue visible tras Escape**: la regla CSS `.has-sub:focus-within > .submenu { display:block }` lo mantiene abierto porque el foco quedó en el botón, que está dentro del `li`. El estado visual queda abierto mientras `aria-expanded` dice `false`, aun después de un segundo Escape. Detalle en QA-06b. |
| QA-07 | **Corregido** | Desactivación cruzada simultánea de `qa-admin` y del nuevo `qa-admin4`: `200` y `409 CONFLICT "No se puede desactivar al último administrador activo."`. Sin *deadlock* ni 503; ningún `ERROR` en el registro. Queda `qa-admin` como el único administrador activo. |
| QA-08 | **Corregido** | 4 creaciones simultáneas con el mismo título dan 201 con los slugs `concurrencia-rv-noticia`, `-2`, `-3` y `-4`; la siguiente en secuencia recibe `-5`. Con un slug explícito repetido en paralelo se sigue respondiendo `201, 409, 409`, que es lo esperado. |
| QA-09 | **Corregido** | Usar la misma contraseña actual da `422` con `campo: "nueva"`, `mensaje: "Igual a la actual"`, y no cierra las otras sesiones (la segunda sesión sigue en 200). Un cambio válido da 200: la sesión actual sigue y la otra pasa a 401. Ver la observación O-4. |
| QA-10 | **Corregido** | Un cuerpo de 1,1 MB devuelve `413 {"code":"PAYLOAD_TOO_LARGE","message":"La solicitud supera el tamaño permitido."}`. |
| QA-11 | **Corregido** | `/admin/inexistente` muestra "Sin acceso. No tiene permisos para esta sección o la sección no existe." para el administrador, el editor y en móvil (`shots/rv-qa11-ruta-inexistente.png`). Las 17 rutas válidas del panel cargan bien con los tres perfiles (`rv-ui-admin.out`). |
| QA-12 | **Corregido** | Un slider con `pagina:no-existe-rv` da `422` "No existe una página con esa dirección." (`campo: ubicacion`). Uno válido (`pagina:transparencia`) con una diapositiva da 201 y se muestra en `/transparencia`. |
| QA-13 | **Corregido** | Imagen nueva usada solo por una noticia publicada con fecha `2026-12-31`: la noticia da 404 y la imagen también da 404. Control: una imagen usada por una noticia de hoy da 200, y esa noticia aparece en el inicio. No se pudo verificar que la imagen pase a pública el 31 de diciembre (habría que esperar a esa fecha). |
| QA-14 | **Corregido** (documentación) | `docs/API.md` dice ahora "`pageSize` (1–100; en `/public/noticias` máx. 50)", lo que coincide con el comportamiento: `/public/documentos?pageSize=100` da 200 y `/public/noticias?pageSize=51` da 422. `docs/PERMISOS.md` cita ahora `test/integration/authorization.test.ts` y `test/integration/qa-regresion.test.ts`; ambos archivos existen. |
| QA-15 | **Corregido** | `security.txt` incluye ahora `Expires: 2027-11-11T00:00:00Z`. |
| QA-16 | **Corregido** | Tras Tab y Enter en "Saltar al contenido principal", `document.activeElement` es `#contenido`. |
| QA-17 | **Corregido** | La consulta encuentra la solicitud con `sem-2026-12498397` y documento ` 1234567890 `, y también con espacios alrededor del radicado. Un documento incorrecto con formato válido sigue dando 404 "No encontramos una solicitud con esos datos". Un documento de menos de 4 caracteres (`999`) da ahora 422 "Número de documento no es válido.", coherente con la regla de radicación (4 a 20 caracteres). |

**Resumen:** 16 corregidos, 1 parcial (QA-06) y 0 no corregidos.

### 6.2 Casos vecinos (regresión)

| Caso | Resultado |
|---|---|
| Ingreso por API y por interfaz: credenciales inválidas, válidas, MFA y cierre de sesión | Sin regresión. El editor con contraseña antigua (`contraseña123456`, ahora prohibida) sigue pudiendo ingresar: 200 y MFA 200. Esto es esperable, porque la política se aplica al definir la contraseña. En la interfaz, `qa-rv` entra al panel ("Hola, Mariana") y el cierre de sesión lleva a `/admin/login`. |
| Cambio de contraseña con una válida; invitación y restablecimiento | Sin regresión: 200; las otras sesiones se revocan; el restablecimiento por enlace con una frase válida da 200. |
| Carga de archivos | Sin regresión: varios archivos válidos (JPG, MP3 y WebP) dan 201; SVG, EXE renombrado y PNG de 9,6 MB siguen dando 422, 422 y 413. |
| Noticias válidas | Sin regresión: una noticia de hoy se publica y aparece en el inicio; la futura no aparece; la fecha bisiesta válida se acepta. |
| Sliders válidos | Sin regresión: crear, agregar diapositivas y reordenar dan 200; el slider público de inicio da 200 y el de `/transparencia` se muestra. |
| PQRSD válida | Sin regresión: nueva radicación `SEM-2026-44374474` y su consulta funcionan. |
| Menú del sitio con ratón y teclado, escritorio y móvil | Ratón, Enter, Tab dentro del submenú, clic fuera y enlaces funcionan. En móvil, el botón "☰ Menú" y los submenús funcionan, sin desborde (412 = 412). El único problema es QA-06b. |
| Rastreo público (18 URL, escritorio y Pixel 7) | Sin regresión: 64 enlaces internos sin errores; sin imágenes rotas ni desbordes de página; consola sin errores salvo los 404 provocados. El mapa de Google sigue bloqueado por falta de red. |
| Rutas válidas del panel (17 rutas, con administrador, editor y móvil) | Sin regresión: todas cargan con su `h1`; el editor ve "Sin acceso" en los módulos administrativos; consola limpia. |
| Registro del servidor durante toda la re-verificación | 0 líneas `ERROR` y 0 respuestas 5xx. Solo hay `WARN 23505`, esperables por los reintentos del slug en paralelo y las colisiones de slug explícito, y `WARN MALWARE_SCAN_COMMAND`. |

### 6.3 Defectos abiertos y nuevos

No encontré regresiones causadas por las correcciones. Siguen abiertos estos dos:

#### QA-06b: Tras Escape, el submenú sigue visible aunque `aria-expanded="false"` (seguimiento de QA-06)
- **Severidad:** baja (accesibilidad, WCAG 4.1.2)
- **Pasos:**
  1. En escritorio (1366 px), enfocar "La Secretaría" con el teclado y pulsar Enter.
  2. Pulsar Tab ("Misión y visión") y luego Escape.
- **Esperado:** el submenú se oculta, el foco vuelve al botón y `aria-expanded="false"`.
- **Obtenido:**
  - El foco vuelve al botón y `aria-expanded` pasa a `false`, pero el submenú **sigue visible**.
  - Un segundo Escape tampoco lo cierra.
  - Al pulsar Tab, el foco entra otra vez al submenú.
  - Causa: la regla CSS `.has-sub:focus-within > .submenu { display: block; }` mantiene abierto el submenú mientras el foco esté en cualquier elemento del `li`, incluido el propio botón.
- **Evidencia:** salida de `rv-menu2.js` ("Escape desde submenú visible true expanded false … focus-within? true") y `shots/rv-qa06-escape.png`.

#### QA-18 (nuevo, no es una regresión): una ruta del panel con identificador no numérico muestra un mensaje técnico
- **Severidad:** baja
- **Pasos:** con sesión, abrir `/admin/paginas/xyz/abc` (o `/admin/paginas/xyz`).
- **Esperado:** "Sin acceso / la sección no existe" o "La página no existe".
- **Obtenido:** el título "Error" y el texto "Los datos enviados no son válidos. **params.id: Invalid input: expected number, received NaN**", con un botón "Reintentar" que no sirve, y un 422 en la consola. Es probable que ya existiera antes de las correcciones; no lo había probado en la primera ronda.
- **Evidencia:** salida de `rv-ui.js` (QA-11, segunda ruta).

### 6.4 Observaciones (no son defectos)

- **O-1:** `secretaria educacion ibague` se acepta como contraseña. Son palabras del contexto de la entidad, pero es una frase de 27 caracteres. Se podría agregar un diccionario específico de la entidad.
- **O-2:** el aviso emergente del panel repite el error con el prefijo técnico del campo ("…relacionadas. **nueva:** La contraseña…"). Es el mismo patrón general que usan los demás formularios del panel (p. ej. "email: Duplicado"); conviene mostrar la etiqueta visible o no repetir el mensaje.
- **O-3:** los medios subidos antes de la corrección (id 8 y 25) conservan su nombre corrupto. No se corrigieron los datos existentes.
- **O-4:** se puede volver de inmediato a la contraseña anterior; no hay historial de contraseñas. No es un requisito documentado.

---

## 6.1 Segunda re-verificación (11 de noviembre de 2026)

**Contexto**

- **Versión probada:** servidor iniciado a las `2:54:10 AM` UTC. Al terminar la verificación, HEAD del repositorio era `ad7c44e` ("QA-06b, QA-18 y contraseñas con palabras institucionales…"); lo confirmó el equipo mientras yo probaba.
- **Navegador:** todos los contextos de Playwright son nuevos y sin caché, así que cargaron el CSS y el JS actualizados.
- **Scripts:** `rv2-ui.js`, `rv2-menu.js` y `rv2-pw.js`.
- **Registro:** `server-reverificacion2.log.txt`, con 0 `ERROR`, 0 `WARN` y 0 respuestas 5xx.

### Resultado de los tres puntos

| ID | Resultado | Evidencia |
|---|---|---|
| QA-06b (Escape) | **Corregido** en lo pedido, pero quedan desajustes vecinos (QA-06c) | • Enter abre el submenú.<br>• Tab entra al submenú.<br>• **Escape cierra el submenú**: queda invisible, con `aria-expanded=false` y el foco en el botón. Un segundo Escape lo mantiene cerrado.<br>• Enter y Espacio lo vuelven a abrir.<br>• Escape después de abrirlo con clic también lo cierra.<br>• En móvil, Escape cierra y el botón reabre.<br>Captura: `shots/rv2-qa06b-escape.png`. |
| QA-18 | **Parcial** | • `/admin/paginas/xyz`, `/admin/paginas/xyz/abc`, `/admin/noticias/abc` y `/admin/roles/-1` muestran "No existe. El elemento que busca no existe o fue eliminado." (`shots/rv2-qa18_*.png`).<br>• **`/admin/sliders/0` sigue mostrando** "Error. Los datos enviados no son válidos. params.id: Too small: expected number to be >0" con el botón "Reintentar" (administrador y editor).<br>• `/admin/paginas/99999` muestra "Error. La página no existe." con "Reintentar". El mensaje es comprensible, pero no es coherente con la vista "No existe" y el botón no sirve. |
| O-1 (palabras de la entidad) | **Parcial** | Se rechazan con 422 y `campo: nueva` ("no puede basarse en su nombre, su correo ni en el nombre de la entidad"):<br>• `secretaria educacion ibague`<br>• `Secretaría de Educación de Ibagué`<br>• `secretaria educacion municipal ibague 2026`<br>• `alcaldia de ibague tolima`<br>• `gov co educacion ibague`<br>**Se acepta** `ibague tolima educacion publica` (200). Esa frase está formada solo por palabras de la entidad y de su ubicación. |

### Casos vecinos

| Caso | Resultado |
|---|---|
| Menú con teclado: abrir, Escape, volver a abrir | Sin regresión: todo funciona. |
| Menú con ratón: hover, clic, clic en otro botón, clic fuera, enlaces | Sin regresión: hover abre y cierra al salir; clic en otro botón cierra el anterior; clic fuera cierra y deja `aria-expanded=false`; los enlaces del submenú navegan bien. Desajuste de estado: ver QA-06c. |
| Menú con Tab fuera del submenú | **Falla**: ver QA-19. |
| Menú en móvil (Pixel 7) | Sin regresión: abre, cierra y navega; sin desborde horizontal. Consola del sitio sin errores. |
| Rutas válidas del panel (administrador y editor): `/admin/paginas`, `/admin/paginas/6`, `/admin/paginas/nueva`, `/admin/noticias/nueva`, `/admin/noticias/3`, `/admin/sliders/1`, `/admin/roles/3`, `/admin/roles/2` | Sin regresión: todas cargan con su formulario o detalle. El editor ve "Sin acceso" en `/admin/roles/*`, como corresponde. Consola sin errores, salvo los 404 o 422 de las rutas inválidas probadas a propósito. |
| Cambio de contraseña con una frase válida (`<contraseña de prueba omitida>`) | Sin regresión: 200; la sesión actual sigue y se puede ingresar con la nueva contraseña. Una cuenta que ya tenía `secretaria educacion ibague` guardada sigue pudiendo ingresar (la política se aplica al definir la contraseña). |

### Defectos abiertos o nuevos

#### QA-06c: Con el foco en el botón, el submenú se ve abierto aunque `aria-expanded="false"`, y el segundo clic no lo cierra
- **Severidad:** baja (accesibilidad, WCAG 4.1.2). Es el resto de QA-06b.
- **Pasos:**
  1. En escritorio, en una página recién cargada y con el ratón fuera del menú, hacer clic en "La Secretaría": el submenú se abre con `aria-expanded=true`.
  2. Hacer clic otra vez en "La Secretaría".
  3. Aparte: llevar el foco con Tab a "La Secretaría" sin pulsar Enter.
- **Esperado:** el segundo clic cierra el submenú. Si el diseño muestra el submenú al recibir el foco, `aria-expanded` debe decir `true`.
- **Obtenido:**
  - Tras el segundo clic, `aria-expanded=false` pero el submenú **sigue visible** (no se cierra aunque se mueva el ratón fuera).
  - Con solo poner el foco en el botón, el submenú es visible con `aria-expanded=false`.
  - Causa: la regla CSS `.has-sub:focus-within > .submenu` sigue activa fuera del caso de Escape.
- **Evidencia:** salida de `rv2-menu.js`, casos B y C:
  ```
  B foco en botón sin abrir   0:V- …
  C 2º clic (cerrar)          0:V- …
  C mover ratón fuera         0:V- …
  ```
  (V = visible, E = `aria-expanded=true`, - = no).

#### QA-19: Un submenú abierto no se cierra al salir de él con Tab y se superpone al siguiente
- **Severidad:** baja (accesibilidad y uso con teclado). Probablemente ya existía: no lo probé en las rondas anteriores.
- **Pasos:**
  1. En escritorio, enfocar "La Secretaría" y pulsar Enter.
  2. Pulsar Tab 6 veces hasta llegar a "Trámites y servicios".
  3. Seguir con Tab hasta salir del menú principal (17 pulsaciones).
- **Esperado:** al salir el foco del submenú, este se cierra y `aria-expanded` vuelve a `false`; nunca hay dos submenús visibles a la vez.
- **Obtenido:**
  - El submenú de "La Secretaría" sigue abierto (`aria-expanded=true`) y queda **superpuesto** al de "Trámites y servicios", que se muestra por el foco.
  - Después de salir del menú (foco en "Ver trámites y servicios"), el primer submenú sigue abierto y tapa el contenido de la portada.
- **Evidencia:** `shots/rv2-menu-tab-fuera.png` (dos submenús superpuestos) y salida de `rv2-menu.js`, caso A (`0:VE 1:V-`, y después `0:VE` con el foco fuera del menú).

**Resumen de la segunda re-verificación:**
- QA-06b (Escape): corregido.
- QA-18: parcial.
- O-1: parcial.
- Nuevos: QA-06c y QA-19, ambos de severidad baja.
- Sin regresiones en las rutas del panel ni en el cambio de contraseña.

---

## 6.2 Tercera re-verificación (11 de noviembre de 2026)

**Contexto**

- **Servidor:** iniciado a las `3:04:01 AM` UTC. HEAD del repositorio: `b1b736e`.
- **Navegador:** contextos de Playwright nuevos, sin caché.
- **Scripts:** `rv3-menu.js`, `rv3-panel.js` y `rv3-pw.js`.
- **Registro:** `server-reverificacion3.log.txt`, con 0 `ERROR`, 0 `WARN` y 0 respuestas 5xx.

**Leyenda del estado del menú:** `n:VE` significa que el submenú n está visible (V) y su botón tiene `aria-expanded=true` (E); un guion indica lo contrario.

### Resultado

| ID | Resultado | Evidencia |
|---|---|---|
| QA-06c | **Corregido** | • Con el foco en «La Secretaría» sin abrir, el submenú está oculto (`0:--`), y Tab pasa directamente a «Trámites y servicios».<br>• Enter abre (`0:VE`); Enter de nuevo cierra (`0:--`); Espacio reabre.<br>• Clic abre y un segundo clic cierra (`0:--`, también con el ratón fuera).<br>• En ningún momento hubo un submenú visible con `aria-expanded=false`, salvo al pasar el ratón por encima, que es el comportamiento acordado. |
| QA-19 | **Corregido** | • Si se abre con Enter y se sale con Tab hacia «Trámites y servicios», el submenú se cierra (`0:-- 1:--`). No hay superposición (`shots/rv3-menu-tab.png`).<br>• Al salir del menú y volver con Shift+Tab, todo sigue cerrado.<br>• Moverse con Shift+Tab dentro del submenú no lo cierra.<br>• Al hacer clic en otro botón, el anterior se cierra (`0:-- 1:VE`). |
| QA-18, variantes | **Corregido** | • `/admin/sliders/0`, `/admin/sliders/-5`, `/admin/sliders/99999`, `/admin/paginas/99999`, `/admin/noticias/99999`, `/admin/pqrsd/99999`, `/admin/paginas/xyz`, `/admin/paginas/xyz/abc`, `/admin/noticias/abc` y `/admin/roles/-1` muestran «No existe. El elemento que busca no existe o fue eliminado.», sin texto técnico ni botón «Reintentar», con administrador y editor (`shots/rv3-panel_*.png`).<br>• Para el editor, las rutas de módulos sin permiso (roles, PQRSD) muestran «Sin acceso».<br>• Matiz menor: `/admin/roles/99999` muestra «Rol no encontrado» en vez del texto común. Es comprensible, aunque poco uniforme. |
| O-1, frase «ibague tolima educacion publica» | **Corregido** | Se rechazan con 422 (`nueva: …ni en el nombre de la entidad`):<br>• `ibague tolima educacion publica`<br>• `Ibagué Tolima educación pública`<br>• `educacion publica ibague`<br>• `secretaria educacion ibague`<br>• `ibague musical tolima colombia`<br>Residual: `tolima ibague colegios publicos` se acepta (200). Ver la observación O-5. |

### Casos vecinos

| Caso | Resultado |
|---|---|
| Menú con ratón en escritorio: hover, entrar al submenú, salir, clic fuera, enlace | Sin regresión: hover muestra y salir oculta; el clic fuera cierra todo; el enlace del submenú lleva a `/secretaria#mision`. Consola sin errores. |
| Menú en móvil (Pixel 7) | Sin regresión: «☰ Menú» abre el menú; tocar un botón abre su submenú, tocarlo otra vez lo cierra y Escape lo cierra; los enlaces navegan (`/comunidad#estudiantes`); sin desborde horizontal (`shots/rv3-movil-menu.png`). |
| Rutas válidas del panel (18 rutas, con administrador y editor) | Sin regresión: todas cargan su vista. El editor ve «Sin acceso» en usuarios, roles, estadísticas, auditoría y PQRSD. |
| Rutas inválidas del panel | Todas muestran «No existe» o «Sin acceso» (detalle en la tabla anterior). La consola solo registra los 404 de la API para identificadores que no existen, como corresponde. |
| Cambio de contraseña con una frase válida (`<contraseña de prueba omitida>`) | Sin regresión: 200; la sesión sigue y se puede ingresar con la nueva contraseña. |

### Observación

- **O-5:** frases que mezclan dos palabras de la entidad con palabras comunes (`tolima ibague colegios publicos`) se siguen aceptando. Queda a criterio del equipo endurecer la regla.

**Resumen de la tercera re-verificación:**
- QA-06c, QA-19, las variantes de QA-18 y la frase de O-1: corregidos.
- Sin regresiones ni defectos nuevos.
- Del informe solo queda abierta la observación O-5.
