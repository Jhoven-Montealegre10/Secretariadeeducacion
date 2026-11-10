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
exports.AuditRepository = exports.CredentialRepository = exports.RoleRepository = exports.UserRepository = void 0;
/**
 * Repositorios de identidad: usuarios, roles/permisos, credenciales de recuperación y auditoría.
 * SQL explícito y parametrizado sobre el esquema `portal`; sin lógica de negocio.
 */
const common_1 = require("@nestjs/common");
const db_service_1 = require("../database/db.service");
const sql_1 = require("../database/sql");
const crypto_service_1 = require("../security/crypto.service");
const USER_SELECT = `u.id, u.email, u.nombre, u.rol_id, r.slug AS rol_slug, r.nombre AS rol_nombre, u.activo, u.password_hash,
  u.intentos_fallidos, u.bloqueado_hasta, u.ultimo_acceso, u.mfa_secreto_enc, u.mfa_activo, u.mfa_ultimo_paso,
  u.mfa_intentos_fallidos, u.auth_version, u.password_actualizada_en, u.version, u.creado_en, u.actualizado_en`;
const USER_FROM = 'usuarios u JOIN roles r ON r.id = u.rol_id';
const USER_SORT = { nombre: 'u.nombre', email: 'u.email', creadoEn: 'u.creado_en', ultimoAcceso: 'u.ultimo_acceso' };
const USER_UPDATABLE = { nombre: 'nombre', email: 'email', rolId: 'rol_id', activo: 'activo' };
function mapUser(row) {
    if (!row)
        return null;
    return {
        id: row.id,
        email: row.email,
        nombre: row.nombre,
        rolId: row.rol_id,
        rolSlug: row.rol_slug,
        rolNombre: row.rol_nombre,
        activo: row.activo,
        passwordHash: row.password_hash,
        intentosFallidos: row.intentos_fallidos,
        bloqueadoHasta: (0, sql_1.toMs)(row.bloqueado_hasta),
        ultimoAcceso: row.ultimo_acceso ?? null,
        mfaSecretoEnc: row.mfa_secreto_enc ?? null,
        mfaActivo: row.mfa_activo,
        mfaUltimoPaso: row.mfa_ultimo_paso,
        mfaIntentosFallidos: row.mfa_intentos_fallidos,
        authVersion: row.auth_version,
        passwordActualizadaEn: row.password_actualizada_en,
        version: row.version,
        creadoEn: row.creado_en,
        actualizadoEn: row.actualizado_en,
    };
}
let UserRepository = class UserRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findById(id, { forUpdate = false } = {}) {
        const lock = forUpdate ? ' FOR UPDATE OF u' : '';
        return mapUser((await this.db.query(`SELECT ${USER_SELECT} FROM ${USER_FROM} WHERE u.id = $1${lock}`, [id]))[0] ?? null);
    }
    /** Búsqueda sin distinguir mayúsculas (usa el índice único lower(email)). */
    async findByEmail(email) {
        return mapUser((await this.db.query(`SELECT ${USER_SELECT} FROM ${USER_FROM} WHERE lower(u.email) = lower($1)`, [String(email)]))[0] ?? null);
    }
    async list(filters) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(filters.page, filters.pageSize);
        const w = new sql_1.Where()
            .addIf(filters.q, "u.nombre ILIKE ? ESCAPE '\\' OR u.email ILIKE ? ESCAPE '\\'", (0, sql_1.likePattern)(filters.q ?? ''), (0, sql_1.likePattern)(filters.q ?? ''))
            .addIf(filters.rolId, 'u.rol_id = ?', filters.rolId)
            .addIf(filters.activo !== undefined, 'u.activo = ?', filters.activo);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM ${USER_FROM} ${w.sql}`, w.params);
        const order = (0, sql_1.orderBy)(filters.sort, USER_SORT, 'u.nombre ASC, u.id ASC', 'u.id');
        const rows = await this.db.query(`SELECT ${USER_SELECT} FROM ${USER_FROM} ${w.sql} ${order} LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items: rows.map((r) => mapUser(r)), total, page, pageSize };
    }
    async create(d) {
        return this.db.scalar('INSERT INTO usuarios (email, nombre, password_hash, rol_id) VALUES ($1, $2, $3, $4) RETURNING id', [
            d.email,
            d.nombre,
            d.passwordHash,
            d.rolId,
        ]);
    }
    /** Actualiza solo columnas de la lista blanca e incrementa la versión (bloqueo optimista). */
    async update(id, fields) {
        const entries = Object.entries(fields).filter(([k, v]) => Object.hasOwn(USER_UPDATABLE, k) && v !== undefined);
        if (!entries.length)
            return 0;
        const sets = entries.map(([k], i) => `${USER_UPDATABLE[k]} = $${i + 1}`).join(', ');
        return this.db.run(`UPDATE usuarios SET ${sets}, version = version + 1, actualizado_en = now() WHERE id = $${entries.length + 1}`, [
            ...entries.map(([, v]) => v),
            id,
        ]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM usuarios WHERE id = $1', [id]);
    }
    /** Administradores activos (rol del sistema), excluyendo opcionalmente uno. Bloquea sus filas. */
    async countActiveAdmins(excludeId = 0) {
        const rows = await this.db.query(`SELECT u.id FROM ${USER_FROM} WHERE r.slug = 'administrador' AND u.activo AND u.id <> $1 FOR UPDATE OF u`, [excludeId]);
        return rows.length;
    }
    async countByRole(rolId) {
        return this.db.scalar('SELECT COUNT(*) FROM usuarios WHERE rol_id = $1', [rolId]);
    }
    /** Invalida todas las sesiones: la versión guardada en cada sesión deja de coincidir. */
    async bumpAuthVersion(id) {
        return this.db.scalar('UPDATE usuarios SET auth_version = auth_version + 1 WHERE id = $1 RETURNING auth_version', [id]);
    }
    async bumpAuthVersionForRole(rolId) {
        return this.db.run('UPDATE usuarios SET auth_version = auth_version + 1 WHERE rol_id = $1', [rolId]);
    }
    async setPasswordHash(id, passwordHash, { rotateSessions = true } = {}) {
        await this.db.run(`UPDATE usuarios SET password_hash = $1, password_actualizada_en = now(), auth_version = auth_version + $2,
       intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $3`, [passwordHash, rotateSessions ? 1 : 0, id]);
    }
    async recordLoginFailure(id, intentos, bloqueadoHastaMs) {
        await this.db.run('UPDATE usuarios SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3', [intentos, (0, sql_1.fromMs)(bloqueadoHastaMs), id]);
    }
    /** Incremento atómico de intentos fallidos (evita perder intentos con peticiones concurrentes). */
    async incrementLoginFailures(id, max, lockMs) {
        const row = await this.db.one(`UPDATE usuarios SET
         intentos_fallidos = CASE WHEN intentos_fallidos + 1 >= $2 THEN 0 ELSE intentos_fallidos + 1 END,
         bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + ($3 * interval '1 millisecond') ELSE bloqueado_hasta END
       WHERE id = $1
       RETURNING intentos_fallidos, (bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now()) AS bloqueado`, [id, max, lockMs]);
        return { intentos: row?.intentos_fallidos ?? 0, bloqueado: row?.bloqueado ?? false };
    }
    async incrementMfaFailures(id, max, lockMs) {
        const row = await this.db.one(`UPDATE usuarios SET
         mfa_intentos_fallidos = CASE WHEN mfa_intentos_fallidos + 1 >= $2 THEN 0 ELSE mfa_intentos_fallidos + 1 END,
         bloqueado_hasta = CASE WHEN mfa_intentos_fallidos + 1 >= $2 THEN now() + ($3 * interval '1 millisecond') ELSE bloqueado_hasta END
       WHERE id = $1
       RETURNING (mfa_intentos_fallidos = 0 AND bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now()) AS bloqueado`, [id, max, lockMs]);
        return { bloqueado: row?.bloqueado ?? false };
    }
    async recordLoginSuccess(id) {
        await this.db.run('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, mfa_intentos_fallidos = 0, ultimo_acceso = now() WHERE id = $1', [
            id,
        ]);
    }
    async setMfa(id, { secretoEnc, activo }) {
        await this.db.run(`UPDATE usuarios SET mfa_secreto_enc = $1, mfa_activo = $2, mfa_ultimo_paso = 0, mfa_intentos_fallidos = 0,
       auth_version = auth_version + 1 WHERE id = $3`, [secretoEnc, activo, id]);
    }
    /** Guarda el último paso TOTP solo si es mayor que el anterior (anti-reutilización atómica). */
    async consumeTotpStep(id, step) {
        return (await this.db.run('UPDATE usuarios SET mfa_ultimo_paso = $1, mfa_intentos_fallidos = 0 WHERE id = $2 AND mfa_ultimo_paso < $1', [step, id])) === 1;
    }
};
exports.UserRepository = UserRepository;
exports.UserRepository = UserRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], UserRepository);
const ROLE_SELECT = `r.id, r.slug, r.nombre, r.descripcion, r.sistema, r.version, r.creado_en, r.actualizado_en,
  (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id) AS total_usuarios,
  COALESCE((SELECT array_agg(rp.permiso ORDER BY rp.permiso) FROM rol_permisos rp WHERE rp.rol_id = r.id), '{}') AS permisos`;
