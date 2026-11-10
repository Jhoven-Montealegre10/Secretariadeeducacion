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
exports.MetricsService = void 0;
/**
 * Observabilidad sin servicios externos:
 *  - registro de cada petición en una línea JSON (método, patrón de ruta, estado, duración, ID);
 *    nunca la consulta, el cuerpo, las cabeceras ni la IP;
 *  - latencia y errores por ruta en una ventana deslizante (percentiles p50/p95/p99);
 *  - estado del pool de PostgreSQL, conexiones del servidor, memoria, CPU y retraso del event loop.
 * Expuesto en /api/v1/sistema/metricas (permiso system.read). /health/* no revela detalles.
 */
const node_perf_hooks_1 = require("node:perf_hooks");
const common_1 = require("@nestjs/common");
const stats_service_1 = require("../../../application/stats.service");
const configuration_1 = require("../../../config/configuration");
const public_cache_service_1 = require("../../../infrastructure/cache/public-cache.service");
const db_service_1 = require("../../../infrastructure/database/db.service");
const WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLES = 20_000;
const SLOW_MS = 1000;
function percentile(sorted, p) {
    if (!sorted.length)
        return 0;
    return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 10) / 10;
}
function summarize(samples) {
    const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
    return {
        solicitudes: samples.length,
        errores5xx: samples.filter((s) => s.status >= 500).length,
        p50Ms: percentile(ms, 50),
        p95Ms: percentile(ms, 95),
        p99Ms: percentile(ms, 99),
        maxMs: ms.length ? Math.round(ms[ms.length - 1] * 10) / 10 : 0,
    };
}
let MetricsService = class MetricsService {
    config;
    db;
    cache;
    stats;
    logger = new common_1.Logger('Solicitud');
    samples = [];
    loop = (0, node_perf_hooks_1.monitorEventLoopDelay)({ resolution: 20 });
    startedAt = new Date();
    constructor(config, db, cache, stats) {
        this.config = config;
        this.db = db;
        this.cache = cache;
        this.stats = stats;
        this.loop.enable();
    }
    onModuleDestroy() {
        this.loop.disable();
    }
    /** Middleware de registro y medición. */
    middleware() {
        return (req, res, next) => {
            const start = process.hrtime.bigint();
            res.on('finish', () => {
                const ms = Number(process.hrtime.bigint() - start) / 1e6;
                const route = req.routePattern ?? req.route?.path ?? (req.path.startsWith('/assets/') ? '/assets/*' : 'sin-ruta');
                this.record({ at: Date.now(), route: `${req.method} ${route}`, ms, status: res.statusCode });
                if (!this.config.isTest && (ms >= SLOW_MS || res.statusCode >= 500 || process.env.LOG_REQUESTS === 'true')) {
                    this.logger.log(JSON.stringify({ id: req.id, metodo: req.method, ruta: route, estado: res.statusCode, ms: Math.round(ms) }));
                }
            });
            next();
        };
    }
    record(s) {
        this.samples.push(s);
        if (this.samples.length > MAX_SAMPLES)
            this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
    async snapshot() {
        const cutoff = Date.now() - WINDOW_MS;
        this.samples = this.samples.filter((s) => s.at >= cutoff);
        const byRoute = new Map();
        for (const s of this.samples)
            byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s]);
        const pool = this.db.poolStats();
        let serverConnections;
        try {
            serverConnections = await this.db.scalar("SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'semibague-%'");
        }
        catch {
            serverConnections = null;
        }
        const mem = process.memoryUsage();
        const cpu = process.cpuUsage();
        const cache = this.cache.stats();
        const mb = (n) => Math.round((n / 1048576) * 10) / 10;
        return {
            instancia: this.config.instanceId,
            version: process.env.npm_package_version ?? '4.0.0',
            node: process.version,
            inicioEn: this.startedAt.toISOString(),
            tiempoActivoSegundos: Math.round(process.uptime()),
            memoria: { rssMb: mb(mem.rss), heapUsadoMb: mb(mem.heapUsed), heapTotalMb: mb(mem.heapTotal) },
            cpu: { usuarioMs: Math.round(cpu.user / 1000), sistemaMs: Math.round(cpu.system / 1000) },
            eventLoopRetrasoP99Ms: Math.round((this.loop.percentile(99) / 1e6) * 10) / 10,
            baseDeDatos: {
                poolMaximo: this.config.db.poolMax,
                conexiones: pool.total,
                libres: pool.idle,
                enEspera: pool.waiting,
                conexionesServidor: serverConnections,
            },
            cache: { entradas: cache.entries, aciertos: cache.hits, fallos: cache.misses, escuchandoInvalidaciones: cache.listening },
            estadisticas: { pendientes: this.stats.pending(), descartadas: this.stats.dropped },
            http: {
                ventanaMinutos: WINDOW_MS / 60000,
                total: summarize(this.samples),
                porRuta: [...byRoute.entries()]
                    .map(([ruta, list]) => ({ ruta, ...summarize(list) }))
                    .sort((a, b) => b.solicitudes - a.solicitudes)
                    .slice(0, 40),
            },
        };
    }
};
exports.MetricsService = MetricsService;
exports.MetricsService = MetricsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object, db_service_1.Db,
        public_cache_service_1.PublicCache,
        stats_service_1.StatsService])
], MetricsService);
//# sourceMappingURL=metrics.service.js.map