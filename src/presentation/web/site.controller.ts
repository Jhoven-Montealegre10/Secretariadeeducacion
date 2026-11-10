/**
 * Sitio público renderizado en el servidor. Usa los mismos servicios que la API, de modo que
 * borradores y archivos privados nunca llegan al público. Las vistas EJS se conservan intactas.
 */
import fs from 'node:fs';
import { Controller, Injectable, Next, Req, Res } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import { DocumentService, InstitutionService, SearchService } from '../../application/citizen.services';
import { NewsService, PageService, SliderService } from '../../application/content.services';
import { MediaService } from '../../application/media.service';
import { mediosEnBloques } from '../../domain/content';
import { NotFoundError } from '../../domain/errors';
import type { MediaRecord } from '../../infrastructure/repositories/content.repositories';
import type { AppRequest } from '../http/http.types';
import { WebRoute } from '../http/route-spec';
import { sandboxFile } from '../http/security/headers';

const pageQuery = z.object({ page: z.coerce.number().int().min(1).max(1000).catch(1) });
const textQuery = (max: number) => z.string().trim().max(max).catch('');

/** Datos que necesitan las vistas de bloques: medios resueltos y bloques dinámicos. */
@Injectable()
export class BlockContext {
  constructor(
    private readonly media: MediaService,
    private readonly institutions: InstitutionService,
  ) {}

  async mediaMap(ids: Array<number | null | undefined>): Promise<Map<number, MediaRecord>> {
    return new Map((await this.media.findByIds(ids)).map((m) => [m.id, m]));
  }

  async build(bloques: Array<Record<string, unknown>>, { q = '' } = {}) {
    return {
      medios: await this.mediaMap(mediosEnBloques(bloques)),
      instituciones: bloques.some((b) => b.tipo === 'directorioInstituciones') ? await this.institutions.list(q) : [],
      q,
    };
  }
}

/** Marca la respuesta para registrar la visita (estadísticas sin cookies). */
const track = (res: Response, ruta: string) => {
  res.locals.trackView = ruta;
};

@Controller()
export class SiteController {
  constructor(
    private readonly news: NewsService,
    private readonly pages: PageService,
    private readonly sliders: SliderService,
    private readonly documents: DocumentService,
    private readonly media: MediaService,
    private readonly search: SearchService,
    private readonly blocks: BlockContext,
  ) {}

  @WebRoute('get', '/', { auth: 'public' })
  async home(@Res() res: Response) {
    const noticias = await this.news.latestPublished(3);
    track(res, '/');
    res.render('pages/inicio', {
      title: 'Inicio',
      nav: 'inicio',
      noticias,
      imagenes: await this.blocks.mediaMap(noticias.map((n) => n.imagenId)),
      slider: await this.sliders.getPublic('inicio'),
    });
  }

  @WebRoute('get', '/noticias', { auth: 'public' })
  async newsIndex(@Req() req: AppRequest, @Res() res: Response) {
    const { page } = pageQuery.parse(req.query);
    const result = await this.news.listPublished({ page, pageSize: 9 });
    track(res, '/noticias');
    res.render('pages/noticias', {
      title: 'Noticias',
      nav: 'noticias',
      items: result.items,
      page,
      pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
      imagenes: await this.blocks.mediaMap(result.items.map((n) => n.imagenId)),
    });
  }

  @WebRoute('get', '/noticias/:slug', { auth: 'public' })
  async newsShow(@Req() req: AppRequest, @Res() res: Response) {
    const noticia = await this.news.getPublished(String(req.params.slug));
    if (!noticia) throw new NotFoundError();
    const otras = (await this.news.latestPublished(4)).filter((n) => n.id !== noticia.id).slice(0, 3);
    track(res, `/noticias/${noticia.slug}`);
    res.render('pages/noticia', {
      title: noticia.titulo,
      nav: 'noticias',
      noticia: { ...noticia, fotos: noticia.fotos ?? [] },
      otras,
      imagenes: await this.blocks.mediaMap([noticia.imagenId, ...(noticia.fotos ?? []), ...otras.map((n) => n.imagenId)]),
    });
  }

  @WebRoute('get', '/normatividad', { auth: 'public' })
  async normatividad(@Res() res: Response) {
    track(res, '/normatividad');
    res.render('pages/normatividad', { title: 'Normatividad', nav: 'normatividad', grupos: await this.documents.groupedPublic() });
  }

  @WebRoute('get', '/documentos/:id', { auth: 'public' })
  async document(@Req() req: AppRequest, @Res() res: Response) {
    const id = z.coerce.number().int().positive().max(2_147_483_647).safeParse(req.params.id);
    const file = id.success ? await this.documents.file(id.data) : null;
    if (!file) throw new NotFoundError();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${file.nombre}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    sandboxFile(res);
    fs.createReadStream(file.path).pipe(res);
  }

  /** Archivos de la biblioteca: solo públicos o usados en contenido publicado (streaming desde disco). */
  @WebRoute('get', '/media/:file', { auth: 'public' })
  async mediaFile(@Req() req: AppRequest, @Res() res: Response, @Next() next: NextFunction) {
    const file = await this.media.publicFile(String(req.params.file));
    if (!file) throw new NotFoundError();
    sandboxFile(res);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type(file.mime).sendFile(file.path, (err) => err && next(err));
  }

  @WebRoute('get', '/buscar', { auth: 'public' })
  async searchPage(@Req() req: AppRequest, @Res() res: Response) {
    const q = textQuery(100).parse(req.query.q);
    const results = q.length >= 2 ? await this.search.search(q) : { secciones: [], paginas: [], noticias: [], documentos: [] };
    res.render('pages/buscar', { title: 'Buscar', q, ...results, tipos: this.documents.TIPOS });
  }

  @WebRoute('get', '/mapa-del-sitio', { auth: 'public' })
  async siteMap(@Res() res: Response) {
    res.render('pages/mapa-sitio', { title: 'Mapa del sitio', paginas: await this.pages.listPublished() });
  }

  @WebRoute('get', '/.well-known/security.txt', { auth: 'public' })
  securityTxt(@Res() res: Response) {
    res.type('text/plain').send('Contact: mailto:educacion@ibague.gov.co\nPreferred-Languages: es\nPolicy: /transparencia#terminos\n');
  }

  @WebRoute('get', '/robots.txt', { auth: 'public' })
  robots(@Res() res: Response) {
    res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api/\n');
  }
}

/** Páginas editables por slug (secretaria, tramites, comunidad…). Se registra AL FINAL. */
@Controller()
export class PageSlugController {
  constructor(
    private readonly pages: PageService,
    private readonly sliders: SliderService,
    private readonly blocks: BlockContext,
  ) {}

  @WebRoute('get', '/:slug', { auth: 'public' })
  async page(@Req() req: AppRequest, @Res() res: Response) {
    const pagina = await this.pages.getPublished(String(req.params.slug));
    if (!pagina) throw new NotFoundError();
    const q = textQuery(80).parse(req.query.q);
    track(res, `/${pagina.slug}`);
    res.render('pages/pagina', {
      title: pagina.titulo,
      nav: pagina.slug,
      pagina,
      slider: await this.sliders.getPublic(`pagina:${pagina.slug}`),
      ...(await this.blocks.build(pagina.bloques, { q })),
    });
  }
}
