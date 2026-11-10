/** Multimedia, páginas, noticias, sliders, normatividad y PQRSD (panel). */
import { Controller, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { DocumentService, PqrsdService } from '../../../../application/citizen.services';
import { NewsService, PageService, SliderService } from '../../../../application/content.services';
import { MediaService } from '../../../../application/media.service';
import { ValidationError } from '../../../../domain/errors';
import type { AppRequest } from '../../http.types';
import { Endpoint } from '../../route-spec';
import { sandboxFile } from '../../security/headers';
import { clientIp, valid } from '../../session/session.helpers';
import { zodDetails } from '../api.interceptor';
import { IdParams, paged } from '../schemas/common';
import * as S from '../schemas/content.schemas';

const MEDIA = ['Multimedia'];
const PAGES = ['Páginas'];
const NEWS = ['Noticias'];
const SLIDERS = ['Sliders'];
const DOCS = ['Normatividad'];
const PQRSD = ['PQRSD'];
const KB = 1024;
const id = (req: AppRequest) => valid(req, 'params', IdParams).id;
const mediaMax = (c: { uploads: { maxImageBytes: number; maxAudioBytes: number } }) => Math.max(c.uploads.maxImageBytes, c.uploads.maxAudioBytes);

/** Campos de texto de un formulario multipart, validados con su esquema. */
function fields<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new ValidationError(undefined, zodDetails(r.error));
  return r.data;
}

@Controller()
export class ContentController {
  constructor(
    private readonly media: MediaService,
    private readonly pages: PageService,
    private readonly news: NewsService,
    private readonly sliders: SliderService,
    private readonly documents: DocumentService,
    private readonly pqrsd: PqrsdService,
  ) {}

  // --- Multimedia ---

  @Endpoint('get', '/api/v1/medios', {
    tags: MEDIA,
    auth: 'media.read',
    summary: 'Listar la biblioteca con búsqueda y filtros',
    request: { query: S.MediaQuery },
    response: { description: 'Página de archivos', schema: S.MediaList },
  })
  async listMedia(@Req() req: AppRequest) {
    return paged(await this.media.list(req.actor, valid(req, 'query', S.MediaQuery)), S.toMedia);
  }

  @Endpoint('post', '/api/v1/medios', {
    tags: MEDIA,
    auth: 'media.upload',
    rateLimit: 'upload',
    summary: 'Subir imágenes o audios',
    description:
      'Se verifica el contenido real (no la extensión ni el MIME declarado). Las imágenes se re-codifican sin metadatos. Los archivos quedan privados hasta que se marquen públicos o los use un contenido publicado.',
    upload: { field: 'archivos', maxFiles: 10, maxBytes: mediaMax, form: S.MediaUploadForm },
    response: { description: 'Archivos guardados', schema: S.MediaUploadResult },
  })
  async uploadMedia(@Req() req: AppRequest) {
    const meta = fields(S.MediaUploadFields, req.body);
    return { data: (await this.media.upload(req.actor, req.files ?? [], meta, clientIp(req))).map(S.toMedia) };
  }

  @Endpoint('get', '/api/v1/medios/{id}', {
    tags: MEDIA,
    auth: 'media.read',
    summary: 'Consultar un archivo y dónde se usa',
    request: { params: IdParams },
    response: { description: 'Archivo', schema: S.MediaOne },
  })
  async getMedia(@Req() req: AppRequest) {
    return { data: S.toMedia(await this.media.get(req.actor, id(req))) };
  }

  @Endpoint('get', '/api/v1/medios/{id}/archivo', {
    tags: MEDIA,
    auth: 'media.read',
    summary: 'Descargar o previsualizar el archivo (también privados)',
    request: { params: IdParams, query: S.FileQuery },
    file: { description: 'Contenido binario del archivo', mime: 'image/*' },
  })
  async mediaFile(@Req() req: AppRequest, @Res() res: Response) {
    const file = await this.media.privateFile(req.actor, id(req), { miniatura: valid(req, 'query', S.FileQuery).miniatura ?? false });
    sandboxFile(res);
    res.setHeader('Cache-Control', 'private, no-store');
    await new Promise<void>((resolve, reject) => res.type(file.mime).sendFile(file.path, (err) => (err ? reject(err) : resolve())));
  }

