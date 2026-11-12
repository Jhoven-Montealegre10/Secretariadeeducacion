/** Reloj inyectable: permite probar expiraciones y bloqueos sin esperar. */
export interface Clock {
  now(): number;
}

export const CLOCK = Symbol('CLOCK');
export const systemClock: Clock = { now: () => Date.now() };
