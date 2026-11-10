'use strict';
/** Códigos de recuperación MFA y tokens de restablecimiento: solo se guardan sus hashes. */
const { db, toCamel } = require('../database/connection');

const credentialRepository = {
  replaceRecoveryCodes(userId, hashes) {
    db.prepare('DELETE FROM codigos_recuperacion WHERE usuario_id = ?').run(userId);
    const ins = db.prepare('INSERT INTO codigos_recuperacion (usuario_id, codigo_hash) VALUES (?, ?)');
    for (const h of hashes) ins.run(userId, h);
  },

  /** Marca el código como usado de forma atómica; devuelve true solo la primera vez. */
  consumeRecoveryCode(userId, hash) {
    return (
      db
        .prepare(
          `UPDATE codigos_recuperacion SET usado_en = datetime('now')
      WHERE usuario_id = ? AND codigo_hash = ? AND usado_en IS NULL`,
        )
        .run(userId, hash).changes === 1
    );
  },

  remainingRecoveryCodes(userId) {
    return db.prepare('SELECT COUNT(*) AS n FROM codigos_recuperacion WHERE usuario_id = ? AND usado_en IS NULL').get(userId).n;
  },

  createResetToken(userId, tokenHash, expiraEn) {
    db.prepare("UPDATE tokens_recuperacion SET usado_en = datetime('now') WHERE usuario_id = ? AND usado_en IS NULL").run(userId);
    db.prepare('INSERT INTO tokens_recuperacion (usuario_id, token_hash, expira_en) VALUES (?, ?, ?)').run(userId, tokenHash, expiraEn);
  },

  findResetToken(tokenHash) {
    return toCamel(db.prepare('SELECT id, usuario_id, expira_en, usado_en FROM tokens_recuperacion WHERE token_hash = ?').get(tokenHash));
  },

  consumeResetToken(id) {
    return db.prepare(`UPDATE tokens_recuperacion SET usado_en = datetime('now') WHERE id = ? AND usado_en IS NULL`).run(id).changes === 1;
  },

  purgeExpiredResetTokens(now = Date.now()) {
    return db.prepare('DELETE FROM tokens_recuperacion WHERE expira_en < ? OR usado_en IS NOT NULL').run(now - 24 * 3600 * 1000).changes;
  },

  deleteSessionsOfUser(userId) {
    return db.prepare('DELETE FROM sesiones WHERE usuario_id = ?').run(userId).changes;
  },
};

module.exports = credentialRepository;
