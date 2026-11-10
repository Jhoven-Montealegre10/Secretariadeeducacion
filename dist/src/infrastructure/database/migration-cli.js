"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * DataSource para la CLI de TypeORM (migraciones). Usa las credenciales del MIGRADOR
 * (DB_MIGRATION_USER / DB_MIGRATION_PASSWORD), nunca las de la aplicación.
 */
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const configuration_1 = require("../../config/configuration");
const data_source_1 = require("./data-source");
exports.default = new typeorm_1.DataSource((0, data_source_1.dataSourceOptions)((0, configuration_1.loadConfig)(), { forMigrations: true }));
//# sourceMappingURL=migration-cli.js.map