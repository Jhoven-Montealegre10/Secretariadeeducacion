/** Usuarios, roles, auditoría, estadísticas y métricas del sistema (permisos de administrador). */
import { Controller, Req } from '@nestjs/common';
import { AuditService } from '../../../../application/audit.service';
import { RoleService, UserService } from '../../../../application/identity.services';
import { StatsService } from '../../../../application/stats.service';
import { MetricsService } from '../../observability/metrics.service';
import type { AppRequest } from '../../http.types';
import { Endpoint } from '../../route-spec';
import { clientIp, valid } from '../../session/session.helpers';
import * as S from '../schemas/admin.schemas';
import { IdParams, Ok, paged } from '../schemas/common';

const USERS = ['Usuarios'];
const ROLES = ['Roles'];
const id = (req: AppRequest) => valid(req, 'params', IdParams).id;

@Controller()
export class AdminController {
  constructor(
    private readonly users: UserService,
    private readonly roles: RoleService,
    private readonly audit: AuditService,
    private readonly stats: StatsService,
    private readonly metrics: MetricsService,
  ) {}

  @Endpoint('get', '/api/v1/usuarios', {
    tags: USERS,
    auth: 'users.read',
    summary: 'Listar usuarios',
    request: { query: S.UserQuery },
    response: { description: 'Página de usuarios', schema: S.UserList },
  })
  async listUsers(@Req() req: AppRequest) {
    return paged(await this.users.list(req.actor, valid(req, 'query', S.UserQuery)), S.toUser);
  }

  @Endpoint('post', '/api/v1/usuarios', {
    tags: USERS,
    auth: 'users.create',
    summary: 'Crear usuario e invitarlo',
    description: 'No se define contraseña: se envía una invitación de un solo uso (72 h). Solo se pueden asignar roles cuyos permisos tenga quien crea.',
    request: { body: S.UserCreate },
    errors: [409],
    response: { description: 'Usuario creado', schema: S.UserOne },
  })
  async createUser(@Req() req: AppRequest) {
    return { data: S.toUser(await this.users.create(req.actor, valid(req, 'body', S.UserCreate), clientIp(req))) };
  }

  @Endpoint('get', '/api/v1/usuarios/{id}', {
    tags: USERS,
    auth: 'users.read',
    summary: 'Consultar un usuario',
    request: { params: IdParams },
    response: { description: 'Usuario', schema: S.UserOne },
  })
  async getUser(@Req() req: AppRequest) {
    return { data: S.toUser(await this.users.get(req.actor, id(req))) };
  }

