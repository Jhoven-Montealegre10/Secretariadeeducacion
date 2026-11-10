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
exports.AdminWebController = void 0;
/**
 * Panel de administración: el servidor solo entrega la estructura (SPA) y las vistas previas
 * protegidas; todas las operaciones se hacen desde el navegador contra la API REST.
 */
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const authorization_1 = require("../../application/authorization");
const content_services_1 = require("../../application/content.services");
const errors_1 = require("../../domain/errors");
const route_spec_1 = require("../http/route-spec");
const headers_1 = require("../http/security/headers");
const site_controller_1 = require("./site.controller");
const idParam = (v) => {
    const r = zod_1.z.coerce.number().int().positive().max(2_147_483_647).safeParse(v);
    if (!r.success)
        throw new errors_1.NotFoundError();
    return r.data;
};
const privateHtml = (res) => {
    (0, headers_1.noStore)(res);
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
};
let AdminWebController = class AdminWebController {
    pages;
    news;
    sliders;
    blocks;
    constructor(pages, news, sliders, blocks) {
        this.pages = pages;
        this.news = news;
        this.sliders = sliders;
        this.blocks = blocks;
    }
    login(req, res) {
        privateHtml(res);
        if (req.actor)
            return res.redirect('/admin');
        res.render('admin/auth', { title: 'Ingreso al panel', vista: 'login' });
    }
    reset(res) {
        privateHtml(res);
        res.render('admin/auth', { title: 'Definir contraseña', vista: 'restablecer' });
    }
    /** Vista previa protegida de páginas en borrador (no indexable, sin caché). */
    async previewPage(req, res) {
        privateHtml(res);
        (0, authorization_1.authorize)(req.actor, 'pages.read');
        const pagina = await this.pages.get(req.actor, idParam(req.params.id));
        const bloques = this.pages.sanitizeBlocks(pagina.bloques);
        res.render('pages/pagina', {
            title: `Vista previa: ${pagina.titulo}`,
            nav: pagina.slug,
            pagina: { ...pagina, bloques },
            vistaPrevia: true,
            slider: await this.sliders.getPublic(`pagina:${pagina.slug}`),
            ...(await this.blocks.build(bloques)),
        });
    }
    async previewNews(req, res) {
        privateHtml(res);
        (0, authorization_1.authorize)(req.actor, 'news.read');
        const noticia = await this.news.get(req.actor, idParam(req.params.id));
        const fotos = noticia.fotos ?? [];
        res.render('pages/noticia', {
            title: `Vista previa: ${noticia.titulo}`,
            nav: 'noticias',
            noticia: { ...noticia, contenido: this.news.sanitize(noticia.contenido), fotos },
            otras: [],
            imagenes: await this.blocks.mediaMap([noticia.imagenId, ...fotos]),
            vistaPrevia: true,
        });
    }
    shell(req, res) {
        privateHtml(res);
        if (!req.actor)
            return res.redirect('/admin/login');
        res.render('admin/app', { title: 'Panel de administración' });
    }
    shellDeep(req, res) {
        return this.shell(req, res);
    }
};
exports.AdminWebController = AdminWebController;
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin/login', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminWebController.prototype, "login", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin/restablecer', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminWebController.prototype, "reset", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin/vista-previa/paginas/:id', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminWebController.prototype, "previewPage", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin/vista-previa/noticias/:id', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminWebController.prototype, "previewNews", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminWebController.prototype, "shell", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/admin/{*rest}', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminWebController.prototype, "shellDeep", null);
exports.AdminWebController = AdminWebController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [content_services_1.PageService,
        content_services_1.NewsService,
        content_services_1.SliderService,
        site_controller_1.BlockContext])
], AdminWebController);
//# sourceMappingURL=admin-web.controller.js.map