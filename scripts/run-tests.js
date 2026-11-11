'use strict';
/** Ejecuta la misma suite en Windows y Linux sin depender de sintaxis del shell. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const files = fs
  .readdirSync(path.join(root, 'tests'))
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join('tests', name));

if (!files.length) throw new Error('No se encontraron archivos de prueba.');

// Ejecutable fijo y argumentos separados: no se interpreta ningún comando de shell.
const result = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '--test', '--test-concurrency=1', ...files], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'test' },
  stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
