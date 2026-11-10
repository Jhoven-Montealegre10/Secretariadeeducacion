/**
 * PQRSD (datos personales cifrados) y estadísticas de visitas (sin datos personales).
 */
import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Db, LOCKS, PG, pgCode } from '../database/db.service';
import { clampPage, Where, type Page, type Row } from '../database/sql';
import { CryptoService } from '../security/crypto.service';

// ---------------------------------------------------------------- PQRSD

export interface PqrsdRecord {
  id: number;
  radicado: string;
  tipo: string;
  estado: string;
  tipoDocumento: string;
  documento: string;
  nombre: string;
  email: string;
  telefono: string;
  asunto: string;
  mensaje: string;
  respuesta: string;
  creadoEn: string;
  actualizadoEn: string;
}

export interface PqrsdInput {
  tipo: string;
  tipoDocumento: string;
  documento: string;
  nombre: string;
  email: string;
  telefono?: string;
  asunto: string;
  mensaje: string;
}

/**
 * Los datos personales se cifran ANTES de escribirse y se descifran solo en el servidor.
 * `documento_hash` es un índice ciego HMAC para la consulta ciudadana.
 */
@Injectable()
export class PqrsdRepository {
  constructor(
    private readonly db: Db,
    private readonly crypto: CryptoService,
  ) {}

  private decryptRow(row: Row | undefined): PqrsdRecord | null {
    if (!row) return null;
    const d = (v: unknown) => this.crypto.decrypt(v as string | null);
    return {
      id: row.id as number,
      radicado: row.radicado as string,
      tipo: row.tipo as string,
      estado: row.estado as string,
      tipoDocumento: row.tipo_documento as string,
      documento: d(row.documento_enc),
      nombre: d(row.nombre_enc),
      email: d(row.email_enc),
      telefono: d(row.telefono_enc),
      asunto: d(row.asunto_enc),
      mensaje: d(row.mensaje_enc),
      respuesta: d(row.respuesta_enc),
      creadoEn: row.creado_en as string,
      actualizadoEn: row.actualizado_en as string,
    };
  }

  private newRadicado(): string {
    return `SEM-${new Date().getFullYear()}-${String(crypto.randomInt(0, 1e8)).padStart(8, '0')}`;
  }

