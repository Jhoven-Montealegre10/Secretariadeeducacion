"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withApp = withApp;
/** Contexto de aplicación (sin servidor HTTP) para los comandos de consola. */
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const configuration_1 = require("../src/config/configuration");
async function withApp(fn) {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule.forRoot((0, configuration_1.loadConfig)()), { logger: ['error', 'warn'] });
    try {
        return await fn(app);
    }
    finally {
        await app.close();
    }
}
//# sourceMappingURL=cli-context.js.map