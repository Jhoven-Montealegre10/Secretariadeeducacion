"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgSessionStore = void 0;
/**
 * Almacén de sesiones en PostgreSQL. El navegador solo recibe un ID firmado; los datos viven
 * en el servidor y se comparten entre instancias.
 *  - La clave guardada es un HMAC del ID (si alguien leyera la tabla no podría usar las sesiones).
 *  - Se guarda el usuario de cada sesión para poder revocarlas todas a la vez.
 *  - Las sesiones vencidas se borran periódicamente (una instancia a la vez).
 */
const express_session_1 = __importDefault(require("express-session"));
const db_service_1 = require("../database/db.service");
class PgSessionStore extends express_session_1.default.Store {
    db;
    crypto;
    ttlMs;
    timer;
    constructor(db, crypto, ttlMs) {
        super();
        this.db = db;
        this.crypto = crypto;
        this.ttlMs = ttlMs;
        this.timer = setInterval(() => void this.purge().catch(() => undefined), 15 * 60 * 1000);
        this.timer.unref();
    }
    close() {
        clearInterval(this.timer);
    }
    key(sid) {
        return this.crypto.tokenHash(`session:${sid}`);
    }
    expiresAt(sess) {
        const expires = sess?.cookie?.expires;
        return expires ? new Date(expires) : new Date(Date.now() + this.ttlMs);
    }
    async purge() {
        return this.db.transaction(async () => {
            if (!(await this.db.tryAdvisoryXactLock(db_service_1.LOCKS.SESSION_PURGE)))
                return 0;
            return this.db.run('DELETE FROM sesiones WHERE expira <= now()');
        });
    }
    get(sid, cb) {
        this.db
            .one('SELECT data FROM sesiones WHERE sid = $1 AND expira > now()', [this.key(sid)])
            .then((row) => cb(null, row ? row.data : null))
            .catch((err) => cb(err));
    }
    set(sid, sess, cb) {
        const userId = sess?.auth?.userId ?? sess?.pending?.userId ?? null;
        this.db
            .run(`INSERT INTO sesiones (sid, data, expira, usuario_id) VALUES ($1, $2::jsonb, $3, $4)
         ON CONFLICT (sid) DO UPDATE SET data = EXCLUDED.data, expira = EXCLUDED.expira, usuario_id = EXCLUDED.usuario_id`, [this.key(sid), JSON.stringify(sess), this.expiresAt(sess), userId])
            .then(() => cb?.())
            .catch((err) => cb?.(err));
    }
    destroy(sid, cb) {
        this.db
            .run('DELETE FROM sesiones WHERE sid = $1', [this.key(sid)])
            .then(() => cb?.())
            .catch((err) => cb?.(err));
    }
    touch(sid, sess, cb) {
        this.db
            .run('UPDATE sesiones SET expira = $1 WHERE sid = $2', [this.expiresAt(sess), this.key(sid)])
            .then(() => cb?.())
            .catch(() => cb?.());
    }
}
exports.PgSessionStore = PgSessionStore;
//# sourceMappingURL=pg-session.store.js.map