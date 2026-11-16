/**
 * Panel de administración: el servidor solo entrega la estructura (SPA) y las vistas previas
 * protegidas; todas las operaciones se hacen desde el navegador contra la API REST.
 */
import { Controller, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { authorize } from '../../application/authorization';
import { NewsService, PageService, SliderService } from '../../application/content.services';
import { NotFoundError } from '../../domain/errors';
import type { AppRequest } from '../http/http.types';
import { WebRoute } from '../http/route-spec';
import { noStore } from '../http/security/headers';
import { BlockContext } from './site.controller';

const idParam = (v: unknown) => {
  const r = z.coerce.number().int().positive().max(2_147_483_647).safeParse(v);
  if (!r.success) throw new NotFoundError();
  return r.data;
};

const privateHtml = (res: Response) => {
  noStore(res);
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
};

@Controller()
export class AdminWebController {
  constructor(
    private readonly pages: PageService,
    private readonly news: NewsService,
    private readonly sliders: SliderService,
    private readonly blocks: BlockContext,
  ) {}

  @WebRoute('get', '/admin/login', { auth: 'public' })
  login(@Req() req: AppRequest, @Res() res: Response) {
    privateHtml(res);
    if (req.actor) return res.redirect('/admin');
    res.render('admin/auth', { title: 'Ingreso al panel', vista: 'login' });
  }

  @WebRoute('get', '/admin/restablecer', { auth: 'public' })
  reset(@Res() res: Response) {
    privateHtml(res);
    res.render('admin/auth', { title: 'Definir contraseña', vista: 'restablecer' });
  }

  /** Vista previa protegida de páginas en borrador (no indexable, sin caché). */
  @WebRoute('get', '/admin/vista-previa/paginas/:id', { auth: 'public' })
  async previewPage(@Req() req: AppRequest, @Res() res: Response) {
    privateHtml(res);
    authorize(req.actor, 'pages.read');
    const pagina = await this.pages.get(req.actor, idParam(req.params.id));
    const bloques = this.pages.sanitizeBlocks(pagina.bloques);
    res.render('pages/pagina', {
      title: `Vista previa: ${pagina.titulo}`,
      nav: pagina.slug,
      pagina: { ...pagina, bloques },
      vistaPrevia: true,
      slider: await this.sliders.getPublic(`pagina:${pagina.slug}`),
      ...(await this.blocks.build(bloques)),
    });
  }

  @WebRoute('get', '/admin/vista-previa/noticias/:id', { auth: 'public' })
  async previewNews(@Req() req: AppRequest, @Res() res: Response) {
    privateHtml(res);
    authorize(req.actor, 'news.read');
    const noticia = await this.news.get(req.actor, idParam(req.params.id));
    const fotos = noticia.fotos ?? [];
    res.render('pages/noticia', {
      title: `Vista previa: ${noticia.titulo}`,
      nav: 'noticias',
      noticia: { ...noticia, contenido: this.news.sanitize(noticia.contenido), fotos },
      otras: [],
      imagenes: await this.blocks.mediaMap([noticia.imagenId, ...fotos]),
      vistaPrevia: true,
    });
  }

  @WebRoute('get', '/admin', { auth: 'public' })
  shell(@Req() req: AppRequest, @Res() res: Response) {
    privateHtml(res);
    if (!req.actor) return res.redirect('/admin/login');
    res.render('admin/app', { title: 'Panel de administración' });
  }

  @WebRoute('get', '/admin/{*rest}', { auth: 'public' })
  shellDeep(@Req() req: AppRequest, @Res() res: Response) {
    return this.shell(req, res);
  }
}
