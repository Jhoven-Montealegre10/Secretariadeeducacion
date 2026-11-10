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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocsController = exports.OpenApiDocs = void 0;
/**
 * Documentación de la API:
 *  - /api/v1/openapi-publica.json y /api/docs  → solo endpoints públicos (abierto).
 *  - /api/v1/openapi.json y /admin/api-docs     → especificación completa (requiere sesión del panel).
 * En producción las pruebas interactivas quedan desactivadas por defecto (API_DOCS_TRY_IT_OUT=false).
 */
const common_1 = require("@nestjs/common");
const errors_1 = require("../../../../domain/errors");
const configuration_1 = require("../../../../config/configuration");
const route_spec_1 = require("../../route-spec");
const headers_1 = require("../../security/headers");
const openapi_document_1 = require("../openapi-document");
/** Documentos generados al arrancar (main.ts) y servidos desde memoria. */
let OpenApiDocs = class OpenApiDocs {
    publicDoc = null;
    fullDoc = null;
};
exports.OpenApiDocs = OpenApiDocs;
exports.OpenApiDocs = OpenApiDocs = __decorate([
    (0, common_1.Injectable)()
], OpenApiDocs);
let DocsController = class DocsController {
    docs;
    config;
    constructor(docs, config) {
        this.docs = docs;
        this.config = config;
    }
    requirePanel(req, res) {
        if (req.actor?.permisos.has('dashboard.access'))
            return true;
        if (req.accepts(['html', 'json']) === 'html') {
            res.redirect('/admin/login');
            return false;
        }
        throw new errors_1.UnauthorizedError();
    }
    publicSpec(res) {
        res.json(this.docs.publicDoc);
    }
    fullSpec(req, res) {
        if (!this.requirePanel(req, res))
            return;
        (0, headers_1.noStore)(res);
        res.json(this.docs.fullDoc);
    }
    publicUi(res) {
        res.type('html').send((0, openapi_document_1.swaggerPage)({ title: 'API pública – SEM Ibagué', specUrl: '/api/v1/openapi-publica.json', mode: 'public' }));
    }
    fullUi(req, res) {
        if (!this.requirePanel(req, res))
            return;
        (0, headers_1.noStore)(res);
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.type('html').send((0, openapi_document_1.swaggerPage)({ title: 'API completa – SEM Ibagué', specUrl: '/api/v1/openapi.json', mode: this.config.api.docsTryItOut ? 'admin' : 'readonly' }));
    }
};
exports.DocsController = DocsController;
__decorate([
    (0, route_spec_1.WebRoute)('get', '/api/v1/openapi-publica.json', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "publicSpec", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/api/v1/openapi.json', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "fullSpec", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/api/docs', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "publicUi", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin/api-docs', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], DocsController.prototype, "fullUi", null);
exports.DocsController = DocsController = __decorate([
    (0, common_1.Controller)(),
    __param(1, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [OpenApiDocs, Object])
], DocsController);
//# sourceMappingURL=docs.controller.js.map