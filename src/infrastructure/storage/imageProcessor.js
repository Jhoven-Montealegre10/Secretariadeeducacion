'use strict';
/**
 * Re-codificación de imágenes con `sharp`: se decodifica y se vuelve a codificar la imagen,
 * lo que elimina metadatos (EXIF/GPS), datos ocultos y archivos "políglotas" que intentan
 * pasar como imagen. Se limita el número de píxeles para evitar bombas de descompresión.
 */
const sharp = require('sharp');

const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 3000;

async function process(buffer, mime) {
  const base = () => sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
  const meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS }).metadata();
  let pipeline = base().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
  if (mime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
  else if (mime === 'image/webp') pipeline = pipeline.webp({ quality: 85 });
  else pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  const thumbnail = await base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  return { data, thumbnail, ancho: info.width, alto: info.height, formatoOriginal: meta.format };
}

module.exports = { process };
