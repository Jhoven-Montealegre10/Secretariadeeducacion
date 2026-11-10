'use strict';
/** Rutas del sitio público y del panel (HTML). La administración real se hace vía /api/v1. */
const express = require('express');
const { createSiteController } = require('./controllers/siteController');
const { createPqrsdWebController } = require('./controllers/pqrsdWebController');
const { createAdminWebController } = require('./controllers/adminWebController');
const { verifyCsrf } = require('../middleware/csrf');
const { noStore } = require('../middleware/security');
const limits = require('../middleware/rateLimits');

function createWebRouter(services) {
  const router = express.Router();
  const site = createSiteController(services);
  const pqrsd = createPqrsdWebController(services);
  const admin = createAdminWebController({ ...services, siteController: site });
  const form = express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 30 });
  const robots = (req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  };

  // --- Panel (shell + vistas previas) ---
  router.get('/admin/login', noStore, robots, admin.loginPage);
  router.get('/admin/restablecer', noStore, robots, admin.resetPage);
  router.get('/admin/vista-previa/paginas/:id', noStore, robots, admin.previewPage);
  router.get('/admin/vista-previa/noticias/:id', noStore, robots, admin.previewNews);
  router.get(['/admin', '/admin/{*rest}'], noStore, robots, admin.shell);

  // --- Sitio público ---
  router.get('/', site.home);
  router.get('/noticias', site.newsIndex);
  router.get('/noticias/:slug', site.newsShow);
  router.get('/normatividad', site.normatividad);
  router.get('/documentos/:id', site.document);
  router.get('/media/:file', site.media);
  router.get('/buscar', site.search);
  router.get('/mapa-del-sitio', site.siteMap);

  router.get('/atencion', noStore, pqrsd.index);
  router.post('/atencion/pqrsd', noStore, limits.pqrsd, form, verifyCsrf, pqrsd.file);
  router.get('/atencion/pqrsd/confirmacion', noStore, pqrsd.confirmation);
  router.post('/atencion/consulta', noStore, limits.consulta, form, verifyCsrf, pqrsd.lookup);

  router.get('/.well-known/security.txt', (req, res) => {
    res.type('text/plain').send('Contact: mailto:educacion@ibague.gov.co\nPreferred-Languages: es\nPolicy: /transparencia#terminos\n');
  });
  router.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api/\n'));

  // Páginas editables por slug (secretaria, tramites, comunidad, transparencia, contacto…)
  router.get('/:slug', site.page);
  return router;
}

module.exports = { createWebRouter };
