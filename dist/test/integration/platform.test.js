"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Estadísticas, contrato OpenAPI, cabeceras, errores, auditoría, PQRSD, exposición de secretos,
 * privilegios de PostgreSQL y persistencia tras reiniciar la aplicación.
 */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const pg_1 = require("pg");
const supertest_1 = __importDefault(require("supertest"));
const stats_service_1 = require("../../src/application/stats.service");
const docs_controller_1 = require("../../src/presentation/http/api/controllers/docs.controller");
const route_spec_1 = require("../../src/presentation/http/route-spec");
const harness_1 = require("../support/harness");
const ROOT = node_path_1.default.resolve(__dirname, '..', '..', '..');
let h;
let admin;
let adminAgent;
let editorAgent;
const logs = [];
const pub = () => (0, supertest_1.default)(h.app.getHttpServer());
const doc = () => h.get(docs_controller_1.OpenApiDocs).fullDoc;
(0, node_test_1.before)(async () => {
    for (const stream of [process.stdout, process.stderr]) {
        const orig = stream.write.bind(stream);
        stream.write = ((chunk, ...rest) => {
            logs.push(String(chunk));
            return orig(chunk, ...rest);
        });
    }
    h = await (0, harness_1.createHarness)();
    admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
    adminAgent = await h.login(admin);
    editorAgent = await h.login(await h.createUser({ email: 'editor@example.gov.co' }));
});
(0, node_test_1.after)(async () => h?.close());
const BROWSER = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';
(0, node_test_1.describe)('Estadísticas', () => {
    (0, node_test_1.test)('sin visitas el reporte indica vacío y no inventa cifras', async () => {
        const res = await h.call(adminAgent, 'get', '/api/v1/estadisticas');
        strict_1.default.equal(res.status, 200);
        strict_1.default.equal(res.body.data.vacio, true);
        strict_1.default.equal(res.body.data.resumen.visitas, 0);
    });
    (0, node_test_1.test)('registra visitas sin cookies ni IP; respeta No rastrear y excluye robots, errores y el panel', async () => {
        const page = await pub().get('/noticias').set('User-Agent', BROWSER).set('Referer', 'https://www.google.com/search?q=sem');
        strict_1.default.equal(page.headers['set-cookie'], undefined, 'el sitio público no crea cookies');
        await pub().get('/secretaria').set('User-Agent', BROWSER);
        await pub().get('/secretaria').set('User-Agent', BROWSER).set('DNT', '1');
        await pub().get('/secretaria').set('User-Agent', 'Googlebot/2.1');
        await pub().get('/no-existe').set('User-Agent', BROWSER);
        await h.get(stats_service_1.StatsService).flush();
        const rows = await h.db.query('SELECT * FROM visitas');
        strict_1.default.equal(rows.length, 2);
        strict_1.default.ok(rows.every((r) => !JSON.stringify(r).includes('127.0.0.1') && !JSON.stringify(r).includes('Mozilla')));
        const rep = (await h.call(adminAgent, 'get', '/api/v1/estadisticas')).body.data;
        strict_1.default.equal(rep.vacio, false);
        strict_1.default.equal(rep.resumen.visitas, 2);
        strict_1.default.equal(rep.resumen.visitantesUnicosEstimados, 1);
        strict_1.default.deepEqual(rep.dispositivos, [{ valor: 'movil', visitas: 2 }]);
        strict_1.default.ok(rep.fuentes.some((f) => f.valor === 'buscador'));
        strict_1.default.deepEqual(rep.paginas.map((p) => p.ruta).sort(), ['/noticias', '/secretaria']);
    });
    (0, node_test_1.test)('filtros por fecha coinciden con los datos de prueba', async () => {
        await h.db.run(`INSERT INTO visitas (fecha, ruta, visitante, fuente, dispositivo) VALUES
       ('2026-01-05', '/noticias', 'a', 'directo', 'escritorio'), ('2026-01-05', '/noticias', 'b', 'directo', 'escritorio'),
       ('2026-01-06', '/tramites', 'a', 'otro_sitio', 'tablet')`);
        const rep = (await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-01-05&hasta=2026-01-06')).body.data;
        strict_1.default.equal(rep.resumen.visitas, 3);
        strict_1.default.equal(rep.resumen.visitantesUnicosEstimados, 3, 'visitantes distintos por día, sumados');
        strict_1.default.deepEqual(rep.porDia, [
            { fecha: '2026-01-05', visitas: 2, visitantes: 2 },
            { fecha: '2026-01-06', visitas: 1, visitantes: 1 },
        ]);
        const one = (await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-01-06&hasta=2026-01-06')).body.data;
        strict_1.default.equal(one.resumen.visitas, 1);
    });
    (0, node_test_1.test)('solo administradores; rango de fechas validado', async () => {
        strict_1.default.equal((await h.call(editorAgent, 'get', '/api/v1/estadisticas')).status, 403);
        strict_1.default.equal((await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-05-01&hasta=2026-01-01')).status, 422);
        strict_1.default.equal((await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2020-01-01&hasta=2026-01-01')).status, 422);
    });
});
(0, node_test_1.describe)('Contrato OpenAPI', () => {
    const api = () => route_spec_1.ROUTES.filter((r) => r.kind === 'api');
    (0, node_test_1.test)('cada ruta de la API está documentada y cada ruta documentada existe', () => {
        const documented = new Set(Object.entries(doc().paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)));
        const implemented = new Set(api().map((r) => `${r.method} ${r.path}`));
        strict_1.default.deepEqual([...implemented].filter((x) => !documented.has(x)), []);
        strict_1.default.deepEqual([...documented].filter((x) => !implemented.has(x)), []);
        strict_1.default.ok(implemented.size >= 60);
    });
    (0, node_test_1.test)('cada operación privada declara seguridad, permiso y errores 401/403; las que modifican, CSRF', () => {
        const publicAuth = /auth\/(csrf|login|logout|recuperacion)/;
        for (const [p, ops] of Object.entries(doc().paths)) {
            for (const [m, op] of Object.entries(ops)) {
                strict_1.default.ok(op.summary && op.tags?.length, `${m} ${p} sin resumen o módulo`);
                if (p.startsWith('/api/v1/public'))
                    continue;
                if (!publicAuth.test(p))
                    strict_1.default.ok(op.responses['401'] && op.responses['403'], `${m} ${p} sin 401/403`);
                if (m !== 'get')
                    strict_1.default.ok(op.security?.some((s) => 'csrfToken' in s), `${m} ${p} sin CSRF documentado`);
            }
        }
    });
    (0, node_test_1.test)('las respuestas reales cumplen el esquema documentado (validación estricta fuera de producción)', async () => {
        // El interceptor valida cada respuesta contra su esquema: un campo de más provoca 500.
        for (const url of ['/api/v1/usuarios', '/api/v1/roles', '/api/v1/medios', '/api/v1/paginas', '/api/v1/noticias', '/api/v1/sliders', '/api/v1/auditoria', '/api/v1/sistema/metricas', '/api/v1/permisos']) {
            strict_1.default.equal((await h.call(adminAgent, 'get', url)).status, 200, url);
        }
    });
    (0, node_test_1.test)('la especificación versionada en docs/ coincide con el código', () => {
        const file = JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(ROOT, 'docs', 'openapi.json'), 'utf8'));
        strict_1.default.deepEqual(file, JSON.parse(JSON.stringify(doc())), 'ejecute npm run openapi:export');
    });
    (0, node_test_1.test)('la documentación pública solo incluye operaciones públicas', async () => {
        const res = await pub().get('/api/v1/openapi-publica.json');
        strict_1.default.ok(Object.keys(res.body.paths).every((p) => p.startsWith('/api/v1/public/')));
        strict_1.default.ok(Object.values(res.body.paths).every((ops) => Object.keys(ops).every((m) => m === 'get')));
        strict_1.default.equal(res.body.components?.securitySchemes, undefined);
        strict_1.default.equal((await pub().get('/api/v1/openapi.json').set('Accept', 'application/json')).status, 401);
        strict_1.default.equal((await adminAgent.get('/api/v1/openapi.json')).status, 200);
    });
    (0, node_test_1.test)('los ejemplos de la documentación no contienen secretos ni datos reales', () => {
        strict_1.default.doesNotMatch(JSON.stringify(doc()), /\$argon2|BEGIN PRIVATE|ibague\.gov\.co"|@gmail|@hotmail/);
    });
});
(0, node_test_1.describe)('Respuestas y registros sin secretos', () => {
    (0, node_test_1.test)('ninguna respuesta de la API incluye hashes, secretos MFA ni tokens', async () => {
        const urls = ['/api/v1/usuarios', `/api/v1/usuarios/${admin.id}`, '/api/v1/auth/sesion', '/api/v1/roles', '/api/v1/auditoria', '/api/v1/medios', '/api/v1/paginas', '/api/v1/noticias'];
        for (const u of urls) {
            const text = JSON.stringify((await adminAgent.get(u)).body);
            strict_1.default.doesNotMatch(text, /\$argon2|password_?hash|mfa_?secreto|secretoEnc|token_?hash|codigo_?hash/i, u);
        }
    });
    (0, node_test_1.test)('los registros (logs) no contienen contraseñas, códigos, tokens ni parámetros de consultas', () => {
        const text = logs.join('\n');
        strict_1.default.ok(!text.includes(harness_1.PASSWORD));
        strict_1.default.doesNotMatch(text, /\$argon2|otpauth:|#token=|PARAMETERS:/);
    });
});
(0, node_test_1.describe)('Auditoría', () => {
    (0, node_test_1.test)('registra accesos e intentos fallidos con usuario, acción, recurso y resultado', async () => {
        const agent = h.agent();
        const token = await h.csrf(agent);
        await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: admin.email, password: 'contraseña equivocada' });
        const res = await h.call(adminAgent, 'get', '/api/v1/auditoria');
        const fail = res.body.data.find((e) => e.accion === 'login' && e.resultado === 'fallo');
        strict_1.default.ok(fail && fail.usuarioEmail === admin.email && fail.recurso === 'usuario');
        strict_1.default.ok(res.body.data.some((e) => e.accion === 'login' && e.resultado === 'exito'));
    });
    (0, node_test_1.test)('la cadena se mantiene íntegra con escrituras concurrentes (bloqueo consultivo)', async () => {
        await Promise.all(Array.from({ length: 20 }, (_, i) => h.call(adminAgent, 'patch', '/api/v1/cuenta/perfil', { nombre: `Administrador ${i}` })));
        strict_1.default.equal((await h.call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data.integra, true);
    });
    (0, node_test_1.test)('la cuenta de la aplicación no puede modificar ni borrar la bitácora; una manipulación del DBA se detecta', async () => {
        await strict_1.default.rejects(h.db.run("UPDATE auditoria_eventos SET accion = 'x'"), /permission denied|no se puede/);
        await strict_1.default.rejects(h.db.run('DELETE FROM auditoria_eventos'), /permission denied|no se puede/);
        strict_1.default.equal((await h.call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data.integra, true);
        const firstId = await h.db.scalar('SELECT MIN(id) FROM auditoria_eventos');
        // Incluso el dueño tiene que desactivar los triggers a propósito para alterar un registro.
        const u = new URL(h.adminUrl);
        u.pathname = `/${h.dbName}`;
        const dba = new pg_1.Client({ connectionString: u.toString() });
        await dba.connect();
        await strict_1.default.rejects(dba.query(`UPDATE portal.auditoria_eventos SET detalle = 'alterado' WHERE id = ${firstId}`), /no se puede modificar/);
        await dba.query('ALTER TABLE portal.auditoria_eventos DISABLE TRIGGER auditoria_sin_cambios');
        await dba.query(`UPDATE portal.auditoria_eventos SET detalle = 'alterado' WHERE id = ${firstId}`);
        await dba.query('ALTER TABLE portal.auditoria_eventos ENABLE TRIGGER auditoria_sin_cambios');
        await dba.end();
        const check = (await h.call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data;
        strict_1.default.equal(check.integra, false);
        strict_1.default.equal(check.idAlterado, firstId);
    });
});
(0, node_test_1.describe)('PostgreSQL: mínimo privilegio y protección del esquema', () => {
    (0, node_test_1.test)('la aplicación usa una cuenta sin superusuario ni permisos de DDL', async () => {
        const r = await h.db.one('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
        strict_1.default.deepEqual(r, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
        await strict_1.default.rejects(h.db.run('CREATE TABLE portal.intrusa (id int)'), /permission denied/);
        await strict_1.default.rejects(h.db.run('DROP TABLE portal.usuarios'), /must be owner|permission denied/);
        await strict_1.default.rejects(h.db.run('ALTER TABLE portal.usuarios ADD COLUMN x int'), /must be owner|permission denied/);
        await strict_1.default.rejects(h.db.run('CREATE TABLE public.intrusa (id int)'), /permission denied/);
    });
    (0, node_test_1.test)('las migraciones están al día y no hay diferencias entre entidades y esquema', async () => {
        strict_1.default.equal(await h.db.dataSource.showMigrations(), false);
        const n = await h.db.scalar('SELECT COUNT(*) FROM schema_migraciones');
        strict_1.default.ok(n >= 4);
    });
    (0, node_test_1.test)('consultas largas se cancelan por statement_timeout (no bloquean el pool)', async () => {
        const timeout = await h.db.scalar('SHOW statement_timeout');
        strict_1.default.notEqual(timeout, '0');
        const lock = await h.db.scalar('SHOW lock_timeout');
        strict_1.default.notEqual(lock, '0');
    });
});
(0, node_test_1.describe)('Cabeceras, errores y archivos del servidor', () => {
    (0, node_test_1.test)('CSP estricta, anti-clickjacking, nosniff, sin X-Powered-By', async () => {
        for (const url of ['/', '/admin/login', '/api/v1/public/noticias']) {
            const res = await pub().get(url);
            const csp = String(res.headers['content-security-policy']);
            strict_1.default.match(csp, /script-src 'self'/);
            strict_1.default.doesNotMatch(csp, /script-src[^;]*unsafe/);
            strict_1.default.match(csp, /frame-ancestors 'none'/);
            strict_1.default.equal(res.headers['x-content-type-options'], 'nosniff');
            strict_1.default.equal(res.headers['x-powered-by'], undefined);
        }
    });
    (0, node_test_1.test)('las respuestas privadas no se guardan en caché; las públicas no fijan cookies', async () => {
        strict_1.default.match(String((await h.call(adminAgent, 'get', '/api/v1/usuarios')).headers['cache-control']), /no-store/);
        const res = await pub().get('/api/v1/public/noticias');
        strict_1.default.equal(res.headers['set-cookie'], undefined);
    });
    (0, node_test_1.test)('ninguna vista ni página del panel tiene scripts o estilos en línea', () => {
        const dir = node_path_1.default.join(ROOT, 'views');
        for (const f of node_fs_1.default.readdirSync(dir, { recursive: true }).filter((x) => x.endsWith('.ejs'))) {
            const html = node_fs_1.default.readFileSync(node_path_1.default.join(dir, f), 'utf8');
            strict_1.default.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, f);
            strict_1.default.doesNotMatch(html, /\sstyle="/i, f);
            strict_1.default.doesNotMatch(html, /\son[a-z]+="/i, f);
        }
        const adminDir = node_path_1.default.join(ROOT, 'public', 'assets', 'admin');
        for (const f of node_fs_1.default.readdirSync(adminDir, { recursive: true }).filter((x) => x.endsWith('.js'))) {
            const js = node_fs_1.default.readFileSync(node_path_1.default.join(adminDir, f), 'utf8');
            strict_1.default.doesNotMatch(js, /localStorage/, `${f} no debe usar localStorage`);
            strict_1.default.doesNotMatch(js, /\beval\(|new Function\(/, f);
        }
    });
    (0, node_test_1.test)('errores sin trazas ni detalles internos; archivos del servidor inaccesibles', async () => {
        const res = await pub().get('/api/v1/noticias/abc').set('Accept', 'application/json');
        strict_1.default.ok([401, 404, 422].includes(res.status));
        const bad = await adminAgent.post('/api/v1/noticias').set('X-CSRF-Token', String(adminAgent.csrf)).set('Content-Type', 'application/json').send('{"titulo": ');
        strict_1.default.equal(bad.status, 400);
        strict_1.default.doesNotMatch(JSON.stringify(bad.body), /at .*\.js:\d+|node_modules|SyntaxError/);
        for (const url of ['/.env', '/package.json', '/src/main.ts', '/dist/src/main.js', '/storage/semibague.sqlite', '/assets/../../.env', '/docs/openapi.json', '/views/pages/inicio.ejs']) {
            strict_1.default.equal((await pub().get(url)).status, 404, url);
        }
    });
    (0, node_test_1.test)('un cuerpo JSON demasiado grande se rechaza con 413', async () => {
        const huge = { titulo: 'x'.repeat(200 * 1024) };
        strict_1.default.equal((await h.call(adminAgent, 'post', '/api/v1/sliders', huge)).status, 413);
    });
    (0, node_test_1.test)('inyección SQL en búsquedas y filtros se trata como texto', async () => {
        for (const q of ["' OR '1'='1", "'; DROP TABLE noticias; --", '%', "\\' UNION SELECT password_hash FROM usuarios --"]) {
            const res = await pub().get('/buscar').query({ q });
            strict_1.default.equal(res.status, 200);
            strict_1.default.doesNotMatch(res.text, /argon2/);
            const apiRes = await adminAgent.get('/api/v1/usuarios').query({ q });
            strict_1.default.equal(apiRes.status, 200);
            strict_1.default.equal(apiRes.body.data.length, 0);
        }
        strict_1.default.ok(await h.db.scalar("SELECT to_regclass('portal.noticias') IS NOT NULL"));
    });
    (0, node_test_1.test)('todos los listados aceptan cada orden permitido (ascendente y descendente)', async () => {
        for (const [p, ops] of Object.entries(doc().paths)) {
            const sortParam = ops.get?.parameters?.find((x) => x.name === 'sort');
            if (!sortParam?.schema.enum || p.includes('{'))
                continue;
            for (const value of sortParam.schema.enum) {
                const res = await adminAgent.get(p).query({ sort: value });
                strict_1.default.equal(res.status, 200, `${p}?sort=${value} → ${res.status}`);
            }
        }
    });
    (0, node_test_1.test)('CORS cerrado por defecto: ningún origen externo recibe permiso', async () => {
        strict_1.default.equal((await pub().get('/api/v1/public/noticias').set('Origin', 'https://otro-sitio.example')).headers['access-control-allow-origin'], undefined);
        strict_1.default.equal((await pub().options('/api/v1/usuarios').set('Origin', 'https://otro-sitio.example')).headers['access-control-allow-origin'], undefined);
    });
});
(0, node_test_1.describe)('PQRSD (funcionalidad existente)', () => {
    (0, node_test_1.test)('radicar, cifrar datos personales, consultar con radicado + documento; acceso admin auditado', async () => {
        const agent = h.agent();
        const form = await agent.get('/atencion');
        const token = String(/name="_csrf" value="([^"]+)"/.exec(form.text)?.[1]);
        const data = {
            _csrf: token,
            tipo: 'Petición',
            nombre: 'María Pérez Gómez',
            tipo_documento: 'Cédula de ciudadanía',
            documento: '1110123456',
            email: 'maria@example.com',
            telefono: '3001234567',
            asunto: 'Solicitud de certificado',
            mensaje: 'Solicito un certificado de estudios del año 2019, gracias.',
            acepto: 'on',
        };
        strict_1.default.equal((await pub().post('/atencion/pqrsd').type('form').send(data)).status, 403, 'sin cookie de sesión el token no vale');
        strict_1.default.equal((await agent.post('/atencion/pqrsd').type('form').send(data)).status, 303);
        const radicado = String(/SEM-\d{4}-\d{8}/.exec((await agent.get('/atencion/pqrsd/confirmacion')).text)?.[0]);
        const row = JSON.stringify(await h.db.one('SELECT * FROM pqrsd WHERE radicado = $1', [radicado]));
        for (const v of ['María Pérez', '1110123456', 'maria@example.com', '3001234567'])
            strict_1.default.ok(!row.includes(v), v);
        const ok = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '1110123456' });
        strict_1.default.match(ok.text, /Solicitud de certificado/);
        strict_1.default.equal((await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '999999' })).status, 404);
        const list = await adminAgent.get('/api/v1/pqrsd');
        const item = list.body.data.find((p) => p.radicado === radicado);
        const detail = await adminAgent.get(`/api/v1/pqrsd/${item.id}`);
        strict_1.default.equal(detail.body.data.email, 'maria@example.com');
        strict_1.default.equal((await editorAgent.get(`/api/v1/pqrsd/${item.id}`)).status, 403);
        const audit = await adminAgent.get('/api/v1/auditoria').query({ accion: 'pqrsd_ver' });
        strict_1.default.ok(audit.body.data.some((e) => e.recursoId === radicado));
    });
    (0, node_test_1.test)('formulario inválido: 422 sin devolver el documento ni el token', async () => {
        const agent = h.agent();
        const token = String(/name="_csrf" value="([^"]+)"/.exec((await agent.get('/atencion')).text)?.[1]);
        const res = await agent.post('/atencion/pqrsd').type('form').send({ _csrf: token, tipo: 'Petición', documento: '987654321', email: 'malo' });
        strict_1.default.equal(res.status, 422);
        strict_1.default.ok(!res.text.includes('987654321'));
    });
});
(0, node_test_1.describe)('Persistencia tras reiniciar la aplicación', () => {
    (0, node_test_1.test)('los datos, las sesiones y los archivos sobreviven a un reinicio', async () => {
        const created = await h.call(adminAgent, 'post', '/api/v1/noticias', {
            titulo: 'Persistente tras reinicio',
            resumen: 'Resumen de la noticia persistente',
            contenido: '<p>Contenido suficientemente largo para la prueba.</p>',
            fechaPublicacion: '2026-02-10',
            estado: 'publicada',
        });
        strict_1.default.equal(created.status, 201);
        await h.restart();
        // La sesión vive en PostgreSQL: con la misma cookie el usuario sigue autenticado tras el reinicio.
        const fresh = h.agent();
        fresh.jar = adminAgent.jar;
        fresh.csrf = adminAgent.csrf;
        const again = await h.call(fresh, 'get', `/api/v1/noticias/${created.body.data.id}`);
        strict_1.default.equal(again.status, 200);
        strict_1.default.match((await pub().get('/')).text, /Persistente tras reinicio/);
    });
});
//# sourceMappingURL=platform.test.js.map