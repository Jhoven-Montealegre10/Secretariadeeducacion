/**
 * Utilidades SQL compartidas por los repositorios.
 * REGLA: todo valor del usuario viaja como parámetro ($1, $2…). Los nombres de columna para
 * ordenar o agrupar salen SIEMPRE de listas blancas; nunca se concatena texto del usuario.
 */

export type Row = Record<string, unknown>;

/** Página de resultados con el total para la paginación. */
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Escapa los comodines de ILIKE para buscar el texto del usuario de forma literal. */
export function likePattern(text: string): string {
  return '%' + String(text).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}

/** snake_case → camelCase para las filas devueltas por PostgreSQL. */
export function toCamel<T = Row>(row: Row | undefined | null): T | null {
  if (!row) return null;
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) out[key.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase())] = value;
  return out as T;
}

export const mapRows = <T>(rows: Row[]): T[] => rows.map((r) => toCamel<T>(r) as T);

/** Marca temporal 'AAAA-MM-DD HH:MM:SS' (UTC, formato de la API v1) → milisegundos. */
export function toMs(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.getTime();
  const ms = Date.parse(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** Milisegundos → Date para parámetros timestamptz. */
export const fromMs = (ms: number | null | undefined): Date | null => (ms === null || ms === undefined ? null : new Date(ms));

/**
 * Constructor de cláusulas WHERE con parámetros numerados.
 *   const w = new Where(); w.add('u.rol_id = ?', rolId); w.sql → 'WHERE (u.rol_id = $1)'
 * Cada "?" del fragmento se reemplaza por el siguiente marcador; los valores se acumulan en params.
 */
export class Where {
  readonly params: unknown[] = [];
  private readonly parts: string[] = [];

  /** Agrega una condición solo si `when` es verdadero. */
  addIf(when: unknown, fragment: string, ...values: unknown[]): this {
    return when ? this.add(fragment, ...values) : this;
  }

  add(fragment: string, ...values: unknown[]): this {
    let i = 0;
    const sql = fragment.replace(/\?/g, () => {
      if (i >= values.length) throw new Error('Faltan valores para los marcadores de la consulta');
      this.params.push(values[i++]);
      return `$${this.params.length}`;
    });
    if (i !== values.length) throw new Error('Sobran valores para los marcadores de la consulta');
    this.parts.push(`(${sql})`);
    return this;
  }

  /** Siguiente marcador libre (para LIMIT/OFFSET u otros valores tras el WHERE). */
  next(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  get sql(): string {
    return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
  }
}

/**
 * Convierte `sort` (p. ej. "-fechaPublicacion") en ORDER BY usando una lista blanca.
 * Siempre agrega el id como desempate para que la paginación sea estable.
 */
export function orderBy(sort: string | undefined, allowed: Readonly<Record<string, string>>, fallback: string, idColumn = 'id'): string {
  const desc = typeof sort === 'string' && sort.startsWith('-');
  const key = typeof sort === 'string' ? sort.replace(/^-/, '') : '';
  const column = Object.hasOwn(allowed, key) ? allowed[key] : undefined;
  if (!column) return `ORDER BY ${fallback}`;
  return `ORDER BY ${column} ${desc ? 'DESC' : 'ASC'}, ${idColumn} DESC`;
}

/** Límites de paginación del servidor: el cliente nunca pide más de MAX_PAGE_SIZE filas. */
export const MAX_PAGE_SIZE = 100;
export function clampPage(page?: number, pageSize?: number, defaultSize = 20): { page: number; pageSize: number; offset: number } {
  const p = Number.isInteger(page) && (page as number) > 0 ? Math.min(page as number, 10_000) : 1;
  const s = Number.isInteger(pageSize) && (pageSize as number) > 0 ? Math.min(pageSize as number, MAX_PAGE_SIZE) : defaultSize;
  return { page: p, pageSize: s, offset: (p - 1) * s };
}
