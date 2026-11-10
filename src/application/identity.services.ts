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
import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { slugify } from '../domain/content';
import { ConflictError, EditConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import { catalogo, esPermisoValido, ROL_ADMINISTRADOR, type Actor } from '../domain/permissions';
import { versionCoincide } from '../domain/publication';
import { Db, PG, pgCode } from '../infrastructure/database/db.service';
import {
  CredentialRepository,
  RoleRepository,
  UserRepository,
  type RoleRecord,
  type UserFilters,
  type UserRecord,
} from '../infrastructure/repositories/identity.repositories';
import { PasswordHasher } from '../infrastructure/security/password-hasher.service';
import { AuditService } from './audit.service';
import { AuthService } from './auth.service';
import { authorize } from './authorization';

const DUPLICATE_EMAIL = () => new ConflictError('Ya existe un usuario con ese correo.', [{ campo: 'email', mensaje: 'Duplicado' }]);
const DUPLICATE_ROLE = () => new ConflictError('Ya existe un rol con ese nombre.', [{ campo: 'nombre', mensaje: 'Duplicado' }]);

export interface UserChanges {
  email?: string;
  nombre?: string;
  rolId?: number;
  activo?: boolean;
  version?: number;
}

@Injectable()
export class UserService {
  constructor(
    private readonly db: Db,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  private async requireUser(id: number, forUpdate = false): Promise<UserRecord> {
    const user = await this.users.findById(id, { forUpdate });
    if (!user) throw new NotFoundError('El usuario no existe.');
    return user;
  }

  private async requireAssignableRole(actor: Actor, rolId: number): Promise<RoleRecord> {
    const role = await this.roles.findById(rolId);
    if (!role) throw new ValidationError('El rol no existe.', [{ campo: 'rolId', mensaje: 'Rol inexistente' }]);
    if (role.permisos.some((p) => !actor.permisos.has(p))) throw new ForbiddenError('No puede asignar un rol con permisos que usted no tiene.');
    return role;
  }

  private async ensureAnotherAdmin(user: UserRecord, actionText: string): Promise<void> {
    if (user.rolSlug === ROL_ADMINISTRADOR && user.activo && (await this.users.countActiveAdmins(user.id)) === 0) {
      throw new ConflictError(`No se puede ${actionText} al último administrador activo.`);
    }
  }

  async list(actor: Actor | null, filters: UserFilters) {
    authorize(actor, 'users.read');
    return this.users.list(filters);
  }

  async get(actor: Actor | null, id: number): Promise<UserRecord> {
    authorize(actor, 'users.read');
    return this.requireUser(id);
  }

  async create(actor: Actor | null, input: { email: string; nombre: string; rolId: number }, ip: string | null): Promise<UserRecord> {
    authorize(actor, 'users.create');
    await this.requireAssignableRole(actor, input.rolId);
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) throw DUPLICATE_EMAIL();
    // Contraseña aleatoria imposible de conocer: la persona define la suya con la invitación.
    const unusable = await this.hasher.hash(crypto.randomBytes(32).toString('base64'));
    let user: UserRecord;
    try {
      user = await this.db.transaction(async () => {
        const id = await this.users.create({ email, nombre: input.nombre.trim(), passwordHash: unusable, rolId: input.rolId });
        const created = (await this.users.findById(id)) as UserRecord;
        await this.audit.record({ actor, accion: 'usuario_crear', recurso: 'usuario', recursoId: id, detalle: `rol ${created.rolSlug}`, ip });
        return created;
      });
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw DUPLICATE_EMAIL(); // carrera entre dos altas simultáneas
      throw err;
    }
    await this.auth.sendInvitation(user); // fuera de la transacción: el correo es E/S externa
    return user;
  }

  async update(actor: Actor | null, id: number, changes: UserChanges, ip: string | null): Promise<UserRecord> {
    authorize(actor, 'users.update');
    try {
      return await this.db.transaction(async () => {
        const user = await this.requireUser(id, true);
        if (!versionCoincide(changes.version, user.version)) throw new EditConflictError(user.version);
        const self = user.id === actor.id;
        const roleChanged = changes.rolId !== undefined && changes.rolId !== user.rolId;
        const deactivated = changes.activo === false && user.activo;
        if (self && roleChanged) throw new ForbiddenError('No puede cambiar su propio rol.');
        if (self && changes.activo === false) throw new ForbiddenError('No puede desactivar su propia cuenta.');
        if (user.rolSlug === ROL_ADMINISTRADOR && actor.rolSlug !== ROL_ADMINISTRADOR && (roleChanged || deactivated)) {
          throw new ForbiddenError('Solo un administrador puede modificar a otro administrador.');
        }
        let newRole: RoleRecord | null = null;
        if (roleChanged) {
          newRole = await this.requireAssignableRole(actor, changes.rolId as number);
          await this.ensureAnotherAdmin(user, 'quitar el rol de administrador');
        }
        if (deactivated) await this.ensureAnotherAdmin(user, 'desactivar');
        const email = changes.email?.trim().toLowerCase();
        if (email) {
          const other = await this.users.findByEmail(email);
          if (other && other.id !== id) throw DUPLICATE_EMAIL();
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
        return (await this.users.findById(id)) as UserRecord;
      });
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw DUPLICATE_EMAIL();
      throw err;
    }
  }

  async remove(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'users.delete');
    await this.db.transaction(async () => {
      const user = await this.requireUser(id, true);
      if (user.id === actor.id) throw new ForbiddenError('No puede eliminar su propia cuenta.');
      if (user.rolSlug === ROL_ADMINISTRADOR && actor.rolSlug !== ROL_ADMINISTRADOR)
        throw new ForbiddenError('Solo un administrador puede eliminar a otro administrador.');
      await this.ensureAnotherAdmin(user, 'eliminar');
      await this.credentials.deleteSessionsOfUser(id);
      await this.users.delete(id);
      await this.audit.record({ actor, accion: 'usuario_eliminar', recurso: 'usuario', recursoId: id, detalle: user.email, ip });
    });
  }

  /** Obliga a configurar de nuevo el segundo factor (p. ej. teléfono perdido) y revoca sesiones. */
  async resetMfa(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'users.update');
    await this.db.transaction(async () => {
      const user = await this.requireUser(id, true);
      if (user.id === actor.id) throw new ForbiddenError('Use "Mi cuenta" para cambiar su propio segundo factor.');
      if (user.rolSlug === ROL_ADMINISTRADOR && actor.rolSlug !== ROL_ADMINISTRADOR)
        throw new ForbiddenError('Solo un administrador puede modificar a otro administrador.');
      await this.users.setMfa(id, { secretoEnc: null, activo: false });
      await this.credentials.replaceRecoveryCodes(id, []);
      await this.credentials.deleteSessionsOfUser(id);
      await this.audit.record({ actor, accion: 'usuario_restablecer_mfa', recurso: 'usuario', recursoId: id, ip });
    });
  }

  async resendInvitation(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'users.update');
    const user = await this.requireUser(id);
    await this.auth.sendInvitation(user);
    await this.audit.record({ actor, accion: 'usuario_enviar_invitacion', recurso: 'usuario', recursoId: id, ip });
  }

  async updateOwnProfile(actor: Actor | null, input: { nombre: string }, ip: string | null): Promise<UserRecord> {
    if (!actor) throw new ForbiddenError();
    await this.db.transaction(async () => {
      await this.users.update(actor.id, { nombre: input.nombre.trim() });
      await this.audit.record({ actor, accion: 'perfil_actualizar', recurso: 'usuario', recursoId: actor.id, ip });
    });
    return (await this.users.findById(actor.id)) as UserRecord;
  }
}

