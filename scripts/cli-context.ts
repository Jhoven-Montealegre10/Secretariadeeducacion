/** Contexto de aplicación (sin servidor HTTP) para los comandos de consola. */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { loadConfig } from '../src/config/configuration';

export async function withApp<T>(fn: (app: INestApplicationContext) => Promise<T>): Promise<T> {
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(loadConfig()), { logger: ['error', 'warn'] });
  try {
    return await fn(app);
  } finally {
    await app.close();
  }
}
