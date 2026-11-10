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
exports.InstitutionRepository = exports.DocumentRepository = exports.SliderRepository = exports.PageRepository = exports.NewsRepository = exports.MediaRepository = void 0;
/**
 * Repositorios de contenido: multimedia, noticias, páginas, sliders, normatividad e instituciones.
 * Las relaciones se cargan con JOIN o subconsultas agregadas en la misma sentencia (sin N+1).
 */
const common_1 = require("@nestjs/common");
const db_service_1 = require("../database/db.service");
const sql_1 = require("../database/sql");
const MEDIA_SELECT = `m.id, m.tipo, m.mime, m.extension, m.archivo, m.miniatura, m.nombre_visible, m.nombre_original, m.tamano,
  m.ancho, m.alto, m.texto_alternativo, m.descripcion, m.visibilidad, m.subido_por, m.version, m.creado_en, m.actualizado_en,
  (SELECT COUNT(*) FROM medios_usos mu WHERE mu.medio_id = m.id) AS total_usos`;
const MEDIA_SORT = { creadoEn: 'm.creado_en', nombreVisible: 'm.nombre_visible', tamano: 'm.tamano' };
const MEDIA_UPDATABLE = {
    nombreVisible: 'nombre_visible',
    textoAlternativo: 'texto_alternativo',
    descripcion: 'descripcion',
    visibilidad: 'visibilidad',
};
let MediaRepository = class MediaRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(f) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(f.page, f.pageSize);
        const q = (0, sql_1.likePattern)(f.q ?? '');
        const w = new sql_1.Where()
            .addIf(f.q, "m.nombre_visible ILIKE ? ESCAPE '\\' OR m.descripcion ILIKE ? ESCAPE '\\' OR m.texto_alternativo ILIKE ? ESCAPE '\\'", q, q, q)
            .addIf(f.tipo, 'm.tipo = ?', f.tipo)
            .addIf(f.visibilidad, 'm.visibilidad = ?', f.visibilidad);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM medios m ${w.sql}`, w.params);
        const order = (0, sql_1.orderBy)(f.sort, MEDIA_SORT, 'm.creado_en DESC, m.id DESC', 'm.id');
        const items = await this.db.rows(`SELECT ${MEDIA_SELECT} FROM medios m ${w.sql} ${order} LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items, total, page, pageSize };
    }
    async findById(id, { forUpdate = false } = {}) {
        if (forUpdate)
            await this.db.run('SELECT 1 FROM medios WHERE id = $1 FOR UPDATE', [id]);
        return this.db.row(`SELECT ${MEDIA_SELECT} FROM medios m WHERE m.id = $1`, [id]);
    }
    async findByIds(ids) {
        if (!ids.length)
            return [];
        return this.db.rows(`SELECT ${MEDIA_SELECT} FROM medios m WHERE m.id = ANY($1::int[])`, [ids]);
    }
    async findByFile(archivo) {
        return this.db.row(`SELECT ${MEDIA_SELECT} FROM medios m WHERE m.archivo = $1 OR m.miniatura = $1`, [archivo]);
    }
    async create(m) {
        return this.db.scalar(`INSERT INTO medios (tipo, mime, extension, archivo, miniatura, nombre_visible, nombre_original, tamano, ancho, alto,
         texto_alternativo, descripcion, visibilidad, subido_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14) RETURNING id`, [
            m.tipo,
            m.mime,
            m.extension,
            m.archivo,
            m.miniatura,
            m.nombreVisible,
            m.nombreOriginal,
            m.tamano,
            m.ancho,
            m.alto,
            m.textoAlternativo,
            m.descripcion,
            m.visibilidad,
            m.subidoPor,
        ]);
    }
    async update(id, fields, userId) {
        const entries = Object.entries(fields).filter(([k, v]) => Object.hasOwn(MEDIA_UPDATABLE, k) && v !== undefined);
        const sets = entries.map(([k], i) => `${MEDIA_UPDATABLE[k]} = $${i + 1}`);
        const n = entries.length;
        return this.db.run(`UPDATE medios SET ${[...sets, `actualizado_por = $${n + 1}`].join(', ')}, version = version + 1, actualizado_en = now() WHERE id = $${n + 2}`, [...entries.map(([, v]) => v), userId, id]);
    }
    async replaceFile(id, f, userId) {
        return this.db.run(`UPDATE medios SET mime = $1, extension = $2, archivo = $3, miniatura = $4, nombre_original = $5, tamano = $6, ancho = $7, alto = $8,
       actualizado_por = $9, version = version + 1, actualizado_en = now() WHERE id = $10`, [f.mime, f.extension, f.archivo, f.miniatura, f.nombreOriginal, f.tamano, f.ancho, f.alto, userId, id]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM medios WHERE id = $1', [id]);
    }
    async usagesOf(id) {
        return this.db.rows(`SELECT mu.entidad, mu.entidad_id, mu.publicado, COALESCE(p.titulo, n.titulo, s.nombre) AS titulo
       FROM medios_usos mu
       LEFT JOIN paginas p ON mu.entidad = 'pagina' AND p.id = mu.entidad_id
       LEFT JOIN noticias n ON mu.entidad = 'noticia' AND n.id = mu.entidad_id
       LEFT JOIN diapositivas d ON mu.entidad = 'diapositiva' AND d.id = mu.entidad_id
       LEFT JOIN sliders s ON s.id = d.slider_id
       WHERE mu.medio_id = $1 ORDER BY mu.entidad, mu.entidad_id`, [id]);
    }
    /** Reemplaza los usos registrados de una entidad (página, noticia o diapositiva). */
    async setUsages(entidad, entidadId, medioIds, publicado) {
        await this.db.run('DELETE FROM medios_usos WHERE entidad = $1 AND entidad_id = $2', [entidad, entidadId]);
        if (!medioIds.length)
            return;
        await this.db.run(`INSERT INTO medios_usos (medio_id, entidad, entidad_id, publicado)
       SELECT id, $1, $2, $3 FROM medios WHERE id = ANY($4::int[]) ON CONFLICT DO NOTHING`, [entidad, entidadId, publicado, medioIds]);
    }
    async clearUsages(entidad, entidadIds) {
        if (entidadIds.length)
            await this.db.run('DELETE FROM medios_usos WHERE entidad = $1 AND entidad_id = ANY($2::int[])', [entidad, entidadIds]);
    }
    /** Un archivo se sirve al público si es público o lo usa algún contenido publicado. */
    async isPubliclyServable(id) {
        return ((await this.db.scalar(`SELECT COUNT(*) FROM medios m WHERE m.id = $1 AND (m.visibilidad = 'publica'
         OR EXISTS (SELECT 1 FROM medios_usos mu WHERE mu.medio_id = m.id AND mu.publicado))`, [id])) > 0);
    }
};
exports.MediaRepository = MediaRepository;
exports.MediaRepository = MediaRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], MediaRepository);
const NEWS_SELECT = `n.id, n.slug, n.titulo, n.resumen, n.contenido, n.categoria, n.estado, n.fecha_publicacion, n.imagen_id,
  n.creado_por, n.actualizado_por, n.version, n.creado_en, n.actualizado_en`;
