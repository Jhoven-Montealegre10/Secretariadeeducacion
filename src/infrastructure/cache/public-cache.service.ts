/**
 * Caché en memoria del contenido PÚBLICO (páginas, noticias y sliders publicados).
 *  - Nunca guarda respuestas privadas, borradores ni datos de una sesión.
 *  - Caducidad corta (CACHE_TTL_SECONDS) y tamaño máximo (CACHE_MAX_ENTRIES, expulsión LRU).
 *  - Al publicar/editar/eliminar contenido se invalida en esta instancia y se avisa a las demás
 *    con LISTEN/NOTIFY de PostgreSQL (sin servicios adicionales como Redis).
 *  - Las cargas concurrentes de la misma clave se comparten (evita "estampidas" a la base).
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Client } from 'pg';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { Db } from '../database/db.service';
import { connectionOptions } from '../database/data-source';

const CHANNEL = 'semibague_cache';

interface Entry {
  expires: number;
  value: unknown;
}

@Injectable()
export class PublicCache implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PublicCache');
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private listener: Client | null = null;
  private generation = 0;
  private closing = false;
  hits = 0;
  misses = 0;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly db: Db,
  ) {}

  get enabled(): boolean {
    return this.config.cache.ttlSeconds > 0;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled || this.config.isTest) return;
    await this.listen();
  }

  private async listen(): Promise<void> {
    try {
      const client = new Client(connectionOptions(this.config));
      client.on('notification', (msg) => {
        if (msg.channel === CHANNEL && msg.payload !== this.config.instanceId) this.clearLocal();
      });
      client.on('error', (err) => {
        this.logger.warn(`Canal de invalidación caído: ${err.message}. Se vacía la caché y se reintenta.`);
        this.clearLocal();
        this.listener = null;
        if (!this.closing) setTimeout(() => void this.listen(), 5000).unref();
      });
      await client.connect();
      await client.query(`LISTEN ${CHANNEL}`);
      this.listener = client;
    } catch (err) {
      this.logger.warn(`No se pudo escuchar invalidaciones (${(err as Error).message}); la caché solo expira por tiempo.`);
      if (!this.closing) setTimeout(() => void this.listen(), 15000).unref();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    await this.listener?.end().catch(() => undefined);
  }

  /** Devuelve el valor en caché o lo carga; la carga es compartida entre peticiones simultáneas. */
  async get<T>(key: string, loader: () => Promise<T>): Promise<T> {
    if (!this.enabled) return loader();
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expires > now) {
      this.hits++;
      this.entries.delete(key); // reinsertar = más reciente (LRU)
      this.entries.set(key, hit);
      return hit.value as T;
    }
    this.misses++;
    const pending = this.inflight.get(key);
    if (pending) return pending as Promise<T>;
    const generation = this.generation;
    const promise = loader()
      .then((value) => {
        // Si hubo invalidación mientras se cargaba, no se guarda un valor posiblemente viejo.
        if (generation === this.generation) this.store(key, value);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private store(key: string, value: unknown): void {
    this.entries.set(key, { value, expires: Date.now() + this.config.cache.ttlSeconds * 1000 });
    while (this.entries.size > this.config.cache.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private clearLocal(): void {
    this.generation++;
    this.entries.clear();
  }

  /** Invalida todo el contenido público tras el COMMIT, en esta y en las demás instancias. */
  invalidate(): void {
    this.db.afterCommit(async () => {
      this.clearLocal();
      if (this.enabled && !this.config.isTest) await this.db.run('SELECT pg_notify($1, $2)', [CHANNEL, this.config.instanceId]);
    });
  }

  stats(): { entries: number; hits: number; misses: number; listening: boolean } {
    return { entries: this.entries.size, hits: this.hits, misses: this.misses, listening: this.listener !== null };
  }
}
