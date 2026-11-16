/**
 * Fortaleza de contraseñas con zxcvbn-ts: diccionarios comunes y en español (palabras, nombres,
 * apellidos), términos institucionales y los datos del propio usuario. Sin servicios externos.
 */
import { Injectable } from '@nestjs/common';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as es from '@zxcvbn-ts/language-es-es';

const PROPIAS = [
  'ibague',
  'ibagué',
  'tolima',
  'semibague',
  'secretaria',
  'educacion',
  'educación',
  'alcaldia',
  'colombia',
  'gobierno',
  'contraseña',
  'contrasena',
  'clave',
  'administrador',
  'administradora',
  'editor',
  'editora',
  'usuario',
  'portal',
  'panel',
];

/** Separa nombre y correo en palabras (también sin espacios) para que no sirvan como contraseña. */
export function datosPersonales(inputs: string[]): string[] {
  const out = new Set<string>();
  for (const raw of inputs) {
    const v = String(raw).toLowerCase().trim();
    if (!v) continue;
    out.add(v);
    const words = v.split(/[^a-z0-9áéíóúñü]+/i).filter((w) => w.length >= 2);
    words.forEach((w) => out.add(w));
    if (words.length > 1) out.add(words.join(''));
  }
  return [...out];
}

@Injectable()
export class PasswordStrength {
  private readonly checker = new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...es.dictionary, userInputs: PROPIAS },
    graphs: common.adjacencyGraphs,
  });

  evaluate = (password: string, userInputs: string[] = []): { score: number } => {
    // Las palabras institucionales se pasan siempre: los datos del usuario no las reemplazan.
    const result = this.checker.check(String(password).slice(0, 128), [...PROPIAS, ...datosPersonales(userInputs)]);
    return { score: result.score };
  };
}
