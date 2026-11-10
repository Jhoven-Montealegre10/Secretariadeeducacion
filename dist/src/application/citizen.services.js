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
exports.SearchService = exports.InstitutionService = exports.PqrsdService = exports.ESTADOS_PQRSD = exports.TIPOS_IDENTIFICACION = exports.TIPOS_PQRSD = exports.DocumentService = exports.TIPOS_DOCUMENTO_NORMATIVO = void 0;
/**
 * Normatividad (PDF públicos), PQRSD (datos personales cifrados), instituciones y buscador.
 */
const node_path_1 = __importDefault(require("node:path"));
const common_1 = require("@nestjs/common");
const errors_1 = require("../domain/errors");
const configuration_1 = require("../config/configuration");
const public_cache_service_1 = require("../infrastructure/cache/public-cache.service");
const db_service_1 = require("../infrastructure/database/db.service");
const citizen_repositories_1 = require("../infrastructure/repositories/citizen.repositories");
const content_repositories_1 = require("../infrastructure/repositories/content.repositories");
const file_storage_1 = require("../infrastructure/storage/file-storage");
const file_type_detector_1 = require("../infrastructure/storage/file-type-detector");
const malware_scanner_service_1 = require("../infrastructure/storage/malware-scanner.service");
const storage_module_1 = require("../infrastructure/storage/storage.module");
const audit_service_1 = require("./audit.service");
const authorization_1 = require("./authorization");
const content_services_1 = require("./content.services");
const search_index_1 = require("./search-index");
// ---------------------------------------------------------------- Normatividad
exports.TIPOS_DOCUMENTO_NORMATIVO = Object.freeze({
    circular: 'Circulares',
    resolucion: 'Resoluciones',
    decreto: 'Decretos',
    acuerdo: 'Acuerdos',
});
let DocumentService = class DocumentService {
    db;
    docs;
    storage;
    scanner;
    audit;
    cache;
    config;
    TIPOS = exports.TIPOS_DOCUMENTO_NORMATIVO;
    constructor(db, docs, storage, scanner, audit, cache, config) {
        this.db = db;
        this.docs = docs;
        this.storage = storage;
        this.scanner = scanner;
        this.audit = audit;
        this.cache = cache;
        this.config = config;
    }
    async listPublic(filters = {}) {
        return this.docs.list({ ...filters, pageSize: Math.min(filters.pageSize || 100, 100) });
    }
    /** Documentos agrupados por tipo en una sola consulta (sin N+1). */
    async groupedPublic() {
        return this.cache.get('normatividad', async () => {
            const all = await this.docs.latestByType(100);
            return Object.entries(exports.TIPOS_DOCUMENTO_NORMATIVO).map(([tipo, nombre]) => ({ tipo, nombre, documentos: all.filter((d) => d.tipo === tipo) }));
        });
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'documents.read');
        return this.docs.list(filters);
    }
    async create(actor, data, file, ip) {
        (0, authorization_1.authorize)(actor, 'documents.create');
        if (!file)
            throw new errors_1.ValidationError('Adjunte el documento en PDF.', [{ campo: 'archivo', mensaje: 'Requerido' }]);
        const max = this.config.uploads.maxDocumentBytes;
        if (file.size > max)
            throw new errors_1.PayloadTooLargeError(`El PDF supera el máximo de ${Math.round(max / 1048576)} MB.`);
        if (!(0, file_type_detector_1.isPdf)(file.buffer, file.originalname))
            throw new errors_1.ValidationError('El archivo no es un PDF válido.', [{ campo: 'archivo', mensaje: 'No es PDF' }]);
        const scan = await this.scanner.scan(file.buffer);
        if (!scan.limpio)
            throw new errors_1.ValidationError('El archivo fue rechazado por el análisis antimalware.');
        const archivo = await this.storage.save(this.storage.newName('pdf'), file.buffer);
        try {
            return await this.db.transaction(async () => {
                const id = await this.docs.create({ ...data, archivo, nombreOriginal: node_path_1.default.basename(String(file.originalname)).slice(0, 120), tamano: file.size }, actor.id);
                await this.audit.record({
                    actor,
                    accion: 'documento_crear',
                    recurso: 'documento',
                    recursoId: id,
                    detalle: `${data.tipo} ${data.numero}/${data.anio}`,
                    ip,
                });
                this.cache.invalidate();
                return (await this.docs.findById(id));
            });
        }
        catch (err) {
            await this.storage.remove(archivo);
            throw err;
        }
    }
    async remove(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'documents.delete');
        await this.db.transaction(async () => {
            const doc = await this.docs.findById(id);
            if (!doc)
                throw new errors_1.NotFoundError('El documento no existe.');
            await this.docs.delete(id);
            await this.audit.record({
                actor,
                accion: 'documento_eliminar',
                recurso: 'documento',
                recursoId: id,
                detalle: `${doc.tipo} ${doc.numero}/${doc.anio}`,
                ip,
            });
            this.cache.invalidate();
            this.db.afterCommit(() => this.storage.remove(doc.archivo));
        });
    }
    /** Archivo para descarga pública: se busca por ID, nunca por una ruta enviada por el usuario. */
    async file(id) {
        const doc = await this.docs.findById(id);
        const file = doc ? this.storage.resolve(doc.archivo) : null;
        if (!doc || !file || !this.storage.exists(doc.archivo))
            return null;
        return { path: file, nombre: `${doc.tipo}-${doc.numero}-${doc.anio}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_') };
    }
    async count() {
        return this.docs.count();
    }
};
exports.DocumentService = DocumentService;
exports.DocumentService = DocumentService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(storage_module_1.DOCUMENT_STORAGE)),
    __param(6, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [db_service_1.Db,
        content_repositories_1.DocumentRepository,
        file_storage_1.FileStorage,
        malware_scanner_service_1.MalwareScanner,
        audit_service_1.AuditService,
        public_cache_service_1.PublicCache, Object])
], DocumentService);
// ---------------------------------------------------------------- PQRSD
exports.TIPOS_PQRSD = Object.freeze(['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Denuncia', 'Solicitud de información']);
exports.TIPOS_IDENTIFICACION = Object.freeze([
    'Cédula de ciudadanía',
    'Tarjeta de identidad',
    'Cédula de extranjería',
    'Pasaporte',
    'NIT',
    'PPT',
]);
exports.ESTADOS_PQRSD = Object.freeze(['Radicada', 'En trámite', 'Respondida', 'Cerrada']);
let PqrsdService = class PqrsdService {
    repo;
    audit;
    TIPOS = exports.TIPOS_PQRSD;
    TIPOS_DOCUMENTO = exports.TIPOS_IDENTIFICACION;
    ESTADOS = exports.ESTADOS_PQRSD;
    constructor(repo, audit) {
        this.repo = repo;
        this.audit = audit;
    }
    async file(data) {
        return this.repo.create(data);
    }
    /** Vista ciudadana: sin correo, teléfono ni documento. */
    async lookup(radicado, documento) {
        const d = await this.repo.findByRadicadoAndDocument(radicado, documento);
        if (!d)
            return null;
        return {
            radicado: d.radicado,
            tipo: d.tipo,
            estado: d.estado,
            asunto: d.asunto,
            respuesta: d.respuesta,
            creadoEn: d.creadoEn,
            actualizadoEn: d.actualizadoEn,
        };
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'pqrsd.read');
        return this.repo.list(filters);
    }
    async get(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'pqrsd.read');
        const d = await this.repo.findById(id);
        if (!d)
            throw new errors_1.NotFoundError('La solicitud no existe.');
        await this.audit.record({ actor, accion: 'pqrsd_ver', recurso: 'pqrsd', recursoId: d.radicado, ip }); // cada acceso a datos personales queda registrado
        return d;
    }
    async respond(actor, id, input, ip) {
        (0, authorization_1.authorize)(actor, 'pqrsd.respond');
        const d = await this.repo.findById(id);
        if (!d)
            throw new errors_1.NotFoundError('La solicitud no existe.');
        await this.repo.respond(id, input.estado, input.respuesta);
        await this.audit.record({ actor, accion: 'pqrsd_responder', recurso: 'pqrsd', recursoId: d.radicado, detalle: `${d.estado} → ${input.estado}`, ip });
        return this.repo.findById(id);
    }
    async countByStatus() {
        return this.repo.countByStatus();
    }
};
exports.PqrsdService = PqrsdService;
exports.PqrsdService = PqrsdService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [citizen_repositories_1.PqrsdRepository,
        audit_service_1.AuditService])
], PqrsdService);
// ---------------------------------------------------------------- Instituciones y buscador
let InstitutionService = class InstitutionService {
    repo;
    cache;
    constructor(repo, cache) {
        this.repo = repo;
        this.cache = cache;
    }
    async list(q = '') {
        const term = String(q).slice(0, 80);
        return term ? this.repo.list(term) : this.cache.get('instituciones', () => this.repo.list(''));
    }
};
exports.InstitutionService = InstitutionService;
exports.InstitutionService = InstitutionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_repositories_1.InstitutionRepository,
        public_cache_service_1.PublicCache])
], InstitutionService);
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Buscador del sitio público: secciones fijas, páginas, noticias y documentos publicados. */
let SearchService = class SearchService {
    pages;
    news;
    documents;
    constructor(pages, news, documents) {
        this.pages = pages;
        this.news = news;
        this.documents = documents;
    }
    async search(q) {
        const words = norm(q).split(/\s+/).filter(Boolean);
        const matches = (text) => {
            const hay = norm(text);
            return words.every((w) => hay.includes(w));
        };
        const secciones = search_index_1.SEARCH_INDEX.filter((p) => matches(`${p.t} ${p.k}`));
        const [publicadas, noticias, documentos] = await Promise.all([
            this.pages.listPublished(),
            this.news.listPublished({ q, pageSize: 10 }),
            this.documents.listPublic({ q, pageSize: 10 }),
        ]);
        const paginas = publicadas.filter((p) => matches(`${p.titulo} ${p.slug}`) && !secciones.some((s) => s.u === `/${p.slug}`));
        return { secciones, paginas, noticias: noticias.items, documentos: documentos.items };
    }
};
exports.SearchService = SearchService;
exports.SearchService = SearchService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_services_1.PageService,
        content_services_1.NewsService,
        DocumentService])
], SearchService);
//# sourceMappingURL=citizen.services.js.map