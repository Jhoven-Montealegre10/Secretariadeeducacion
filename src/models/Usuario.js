'use strict';
const { db } = require('./db');
const { hashPassword, verifyPassword, DUMMY_HASH } = require('../services/crypto');

const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

const Usuario = {
  crear({ email, nombre, password, rol = 'admin' }) {
    const r = db.prepare('INSERT INTO usuarios (email, nombre, password_hash, rol) VALUES (?, ?, ?, ?)')
      .run(email, nombre, hashPassword(password), rol);
    return Number(r.lastInsertRowid);
  },

  porId(id) {
    return db.prepare('SELECT id, email, nombre, rol FROM usuarios WHERE id = ? AND activo = 1').get(id);
  },

  /**
   * Verifica credenciales. Devuelve { usuario } o { error }.
   * Bloquea la cuenta tras varios intentos fallidos y gasta el mismo tiempo
   * aunque el correo no exista (evita enumerar usuarios).
   */
  autenticar(email, password) {
    const u = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(String(email));
    if (!u || !u.activo) {
      verifyPassword(password, DUMMY_HASH);
      return { error: 'credenciales' };
    }
    if (u.bloqueado_hasta && u.bloqueado_hasta > Date.now()) return { error: 'bloqueado' };

    if (!verifyPassword(password, u.password_hash)) {
      const intentos = u.intentos_fallidos + 1;
      const bloqueo = intentos >= MAX_INTENTOS ? Date.now() + BLOQUEO_MS : null;
      db.prepare('UPDATE usuarios SET intentos_fallidos = ?, bloqueado_hasta = ? WHERE id = ?')
        .run(bloqueo ? 0 : intentos, bloqueo, u.id);
      return { error: bloqueo ? 'bloqueado' : 'credenciales' };
    }
    db.prepare(`UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = datetime('now') WHERE id = ?`).run(u.id);
    return { usuario: { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol } };
  },

  cambiarPassword(id, password) {
    return db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(hashPassword(password), id).changes;
  },
};

module.exports = Usuario;
