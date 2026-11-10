/**
 * Política de contraseñas (OWASP ASVS V2.1): 12–128 caracteres, frases largas permitidas,
 * sin reglas de composición arbitrarias; se rechazan contraseñas comunes o derivadas de los
 * datos del usuario. El evaluador de fortaleza se inyecta para no acoplar el dominio a la biblioteca.
 */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const MIN_SCORE = 3;

export type StrengthEvaluator = (password: string, userInputs: string[]) => { score: number };

export function validarPassword(password: unknown, evaluar: StrengthEvaluator, datosUsuario: Array<string | undefined> = []): string | null {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (value.length > PASSWORD_MAX) return `La contraseña admite máximo ${PASSWORD_MAX} caracteres.`;
  const { score } = evaluar(value, datosUsuario.filter((d): d is string => !!d));
  if (score < MIN_SCORE) return 'La contraseña es demasiado común o fácil de adivinar. Use una frase larga con palabras poco relacionadas.';
  return null;
}
