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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SliderService = exports.NewsService = exports.CATEGORIAS = exports.PageService = void 0;
exports.sanitizeBlocks = sanitizeBlocks;
/**
 * Páginas por bloques, noticias y sliders.
 * Reglas comunes:
 *  - publicar, despublicar o editar algo ya publicado exige el permiso *.publish;
 *  - todo HTML se sanitiza en el servidor; los borradores nunca son públicos;
 *  - bloqueo optimista: si el cliente envía `version` y otra persona guardó antes, 409 EDIT_CONFLICT;
 *  - cada cambio invalida la caché pública tras el COMMIT;
 *  - las filas se bloquean (SELECT … FOR UPDATE) solo durante la transacción corta de guardado.
 */
const common_1 = require("@nestjs/common");
const content_1 = require("../domain/content");
const errors_1 = require("../domain/errors");
const publication_1 = require("../domain/publication");
const public_cache_service_1 = require("../infrastructure/cache/public-cache.service");
const db_service_1 = require("../infrastructure/database/db.service");
const content_repositories_1 = require("../infrastructure/repositories/content.repositories");
const html_sanitizer_service_1 = require("../infrastructure/security/html-sanitizer.service");
const audit_service_1 = require("./audit.service");
const authorization_1 = require("./authorization");
const media_service_1 = require("./media.service");
/** Sanitiza todo HTML presente en los bloques. */
function sanitizeBlocks(bloques, sanitize) {
    return bloques.map((b) => {
        switch (b.tipo) {
            case 'texto':
            case 'aviso':
                return { ...b, html: sanitize(String(b.html ?? '')) };
            case 'acordeon':
                return {
                    ...b,
                    intro: sanitize(String(b.intro ?? '')),
                    items: b.items.map((i) => ({ ...i, html: sanitize(String(i.html ?? '')) })),
                };
            default:
                return b;
        }
    });
}
const slugError = () => new errors_1.ValidationError('La dirección solo admite minúsculas, números y guiones.', [{ campo: 'slug', mensaje: 'Formato inválido' }]);
let PageService = class PageService {
    db;
    pages;
    media;
    sanitizer;
    audit;
    cache;
    constructor(db, pages, media, sanitizer, audit, cache) {
        this.db = db;
        this.pages = pages;
        this.media = media;
        this.sanitizer = sanitizer;
        this.audit = audit;
        this.cache = cache;
    }
    sanitizeBlocks(bloques) {
        return sanitizeBlocks(bloques, (h) => this.sanitizer.sanitizeRichText(h));
    }
    async requirePage(id, forUpdate = false) {
        const p = await this.pages.findById(id, { forUpdate });
        if (!p)
            throw new errors_1.NotFoundError('La página no existe.');
        return p;
    }
    async normalizeSlug(slug, titulo, exceptId) {
        const value = (slug || (0, content_1.slugify)(titulo)).trim().toLowerCase();
        if (!content_1.SLUG_RE.test(value) || value.length > 80)
            throw slugError();
        if (content_1.SLUGS_RESERVADOS.includes(value))
            throw new errors_1.ValidationError('Esa dirección está reservada por el sistema.', [{ campo: 'slug', mensaje: 'Reservada' }]);
        if (await this.pages.slugExists(value, exceptId))
            throw this.duplicate();
        return value;
    }
    duplicate() {
        return new errors_1.ConflictError('Ya existe una página con esa dirección.', [{ campo: 'slug', mensaje: 'Duplicada' }]);
    }
    async prepareBlocks(bloques) {
        const parsed = content_1.bloquesSchema.safeParse(bloques);
        if (!parsed.success)
            throw new errors_1.ValidationError('Los bloques de la página no son válidos.', parsed.error.issues.map((i) => ({ campo: `bloques.${i.path.join('.')}`, mensaje: i.message })));
        const clean = this.sanitizeBlocks(parsed.data);
        const imagenes = clean
            .filter((b) => b.tipo === 'imagen' || b.tipo === 'galeria')
            .flatMap((b) => (b.medioId ? [b.medioId] : (b.medios ?? [])));
        await this.media.assertUsable(imagenes, 'imagen');
        await this.media.assertUsable(clean.filter((b) => b.tipo === 'audio').map((b) => b.medioId), 'audio');
        return clean;
    }
    async persist(actor, id, data, accion, ip) {
        const pageId = id ?? (await this.pages.create(data, actor.id));
        if (id)
            await this.pages.update(id, data, actor.id);
        await this.media.syncUsages('pagina', pageId, (0, content_1.mediosEnBloques)(data.bloques), data.estado === 'publicada');
        await this.audit.record({ actor, accion, recurso: 'pagina', recursoId: pageId, detalle: `${data.slug} (${data.estado})`, ip });
        this.cache.invalidate();
        return (await this.pages.findById(pageId));
    }
    async guard(fn) {
        try {
            return await this.db.transaction(fn);
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw this.duplicate();
            throw err;
        }
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'pages.read');
        return this.pages.list(filters);
    }
    async get(actor, id) {
        (0, authorization_1.authorize)(actor, 'pages.read');
        return this.requirePage(id);
    }
    async create(actor, input, ip) {
        (0, authorization_1.authorize)(actor, 'pages.create');
        if ((0, publication_1.requierePermisoPublicar)(null, input.estado))
            (0, authorization_1.authorize)(actor, 'pages.publish');
        const titulo = input.titulo.trim();
        const bloques = await this.prepareBlocks(input.bloques ?? []);
        return this.guard(async () => {
            const data = {
                titulo,
                resumen: (input.resumen ?? '').trim(),
                estado: input.estado,
                bloques,
                slug: await this.normalizeSlug(input.slug, titulo, 0),
            };
            return this.persist(actor, null, data, (0, publication_1.accionPublicacion)('pagina', null, input.estado), ip);
        });
    }
    async update(actor, id, input, ip) {
        (0, authorization_1.authorize)(actor, 'pages.update');
        const bloques = input.bloques ? await this.prepareBlocks(input.bloques) : null;
        return this.guard(async () => {
            const page = await this.requirePage(id, true);
            if (!(0, publication_1.versionCoincide)(input.version, page.version))
                throw new errors_1.EditConflictError(page.version);
            const estado = input.estado ?? page.estado;
            if ((0, publication_1.requierePermisoPublicar)(page.estado, estado))
                (0, authorization_1.authorize)(actor, 'pages.publish');
            const slugInput = input.slug ?? page.slug;
            if (page.sistema && slugInput !== page.slug)
                throw new errors_1.ForbiddenError('La dirección de las páginas del sistema no se puede cambiar.');
            const titulo = (input.titulo ?? page.titulo).trim();
            const data = {
                titulo,
                resumen: (input.resumen ?? page.resumen).trim(),
                estado,
                bloques: bloques ?? page.bloques,
                slug: page.sistema ? page.slug : await this.normalizeSlug(slugInput, titulo, id),
            };
            return this.persist(actor, id, data, (0, publication_1.accionPublicacion)('pagina', page.estado, estado), ip);
        });
    }
    async remove(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'pages.delete');
        await this.db.transaction(async () => {
            const page = await this.requirePage(id, true);
            if (page.sistema)
                throw new errors_1.ForbiddenError('Las páginas del sistema no se pueden eliminar; puede editarlas o pasarlas a borrador.');
            await this.media.clearUsages('pagina', [id]);
            await this.pages.delete(id);
            await this.audit.record({ actor, accion: 'pagina_eliminar', recurso: 'pagina', recursoId: id, detalle: page.slug, ip });
            this.cache.invalidate();
        });
    }
    /** Sitio público: solo páginas publicadas (en caché). */
    async getPublished(slug) {
        if (!content_1.SLUG_RE.test(String(slug)))
            return null;
        return this.cache.get(`pagina:${slug}`, async () => {
            const page = await this.pages.findPublishedBySlug(slug);
            if (page)
                page.bloques = this.sanitizeBlocks(page.bloques); // defensa en profundidad
            return page;
        });
    }
    async listPublished() {
        return this.cache.get('paginas:publicadas', () => this.pages.listPublishedSlugs());
    }
    async countByStatus() {
        return this.pages.countByStatus();
    }
};
exports.PageService = PageService;
exports.PageService = PageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        content_repositories_1.PageRepository,
        media_service_1.MediaService,
        html_sanitizer_service_1.HtmlSanitizer,
        audit_service_1.AuditService,
        public_cache_service_1.PublicCache])
], PageService);
// ---------------------------------------------------------------- Noticias
exports.CATEGORIAS = Object.freeze([
    'Institucional',
    'Cobertura',
    'Calidad educativa',
    'Normatividad',
    'Talento humano',
    'Bienestar',
    'Transparencia',
]);
let NewsService = class NewsService {
    db;
    news;
    media;
    sanitizer;
    audit;
    cache;
    CATEGORIAS = exports.CATEGORIAS;
    constructor(db, news, media, sanitizer, audit, cache) {
        this.db = db;
        this.news = news;
        this.media = media;
        this.sanitizer = sanitizer;
        this.audit = audit;
        this.cache = cache;
    }
    async requireNews(id, forUpdate = false) {
        const n = await this.news.findById(id, { forUpdate });
        if (!n)
            throw new errors_1.NotFoundError('La noticia no existe.');
        return n;
    }
    duplicate() {
        return new errors_1.ConflictError('Ya existe una noticia con esa dirección.', [{ campo: 'slug', mensaje: 'Duplicada' }]);
    }
    async uniqueSlug(slug, titulo, exceptId) {
        if (slug) {
            if (!content_1.SLUG_RE.test(slug) || slug.length > 120)
                throw slugError();
            if (await this.news.slugExists(slug, exceptId))
                throw this.duplicate();
            return slug;
        }
        const base = (0, content_1.slugify)(titulo) || 'noticia';
        let candidate = base;
        for (let i = 2; await this.news.slugExists(candidate, exceptId); i++)
            candidate = `${base}-${i}`;
        return candidate;
    }
    /** Combina la entrada con el estado actual y valida reglas de negocio (sin tocar la BD salvo multimedia). */
    async prepare(input, current) {
        const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
        const merged = { ...(current ?? {}), ...defined };
        if (!exports.CATEGORIAS.includes(merged.categoria))
            throw new errors_1.ValidationError('Categoría no válida.', [{ campo: 'categoria', mensaje: `Use: ${exports.CATEGORIAS.join(', ')}` }]);
        const contenido = this.sanitizer.sanitizeRichText(merged.contenido ?? '');
        if (this.sanitizer.stripTags(contenido).length < 20)
            throw new errors_1.ValidationError('El contenido debe tener al menos 20 caracteres de texto.', [{ campo: 'contenido', mensaje: 'Muy corto' }]);
        const fotos = [...new Set(merged.fotos ?? [])];
        await this.media.assertUsable([merged.imagenId, ...fotos], 'imagen');
        return {
            titulo: String(merged.titulo ?? '').trim(),
            resumen: String(merged.resumen ?? '').trim(),
            contenido,
            categoria: merged.categoria,
            estado: merged.estado,
            fechaPublicacion: merged.fechaPublicacion,
            imagenId: merged.imagenId ?? null,
            fotos,
        };
    }
    async persist(actor, id, data, accion, ip) {
        const newsId = id ?? (await this.news.create(data, actor.id));
        if (id)
            await this.news.update(id, data, actor.id);
        await this.news.setPhotos(newsId, data.fotos);
        await this.media.syncUsages('noticia', newsId, [data.imagenId, ...data.fotos], data.estado === 'publicada');
        await this.audit.record({ actor, accion, recurso: 'noticia', recursoId: newsId, detalle: `${data.slug} (${data.estado})`, ip });
        this.cache.invalidate(); // el inicio y el listado público se actualizan al publicar
        return (await this.news.findById(newsId));
    }
    async guard(fn) {
        try {
            return await this.db.transaction(fn);
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw this.duplicate();
            throw err;
        }
    }
    sanitize(html) {
        return this.sanitizer.sanitizeRichText(html);
    }
    async list(actor, filters) {
        (0, authorization_1.authorize)(actor, 'news.read');
        return this.news.list({ ...filters, soloPublicadas: false });
    }
    async get(actor, id) {
        (0, authorization_1.authorize)(actor, 'news.read');
        return this.requireNews(id);
    }
    async create(actor, input, ip) {
        (0, authorization_1.authorize)(actor, 'news.create');
        if ((0, publication_1.requierePermisoPublicar)(null, input.estado))
            (0, authorization_1.authorize)(actor, 'news.publish');
        const data = await this.prepare(input);
        return this.guard(async () => this.persist(actor, null, { ...data, slug: await this.uniqueSlug(input.slug, data.titulo, 0) }, (0, publication_1.accionPublicacion)('noticia', null, data.estado), ip));
    }
    async update(actor, id, input, ip) {
        (0, authorization_1.authorize)(actor, 'news.update');
        return this.guard(async () => {
            const current = await this.requireNews(id, true);
            if (!(0, publication_1.versionCoincide)(input.version, current.version))
                throw new errors_1.EditConflictError(current.version);
            const data = await this.prepare(input, current);
            if ((0, publication_1.requierePermisoPublicar)(current.estado, data.estado))
                (0, authorization_1.authorize)(actor, 'news.publish');
            const slug = input.slug && input.slug !== current.slug ? await this.uniqueSlug(input.slug, data.titulo, id) : current.slug;
            return this.persist(actor, id, { ...data, slug }, (0, publication_1.accionPublicacion)('noticia', current.estado, data.estado), ip);
        });
    }
    async remove(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'news.delete');
        await this.db.transaction(async () => {
            const n = await this.requireNews(id, true);
            await this.media.clearUsages('noticia', [id]);
            await this.news.delete(id);
            await this.audit.record({ actor, accion: 'noticia_eliminar', recurso: 'noticia', recursoId: id, detalle: n.slug, ip });
            this.cache.invalidate();
        });
    }
    // --- Sitio y API públicos: solo publicadas con fecha cumplida (en caché) ---
    async listPublished({ page = 1, pageSize = 9, q } = {}) {
        const load = () => this.news.list({ page, pageSize, q, soloPublicadas: true });
        // Las búsquedas libres no se guardan en caché (claves ilimitadas).
        return q ? load() : this.cache.get(`noticias:${page}:${pageSize}`, load);
    }
    async latestPublished(limit = 3) {
        return (await this.listPublished({ page: 1, pageSize: limit })).items;
    }
    async getPublished(slug) {
        if (!content_1.SLUG_RE.test(String(slug)))
            return null;
        return this.cache.get(`noticia:${slug}`, async () => {
            const n = await this.news.findPublishedBySlug(slug);
            if (n)
                n.contenido = this.sanitizer.sanitizeRichText(n.contenido); // defensa en profundidad
            return n;
        });
    }
    async countByStatus() {
        return this.news.countByStatus();
    }
};
exports.NewsService = NewsService;
exports.NewsService = NewsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        content_repositories_1.NewsRepository,
        media_service_1.MediaService,
        html_sanitizer_service_1.HtmlSanitizer,
        audit_service_1.AuditService,
        public_cache_service_1.PublicCache])
], NewsService);
/**
 * Sliders por ubicación ('inicio' o 'pagina:<slug>') con diapositivas ordenadas.
 * Editar y agregar exige sliders.update; eliminar (slider o diapositiva) exige sliders.delete.
 * Cada cambio de diapositivas incrementa la versión del slider (bloqueo optimista del conjunto).
 */
