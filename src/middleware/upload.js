'use strict';
/**
 * Subida segura de PDF:
 *  - se recibe en memoria con límite de tamaño y de cantidad de archivos;
 *  - se verifica la firma real del archivo (%PDF-), no solo la extensión;
 *  - se guarda FUERA de la carpeta pública con un nombre aleatorio.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('../../config');

fs.mkdirSync(config.uploadsDir, { recursive: true });

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1, fields: 20, fieldSize: 20 * 1024 },
}).single('archivo');

function isPdf(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 5).toString('latin1') === '%PDF-';
}

function savePdf(file) {
  const name = crypto.randomBytes(16).toString('hex') + '.pdf';
  fs.writeFileSync(path.join(config.uploadsDir, name), file.buffer, { mode: 0o640, flag: 'wx' });
  return name;
}

/** Devuelve la ruta absoluta solo si el nombre tiene el formato generado (impide "../"). */
function storedPath(name) {
  if (!/^[a-f0-9]{32}\.pdf$/.test(String(name))) return null;
  return path.join(config.uploadsDir, name);
}

function removeStored(name) {
  const p = storedPath(name);
  if (p) fs.rm(p, { force: true }, () => {});
}

module.exports = { pdfUpload, isPdf, savePdf, storedPath, removeStored };
