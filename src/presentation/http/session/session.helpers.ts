/**
 * Sesiones del panel:
 *  - cookie HttpOnly, SameSite=Strict, Secure y prefijo __Host- en producción;
 *  - expiración por inactividad (cookie renovable) y duración máxima absoluta;
 *  - en cada petición se revalida al usuario contra la base de datos (actor.middleware.ts).
 * Cada cambio de nivel de autenticación regenera el ID de sesión (evita fijación de sesión).
 */
import type { Response } from 'express';
import type { z } from 'zod';
import type { AppRequest } from '../http.types';

export const sessionCookieName = (isProd: boolean) => (isProd ? '__Host-sem.sid' : 'sem.sid');

export function regenerate(req: AppRequest): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err: unknown) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve())),
  );
}

export function save(req: AppRequest): Promise<void> {
  return new Promise((resolve, reject) => req.session.save((err: unknown) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve())));
}

export function destroy(req: AppRequest, res: Response, isProd: boolean): Promise<void> {
  return new Promise((resolve) => {
    if (!req.session) return resolve();
    req.session.destroy(() => {
      res.clearCookie(sessionCookieName(isProd), { path: '/', httpOnly: true, sameSite: 'strict', secure: isProd });
      resolve();
    });
  });
}

/** Marca la sesión como completamente autenticada, con un ID nuevo. */
export async function establish(req: AppRequest, userId: number, authVersion: number): Promise<void> {
  await regenerate(req);
  req.session.auth = { userId, authVersion, loginAt: Date.now() };
  await save(req);
}

/** Entrada ya validada por el interceptor, con el tipo de salida del esquema. */
export function valid<T extends z.ZodType>(req: AppRequest, part: 'params' | 'query' | 'body', _schema: T): z.output<T> {
  return req.valid[part] as z.output<T>;
}

export const clientIp = (req: AppRequest): string | null => req.ip ?? null;
