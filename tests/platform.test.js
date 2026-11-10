'use strict';
/**
 * Estadísticas, contrato OpenAPI, cabeceras, errores, auditoría, PQRSD y exposición de secretos.
 */
const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, request, db, createUser, login, call, PASSWORD } = require('./helpers');
const { routes, buildDocument } = require('../src/presentation/http/api/openapi');

let admin, adminAgent, editorAgent;
const logs = [];
before(async () => {
  for (const k of ['log', 'info', 'warn', 'error']) {
    const orig = console[k];
    console[k] = (...args) => {
      logs.push(args.map(String).join(' '));
      orig.apply(console, args);
    };
  }
  admin = await createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
  adminAgent = await login(admin);
  editorAgent = await login(await createUser({ email: 'editor@example.gov.co' }));
});

const BROWSER = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';

describe('Estadísticas', () => {
  test('sin visitas el reporte indica vacío y no inventa cifras', async () => {
    const res = await call(adminAgent, 'get', '/api/v1/estadisticas');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.vacio, true);
    assert.equal(res.body.data.resumen.visitas, 0);
  });

  test('registra visitas sin cookies ni IP; respeta No rastrear y excluye robots y el panel', async () => {
    const pub = await request(app).get('/noticias').set('User-Agent', BROWSER).set('Referer', 'https://www.google.com/search?q=sem');
    assert.equal(pub.headers['set-cookie'], undefined, 'el sitio público no crea cookies');
    await request(app).get('/secretaria').set('User-Agent', BROWSER);
    await request(app).get('/secretaria').set('User-Agent', BROWSER).set('DNT', '1');
    await request(app).get('/secretaria').set('User-Agent', 'Googlebot/2.1');
    await request(app).get('/no-existe').set('User-Agent', BROWSER);
    const rows = db.prepare('SELECT * FROM visitas').all();
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => !JSON.stringify(r).includes('127.0.0.1') && !JSON.stringify(r).includes('Mozilla')));
    const rep = (await call(adminAgent, 'get', '/api/v1/estadisticas')).body.data;
    assert.equal(rep.vacio, false);
    assert.equal(rep.resumen.visitas, 2);
    assert.equal(rep.resumen.visitantesUnicosEstimados, 1);
    assert.deepEqual(rep.dispositivos, [{ valor: 'movil', visitas: 2 }]);
    assert.ok(rep.fuentes.some((f) => f.valor === 'buscador'));
  });

  test('solo administradores; rango de fechas validado', async () => {
    assert.equal((await call(editorAgent, 'get', '/api/v1/estadisticas')).status, 403);
    assert.equal((await call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-05-01&hasta=2026-01-01')).status, 422);
    assert.equal((await call(adminAgent, 'get', '/api/v1/estadisticas?desde=2020-01-01&hasta=2026-01-01')).status, 422);
  });
});

describe('Contrato OpenAPI', () => {
  const doc = buildDocument({ audience: 'full' });

  test('cada ruta de la API está documentada y cada ruta documentada existe', () => {
    const documented = new Set(Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)));
    const implemented = new Set(routes.map((r) => `${r.method} ${r.path}`));
    assert.deepEqual(
      [...implemented].filter((x) => !documented.has(x)),
      [],
    );
    assert.deepEqual(
      [...documented].filter((x) => !implemented.has(x)),
      [],
    );
    assert.ok(implemented.size >= 45);
  });

  test('cada operación privada declara seguridad, permiso y errores 401/403', () => {
    for (const [p, ops] of Object.entries(doc.paths)) {
      for (const [m, op] of Object.entries(ops)) {
        assert.ok(op.summary && op.tags?.length, `${m} ${p} sin resumen o módulo`);
        if (p.startsWith('/api/v1/public')) continue;
        if (m !== 'get' || !/auth\/(csrf)/.test(p)) {
          if (!p.includes('/auth/csrf') && !p.includes('/auth/login') && !p.includes('/auth/logout') && !p.includes('/auth/recuperacion')) {
            assert.ok(op.responses['401'] && op.responses['403'], `${m} ${p} sin 401/403`);
          }
        }
        if (m !== 'get')
          assert.ok(
            op.security?.some((s) => 'csrfToken' in s),
            `${m} ${p} sin CSRF documentado`,
          );
      }
    }
  });

  test('la especificación versionada en docs/ coincide con el código', () => {
    const file = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'openapi.json'), 'utf8'));
    assert.deepEqual(file, JSON.parse(JSON.stringify(doc)), 'ejecute npm run openapi:export');
  });

  test('la documentación pública solo incluye operaciones públicas', async () => {
    const res = await request(app).get('/api/v1/openapi-publica.json');
    assert.ok(Object.keys(res.body.paths).every((p) => p.startsWith('/api/v1/public/')));
    assert.ok(Object.values(res.body.paths).every((ops) => Object.keys(ops).every((m) => m === 'get')));
    assert.equal((await request(app).get('/api/v1/openapi.json').set('Accept', 'application/json')).status, 401);
    assert.equal((await adminAgent.get('/api/v1/openapi.json')).status, 200);
  });

  test('los ejemplos de la documentación no contienen secretos ni datos reales', () => {
    const text = JSON.stringify(doc);
    assert.doesNotMatch(text, /\$argon2|BEGIN PRIVATE|ibague\.gov\.co"|@gmail|@hotmail/);
  });
});

