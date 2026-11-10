/** Fortaleza de contraseñas con zxcvbn-ts: diccionarios de contraseñas comunes y filtradas, sin servicios externos. */
import { Injectable } from '@nestjs/common';
import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';

const PROPIAS = ['ibague', 'ibagué', 'tolima', 'semibague', 'secretaria', 'educacion', 'educación', 'alcaldia', 'colombia', 'gobierno'];

@Injectable()
export class PasswordStrength {
  private readonly checker = new ZxcvbnFactory({ dictionary: { ...common.dictionary, userInputs: PROPIAS }, graphs: common.adjacencyGraphs });

  evaluate = (password: string, userInputs: string[] = []): { score: number } => {
    const result = this.checker.check(String(password).slice(0, 128), userInputs.map(String));
    return { score: result.score };
  };
}
