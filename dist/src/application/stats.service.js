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
exports.StatsService = void 0;
exports.device = device;
exports.source = source;
/**
 * Estadísticas de visitas con privacidad por diseño (ver docs/ESTADISTICAS.md):
 *  - sin cookies ni identificadores persistentes; respeta "Do Not Track" y "Global Privacy Control";
 *  - no guarda IP ni User-Agent: solo un hash con sal diaria que se descarta al día siguiente;
 *  - excluye robots conocidos, el panel, la API y los archivos;
 *  - país solo si el proxy lo entrega en una cabecera (no hay geolocalización por IP);
 *  - retención configurable (STATS_RETENTION_DAYS).
 * Rendimiento: las visitas se acumulan en memoria y se insertan por lotes en segundo plano
 * (una sola sentencia por lote), de modo que una página pública no espera a la base de datos.
 */
const common_1 = require("@nestjs/common");
const errors_1 = require("../domain/errors");
const publication_1 = require("../domain/publication");
const configuration_1 = require("../config/configuration");
const citizen_repositories_1 = require("../infrastructure/repositories/citizen.repositories");
const crypto_service_1 = require("../infrastructure/security/crypto.service");
const authorization_1 = require("./authorization");
const clock_1 = require("./clock");
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|python-requests|curl|wget|httpclient|monitor|autocannon/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu|brave)\./i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|youtube|whatsapp|tiktok|threads)\.(com|co|me)$/i;
const DAY_MS = 86_400_000;
/** Tope del búfer: si la base no responde, se descartan visitas en lugar de agotar la memoria. */
const MAX_BUFFER = 10_000;
function device(ua) {
    if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua))
        return 'tablet';
    if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua))
        return 'movil';
    if (/Windows|Macintosh|Linux|CrOS|X11/i.test(ua))
        return 'escritorio';
    return 'otro';
}
function source(referer, host, hasCampaign) {
    if (hasCampaign)
        return { fuente: 'campana', dominio: null };
    let refHost;
    try {
        refHost = referer ? new URL(referer).hostname.toLowerCase() : '';
    }
    catch {
        refHost = '';
    }
    if (!refHost)
        return { fuente: 'directo', dominio: null };
    if (refHost === String(host).toLowerCase().split(':')[0])
        return { fuente: 'interno', dominio: null };
    if (SEARCH.test(refHost))
        return { fuente: 'buscador', dominio: refHost };
    if (SOCIAL.test(refHost))
        return { fuente: 'redes_sociales', dominio: refHost };
    return { fuente: 'otro_sitio', dominio: refHost.slice(0, 120) };
}
let StatsService = class StatsService {
    repo;
    crypto;
    config;
    clock;
    logger = new common_1.Logger('Estadisticas');
    buffer = [];
    timer = null;
    flushing = null;
    lastPurge = '';
    salt = null;
    dropped = 0;
    constructor(repo, crypto, config, clock) {
        this.repo = repo;
        this.crypto = crypto;
        this.config = config;
        this.clock = clock;
    }
    onModuleInit() {
        if (this.config.stats.flushIntervalMs > 0) {
            this.timer = setInterval(() => void this.flush(), this.config.stats.flushIntervalMs);
            this.timer.unref();
        }
    }
    async onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        await this.flush(); // no perder las visitas pendientes al apagar
    }
    /** Registra una vista de página pública. No lanza ni espera a la BD: la analítica nunca rompe el sitio. */
    track(input) {
        const ua = input.userAgent ?? '';
        if (input.doNotTrack || !ua || BOT_RE.test(ua))
            return false;
        if (this.buffer.length >= MAX_BUFFER) {
            this.dropped++;
            return false;
        }
        const { fuente, dominio } = source(input.referer ?? '', input.host ?? '', !!input.hasCampaign);
        this.buffer.push({
            fecha: (0, publication_1.fechaColombia)(this.clock.now()),
            ruta: String(input.ruta).slice(0, 200),
            fingerprint: `${input.ip ?? ''}|${ua}`,
            fuente,
            referenteDominio: dominio,
            dispositivo: device(ua),
            pais: /^[A-Z]{2}$/.test(input.pais ?? '') ? input.pais : null,
        });
        if (this.config.stats.flushIntervalMs === 0 || this.buffer.length >= this.config.stats.flushBatchSize)
            void this.flush();
        return true;
    }
    async saltFor(fecha) {
        if (this.salt?.fecha !== fecha)
            this.salt = { fecha, sal: await this.repo.saltFor(fecha) };
        return this.salt.sal;
    }
    /** Escribe el búfer en la BD (un lote a la vez). Las pruebas lo llaman para sincronizar. */
    async flush() {
        if (this.flushing)
            return this.flushing;
        if (!this.buffer.length)
            return;
        this.flushing = (async () => {
            while (this.buffer.length) {
                const batch = this.buffer.splice(0, this.config.stats.flushBatchSize);
                try {
                    const rows = [];
                    for (const v of batch) {
                        const sal = await this.saltFor(v.fecha);
                        rows.push({ ...v, visitante: this.crypto.statsHash(sal, v.fingerprint).slice(0, 16) });
                    }
                    await this.repo.insertVisits(rows.map(({ fecha, ruta, visitante, fuente, referenteDominio, dispositivo, pais }) => ({
                        fecha,
                        ruta,
                        visitante,
                        fuente,
                        referenteDominio,
                        dispositivo,
                        pais,
                    })));
                    await this.purgeIfNeeded();
                }
                catch (err) {
                    this.dropped += batch.length;
                    this.logger.warn(`No se pudieron guardar ${batch.length} visitas: ${err.message}`);
                    break;
                }
            }
        })().finally(() => {
            this.flushing = null;
        });
        return this.flushing;
    }
    async purgeIfNeeded() {
        const today = (0, publication_1.fechaColombia)(this.clock.now());
        if (this.lastPurge === today)
            return;
        await this.repo.purgeOlderThan((0, publication_1.fechaColombia)(this.clock.now() - this.config.stats.retentionDays * DAY_MS));
        this.lastPurge = today;
    }
    pending() {
        return this.buffer.length;
    }
    async report(actor, { desde, hasta }) {
        (0, authorization_1.authorize)(actor, 'stats.read');
        await this.flush();
        const today = (0, publication_1.fechaColombia)(this.clock.now());
        const to = hasta || today;
        const from = desde || (0, publication_1.fechaColombia)(Date.parse(`${to}T12:00:00Z`) - 29 * DAY_MS);
        if (from > to)
            throw new errors_1.ValidationError('La fecha inicial debe ser anterior a la final.', [{ campo: 'desde', mensaje: 'Rango inválido' }]);
        if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 366)
            throw new errors_1.ValidationError('El rango máximo es de 366 días.', [{ campo: 'hasta', mensaje: 'Rango demasiado amplio' }]);
        const [resumen, porDia, paginas, fuentes, referentes, dispositivos, paises] = await Promise.all([
            this.repo.summary(from, to),
            this.repo.byDay(from, to),
            this.repo.topPages(from, to, 10),
            this.repo.groupBy('fuente', from, to),
            this.repo.groupBy('referenteDominio', from, to, 10),
            this.repo.groupBy('dispositivo', from, to),
            this.repo.groupBy('pais', from, to, 15),
        ]);
        return {
            desde: from,
            hasta: to,
            vacio: resumen.visitas === 0,
            resumen: { visitas: resumen.visitas, visitantesUnicosEstimados: resumen.visitantesUnicos },
            porDia,
            paginas,
            fuentes,
            referentes,
            dispositivos,
            paises,
            retencionDias: this.config.stats.retentionDays,
        };
    }
};
exports.StatsService = StatsService;
exports.StatsService = StatsService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __param(3, (0, common_1.Inject)(clock_1.CLOCK)),
    __metadata("design:paramtypes", [citizen_repositories_1.StatsRepository,
        crypto_service_1.CryptoService, Object, Object])
], StatsService);
//# sourceMappingURL=stats.service.js.map