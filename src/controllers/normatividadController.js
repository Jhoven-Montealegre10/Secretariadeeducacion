'use strict';
const fs = require('node:fs');
const Documento = require('../models/Documento');
const { storedPath } = require('../middleware/upload');
const { parseId } = require('../services/validator');

module.exports = {
  index(req, res) {
    const grupos = Object.entries(Documento.TIPOS).map(([tipo, nombre]) => ({ tipo, nombre, documentos: Documento.porTipo(tipo) }));
    res.render('pages/normatividad', { title: 'Normatividad', nav: 'normatividad', grupos });
  },

  /** Descarga controlada: el archivo se busca por ID en la BD, nunca por una ruta enviada por el usuario. */
  descargar(req, res, next) {
    const id = parseId(req.params.id);
    const doc = id && Documento.porId(id);
    const file = doc && storedPath(doc.archivo);
    if (!file || !fs.existsSync(file)) return next();
    const nombre = `${doc.tipo}-${doc.numero}-${doc.anio}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${nombre}"`);
    fs.createReadStream(file).pipe(res);
  },
};