  async create(d: PqrsdInput): Promise<string> {
    const enc = (v: string | undefined) => this.crypto.encrypt(v);
    for (let i = 0; i < 5; i++) {
      const radicado = this.newRadicado();
      try {
        await this.db.run(
          `INSERT INTO pqrsd (radicado, tipo, tipo_documento, documento_hash, documento_enc, nombre_enc, email_enc, telefono_enc, asunto_enc, mensaje_enc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            radicado,
            d.tipo,
            d.tipoDocumento,
            this.crypto.blindIndex(d.documento),
            enc(d.documento),
            enc(d.nombre),
            enc(d.email),
            enc(d.telefono),
            enc(d.asunto),
            enc(d.mensaje),
          ],
        );
        return radicado;
      } catch (err) {
        if (pgCode(err) !== PG.UNIQUE_VIOLATION) throw err;
      }
    }
    throw new Error('No fue posible generar un radicado único');
  }

  /** Consulta ciudadana: exige radicado y documento; misma respuesta si cualquiera falla. */
  async findByRadicadoAndDocument(radicado: string, documento: string): Promise<PqrsdRecord | null> {
    const row = (await this.db.query('SELECT * FROM pqrsd WHERE radicado = $1', [radicado]))[0];
    if (!row || !this.crypto.safeEqual(row.documento_hash as string, this.crypto.blindIndex(documento))) return null;
    return this.decryptRow(row);
  }

  async list(f: { estado?: string; page?: number; pageSize?: number }): Promise<Page<PqrsdRecord>> {
    const { page, pageSize, offset } = clampPage(f.page, f.pageSize);
    const w = new Where().addIf(f.estado, 'estado = ?', f.estado);
    const total = await this.db.scalar<number>(`SELECT COUNT(*) FROM pqrsd ${w.sql}`, w.params);
    const rows = await this.db.query(`SELECT * FROM pqrsd ${w.sql} ORDER BY id DESC LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
    return { items: rows.map((r) => this.decryptRow(r) as PqrsdRecord), total, page, pageSize };
  }

  async findById(id: number): Promise<PqrsdRecord | null> {
    return this.decryptRow((await this.db.query('SELECT * FROM pqrsd WHERE id = $1', [id]))[0]);
  }

  async respond(id: number, estado: string, respuesta: string): Promise<number> {
    return this.db.run('UPDATE pqrsd SET estado = $1, respuesta_enc = $2, actualizado_en = now() WHERE id = $3', [estado, this.crypto.encrypt(respuesta), id]);
  }

  async countByStatus(): Promise<Array<{ estado: string; n: number }>> {
    return this.db.rows('SELECT estado, COUNT(*) AS n FROM pqrsd GROUP BY estado ORDER BY estado');
  }
}

// ---------------------------------------------------------------- Estadísticas

export interface VisitRow {
  fecha: string;
  ruta: string;
  visitante: string;
  fuente: string;
  referenteDominio: string | null;
  dispositivo: string;
  pais: string | null;
}

const GROUPABLE = { fuente: 'fuente', dispositivo: 'dispositivo', pais: 'pais', referenteDominio: 'referente_dominio' } as const;
export type StatsGroup = keyof typeof GROUPABLE;

@Injectable()
export class StatsRepository {
  constructor(private readonly db: Db) {}

  /** Sal aleatoria del día (compartida por todas las instancias); las anteriores se borran. */
  async saltFor(fecha: string): Promise<string> {
    const candidate = crypto.randomBytes(16).toString('hex');
    let sal = await this.db.scalar<string | undefined>(
      `WITH ins AS (INSERT INTO sales_estadisticas (fecha, sal) VALUES ($1, $2) ON CONFLICT (fecha) DO NOTHING RETURNING sal)
       SELECT sal FROM ins UNION ALL SELECT sal FROM sales_estadisticas WHERE fecha = $1 LIMIT 1`,
      [fecha, candidate],
    );
    // Si otra instancia insertó a la vez, la fila no es visible en la instantánea de esa sentencia.
    sal ??= await this.db.scalar<string>('SELECT sal FROM sales_estadisticas WHERE fecha = $1', [fecha]);
    await this.db.run('DELETE FROM sales_estadisticas WHERE fecha < $1', [fecha]);
    return sal;
  }

  /** Inserción por lotes en una sola sentencia (unnest), usada por el proceso en segundo plano. */
  async insertVisits(rows: VisitRow[]): Promise<number> {
    if (!rows.length) return 0;
    return this.db.run(
      `INSERT INTO visitas (fecha, ruta, visitante, fuente, referente_dominio, dispositivo, pais)
       SELECT * FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[])`,
      [
        rows.map((r) => r.fecha),
        rows.map((r) => r.ruta),
        rows.map((r) => r.visitante),
        rows.map((r) => r.fuente),
        rows.map((r) => r.referenteDominio),
        rows.map((r) => r.dispositivo),
        rows.map((r) => r.pais),
      ],
    );
  }

  /** Purga la retención; solo una instancia a la vez (bloqueo consultivo sin espera). */
  async purgeOlderThan(fecha: string): Promise<number> {
    return this.db.transaction(async () => {
      if (!(await this.db.tryAdvisoryXactLock(LOCKS.STATS_PURGE))) return 0;
      return this.db.run('DELETE FROM visitas WHERE fecha < $1', [fecha]);
    });
  }

  async summary(desde: string, hasta: string): Promise<{ visitas: number; visitantesUnicos: number }> {
    const row = await this.db.row<{ visitas: number; visitantesUnicos: number }>(
      `SELECT COUNT(*) AS visitas, COUNT(DISTINCT (fecha, visitante)) AS visitantes_unicos
       FROM visitas WHERE fecha BETWEEN $1 AND $2`,
      [desde, hasta],
    );
    return row ?? { visitas: 0, visitantesUnicos: 0 };
  }

  async byDay(desde: string, hasta: string): Promise<Array<{ fecha: string; visitas: number; visitantes: number }>> {
    return this.db.rows(
      `SELECT fecha, COUNT(*) AS visitas, COUNT(DISTINCT visitante) AS visitantes FROM visitas
       WHERE fecha BETWEEN $1 AND $2 GROUP BY fecha ORDER BY fecha`,
      [desde, hasta],
    );
  }

  async topPages(desde: string, hasta: string, limit = 10): Promise<Array<{ ruta: string; visitas: number }>> {
    return this.db.rows('SELECT ruta, COUNT(*) AS visitas FROM visitas WHERE fecha BETWEEN $1 AND $2 GROUP BY ruta ORDER BY visitas DESC, ruta LIMIT $3', [
      desde,
      hasta,
      limit,
    ]);
  }

  async groupBy(column: StatsGroup, desde: string, hasta: string, limit = 20): Promise<Array<{ valor: string; visitas: number }>> {
    if (!Object.hasOwn(GROUPABLE, column)) throw new Error('Agrupación no permitida');
    const col = GROUPABLE[column];
    return this.db.rows(
      `SELECT ${col} AS valor, COUNT(*) AS visitas FROM visitas WHERE fecha BETWEEN $1 AND $2 AND ${col} IS NOT NULL
       GROUP BY ${col} ORDER BY visitas DESC, valor LIMIT $3`,
      [desde, hasta, limit],
    );
  }
}
