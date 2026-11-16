/**
 * Autorización en la capa de aplicación. Los servicios la aplican en cada operación y recurso,
 * además del guard por ruta: así la API y el panel comparten reglas y no es posible saltarlas
 * llamando a otro endpoint. Denegación por defecto.
 */
import { ForbiddenError, UnauthorizedError } from '../domain/errors';
import type { Actor, Permiso } from '../domain/permissions';

export function can(actor: Actor | null | undefined, permiso: Permiso): boolean {
  return !!actor && actor.permisos instanceof Set && actor.permisos.has(permiso);
}

export function authorize(actor: Actor | null | undefined, permiso: Permiso): asserts actor is Actor {
  if (!actor) throw new UnauthorizedError();
  if (!can(actor, permiso)) {
    const err = new ForbiddenError();
    err.permiso = permiso;
    throw err;
  }
}
