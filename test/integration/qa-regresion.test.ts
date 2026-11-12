/**
 * Regresiones de los defectos encontrados por la QA independiente (docs/QA-INFORME.md §5).
 * Cada prueba reproduce el caso reportado y verifica el comportamiento esperado.
 */
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { createHarness, PASSWORD, pngBuffer, type Agent, type Harness, type TestUser } from '../support/harness';

let h: Harness;
let admin: TestUser;
let adminAgent: Agent;
const pub = () => request(h.app.getHttpServer());
const noticia = (extra: Record<string, unknown> = {}) => ({
  titulo: 'Noticia de regresión',
  resumen: 'Resumen de la noticia de regresión',
  contenido: '<p>Contenido suficientemente largo de la noticia de regresión.</p>',
  categoria: 'Institucional',
  fechaPublicacion: '2026-01-15',
  ...extra,
});

before(async () => {
  h = await createHarness();
  admin = await h.createUser({ email: 'admin@example.gov.co', nombre: 'Ana Administradora', rol: 'administrador' });
  adminAgent = await h.login(admin);
});
after(async () => h?.close());

describe('QA-01: fechas inexistentes', () => {
  test('2026-02-30, 2026-04-31 y 2025-02-29 → 422 (no 500) en noticias, estadísticas, auditoría y documentos', async () => {
    for (const f of ['2026-02-30', '2026-04-31', '2025-02-29']) {
      assert.equal((await h.call(adminAgent, 'post', '/api/v1/noticias', noticia({ fechaPublicacion: f }))).status, 422, `noticia ${f}`);
      assert.equal((await h.call(adminAgent, 'get', `/api/v1/estadisticas?desde=${f}`)).status, 422, `estadísticas ${f}`);
      assert.equal((await h.call(adminAgent, 'get', `/api/v1/auditoria?desde=${f}`)).status, 422, `auditoría ${f}`);
      const doc = await adminAgent
        .post('/api/v1/documentos')
        .set('X-CSRF-Token', String(adminAgent.csrf))
        .field('tipo', 'circular')
        .field('numero', '001')
        .field('anio', '2026')
        .field('fecha', f)
        .field('asunto', 'Circular de prueba')
        .attach('archivo', Buffer.from('%PDF-1.4\n%ficticio\n'), 'c.pdf');
      assert.equal(doc.status, 422, `documento ${f}`);
    }
    assert.equal((await h.call(adminAgent, 'post', '/api/v1/noticias', noticia({ fechaPublicacion: '2024-02-29' }))).status, 201, 'año bisiesto válido');
  });
});

describe('QA-02: byte NUL', () => {
  test('NUL en búsquedas públicas y en el cuerpo → 4xx sin error del servidor', async () => {
    for (const url of ['/buscar?q=a%00b', '/api/v1/public/noticias?q=a%00b', '/api/v1/public/documentos?q=a%00b']) {
      const r = await pub().get(url).set('Accept', 'application/json');
      assert.ok(r.status >= 400 && r.status < 500, `${url} → ${r.status}`);
    }
    const r = await h.call(adminAgent, 'post', '/api/v1/noticias', noticia({ titulo: 'Con\u0000nulo en el título' }));
    assert.ok(r.status >= 400 && r.status < 500, `cuerpo → ${r.status}`);
  });
});

describe('QA-03, QA-04 y QA-09: política de contraseñas', () => {
  test('rechaza contraseñas comunes en español y derivadas del nombre; el error se asocia al campo "nueva"', async () => {
    const u = await h.createUser({ email: 'qa-editor@example.gov.co', nombre: 'QA Editor Dos' });
    const a = await h.login(u);
    for (const nueva of ['contraseña123456', 'administrador1', 'QA Editor Dos QA Editor Dos']) {
      const r = await h.call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva });
      assert.equal(r.status, 422, nueva);
      assert.equal(r.body.error.details[0].campo, 'nueva', 'QA-04');
    }
    const same = await h.call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva: PASSWORD });
    assert.equal(same.status, 422, 'QA-09: no se acepta la misma contraseña');
    assert.equal((await h.call(a, 'put', '/api/v1/cuenta/password', { actual: PASSWORD, nueva: 'faro naranja sobre el puerto viejo' })).status, 200);
  });
});

describe('QA-05: nombres de archivo con ñ y tildes', () => {
  test('el nombre original y el visible se conservan en UTF-8', async () => {
    const r = await adminAgent
      .post('/api/v1/medios')
      .set('X-CSRF-Token', String(adminAgent.csrf))
      .attach('archivos', await pngBuffer(), 'foto-ñandú-Ibagué.png');
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.data[0].nombreOriginal, 'foto-ñandú-Ibagué.png');
    assert.equal(r.body.data[0].nombreVisible, 'foto-ñandú-Ibagué');
  });
});

