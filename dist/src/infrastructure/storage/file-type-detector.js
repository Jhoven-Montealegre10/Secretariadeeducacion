"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_MEDIA = exports.extensionOf = void 0;
exports.detectMedia = detectMedia;
exports.isPdf = isPdf;
const FORMATS = [
    { tipo: 'imagen', mime: 'image/jpeg', ext: ['jpg', 'jpeg'], test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { tipo: 'imagen', mime: 'image/png', ext: ['png'], test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { tipo: 'imagen', mime: 'image/webp', ext: ['webp'], test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
    { tipo: 'audio', mime: 'audio/mpeg', ext: ['mp3'], test: (b) => b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && ((b[1] ?? 0) & 0xe0) === 0xe0) },
    { tipo: 'audio', mime: 'audio/ogg', ext: ['ogg', 'oga'], test: (b) => b.toString('latin1', 0, 4) === 'OggS' },
    { tipo: 'audio', mime: 'audio/wav', ext: ['wav'], test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE' },
];
const extensionOf = (name) => String(name).toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1] ?? '';
exports.extensionOf = extensionOf;
function detectMedia(buffer, originalName) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 12)
        return null;
    const format = FORMATS.find((f) => f.test(buffer));
    if (!format || !format.ext.includes((0, exports.extensionOf)(originalName)))
        return null;
    return { tipo: format.tipo, mime: format.mime, extension: format.ext[0] };
}
function isPdf(buffer, originalName) {
    return Buffer.isBuffer(buffer) && buffer.toString('latin1', 0, 5) === '%PDF-' && (0, exports.extensionOf)(originalName) === 'pdf';
}
exports.ALLOWED_MEDIA = FORMATS.map((f) => ({ mime: f.mime, extensiones: f.ext }));
//# sourceMappingURL=file-type-detector.js.map