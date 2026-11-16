import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rotación de claves: cada evento de auditoría guarda el identificador de la clave del llavero con que se
 * firmó su HMAC encadenado. Los eventos anteriores quedan con NULL y se verifican con las claves del llavero.
 * Solo se agrega una columna: los eventos existentes no se modifican (la bitácora sigue siendo inmutable).
 */
export class ClaveAuditoria1762800000004 implements MigrationInterface {
  name = 'ClaveAuditoria1762800000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "portal"."auditoria_eventos" ADD "clave_id" text`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "portal"."auditoria_eventos" DROP COLUMN "clave_id"`);
  }
}
