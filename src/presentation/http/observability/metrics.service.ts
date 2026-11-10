/**
 * Observabilidad sin servicios externos:
 *  - registro de cada petición en una línea JSON (método, patrón de ruta, estado, duración, ID);
 *    nunca la consulta, el cuerpo, las cabeceras ni la IP;
 *  - latencia y errores por ruta en una ventana deslizante (percentiles p50/p95/p99);
 *  - estado del pool de PostgreSQL, conexiones del servidor, memoria, CPU y retraso del event loop.
 * Expuesto en /api/v1/sistema/metricas (permiso system.read). /health/* no revela detalles.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { StatsService } from '../../../application/stats.service';
import { APP_CONFIG, type AppConfig } from '../../../config/configuration';
import { PublicCache } from '../../../infrastructure/cache/public-cache.service';
import { Db } from '../../../infrastructure/database/db.service';
import type { AppRequest } from '../http.types';

const WINDOW_MS = 5 * 60 * 1000;
const MAX_SAMPLES = 20_000;
const SLOW_MS = 1000;

interface Sample {
  at: number;
  route: string;
  ms: number;
  status: number;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] * 10) / 10;
}

function summarize(samples: Sample[]) {
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

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly logger = new Logger('Solicitud');
  private samples: Sample[] = [];
  private readonly loop = monitorEventLoopDelay({ resolution: 20 });
  private readonly startedAt = new Date();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
    private readonly cache: PublicCache,
    private readonly stats: StatsService,
  ) {
    this.loop.enable();
  }

  onModuleDestroy(): void {
    this.loop.disable();
  }

  /** Middleware de registro y medición. */
  middleware() {
    return (req: AppRequest, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        const route = req.routePattern ?? (req.route as { path?: string } | undefined)?.path ?? (req.path.startsWith('/assets/') ? '/assets/*' : 'sin-ruta');
        this.record({ at: Date.now(), route: `${req.method} ${route}`, ms, status: res.statusCode });
        if (!this.config.isTest && (ms >= SLOW_MS || res.statusCode >= 500 || process.env.LOG_REQUESTS === 'true')) {
          this.logger.log(JSON.stringify({ id: req.id, metodo: req.method, ruta: route, estado: res.statusCode, ms: Math.round(ms) }));
        }
      });
      next();
    };
  }

  private record(s: Sample): void {
    this.samples.push(s);
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  async snapshot() {
    const cutoff = Date.now() - WINDOW_MS;
    this.samples = this.samples.filter((s) => s.at >= cutoff);
    const byRoute = new Map<string, Sample[]>();
    for (const s of this.samples) byRoute.set(s.route, [...(byRoute.get(s.route) ?? []), s]);
    const pool = this.db.poolStats();
    let serverConnections: number | null = null;
    try {
      serverConnections = await this.db.scalar<number>("SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'semibague-%'");
    } catch {
      serverConnections = null;
    }
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const cache = this.cache.stats();
    const mb = (n: number) => Math.round((n / 1048576) * 10) / 10;
    return {
      instancia: this.config.instanceId,
      version: process.env.npm_package_version ?? '4.0.0',
      node: process.version,
      inicioEn: this.startedAt.toISOString(),
      tiempoActivoSegundos: Math.round(process.uptime()),
      memoria: { rssMb: mb(mem.rss), heapUsadoMb: mb(mem.heapUsed), heapTotalMb: mb(mem.heapTotal) },
      cpu: { usuarioMs: Math.round(cpu.user / 1000), sistemaMs: Math.round(cpu.system / 1000) },
      eventLoopRetrasoP99Ms: Math.round((this.loop.percentile(99) / 1e6) * 10) / 10,
      baseDeDatos: { poolMaximo: this.config.db.poolMax, conexiones: pool.total, libres: pool.idle, enEspera: pool.waiting, conexionesServidor: serverConnections },
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
}
