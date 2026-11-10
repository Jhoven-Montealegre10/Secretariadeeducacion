'use strict';
/**
 * API REST /api/v1 + documentación.
 *  - /api/v1/openapi-publica.json y /api/docs       → solo endpoints públicos (abierto).
 *  - /api/v1/openapi.json y /admin/api-docs          → especificación completa (requiere sesión del panel).
 * En producción las pruebas interactivas de Swagger quedan desactivadas por defecto
 * (API_DOCS_TRY_IT_OUT=false), y en la documentación pública solo se permite GET.
 */
const path = require('node:path');
const express = require('express');
const swaggerUiDist = require('swagger-ui-dist');
const config = require('../../../config');
const { createApi } = require('./defineRoute');
const { buildDocument } = require('./openapi');
const { docsHeaders, noStore } = require('../middleware/security');
const { publicCors } = require('../middleware/cors');
const limits = require('../middleware/rateLimits');
const { UnauthorizedError, NotFoundError } = require('../../../domain/errors');

const api = createApi('/api/v1');
let registered = false;

function registerControllers(services) {
  if (registered) return;
  require('./v1/controllers/publicController').register(api, services);
  require('./v1/controllers/authController').register(api, services);
  require('./v1/controllers/adminController').register(api, services);
  require('./v1/controllers/contentController').register(api, services);
  registered = true;
}

function requirePanelSession(req, res, next) {
  if (req.actor?.permisos.has('dashboard.access')) return next();
  if (req.accepts(['html', 'json']) === 'html') return res.redirect('/admin/login');
  return next(new UnauthorizedError());
}

function swaggerPage({ title, specUrl, mode }) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><link rel="stylesheet" href="/api/docs/assets/swagger-ui.css"><link rel="stylesheet" href="/assets/css/swagger.css"></head>
<body><div class="docs-bar">GOV.CO · ${title}</div><div id="swagger" data-spec="${specUrl}" data-mode="${mode}"></div>
<script src="/api/docs/assets/swagger-ui-bundle.js"></script><script src="/assets/js/swagger-init.js"></script></body></html>`;
}

function createApiRouter(services) {
  registerControllers(services);
  const router = express.Router();
  const publicDoc = buildDocument({ audience: 'public' });

  router.use('/api', limits.api);
  router.use('/api/v1/public', publicCors);
  router.use('/api/v1', (req, res, next) => {
    if (!req.path.startsWith('/public')) noStore(req, res, () => {});
    next();
  });

  router.get('/api/v1/openapi-publica.json', publicCors, (req, res) => res.json(publicDoc));
  router.get('/api/v1/openapi.json', requirePanelSession, noStore, (req, res) => res.json(buildDocument({ audience: 'full' })));

  router.use('/api/docs/assets', express.static(swaggerUiDist.getAbsoluteFSPath(), { index: false, maxAge: config.isProd ? '7d' : 0 }));
  router.get('/api/docs', docsHeaders, (req, res) => {
    res.type('html').send(swaggerPage({ title: 'API pública – SEM Ibagué', specUrl: '/api/v1/openapi-publica.json', mode: 'public' }));
  });
  router.get('/admin/api-docs', requirePanelSession, docsHeaders, noStore, (req, res) => {
    res
      .type('html')
      .send(swaggerPage({ title: 'API completa – SEM Ibagué', specUrl: '/api/v1/openapi.json', mode: config.api.docsTryItOut ? 'admin' : 'readonly' }));
  });

  router.use('/api/v1', api.router);
  router.use('/api', (req, res, next) => next(new NotFoundError('El endpoint no existe.')));
  return router;
}

module.exports = { createApiRouter, registerControllers, swaggerAssets: path.join(swaggerUiDist.getAbsoluteFSPath()) };
