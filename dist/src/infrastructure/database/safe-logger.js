"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafeQueryLogger = void 0;
/**
 * Logger de TypeORM que NUNCA registra los parámetros de las consultas (pueden contener hashes,
 * datos personales cifrados o tokens). Solo registra el código de error, el tipo de sentencia y,
 * para consultas lentas, la duración y la tabla principal.
 */
const common_1 = require("@nestjs/common");
const summary = (query) => query.replace(/\s+/g, ' ').trim().slice(0, 80).replace(/\$\d+/g, '?');
class SafeQueryLogger {
    quiet;
    logger = new common_1.Logger('PostgreSQL');
    constructor(quiet) {
        this.quiet = quiet;
    }
    logQuery() {
        /* no se registran consultas normales */
    }
    logQueryError(error, query) {
        if (this.quiet)
            return;
        const code = error.code ?? '';
        this.logger.warn(`Consulta fallida [${code}]: ${summary(query)}`);
    }
    logQuerySlow(time, query) {
        this.logger.warn(`Consulta lenta (${time} ms): ${summary(query)}`);
    }
    logSchemaBuild() {
        /* sin sincronización automática */
    }
    logMigration(message) {
        this.logger.log(message);
    }
    log(level, message) {
        if (level === 'warn')
            this.logger.warn(String(message));
    }
}
exports.SafeQueryLogger = SafeQueryLogger;
//# sourceMappingURL=safe-logger.js.map