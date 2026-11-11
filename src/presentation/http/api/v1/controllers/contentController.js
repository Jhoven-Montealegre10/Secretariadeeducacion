'use strict';
/** Multimedia, páginas, noticias, sliders, normatividad y PQRSD (panel). */
const S = require('../schemas/content');
const { IdParams } = require('../schemas/common');
const { paged } = require('../../defineRoute');
const limits = require('../../../middleware/rateLimits');
const { mediaUpload, mediaReplaceUpload, documentUpload } = require('../../../middleware/upload');
const { sandboxFile } = require('../../../middleware/security');
const { ValidationError } = require('../../../../../domain/errors');

function fields(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success)
    throw new ValidationError(
      undefined,
      r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })),
    );
  return r.data;
}

function register({ route }, { mediaService, pageService, newsService, sliderService, documentService, pqrsdService }) {
  // --- Multimedia ---
  const MEDIA = ['Multimedia'];
  route(
    {
      method: 'get',
      path: '/api/v1/medios',
      tags: MEDIA,
      auth: 'media.read',
      summary: 'Listar la biblioteca con búsqueda y filtros',
      request: { query: S.MediaQuery },
      responses: { 200: { description: 'Página de archivos', schema: S.MediaList } },
    },
    (req) => paged(mediaService.list(req.actor, req.valid.query), S.toMedia),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/medios',
      tags: MEDIA,
      auth: 'media.upload',
      rateLimit: limits.upload,
      summary: 'Subir imágenes o audios',
      description:
        'Se verifica el contenido real (no la extensión ni el MIME declarado). Las imágenes se re-codifican sin metadatos. Los archivos quedan privados hasta que se marquen públicos o los use un contenido publicado.',
      upload: { middleware: mediaUpload, schema: S.MediaUploadForm },
      errors: [503],
      responses: { 201: { description: 'Archivos guardados', schema: S.MediaUploadResult } },
    },
    async (req) => ({ data: (await mediaService.upload(req.actor, req.files, fields(S.MediaUploadFields, req.body), req.ip)).map(S.toMedia) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/medios/{id}',
      tags: MEDIA,
      auth: 'media.read',
      summary: 'Consultar un archivo y dónde se usa',
      request: { params: IdParams },
      responses: { 200: { description: 'Archivo', schema: S.MediaOne } },
    },
    (req) => ({ data: S.toMedia(mediaService.get(req.actor, req.valid.params.id)) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/medios/{id}/archivo',
      tags: MEDIA,
      auth: 'media.read',
      summary: 'Descargar o previsualizar el archivo (también privados)',
      request: { params: IdParams, query: S.FileQuery },
      fileResponse: 'Contenido binario del archivo',
      fileMime: 'image/*',
      responses: { 200: { description: 'Archivo' } },
    },
    (req, res, next) => {
      const file = mediaService.privateFile(req.actor, req.valid.params.id, { miniatura: req.valid.query.miniatura });
      sandboxFile(res);
      res.setHeader('Cache-Control', 'private, no-store');
      res.type(file.mime).sendFile(file.path, (err) => err && next(err));
    },
  );

  route(
    {
      method: 'patch',
      path: '/api/v1/medios/{id}',
      tags: MEDIA,
      auth: 'media.update',
      summary: 'Actualizar nombre visible, texto alternativo, descripción o visibilidad',
      request: { params: IdParams, body: S.MediaUpdate },
      responses: { 200: { description: 'Actualizado', schema: S.MediaOne } },
    },
    (req) => ({ data: S.toMedia(mediaService.update(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'put',
      path: '/api/v1/medios/{id}/archivo',
      tags: MEDIA,
      auth: 'media.update',
      rateLimit: limits.upload,
      summary: 'Reemplazar el archivo manteniendo su ID',
      description: 'Si el archivo está en uso responde 409 con la lista de usos; reenvíe con `confirmar=true`. Debe ser del mismo tipo (imagen/audio).',
      upload: { middleware: mediaReplaceUpload, schema: S.MediaReplaceForm },
      request: { params: IdParams },
      errors: [409, 503],
      responses: { 200: { description: 'Reemplazado', schema: S.MediaOne } },
    },
    async (req) => {
      if (!req.file) throw new ValidationError('Adjunte el archivo de reemplazo.', [{ campo: 'archivo', mensaje: 'Requerido' }]);
      const { confirmar } = fields(S.MediaReplaceFields, req.body);
      return { data: S.toMedia(await mediaService.replace(req.actor, req.valid.params.id, req.file, { confirmar }, req.ip)) };
    },
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/medios/{id}',
      status: 204,
      tags: MEDIA,
      auth: 'media.delete',
      summary: 'Eliminar definitivamente',
      description: 'Si el archivo está en uso responde 409 con la lista de usos; reenvíe con `?confirmar=true`.',
      request: { params: IdParams, query: S.ConfirmQuery },
      errors: [409],
      responses: { 204: { description: 'Eliminado' } },
    },
    (req) => {
      mediaService.remove(req.actor, req.valid.params.id, { confirmar: req.valid.query.confirmar }, req.ip);
    },
  );

  // --- Páginas ---
  const PAGES = ['Páginas'];
  route(
    {
      method: 'get',
      path: '/api/v1/paginas',
      tags: PAGES,
      auth: 'pages.read',
      summary: 'Listar páginas (borradores y publicadas)',
      request: { query: S.PageQuery },
      responses: { 200: { description: 'Páginas', schema: S.PageList } },
    },
    (req) => paged(pageService.list(req.actor, req.valid.query), S.toPageSummary),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/paginas',
      tags: PAGES,
      auth: 'pages.create',
      bodyLimit: '1mb',
      summary: 'Crear página',
      description: 'Publicar directamente exige `pages.publish`. El slug debe ser único y no reservado.',
      request: { body: S.PageCreate },
      errors: [409],
      responses: { 201: { description: 'Página creada', schema: S.PageOne } },
    },
    (req) => ({ data: S.toPage(pageService.create(req.actor, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/paginas/{id}',
      tags: PAGES,
      auth: 'pages.read',
      summary: 'Consultar página con sus bloques',
      request: { params: IdParams },
      responses: { 200: { description: 'Página', schema: S.PageOne } },
    },
    (req) => ({ data: S.toPage(pageService.get(req.actor, req.valid.params.id)) }),
  );

  route(
    {
      method: 'put',
      path: '/api/v1/paginas/{id}',
      tags: PAGES,
      auth: 'pages.update',
      bodyLimit: '1mb',
      summary: 'Editar o publicar página',
      description: 'Cambiar a publicada, o editar una página publicada, exige `pages.publish`. Las páginas del sistema no cambian de slug.',
      request: { params: IdParams, body: S.PageUpdate },
      errors: [409],
      responses: { 200: { description: 'Página guardada', schema: S.PageOne } },
    },
    (req) => ({ data: S.toPage(pageService.update(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/paginas/{id}',
      status: 204,
      tags: PAGES,
      auth: 'pages.delete',
      summary: 'Eliminar página definitivamente',
      description: 'Las páginas del sistema no se pueden eliminar.',
      request: { params: IdParams },
      responses: { 204: { description: 'Eliminada' } },
    },
    (req) => {
      pageService.remove(req.actor, req.valid.params.id, req.ip);
    },
  );

  // --- Noticias ---
  const NEWS = ['Noticias'];
  route(
    {
      method: 'get',
      path: '/api/v1/noticias',
      tags: NEWS,
      auth: 'news.read',
      summary: 'Listar noticias (borradores y publicadas)',
      request: { query: S.NewsQuery },
      responses: { 200: { description: 'Noticias', schema: S.NewsList } },
    },
    (req) => paged(newsService.list(req.actor, req.valid.query), S.toNewsItem),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/noticias',
      tags: NEWS,
      auth: 'news.create',
      bodyLimit: '512kb',
      summary: 'Crear noticia',
      description: 'Imagen principal y fotos se eligen de la biblioteca por ID. Publicar exige `news.publish`.',
      request: { body: S.NewsCreate },
      errors: [409],
      responses: { 201: { description: 'Noticia creada', schema: S.NewsOne } },
    },
    (req) => ({ data: S.toNews(newsService.create(req.actor, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/noticias/{id}',
      tags: NEWS,
      auth: 'news.read',
      summary: 'Consultar noticia',
      request: { params: IdParams },
      responses: { 200: { description: 'Noticia', schema: S.NewsOne } },
    },
    (req) => ({ data: S.toNews(newsService.get(req.actor, req.valid.params.id)) }),
  );

  route(
    {
      method: 'put',
      path: '/api/v1/noticias/{id}',
      tags: NEWS,
      auth: 'news.update',
      bodyLimit: '512kb',
      summary: 'Editar o publicar noticia',
      request: { params: IdParams, body: S.NewsUpdate },
      errors: [409],
      responses: { 200: { description: 'Noticia guardada', schema: S.NewsOne } },
    },
    (req) => ({ data: S.toNews(newsService.update(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/noticias/{id}',
      status: 204,
      tags: NEWS,
      auth: 'news.delete',
      summary: 'Eliminar noticia definitivamente',
      request: { params: IdParams },
      responses: { 204: { description: 'Eliminada' } },
    },
    (req) => {
      newsService.remove(req.actor, req.valid.params.id, req.ip);
    },
  );

  // --- Sliders ---
  const SLIDERS = ['Sliders'];
  route(
    {
      method: 'get',
      path: '/api/v1/sliders',
      tags: SLIDERS,
      auth: 'sliders.read',
      summary: 'Listar sliders',
      responses: { 200: { description: 'Sliders', schema: S.SliderList } },
    },
    (req) => ({ data: sliderService.list(req.actor).map(S.toSliderSummary) }),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/sliders',
      tags: SLIDERS,
      auth: 'sliders.create',
      summary: 'Crear slider en una ubicación',
      description: 'Ubicaciones: `inicio` o `pagina:<slug>` (p. ej. `pagina:secretaria`, `pagina:contacto`). Una por slider.',
      request: { body: S.SliderCreate },
      errors: [409],
      responses: { 201: { description: 'Slider creado', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.create(req.actor, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/sliders/{id}',
      tags: SLIDERS,
      auth: 'sliders.read',
      summary: 'Consultar slider con sus diapositivas',
      request: { params: IdParams },
      responses: { 200: { description: 'Slider', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.get(req.actor, req.valid.params.id)) }),
  );

  route(
    {
      method: 'patch',
      path: '/api/v1/sliders/{id}',
      tags: SLIDERS,
      auth: 'sliders.update',
      summary: 'Renombrar, mover o activar/desactivar',
      request: { params: IdParams, body: S.SliderUpdate },
      errors: [409],
      responses: { 200: { description: 'Slider actualizado', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.update(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/sliders/{id}',
      status: 204,
      tags: SLIDERS,
      auth: 'sliders.delete',
      summary: 'Eliminar slider definitivamente',
      request: { params: IdParams },
      responses: { 204: { description: 'Eliminado' } },
    },
    (req) => {
      sliderService.remove(req.actor, req.valid.params.id, req.ip);
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/sliders/{id}/diapositivas',
      tags: SLIDERS,
      auth: 'sliders.update',
      summary: 'Agregar diapositiva',
      request: { params: IdParams, body: S.SlideCreate },
      responses: { 201: { description: 'Slider actualizado', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.addSlide(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'put',
      path: '/api/v1/sliders/{id}/orden',
      tags: SLIDERS,
      auth: 'sliders.update',
      summary: 'Ordenar diapositivas',
      request: { params: IdParams, body: S.ReorderBody },
      responses: { 200: { description: 'Slider actualizado', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.reorder(req.actor, req.valid.params.id, req.valid.body.orden, req.ip)) }),
  );

  route(
    {
      method: 'patch',
      path: '/api/v1/sliders/{id}/diapositivas/{diapositivaId}',
      tags: SLIDERS,
      auth: 'sliders.update',
      summary: 'Editar, reemplazar imagen o activar/desactivar diapositiva',
      request: { params: S.SlideParams, body: S.SlideUpdate },
      responses: { 200: { description: 'Slider actualizado', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.updateSlide(req.actor, req.valid.params.id, req.valid.params.diapositivaId, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/sliders/{id}/diapositivas/{diapositivaId}',
      status: 200,
      tags: SLIDERS,
      auth: 'sliders.delete',
      summary: 'Eliminar diapositiva definitivamente',
      request: { params: S.SlideParams },
      responses: { 200: { description: 'Slider actualizado', schema: S.SliderOne } },
    },
    (req) => ({ data: S.toSlider(sliderService.removeSlide(req.actor, req.valid.params.id, req.valid.params.diapositivaId, req.ip)) }),
  );

  // --- Normatividad ---
  const DOCS = ['Normatividad'];
  route(
    {
      method: 'get',
      path: '/api/v1/documentos',
      tags: DOCS,
      auth: 'documents.read',
      summary: 'Listar documentos',
      request: { query: S.DocumentQuery },
      responses: { 200: { description: 'Documentos', schema: S.DocumentList } },
    },
    (req) => paged(documentService.list(req.actor, req.valid.query), S.toDocument),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/documentos',
      tags: DOCS,
      auth: 'documents.create',
      rateLimit: limits.upload,
      summary: 'Publicar documento PDF',
      upload: { middleware: documentUpload, schema: S.DocumentForm },
      errors: [503],
      responses: { 201: { description: 'Publicado', schema: S.DocumentOne } },
    },
    async (req) => ({ data: S.toDocument(await documentService.create(req.actor, fields(S.DocumentFields, req.body), req.file, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/documentos/{id}',
      status: 204,
      tags: DOCS,
      auth: 'documents.delete',
      summary: 'Eliminar documento definitivamente',
      request: { params: IdParams },
      responses: { 204: { description: 'Eliminado' } },
    },
    (req) => {
      documentService.remove(req.actor, req.valid.params.id, req.ip);
    },
  );

  // --- PQRSD ---
  const PQRSD = ['PQRSD'];
  route(
    {
      method: 'get',
      path: '/api/v1/pqrsd',
      tags: PQRSD,
      auth: 'pqrsd.read',
      summary: 'Listar solicitudes',
      request: { query: S.PqrsdQuery },
      responses: { 200: { description: 'Solicitudes', schema: S.PqrsdList } },
    },
    (req) => paged(pqrsdService.list(req.actor, req.valid.query), S.toPqrsdItem),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/pqrsd/{id}',
      tags: PQRSD,
      auth: 'pqrsd.read',
      summary: 'Consultar solicitud (datos personales, auditado)',
      request: { params: IdParams },
      responses: { 200: { description: 'Solicitud', schema: S.PqrsdOne } },
    },
    (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      return { data: S.toPqrsd(pqrsdService.get(req.actor, req.valid.params.id, req.ip)) };
    },
  );

  route(
    {
      method: 'put',
      path: '/api/v1/pqrsd/{id}/respuesta',
      tags: PQRSD,
      auth: 'pqrsd.respond',
      summary: 'Responder y cambiar estado',
      request: { params: IdParams, body: S.PqrsdRespond },
      responses: { 200: { description: 'Solicitud actualizada', schema: S.PqrsdOne } },
    },
    (req) => ({ data: S.toPqrsd(pqrsdService.respond(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );
}

module.exports = { register };
