'use strict';
/**
 * Almacén de sesiones en SQLite: el navegador solo recibe un ID firmado; los datos viven en
 * el servidor. Guarda el usuario de cada sesión para poder revocarlas todas a la vez.
 */
const session = require('express-session');
const { db } = require('../database/connection');

class SqliteSessionStore extends session.Store {
  constructor(ttlMs) {
    super();
    this.ttlMs = ttlMs;
    this.getStmt = db.prepare('SELECT data FROM sesiones WHERE sid = ? AND expira > ?');
    this.setStmt = db.prepare(`INSERT INTO sesiones (sid, data, expira, usuario_id) VALUES (?, ?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expira = excluded.expira, usuario_id = excluded.usuario_id`);
    this.delStmt = db.prepare('DELETE FROM sesiones WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sesiones SET expira = ? WHERE sid = ?');
    this.cleanStmt = db.prepare('DELETE FROM sesiones WHERE expira <= ?');
    this.timer = setInterval(() => this.cleanStmt.run(Date.now()), 15 * 60 * 1000);
    this.timer.unref();
  }

  expiresAt(sess) {
    return sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      cb(null, row ? JSON.parse(String(row.data)) : null);
    } catch (e) {
      cb(e);
    }
  }

  set(sid, sess, cb) {
    try {
      this.setStmt.run(sid, JSON.stringify(sess), this.expiresAt(sess), sess?.auth?.userId ?? sess?.pending?.userId ?? null);
      cb?.(null);
    } catch (e) {
      cb?.(e);
    }
  }

  destroy(sid, cb) {
    try {
      this.delStmt.run(sid);
      cb?.(null);
    } catch (e) {
      cb?.(e);
    }
  }

  touch(sid, sess, cb) {
    try {
      this.touchStmt.run(this.expiresAt(sess), sid);
      cb?.(null);
    } catch (e) {
      cb?.(e);
    }
  }
}

module.exports = SqliteSessionStore;
