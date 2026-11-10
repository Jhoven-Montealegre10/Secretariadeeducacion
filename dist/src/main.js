"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Punto de entrada del servidor.
 *  - En producción NO aplica migraciones (AUTO_MIGRATE=false): si hay pendientes, no arranca.
 *  - Escucha en 127.0.0.1 en producción (detrás del proxy inverso con TLS).
 */
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const typeorm_1 = require("typeorm");
const app_module_1 = require("./app.module");
const configuration_1 = require("./config/configuration");
const data_source_1 = require("./infrastructure/database/data-source");
const app_setup_1 = require("./presentation/http/app.setup");
async function migrationsGate(config, logger) {
    const ds = new typeorm_1.DataSource((0, data_source_1.dataSourceOptions)(config, { forMigrations: config.autoMigrate }));
    await ds.initialize();
    try {
        if (config.autoMigrate) {
            const ran = await ds.runMigrations({ transaction: 'each' });
            if (ran.length)
                logger.log(`Migraciones aplicadas: ${ran.map((m) => m.name).join(', ')}`);
        }
        else if (await ds.showMigrations()) {
            throw new Error('Hay migraciones pendientes. Ejecute "npm run migrate" (con la cuenta de migraciones) antes de iniciar.');
        }
    }
    finally {
        await ds.destroy();
    }
}
async function bootstrap() {
    const logger = new common_1.Logger('Servidor');
    const config = (0, configuration_1.loadConfig)();
    await migrationsGate(config, logger);
    const app = await core_1.NestFactory.create(app_module_1.AppModule.forRoot(config), { bodyParser: false, logger: ['error', 'warn', 'log'] });
    await (0, app_setup_1.configureApp)(app);
    await app.listen(config.port, config.host);
    logger.log(`Portal SEM Ibagué en ${config.appUrl} (${config.env}, instancia ${config.instanceId})`);
}
bootstrap().catch((err) => {
    console.error(err.message);
    process.exit(1);
});
//# sourceMappingURL=main.js.map