'use strict';
/**
 * Noticias: estado borrador/publicada, imagen principal y galería desde la biblioteca,
 * contenido enriquecido (HTML sanitizado). El texto plano anterior se convierte en
 * párrafos escapados, sin perder contenido.
 */
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const toParagraphs = (text) =>
  String(text || '')
    .split(/\r?\n\s*\r?\n|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE noticias_nueva (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        resumen TEXT NOT NULL,
        contenido TEXT NOT NULL,
        categoria TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicada')),
        fecha_publicacion TEXT NOT NULL,
        imagen_id INTEGER REFERENCES medios(id) ON DELETE SET NULL,
        creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE noticia_fotos (
        noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
        medio_id INTEGER NOT NULL REFERENCES medios(id) ON DELETE CASCADE,
        orden INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (noticia_id, medio_id)
      );
    `);
    const rows = db.prepare('SELECT * FROM noticias').all();
    const ins =
      db.prepare(`INSERT INTO noticias_nueva (id, slug, titulo, resumen, contenido, categoria, estado, fecha_publicacion, creado_por, actualizado_por, creado_en, actualizado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const r of rows) {
      ins.run(
        r.id,
        r.slug,
        r.titulo,
        r.resumen,
        toParagraphs(r.contenido),
        r.categoria,
        r.publicada ? 'publicada' : 'borrador',
        r.fecha_publicacion,
        r.autor_id,
        r.autor_id,
        r.creado_en,
        r.actualizado_en,
      );
    }
    db.exec(`
      DROP TABLE noticias;
      ALTER TABLE noticias_nueva RENAME TO noticias;
      CREATE INDEX idx_noticias_estado_fecha ON noticias(estado, fecha_publicacion DESC);
    `);
  },
};
