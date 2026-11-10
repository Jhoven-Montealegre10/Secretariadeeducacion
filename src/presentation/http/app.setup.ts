/**
 * Ensamble HTTP (capa de presentación), compartido por el servidor y las pruebas:
 *   ID de solicitud → métricas → cabeceras de seguridad → estáticos → cuerpos → sesión →
 *   actor (revalidado contra la BD) → datos de vista → analítica → CORS de la API pública →
 *   rutas Nest (guard → interceptor → controlador) → filtro de errores.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Response } from 'express';
import session from 'express-session';
import swaggerUiDist from 'swagger-ui-dist';
import { AuthService } from '../../application/auth.service';
import { StatsService } from '../../application/stats.service';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';
import { SITE } from '../../config/site';
import { Db } from '../../infrastructure/database/db.service';
import { CryptoService } from '../../infrastructure/security/crypto.service';
import { PgSessionStore } from '../../infrastructure/session/pg-session.store';
import { viewHelpers } from '../web/view-helpers';
import { OpenApiDocs } from './api/controllers/docs.controller';
import { buildOpenApiDocument } from './api/openapi-document';
import type { AppRequest } from './http.types';
import { MetricsService } from './observability/metrics.service';
import { CsrfService } from './security/csrf.service';
import { securityHeaders } from './security/headers';
import { sessionCookieName } from './session/session.helpers';

export async function configureApp(app: NestExpressApplication): Promise<PgSessionStore> {
  const config = app.get<AppConfig>(APP_CONFIG);
  const auth = app.get(AuthService);
  const stats = app.get(StatsService);
  const csrf = app.get(CsrfService);
  const metrics = app.get(MetricsService);

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.setViewEngine('ejs');
  app.setBaseViewsDir(path.join(config.root, 'views'));
  Object.assign(app.getHttpAdapter().getInstance().locals, viewHelpers);

  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    req.id = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(metrics.middleware());
  app.use(securityHeaders(config.isProd));
  app.use(express.static(path.join(config.root, 'public'), { index: false, dotfiles: 'deny', maxAge: config.isProd ? '7d' : 0 }));
  app.use('/api/docs/assets', express.static(swaggerUiDist.getAbsoluteFSPath(), { index: false, maxAge: config.isProd ? '7d' : 0 }));

  // Cuerpos: JSON solo en la API (límite global 1 MB; cada ruta tiene el suyo), formularios pequeños en el sitio.
  app.use('/api', express.json({ limit: '1mb', strict: true }));
  app.use(express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 30 }));

  const store = new PgSessionStore(app.get(Db), app.get(CryptoService), config.session.idleMs);
  app.use(
    session({
      name: sessionCookieName(config.isProd),
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, secure: config.isProd, sameSite: 'strict', maxAge: config.session.idleMs, path: '/' },
    }),
  );

  // Actor: se reconstruye desde la BD en cada petición; la sesión vence por inactividad y por tiempo absoluto.
  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    req.actor = null;
    const a = req.session?.auth;
    if (!a) return next();
    const expired = Date.now() - a.loginAt > config.session.absoluteMs;
    (expired ? Promise.resolve(null) : auth.loadActor(a.userId, a.authVersion))
      .then((actor) => {
        if (actor) req.actor = actor;
        else delete req.session.auth;
        next();
      })
      .catch(next);
  });

  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    res.locals.site = SITE;
    res.locals.path = req.path;
    res.locals.nav = '';
    res.locals.vistaPrevia = false;
    res.locals.actor = req.actor;
    res.locals.csrfToken = () => csrf.ensureToken(req);
    next();
  });

  // Analítica: solo vistas públicas exitosas marcadas por el controlador; nunca del panel.
  app.use((req: AppRequest, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      const ruta = res.locals.trackView as string | undefined;
      if (!ruta || res.statusCode !== 200 || req.method !== 'GET' || req.actor) return;
      stats.track({
        ruta,
        userAgent: req.get('user-agent') ?? '',
        referer: req.get('referer') ?? '',
        host: req.get('host') ?? '',
        ip: req.ip ?? '',
        doNotTrack: req.get('dnt') === '1' || req.get('sec-gpc') === '1',
        hasCampaign: typeof req.query.utm_source === 'string',
        pais: config.stats.geoHeader ? String(req.get(config.stats.geoHeader) ?? '').toUpperCase() : '',
      });
    });
    next();
  });

  // CORS solo para la API pública de lectura y solo para orígenes declarados (nunca "*" ni credenciales).
  app.use(['/api/v1/public', '/api/v1/openapi-publica.json'], (req: AppRequest, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (origin && config.api.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Accept');
      res.setHeader('Access-Control-Max-Age', '600');
      if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.enableShutdownHooks();
  await app.init();

  const docs = app.get(OpenApiDocs);
  docs.publicDoc = buildOpenApiDocument(app, 'public');
  docs.fullDoc = buildOpenApiDocument(app, 'full');
  return store;
}
