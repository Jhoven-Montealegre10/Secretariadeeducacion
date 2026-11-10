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
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ValidationError } from '../domain/errors';
import type { Actor } from '../domain/permissions';
import { fechaColombia } from '../domain/publication';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { StatsRepository, type VisitRow } from '../infrastructure/repositories/citizen.repositories';
import { CryptoService } from '../infrastructure/security/crypto.service';
import { authorize } from './authorization';
import { CLOCK, type Clock } from './clock';

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|python-requests|curl|wget|httpclient|monitor|autocannon/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu|brave)\./i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|youtube|whatsapp|tiktok|threads)\.(com|co|me)$/i;
const DAY_MS = 86_400_000;
/** Tope del búfer: si la base no responde, se descartan visitas en lugar de agotar la memoria. */
const MAX_BUFFER = 10_000;

export function device(ua: string): 'tablet' | 'movil' | 'escritorio' | 'otro' {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'movil';
  if (/Windows|Macintosh|Linux|CrOS|X11/i.test(ua)) return 'escritorio';
  return 'otro';
}

export function source(referer: string, host: string, hasCampaign: boolean): { fuente: string; dominio: string | null } {
  if (hasCampaign) return { fuente: 'campana', dominio: null };
  let refHost = '';
  try {
    refHost = referer ? new URL(referer).hostname.toLowerCase() : '';
  } catch {
    refHost = '';
  }
  if (!refHost) return { fuente: 'directo', dominio: null };
  if (refHost === String(host).toLowerCase().split(':')[0]) return { fuente: 'interno', dominio: null };
  if (SEARCH.test(refHost)) return { fuente: 'buscador', dominio: refHost };
  if (SOCIAL.test(refHost)) return { fuente: 'redes_sociales', dominio: refHost };
  return { fuente: 'otro_sitio', dominio: refHost.slice(0, 120) };
}

export interface TrackInput {
  ruta: string;
  userAgent?: string;
  referer?: string;
  host?: string;
  ip?: string;
  doNotTrack?: boolean;
  hasCampaign?: boolean;
  pais?: string;
}

interface PendingVisit extends Omit<VisitRow, 'visitante'> {
  fingerprint: string;
}

@Injectable()
export class StatsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Estadisticas');
  private buffer: PendingVisit[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private lastPurge = '';
  private salt: { fecha: string; sal: string } | null = null;
  dropped = 0;

  constructor(
    private readonly repo: StatsRepository,
    private readonly crypto: CryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  onModuleInit(): void {
    if (this.config.stats.flushIntervalMs > 0) {
      this.timer = setInterval(() => void this.flush(), this.config.stats.flushIntervalMs);
      this.timer.unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.flush(); // no perder las visitas pendientes al apagar
  }

  /** Registra una vista de página pública. No lanza ni espera a la BD: la analítica nunca rompe el sitio. */
  track(input: TrackInput): boolean {
    const ua = input.userAgent ?? '';
    if (input.doNotTrack || !ua || BOT_RE.test(ua)) return false;
    if (this.buffer.length >= MAX_BUFFER) {
      this.dropped++;
      return false;
    }
    const { fuente, dominio } = source(input.referer ?? '', input.host ?? '', !!input.hasCampaign);
    this.buffer.push({
      fecha: fechaColombia(this.clock.now()),
      ruta: String(input.ruta).slice(0, 200),
      fingerprint: `${input.ip ?? ''}|${ua}`,
      fuente,
      referenteDominio: dominio,
      dispositivo: device(ua),
      pais: /^[A-Z]{2}$/.test(input.pais ?? '') ? (input.pais as string) : null,
    });
    if (this.config.stats.flushIntervalMs === 0 || this.buffer.length >= this.config.stats.flushBatchSize) void this.flush();
    return true;
  }

  private async saltFor(fecha: string): Promise<string> {
    if (this.salt?.fecha !== fecha) this.salt = { fecha, sal: await this.repo.saltFor(fecha) };
    return this.salt.sal;
  }

  /** Escribe el búfer en la BD (un lote a la vez). Las pruebas lo llaman para sincronizar. */
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    if (!this.buffer.length) return;
    this.flushing = (async () => {
      while (this.buffer.length) {
        const batch = this.buffer.splice(0, this.config.stats.flushBatchSize);
        try {
          const rows: VisitRow[] = [];
          for (const v of batch) {
            const sal = await this.saltFor(v.fecha);
            rows.push({ ...v, visitante: this.crypto.statsHash(sal, v.fingerprint).slice(0, 16) });
          }
          await this.repo.insertVisits(
            rows.map(({ fecha, ruta, visitante, fuente, referenteDominio, dispositivo, pais }) => ({
              fecha,
              ruta,
              visitante,
              fuente,
              referenteDominio,
              dispositivo,
              pais,
            })),
          );
          await this.purgeIfNeeded();
        } catch (err) {
          this.dropped += batch.length;
          this.logger.warn(`No se pudieron guardar ${batch.length} visitas: ${(err as Error).message}`);
          break;
        }
      }
    })().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async purgeIfNeeded(): Promise<void> {
    const today = fechaColombia(this.clock.now());
    if (this.lastPurge === today) return;
    await this.repo.purgeOlderThan(fechaColombia(this.clock.now() - this.config.stats.retentionDays * DAY_MS));
    this.lastPurge = today;
  }

  pending(): number {
    return this.buffer.length;
  }

  async report(actor: Actor | null, { desde, hasta }: { desde?: string; hasta?: string }) {
    authorize(actor, 'stats.read');
    await this.flush();
    const today = fechaColombia(this.clock.now());
    const to = hasta || today;
    const from = desde || fechaColombia(Date.parse(`${to}T12:00:00Z`) - 29 * DAY_MS);
    if (from > to) throw new ValidationError('La fecha inicial debe ser anterior a la final.', [{ campo: 'desde', mensaje: 'Rango inválido' }]);
    if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 366)
      throw new ValidationError('El rango máximo es de 366 días.', [{ campo: 'hasta', mensaje: 'Rango demasiado amplio' }]);
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
}