@Injectable()
export class RoleService {
  constructor(
    private readonly db: Db,
    private readonly roles: RoleRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditService,
  ) {}

  private async requireRole(id: number, forUpdate = false): Promise<RoleRecord> {
    const role = await this.roles.findById(id, { forUpdate });
    if (!role) throw new NotFoundError('El rol no existe.');
    return role;
  }

  private validatePermissions(actor: Actor, permisos: string[]): string[] {
    const invalid = permisos.filter((p) => !esPermisoValido(p));
    if (invalid.length)
      throw new ValidationError(
        'Hay permisos que no existen.',
        invalid.map((p) => ({ campo: 'permisos', mensaje: p })),
      );
    if (permisos.some((p) => !actor.permisos.has(p))) throw new ForbiddenError('No puede conceder permisos que usted no tiene.');
    return [...new Set([...permisos, 'dashboard.access'])].sort();
  }

  catalog(actor: Actor | null) {
    authorize(actor, 'roles.read');
    return catalogo();
  }

  async list(actor: Actor | null): Promise<RoleRecord[]> {
    authorize(actor, 'roles.read');
    return this.roles.list();
  }

  async get(actor: Actor | null, id: number): Promise<RoleRecord> {
    authorize(actor, 'roles.read');
    return this.requireRole(id);
  }

