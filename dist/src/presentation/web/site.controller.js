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
exports.PageSlugController = exports.SiteController = exports.BlockContext = void 0;
/**
 * Sitio público renderizado en el servidor. Usa los mismos servicios que la API, de modo que
 * borradores y archivos privados nunca llegan al público. Las vistas EJS se conservan intactas.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const citizen_services_1 = require("../../application/citizen.services");
const content_services_1 = require("../../application/content.services");
const media_service_1 = require("../../application/media.service");
const content_1 = require("../../domain/content");
const errors_1 = require("../../domain/errors");
const route_spec_1 = require("../http/route-spec");
const headers_1 = require("../http/security/headers");
const pageQuery = zod_1.z.object({ page: zod_1.z.coerce.number().int().min(1).max(1000).catch(1) });
const textQuery = (max) => zod_1.z.string().trim().max(max).catch('');
/** Datos que necesitan las vistas de bloques: medios resueltos y bloques dinámicos. */
let BlockContext = class BlockContext {
    media;
    institutions;
    constructor(media, institutions) {
        this.media = media;
        this.institutions = institutions;
    }
    async mediaMap(ids) {
        return new Map((await this.media.findByIds(ids)).map((m) => [m.id, m]));
    }
    async build(bloques, { q = '' } = {}) {
        return {
            medios: await this.mediaMap((0, content_1.mediosEnBloques)(bloques)),
            instituciones: bloques.some((b) => b.tipo === 'directorioInstituciones') ? await this.institutions.list(q) : [],
            q,
        };
    }
};
exports.BlockContext = BlockContext;
exports.BlockContext = BlockContext = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [media_service_1.MediaService,
        citizen_services_1.InstitutionService])
], BlockContext);
/** Marca la respuesta para registrar la visita (estadísticas sin cookies). */
const track = (res, ruta) => {
    res.locals.trackView = ruta;
};
let SiteController = class SiteController {
    news;
    pages;
    sliders;
    documents;
    media;
    search;
    blocks;
    constructor(news, pages, sliders, documents, media, search, blocks) {
        this.news = news;
        this.pages = pages;
        this.sliders = sliders;
        this.documents = documents;
        this.media = media;
        this.search = search;
        this.blocks = blocks;
    }
    async home(res) {
        const noticias = await this.news.latestPublished(3);
        track(res, '/');
        res.render('pages/inicio', {
            title: 'Inicio',
            nav: 'inicio',
            noticias,
            imagenes: await this.blocks.mediaMap(noticias.map((n) => n.imagenId)),
            slider: await this.sliders.getPublic('inicio'),
        });
    }
    async newsIndex(req, res) {
        const { page } = pageQuery.parse(req.query);
        const result = await this.news.listPublished({ page, pageSize: 9 });
        track(res, '/noticias');
        res.render('pages/noticias', {
            title: 'Noticias',
            nav: 'noticias',
            items: result.items,
            page,
            pages: Math.max(1, Math.ceil(result.total / result.pageSize)),
            imagenes: await this.blocks.mediaMap(result.items.map((n) => n.imagenId)),
        });
    }
    async newsShow(req, res) {
        const noticia = await this.news.getPublished(String(req.params.slug));
        if (!noticia)
            throw new errors_1.NotFoundError();
        const otras = (await this.news.latestPublished(4)).filter((n) => n.id !== noticia.id).slice(0, 3);
        track(res, `/noticias/${noticia.slug}`);
        res.render('pages/noticia', {
            title: noticia.titulo,
            nav: 'noticias',
            noticia: { ...noticia, fotos: noticia.fotos ?? [] },
            otras,
            imagenes: await this.blocks.mediaMap([noticia.imagenId, ...(noticia.fotos ?? []), ...otras.map((n) => n.imagenId)]),
        });
    }
    async normatividad(res) {
        track(res, '/normatividad');
        res.render('pages/normatividad', { title: 'Normatividad', nav: 'normatividad', grupos: await this.documents.groupedPublic() });
    }
    async document(req, res) {
        const id = zod_1.z.coerce.number().int().positive().max(2_147_483_647).safeParse(req.params.id);
        const file = id.success ? await this.documents.file(id.data) : null;
        if (!file)
            throw new errors_1.NotFoundError();
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${file.nombre}"`);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        (0, headers_1.sandboxFile)(res);
        node_fs_1.default.createReadStream(file.path).pipe(res);
    }
    /** Archivos de la biblioteca: solo públicos o usados en contenido publicado (streaming desde disco). */
    async mediaFile(req, res, next) {
        const file = await this.media.publicFile(String(req.params.file));
        if (!file)
            throw new errors_1.NotFoundError();
        (0, headers_1.sandboxFile)(res);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.type(file.mime).sendFile(file.path, (err) => err && next(err));
    }
    async searchPage(req, res) {
        const q = textQuery(100).parse(req.query.q);
        const results = q.length >= 2 ? await this.search.search(q) : { secciones: [], paginas: [], noticias: [], documentos: [] };
        res.render('pages/buscar', { title: 'Buscar', q, ...results, tipos: this.documents.TIPOS });
    }
    async siteMap(res) {
        res.render('pages/mapa-sitio', { title: 'Mapa del sitio', paginas: await this.pages.listPublished() });
    }
    securityTxt(res) {
        res.type('text/plain').send('Contact: mailto:educacion@ibague.gov.co\nPreferred-Languages: es\nPolicy: /transparencia#terminos\n');
    }
    robots(res) {
        res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /api/\n');
    }
};
exports.SiteController = SiteController;
__decorate([
    (0, route_spec_1.WebRoute)('get', '/', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "home", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/noticias', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "newsIndex", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/noticias/:slug', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "newsShow", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/normatividad', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "normatividad", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/documentos/:id', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "document", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/media/:file', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __param(2, (0, common_1.Next)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Function]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "mediaFile", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/buscar', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "searchPage", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/mapa-del-sitio', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SiteController.prototype, "siteMap", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/.well-known/security.txt', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SiteController.prototype, "securityTxt", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/robots.txt', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], SiteController.prototype, "robots", null);
exports.SiteController = SiteController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [content_services_1.NewsService,
        content_services_1.PageService,
        content_services_1.SliderService,
        citizen_services_1.DocumentService,
        media_service_1.MediaService,
        citizen_services_1.SearchService,
        BlockContext])
], SiteController);
/** Páginas editables por slug (secretaria, tramites, comunidad…). Se registra AL FINAL. */
let PageSlugController = class PageSlugController {
    pages;
    sliders;
    blocks;
    constructor(pages, sliders, blocks) {
        this.pages = pages;
        this.sliders = sliders;
        this.blocks = blocks;
    }
    async page(req, res) {
        const pagina = await this.pages.getPublished(String(req.params.slug));
        if (!pagina)
            throw new errors_1.NotFoundError();
        const q = textQuery(80).parse(req.query.q);
        track(res, `/${pagina.slug}`);
        res.render('pages/pagina', {
            title: pagina.titulo,
            nav: pagina.slug,
            pagina,
            slider: await this.sliders.getPublic(`pagina:${pagina.slug}`),
            ...(await this.blocks.build(pagina.bloques, { q })),
        });
    }
};
exports.PageSlugController = PageSlugController;
__decorate([
    (0, route_spec_1.WebRoute)('get', '/:slug', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PageSlugController.prototype, "page", null);
exports.PageSlugController = PageSlugController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [content_services_1.PageService,
        content_services_1.SliderService,
        BlockContext])
], PageSlugController);
//# sourceMappingURL=site.controller.js.map