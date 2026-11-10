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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = exports.LIMITS = void 0;
/**
 * Límites de peticiones por IP (ventana fija). Frenan fuerza bruta, spam y abuso.
 *  - Límites generales (todas las rutas, API): en memoria por instancia (alto volumen).
 *  - Límites sensibles (login, MFA, recuperación, cargas, PQRSD): en PostgreSQL, compartidos
 *    entre instancias, con la IP reducida a un HMAC (no se guarda la IP).
 * El bloqueo por cuenta (5 intentos → 15 min) es independiente y también vive en la BD.
 */
const common_1 = require("@nestjs/common");
const errors_1 = require("../../../domain/errors");
const configuration_1 = require("../../../config/configuration");
const db_service_1 = require("../../../infrastructure/database/db.service");
const crypto_service_1 = require("../../../infrastructure/security/crypto.service");
const MIN = 60_000;
exports.LIMITS = {
    general: { windowMs: 15 * MIN, limit: 900, message: 'Ha realizado demasiadas solicitudes. Intente de nuevo en unos minutos.', shared: false },
    api: { windowMs: 15 * MIN, limit: 600, message: 'Demasiadas solicitudes a la API. Intente de nuevo en unos minutos.', shared: false },
    login: { windowMs: 15 * MIN, limit: 10, message: 'Demasiados intentos de inicio de sesión. Espere 15 minutos.', shared: true },
    mfa: { windowMs: 15 * MIN, limit: 10, message: 'Demasiados intentos de verificación. Espere 15 minutos.', shared: true },
    recovery: { windowMs: 60 * MIN, limit: 5, message: 'Demasiadas solicitudes de recuperación. Intente en una hora.', shared: true },
    upload: { windowMs: 60 * MIN, limit: 60, message: 'Demasiadas cargas de archivos en la última hora.', shared: true },
    pqrsd: { windowMs: 60 * MIN, limit: 5, message: 'Ha enviado demasiadas solicitudes en la última hora. Intente más tarde.', shared: true },
    consulta: { windowMs: 15 * MIN, limit: 20, message: 'Demasiadas consultas. Intente de nuevo en unos minutos.', shared: true },
};
let RateLimiter = class RateLimiter {
    config;
    db;
    crypto;
    logger = new common_1.Logger('RateLimiter');
    memory = new Map();
    sweeper;
    hitsSincePurge = 0;
    constructor(config, db, crypto) {
        this.config = config;
        this.db = db;
        this.crypto = crypto;
        this.sweeper = setInterval(() => this.sweep(), MIN);
        this.sweeper.unref();
    }
    onModuleDestroy() {
        clearInterval(this.sweeper);
    }
    limitFor(bucket) {
        // En pruebas se puede bajar el límite para verificar el bloqueo (TEST_RATE_LIMIT).
        return this.config.isTest ? Number(process.env.TEST_RATE_LIMIT ?? 10_000) : exports.LIMITS[bucket].limit;
    }
    sweep() {
        const now = Date.now();
        for (const [key, v] of this.memory)
            if (v.reset <= now)
                this.memory.delete(key);
    }
    /** Registra un intento; lanza 429 si se supera el límite. */
    async hit(bucket, ip) {
        const def = exports.LIMITS[bucket];
        const limit = this.limitFor(bucket);
        const key = `${bucket}:${this.crypto.statsHash('rate-limit', ip || 'desconocida').slice(0, 24)}`;
        let count;
        let reset;
        if (def.shared) {
            try {
                const row = await this.db.one(`INSERT INTO limites_tasa (clave, conteo, reinicia_en) VALUES ($1, 1, now() + $2 * interval '1 millisecond')
           ON CONFLICT (clave) DO UPDATE SET
             conteo = CASE WHEN limites_tasa.reinicia_en <= now() THEN 1 ELSE limites_tasa.conteo + 1 END,
             reinicia_en = CASE WHEN limites_tasa.reinicia_en <= now() THEN EXCLUDED.reinicia_en ELSE limites_tasa.reinicia_en END
           RETURNING conteo, CEIL(EXTRACT(EPOCH FROM (reinicia_en - now())))::int AS segundos`, [key, def.windowMs]);
                count = row?.conteo ?? 1;
                reset = Date.now() + (row?.segundos ?? 0) * 1000;
                if (++this.hitsSincePurge >= 200) {
                    this.hitsSincePurge = 0;
                    void this.db.run('DELETE FROM limites_tasa WHERE reinicia_en < now()').catch(() => undefined);
                }
            }
            catch (err) {
                // Si la BD no responde, se aplica el límite en memoria (falla cerrada para no quedar sin protección).
                this.logger.warn(`Límite compartido no disponible (${err.message}); se usa el de memoria.`);
                ({ count, reset } = this.memoryHit(key, def.windowMs));
            }
        }
        else {
            ({ count, reset } = this.memoryHit(key, def.windowMs));
        }
        const result = { limit, remaining: Math.max(0, limit - count), resetSeconds: Math.max(0, Math.ceil((reset - Date.now()) / 1000)) };
        if (count > limit)
            throw Object.assign(new errors_1.TooManyRequestsError(def.message), { rate: result });
        return result;
    }
    memoryHit(key, windowMs) {
        const now = Date.now();
        const entry = this.memory.get(key);
        if (!entry || entry.reset <= now) {
            const fresh = { count: 1, reset: now + windowMs };
            this.memory.set(key, fresh);
            return fresh;
        }
        entry.count++;
        return entry;
    }
};
exports.RateLimiter = RateLimiter;
exports.RateLimiter = RateLimiter = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object, db_service_1.Db,
        crypto_service_1.CryptoService])
], RateLimiter);
//# sourceMappingURL=rate-limiter.service.js.map