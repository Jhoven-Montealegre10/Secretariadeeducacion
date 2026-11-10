'use strict';
/** Páginas, noticias y sliders: borradores privados, vista previa, sanitización y conexión con el sitio. */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, createUser, login, call, pngBuffer } = require('./helpers');

let adminAgent, editorAgent, imageId;
before(async () => {
  adminAgent = await login(await createUser({ email: 'admin@example.gov.co', rol: 'administrador' }));
  editorAgent = await login(await createUser({ email: 'editor@example.gov.co' }));
  const up = await editorAgent
    .post('/api/v1/medios')
    .set('X-CSRF-Token', editorAgent.csrf)
    .attach('archivos', await pngBuffer(), 'foto.png');
  imageId = up.body.data[0].id;
});

describe('Páginas', () => {
  test('las páginas institucionales existentes son editables y se siguen mostrando con su diseño', async () => {
    const list = await call(editorAgent, 'get', '/api/v1/paginas');
    const slugs = list.body.data.map((p) => p.slug);
    for (const s of ['secretaria', 'tramites', 'comunidad', 'transparencia', 'contacto']) assert.ok(slugs.includes(s), s);
    const html = (await request(app).get('/transparencia')).text;
    assert.match(html, /id="datos-personales"/);
    assert.match(html, /Ley 1712 de 2014/);
  });

  test('un borrador no es accesible por la ruta pública ni por la API pública; la vista previa exige sesión', async () => {
    const res = await call(editorAgent, 'post', '/api/v1/paginas', {
      titulo: 'Calendario escolar 2027',
      estado: 'borrador',
      bloques: [{ tipo: 'texto', html: '<p>Fechas del calendario.</p>' }],
    });
    assert.equal(res.status, 201);
    const { id, slug } = res.body.data;
    assert.equal(slug, 'calendario-escolar-2027');
    assert.equal((await request(app).get(`/${slug}`)).status, 404);
    assert.equal((await request(app).get(`/api/v1/public/paginas/${slug}`)).status, 404);
    assert.equal((await request(app).get(`/admin/vista-previa/paginas/${id}`).set('Accept', 'application/json')).status, 401);
    const preview = await editorAgent.get(`/admin/vista-previa/paginas/${id}`);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Vista previa privada/);
    assert.equal(preview.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(preview.headers['cache-control'], /no-store/);

    const pub = await call(editorAgent, 'put', `/api/v1/paginas/${id}`, { estado: 'publicada' });
    assert.equal(pub.status, 200);
    assert.match((await request(app).get(`/${slug}`)).text, /Fechas del calendario/);
    assert.equal((await request(app).get(`/api/v1/public/paginas/${slug}`)).status, 200);
  });

  test('el slug es único y no puede usar rutas reservadas', async () => {
    assert.equal((await call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Otra', slug: 'secretaria', bloques: [] })).status, 409);
    assert.equal((await call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Panel', slug: 'admin', bloques: [] })).status, 422);
    assert.equal((await call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Malo', slug: '../etc', bloques: [] })).status, 422);
  });

  test('el HTML de los bloques se sanitiza: sin scripts, eventos ni enlaces javascript:', async () => {
    const bloques = [
      {
        tipo: 'texto',
        html: '<p onclick="alert(1)">Hola<script>alert(document.cookie)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">clic</a><a href="https://www.gov.co/">gov</a></p>',
      },
      { tipo: 'acordeon', items: [{ titulo: 'P', html: '<iframe src="https://malicioso.example"></iframe><strong>ok</strong>' }] },
    ];
    const res = await call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Prueba XSS', estado: 'publicada', bloques });
    assert.equal(res.status, 201);
    const saved = JSON.stringify(res.body.data.bloques);
    assert.doesNotMatch(saved, /script|onclick|onerror|javascript:|iframe|<img/i);
    assert.match(saved, /rel=\\"noopener noreferrer\\"/);
    const html = (await request(app).get('/prueba-xss')).text;
    assert.doesNotMatch(html, /<script>alert|onclick=|javascript:alert/);
  });

  test('enlaces peligrosos en tarjetas y botones se rechazan', async () => {
    const res = await call(editorAgent, 'post', '/api/v1/paginas', {
      titulo: 'Enlaces',
      bloques: [{ tipo: 'boton', texto: 'Clic', enlace: 'javascript:alert(1)' }],
    });
    assert.equal(res.status, 422);
    const res2 = await call(editorAgent, 'post', '/api/v1/paginas', {
      titulo: 'Enlaces dos',
      bloques: [{ tipo: 'tarjetas', items: [{ titulo: 'x', enlace: '//malicioso.example' }] }],
    });
    assert.equal(res2.status, 422);
  });

  test('las páginas del sistema no se eliminan y el editor no elimina definitivamente', async () => {
    const list = await call(adminAgent, 'get', '/api/v1/paginas');
    const sys = list.body.data.find((p) => p.slug === 'secretaria');
    assert.equal((await call(adminAgent, 'delete', `/api/v1/paginas/${sys.id}`)).status, 403);
    const custom = list.body.data.find((p) => p.slug === 'prueba-xss');
    assert.equal((await call(editorAgent, 'delete', `/api/v1/paginas/${custom.id}`)).status, 403);
    assert.equal((await call(adminAgent, 'delete', `/api/v1/paginas/${custom.id}`)).status, 204);
    assert.equal((await request(app).get('/prueba-xss')).status, 404);
  });

  test('una imagen inexistente en un bloque se rechaza', async () => {
    const res = await call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Imagen rota', bloques: [{ tipo: 'imagen', medioId: 99999 }] });
    assert.equal(res.status, 422);
  });
});

describe('Noticias', () => {
  const base = { resumen: 'Resumen de prueba de la noticia', contenido: '<p>Contenido completo de la noticia de prueba.</p>', categoria: 'Cobertura' };

  test('las publicadas aparecen en el inicio de la más reciente a la más antigua; borradores y fechas futuras no', async () => {
    await call(editorAgent, 'post', '/api/v1/noticias', {
      ...base,
      titulo: 'Noticia antigua publicada',
      estado: 'publicada',
      fechaPublicacion: '2026-01-10',
      imagenId: imageId,
    });
    await call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Noticia reciente publicada', estado: 'publicada', fechaPublicacion: '2026-03-15' });
    await call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Borrador secreto', estado: 'borrador', fechaPublicacion: '2026-03-20' });
    await call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Noticia del futuro', estado: 'publicada', fechaPublicacion: '2099-01-01' });
    const home = (await request(app).get('/')).text;
    assert.ok(home.indexOf('Noticia reciente publicada') < home.indexOf('Noticia antigua publicada'));
    assert.doesNotMatch(home, /Borrador secreto|Noticia del futuro/);
    assert.match(home, /\/media\/[a-f0-9]{32}/, 'la imagen principal aparece y ahora es pública por estar en uso publicado');
    const api = await request(app).get('/api/v1/public/noticias');
    const titles = api.body.data.map((n) => n.titulo);
    assert.deepEqual(titles.slice(0, 2), ['Noticia reciente publicada', 'Noticia antigua publicada']);
    assert.ok(!titles.includes('Borrador secreto'));
    assert.equal((await request(app).get('/noticias/borrador-secreto')).status, 404);
    assert.equal((await request(app).get('/api/v1/public/noticias/borrador-secreto')).status, 404);
    assert.doesNotMatch(JSON.stringify(api.body), /"estado"|creadoPor|actualizadoPor/, 'la API pública no expone datos internos');
  });

  test('el contenido de la noticia se sanitiza y la categoría se valida', async () => {
    const res = await call(editorAgent, 'post', '/api/v1/noticias', {
      ...base,
      titulo: 'Con script',
      contenido: '<p>Texto válido de prueba.</p><script>alert(1)</script>',
      fechaPublicacion: '2026-02-01',
    });
    assert.equal(res.status, 201);
    assert.doesNotMatch(res.body.data.contenido, /script/);
    assert.equal(
      (await call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Mala', categoria: 'Inventada', fechaPublicacion: '2026-02-01' })).status,
      422,
    );
  });

  test('borrar una noticia exige news.delete', async () => {
    const res = await call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Para borrar', fechaPublicacion: '2026-02-02' });
    assert.equal((await call(editorAgent, 'delete', `/api/v1/noticias/${res.body.data.id}`)).status, 403);
    assert.equal((await call(adminAgent, 'delete', `/api/v1/noticias/${res.body.data.id}`)).status, 204);
  });
});

describe('Sliders', () => {
  test('crear, agregar, ordenar, desactivar y publicar en su ubicación', async () => {
    const s = await call(editorAgent, 'post', '/api/v1/sliders', { nombre: 'Portada', ubicacion: 'inicio' });
    assert.equal(s.status, 201);
    const id = s.body.data.id;
    assert.equal((await call(editorAgent, 'post', '/api/v1/sliders', { nombre: 'Duplicado', ubicacion: 'inicio' })).status, 409);
    await call(editorAgent, 'post', `/api/v1/sliders/${id}/diapositivas`, { medioId: imageId, titulo: 'Primera' });
    const two = await call(editorAgent, 'post', `/api/v1/sliders/${id}/diapositivas`, {
      medioId: imageId,
      titulo: 'Segunda',
      enlace: '/noticias',
      textoEnlace: 'Ver',
    });
    const [a, b] = two.body.data.diapositivas.map((d) => d.id);
    const re = await call(editorAgent, 'put', `/api/v1/sliders/${id}/orden`, { orden: [b, a] });
    assert.deepEqual(
      re.body.data.diapositivas.map((d) => d.titulo),
      ['Segunda', 'Primera'],
    );
    const pub = await request(app).get('/api/v1/public/sliders/inicio');
    assert.deepEqual(
      pub.body.data.diapositivas.map((d) => d.titulo),
      ['Segunda', 'Primera'],
    );
    assert.match((await request(app).get('/')).text, /data-carousel/);

    await call(editorAgent, 'patch', `/api/v1/sliders/${id}/diapositivas/${b}`, { activa: false });
    assert.deepEqual(
      (await request(app).get('/api/v1/public/sliders/inicio')).body.data.diapositivas.map((d) => d.titulo),
      ['Primera'],
    );
    await call(editorAgent, 'patch', `/api/v1/sliders/${id}`, { activo: false });
    assert.equal((await request(app).get('/api/v1/public/sliders/inicio')).status, 404);
    assert.equal((await call(editorAgent, 'delete', `/api/v1/sliders/${id}/diapositivas/${a}`)).status, 403);
    assert.equal((await call(editorAgent, 'post', `/api/v1/sliders/${id}/diapositivas`, { medioId: imageId, enlace: 'javascript:alert(1)' })).status, 422);
  });

  test('sliders en Sobre nosotros y Contacto', async () => {
    for (const ubicacion of ['pagina:secretaria', 'pagina:contacto']) {
      const s = await call(adminAgent, 'post', '/api/v1/sliders', { nombre: `Slider ${ubicacion}`, ubicacion });
      await call(adminAgent, 'post', `/api/v1/sliders/${s.body.data.id}/diapositivas`, { medioId: imageId, titulo: `Hola ${ubicacion}` });
      const page = (await request(app).get(`/${ubicacion.split(':')[1]}`)).text;
      assert.match(page, new RegExp(`Hola ${ubicacion}`));
    }
    assert.equal((await call(adminAgent, 'post', '/api/v1/sliders', { nombre: 'Malo', ubicacion: 'pagina:../../x' })).status, 422);
  });
});
