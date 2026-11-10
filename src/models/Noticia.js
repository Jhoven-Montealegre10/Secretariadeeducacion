'use strict';
const { db, likePattern } = require('./db');

const COLS = 'id, slug, titulo, resumen, contenido, categoria, publicada, fecha_publicacion';

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'noticia';
}

const Noticia = {
  recientes(limit = 3) {
    return db.prepare(`SELECT ${COLS} FROM noticias WHERE publicada = 1 ORDER BY fecha_publicacion DESC, id DESC LIMIT ?`).all(limit);
  },

  paginadas(page = 1, perPage = 9) {
    const total = db.prepare('SELECT COUNT(*) AS n FROM noticias WHERE publicada = 1').get().n;
    const items = db.prepare(`SELECT ${COLS} FROM noticias WHERE publicada = 1 ORDER BY fecha_publicacion DESC, id DESC LIMIT ? OFFSET ?`)
      .all(perPage, (page - 1) * perPage);
    return { items, total, page, pages: Math.max(1, Math.ceil(total / perPage)) };
  },

  porSlug(slug) {
    return db.prepare(`SELECT ${COLS} FROM noticias WHERE slug = ? AND publicada = 1`).get(slug);
  },

  buscar(q, limit = 10) {
    const p = likePattern(q);
    return db.prepare(`SELECT ${COLS} FROM noticias WHERE publicada = 1 AND (titulo LIKE ? ESCAPE '\\' OR resumen LIKE ? ESCAPE '\\' OR contenido LIKE ? ESCAPE '\\') ORDER BY fecha_publicacion DESC LIMIT ?`)
      .all(p, p, p, limit);
  },

  // --- Administración ---
  todas() {
    return db.prepare(`SELECT ${COLS} FROM noticias ORDER BY fecha_publicacion DESC, id DESC`).all();
  },

  porId(id) {
    return db.prepare(`SELECT ${COLS} FROM noticias WHERE id = ?`).get(id);
  },

  _slugUnico(titulo, exceptId = 0) {
    const base = slugify(titulo);
    let slug = base;
    for (let i = 2; db.prepare('SELECT 1 FROM noticias WHERE slug = ? AND id <> ?').get(slug, exceptId); i++) slug = `${base}-${i}`;
    return slug;
  },

  crear(d, autorId) {
    const r = db.prepare(`INSERT INTO noticias (slug, titulo, resumen, contenido, categoria, publicada, fecha_publicacion, autor_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(this._slugUnico(d.titulo), d.titulo, d.resumen, d.contenido, d.categoria, d.publicada ? 1 : 0, d.fecha_publicacion, autorId ?? null);
    return Number(r.lastInsertRowid);
  },

  actualizar(id, d) {
    return db.prepare(`UPDATE noticias SET slug = ?, titulo = ?, resumen = ?, contenido = ?, categoria = ?, publicada = ?,
      fecha_publicacion = ?, actualizado_en = datetime('now') WHERE id = ?`)
      .run(this._slugUnico(d.titulo, id), d.titulo, d.resumen, d.contenido, d.categoria, d.publicada ? 1 : 0, d.fecha_publicacion, id).changes;
  },

  eliminar(id) {
    return db.prepare('DELETE FROM noticias WHERE id = ?').run(id).changes;
  },

  contar() {
    return db.prepare('SELECT COUNT(*) AS n FROM noticias').get().n;
  },
};

module.exports = Noticia;
