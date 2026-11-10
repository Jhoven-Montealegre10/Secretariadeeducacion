'use strict';
/** Seguridad de la biblioteca multimedia (ASVS V12). */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, request, createUser, login, pngBuffer, jpegBuffer } = require('./helpers');

let editorAgent, adminAgent;
before(async () => {
  adminAgent = await login(await createUser({ email: 'admin@example.gov.co', rol: 'administrador' }));
  editorAgent = await login(await createUser({ email: 'editor@example.gov.co' }));
});

function uploadReq(agent, files) {
  let req = agent.post('/api/v1/medios').set('X-CSRF-Token', agent.csrf).set('Accept', 'application/json');
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
    assert.ok(!file.body.toString('latin1').includes('GPS-SECRETO-DE-PRUEBA'), 'se eliminaron los metadatos EXIF');
  });

  test('rechaza SVG, HTML disfrazado de imagen, extensión que no coincide y ejecutables', async () => {
    const cases = [
      [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'logo.svg'],
      [Buffer.from('<html><script>alert(document.cookie)</script></html>'), 'foto.jpg'],
      [await pngBuffer(), 'imagen.jpg'],
      [Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'programa.exe'],
      [Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.php.png'],
    ];
    for (const [buf, name] of cases) {
      const res = await uploadReq(editorAgent, [[buf, name]]);
      assert.equal(res.status, 422, `${name} debió rechazarse`);
    }
  });

  test('rechaza archivos que superan el tamaño máximo', async () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(21 * 1024 * 1024)]);
    const res = await uploadReq(editorAgent, [[big, 'enorme.jpg']]);
    assert.equal(res.status, 413);
  });

  test('rechaza una solicitud cuyo tamaño total supera el máximo, antes de leerla', async () => {
    const files = [];
    for (let i = 0; i < 2; i++) files.push([Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(14 * 1024 * 1024)]), `grande${i}.jpg`]);
    const res = await uploadReq(editorAgent, files);
    assert.equal(res.status, 413);
  });

  test('una imagen dañada con cabecera válida se rechaza', async () => {
    const res = await uploadReq(editorAgent, [
      [Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('basura que no es imagen'.repeat(5))]), 'rota.jpg'],
    ]);
    assert.equal(res.status, 422);
  });

  test('los archivos se guardan fuera de la carpeta pública y sin permisos de ejecución', async () => {
    const dir = process.env.MEDIA_DIR;
    const files = fs.readdirSync(dir);
    assert.ok(files.length > 0);
    for (const f of files) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o111, 0, `${f} no debe ser ejecutable`);
    assert.ok(!dir.includes(`${path.sep}public${path.sep}`));
  });
});

describe('Acceso a archivos', () => {
  test('un archivo privado no se sirve al público aunque se conozca su URL', async () => {
    const res = await uploadReq(editorAgent, [[await pngBuffer(), 'privada.png']]);
    const m = res.body.data[0];
    assert.equal((await request(app).get(m.urlPublica)).status, 404);
    assert.equal((await request(app).get(m.url).set('Accept', 'application/json')).status, 401, 'la ruta del panel exige sesión');
    // Al marcarla pública sí se sirve, con cabeceras que impiden su ejecución
    const upd = await editorAgent
      .patch(`/api/v1/medios/${m.id}`)
      .set('X-CSRF-Token', editorAgent.csrf)
      .send({ visibilidad: 'publica', textoAlternativo: 'Logo' });
    assert.equal(upd.status, 200);
    const pub = await request(app).get(m.urlPublica);
    assert.equal(pub.status, 200);
    assert.equal(pub.headers['x-content-type-options'], 'nosniff');
    assert.match(pub.headers['content-security-policy'], /sandbox/);
    assert.equal(pub.headers['content-type'], 'image/png');
  });

  test('rutas manipuladas no salen de la carpeta de archivos', async () => {
    for (const url of ['/media/..%2F..%2Fpackage.json', '/media/../app.js', '/media/%2e%2e%2f.env', '/media/x.png%00.js']) {
      assert.equal((await request(app).get(url)).status, 404, url);
    }
  });

  test('editor no puede eliminar definitivamente; administrador recibe aviso si el archivo está en uso', async () => {
    const res = await uploadReq(editorAgent, [[await pngBuffer(), 'portada.png']]);
    const m = res.body.data[0];
    assert.equal((await editorAgent.delete(`/api/v1/medios/${m.id}`).set('X-CSRF-Token', editorAgent.csrf)).status, 403);
    const news = await editorAgent.post('/api/v1/noticias').set('X-CSRF-Token', editorAgent.csrf).send({
      titulo: 'Noticia con imagen',
      resumen: 'Resumen de la noticia',
      contenido: '<p>Contenido suficientemente largo de la noticia.</p>',
      fechaPublicacion: '2026-01-01',
      imagenId: m.id,
      estado: 'publicada',
    });
    assert.equal(news.status, 201);
    assert.equal((await request(app).get(m.urlPublica)).status, 200, 'una imagen privada usada en contenido publicado sí es pública');
    const warn = await adminAgent.delete(`/api/v1/medios/${m.id}`).set('X-CSRF-Token', adminAgent.csrf);
    assert.equal(warn.status, 409);
    assert.equal(warn.body.error.details[0].entidad, 'noticia');
    assert.equal((await adminAgent.delete(`/api/v1/medios/${m.id}?confirmar=true`).set('X-CSRF-Token', adminAgent.csrf)).status, 204);
    const after = await adminAgent.get(`/api/v1/noticias/${news.body.data.id}`);
    assert.equal(after.body.data.imagenId, null);
  });

  test('reemplazar conserva el ID y exige confirmación si está en uso; no permite cambiar de tipo', async () => {
    const m = (await uploadReq(editorAgent, [[await pngBuffer(), 'banner.png']])).body.data[0];
    const rep = await editorAgent
      .put(`/api/v1/medios/${m.id}/archivo`)
      .set('X-CSRF-Token', editorAgent.csrf)
      .attach('archivo', await jpegBuffer(), 'nuevo.jpg');
    assert.equal(rep.status, 200);
    assert.equal(rep.body.data.id, m.id);
    assert.equal(rep.body.data.mime, 'image/jpeg');
    const audio = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64)]);
    const bad = await editorAgent.put(`/api/v1/medios/${m.id}/archivo`).set('X-CSRF-Token', editorAgent.csrf).attach('archivo', audio, 'sonido.mp3');
    assert.equal(bad.status, 422);
  });

  test('búsqueda y filtros del listado', async () => {
    const res = await editorAgent.get('/api/v1/medios').query({ q: 'banner', tipo: 'imagen', pageSize: 5 });
    assert.equal(res.status, 200);
    assert.ok(res.body.data.every((m) => m.tipo === 'imagen'));
    assert.equal(res.body.meta.pageSize, 5);
    assert.equal((await editorAgent.get('/api/v1/medios').query({ pageSize: 1000 })).status, 422, 'límite máximo de paginación');
    assert.equal(
      (await editorAgent.get('/api/v1/medios').query({ sort: 'archivo; DROP TABLE medios' })).status,
      422,
      'el orden solo acepta valores de la lista blanca',
    );
  });
});
