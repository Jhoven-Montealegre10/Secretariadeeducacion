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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditoriaEventoEntity = exports.SesionEntity = exports.TokenRecuperacionEntity = exports.CodigoRecuperacionEntity = exports.UsuarioEntity = exports.RolPermisoEntity = exports.RolEntity = void 0;
/** Usuarios, roles, permisos, credenciales de recuperación y sesiones. */
const typeorm_1 = require("typeorm");
const common_1 = require("./common");
let RolEntity = class RolEntity {
    id;
    slug;
    nombre;
    descripcion;
    sistema;
    version;
    creadoEn;
    actualizadoEn;
};
exports.RolEntity = RolEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], RolEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_roles_slug', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], RolEntity.prototype, "slug", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_roles_nombre', { unique: true }),
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], RolEntity.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { default: '' }),
    __metadata("design:type", String)
], RolEntity.prototype, "descripcion", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: false }),
    __metadata("design:type", Boolean)
], RolEntity.prototype, "sistema", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 1 }),
    __metadata("design:type", Number)
], RolEntity.prototype, "version", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], RolEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], RolEntity.prototype, "actualizadoEn", void 0);
exports.RolEntity = RolEntity = __decorate([
    (0, typeorm_1.Entity)('roles')
], RolEntity);
let RolPermisoEntity = class RolPermisoEntity {
    rolId;
    permiso;
    rol;
};
exports.RolPermisoEntity = RolPermisoEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('integer', { name: 'rol_id' }),
    __metadata("design:type", Number)
], RolPermisoEntity.prototype, "rolId", void 0);
__decorate([
    (0, typeorm_1.PrimaryColumn)('text'),
    __metadata("design:type", String)
], RolPermisoEntity.prototype, "permiso", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RolEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'rol_id' }),
    __metadata("design:type", RolEntity)
], RolPermisoEntity.prototype, "rol", void 0);
exports.RolPermisoEntity = RolPermisoEntity = __decorate([
    (0, typeorm_1.Entity)('rol_permisos')
], RolPermisoEntity);
let UsuarioEntity = class UsuarioEntity {
    id;
    /** Se guarda en minúsculas (normalizado en el servicio). */
    email;
    nombre;
    passwordHash;
    rolId;
    rol;
    activo;
    intentosFallidos;
    bloqueadoHasta;
    ultimoAcceso;
    mfaSecretoEnc;
    mfaActivo;
    mfaUltimoPaso;
    mfaIntentosFallidos;
    authVersion;
    passwordActualizadaEn;
    version;
    creadoEn;
    actualizadoEn;
};
exports.UsuarioEntity = UsuarioEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], UsuarioEntity.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], UsuarioEntity.prototype, "nombre", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'password_hash' }),
    __metadata("design:type", String)
], UsuarioEntity.prototype, "passwordHash", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'rol_id' }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "rolId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => RolEntity, { onDelete: 'RESTRICT' }),
    (0, typeorm_1.JoinColumn)({ name: 'rol_id' }),
    __metadata("design:type", RolEntity)
], UsuarioEntity.prototype, "rol", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { default: true }),
    __metadata("design:type", Boolean)
], UsuarioEntity.prototype, "activo", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'intentos_fallidos', default: 0 }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "intentosFallidos", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'bloqueado_hasta', nullable: true }),
    __metadata("design:type", Object)
], UsuarioEntity.prototype, "bloqueadoHasta", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'ultimo_acceso', nullable: true }),
    __metadata("design:type", Object)
], UsuarioEntity.prototype, "ultimoAcceso", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'mfa_secreto_enc', nullable: true }),
    __metadata("design:type", Object)
], UsuarioEntity.prototype, "mfaSecretoEnc", void 0);
__decorate([
    (0, typeorm_1.Column)('boolean', { name: 'mfa_activo', default: false }),
    __metadata("design:type", Boolean)
], UsuarioEntity.prototype, "mfaActivo", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'mfa_ultimo_paso', default: 0 }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "mfaUltimoPaso", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'mfa_intentos_fallidos', default: 0 }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "mfaIntentosFallidos", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'auth_version', default: 1 }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "authVersion", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'password_actualizada_en', default: () => 'now()' }),
    __metadata("design:type", Date)
], UsuarioEntity.prototype, "passwordActualizadaEn", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { default: 1 }),
    __metadata("design:type", Number)
], UsuarioEntity.prototype, "version", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], UsuarioEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, common_1.UpdatedAt)(),
    __metadata("design:type", Date)
], UsuarioEntity.prototype, "actualizadoEn", void 0);
exports.UsuarioEntity = UsuarioEntity = __decorate([
    (0, typeorm_1.Entity)('usuarios'),
    (0, typeorm_1.Index)('ix_usuarios_rol', ['rolId'])
    // Único sin distinguir mayúsculas: índice funcional lower(email) creado en la migración.
    ,
    (0, typeorm_1.Index)('ux_usuarios_email', { synchronize: false })
], UsuarioEntity);
let CodigoRecuperacionEntity = class CodigoRecuperacionEntity {
    id;
    usuarioId;
    usuario;
    codigoHash;
    usadoEn;
    creadoEn;
};
exports.CodigoRecuperacionEntity = CodigoRecuperacionEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], CodigoRecuperacionEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'usuario_id' }),
    __metadata("design:type", Number)
], CodigoRecuperacionEntity.prototype, "usuarioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => UsuarioEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'usuario_id' }),
    __metadata("design:type", UsuarioEntity)
], CodigoRecuperacionEntity.prototype, "usuario", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'codigo_hash' }),
    __metadata("design:type", String)
], CodigoRecuperacionEntity.prototype, "codigoHash", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'usado_en', nullable: true }),
    __metadata("design:type", Object)
], CodigoRecuperacionEntity.prototype, "usadoEn", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], CodigoRecuperacionEntity.prototype, "creadoEn", void 0);
exports.CodigoRecuperacionEntity = CodigoRecuperacionEntity = __decorate([
    (0, typeorm_1.Entity)('codigos_recuperacion'),
    (0, typeorm_1.Index)('ix_codigos_usuario', ['usuarioId'])
], CodigoRecuperacionEntity);
let TokenRecuperacionEntity = class TokenRecuperacionEntity {
    id;
    usuarioId;
    usuario;
    tokenHash;
    expiraEn;
    usadoEn;
    creadoEn;
};
exports.TokenRecuperacionEntity = TokenRecuperacionEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", Number)
], TokenRecuperacionEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'usuario_id' }),
    __metadata("design:type", Number)
], TokenRecuperacionEntity.prototype, "usuarioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => UsuarioEntity, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'usuario_id' }),
    __metadata("design:type", UsuarioEntity)
], TokenRecuperacionEntity.prototype, "usuario", void 0);
__decorate([
    (0, typeorm_1.Index)('ux_tokens_hash', { unique: true }),
    (0, typeorm_1.Column)('text', { name: 'token_hash' }),
    __metadata("design:type", String)
], TokenRecuperacionEntity.prototype, "tokenHash", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'expira_en' }),
    __metadata("design:type", Date)
], TokenRecuperacionEntity.prototype, "expiraEn", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'usado_en', nullable: true }),
    __metadata("design:type", Object)
], TokenRecuperacionEntity.prototype, "usadoEn", void 0);
__decorate([
    (0, common_1.CreatedAt)(),
    __metadata("design:type", Date)
], TokenRecuperacionEntity.prototype, "creadoEn", void 0);
exports.TokenRecuperacionEntity = TokenRecuperacionEntity = __decorate([
    (0, typeorm_1.Entity)('tokens_recuperacion'),
    (0, typeorm_1.Index)('ix_tokens_usuario', ['usuarioId'])
], TokenRecuperacionEntity);
let SesionEntity = class SesionEntity {
    sid;
    data;
    expira;
    usuarioId;
};
exports.SesionEntity = SesionEntity;
__decorate([
    (0, typeorm_1.PrimaryColumn)('text'),
    __metadata("design:type", String)
], SesionEntity.prototype, "sid", void 0);
__decorate([
    (0, typeorm_1.Column)('jsonb'),
    __metadata("design:type", Object)
], SesionEntity.prototype, "data", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz'),
    __metadata("design:type", Date)
], SesionEntity.prototype, "expira", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'usuario_id', nullable: true }),
    __metadata("design:type", Object)
], SesionEntity.prototype, "usuarioId", void 0);
exports.SesionEntity = SesionEntity = __decorate([
    (0, typeorm_1.Entity)('sesiones'),
    (0, typeorm_1.Index)('ix_sesiones_expira', ['expira']),
    (0, typeorm_1.Index)('ix_sesiones_usuario', ['usuarioId'])
], SesionEntity);
let AuditoriaEventoEntity = class AuditoriaEventoEntity {
    id;
    /** Sin clave foránea a propósito: el historial se conserva aunque se elimine el usuario. */
    usuarioId;
    usuarioEmail;
    accion;
    recurso;
    recursoId;
    resultado;
    detalle;
    ipHash;
    creadoEn;
    hashAnterior;
    hash;
};
exports.AuditoriaEventoEntity = AuditoriaEventoEntity;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('identity', { type: 'bigint', generatedIdentity: 'BY DEFAULT' }),
    __metadata("design:type", String)
], AuditoriaEventoEntity.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)('integer', { name: 'usuario_id', nullable: true }),
    __metadata("design:type", Object)
], AuditoriaEventoEntity.prototype, "usuarioId", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'usuario_email', nullable: true }),
    __metadata("design:type", Object)
], AuditoriaEventoEntity.prototype, "usuarioEmail", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], AuditoriaEventoEntity.prototype, "accion", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", Object)
], AuditoriaEventoEntity.prototype, "recurso", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'recurso_id', nullable: true }),
    __metadata("design:type", Object)
], AuditoriaEventoEntity.prototype, "recursoId", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], AuditoriaEventoEntity.prototype, "resultado", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { nullable: true }),
    __metadata("design:type", Object)
], AuditoriaEventoEntity.prototype, "detalle", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'ip_hash', nullable: true }),
    __metadata("design:type", Object)
], AuditoriaEventoEntity.prototype, "ipHash", void 0);
__decorate([
    (0, typeorm_1.Column)('timestamptz', { name: 'creado_en' }),
    __metadata("design:type", Date)
], AuditoriaEventoEntity.prototype, "creadoEn", void 0);
__decorate([
    (0, typeorm_1.Column)('text', { name: 'hash_anterior' }),
    __metadata("design:type", String)
], AuditoriaEventoEntity.prototype, "hashAnterior", void 0);
__decorate([
    (0, typeorm_1.Column)('text'),
    __metadata("design:type", String)
], AuditoriaEventoEntity.prototype, "hash", void 0);
exports.AuditoriaEventoEntity = AuditoriaEventoEntity = __decorate([
    (0, typeorm_1.Entity)('auditoria_eventos'),
    (0, typeorm_1.Index)('ix_auditoria_fecha', ['creadoEn']),
    (0, typeorm_1.Index)('ix_auditoria_usuario', ['usuarioId']),
    (0, typeorm_1.Index)('ix_auditoria_accion', ['accion']),
    (0, typeorm_1.Check)('ck_auditoria_resultado', `resultado IN ('exito','fallo','denegado')`)
], AuditoriaEventoEntity);
//# sourceMappingURL=identity.entities.js.map