let RoleRepository = class RoleRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async list() {
        return this.db.rows(`SELECT ${ROLE_SELECT} FROM roles r ORDER BY r.sistema DESC, r.nombre`);
    }
    async findById(id, { forUpdate = false } = {}) {
        if (forUpdate)
            await this.db.run('SELECT 1 FROM roles WHERE id = $1 FOR UPDATE', [id]);
        return this.db.row(`SELECT ${ROLE_SELECT} FROM roles r WHERE r.id = $1`, [id]);
    }
    async findBySlug(slug) {
        return this.db.row(`SELECT ${ROLE_SELECT} FROM roles r WHERE r.slug = $1`, [slug]);
    }
    async nameExists(nombre, exceptId = 0) {
        return (await this.db.scalar('SELECT COUNT(*) FROM roles WHERE lower(nombre) = lower($1) AND id <> $2', [nombre.trim(), exceptId])) > 0;
    }
    async permissionsOf(rolId) {
        return (await this.db.query('SELECT permiso FROM rol_permisos WHERE rol_id = $1', [rolId])).map((r) => r.permiso);
    }
    async create(d) {
        return this.db.scalar('INSERT INTO roles (slug, nombre, descripcion) VALUES ($1, $2, $3) RETURNING id', [d.slug, d.nombre, d.descripcion]);
    }
    async update(id, d) {
        return this.db.run(`UPDATE roles SET nombre = COALESCE($1, nombre), descripcion = COALESCE($2, descripcion), version = version + 1, actualizado_en = now()
       WHERE id = $3`, [d.nombre ?? null, d.descripcion ?? null, id]);
    }
    /** Reemplaza los permisos en una sola sentencia por tabla (sin N+1). */
    async setPermissions(id, permisos) {
        await this.db.run('DELETE FROM rol_permisos WHERE rol_id = $1', [id]);
        if (permisos.length)
            await this.db.run('INSERT INTO rol_permisos (rol_id, permiso) SELECT $1, unnest($2::text[])', [id, permisos]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM roles WHERE id = $1', [id]);
    }
};
exports.RoleRepository = RoleRepository;
exports.RoleRepository = RoleRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], RoleRepository);
/** Códigos de recuperación MFA y tokens de restablecimiento: solo se guardan sus hashes. */
let CredentialRepository = class CredentialRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async replaceRecoveryCodes(userId, hashes) {
        await this.db.run('DELETE FROM codigos_recuperacion WHERE usuario_id = $1', [userId]);
        if (hashes.length)
            await this.db.run('INSERT INTO codigos_recuperacion (usuario_id, codigo_hash) SELECT $1, unnest($2::text[])', [userId, hashes]);
    }
    /** Marca el código como usado de forma atómica; true solo la primera vez. */
    async consumeRecoveryCode(userId, hash) {
        return ((await this.db.run('UPDATE codigos_recuperacion SET usado_en = now() WHERE usuario_id = $1 AND codigo_hash = $2 AND usado_en IS NULL', [
            userId,
            hash,
        ])) === 1);
    }
    async remainingRecoveryCodes(userId) {
        return this.db.scalar('SELECT COUNT(*) FROM codigos_recuperacion WHERE usuario_id = $1 AND usado_en IS NULL', [userId]);
    }
    async createResetToken(userId, tokenHash, expiraEnMs) {
        await this.db.transaction(async () => {
            await this.db.run('UPDATE tokens_recuperacion SET usado_en = now() WHERE usuario_id = $1 AND usado_en IS NULL', [userId]);
            await this.db.run('INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES ($1, $2, $3)', [userId, tokenHash, (0, sql_1.fromMs)(expiraEnMs)]);
        });
    }
    async findResetToken(tokenHash) {
        const row = await this.db.one('SELECT id, usuario_id, expira_en, usado_en FROM tokens_recuperacion WHERE token_hash = $1', [tokenHash]);
        if (!row)
            return null;
        return { id: row.id, usuarioId: row.usuario_id, expiraEn: (0, sql_1.toMs)(row.expira_en) ?? 0, usadoEn: row.usado_en ?? null };
    }
    async consumeResetToken(id) {
        return (await this.db.run('UPDATE tokens_recuperacion SET usado_en = now() WHERE id = $1 AND usado_en IS NULL', [id])) === 1;
    }
    async purgeExpiredResetTokens() {
        return this.db.run("DELETE FROM tokens_recuperacion WHERE expira_en < now() - interval '1 day' OR (usado_en IS NOT NULL AND usado_en < now() - interval '1 day')");
    }
    async deleteSessionsOfUser(userId) {
        return this.db.run('DELETE FROM sesiones WHERE usuario_id = $1', [userId]);
    }
};
exports.CredentialRepository = CredentialRepository;
exports.CredentialRepository = CredentialRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], CredentialRepository);
const AUDIT_SELECT = 'id, usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, creado_en';
/** Bitácora de solo inserción con HMAC encadenado. */
let AuditRepository = class AuditRepository {
    db;
    crypto;
    constructor(db, crypto) {
        this.db = db;
        this.crypto = crypto;
    }
    /**
     * Inserta un evento encadenado al anterior. El bloqueo consultivo serializa solo la
     * escritura de la bitácora (no las lecturas) para que dos instancias no rompan la cadena.
     */
    async append(event) {
        await this.db.transaction(async () => {
            await this.db.advisoryXactLock(db_service_1.LOCKS.AUDIT_CHAIN);
            const previous = (await this.db.scalar('SELECT hash FROM auditoria_eventos ORDER BY id DESC LIMIT 1')) ?? 'genesis';
            const creadoEn = new Date().toISOString().replace('T', ' ').slice(0, 19);
            const hash = this.crypto.auditChainHash(previous, { ...event, creadoEn });
            await this.db.run(`INSERT INTO auditoria_eventos (usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, ip_hash, creado_en, hash_anterior, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
                event.usuarioId,
                event.usuarioEmail,
                event.accion,
                event.recurso,
                event.recursoId,
                event.resultado,
                event.detalle,
                event.ipHash,
                creadoEn,
                previous,
                hash,
            ]);
        });
    }
    async list(f) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(f.page, f.pageSize);
        const q = (0, sql_1.likePattern)(f.q ?? '');
        const w = new sql_1.Where()
            .addIf(f.q, "detalle ILIKE ? ESCAPE '\\' OR usuario_email ILIKE ? ESCAPE '\\' OR recurso_id ILIKE ? ESCAPE '\\'", q, q, q)
            .addIf(f.usuarioId, 'usuario_id = ?', f.usuarioId)
            .addIf(f.accion, 'accion = ?', f.accion)
            .addIf(f.resultado, 'resultado = ?', f.resultado)
            .addIf(f.desde, 'creado_en >= ?::timestamptz', `${f.desde} 00:00:00`)
            .addIf(f.hasta, "creado_en < ?::timestamptz + interval '1 day'", `${f.hasta} 00:00:00`);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM auditoria_eventos ${w.sql}`, w.params);
        const items = await this.db.rows(`SELECT ${AUDIT_SELECT} FROM auditoria_eventos ${w.sql} ORDER BY id DESC LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items, total, page, pageSize };
    }
    /** Recorre la cadena por lotes (sin cargar toda la tabla) y devuelve el primer registro alterado. */
    async verifyChain(batch = 1000) {
        let previous = 'genesis';
        let lastId = 0;
        for (;;) {
            const rows = await this.db.query(`SELECT id, usuario_id, usuario_email, accion, recurso, recurso_id, resultado, detalle, ip_hash, creado_en, hash_anterior, hash
         FROM auditoria_eventos WHERE id > $1 ORDER BY id LIMIT $2`, [lastId, batch]);
            if (!rows.length)
                return null;
            for (const r of rows) {
                const row = {
                    usuarioId: r.usuario_id ?? null,
                    usuarioEmail: r.usuario_email ?? null,
                    accion: r.accion,
                    recurso: r.recurso ?? null,
                    recursoId: r.recurso_id ?? null,
                    resultado: r.resultado,
                    detalle: r.detalle ?? null,
                    ipHash: r.ip_hash ?? null,
                    creadoEn: r.creado_en,
                };
                if (r.hash_anterior !== previous || this.crypto.auditChainHash(previous, row) !== r.hash)
                    return { idAlterado: Number(r.id) };
                previous = r.hash;
                lastId = Number(r.id);
            }
        }
    }
};
exports.AuditRepository = AuditRepository;
exports.AuditRepository = AuditRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        crypto_service_1.CryptoService])
], AuditRepository);
//# sourceMappingURL=identity.repositories.js.map