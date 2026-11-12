'use strict';
/**
 * Ejecuta las pruebas igual en Windows, Linux y macOS, sin depender de la sintaxis del shell
 * (por ejemplo `NODE_ENV=test comando`, que no funciona en PowerShell ni en cmd).
 *
 *   node scripts/run-tests.js unit          → pruebas unitarias (sin base de datos)
 *   node scripts/run-tests.js integration   → integración contra PostgreSQL real (TEST_PG_ADMIN_URL)
 *   node scripts/run-tests.js all           → ambas (predeterminado)
 *
 * Compila primero con TypeScript y luego ejecuta node:test sobre dist/. Ejecutables fijos y
 * argumentos separados: no se interpreta ningún comando de shell.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const kind = process.argv[2] || 'all';
const suites = { unit: ['unit'], integration: ['integration'], all: ['unit', 'integration'] }[kind];
if (!suites) {
  console.error(`Tipo de prueba desconocido: ${kind}. Use unit, integration o all.`);
  process.exit(2);
}

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });
if (run([tsc, '-p', 'tsconfig.json']) !== 0) process.exit(1);

let status = 0;
for (const suite of suites) {
  const dir = path.join(root, 'dist', 'test', suite);
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.test.js'))
        .sort()
        .map((name) => path.join('dist', 'test', suite, name))
    : [];
  if (!files.length) {
    console.error(`No se encontraron pruebas en dist/test/${suite}.`);
    status = 1;
    continue;
  }
  // La integración comparte un servidor PostgreSQL de pruebas: un archivo a la vez.
  const concurrency = suite === 'integration' ? ['--test-concurrency=1'] : [];
  const code = run(['--enable-source-maps', '--test', ...concurrency, ...files], { ...process.env, NODE_ENV: 'test' });
  if (code !== 0) status = code;
}
process.exitCode = status;
