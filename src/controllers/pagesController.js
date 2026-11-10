'use strict';
/** Páginas institucionales: el controlador pide datos al modelo y entrega la vista. */
const Noticia = require('../models/Noticia');
const Institucion = require('../models/Institucion');
const { clean } = require('../services/validator');

module.exports = {
  inicio(req, res) {
    res.render('pages/inicio', { title: 'Inicio', nav: 'inicio', noticias: Noticia.recientes(3) });
  },

  secretaria(req, res) {
    res.render('pages/secretaria', { title: 'La Secretaría', nav: 'secretaria' });
  },

  tramites(req, res) {
    res.render('pages/tramites', { title: 'Trámites y servicios', nav: 'tramites' });
  },

  comunidad(req, res) {
    const q = clean(req.query.q).slice(0, 80);
    res.render('pages/comunidad', { title: 'Comunidad educativa', nav: 'comunidad', q, instituciones: Institucion.listar(q) });
  },

  transparencia(req, res) {
    res.render('pages/transparencia', { title: 'Transparencia y acceso a la información pública', nav: 'transparencia' });
  },

  contacto(req, res) {
    res.render('pages/contacto', { title: 'Contacto', nav: 'contacto' });
  },

  mapaSitio(req, res) {
    res.render('pages/mapa-sitio', { title: 'Mapa del sitio' });
  },
};
