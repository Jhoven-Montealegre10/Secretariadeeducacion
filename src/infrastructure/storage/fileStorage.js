'use strict';
/**
 * Almacenamiento en disco FUERA de la carpeta pública, con permisos mínimos
 * (carpetas 0750, archivos 0640, nunca ejecutables) y nombres internos aleatorios.
 * Los nombres solo se aceptan si tienen el formato generado: impide rutas como "../".
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const NAME_RE = /^[a-f0-9]{32}(?:-t)?\.[a-z0-9]{2,4}$/;

function createStorage(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });

  const resolve = (name) => (NAME_RE.test(String(name)) ? path.join(dir, name) : null);

  return {
    newName(extension, { thumbnail = false } = {}) {
      return `${crypto.randomBytes(16).toString('hex')}${thumbnail ? '-t' : ''}.${extension}`;
    },
    save(name, buffer) {
      const file = resolve(name);
      if (!file) throw new Error('Nombre de archivo interno inválido');
      fs.writeFileSync(file, buffer, { mode: 0o640, flag: 'wx' });
      return name;
    },
    path: resolve,
    exists(name) {
      const file = resolve(name);
      return !!file && fs.existsSync(file);
    },
    remove(name) {
      const file = resolve(name);
      if (file) fs.rmSync(file, { force: true });
    },
  };
}

module.exports = { createStorage };
