'use strict';
const Noticia = require('../../models/Noticia');
const Auditoria = require('../../models/Auditoria');
const { rules, validate, parseId } = require('../../services/validator');

const CATEGORIAS = ['Cobertura', 'Calidad educativa', 'Normatividad', 'Talento humano', 'Bienestar', 'Transparencia', 'Institucional'];

const schema = {
  titulo: [rules.text({ min: 5, max: 160 }), 'Título'],
  resumen: [rules.text({ min: 10, max: 300 }), 'Resumen'],
  contenido: [rules.text({ min: 20, max: 20000 }), 'Contenido'],
  categoria: [rules.oneOf(CATEGORIAS), 'Categoría'],
  fecha_publicacion: [rules.date(), 'Fecha de publicación'],
  publicada: [rules.checkbox(), 'Publicada'],
};

function form(res, noticia, errors = {}, status = 200) {
  res.status(status).render('admin/noticia-form', { title: noticia.id ? 'Editar noticia' : 'Nueva noticia', noticia, errors, categorias: CATEGORIAS });
}

module.exports = {
  index(req, res) {
    res.render('admin/noticias', { title: 'Noticias', noticias: Noticia.todas() });
  },

  nueva(req, res) {
    form(res, { publicada: 1, fecha_publicacion: new Date().toISOString().slice(0, 10), categoria: 'Institucional' });
  },

  crear(req, res) {
    const { data, errors, ok } = validate(req.body, schema);
    if (!ok) return form(res, data, errors, 422);
    const id = Noticia.crear(data, req.user.id);
    Auditoria.registrar(req.user.id, 'noticia_crear', `#${id} ${data.titulo}`);
    res.redirect(303, '/admin/noticias');
  },

  editar(req, res, next) {
    const noticia = Noticia.porId(parseId(req.params.id));
    if (!noticia) return next();
    form(res, noticia);
  },

  actualizar(req, res, next) {
    const id = parseId(req.params.id);
    if (!id || !Noticia.porId(id)) return next();
    const { data, errors, ok } = validate(req.body, schema);
    if (!ok) return form(res, { ...data, id }, errors, 422);
    Noticia.actualizar(id, data);
    Auditoria.registrar(req.user.id, 'noticia_editar', `#${id}`);
    res.redirect(303, '/admin/noticias');
  },

  eliminar(req, res, next) {
    const id = parseId(req.params.id);
    if (!id || !Noticia.eliminar(id)) return next();
    Auditoria.registrar(req.user.id, 'noticia_eliminar', `#${id}`);
    res.redirect(303, '/admin/noticias');
  },
};
