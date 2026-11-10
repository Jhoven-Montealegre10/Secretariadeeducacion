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
exports.ContentController = void 0;
/** Multimedia, páginas, noticias, sliders, normatividad y PQRSD (panel). */
const common_1 = require("@nestjs/common");
const citizen_services_1 = require("../../../../application/citizen.services");
const content_services_1 = require("../../../../application/content.services");
const media_service_1 = require("../../../../application/media.service");
const errors_1 = require("../../../../domain/errors");
const route_spec_1 = require("../../route-spec");
const headers_1 = require("../../security/headers");
const session_helpers_1 = require("../../session/session.helpers");
const api_interceptor_1 = require("../api.interceptor");
const common_2 = require("../schemas/common");
const S = __importStar(require("../schemas/content.schemas"));
const MEDIA = ['Multimedia'];
const PAGES = ['Páginas'];
const NEWS = ['Noticias'];
const SLIDERS = ['Sliders'];
const DOCS = ['Normatividad'];
const PQRSD = ['PQRSD'];
const KB = 1024;
const id = (req) => (0, session_helpers_1.valid)(req, 'params', common_2.IdParams).id;
const mediaMax = (c) => Math.max(c.uploads.maxImageBytes, c.uploads.maxAudioBytes);
/** Campos de texto de un formulario multipart, validados con su esquema. */
function fields(schema, body) {
    const r = schema.safeParse(body ?? {});
    if (!r.success)
        throw new errors_1.ValidationError(undefined, (0, api_interceptor_1.zodDetails)(r.error));
    return r.data;
}
let ContentController = class ContentController {
    media;
    pages;
    news;
    sliders;
    documents;
    pqrsd;
    constructor(media, pages, news, sliders, documents, pqrsd) {
        this.media = media;
        this.pages = pages;
        this.news = news;
        this.sliders = sliders;
        this.documents = documents;
        this.pqrsd = pqrsd;
    }
    // --- Multimedia ---
    async listMedia(req) {
        return (0, common_2.paged)(await this.media.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.MediaQuery)), S.toMedia);
    }
    async uploadMedia(req) {
        const meta = fields(S.MediaUploadFields, req.body);
        return { data: (await this.media.upload(req.actor, req.files ?? [], meta, (0, session_helpers_1.clientIp)(req))).map(S.toMedia) };
    }
    async getMedia(req) {
        return { data: S.toMedia(await this.media.get(req.actor, id(req))) };
    }
    async mediaFile(req, res) {
        const file = await this.media.privateFile(req.actor, id(req), { miniatura: (0, session_helpers_1.valid)(req, 'query', S.FileQuery).miniatura ?? false });
        (0, headers_1.sandboxFile)(res);
        res.setHeader('Cache-Control', 'private, no-store');
        await new Promise((resolve, reject) => res.type(file.mime).sendFile(file.path, (err) => (err ? reject(err) : resolve())));
    }
    async updateMedia(req) {
        return { data: S.toMedia(await this.media.update(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.MediaUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async replaceMedia(req) {
        const opts = fields(S.MediaReplaceFields, req.body);
        return { data: S.toMedia(await this.media.replace(req.actor, id(req), req.file, opts, (0, session_helpers_1.clientIp)(req))) };
    }
    async deleteMedia(req) {
        await this.media.remove(req.actor, id(req), { confirmar: (0, session_helpers_1.valid)(req, 'query', S.ConfirmQuery).confirmar }, (0, session_helpers_1.clientIp)(req));
    }
    // --- Páginas ---
    async listPages(req) {
        return (0, common_2.paged)(await this.pages.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.PageQuery)), S.toPageSummary);
    }
    async createPage(req) {
        return { data: S.toPage(await this.pages.create(req.actor, (0, session_helpers_1.valid)(req, 'body', S.PageCreate), (0, session_helpers_1.clientIp)(req))) };
    }
    async getPage(req) {
        return { data: S.toPage(await this.pages.get(req.actor, id(req))) };
    }
    async updatePage(req) {
        return { data: S.toPage(await this.pages.update(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.PageUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async deletePage(req) {
        await this.pages.remove(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
    }
    // --- Noticias ---
    async listNews(req) {
        return (0, common_2.paged)(await this.news.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.NewsQuery)), S.toNewsItem);
    }
    async createNews(req) {
        return { data: S.toNews(await this.news.create(req.actor, (0, session_helpers_1.valid)(req, 'body', S.NewsCreate), (0, session_helpers_1.clientIp)(req))) };
    }
    async getNews(req) {
        return { data: S.toNews(await this.news.get(req.actor, id(req))) };
    }
    async updateNews(req) {
        return { data: S.toNews(await this.news.update(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.NewsUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async deleteNews(req) {
        await this.news.remove(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
    }
    // --- Sliders ---
    async listSliders(req) {
        return { data: (await this.sliders.list(req.actor)).map(S.toSliderSummary) };
    }
    async createSlider(req) {
        return { data: S.toSlider(await this.sliders.create(req.actor, (0, session_helpers_1.valid)(req, 'body', S.SliderCreate), (0, session_helpers_1.clientIp)(req))) };
    }
    async getSlider(req) {
        return { data: S.toSlider(await this.sliders.get(req.actor, id(req))) };
    }
    async updateSlider(req) {
        return { data: S.toSlider(await this.sliders.update(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.SliderUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async deleteSlider(req) {
        await this.sliders.remove(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
    }
    async addSlide(req) {
        return { data: S.toSlider(await this.sliders.addSlide(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.SlideCreate), (0, session_helpers_1.clientIp)(req))) };
    }
    async reorder(req) {
        const body = (0, session_helpers_1.valid)(req, 'body', S.ReorderBody);
        return { data: S.toSlider(await this.sliders.reorder(req.actor, id(req), body.orden, (0, session_helpers_1.clientIp)(req), body.version)) };
    }
    async updateSlide(req) {
        const p = (0, session_helpers_1.valid)(req, 'params', S.SlideParams);
        return { data: S.toSlider(await this.sliders.updateSlide(req.actor, p.id, p.diapositivaId, (0, session_helpers_1.valid)(req, 'body', S.SlideUpdate), (0, session_helpers_1.clientIp)(req))) };
    }
    async removeSlide(req) {
        const p = (0, session_helpers_1.valid)(req, 'params', S.SlideParams);
        return { data: S.toSlider(await this.sliders.removeSlide(req.actor, p.id, p.diapositivaId, (0, session_helpers_1.clientIp)(req), (0, session_helpers_1.valid)(req, 'query', S.VersionQuery).version)) };
    }
    // --- Normatividad ---
    async listDocuments(req) {
        return (0, common_2.paged)(await this.documents.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.DocumentQuery)), S.toDocument);
    }
    async createDocument(req) {
        return { data: S.toDocument(await this.documents.create(req.actor, fields(S.DocumentFields, req.body), req.file, (0, session_helpers_1.clientIp)(req))) };
    }
    async deleteDocument(req) {
        await this.documents.remove(req.actor, id(req), (0, session_helpers_1.clientIp)(req));
    }
    // --- PQRSD ---
    async listPqrsd(req) {
        return (0, common_2.paged)(await this.pqrsd.list(req.actor, (0, session_helpers_1.valid)(req, 'query', S.PqrsdQuery)), S.toPqrsdItem);
    }
    async getPqrsd(req) {
        return { data: S.toPqrsd(await this.pqrsd.get(req.actor, id(req), (0, session_helpers_1.clientIp)(req))) };
    }
    async respondPqrsd(req) {
        const d = await this.pqrsd.respond(req.actor, id(req), (0, session_helpers_1.valid)(req, 'body', S.PqrsdRespond), (0, session_helpers_1.clientIp)(req));
        return { data: S.toPqrsd(d) };
    }
};
exports.ContentController = ContentController;
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/medios', {
        tags: MEDIA,
        auth: 'media.read',
        summary: 'Listar la biblioteca con búsqueda y filtros',
        request: { query: S.MediaQuery },
        response: { description: 'Página de archivos', schema: S.MediaList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "listMedia", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/medios', {
        tags: MEDIA,
        auth: 'media.upload',
        rateLimit: 'upload',
        summary: 'Subir imágenes o audios',
        description: 'Se verifica el contenido real (no la extensión ni el MIME declarado). Las imágenes se re-codifican sin metadatos. Los archivos quedan privados hasta que se marquen públicos o los use un contenido publicado.',
        upload: { field: 'archivos', maxFiles: 10, maxBytes: mediaMax, form: S.MediaUploadForm },
        response: { description: 'Archivos guardados', schema: S.MediaUploadResult },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "uploadMedia", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/medios/{id}', {
        tags: MEDIA,
        auth: 'media.read',
        summary: 'Consultar un archivo y dónde se usa',
        request: { params: common_2.IdParams },
        response: { description: 'Archivo', schema: S.MediaOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "getMedia", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/medios/{id}/archivo', {
        tags: MEDIA,
        auth: 'media.read',
        summary: 'Descargar o previsualizar el archivo (también privados)',
        request: { params: common_2.IdParams, query: S.FileQuery },
        file: { description: 'Contenido binario del archivo', mime: 'image/*' },
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "mediaFile", null);
__decorate([
    (0, route_spec_1.Endpoint)('patch', '/api/v1/medios/{id}', {
        tags: MEDIA,
        auth: 'media.update',
        summary: 'Actualizar nombre visible, texto alternativo, descripción o visibilidad',
        request: { params: common_2.IdParams, body: S.MediaUpdate },
        errors: [409],
        response: { description: 'Actualizado', schema: S.MediaOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "updateMedia", null);
__decorate([
    (0, route_spec_1.Endpoint)('put', '/api/v1/medios/{id}/archivo', {
        tags: MEDIA,
        auth: 'media.update',
        rateLimit: 'upload',
        summary: 'Reemplazar el archivo manteniendo su ID',
        description: 'Si el archivo está en uso responde 409 con la lista de usos; reenvíe con `confirmar=true`. Debe ser del mismo tipo (imagen/audio).',
        upload: { field: 'archivo', maxFiles: 1, maxBytes: mediaMax, form: S.MediaReplaceForm },
        request: { params: common_2.IdParams },
        errors: [409],
        response: { description: 'Reemplazado', schema: S.MediaOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "replaceMedia", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/medios/{id}', {
        status: 204,
        tags: MEDIA,
        auth: 'media.delete',
        summary: 'Eliminar definitivamente',
        description: 'Si el archivo está en uso responde 409 con la lista de usos; reenvíe con `?confirmar=true`.',
        request: { params: common_2.IdParams, query: S.ConfirmQuery },
        errors: [409],
        response: { description: 'Eliminado' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "deleteMedia", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/paginas', {
        tags: PAGES,
        auth: 'pages.read',
        summary: 'Listar páginas (borradores y publicadas)',
        request: { query: S.PageQuery },
        response: { description: 'Páginas', schema: S.PageList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "listPages", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/paginas', {
        tags: PAGES,
        auth: 'pages.create',
        bodyLimit: 1024 * KB,
        summary: 'Crear página',
        description: 'Publicar directamente exige `pages.publish`. El slug debe ser único y no reservado.',
        request: { body: S.PageCreate },
        errors: [409],
        response: { description: 'Página creada', schema: S.PageOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "createPage", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/paginas/{id}', {
        tags: PAGES,
        auth: 'pages.read',
        summary: 'Consultar página con sus bloques',
        request: { params: common_2.IdParams },
        response: { description: 'Página', schema: S.PageOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "getPage", null);
__decorate([
    (0, route_spec_1.Endpoint)('put', '/api/v1/paginas/{id}', {
        tags: PAGES,
        auth: 'pages.update',
        bodyLimit: 1024 * KB,
        summary: 'Editar o publicar página',
        description: 'Cambiar a publicada, o editar una página publicada, exige `pages.publish`. Las páginas del sistema no cambian de slug. Envíe `version` para detectar ediciones simultáneas.',
        request: { params: common_2.IdParams, body: S.PageUpdate },
        errors: [409],
        response: { description: 'Página guardada', schema: S.PageOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "updatePage", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/paginas/{id}', {
        status: 204,
        tags: PAGES,
        auth: 'pages.delete',
        summary: 'Eliminar página definitivamente',
        description: 'Las páginas del sistema no se pueden eliminar.',
        request: { params: common_2.IdParams },
        response: { description: 'Eliminada' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "deletePage", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/noticias', {
        tags: NEWS,
        auth: 'news.read',
        summary: 'Listar noticias (borradores y publicadas)',
        request: { query: S.NewsQuery },
        response: { description: 'Noticias', schema: S.NewsList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "listNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/noticias', {
        tags: NEWS,
        auth: 'news.create',
        bodyLimit: 512 * KB,
        summary: 'Crear noticia',
        description: 'Imagen principal y fotos se eligen de la biblioteca por ID. Publicar exige `news.publish`.',
        request: { body: S.NewsCreate },
        errors: [409],
        response: { description: 'Noticia creada', schema: S.NewsOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "createNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/noticias/{id}', {
        tags: NEWS,
        auth: 'news.read',
        summary: 'Consultar noticia',
        request: { params: common_2.IdParams },
        response: { description: 'Noticia', schema: S.NewsOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "getNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('put', '/api/v1/noticias/{id}', {
        tags: NEWS,
        auth: 'news.update',
        bodyLimit: 512 * KB,
        summary: 'Editar o publicar noticia',
        description: 'Envíe `version` para detectar ediciones simultáneas (409 EDIT_CONFLICT).',
        request: { params: common_2.IdParams, body: S.NewsUpdate },
        errors: [409],
        response: { description: 'Noticia guardada', schema: S.NewsOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "updateNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/noticias/{id}', {
        status: 204,
        tags: NEWS,
        auth: 'news.delete',
        summary: 'Eliminar noticia definitivamente',
        request: { params: common_2.IdParams },
        response: { description: 'Eliminada' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "deleteNews", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/sliders', {
        tags: SLIDERS,
        auth: 'sliders.read',
        summary: 'Listar sliders',
        response: { description: 'Sliders', schema: S.SliderList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "listSliders", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/sliders', {
        tags: SLIDERS,
        auth: 'sliders.create',
        summary: 'Crear slider en una ubicación',
        description: 'Ubicaciones: `inicio` o `pagina:<slug>` (p. ej. `pagina:secretaria`, `pagina:contacto`). Una por slider.',
        request: { body: S.SliderCreate },
        errors: [409],
        response: { description: 'Slider creado', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "createSlider", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/sliders/{id}', {
        tags: SLIDERS,
        auth: 'sliders.read',
        summary: 'Consultar slider con sus diapositivas',
        request: { params: common_2.IdParams },
        response: { description: 'Slider', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "getSlider", null);
__decorate([
    (0, route_spec_1.Endpoint)('patch', '/api/v1/sliders/{id}', {
        tags: SLIDERS,
        auth: 'sliders.update',
        summary: 'Renombrar, mover o activar/desactivar',
        request: { params: common_2.IdParams, body: S.SliderUpdate },
        errors: [409],
        response: { description: 'Slider actualizado', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "updateSlider", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/sliders/{id}', {
        status: 204,
        tags: SLIDERS,
        auth: 'sliders.delete',
        summary: 'Eliminar slider definitivamente',
        request: { params: common_2.IdParams },
        response: { description: 'Eliminado' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "deleteSlider", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/sliders/{id}/diapositivas', {
        tags: SLIDERS,
        auth: 'sliders.update',
        summary: 'Agregar diapositiva',
        request: { params: common_2.IdParams, body: S.SlideCreate },
        errors: [409],
        response: { description: 'Slider actualizado', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "addSlide", null);
__decorate([
    (0, route_spec_1.Endpoint)('put', '/api/v1/sliders/{id}/orden', {
        tags: SLIDERS,
        auth: 'sliders.update',
        summary: 'Ordenar diapositivas',
        request: { params: common_2.IdParams, body: S.ReorderBody },
        errors: [409],
        response: { description: 'Slider actualizado', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "reorder", null);
__decorate([
    (0, route_spec_1.Endpoint)('patch', '/api/v1/sliders/{id}/diapositivas/{diapositivaId}', {
        tags: SLIDERS,
        auth: 'sliders.update',
        summary: 'Editar, reemplazar imagen o activar/desactivar diapositiva',
        request: { params: S.SlideParams, body: S.SlideUpdate },
        errors: [409],
        response: { description: 'Slider actualizado', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "updateSlide", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/sliders/{id}/diapositivas/{diapositivaId}', {
        status: 200,
        tags: SLIDERS,
        auth: 'sliders.delete',
        summary: 'Eliminar diapositiva definitivamente',
        request: { params: S.SlideParams, query: S.VersionQuery },
        errors: [409],
        response: { description: 'Slider actualizado', schema: S.SliderOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "removeSlide", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/documentos', {
        tags: DOCS,
        auth: 'documents.read',
        summary: 'Listar documentos',
        request: { query: S.DocumentQuery },
        response: { description: 'Documentos', schema: S.DocumentList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "listDocuments", null);
__decorate([
    (0, route_spec_1.Endpoint)('post', '/api/v1/documentos', {
        tags: DOCS,
        auth: 'documents.create',
        rateLimit: 'upload',
        summary: 'Publicar documento PDF',
        upload: { field: 'archivo', maxFiles: 1, maxBytes: (c) => c.uploads.maxDocumentBytes, form: S.DocumentForm },
        response: { description: 'Publicado', schema: S.DocumentOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "createDocument", null);
__decorate([
    (0, route_spec_1.Endpoint)('delete', '/api/v1/documentos/{id}', {
        status: 204,
        tags: DOCS,
        auth: 'documents.delete',
        summary: 'Eliminar documento definitivamente',
        request: { params: common_2.IdParams },
        response: { description: 'Eliminado' },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "deleteDocument", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/pqrsd', {
        tags: PQRSD,
        auth: 'pqrsd.read',
        summary: 'Listar solicitudes',
        request: { query: S.PqrsdQuery },
        response: { description: 'Solicitudes', schema: S.PqrsdList },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "listPqrsd", null);
__decorate([
    (0, route_spec_1.Endpoint)('get', '/api/v1/pqrsd/{id}', {
        tags: PQRSD,
        auth: 'pqrsd.read',
        summary: 'Consultar solicitud (datos personales, auditado)',
        request: { params: common_2.IdParams },
        response: { description: 'Solicitud', schema: S.PqrsdOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "getPqrsd", null);
__decorate([
    (0, route_spec_1.Endpoint)('put', '/api/v1/pqrsd/{id}/respuesta', {
        tags: PQRSD,
        auth: 'pqrsd.respond',
        summary: 'Responder y cambiar estado',
        request: { params: common_2.IdParams, body: S.PqrsdRespond },
        response: { description: 'Solicitud actualizada', schema: S.PqrsdOne },
    }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ContentController.prototype, "respondPqrsd", null);
exports.ContentController = ContentController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [media_service_1.MediaService,
        content_services_1.PageService,
        content_services_1.NewsService,
        content_services_1.SliderService,
        citizen_services_1.DocumentService,
        citizen_services_1.PqrsdService])
], ContentController);
//# sourceMappingURL=content.controller.js.map