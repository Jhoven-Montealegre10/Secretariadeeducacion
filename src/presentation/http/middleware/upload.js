'use strict';
/**
 * Recepción de archivos multipart en memoria con límites de tamaño, cantidad y campos.
 * El contenido se valida después en el servicio (tipo real, antimalware, re-codificación).
 */
const multer = require('multer');
const config = require('../../../config');
const { PayloadTooLargeError, ValidationError } = require('../../../domain/errors');

function memoryUpload({ field, maxBytes, maxFiles = 1 }) {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles, fields: 20, fieldSize: 20 * 1024, parts: maxFiles + 20 },
  })[maxFiles > 1 ? 'array' : 'single'](field, maxFiles > 1 ? maxFiles : undefined);

  return (req, res, next) => {
    // Límite del tamaño TOTAL de la solicitud antes de leerla: evita agotar la memoria con muchos archivos grandes.
    const declared = Number(req.get('content-length') || 0);
    if (!req.get('content-length') || declared > config.uploads.maxRequestBytes) {
      return next(new PayloadTooLargeError(`La carga supera el máximo de ${Math.round(config.uploads.maxRequestBytes / 1048576)} MB por envío.`));
    }
    return handler(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new PayloadTooLargeError(`El archivo supera el máximo de ${Math.round(maxBytes / 1048576)} MB.`));
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
        return next(new ValidationError(`Máximo ${maxFiles} archivo(s) en el campo "${field}".`));
      return next(new ValidationError('La carga del archivo no es válida.'));
    });
  };
}

const mediaUpload = memoryUpload({
  field: 'archivos',
  maxBytes: Math.max(config.uploads.maxImageBytes, config.uploads.maxAudioBytes),
  maxFiles: config.uploads.maxFilesPerRequest,
});
const mediaReplaceUpload = memoryUpload({ field: 'archivo', maxBytes: Math.max(config.uploads.maxImageBytes, config.uploads.maxAudioBytes) });
const documentUpload = memoryUpload({ field: 'archivo', maxBytes: config.uploads.maxDocumentBytes });

module.exports = { mediaUpload, mediaReplaceUpload, documentUpload };
