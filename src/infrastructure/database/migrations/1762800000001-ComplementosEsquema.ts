import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elementos que TypeORM no genera desde las entidades:
 *  - correo único sin distinguir mayúsculas;
 *  - índices de trigramas (pg_trgm) para las búsquedas ILIKE del panel y del sitio;
 *  - índices en claves foráneas usadas en borrados en cascada y en uniones;
 *  - bitácora de auditoría de solo inserción (triggers + permisos de la aplicación).
 */
export class ComplementosEsquema1762800000001 implements MigrationInterface {
  name = 'ComplementosEsquema1762800000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA portal`);
    await q.query(`CREATE UNIQUE INDEX "ux_usuarios_email" ON "portal"."usuarios" (lower(email))`);
    await q.query(`CREATE INDEX "ix_noticias_titulo_trgm" ON "portal"."noticias" USING gin (titulo portal.gin_trgm_ops)`);
    await q.query(`CREATE INDEX "ix_noticias_resumen_trgm" ON "portal"."noticias" USING gin (resumen portal.gin_trgm_ops)`);
    await q.query(`CREATE INDEX "ix_medios_nombre_trgm" ON "portal"."medios" USING gin (nombre_visible portal.gin_trgm_ops)`);
    await q.query(`CREATE INDEX "ix_paginas_titulo_trgm" ON "portal"."paginas" USING gin (titulo portal.gin_trgm_ops)`);
    await q.query(`CREATE INDEX "ix_medios_usos_publicado" ON "portal"."medios_usos" (medio_id) WHERE publicado`);
    await q.query(`CREATE INDEX "ix_noticia_fotos_medio" ON "portal"."noticia_fotos" (medio_id)`);
    await q.query(`CREATE INDEX "ix_noticias_imagen" ON "portal"."noticias" (imagen_id)`);
    await q.query(`CREATE INDEX "ix_diapositivas_medio" ON "portal"."diapositivas" (medio_id)`);
    await q.query(`CREATE FUNCTION portal.auditoria_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'La bitácora de auditoría no se puede modificar ni eliminar'; END $$`);
    await q.query(
      `CREATE TRIGGER auditoria_sin_cambios BEFORE UPDATE OR DELETE ON "portal"."auditoria_eventos" FOR EACH ROW EXECUTE FUNCTION portal.auditoria_inmutable()`,
    );
    await q.query(
      `CREATE TRIGGER auditoria_sin_truncate BEFORE TRUNCATE ON "portal"."auditoria_eventos" FOR EACH STATEMENT EXECUTE FUNCTION portal.auditoria_inmutable()`,
    );
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'semibague_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON "portal"."auditoria_eventos" FROM semibague_app;
      END IF; END $$`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS auditoria_sin_truncate ON "portal"."auditoria_eventos"`);
    await q.query(`DROP TRIGGER IF EXISTS auditoria_sin_cambios ON "portal"."auditoria_eventos"`);
    await q.query(`DROP FUNCTION IF EXISTS portal.auditoria_inmutable()`);
    for (const ix of [
      'ix_diapositivas_medio',
      'ix_noticias_imagen',
      'ix_noticia_fotos_medio',
      'ix_medios_usos_publicado',
      'ix_paginas_titulo_trgm',
      'ix_medios_nombre_trgm',
      'ix_noticias_resumen_trgm',
      'ix_noticias_titulo_trgm',
      'ux_usuarios_email',
    ]) {
      await q.query(`DROP INDEX IF EXISTS "portal"."${ix}"`);
    }
  }
}
