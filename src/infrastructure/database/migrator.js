'use strict';
/**
 * Migraciones versionadas. Cada archivo de ./migrations se aplica una sola vez, en orden,
 * dentro de una transacción. Se guarda su suma de verificación para detectar cambios
 * en migraciones ya aplicadas (que nunca deben editarse: se crea una nueva).
 *   - NNN_nombre.sql → SQL directo
 *   - NNN_nombre.js  → module.exports = { up(db) { ... } } para transformaciones de datos
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { db, transaction } = require('./connection');

const DIR = path.join(__dirname, 'migrations');

db.exec(`CREATE TABLE IF NOT EXISTS schema_migraciones (
  version TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  checksum TEXT NOT NULL,
  aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
)`);

function available() {
  return fs
    .readdirSync(DIR)
    .filter((f) => /^\d{3}_[a-z0-9_]+\.(sql|js)$/.test(f))
    .sort()
    .map((file) => {
      const content = fs.readFileSync(path.join(DIR, file));
      return { version: file.slice(0, 3), nombre: file, checksum: crypto.createHash('sha256').update(content).digest('hex') };
    });
}

function applied() {
  return new Map(
    db
      .prepare('SELECT version, checksum FROM schema_migraciones')
      .all()
      .map((r) => [r.version, r.checksum]),
  );
}

function pending() {
  const done = applied();
  for (const m of available()) {
    if (done.has(m.version) && done.get(m.version) !== m.checksum) {
      throw new Error(`La migración ya aplicada ${m.nombre} fue modificada. Cree una migración nueva en lugar de editarla.`);
    }
  }
  return available().filter((m) => !done.has(m.version));
}

/**
 * Procedimiento recomendado por SQLite para reconstruir tablas: claves foráneas desactivadas
 * durante la migración (así DROP TABLE no dispara ON DELETE en otras tablas) y verificación
 * de integridad con foreign_key_check antes de confirmar cada migración.
 */
/** @param {{ log?: (message: string) => void }} [options] */
function migrate({ log = () => {} } = {}) {
  const list = pending();
  if (!list.length) return 0;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    for (const m of list) {
      transaction(() => {
        const file = path.join(DIR, m.nombre);
        if (m.nombre.endsWith('.sql')) db.exec(fs.readFileSync(file, 'utf8'));
        // eslint-disable-next-line security/detect-non-literal-require -- archivo de ./migrations validado por nombre
        else require(file).up(db);
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length) throw new Error(`La migración ${m.nombre} rompe ${broken.length} referencias de claves foráneas.`);
        db.prepare('INSERT INTO schema_migraciones (version, nombre, checksum) VALUES (?, ?, ?)').run(m.version, m.nombre, m.checksum);
      });
      log(`migración aplicada: ${m.nombre}`);
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  return list.length;
}

module.exports = { migrate, pending };
