/**
 * Política de contraseñas (OWASP ASVS V2.1): 12–128 caracteres, frases largas permitidas,
 * sin reglas de composición arbitrarias; se rechazan contraseñas comunes o derivadas de los
 * datos del usuario. El evaluador de fortaleza se inyecta para no acoplar el dominio a la biblioteca.
 */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
const MIN_SCORE = 3;

/** Palabras de la entidad: una contraseña hecha solo de ellas es fácil de adivinar para un atacante dirigido. */
export const PALABRAS_INSTITUCIONALES = [
  'secretaria de educacion municipal',
  'alcaldia de ibague tolima',
  'semibague portal gobierno colombia',
  'administrador administradora editor editora usuario contraseña clave panel',
];

export type StrengthEvaluator = (password: string, userInputs: string[]) => { score: number };

export function validarPassword(password: unknown, evaluar: StrengthEvaluator, datosUsuario: Array<string | undefined> = []): string | null {
  const value = String(password ?? '');
  if (value.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
  if (value.length > PASSWORD_MAX) return `La contraseña admite máximo ${PASSWORD_MAX} caracteres.`;
  const datos = datosUsuario.filter((d): d is string => !!d);
  if (derivadaDeDatos(value, [...datos, ...PALABRAS_INSTITUCIONALES]))
    return 'La contraseña no puede basarse en su nombre, su correo ni en el nombre de la entidad. Use una frase propia.';
  const { score } = evaluar(value, datos);
  if (score < MIN_SCORE) return 'La contraseña es demasiado común o fácil de adivinar. Use una frase larga con palabras poco relacionadas.';
  return null;
}

const plano = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

/** true si, al quitar las palabras del nombre/correo y los dígitos, casi no queda nada propio. */
export function derivadaDeDatos(password: string, datosUsuario: readonly string[]): boolean {
  const palabras = datosUsuario
    .flatMap((d) => d.split(/[^a-zA-Z0-9áéíóúñüÁÉÍÓÚÑÜ]+/))
    .map(plano)
    .filter((w) => w.length >= 2)
    .sort((a, b) => b.length - a.length);
  if (!palabras.length) return false;
  let resto = plano(password);
  for (const w of palabras) resto = resto.split(w).join('');
  return resto.replace(/\d/g, '').length < 4;
}
