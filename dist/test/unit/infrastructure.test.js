"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Utilidades de infraestructura sin base de datos: SQL seguro, criptografía, caché, estadísticas y errores. */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_test_1 = require("node:test");
const audit_service_1 = require("../../src/application/audit.service");
const stats_service_1 = require("../../src/application/stats.service");
const errors_1 = require("../../src/domain/errors");
const public_cache_service_1 = require("../../src/infrastructure/cache/public-cache.service");
const sql_1 = require("../../src/infrastructure/database/sql");
const crypto_service_1 = require("../../src/infrastructure/security/crypto.service");
const file_storage_1 = require("../../src/infrastructure/storage/file-storage");
const error_filter_1 = require("../../src/presentation/http/errors/error.filter");
(0, node_test_1.describe)('Construcción de SQL', () => {
    (0, node_test_1.test)('Where numera los parámetros y nunca inserta valores en el texto SQL', () => {
        const w = new sql_1.Where().add('a = ?', "x'; DROP TABLE t; --").addIf(false, 'b = ?', 1).addIf(true, 'c ILIKE ? OR d ILIKE ?', '%a%', '%b%');
        strict_1.default.equal(w.sql, 'WHERE (a = $1) AND (c ILIKE $2 OR d ILIKE $3)');
        strict_1.default.deepEqual(w.params, ["x'; DROP TABLE t; --", '%a%', '%b%']);
        strict_1.default.equal(w.next(20), '$4');
        strict_1.default.ok(!w.sql.includes('DROP'));
    });
    (0, node_test_1.test)('Where detecta marcadores y valores que no coinciden', () => {
        strict_1.default.throws(() => new sql_1.Where().add('a = ? AND b = ?', 1), /Faltan valores/);
        strict_1.default.throws(() => new sql_1.Where().add('a = ?', 1, 2), /Sobran valores/);
    });
    (0, node_test_1.test)('orderBy solo acepta columnas de la lista blanca y desempata por id', () => {
        const allowed = { titulo: 'n.titulo' };
        strict_1.default.equal((0, sql_1.orderBy)('-titulo', allowed, 'n.id DESC', 'n.id'), 'ORDER BY n.titulo DESC, n.id DESC');
        strict_1.default.equal((0, sql_1.orderBy)('titulo; DROP TABLE x', allowed, 'n.id DESC'), 'ORDER BY n.id DESC');
        strict_1.default.equal((0, sql_1.orderBy)('constructor', allowed, 'n.id DESC'), 'ORDER BY n.id DESC', 'sin acceso al prototipo');
    });
    (0, node_test_1.test)('likePattern escapa comodines para buscar texto literal', () => {
        strict_1.default.equal((0, sql_1.likePattern)('100%_\\'), '%100\\%\\_\\\\%');
    });
    (0, node_test_1.test)('clampPage aplica límites máximos de paginación', () => {
        strict_1.default.deepEqual((0, sql_1.clampPage)(3, 500), { page: 3, pageSize: 100, offset: 200 });
        strict_1.default.deepEqual((0, sql_1.clampPage)(-1, 0), { page: 1, pageSize: 20, offset: 0 });
        strict_1.default.equal((0, sql_1.clampPage)(10 ** 9, 10).page, 10_000);
    });
    (0, node_test_1.test)('toMs interpreta las marcas de tiempo de la API como UTC', () => {
        strict_1.default.equal((0, sql_1.toMs)('2026-11-10 05:00:00'), Date.parse('2026-11-10T05:00:00Z'));
        strict_1.default.equal((0, sql_1.toMs)(null), null);
        strict_1.default.equal((0, sql_1.toMs)('no es fecha'), null);
    });
});
(0, node_test_1.describe)('Criptografía', () => {
    const svc = new crypto_service_1.CryptoService({ dataKey: node_crypto_1.default.randomBytes(32) });
    (0, node_test_1.test)('AES-256-GCM: cifra con IV aleatorio, descifra y detecta manipulación', () => {
        const a = svc.encrypt('dato personal');
        const b = svc.encrypt('dato personal');
        strict_1.default.notEqual(a, b);
        strict_1.default.equal(svc.decrypt(a), 'dato personal');
        const parts = String(a).split(':');
        parts[3] = Buffer.from('otro contenido').toString('base64');
        strict_1.default.throws(() => svc.decrypt(parts.join(':')));
        strict_1.default.equal(svc.encrypt(''), null);
        strict_1.default.equal(svc.decrypt(null), '');
    });
    (0, node_test_1.test)('otra clave no puede descifrar', () => {
        const other = new crypto_service_1.CryptoService({ dataKey: node_crypto_1.default.randomBytes(32) });
        strict_1.default.throws(() => other.decrypt(svc.encrypt('secreto')));
    });
    (0, node_test_1.test)('índice ciego estable e insensible a mayúsculas; claves separadas por propósito', () => {
        strict_1.default.equal(svc.blindIndex(' ABC123 '), svc.blindIndex('abc123'));
        strict_1.default.notEqual(svc.blindIndex('x'), svc.tokenHash('x'));
    });
    (0, node_test_1.test)('la cadena de auditoría cambia si cambia cualquier campo o el eslabón anterior', () => {
        const row = { usuarioId: 1, usuarioEmail: 'a@example.gov.co', accion: 'login', recurso: 'usuario', recursoId: '1', resultado: 'exito', detalle: '', ipHash: null, creadoEn: '2026-11-10 12:00:00' };
        const h1 = svc.auditChainHash('genesis', row);
        strict_1.default.notEqual(h1, svc.auditChainHash('genesis', { ...row, detalle: 'x' }));
        strict_1.default.notEqual(h1, svc.auditChainHash('otro', row));
        strict_1.default.equal(h1, svc.auditChainHash('genesis', { ...row }));
    });
});
(0, node_test_1.describe)('Auditoría: detalles sin secretos', () => {
    (0, node_test_1.test)('omite detalles con forma de código, token o hash', () => {
        strict_1.default.equal(audit_service_1.AuditService.safeDetail('código 123456'), '[detalle omitido]');
        strict_1.default.equal(audit_service_1.AuditService.safeDetail('token abcdefghijklmnopqrstuvwxyz012345'), '[detalle omitido]');
        strict_1.default.equal(audit_service_1.AuditService.safeDetail('$argon2id$v=19$m=...'), '[detalle omitido]');
        strict_1.default.equal(audit_service_1.AuditService.safeDetail('rol editor → administrador'), 'rol editor → administrador');
        strict_1.default.equal(audit_service_1.AuditService.safeDetail('palabra '.repeat(60)).length, 300, 'texto largo se recorta');
    });
});
(0, node_test_1.describe)('Almacenamiento de archivos', () => {
    (0, node_test_1.test)('solo acepta nombres internos generados (sin rutas)', () => {
        const fsx = new file_storage_1.FileStorage(`${process.env.TMPDIR ?? '/tmp'}/sem-unit-${node_crypto_1.default.randomBytes(4).toString('hex')}`);
        const name = fsx.newName('png');
        strict_1.default.match(name, /^[a-f0-9]{32}\.png$/);
        strict_1.default.ok(fsx.resolve(name));
        for (const bad of ['../package.json', '/etc/passwd', 'a.png', `${'a'.repeat(32)}.png/../x`, `${'a'.repeat(32)}.png\0.js`])
            strict_1.default.equal(fsx.resolve(bad), null, bad);
    });
});
(0, node_test_1.describe)('Estadísticas: clasificación sin datos personales', () => {
    (0, node_test_1.test)('dispositivo deducido del navegador', () => {
        strict_1.default.equal((0, stats_service_1.device)('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile'), 'movil');
        strict_1.default.equal((0, stats_service_1.device)('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
        strict_1.default.equal((0, stats_service_1.device)('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'escritorio');
        strict_1.default.equal((0, stats_service_1.device)('raro'), 'otro');
    });
    (0, node_test_1.test)('fuente: solo el dominio, nunca la URL completa', () => {
        strict_1.default.deepEqual((0, stats_service_1.source)('https://www.google.com/search?q=mi+cedula', 'portal.example.gov.co', false), { fuente: 'buscador', dominio: 'www.google.com' });
        strict_1.default.deepEqual((0, stats_service_1.source)('https://portal.example.gov.co/noticias', 'portal.example.gov.co', false), { fuente: 'interno', dominio: null });
        strict_1.default.deepEqual((0, stats_service_1.source)('', 'x', false), { fuente: 'directo', dominio: null });
        strict_1.default.deepEqual((0, stats_service_1.source)('https://m.facebook.com/x', 'x', false), { fuente: 'redes_sociales', dominio: 'm.facebook.com' });
        strict_1.default.deepEqual((0, stats_service_1.source)('https://www.google.com', 'x', true), { fuente: 'campana', dominio: null });
        strict_1.default.deepEqual((0, stats_service_1.source)('no-es-url', 'x', false), { fuente: 'directo', dominio: null });
    });
});
(0, node_test_1.describe)('Caché pública', () => {
    const fakeDb = { afterCommit: (fn) => void fn(), run: async () => 0 };
    const config = { cache: { ttlSeconds: 60, maxEntries: 2 }, isTest: true, instanceId: 't' };
    (0, node_test_1.test)('comparte cargas simultáneas de la misma clave y respeta el máximo de entradas', async () => {
        const cache = new public_cache_service_1.PublicCache(config, fakeDb);
        let loads = 0;
        const loader = async () => {
            loads++;
            await new Promise((r) => setTimeout(r, 10));
            return 'valor';
        };
        const values = await Promise.all([cache.get('a', loader), cache.get('a', loader), cache.get('a', loader)]);
        strict_1.default.deepEqual(values, ['valor', 'valor', 'valor']);
        strict_1.default.equal(loads, 1, 'una sola consulta para tres peticiones');
        await cache.get('b', loader);
        await cache.get('c', loader);
        strict_1.default.equal(cache.stats().entries, 2, 'expulsa la entrada más antigua');
    });
    (0, node_test_1.test)('invalidar vacía la caché y descarta cargas en curso con datos viejos', async () => {
        const cache = new public_cache_service_1.PublicCache(config, fakeDb);
        let release;
        const slow = cache.get('k', () => new Promise((r) => (release = () => r('viejo'))));
        cache.invalidate();
        release();
        strict_1.default.equal(await slow, 'viejo');
        strict_1.default.equal(await cache.get('k', async () => 'nuevo'), 'nuevo', 'el valor viejo no quedó guardado');
    });
    (0, node_test_1.test)('con TTL 0 la caché queda desactivada', async () => {
        const cache = new public_cache_service_1.PublicCache({ ...config, cache: { ttlSeconds: 0, maxEntries: 10 } }, fakeDb);
        let n = 0;
        await cache.get('x', async () => ++n);
        await cache.get('x', async () => ++n);
        strict_1.default.equal(n, 2);
    });
});
(0, node_test_1.describe)('Normalización de errores', () => {
    (0, node_test_1.test)('errores de base de datos por tiempo o bloqueo → 503 reintentable, sin detalles', () => {
        for (const code of ['57014', '55P03', '40P01']) {
            const e = (0, error_filter_1.normalizeError)(Object.assign(new Error('canceling statement due to statement timeout'), { code }));
            strict_1.default.equal(e.status, 503, code);
            strict_1.default.equal(e.code, 'SERVICE_BUSY');
            strict_1.default.doesNotMatch(e.message, /statement|timeout/);
        }
        strict_1.default.equal((0, error_filter_1.normalizeError)(new Error('timeout exceeded when trying to connect')).status, 503);
    });
    (0, node_test_1.test)('errores desconocidos → 500 genérico; errores de cuerpo → 400/413; AppError se conserva', () => {
        const e = (0, error_filter_1.normalizeError)(new Error('detalle interno /home/x.js:12'));
        strict_1.default.equal(e.status, 500);
        strict_1.default.doesNotMatch(e.message, /interno|\.js/);
        strict_1.default.equal((0, error_filter_1.normalizeError)({ type: 'entity.too.large' }).status, 413);
        strict_1.default.equal((0, error_filter_1.normalizeError)({ type: 'entity.parse.failed' }).status, 400);
        const app = new errors_1.AppError('x', { status: 418, code: 'TEAPOT' });
        strict_1.default.equal((0, error_filter_1.normalizeError)(app), app);
    });
});
//# sourceMappingURL=infrastructure.test.js.map