'use strict';
/** Buscador del sitio público: secciones fijas, páginas, noticias y documentos publicados. */
const INDEX = require('./searchIndex');

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function createSearchService({ pageService, newsService, documentService }) {
  return {
    search(q) {
      const words = norm(q).split(/\s+/).filter(Boolean);
      const matches = (text) => {
        const hay = norm(text);
        return words.every((w) => hay.includes(w));
      };
      const secciones = INDEX.filter((p) => matches(`${p.t} ${p.k}`));
      const paginas = pageService.listPublished().filter((p) => matches(`${p.titulo} ${p.slug}`) && !secciones.some((s) => s.u === `/${p.slug}`));
      return {
        secciones,
        paginas,
        noticias: newsService.listPublished({ q, pageSize: 10 }).items,
        documentos: documentService.listPublic({ q, pageSize: 10 }).items,
      };
    },
  };
}

module.exports = { createSearchService };
