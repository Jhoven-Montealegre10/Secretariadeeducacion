'use strict';
/** Usuarios, roles, auditoría y estadísticas (permisos de administrador). */
const S = require('../schemas/admin');
const { IdParams, Ok } = require('../schemas/common');
const { paged } = require('../../defineRoute');

function register({ route }, { userService, roleService, audit, statsService }) {
  const USERS = ['Usuarios'];
  route(
    {
      method: 'get',
      path: '/api/v1/usuarios',
      tags: USERS,
      auth: 'users.read',
      summary: 'Listar usuarios',
      request: { query: S.UserQuery },
      responses: { 200: { description: 'Página de usuarios', schema: S.UserList } },
    },
    (req) => paged(userService.list(req.actor, req.valid.query), S.toUser),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/usuarios',
      tags: USERS,
      auth: 'users.create',
      summary: 'Crear usuario e invitarlo',
      description: 'No se define contraseña: se envía una invitación de un solo uso (72 h). Solo se pueden asignar roles cuyos permisos tenga quien crea.',
      request: { body: S.UserCreate },
      errors: [409],
      responses: { 201: { description: 'Usuario creado', schema: S.UserOne } },
    },
    async (req) => ({ data: S.toUser(await userService.create(req.actor, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/usuarios/{id}',
      tags: USERS,
      auth: 'users.read',
      summary: 'Consultar un usuario',
      request: { params: IdParams },
      responses: { 200: { description: 'Usuario', schema: S.UserOne } },
    },
    (req) => ({ data: S.toUser(userService.get(req.actor, req.valid.params.id)) }),
  );

  route(
    {
      method: 'patch',
      path: '/api/v1/usuarios/{id}',
      tags: USERS,
      auth: 'users.update',
      summary: 'Actualizar, cambiar rol, desactivar o reactivar',
      description:
        'No permite cambiar el propio rol ni desactivarse, ni dejar el sistema sin administradores activos. Cambiar rol o desactivar revoca las sesiones del usuario.',
      request: { params: IdParams, body: S.UserUpdate },
      errors: [409],
      responses: { 200: { description: 'Usuario actualizado', schema: S.UserOne } },
    },
    (req) => ({ data: S.toUser(userService.update(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/usuarios/{id}',
      status: 204,
      tags: USERS,
      auth: 'users.delete',
      summary: 'Eliminar usuario',
      description: 'No permite eliminarse a sí mismo ni al último administrador activo.',
      request: { params: IdParams },
      errors: [409],
      responses: { 204: { description: 'Eliminado' } },
    },
    (req) => {
      userService.remove(req.actor, req.valid.params.id, req.ip);
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/usuarios/{id}/mfa/restablecer',
      status: 200,
      tags: USERS,
      auth: 'users.update',
      summary: 'Restablecer el segundo factor de un usuario',
      description: 'Para teléfonos perdidos: el usuario deberá configurar de nuevo el segundo factor en su próximo ingreso. Revoca sus sesiones.',
      request: { params: IdParams },
      responses: { 200: { description: 'Segundo factor restablecido', schema: Ok } },
    },
    (req) => {
      userService.resetMfa(req.actor, req.valid.params.id, req.ip);
      return { data: { ok: true } };
    },
  );

  route(
    {
      method: 'post',
      path: '/api/v1/usuarios/{id}/invitacion',
      status: 200,
      tags: USERS,
      auth: 'users.update',
      summary: 'Reenviar invitación o enlace de acceso',
      request: { params: IdParams },
      responses: { 200: { description: 'Enviada', schema: Ok } },
    },
    async (req) => {
      await userService.resendInvitation(req.actor, req.valid.params.id, req.ip);
      return { data: { ok: true } };
    },
  );

  const ROLES = ['Roles'];
  route(
    {
      method: 'get',
      path: '/api/v1/permisos',
      tags: ROLES,
      auth: 'roles.read',
      summary: 'Catálogo de permisos por módulo y acción',
      responses: { 200: { description: 'Catálogo', schema: S.PermissionCatalog } },
    },
    (req) => ({ data: roleService.catalog(req.actor) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/roles',
      tags: ROLES,
      auth: 'roles.read',
      summary: 'Listar roles con sus permisos',
      responses: { 200: { description: 'Roles', schema: S.RoleList } },
    },
    (req) => ({ data: roleService.list(req.actor).map(S.toRole) }),
  );

  route(
    {
      method: 'post',
      path: '/api/v1/roles',
      tags: ROLES,
      auth: 'roles.create',
      summary: 'Crear rol',
      description: 'Solo se pueden conceder permisos que tenga quien crea el rol. `dashboard.access` se agrega siempre.',
      request: { body: S.RoleCreate },
      errors: [409],
      responses: { 201: { description: 'Rol creado', schema: S.RoleOne } },
    },
    (req) => ({ data: S.toRole(roleService.create(req.actor, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/roles/{id}',
      tags: ROLES,
      auth: 'roles.read',
      summary: 'Consultar rol',
      request: { params: IdParams },
      responses: { 200: { description: 'Rol', schema: S.RoleOne } },
    },
    (req) => ({ data: S.toRole(roleService.get(req.actor, req.valid.params.id)) }),
  );

  route(
    {
      method: 'patch',
      path: '/api/v1/roles/{id}',
      tags: ROLES,
      auth: 'roles.update',
      summary: 'Actualizar rol y permisos',
      description: 'Los permisos del rol Administrador y los del propio rol no se pueden modificar. Las sesiones de los usuarios del rol se revalidan.',
      request: { params: IdParams, body: S.RoleUpdate },
      errors: [409],
      responses: { 200: { description: 'Rol actualizado', schema: S.RoleOne } },
    },
    (req) => ({ data: S.toRole(roleService.update(req.actor, req.valid.params.id, req.valid.body, req.ip)) }),
  );

  route(
    {
      method: 'delete',
      path: '/api/v1/roles/{id}',
      status: 204,
      tags: ROLES,
      auth: 'roles.delete',
      summary: 'Eliminar rol',
      description: 'Solo si ningún usuario lo tiene asignado (si no, 409). Los roles del sistema no se eliminan.',
      request: { params: IdParams },
      errors: [409],
      responses: { 204: { description: 'Eliminado' } },
    },
    (req) => {
      roleService.remove(req.actor, req.valid.params.id, req.ip);
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/auditoria',
      tags: ['Auditoría'],
      auth: 'audit.read',
      summary: 'Consultar la bitácora de auditoría',
      description: 'Registros de accesos, intentos fallidos, cambios de roles y operaciones. Solo lectura: la bitácora no admite modificaciones.',
      request: { query: S.AuditQuery },
      responses: { 200: { description: 'Eventos', schema: S.AuditList } },
    },
    (req) => paged(audit.list(req.actor, req.valid.query), S.toAudit),
  );

  route(
    {
      method: 'get',
      path: '/api/v1/auditoria/integridad',
      tags: ['Auditoría'],
      auth: 'audit.read',
      summary: 'Verificar la integridad de la bitácora',
      description: 'Recalcula la cadena HMAC de todos los registros y reporta el primero alterado, si lo hay.',
      responses: { 200: { description: 'Resultado', schema: S.AuditIntegrity } },
    },
    (req) => {
      const broken = audit.verify(req.actor);
      return { data: { integra: !broken, idAlterado: broken?.idAlterado ?? null } };
    },
  );

  route(
    {
      method: 'get',
      path: '/api/v1/estadisticas',
      tags: ['Estadísticas'],
      auth: 'stats.read',
      summary: 'Reporte de visitas',
      description:
        'Métricas agregadas del sitio público en el rango (máx. 366 días; por defecto, últimos 30). Sin datos personales. Ver docs/ESTADISTICAS.md para el método y sus limitaciones.',
      request: { query: S.StatsQuery },
      responses: { 200: { description: 'Reporte', schema: S.StatsReport } },
    },
    (req) => ({ data: statsService.report(req.actor, req.valid.query) }),
  );
}

module.exports = { register };
