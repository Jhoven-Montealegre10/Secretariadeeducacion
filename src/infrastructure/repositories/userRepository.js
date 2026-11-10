'use strict';
const { db, toCamel, likePattern } = require('../database/connection');
const { orderBy, paginate, where } = require('../database/query');

const SELECT = `u.id, u.email, u.nombre, u.rol_id, r.slug AS rol_slug, r.nombre AS rol_nombre, u.activo, u.password_hash,
  u.intentos_fallidos, u.bloqueado_hasta, u.ultimo_acceso, u.mfa_secreto_enc, u.mfa_activo, u.mfa_ultimo_paso,
  u.mfa_intentos_fallidos, u.auth_version, u.password_actualizada_en, u.creado_en, u.actualizado_en`;
const FROM = 'usuarios u JOIN roles r ON r.id = u.rol_id';
const SORT = { nombre: 'u.nombre', email: 'u.email', creadoEn: 'u.creado_en', ultimoAcceso: 'u.ultimo_acceso' };

// Columnas editables por operación (evita asignación masiva).
const UPDATABLE = { nombre: 'nombre', email: 'email', rolId: 'rol_id', activo: 'activo' };

const userRepository = {
  findById(id) {
    return toCamel(db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE u.id = ?`).get(id));
  },

  findByEmail(email) {
    return toCamel(db.prepare(`SELECT ${SELECT} FROM ${FROM} WHERE u.email = ?`).get(String(email)));
  },

  list({ q, rolId, activo, page, pageSize, sort }) {
    const { whereSql, params } = where([
      q && ["u.nombre LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\'", likePattern(q), likePattern(q)],
      rolId && ['u.rol_id = ?', rolId],
      activo !== undefined && ['u.activo = ?', activo ? 1 : 0],
    ]);
    return paginate({ from: FROM, select: SELECT, whereSql, params, order: orderBy(sort, SORT, 'u.nombre ASC', 'u.id'), page, pageSize });
  },

  create({ email, nombre, passwordHash, rolId }) {
    return Number(
      db.prepare('INSERT INTO usuarios (email, nombre, password_hash, rol_id) VALUES (?, ?, ?, ?)').run(email, nombre, passwordHash, rolId).lastInsertRowid,
    );
  },

  update(id, fields) {
    const entries = Object.entries(fields).filter(([k, v]) => UPDATABLE[k] && v !== undefined);
    if (!entries.length) return 0;
    const sets = entries.map(([k]) => `${UPDATABLE[k]} = ?`).join(', ');
    const values = entries.map(([k, v]) => (k === 'activo' ? (v ? 1 : 0) : v));
    return db.prepare(`UPDATE usuarios SET ${sets}, actualizado_en = datetime('now') WHERE id = ?`).run(...values, id).changes;
  },

  delete(id) {
    return db.prepare('DELETE FROM usuarios WHERE id = ?').run(id).changes;
  },

  /** Administradores activos (rol del sistema), opcionalmente excluyendo uno. */
  countActiveAdmins(excludeId = 0) {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${FROM} WHERE r.slug = 'administrador' AND u.activo = 1 AND u.id <> ?`).get(excludeId).n;
  },

  countByRole(rolId) {
    return db.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE rol_id = ?').get(rolId).n;
  },

  /** Invalida todas las sesiones del usuario: la versión guardada en cada sesión deja de coincidir. */
  bumpAuthVersion(id) {
    db.prepare('UPDATE usuarios SET auth_version = auth_version + 1 WHERE id = ?').run(id);
    return db.prepare('SELECT auth_version FROM usuarios WHERE id = ?').get(id)?.auth_version;
  },

  bumpAuthVersionForRole(rolId) {
    return db.prepare('UPDATE usuarios SET auth_version = auth_version + 1 WHERE rol_id = ?').run(rolId).changes;
  },

  setPasswordHash(id, passwordHash, { rotateSessions = true } = {}) {
    db.prepare(
      `UPDATE usuarios SET password_hash = ?, password_actualizada_en = datetime('now'),
      auth_version = auth_version + ?, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
    ).run(passwordHash, rotateSessions ? 1 : 0, id);
  },

  recordLoginFailure(id, intentos, bloqueadoHasta) {
    db.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?').run(intentos, bloqueadoHasta, id);
  },

  recordLoginSuccess(id) {
    db.prepare(
      `UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, mfa_intentos_fallidos = 0, ultimo_acceso = datetime('now') WHERE id = ?`,
    ).run(id);
  },

  setMfa(id, { secretoEnc, activo }) {
    db.prepare(
      `UPDATE usuarios SET mfa_secreto_enc = ?, mfa_activo = ?, mfa_ultimo_paso = 0, mfa_intentos_fallidos = 0,
      auth_version = auth_version + 1 WHERE id = ?`,
    ).run(secretoEnc, activo ? 1 : 0, id);
  },

  /** Guarda el último paso TOTP usado solo si es mayor que el anterior (anti-reutilización atómica). */
  consumeTotpStep(id, step) {
    return (
      db.prepare('UPDATE usuarios SET mfa_ultimo_paso = ?, mfa_intentos_fallidos = 0 WHERE id = ? AND mfa_ultimo_paso < ?').run(step, id, step).changes === 1
    );
  },

  recordMfaFailure(id, intentos, bloqueadoHasta) {
    db.prepare('UPDATE usuarios SET mfa_intentos_fallidos = ?, bloqueado_hasta = COALESCE(?, bloqueado_hasta) WHERE id = ?').run(intentos, bloqueadoHasta, id);
  },
};

module.exports = userRepository;
