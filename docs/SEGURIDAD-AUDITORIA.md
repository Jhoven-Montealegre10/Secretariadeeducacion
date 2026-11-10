# Informe de auditoría de seguridad

Fecha: 2026-11-10 · Alcance: código del repositorio (rama `claude/kind-mendel-0rz0tx`), sitio público, panel, API v1,
base de datos y almacenamiento. Referencias: **OWASP ASVS 4.0.3 nivel 2** (verificación) y **OWASP Top 10 2021** (riesgos).

> Este informe distingue lo **verificado con evidencia ejecutada** de lo **pendiente**. No se afirma seguridad
> absoluta. Las pruebas se ejecutaron en un entorno aislado (bases de datos en memoria y carpetas temporales),
> sin tocar producción ni servicios de terceros.

## 1. Verificaciones ejecutadas

| Verificación | Herramienta / comando | Resultado |
|---|---|---|
| Pruebas automáticas de seguridad y flujos críticos | `npm test` (node:test + supertest), 5 archivos | **71/71 pasan** |
| Prueba de extremo a extremo en navegador real | Playwright/Chromium: login + configuración MFA con QR, códigos de recuperación, multimedia, noticia con imagen publicada en el inicio, edición por bloques, slider, alta de usuario, roles, estadísticas, auditoría, Swagger; editor sin acceso administrativo; 13 vistas en iPhone 13 | **10/10 flujos OK, 0 errores de JavaScript, 0 violaciones de CSP, 0 desbordes en móvil, 0 errores 500** |
| Análisis estático | `npm run lint` (ESLint + `eslint-plugin-security`) | **0 problemas** (excepciones justificadas en el código) |
| Validación de tipos | `npm run typecheck` (TypeScript `checkJs`) | **0 errores** |
| Dependencias | `npm audit` (producción y desarrollo) | **0 vulnerabilidades** |
| Contrato OpenAPI ↔ código | prueba de contrato + `npm run openapi:check` | **48 rutas implementadas = 48 documentadas**; respuestas validadas contra esquemas estrictos en cada prueba |
| Configuración de producción | arranque con `NODE_ENV=production` | Sin secretos o con `APP_URL` http **no arranca**; con migraciones pendientes **no arranca**; HSTS, cookie `__Host-` `Secure` `HttpOnly` `SameSite=Strict`, CSP con `upgrade-insecure-requests`, BD con permisos `0600` |
| Migraciones sobre datos existentes | base de la versión anterior con usuarios, PQRSD, noticias y auditoría | Datos conservados; usuarios mapeados a roles; integridad referencial verificada en cada migración |

## 2. Comprobaciones expresas solicitadas

| Requisito | Evidencia (prueba) | Estado |
|---|---|---|
| Un visitante no accede al dashboard | `authorization.test.js` › "ningún endpoint privado responde a un visitante" (recorre **todas** las rutas privadas) y "el panel redirige al ingreso…" | ✅ Verificado |
| Un editor no ejecuta operaciones administrativas | `authorization.test.js` › matriz del Editor: 16 operaciones administrativas → 403 en la API; E2E: menú sin opciones y `/api/v1/usuarios` → 403 | ✅ Verificado |
| La API no permite saltarse la interfaz | Las pruebas llaman la API directamente (sin interfaz); los servicios vuelven a autorizar sobre cada recurso | ✅ Verificado |
| Borradores y recursos privados no son públicos | `content.test.js` (páginas y noticias en borrador → 404 en sitio y API pública; fechas futuras excluidas); `media.test.js` (archivo privado → 404 aunque se conozca la URL) | ✅ Verificado |
| Login, MFA, recuperación y cierre de sesión | `auth.test.js` (17 pruebas: sin enumeración, bloqueo, TOTP anti-reutilización, códigos de un solo uso, enrolamiento obligatorio, recuperación de un solo uso que no omite MFA, revocación, logout, expiración absoluta) | ✅ Verificado |
| Respuestas y logs sin secretos | `platform.test.js` › "ninguna respuesta… incluye hashes, secretos MFA ni tokens" y "los registros no contienen contraseñas, códigos ni tokens" (captura la consola durante las pruebas) | ✅ Verificado |
| La carga rechaza contenido no permitido | `media.test.js`: SVG con script, HTML disfrazado de JPG, extensión que no coincide, ejecutable, PHP con doble extensión, imagen dañada, tamaño excesivo; EXIF eliminado; archivos no ejecutables | ✅ Verificado |

