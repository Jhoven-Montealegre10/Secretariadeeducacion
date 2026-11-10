'use strict';
/** Funciones de presentación disponibles en todas las vistas (app.locals). */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fecha(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1]} de ${m[1]}` : '';
}

function tamano(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * URL de un archivo de la biblioteca. En vista previa (panel) usa la ruta autenticada,
 * para mostrar archivos que aún son privados sin hacerlos públicos.
 */
function mediaSrc(m, { preview = false, thumb = false } = {}) {
  if (!m) return '';
  if (preview) return `/api/v1/medios/${m.id}/archivo${thumb ? '?miniatura=true' : ''}`;
  return `/media/${thumb && m.miniatura ? m.miniatura : m.archivo}`;
}

module.exports = { fecha, tamano, escapeHtml, mediaSrc };