let SliderService = class SliderService {
    db;
    sliders;
    media;
    audit;
    cache;
    constructor(db, sliders, media, audit, cache) {
        this.db = db;
        this.sliders = sliders;
        this.media = media;
        this.audit = audit;
        this.cache = cache;
    }
    async requireSlider(id, forUpdate = false) {
        const s = await this.sliders.findById(id, { forUpdate });
        if (!s)
            throw new errors_1.NotFoundError('El slider no existe.');
        return s;
    }
    async lockForChange(id, version) {
        const s = await this.requireSlider(id, true);
        if (!(0, publication_1.versionCoincide)(version, s.version))
            throw new errors_1.EditConflictError(s.version);
        return s;
    }
    duplicate() {
        return new errors_1.ConflictError('Ya existe un slider en esa ubicación.', [{ campo: 'ubicacion', mensaje: 'Ocupada' }]);
    }
    async validateLocation(ubicacion, exceptId) {
        if (!content_1.UBICACION_RE.test(ubicacion))
            throw new errors_1.ValidationError('Ubicación no válida. Use "inicio" o "pagina:<direccion>".', [{ campo: 'ubicacion', mensaje: 'Formato inválido' }]);
        if (await this.sliders.locationExists(ubicacion, exceptId))
            throw this.duplicate();
    }
    /** Recalcula si cada imagen del slider está publicada (slider activo y diapositiva activa). */
    async syncSliderUsages(sliderId) {
        const slider = (await this.sliders.findById(sliderId));
        for (const d of slider.diapositivas ?? [])
            await this.media.syncUsages('diapositiva', d.id, [d.medioId], slider.activo && d.activa);
    }
    async afterChange(actor, sliderId, accion, detalle, ip) {
        await this.syncSliderUsages(sliderId);
        await this.audit.record({ actor, accion, recurso: 'slider', recursoId: sliderId, detalle, ip });
        this.cache.invalidate();
        return (await this.sliders.findById(sliderId));
    }
    async guard(fn) {
        try {
            return await this.db.transaction(fn);
        }
        catch (err) {
            if ((0, db_service_1.pgCode)(err) === db_service_1.PG.UNIQUE_VIOLATION)
                throw this.duplicate();
            throw err;
        }
    }
    async list(actor) {
        (0, authorization_1.authorize)(actor, 'sliders.read');
        return this.sliders.list();
    }
    async get(actor, id) {
        (0, authorization_1.authorize)(actor, 'sliders.read');
        return this.requireSlider(id);
    }
    async create(actor, input, ip) {
        (0, authorization_1.authorize)(actor, 'sliders.create');
        return this.guard(async () => {
            await this.validateLocation(input.ubicacion, 0);
            const id = await this.sliders.create({ nombre: input.nombre.trim(), ubicacion: input.ubicacion, activo: input.activo ?? true }, actor.id);
            await this.audit.record({ actor, accion: 'slider_crear', recurso: 'slider', recursoId: id, detalle: input.ubicacion, ip });
            this.cache.invalidate();
            return (await this.sliders.findById(id));
        });
    }
    async update(actor, id, changes, ip) {
        (0, authorization_1.authorize)(actor, 'sliders.update');
        return this.guard(async () => {
            const s = await this.lockForChange(id, changes.version);
            const data = { nombre: (changes.nombre ?? s.nombre).trim(), ubicacion: changes.ubicacion ?? s.ubicacion, activo: changes.activo ?? s.activo };
            if (data.ubicacion !== s.ubicacion)
                await this.validateLocation(data.ubicacion, id);
            await this.sliders.update(id, data, actor.id);
            return this.afterChange(actor, id, 'slider_actualizar', `${data.ubicacion}${data.activo ? '' : ' (inactivo)'}`, ip);
        });
    }
    async remove(actor, id, ip) {
        (0, authorization_1.authorize)(actor, 'sliders.delete');
        await this.db.transaction(async () => {
            const s = await this.requireSlider(id, true);
            await this.media.clearUsages('diapositiva', await this.sliders.slideIdsOf(id));
            await this.sliders.delete(id);
            await this.audit.record({ actor, accion: 'slider_eliminar', recurso: 'slider', recursoId: id, detalle: s.ubicacion, ip });
            this.cache.invalidate();
        });
    }
    slideData(input, current) {
        const pick = (k, fallback) => input[k] !== undefined ? input[k] : (current?.[k] ?? fallback);
        return {
            medioId: pick('medioId', null),
            titulo: pick('titulo', ''),
            texto: pick('texto', ''),
            enlace: pick('enlace', ''),
            textoEnlace: pick('textoEnlace', ''),
            activa: pick('activa', true),
        };
    }
    async addSlide(actor, sliderId, input, ip) {
        (0, authorization_1.authorize)(actor, 'sliders.update');
        const data = this.slideData(input);
        if (!data.medioId)
            throw new errors_1.ValidationError('Seleccione una imagen para la diapositiva.', [{ campo: 'medioId', mensaje: 'Requerido' }]);
        await this.media.assertUsable([data.medioId], 'imagen');
        return this.db.transaction(async () => {
            await this.lockForChange(sliderId, input.version);
            const slideId = await this.sliders.createSlide(sliderId, data);
            await this.sliders.touch(sliderId, actor.id);
            return this.afterChange(actor, sliderId, 'diapositiva_crear', `diapositiva ${slideId}`, ip);
        });
    }
    async updateSlide(actor, sliderId, slideId, input, ip) {
        (0, authorization_1.authorize)(actor, 'sliders.update');
        return this.db.transaction(async () => {
            await this.lockForChange(sliderId, input.version);
            const current = await this.sliders.findSlide(sliderId, slideId);
            if (!current)
                throw new errors_1.NotFoundError('La diapositiva no existe en este slider.');
            const data = this.slideData(input, current);
            await this.media.assertUsable([data.medioId], 'imagen');
            await this.sliders.updateSlide(sliderId, slideId, data);
            await this.sliders.touch(sliderId, actor.id);
            return this.afterChange(actor, sliderId, 'diapositiva_actualizar', `diapositiva ${slideId}`, ip);
        });
    }
    async reorder(actor, sliderId, ids, ip, version) {
        (0, authorization_1.authorize)(actor, 'sliders.update');
        return this.db.transaction(async () => {
            await this.lockForChange(sliderId, version);
            if (!(0, publication_1.ordenValido)(await this.sliders.slideIdsOf(sliderId), ids))
                throw new errors_1.ValidationError('El orden debe incluir exactamente todas las diapositivas del slider.');
            await this.sliders.reorder(sliderId, ids);
            await this.sliders.touch(sliderId, actor.id);
            return this.afterChange(actor, sliderId, 'diapositivas_ordenar', '', ip);
        });
    }
    async removeSlide(actor, sliderId, slideId, ip, version) {
        (0, authorization_1.authorize)(actor, 'sliders.delete');
        return this.db.transaction(async () => {
            await this.lockForChange(sliderId, version);
            if (!(await this.sliders.findSlide(sliderId, slideId)))
                throw new errors_1.NotFoundError('La diapositiva no existe en este slider.');
            await this.media.clearUsages('diapositiva', [slideId]);
            await this.sliders.deleteSlide(sliderId, slideId);
            await this.sliders.touch(sliderId, actor.id);
            return this.afterChange(actor, sliderId, 'diapositiva_eliminar', `diapositiva ${slideId}`, ip);
        });
    }
    /** Sitio y API públicos: slider activo con diapositivas activas y su imagen (en caché). */
    async getPublic(ubicacion) {
        if (!content_1.UBICACION_RE.test(String(ubicacion)))
            return null;
        return this.cache.get(`slider:${ubicacion}`, async () => {
            const s = await this.sliders.findActiveByLocation(ubicacion);
            if (!s?.diapositivas?.length)
                return null;
            const medios = new Map((await this.media.findByIds(s.diapositivas.map((d) => d.medioId))).map((m) => [m.id, m]));
            const diapositivas = s.diapositivas
                .filter((d) => d.medioId !== null && medios.has(d.medioId))
                .map((d) => ({ ...d, medio: medios.get(d.medioId) }));
            return diapositivas.length ? { ...s, diapositivas } : null;
        });
    }
};
exports.SliderService = SliderService;
exports.SliderService = SliderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db,
        content_repositories_1.SliderRepository,
        media_service_1.MediaService,
        audit_service_1.AuditService,
        public_cache_service_1.PublicCache])
], SliderService);
//# sourceMappingURL=content.services.js.map