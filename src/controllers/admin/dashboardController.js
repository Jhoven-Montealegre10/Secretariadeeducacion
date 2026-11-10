'use strict';
const Noticia = require('../../models/Noticia');
const Documento = require('../../models/Documento');
const Pqrsd = require('../../models/Pqrsd');
const Auditoria = require('../../models/Auditoria');

module.exports = {
  index(req, res) {
    res.render('admin/dashboard', {
      title: 'Panel de administración',
      totalNoticias: Noticia.contar(),
      totalDocumentos: Documento.contar(),
      pqrsdPorEstado: Pqrsd.contarPorEstado(),
      actividad: req.user.rol === 'admin' ? Auditoria.recientes(15) : [],
    });
  },
};
