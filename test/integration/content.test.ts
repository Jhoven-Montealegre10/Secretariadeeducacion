/** Páginas, noticias y sliders: borradores privados, vista previa, sanitización, caché y conflictos de edición. */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createHarness, pngBuffer, type Agent, type Harness } from '../support/harness';

let h: Harness;
let adminAgent: Agent;
let editorAgent: Agent;
let imageId: number;
const pub = () => request(h.app.getHttpServer());

before(async () => {
  h = await createHarness();
  adminAgent = await h.login(await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' }));
  editorAgent = await h.login(await h.createUser({ email: 'editor@example.gov.co' }));
  const up = await editorAgent
    .post('/api/v1/medios')
    .set('X-CSRF-Token', String(editorAgent.csrf))
    .attach('archivos', await pngBuffer(), 'foto.png');
  assert.equal(up.status, 201, JSON.stringify(up.body));
  imageId = up.body.data[0].id;
});
after(async () => h?.close());

describe('Páginas', () => {
  test('las páginas institucionales existentes son editables y se siguen mostrando con su diseño', async () => {
    const list = await h.call(editorAgent, 'get', '/api/v1/paginas');
    const slugs = list.body.data.map((p: { slug: string }) => p.slug);
    for (const s of ['secretaria', 'tramites', 'comunidad', 'transparencia', 'contacto']) assert.ok(slugs.includes(s), s);
    const html = (await pub().get('/transparencia')).text;
    assert.match(html, /id="datos-personales"/);
    assert.match(html, /Ley 1712 de 2014/);
  });

  test('un borrador no es accesible por la ruta pública ni por la API pública; la vista previa exige sesión', async () => {
    const res = await h.call(editorAgent, 'post', '/api/v1/paginas', {
      titulo: 'Calendario escolar 2027',
      estado: 'borrador',
      bloques: [{ tipo: 'texto', html: '<p>Fechas del calendario.</p>' }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const { id, slug } = res.body.data;
    assert.equal(slug, 'calendario-escolar-2027');
    assert.equal((await pub().get(`/${slug}`)).status, 404);
    assert.equal((await pub().get(`/api/v1/public/paginas/${slug}`)).status, 404);
    assert.equal((await pub().get(`/admin/vista-previa/paginas/${id}`).set('Accept', 'application/json')).status, 401);
    const preview = await editorAgent.get(`/admin/vista-previa/paginas/${id}`);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /Vista previa privada/);
    assert.equal(preview.headers['x-robots-tag'], 'noindex, nofollow');
    assert.match(String(preview.headers['cache-control']), /no-store/);

    const published = await h.call(editorAgent, 'put', `/api/v1/paginas/${id}`, { estado: 'publicada' });
    assert.equal(published.status, 200);
    assert.match((await pub().get(`/${slug}`)).text, /Fechas del calendario/);
    assert.equal((await pub().get(`/api/v1/public/paginas/${slug}`)).status, 200);
  });

  test('editar una página publicada invalida la caché pública de inmediato', async () => {
    const created = await h.call(adminAgent, 'post', '/api/v1/paginas', {
      titulo: 'Página en caché',
      estado: 'publicada',
      bloques: [{ tipo: 'texto', html: '<p>Versión uno</p>' }],
    });
    const { id, slug, version } = created.body.data;
    assert.match((await pub().get(`/${slug}`)).text, /Versión uno/); // queda en caché
    await h.call(adminAgent, 'put', `/api/v1/paginas/${id}`, { bloques: [{ tipo: 'texto', html: '<p>Versión dos</p>' }], version });
    assert.match((await pub().get(`/${slug}`)).text, /Versión dos/);
    await h.call(adminAgent, 'put', `/api/v1/paginas/${id}`, { estado: 'borrador' });
    assert.equal((await pub().get(`/${slug}`)).status, 404, 'al despublicar deja de mostrarse aunque estuviera en caché');
  });

  test('dos editores sobre la misma página: el segundo recibe 409 EDIT_CONFLICT y nada se pierde en silencio', async () => {
    const created = await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Edición compartida', bloques: [] });
    const { id, version } = created.body.data;
    const [a, b] = await Promise.all([
      h.call(editorAgent, 'put', `/api/v1/paginas/${id}`, { titulo: 'Cambio de la editora A', version }),
      h.call(adminAgent, 'put', `/api/v1/paginas/${id}`, { titulo: 'Cambio del editor B', version }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const loser = a.status === 409 ? a : b;
    assert.equal(loser.body.error.code, 'EDIT_CONFLICT');
    const current = await h.call(editorAgent, 'get', `/api/v1/paginas/${id}`);
    assert.equal(current.body.data.version, version + 1);
  });

  test('el slug es único y no puede usar rutas reservadas', async () => {
    assert.equal((await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Otra', slug: 'secretaria', bloques: [] })).status, 409);
    assert.equal((await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Panel', slug: 'admin', bloques: [] })).status, 422);
    assert.equal((await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Malo', slug: '../etc', bloques: [] })).status, 422);
  });

  test('creaciones simultáneas con el mismo slug: una gana y la otra recibe 409 (índice único)', async () => {
    const body = { titulo: 'Carrera de slugs', slug: 'carrera-slugs', bloques: [] };
    const results = await Promise.all([1, 2, 3].map(() => h.call(editorAgent, 'post', '/api/v1/paginas', body)));
    const codes = results.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 201).length, 1, JSON.stringify(codes));
    assert.ok(codes.filter((c) => c !== 201).every((c) => c === 409));
  });

  test('el HTML de los bloques se sanitiza: sin scripts, eventos ni enlaces javascript:', async () => {
    const bloques = [
      {
        tipo: 'texto',
        html: '<p onclick="alert(1)">Hola<script>alert(document.cookie)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">clic</a><a href="https://www.gov.co/">gov</a></p>',
      },
      { tipo: 'acordeon', items: [{ titulo: 'P', html: '<iframe src="https://malicioso.example"></iframe><strong>ok</strong>' }] },
    ];
    const res = await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Prueba XSS', estado: 'publicada', bloques });
    assert.equal(res.status, 201);
    const saved = JSON.stringify(res.body.data.bloques);
    assert.doesNotMatch(saved, /script|onclick|onerror|javascript:|iframe|<img/i);
    assert.match(saved, /rel=\\"noopener noreferrer\\"/);
    const html = (await pub().get('/prueba-xss')).text;
    assert.doesNotMatch(html, /<script>alert|onclick=|javascript:alert/);
  });

  test('enlaces peligrosos en tarjetas y botones se rechazan', async () => {
    assert.equal(
      (await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Enlaces', bloques: [{ tipo: 'boton', texto: 'Clic', enlace: 'javascript:alert(1)' }] }))
        .status,
      422,
    );
    assert.equal(
      (
        await h.call(editorAgent, 'post', '/api/v1/paginas', {
          titulo: 'Enlaces dos',
          bloques: [{ tipo: 'tarjetas', items: [{ titulo: 'x', enlace: '//malicioso.example' }] }],
        })
      ).status,
      422,
    );
  });

  test('las páginas del sistema no se eliminan y el editor no elimina definitivamente', async () => {
    const list = await h.call(adminAgent, 'get', '/api/v1/paginas').query({ pageSize: 100 });
    const sys = list.body.data.find((p: { slug: string }) => p.slug === 'secretaria');
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/paginas/${sys.id}`)).status, 403);
    const custom = list.body.data.find((p: { slug: string }) => p.slug === 'prueba-xss');
    assert.equal((await h.call(editorAgent, 'delete', `/api/v1/paginas/${custom.id}`)).status, 403);
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/paginas/${custom.id}`)).status, 204);
    assert.equal((await pub().get('/prueba-xss')).status, 404);
  });

  test('una imagen inexistente en un bloque se rechaza', async () => {
    assert.equal((await h.call(editorAgent, 'post', '/api/v1/paginas', { titulo: 'Imagen rota', bloques: [{ tipo: 'imagen', medioId: 99999 }] })).status, 422);
  });
});

describe('Noticias', () => {
  const base = { resumen: 'Resumen de prueba de la noticia', contenido: '<p>Contenido completo de la noticia de prueba.</p>', categoria: 'Cobertura' };

  test('las publicadas aparecen en el inicio de la más reciente a la más antigua; borradores y fechas futuras no', async () => {
    await h.call(editorAgent, 'post', '/api/v1/noticias', {
      ...base,
      titulo: 'Noticia antigua publicada',
      estado: 'publicada',
      fechaPublicacion: '2026-01-10',
      imagenId: imageId,
    });
    await h.call(editorAgent, 'post', '/api/v1/noticias', {
      ...base,
      titulo: 'Noticia reciente publicada',
      estado: 'publicada',
      fechaPublicacion: '2026-03-15',
    });
    await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Borrador secreto', estado: 'borrador', fechaPublicacion: '2026-03-20' });
    await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Noticia del futuro', estado: 'publicada', fechaPublicacion: '2099-01-01' });
    const home = (await pub().get('/')).text;
    assert.ok(home.indexOf('Noticia reciente publicada') < home.indexOf('Noticia antigua publicada'));
    assert.doesNotMatch(home, /Borrador secreto|Noticia del futuro/);
    assert.match(home, /\/media\/[a-f0-9]{32}/, 'la imagen principal aparece y ahora es pública por estar en uso publicado');
    const api = await pub().get('/api/v1/public/noticias');
    const titles = api.body.data.map((n: { titulo: string }) => n.titulo);
    assert.deepEqual(titles.slice(0, 2), ['Noticia reciente publicada', 'Noticia antigua publicada']);
    assert.ok(!titles.includes('Borrador secreto'));
    assert.equal((await pub().get('/noticias/borrador-secreto')).status, 404);
    assert.equal((await pub().get('/api/v1/public/noticias/borrador-secreto')).status, 404);
    assert.doesNotMatch(JSON.stringify(api.body), /"estado"|creadoPor|actualizadoPor|"version"/, 'la API pública no expone datos internos');
  });

  test('una noticia recién publicada aparece en el inicio aunque la portada estuviera en caché', async () => {
    assert.doesNotMatch((await pub().get('/')).text, /Noticia de último minuto/);
    await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Noticia de último minuto', estado: 'publicada', fechaPublicacion: '2026-04-01' });
    assert.match((await pub().get('/')).text, /Noticia de último minuto/);
  });

  test('el contenido de la noticia se sanitiza y la categoría se valida', async () => {
    const res = await h.call(editorAgent, 'post', '/api/v1/noticias', {
      ...base,
      titulo: 'Con script',
      contenido: '<p>Texto válido de prueba.</p><script>alert(1)</script>',
      fechaPublicacion: '2026-02-01',
    });
    assert.equal(res.status, 201);
    assert.doesNotMatch(res.body.data.contenido, /script/);
    assert.equal(
      (await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Mala', categoria: 'Inventada', fechaPublicacion: '2026-02-01' })).status,
      422,
    );
  });

  test('slugs automáticos únicos para títulos repetidos', async () => {
    const a = await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Título repetido', fechaPublicacion: '2026-02-03' });
    const b = await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Título repetido', fechaPublicacion: '2026-02-03' });
    assert.equal(a.body.data.slug, 'titulo-repetido');
    assert.equal(b.body.data.slug, 'titulo-repetido-2');
  });

  test('borrar una noticia exige news.delete', async () => {
    const res = await h.call(editorAgent, 'post', '/api/v1/noticias', { ...base, titulo: 'Para borrar', fechaPublicacion: '2026-02-02' });
    assert.equal((await h.call(editorAgent, 'delete', `/api/v1/noticias/${res.body.data.id}`)).status, 403);
    assert.equal((await h.call(adminAgent, 'delete', `/api/v1/noticias/${res.body.data.id}`)).status, 204);
  });
});

describe('Sliders', () => {
  test('crear, agregar, ordenar, desactivar y publicar en su ubicación', async () => {
    const s = await h.call(editorAgent, 'post', '/api/v1/sliders', { nombre: 'Portada', ubicacion: 'inicio' });
    assert.equal(s.status, 201);
    const id = s.body.data.id;
    assert.equal((await h.call(editorAgent, 'post', '/api/v1/sliders', { nombre: 'Duplicado', ubicacion: 'inicio' })).status, 409);
    await h.call(editorAgent, 'post', `/api/v1/sliders/${id}/diapositivas`, { medioId: imageId, titulo: 'Primera' });
    const two = await h.call(editorAgent, 'post', `/api/v1/sliders/${id}/diapositivas`, {
      medioId: imageId,
      titulo: 'Segunda',
      enlace: '/noticias',
      textoEnlace: 'Ver',
    });
    const [a, b] = two.body.data.diapositivas.map((d: { id: number }) => d.id);
    const re = await h.call(editorAgent, 'put', `/api/v1/sliders/${id}/orden`, { orden: [b, a] });
    assert.deepEqual(
      re.body.data.diapositivas.map((d: { titulo: string }) => d.titulo),
      ['Segunda', 'Primera'],
    );
    const publicSlider = await pub().get('/api/v1/public/sliders/inicio');
    assert.deepEqual(
      publicSlider.body.data.diapositivas.map((d: { titulo: string }) => d.titulo),
      ['Segunda', 'Primera'],
    );
    assert.match((await pub().get('/')).text, /data-carousel/);

    await h.call(editorAgent, 'patch', `/api/v1/sliders/${id}/diapositivas/${b}`, { activa: false });
    assert.deepEqual(
      (await pub().get('/api/v1/public/sliders/inicio')).body.data.diapositivas.map((d: { titulo: string }) => d.titulo),
      ['Primera'],
    );
    await h.call(editorAgent, 'patch', `/api/v1/sliders/${id}`, { activo: false });
    assert.equal((await pub().get('/api/v1/public/sliders/inicio')).status, 404);
    assert.equal((await h.call(editorAgent, 'delete', `/api/v1/sliders/${id}/diapositivas/${a}`)).status, 403);
    assert.equal((await h.call(editorAgent, 'post', `/api/v1/sliders/${id}/diapositivas`, { medioId: imageId, enlace: 'javascript:alert(1)' })).status, 422);
    assert.equal((await h.call(editorAgent, 'put', `/api/v1/sliders/${id}/orden`, { orden: [a] })).status, 422, 'el orden debe incluir todas las diapositivas');
  });

  test('cambios de diapositivas con una versión antigua del slider: 409 EDIT_CONFLICT', async () => {
    const s = await h.call(adminAgent, 'post', '/api/v1/sliders', { nombre: 'Versionado', ubicacion: 'pagina:tramites' });
    const v = s.body.data.version;
    const added = await h.call(adminAgent, 'post', `/api/v1/sliders/${s.body.data.id}/diapositivas`, { medioId: imageId, titulo: 'Una', version: v });
    assert.equal(added.status, 201);
    assert.equal(added.body.data.version, v + 1);
    const stale = await h.call(editorAgent, 'post', `/api/v1/sliders/${s.body.data.id}/diapositivas`, { medioId: imageId, titulo: 'Otra', version: v });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'EDIT_CONFLICT');
  });

  test('sliders en Sobre nosotros y Contacto', async () => {
    for (const ubicacion of ['pagina:secretaria', 'pagina:contacto']) {
      const s = await h.call(adminAgent, 'post', '/api/v1/sliders', { nombre: `Slider ${ubicacion}`, ubicacion });
      await h.call(adminAgent, 'post', `/api/v1/sliders/${s.body.data.id}/diapositivas`, { medioId: imageId, titulo: `Hola ${ubicacion}` });
      assert.match((await pub().get(`/${ubicacion.split(':')[1]}`)).text, new RegExp(`Hola ${ubicacion}`));
    }
    assert.equal((await h.call(adminAgent, 'post', '/api/v1/sliders', { nombre: 'Malo', ubicacion: 'pagina:../../x' })).status, 422);
  });
});
