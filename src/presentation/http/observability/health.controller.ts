/**
 * Salud para el balanceador o el orquestador, sin información sensible:
 *  - /health/live: el proceso responde;
 *  - /health/ready: además la base de datos responde y no hay migraciones pendientes.
 * Solo devuelven { estado } (sin versiones, rutas, hosts ni errores).
 */
import { Controller, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Db } from '../../../infrastructure/database/db.service';
import { WebRoute } from '../route-spec';

@Controller()
export class HealthController {
  constructor(private readonly db: Db) {}

  @WebRoute('get', '/health/live', { auth: 'public' })
  live(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ estado: 'ok' });
  }

  @WebRoute('get', '/health/ready', { auth: 'public' })
  async ready(@Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      await this.db.scalar('SELECT 1');
      const pending = await this.db.dataSource.showMigrations();
      if (pending) res.status(503).json({ estado: 'migraciones_pendientes' });
      else res.json({ estado: 'ok' });
    } catch {
      res.status(503).json({ estado: 'no_disponible' });
    }
  }
}
