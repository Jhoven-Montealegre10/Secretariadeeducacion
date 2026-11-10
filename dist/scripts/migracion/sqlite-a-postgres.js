"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Migración de datos SQLite → PostgreSQL (una sola transacción: todo o nada).
 *
 *   npm run migrate:from-sqlite -- --sqlite <respaldo.sqlite> --media <carpeta> --uploads <carpeta> \
 *       [--informe informe.json] [--simulacro] [--solo-verificar]
 *
 * Requisitos: el esquema de destino ya migrado (npm run migrate) y vacío de datos de usuario; las
 * variables DB_* y DB_MIGRATION_* del destino; la MISMA DATA_ENCRYPTION_KEY del sistema anterior
 * (sin ella no se pueden leer las PQRSD ni los segundos factores ni verificar la auditoría).
 *
 * Qué hace:
 *  1. Lee el SQLite en modo SOLO LECTURA (el origen nunca se modifica).
 *  2. Reemplaza los datos semilla del destino (roles y páginas del sistema) por los del origen,
 *     conservando TODOS los ID, relaciones, usuarios, permisos, contenidos y referencias a archivos.
 *  3. Convierte tipos: 0/1 → boolean; milisegundos → timestamptz; 'AAAA-MM-DD HH:MM:SS' (UTC) →
 *     timestamptz; JSON en texto → jsonb; correos a minúsculas (aborta si chocan sin mayúsculas).
 *  4. Ajusta las secuencias (identity) al máximo ID de cada tabla.
 *  5. Verifica: conteos, huella SHA-256 de cada tabla (origen normalizado vs. destino), integridad
 *     referencial (también de medios_usos, que no tiene FK), cadena HMAC de auditoría, descifrado de
 *     muestras y existencia + SHA-256 de cada archivo referenciado.
 *  --simulacro: hace todo y verifica, pero revierte (ROLLBACK). --solo-verificar: no escribe nada.
 * Las sesiones NO se migran (el nuevo almacén guarda un HMAC del ID): los usuarios inician sesión de nuevo.
 */
