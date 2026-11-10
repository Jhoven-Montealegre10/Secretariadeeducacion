'use strict';
/**
 * Detección del tipo REAL de un archivo por su firma binaria (magic bytes), sin confiar en
 * la extensión ni en el MIME declarado por el navegador. Lista blanca cerrada:
 * cualquier otro formato (SVG, HTML, ejecutables, etc.) se rechaza.
 */
const FORMATS = [
  { tipo: 'imagen', mime: 'image/jpeg', ext: ['jpg', 'jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: 'imagen', mime: 'image/png', ext: ['png'], test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { tipo: 'imagen', mime: 'image/webp', ext: ['webp'], test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { tipo: 'audio', mime: 'audio/mpeg', ext: ['mp3'], test: (b) => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  { tipo: 'audio', mime: 'audio/ogg', ext: ['ogg', 'oga'], test: (b) => b.toString('latin1', 0, 4) === 'OggS' },
  { tipo: 'audio', mime: 'audio/wav', ext: ['wav'], test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' },
];
const PDF = { mime: 'application/pdf', ext: ['pdf'], test: (b) => b.toString('latin1', 0, 5) === '%PDF-' };

const extensionOf = (name) => String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] || '';

/** Devuelve el formato detectado si contenido y extensión coinciden con la lista blanca; si no, null. */
function detectMedia(buffer, originalName) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const format = FORMATS.find((f) => f.test(buffer));
  if (!format || !format.ext.includes(extensionOf(originalName))) return null;
  return { tipo: format.tipo, mime: format.mime, extension: format.ext[0] };
}

function isPdf(buffer, originalName) {
  return Buffer.isBuffer(buffer) && PDF.test(buffer) && extensionOf(originalName) === 'pdf';
}

const ALLOWED_MEDIA = FORMATS.map((f) => ({ mime: f.mime, extensiones: f.ext }));

module.exports = { detectMedia, isPdf, extensionOf, ALLOWED_MEDIA };
