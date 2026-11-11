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
| Unitarias (dominio, infraestructura, servicios con dependencias simuladas) | `node:test` | **57** | 0 | 0 |
| Integración contra PostgreSQL real (migraciones, migración de datos, repositorios, transacciones, sesiones, MFA, permisos, API, archivos, concurrencia, contrato OpenAPI, regresiones de QA) | `node:test` + supertest | **115** | 0 | 0 |
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
| QA-18 | Baja | `/admin/paginas/xyz` mostraba un mensaje técnico (hallado en la re-verificación) | «No existe» para identificadores no numéricos | E2E | Ver §5.3 |

\* QA-03 y QA-06 se completaron en una segunda ronda: la observación sobre palabras institucionales y QA-06b.

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

### 5.3 Segunda re-verificación (QA-06b, QA-18 y contraseñas institucionales)

Resultado pendiente de anotar: ver la sección 6.1 del informe independiente.

## 6. Limitaciones y lo que no se ejecutó (no cuenta como aprobado)

| Elemento | Motivo | Cómo cubrirlo |
|---|---|---|
| E2E en Firefox y WebKit | Solo Chromium está instalado en este entorno | Configurados en la CI (`matrix.browser`) |
| Error 500 provocado en el navegador | No se puede provocar de forma segura sin alterar el código | Filtro de errores cubierto por pruebas unitarias; contratos validados en cada respuesta |
| Expiración real a los 30 min y 8 h, desbloqueo a los 15 min | Esperas largas; se simularon manipulando la sesión y el bloqueo en la BD | Prueba manual en preproducción |
| SMTP real y antimalware (ClamAV) | No configurados en el entorno de pruebas | Lista de verificación de `DESPLIEGUE.md` §10 (EICAR) |
| Cookie `__Host-`/`Secure` y HSTS | Solo se activan con `NODE_ENV=production` y HTTPS | Verificación en preproducción |
| Mapa de Google (Contacto) | Sin salida a Internet | Preproducción |
| DAST (OWASP ZAP) y pentest externo | No ejecutados | Pendiente P-11 de `SEGURIDAD-AUDITORIA.md` |
| Respaldo y restauración de PostgreSQL en la infraestructura real | No disponible aquí (sí se probaron respaldo, restauración y migración de SQLite) | `DESPLIEGUE.md` §9 |
| Carga representativa de producción | Ver supuestos en §4 | Repetir en preproducción |

## 7. Conclusión

- Los flujos críticos pasan sin fallos en todas las suites ejecutadas: ingreso con MFA, permisos (también al llamar
  la API directamente), publicación, archivos, migración de datos y concurrencia.
- No quedan defectos críticos ni altos conocidos. Los defectos medios y bajos encontrados se corrigieron y se re-verificaron.
- Quedan las limitaciones de la §6 y los pendientes de `docs/SEGURIDAD-AUDITORIA.md` §6.
- Esto no garantiza que no existan otros defectos: el alcance es el descrito en este informe.
