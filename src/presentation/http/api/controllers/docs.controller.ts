/**
 * Documentación de la API:
 *  - /api/v1/openapi-publica.json y /api/docs  → solo endpoints públicos (abierto).
 *  - /api/v1/openapi.json y /admin/api-docs     → especificación completa (requiere sesión del panel).
 * En producción las pruebas interactivas quedan desactivadas por defecto (API_DOCS_TRY_IT_OUT=false).
 */
import { Controller, Inject, Injectable, Req, Res } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import type { Response } from 'express';
import { UnauthorizedError } from '../../../../domain/errors';
import { APP_CONFIG, type AppConfig } from '../../../../config/configuration';
import type { AppRequest } from '../../http.types';
import { WebRoute } from '../../route-spec';
import { noStore } from '../../security/headers';
import { swaggerPage } from '../openapi-document';

/** Documentos generados al arrancar (main.ts) y servidos desde memoria. */
@Injectable()
export class OpenApiDocs {
  publicDoc: OpenAPIObject | null = null;
  fullDoc: OpenAPIObject | null = null;
}

@Controller()
export class DocsController {
  constructor(
    private readonly docs: OpenApiDocs,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private requirePanel(req: AppRequest, res: Response): boolean {
    if (req.actor?.permisos.has('dashboard.access')) return true;
    if (req.accepts(['html', 'json']) === 'html') {
      res.redirect('/admin/login');
      return false;
    }
    throw new UnauthorizedError();
  }

  @WebRoute('get', '/api/v1/openapi-publica.json', { auth: 'public' })
  publicSpec(@Res() res: Response) {
    res.json(this.docs.publicDoc);
  }

  @WebRoute('get', '/api/v1/openapi.json', { auth: 'public' })
  fullSpec(@Req() req: AppRequest, @Res() res: Response) {
    if (!this.requirePanel(req, res)) return;
    noStore(res);
    res.json(this.docs.fullDoc);
  }

  @WebRoute('get', '/api/docs', { auth: 'public' })
  publicUi(@Res() res: Response) {
    res.type('html').send(swaggerPage({ title: 'API pública – SEM Ibagué', specUrl: '/api/v1/openapi-publica.json', mode: 'public' }));
  }

  @WebRoute('get', '/admin/api-docs', { auth: 'public' })
  fullUi(@Req() req: AppRequest, @Res() res: Response) {
    if (!this.requirePanel(req, res)) return;
    noStore(res);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.type('html').send(swaggerPage({ title: 'API completa – SEM Ibagué', specUrl: '/api/v1/openapi.json', mode: this.config.api.docsTryItOut ? 'admin' : 'readonly' }));
  }
}
