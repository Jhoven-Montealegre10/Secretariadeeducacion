/**
 * Genera la especificación OpenAPI desde el código (misma fuente que valida las rutas):
 *   npm run openapi:export   → escribe docs/openapi.json y docs/openapi-publica.json
 *   npm run openapi:check    → falla si los archivos versionados no coinciden con el código
 * Requiere la base de datos (arranca el módulo completo sin escuchar en ningún puerto).
 */
import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config/configuration';
import { OpenApiDocs } from '../src/presentation/http/api/controllers/docs.controller';
import { configureApp } from '../src/presentation/http/app.setup';

async function main(): Promise<number> {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bodyParser: false, logger: ['error'] });
  const store = await configureApp(app);
  const docs = app.get(OpenApiDocs);
  const files = { 'openapi.json': docs.fullDoc, 'openapi-publica.json': docs.publicDoc };
  store.close();
  await app.close();
  const check = process.argv.includes('--check');
  let drift = false;
  for (const [name, doc] of Object.entries(files)) {
    const file = path.join(config.root, 'docs', name);
    const content = JSON.stringify(doc, null, 2) + '\n';
    const routes = Object.values(doc?.paths ?? {}).reduce((n, item) => n + Object.keys(item as object).length, 0);
    if (check) {
      if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) {
        console.error(`✗ docs/${name} no coincide con el código. Ejecute npm run openapi:export.`);
        drift = true;
      } else console.log(`✓ docs/${name} sincronizado (${routes} operaciones).`);
    } else {
      fs.writeFileSync(file, content);
      console.log(`docs/${name}: ${routes} operaciones`);
    }
  }
  return drift ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error((e as Error).message);
    process.exit(1);
  });