require("reflect-metadata");
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const pg_1 = require("pg");
const configuration_1 = require("../../src/config/configuration");
const crypto_service_1 = require("../../src/infrastructure/security/crypto.service");
const archivos_1 = require("./archivos");
/** Tablas en orden de dependencias, con el tipo de destino de cada columna. */
const TABLES = [
    { name: 'roles', key: ['id'], identity: true, version: true, cols: { id: 'int', slug: 'text', nombre: 'text', descripcion: 'text', sistema: 'bool', creado_en: 'ts', actualizado_en: 'ts' } },
    { name: 'rol_permisos', key: ['rol_id', 'permiso'], cols: { rol_id: 'int', permiso: 'text' } },
    {
        name: 'usuarios',
        key: ['id'],
        identity: true,
        version: true,
        cols: {
            id: 'int',
            email: 'email',
            nombre: 'text',
            password_hash: 'text',
            rol_id: 'int',
            activo: 'bool',
            intentos_fallidos: 'int',
            bloqueado_hasta: 'tsms',
            ultimo_acceso: 'ts',
            mfa_secreto_enc: 'text',
            mfa_activo: 'bool',
            mfa_ultimo_paso: 'int',
            mfa_intentos_fallidos: 'int',
            auth_version: 'int',
            password_actualizada_en: 'ts',
            creado_en: 'ts',
            actualizado_en: 'ts',
        },
    },
    {
        name: 'medios',
        key: ['id'],
        identity: true,
        version: true,
        cols: {
            id: 'int',
            tipo: 'text',
            mime: 'text',
            extension: 'text',
            archivo: 'text',
            miniatura: 'text',
            nombre_visible: 'text',
            nombre_original: 'text',
            tamano: 'int',
            ancho: 'int',
            alto: 'int',
            texto_alternativo: 'text',
            descripcion: 'text',
            visibilidad: 'text',
            subido_por: 'int',
            actualizado_por: 'int',
            creado_en: 'ts',
            actualizado_en: 'ts',
        },
    },
    {
        name: 'noticias',
        key: ['id'],
        identity: true,
        version: true,
        cols: { id: 'int', slug: 'text', titulo: 'text', resumen: 'text', contenido: 'text', categoria: 'text', estado: 'text', fecha_publicacion: 'date', imagen_id: 'int', creado_por: 'int', actualizado_por: 'int', creado_en: 'ts', actualizado_en: 'ts' },
    },
    { name: 'noticia_fotos', key: ['noticia_id', 'medio_id'], cols: { noticia_id: 'int', medio_id: 'int', orden: 'int' } },
    {
        name: 'paginas',
        key: ['id'],
        identity: true,
        version: true,
        cols: { id: 'int', slug: 'text', titulo: 'text', resumen: 'text', bloques: 'json', estado: 'text', sistema: 'bool', creado_por: 'int', actualizado_por: 'int', publicada_en: 'ts', creado_en: 'ts', actualizado_en: 'ts' },
    },
    { name: 'sliders', key: ['id'], identity: true, version: true, cols: { id: 'int', nombre: 'text', ubicacion: 'text', activo: 'bool', creado_por: 'int', actualizado_por: 'int', creado_en: 'ts', actualizado_en: 'ts' } },
    {
        name: 'diapositivas',
        key: ['id'],
        identity: true,
        cols: { id: 'int', slider_id: 'int', medio_id: 'int', titulo: 'text', texto: 'text', enlace: 'text', texto_enlace: 'text', orden: 'int', activa: 'bool', creado_en: 'ts', actualizado_en: 'ts' },
    },
    { name: 'medios_usos', key: ['medio_id', 'entidad', 'entidad_id'], cols: { medio_id: 'int', entidad: 'text', entidad_id: 'int', publicado: 'bool' } },
    {
        name: 'documentos',
        key: ['id'],
        identity: true,
        cols: { id: 'int', tipo: 'text', numero: 'text', anio: 'int', fecha: 'date', asunto: 'text', archivo: 'text', nombre_original: 'text', tamano: 'int', autor_id: 'int', creado_en: 'ts' },
    },
    { name: 'instituciones', key: ['id'], identity: true, cols: { id: 'int', nombre: 'text', zona: 'text' } },
    {
        name: 'pqrsd',
        key: ['id'],
        identity: true,
        cols: {
            id: 'int',
            radicado: 'text',
            tipo: 'text',
            estado: 'text',
            tipo_documento: 'text',
            documento_hash: 'text',
            documento_enc: 'text',
            nombre_enc: 'text',
            email_enc: 'text',
            telefono_enc: 'text',
            asunto_enc: 'text',
            mensaje_enc: 'text',
            respuesta_enc: 'text',
            creado_en: 'ts',
            actualizado_en: 'ts',
        },
    },
    { name: 'tokens_recuperacion', key: ['id'], identity: true, cols: { id: 'int', usuario_id: 'int', token_hash: 'text', expira_en: 'tsms', usado_en: 'ts', creado_en: 'ts' } },
    { name: 'codigos_recuperacion', key: ['id'], identity: true, cols: { id: 'int', usuario_id: 'int', codigo_hash: 'text', usado_en: 'ts', creado_en: 'ts' } },
    {
        name: 'auditoria_eventos',
        key: ['id'],
        identity: true,
        cols: { id: 'int', usuario_id: 'int', usuario_email: 'text', accion: 'text', recurso: 'text', recurso_id: 'text', resultado: 'text', detalle: 'text', ip_hash: 'text', creado_en: 'ts', hash_anterior: 'text', hash: 'text' },
    },
    { name: 'visitas', key: ['id'], identity: true, cols: { id: 'int', fecha: 'date', ruta: 'text', visitante: 'text', fuente: 'text', referente_dominio: 'text', dispositivo: 'text', pais: 'text' } },
    { name: 'sales_estadisticas', key: ['fecha'], cols: { fecha: 'date', sal: 'text' } },
];
/** Tablas del origen que no se migran a propósito. */
const NOT_MIGRATED = {
    sesiones: 'los usuarios inician sesión de nuevo (el nuevo almacén guarda un HMAC del ID de sesión)',
    schema_migraciones: 'el control de versiones del esquema lo lleva TypeORM (schema_migraciones de PostgreSQL)',
};
const TS_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Valor normalizado común a ambos lados para comparar (y para insertar). */
function normalize(kind, v, where) {
    if (v === null || v === undefined)
        return null;
    switch (kind) {
        case 'int':
            return Number(v);
        case 'bool':
            if (v === 0 || v === 1 || v === '0' || v === '1')
                return Number(v) === 1;
            if (typeof v === 'boolean')
                return v;
            throw new Error(`${where}: booleano inválido ${String(v)}`);
        case 'ts': {
            const s = String(v).slice(0, 19).replace('T', ' ');
            if (!TS_RE.test(s))
                throw new Error(`${where}: fecha y hora inválida ${String(v)}`);
            return s;
        }
        case 'tsms': {
            if (typeof v === 'number' || /^\d+$/.test(String(v)))
                return new Date(Number(v)).toISOString().slice(0, 19).replace('T', ' ');
            return normalize('ts', v, where);
        }
        case 'date': {
            const s = String(v).slice(0, 10);
            if (!DATE_RE.test(s))
                throw new Error(`${where}: fecha inválida ${String(v)}`);
            return s;
        }
        case 'json': {
            const parsed = typeof v === 'string' ? JSON.parse(v) : v;
            return JSON.stringify(parsed);
        }
        case 'email':
            return String(v).trim().toLowerCase();
        default:
            return String(v);
    }
}
/** JSON canónico (claves ordenadas) para comparar jsonb sin depender del orden de las claves. */
function canonical(v) {
    if (Array.isArray(v))
        return `[${v.map(canonical).join(',')}]`;
    if (v && typeof v === 'object')
        return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
    return JSON.stringify(v);
}
function fingerprint(rows, cols) {
    const h = node_crypto_1.default.createHash('sha256');
    for (const r of rows)
        h.update(canonical(Object.keys(cols).map((c) => (cols[c] === 'json' && r[c] !== null ? JSON.parse(String(r[c])) : r[c]))) + '\n');
    return h.digest('hex');
}
async function main() {
    const sqlitePath = (0, archivos_1.arg)('sqlite');
    if (!sqlitePath || !node_fs_1.default.existsSync(sqlitePath))
        throw new Error('Indique --sqlite <archivo> (use una COPIA de respaldo, no el archivo en uso).');
    const config = (0, configuration_1.loadConfig)();
    const mediaSrc = (0, archivos_1.arg)('media', node_path_1.default.join(node_path_1.default.dirname(sqlitePath), 'media'));
    const uploadsSrc = (0, archivos_1.arg)('uploads', node_path_1.default.join(node_path_1.default.dirname(sqlitePath), 'uploads'));
    const dryRun = (0, archivos_1.flag)('simulacro');
    const verifyOnly = (0, archivos_1.flag)('solo-verificar');
    const reportFile = (0, archivos_1.arg)('informe');
    const cryptoSvc = new crypto_service_1.CryptoService(config);
    const src = new node_sqlite_1.DatabaseSync(sqlitePath, { readOnly: true });
    const srcTables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name));
    const unknown = [...srcTables].filter((t) => !TABLES.some((x) => x.name === t) && !Object.hasOwn(NOT_MIGRATED, t) && !t.startsWith('sqlite_'));
    if (unknown.length)
        throw new Error(`Tablas del origen sin regla de migración: ${unknown.join(', ')}. Revise el inventario antes de continuar.`);
    // Datos del origen normalizados (una sola lectura, fuente de verdad de la verificación).
    const source = new Map();
    for (const t of TABLES) {
        if (!srcTables.has(t.name)) {
            source.set(t.name, []);
            continue;
        }
        const order = t.key.map((k) => `"${k}"`).join(', ');
        const rows = src.prepare(`SELECT ${Object.keys(t.cols).map((c) => `"${c}"`).join(', ')} FROM "${t.name}" ORDER BY ${order}`).all();
        source.set(t.name, rows.map((r, i) => Object.fromEntries(Object.entries(t.cols).map(([c, k]) => [c, normalize(k, r[c], `${t.name}[${i}].${c}`)]))));
    }
    src.close();
    const emails = (source.get('usuarios') ?? []).map((u) => u.email);
    const dupEmails = emails.filter((e, i) => emails.indexOf(e) !== i);
    if (dupEmails.length)
        throw new Error(`Correos repetidos al ignorar mayúsculas (resuélvalos en el origen): ${dupEmails.join(', ')}`);
    const db = config.db;
    const client = new pg_1.Client({
        host: db.host,
        port: db.port,
        database: db.database,
        user: db.migrationUser,
        password: db.migrationPassword,
        ssl: db.ssl === 'disable' ? false : { rejectUnauthorized: db.ssl === 'verify-full', ...(db.sslCaFile ? { ca: node_fs_1.default.readFileSync(db.sslCaFile, 'utf8') } : {}) },
        options: '-c search_path=portal -c timezone=UTC -c role=semibague_owner',
        application_name: 'semibague-migracion-datos',
    });
    await client.connect();
    const q = async (sql, params = []) => (await client.query(sql, params)).rows;
    const started = Date.now();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        if (!verifyOnly) {
            const pending = await q('SELECT COUNT(*)::int AS n FROM usuarios');
            if (pending[0].n > 0)
                throw new Error('El destino ya tiene usuarios: la migración solo se ejecuta sobre un esquema recién creado (vea el runbook para repetirla).');
            // Bloquea escrituras concurrentes en las tablas de destino mientras dura la carga.
            await client.query(`LOCK TABLE ${TABLES.map((t) => t.name).join(', ')} IN ACCESS EXCLUSIVE MODE`);
            // Datos semilla de las migraciones (roles y páginas del sistema): se reemplazan por los del origen.
            await client.query('DELETE FROM medios_usos');
            await client.query('DELETE FROM paginas');
            await client.query('DELETE FROM rol_permisos');
            await client.query('DELETE FROM roles');
            await client.query('DELETE FROM instituciones');
            for (const t of TABLES) {
                const rows = source.get(t.name) ?? [];
                if (!rows.length)
                    continue;
                const cols = Object.keys(t.cols);
                const casts = cols.map((c) => (t.cols[c] === 'json' ? '::jsonb' : t.cols[c] === 'ts' || t.cols[c] === 'tsms' ? '::timestamptz' : ''));
                // Lotes de 500 filas con parámetros (nunca valores concatenados en el SQL).
                for (let i = 0; i < rows.length; i += 500) {
                    const batch = rows.slice(i, i + 500);
                    const values = [];
                    const tuples = batch.map((r) => `(${cols.map((c, j) => {
                        values.push(r[c]);
                        return `$${values.length}${casts[j]}`;
                    }).join(', ')})`);
                    const overriding = t.identity ? 'OVERRIDING SYSTEM VALUE' : '';
                    await client.query(`INSERT INTO "${t.name}" (${cols.map((c) => `"${c}"`).join(', ')}) ${overriding} VALUES ${tuples.join(', ')}`, values);
                }
            }
            // Secuencias: el próximo ID generado continúa después del máximo migrado.
            for (const t of TABLES.filter((x) => x.identity)) {
                await client.query(`SELECT setval(pg_get_serial_sequence('portal.${t.name}', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM "${t.name}"), 1), (SELECT COUNT(*) > 0 FROM "${t.name}"))`);
            }
            // Archivos: copia verificada al almacenamiento del nuevo sistema.
            (0, archivos_1.copyVerified)(mediaSrc, config.mediaDir);
            (0, archivos_1.copyVerified)(uploadsSrc, config.uploadsDir);
        }
        // ----------------------------------------------------------------- Verificación
        const tables = [];
        for (const t of TABLES) {
            const cols = Object.keys(t.cols);
            const select = cols.map((c) => (t.cols[c] === 'ts' || t.cols[c] === 'tsms' ? `to_char("${c}" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS "${c}"` : t.cols[c] === 'date' ? `to_char("${c}", 'YYYY-MM-DD') AS "${c}"` : t.cols[c] === 'json' ? `"${c}"::text AS "${c}"` : `"${c}"`));
            const dest = (await q(`SELECT ${select.join(', ')} FROM "${t.name}" ORDER BY ${t.key.map((k) => `"${k}"`).join(', ')}`)).map((r) => Object.fromEntries(cols.map((c) => [c, t.cols[c] === 'int' && r[c] !== null ? Number(r[c]) : r[c]])));
            const srcRows = source.get(t.name) ?? [];
            const fs1 = fingerprint(srcRows, t.cols);
            const fs2 = fingerprint(dest, t.cols);
            tables.push({ tabla: t.name, origen: srcRows.length, destino: dest.length, huellaOrigen: fs1, huellaDestino: fs2, coincide: srcRows.length === dest.length && fs1 === fs2 });
        }
        const orphanUsages = await q(`SELECT mu.entidad, mu.entidad_id FROM medios_usos mu
       WHERE (mu.entidad = 'pagina' AND NOT EXISTS (SELECT 1 FROM paginas p WHERE p.id = mu.entidad_id))
          OR (mu.entidad = 'noticia' AND NOT EXISTS (SELECT 1 FROM noticias n WHERE n.id = mu.entidad_id))
          OR (mu.entidad = 'diapositiva' AND NOT EXISTS (SELECT 1 FROM diapositivas d WHERE d.id = mu.entidad_id))`);
        const fkCheck = await q("SELECT conname, convalidated FROM pg_constraint WHERE contype = 'f' AND connamespace = 'portal'::regnamespace");
        // Cadena de auditoría recalculada con la clave del sistema.
        let previous = 'genesis';
        let auditBroken = null;
        for (const r of await q("SELECT id, usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, ip_hash, to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS creado_en, hash_anterior, hash FROM auditoria_eventos ORDER BY id")) {
            const expected = cryptoSvc.auditChainHash(previous, {
                usuarioId: r.usuario_id ?? null,
                usuarioEmail: r.usuario_email ?? null,
                accion: r.accion,
                recurso: r.recurso ?? null,
                recursoId: r.recurso_id ?? null,
                resultado: r.resultado,
                detalle: r.detalle ?? null,
                ipHash: r.ip_hash ?? null,
                creadoEn: r.creado_en,
            });
            if (r.hash_anterior !== previous || expected !== r.hash) {
                auditBroken = Number(r.id);
                break;
            }
            previous = r.hash;
        }
        // La clave de cifrado es la correcta: se descifra una muestra de PQRSD y de secretos MFA.
        const decrypt = { pqrsd: 0, mfa: 0, errores: 0 };
        for (const r of await q('SELECT nombre_enc FROM pqrsd ORDER BY id LIMIT 20')) {
            try {
                cryptoSvc.decrypt(r.nombre_enc);
                decrypt.pqrsd++;
            }
            catch {
                decrypt.errores++;
            }
        }
        for (const r of await q('SELECT mfa_secreto_enc FROM usuarios WHERE mfa_secreto_enc IS NOT NULL ORDER BY id LIMIT 20')) {
            try {
                cryptoSvc.decrypt(r.mfa_secreto_enc);
                decrypt.mfa++;
            }
            catch {
                decrypt.errores++;
            }
        }
        // Archivos referenciados: existen en el destino y su SHA-256 coincide con el origen.
        const referenced = [
            ...(await q('SELECT archivo AS f FROM medios UNION ALL SELECT miniatura FROM medios WHERE miniatura IS NOT NULL')).map((r) => ({ f: r.f, from: mediaSrc, to: config.mediaDir })),
            ...(await q('SELECT archivo AS f FROM documentos')).map((r) => ({ f: r.f, from: uploadsSrc, to: config.uploadsDir })),
        ];
        const missingFiles = [];
        for (const r of referenced) {
            const target = node_path_1.default.join(r.to, r.f);
            const origin = node_path_1.default.join(r.from, r.f);
            if (!node_fs_1.default.existsSync(target) || (node_fs_1.default.existsSync(origin) && (0, archivos_1.sha256File)(origin) !== (0, archivos_1.sha256File)(target)))
                missingFiles.push(r.f);
        }
        const ok = tables.every((t) => t.coincide) && orphanUsages.length === 0 && fkCheck.every((c) => c.convalidated) && auditBroken === null && decrypt.errores === 0 && missingFiles.length === 0;
        const report = {
            fecha: new Date().toISOString(),
            modo: verifyOnly ? 'solo-verificar' : dryRun ? 'simulacro (ROLLBACK)' : 'migración',
            origen: { sqlite: node_path_1.default.resolve(sqlitePath), sha256: (0, archivos_1.sha256File)(sqlitePath) },
            destino: { host: db.host, base: db.database },
            duracionMs: Date.now() - started,
            tablas: tables,
            noMigradas: NOT_MIGRATED,
            integridadReferencial: { clavesForaneasValidadas: fkCheck.length, usosHuerfanos: orphanUsages.length },
            auditoria: { eventos: tables.find((t) => t.tabla === 'auditoria_eventos')?.destino ?? 0, cadenaIntegra: auditBroken === null, idAlterado: auditBroken },
            descifrado: decrypt,
            archivos: { referenciados: referenced.length, faltantesODistintos: missingFiles },
            resultado: ok ? 'OK' : 'FALLÓ',
        };
        if (!ok || dryRun || verifyOnly)
            await client.query('ROLLBACK');
        else
            await client.query('COMMIT');
        if (reportFile)
            node_fs_1.default.writeFileSync(reportFile, JSON.stringify(report, null, 2), { mode: 0o600 });
        console.log(`Resultado: ${report.resultado} (${report.modo}, ${report.duracionMs} ms)`);
        for (const t of tables)
            console.log(`  ${t.coincide ? '✓' : '✗'} ${t.tabla.padEnd(22)} origen=${String(t.origen).padStart(6)} destino=${String(t.destino).padStart(6)}`);
        console.log(`  ${auditBroken === null ? '✓' : '✗'} cadena de auditoría (${report.auditoria.eventos} eventos)`);
        console.log(`  ${decrypt.errores === 0 ? '✓' : '✗'} descifrado con DATA_ENCRYPTION_KEY (pqrsd=${decrypt.pqrsd}, mfa=${decrypt.mfa})`);
        console.log(`  ${missingFiles.length === 0 ? '✓' : '✗'} archivos referenciados (${referenced.length})`);
        console.log(`  ${orphanUsages.length === 0 ? '✓' : '✗'} integridad referencial`);
        if (!ok) {
            if (!dryRun && !verifyOnly)
                console.error('La transacción se revirtió: el destino quedó sin cambios.');
            process.exitCode = 1;
        }
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw err;
    }
    finally {
        await client.end();
    }
}
main().catch((e) => {
    console.error(`Migración cancelada (sin cambios en el destino): ${e.message}`);
    process.exit(1);
});
//# sourceMappingURL=sqlite-a-postgres.js.map