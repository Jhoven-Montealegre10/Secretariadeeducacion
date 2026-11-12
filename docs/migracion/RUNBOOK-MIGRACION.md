# Runbook: migración a PostgreSQL, corte en producción y reversión

**Estrategia:** corte en una **ventana controlada** con el sistema anterior en **solo lectura**. Con el volumen del
portal (decenas a miles de filas, archivos en disco) la carga completa y su verificación tardan segundos, por lo que
no hace falta sincronización continua. Así no hay escrituras perdidas: nadie puede escribir en el origen durante la copia.

Reglas: no se borra la base SQLite ni los archivos de origen hasta cumplir la validación y la retención de respaldos;
no se usa sincronización automática del esquema; las credenciales de migración son distintas de las de la aplicación.

## 0. Preparación (días antes)

1. Aprovisionar PostgreSQL (ver `docs/DESPLIEGUE.md` §4): roles `semibague_owner`, `semibague_migrator`, `semibague_app`,
   TLS con certificado, `pg_hba` restringido, sin puerto público.
2. Desplegar la versión 4 en el servidor nuevo **sin abrirla al público**; `npm run migrate` crea el esquema.
3. **Ensayo en preproducción** con una copia del SQLite (anonimizada si se usa fuera de producción):
   `npm run backup:sqlite …` → `npm run migrate:from-sqlite -- … --simulacro` → corregir lo que reporte.
4. Confirmar que se tiene la `DATA_ENCRYPTION_KEY` del sistema anterior (sin ella la verificación falla y nada se escribe).
5. Anunciar la ventana a los editores (estimado: 30 minutos, incluida la verificación funcional).

## 1. Ventana de corte

| Paso | Acción | Comprobación |
|---|---|---|
| 1 | Poner el sitio anterior en **mantenimiento de escritura**: detener el servicio v3 (o bloquear `POST/PUT/PATCH/DELETE` en el proxy). El sitio público puede seguir en solo lectura desde v3. | `curl -X POST …/api/v1/auth/login` → 503/405 |
| 2 | Respaldo verificado: `npm run backup:sqlite -- --sqlite /var/lib/semibague/semibague.sqlite --media … --uploads … --destino /respaldos` | Mensaje `✓` y `manifiesto.json` con `filasCoinciden: true` |
| 3 | Copiar el respaldo al servidor nuevo (cifrado) y comprobar el SHA-256 del manifiesto. | `sha256sum` coincide |
| 4 | Simulacro final: `npm run migrate:from-sqlite -- --sqlite <respaldo>/semibague.sqlite --media <respaldo>/media --uploads <respaldo>/uploads --simulacro` | `Resultado: OK` (el simulacro copia los archivos al destino para verificarlos; son copias idénticas y se reutilizan en el paso 5) |
| 5 | Migración: el mismo comando sin `--simulacro` y con `--informe /respaldos/informe-migracion.json` | `Resultado: OK`; informe guardado |
| 6 | Arrancar v4 (`systemctl start semibague`); `GET /health/ready` | `{"estado":"ok"}` |
| 7 | Verificación funcional (lista abajo) con un administrador real y un editor. | Todo ✓ |
| 8 | Cambiar el proxy/DNS al servidor nuevo y abrir escrituras. Registrar la **hora de apertura**. | Panel operativo |

**Verificación funcional (paso 7):** ingresar con contraseña y segundo factor de siempre; abrir una PQRSD (se descifra);
Auditoría → Verificar integridad; abrir una imagen y un PDF; ver una noticia y una página en el sitio; ver un borrador en
vista previa; estadísticas del último mes; crear y eliminar un borrador de prueba.

La herramienta ya verifica automáticamente: conteos y huella SHA-256 de cada tabla, claves foráneas, usos huérfanos,
cadena HMAC de la auditoría, descifrado de muestras, existencia y hash de cada archivo, y ajusta las secuencias.

## 2. Reversión

**Antes de abrir escrituras (pasos 1–7):** basta con no cambiar el proxy y volver a iniciar v3. El origen nunca se
modificó (se lee en modo solo lectura) y no hubo escrituras nuevas. Si la migración falló, la transacción se revirtió
sola; se puede vaciar el destino (`DROP SCHEMA portal CASCADE` + `npm run migrate`) y repetir.

**Después de abrir escrituras (paso 8):** las escrituras nuevas solo existen en PostgreSQL. Decidir dentro de las
primeras 24–72 h:

1. Volver a poner el sistema en solo lectura (proxy) y anotar la hora.
2. Exportar lo escrito desde la apertura: `auditoria_eventos WHERE creado_en >= '<hora de apertura>'` indica qué se
   creó o modificó (acción, recurso, id). Respaldar PostgreSQL: `pg_dump -Fc`.
3. Volver a v3 con su SQLite y sus archivos (intactos).
4. Reaplicar en v3, desde el panel, los cambios listados en el paso 2 (son de contenido: noticias, páginas, archivos,
   PQRSD radicadas). Las PQRSD nuevas se reingresan con su mismo radicado consultándolas en el respaldo de PG.
5. Documentar la causa y planificar un nuevo corte.

Pasado el periodo de estabilización (sugerido: 30 días sin incidentes) se descarta la reversión y el SQLite se conserva
solo como respaldo según la política de retención (sugerido: 1 año, cifrado, fuera del servidor).

## 3. Repetir la migración

La herramienta se niega a escribir en un destino con usuarios. Para repetir en preproducción:
`DROP SCHEMA portal CASCADE; CREATE SCHEMA portal AUTHORIZATION semibague_owner; GRANT USAGE ON SCHEMA portal TO semibague_app;`
y luego `npm run migrate` y la herramienta. Nunca haga esto en producción después de abrir escrituras.

## 4. Verificación posterior

`npm run migrate:from-sqlite -- --sqlite <respaldo> --solo-verificar` compara origen y destino sin escribir (útil
justo después del corte; luego dará diferencias esperadas porque el destino recibe cambios nuevos).
