import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contadores de límites de peticiones compartidos entre instancias (login, MFA, recuperación,
 * cargas, PQRSD). UNLOGGED: datos efímeros; si el servidor se reinicia, los contadores empiezan de cero.
 * La clave es un HMAC de la IP: no se guardan direcciones IP.
 */
export class LimitesTasa1762800000003 implements MigrationInterface {
  name = 'LimitesTasa1762800000003';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE UNLOGGED TABLE "portal"."limites_tasa" (
      "clave" text PRIMARY KEY,
      "conteo" integer NOT NULL,
      "reinicia_en" timestamptz NOT NULL)`);
    await q.query(`CREATE INDEX "ix_limites_tasa_reinicia" ON "portal"."limites_tasa" ("reinicia_en")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "portal"."limites_tasa"`);
  }
}
