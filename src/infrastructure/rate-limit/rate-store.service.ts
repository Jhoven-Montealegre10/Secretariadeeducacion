/**
 * Almacén de límites de la aplicación: Redis si hay REDIS_URL (compartido entre instancias), si no, memoria.
 * Si Redis no está disponible al arrancar, el portal arranca igual con el límite en memoria y se reconecta solo.
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { MemoryRateStore, RATE_STORE_PREFIX, type RateDecision, type RatePolicy, type RateStore, RedisRateStore } from './rate-store';

@Injectable()
export class RateStoreService implements RateStore, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Límites');
  private readonly store: RateStore;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const { redisUrl, maxMemoryKeys } = config.rateLimit;
    this.store = redisUrl ? new RedisRateStore(redisUrl, RATE_STORE_PREFIX, maxMemoryKeys) : new MemoryRateStore(maxMemoryKeys);
  }

  get kind(): RateStore['kind'] {
    return this.store.kind;
  }

  /** null si no se usa Redis. */
  get redisConnected(): boolean | null {
    return this.store instanceof RedisRateStore ? this.store.connected : null;
  }

  async onModuleInit(): Promise<void> {
    if (!(this.store instanceof RedisRateStore)) return;
    const redis = this.store;
    const timeout = new Promise<'tiempo'>((resolve) => setTimeout(() => resolve('tiempo'), 3000).unref());
    const result = await Promise.race([redis.connect().then(() => 'ok' as const), timeout]).catch(() => 'error' as const);
    if (result === 'ok') this.logger.log('Límites de peticiones compartidos en Redis.');
    else this.logger.warn('Redis no respondió al arrancar: se usa el límite en memoria hasta que se reconecte.');
  }

  consume(key: string, policy: RatePolicy): Promise<RateDecision> {
    return this.store.consume(key, policy);
  }

  async onModuleDestroy(): Promise<void> {
    await this.store.close();
  }

  close(): Promise<void> {
    return this.store.close();
  }
}
