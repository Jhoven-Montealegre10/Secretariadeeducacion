/** Secretos: lectura desde archivos, prohibición del entorno en producción, llaveros y rotación de claves. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { secretAgeWarnings } from '../../src/config/configuration';
import {
  fingerprint,
  formatKeyring,
  keyCreatedAt,
  newKeyId,
  parseKeyring,
  parseSecretList,
  SecretError,
  SecretSource,
  writeSecretFile,
} from '../../src/config/secrets';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-secretos-unit-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (name: string, content: string, mode = 0o600) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, { mode });
  fs.chmodSync(p, mode);
  return p;
};
const key = () => crypto.randomBytes(32);

describe('Origen de los secretos', () => {
  test('NOMBRE_FILE, SECRETS_DIR (también en minúsculas) y CREDENTIALS_DIRECTORY de systemd; sin el salto de línea final', () => {
    const p = file('pw_explicita', 'desde-archivo\n');
    const src = (env: NodeJS.ProcessEnv) => new SecretSource({ env, isProd: true, warn: () => undefined });
    assert.equal(src({ DB_PASSWORD_FILE: p }).resolve('DB_PASSWORD')?.value, 'desde-archivo');
    file('SMTP_URL', 'smtps://usuario:clave@correo.example.gov.co\n');
    assert.equal(src({ SECRETS_DIR: dir }).resolve('SMTP_URL')?.value, 'smtps://usuario:clave@correo.example.gov.co');
    file('session_secrets', 'minusculas\n');
    assert.equal(src({ CREDENTIALS_DIRECTORY: dir }).resolve('SESSION_SECRETS')?.value, 'minusculas');
    assert.equal(src({ SECRETS_DIR: dir }).resolve('NO_EXISTE'), null);
  });

  test('en producción un secreto en variable de entorno se rechaza; en desarrollo y pruebas se permite', () => {
    assert.throws(() => new SecretSource({ env: { DB_PASSWORD: 'x' }, isProd: true }).resolve('DB_PASSWORD'), SecretError);
    assert.equal(new SecretSource({ env: { DB_PASSWORD: 'x' }, isProd: false }).resolve('DB_PASSWORD')?.value, 'x');
  });

  test('el archivo tiene prioridad sobre el entorno; rutas relativas, archivos inexistentes o vacíos se rechazan', () => {
    const p = file('prioridad', 'archivo');
    assert.equal(new SecretSource({ env: { DB_PASSWORD_FILE: p, DB_PASSWORD: 'entorno' }, isProd: false }).resolve('DB_PASSWORD')?.value, 'archivo');
    assert.throws(() => new SecretSource({ env: { X_FILE: 'relativa.txt' }, isProd: false }).resolve('X'), /absoluta/);
    assert.throws(() => new SecretSource({ env: { X_FILE: path.join(dir, 'nada') }, isProd: false }).resolve('X'), /no existe/);
    assert.throws(() => new SecretSource({ env: { X_FILE: file('vacio', '\n') }, isProd: false }).resolve('X'), /vacío/);
  });

  test('permisos: escritura para cualquiera se rechaza; lectura para cualquiera genera un aviso', { skip: process.platform === 'win32' }, () => {
    const warnings: string[] = [];
    assert.throws(() => new SecretSource({ env: { X_FILE: file('abierto', 'v', 0o666) }, isProd: true }).resolve('X'), /escritura a cualquier usuario/);
    new SecretSource({ env: { X_FILE: file('legible', 'v', 0o644) }, isProd: true, warn: (m) => warnings.push(m) }).resolve('X');
    assert.equal(warnings.length, 1);
    assert.ok(!warnings[0].includes('v\n'));
  });

  test('rotación en caliente: si el archivo cambia, se lee el valor nuevo', () => {
    const p = file('rotable', 'clave-1');
    const src = new SecretSource({ env: { DB_PASSWORD_FILE: p }, isProd: false });
    assert.equal(src.reread('DB_PASSWORD', p), 'clave-1');
    fs.writeFileSync(p, 'clave-2');
    fs.utimesSync(p, new Date(), new Date(Date.now() + 5000));
    assert.equal(src.reread('DB_PASSWORD', p), 'clave-2');
  });

  test('escritura atómica con permisos 0600', { skip: process.platform === 'win32' }, () => {
    const p = path.join(dir, 'escrito');
    writeSecretFile(p, 'nuevo\n');
    assert.equal(fs.readFileSync(p, 'utf8'), 'nuevo\n');
    assert.equal(fs.statSync(p).mode & 0o777, 0o600);
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')),
      [],
      'sin temporales',
    );
  });
});

describe('Llaveros', () => {
  test('formato con identificadores, clave retirada y formato anterior de una sola clave (k0)', () => {
    const a = key();
    const b = key();
    const ring = parseKeyring(`# comentario\nk202611160000:${b.toString('base64')}\nk202605010000:${a.toString('base64')}:retirada\n`, 'X');
    assert.deepEqual(
      ring.map((k) => [k.id, k.retired]),
      [
        ['k202611160000', false],
        ['k202605010000', true],
      ],
    );
    assert.deepEqual(parseKeyring(formatKeyring(ring), 'X'), ring, 'ida y vuelta');
    assert.equal(parseKeyring(a.toString('base64'), 'X')[0].id, 'k0');
  });

  test('rechaza claves de tamaño incorrecto, identificadores repetidos o inválidos y llaveros sin clave activa', () => {
    const b64 = key().toString('base64');
    assert.throws(() => parseKeyring(`k1:${Buffer.alloc(16).toString('base64')}`, 'X'), /32 bytes/);
    assert.throws(() => parseKeyring(`k1:${b64}\nk1:${b64}`, 'X'), /repetidos/);
    assert.throws(() => parseKeyring(`k 1:${b64}`, 'X'), /inválido/);
    assert.throws(() => parseKeyring(`k1:${b64}:retirada`, 'X'), /activa/);
    assert.throws(() => parseKeyring(`k1:${b64}:otra`, 'X'), /marca/);
    assert.throws(() => parseSecretList('corto', 'S', 32), /32/);
    assert.deepEqual(parseSecretList(`${'a'.repeat(32)}\n${'b'.repeat(32)}\n`, 'S', 32), ['a'.repeat(32), 'b'.repeat(32)]);
  });

  test('identificador con fecha, edad y huella SHA-256 (sin revelar la clave)', () => {
    const id = newKeyId(new Date('2026-11-16T12:34:56Z'));
    assert.equal(id, 'k202611161234');
    assert.equal(keyCreatedAt(id)?.toISOString(), '2026-11-16T12:34:00.000Z');
    assert.equal(keyCreatedAt('k0'), null);
    const k = key();
    assert.equal(fingerprint(k), crypto.createHash('sha256').update(k).digest('hex').slice(0, 16));
    assert.ok(!fingerprint(k).includes(k.toString('hex').slice(0, 16)));
  });

  test('aviso de rotación cuando la clave vigente supera la política', () => {
    const cfg = (id: string) => ({ dataKeys: [{ id, key: key(), retired: false }], secrets: { maxAgeDays: 90, origins: {} } });
    const now = Date.parse('2026-11-16T00:00:00Z');
    assert.deepEqual(secretAgeWarnings(cfg('k202611010000'), now), []);
    assert.match(secretAgeWarnings(cfg('k202601010000'), now)[0], /días/);
    assert.match(secretAgeWarnings(cfg('k0'), now)[0], /sin fecha|no tiene fecha/);
  });
});

describe('Rotación en CryptoService', () => {
  const A = { id: 'k202605010000', key: key(), retired: false };
  const B = { id: 'k202611160000', key: key(), retired: false };
  const soloA = new CryptoService({ dataKeys: [A] });
  const BA = new CryptoService({ dataKeys: [B, A] });
  const BAretirada = new CryptoService({ dataKeys: [B, { ...A, retired: true }] });

  test('lo cifrado con la clave anterior se descifra tras rotar; lo nuevo usa la vigente', () => {
    const viejo = soloA.encrypt('documento 123') as string;
    assert.equal(BA.decrypt(viejo), 'documento 123');
    assert.equal(BA.isCurrent(viejo), false);
    const nuevo = BA.encrypt('documento 123') as string;
    assert.ok(nuevo.startsWith(`v2:${B.id}:`));
    assert.equal(BA.isCurrent(nuevo), true);
    assert.throws(() => soloA.decrypt(nuevo), /no disponible/, 'una instancia sin la clave nueva no puede leerlo');
  });

  test('formato anterior v1 (versión 3) se descifra con las claves activas', () => {
    const enc = Buffer.from(crypto.hkdfSync('sha256', A.key, Buffer.alloc(0), 'sem-encryption', 32));
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', enc, iv);
    const data = Buffer.concat([c.update('secreto v1', 'utf8'), c.final()]);
    const v1 = ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':');
    assert.equal(BA.decrypt(v1), 'secreto v1');
    assert.throws(() => BAretirada.decrypt(v1), /Ninguna clave/, 'con la clave retirada ya no');
  });

  test('tokens e índices: se guardan con la vigente y se verifican con todas las activas', () => {
    assert.ok(BA.tokenHashAll('token').includes(soloA.tokenHash('token')));
    assert.equal(BA.tokenHash('token'), BA.tokenHashAll('token')[0]);
    assert.ok(BA.blindIndexAll('1234').includes(soloA.blindIndex('1234')));
    assert.ok(!BAretirada.tokenHashAll('token').includes(soloA.tokenHash('token')), 'la retirada ya no valida tokens');
  });

  test('una clave retirada no descifra, pero sigue verificando la auditoría antigua', () => {
    const viejo = soloA.encrypt('x') as string;
    assert.throws(() => BAretirada.decrypt(viejo), /no disponible/);
    const row = {
      usuarioId: 1,
      usuarioEmail: 'a@b.co',
      accion: 'login',
      recurso: null,
      recursoId: null,
      resultado: 'exito',
      detalle: null,
      ipHash: null,
      creadoEn: '2026-11-16 00:00:00',
    };
    const hash = soloA.auditChainHash('genesis', row, A.id);
    assert.equal(BAretirada.verifyAuditLink('genesis', row, hash, A.id), true);
    assert.equal(BAretirada.verifyAuditLink('genesis', row, hash, null), true, 'eventos sin clave registrada');
    assert.equal(BAretirada.verifyAuditLink('genesis', { ...row, accion: 'otra' }, hash, A.id), false, 'detecta alteraciones');
  });

  test('describeKeys solo expone identificadores y huellas', () => {
    const d = BA.describeKeys();
    assert.deepEqual(
      d.map((k) => [k.id, k.vigente]),
      [
        [B.id, true],
        [A.id, false],
      ],
    );
    assert.ok(!JSON.stringify(d).includes(B.key.toString('base64')));
  });
});
