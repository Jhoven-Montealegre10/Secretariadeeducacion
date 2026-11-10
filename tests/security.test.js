'use strict';
/**
 * Pruebas de seguridad y funcionamiento. Ejecutar: npm test
 * Usan una base de datos en memoria y una carpeta temporal para archivos.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-test-'));
const request = require('supertest');
const app = require('../app');
const { db } = require('../src/models/db');
const Usuario = require('../src/models/Usuario');
const Noticia = require('../src/models/Noticia');
const { encrypt, decrypt } = require('../src/services/crypto');

const ADMIN = { email: 'admin@ibague.gov.co', password: 'ClaveSegura2026', nombre: 'Admin Pruebas' };

function csrfFrom(html) {
  const m = /name="_csrf" value="([^"]+)"/.exec(html);
  assert.ok(m, 'el formulario debe incluir token CSRF');
  return m[1];
}

async function loginAgent() {
  const agent = request.agent(app);
  const page = await agent.get('/admin/login');
  const res = await agent.post('/admin/login').type('form').send({ _csrf: csrfFrom(page.text), email: ADMIN.email, password: ADMIN.password });
  assert.equal(res.status, 303);
  return agent;
}

const pqrsdValida = {
  tipo: 'Petición', nombre: 'María Pérez Gómez', tipo_documento: 'Cédula de ciudadanía', documento: '1110123456',
  email: 'maria@example.com', telefono: '3001234567', asunto: 'Solicitud de certificado',
  mensaje: 'Solicito amablemente un certificado de estudios de mi hija del año 2019.', acepto: 'on',
};

before(() => {
  Usuario.crear({ ...ADMIN, rol: 'admin' });
  Noticia.crear({ titulo: 'Noticia de prueba', resumen: 'Resumen de la noticia de prueba', contenido: 'Contenido de prueba suficiente.', categoria: 'Institucional', fecha_publicacion: '2026-11-01', publicada: true });
});

describe('Cabeceras de seguridad', () => {
  test('CSP estricta, anti-clickjacking, nosniff y sin X-Powered-By', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    const csp = res.headers['content-security-policy'];
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-powered-by'], undefined);
  });

  test('las páginas públicas no crean cookies de sesión innecesarias', async () => {
    const res = await request(app).get('/noticias');
    assert.equal(res.headers['set-cookie'], undefined);
  });

  test('ninguna vista contiene scripts en línea (la CSP los bloquearía)', () => {
    const dir = path.join(__dirname, '..', 'src', 'views');
    const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith('.ejs'));
    for (const f of files) {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, `${f} tiene <script> en línea`);
      assert.doesNotMatch(html, /\sstyle="/i, `${f} tiene style en línea`);
      assert.doesNotMatch(html, /\son[a-z]+="/i, `${f} tiene manejadores de eventos en línea`);
    }
  });
});

describe('Inyección SQL', () => {
  const payloads = ["' OR '1'='1", "'; DROP TABLE noticias; --", '%', '_', "\\' UNION SELECT password_hash FROM usuarios --"];

  test('el buscador trata la entrada como texto literal', async () => {
    for (const q of payloads) {
      const res = await request(app).get('/buscar').query({ q });
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /scrypt\$/);
    }
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'noticias'").get(), 'la tabla sigue existiendo');
    const comodin = await request(app).get('/buscar').query({ q: '%%' });
    assert.match(comodin.text, /No se encontraron resultados/, '"%" no actúa como comodín');
  });

  test('rutas con parámetros maliciosos devuelven 404', async () => {
    for (const url of ["/noticias/' OR 1=1--", '/documentos/1 OR 1=1', '/documentos/..%2F..%2Fetc%2Fpasswd']) {
      assert.equal((await request(app).get(url)).status, 404, url);
    }
  });

  test('el login no se salta con inyección', async () => {
    const agent = request.agent(app);
    const page = await agent.get('/admin/login');
    const res = await agent.post('/admin/login').type('form').send({ _csrf: csrfFrom(page.text), email: "admin@ibague.gov.co' --", password: "' OR '1'='1" });
    assert.equal(res.status, 401);
  });
});

describe('XSS (inyección de código en la página)', () => {
  test('la búsqueda escapa lo que escribe el usuario', async () => {
    const res = await request(app).get('/buscar').query({ q: '<script>alert(1)</script>' });
    assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;/);
  });

  test('los datos de una PQRSD se muestran escapados en el panel', async () => {
    const agent = request.agent(app);
    const form = await agent.get('/atencion');
    await agent.post('/atencion/pqrsd').type('form').send({ ...pqrsdValida, _csrf: csrfFrom(form.text), nombre: '<img src=x onerror=alert(1)>' });
    const admin = await loginAgent();
    const list = await admin.get('/admin/pqrsd');
    assert.doesNotMatch(list.text, /<img src=x/);
    assert.match(list.text, /&lt;img src=x/);
  });
});

describe('CSRF', () => {
  test('formularios sin token son rechazados', async () => {
    const res = await request(app).post('/atencion/pqrsd').type('form').send(pqrsdValida);
    assert.equal(res.status, 403);
    const res2 = await request(app).post('/admin/login').type('form').send({ email: ADMIN.email, password: ADMIN.password });
    assert.equal(res2.status, 403);
  });

  test('token de otra sesión es rechazado', async () => {
    const a = request.agent(app);
    const token = csrfFrom((await a.get('/atencion')).text);
    const b = request.agent(app);
    await b.get('/atencion');
    const res = await b.post('/atencion/pqrsd').type('form').send({ ...pqrsdValida, _csrf: token });
    assert.equal(res.status, 403);
  });
});

describe('PQRSD: cifrado y consulta', () => {
  let radicado;

  test('radicar una solicitud devuelve un radicado', async () => {
    const agent = request.agent(app);
    const form = await agent.get('/atencion');
    const res = await agent.post('/atencion/pqrsd').type('form').send({ ...pqrsdValida, _csrf: csrfFrom(form.text) });
    assert.equal(res.status, 303);
    const conf = await agent.get('/atencion/pqrsd/confirmacion');
    radicado = /SEM-\d{4}-\d{8}/.exec(conf.text)[0];
    assert.ok(radicado);
    assert.equal((await agent.get('/atencion/pqrsd/confirmacion')).status, 302, 'la confirmación solo se muestra una vez');
  });

  test('los datos personales se guardan cifrados en la base de datos', () => {
    const row = db.prepare('SELECT * FROM pqrsd WHERE radicado = ?').get(radicado);
    const crudo = JSON.stringify(row);
    for (const dato of [pqrsdValida.nombre, pqrsdValida.documento, pqrsdValida.email, pqrsdValida.telefono, pqrsdValida.mensaje]) {
      assert.ok(!crudo.includes(dato), `"${dato}" no debe estar en texto plano`);
    }
    assert.match(row.nombre_enc, /^v1:/);
  });

  test('la consulta exige radicado y documento correctos', async () => {
    const agent = request.agent(app);
    const token = csrfFrom((await agent.get('/atencion')).text);
    const mala = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '999999' });
    assert.equal(mala.status, 404);
    assert.doesNotMatch(mala.text, /Solicitud de certificado/);
    const buena = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: pqrsdValida.documento });
    assert.equal(buena.status, 200);
    assert.match(buena.text, /Solicitud de certificado/);
    assert.doesNotMatch(buena.text, /maria@example\.com/, 'la consulta pública no expone el correo');
  });

  test('validación rechaza datos inválidos sin reenviar el documento', async () => {
    const agent = request.agent(app);
    const token = csrfFrom((await agent.get('/atencion')).text);
    const res = await agent.post('/atencion/pqrsd').type('form').send({ ...pqrsdValida, _csrf: token, email: 'no-es-correo', documento: '12.345' });
    assert.equal(res.status, 422);
    assert.match(res.text, /no es un correo válido/);
  });

  test('las páginas de PQRSD no se guardan en caché', async () => {
    const res = await request(app).get('/atencion');
    assert.match(res.headers['cache-control'], /no-store/);
  });
});

describe('Cifrado', () => {
  test('AES-256-GCM: ida y vuelta, IV aleatorio y detección de manipulación', () => {
    const a = encrypt('dato sensible');
    const b = encrypt('dato sensible');
    assert.notEqual(a, b);
    assert.equal(decrypt(a), 'dato sensible');
    const parts = a.split(':');
    parts[3] = Buffer.from('manipulado').toString('base64');
    assert.throws(() => decrypt(parts.join(':')));
  });

  test('las contraseñas se guardan con scrypt, nunca en texto plano', () => {
    const row = db.prepare('SELECT password_hash FROM usuarios WHERE email = ?').get(ADMIN.email);
    assert.match(row.password_hash, /^scrypt\$/);
    assert.ok(!row.password_hash.includes(ADMIN.password));
  });
});

describe('Panel de administración', () => {
  test('requiere sesión', async () => {
    for (const url of ['/admin', '/admin/noticias', '/admin/pqrsd', '/admin/documentos']) {
      const res = await request(app).get(url);
      assert.equal(res.status, 302, url);
      assert.equal(res.headers.location, '/admin/login');
    }
  });

  test('cookie de sesión HttpOnly + SameSite=Strict, y la sesión cambia al iniciar', async () => {
    const agent = request.agent(app);
    const page = await agent.get('/admin/login');
    const antes = page.headers['set-cookie'][0];
    assert.match(antes, /HttpOnly/);
    assert.match(antes, /SameSite=Strict/);
    const res = await agent.post('/admin/login').type('form').send({ _csrf: csrfFrom(page.text), email: ADMIN.email, password: ADMIN.password });
    assert.notEqual(res.headers['set-cookie'][0].split(';')[0], antes.split(';')[0], 'regenera el ID de sesión');
  });

  test('bloquea la cuenta tras 5 intentos fallidos', async () => {
    Usuario.crear({ email: 'victima@ibague.gov.co', nombre: 'Víctima', password: 'OtraClave2026x', rol: 'editor' });
    const agent = request.agent(app);
    const token = csrfFrom((await agent.get('/admin/login')).text);
    for (let i = 0; i < 5; i++) await agent.post('/admin/login').type('form').send({ _csrf: token, email: 'victima@ibague.gov.co', password: 'mala' });
    const res = await agent.post('/admin/login').type('form').send({ _csrf: token, email: 'victima@ibague.gov.co', password: 'OtraClave2026x' });
    assert.equal(res.status, 401);
    assert.match(res.text, /bloqueada/);
  });

  test('el rol editor no puede ver datos personales de PQRSD', async () => {
    Usuario.crear({ email: 'editor@ibague.gov.co', nombre: 'Editor', password: 'EditorClave2026', rol: 'editor' });
    const agent = request.agent(app);
    const page = await agent.get('/admin/login');
    await agent.post('/admin/login').type('form').send({ _csrf: csrfFrom(page.text), email: 'editor@ibague.gov.co', password: 'EditorClave2026' });
    assert.equal((await agent.get('/admin')).status, 200);
    assert.equal((await agent.get('/admin/pqrsd')).status, 403);
  });

  test('crear noticia desde el panel la publica en el sitio', async () => {
    const agent = await loginAgent();
    const form = await agent.get('/admin/noticias/nueva');
    const res = await agent.post('/admin/noticias').type('form').send({
      _csrf: csrfFrom(form.text), titulo: 'Nueva jornada de matrícula', resumen: 'Abiertas las inscripciones 2027',
      contenido: 'Primer párrafo de la noticia.\n\nSegundo párrafo.', categoria: 'Cobertura', fecha_publicacion: '2026-11-10', publicada: 'on',
    });
    assert.equal(res.status, 303);
    const pub = await request(app).get('/noticias/nueva-jornada-de-matricula');
    assert.equal(pub.status, 200);
    assert.match(pub.text, /Segundo párrafo/);
  });

  test('solo acepta PDF reales y los sirve sin exponer la ruta interna', async () => {
    const agent = await loginAgent();
    const token = csrfFrom((await agent.get('/admin/documentos/nuevo')).text);
    const campos = { _csrf: token, tipo: 'circular', numero: '015', anio: '2026', fecha: '2026-11-05', asunto: 'Calendario académico 2027' };

    let req = agent.post('/admin/documentos');
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    const falso = await req.attach('archivo', Buffer.from('<?php system($_GET["c"]); ?>'), 'circular.pdf');
    assert.equal(falso.status, 422, 'un archivo disfrazado de PDF se rechaza');

    req = agent.post('/admin/documentos');
    for (const [k, v] of Object.entries(campos)) req = req.field(k, v);
    const ok = await req.attach('archivo', Buffer.from('%PDF-1.4\n%%EOF\n'), 'circular.pdf');
    assert.equal(ok.status, 303);

    const norm = await request(app).get('/normatividad');
    const id = /href="\/documentos\/(\d+)"/.exec(norm.text)[1];
    const pdf = await request(app).get(`/documentos/${id}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.doesNotMatch(norm.text, /[a-f0-9]{32}\.pdf/, 'no se expone el nombre interno');
  });
});

describe('Errores', () => {
  test('404 sin detalles internos', async () => {
    const res = await request(app).get('/no-existe');
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /at .*\.js:\d+|node_modules|Error:/);
  });

  test('archivos sensibles del servidor no son accesibles', async () => {
    for (const url of ['/.env', '/package.json', '/config/index.js', '/storage/semibague.sqlite', '/app.js', '/assets/../../.env']) {
      assert.equal((await request(app).get(url)).status, 404, url);
    }
  });
});