  @Endpoint('patch', '/api/v1/usuarios/{id}', {
    tags: USERS,
    auth: 'users.update',
    summary: 'Actualizar, cambiar rol, desactivar o reactivar',
    description:
      'No permite cambiar el propio rol ni desactivarse, ni dejar el sistema sin administradores activos. Cambiar rol o desactivar revoca las sesiones del usuario. Envíe `version` para detectar ediciones simultáneas (409 EDIT_CONFLICT).',
    request: { params: IdParams, body: S.UserUpdate },
    errors: [409],
    response: { description: 'Usuario actualizado', schema: S.UserOne },
  })
  async updateUser(@Req() req: AppRequest) {
    return { data: S.toUser(await this.users.update(req.actor, id(req), valid(req, 'body', S.UserUpdate), clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/usuarios/{id}', {
    status: 204,
    tags: USERS,
    auth: 'users.delete',
    summary: 'Eliminar usuario',
    description: 'No permite eliminarse a sí mismo ni al último administrador activo.',
    request: { params: IdParams },
    errors: [409],
    response: { description: 'Eliminado' },
  })
  async deleteUser(@Req() req: AppRequest) {
    await this.users.remove(req.actor, id(req), clientIp(req));
  }

  @Endpoint('post', '/api/v1/usuarios/{id}/mfa/restablecer', {
    status: 200,
    tags: USERS,
    auth: 'users.update',
    summary: 'Restablecer el segundo factor de un usuario',
    description: 'Para teléfonos perdidos: el usuario deberá configurar de nuevo el segundo factor en su próximo ingreso. Revoca sus sesiones.',
    request: { params: IdParams },
    response: { description: 'Segundo factor restablecido', schema: Ok },
  })
  async resetMfa(@Req() req: AppRequest) {
    await this.users.resetMfa(req.actor, id(req), clientIp(req));
    return { data: { ok: true as const } };
  }

  @Endpoint('post', '/api/v1/usuarios/{id}/invitacion', {
    status: 200,
    tags: USERS,
    auth: 'users.update',
    summary: 'Reenviar invitación o enlace de acceso',
    request: { params: IdParams },
    response: { description: 'Enviada', schema: Ok },
  })
  async resendInvitation(@Req() req: AppRequest) {
    await this.users.resendInvitation(req.actor, id(req), clientIp(req));
    return { data: { ok: true as const } };
  }

  @Endpoint('get', '/api/v1/permisos', {
    tags: ROLES,
    auth: 'roles.read',
    summary: 'Catálogo de permisos por módulo y acción',
    response: { description: 'Catálogo', schema: S.PermissionCatalog },
  })
  catalog(@Req() req: AppRequest) {
    return { data: this.roles.catalog(req.actor) };
  }

  @Endpoint('get', '/api/v1/roles', {
    tags: ROLES,
    auth: 'roles.read',
    summary: 'Listar roles con sus permisos',
    response: { description: 'Roles', schema: S.RoleList },
  })
  async listRoles(@Req() req: AppRequest) {
    return { data: (await this.roles.list(req.actor)).map(S.toRole) };
  }

  @Endpoint('post', '/api/v1/roles', {
    tags: ROLES,
    auth: 'roles.create',
    summary: 'Crear rol',
    description: 'Solo se pueden conceder permisos que tenga quien crea el rol. `dashboard.access` se agrega siempre.',
    request: { body: S.RoleCreate },
    errors: [409],
    response: { description: 'Rol creado', schema: S.RoleOne },
  })
  async createRole(@Req() req: AppRequest) {
    return { data: S.toRole(await this.roles.create(req.actor, valid(req, 'body', S.RoleCreate), clientIp(req))) };
  }

  @Endpoint('get', '/api/v1/roles/{id}', {
    tags: ROLES,
    auth: 'roles.read',
    summary: 'Consultar rol',
    request: { params: IdParams },
    response: { description: 'Rol', schema: S.RoleOne },
  })
  async getRole(@Req() req: AppRequest) {
    return { data: S.toRole(await this.roles.get(req.actor, id(req))) };
  }

  @Endpoint('patch', '/api/v1/roles/{id}', {
    tags: ROLES,
    auth: 'roles.update',
    summary: 'Actualizar rol y permisos',
    description: 'Los permisos del rol Administrador y los del propio rol no se pueden modificar. Las sesiones de los usuarios del rol se revalidan.',
    request: { params: IdParams, body: S.RoleUpdate },
    errors: [409],
    response: { description: 'Rol actualizado', schema: S.RoleOne },
  })
  async updateRole(@Req() req: AppRequest) {
    return { data: S.toRole(await this.roles.update(req.actor, id(req), valid(req, 'body', S.RoleUpdate), clientIp(req))) };
  }

  @Endpoint('delete', '/api/v1/roles/{id}', {
    status: 204,
    tags: ROLES,
    auth: 'roles.delete',
    summary: 'Eliminar rol',
    description: 'Solo si ningún usuario lo tiene asignado (si no, 409). Los roles del sistema no se eliminan.',
    request: { params: IdParams },
    errors: [409],
    response: { description: 'Eliminado' },
  })
  async deleteRole(@Req() req: AppRequest) {
    await this.roles.remove(req.actor, id(req), clientIp(req));
  }

  @Endpoint('get', '/api/v1/auditoria', {
    tags: ['Auditoría'],
    auth: 'audit.read',
    summary: 'Consultar la bitácora de auditoría',
    description: 'Registros de accesos, intentos fallidos, cambios de roles y operaciones. Solo lectura: la bitácora no admite modificaciones.',
    request: { query: S.AuditQuery },
    response: { description: 'Eventos', schema: S.AuditList },
  })
  async listAudit(@Req() req: AppRequest) {
    return paged(await this.audit.list(req.actor, valid(req, 'query', S.AuditQuery)), S.toAudit);
  }

  @Endpoint('get', '/api/v1/auditoria/integridad', {
    tags: ['Auditoría'],
    auth: 'audit.read',
    summary: 'Verificar la integridad de la bitácora',
    description: 'Recalcula la cadena HMAC de todos los registros y reporta el primero alterado, si lo hay.',
    response: { description: 'Resultado', schema: S.AuditIntegrity },
  })
  async verifyAudit(@Req() req: AppRequest) {
    const broken = await this.audit.verify(req.actor);
    return { data: { integra: !broken, idAlterado: broken?.idAlterado ?? null } };
  }

  @Endpoint('get', '/api/v1/estadisticas', {
    tags: ['Estadísticas'],
    auth: 'stats.read',
    summary: 'Reporte de visitas',
    description:
      'Métricas agregadas del sitio público en el rango (máx. 366 días; por defecto, últimos 30). Sin datos personales. Ver docs/ESTADISTICAS.md para el método y sus limitaciones.',
    request: { query: S.StatsQuery },
    response: { description: 'Reporte', schema: S.StatsReport },
  })
  async statsReport(@Req() req: AppRequest) {
    return { data: await this.stats.report(req.actor, valid(req, 'query', S.StatsQuery)) };
  }

  @Endpoint('get', '/api/v1/sistema/metricas', {
    tags: ['Sistema'],
    auth: 'system.read',
    summary: 'Métricas operativas de esta instancia',
    description: 'Latencia y errores por ruta (ventana deslizante), conexiones del pool de PostgreSQL, memoria, CPU, caché y cola de estadísticas. Sin datos personales.',
    response: { description: 'Métricas', schema: S.SystemMetrics },
  })
  async systemMetrics() {
    return { data: await this.metrics.snapshot() };
  }
}
