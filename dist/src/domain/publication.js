"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ESTADOS = void 0;
exports.fechaColombia = fechaColombia;
exports.noticiaVisible = noticiaVisible;
exports.requierePermisoPublicar = requierePermisoPublicar;
exports.accionPublicacion = accionPublicacion;
exports.versionCoincide = versionCoincide;
exports.ordenValido = ordenValido;
exports.diapositivaVisible = diapositivaVisible;
/**
 * Reglas de publicación compartidas por páginas, noticias y sliders.
 */
exports.ESTADOS = ['borrador', 'publicada'];
/** Fecha local de Colombia (UTC-5, sin horario de verano) en formato AAAA-MM-DD. */
function fechaColombia(ms = Date.now()) {
    return new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Una noticia es visible al público si está publicada y su fecha de publicación ya llegó. */
function noticiaVisible(estado, fechaPublicacion, hoy = fechaColombia()) {
    return estado === 'publicada' && fechaPublicacion <= hoy;
}
/** Publicar, despublicar o editar algo ya publicado exige el permiso de publicación. */
function requierePermisoPublicar(estadoActual, estadoNuevo) {
    return estadoNuevo === 'publicada' || estadoActual === 'publicada';
}
/** Acción de auditoría según el cambio de estado. */
function accionPublicacion(recurso, estadoActual, estadoNuevo) {
    if (estadoActual === null)
        return `${recurso}_crear`;
    if (estadoActual !== estadoNuevo)
        return `${recurso}_${estadoNuevo === 'publicada' ? 'publicar' : 'despublicar'}`;
    return `${recurso}_editar`;
}
/** Bloqueo optimista: si el cliente envió la versión que editó, debe coincidir con la actual. */
function versionCoincide(versionEsperada, versionActual) {
    return versionEsperada === undefined || versionEsperada === versionActual;
}
/** Un nuevo orden de diapositivas debe contener exactamente las existentes, sin repetir. */
function ordenValido(actuales, nuevo) {
    return nuevo.length === actuales.length && new Set(nuevo).size === nuevo.length && nuevo.every((id) => actuales.includes(id));
}
/** Una diapositiva se muestra si el slider y la diapositiva están activos y tiene imagen. */
function diapositivaVisible(sliderActivo, diapositivaActiva, medioId) {
    return sliderActivo && diapositivaActiva && medioId !== null;
}
//# sourceMappingURL=publication.js.map