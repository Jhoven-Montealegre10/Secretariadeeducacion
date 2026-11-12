/** Seguridad de la biblioteca multimedia (ASVS V12) y relación archivo ↔ base de datos. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createHarness, jpegBuffer, pngBuffer, type Agent, type Harness } from '../support/harness';

let h: Harness;
let editorAgent: Agent;
let adminAgent: Agent;
const pub = () => request(h.app.getHttpServer());

before(async () => {
  h = await createHarness();
  adminAgent = await h.login(await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' }));
  editorAgent = await h.login(await h.createUser({ email: 'editor@example.gov.co' }));
});
after(async () => h?.close());

function uploadReq(agent: Agent, files: Array<[Buffer, string]>) {
  let req = agent.post('/api/v1/medios').set('X-CSRF-Token', String(agent.csrf)).set('Accept', 'application/json');
  for (const [buf, name] of files) req = req.attach('archivos', buf, name);
  return req;
}

describe('Carga de archivos', () => {
  test('acepta PNG/JPEG reales, los re-codifica sin metadatos y separa nombre visible de nombre interno', async () => {
    const res = await uploadReq(editorAgent, [
      [await jpegBuffer({ exif: true }), 'foto jornada.jpg'],
      [await pngBuffer(), 'logo.png'],
    ]);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const [jpg] = res.body.data;
    assert.equal(jpg.nombreVisible, 'foto jornada');
    assert.equal(jpg.visibilidad, 'privada');
    assert.doesNotMatch(jpg.urlPublica, /foto|jornada/, 'el nombre interno es aleatorio');
    const file = await editorAgent.get(jpg.url).buffer(true);
    assert.equal(file.status, 200);
    assert.ok(!(file.body as Buffer).toString('latin1').includes('GPS-SECRETO-DE-PRUEBA'), 'se eliminaron los metadatos EXIF');
  });

  test('los archivos viven en disco, no en la base de datos (sin columnas BLOB)', async () => {
    const blobs = await h.db.scalar<number>("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'portal' AND data_type = 'bytea'");
    assert.equal(blobs, 0);
    const rows = await h.db.query<{ archivo: string }>('SELECT archivo FROM medios');
    for (const r of rows) assert.ok(fs.existsSync(path.join(h.config.mediaDir, r.archivo)), `${r.archivo} existe en disco`);
  });

  test('rechaza SVG, HTML disfrazado de imagen, extensión que no coincide y ejecutables', async () => {
    const cases: Array<[Buffer, string]> = [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.svg'],
      [Buffer.from('<html><script>alert(document.cookie)</script></html>'), 'foto.jpg'],
      [await pngBuffer(), 'imagen.jpg'],
      [Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'programa.exe'],
      [Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.php.png'],
    ];
    for (const [buf, name] of cases) assert.equal((await uploadReq(editorAgent, [[buf, name]])).status, 422, `${name} debió rechazarse`);
  });

  test('rechaza archivos que superan el tamaño máximo', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(21 * 1024 * 1024)]);
    assert.equal((await uploadReq(editorAgent, [[big, 'enorme.jpg']])).status, 413);
  });

  test('rechaza una solicitud cuyo tamaño total supera el máximo, antes de leerla', async () => {
    const files: Array<[Buffer, string]> = [0, 1].map((i) => [
      Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(14 * 1024 * 1024)]),
      `grande${i}.jpg`,
    ]);
    assert.equal((await uploadReq(editorAgent, files)).status, 413);
  });

  test('una imagen dañada con cabecera válida se rechaza y no deja archivos huérfanos', async () => {
    const before = fs.readdirSync(h.config.mediaDir).length;
    const res = await uploadReq(editorAgent, [
      [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('basura que no es imagen'.repeat(5))]), 'rota.jpg'],
    ]);
    assert.equal(res.status, 422);
    assert.equal(fs.readdirSync(h.config.mediaDir).length, before);
  });

  test('los archivos se guardan fuera de la carpeta pública y sin permisos de ejecución', async () => {
    const dir = h.config.mediaDir;
    const files = fs.readdirSync(dir);
    assert.ok(files.length > 0);
    for (const f of files) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o111, 0, `${f} no debe ser ejecutable`);
    assert.ok(!dir.includes(`${path.sep}public${path.sep}`));
  });
});

describe('Acceso a archivos', () => {
  test('un archivo privado no se sirve al público aunque se conozca su URL', async () => {
    const m = (await uploadReq(editorAgent, [[await pngBuffer(), 'privada.png']])).body.data[0];
    assert.equal((await pub().get(m.urlPublica)).status, 404);
    assert.equal((await pub().get(m.url).set('Accept', 'application/json')).status, 401, 'la ruta del panel exige sesión');
    const upd = await h.call(editorAgent, 'patch', `/api/v1/medios/${m.id}`, { visibilidad: 'publica', textoAlternativo: 'Logo', version: m.version });
    assert.equal(upd.status, 200);
    const res = await pub().get(m.urlPublica);
    assert.equal(res.status, 200);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.match(String(res.headers['content-security-policy']), /sandbox/);
    assert.equal(res.headers['content-type'], 'image/png');
  });

  test('rutas manipuladas no salen de la carpeta de archivos', async () => {
    for (const url of ['/media/..%2F..%2Fpackage.json', '/media/../app.js', '/media/%2e%2e%2f.env', '/media/x.png%00.js']) {
      assert.equal((await pub().get(url)).status, 404, url);
    }
  });

  test('editor no puede eliminar definitivamente; administrador recibe aviso si el archivo está en uso', async () => {
    const m = (await uploadReq(editorAgent, [[await pngBuffer(), 'portada.png']])).body.data[0];
    assert.equal((await h.call(editorAgent, 'delete', `/api/v1/medios/${m.id}`)).status, 403);
    const news = await h.call(editorAgent, 'post', '/api/v1/noticias', {
      titulo: 'Noticia con imagen',
      resumen: 'Resumen de la noticia',
      contenido: '<p>Contenido suficientemente largo de la noticia.</p>',
      fechaPublicacion: '2026-01-01',
      imagenId: m.id,
      estado: 'publicada',
    });
    assert.equal(news.status, 201);
    assert.equal((await pub().get(m.urlPublica)).status, 200, 'una imagen privada usada en contenido publicado sí es pública');
    const warn = await h.call(adminAgent, 'delete', `/api/v1/medios/${m.id}`);
    assert.equal(warn.status, 409);
    assert.equal(warn.body.error.details[0].entidad, 'noticia');
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/medios/${m.id}?confirmar=true`)).status, 204);
    const afterDelete = await h.call(adminAgent, 'get', `/api/v1/noticias/${news.body.data.id}`);
    assert.equal(afterDelete.body.data.imagenId, null, 'la clave foránea queda en NULL (ON DELETE SET NULL)');
    assert.ok(!fs.existsSync(path.join(h.config.mediaDir, String(String(m.urlPublica).split('/').pop()))), 'el archivo se borra del disco tras el COMMIT');
  });

  test('reemplazar conserva el ID y exige confirmación si está en uso; no permite cambiar de tipo', async () => {
    const m = (await uploadReq(editorAgent, [[await pngBuffer(), 'banner.png']])).body.data[0];
    const rep = await editorAgent
      .put(`/api/v1/medios/${m.id}/archivo`)
      .set('X-CSRF-Token', String(editorAgent.csrf))
      .attach('archivo', await jpegBuffer(), 'nuevo.jpg');
    assert.equal(rep.status, 200, JSON.stringify(rep.body));
    assert.equal(rep.body.data.id, m.id);
    assert.equal(rep.body.data.mime, 'image/jpeg');
    assert.ok(!fs.existsSync(path.join(h.config.mediaDir, String(String(m.urlPublica).split('/').pop()))), 'el archivo anterior se borró');
    const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]);
    const bad = await editorAgent.put(`/api/v1/medios/${m.id}/archivo`).set('X-CSRF-Token', String(editorAgent.csrf)).attach('archivo', audio, 'sonido.mp3');
    assert.equal(bad.status, 422);
  });

  test('búsqueda y filtros del listado', async () => {
    const res = await editorAgent.get('/api/v1/medios').query({ q: 'banner', tipo: 'imagen', pageSize: 5 });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.every((m: { tipo: string }) => m.tipo === 'imagen'));
    assert.equal(res.body.meta.pageSize, 5);
    assert.equal((await editorAgent.get('/api/v1/medios').query({ q: '100%_\\' })).status, 200, 'los comodines de búsqueda se tratan literalmente');
    assert.equal((await editorAgent.get('/api/v1/medios').query({ pageSize: 1000 })).status, 422, 'límite máximo de paginación');
    assert.equal(
      (await editorAgent.get('/api/v1/medios').query({ sort: 'archivo; DROP TABLE medios' })).status,
      422,
      'el orden solo acepta valores de la lista blanca',
    );
  });
});
