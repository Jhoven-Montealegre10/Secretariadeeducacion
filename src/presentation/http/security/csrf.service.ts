/**
 * Protección CSRF para operaciones con cookie de sesión:
 *  1. token sincronizador secreto por sesión (cabecera X-CSRF-Token o campo _csrf del formulario);
 *  2. si el navegador envía Origin, debe ser el mismo sitio (defensa adicional);
 *  3. la cookie es SameSite=Strict.
 */
import { Injectable } from '@nestjs/common';
import { ForbiddenError } from '../../../domain/errors';
import { CryptoService } from '../../../infrastructure/security/crypto.service';
import type { AppRequest } from '../http.types';

@Injectable()
export class CsrfService {
  constructor(private readonly crypto: CryptoService) {}

  ensureToken(req: AppRequest): string {
    if (!req.session.csrf) req.session.csrf = this.crypto.randomToken();
    return req.session.csrf;
  }

  private sameOrigin(req: AppRequest): boolean {
    const origin = req.get('origin');
    if (!origin) return true;
    try {
      return new URL(origin).host === req.get('host');
    } catch {
      return false;
    }
  }

  verify(req: AppRequest): void {
    const body = req.body as Record<string, unknown> | undefined;
    const sent = req.get('x-csrf-token') ?? (typeof body?._csrf === 'string' ? body._csrf : undefined);
    const expected = req.session?.csrf;
    if (!this.sameOrigin(req) || !sent || !expected || !this.crypto.safeEqual(sent, expected)) {
      const err = new ForbiddenError('La sesión del formulario expiró o la solicitud no es válida. Recargue la página e intente de nuevo.');
      Object.assign(err, { code: 'CSRF_INVALID' });
      throw err;
    }
  }
}
