'use strict';
/**
 * Páginas editables por bloques. Reglas:
 *  - slug único, con formato válido y fuera de las rutas reservadas del sitio;
 *  - publicar (o modificar una página ya publicada) exige pages.publish;
 *  - las páginas del sistema (menú principal) no se eliminan ni cambian de slug;
 *  - todo HTML de los bloques se sanitiza en el servidor; los borradores nunca son públicos.
 */
const { authorize } = require('./authorization');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = require('../domain/errors');
const { SLUG_RE, SLUGS_RESERVADOS, slugify, bloquesSchema, mediosEnBloques } = require('../domain/content');

function sanitizeBlocks(bloques, sanitize) {
  return bloques.map((b) => {
    switch (b.tipo) {
      case 'texto':
      case 'aviso':
        return { ...b, html: sanitize(b.html) };
      case 'acordeon':
        return { ...b, intro: sanitize(b.intro), items: b.items.map((i) => ({ ...i, html: sanitize(i.html) })) };
      default:
        return b;
    }
  });
}

function createPageService({ pageRepository, mediaService, sanitizer, audit, transaction }) {
  function requirePage(id) {
    const p = pageRepository.findById(id);
    if (!p) throw new NotFoundError('La página no existe.');
    return p;
  }

  function normalizeSlug(slug, titulo, exceptId) {
    const value = (slug || slugify(titulo)).trim().toLowerCase();
    if (!SLUG_RE.test(value) || value.length > 80)
      throw new ValidationError('La dirección solo admite minúsculas, números y guiones.', [{ campo: 'slug', mensaje: 'Formato inválido' }]);
    if (SLUGS_RESERVADOS.includes(value)) throw new ValidationError('Esa dirección está reservada por el sistema.', [{ campo: 'slug', mensaje: 'Reservada' }]);
    if (pageRepository.slugExists(value, exceptId))
      throw new ConflictError('Ya existe una página con esa dirección.', [{ campo: 'slug', mensaje: 'Duplicada' }]);
    return value;
  }

  function prepareBlocks(bloques) {
    const parsed = bloquesSchema.safeParse(bloques);
    if (!parsed.success)
      throw new ValidationError(
        'Los bloques de la página no son válidos.',
        parsed.error.issues.map((i) => ({ campo: `bloques.${i.path.join('.')}`, mensaje: i.message })),
      );
    const clean = sanitizeBlocks(parsed.data, sanitizer.sanitizeRichText);
    mediaService.assertUsable(
      clean.filter((b) => b.tipo === 'imagen' || b.tipo === 'galeria').flatMap((b) => (b.medioId ? [b.medioId] : b.medios)),
      'imagen',
    );
    mediaService.assertUsable(
      clean.filter((b) => b.tipo === 'audio').map((b) => b.medioId),
      'audio',
    );
    return clean;
  }

  function persist(actor, id, data, accion, ip) {
    return transaction(() => {
      const pageId = id ?? pageRepository.create(data, actor.id);
      if (id) pageRepository.update(id, data, actor.id);
      mediaService.syncUsages('pagina', pageId, mediosEnBloques(data.bloques), data.estado === 'publicada');
      audit.record({ actor, accion, recurso: 'pagina', recursoId: pageId, detalle: `${data.slug} (${data.estado})`, ip });
      return pageRepository.findById(pageId);
    });
  }

  return {
    sanitizeBlocks: (b) => sanitizeBlocks(b, sanitizer.sanitizeRichText),

    list(actor, filters) {
      authorize(actor, 'pages.read');
      return pageRepository.list(filters);
    },

    get(actor, id) {
      authorize(actor, 'pages.read');
      return requirePage(id);
    },

    create(actor, input, ip) {
      authorize(actor, 'pages.create');
      if (input.estado === 'publicada') authorize(actor, 'pages.publish');
      const data = { titulo: input.titulo.trim(), resumen: (input.resumen ?? '').trim(), estado: input.estado, bloques: prepareBlocks(input.bloques ?? []) };
      data.slug = normalizeSlug(input.slug, data.titulo, 0);
      return persist(actor, null, data, 'pagina_crear', ip);
    },

    update(actor, id, input, ip) {
      authorize(actor, 'pages.update');
      const page = requirePage(id);
      const estado = input.estado ?? page.estado;
      if (estado === 'publicada' || page.estado === 'publicada') authorize(actor, 'pages.publish');
      const slugInput = input.slug ?? page.slug;
      if (page.sistema && slugInput !== page.slug) throw new ForbiddenError('La dirección de las páginas del sistema no se puede cambiar.');
      const data = {
        titulo: (input.titulo ?? page.titulo).trim(),
        resumen: (input.resumen ?? page.resumen).trim(),
        estado,
        bloques: input.bloques ? prepareBlocks(input.bloques) : page.bloques,
      };
      data.slug = page.sistema ? page.slug : normalizeSlug(slugInput, data.titulo, id);
      return persist(actor, id, data, estado !== page.estado ? `pagina_${estado === 'publicada' ? 'publicar' : 'despublicar'}` : 'pagina_editar', ip);
    },

    remove(actor, id, ip) {
      authorize(actor, 'pages.delete');
      const page = requirePage(id);
      if (page.sistema) throw new ForbiddenError('Las páginas del sistema no se pueden eliminar; puede editarlas o pasarlas a borrador.');
      transaction(() => {
        mediaService.clearUsages('pagina', id);
        pageRepository.delete(id);
        audit.record({ actor, accion: 'pagina_eliminar', recurso: 'pagina', recursoId: id, detalle: page.slug, ip });
      });
    },

    /** Sitio público: solo páginas publicadas. */
    getPublished(slug) {
      if (!SLUG_RE.test(String(slug))) return null;
      const page = pageRepository.findPublishedBySlug(slug);
      if (page) page.bloques = sanitizeBlocks(page.bloques, sanitizer.sanitizeRichText); // defensa en profundidad
      return page;
    },

    listPublished() {
      return pageRepository.listPublishedSlugs();
    },

    countByStatus() {
      return pageRepository.count();
    },
  };
}

module.exports = { createPageService };
