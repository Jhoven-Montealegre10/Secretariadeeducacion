"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Genera la especificación OpenAPI desde el código (misma fuente que valida las rutas):
 *   npm run openapi:export   → escribe docs/openapi.json y docs/openapi-publica.json
 *   npm run openapi:check    → falla si los archivos versionados no coinciden con el código
 * Requiere la base de datos (arranca el módulo completo sin escuchar en ningún puerto).
 */
require("reflect-metadata");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const configuration_1 = require("../src/config/configuration");
const docs_controller_1 = require("../src/presentation/http/api/controllers/docs.controller");
const app_setup_1 = require("../src/presentation/http/app.setup");
async function main() {
    const config = (0, configuration_1.loadConfig)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule.forRoot(config), { bodyParser: false, logger: ['error'] });
    const store = await (0, app_setup_1.configureApp)(app);
    const docs = app.get(docs_controller_1.OpenApiDocs);
    const files = { 'openapi.json': docs.fullDoc, 'openapi-publica.json': docs.publicDoc };
    store.close();
    await app.close();
    const check = process.argv.includes('--check');
    let drift = false;
    for (const [name, doc] of Object.entries(files)) {
        const file = node_path_1.default.join(config.root, 'docs', name);
        const content = JSON.stringify(doc, null, 2) + '\n';
        const routes = Object.values(doc?.paths ?? {}).reduce((n, item) => n + Object.keys(item).length, 0);
        if (check) {
            if (!node_fs_1.default.existsSync(file) || node_fs_1.default.readFileSync(file, 'utf8') !== content) {
                console.error(`✗ docs/${name} no coincide con el código. Ejecute npm run openapi:export.`);
                drift = true;
            }
            else
                console.log(`✓ docs/${name} sincronizado (${routes} operaciones).`);
        }
        else {
            node_fs_1.default.writeFileSync(file, content);
            console.log(`docs/${name}: ${routes} operaciones`);
        }
    }
    return drift ? 1 : 0;
}
main()
    .then((code) => process.exit(code))
    .catch((e) => {
    console.error(e.message);
    process.exit(1);
});
//# sourceMappingURL=export-openapi.js.map