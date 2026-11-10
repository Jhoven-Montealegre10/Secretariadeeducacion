'use strict';
/** Funciones de presentación disponibles en todas las vistas (app.locals). */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
}

/** Divide un texto plano en párrafos. La vista los escapa con <%= %>, así que nunca se inyecta HTML. */
function parrafos(texto) {
  return String(texto || '').split(/\r?\n\s*\r?\n|\r?\n/).map((p) => p.trim()).filter(Boolean);
}

function tamano(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

module.exports = { fecha, parrafos, tamano };
