/**
 * Logger de TypeORM que NUNCA registra los parámetros de las consultas (pueden contener hashes,
 * datos personales cifrados o tokens). Solo registra el código de error, el tipo de sentencia y,
 * para consultas lentas, la duración y la tabla principal.
 */
import { Logger as NestLogger } from '@nestjs/common';
import type { Logger as TypeOrmLogger } from 'typeorm';

const summary = (query: string) => query.replace(/\s+/g, ' ').trim().slice(0, 80).replace(/\$\d+/g, '?');

export class SafeQueryLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger('PostgreSQL');

  constructor(private readonly quiet: boolean) {}

  logQuery(): void {
    /* no se registran consultas normales */
  }

  logQueryError(error: string | Error, query: string): void {
    if (this.quiet) return;
    const code = (error as { code?: string }).code ?? '';
    this.logger.warn(`Consulta fallida [${code}]: ${summary(query)}`);
  }

  logQuerySlow(time: number, query: string): void {
    this.logger.warn(`Consulta lenta (${time} ms): ${summary(query)}`);
  }

  logSchemaBuild(): void {
    /* sin sincronización automática */
  }

  logMigration(message: string): void {
    this.logger.log(message);
  }

  log(level: 'log' | 'info' | 'warn', message: unknown): void {
    if (level === 'warn') this.logger.warn(String(message));
  }
}
