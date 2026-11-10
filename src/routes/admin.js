'use strict';
const express = require('express');
const auth = require('../controllers/admin/authController');
const dashboard = require('../controllers/admin/dashboardController');
const noticias = require('../controllers/admin/noticiasController');
const documentos = require('../controllers/admin/documentosController');
const pqrsd = require('../controllers/admin/pqrsdController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { verifyToken } = require('../middleware/csrf');
const { noStore } = require('../middleware/security');
const { pdfUpload } = require('../middleware/upload');
const limits = require('../middleware/rateLimits');

const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 30 });

// Nada del panel se guarda en caché, y los buscadores no lo indexan.
router.use(noStore, (req, res, next) => { res.setHeader('X-Robots-Tag', 'noindex, nofollow'); next(); });

router.get('/login', auth.loginForm);
router.post('/login', limits.login, form, verifyToken, auth.login);

// Todo lo que sigue exige sesión iniciada.
router.use(requireAuth);
router.post('/logout', form, verifyToken, auth.logout);
router.get('/', dashboard.index);
router.get('/password', auth.passwordForm);
router.post('/password', limits.login, form, verifyToken, auth.cambiarPassword);

router.get('/noticias', noticias.index);
router.get('/noticias/nueva', noticias.nueva);
router.post('/noticias', form, verifyToken, noticias.crear);
router.get('/noticias/:id/editar', noticias.editar);
router.post('/noticias/:id', form, verifyToken, noticias.actualizar);
router.post('/noticias/:id/eliminar', form, verifyToken, noticias.eliminar);

router.get('/documentos', documentos.index);
router.get('/documentos/nuevo', documentos.nuevo);
router.post('/documentos', pdfUpload, verifyToken, documentos.crear);
router.post('/documentos/:id/eliminar', form, verifyToken, documentos.eliminar);

// Los datos personales de las PQRSD solo los ve el rol administrador.
router.get('/pqrsd', requireRole('admin'), pqrsd.index);
router.get('/pqrsd/:id', requireRole('admin'), pqrsd.show);
router.post('/pqrsd/:id', requireRole('admin'), form, verifyToken, pqrsd.responder);

module.exports = router;
