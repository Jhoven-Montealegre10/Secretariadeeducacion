'use strict';
/**
 * Genera la especificación OpenAPI desde el código (misma fuente que valida las rutas):
 *   npm run openapi:export          → escribe docs/openapi.json y docs/openapi-publica.json
 *   npm run openapi:check           → falla si los archivos versionados no coinciden con el código
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
const fs = require('node:fs');
const path = require('node:path');
const app = require('../app');
const { registerControllers } = require('../src/presentation/http/api');
const { buildDocument } = require('../src/presentation/http/api/openapi');

registerControllers(app.services);
const files = {
  'openapi.json': buildDocument({ audience: 'full' }),
  'openapi-publica.json': buildDocument({ audience: 'public' }),
};
const check = process.argv.includes('--check');
let drift = false;
for (const [name, doc] of Object.entries(files)) {
  const file = path.join(__dirname, '..', 'docs', name);
  const content = JSON.stringify(doc, null, 2) + '\n';
  if (check) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
      console.error(`✗ docs/${name} no coincide con el código. Ejecute npm run openapi:export.`);
      drift = true;
    } else console.log(`✓ docs/${name} sincronizado (${Object.keys(doc.paths).length} rutas).`);
  } else {
    fs.writeFileSync(file, content);
    console.log(`docs/${name}: ${Object.keys(doc.paths).length} rutas`);
  }
}
process.exit(drift ? 1 : 0);
