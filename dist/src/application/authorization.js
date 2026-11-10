"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.can = can;
exports.authorize = authorize;
/**
 * Autorización en la capa de aplicación. Los servicios la aplican en cada operación y recurso,
 * además del guard por ruta: así la API y el panel comparten reglas y no es posible saltarlas
 * llamando a otro endpoint. Denegación por defecto.
 */
const errors_1 = require("../domain/errors");
function can(actor, permiso) {
    return !!actor && actor.permisos instanceof Set && actor.permisos.has(permiso);
}
function authorize(actor, permiso) {
    if (!actor)
        throw new errors_1.UnauthorizedError();
    if (!can(actor, permiso)) {
        const err = new errors_1.ForbiddenError();
        err.permiso = permiso;
        throw err;
    }
}
//# sourceMappingURL=authorization.js.map