'use strict';
const { db, toCamel, likePattern } = require('../database/connection');
const { orderBy, paginate, where } = require('../database/query');

const SELECT = `n.id, n.slug, n.titulo, n.resumen, n.contenido, n.categoria, n.estado, n.fecha_publicacion, n.imagen_id,
  n.creado_por, n.actualizado_por, n.creado_en, n.actualizado_en`;
const SORT = { fechaPublicacion: 'n.fecha_publicacion', titulo: 'n.titulo', actualizadoEn: 'n.actualizado_en' };
const PUBLISHED = "n.estado = 'publicada' AND n.fecha_publicacion <= date('now', '-5 hours')";

function withPhotos(row) {
  if (!row) return null;
  row.fotos = db
    .prepare('SELECT medio_id FROM noticia_fotos WHERE noticia_id = ? ORDER BY orden')
    .all(row.id)
    .map((r) => r.medio_id);
  return row;
}

const newsRepository = {
  list({ q, estado, categoria, page, pageSize, sort, soloPublicadas = false }) {
    const { whereSql, params } = where([
      soloPublicadas && [PUBLISHED],
      q && ["n.titulo LIKE ? ESCAPE '\\' OR n.resumen LIKE ? ESCAPE '\\' OR n.contenido LIKE ? ESCAPE '\\'", likePattern(q), likePattern(q), likePattern(q)],
      estado && ['n.estado = ?', estado],
      categoria && ['n.categoria = ?', categoria],
    ]);
    return paginate({
      from: 'noticias n',
      select: SELECT,
      whereSql,
      params,
      order: orderBy(sort, SORT, 'n.fecha_publicacion DESC, n.id DESC', 'n.id'),
      page,
      pageSize,
    });
  },

  findById(id) {
    return withPhotos(toCamel(db.prepare(`SELECT ${SELECT} FROM noticias n WHERE n.id = ?`).get(id)));
  },

  findPublishedBySlug(slug) {
    return withPhotos(toCamel(db.prepare(`SELECT ${SELECT} FROM noticias n WHERE n.slug = ? AND ${PUBLISHED}`).get(slug)));
  },

  slugExists(slug, exceptId = 0) {
    return !!db.prepare('SELECT 1 FROM noticias WHERE slug = ? AND id <> ?').get(slug, exceptId);
  },

  create(d, userId) {
    return Number(
      db
        .prepare(
          `INSERT INTO noticias (slug, titulo, resumen, contenido, categoria, estado, fecha_publicacion, imagen_id, creado_por, actualizado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(d.slug, d.titulo, d.resumen, d.contenido, d.categoria, d.estado, d.fechaPublicacion, d.imagenId ?? null, userId, userId).lastInsertRowid,
    );
  },

  update(id, d, userId) {
    return db
      .prepare(
        `UPDATE noticias SET slug = ?, titulo = ?, resumen = ?, contenido = ?, categoria = ?, estado = ?, fecha_publicacion = ?,
      imagen_id = ?, actualizado_por = ?, actualizado_en = datetime('now') WHERE id = ?`,
      )
      .run(d.slug, d.titulo, d.resumen, d.contenido, d.categoria, d.estado, d.fechaPublicacion, d.imagenId ?? null, userId, id).changes;
  },

  setPhotos(id, medioIds) {
    db.prepare('DELETE FROM noticia_fotos WHERE noticia_id = ?').run(id);
    const ins = db.prepare('INSERT OR IGNORE INTO noticia_fotos (noticia_id, medio_id, orden) VALUES (?, ?, ?)');
    medioIds.forEach((mid, i) => ins.run(id, mid, i));
  },

  delete(id) {
    return db.prepare('DELETE FROM noticias WHERE id = ?').run(id).changes;
  },

  count() {
    return db.prepare('SELECT estado, COUNT(*) AS n FROM noticias GROUP BY estado').all();
  },
};

module.exports = newsRepository;