describe('Respuestas y registros sin secretos', () => {
  test('ninguna respuesta de la API incluye hashes, secretos MFA ni tokens', async () => {
    const urls = [
      '/api/v1/usuarios',
      `/api/v1/usuarios/${admin.id}`,
      '/api/v1/auth/sesion',
      '/api/v1/roles',
      '/api/v1/auditoria',
      '/api/v1/medios',
      '/api/v1/paginas',
      '/api/v1/noticias',
    ];
    for (const u of urls) {
      const text = JSON.stringify((await adminAgent.get(u)).body);
      assert.doesNotMatch(text, /\$argon2|password_?hash|mfa_?secreto|secretoEnc|token_?hash|codigo_?hash/i, u);
    }
  });

  test('los registros (logs) no contienen contraseñas, códigos ni tokens', () => {
    const text = logs.join('\n');
    assert.ok(!text.includes(PASSWORD));
    assert.doesNotMatch(text, /\$argon2|otpauth:|#token=/);
  });
});

describe('Auditoría', () => {
  test('registra accesos e intentos fallidos con usuario, acción, recurso y resultado', async () => {
    const r = await request.agent(app).get('/api/v1/auth/csrf');
    await request(app)
      .post('/api/v1/auth/login')
      .set('Cookie', r.headers['set-cookie'])
      .set('X-CSRF-Token', r.body.data.csrfToken)
      .send({ email: admin.email, password: 'contraseña equivocada' });
    const res = await call(adminAgent, 'get', '/api/v1/auditoria');
    const fail = res.body.data.find((e) => e.accion === 'login' && e.resultado === 'fallo');
    assert.ok(fail && fail.usuarioEmail === admin.email && fail.recurso === 'usuario');
    assert.ok(res.body.data.some((e) => e.accion === 'login' && e.resultado === 'exito'));
  });

  test('la bitácora no admite modificaciones y detecta manipulaciones directas', async () => {
    assert.throws(() => db.exec("UPDATE auditoria_eventos SET accion = 'x'"), /no se puede modificar/);
    assert.throws(() => db.exec('DELETE FROM auditoria_eventos'), /no se puede eliminar/);
    assert.equal((await call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data.integra, true);
    db.exec('DROP TRIGGER auditoria_sin_update');
    db.exec("UPDATE auditoria_eventos SET detalle = 'alterado' WHERE id = 1");
    const check = (await call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data;
    assert.equal(check.integra, false);
    assert.equal(check.idAlterado, 1);
  });
});

describe('Cabeceras, errores y archivos del servidor', () => {
  test('CSP estricta, anti-clickjacking, nosniff, sin X-Powered-By', async () => {
    for (const url of ['/', '/admin/login', '/api/v1/public/noticias']) {
      const res = await request(app).get(url);
      const csp = res.headers['content-security-policy'];
      assert.match(csp, /script-src 'self'/);
      assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-powered-by'], undefined);
    }
  });

  test('ninguna vista ni página del panel tiene scripts o estilos en línea', () => {
    const roots = [path.join(__dirname, '..', 'src', 'presentation', 'views')];
    for (const dir of roots) {
      for (const f of fs.readdirSync(dir, { recursive: true }).filter((x) => x.endsWith('.ejs'))) {
        const html = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, f);
        assert.doesNotMatch(html, /\sstyle="/i, f);
        assert.doesNotMatch(html, /\son[a-z]+="/i, f);
      }
    }
    for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'assets', 'admin'), { recursive: true }).filter((x) => x.endsWith('.js'))) {
      const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'admin', f), 'utf8');
      assert.doesNotMatch(js, /localStorage/, `${f} no debe usar localStorage`);
      assert.doesNotMatch(js, /\beval\(|new Function\(/, f);
    }
  });

  test('errores sin trazas ni detalles internos; archivos del servidor inaccesibles', async () => {
    const res = await request(app).get('/api/v1/noticias/abc').set('Accept', 'application/json');
    assert.ok([401, 404, 422].includes(res.status));
    const bad = await adminAgent.post('/api/v1/noticias').set('X-CSRF-Token', adminAgent.csrf).set('Content-Type', 'application/json').send('{"titulo": ');
    assert.equal(bad.status, 400);
    assert.doesNotMatch(JSON.stringify(bad.body), /at .*\.js:\d+|node_modules|SyntaxError/);
    for (const url of ['/.env', '/package.json', '/src/config/index.js', '/storage/semibague.sqlite', '/app.js', '/assets/../../.env', '/docs/openapi.json']) {
      assert.equal((await request(app).get(url)).status, 404, url);
    }
  });

  test('inyección SQL en búsquedas y filtros se trata como texto', async () => {
    for (const q of ["' OR '1'='1", "'; DROP TABLE noticias; --", '%', "\\' UNION SELECT password_hash FROM usuarios --"]) {
      const res = await request(app).get('/buscar').query({ q });
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /argon2/);
      const api = await adminAgent.get('/api/v1/usuarios').query({ q });
      assert.equal(api.status, 200);
      assert.equal(api.body.data.length, 0);
    }
    assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'noticias'").get());
  });

  test('todos los listados aceptan cada orden permitido (ascendente y descendente)', async () => {
    const doc = buildDocument({ audience: 'full' });
    for (const [p, ops] of Object.entries(doc.paths)) {
      const sortParam = ops.get?.parameters?.find((x) => x.name === 'sort');
      if (!sortParam || p.includes('{')) continue;
      for (const value of sortParam.schema.enum) {
        const res = await adminAgent.get(p).query({ sort: value });
        assert.equal(res.status, 200, `${p}?sort=${value} → ${res.status}`);
      }
    }
  });

  test('CORS cerrado por defecto: ningún origen externo recibe permiso', async () => {
    const res = await request(app).get('/api/v1/public/noticias').set('Origin', 'https://otro-sitio.example');
    assert.equal(res.headers['access-control-allow-origin'], undefined);
    const priv = await request(app).options('/api/v1/usuarios').set('Origin', 'https://otro-sitio.example');
    assert.equal(priv.headers['access-control-allow-origin'], undefined);
  });
});

