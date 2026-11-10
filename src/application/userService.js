'use strict';
/**
 * Gestión de usuarios (exclusiva de quien tenga permisos users.*).
 * Reglas:
 *  - nadie cambia su propio rol, ni se desactiva o elimina a sí mismo;
 *  - nunca queda el sistema sin un administrador activo;
 *  - solo se asignan roles cuyos permisos estén contenidos en los del actor (sin escalada);
 *  - cambiar rol o desactivar revoca de inmediato las sesiones del usuario.
 * Las cuentas nuevas no reciben contraseña del administrador: se envía una invitación
 * de un solo uso para que la persona la defina.
 */
const crypto = require('node:crypto');
const { authorize } = require('./authorization');
const { ConflictError, ForbiddenError, NotFoundError, ValidationError } = require('../domain/errors');
const { ROL_ADMINISTRADOR } = require('../domain/permissions');

function createUserService({ userRepository, roleRepository, credentialRepository, passwordHasher, authService, audit, transaction }) {
  function requireUser(id) {
    const user = userRepository.findById(id);
    if (!user) throw new NotFoundError('El usuario no existe.');
    return user;
  }

  function requireAssignableRole(actor, rolId) {
    const role = roleRepository.findById(rolId);
    if (!role) throw new ValidationError('El rol no existe.', [{ campo: 'rolId', mensaje: 'Rol inexistente' }]);
    const escalates = role.permisos.some((p) => !actor.permisos.has(p));
    if (escalates) throw new ForbiddenError('No puede asignar un rol con permisos que usted no tiene.');
    return role;
  }

  function ensureAnotherAdmin(user, actionText) {
    if (user.rolSlug === ROL_ADMINISTRADOR && user.activo && userRepository.countActiveAdmins(user.id) === 0) {
      throw new ConflictError(`No se puede ${actionText} al último administrador activo.`);
    }
  }

  return {
    list(actor, filters) {
      authorize(actor, 'users.read');
      return userRepository.list(filters);
    },

    get(actor, id) {
      authorize(actor, 'users.read');
      return requireUser(id);
    },

    async create(actor, { email, nombre, rolId }, ip) {
      authorize(actor, 'users.create');
      requireAssignableRole(actor, rolId);
      const normalized = email.trim().toLowerCase();
      if (userRepository.findByEmail(normalized)) throw new ConflictError('Ya existe un usuario con ese correo.', [{ campo: 'email', mensaje: 'Duplicado' }]);
      // Contraseña aleatoria imposible de conocer: la persona define la suya con la invitación.
      const unusable = await passwordHasher.hash(crypto.randomBytes(32).toString('base64'));
      const id = userRepository.create({ email: normalized, nombre: nombre.trim(), passwordHash: unusable, rolId });
      const user = userRepository.findById(id);
      await authService.sendInvitation(user);
      audit.record({ actor, accion: 'usuario_crear', recurso: 'usuario', recursoId: id, detalle: `rol ${user.rolSlug}`, ip });
      return user;
    },

    update(actor, id, changes, ip) {
      authorize(actor, 'users.update');
      const user = requireUser(id);
      const self = user.id === actor.id;
      if (self && changes.rolId !== undefined && changes.rolId !== user.rolId) throw new ForbiddenError('No puede cambiar su propio rol.');
      if (self && changes.activo === false) throw new ForbiddenError('No puede desactivar su propia cuenta.');

      const roleChanged = changes.rolId !== undefined && changes.rolId !== user.rolId;
      const deactivated = changes.activo === false && user.activo;
      if (roleChanged) {
        requireAssignableRole(actor, changes.rolId);
        ensureAnotherAdmin(user, 'quitar el rol de administrador');
      }
      if (deactivated) ensureAnotherAdmin(user, 'desactivar');
      if (user.rolSlug === ROL_ADMINISTRADOR && actor.rolSlug !== ROL_ADMINISTRADOR && (roleChanged || deactivated)) {
        throw new ForbiddenError('Solo un administrador puede modificar a otro administrador.');
      }
      if (changes.email) {
        const other = userRepository.findByEmail(changes.email.trim().toLowerCase());
        if (other && other.id !== id) throw new ConflictError('Ya existe un usuario con ese correo.', [{ campo: 'email', mensaje: 'Duplicado' }]);
        changes.email = changes.email.trim().toLowerCase();
      }

      transaction(() => {
        userRepository.update(id, changes);
        if (roleChanged || deactivated || (changes.email && changes.email !== user.email)) {
          userRepository.bumpAuthVersion(id); // revoca sesiones activas
          credentialRepository.deleteSessionsOfUser(id);
        }
        audit.record({
          actor,
          accion: roleChanged ? 'usuario_cambiar_rol' : 'usuario_actualizar',
          recurso: 'usuario',
          recursoId: id,
          detalle: [
            roleChanged && `rol ${user.rolSlug} → ${roleRepository.findById(changes.rolId).slug}`,
            deactivated && 'desactivado',
            changes.activo === true && !user.activo && 'reactivado',
          ]
            .filter(Boolean)
            .join('; '),
          ip,
        });
      });
      return userRepository.findById(id);
    },

    remove(actor, id, ip) {
      authorize(actor, 'users.delete');
      const user = requireUser(id);
      if (user.id === actor.id) throw new ForbiddenError('No puede eliminar su propia cuenta.');
      if (user.rolSlug === ROL_ADMINISTRADOR && actor.rolSlug !== ROL_ADMINISTRADOR)
        throw new ForbiddenError('Solo un administrador puede eliminar a otro administrador.');
      ensureAnotherAdmin(user, 'eliminar');
      transaction(() => {
        credentialRepository.deleteSessionsOfUser(id);
        userRepository.delete(id);
        audit.record({ actor, accion: 'usuario_eliminar', recurso: 'usuario', recursoId: id, detalle: user.email, ip });
      });
    },

    /** Obliga a configurar de nuevo el segundo factor (p. ej. teléfono perdido) y revoca sesiones. */
    resetMfa(actor, id, ip) {
      authorize(actor, 'users.update');
      const user = requireUser(id);
      if (user.id === actor.id) throw new ForbiddenError('Use "Mi cuenta" para cambiar su propio segundo factor.');
      transaction(() => {
        userRepository.setMfa(id, { secretoEnc: null, activo: false });
        credentialRepository.replaceRecoveryCodes(id, []);
        credentialRepository.deleteSessionsOfUser(id);
        audit.record({ actor, accion: 'usuario_restablecer_mfa', recurso: 'usuario', recursoId: id, ip });
      });
    },

    async resendInvitation(actor, id, ip) {
      authorize(actor, 'users.update');
      const user = requireUser(id);
      await authService.sendInvitation(user);
      audit.record({ actor, accion: 'usuario_enviar_invitacion', recurso: 'usuario', recursoId: id, ip });
    },

    updateOwnProfile(actor, { nombre }, ip) {
      userRepository.update(actor.id, { nombre: nombre.trim() });
      audit.record({ actor, accion: 'perfil_actualizar', recurso: 'usuario', recursoId: actor.id, ip });
      return userRepository.findById(actor.id);
    },
  };
}

module.exports = { createUserService };
