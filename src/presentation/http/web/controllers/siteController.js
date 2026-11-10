'use strict';
/**
 * Controladores del sitio público (renderizado en el servidor). Usan los mismos servicios
 * que la API, de modo que borradores y archivos privados nunca llegan al público.
 */
const fs = require('node:fs');
const { z } = require('zod');
const { mediosEnBloques } = require('../../../../domain/content');
const { sandboxFile } = require('../../middleware/security');

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(1000).catch(1) });
const textQuery = (max) => z.string().trim().max(max).catch('');

function createSiteController({ newsService, pageService, sliderService, documentService, institutionService, mediaService, searchService }) {
  const mediaMap = (ids) => new Map(mediaService.findByIds(ids).map((m) => [m.id, m]));

  /** Datos que necesitan las vistas de bloques: medios resueltos y bloques dinámicos. */
  function blockContext(bloques, { q = '' } = {}) {
    return {
      medios: mediaMap(mediosEnBloques(bloques)),
      instituciones: bloques.some((b) => b.tipo === 'directorioInstituciones') ? institutionService.list(q) : [],
      q,
    };
  }

  return {
    home(req, res) {
      const noticias = newsService.latestPublished(3);
      res.locals.trackView = '/';
      res.render('pages/inicio', {
        title: 'Inicio',
        nav: 'inicio',
        noticias,
        imagenes: mediaMap(noticias.map((n) => n.imagenId)),
        slider: sliderService.getPublic('inicio'),
      });
    },

    page(req, res, next) {
      const pagina = pageService.getPublished(String(req.params.slug));
      if (!pagina) return next();
      const q = textQuery(80).parse(req.query.q);
      res.locals.trackView = `/${pagina.slug}`;
      res.render('pages/pagina', {
        title: pagina.titulo,
        nav: pagina.slug,
        pagina,
        slider: sliderService.getPublic(`pagina:${pagina.slug}`),
        ...blockContext(pagina.bloques, { q }),
      });
    },

    newsIndex(req, res) {
      const { page } = pageQuery.parse(req.query);
      const result = newsService.listPublished({ page, pageSize: 9 });
      res.locals.trackView = '/noticias';
      res.render('pages/noticias', {
        title: 'Noticias',
        nav: 'noticias',
        items: result.items,
        page,
        pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
        imagenes: mediaMap(result.items.map((n) => n.imagenId)),
      });
    },

    newsShow(req, res, next) {
      const noticia = newsService.getPublished(String(req.params.slug));
      if (!noticia) return next();
      const otras = newsService
        .latestPublished(4)
        .filter((n) => n.id !== noticia.id)
        .slice(0, 3);
      res.locals.trackView = `/noticias/${noticia.slug}`;
      res.render('pages/noticia', {
        title: noticia.titulo,
        nav: 'noticias',
        noticia,
        otras,
        imagenes: mediaMap([noticia.imagenId, ...noticia.fotos, ...otras.map((n) => n.imagenId)]),
      });
    },

    normatividad(req, res) {
      res.locals.trackView = '/normatividad';
      res.render('pages/normatividad', { title: 'Normatividad', nav: 'normatividad', grupos: documentService.groupedPublic() });
    },

    document(req, res, next) {
      const id = z.coerce.number().int().positive().safeParse(req.params.id);
      const file = id.success && documentService.file(id.data);
      if (!file) return next();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${file.nombre}"`);
      sandboxFile(res);
      fs.createReadStream(file.path).pipe(res);
    },

    /** Archivos de la biblioteca: solo públicos o usados en contenido publicado. */
    media(req, res, next) {
      const file = mediaService.publicFile(String(req.params.file));
      if (!file) return next();
      sandboxFile(res);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.type(file.mime).sendFile(file.path, (err) => err && next(err));
    },

    search(req, res) {
      const q = textQuery(100).parse(req.query.q);
      const results = q.length >= 2 ? searchService.search(q) : { secciones: [], paginas: [], noticias: [], documentos: [] };
      res.render('pages/buscar', { title: 'Buscar', q, ...results, tipos: documentService.TIPOS });
    },

    siteMap(req, res) {
      res.render('pages/mapa-sitio', { title: 'Mapa del sitio', paginas: pageService.listPublished() });
    },

    blockContext,
  };
}

module.exports = { createSiteController };
