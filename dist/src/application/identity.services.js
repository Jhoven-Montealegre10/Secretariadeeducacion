"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoleService = exports.UserService = void 0;
/**
 * Gestión de usuarios y roles.
 * Usuarios:
 *  - nadie cambia su propio rol, ni se desactiva o elimina a sí mismo;
 *  - nunca queda el sistema sin un administrador activo (se bloquean las filas al comprobarlo);
 *  - solo se asignan roles cuyos permisos estén contenidos en los del actor (sin escalada);
 *  - cambiar rol, correo o desactivar revoca de inmediato las sesiones del usuario;
 *  - las cuentas nuevas reciben una invitación de un solo uso, nunca una contraseña.
 * Roles:
 *  - el rol Administrador es del sistema: no se elimina ni se cambian sus permisos;
 *  - un rol solo se elimina si no tiene usuarios; nadie concede permisos que no tiene.
 * Ediciones concurrentes: si el cliente envía `version` y no coincide, se responde 409 EDIT_CONFLICT.
 */
const node_crypto_1 = __importDefault(require("node:crypto"));
const common_1 = require("@nestjs/common");
const content_1 = require("../domain/content");
const errors_1 = require("../domain/errors");
const permissions_1 = require("../domain/permissions");
const publication_1 = require("../domain/publication");
const db_service_1 = require("../infrastructure/database/db.service");
const identity_repositories_1 = require("../infrastructure/repositories/identity.repositories");
const password_hasher_service_1 = require("../infrastructure/security/password-hasher.service");
const audit_service_1 = require("./audit.service");
const auth_service_1 = require("./auth.service");
const authorization_1 = require("./authorization");
const DUPLICATE_EMAIL = () => new errors_1.ConflictError('Ya existe un usuario con ese correo.', [{ campo: 'email', mensaje: 'Duplicado' }]);
const DUPLICATE_ROLE = () => new errors_1.ConflictError('Ya existe un rol con ese nombre.', [{ campo: 'nombre', mensaje: 'Duplicado' }]);
let UserService = class UserService {
    db;
    users;
    roles;
    credentials;
    hasher;
    auth;
    audit;
    constructor(db, users, roles, credentials, hasher, auth, audit) {
        this.db = db;
        this.users = users;
        this.roles = roles;
        this.credentials = credentials;
        this.hasher = hasher;
        this.auth = auth;
        this.audit = audit;
    }
    async requireUser(id, forUpdate = false) {
        const user = await this.users.findById(id, { forUpdate });
        if (!user)
            throw new errors_1.NotFoundError('El usuario no existe.');
        return user;
    }
    async requireAssignableRole(actor, rolId) {
        const role = await this.roles.findById(rolId);
        if (!role)
            throw new errors_1.ValidationError('El rol no existe.', [{ campo: 'rolId', mensaje: 'Rol inexistente' }]);
        if (role.permisos.some((p) => !actor.permisos.has(p)))
            throw new errors_1.ForbiddenError('No puede asignar un rol con permisos que usted no tiene.');
        return role;
    }
    async ensureAnotherAdmin(user, actionText) {
        if (user.rolSlug === permissions_1.ROL_ADMINISTRADOR && user.activo && (await this.users.countActiveAdmins(user.id)) === 0) {
            throw new errors_1.ConflictError(`No se puede ${actionText} al último administrador activo.`);
        }
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'users.read');
        return this.users.list(filters);
    }
    async get(actor, id) {
        (0, authorization_1.authorize)(actor, 'users.read');
        return this.requireUser(id);
    }
    async create(actor, input, ip) {
        (0, authorization_1.authorize)(actor, 'users.create');
        await this.requireAssignableRole(actor, input.rolId);
        const email = input.email.trim().toLowerCase();
        if (await this.users.findByEmail(email))
            throw DUPLICATE_EMAIL();
        // Contraseña aleatoria imposible de conocer: la persona define la suya con la invitación.
        const unusable = await this.hasher.hash(node_crypto_1.default.randomBytes(32).toString('base64'));
        let user;
        try {
            user = await this.db.transaction(async () => {
                const id = await this.users.create({ email, nombre: input.nombre.trim(), passwordHash: unusable, rolId: input.rolId });
                const created = (await this.users.findById(id));
                await this.audit.record({ actor, accion: 'usuario_crear', recurso: 'usuario', recursoId: id, detalle: `rol ${created.rolSlug}`, ip });
                return created;
            });
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw DUPLICATE_EMAIL(); // carrera entre dos altas simultáneas
            throw err;
        }
        await this.auth.sendInvitation(user); // fuera de la transacción: el correo es E/S externa
        return user;
    }
    async update(actor, id, changes, ip) {
        (0, authorization_1.authorize)(actor, 'users.update');
        try {
            return await this.db.transaction(async () => {
                const user = await this.requireUser(id, true);
                if (!(0, publication_1.versionCoincide)(changes.version, user.version))
                    throw new errors_1.EditConflictError(user.version);
                const self = user.id === actor.id;
                const roleChanged = changes.rolId !== undefined && changes.rolId !== user.rolId;
                const deactivated = changes.activo === false && user.activo;
                if (self && roleChanged)
                    throw new errors_1.ForbiddenError('No puede cambiar su propio rol.');
                if (self && changes.activo === false)
                    throw new errors_1.ForbiddenError('No puede desactivar su propia cuenta.');
                if (user.rolSlug === permissions_1.ROL_ADMINISTRADOR && actor.rolSlug !== permissions_1.ROL_ADMINISTRADOR && (roleChanged || deactivated)) {
                    throw new errors_1.ForbiddenError('Solo un administrador puede modificar a otro administrador.');
                }
                let newRole = null;
                if (roleChanged) {
                    newRole = await this.requireAssignableRole(actor, changes.rolId);
                    await this.ensureAnotherAdmin(user, 'quitar el rol de administrador');
                }
                if (deactivated)
                    await this.ensureAnotherAdmin(user, 'desactivar');
                const email = changes.email?.trim().toLowerCase();
                if (email) {
                    const other = await this.users.findByEmail(email);
                    if (other && other.id !== id)
                        throw DUPLICATE_EMAIL();
                }
                await this.users.update(id, { nombre: changes.nombre?.trim(), email, rolId: changes.rolId, activo: changes.activo });
                if (roleChanged || deactivated || (email && email !== user.email)) {
                    await this.users.bumpAuthVersion(id); // revoca sesiones activas
                    await this.credentials.deleteSessionsOfUser(id);
                }
                await this.audit.record({
                    actor,
                    accion: roleChanged ? 'usuario_cambiar_rol' : 'usuario_actualizar',
                    recurso: 'usuario',
                    recursoId: id,
                    detalle: [
                        roleChanged && newRole && `rol ${user.rolSlug} → ${newRole.slug}`,
                        deactivated && 'desactivado',
                        changes.activo === true && !user.activo && 'reactivado',
                    ]
                        .filter(Boolean)
                        .join('; '),
                    ip,
                });
                return (await this.users.findById(id));
            });
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw DUPLICATE_EMAIL();
            throw err;
        }
    }
    async remove(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'users.delete');
        await this.db.transaction(async () => {
            const user = await this.requireUser(id, true);
            if (user.id === actor.id)
                throw new errors_1.ForbiddenError('No puede eliminar su propia cuenta.');
            if (user.rolSlug === permissions_1.ROL_ADMINISTRADOR && actor.rolSlug !== permissions_1.ROL_ADMINISTRADOR)
                throw new errors_1.ForbiddenError('Solo un administrador puede eliminar a otro administrador.');
            await this.ensureAnotherAdmin(user, 'eliminar');
            await this.credentials.deleteSessionsOfUser(id);
            await this.users.delete(id);
            await this.audit.record({ actor, accion: 'usuario_eliminar', recurso: 'usuario', recursoId: id, detalle: user.email, ip });
        });
    }
    /** Obliga a configurar de nuevo el segundo factor (p. ej. teléfono perdido) y revoca sesiones. */
    async resetMfa(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'users.update');
        await this.db.transaction(async () => {
            const user = await this.requireUser(id, true);
            if (user.id === actor.id)
                throw new errors_1.ForbiddenError('Use "Mi cuenta" para cambiar su propio segundo factor.');
            if (user.rolSlug === permissions_1.ROL_ADMINISTRADOR && actor.rolSlug !== permissions_1.ROL_ADMINISTRADOR)
                throw new errors_1.ForbiddenError('Solo un administrador puede modificar a otro administrador.');
            await this.users.setMfa(id, { secretoEnc: null, activo: false });
            await this.credentials.replaceRecoveryCodes(id, []);
            await this.credentials.deleteSessionsOfUser(id);
            await this.audit.record({ actor, accion: 'usuario_restablecer_mfa', recurso: 'usuario', recursoId: id, ip });
        });
    }
    async resendInvitation(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'users.update');
        const user = await this.requireUser(id);
        await this.auth.sendInvitation(user);
        await this.audit.record({ actor, accion: 'usuario_enviar_invitacion', recurso: 'usuario', recursoId: id, ip });
    }
    async updateOwnProfile(actor, input, ip) {
        if (!actor)
            throw new errors_1.ForbiddenError();
        await this.db.transaction(async () => {
            await this.users.update(actor.id, { nombre: input.nombre.trim() });
            await this.audit.record({ actor, accion: 'perfil_actualizar', recurso: 'usuario', recursoId: actor.id, ip });
        });
        return (await this.users.findById(actor.id));
    }
};
exports.UserService = UserService;
exports.UserService = UserService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        identity_repositories_1.UserRepository,
        identity_repositories_1.RoleRepository,
        identity_repositories_1.CredentialRepository,
        password_hasher_service_1.PasswordHasher,
        auth_service_1.AuthService,
        audit_service_1.AuditService])
], UserService);
let RoleService = class RoleService {
    db;
    roles;
    users;
    audit;
    constructor(db, roles, users, audit) {
        this.db = db;
        this.roles = roles;
        this.users = users;
        this.audit = audit;
    }
    async requireRole(id, forUpdate = false) {
        const role = await this.roles.findById(id, { forUpdate });
        if (!role)
            throw new errors_1.NotFoundError('El rol no existe.');
        return role;
    }
    validatePermissions(actor, permisos) {
        const invalid = permisos.filter((p) => !(0, permissions_1.esPermisoValido)(p));
        if (invalid.length)
            throw new errors_1.ValidationError('Hay permisos que no existen.', invalid.map((p) => ({ campo: 'permisos', mensaje: p })));
        if (permisos.some((p) => !actor.permisos.has(p)))
            throw new errors_1.ForbiddenError('No puede conceder permisos que usted no tiene.');
        return [...new Set([...permisos, 'dashboard.access'])].sort();
    }
    catalog(actor) {
        (0, authorization_1.authorize)(actor, 'roles.read');
        return (0, permissions_1.catalogo)();
    }
    async list(actor) {
        (0, authorization_1.authorize)(actor, 'roles.read');
        return this.roles.list();
    }
    async get(actor, id) {
        (0, authorization_1.authorize)(actor, 'roles.read');
        return this.requireRole(id);
    }
    async create(actor, input, ip) {
        (0, authorization_1.authorize)(actor, 'roles.create');
        const perms = this.validatePermissions(actor, input.permisos);
        const nombre = input.nombre.trim();
        const slug = (0, content_1.slugify)(nombre);
        if (!slug)
            throw new errors_1.ValidationError('El nombre del rol no es válido.', [{ campo: 'nombre', mensaje: 'Inválido' }]);
        if ((await this.roles.findBySlug(slug)) || (await this.roles.nameExists(nombre)))
            throw DUPLICATE_ROLE();
        try {
            return await this.db.transaction(async () => {
                const id = await this.roles.create({ slug, nombre, descripcion: input.descripcion ?? '' });
                await this.roles.setPermissions(id, perms);
                await this.audit.record({ actor, accion: 'rol_crear', recurso: 'rol', recursoId: id, detalle: perms.join(','), ip });
                return (await this.roles.findById(id));
            });
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw DUPLICATE_ROLE();
            throw err;
        }
    }
    async update(actor, id, input, ip) {
        (0, authorization_1.authorize)(actor, 'roles.update');
        try {
            return await this.db.transaction(async () => {
                const role = await this.requireRole(id, true);
                if (!(0, publication_1.versionCoincide)(input.version, role.version))
                    throw new errors_1.EditConflictError(role.version);
                if (role.slug === permissions_1.ROL_ADMINISTRADOR && input.permisos)
                    throw new errors_1.ForbiddenError('Los permisos del rol Administrador no se pueden modificar.');
                if (role.id === actor.rolId && input.permisos)
                    throw new errors_1.ForbiddenError('No puede modificar los permisos de su propio rol.');
                const perms = input.permisos ? this.validatePermissions(actor, input.permisos) : null;
                const nombre = input.nombre?.trim();
                if (nombre && (await this.roles.nameExists(nombre, id)))
                    throw DUPLICATE_ROLE();
                await this.roles.update(id, { nombre, descripcion: input.descripcion });
                if (perms) {
                    await this.roles.setPermissions(id, perms);
                    await this.users.bumpAuthVersionForRole(id); // obliga a revalidar sesiones con los permisos nuevos
                }
                await this.audit.record({
                    actor,
                    accion: 'rol_actualizar',
                    recurso: 'rol',
                    recursoId: id,
                    detalle: perms ? `permisos: ${perms.join(',')}` : 'datos',
                    ip,
                });
                return (await this.roles.findById(id));
            });
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw DUPLICATE_ROLE();
            throw err;
        }
    }
    async remove(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'roles.delete');
        await this.db.transaction(async () => {
            const role = await this.requireRole(id, true);
            if (role.sistema)
                throw new errors_1.ForbiddenError('Los roles del sistema no se pueden eliminar.');
            const n = await this.users.countByRole(id);
            if (n > 0)
                throw new errors_1.ConflictError(`El rol tiene ${n} usuario(s) asignado(s). Asígneles otro rol antes de eliminarlo.`);
            try {
                await this.roles.delete(id);
            }
            catch (err) {
                // Un usuario recibió el rol entre la verificación y el borrado (FK RESTRICT).
                if ((0, db_service_1.pgCode)(err) === db_service_1.PG.FOREIGN_KEY_VIOLATION)
                    throw new errors_1.ConflictError('El rol tiene usuarios asignados. Asígneles otro rol antes de eliminarlo.');
                throw err;
            }
            await this.audit.record({ actor, accion: 'rol_eliminar', recurso: 'rol', recursoId: id, detalle: role.nombre, ip });
        });
    }
};
exports.RoleService = RoleService;
exports.RoleService = RoleService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        identity_repositories_1.RoleRepository,
        identity_repositories_1.UserRepository,
        audit_service_1.AuditService])
], RoleService);
//# sourceMappingURL=identity.services.js.map