'use strict';
const express = require('express');
const pages = require('../controllers/pagesController');
const noticias = require('../controllers/noticiasController');
const normatividad = require('../controllers/normatividadController');
const pqrsd = require('../controllers/pqrsdController');
const buscar = require('../controllers/buscarController');
const { verifyToken } = require('../middleware/csrf');
const { noStore } = require('../middleware/security');
const limits = require('../middleware/rateLimits');

const router = express.Router();
const form = express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 30 });

router.get('/', pages.inicio);
router.get('/secretaria', pages.secretaria);
router.get('/tramites', pages.tramites);
router.get('/comunidad', pages.comunidad);
router.get('/transparencia', pages.transparencia);
router.get('/contacto', pages.contacto);
router.get('/mapa-del-sitio', pages.mapaSitio);
router.get('/buscar', buscar.index);

router.get('/noticias', noticias.index);
router.get('/noticias/:slug', noticias.show);

router.get('/normatividad', normatividad.index);
router.get('/documentos/:id', normatividad.descargar);

router.get('/atencion', noStore, pqrsd.index);
router.post('/atencion/pqrsd', noStore, limits.pqrsd, form, verifyToken, pqrsd.crear);
router.get('/atencion/pqrsd/confirmacion', noStore, pqrsd.confirmacion);
router.post('/atencion/consulta', noStore, limits.consulta, form, verifyToken, pqrsd.consultar);

module.exports = router;
