"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
/** Usuarios, roles, auditoría, estadísticas y métricas del sistema (permisos de administrador). */
const common_1 = require("@nestjs/common");
const audit_service_1 = require("../../../../application/audit.service");
const identity_services_1 = require("../../../../application/identity.services");
const stats_service_1 = require("../../../../application/stats.service");
const metrics_service_1 = require("../../observability/metrics.service");
const route_spec_1 = require("../../route-spec");
const session_helpers_1 = require("../../session/session.helpers");
const S = __importStar(require("../schemas/admin.schemas"));
const common_2 = require("../schemas/common");
const USERS = ['Usuarios'];
const ROLES = ['Roles'];
const id = (req) => (0, session_helpers_1.valid)(req, 'params', common_2.IdParams).id;
let AdminController = class AdminController {
    users;
    roles;
    audit;
    stats;
    metrics;
    constructor(users, roles, audit, stats, metrics) {
        this.users = users;
        this.roles = roles;
        this.audit = audit;
        this.stats = stats;
        this.metrics = metrics;
    }
    async listUsers(req) {
        return (0, common_2.paged)(await this.users.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.UserQuery)), S.toUser);
    }
    async createUser(req) {
        return { data: S.toUser(await this.users.create(req.actor, (0, session_helpers_1.valid)(req, 'body', S.UserCreate), (0, session_helpers_1.clientIp)(req))) };
    }
    async getUser(req) {
        return { data: S.toUser(await this.users.get(req.actor, id(req))) };
    }
    async updateUser(req) {
        return { data: S.toUser(await this.users.update(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.UserUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async deleteUser(req) {
        await this.users.remove(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
    }
    async resetMfa(req) {
        await this.users.resetMfa(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
        return { data: { ok: true } };
    }
    async resendInvitation(req) {
        await this.users.resendInvitation(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
        return { data: { ok: true } };
    }
    catalog(req) {
        return { data: this.roles.catalog(req.actor) };
    }
    async listRoles(req) {
        return { data: (await this.roles.list(req.actor)).map(S.toRole) };
    }
    async createRole(req) {
        return { data: S.toRole(await this.roles.create(req.actor, (0, session_helpers_1.valid)(req, 'body', S.RoleCreate), (0, session_helpers_1.clientIp)(req))) };
    }
    async getRole(req) {
        return { data: S.toRole(await this.roles.get(req.actor, id(req))) };
    }
    async updateRole(req) {
        return { data: S.toRole(await this.roles.update(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.RoleUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async deleteRole(req) {
        await this.roles.remove(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
    }
    async listAudit(req) {
        return (0, common_2.paged)(await this.audit.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.AuditQuery)), S.toAudit);
    }
    async verifyAudit(req) {
        const broken = await this.audit.verify(req.actor);
        return { data: { integra: !broken, idAlterado: broken?.idAlterado ?? null } };
    }
    async statsReport(req) {
        return { data: await this.stats.report(req.actor, (0, session_helpers_1.valid)(req, 'query', S.StatsQuery)) };
    }
    async systemMetrics() {
        return { data: await this.metrics.snapshot() };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/usuarios', {
        tags: USERS,
        auth: 'users.read',
        summary: 'Listar usuarios',
        request: { query: S.UserQuery },
        response: { description: 'Página de usuarios', schema: S.UserList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listUsers", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/usuarios', {
        tags: USERS,
        auth: 'users.create',
        summary: 'Crear usuario e invitarlo',
        description: 'No se define contraseña: se envía una invitación de un solo uso (72 h). Solo se pueden asignar roles cuyos permisos tenga quien crea.',
        request: { body: S.UserCreate },
        errors: [409],
        response: { description: 'Usuario creado', schema: S.UserOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createUser", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/usuarios/{id}', {
        tags: USERS,
        auth: 'users.read',
        summary: 'Consultar un usuario',
        request: { params: common_2.IdParams },
        response: { description: 'Usuario', schema: S.UserOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getUser", null);
__decorate([
    (0, route_spec_1.Endpoint)('patch', '/api/v1/usuarios/{id}', {
        tags: USERS,
        auth: 'users.update',
        summary: 'Actualizar, cambiar rol, desactivar o reactivar',
        description: 'No permite cambiar el propio rol ni desactivarse, ni dejar el sistema sin administradores activos. Cambiar rol o desactivar revoca las sesiones del usuario. Envíe `version` para detectar ediciones simultáneas (409 EDIT_CONFLICT).',
        request: { params: common_2.IdParams, body: S.UserUpdate },
        errors: [409],
        response: { description: 'Usuario actualizado', schema: S.UserOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/usuarios/{id}', {
        status: 204,
        tags: USERS,
        auth: 'users.delete',
        summary: 'Eliminar usuario',
        description: 'No permite eliminarse a sí mismo ni al último administrador activo.',
        request: { params: common_2.IdParams },
        errors: [409],
        response: { description: 'Eliminado' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteUser", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/usuarios/{id}/mfa/restablecer', {
        status: 200,
        tags: USERS,
        auth: 'users.update',
        summary: 'Restablecer el segundo factor de un usuario',
        description: 'Para teléfonos perdidos: el usuario deberá configurar de nuevo el segundo factor en su próximo ingreso. Revoca sus sesiones.',
        request: { params: common_2.IdParams },
        response: { description: 'Segundo factor restablecido', schema: common_2.Ok },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resetMfa", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/usuarios/{id}/invitacion', {
        status: 200,
        tags: USERS,
        auth: 'users.update',
        summary: 'Reenviar invitación o enlace de acceso',
        request: { params: common_2.IdParams },
        response: { description: 'Enviada', schema: common_2.Ok },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "resendInvitation", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/permisos', {
        tags: ROLES,
        auth: 'roles.read',
        summary: 'Catálogo de permisos por módulo y acción',
        response: { description: 'Catálogo', schema: S.PermissionCatalog },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "catalog", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/roles', {
        tags: ROLES,
        auth: 'roles.read',
        summary: 'Listar roles con sus permisos',
        response: { description: 'Roles', schema: S.RoleList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listRoles", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/roles', {
        tags: ROLES,
        auth: 'roles.create',
        summary: 'Crear rol',
        description: 'Solo se pueden conceder permisos que tenga quien crea el rol. `dashboard.access` se agrega siempre.',
        request: { body: S.RoleCreate },
        errors: [409],
        response: { description: 'Rol creado', schema: S.RoleOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "createRole", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/roles/{id}', {
        tags: ROLES,
        auth: 'roles.read',
        summary: 'Consultar rol',
        request: { params: common_2.IdParams },
        response: { description: 'Rol', schema: S.RoleOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "getRole", null);
__decorate([
    (0, route_spec_1.Endpoint)('patch', '/api/v1/roles/{id}', {
        tags: ROLES,
        auth: 'roles.update',
        summary: 'Actualizar rol y permisos',
        description: 'Los permisos del rol Administrador y los del propio rol no se pueden modificar. Las sesiones de los usuarios del rol se revalidan.',
        request: { params: common_2.IdParams, body: S.RoleUpdate },
        errors: [409],
        response: { description: 'Rol actualizado', schema: S.RoleOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "updateRole", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/roles/{id}', {
        status: 204,
        tags: ROLES,
        auth: 'roles.delete',
        summary: 'Eliminar rol',
        description: 'Solo si ningún usuario lo tiene asignado (si no, 409). Los roles del sistema no se eliminan.',
        request: { params: common_2.IdParams },
        errors: [409],
        response: { description: 'Eliminado' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "deleteRole", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/auditoria', {
        tags: ['Auditoría'],
        auth: 'audit.read',
        summary: 'Consultar la bitácora de auditoría',
        description: 'Registros de accesos, intentos fallidos, cambios de roles y operaciones. Solo lectura: la bitácora no admite modificaciones.',
        request: { query: S.AuditQuery },
        response: { description: 'Eventos', schema: S.AuditList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "listAudit", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/auditoria/integridad', {
        tags: ['Auditoría'],
        auth: 'audit.read',
        summary: 'Verificar la integridad de la bitácora',
        description: 'Recalcula la cadena HMAC de todos los registros y reporta el primero alterado, si lo hay.',
        response: { description: 'Resultado', schema: S.AuditIntegrity },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "verifyAudit", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/estadisticas', {
        tags: ['Estadísticas'],
        auth: 'stats.read',
        summary: 'Reporte de visitas',
        description: 'Métricas agregadas del sitio público en el rango (máx. 366 días; por defecto, últimos 30). Sin datos personales. Ver docs/ESTADISTICAS.md para el método y sus limitaciones.',
        request: { query: S.StatsQuery },
        response: { description: 'Reporte', schema: S.StatsReport },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "statsReport", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/sistema/metricas', {
        tags: ['Sistema'],
        auth: 'system.read',
        summary: 'Métricas operativas de esta instancia',
        description: 'Latencia y errores por ruta (ventana deslizante), conexiones del pool de PostgreSQL, memoria, CPU, caché y cola de estadísticas. Sin datos personales.',
        response: { description: 'Métricas', schema: S.SystemMetrics },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "systemMetrics", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [identity_services_1.UserService,
        identity_services_1.RoleService,
        audit_service_1.AuditService,
        stats_service_1.StatsService,
        metrics_service_1.MetricsService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map