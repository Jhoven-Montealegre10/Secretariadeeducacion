'use strict';
/** Almacén de sesiones en SQLite (las sesiones nunca viajan al navegador; solo un ID firmado). */
const session = require('express-session');
const { db } = require('../models/db');

class SqliteStore extends session.Store {
  constructor(ttlMs) {
    super();
    this.ttlMs = ttlMs;
    this.getStmt = db.prepare('SELECT data FROM sesiones WHERE sid = ? AND expira > ?');
    this.setStmt = db.prepare('INSERT INTO sesiones (sid, data, expira) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET data = excluded.data, expira = excluded.expira');
    this.delStmt = db.prepare('DELETE FROM sesiones WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sesiones SET expira = ? WHERE sid = ?');
    this.cleanStmt = db.prepare('DELETE FROM sesiones WHERE expira <= ?');
    this.timer = setInterval(() => this.cleanStmt.run(Date.now()), 15 * 60 * 1000);
    this.timer.unref();
  }

  _expira(sess) {
    return sess?.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + this.ttlMs;
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.data) : null);
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try { this.setStmt.run(sid, JSON.stringify(sess), this._expira(sess)); cb?.(null); } catch (e) { cb?.(e); }
  }

  destroy(sid, cb) {
    try { this.delStmt.run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }

  touch(sid, sess, cb) {
    try { this.touchStmt.run(this._expira(sess), sid); cb?.(null); } catch (e) { cb?.(e); }
  }
}

module.exports = SqliteStore;
