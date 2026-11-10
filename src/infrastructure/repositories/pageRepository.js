'use strict';
const { db, toCamel, likePattern } = require('../database/connection');
const { orderBy, paginate, where } = require('../database/query');

const SELECT =
  'p.id, p.slug, p.titulo, p.resumen, p.bloques, p.estado, p.sistema, p.creado_por, p.actualizado_por, p.publicada_en, p.creado_en, p.actualizado_en';
const SORT = { titulo: 'p.titulo', actualizadoEn: 'p.actualizado_en', slug: 'p.slug' };

function map(row) {
  const p = toCamel(row);
  if (p) p.bloques = JSON.parse(p.bloques || '[]');
  return p;
}

const pageRepository = {
  list({ q, estado, page, pageSize, sort }) {
    const { whereSql, params } = where([
      q && ["p.titulo LIKE ? ESCAPE '\\' OR p.slug LIKE ? ESCAPE '\\'", likePattern(q), likePattern(q)],
      estado && ['p.estado = ?', estado],
    ]);
    return paginate({
      from: 'paginas p',
      select: SELECT,
      whereSql,
      params,
      order: orderBy(sort, SORT, 'p.sistema DESC, p.titulo ASC', 'p.id'),
      page,
      pageSize,
      map,
    });
  },

  findById(id) {
    return map(db.prepare(`SELECT ${SELECT} FROM paginas p WHERE p.id = ?`).get(id));
  },

  findPublishedBySlug(slug) {
    return map(db.prepare(`SELECT ${SELECT} FROM paginas p WHERE p.slug = ? AND p.estado = 'publicada'`).get(slug));
  },

  listPublishedSlugs() {
    return db.prepare("SELECT slug, titulo FROM paginas WHERE estado = 'publicada' ORDER BY titulo").all().map(toCamel);
  },

  slugExists(slug, exceptId = 0) {
    return !!db.prepare('SELECT 1 FROM paginas WHERE slug = ? AND id <> ?').get(slug, exceptId);
  },

  create(d, userId) {
    return Number(
      db
        .prepare(
          `INSERT INTO paginas (slug, titulo, resumen, bloques, estado, creado_por, actualizado_por, publicada_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'publicada' THEN datetime('now') END)`,
        )
        .run(d.slug, d.titulo, d.resumen, JSON.stringify(d.bloques), d.estado, userId, userId, d.estado).lastInsertRowid,
    );
  },

  update(id, d, userId) {
    return db
      .prepare(
        `UPDATE paginas SET slug = ?, titulo = ?, resumen = ?, bloques = ?, estado = ?, actualizado_por = ?,
      publicada_en = CASE WHEN ? = 'publicada' THEN COALESCE(publicada_en, datetime('now')) ELSE NULL END,
      actualizado_en = datetime('now') WHERE id = ?`,
      )
      .run(d.slug, d.titulo, d.resumen, JSON.stringify(d.bloques), d.estado, userId, d.estado, id).changes;
  },

  delete(id) {
    return db.prepare('DELETE FROM paginas WHERE id = ?').run(id).changes;
  },

  count() {
    return db.prepare('SELECT estado, COUNT(*) AS n FROM paginas GROUP BY estado').all();
  },
};

module.exports = pageRepository;
