'use strict';
const Documento = require('../../models/Documento');
const Auditoria = require('../../models/Auditoria');
const { isPdf, savePdf, removeStored } = require('../../middleware/upload');
const { rules, validate, parseId } = require('../../services/validator');

const schema = {
  tipo: [rules.oneOf(Object.keys(Documento.TIPOS)), 'Tipo'],
  numero: [rules.pattern(/^[A-Za-z0-9.\-/ ]{1,30}$/, 'solo admite letras, números, puntos, guiones y barras.'), 'Número'],
  anio: [rules.int({ min: 1990, max: 2100 }), 'Año'],
  fecha: [rules.date(), 'Fecha'],
  asunto: [rules.text({ min: 5, max: 300 }), 'Asunto'],
};

function form(res, doc, errors = {}, status = 200) {
  res.status(status).render('admin/documento-form', { title: 'Publicar documento', doc, errors, tipos: Documento.TIPOS });
}

module.exports = {
  index(req, res) {
    res.render('admin/documentos', { title: 'Documentos y normatividad', documentos: Documento.todos(), tipos: Documento.TIPOS });
  },

  nuevo(req, res) {
    const hoy = new Date().toISOString().slice(0, 10);
    form(res, { tipo: 'circular', anio: hoy.slice(0, 4), fecha: hoy });
  },

  crear(req, res) {
    const { data, errors, ok } = validate(req.body, schema);
    const file = req.file;
    if (!file) errors.archivo = 'Adjunte el documento en PDF.';
    else if (!isPdf(file.buffer)) errors.archivo = 'El archivo no es un PDF válido.';
    if (!ok || errors.archivo) return form(res, data, errors, 422);

    const archivo = savePdf(file);
    const nombreOriginal = String(file.originalname).replace(/[^\w.\- ]/g, '_').slice(0, 120);
    try {
      const id = Documento.crear({ ...data, archivo, nombre_original: nombreOriginal, tamano: file.size }, req.user.id);
      Auditoria.registrar(req.user.id, 'documento_crear', `#${id} ${data.tipo} ${data.numero}`);
    } catch (err) {
      removeStored(archivo);
      throw err;
    }
    res.redirect(303, '/admin/documentos');
  },

  eliminar(req, res, next) {
    const id = parseId(req.params.id);
    const doc = id && Documento.porId(id);
    if (!doc) return next();
    Documento.eliminar(id);
    removeStored(doc.archivo);
    Auditoria.registrar(req.user.id, 'documento_eliminar', `#${id}`);
    res.redirect(303, '/admin/documentos');
  },
};
