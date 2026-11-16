/**
 * DataSource para la CLI de TypeORM (migraciones). Usa las credenciales del MIGRADOR
 * (DB_MIGRATION_USER / DB_MIGRATION_PASSWORD), nunca las de la aplicación.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../../config/configuration';
import { dataSourceOptions } from './data-source';

export default new DataSource(dataSourceOptions(loadConfig(), { forMigrations: true }));
