'use strict';
/**
 * Política de contraseñas (OWASP ASVS V2.1): mínimo 12 caracteres, se permiten frases largas
 * (hasta 128), cualquier carácter Unicode y espacios; sin reglas de composición arbitrarias.
 * Se rechazan contraseñas comunes, filtradas o derivadas de datos del usuario.
 * El evaluador de fortaleza se inyecta (infraestructura) para no acoplar el dominio a la biblioteca.
 */
const MIN = 12;
const MAX = 128;
const MIN_SCORE = 3;

function validarPassword(password, { evaluar, datosUsuario = [] }) {
  const value = String(password ?? '');
  if (value.length < MIN) return `La contraseña debe tener al menos ${MIN} caracteres.`;
  if (value.length > MAX) return `La contraseña admite máximo ${MAX} caracteres.`;
  const { score } = evaluar(value, datosUsuario);
  if (score < MIN_SCORE) {
    return 'La contraseña es demasiado común o fácil de adivinar. Use una frase larga con palabras poco relacionadas.';
  }
  return null;
}

module.exports = { validarPassword, MIN, MAX };