## 3. Hallazgos

Gravedad: Crítica / Alta / Media / Baja / Informativa. Estado de la nueva verificación entre paréntesis.

### 3.1 Hallazgos de la revisión inicial (ver `01-DIAGNOSTICO-INICIAL.md`)

| ID | Gravedad | Hallazgo | Corrección | Nueva verificación |
|---|---|---|---|---|
| D-01 | Media | El editor podía eliminar definitivamente noticias y documentos | Permisos `*.delete` solo para Administrador, en ruta y servicio | ✅ `authorization.test.js`, `content.test.js`, `media.test.js` |
| D-02 | Alta | Sin segundo factor | TOTP obligatorio para todo el panel; sin acceso hasta completarlo | ✅ `auth.test.js` |
| D-03 | Media | scrypt en lugar de Argon2id | Argon2id (m=64 MiB, t=3, p=1) con migración transparente de hashes antiguos | ✅ "las contraseñas se guardan con Argon2id…" |
| D-04 | Media | No bloqueaba contraseñas comunes | zxcvbn-ts con diccionarios de contraseñas comunes/filtradas + datos del usuario; mínimo 12, máximo 128 | ✅ "rechaza contraseñas comunes o débiles" |
| D-05 | Media | Las sesiones no se revocaban | Versión de autenticación por usuario revalidada en cada petición + borrado de sesiones | ✅ pruebas de revocación |
| D-06 | Baja | Sin duración máxima de sesión | 30 min de inactividad + 8 h absolutas | ✅ "la sesión expira al superar la duración máxima…" |
| D-07 | Baja | Auditoría modificable e incompleta | Tabla solo-inserción (triggers), cadena HMAC, campos recurso/resultado, accesos denegados registrados | ✅ "la bitácora no admite modificaciones y detecta manipulaciones" |
| D-08 | Media | Sin recuperación de acceso | Token aleatorio de 256 bits, hash HMAC, 30 min, un solo uso, sin enumeración, revoca sesiones | ✅ pruebas de recuperación |
| D-09 | Baja | Límites en memoria | Se mantiene (una instancia). Ver P-01 | ⏳ Riesgo pendiente aceptado |
| D-10 | Baja | Sin migraciones | Migrador versionado con suma de verificación y `foreign_key_check` | ✅ migración de base existente |
| D-11 | Info | Mensajes con `<%-` | Se escapan con `escapeHtml`; mensajes generados por Zod | ✅ Revisado |

### 3.2 Hallazgos durante el desarrollo (código generado revisado antes de integrar)

| ID | Gravedad | Ubicación | Hallazgo y evidencia | Corrección | Verificación |
|---|---|---|---|---|---|
| N-01 | **Alta** (pérdida de datos) | `migrations/002_roles_y_usuarios.js` | Reconstruir `usuarios` con claves foráneas activas habría ejecutado `ON DELETE SET NULL` y borrado el autor de noticias y documentos. Detectado en revisión antes de ejecutar. | El migrador desactiva FK durante la migración y ejecuta `PRAGMA foreign_key_check` antes de confirmar | ✅ Migración de base existente: autores conservados |
| N-02 | Media | `views/partials/blocks.ejs` | El HTML de páginas sembradas por migración se imprimía sin pasar por el sanitizador | Sanitización también al leer (defensa en profundidad) | ✅ "el HTML de los bloques se sanitiza…" |
| N-03 | Media (disponibilidad) | `infrastructure/database/query.js` | Ordenar el listado de usuarios devolvía 500 (`ambiguous column name: id`). Encontrado por la prueba E2E | Columna de desempate calificada por tabla | ✅ Nueva prueba que recorre **todos** los órdenes documentados |
| N-04 | Baja | `api/defineRoute.js` | Descarga de archivos del panel respondía 204 vacío (envío asíncrono) | Las rutas de archivo gestionan su respuesta | ✅ `media.test.js` |
| N-05 | Baja | `web/routes.js` | En formularios públicos el CSRF se verificaba antes de leer el cuerpo (rechazo de envíos legítimos) | Lectura del formulario (≤ 20 KB) antes de verificar | ✅ prueba PQRSD |
| N-06 | Baja | `application/auditService.js` | El filtro de secretos por palabras clave ocultaba detalles legítimos ("contraseña incorrecta") | Detección por forma (códigos de 6+ dígitos, tokens largos, hashes) | ✅ Revisado |
| N-08 | Media (DoS) | `middleware/upload.js` | Un solo envío podía cargar en memoria 10 archivos × 20 MB (200 MB). Detectado al revisar la guía de despliegue | Límite del tamaño total de la solicitud (25 MB, `MAX_UPLOAD_REQUEST_MB`) verificado antes de leer el cuerpo; además `client_max_body_size` en Nginx; en producción la app escucha solo en `127.0.0.1` | ✅ "rechaza una solicitud cuyo tamaño total supera el máximo" |
| N-07 | Info | panel | `null` visible en pantallas por nodos vacíos | Utilidad `mount()` que descarta nodos vacíos | ✅ E2E |

