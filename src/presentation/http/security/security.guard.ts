/**
 * Guard global, en este orden:
 *   1. denegación por defecto: una ruta sin declaración @Endpoint/@WebRoute nunca se ejecuta;
 *   2. límites de peticiones (general, API y el específico de la ruta);
 *   3. acceso: público, sesión pendiente (primer factor), autenticado o permiso concreto;
 *   4. CSRF en métodos que modifican (token sincronizador + verificación de Origin).
 */
import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../../domain/errors';
import type { AppRequest } from '../http.types';
import { needsCsrf, ROUTE_SPEC, type RouteSpec } from '../route-spec';
import { CsrfService } from './csrf.service';
import { RateLimiter, type RateResult } from './rate-limiter.service';

@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    private readonly csrf: CsrfService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.get<RouteSpec | undefined>(ROUTE_SPEC, context.getHandler());
    if (!spec) throw new ForbiddenError('Ruta no declarada.'); // denegación por defecto
    const http = context.switchToHttp();
    const req = http.getRequest<AppRequest>();
    const res = http.getResponse<Response>();
    const ip = req.ip ?? '';

    await this.limiter.hit('general', ip);
    if (spec.kind === 'api') await this.limiter.hit('api', ip);
    if (spec.rateLimit) this.headers(res, await this.limiter.hit(spec.rateLimit, ip));

    this.checkAccess(spec, req);
    if (needsCsrf(spec)) this.csrf.verify(req);
    return true;
  }

  private headers(res: Response, r: RateResult): void {
    res.setHeader('RateLimit-Policy', `${r.limit};w=${r.resetSeconds}`);
    res.setHeader('RateLimit', `limit=${r.limit}, remaining=${r.remaining}, reset=${r.resetSeconds}`);
  }

  private checkAccess(spec: RouteSpec, req: AppRequest): void {
    if (spec.auth === 'public') return;
    if (spec.auth === 'pending') {
      const pending = req.session?.pending;
      if (pending?.userId && pending.expiresAt > Date.now()) return;
      throw new UnauthorizedError('Inicie sesión de nuevo.', 'LOGIN_REQUIRED');
    }
    if (!req.actor) throw new UnauthorizedError();
    if (!req.actor.permisos.has('dashboard.access')) throw new ForbiddenError();
    if (spec.auth !== 'authenticated' && !req.actor.permisos.has(spec.auth)) {
      const err = new ForbiddenError();
      err.permiso = spec.auth;
      throw err;
    }
  }
}
