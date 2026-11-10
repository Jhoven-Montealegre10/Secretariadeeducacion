# Inventario de la base SQLite (versión 3) y correspondencia con PostgreSQL

Fuente: esquema real de `semibague.sqlite` (copia en `test/fixtures/sqlite-v3-esquema.sql`, solo estructura) y
los repositorios de la versión 3. 20 tablas, 14 índices propios, 2 disparadores.

## Tablas, relaciones y conversión

| Tabla SQLite | Relaciones (FK) | Restricciones | Tabla PostgreSQL | Conversión |
|---|---|---|---|---|
| `roles` | — | `slug` y `nombre` únicos | `roles` (+`version`) | `sistema` 0/1 → boolean; fechas texto → timestamptz |
| `rol_permisos` | `rol_id → roles` CASCADE | PK (rol_id, permiso) | igual | — |
| `usuarios` | `rol_id → roles` RESTRICT | `email` único `COLLATE NOCASE` | `usuarios` (+`version`) | correo a minúsculas + índice único `lower(email)`; `activo`, `mfa_activo` → boolean; `bloqueado_hasta` ms → timestamptz |
| `codigos_recuperacion` | `usuario_id → usuarios` CASCADE | — | igual | `usado_en` → timestamptz |
| `tokens_recuperacion` | `usuario_id → usuarios` CASCADE | `token_hash` único | igual | `expira_en` ms → timestamptz |
| `sesiones` | (usuario_id sin FK) | — | `sesiones` | **No se migra** (el ID ahora se guarda como HMAC; los usuarios ingresan de nuevo) |
| `auditoria_eventos` | (usuario_id sin FK, a propósito) | `resultado` CHECK; triggers anti UPDATE/DELETE | igual, `id` bigint | `creado_en` exacto al segundo en UTC (la cadena HMAC lo usa); triggers + REVOKE en PG |
| `medios` | `subido_por`, `actualizado_por → usuarios` SET NULL | `archivo` único; CHECK tipo/visibilidad | igual (+`version`) | — |
| `medios_usos` | `medio_id → medios` CASCADE; `entidad_id` polimórfico (sin FK) | PK compuesta; CHECK entidad | igual | `publicado` → boolean; huérfanos verificados al migrar |
| `noticias` | `imagen_id → medios` SET NULL; autores SET NULL | `slug` único; CHECK estado | igual (+`version`) | `fecha_publicacion` texto → date |
| `noticia_fotos` | `noticia_id → noticias`, `medio_id → medios` CASCADE | PK compuesta | igual | — |
| `paginas` | autores SET NULL | `slug` único; CHECK estado | igual (+`version`) | `bloques` texto JSON → jsonb; `sistema` → boolean |
| `sliders` | autores SET NULL | `ubicacion` única | igual (+`version`) | `activo` → boolean |
| `diapositivas` | `slider_id → sliders` CASCADE; `medio_id → medios` SET NULL | — | igual | `activa` → boolean |
| `documentos` | `autor_id → usuarios` SET NULL | `archivo` único; CHECK tipo | igual | `fecha` → date |
| `instituciones` | — | `nombre` único; CHECK zona | igual | — |
| `pqrsd` | — | `radicado` único; CHECK estado | igual | columnas `*_enc` (AES-GCM) se copian tal cual: requieren la MISMA `DATA_ENCRYPTION_KEY` |
| `visitas` | — | CHECK fuente/dispositivo | igual, `id` bigint | `fecha` → date |
| `sales_estadisticas` | — | PK fecha | igual | — |
| `schema_migraciones` | — | — | (TypeORM: `schema_migraciones` propia) | **No se migra** |

Tablas nuevas en PostgreSQL: `limites_tasa` (UNLOGGED, contadores de límites compartidos).

## Índices

| SQLite | PostgreSQL |
|---|---|
| `idx_auditoria_fecha`, `idx_auditoria_usuario` | `ix_auditoria_fecha`, `ix_auditoria_usuario`, + `ix_auditoria_accion` (filtro del panel) |
| `idx_codigos_usuario`, `idx_tokens_usuario`, `idx_usuarios_rol` | equivalentes `ix_*` |
| `idx_diapositivas_slider (slider_id, orden)` | `ix_diapositivas_slider_orden` + `ix_diapositivas_medio` (FK) |
| `idx_documentos_tipo (tipo, anio DESC)` | `ix_documentos_tipo (tipo, anio, fecha)` |
| `idx_medios_tipo`, `idx_medios_usos_entidad` | `ix_medios_tipo_fecha`, `ix_medios_usos_entidad`, + `ix_medios_usos_publicado` (parcial), `ix_medios_miniatura` |
| `idx_noticias_estado_fecha` | `ix_noticias_estado_fecha (estado, fecha_publicacion, id)` + `ix_noticias_imagen`, `ix_noticia_fotos_medio` |
| `idx_sesiones_expira`, `idx_sesiones_usuario` | equivalentes |
| `idx_visitas_fecha`, `idx_visitas_fecha_ruta` | equivalentes |
| (búsquedas `LIKE '%…%'` sin índice) | **GIN `pg_trgm`** en títulos/resúmenes de noticias, título de páginas y nombre de medios |

## Consultas propias de SQLite que se reescribieron

| SQLite | PostgreSQL |
|---|---|
| `datetime('now')`, `date('now','-5 hours')` | `now()`, `(now() AT TIME ZONE 'America/Bogota')::date` |
| `LIKE ? ESCAPE '\'` (insensible a mayúsculas solo en ASCII) | `ILIKE $n ESCAPE '\'` |
| `INSERT OR IGNORE` | `INSERT … ON CONFLICT DO NOTHING` |
| `lastInsertRowid` | `RETURNING id` |
| `json_set`/`json_extract` | `jsonb` y operadores `->`, `->>`, `jsonb_set` |
| Booleanos 0/1 | `boolean` |
| Bucles de `INSERT` por fila (permisos, fotos, usos, orden) | una sentencia con `unnest($1::int[]) WITH ORDINALITY` |
| `SELECT … WHERE id IN (?, ?, …)` armado dinámicamente | `= ANY($1::int[])` |
| Transacción `BEGIN IMMEDIATE` (bloqueo de toda la base) | READ COMMITTED + `SELECT … FOR UPDATE` en las filas editadas + bloqueos consultivos donde hace falta |
| `COUNT(*)` devuelto como número | `bigint` → número (analizador de tipos de `pg`) |
| Fechas de texto `AAAA-MM-DD HH:MM:SS` | `timestamptz` (sesión en UTC); la API mantiene el mismo formato de salida |

## Archivos

| Carpeta | Contenido | Referencia en BD |
|---|---|---|
| `media/` | Imágenes re-codificadas, miniaturas WebP (`-t.webp`), audios | `medios.archivo`, `medios.miniatura` |
| `uploads/` | PDF de normatividad | `documentos.archivo` |

Los nombres son aleatorios (32 hex + extensión) y no cambian en la migración: las referencias se conservan.
