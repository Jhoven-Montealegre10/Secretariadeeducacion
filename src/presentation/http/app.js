'use strict';
/**
 * Ensamble de la aplicación HTTP (capa de presentación):
 *   seguridad → archivos estáticos → sesión → actor → analítica → API /api/v1 → sitio y panel → errores
 */
const path = require('node:path');
const express = require('express');
const config = require('../../config');
const site = require('../../config/site');
const { securityHeaders, permissionsPolicy } = require('./middleware/security');
const { sessionMiddleware, loadActor } = require('./middleware/session');
const { provideToken } = require('./middleware/csrf');
const { requestId, createErrorHandler, notFound } = require('./middleware/errorHandler');
const { analytics } = require('./middleware/analytics');
const limits = require('./middleware/rateLimits');
const { createApiRouter } = require('./api');
const { createWebRouter } = require('./web/routes');

function createApp(services) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  Object.assign(app.locals, require('../views/helpers'));

  app.use(requestId);
  app.use(securityHeaders);
  app.use(permissionsPolicy);
  app.use(limits.general);
  app.use(express.static(path.join(config.root, 'public'), { index: false, dotfiles: 'deny', maxAge: config.isProd ? '7d' : 0 }));

  app.use(sessionMiddleware);
  app.use(provideToken);
  app.use(loadActor(services.authService));
  app.use((req, res, next) => {
    res.locals.site = site;
    res.locals.path = req.path;
    res.locals.nav = '';
    res.locals.vistaPrevia = false;
    next();
  });
  app.use(analytics(services.statsService));

  app.use(createApiRouter(services));
  app.use(createWebRouter(services));

  app.use(notFound);
  app.use(createErrorHandler(services.audit));
  return app;
}

module.exports = { createApp };
