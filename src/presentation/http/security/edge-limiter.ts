/**
 * Límite de borde contra ráfagas y bots: es el PRIMER filtro de cada petición (incluidos archivos estáticos y rutas
 * inexistentes) y responde 429 sin tocar sesiones, base de datos ni plantillas, así que rechazar es muy barato.
 *  - Ventana corta (por defecto 200 peticiones cada 10 s por cliente; una página con todos sus recursos usa ~40).
 *  - Quien la supera queda bloqueado un tiempo (por defecto 5 min): repetir la ráfaga no sirve.
 *  - IPv6 se agrupa por /64. La clave es un HMAC de la IP (nunca se guarda en claro).
 *  - Las sondas de salud no se limitan (las usa el balanceador; el proxy las restringe a la red interna).
 * Este límite protege la aplicación de un cliente abusivo; un ataque distribuido (miles de IP) se frena antes,
 * en el proxy inverso y en la CDN/WAF (docs/DESPLIEGUE.md §7).
 */
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../../../config/configuration';
import type { CryptoService } from '../../../infrastructure/security/crypto.service';
import { clientId, type RateStore } from '../../../infrastructure/rate-limit/rate-store';

const MESSAGE = 'Ha realizado demasiadas solicitudes en poco tiempo. Espere unos minutos e intente de nuevo.';

export interface EdgeLimiterStats {
  rechazadas: number;
}

export function edgeLimiter(config: AppConfig, store: RateStore, crypto: CryptoService, stats?: EdgeLimiterStats) {
  const policy = { windowMs: config.rateLimit.windowMs, limit: config.rateLimit.burst, blockMs: config.rateLimit.blockMs };
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/health/')) return next();
    const key = `borde:${crypto.statsHash('rate-limit', clientId(req.ip)).slice(0, 24)}`;
    store
      .consume(key, policy)
      .then((d) => {
        if (d.allowed) return next();
        if (stats) stats.rechazadas++;
        const retry = Math.max(1, Math.ceil(d.resetMs / 1000));
        res.setHeader('Retry-After', String(retry));
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('RateLimit-Policy', `${policy.limit};w=${Math.round(policy.windowMs / 1000)}`);
        res.setHeader('RateLimit', `limit=${policy.limit}, remaining=0, reset=${retry}`);
        res.setHeader('Connection', 'close'); // libera el socket del cliente abusivo
        if (req.path.startsWith('/api/')) {
          res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message: MESSAGE } });
        } else {
          res.status(429).type('text/plain; charset=utf-8').send(MESSAGE);
        }
      })
      .catch(next);
  };
}
