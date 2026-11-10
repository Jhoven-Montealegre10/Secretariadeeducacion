'use strict';
/**
 * Validación y normalización de entradas del usuario (lista blanca).
 * Cada regla limpia el valor y devuelve un mensaje de error si no es válido.
 */
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}$/;
// Quita caracteres de control (salvo saltos de línea y tabulación).
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function clean(v) {
  return typeof v === 'string' ? v.replace(CTRL_RE, '').trim() : '';
}

const rules = {
  text: ({ min = 1, max = 200 } = {}) => (v, label) => {
    const s = clean(v);
    if (s.length < min) return [s, min === 1 ? `${label} es obligatorio.` : `${label} debe tener al menos ${min} caracteres.`];
    if (s.length > max) return [s, `${label} admite máximo ${max} caracteres.`];
    return [s];
  },
  optionalText: ({ max = 200 } = {}) => (v, label) => {
    const s = clean(v);
    return s.length > max ? [s, `${label} admite máximo ${max} caracteres.`] : [s];
  },
  email: () => (v, label) => {
    const s = clean(v).toLowerCase();
    return EMAIL_RE.test(s) && s.length <= 254 ? [s] : [s, `${label} no es un correo válido.`];
  },
  oneOf: (list) => (v, label) => {
    const s = clean(v);
    return list.includes(s) ? [s] : [s, `Seleccione una opción válida en ${label}.`];
  },
  pattern: (re, msg) => (v, label) => {
    const s = clean(v);
    return re.test(s) ? [s] : [s, `${label} ${msg}`];
  },
  date: () => (v, label) => {
    const s = clean(v);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? [s] : [s, `${label} debe ser una fecha válida.`];
  },
  int: ({ min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => (v, label) => {
    const s = clean(String(v ?? ''));
    const n = Number(s);
    return /^\d+$/.test(s) && n >= min && n <= max ? [n] : [s, `${label} debe ser un número entre ${min} y ${max}.`];
  },
  checkbox: ({ required = false } = {}) => (v, label) => {
    const on = v === 'on' || v === '1' || v === 'true';
    return required && !on ? [on, `Debe aceptar ${label}.`] : [on];
  },
};

/**
 * schema: { campo: [regla, 'Etiqueta'] }
 * Devuelve { data, errors } con solo los campos del esquema (ignora campos extra).
 */
function validate(input, schema) {
  const data = {};
  const errors = {};
  for (const [field, [rule, label]] of Object.entries(schema)) {
    const [value, error] = rule(input?.[field], label);
    data[field] = value;
    if (error) errors[field] = error;
  }
  return { data, errors, ok: Object.keys(errors).length === 0 };
}

/** Parámetro de ruta entero positivo, o null. Evita que lleguen valores raros a las consultas. */
function parseId(v) {
  return /^\d{1,10}$/.test(String(v)) ? Number(v) : null;
}

module.exports = { rules, validate, parseId, clean };
