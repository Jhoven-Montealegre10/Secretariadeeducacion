'use strict';
/**
 * Roles con permisos explícitos por módulo y acción.
 *  - El rol Administrador es del sistema: no se elimina ni se cambian sus permisos.
 *  - Un rol solo se elimina si ningún usuario lo tiene asignado.
 *  - Nadie concede permisos que no tiene (sin escalada).
 */
const { authorize } = require('./authorization');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = require('../domain/errors');
const { esPermisoValido, catalogo, ROL_ADMINISTRADOR } = require('../domain/permissions');
const { slugify } = require('../domain/content');

function createRoleService({ roleRepository, userRepository, audit, transaction }) {
  function requireRole(id) {
    const role = roleRepository.findById(id);
    if (!role) throw new NotFoundError('El rol no existe.');
    return role;
  }

  function validatePermissions(actor, permisos) {
    const invalid = permisos.filter((p) => !esPermisoValido(p));
    if (invalid.length)
      throw new ValidationError(
        'Hay permisos que no existen.',
        invalid.map((p) => ({ campo: 'permisos', mensaje: p })),
      );
    const notOwned = permisos.filter((p) => !actor.permisos.has(p));
    if (notOwned.length) throw new ForbiddenError('No puede conceder permisos que usted no tiene.');
    if (!permisos.includes('dashboard.access')) permisos.push('dashboard.access');
    return [...new Set(permisos)].sort();
  }

  return {
    catalog(actor) {
      authorize(actor, 'roles.read');
      return catalogo();
    },

    list(actor) {
      authorize(actor, 'roles.read');
      return roleRepository.list();
    },

    get(actor, id) {
      authorize(actor, 'roles.read');
      return requireRole(id);
    },

    create(actor, { nombre, descripcion = '', permisos }, ip) {
      authorize(actor, 'roles.create');
      const perms = validatePermissions(actor, permisos);
      const slug = slugify(nombre);
      if (roleRepository.findBySlug(slug) || roleRepository.list().some((r) => r.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
        throw new ConflictError('Ya existe un rol con ese nombre.', [{ campo: 'nombre', mensaje: 'Duplicado' }]);
      }
      const id = transaction(() => {
        const newId = roleRepository.create({ slug, nombre: nombre.trim(), descripcion });
        roleRepository.setPermissions(newId, perms);
        audit.record({ actor, accion: 'rol_crear', recurso: 'rol', recursoId: newId, detalle: perms.join(','), ip });
        return newId;
      });
      return roleRepository.findById(id);
    },

    update(actor, id, { nombre, descripcion, permisos }, ip) {
      authorize(actor, 'roles.update');
      const role = requireRole(id);
      if (role.slug === ROL_ADMINISTRADOR && permisos) throw new ForbiddenError('Los permisos del rol Administrador no se pueden modificar.');
      if (role.id === actor.rolId && permisos) throw new ForbiddenError('No puede modificar los permisos de su propio rol.');
      const perms = permisos ? validatePermissions(actor, permisos) : null;
      if (nombre && roleRepository.list().some((r) => r.id !== id && r.nombre.toLowerCase() === nombre.trim().toLowerCase())) {
        throw new ConflictError('Ya existe un rol con ese nombre.', [{ campo: 'nombre', mensaje: 'Duplicado' }]);
      }
      transaction(() => {
        roleRepository.update(id, { nombre: nombre?.trim(), descripcion });
        if (perms) {
          roleRepository.setPermissions(id, perms);
          userRepository.bumpAuthVersionForRole(id); // obliga a revalidar sesiones con los permisos nuevos
        }
        audit.record({ actor, accion: 'rol_actualizar', recurso: 'rol', recursoId: id, detalle: perms ? `permisos: ${perms.join(',')}` : 'datos', ip });
      });
      return roleRepository.findById(id);
    },

    remove(actor, id, ip) {
      authorize(actor, 'roles.delete');
      const role = requireRole(id);
      if (role.sistema) throw new ForbiddenError('Los roles del sistema no se pueden eliminar.');
      const users = userRepository.countByRole(id);
      if (users > 0) throw new ConflictError(`El rol tiene ${users} usuario(s) asignado(s). Asígneles otro rol antes de eliminarlo.`);
      transaction(() => {
        roleRepository.delete(id);
        audit.record({ actor, accion: 'rol_eliminar', recurso: 'rol', recursoId: id, detalle: role.nombre, ip });
      });
    },
  };
}

module.exports = { createRoleService };
