"use strict";
/**
 * Utilidades SQL compartidas por los repositorios.
 * REGLA: todo valor del usuario viaja como parámetro ($1, $2…). Los nombres de columna para
 * ordenar o agrupar salen SIEMPRE de listas blancas; nunca se concatena texto del usuario.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PAGE_SIZE = exports.Where = exports.fromMs = exports.mapRows = void 0;
exports.likePattern = likePattern;
exports.toCamel = toCamel;
exports.toMs = toMs;
exports.orderBy = orderBy;
exports.clampPage = clampPage;
/** Escapa los comodines de ILIKE para buscar el texto del usuario de forma literal. */
function likePattern(text) {
    return '%' + String(text).replace(/[\\%_]/g, (c) => '\\' + c) + '%';
}
/** snake_case → camelCase para las filas devueltas por PostgreSQL. */
function toCamel(row) {
    if (!row)
        return null;
    const out = {};
    for (const [key, value] of Object.entries(row))
        out[key.replace(/_([a-z])/g, (_m, c) => c.toUpperCase())] = value;
    return out;
}
const mapRows = (rows) => rows.map((r) => toCamel(r));
exports.mapRows = mapRows;
/** Marca temporal 'AAAA-MM-DD HH:MM:SS' (UTC, formato de la API v1) → milisegundos. */
function toMs(value) {
    if (value === null || value === undefined || value === '')
        return null;
    if (value instanceof Date)
        return value.getTime();
    const ms = Date.parse(`${String(value).replace(' ', 'T')}Z`);
    return Number.isNaN(ms) ? null : ms;
}
/** Milisegundos → Date para parámetros timestamptz. */
const fromMs = (ms) => (ms === null || ms === undefined ? null : new Date(ms));
exports.fromMs = fromMs;
/**
 * Constructor de cláusulas WHERE con parámetros numerados.
 *   const w = new Where(); w.add('u.rol_id = ?', rolId); w.sql → 'WHERE (u.rol_id = $1)'
 * Cada "?" del fragmento se reemplaza por el siguiente marcador; los valores se acumulan en params.
 */
class Where {
    params = [];
    parts = [];
    /** Agrega una condición solo si `when` es verdadero. */
    addIf(when, fragment, ...values) {
        return when ? this.add(fragment, ...values) : this;
    }
    add(fragment, ...values) {
        let i = 0;
        const sql = fragment.replace(/\?/g, () => {
            if (i >= values.length)
                throw new Error('Faltan valores para los marcadores de la consulta');
            this.params.push(values[i++]);
            return `$${this.params.length}`;
        });
        if (i !== values.length)
            throw new Error('Sobran valores para los marcadores de la consulta');
        this.parts.push(`(${sql})`);
        return this;
    }
    /** Siguiente marcador libre (para LIMIT/OFFSET u otros valores tras el WHERE). */
    next(value) {
        this.params.push(value);
        return `$${this.params.length}`;
    }
    get sql() {
        return this.parts.length ? `WHERE ${this.parts.join(' AND ')}` : '';
    }
}
exports.Where = Where;
/**
 * Convierte `sort` (p. ej. "-fechaPublicacion") en ORDER BY usando una lista blanca.
 * Siempre agrega el id como desempate para que la paginación sea estable.
 */
function orderBy(sort, allowed, fallback, idColumn = 'id') {
    const desc = typeof sort === 'string' && sort.startsWith('-');
    const key = typeof sort === 'string' ? sort.replace(/^-/, '') : '';
    const column = Object.hasOwn(allowed, key) ? allowed[key] : undefined;
    if (!column)
        return `ORDER BY ${fallback}`;
    return `ORDER BY ${column} ${desc ? 'DESC' : 'ASC'}, ${idColumn} DESC`;
}
/** Límites de paginación del servidor: el cliente nunca pide más de MAX_PAGE_SIZE filas. */
exports.MAX_PAGE_SIZE = 100;
function clampPage(page, pageSize, defaultSize = 20) {
    const p = Number.isInteger(page) && page > 0 ? Math.min(page, 10_000) : 1;
    const s = Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, exports.MAX_PAGE_SIZE) : defaultSize;
    return { page: p, pageSize: s, offset: (p - 1) * s };
}
//# sourceMappingURL=sql.js.map