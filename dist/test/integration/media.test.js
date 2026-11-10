"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Seguridad de la biblioteca multimedia (ASVS V12) y relación archivo ↔ base de datos. */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_test_1 = require("node:test");
const supertest_1 = __importDefault(require("supertest"));
const harness_1 = require("../support/harness");
let h;
let editorAgent;
let adminAgent;
const pub = () => (0, supertest_1.default)(h.app.getHttpServer());
(0, node_test_1.before)(async () => {
    h = await (0, harness_1.createHarness)();
    adminAgent = await h.login(await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' }));
    editorAgent = await h.login(await h.createUser({ email: 'editor@example.gov.co' }));
});
(0, node_test_1.after)(async () => h?.close());
function uploadReq(agent, files) {
    let req = agent.post('/api/v1/medios').set('X-CSRF-Token', String(agent.csrf)).set('Accept', 'application/json');
    for (const [buf, name] of files)
        req = req.attach('archivos', buf, name);
    return req;
}
(0, node_test_1.describe)('Carga de archivos', () => {
    (0, node_test_1.test)('acepta PNG/JPEG reales, los re-codifica sin metadatos y separa nombre visible de nombre interno', async () => {
        const res = await uploadReq(editorAgent, [
            [await (0, harness_1.jpegBuffer)({ exif: true }), 'foto jornada.jpg'],
            [await (0, harness_1.pngBuffer)(), 'logo.png'],
        ]);
        strict_1.default.equal(res.status, 201, JSON.stringify(res.body));
        const [jpg] = res.body.data;
        strict_1.default.equal(jpg.nombreVisible, 'foto jornada');
        strict_1.default.equal(jpg.visibilidad, 'privada');
        strict_1.default.doesNotMatch(jpg.urlPublica, /foto|jornada/, 'el nombre interno es aleatorio');
        const file = await editorAgent.get(jpg.url).buffer(true);
        strict_1.default.equal(file.status, 200);
        strict_1.default.ok(!file.body.toString('latin1').includes('GPS-SECRETO-DE-PRUEBA'), 'se eliminaron los metadatos EXIF');
    });
    (0, node_test_1.test)('los archivos viven en disco, no en la base de datos (sin columnas BLOB)', async () => {
        const blobs = await h.db.scalar("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'portal' AND data_type = 'bytea'");
        strict_1.default.equal(blobs, 0);
        const rows = await h.db.query('SELECT archivo FROM medios');
        for (const r of rows)
            strict_1.default.ok(node_fs_1.default.existsSync(node_path_1.default.join(h.config.mediaDir, r.archivo)), `${r.archivo} existe en disco`);
    });
    (0, node_test_1.test)('rechaza SVG, HTML disfrazado de imagen, extensión que no coincide y ejecutables', async () => {
        const cases = [
            [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.svg'],
            [Buffer.from('<html><script>alert(document.cookie)</script></html>'), 'foto.jpg'],
            [await (0, harness_1.pngBuffer)(), 'imagen.jpg'],
            [Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'programa.exe'],
            [Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.php.png'],
        ];
        for (const [buf, name] of cases)
            strict_1.default.equal((await uploadReq(editorAgent, [[buf, name]])).status, 422, `${name} debió rechazarse`);
    });
    (0, node_test_1.test)('rechaza archivos que superan el tamaño máximo', async () => {
        const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(21 * 1024 * 1024)]);
        strict_1.default.equal((await uploadReq(editorAgent, [[big, 'enorme.jpg']])).status, 413);
    });
    (0, node_test_1.test)('rechaza una solicitud cuyo tamaño total supera el máximo, antes de leerla', async () => {
        const files = [0, 1].map((i) => [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(14 * 1024 * 1024)]), `grande${i}.jpg`]);
        strict_1.default.equal((await uploadReq(editorAgent, files)).status, 413);
    });
    (0, node_test_1.test)('una imagen dañada con cabecera válida se rechaza y no deja archivos huérfanos', async () => {
        const before = node_fs_1.default.readdirSync(h.config.mediaDir).length;
        const res = await uploadReq(editorAgent, [[Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('basura que no es imagen'.repeat(5))]), 'rota.jpg']]);
        strict_1.default.equal(res.status, 422);
        strict_1.default.equal(node_fs_1.default.readdirSync(h.config.mediaDir).length, before);
    });
    (0, node_test_1.test)('los archivos se guardan fuera de la carpeta pública y sin permisos de ejecución', async () => {
        const dir = h.config.mediaDir;
        const files = node_fs_1.default.readdirSync(dir);
        strict_1.default.ok(files.length > 0);
        for (const f of files)
            strict_1.default.equal(node_fs_1.default.statSync(node_path_1.default.join(dir, f)).mode & 0o111, 0, `${f} no debe ser ejecutable`);
        strict_1.default.ok(!dir.includes(`${node_path_1.default.sep}public${node_path_1.default.sep}`));
    });
});
(0, node_test_1.describe)('Acceso a archivos', () => {
    (0, node_test_1.test)('un archivo privado no se sirve al público aunque se conozca su URL', async () => {
        const m = (await uploadReq(editorAgent, [[await (0, harness_1.pngBuffer)(), 'privada.png']])).body.data[0];
        strict_1.default.equal((await pub().get(m.urlPublica)).status, 404);
        strict_1.default.equal((await pub().get(m.url).set('Accept', 'application/json')).status, 401, 'la ruta del panel exige sesión');
        const upd = await h.call(editorAgent, 'patch', `/api/v1/medios/${m.id}`, { visibilidad: 'publica', textoAlternativo: 'Logo', version: m.version });
        strict_1.default.equal(upd.status, 200);
        const res = await pub().get(m.urlPublica);
        strict_1.default.equal(res.status, 200);
        strict_1.default.equal(res.headers['x-content-type-options'], 'nosniff');
        strict_1.default.match(String(res.headers['content-security-policy']), /sandbox/);
        strict_1.default.equal(res.headers['content-type'], 'image/png');
    });
    (0, node_test_1.test)('rutas manipuladas no salen de la carpeta de archivos', async () => {
        for (const url of ['/media/..%2F..%2Fpackage.json', '/media/../app.js', '/media/%2e%2e%2f.env', '/media/x.png%00.js']) {
            strict_1.default.equal((await pub().get(url)).status, 404, url);
        }
    });
    (0, node_test_1.test)('editor no puede eliminar definitivamente; administrador recibe aviso si el archivo está en uso', async () => {
        const m = (await uploadReq(editorAgent, [[await (0, harness_1.pngBuffer)(), 'portada.png']])).body.data[0];
        strict_1.default.equal((await h.call(editorAgent, 'delete', `/api/v1/medios/${m.id}`)).status, 403);
        const news = await h.call(editorAgent, 'post', '/api/v1/noticias', {
            titulo: 'Noticia con imagen',
            resumen: 'Resumen de la noticia',
            contenido: '<p>Contenido suficientemente largo de la noticia.</p>',
            fechaPublicacion: '2026-01-01',
            imagenId: m.id,
            estado: 'publicada',
        });
        strict_1.default.equal(news.status, 201);
        strict_1.default.equal((await pub().get(m.urlPublica)).status, 200, 'una imagen privada usada en contenido publicado sí es pública');
        const warn = await h.call(adminAgent, 'delete', `/api/v1/medios/${m.id}`);
        strict_1.default.equal(warn.status, 409);
        strict_1.default.equal(warn.body.error.details[0].entidad, 'noticia');
        strict_1.default.equal((await h.call(adminAgent, 'delete', `/api/v1/medios/${m.id}?confirmar=true`)).status, 204);
        const afterDelete = await h.call(adminAgent, 'get', `/api/v1/noticias/${news.body.data.id}`);
        strict_1.default.equal(afterDelete.body.data.imagenId, null, 'la clave foránea queda en NULL (ON DELETE SET NULL)');
        strict_1.default.ok(!node_fs_1.default.existsSync(node_path_1.default.join(h.config.mediaDir, String(String(m.urlPublica).split('/').pop()))), 'el archivo se borra del disco tras el COMMIT');
    });
    (0, node_test_1.test)('reemplazar conserva el ID y exige confirmación si está en uso; no permite cambiar de tipo', async () => {
        const m = (await uploadReq(editorAgent, [[await (0, harness_1.pngBuffer)(), 'banner.png']])).body.data[0];
        const rep = await editorAgent.put(`/api/v1/medios/${m.id}/archivo`).set('X-CSRF-Token', String(editorAgent.csrf)).attach('archivo', await (0, harness_1.jpegBuffer)(), 'nuevo.jpg');
        strict_1.default.equal(rep.status, 200, JSON.stringify(rep.body));
        strict_1.default.equal(rep.body.data.id, m.id);
        strict_1.default.equal(rep.body.data.mime, 'image/jpeg');
        strict_1.default.ok(!node_fs_1.default.existsSync(node_path_1.default.join(h.config.mediaDir, String(String(m.urlPublica).split('/').pop()))), 'el archivo anterior se borró');
        const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]);
        const bad = await editorAgent.put(`/api/v1/medios/${m.id}/archivo`).set('X-CSRF-Token', String(editorAgent.csrf)).attach('archivo', audio, 'sonido.mp3');
        strict_1.default.equal(bad.status, 422);
    });
    (0, node_test_1.test)('búsqueda y filtros del listado', async () => {
        const res = await editorAgent.get('/api/v1/medios').query({ q: 'banner', tipo: 'imagen', pageSize: 5 });
        strict_1.default.equal(res.status, 200);
        strict_1.default.ok(res.body.data.length >= 1);
        strict_1.default.ok(res.body.data.every((m) => m.tipo === 'imagen'));
        strict_1.default.equal(res.body.meta.pageSize, 5);
        strict_1.default.equal((await editorAgent.get('/api/v1/medios').query({ q: '100%_\\' })).status, 200, 'los comodines de búsqueda se tratan literalmente');
        strict_1.default.equal((await editorAgent.get('/api/v1/medios').query({ pageSize: 1000 })).status, 422, 'límite máximo de paginación');
        strict_1.default.equal((await editorAgent.get('/api/v1/medios').query({ sort: 'archivo; DROP TABLE medios' })).status, 422, 'el orden solo acepta valores de la lista blanca');
    });
});
//# sourceMappingURL=media.test.js.map