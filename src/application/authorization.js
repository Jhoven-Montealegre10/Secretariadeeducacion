'use strict';
/**
 * Autorización en la capa de aplicación. Los servicios la usan sobre cada operación y cada
 * recurso, además del control por ruta: así la API y el panel comparten las mismas reglas
 * y no es posible saltarlas llamando a otro endpoint. Denegación por defecto.
 *
 * actor = { id, email, rolId, rolSlug, permisos: Set<string> } (construido en el servidor).
 */
const { ForbiddenError, UnauthorizedError } = require('../domain/errors');

function can(actor, permiso) {
  return !!actor && actor.permisos instanceof Set && actor.permisos.has(permiso);
}

function authorize(actor, permiso) {
  if (!actor) throw new UnauthorizedError();
  if (!can(actor, permiso)) {
    const err = new ForbiddenError();
    err.permiso = permiso;
    throw err;
  }
}

module.exports = { can, authorize };
