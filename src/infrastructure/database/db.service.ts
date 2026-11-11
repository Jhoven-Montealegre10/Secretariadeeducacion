/**
 * Acceso a PostgreSQL para los repositorios.
 *  - Consultas SIEMPRE parametrizadas (pg envía el SQL y los valores por separado).
 *  - Transacciones cortas y componibles: dentro de `transaction()` todas las consultas usan la
 *    misma conexión (AsyncLocalStorage); una transacción anidada reutiliza la externa.
 *  - `afterCommit()` difiere efectos externos (invalidar caché, borrar archivos) hasta que el
 *    COMMIT se confirma; si hay ROLLBACK no se ejecutan.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type QueryRunner } from 'typeorm';
import { mapRows, toCamel, type Row } from './sql';

interface TxContext {
  runner: QueryRunner;
  after: Array<() => unknown>;
}

export interface ExecResult<T = Row> {
  rows: T[];
  rowCount: number;
}

/** Códigos de error de PostgreSQL que los servicios reconocen. */
export const PG = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  CHECK_VIOLATION: '23514',
  SERIALIZATION_FAILURE: '40001',
  DEADLOCK: '40P01',
  LOCK_TIMEOUT: '55P03',
  QUERY_CANCELED: '57014',
  INVALID_TEXT: '22021',
  UNTRANSLATABLE: '22P05',
  INVALID_DATETIME: '22007',
  DATETIME_OVERFLOW: '22008',
} as const;

export function pgCode(err: unknown): string | undefined {
  const e = err as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = e?.driverError?.code ?? e?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Claves de bloqueos consultivos (constantes para no colisionar). */
export const LOCKS = { AUDIT_CHAIN: 7_310_001, STATS_PURGE: 7_310_002, SESSION_PURGE: 7_310_003, TOKEN_PURGE: 7_310_004, USER_ADMIN: 7_310_005 } as const;

@Injectable()
export class Db {
  private readonly logger = new Logger('Db');
  private readonly als = new AsyncLocalStorage<TxContext>();

  constructor(readonly dataSource: DataSource) {}

  get inTransaction(): boolean {
    return this.als.getStore() !== undefined;
  }

  /** Ejecuta una sentencia y devuelve filas y número de filas afectadas. */
  async exec<T = Row>(sql: string, params: unknown[] = []): Promise<ExecResult<T>> {
    const ctx = this.als.getStore();
    const runner = ctx?.runner ?? this.dataSource.createQueryRunner();
    try {
      const result = await runner.query(sql, params, true);
      return { rows: (result.records ?? []) as T[], rowCount: result.affected ?? 0 };
    } finally {
      if (!ctx) await runner.release();
    }
  }

  /** Filas crudas (snake_case). */
  async query<T = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.exec<T>(sql, params)).rows;
  }

  /** Primera fila cruda (snake_case), o null. */
  async one<T = Row>(sql: string, params: unknown[] = []): Promise<T | null> {
    return (await this.query<T>(sql, params))[0] ?? null;
  }

  /** Filas convertidas a camelCase. */
  async rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return mapRows<T>(await this.query<Row>(sql, params));
  }

  /** Primera fila convertida a camelCase, o null. */
  async row<T>(sql: string, params: unknown[] = []): Promise<T | null> {
    return toCamel<T>((await this.query<Row>(sql, params))[0]);
  }

  async scalar<T = number>(sql: string, params: unknown[] = []): Promise<T> {
    const row = (await this.query<Row>(sql, params))[0];
    return (row ? Object.values(row)[0] : undefined) as T;
  }

  /** Número de filas afectadas por un INSERT/UPDATE/DELETE. */
  async run(sql: string, params: unknown[] = []): Promise<number> {
    return (await this.exec(sql, params)).rowCount;
  }

  /**
   * Ejecuta fn en una transacción READ COMMITTED. Debe ser corta: sin E/S externa (correo,
   * archivos, procesamiento de imágenes) dentro. Reentrante.
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.als.getStore()) return fn();
    const runner = this.dataSource.createQueryRunner();
    const ctx: TxContext = { runner, after: [] };
    let result: T;
    try {
      await runner.connect();
      await runner.startTransaction();
      result = await this.als.run(ctx, fn);
      await runner.commitTransaction();
    } catch (err) {
      if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => undefined);
      throw err;
    } finally {
      await runner.release();
    }
    for (const hook of ctx.after) {
      try {
        await hook();
      } catch (err) {
        this.logger.warn(`Tarea posterior al commit falló: ${(err as Error).message}`);
      }
    }
    return result;
  }

  /** Programa una tarea para después del COMMIT (o la ejecuta enseguida si no hay transacción). */
  afterCommit(hook: () => unknown): void {
    const ctx = this.als.getStore();
    if (ctx) {
      ctx.after.push(hook);
      return;
    }
    void Promise.resolve()
      .then(hook)
      .catch((err: unknown) => this.logger.warn(`Tarea posterior falló: ${(err as Error).message}`));
  }

  /** Bloqueo consultivo por transacción (se libera solo en COMMIT/ROLLBACK). */
  async advisoryXactLock(key: number): Promise<void> {
    if (!this.inTransaction) throw new Error('advisoryXactLock requiere una transacción');
    await this.exec('SELECT pg_advisory_xact_lock($1)', [key]);
  }

  /** Intenta un bloqueo consultivo por transacción sin esperar. */
  async tryAdvisoryXactLock(key: number): Promise<boolean> {
    if (!this.inTransaction) throw new Error('tryAdvisoryXactLock requiere una transacción');
    return (await this.scalar<boolean>('SELECT pg_try_advisory_xact_lock($1)', [key])) === true;
  }

  /** Estado del pool para salud y métricas (sin datos sensibles). */
  poolStats(): { total: number; idle: number; waiting: number } {
    const pool = (this.dataSource.driver as unknown as { master?: { totalCount: number; idleCount: number; waitingCount: number } }).master;
    return { total: pool?.totalCount ?? 0, idle: pool?.idleCount ?? 0, waiting: pool?.waitingCount ?? 0 };
  }
}
