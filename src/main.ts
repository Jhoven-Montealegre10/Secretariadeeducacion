/**
 * Punto de entrada del servidor.
 *  - En producción NO aplica migraciones (AUTO_MIGRATE=false): si hay pendientes, no arranca.
 *  - Escucha en 127.0.0.1 en producción (detrás del proxy inverso con TLS).
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { loadConfig } from './config/configuration';
import { dataSourceOptions } from './infrastructure/database/data-source';
import { configureApp } from './presentation/http/app.setup';

async function migrationsGate(config: ReturnType<typeof loadConfig>, logger: Logger): Promise<void> {
  const ds = new DataSource(dataSourceOptions(config, { forMigrations: config.autoMigrate }));
  await ds.initialize();
  try {
    if (config.autoMigrate) {
      const ran = await ds.runMigrations({ transaction: 'each' });
      if (ran.length) logger.log(`Migraciones aplicadas: ${ran.map((m) => m.name).join(', ')}`);
    } else if (await ds.showMigrations()) {
      throw new Error('Hay migraciones pendientes. Ejecute "npm run migrate" (con la cuenta de migraciones) antes de iniciar.');
    }
  } finally {
    await ds.destroy();
  }
}

async function bootstrap(): Promise<void> {
  const logger = new Logger('Servidor');
  const config = loadConfig();
  await migrationsGate(config, logger);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), { bodyParser: false, logger: ['error', 'warn', 'log'] });
  await configureApp(app);
  await app.listen(config.port, config.host);
  logger.log(`Portal SEM Ibagué en ${config.appUrl} (${config.env}, instancia ${config.instanceId})`);
}

bootstrap().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