const NEWS_LIST_SELECT = `n.id, n.slug, n.titulo, n.resumen, n.categoria, n.estado, n.fecha_publicacion, n.imagen_id,
  n.creado_por, n.actualizado_por, n.version, n.creado_en, n.actualizado_en`;
const NEWS_SORT = { fechaPublicacion: 'n.fecha_publicacion', titulo: 'n.titulo', actualizadoEn: 'n.actualizado_en' };
/** Publicada y con fecha cumplida en hora de Colombia. */
const NEWS_PUBLISHED = "n.estado = 'publicada' AND n.fecha_publicacion <= (now() AT TIME ZONE 'America/Bogota')::date";
let NewsRepository = class NewsRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** El listado no trae el contenido completo (puede ser extenso): solo lo necesario para tarjetas y tablas. */
    async list(f) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(f.page, f.pageSize);
        const q = (0, sql_1.likePattern)(f.q ?? '');
        const w = new sql_1.Where()
            .addIf(f.soloPublicadas, NEWS_PUBLISHED)
            .addIf(f.q, "n.titulo ILIKE ? ESCAPE '\\' OR n.resumen ILIKE ? ESCAPE '\\' OR n.contenido ILIKE ? ESCAPE '\\'", q, q, q)
            .addIf(f.estado, 'n.estado = ?', f.estado)
            .addIf(f.categoria, 'n.categoria = ?', f.categoria);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM noticias n ${w.sql}`, w.params);
        const order = (0, sql_1.orderBy)(f.sort, NEWS_SORT, 'n.fecha_publicacion DESC, n.id DESC', 'n.id');
        const items = await this.db.rows(`SELECT ${f.conContenido ? NEWS_SELECT : NEWS_LIST_SELECT} FROM noticias n ${w.sql} ${order} LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items, total, page, pageSize };
    }
    withPhotosSql(where) {
        return `SELECT ${NEWS_SELECT},
      COALESCE((SELECT array_agg(nf.medio_id ORDER BY nf.orden) FROM noticia_fotos nf WHERE nf.noticia_id = n.id), '{}') AS fotos
      FROM noticias n WHERE ${where}`;
    }
    async findById(id, { forUpdate = false } = {}) {
        if (forUpdate)
            await this.db.run('SELECT 1 FROM noticias WHERE id = $1 FOR UPDATE', [id]);
        return this.db.row(this.withPhotosSql('n.id = $1'), [id]);
    }
    async findPublishedBySlug(slug) {
        return this.db.row(this.withPhotosSql(`n.slug = $1 AND ${NEWS_PUBLISHED}`), [slug]);
    }
    async slugExists(slug, exceptId = 0) {
        return (await this.db.scalar('SELECT COUNT(*) FROM noticias WHERE slug = $1 AND id <> $2', [slug, exceptId])) > 0;
    }
    async create(d, userId) {
        return this.db.scalar(`INSERT INTO noticias (slug, titulo, resumen, contenido, categoria, estado, fecha_publicacion, imagen_id, creado_por, actualizado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`, [d.slug, d.titulo, d.resumen, d.contenido, d.categoria, d.estado, d.fechaPublicacion, d.imagenId, userId]);
    }
    async update(id, d, userId) {
        return this.db.run(`UPDATE noticias SET slug = $1, titulo = $2, resumen = $3, contenido = $4, categoria = $5, estado = $6, fecha_publicacion = $7,
       imagen_id = $8, actualizado_por = $9, version = version + 1, actualizado_en = now() WHERE id = $10`, [d.slug, d.titulo, d.resumen, d.contenido, d.categoria, d.estado, d.fechaPublicacion, d.imagenId, userId, id]);
    }
    async setPhotos(id, medioIds) {
        await this.db.run('DELETE FROM noticia_fotos WHERE noticia_id = $1', [id]);
        if (!medioIds.length)
            return;
        await this.db.run(`INSERT INTO noticia_fotos (noticia_id, medio_id, orden)
       SELECT $1, t.medio_id, t.orden - 1 FROM unnest($2::int[]) WITH ORDINALITY AS t(medio_id, orden) ON CONFLICT DO NOTHING`, [id, medioIds]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM noticias WHERE id = $1', [id]);
    }
    async countByStatus() {
        return this.db.rows('SELECT estado, COUNT(*) AS n FROM noticias GROUP BY estado ORDER BY estado');
    }
};
exports.NewsRepository = NewsRepository;
exports.NewsRepository = NewsRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], NewsRepository);
const PAGE_SELECT = 'p.id, p.slug, p.titulo, p.resumen, p.bloques, p.estado, p.sistema, p.creado_por, p.actualizado_por, p.publicada_en, p.version, p.creado_en, p.actualizado_en';
const PAGE_LIST_SELECT = 'p.id, p.slug, p.titulo, p.resumen, p.estado, p.sistema, p.creado_por, p.actualizado_por, p.publicada_en, p.version, p.creado_en, p.actualizado_en';
const PAGE_SORT = { titulo: 'p.titulo', actualizadoEn: 'p.actualizado_en', slug: 'p.slug' };
let PageRepository = class PageRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    /** El listado omite los bloques (JSON potencialmente grande). */
    async list(f) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(f.page, f.pageSize);
        const q = (0, sql_1.likePattern)(f.q ?? '');
        const w = new sql_1.Where().addIf(f.q, "p.titulo ILIKE ? ESCAPE '\\' OR p.slug ILIKE ? ESCAPE '\\'", q, q).addIf(f.estado, 'p.estado = ?', f.estado);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM paginas p ${w.sql}`, w.params);
        const order = (0, sql_1.orderBy)(f.sort, PAGE_SORT, 'p.sistema DESC, p.titulo ASC, p.id ASC', 'p.id');
        const items = await this.db.rows(`SELECT ${PAGE_LIST_SELECT} FROM paginas p ${w.sql} ${order} LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items, total, page, pageSize };
    }
    async findById(id, { forUpdate = false } = {}) {
        return this.db.row(`SELECT ${PAGE_SELECT} FROM paginas p WHERE p.id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
    }
    async findPublishedBySlug(slug) {
        return this.db.row(`SELECT ${PAGE_SELECT} FROM paginas p WHERE p.slug = $1 AND p.estado = 'publicada'`, [slug]);
    }
    async listPublishedSlugs() {
        return this.db.rows("SELECT slug, titulo FROM paginas WHERE estado = 'publicada' ORDER BY titulo");
    }
    async slugExists(slug, exceptId = 0) {
        return (await this.db.scalar('SELECT COUNT(*) FROM paginas WHERE slug = $1 AND id <> $2', [slug, exceptId])) > 0;
    }
    async create(d, userId) {
        return this.db.scalar(`INSERT INTO paginas (slug, titulo, resumen, bloques, estado, creado_por, actualizado_por, publicada_en)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $6, CASE WHEN $5 = 'publicada' THEN now() END) RETURNING id`, [d.slug, d.titulo, d.resumen, JSON.stringify(d.bloques), d.estado, userId]);
    }
    async update(id, d, userId) {
        return this.db.run(`UPDATE paginas SET slug = $1, titulo = $2, resumen = $3, bloques = $4::jsonb, estado = $5, actualizado_por = $6,
       publicada_en = CASE WHEN $5 = 'publicada' THEN COALESCE(publicada_en, now()) ELSE NULL END,
       version = version + 1, actualizado_en = now() WHERE id = $7`, [d.slug, d.titulo, d.resumen, JSON.stringify(d.bloques), d.estado, userId, id]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM paginas WHERE id = $1', [id]);
    }
    async countByStatus() {
        return this.db.rows('SELECT estado, COUNT(*) AS n FROM paginas GROUP BY estado ORDER BY estado');
    }
};
exports.PageRepository = PageRepository;
exports.PageRepository = PageRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], PageRepository);
const SLIDE_SELECT = 'id, slider_id, medio_id, titulo, texto, enlace, texto_enlace, orden, activa, creado_en, actualizado_en';
let SliderRepository = class SliderRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async list() {
        return this.db.rows(`SELECT s.id, s.nombre, s.ubicacion, s.activo, s.version, s.creado_en, s.actualizado_en,
       (SELECT COUNT(*) FROM diapositivas d WHERE d.slider_id = s.id) AS total_diapositivas
       FROM sliders s ORDER BY s.ubicacion`);
    }
    async findById(id, { forUpdate = false } = {}) {
        const s = await this.db.row(`SELECT id, nombre, ubicacion, activo, version, creado_en, actualizado_en FROM sliders WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`, [id]);
        if (s)
            s.diapositivas = await this.slidesOf(id);
        return s;
    }
    async findActiveByLocation(ubicacion) {
        const s = await this.db.row('SELECT id, nombre, ubicacion, activo, version, creado_en, actualizado_en FROM sliders WHERE ubicacion = $1 AND activo', [ubicacion]);
        if (!s)
            return null;
        s.diapositivas = await this.db.rows(`SELECT ${SLIDE_SELECT} FROM diapositivas WHERE slider_id = $1 AND activa AND medio_id IS NOT NULL ORDER BY orden, id`, [s.id]);
        return s;
    }
    async locationExists(ubicacion, exceptId = 0) {
        return (await this.db.scalar('SELECT COUNT(*) FROM sliders WHERE ubicacion = $1 AND id <> $2', [ubicacion, exceptId])) > 0;
    }
    async create(d, userId) {
        return this.db.scalar('INSERT INTO sliders (nombre, ubicacion, activo, creado_por, actualizado_por) VALUES ($1, $2, $3, $4, $4) RETURNING id', [
            d.nombre,
            d.ubicacion,
            d.activo,
            userId,
        ]);
    }
    async update(id, d, userId) {
        return this.db.run('UPDATE sliders SET nombre = $1, ubicacion = $2, activo = $3, actualizado_por = $4, version = version + 1, actualizado_en = now() WHERE id = $5', [d.nombre, d.ubicacion, d.activo, userId, id]);
    }
    /** Marca una modificación del slider (diapositivas) para el bloqueo optimista. */
    async touch(id, userId) {
        await this.db.run('UPDATE sliders SET version = version + 1, actualizado_por = $1, actualizado_en = now() WHERE id = $2', [userId, id]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM sliders WHERE id = $1', [id]);
    }
    async slidesOf(sliderId) {
        return this.db.rows(`SELECT ${SLIDE_SELECT} FROM diapositivas WHERE slider_id = $1 ORDER BY orden, id`, [sliderId]);
    }
    async findSlide(sliderId, slideId) {
        return this.db.row(`SELECT ${SLIDE_SELECT} FROM diapositivas WHERE id = $1 AND slider_id = $2`, [slideId, sliderId]);
    }
    async createSlide(sliderId, d) {
        return this.db.scalar(`INSERT INTO diapositivas (slider_id, medio_id, titulo, texto, enlace, texto_enlace, orden, activa)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(orden), -1) + 1 FROM diapositivas WHERE slider_id = $1), $7) RETURNING id`, [sliderId, d.medioId, d.titulo, d.texto, d.enlace, d.textoEnlace, d.activa]);
    }
    async updateSlide(sliderId, slideId, d) {
        return this.db.run(`UPDATE diapositivas SET medio_id = $1, titulo = $2, texto = $3, enlace = $4, texto_enlace = $5, activa = $6, actualizado_en = now()
       WHERE id = $7 AND slider_id = $8`, [d.medioId, d.titulo, d.texto, d.enlace, d.textoEnlace, d.activa, slideId, sliderId]);
    }
    /** Reordena todas las diapositivas en una sola sentencia. */
    async reorder(sliderId, ids) {
        await this.db.run(`UPDATE diapositivas d SET orden = t.orden - 1, actualizado_en = now()
       FROM unnest($1::int[]) WITH ORDINALITY AS t(id, orden) WHERE d.id = t.id AND d.slider_id = $2`, [ids, sliderId]);
    }
    async deleteSlide(sliderId, slideId) {
        return this.db.run('DELETE FROM diapositivas WHERE id = $1 AND slider_id = $2', [slideId, sliderId]);
    }
    async slideIdsOf(sliderId) {
        return (await this.db.query('SELECT id FROM diapositivas WHERE slider_id = $1 ORDER BY orden, id', [sliderId])).map((r) => r.id);
    }
};
exports.SliderRepository = SliderRepository;
exports.SliderRepository = SliderRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], SliderRepository);
const DOC_SELECT = 'id, tipo, numero, anio, fecha, asunto, archivo, nombre_original, tamano, creado_en';
let DocumentRepository = class DocumentRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(f) {
        const { page, pageSize, offset } = (0, sql_1.clampPage)(f.page, f.pageSize, 100);
        const q = (0, sql_1.likePattern)(f.q ?? '');
        const w = new sql_1.Where()
            .addIf(f.tipo, 'tipo = ?', f.tipo)
            .addIf(f.anio, 'anio = ?', f.anio)
            .addIf(f.q, "asunto ILIKE ? ESCAPE '\\' OR numero ILIKE ? ESCAPE '\\'", q, q);
        const total = await this.db.scalar(`SELECT COUNT(*) FROM documentos ${w.sql}`, w.params);
        const items = await this.db.rows(`SELECT ${DOC_SELECT} FROM documentos ${w.sql} ORDER BY anio DESC, fecha DESC, id DESC LIMIT ${w.next(pageSize)} OFFSET ${w.next(offset)}`, w.params);
        return { items, total, page, pageSize };
    }
    /** Todos los tipos en una sola consulta (hasta `porTipo` documentos por tipo). */
    async latestByType(porTipo = 100) {
        return this.db.rows(`SELECT ${DOC_SELECT} FROM (
         SELECT d.*, row_number() OVER (PARTITION BY tipo ORDER BY anio DESC, fecha DESC, id DESC) AS rn FROM documentos d
       ) x WHERE rn <= $1 ORDER BY anio DESC, fecha DESC, id DESC`, [porTipo]);
    }
    async findById(id) {
        return this.db.row(`SELECT ${DOC_SELECT} FROM documentos WHERE id = $1`, [id]);
    }
    async create(d, userId) {
        return this.db.scalar(`INSERT INTO documentos (tipo, numero, anio, fecha, asunto, archivo, nombre_original, tamano, autor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`, [d.tipo, d.numero, d.anio, d.fecha, d.asunto, d.archivo, d.nombreOriginal, d.tamano, userId]);
    }
    async delete(id) {
        return this.db.run('DELETE FROM documentos WHERE id = $1', [id]);
    }
    async count() {
        return this.db.scalar('SELECT COUNT(*) FROM documentos');
    }
};
exports.DocumentRepository = DocumentRepository;
exports.DocumentRepository = DocumentRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], DocumentRepository);
// ---------------------------------------------------------------- Instituciones
let InstitutionRepository = class InstitutionRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(q = '') {
        if (!q)
            return this.db.rows('SELECT id, nombre, zona FROM instituciones ORDER BY nombre');
        const p = (0, sql_1.likePattern)(q);
        return this.db.rows("SELECT id, nombre, zona FROM instituciones WHERE nombre ILIKE $1 ESCAPE '\\' OR zona ILIKE $1 ESCAPE '\\' ORDER BY nombre", [p]);
    }
    async create(nombre, zona) {
        return this.db.run('INSERT INTO instituciones (nombre, zona) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING', [nombre, zona]);
    }
};
exports.InstitutionRepository = InstitutionRepository;
exports.InstitutionRepository = InstitutionRepository = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [db_service_1.Db])
], InstitutionRepository);
//# sourceMappingURL=content.repositories.js.map