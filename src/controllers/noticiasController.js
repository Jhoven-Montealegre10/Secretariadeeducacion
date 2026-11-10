'use strict';
const Noticia = require('../models/Noticia');

module.exports = {
  index(req, res) {
    const page = Math.min(Math.max(parseInt(req.query.page, 10) || 1, 1), 1000);
    res.render('pages/noticias', { title: 'Noticias', nav: 'noticias', ...Noticia.paginadas(page) });
  },

  show(req, res, next) {
    const slug = String(req.params.slug);
    if (!/^[a-z0-9-]{1,90}$/.test(slug)) return next();
    const noticia = Noticia.porSlug(slug);
    if (!noticia) return next();
    res.render('pages/noticia', { title: noticia.titulo, nav: 'noticias', noticia, otras: Noticia.recientes(4).filter((n) => n.id !== noticia.id).slice(0, 3) });
  },
};
