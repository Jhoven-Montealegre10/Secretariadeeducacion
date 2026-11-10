'use strict';
/**
 * Evaluación de contraseñas con zxcvbn-ts: detecta contraseñas comunes, filtradas en
 * listas públicas, patrones de teclado, fechas y repeticiones (diccionarios incluidos en
 * @zxcvbn-ts/language-common). No consulta servicios externos.
 */
const { ZxcvbnFactory } = require('@zxcvbn-ts/core');
const common = require('@zxcvbn-ts/language-common');

const PROPIAS = ['ibague', 'ibagué', 'tolima', 'semibague', 'secretaria', 'educacion', 'educación', 'alcaldia', 'colombia', 'gobierno'];
const checker = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, userInputs: PROPIAS },
  graphs: common.adjacencyGraphs,
});

/** score 0–4. userInputs: datos del usuario (correo, nombre) que no deben formar la contraseña. */
function evaluate(password, userInputs = []) {
  const result = checker.check(String(password).slice(0, 128), userInputs.filter(Boolean).map(String));
  return { score: result.score, warning: result.feedback.warning || '' };
}

module.exports = { evaluate };
