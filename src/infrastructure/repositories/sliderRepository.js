'use strict';
const { db, toCamel } = require('../database/connection');

const SLIDE = 'id, slider_id, medio_id, titulo, texto, enlace, texto_enlace, orden, activa, creado_en, actualizado_en';

const sliderRepository = {
  list() {
    return db
      .prepare(
        `SELECT s.id, s.nombre, s.ubicacion, s.activo, s.creado_en, s.actualizado_en,
      (SELECT COUNT(*) FROM diapositivas d WHERE d.slider_id = s.id) AS total_diapositivas FROM sliders s ORDER BY s.ubicacion`,
      )
      .all()
      .map(toCamel);
  },

  findById(id) {
    const s = toCamel(db.prepare('SELECT id, nombre, ubicacion, activo, creado_en, actualizado_en FROM sliders WHERE id = ?').get(id));
    if (s) s.diapositivas = this.slidesOf(id);
    return s;
  },

  findActiveByLocation(ubicacion) {
    const s = toCamel(db.prepare('SELECT id, nombre, ubicacion, activo FROM sliders WHERE ubicacion = ? AND activo = 1').get(ubicacion));
    if (!s) return null;
    s.diapositivas = db
      .prepare(`SELECT ${SLIDE} FROM diapositivas WHERE slider_id = ? AND activa = 1 AND medio_id IS NOT NULL ORDER BY orden, id`)
      .all(s.id)
      .map(toCamel);
    return s;
  },

  locationExists(ubicacion, exceptId = 0) {
    return !!db.prepare('SELECT 1 FROM sliders WHERE ubicacion = ? AND id <> ?').get(ubicacion, exceptId);
  },

  create(d, userId) {
    return Number(
      db
        .prepare('INSERT INTO sliders (nombre, ubicacion, activo, creado_por, actualizado_por) VALUES (?, ?, ?, ?, ?)')
        .run(d.nombre, d.ubicacion, d.activo ? 1 : 0, userId, userId).lastInsertRowid,
    );
  },

  update(id, d, userId) {
    return db
      .prepare(`UPDATE sliders SET nombre = ?, ubicacion = ?, activo = ?, actualizado_por = ?, actualizado_en = datetime('now') WHERE id = ?`)
      .run(d.nombre, d.ubicacion, d.activo ? 1 : 0, userId, id).changes;
  },

  delete(id) {
    return db.prepare('DELETE FROM sliders WHERE id = ?').run(id).changes;
  },

  slidesOf(sliderId) {
    return db.prepare(`SELECT ${SLIDE} FROM diapositivas WHERE slider_id = ? ORDER BY orden, id`).all(sliderId).map(toCamel);
  },

  findSlide(sliderId, slideId) {
    return toCamel(db.prepare(`SELECT ${SLIDE} FROM diapositivas WHERE id = ? AND slider_id = ?`).get(slideId, sliderId));
  },

  createSlide(sliderId, d) {
    const next = db.prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS n FROM diapositivas WHERE slider_id = ?').get(sliderId).n;
    return Number(
      db
        .prepare(`INSERT INTO diapositivas (slider_id, medio_id, titulo, texto, enlace, texto_enlace, orden, activa) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(sliderId, d.medioId, d.titulo, d.texto, d.enlace, d.textoEnlace, next, d.activa ? 1 : 0).lastInsertRowid,
    );
  },

  updateSlide(sliderId, slideId, d) {
    return db
      .prepare(
        `UPDATE diapositivas SET medio_id = ?, titulo = ?, texto = ?, enlace = ?, texto_enlace = ?, activa = ?, actualizado_en = datetime('now')
      WHERE id = ? AND slider_id = ?`,
      )
      .run(d.medioId, d.titulo, d.texto, d.enlace, d.textoEnlace, d.activa ? 1 : 0, slideId, sliderId).changes;
  },

  reorder(sliderId, ids) {
    const upd = db.prepare('UPDATE diapositivas SET orden = ? WHERE id = ? AND slider_id = ?');
    ids.forEach((id, i) => upd.run(i, id, sliderId));
  },

  deleteSlide(sliderId, slideId) {
    return db.prepare('DELETE FROM diapositivas WHERE id = ? AND slider_id = ?').run(slideId, sliderId).changes;
  },

  slideIdsOf(sliderId) {
    return db
      .prepare('SELECT id FROM diapositivas WHERE slider_id = ?')
      .all(sliderId)
      .map((r) => r.id);
  },
};

module.exports = sliderRepository;
