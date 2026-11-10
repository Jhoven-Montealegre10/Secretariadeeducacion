"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessor = void 0;
/**
 * Re-codificación de imágenes con `sharp` (en el pool de hilos de libuv, sin bloquear el bucle de
 * eventos): elimina metadatos (EXIF/GPS) y contenido oculto, limita píxeles y genera miniatura WebP.
 */
const common_1 = require("@nestjs/common");
const sharp_1 = __importDefault(require("sharp"));
const MAX_PIXELS = 40_000_000;
const MAX_SIDE = 3000;
let ImageProcessor = class ImageProcessor {
    async process(buffer, mime) {
        const base = () => (0, sharp_1.default)(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
        let pipeline = base().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true });
        if (mime === 'image/png')
            pipeline = pipeline.png({ compressionLevel: 9 });
        else if (mime === 'image/webp')
            pipeline = pipeline.webp({ quality: 85 });
        else
            pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
        const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
        const thumbnail = await base().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
        return { data, thumbnail, ancho: info.width, alto: info.height };
    }
};
exports.ImageProcessor = ImageProcessor;
exports.ImageProcessor = ImageProcessor = __decorate([
    (0, common_1.Injectable)()
], ImageProcessor);
//# sourceMappingURL=image-processor.service.js.map