/**
 * Re-codificación de imágenes con `sharp` (en el pool de hilos de libuv, sin bloquear el bucle de
 * eventos): elimina metadatos (EXIF/GPS) y contenido oculto, limita píxeles y genera miniatura WebP.
 */
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';

const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 3000;

@Injectable()
export class ImageProcessor {
  async process(buffer: Buffer, mime: string): Promise<{ data: Buffer; thumbnail: Buffer; ancho: number; alto: number }> {
    const base = () => sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
    let pipeline = base().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
    if (mime === 'image/png') pipeline = pipeline.png({ compressionLevel: 9 });
    else if (mime === 'image/webp') pipeline = pipeline.webp({ quality: 85 });
    else pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const thumbnail = await base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
    return { data, thumbnail, ancho: info.width, alto: info.height };
  }
}