describe('PQRSD (funcionalidad existente)', () => {
  test('radicar, cifrar datos personales, consultar con radicado + documento; acceso admin auditado', async () => {
    const agent = request.agent(app);
    const form = await agent.get('/atencion');
    const token = /name="_csrf" value="([^"]+)"/.exec(form.text)[1];
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
    assert.equal((await request(app).post('/atencion/pqrsd').type('form').send(data)).status, 403, 'sin cookie de sesión el token no vale');
    assert.equal((await agent.post('/atencion/pqrsd').type('form').send(data)).status, 303);
    const radicado = /SEM-\d{4}-\d{8}/.exec((await agent.get('/atencion/pqrsd/confirmacion')).text)[0];
    const row = JSON.stringify(db.prepare('SELECT * FROM pqrsd WHERE radicado = ?').get(radicado));
    for (const v of ['María Pérez', '1110123456', 'maria@example.com', '3001234567']) assert.ok(!row.includes(v), v);
    const ok = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '1110123456' });
    assert.match(ok.text, /Solicitud de certificado/);
    const no = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '999999' });
    assert.equal(no.status, 404);

    const list = await adminAgent.get('/api/v1/pqrsd');
    const item = list.body.data.find((p) => p.radicado === radicado);
    const detail = await adminAgent.get(`/api/v1/pqrsd/${item.id}`);
    assert.equal(detail.body.data.email, 'maria@example.com');
    assert.equal((await editorAgent.get(`/api/v1/pqrsd/${item.id}`)).status, 403);
    const audit = await adminAgent.get('/api/v1/auditoria').query({ accion: 'pqrsd_ver' });
    assert.ok(audit.body.data.some((e) => e.recursoId === radicado));
  });
});
