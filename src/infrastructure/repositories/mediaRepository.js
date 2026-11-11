'use strict';
const { db, toCamel, likePattern } = require('../database/connection');
const { orderBy, paginate, where } = require('../database/query');

const SELECT = `m.id, m.tipo, m.mime, m.extension, m.archivo, m.miniatura, m.nombre_visible, m.nombre_original, m.tamano,
  m.ancho, m.alto, m.texto_alternativo, m.descripcion, m.visibilidad, m.subido_por, m.creado_en, m.actualizado_en,
  (SELECT COUNT(*) FROM medios_usos mu WHERE mu.medio_id = m.id) AS total_usos`;
const SORT = { creadoEn: 'm.creado_en', nombreVisible: 'm.nombre_visible', tamano: 'm.tamano' };
const UPDATABLE = { nombreVisible: 'nombre_visible', textoAlternativo: 'texto_alternativo', descripcion: 'descripcion', visibilidad: 'visibilidad' };

const mediaRepository = {
  list({ q, tipo, visibilidad, page, pageSize, sort }) {
    const { whereSql, params } = where([
      q && [
        "m.nombre_visible LIKE ? ESCAPE '\\' OR m.descripcion LIKE ? ESCAPE '\\' OR m.texto_alternativo LIKE ? ESCAPE '\\'",
        likePattern(q),
        likePattern(q),
        likePattern(q),
      ],
      tipo && ['m.tipo = ?', tipo],
      visibilidad && ['m.visibilidad = ?', visibilidad],
    ]);
    return paginate({ from: 'medios m', select: SELECT, whereSql, params, order: orderBy(sort, SORT, 'm.creado_en DESC, m.id DESC', 'm.id'), page, pageSize });
  },

  findById(id) {
    return toCamel(db.prepare(`SELECT ${SELECT} FROM medios m WHERE m.id = ?`).get(id));
  },

  findByIds(ids) {
    if (!ids.length) return [];
    return db
      .prepare(`SELECT ${SELECT} FROM medios m WHERE m.id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)
      .map(toCamel);
  },

  findByFile(archivo) {
    return toCamel(db.prepare(`SELECT ${SELECT} FROM medios m WHERE m.archivo = ? OR m.miniatura = ?`).get(archivo, archivo));
  },

  create(m) {
    return Number(
      db
        .prepare(
          `INSERT INTO medios (tipo, mime, extension, archivo, miniatura, nombre_visible, nombre_original, tamano, ancho, alto, texto_alternativo, descripcion, visibilidad, subido_por, actualizado_por)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          m.tipo,
          m.mime,
          m.extension,
          m.archivo,
          m.miniatura ?? null,
          m.nombreVisible,
          m.nombreOriginal,
          m.tamano,
          m.ancho ?? null,
          m.alto ?? null,
          m.textoAlternativo ?? '',
          m.descripcion ?? '',
          m.visibilidad ?? 'privada',
          m.subidoPor ?? null,
          m.subidoPor ?? null,
        ).lastInsertRowid,
    );
  },

  update(id, fields, userId) {
    const entries = Object.entries(fields).filter(([k, v]) => UPDATABLE[k] && v !== undefined);
    if (!entries.length) return 0;
    const sets = entries.map(([k]) => `${UPDATABLE[k]} = ?`).join(', ');
    return db
      .prepare(`UPDATE medios SET ${sets}, actualizado_por = ?, actualizado_en = datetime('now') WHERE id = ?`)
      .run(...entries.map(([, v]) => v), userId ?? null, id).changes;
  },

  replaceFile(id, f, userId) {
    return db
      .prepare(
        `UPDATE medios SET mime = ?, extension = ?, archivo = ?, miniatura = ?, nombre_original = ?, tamano = ?, ancho = ?, alto = ?,
      actualizado_por = ?, actualizado_en = datetime('now') WHERE id = ?`,
      )
      .run(f.mime, f.extension, f.archivo, f.miniatura ?? null, f.nombreOriginal, f.tamano, f.ancho ?? null, f.alto ?? null, userId ?? null, id).changes;
  },

  delete(id) {
    return db.prepare('DELETE FROM medios WHERE id = ?').run(id).changes;
  },

  // --- Usos ---
  usagesOf(id) {
    return db
      .prepare(
        `SELECT mu.entidad, mu.entidad_id, mu.publicado,
        COALESCE(p.titulo, n.titulo, s.nombre) AS titulo
      FROM medios_usos mu
      LEFT JOIN paginas p ON mu.entidad = 'pagina' AND p.id = mu.entidad_id
      LEFT JOIN noticias n ON mu.entidad = 'noticia' AND n.id = mu.entidad_id
      LEFT JOIN diapositivas d ON mu.entidad = 'diapositiva' AND d.id = mu.entidad_id
      LEFT JOIN sliders s ON s.id = d.slider_id
      WHERE mu.medio_id = ? ORDER BY mu.entidad`,
      )
      .all(id)
      .map(toCamel);
  },

  /** Reemplaza los usos registrados de una entidad (página, noticia o diapositiva). */
  setUsages(entidad, entidadId, medioIds, publicado) {
    db.prepare('DELETE FROM medios_usos WHERE entidad = ? AND entidad_id = ?').run(entidad, entidadId);
    const ins = db.prepare('INSERT OR IGNORE INTO medios_usos (medio_id, entidad, entidad_id, publicado) SELECT id, ?, ?, ? FROM medios WHERE id = ?');
    for (const mid of medioIds) ins.run(entidad, entidadId, publicado ? 1 : 0, mid);
  },

  clearUsages(entidad, entidadId) {
    db.prepare('DELETE FROM medios_usos WHERE entidad = ? AND entidad_id = ?').run(entidad, entidadId);
  },

  /** Un archivo se sirve al público si es público o lo usa algún contenido publicado. */
  isPubliclyServable(id) {
    return !!db
      .prepare(
        `SELECT 1 FROM medios m WHERE m.id = ? AND (m.visibilidad = 'publica'
      OR EXISTS (SELECT 1 FROM medios_usos mu WHERE mu.medio_id = m.id AND mu.publicado = 1
        AND (mu.entidad <> 'noticia' OR EXISTS (
          SELECT 1 FROM noticias n WHERE n.id = mu.entidad_id
          AND n.estado = 'publicada' AND n.fecha_publicacion <= date('now', '-5 hours')
        ))))`,
      )
      .get(id);
  },

  existingIds(ids) {
    if (!ids.length) return [];
    return db
      .prepare(`SELECT id FROM medios WHERE id IN (${ids.map(() => '?').join(',')})`)
      .all(...ids)
      .map((r) => r.id);
  },
};

module.exports = mediaRepository;
