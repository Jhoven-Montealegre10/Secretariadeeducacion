"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicController = void 0;
/** API pública de solo lectura: únicamente contenido publicado y campos aptos para visitantes. */
const common_1 = require("@nestjs/common");
const citizen_services_1 = require("../../../../application/citizen.services");
const content_services_1 = require("../../../../application/content.services");
const media_service_1 = require("../../../../application/media.service");
const content_1 = require("../../../../domain/content");
const errors_1 = require("../../../../domain/errors");
const route_spec_1 = require("../../route-spec");
const session_helpers_1 = require("../../session/session.helpers");
const common_2 = require("../schemas/common");
const content_schemas_1 = require("../schemas/content.schemas");
const P = __importStar(require("../schemas/public.schemas"));
const TAG = ['Público'];
const toItem = (images) => (n) => ({
    slug: n.slug,
    titulo: n.titulo,
    resumen: n.resumen,
    categoria: n.categoria,
    fechaPublicacion: n.fechaPublicacion,
    imagen: P.toImage(n.imagenId ? images.get(n.imagenId) : null),
    url: `/noticias/${n.slug}`,
});
let PublicController = class PublicController {
    news;
    pages;
    sliders;
    documents;
    institutions;
    media;
    constructor(news, pages, sliders, documents, institutions, media) {
        this.news = news;
        this.pages = pages;
        this.sliders = sliders;
        this.documents = documents;
        this.institutions = institutions;
        this.media = media;
    }
    async imageMap(ids) {
        return new Map((await this.media.findByIds(ids)).map((m) => [m.id, m]));
    }
    async listNews(req) {
        const result = await this.news.listPublished((0, session_helpers_1.valid)(req, 'query', P.PublicNewsQuery));
        return (0, common_2.paged)(result, toItem(await this.imageMap(result.items.map((n) => n.imagenId))));
    }
    async getNews(req) {
        const n = await this.news.getPublished((0, session_helpers_1.valid)(req, 'params', P.SlugParams).slug);
        if (!n)
            throw new errors_1.NotFoundError('La noticia no existe.');
        const fotos = n.fotos ?? [];
        const images = await this.imageMap([n.imagenId, ...fotos]);
        return {
            data: {
                ...toItem(images)(n),
                contenido: n.contenido,
                fotos: fotos.map((id) => P.toImage(images.get(id))).filter((x) => x !== null),
            },
        };
    }
    async getPage(req) {
        const p = await this.pages.getPublished((0, session_helpers_1.valid)(req, 'params', P.SlugParams).slug);
        if (!p)
            throw new errors_1.NotFoundError('La página no existe.');
        return {
            data: {
                slug: p.slug,
                titulo: p.titulo,
                resumen: p.resumen,
                bloques: p.bloques,
                medios: (await this.media.findByIds((0, content_1.mediosEnBloques)(p.bloques))).map(P.toPublicMedia),
            },
        };
    }
    async getSlider(req) {
        const s = await this.sliders.getPublic((0, session_helpers_1.valid)(req, 'params', P.LocationParams).ubicacion);
        if (!s)
            throw new errors_1.NotFoundError('No hay un slider activo en esa ubicación.');
        return {
            data: {
                ubicacion: s.ubicacion,
                diapositivas: s.diapositivas.map((d) => ({
                    titulo: d.titulo,
                    texto: d.texto,
                    enlace: d.enlace,
                    textoEnlace: d.textoEnlace,
                    imagen: P.toImage(d.medio),
                })),
            },
        };
    }
    async listDocuments(req) {
        return (0, common_2.paged)(await this.documents.listPublic((0, session_helpers_1.valid)(req, 'query', content_schemas_1.DocumentQuery)), content_schemas_1.toDocument);
    }
    async listInstitutions() {
        return { data: (await this.institutions.list()).map((i) => ({ nombre: i.nombre, zona: i.zona })) };
    }
};
exports.PublicController = PublicController;
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/public/noticias', {
        tags: TAG,
        auth: 'public',
        summary: 'Noticias publicadas (más recientes primero)',
        description: 'Excluye borradores y noticias con fecha de publicación futura.',
        request: { query: P.PublicNewsQuery },
        response: { description: 'Noticias', schema: P.PublicNewsList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "listNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/public/noticias/{slug}', {
        tags: TAG,
        auth: 'public',
        summary: 'Detalle de una noticia publicada',
        request: { params: P.SlugParams },
        response: { description: 'Noticia', schema: P.PublicNewsOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "getNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/public/paginas/{slug}', {
        tags: TAG,
        auth: 'public',
        summary: 'Página publicada con sus bloques',
        request: { params: P.SlugParams },
        response: { description: 'Página', schema: P.PublicPage },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "getPage", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/public/sliders/{ubicacion}', {
        tags: TAG,
        auth: 'public',
        summary: 'Slider activo de una ubicación',
        request: { params: P.LocationParams },
        response: { description: 'Slider', schema: P.PublicSlider },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "getSlider", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/public/documentos', {
        tags: TAG,
        auth: 'public',
        summary: 'Normatividad publicada',
        request: { query: content_schemas_1.DocumentQuery },
        response: { description: 'Documentos', schema: content_schemas_1.DocumentList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "listDocuments", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/public/instituciones', {
        tags: TAG,
        auth: 'public',
        summary: 'Directorio de instituciones educativas oficiales',
        response: { description: 'Instituciones', schema: P.PublicInstitutions },
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PublicController.prototype, "listInstitutions", null);
exports.PublicController = PublicController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [content_services_1.NewsService,
        content_services_1.PageService,
        content_services_1.SliderService,
        citizen_services_1.DocumentService,
        citizen_services_1.InstitutionService,
        media_service_1.MediaService])
], PublicController);
//# sourceMappingURL=public.controller.js.map