  @Endpoint('patch', '/api/v1/medios/{id}', {
    tags: MEDIA,
    auth: 'media.update',
    summary: 'Actualizar nombre visible, texto alternativo, descripción o visibilidad',
    request: { params: IdParams, body: S.MediaUpdate },
    errors: [409],
    response: { description: 'Actualizado', schema: S.MediaOne },
  })
  async updateMedia(@Req() req: AppRequest) {
    return { data: S.toMedia(await this.media.update(req.actor, id(req), valid(req, 'body', S.MediaUpdate), clientIp(req))) };
  }

  @Endpoint('put', '/api/v1/medios/{id}/archivo', {
    tags: MEDIA,
    auth: 'media.update',
    rateLimit: 'upload',
    summary: 'Reemplazar el archivo manteniendo su ID',
    description: 'Si el archivo está en uso responde 409 con la lista de usos; reenvíe con `confirmar=true`. Debe ser del mismo tipo (imagen/audio).',
    upload: { field: 'archivo', maxFiles: 1, maxBytes: mediaMax, form: S.MediaReplaceForm },
    request: { params: IdParams },
    errors: [409],
    response: { description: 'Reemplazado', schema: S.MediaOne },
  })
  async replaceMedia(@Req() req: AppRequest) {
    const opts = fields(S.MediaReplaceFields, req.body);
    return { data: S.toMedia(await this.media.replace(req.actor, id(req), req.file, opts, clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/medios/{id}', {
    status: 204,
    tags: MEDIA,
    auth: 'media.delete',
    summary: 'Eliminar definitivamente',
    description: 'Si el archivo está en uso responde 409 con la lista de usos; reenvíe con `?confirmar=true`.',
    request: { params: IdParams, query: S.ConfirmQuery },
    errors: [409],
    response: { description: 'Eliminado' },
  })
  async deleteMedia(@Req() req: AppRequest) {
    await this.media.remove(req.actor, id(req), { confirmar: valid(req, 'query', S.ConfirmQuery).confirmar }, clientIp(req));
  }

  // --- Páginas ---

  @Endpoint('get', '/api/v1/paginas', {
    tags: PAGES,
    auth: 'pages.read',
    summary: 'Listar páginas (borradores y publicadas)',
    request: { query: S.PageQuery },
    response: { description: 'Páginas', schema: S.PageList },
  })
  async listPages(@Req() req: AppRequest) {
    return paged(await this.pages.list(req.actor, valid(req, 'query', S.PageQuery)), S.toPageSummary);
  }

  @Endpoint('post', '/api/v1/paginas', {
    tags: PAGES,
    auth: 'pages.create',
    bodyLimit: 1024 * KB,
    summary: 'Crear página',
    description: 'Publicar directamente exige `pages.publish`. El slug debe ser único y no reservado.',
    request: { body: S.PageCreate },
    errors: [409],
    response: { description: 'Página creada', schema: S.PageOne },
  })
  async createPage(@Req() req: AppRequest) {
    return { data: S.toPage(await this.pages.create(req.actor, valid(req, 'body', S.PageCreate), clientIp(req))) };
  }

  @Endpoint('get', '/api/v1/paginas/{id}', {
    tags: PAGES,
    auth: 'pages.read',
    summary: 'Consultar página con sus bloques',
    request: { params: IdParams },
    response: { description: 'Página', schema: S.PageOne },
  })
  async getPage(@Req() req: AppRequest) {
    return { data: S.toPage(await this.pages.get(req.actor, id(req))) };
  }

  @Endpoint('put', '/api/v1/paginas/{id}', {
    tags: PAGES,
    auth: 'pages.update',
    bodyLimit: 1024 * KB,
    summary: 'Editar o publicar página',
    description:
      'Cambiar a publicada, o editar una página publicada, exige `pages.publish`. Las páginas del sistema no cambian de slug. Envíe `version` para detectar ediciones simultáneas.',
    request: { params: IdParams, body: S.PageUpdate },
    errors: [409],
    response: { description: 'Página guardada', schema: S.PageOne },
  })
  async updatePage(@Req() req: AppRequest) {
    return { data: S.toPage(await this.pages.update(req.actor, id(req), valid(req, 'body', S.PageUpdate), clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/paginas/{id}', {
    status: 204,
    tags: PAGES,
    auth: 'pages.delete',
    summary: 'Eliminar página definitivamente',
    description: 'Las páginas del sistema no se pueden eliminar.',
    request: { params: IdParams },
    response: { description: 'Eliminada' },
  })
  async deletePage(@Req() req: AppRequest) {
    await this.pages.remove(req.actor, id(req), clientIp(req));
  }

  // --- Noticias ---

  @Endpoint('get', '/api/v1/noticias', {
    tags: NEWS,
    auth: 'news.read',
    summary: 'Listar noticias (borradores y publicadas)',
    request: { query: S.NewsQuery },
    response: { description: 'Noticias', schema: S.NewsList },
  })
  async listNews(@Req() req: AppRequest) {
    return paged(await this.news.list(req.actor, valid(req, 'query', S.NewsQuery)), S.toNewsItem);
  }

  @Endpoint('post', '/api/v1/noticias', {
    tags: NEWS,
    auth: 'news.create',
    bodyLimit: 512 * KB,
    summary: 'Crear noticia',
    description: 'Imagen principal y fotos se eligen de la biblioteca por ID. Publicar exige `news.publish`.',
    request: { body: S.NewsCreate },
    errors: [409],
    response: { description: 'Noticia creada', schema: S.NewsOne },
  })
  async createNews(@Req() req: AppRequest) {
    return { data: S.toNews(await this.news.create(req.actor, valid(req, 'body', S.NewsCreate), clientIp(req))) };
  }

  @Endpoint('get', '/api/v1/noticias/{id}', {
    tags: NEWS,
    auth: 'news.read',
    summary: 'Consultar noticia',
    request: { params: IdParams },
    response: { description: 'Noticia', schema: S.NewsOne },
  })
  async getNews(@Req() req: AppRequest) {
    return { data: S.toNews(await this.news.get(req.actor, id(req))) };
  }

  @Endpoint('put', '/api/v1/noticias/{id}', {
    tags: NEWS,
    auth: 'news.update',
    bodyLimit: 512 * KB,
    summary: 'Editar o publicar noticia',
    description: 'Envíe `version` para detectar ediciones simultáneas (409 EDIT_CONFLICT).',
    request: { params: IdParams, body: S.NewsUpdate },
    errors: [409],
    response: { description: 'Noticia guardada', schema: S.NewsOne },
  })
  async updateNews(@Req() req: AppRequest) {
    return { data: S.toNews(await this.news.update(req.actor, id(req), valid(req, 'body', S.NewsUpdate), clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/noticias/{id}', {
    status: 204,
    tags: NEWS,
    auth: 'news.delete',
    summary: 'Eliminar noticia definitivamente',
    request: { params: IdParams },
    response: { description: 'Eliminada' },
  })
  async deleteNews(@Req() req: AppRequest) {
    await this.news.remove(req.actor, id(req), clientIp(req));
  }

  // --- Sliders ---

  @Endpoint('get', '/api/v1/sliders', {
    tags: SLIDERS,
    auth: 'sliders.read',
    summary: 'Listar sliders',
    response: { description: 'Sliders', schema: S.SliderList },
  })
  async listSliders(@Req() req: AppRequest) {
    return { data: (await this.sliders.list(req.actor)).map(S.toSliderSummary) };
  }

  @Endpoint('post', '/api/v1/sliders', {
    tags: SLIDERS,
    auth: 'sliders.create',
    summary: 'Crear slider en una ubicación',
    description: 'Ubicaciones: `inicio` o `pagina:<slug>` (p. ej. `pagina:secretaria`, `pagina:contacto`). Una por slider.',
    request: { body: S.SliderCreate },
    errors: [409],
    response: { description: 'Slider creado', schema: S.SliderOne },
  })
  async createSlider(@Req() req: AppRequest) {
    return { data: S.toSlider(await this.sliders.create(req.actor, valid(req, 'body', S.SliderCreate), clientIp(req))) };
  }

  @Endpoint('get', '/api/v1/sliders/{id}', {
    tags: SLIDERS,
    auth: 'sliders.read',
    summary: 'Consultar slider con sus diapositivas',
    request: { params: IdParams },
    response: { description: 'Slider', schema: S.SliderOne },
  })
  async getSlider(@Req() req: AppRequest) {
    return { data: S.toSlider(await this.sliders.get(req.actor, id(req))) };
  }

  @Endpoint('patch', '/api/v1/sliders/{id}', {
    tags: SLIDERS,
    auth: 'sliders.update',
    summary: 'Renombrar, mover o activar/desactivar',
    request: { params: IdParams, body: S.SliderUpdate },
    errors: [409],
    response: { description: 'Slider actualizado', schema: S.SliderOne },
  })
  async updateSlider(@Req() req: AppRequest) {
    return { data: S.toSlider(await this.sliders.update(req.actor, id(req), valid(req, 'body', S.SliderUpdate), clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/sliders/{id}', {
    status: 204,
    tags: SLIDERS,
    auth: 'sliders.delete',
    summary: 'Eliminar slider definitivamente',
    request: { params: IdParams },
    response: { description: 'Eliminado' },
  })
  async deleteSlider(@Req() req: AppRequest) {
    await this.sliders.remove(req.actor, id(req), clientIp(req));
  }

  @Endpoint('post', '/api/v1/sliders/{id}/diapositivas', {
    tags: SLIDERS,
    auth: 'sliders.update',
    summary: 'Agregar diapositiva',
    request: { params: IdParams, body: S.SlideCreate },
    errors: [409],
    response: { description: 'Slider actualizado', schema: S.SliderOne },
  })
  async addSlide(@Req() req: AppRequest) {
    return { data: S.toSlider(await this.sliders.addSlide(req.actor, id(req), valid(req, 'body', S.SlideCreate), clientIp(req))) };
  }

  @Endpoint('put', '/api/v1/sliders/{id}/orden', {
    tags: SLIDERS,
    auth: 'sliders.update',
    summary: 'Ordenar diapositivas',
    request: { params: IdParams, body: S.ReorderBody },
    errors: [409],
    response: { description: 'Slider actualizado', schema: S.SliderOne },
  })
  async reorder(@Req() req: AppRequest) {
    const body = valid(req, 'body', S.ReorderBody);
    return { data: S.toSlider(await this.sliders.reorder(req.actor, id(req), body.orden, clientIp(req), body.version)) };
  }

  @Endpoint('patch', '/api/v1/sliders/{id}/diapositivas/{diapositivaId}', {
    tags: SLIDERS,
    auth: 'sliders.update',
    summary: 'Editar, reemplazar imagen o activar/desactivar diapositiva',
    request: { params: S.SlideParams, body: S.SlideUpdate },
    errors: [409],
    response: { description: 'Slider actualizado', schema: S.SliderOne },
  })
  async updateSlide(@Req() req: AppRequest) {
    const p = valid(req, 'params', S.SlideParams);
    return { data: S.toSlider(await this.sliders.updateSlide(req.actor, p.id, p.diapositivaId, valid(req, 'body', S.SlideUpdate), clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/sliders/{id}/diapositivas/{diapositivaId}', {
    status: 200,
    tags: SLIDERS,
    auth: 'sliders.delete',
    summary: 'Eliminar diapositiva definitivamente',
    request: { params: S.SlideParams, query: S.VersionQuery },
    errors: [409],
    response: { description: 'Slider actualizado', schema: S.SliderOne },
  })
  async removeSlide(@Req() req: AppRequest) {
    const p = valid(req, 'params', S.SlideParams);
    return { data: S.toSlider(await this.sliders.removeSlide(req.actor, p.id, p.diapositivaId, clientIp(req), valid(req, 'query', S.VersionQuery).version)) };
  }

  // --- Normatividad ---

  @Endpoint('get', '/api/v1/documentos', {
    tags: DOCS,
    auth: 'documents.read',
    summary: 'Listar documentos',
    request: { query: S.DocumentQuery },
    response: { description: 'Documentos', schema: S.DocumentList },
  })
  async listDocuments(@Req() req: AppRequest) {
    return paged(await this.documents.list(req.actor, valid(req, 'query', S.DocumentQuery)), S.toDocument);
  }

  @Endpoint('post', '/api/v1/documentos', {
    tags: DOCS,
    auth: 'documents.create',
    rateLimit: 'upload',
    summary: 'Publicar documento PDF',
    upload: { field: 'archivo', maxFiles: 1, maxBytes: (c) => c.uploads.maxDocumentBytes, form: S.DocumentForm },
    response: { description: 'Publicado', schema: S.DocumentOne },
  })
  async createDocument(@Req() req: AppRequest) {
    return { data: S.toDocument(await this.documents.create(req.actor, fields(S.DocumentFields, req.body), req.file, clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/documentos/{id}', {
    status: 204,
    tags: DOCS,
    auth: 'documents.delete',
    summary: 'Eliminar documento definitivamente',
    request: { params: IdParams },
    response: { description: 'Eliminado' },
  })
  async deleteDocument(@Req() req: AppRequest) {
    await this.documents.remove(req.actor, id(req), clientIp(req));
  }

  // --- PQRSD ---

  @Endpoint('get', '/api/v1/pqrsd', {
    tags: PQRSD,
    auth: 'pqrsd.read',
    summary: 'Listar solicitudes',
    request: { query: S.PqrsdQuery },
    response: { description: 'Solicitudes', schema: S.PqrsdList },
  })
  async listPqrsd(@Req() req: AppRequest) {
    return paged(await this.pqrsd.list(req.actor, valid(req, 'query', S.PqrsdQuery)), S.toPqrsdItem);
  }

  @Endpoint('get', '/api/v1/pqrsd/{id}', {
    tags: PQRSD,
    auth: 'pqrsd.read',
    summary: 'Consultar solicitud (datos personales, auditado)',
    request: { params: IdParams },
    response: { description: 'Solicitud', schema: S.PqrsdOne },
  })
  async getPqrsd(@Req() req: AppRequest) {
    return { data: S.toPqrsd(await this.pqrsd.get(req.actor, id(req), clientIp(req))) };
  }

  @Endpoint('put', '/api/v1/pqrsd/{id}/respuesta', {
    tags: PQRSD,
    auth: 'pqrsd.respond',
    summary: 'Responder y cambiar estado',
    request: { params: IdParams, body: S.PqrsdRespond },
    response: { description: 'Solicitud actualizada', schema: S.PqrsdOne },
  })
  async respondPqrsd(@Req() req: AppRequest) {
    const d = await this.pqrsd.respond(req.actor, id(req), valid(req, 'body', S.PqrsdRespond), clientIp(req));
    return { data: S.toPqrsd(d as NonNullable<typeof d>) };
  }
}