describe('QA-07: desactivación mutua simultánea de administradores', () => {
  test('una operación gana, la otra recibe 409 (último administrador), sin 503 por interbloqueo', async () => {
    const x = await h.createUser({ email: 'adminx@example.gov.co', rol: 'administrador' });
    const y = await h.createUser({ email: 'adminy@example.gov.co', rol: 'administrador' });
    await h.db.run("UPDATE usuarios SET activo = false WHERE rol_id = (SELECT id FROM roles WHERE slug = 'administrador') AND id NOT IN ($1, $2)", [
      x.id,
      y.id,
    ]);
    const [ax, ay] = [await h.login(x), await h.login(y)];
    for (let i = 0; i < 3; i++) {
      const [r1, r2] = await Promise.all([
        h.call(ax, 'patch', `/api/v1/usuarios/${y.id}`, { activo: false }),
        h.call(ay, 'patch', `/api/v1/usuarios/${x.id}`, { activo: false }),
      ]);
      const codes = [r1.status, r2.status];
      assert.ok(!codes.includes(503) && !codes.includes(500), JSON.stringify(codes));
      assert.ok(codes.includes(200) || codes.every((c) => c === 401 || c === 409), JSON.stringify(codes));
      await h.db.run('UPDATE usuarios SET activo = true WHERE id IN ($1, $2)', [x.id, y.id]);
    }
    await h.db.run("UPDATE usuarios SET activo = true WHERE rol_id = (SELECT id FROM roles WHERE slug = 'administrador')");
    adminAgent = await h.login(admin);
  });
});

describe('QA-08: slug automático con creaciones simultáneas', () => {
  test('cinco noticias con el mismo título en paralelo: todas 201 con slugs distintos', async () => {
    const rs = await Promise.all(
      Array.from({ length: 5 }, () => h.call(adminAgent, 'post', '/api/v1/noticias', noticia({ titulo: 'Título repetido en paralelo' }))),
    );
    assert.deepEqual(
      rs.map((r) => r.status),
      [201, 201, 201, 201, 201],
    );
    assert.equal(new Set(rs.map((r) => r.body.data.slug)).size, 5);
  });
});

describe('QA-10: cuerpo demasiado grande', () => {
  test('un JSON de más de 1 MB responde 413 con código PAYLOAD_TOO_LARGE', async () => {
    const r = await h.call(adminAgent, 'post', '/api/v1/paginas', { titulo: 'x'.repeat(1_200_000) });
    assert.equal(r.status, 413);
    assert.equal(r.body.error.code, 'PAYLOAD_TOO_LARGE');
  });
});

describe('QA-12: slider de una página inexistente', () => {
  test('pagina:no-existe → 422; una página existente (incluso en borrador) sí se acepta', async () => {
    assert.equal((await h.call(adminAgent, 'post', '/api/v1/sliders', { nombre: 'Sin página', ubicacion: 'pagina:no-existe' })).status, 422);
    assert.equal((await h.call(adminAgent, 'post', '/api/v1/sliders', { nombre: 'Contacto', ubicacion: 'pagina:contacto' })).status, 201);
  });
});

describe('QA-13: imagen de una noticia programada', () => {
  test('no es pública antes de la fecha de publicación; sí lo es cuando la noticia ya es visible', async () => {
    const up = await adminAgent
      .post('/api/v1/medios')
      .set('X-CSRF-Token', String(adminAgent.csrf))
      .attach('archivos', await pngBuffer(), 'programada.png');
    const m = up.body.data[0];
    const n = await h.call(
      adminAgent,
      'post',
      '/api/v1/noticias',
      noticia({ titulo: 'Noticia programada', estado: 'publicada', fechaPublicacion: '2099-01-01', imagenId: m.id }),
    );
    assert.equal(n.status, 201);
    assert.equal((await pub().get(m.urlPublica)).status, 404, 'aún no publicada');
    await h.call(adminAgent, 'put', `/api/v1/noticias/${n.body.data.id}`, { fechaPublicacion: '2026-01-01' });
    assert.equal((await pub().get(m.urlPublica)).status, 200, 'publicada');
  });
});

describe('QA-15: security.txt', () => {
  test('incluye el campo obligatorio Expires con una fecha futura', async () => {
    const r = await pub().get('/.well-known/security.txt');
    const exp = /^Expires: (\S+)$/m.exec(r.text)?.[1];
    assert.ok(exp && Date.parse(exp) > Date.now(), r.text);
  });
});

describe('QA-17: consulta de PQRSD tolerante', () => {
  test('acepta el radicado en minúsculas y el documento con espacios o puntos', async () => {
    const agent = h.agent();
    const token = String(/name="_csrf" value="([^"]+)"/.exec((await agent.get('/atencion')).text)?.[1]);
    await agent.post('/atencion/pqrsd').type('form').send({
      _csrf: token,
      tipo: 'Petición',
      nombre: 'María Pérez Gómez',
      tipo_documento: 'Cédula de ciudadanía',
      documento: '1110123456',
      email: 'maria@example.com',
      asunto: 'Solicitud de certificado',
      mensaje: 'Solicito un certificado de estudios del año 2019, gracias.',
      acepto: 'on',
    });
    const radicado = String(/SEM-\d{4}-\d{8}/.exec((await agent.get('/atencion/pqrsd/confirmacion')).text)?.[0]);
    const ok = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado: radicado.toLowerCase(), documento: '1.110 123 456' });
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Solicitud de certificado/);
  });
});
