'use strict';
/**
 * Noticias: imagen principal y galería desde la biblioteca, contenido enriquecido sanitizado.
 * Solo las publicadas con fecha de publicación cumplida aparecen en el sitio y en la API pública.
 */
const { authorize } = require('./authorization');
const { ConflictError, NotFoundError, ValidationError } = require('../domain/errors');
const { SLUG_RE, slugify } = require('../domain/content');

const CATEGORIAS = Object.freeze(['Institucional', 'Cobertura', 'Calidad educativa', 'Normatividad', 'Talento humano', 'Bienestar', 'Transparencia']);

function createNewsService({ newsRepository, mediaService, sanitizer, audit, transaction }) {
  function requireNews(id) {
    const n = newsRepository.findById(id);
    if (!n) throw new NotFoundError('La noticia no existe.');
    return n;
  }

  function uniqueSlug(slug, titulo, exceptId) {
    if (slug) {
      if (!SLUG_RE.test(slug))
        throw new ValidationError('La dirección solo admite minúsculas, números y guiones.', [{ campo: 'slug', mensaje: 'Formato inválido' }]);
      if (newsRepository.slugExists(slug, exceptId))
        throw new ConflictError('Ya existe una noticia con esa dirección.', [{ campo: 'slug', mensaje: 'Duplicada' }]);
      return slug;
    }
    const base = slugify(titulo);
    let candidate = base;
    for (let i = 2; newsRepository.slugExists(candidate, exceptId); i++) candidate = `${base}-${i}`;
    return candidate;
  }

  /** @param {any} input @param {any} [current] */
  function prepare(input, current = {}) {
    /** @type {any} */
    const merged = { ...current, ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) };
    if (!CATEGORIAS.includes(merged.categoria))
      throw new ValidationError('Categoría no válida.', [{ campo: 'categoria', mensaje: `Use: ${CATEGORIAS.join(', ')}` }]);
    const contenido = sanitizer.sanitizeRichText(merged.contenido);
    if (sanitizer.stripTags(contenido).length < 20)
      throw new ValidationError('El contenido debe tener al menos 20 caracteres de texto.', [{ campo: 'contenido', mensaje: 'Muy corto' }]);
    const fotos = [...new Set(merged.fotos ?? [])];
    mediaService.assertUsable([merged.imagenId, ...fotos], 'imagen');
    return {
      titulo: merged.titulo.trim(),
      resumen: merged.resumen.trim(),
      contenido,
      categoria: merged.categoria,
      estado: merged.estado,
      fechaPublicacion: merged.fechaPublicacion,
      imagenId: merged.imagenId ?? null,
      fotos,
    };
  }

  function persist(actor, id, data, accion, ip) {
    return transaction(() => {
      const newsId = id ?? newsRepository.create(data, actor.id);
      if (id) newsRepository.update(id, data, actor.id);
      newsRepository.setPhotos(newsId, data.fotos);
      mediaService.syncUsages('noticia', newsId, [data.imagenId, ...data.fotos], data.estado === 'publicada');
      audit.record({ actor, accion, recurso: 'noticia', recursoId: newsId, detalle: `${data.slug} (${data.estado})`, ip });
      return newsRepository.findById(newsId);
    });
  }

  return {
    CATEGORIAS,
    sanitize: (html) => sanitizer.sanitizeRichText(html),

    list(actor, filters) {
      authorize(actor, 'news.read');
      return newsRepository.list(filters);
    },

    get(actor, id) {
      authorize(actor, 'news.read');
      return requireNews(id);
    },

    create(actor, input, ip) {
      authorize(actor, 'news.create');
      if (input.estado === 'publicada') authorize(actor, 'news.publish');
      const data = prepare(input);
      data.slug = uniqueSlug(input.slug, data.titulo, 0);
      return persist(actor, null, data, 'noticia_crear', ip);
    },

    update(actor, id, input, ip) {
      authorize(actor, 'news.update');
      const current = requireNews(id);
      const data = prepare(input, current);
      if (data.estado === 'publicada' || current.estado === 'publicada') authorize(actor, 'news.publish');
      data.slug = input.slug && input.slug !== current.slug ? uniqueSlug(input.slug, data.titulo, id) : current.slug;
      const accion = data.estado !== current.estado ? `noticia_${data.estado === 'publicada' ? 'publicar' : 'despublicar'}` : 'noticia_editar';
      return persist(actor, id, data, accion, ip);
    },

    remove(actor, id, ip) {
      authorize(actor, 'news.delete');
      const n = requireNews(id);
      transaction(() => {
        mediaService.clearUsages('noticia', id);
        newsRepository.delete(id);
        audit.record({ actor, accion: 'noticia_eliminar', recurso: 'noticia', recursoId: id, detalle: n.slug, ip });
      });
    },

    // --- Sitio y API públicos: solo publicadas ---
    /** @param {{ page?: number, pageSize?: number, q?: string }} [options] */
    listPublished({ page = 1, pageSize = 9, q = undefined } = {}) {
      return newsRepository.list({ page, pageSize, q, soloPublicadas: true });
    },

    latestPublished(limit = 3) {
      return newsRepository.list({ page: 1, pageSize: limit, soloPublicadas: true }).items;
    },

    getPublished(slug) {
      if (!SLUG_RE.test(String(slug))) return null;
      const n = newsRepository.findPublishedBySlug(slug);
      if (n) n.contenido = sanitizer.sanitizeRichText(n.contenido); // defensa en profundidad
      return n;
    },

    countByStatus() {
      return newsRepository.count();
    },
  };
}

module.exports = { createNewsService, CATEGORIAS };