  async create(actor: Actor | null, input: { nombre: string; descripcion?: string; permisos: string[] }, ip: string | null): Promise<RoleRecord> {
    authorize(actor, 'roles.create');
    const perms = this.validatePermissions(actor, input.permisos);
    const nombre = input.nombre.trim();
    const slug = slugify(nombre);
    if (!slug) throw new ValidationError('El nombre del rol no es válido.', [{ campo: 'nombre', mensaje: 'Inválido' }]);
    if ((await this.roles.findBySlug(slug)) || (await this.roles.nameExists(nombre))) throw DUPLICATE_ROLE();
    try {
      return await this.db.transaction(async () => {
        const id = await this.roles.create({ slug, nombre, descripcion: input.descripcion ?? '' });
        await this.roles.setPermissions(id, perms);
        await this.audit.record({ actor, accion: 'rol_crear', recurso: 'rol', recursoId: id, detalle: perms.join(','), ip });
        return (await this.roles.findById(id)) as RoleRecord;
      });
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw DUPLICATE_ROLE();
      throw err;
    }
  }

  async update(
    actor: Actor | null,
    id: number,
    input: { nombre?: string; descripcion?: string; permisos?: string[]; version?: number },
    ip: string | null,
  ): Promise<RoleRecord> {
    authorize(actor, 'roles.update');
    try {
      return await this.db.transaction(async () => {
        const role = await this.requireRole(id, true);
        if (!versionCoincide(input.version, role.version)) throw new EditConflictError(role.version);
        if (role.slug === ROL_ADMINISTRADOR && input.permisos) throw new ForbiddenError('Los permisos del rol Administrador no se pueden modificar.');
        if (role.id === actor.rolId && input.permisos) throw new ForbiddenError('No puede modificar los permisos de su propio rol.');
        const perms = input.permisos ? this.validatePermissions(actor, input.permisos) : null;
        const nombre = input.nombre?.trim();
        if (nombre && (await this.roles.nameExists(nombre, id))) throw DUPLICATE_ROLE();
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
        return (await this.roles.findById(id)) as RoleRecord;
      });
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw DUPLICATE_ROLE();
      throw err;
    }
  }

  async remove(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'roles.delete');
    await this.db.transaction(async () => {
      const role = await this.requireRole(id, true);
      if (role.sistema) throw new ForbiddenError('Los roles del sistema no se pueden eliminar.');
      const n = await this.users.countByRole(id);
      if (n > 0) throw new ConflictError(`El rol tiene ${n} usuario(s) asignado(s). Asígneles otro rol antes de eliminarlo.`);
      try {
        await this.roles.delete(id);
      } catch (err) {
        // Un usuario recibió el rol entre la verificación y el borrado (FK RESTRICT).
        if (pgCode(err) === PG.FOREIGN_KEY_VIOLATION) throw new ConflictError('El rol tiene usuarios asignados. Asígneles otro rol antes de eliminarlo.');
        throw err;
      }
      await this.audit.record({ actor, accion: 'rol_eliminar', recurso: 'rol', recursoId: id, detalle: role.nombre, ip });
    });
  }
}
