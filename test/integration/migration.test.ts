/**
 * Migración SQLite → PostgreSQL de punta a punta: respaldo verificado, importación conservando IDs,
 * conversiones de tipos, secuencias, verificación, reversión ante errores y uso del sistema migrado.
 * Los datos son ficticios y se generan en la prueba (nunca datos reales).
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import request from 'supertest';
import { PERMISOS_EDITOR, TODOS } from '../../src/domain/permissions';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';
import { PasswordHasher } from '../../src/infrastructure/security/password-hasher.service';
import { TotpService } from '../../src/infrastructure/security/totp.service';
import { createHarness, PASSWORD, pngBuffer, type Harness } from '../support/harness';

const ROOT = path.resolve(__dirname, '..', '..', '..');
let h: Harness;
let work: string;
let sqliteFile: string;
let mfaSecret: string;

/** Construye una base SQLite con el esquema anterior y datos ficticios coherentes. */
async function buildLegacy(dataKey: string): Promise<void> {
  const c = new CryptoService({ dataKey: Buffer.from(dataKey, 'base64') });
  const totp = new TotpService({ mfa: { issuer: 'Pruebas' } });
  const hash = await new PasswordHasher().hash(PASSWORD);
  mfaSecret = totp.createSecret();
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-migr-'));
  fs.mkdirSync(path.join(work, 'media'));
  fs.mkdirSync(path.join(work, 'uploads'));
  const img = `${crypto.randomBytes(16).toString('hex')}.png`;
  fs.writeFileSync(path.join(work, 'media', img), await pngBuffer());
  const pdf = `${crypto.randomBytes(16).toString('hex')}.pdf`;
  fs.writeFileSync(path.join(work, 'uploads', pdf), Buffer.from('%PDF-1.4\n% documento ficticio\n'));

  sqliteFile = path.join(work, 'semibague.sqlite');
  const db = new DatabaseSync(sqliteFile);
  db.exec(fs.readFileSync(path.join(ROOT, 'test/fixtures/sqlite-v3-esquema.sql'), 'utf8'));
  db.exec(`
    INSERT INTO roles (id, slug, nombre, descripcion, sistema, creado_en, actualizado_en) VALUES
      (1, 'administrador', 'Administrador', 'Acceso total', 1, '2025-01-01 10:00:00', '2025-01-01 10:00:00'),
      (2, 'editor', 'Editor', 'Contenidos', 1, '2025-01-01 10:00:00', '2025-01-01 10:00:00'),
      (7, 'comunicaciones', 'Comunicaciones', '', 0, '2025-02-01 10:00:00', '2025-02-01 10:00:00');
  `);
  const perms = db.prepare('INSERT INTO rol_permisos (rol_id, permiso) VALUES (?, ?)');
  for (const p of TODOS.filter((x) => x !== 'system.read')) perms.run(1, p);
  for (const p of PERMISOS_EDITOR) perms.run(2, p);
  for (const p of ['dashboard.access', 'news.read']) perms.run(7, p);
  const users = db.prepare(
    `INSERT INTO usuarios (id, email, nombre, password_hash, rol_id, activo, bloqueado_hasta, mfa_secreto_enc, mfa_activo, mfa_ultimo_paso, auth_version, creado_en, actualizado_en, password_actualizada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 3, '2025-01-01 10:00:00', '2025-01-01 10:00:00', '2025-01-01 10:00:00')`,
  );
  users.run(3, 'Admin.Migrado@Example.gov.co', 'Admin Migrado', hash, 1, 1, null, c.encrypt(mfaSecret), 1);
  users.run(12, 'editora@example.gov.co', 'Editora', hash, 2, 1, Date.now() + 3_600_000, null, 0);
  users.run(15, 'retirado@example.gov.co', 'Retirado', hash, 7, 0, null, null, 0);
  db.prepare(
    `INSERT INTO medios (id, tipo, mime, extension, archivo, nombre_visible, nombre_original, tamano, ancho, alto, texto_alternativo, visibilidad, subido_por, creado_en, actualizado_en)
     VALUES (40, 'imagen', 'image/png', 'png', ?, 'Foto', 'foto.png', 100, 40, 30, 'Alt', 'privada', 3, '2025-03-01 08:00:00', '2025-03-01 08:00:00')`,
  ).run(img);
  db.exec(`
    INSERT INTO noticias (id, slug, titulo, resumen, contenido, categoria, estado, fecha_publicacion, imagen_id, creado_por, creado_en, actualizado_en)
      VALUES (90, 'noticia-migrada', 'Noticia migrada', 'Resumen migrado', '<p>Contenido migrado de la noticia.</p>', 'Cobertura', 'publicada', '2025-03-02', 40, 12, '2025-03-02 09:00:00', '2025-03-02 09:00:00');
    INSERT INTO noticia_fotos (noticia_id, medio_id, orden) VALUES (90, 40, 0);
    INSERT INTO paginas (id, slug, titulo, resumen, bloques, estado, sistema, publicada_en, creado_en, actualizado_en)
      VALUES (1, 'secretaria', 'La Secretaría', '', '[{"tipo":"texto","html":"<p>Misión migrada</p>"},{"tipo":"imagen","medioId":40}]', 'publicada', 1, '2025-01-01 10:00:00', '2025-01-01 10:00:00', '2025-01-01 10:00:00'),
             (33, 'borrador-migrado', 'Borrador', '', '[]', 'borrador', 0, NULL, '2025-01-05 10:00:00', '2025-01-05 10:00:00');
    INSERT INTO sliders (id, nombre, ubicacion, activo, creado_en, actualizado_en) VALUES (5, 'Portada', 'inicio', 1, '2025-01-01 10:00:00', '2025-01-01 10:00:00');
    INSERT INTO diapositivas (id, slider_id, medio_id, titulo, orden, activa, creado_en, actualizado_en) VALUES (8, 5, 40, 'Diapositiva migrada', 0, 1, '2025-01-01 10:00:00', '2025-01-01 10:00:00');
    INSERT INTO medios_usos (medio_id, entidad, entidad_id, publicado) VALUES (40, 'noticia', 90, 1), (40, 'pagina', 1, 1), (40, 'diapositiva', 8, 1);
    INSERT INTO instituciones (id, nombre, zona) VALUES (2, 'IE Ficticia Uno', 'Urbana'), (9, 'IE Ficticia Dos', 'Rural');
    INSERT INTO visitas (id, fecha, ruta, visitante, fuente, dispositivo) VALUES (1, '2025-03-01', '/', 'abc', 'directo', 'movil'), (2, '2025-03-01', '/noticias', 'abc', 'buscador', 'movil');
    INSERT INTO sales_estadisticas (fecha, sal) VALUES ('2025-03-01', 'sal-ficticia');
  `);
  db.prepare("INSERT INTO documentos (id, tipo, numero, anio, fecha, asunto, archivo, nombre_original, tamano, autor_id, creado_en) VALUES (4, 'circular', '001', 2025, '2025-02-01', 'Circular ficticia', ?, 'c.pdf', 30, 3, '2025-02-01 10:00:00')").run(pdf);
  db.prepare(
    `INSERT INTO pqrsd (id, radicado, tipo, estado, tipo_documento, documento_hash, documento_enc, nombre_enc, email_enc, telefono_enc, asunto_enc, mensaje_enc, creado_en, actualizado_en)
     VALUES (6, 'SEM-2025-00000006', 'Petición', 'Radicada', 'Cédula de ciudadanía', ?, ?, ?, ?, NULL, ?, ?, '2025-03-03 10:00:00', '2025-03-03 10:00:00')`,
  ).run(c.blindIndex('1234567'), c.encrypt('1234567'), c.encrypt('Persona Ficticia'), c.encrypt('ficticia@example.com'), c.encrypt('Asunto ficticio'), c.encrypt('Mensaje ficticio de prueba'));
  db.prepare("INSERT INTO tokens_recuperacion (id, usuario_id, token_hash, expira_en, creado_en) VALUES (2, 12, 'hash-ficticio', ?, '2025-03-01 10:00:00')").run(Date.now() - 1000);
  // Cadena de auditoría válida con la clave del sistema.
  let previous = 'genesis';
  const ins = db.prepare('INSERT INTO auditoria_eventos (id, usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, ip_hash, creado_en, hash_anterior, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 1; i <= 5; i++) {
    const row = { usuarioId: 3, usuarioEmail: 'admin.migrado@example.gov.co', accion: 'login', recurso: 'usuario', recursoId: '3', resultado: 'exito', detalle: `evento ${i}`, ipHash: 'abc', creadoEn: `2025-03-0${i} 10:00:00` };
    const hsh = c.auditChainHash(previous, row);
    ins.run(i, row.usuarioId, row.usuarioEmail, row.accion, row.recurso, row.recursoId, row.resultado, row.detalle, row.ipHash, row.creadoEn, previous, hsh);
    previous = hsh;
  }
  db.exec("INSERT INTO sesiones (sid, data, expira, usuario_id) VALUES ('sid-antigua', '{}', 0, 3)");
  db.close();
}

