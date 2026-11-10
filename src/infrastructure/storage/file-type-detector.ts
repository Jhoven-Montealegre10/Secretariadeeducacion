/**
 * Tipo REAL de un archivo por su firma binaria (magic bytes), sin confiar en la extensión ni
 * en el MIME del navegador. Lista blanca cerrada: SVG, HTML, ejecutables y demás se rechazan.
 */
export type MediaKind = 'imagen' | 'audio';
export interface DetectedMedia {
  tipo: MediaKind;
  mime: string;
  extension: string;
}

const FORMATS: Array<{ tipo: MediaKind; mime: string; ext: string[]; test: (b: Buffer) => boolean }> = [
  { tipo: 'imagen', mime: 'image/jpeg', ext: ['jpg', 'jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { tipo: 'imagen', mime: 'image/png', ext: ['png'], test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { tipo: 'imagen', mime: 'image/webp', ext: ['webp'], test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { tipo: 'audio', mime: 'audio/mpeg', ext: ['mp3'], test: (b) => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
  { tipo: 'audio', mime: 'audio/ogg', ext: ['ogg', 'oga'], test: (b) => b.toString('latin1', 0, 4) === 'OggS' },
  { tipo: 'audio', mime: 'audio/wav', ext: ['wav'], test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' },
];

export const extensionOf = (name: string): string => String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? '';

export function detectMedia(buffer: Buffer, originalName: string): DetectedMedia | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  const format = FORMATS.find((f) => f.test(buffer));
  if (!format || !format.ext.includes(extensionOf(originalName))) return null;
  return { tipo: format.tipo, mime: format.mime, extension: format.ext[0]! };
}

export function isPdf(buffer: Buffer, originalName: string): boolean {
  return Buffer.isBuffer(buffer) && buffer.toString('latin1', 0, 5) === '%PDF-' && extensionOf(originalName) === 'pdf';
}

export const ALLOWED_MEDIA = FORMATS.map((f) => ({ mime: f.mime, extensiones: f.ext }));
