"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Db = exports.LOCKS = exports.PG = void 0;
exports.pgCode = pgCode;
/**
 * Acceso a PostgreSQL para los repositorios.
 *  - Consultas SIEMPRE parametrizadas (pg envía el SQL y los valores por separado).
 *  - Transacciones cortas y componibles: dentro de `transaction()` todas las consultas usan la
 *    misma conexión (AsyncLocalStorage); una transacción anidada reutiliza la externa.
 *  - `afterCommit()` difiere efectos externos (invalidar caché, borrar archivos) hasta que el
 *    COMMIT se confirma; si hay ROLLBACK no se ejecutan.
 */
const node_async_hooks_1 = require("node:async_hooks");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const sql_1 = require("./sql");
/** Códigos de error de PostgreSQL que los servicios reconocen. */
exports.PG = {
    UNIQUE_VIOLATION: '23505',
    FOREIGN_KEY_VIOLATION: '23503',
    CHECK_VIOLATION: '23514',
    SERIALIZATION_FAILURE: '40001',
    DEADLOCK: '40P01',
    LOCK_TIMEOUT: '55P03',
    QUERY_CANCELED: '57014',
};
function pgCode(err) {
    const e = err;
    const code = e?.driverError?.code ?? e?.code;
    return typeof code === 'string' ? code : undefined;
}
/** Claves de bloqueos consultivos (constantes para no colisionar). */
exports.LOCKS = { AUDIT_CHAIN: 7_310_001, STATS_PURGE: 7_310_002, SESSION_PURGE: 7_310_003, TOKEN_PURGE: 7_310_004 };
let Db = class Db {
    dataSource;
    logger = new common_1.Logger('Db');
    als = new node_async_hooks_1.AsyncLocalStorage();
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    get inTransaction() {
        return this.als.getStore() !== undefined;
    }
    /** Ejecuta una sentencia y devuelve filas y número de filas afectadas. */
    async exec(sql, params = []) {
        const ctx = this.als.getStore();
        const runner = ctx?.runner ?? this.dataSource.createQueryRunner();
        try {
            const result = await runner.query(sql, params, true);
            return { rows: (result.records ?? []), rowCount: result.affected ?? 0 };
        }
        finally {
            if (!ctx)
                await runner.release();
        }
    }
    /** Filas crudas (snake_case). */
    async query(sql, params = []) {
        return (await this.exec(sql, params)).rows;
    }
    /** Primera fila cruda (snake_case), o null. */
    async one(sql, params = []) {
        return (await this.query(sql, params))[0] ?? null;
    }
    /** Filas convertidas a camelCase. */
    async rows(sql, params = []) {
        return (0, sql_1.mapRows)(await this.query(sql, params));
    }
    /** Primera fila convertida a camelCase, o null. */
    async row(sql, params = []) {
        return (0, sql_1.toCamel)((await this.query(sql, params))[0]);
    }
    async scalar(sql, params = []) {
        const row = (await this.query(sql, params))[0];
        return (row ? Object.values(row)[0] : undefined);
    }
    /** Número de filas afectadas por un INSERT/UPDATE/DELETE. */
    async run(sql, params = []) {
        return (await this.exec(sql, params)).rowCount;
    }
    /**
     * Ejecuta fn en una transacción READ COMMITTED. Debe ser corta: sin E/S externa (correo,
     * archivos, procesamiento de imágenes) dentro. Reentrante.
     */
    async transaction(fn) {
        if (this.als.getStore())
            return fn();
        const runner = this.dataSource.createQueryRunner();
        const ctx = { runner, after: [] };
        let result;
        try {
            await runner.connect();
            await runner.startTransaction();
            result = await this.als.run(ctx, fn);
            await runner.commitTransaction();
        }
        catch (err) {
            if (runner.isTransactionActive)
                await runner.rollbackTransaction().catch(() => undefined);
            throw err;
        }
        finally {
            await runner.release();
        }
        for (const hook of ctx.after) {
            try {
                await hook();
            }
            catch (err) {
                this.logger.warn(`Tarea posterior al commit falló: ${err.message}`);
            }
        }
        return result;
    }
    /** Programa una tarea para después del COMMIT (o la ejecuta enseguida si no hay transacción). */
    afterCommit(hook) {
        const ctx = this.als.getStore();
        if (ctx) {
            ctx.after.push(hook);
            return;
        }
        void Promise.resolve()
            .then(hook)
            .catch((err) => this.logger.warn(`Tarea posterior falló: ${err.message}`));
    }
    /** Bloqueo consultivo por transacción (se libera solo en COMMIT/ROLLBACK). */
    async advisoryXactLock(key) {
        if (!this.inTransaction)
            throw new Error('advisoryXactLock requiere una transacción');
        await this.exec('SELECT pg_advisory_xact_lock($1)', [key]);
    }
    /** Intenta un bloqueo consultivo por transacción sin esperar. */
    async tryAdvisoryXactLock(key) {
        if (!this.inTransaction)
            throw new Error('tryAdvisoryXactLock requiere una transacción');
        return (await this.scalar('SELECT pg_try_advisory_xact_lock($1)', [key])) === true;
    }
    /** Estado del pool para salud y métricas (sin datos sensibles). */
    poolStats() {
        const pool = this.dataSource.driver.master;
        return { total: pool?.totalCount ?? 0, idle: pool?.idleCount ?? 0, waiting: pool?.waitingCount ?? 0 };
    }
};
exports.Db = Db;
exports.Db = Db = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], Db);
//# sourceMappingURL=db.service.js.map