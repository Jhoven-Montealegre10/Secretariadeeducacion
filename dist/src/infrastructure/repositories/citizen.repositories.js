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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatsRepository = exports.PqrsdRepository = void 0;
/**
 * PQRSD (datos personales cifrados) y estadísticas de visitas (sin datos personales).
 */
const node_crypto_1 = __importDefault(require("node:crypto"));
const common_1 = require("@nestjs/common");
const db_service_1 = require("../database/db.service");
const sql_1 = require("../database/sql");
const crypto_service_1 = require("../security/crypto.service");
/**
 * Los datos personales se cifran ANTES de escribirse y se descifran solo en el servidor.
 * `documento_hash` es un índice ciego HMAC para la consulta ciudadana.
 */
let PqrsdRepository = class PqrsdRepository {
    db;
    crypto;
    constructor(db, crypto) {
        this.db = db;
        this.crypto = crypto;
    }
    decryptRow(row) {
        if (!row)
            return null;
        const d = (v) => this.crypto.decrypt(v);
        return {
            id: row.id,
            radicado: row.radicado,
            tipo: row.tipo,
            estado: row.estado,
            tipoDocumento: row.tipo_documento,
            documento: d(row.documento_enc),
            nombre: d(row.nombre_enc),
            email: d(row.email_enc),
            telefono: d(row.telefono_enc),
            asunto: d(row.asunto_enc),
            mensaje: d(row.mensaje_enc),
            respuesta: d(row.respuesta_enc),
            creadoEn: row.creado_en,
            actualizadoEn: row.actualizado_en,
        };
    }
    newRadicado() {
        return `SEM-${new Date().getFullYear()}-${String(node_crypto_1.default.randomInt(0, 1e8)).padStart(8, '0')}`;
    }
    async create(d) {
        const enc = (v) => this.crypto.encrypt(v);
        for (let i = 0; i < 5; i++) {
            const radicado = this.newRadicado();
            try {
                await this.db.run(`INSERT INTO pqrsd (radicado, tipo, tipo_documento, documento_hash, documento_enc, nombre_enc, email_enc, telefono_enc, asunto_enc, mensaje_enc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
                    radicado,
                    d.tipo,
                    d.tipoDocumento,
                    this.crypto.blindIndex(d.documento),
                    enc(d.documento),
                    enc(d.nombre),
                    enc(d.email),
                    enc(d.telefono),
                    enc(d.asunto),
                    enc(d.mensaje),
                ]);
                return radicado;
            }
            catch (err) {
                if ((0, db_service_1.pgCode)(err) !== db_service_1.PG.UNIQUE_VIOLATION)
                    throw err;
            }
        }
        throw new Error('No fue posible generar un radicado único');
    }
    /** Consulta ciudadana: exige radicado y documento; misma respuesta si cualquiera falla. */
    async findByRadicadoAndDocument(radicado, documento) {
        const row = (await this.db.query('SELECT * FROM pqrsd WHERE radicado = $1', [radicado]))[0];
        if (!row || !this.crypto.safeEqual(row.documento_hash, this.crypto.blindIndex(documento)))
            return null;
        return this.decryptRow(row);
    }
    async list(f) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(f.page, f.pageSize);
        const w = new sql_1.Where().addIf(f.estado, 'estado = ?', f.estado);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM pqrsd ${w.sql}`, w.params);
        const rows = await this.db.query(`SELECT * FROM pqrsd ${w.sql} ORDER BY id DESC LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items: rows.map((r) => this.decryptRow(r)), total, page, pageSize };
    }
    async findById(id) {
        return this.decryptRow((await this.db.query('SELECT * FROM pqrsd WHERE id = $1', [id]))[0]);
    }
    async respond(id, estado, respuesta) {
        return this.db.run('UPDATE pqrsd SET estado = $1, respuesta_enc = $2, actualizado_en = now() WHERE id = $3', [estado, this.crypto.encrypt(respuesta), id]);
    }
    async countByStatus() {
        return this.db.rows('SELECT estado, COUNT(*) AS n FROM pqrsd GROUP BY estado ORDER BY estado');
    }
};
exports.PqrsdRepository = PqrsdRepository;
exports.PqrsdRepository = PqrsdRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        crypto_service_1.CryptoService])
], PqrsdRepository);
const GROUPABLE = { fuente: 'fuente', dispositivo: 'dispositivo', pais: 'pais', referenteDominio: 'referente_dominio' };
let StatsRepository = class StatsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Sal aleatoria del día (compartida por todas las instancias); las anteriores se borran. */
    async saltFor(fecha) {
        const candidate = node_crypto_1.default.randomBytes(16).toString('hex');
        let sal = await this.db.scalar(`WITH ins AS (INSERT INTO sales_estadisticas (fecha, sal) VALUES ($1, $2) ON CONFLICT (fecha) DO NOTHING RETURNING sal)
       SELECT sal FROM ins UNION ALL SELECT sal FROM sales_estadisticas WHERE fecha = $1 LIMIT 1`, [fecha, candidate]);
        // Si otra instancia insertó a la vez, la fila no es visible en la instantánea de esa sentencia.
        sal ??= await this.db.scalar('SELECT sal FROM sales_estadisticas WHERE fecha = $1', [fecha]);
        await this.db.run('DELETE FROM sales_estadisticas WHERE fecha < $1', [fecha]);
        return sal;
    }
    /** Inserción por lotes en una sola sentencia (unnest), usada por el proceso en segundo plano. */
    async insertVisits(rows) {
        if (!rows.length)
            return 0;
        return this.db.run(`INSERT INTO visitas (fecha, ruta, visitante, fuente, referente_dominio, dispositivo, pais)
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])`, [
            rows.map((r) => r.fecha),
            rows.map((r) => r.ruta),
            rows.map((r) => r.visitante),
            rows.map((r) => r.fuente),
            rows.map((r) => r.referenteDominio),
            rows.map((r) => r.dispositivo),
            rows.map((r) => r.pais),
        ]);
    }
    /** Purga la retención; solo una instancia a la vez (bloqueo consultivo sin espera). */
    async purgeOlderThan(fecha) {
        return this.db.transaction(async () => {
            if (!(await this.db.tryAdvisoryXactLock(db_service_1.LOCKS.STATS_PURGE)))
                return 0;
            return this.db.run('DELETE FROM visitas WHERE fecha < $1', [fecha]);
        });
    }
    async summary(desde, hasta) {
        const row = await this.db.row(`SELECT COUNT(*) AS visitas, COUNT(DISTINCT (fecha, visitante)) AS visitantes_unicos
       FROM visitas WHERE fecha BETWEEN $1 AND $2`, [desde, hasta]);
        return row ?? { visitas: 0, visitantesUnicos: 0 };
    }
    async byDay(desde, hasta) {
        return this.db.rows(`SELECT fecha, COUNT(*) AS visitas, COUNT(DISTINCT visitante) AS visitantes FROM visitas
       WHERE fecha BETWEEN $1 AND $2 GROUP BY fecha ORDER BY fecha`, [desde, hasta]);
    }
    async topPages(desde, hasta, limit = 10) {
        return this.db.rows('SELECT ruta, COUNT(*) AS visitas FROM visitas WHERE fecha BETWEEN $1 AND $2 GROUP BY ruta ORDER BY visitas DESC, ruta LIMIT $3', [
            desde,
            hasta,
            limit,
        ]);
    }
    async groupBy(column, desde, hasta, limit = 20) {
        if (!Object.hasOwn(GROUPABLE, column))
            throw new Error('Agrupación no permitida');
        const col = GROUPABLE[column];
        return this.db.rows(`SELECT ${col} AS valor, COUNT(*) AS visitas FROM visitas WHERE fecha BETWEEN $1 AND $2 AND ${col} IS NOT NULL
       GROUP BY ${col} ORDER BY visitas DESC, valor LIMIT $3`, [desde, hasta, limit]);
    }
};
exports.StatsRepository = StatsRepository;
exports.StatsRepository = StatsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], StatsRepository);
//# sourceMappingURL=citizen.repositories.js.map