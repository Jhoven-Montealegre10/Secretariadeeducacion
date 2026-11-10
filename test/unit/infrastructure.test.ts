/** Utilidades de infraestructura sin base de datos: SQL seguro, criptografía, caché, estadísticas y errores. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { describe, test } from 'node:test';
import { AuditService } from '../../src/application/audit.service';
import { device, source } from '../../src/application/stats.service';
import { AppError } from '../../src/domain/errors';
import type { AppConfig } from '../../src/config/configuration';
import { PublicCache } from '../../src/infrastructure/cache/public-cache.service';
import type { Db } from '../../src/infrastructure/database/db.service';
import { clampPage, likePattern, orderBy, toMs, Where } from '../../src/infrastructure/database/sql';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';
import { FileStorage } from '../../src/infrastructure/storage/file-storage';
import { normalizeError } from '../../src/presentation/http/errors/error.filter';

describe('Construcción de SQL', () => {
  test('Where numera los parámetros y nunca inserta valores en el texto SQL', () => {
    const w = new Where().add('a = ?', "x'; DROP TABLE t; --").addIf(false, 'b = ?', 1).addIf(true, 'c ILIKE ? OR d ILIKE ?', '%a%', '%b%');
    assert.equal(w.sql, 'WHERE (a = $1) AND (c ILIKE $2 OR d ILIKE $3)');
    assert.deepEqual(w.params, ["x'; DROP TABLE t; --", '%a%', '%b%']);
    assert.equal(w.next(20), '$4');
    assert.ok(!w.sql.includes('DROP'));
  });

  test('Where detecta marcadores y valores que no coinciden', () => {
    assert.throws(() => new Where().add('a = ? AND b = ?', 1), /Faltan valores/);
    assert.throws(() => new Where().add('a = ?', 1, 2), /Sobran valores/);
  });

  test('orderBy solo acepta columnas de la lista blanca y desempata por id', () => {
    const allowed = { titulo: 'n.titulo' };
    assert.equal(orderBy('-titulo', allowed, 'n.id DESC', 'n.id'), 'ORDER BY n.titulo DESC, n.id DESC');
    assert.equal(orderBy('titulo; DROP TABLE x', allowed, 'n.id DESC'), 'ORDER BY n.id DESC');
    assert.equal(orderBy('constructor', allowed, 'n.id DESC'), 'ORDER BY n.id DESC', 'sin acceso al prototipo');
  });

  test('likePattern escapa comodines para buscar texto literal', () => {
    assert.equal(likePattern('100%_\\'), '%100\\%\\_\\\\%');
  });

  test('clampPage aplica límites máximos de paginación', () => {
    assert.deepEqual(clampPage(3, 500), { page: 3, pageSize: 100, offset: 200 });
    assert.deepEqual(clampPage(-1, 0), { page: 1, pageSize: 20, offset: 0 });
    assert.equal(clampPage(10 ** 9, 10).page, 10_000);
  });

  test('toMs interpreta las marcas de tiempo de la API como UTC', () => {
    assert.equal(toMs('2026-11-10 05:00:00'), Date.parse('2026-11-10T05:00:00Z'));
    assert.equal(toMs(null), null);
    assert.equal(toMs('no es fecha'), null);
  });
});

describe('Criptografía', () => {
  const svc = new CryptoService({ dataKey: crypto.randomBytes(32) });

  test('AES-256-GCM: cifra con IV aleatorio, descifra y detecta manipulación', () => {
    const a = svc.encrypt('dato personal');
    const b = svc.encrypt('dato personal');
    assert.notEqual(a, b);
    assert.equal(svc.decrypt(a), 'dato personal');
    const parts = String(a).split(':');
    parts[3] = Buffer.from('otro contenido').toString('base64');
    assert.throws(() => svc.decrypt(parts.join(':')));
    assert.equal(svc.encrypt(''), null);
    assert.equal(svc.decrypt(null), '');
  });

  test('otra clave no puede descifrar', () => {
    const other = new CryptoService({ dataKey: crypto.randomBytes(32) });
    assert.throws(() => other.decrypt(svc.encrypt('secreto')));
  });

  test('índice ciego estable e insensible a mayúsculas; claves separadas por propósito', () => {
    assert.equal(svc.blindIndex(' ABC123 '), svc.blindIndex('abc123'));
    assert.notEqual(svc.blindIndex('x'), svc.tokenHash('x'));
  });

  test('la cadena de auditoría cambia si cambia cualquier campo o el eslabón anterior', () => {
    const row = {
      usuarioId: 1,
      usuarioEmail: 'a@example.gov.co',
      accion: 'login',
      recurso: 'usuario',
      recursoId: '1',
      resultado: 'exito',
      detalle: '',
      ipHash: null,
      creadoEn: '2026-11-10 12:00:00',
    };
    const h1 = svc.auditChainHash('genesis', row);
    assert.notEqual(h1, svc.auditChainHash('genesis', { ...row, detalle: 'x' }));
    assert.notEqual(h1, svc.auditChainHash('otro', row));
    assert.equal(h1, svc.auditChainHash('genesis', { ...row }));
  });
});

describe('Auditoría: detalles sin secretos', () => {
  test('omite detalles con forma de código, token o hash', () => {
    assert.equal(AuditService.safeDetail('código 123456'), '[detalle omitido]');
    assert.equal(AuditService.safeDetail('token abcdefghijklmnopqrstuvwxyz012345'), '[detalle omitido]');
    assert.equal(AuditService.safeDetail('$argon2id$v=19$m=...'), '[detalle omitido]');
    assert.equal(AuditService.safeDetail('rol editor → administrador'), 'rol editor → administrador');
    assert.equal(AuditService.safeDetail('palabra '.repeat(60)).length, 300, 'texto largo se recorta');
  });
});

describe('Almacenamiento de archivos', () => {
  test('solo acepta nombres internos generados (sin rutas)', () => {
    const fsx = new FileStorage(`${process.env.TMPDIR ?? '/tmp'}/sem-unit-${crypto.randomBytes(4).toString('hex')}`);
    const name = fsx.newName('png');
    assert.match(name, /^[a-f0-9]{32}\.png$/);
    assert.ok(fsx.resolve(name));
    for (const bad of ['../package.json', '/etc/passwd', 'a.png', `${'a'.repeat(32)}.png/../x`, `${'a'.repeat(32)}.png\0.js`])
      assert.equal(fsx.resolve(bad), null, bad);
  });
});

describe('Estadísticas: clasificación sin datos personales', () => {
  test('dispositivo deducido del navegador', () => {
    assert.equal(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile'), 'movil');
    assert.equal(device('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'tablet');
    assert.equal(device('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'escritorio');
    assert.equal(device('raro'), 'otro');
  });

  test('fuente: solo el dominio, nunca la URL completa', () => {
    assert.deepEqual(source('https://www.google.com/search?q=mi+cedula', 'portal.example.gov.co', false), { fuente: 'buscador', dominio: 'www.google.com' });
    assert.deepEqual(source('https://portal.example.gov.co/noticias', 'portal.example.gov.co', false), { fuente: 'interno', dominio: null });
    assert.deepEqual(source('', 'x', false), { fuente: 'directo', dominio: null });
    assert.deepEqual(source('https://m.facebook.com/x', 'x', false), { fuente: 'redes_sociales', dominio: 'm.facebook.com' });
    assert.deepEqual(source('https://www.google.com', 'x', true), { fuente: 'campana', dominio: null });
    assert.deepEqual(source('no-es-url', 'x', false), { fuente: 'directo', dominio: null });
  });
});

describe('Caché pública', () => {
  const fakeDb = { afterCommit: (fn: () => unknown) => void fn(), run: async () => 0 } as unknown as Db;
  const config = { cache: { ttlSeconds: 60, maxEntries: 2 }, isTest: true, instanceId: 't' } as AppConfig;

  test('comparte cargas simultáneas de la misma clave y respeta el máximo de entradas', async () => {
    const cache = new PublicCache(config, fakeDb);
    let loads = 0;
    const loader = async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 10));
      return 'valor';
    };
    const values = await Promise.all([cache.get('a', loader), cache.get('a', loader), cache.get('a', loader)]);
    assert.deepEqual(values, ['valor', 'valor', 'valor']);
    assert.equal(loads, 1, 'una sola consulta para tres peticiones');
    await cache.get('b', loader);
    await cache.get('c', loader);
    assert.equal(cache.stats().entries, 2, 'expulsa la entrada más antigua');
  });

  test('invalidar vacía la caché y descarta cargas en curso con datos viejos', async () => {
    const cache = new PublicCache(config, fakeDb);
    let release!: () => void;
    const slow = cache.get('k', () => new Promise<string>((r) => (release = () => r('viejo'))));
    cache.invalidate();
    release();
    assert.equal(await slow, 'viejo');
    assert.equal(await cache.get('k', async () => 'nuevo'), 'nuevo', 'el valor viejo no quedó guardado');
  });

  test('con TTL 0 la caché queda desactivada', async () => {
    const cache = new PublicCache({ ...config, cache: { ttlSeconds: 0, maxEntries: 10 } }, fakeDb);
    let n = 0;
    await cache.get('x', async () => ++n);
    await cache.get('x', async () => ++n);
    assert.equal(n, 2);
  });
});

describe('Normalización de errores', () => {
  test('errores de base de datos por tiempo o bloqueo → 503 reintentable, sin detalles', () => {
    for (const code of ['57014', '55P03', '40P01']) {
      const e = normalizeError(Object.assign(new Error('canceling statement due to statement timeout'), { code }));
      assert.equal(e.status, 503, code);
      assert.equal(e.code, 'SERVICE_BUSY');
      assert.doesNotMatch(e.message, /statement|timeout/);
    }
    assert.equal(normalizeError(new Error('timeout exceeded when trying to connect')).status, 503);
  });

  test('errores desconocidos → 500 genérico; errores de cuerpo → 400/413; AppError se conserva', () => {
    const e = normalizeError(new Error('detalle interno /home/x.js:12'));
    assert.equal(e.status, 500);
    assert.doesNotMatch(e.message, /interno|\.js/);
    assert.equal(normalizeError({ type: 'entity.too.large' }).status, 413);
    assert.equal(normalizeError({ type: 'entity.parse.failed' }).status, 400);
    const app = new AppError('x', { status: 418, code: 'TEAPOT' });
    assert.equal(normalizeError(app), app);
  });
});
