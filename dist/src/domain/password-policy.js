"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PASSWORD_MAX = exports.PASSWORD_MIN = void 0;
exports.validarPassword = validarPassword;
/**
 * Política de contraseñas (OWASP ASVS V2.1): 12–128 caracteres, frases largas permitidas,
 * sin reglas de composición arbitrarias; se rechazan contraseñas comunes o derivadas de los
 * datos del usuario. El evaluador de fortaleza se inyecta para no acoplar el dominio a la biblioteca.
 */
exports.PASSWORD_MIN = 12;
exports.PASSWORD_MAX = 128;
const MIN_SCORE = 3;
function validarPassword(password, evaluar, datosUsuario = []) {
    const value = String(password ?? '');
    if (value.length < exports.PASSWORD_MIN)
        return `La contraseña debe tener al menos ${exports.PASSWORD_MIN} caracteres.`;
    if (value.length > exports.PASSWORD_MAX)
        return `La contraseña admite máximo ${exports.PASSWORD_MAX} caracteres.`;
    const { score } = evaluar(value, datosUsuario.filter((d) => !!d));
    if (score < MIN_SCORE)
        return 'La contraseña es demasiado común o fácil de adivinar. Use una frase larga con palabras poco relacionadas.';
    return null;
}
//# sourceMappingURL=password-policy.js.map