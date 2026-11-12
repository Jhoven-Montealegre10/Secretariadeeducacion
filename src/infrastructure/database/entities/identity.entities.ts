/** Usuarios, roles, permisos, credenciales de recuperación y sesiones. */
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';
import { CreatedAt, UpdatedAt } from './common';

@Entity('roles')
export class RolEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Index('ux_roles_slug', { unique: true }) @Column('text') slug!: string;
  @Index('ux_roles_nombre', { unique: true }) @Column('text') nombre!: string;
  @Column('text', { default: '' }) descripcion!: string;
  @Column('boolean', { default: false }) sistema!: boolean;
  @Column('integer', { default: 1 }) version!: number;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('rol_permisos')
export class RolPermisoEntity {
  @PrimaryColumn('integer', { name: 'rol_id' }) rolId!: number;
  @PrimaryColumn('text') permiso!: string;
  @ManyToOne(() => RolEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'rol_id' }) rol?: RolEntity;
}

@Entity('usuarios')
@Index('ix_usuarios_rol', ['rolId'])
// Único sin distinguir mayúsculas: índice funcional lower(email) creado en la migración.
@Index('ux_usuarios_email', { synchronize: false })
export class UsuarioEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  /** Se guarda en minúsculas (normalizado en el servicio). */
  @Column('text') email!: string;
  @Column('text') nombre!: string;
  @Column('text', { name: 'password_hash' }) passwordHash!: string;
  @Column('integer', { name: 'rol_id' }) rolId!: number;
  @ManyToOne(() => RolEntity, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'rol_id' }) rol?: RolEntity;
  @Column('boolean', { default: true }) activo!: boolean;
  @Column('integer', { name: 'intentos_fallidos', default: 0 }) intentosFallidos!: number;
  @Column('timestamptz', { name: 'bloqueado_hasta', nullable: true }) bloqueadoHasta!: Date | null;
  @Column('timestamptz', { name: 'ultimo_acceso', nullable: true }) ultimoAcceso!: Date | null;
  @Column('text', { name: 'mfa_secreto_enc', nullable: true }) mfaSecretoEnc!: string | null;
  @Column('boolean', { name: 'mfa_activo', default: false }) mfaActivo!: boolean;
  @Column('integer', { name: 'mfa_ultimo_paso', default: 0 }) mfaUltimoPaso!: number;
  @Column('integer', { name: 'mfa_intentos_fallidos', default: 0 }) mfaIntentosFallidos!: number;
  @Column('integer', { name: 'auth_version', default: 1 }) authVersion!: number;
  @Column('timestamptz', { name: 'password_actualizada_en', default: () => 'now()' }) passwordActualizadaEn!: Date;
  @Column('integer', { default: 1 }) version!: number;
  @CreatedAt() creadoEn!: Date;
  @UpdatedAt() actualizadoEn!: Date;
}

@Entity('codigos_recuperacion')
@Index('ix_codigos_usuario', ['usuarioId'])
export class CodigoRecuperacionEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Column('integer', { name: 'usuario_id' }) usuarioId!: number;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'usuario_id' }) usuario?: UsuarioEntity;
  @Column('text', { name: 'codigo_hash' }) codigoHash!: string;
  @Column('timestamptz', { name: 'usado_en', nullable: true }) usadoEn!: Date | null;
  @CreatedAt() creadoEn!: Date;
}

@Entity('tokens_recuperacion')
@Index('ix_tokens_usuario', ['usuarioId'])
export class TokenRecuperacionEntity {
  @PrimaryGeneratedColumn('identity', { generatedIdentity: 'BY DEFAULT' }) id!: number;
  @Column('integer', { name: 'usuario_id' }) usuarioId!: number;
  @ManyToOne(() => UsuarioEntity, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'usuario_id' }) usuario?: UsuarioEntity;
  @Index('ux_tokens_hash', { unique: true }) @Column('text', { name: 'token_hash' }) tokenHash!: string;
  @Column('timestamptz', { name: 'expira_en' }) expiraEn!: Date;
  @Column('timestamptz', { name: 'usado_en', nullable: true }) usadoEn!: Date | null;
  @CreatedAt() creadoEn!: Date;
}

@Entity('sesiones')
@Index('ix_sesiones_expira', ['expira'])
@Index('ix_sesiones_usuario', ['usuarioId'])
export class SesionEntity {
  @PrimaryColumn('text') sid!: string;
  @Column('jsonb') data!: Record<string, unknown>;
  @Column('timestamptz') expira!: Date;
  @Column('integer', { name: 'usuario_id', nullable: true }) usuarioId!: number | null;
}

@Entity('auditoria_eventos')
@Index('ix_auditoria_fecha', ['creadoEn'])
@Index('ix_auditoria_usuario', ['usuarioId'])
@Index('ix_auditoria_accion', ['accion'])
@Check('ck_auditoria_resultado', `resultado IN ('exito','fallo','denegado')`)
export class AuditoriaEventoEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'BY DEFAULT' }) id!: string;
  /** Sin clave foránea a propósito: el historial se conserva aunque se elimine el usuario. */
  @Column('integer', { name: 'usuario_id', nullable: true }) usuarioId!: number | null;
  @Column('text', { name: 'usuario_email', nullable: true }) usuarioEmail!: string | null;
  @Column('text') accion!: string;
  @Column('text', { nullable: true }) recurso!: string | null;
  @Column('text', { name: 'recurso_id', nullable: true }) recursoId!: string | null;
  @Column('text') resultado!: string;
  @Column('text', { nullable: true }) detalle!: string | null;
  @Column('text', { name: 'ip_hash', nullable: true }) ipHash!: string | null;
  @Column('timestamptz', { name: 'creado_en' }) creadoEn!: Date;
  @Column('text', { name: 'hash_anterior' }) hashAnterior!: string;
  @Column('text') hash!: string;
}