**No quedan vulnerabilidades críticas ni altas confirmadas sin resolver.**

## 4. Cobertura OWASP ASVS 4.0.3 (nivel 2)

| Capítulo | Controles implementados | Estado |
|---|---|---|
| V1 Arquitectura | Capas, composición, autorización centralizada en servicios, secretos fuera del código | ✅ |
| V2 Autenticación | Argon2id, 12–128 caracteres, contraseñas comunes bloqueadas, bloqueo por intentos, sin enumeración, TOTP obligatorio, anti-reutilización, códigos de recuperación con hash, reautenticación para cambios de MFA, recuperación de un solo uso | ✅ |
| V3 Sesiones | Cookie HttpOnly/Secure/SameSite=Strict/`__Host-`, rotación al iniciar y al completar MFA, inactividad + máxima absoluta, revocación por eventos, logout en servidor | ✅ |
| V4 Control de acceso | Denegación por defecto, permiso por ruta y por recurso, sin escalada, protección del último administrador, CSRF | ✅ |
| V5 Validación y codificación | Zod estricto (lista blanca de campos), escape en vistas, sanitizador de HTML con lista blanca, enlaces seguros, SQL parametrizado, `ORDER BY` por lista blanca | ✅ |
| V6 Criptografía | AES-256-GCM, HMAC-SHA256, HKDF por propósito, `crypto.randomBytes`, comparación en tiempo constante | ✅ (rotación de claves: P-10) |
| V7 Errores y registros | Errores genéricos con ID, sin trazas; auditoría con usuario/fecha/acción/recurso/resultado, solo inserción e íntegra | ✅ (envío a SIEM: P-14) |
| V8 Protección de datos | PQRSD cifradas, `no-store` en datos privados, minimización en estadísticas | ✅ |
| V9 Comunicaciones | HTTPS obligatorio en producción, HSTS, `upgrade-insecure-requests` | ✅ (TLS lo configura el proxy) |
| V10 Código malicioso | Dependencias auditadas, sin `eval`, CSP sin scripts en línea | ✅ |
| V11 Lógica de negocio | Límites por endpoint, transacciones, confirmaciones de operaciones destructivas | ✅ |
| V12 Archivos | Tipo real por firma, lista blanca, SVG rechazado, re-codificación, límites, nombres aleatorios, fuera de `/public`, `0640`, `nosniff` + CSP `sandbox`, privado por defecto | ✅ (antimalware: P-02) |
| V13 API | Versionado, OpenAPI sincronizado, esquemas estrictos, CORS cerrado, métodos coherentes | ✅ |
| V14 Configuración | Sin debug en producción, migraciones explícitas, cabeceras de seguridad, `.env` fuera del repositorio | ✅ |

## 5. OWASP Top 10 2021

