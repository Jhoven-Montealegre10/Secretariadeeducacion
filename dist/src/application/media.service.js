"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
/**
 * Biblioteca multimedia (imágenes y audio).
 *  - Valida el tipo real por contenido, la extensión y el tamaño; rechaza SVG y todo lo demás.
 *  - Las imágenes se re-codifican (sin metadatos ni contenido oculto) y se genera miniatura.
 *  - Nombre interno aleatorio separado del nombre visible editable. Archivos en disco, no en la BD.
 *  - Advierte cuando un archivo está en uso antes de reemplazarlo o eliminarlo.
 *  - Privados por defecto: solo se sirven al público si son públicos o los usa contenido publicado.
 *  - El procesamiento (análisis, re-codificación, escritura) ocurre FUERA de la transacción; los
 *    archivos huérfanos se borran si la transacción falla, y los viejos solo tras el COMMIT.
 */
const node_path_1 = __importDefault(require("node:path"));
const common_1 = require("@nestjs/common");
const errors_1 = require("../domain/errors");
const publication_1 = require("../domain/publication");
const configuration_1 = require("../config/configuration");
const public_cache_service_1 = require("../infrastructure/cache/public-cache.service");
const db_service_1 = require("../infrastructure/database/db.service");
const content_repositories_1 = require("../infrastructure/repositories/content.repositories");
const file_storage_1 = require("../infrastructure/storage/file-storage");
const file_type_detector_1 = require("../infrastructure/storage/file-type-detector");
const image_processor_service_1 = require("../infrastructure/storage/image-processor.service");
const malware_scanner_service_1 = require("../infrastructure/storage/malware-scanner.service");
const storage_module_1 = require("../infrastructure/storage/storage.module");
const audit_service_1 = require("./audit.service");
const authorization_1 = require("./authorization");
let MediaService = class MediaService {
    db;
    media;
    storage;
    images;
    scanner;
    audit;
    cache;
    config;
    constructor(db, media, storage, images, scanner, audit, cache, config) {
        this.db = db;
        this.media = media;
        this.storage = storage;
        this.images = images;
        this.scanner = scanner;
        this.audit = audit;
        this.cache = cache;
        this.config = config;
    }
    async requireMedia(id, forUpdate = false) {
        const m = await this.media.findById(id, { forUpdate });
        if (!m)
            throw new errors_1.NotFoundError('El archivo no existe.');
        return m;
    }
    /** Valida, analiza y guarda los bytes; devuelve los datos del archivo almacenado. */
    async ingest(file) {
        const original = node_path_1.default.basename(String(file.originalname));
        const detected = (0, file_type_detector_1.detectMedia)(file.buffer, file.originalname);
        if (!detected) {
            throw new errors_1.ValidationError(`"${original.slice(0, 80)}" no es un formato permitido (JPG, PNG, WebP, MP3, OGG o WAV) o su extensión no coincide con su contenido.`);
        }
        const max = detected.tipo === 'imagen' ? this.config.uploads.maxImageBytes : this.config.uploads.maxAudioBytes;
        if (file.size > max)
            throw new errors_1.PayloadTooLargeError(`El archivo supera el máximo de ${Math.round(max / 1048576)} MB para ${detected.tipo}.`);
        const scan = await this.scanner.scan(file.buffer);
        if (!scan.limpio)
            throw new errors_1.ValidationError('El archivo fue rechazado por el análisis antimalware.');
        let data = file.buffer;
        let thumbnail = null;
        let ancho = null;
        let alto = null;
        if (detected.tipo === 'imagen') {
            try {
                ({ data, thumbnail, ancho, alto } = await this.images.process(file.buffer, detected.mime));
            }
            catch {
                throw new errors_1.ValidationError('La imagen está dañada o no se pudo procesar.');
            }
        }
        const archivo = await this.storage.save(this.storage.newName(detected.extension), data);
        const miniatura = thumbnail ? await this.storage.save(this.storage.newName('webp', { thumbnail: true }), thumbnail) : null;
        return {
            tipo: detected.tipo,
            mime: detected.mime,
            extension: detected.extension,
            archivo,
            miniatura,
            ancho,
            alto,
            tamano: data.length,
            nombreOriginal: original.slice(0, 200),
        };
    }
    async discard(stored) {
        await this.storage.remove(stored.archivo);
        await this.storage.remove(stored.miniatura);
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'media.read');
        return this.media.list(filters);
    }
    async get(actor, id) {
        (0, authorization_1.authorize)(actor, 'media.read');
        const m = await this.requireMedia(id);
        return { ...m, usos: await this.media.usagesOf(id) };
    }
    async upload(actor, files, meta, ip) {
        (0, authorization_1.authorize)(actor, 'media.upload');
        if (!files?.length)
            throw new errors_1.ValidationError('Adjunte al menos un archivo.', [{ campo: 'archivos', mensaje: 'Requerido' }]);
        const max = this.config.uploads.maxFilesPerRequest;
        if (files.length > max)
            throw new errors_1.ValidationError(`Máximo ${max} archivos por envío.`);
        const stored = [];
        try {
            for (const f of files)
                stored.push(await this.ingest(f));
            return await this.db.transaction(async () => {
                const created = [];
                for (const s of stored) {
                    const nombreVisible = (files.length === 1 && meta.nombreVisible) || s.nombreOriginal.replace(/\.[^.]+$/, '').slice(0, 150) || 'archivo';
                    const id = await this.media.create({
                        ...s,
                        nombreVisible,
                        textoAlternativo: s.tipo === 'imagen' ? (meta.textoAlternativo ?? '') : '',
                        descripcion: meta.descripcion ?? '',
                        visibilidad: meta.visibilidad ?? 'privada',
                        subidoPor: actor.id,
                    });
                    await this.audit.record({ actor, accion: 'medio_subir', recurso: 'medio', recursoId: id, detalle: `${s.tipo} ${s.mime}`, ip });
                    created.push((await this.media.findById(id)));
                }
                return created;
            });
        }
        catch (err) {
            await Promise.all(stored.map((s) => this.discard(s)));
            throw err;
        }
    }
    async update(actor, id, changes, ip) {
        (0, authorization_1.authorize)(actor, 'media.update');
        return this.db.transaction(async () => {
            const m = await this.requireMedia(id, true);
            if (!(0, publication_1.versionCoincide)(changes.version, m.version))
                throw new errors_1.EditConflictError(m.version);
            if (changes.textoAlternativo && m.tipo !== 'imagen')
                throw new errors_1.ValidationError('El texto alternativo solo aplica a imágenes.');
            await this.media.update(id, {
                nombreVisible: changes.nombreVisible,
                textoAlternativo: changes.textoAlternativo,
                descripcion: changes.descripcion,
                visibilidad: changes.visibilidad,
            }, actor.id);
            await this.audit.record({ actor, accion: 'medio_actualizar', recurso: 'medio', recursoId: id, ip });
            this.cache.invalidate(); // el texto alternativo o la visibilidad pueden aparecer en el sitio
            return { ...(await this.media.findById(id)), usos: await this.media.usagesOf(id) };
        });
    }
    /** Reemplaza el contenido manteniendo el ID: todos los contenidos que lo usan se actualizan. */
    async replace(actor, id, file, opts, ip) {
        (0, authorization_1.authorize)(actor, 'media.update');
        if (!file)
            throw new errors_1.ValidationError('Adjunte el archivo de reemplazo.', [{ campo: 'archivo', mensaje: 'Requerido' }]);
        const before = await this.requireMedia(id);
        const usosAntes = await this.media.usagesOf(id);
        if (usosAntes.length && !opts.confirmar)
            throw new errors_1.ConflictError(`El archivo se usa en ${usosAntes.length} contenido(s). Confirme para reemplazarlo en todos.`, usosAntes);
        const stored = await this.ingest(file);
        if (stored.tipo !== before.tipo) {
            await this.discard(stored);
            throw new errors_1.ValidationError(`Debe reemplazarse por otro archivo de tipo ${before.tipo}.`);
        }
        try {
            return await this.db.transaction(async () => {
                const m = await this.requireMedia(id, true);
                if (!(0, publication_1.versionCoincide)(opts.version, m.version))
                    throw new errors_1.EditConflictError(m.version);
                const usos = await this.media.usagesOf(id);
                await this.media.replaceFile(id, stored, actor.id);
                await this.audit.record({ actor, accion: 'medio_reemplazar', recurso: 'medio', recursoId: id, detalle: `usos: ${usos.length}`, ip });
                this.db.afterCommit(() => this.discard(m)); // el archivo anterior solo se borra si el cambio quedó guardado
                this.cache.invalidate();
                return { ...(await this.media.findById(id)), usos };
            });
        }
        catch (err) {
            await this.discard(stored);
            throw err;
        }
    }
    async remove(actor, id, opts, ip) {
        (0, authorization_1.authorize)(actor, 'media.delete');
        await this.db.transaction(async () => {
            const m = await this.requireMedia(id, true);
            const usos = await this.media.usagesOf(id);
            if (usos.length && !opts.confirmar)
                throw new errors_1.ConflictError(`El archivo se usa en ${usos.length} contenido(s). Si lo elimina, dejará de mostrarse allí.`, usos);
            await this.media.delete(id);
            await this.audit.record({
                actor,
                accion: 'medio_eliminar',
                recurso: 'medio',
                recursoId: id,
                detalle: `${m.nombreVisible.slice(0, 60)}; usos: ${usos.length}`,
                ip,
            });
            this.db.afterCommit(() => this.discard(m));
            this.cache.invalidate();
        });
    }
    /** Archivo para el público: solo si es público o lo usa contenido publicado. */
    async publicFile(name) {
        const file = this.storage.resolve(name);
        if (!file)
            return null;
        const m = await this.media.findByFile(name);
        if (!m || !(await this.media.isPubliclyServable(m.id)) || !this.storage.exists(name))
            return null;
        return { path: file, mime: name === m.miniatura ? 'image/webp' : m.mime };
    }
    /** Archivo para el panel (también privados), con permiso media.read. */
    async privateFile(actor, id, { miniatura = false } = {}) {
        (0, authorization_1.authorize)(actor, 'media.read');
        const m = await this.requireMedia(id);
        const name = miniatura && m.miniatura ? m.miniatura : m.archivo;
        const file = this.storage.resolve(name);
        if (!file || !this.storage.exists(name))
            throw new errors_1.NotFoundError('El archivo no está disponible.');
        return { path: file, mime: name === m.miniatura ? 'image/webp' : m.mime };
    }
    // --- Uso desde otros módulos (páginas, noticias, sliders) ---
    async assertUsable(ids, tipo) {
        const unique = [...new Set(ids.filter((v) => typeof v === 'number' && v > 0))];
        if (!unique.length)
            return;
        const found = await this.media.findByIds(unique);
        const missing = unique.filter((id) => !found.some((m) => m.id === id));
        if (missing.length)
            throw new errors_1.ValidationError(`Archivos inexistentes en la biblioteca: ${missing.join(', ')}.`);
        if (tipo && found.some((m) => m.tipo !== tipo))
            throw new errors_1.ValidationError(`Se esperaba un archivo de tipo ${tipo}.`);
    }
    async syncUsages(entidad, entidadId, ids, publicado) {
        await this.media.setUsages(entidad, entidadId, [...new Set(ids.filter((v) => typeof v === 'number' && v > 0))], publicado);
    }
    async clearUsages(entidad, entidadIds) {
        await this.media.clearUsages(entidad, entidadIds);
    }
    async findByIds(ids) {
        return this.media.findByIds([...new Set(ids.filter((v) => typeof v === 'number' && v > 0))]);
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(storage_module_1.MEDIA_STORAGE)),
    __param(7, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [db_service_1.Db,
        content_repositories_1.MediaRepository,
        file_storage_1.FileStorage,
        image_processor_service_1.ImageProcessor,
        malware_scanner_service_1.MalwareScanner,
        audit_service_1.AuditService,
        public_cache_service_1.PublicCache, Object])
], MediaService);
//# sourceMappingURL=media.service.js.map