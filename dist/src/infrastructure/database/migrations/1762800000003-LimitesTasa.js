"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LimitesTasa1762800000003 = void 0;
/**
 * Contadores de límites de peticiones compartidos entre instancias (login, MFA, recuperación,
 * cargas, PQRSD). UNLOGGED: datos efímeros; si el servidor se reinicia, los contadores empiezan de cero.
 * La clave es un HMAC de la IP: no se guardan direcciones IP.
 */
class LimitesTasa1762800000003 {
    name = 'LimitesTasa1762800000003';
    async up(q) {
        await q.query(`CREATE UNLOGGED TABLE "portal"."limites_tasa" (
      "clave" text PRIMARY KEY,
      "conteo" integer NOT NULL,
      "reinicia_en" timestamptz NOT NULL)`);
        await q.query(`CREATE INDEX "ix_limites_tasa_reinicia" ON "portal"."limites_tasa" ("reinicia_en")`);
    }
    async down(q) {
        await q.query(`DROP TABLE "portal"."limites_tasa"`);
    }
}
exports.LimitesTasa1762800000003 = LimitesTasa1762800000003;
//# sourceMappingURL=1762800000003-LimitesTasa.js.map