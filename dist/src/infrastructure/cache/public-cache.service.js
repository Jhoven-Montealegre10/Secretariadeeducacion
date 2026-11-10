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
exports.PublicCache = void 0;
/**
 * Caché en memoria del contenido PÚBLICO (páginas, noticias y sliders publicados).
 *  - Nunca guarda respuestas privadas, borradores ni datos de una sesión.
 *  - Caducidad corta (CACHE_TTL_SECONDS) y tamaño máximo (CACHE_MAX_ENTRIES, expulsión LRU).
 *  - Al publicar/editar/eliminar contenido se invalida en esta instancia y se avisa a las demás
 *    con LISTEN/NOTIFY de PostgreSQL (sin servicios adicionales como Redis).
 *  - Las cargas concurrentes de la misma clave se comparten (evita "estampidas" a la base).
 */
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const configuration_1 = require("../../config/configuration");
const db_service_1 = require("../database/db.service");
const data_source_1 = require("../database/data-source");
const CHANNEL = 'semibague_cache';
let PublicCache = class PublicCache {
    config;
    db;
    logger = new common_1.Logger('PublicCache');
    entries = new Map();
    inflight = new Map();
    listener = null;
    generation = 0;
    closing = false;
    hits = 0;
    misses = 0;
    constructor(config, db) {
        this.config = config;
        this.db = db;
    }
    get enabled() {
        return this.config.cache.ttlSeconds > 0;
    }
    async onModuleInit() {
        if (!this.enabled || this.config.isTest)
            return;
        await this.listen();
    }
    async listen() {
        try {
            const client = new pg_1.Client((0, data_source_1.connectionOptions)(this.config));
            client.on('notification', (msg) => {
                if (msg.channel === CHANNEL && msg.payload !== this.config.instanceId)
                    this.clearLocal();
            });
            client.on('error', (err) => {
                this.logger.warn(`Canal de invalidación caído: ${err.message}. Se vacía la caché y se reintenta.`);
                this.clearLocal();
                this.listener = null;
                if (!this.closing)
                    setTimeout(() => void this.listen(), 5000).unref();
            });
            await client.connect();
            await client.query(`LISTEN ${CHANNEL}`);
            this.listener = client;
        }
        catch (err) {
            this.logger.warn(`No se pudo escuchar invalidaciones (${err.message}); la caché solo expira por tiempo.`);
            if (!this.closing)
                setTimeout(() => void this.listen(), 15000).unref();
        }
    }
    async onModuleDestroy() {
        this.closing = true;
        await this.listener?.end().catch(() => undefined);
    }
    /** Devuelve el valor en caché o lo carga; la carga es compartida entre peticiones simultáneas. */
    async get(key, loader) {
        if (!this.enabled)
            return loader();
        const now = Date.now();
        const hit = this.entries.get(key);
        if (hit && hit.expires > now) {
            this.hits++;
            this.entries.delete(key); // reinsertar = más reciente (LRU)
            this.entries.set(key, hit);
            return hit.value;
        }
        this.misses++;
        const pending = this.inflight.get(key);
        if (pending)
            return pending;
        const generation = this.generation;
        const promise = loader()
            .then((value) => {
            // Si hubo invalidación mientras se cargaba, no se guarda un valor posiblemente viejo.
            if (generation === this.generation)
                this.store(key, value);
            return value;
        })
            .finally(() => this.inflight.delete(key));
        this.inflight.set(key, promise);
        return promise;
    }
    store(key, value) {
        this.entries.set(key, { value, expires: Date.now() + this.config.cache.ttlSeconds * 1000 });
        while (this.entries.size > this.config.cache.maxEntries) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined)
                break;
            this.entries.delete(oldest);
        }
    }
    clearLocal() {
        this.generation++;
        this.entries.clear();
    }
    /** Invalida todo el contenido público tras el COMMIT, en esta y en las demás instancias. */
    invalidate() {
        this.db.afterCommit(async () => {
            this.clearLocal();
            if (this.enabled && !this.config.isTest)
                await this.db.run('SELECT pg_notify($1, $2)', [CHANNEL, this.config.instanceId]);
        });
    }
    stats() {
        return { entries: this.entries.size, hits: this.hits, misses: this.misses, listening: this.listener !== null };
    }
};
exports.PublicCache = PublicCache;
exports.PublicCache = PublicCache = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object, db_service_1.Db])
], PublicCache);
//# sourceMappingURL=public-cache.service.js.map