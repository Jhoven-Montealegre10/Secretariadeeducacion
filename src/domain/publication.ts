/**
 * Reglas de publicación compartidas por páginas, noticias y sliders.
 */
export const ESTADOS = ['borrador', 'publicada'] as const;
export type Estado = (typeof ESTADOS)[number];

/** Fecha local de Colombia (UTC-5, sin horario de verano) en formato AAAA-MM-DD. */
export function fechaColombia(ms: number = Date.now()): string {
  return new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Una noticia es visible al público si está publicada y su fecha de publicación ya llegó. */
export function noticiaVisible(estado: Estado, fechaPublicacion: string, hoy: string = fechaColombia()): boolean {
  return estado === 'publicada' && fechaPublicacion <= hoy;
}

/** Publicar, despublicar o editar algo ya publicado exige el permiso de publicación. */
export function requierePermisoPublicar(estadoActual: Estado | null, estadoNuevo: Estado): boolean {
  return estadoNuevo === 'publicada' || estadoActual === 'publicada';
}

/** Acción de auditoría según el cambio de estado. */
export function accionPublicacion(recurso: string, estadoActual: Estado | null, estadoNuevo: Estado): string {
  if (estadoActual === null) return `${recurso}_crear`;
  if (estadoActual !== estadoNuevo) return `${recurso}_${estadoNuevo === 'publicada' ? 'publicar' : 'despublicar'}`;
  return `${recurso}_editar`;
}

/** Bloqueo optimista: si el cliente envió la versión que editó, debe coincidir con la actual. */
export function versionCoincide(versionEsperada: number | undefined, versionActual: number): boolean {
  return versionEsperada === undefined || versionEsperada === versionActual;
}

/** Un nuevo orden de diapositivas debe contener exactamente las existentes, sin repetir. */
export function ordenValido(actuales: number[], nuevo: number[]): boolean {
  return nuevo.length === actuales.length && new Set(nuevo).size === nuevo.length && nuevo.every((id) => actuales.includes(id));
}

/** Una diapositiva se muestra si el slider y la diapositiva están activos y tiene imagen. */
export function diapositivaVisible(sliderActivo: boolean, diapositivaActiva: boolean, medioId: number | null): boolean {
  return sliderActivo && diapositivaActiva && medioId !== null;
}
