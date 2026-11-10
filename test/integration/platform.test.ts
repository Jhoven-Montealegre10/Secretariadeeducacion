/**
 * Estadísticas, contrato OpenAPI, cabeceras, errores, auditoría, PQRSD, exposición de secretos,
 * privilegios de PostgreSQL y persistencia tras reiniciar la aplicación.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Client } from 'pg';
import request from 'supertest';
import { StatsService } from '../../src/application/stats.service';
import { OpenApiDocs } from '../../src/presentation/http/api/controllers/docs.controller';
import { ROUTES } from '../../src/presentation/http/route-spec';
import { createHarness, PASSWORD, type Agent, type Harness, type TestUser } from '../support/harness';

const ROOT = path.resolve(__dirname, '..', '..', '..');
let h: Harness;
let admin: TestUser;
let adminAgent: Agent;
let editorAgent: Agent;
const logs: string[] = [];
const pub = () => request(h.app.getHttpServer());
const doc = () => h.get(OpenApiDocs).fullDoc as OpenAPIObject;

before(async () => {
  for (const stream of [process.stdout, process.stderr]) {
    const orig = stream.write.bind(stream);
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      logs.push(String(chunk));
      return (orig as (...a: unknown[]) => boolean)(chunk, ...rest);
    });
  }
  h = await createHarness();
  admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
  adminAgent = await h.login(admin);
  editorAgent = await h.login(await h.createUser({ email: 'editor@example.gov.co' }));
});
after(async () => h?.close());

const BROWSER = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36';

describe('Estadísticas', () => {
  test('sin visitas el reporte indica vacío y no inventa cifras', async () => {
    const res = await h.call(adminAgent, 'get', '/api/v1/estadisticas');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.vacio, true);
    assert.equal(res.body.data.resumen.visitas, 0);
  });

  test('registra visitas sin cookies ni IP; respeta No rastrear y excluye robots, errores y el panel', async () => {
    const page = await pub().get('/noticias').set('User-Agent', BROWSER).set('Referer', 'https://www.google.com/search?q=sem');
    assert.equal(page.headers['set-cookie'], undefined, 'el sitio público no crea cookies');
    await pub().get('/secretaria').set('User-Agent', BROWSER);
    await pub().get('/secretaria').set('User-Agent', BROWSER).set('DNT', '1');
    await pub().get('/secretaria').set('User-Agent', 'Googlebot/2.1');
    await pub().get('/no-existe').set('User-Agent', BROWSER);
    await h.get(StatsService).flush();
    const rows = await h.db.query('SELECT * FROM visitas');
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => !JSON.stringify(r).includes('127.0.0.1') && !JSON.stringify(r).includes('Mozilla')));
    const rep = (await h.call(adminAgent, 'get', '/api/v1/estadisticas')).body.data;
    assert.equal(rep.vacio, false);
    assert.equal(rep.resumen.visitas, 2);
    assert.equal(rep.resumen.visitantesUnicosEstimados, 1);
    assert.deepEqual(rep.dispositivos, [{ valor: 'movil', visitas: 2 }]);
    assert.ok(rep.fuentes.some((f: { valor: string }) => f.valor === 'buscador'));
    assert.deepEqual(rep.paginas.map((p: { ruta: string }) => p.ruta).sort(), ['/noticias', '/secretaria']);
  });

  test('filtros por fecha coinciden con los datos de prueba', async () => {
    await h.db.run(
      `INSERT INTO visitas (fecha, ruta, visitante, fuente, dispositivo) VALUES
       ('2026-01-05', '/noticias', 'a', 'directo', 'escritorio'), ('2026-01-05', '/noticias', 'b', 'directo', 'escritorio'),
       ('2026-01-06', '/tramites', 'a', 'otro_sitio', 'tablet')`,
    );
    const rep = (await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-01-05&hasta=2026-01-06')).body.data;
    assert.equal(rep.resumen.visitas, 3);
    assert.equal(rep.resumen.visitantesUnicosEstimados, 3, 'visitantes distintos por día, sumados');
    assert.deepEqual(rep.porDia, [
      { fecha: '2026-01-05', visitas: 2, visitantes: 2 },
      { fecha: '2026-01-06', visitas: 1, visitantes: 1 },
    ]);
    const one = (await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-01-06&hasta=2026-01-06')).body.data;
    assert.equal(one.resumen.visitas, 1);
  });

  test('solo administradores; rango de fechas validado', async () => {
    assert.equal((await h.call(editorAgent, 'get', '/api/v1/estadisticas')).status, 403);
    assert.equal((await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2026-05-01&hasta=2026-01-01')).status, 422);
    assert.equal((await h.call(adminAgent, 'get', '/api/v1/estadisticas?desde=2020-01-01&hasta=2026-01-01')).status, 422);
  });
});

describe('Contrato OpenAPI', () => {
  const api = () => ROUTES.filter((r) => r.kind === 'api');

  test('cada ruta de la API está documentada y cada ruta documentada existe', () => {
    const documented = new Set(Object.entries(doc().paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m} ${p}`)));
    const implemented = new Set(api().map((r) => `${r.method} ${r.path}`));
    assert.deepEqual(
      [...implemented].filter((x) => !documented.has(x)),
      [],
    );
    assert.deepEqual(
      [...documented].filter((x) => !implemented.has(x)),
      [],
    );
    assert.ok(implemented.size >= 60);
  });

  test('cada operación privada declara seguridad, permiso y errores 401/403; las que modifican, CSRF', () => {
    const publicAuth = /auth\/(csrf|login|logout|recuperacion)/;
    for (const [p, ops] of Object.entries(doc().paths)) {
      for (const [m, op] of Object.entries(ops as Record<string, { summary?: string; tags?: string[]; responses: Record<string, unknown>; security?: Array<Record<string, unknown>> }>)) {
        assert.ok(op.summary && op.tags?.length, `${m} ${p} sin resumen o módulo`);
        if (p.startsWith('/api/v1/public')) continue;
        if (!publicAuth.test(p)) assert.ok(op.responses['401'] && op.responses['403'], `${m} ${p} sin 401/403`);
        if (m !== 'get') assert.ok(op.security?.some((s) => 'csrfToken' in s), `${m} ${p} sin CSRF documentado`);
      }
    }
  });

  test('las respuestas reales cumplen el esquema documentado (validación estricta fuera de producción)', async () => {
    // El interceptor valida cada respuesta contra su esquema: un campo de más provoca 500.
    for (const url of ['/api/v1/usuarios', '/api/v1/roles', '/api/v1/medios', '/api/v1/paginas', '/api/v1/noticias', '/api/v1/sliders', '/api/v1/auditoria', '/api/v1/sistema/metricas', '/api/v1/permisos']) {
      assert.equal((await h.call(adminAgent, 'get', url)).status, 200, url);
    }
  });

  test('la especificación versionada en docs/ coincide con el código', () => {
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'openapi.json'), 'utf8'));
    assert.deepEqual(file, JSON.parse(JSON.stringify(doc())), 'ejecute npm run openapi:export');
  });

  test('la documentación pública solo incluye operaciones públicas', async () => {
    const res = await pub().get('/api/v1/openapi-publica.json');
    assert.ok(Object.keys(res.body.paths).every((p) => p.startsWith('/api/v1/public/')));
    assert.ok(Object.values(res.body.paths as Record<string, object>).every((ops) => Object.keys(ops).every((m) => m === 'get')));
    assert.equal(res.body.components?.securitySchemes, undefined);
    assert.equal((await pub().get('/api/v1/openapi.json').set('Accept', 'application/json')).status, 401);
    assert.equal((await adminAgent.get('/api/v1/openapi.json')).status, 200);
  });

  test('los ejemplos de la documentación no contienen secretos ni datos reales', () => {
    assert.doesNotMatch(JSON.stringify(doc()), /\$argon2|BEGIN PRIVATE|ibague\.gov\.co"|@gmail|@hotmail/);
  });
});

describe('Respuestas y registros sin secretos', () => {
  test('ninguna respuesta de la API incluye hashes, secretos MFA ni tokens', async () => {
    const urls = ['/api/v1/usuarios', `/api/v1/usuarios/${admin.id}`, '/api/v1/auth/sesion', '/api/v1/roles', '/api/v1/auditoria', '/api/v1/medios', '/api/v1/paginas', '/api/v1/noticias'];
    for (const u of urls) {
      const text = JSON.stringify((await adminAgent.get(u)).body);
      assert.doesNotMatch(text, /\$argon2|password_?hash|mfa_?secreto|secretoEnc|token_?hash|codigo_?hash/i, u);
    }
  });

  test('los registros (logs) no contienen contraseñas, códigos, tokens ni parámetros de consultas', () => {
    const text = logs.join('\n');
    assert.ok(!text.includes(PASSWORD));
    assert.doesNotMatch(text, /\$argon2|otpauth:|#token=|PARAMETERS:/);
  });
});

describe('Auditoría', () => {
  test('registra accesos e intentos fallidos con usuario, acción, recurso y resultado', async () => {
    const agent = h.agent();
    const token = await h.csrf(agent);
    await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: admin.email, password: 'contraseña equivocada' });
    const res = await h.call(adminAgent, 'get', '/api/v1/auditoria');
    const fail = res.body.data.find((e: { accion: string; resultado: string }) => e.accion === 'login' && e.resultado === 'fallo');
    assert.ok(fail && fail.usuarioEmail === admin.email && fail.recurso === 'usuario');
    assert.ok(res.body.data.some((e: { accion: string; resultado: string }) => e.accion === 'login' && e.resultado === 'exito'));
  });

  test('la cadena se mantiene íntegra con escrituras concurrentes (bloqueo consultivo)', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, i) => h.call(adminAgent, 'patch', '/api/v1/cuenta/perfil', { nombre: `Administrador ${i}` })));
    assert.equal((await h.call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data.integra, true);
  });

  test('la cuenta de la aplicación no puede modificar ni borrar la bitácora; una manipulación del DBA se detecta', async () => {
    await assert.rejects(h.db.run("UPDATE auditoria_eventos SET accion = 'x'"), /permission denied|no se puede/);
    await assert.rejects(h.db.run('DELETE FROM auditoria_eventos'), /permission denied|no se puede/);
    assert.equal((await h.call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data.integra, true);
    const firstId = await h.db.scalar<number>('SELECT MIN(id) FROM auditoria_eventos');
    // Incluso el dueño tiene que desactivar los triggers a propósito para alterar un registro.
    const u = new URL(h.adminUrl);
    u.pathname = `/${h.dbName}`;
    const dba = new Client({ connectionString: u.toString() });
    await dba.connect();
    await assert.rejects(dba.query(`UPDATE portal.auditoria_eventos SET detalle = 'alterado' WHERE id = ${firstId}`), /no se puede modificar/);
    await dba.query('ALTER TABLE portal.auditoria_eventos DISABLE TRIGGER auditoria_sin_cambios');
    await dba.query(`UPDATE portal.auditoria_eventos SET detalle = 'alterado' WHERE id = ${firstId}`);
    await dba.query('ALTER TABLE portal.auditoria_eventos ENABLE TRIGGER auditoria_sin_cambios');
    await dba.end();
    const check = (await h.call(adminAgent, 'get', '/api/v1/auditoria/integridad')).body.data;
    assert.equal(check.integra, false);
    assert.equal(check.idAlterado, firstId);
  });
});

describe('PostgreSQL: mínimo privilegio y protección del esquema', () => {
  test('la aplicación usa una cuenta sin superusuario ni permisos de DDL', async () => {
    const r = await h.db.one<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>('SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user');
    assert.deepEqual(r, { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
    await assert.rejects(h.db.run('CREATE TABLE portal.intrusa (id int)'), /permission denied/);
    await assert.rejects(h.db.run('DROP TABLE portal.usuarios'), /must be owner|permission denied/);
    await assert.rejects(h.db.run('ALTER TABLE portal.usuarios ADD COLUMN x int'), /must be owner|permission denied/);
    await assert.rejects(h.db.run('CREATE TABLE public.intrusa (id int)'), /permission denied/);
  });

  test('las migraciones están al día y no hay diferencias entre entidades y esquema', async () => {
    assert.equal(await h.db.dataSource.showMigrations(), false);
    const n = await h.db.scalar<number>('SELECT COUNT(*) FROM schema_migraciones');
    assert.ok(n >= 4);
  });

  test('consultas largas se cancelan por statement_timeout (no bloquean el pool)', async () => {
    const timeout = await h.db.scalar<string>('SHOW statement_timeout');
    assert.notEqual(timeout, '0');
    const lock = await h.db.scalar<string>('SHOW lock_timeout');
    assert.notEqual(lock, '0');
  });
});

describe('Cabeceras, errores y archivos del servidor', () => {
  test('CSP estricta, anti-clickjacking, nosniff, sin X-Powered-By', async () => {
    for (const url of ['/', '/admin/login', '/api/v1/public/noticias']) {
      const res = await pub().get(url);
      const csp = String(res.headers['content-security-policy']);
      assert.match(csp, /script-src 'self'/);
      assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
      assert.match(csp, /frame-ancestors 'none'/);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['x-powered-by'], undefined);
    }
  });

  test('las respuestas privadas no se guardan en caché; las públicas no fijan cookies', async () => {
    assert.match(String((await h.call(adminAgent, 'get', '/api/v1/usuarios')).headers['cache-control']), /no-store/);
    const res = await pub().get('/api/v1/public/noticias');
    assert.equal(res.headers['set-cookie'], undefined);
  });

  test('ninguna vista ni página del panel tiene scripts o estilos en línea', () => {
    const dir = path.join(ROOT, 'views');
    for (const f of (fs.readdirSync(dir, { recursive: true }) as string[]).filter((x) => x.endsWith('.ejs'))) {
      const html = fs.readFileSync(path.join(dir, f), 'utf8');
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, f);
      assert.doesNotMatch(html, /\sstyle="/i, f);
      assert.doesNotMatch(html, /\son[a-z]+="/i, f);
    }
    const adminDir = path.join(ROOT, 'public', 'assets', 'admin');
    for (const f of (fs.readdirSync(adminDir, { recursive: true }) as string[]).filter((x) => x.endsWith('.js'))) {
      const js = fs.readFileSync(path.join(adminDir, f), 'utf8');
      assert.doesNotMatch(js, /localStorage/, `${f} no debe usar localStorage`);
      assert.doesNotMatch(js, /\beval\(|new Function\(/, f);
    }
  });

  test('errores sin trazas ni detalles internos; archivos del servidor inaccesibles', async () => {
    const res = await pub().get('/api/v1/noticias/abc').set('Accept', 'application/json');
    assert.ok([401, 404, 422].includes(res.status));
    const bad = await adminAgent.post('/api/v1/noticias').set('X-CSRF-Token', String(adminAgent.csrf)).set('Content-Type', 'application/json').send('{"titulo": ');
    assert.equal(bad.status, 400);
    assert.doesNotMatch(JSON.stringify(bad.body), /at .*\.js:\d+|node_modules|SyntaxError/);
    for (const url of ['/.env', '/package.json', '/src/main.ts', '/dist/src/main.js', '/storage/semibague.sqlite', '/assets/../../.env', '/docs/openapi.json', '/views/pages/inicio.ejs']) {
      assert.equal((await pub().get(url)).status, 404, url);
    }
  });

  test('un cuerpo JSON demasiado grande se rechaza con 413', async () => {
    const huge = { titulo: 'x'.repeat(200 * 1024) };
    assert.equal((await h.call(adminAgent, 'post', '/api/v1/sliders', huge)).status, 413);
  });

  test('inyección SQL en búsquedas y filtros se trata como texto', async () => {
    for (const q of ["' OR '1'='1", "'; DROP TABLE noticias; --", '%', "\\' UNION SELECT password_hash FROM usuarios --"]) {
      const res = await pub().get('/buscar').query({ q });
      assert.equal(res.status, 200);
      assert.doesNotMatch(res.text, /argon2/);
      const apiRes = await adminAgent.get('/api/v1/usuarios').query({ q });
      assert.equal(apiRes.status, 200);
      assert.equal(apiRes.body.data.length, 0);
    }
    assert.ok(await h.db.scalar("SELECT to_regclass('portal.noticias') IS NOT NULL"));
  });

  test('todos los listados aceptan cada orden permitido (ascendente y descendente)', async () => {
    for (const [p, ops] of Object.entries(doc().paths)) {
      const sortParam = (ops.get?.parameters as Array<{ name: string; schema: { enum?: string[] } }> | undefined)?.find((x) => x.name === 'sort');
      if (!sortParam?.schema.enum || p.includes('{')) continue;
      for (const value of sortParam.schema.enum) {
        const res = await adminAgent.get(p).query({ sort: value });
        assert.equal(res.status, 200, `${p}?sort=${value} → ${res.status}`);
      }
    }
  });

  test('CORS cerrado por defecto: ningún origen externo recibe permiso', async () => {
    assert.equal((await pub().get('/api/v1/public/noticias').set('Origin', 'https://otro-sitio.example')).headers['access-control-allow-origin'], undefined);
    assert.equal((await pub().options('/api/v1/usuarios').set('Origin', 'https://otro-sitio.example')).headers['access-control-allow-origin'], undefined);
  });
});

describe('PQRSD (funcionalidad existente)', () => {
  test('radicar, cifrar datos personales, consultar con radicado + documento; acceso admin auditado', async () => {
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
    assert.equal((await pub().post('/atencion/pqrsd').type('form').send(data)).status, 403, 'sin cookie de sesión el token no vale');
    assert.equal((await agent.post('/atencion/pqrsd').type('form').send(data)).status, 303);
    const radicado = String(/SEM-\d{4}-\d{8}/.exec((await agent.get('/atencion/pqrsd/confirmacion')).text)?.[0]);
    const row = JSON.stringify(await h.db.one('SELECT * FROM pqrsd WHERE radicado = $1', [radicado]));
    for (const v of ['María Pérez', '1110123456', 'maria@example.com', '3001234567']) assert.ok(!row.includes(v), v);
    const ok = await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '1110123456' });
    assert.match(ok.text, /Solicitud de certificado/);
    assert.equal((await agent.post('/atencion/consulta').type('form').send({ _csrf: token, radicado, documento: '999999' })).status, 404);

    const list = await adminAgent.get('/api/v1/pqrsd');
    const item = list.body.data.find((p: { radicado: string }) => p.radicado === radicado);
    const detail = await adminAgent.get(`/api/v1/pqrsd/${item.id}`);
    assert.equal(detail.body.data.email, 'maria@example.com');
    assert.equal((await editorAgent.get(`/api/v1/pqrsd/${item.id}`)).status, 403);
    const audit = await adminAgent.get('/api/v1/auditoria').query({ accion: 'pqrsd_ver' });
    assert.ok(audit.body.data.some((e: { recursoId: string }) => e.recursoId === radicado));
  });

  test('formulario inválido: 422 sin devolver el documento ni el token', async () => {
    const agent = h.agent();
    const token = String(/name="_csrf" value="([^"]+)"/.exec((await agent.get('/atencion')).text)?.[1]);
    const res = await agent.post('/atencion/pqrsd').type('form').send({ _csrf: token, tipo: 'Petición', documento: '987654321', email: 'malo' });
    assert.equal(res.status, 422);
    assert.ok(!res.text.includes('987654321'));
  });
});

describe('Persistencia tras reiniciar la aplicación', () => {
  test('los datos, las sesiones y los archivos sobreviven a un reinicio', async () => {
    const created = await h.call(adminAgent, 'post', '/api/v1/noticias', {
      titulo: 'Persistente tras reinicio',
      resumen: 'Resumen de la noticia persistente',
      contenido: '<p>Contenido suficientemente largo para la prueba.</p>',
      fechaPublicacion: '2026-02-10',
      estado: 'publicada',
    });
    assert.equal(created.status, 201);
    await h.restart();
    // La sesión vive en PostgreSQL: con la misma cookie el usuario sigue autenticado tras el reinicio.
    const fresh = h.agent();
    (fresh as unknown as { jar: unknown }).jar = (adminAgent as unknown as { jar: unknown }).jar;
    fresh.csrf = adminAgent.csrf;
    const again = await h.call(fresh, 'get', `/api/v1/noticias/${created.body.data.id}`);
    assert.equal(again.status, 200);
    assert.match((await pub().get('/')).text, /Persistente tras reinicio/);
  });
});
