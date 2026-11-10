'use strict';
/** API pública de solo lectura: únicamente contenido publicado y campos aptos para visitantes. */
const P = require('../schemas/public');
const { DocumentList, DocumentQuery, toDocument } = require('../schemas/content');
const { paged } = require('../../defineRoute');
const { NotFoundError } = require('../../../../../domain/errors');
const { mediosEnBloques } = require('../../../../../domain/content');

function register({ route }, { newsService, pageService, sliderService, documentService, institutionService, mediaService }) {
  const TAG = ['Público'];
  const toItem = (images) => (n) => ({
    slug: n.slug,
    titulo: n.titulo,
    resumen: n.resumen,
    categoria: n.categoria,
    fechaPublicacion: n.fechaPublicacion,
    imagen: P.toImage(images.get(n.imagenId)),
    url: `/noticias/${n.slug}`,
  });

  route(
    {
      method: 'get',
      path: '/api/v1/public/noticias',
      tags: TAG,
      auth: 'public',
      summary: 'Noticias publicadas (más recientes primero)',
      description: 'Excluye borradores y noticias con fecha de publicación futura.',
      request: { query: P.PublicNewsQuery },
      responses: { 200: { description: 'Noticias', schema: P.PublicNewsList } },
    },
    (req) => {
      const result = newsService.listPublished(req.valid.query);
      const images = new Map(mediaService.findByIds(result.items.map((n) => n.imagenId)).map((m) => [m.id, m]));
      return paged(result, toItem(images));
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/public/noticias/{slug}',
      tags: TAG,
      auth: 'public',
      summary: 'Detalle de una noticia publicada',
      request: { params: P.SlugParams },
      responses: { 200: { description: 'Noticia', schema: P.PublicNewsOne } },
    },
    (req) => {
      const n = newsService.getPublished(req.valid.params.slug);
      if (!n) throw new NotFoundError('La noticia no existe.');
      const images = new Map(mediaService.findByIds([n.imagenId, ...n.fotos]).map((m) => [m.id, m]));
      return { data: { ...toItem(images)(n), contenido: n.contenido, fotos: n.fotos.map((id) => P.toImage(images.get(id))).filter(Boolean) } };
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/public/paginas/{slug}',
      tags: TAG,
      auth: 'public',
      summary: 'Página publicada con sus bloques',
      request: { params: P.SlugParams },
      responses: { 200: { description: 'Página', schema: P.PublicPage } },
    },
    (req) => {
      const p = pageService.getPublished(req.valid.params.slug);
      if (!p) throw new NotFoundError('La página no existe.');
      return {
        data: {
          slug: p.slug,
          titulo: p.titulo,
          resumen: p.resumen,
          bloques: p.bloques,
          medios: mediaService.findByIds(mediosEnBloques(p.bloques)).map(P.toPublicMedia),
        },
      };
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/public/sliders/{ubicacion}',
      tags: TAG,
      auth: 'public',
      summary: 'Slider activo de una ubicación',
      request: { params: P.LocationParams },
      responses: { 200: { description: 'Slider', schema: P.PublicSlider } },
    },
    (req) => {
      const s = sliderService.getPublic(req.valid.params.ubicacion);
      if (!s) throw new NotFoundError('No hay un slider activo en esa ubicación.');
      return {
        data: {
          ubicacion: s.ubicacion,
          diapositivas: s.diapositivas.map((d) => ({
            titulo: d.titulo,
            texto: d.texto,
            enlace: d.enlace,
            textoEnlace: d.textoEnlace,
            imagen: P.toImage(d.medio),
          })),
        },
      };
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/public/documentos',
      tags: TAG,
      auth: 'public',
      summary: 'Normatividad publicada',
      request: { query: DocumentQuery },
      responses: { 200: { description: 'Documentos', schema: DocumentList } },
    },
    (req) => paged(documentService.listPublic(req.valid.query), toDocument),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/public/instituciones',
      tags: TAG,
      auth: 'public',
      summary: 'Directorio de instituciones educativas oficiales',
      responses: { 200: { description: 'Instituciones', schema: P.PublicInstitutions } },
    },
    () => ({ data: institutionService.list().map((i) => ({ nombre: i.nombre, zona: i.zona })) }),
  );
}

module.exports = { register };