function runTool(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, [path.join(ROOT, 'dist/scripts/migracion/sqlite-a-postgres.js'), ...args], { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8' });
}

before(async () => {
  h = await createHarness();
  await buildLegacy(h.config.dataKey.toString('base64'));
});
after(async () => {
  await h?.close();
  if (work) fs.rmSync(work, { recursive: true, force: true });
});

describe('Respaldo previo', () => {
  test('el respaldo copia la base y los archivos y verifica la restauración', () => {
    const dest = path.join(work, 'respaldos');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'dist/scripts/migracion/respaldo-sqlite.js'), '--sqlite', sqliteFile, '--destino', dest], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const dir = path.join(dest, fs.readdirSync(dest)[0]);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifiesto.json'), 'utf8'));
    assert.equal(manifest.verificacion.integridadSqlite, true);
    assert.equal(manifest.verificacion.filasCoinciden, true);
    assert.equal(manifest.media.length, 1);
    assert.equal(manifest.uploads.length, 1);
  });
});

describe('Migración', () => {
  let env: NodeJS.ProcessEnv;
  before(() => {
    env = {
      NODE_ENV: 'test',
      DB_HOST: h.config.db.host,
      DB_PORT: String(h.config.db.port),
      DB_NAME: h.config.db.database,
      DB_MIGRATION_USER: h.config.db.migrationUser,
      DB_MIGRATION_PASSWORD: h.config.db.migrationPassword,
      DB_PASSWORD: h.config.db.password,
      DATA_ENCRYPTION_KEY: h.config.dataKey.toString('base64'),
      MEDIA_DIR: h.config.mediaDir,
      UPLOADS_DIR: h.config.uploadsDir,
    };
  });

  test('con una clave de cifrado distinta la verificación falla y el destino queda sin cambios', () => {
    const r = runTool(['--sqlite', sqliteFile, '--media', path.join(work, 'media'), '--uploads', path.join(work, 'uploads')], { ...env, DATA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /FALLÓ|revirtió/);
  });

  test('simulacro: verifica todo y revierte', async () => {
    const r = runTool(['--sqlite', sqliteFile, '--media', path.join(work, 'media'), '--uploads', path.join(work, 'uploads'), '--simulacro'], env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Resultado: OK \(simulacro/);
    assert.equal(await h.db.scalar<number>('SELECT COUNT(*) FROM usuarios'), 0);
  });

  test('migración real: conserva IDs, relaciones, tipos y archivos; informe completo', async () => {
    const informe = path.join(work, 'informe.json');
    const r = runTool(['--sqlite', sqliteFile, '--media', path.join(work, 'media'), '--uploads', path.join(work, 'uploads'), '--informe', informe], env);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const rep = JSON.parse(fs.readFileSync(informe, 'utf8'));
    assert.equal(rep.resultado, 'OK');
    assert.ok(rep.tablas.every((t: { coincide: boolean }) => t.coincide));
    assert.equal(rep.auditoria.cadenaIntegra, true);
    assert.ok(rep.noMigradas.sesiones);

    const u = await h.db.one<{ id: number; email: string; activo: boolean; bloqueado_hasta: string | null }>("SELECT id, email, activo, bloqueado_hasta FROM usuarios WHERE id = 12");
    assert.equal(u?.email, 'editora@example.gov.co');
    assert.equal(u?.activo, true, 'entero 1 → boolean');
    assert.ok(u?.bloqueado_hasta, 'milisegundos → timestamptz');
    assert.equal(await h.db.scalar('SELECT email FROM usuarios WHERE id = 3'), 'admin.migrado@example.gov.co', 'correo normalizado');
    assert.equal(await h.db.scalar("SELECT jsonb_typeof(bloques) FROM paginas WHERE id = 1"), 'array', 'texto JSON → jsonb');
    assert.equal(await h.db.scalar('SELECT imagen_id FROM noticias WHERE id = 90'), 40, 'la relación con el medio se conserva');
    assert.equal(await h.db.scalar("SELECT to_char(creado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') FROM noticias WHERE id = 90"), '2025-03-02 09:00:00', 'hora UTC conservada');
    assert.equal(await h.db.scalar('SELECT COUNT(*) FROM sesiones'), 0, 'las sesiones no se migran');
    assert.ok(fs.existsSync(path.join(h.config.mediaDir, String(await h.db.scalar('SELECT archivo FROM medios WHERE id = 40')))));

    // Secuencias ajustadas: el siguiente ID continúa después del máximo migrado.
    const nextId = await h.db.scalar<number>("INSERT INTO instituciones (nombre, zona) VALUES ('IE Nueva', 'Rural') RETURNING id");
    assert.equal(nextId, 10);
  });

  test('no se puede ejecutar dos veces sobre el mismo destino', () => {
    const r = runTool(['--sqlite', sqliteFile, '--media', path.join(work, 'media'), '--uploads', path.join(work, 'uploads')], env);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ya tiene usuarios/);
  });

  test('solo verificar: detecta una diferencia introducida después de la migración', async () => {
    await h.db.run("UPDATE noticias SET titulo = 'Cambiada después' WHERE id = 90");
    const r = runTool(['--sqlite', sqliteFile, '--media', path.join(work, 'media'), '--uploads', path.join(work, 'uploads'), '--solo-verificar'], env);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /✗ noticias/);
    await h.db.run("UPDATE noticias SET titulo = 'Noticia migrada' WHERE id = 90");
  });

  test('el sistema migrado funciona: login con la contraseña y el segundo factor de antes', async () => {
    const agent = h.agent();
    const token = await h.csrf(agent);
    const r1 = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: 'ADMIN.MIGRADO@example.gov.co', password: PASSWORD });
    assert.equal(r1.status, 200, JSON.stringify(r1.body));
    const r2 = await agent.post('/api/v1/auth/mfa/verificar').set('X-CSRF-Token', r1.body.data.csrfToken).send({ codigo: h.totp.generate(mfaSecret) });
    assert.equal(r2.status, 200, JSON.stringify(r2.body));
    agent.csrf = r2.body.data.csrfToken;
    const pq = await h.call(agent, 'get', '/api/v1/pqrsd/6');
    assert.equal(pq.body.data.nombre, 'Persona Ficticia', 'PQRSD descifrada con la misma clave');
    assert.equal((await h.call(agent, 'get', '/api/v1/auditoria/integridad')).body.data.integra, true);
    const home = (await request(h.app.getHttpServer()).get('/')).text;
    assert.match(home, /Noticia migrada/);
    assert.match(home, /Diapositiva migrada/);
    assert.match((await request(h.app.getHttpServer()).get('/secretaria')).text, /Misión migrada/);
    assert.equal((await request(h.app.getHttpServer()).get('/borrador-migrado')).status, 404);
    const media = String(await h.db.scalar('SELECT archivo FROM medios WHERE id = 40'));
    assert.equal((await request(h.app.getHttpServer()).get(`/media/${media}`)).status, 200);
  });
});
