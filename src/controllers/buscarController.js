'use strict';
const Noticia = require('../models/Noticia');
const Documento = require('../models/Documento');
const INDEX = require('../services/searchIndex');
const { clean } = require('../services/validator');

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

module.exports = {
  index(req, res) {
    const q = clean(req.query.q).slice(0, 100);
    let paginas = [];
    let noticias = [];
    let documentos = [];
    if (q.length >= 2) {
      const words = norm(q).split(/\s+/).filter(Boolean);
      paginas = INDEX.filter((p) => { const hay = norm(`${p.t} ${p.k}`); return words.every((w) => hay.includes(w)); });
      noticias = Noticia.buscar(q);
      documentos = Documento.buscar(q);
    }
    res.render('pages/buscar', { title: 'Buscar', q, paginas, noticias, documentos, tipos: Documento.TIPOS });
  },
};
