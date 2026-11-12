/** API pública de solo lectura: únicamente contenido publicado y campos aptos para visitantes. */
import { Controller, Req } from '@nestjs/common';
import { DocumentService, InstitutionService } from '../../../../application/citizen.services';
import { NewsService, PageService, SliderService } from '../../../../application/content.services';
import { MediaService } from '../../../../application/media.service';
import { mediosEnBloques } from '../../../../domain/content';
import { NotFoundError } from '../../../../domain/errors';
import type { MediaRecord, NewsRecord } from '../../../../infrastructure/repositories/content.repositories';
import type { AppRequest } from '../../http.types';
import { Endpoint } from '../../route-spec';
import { valid } from '../../session/session.helpers';
import { paged } from '../schemas/common';
import { DocumentList, DocumentQuery, toDocument } from '../schemas/content.schemas';
import * as P from '../schemas/public.schemas';

const TAG = ['Público'];

const toItem = (images: Map<number, MediaRecord>) => (n: NewsRecord) => ({
  slug: n.slug,
  titulo: n.titulo,
  resumen: n.resumen,
  categoria: n.categoria,
  fechaPublicacion: n.fechaPublicacion,
  imagen: P.toImage(n.imagenId ? images.get(n.imagenId) : null),
  url: `/noticias/${n.slug}`,
});

@Controller()
export class PublicController {
  constructor(
    private readonly news: NewsService,
    private readonly pages: PageService,
    private readonly sliders: SliderService,
    private readonly documents: DocumentService,
    private readonly institutions: InstitutionService,
    private readonly media: MediaService,
  ) {}

  private async imageMap(ids: Array<number | null | undefined>): Promise<Map<number, MediaRecord>> {
    return new Map((await this.media.findByIds(ids)).map((m) => [m.id, m]));
  }

  @Endpoint('get', '/api/v1/public/noticias', {
    tags: TAG,
    auth: 'public',
    summary: 'Noticias publicadas (más recientes primero)',
    description: 'Excluye borradores y noticias con fecha de publicación futura.',
    request: { query: P.PublicNewsQuery },
    response: { description: 'Noticias', schema: P.PublicNewsList },
  })
  async listNews(@Req() req: AppRequest) {
    const result = await this.news.listPublished(valid(req, 'query', P.PublicNewsQuery));
    return paged(result, toItem(await this.imageMap(result.items.map((n) => n.imagenId))));
  }

  @Endpoint('get', '/api/v1/public/noticias/{slug}', {
    tags: TAG,
    auth: 'public',
    summary: 'Detalle de una noticia publicada',
    request: { params: P.SlugParams },
    response: { description: 'Noticia', schema: P.PublicNewsOne },
  })
  async getNews(@Req() req: AppRequest) {
    const n = await this.news.getPublished(valid(req, 'params', P.SlugParams).slug);
    if (!n) throw new NotFoundError('La noticia no existe.');
    const fotos = n.fotos ?? [];
    const images = await this.imageMap([n.imagenId, ...fotos]);
    return {
      data: {
        ...toItem(images)(n),
        contenido: n.contenido,
        fotos: fotos.map((id) => P.toImage(images.get(id))).filter((x): x is NonNullable<typeof x> => x !== null),
      },
    };
  }

  @Endpoint('get', '/api/v1/public/paginas/{slug}', {
    tags: TAG,
    auth: 'public',
    summary: 'Página publicada con sus bloques',
    request: { params: P.SlugParams },
    response: { description: 'Página', schema: P.PublicPage },
  })
  async getPage(@Req() req: AppRequest) {
    const p = await this.pages.getPublished(valid(req, 'params', P.SlugParams).slug);
    if (!p) throw new NotFoundError('La página no existe.');
    return {
      data: {
        slug: p.slug,
        titulo: p.titulo,
        resumen: p.resumen,
        bloques: p.bloques,
        medios: (await this.media.findByIds(mediosEnBloques(p.bloques))).map(P.toPublicMedia),
      },
    };
  }

  @Endpoint('get', '/api/v1/public/sliders/{ubicacion}', {
    tags: TAG,
    auth: 'public',
    summary: 'Slider activo de una ubicación',
    request: { params: P.LocationParams },
    response: { description: 'Slider', schema: P.PublicSlider },
  })
  async getSlider(@Req() req: AppRequest) {
    const s = await this.sliders.getPublic(valid(req, 'params', P.LocationParams).ubicacion);
    if (!s) throw new NotFoundError('No hay un slider activo en esa ubicación.');
    return {
      data: {
        ubicacion: s.ubicacion,
        diapositivas: s.diapositivas.map((d) => ({
          titulo: d.titulo,
          texto: d.texto,
          enlace: d.enlace,
          textoEnlace: d.textoEnlace,
          imagen: P.toImage(d.medio) as NonNullable<ReturnType<typeof P.toImage>>,
        })),
      },
    };
  }

  @Endpoint('get', '/api/v1/public/documentos', {
    tags: TAG,
    auth: 'public',
    summary: 'Normatividad publicada',
    request: { query: DocumentQuery },
    response: { description: 'Documentos', schema: DocumentList },
  })
  async listDocuments(@Req() req: AppRequest) {
    return paged(await this.documents.listPublic(valid(req, 'query', DocumentQuery)), toDocument);
  }

  @Endpoint('get', '/api/v1/public/instituciones', {
    tags: TAG,
    auth: 'public',
    summary: 'Directorio de instituciones educativas oficiales',
    response: { description: 'Instituciones', schema: P.PublicInstitutions },
  })
  async listInstitutions() {
    return { data: (await this.institutions.list()).map((i) => ({ nombre: i.nombre, zona: i.zona as 'Urbana' | 'Rural' })) };
  }
}