| Riesgo | Mitigación principal |
|---|---|
| A01 Control de acceso roto | Permisos por ruta y recurso, pruebas que recorren todas las rutas privadas, IDOR cubierto (recursos por ID con permiso), CSRF |
| A02 Fallas criptográficas | Argon2id, AES-256-GCM, HMAC, HTTPS/HSTS, claves por entorno |
| A03 Inyección | SQL parametrizado, `LIKE` escapado, orden por lista blanca, sanitización HTML, CSP |
| A04 Diseño inseguro | Reglas en el dominio (último admin, sin escalada), MFA obligatorio, privado por defecto |
| A05 Configuración incorrecta | Arranque de producción falla sin secretos/HTTPS, cabeceras, CORS cerrado, Swagger restringido |
| A06 Componentes vulnerables | `npm audit` = 0; dependencias mínimas y mantenidas |
| A07 Fallas de autenticación | Ver V2/V3 |
| A08 Integridad | Migraciones con suma de verificación, auditoría encadenada, sin deserialización insegura |
| A09 Registro y monitoreo | Auditoría completa; alertas externas pendientes (P-14) |
| A10 SSRF | El sistema **no descarga recursos desde URL** proporcionadas por usuarios; los enlaces solo se renderizan. Si se agrega esa función, debe validar destino y bloquear redes internas |

## 6. Riesgos pendientes y cómo comprobarlos

| ID | Gravedad | Pendiente | Acción recomendada / cómo verificar |
|---|---|---|---|
| P-01 | Baja | Límites de peticiones en memoria (se reinician y no se comparten entre procesos) | Con más de una instancia, usar almacén compartido (Redis). Verificar con pruebas de carga contra preproducción |
| P-02 | Media | Antimalware **no configurado por defecto** | Instalar ClamAV y definir `MALWARE_SCAN_COMMAND=/usr/bin/clamdscan`. Verificar subiendo el archivo de prueba EICAR en preproducción (debe responder 422) |
| P-03 | Media (operación) | Sin SMTP no se envían invitaciones ni recuperaciones en producción | Configurar `SMTP_URL` con el servidor institucional y SPF/DKIM. Verificar solicitando una recuperación |
| P-04 | Info | País solo con cabecera del proxy | Configurar `STATS_GEO_HEADER` si el proxy/CDN la provee |
| P-05 | Baja (privacidad) | Fuentes tipográficas desde Google Fonts | Alojar Montserrat/Work Sans localmente y quitar los dominios de la CSP |
| P-06 | Baja | Swagger UI requiere `style-src 'unsafe-inline'` en sus dos rutas | Aceptado: solo estilos, nunca scripts; la documentación completa exige sesión |
| P-07 | Media (futuro) | Credenciales para integraciones externas no implementadas | Diseño: tabla `clientes_api` con clave aleatoria (hash HMAC), rol técnico de mínimo privilegio, expiración, rotación, auditoría y límites propios; autenticación `Authorization: Bearer` sin cookies |
| P-08 | Info | Solo TOTP (sin WebAuthn/llaves de seguridad) | Evaluar WebAuthn para administradores |
| P-09 | Media (operación) | Copias de seguridad y restauración no probadas sobre la infraestructura real | Seguir `DESPLIEGUE.md` §7 y registrar una prueba de restauración trimestral |
| P-10 | Baja | Sin herramienta de rotación de `DATA_ENCRYPTION_KEY` | El formato cifrado está versionado (`v1:`); una rotación requiere un script de re-cifrado |
| P-11 | Media | No se ejecutó un pentest externo ni un escáner DAST (p. ej. OWASP ZAP) | Ejecutar ZAP en modo autenticado contra **preproducción** antes de publicar y repetir en cada versión mayor |
| P-12 | Info | El editor de texto usa `document.execCommand` (obsoleto pero soportado) | Reemplazar por un editor mantenido cuando se requiera más formato; la seguridad no depende del editor (sanitización en servidor) |
| P-13 | Baja | La clave del HMAC de auditoría deriva de `DATA_ENCRYPTION_KEY`: quien obtenga clave y base podría reescribir la cadena | Exportar la bitácora periódicamente a un sistema externo de solo escritura (SIEM) |
| P-14 | Baja | Sin alertas automáticas (p. ej. ráfagas de `login` fallidos) | Integrar los registros con el monitoreo de la Alcaldía |
| P-15 | Info | Contenido oficial pendiente (misión/visión, directorio, enlaces SAC/Humano) | Cargar desde el panel |
