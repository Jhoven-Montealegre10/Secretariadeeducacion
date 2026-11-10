/**
 * Páginas por bloques, noticias y sliders.
 * Reglas comunes:
 *  - publicar, despublicar o editar algo ya publicado exige el permiso *.publish;
 *  - todo HTML se sanitiza en el servidor; los borradores nunca son públicos;
 *  - bloqueo optimista: si el cliente envía `version` y otra persona guardó antes, 409 EDIT_CONFLICT;
 *  - cada cambio invalida la caché pública tras el COMMIT;
 *  - las filas se bloquean (SELECT … FOR UPDATE) solo durante la transacción corta de guardado.
 */
import { Injectable } from '@nestjs/common';
import { bloquesSchema, mediosEnBloques, SLUG_RE, SLUGS_RESERVADOS, slugify, UBICACION_RE } from '../domain/content';
import { ConflictError, EditConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import type { Actor } from '../domain/permissions';
import { accionPublicacion, ordenValido, requierePermisoPublicar, versionCoincide, type Estado } from '../domain/publication';
import { PublicCache } from '../infrastructure/cache/public-cache.service';
import { Db, PG, pgCode } from '../infrastructure/database/db.service';
import {
  NewsRepository,
  PageRepository,
  SliderRepository,
  type NewsData,
  type NewsRecord,
  type PageData,
  type PageRecord,
  type SlideData,
  type SliderRecord,
} from '../infrastructure/repositories/content.repositories';
import { HtmlSanitizer } from '../infrastructure/security/html-sanitizer.service';
import { AuditService } from './audit.service';
import { authorize } from './authorization';
import { MediaService } from './media.service';

type Bloques = Array<Record<string, unknown>>;

/** Sanitiza todo HTML presente en los bloques. */
export function sanitizeBlocks(bloques: Bloques, sanitize: (html: string) => string): Bloques {
  return bloques.map((b) => {
    switch (b.tipo) {
      case 'texto':
      case 'aviso':
        return { ...b, html: sanitize(String(b.html ?? '')) };
      case 'acordeon':
        return {
          ...b,
          intro: sanitize(String(b.intro ?? '')),
          items: (b.items as Array<Record<string, unknown>>).map((i) => ({ ...i, html: sanitize(String(i.html ?? '')) })),
        };
      default:
        return b;
    }
  });
}

const slugError = () => new ValidationError('La dirección solo admite minúsculas, números y guiones.', [{ campo: 'slug', mensaje: 'Formato inválido' }]);

// ---------------------------------------------------------------- Páginas

export interface PageInput {
  slug?: string;
  titulo?: string;
  resumen?: string;
  estado?: Estado;
  bloques?: unknown[];
  version?: number;
}

@Injectable()
export class PageService {
  constructor(
    private readonly db: Db,
    private readonly pages: PageRepository,
    private readonly media: MediaService,
    private readonly sanitizer: HtmlSanitizer,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
  ) {}

  sanitizeBlocks(bloques: Bloques): Bloques {
    return sanitizeBlocks(bloques, (h) => this.sanitizer.sanitizeRichText(h));
  }

  private async requirePage(id: number, forUpdate = false): Promise<PageRecord> {
    const p = await this.pages.findById(id, { forUpdate });
    if (!p) throw new NotFoundError('La página no existe.');
    return p;
  }

  private async normalizeSlug(slug: string | undefined, titulo: string, exceptId: number): Promise<string> {
    const value = (slug || slugify(titulo)).trim().toLowerCase();
    if (!SLUG_RE.test(value) || value.length > 80) throw slugError();
    if (SLUGS_RESERVADOS.includes(value)) throw new ValidationError('Esa dirección está reservada por el sistema.', [{ campo: 'slug', mensaje: 'Reservada' }]);
    if (await this.pages.slugExists(value, exceptId)) throw this.duplicate();
    return value;
  }

  private duplicate() {
    return new ConflictError('Ya existe una página con esa dirección.', [{ campo: 'slug', mensaje: 'Duplicada' }]);
  }

  private async prepareBlocks(bloques: unknown[]): Promise<Bloques> {
    const parsed = bloquesSchema.safeParse(bloques);
    if (!parsed.success)
      throw new ValidationError(
        'Los bloques de la página no son válidos.',
        parsed.error.issues.map((i) => ({ campo: `bloques.${i.path.join('.')}`, mensaje: i.message })),
      );
    const clean = this.sanitizeBlocks(parsed.data as Bloques);
    const imagenes = clean
      .filter((b) => b.tipo === 'imagen' || b.tipo === 'galeria')
      .flatMap((b) => (b.medioId ? [b.medioId as number] : ((b.medios as number[]) ?? [])));
    await this.media.assertUsable(imagenes, 'imagen');
    await this.media.assertUsable(
      clean.filter((b) => b.tipo === 'audio').map((b) => b.medioId as number),
      'audio',
    );
    return clean;
  }

  private async persist(actor: Actor, id: number | null, data: PageData, accion: string, ip: string | null): Promise<PageRecord> {
    const pageId = id ?? (await this.pages.create(data, actor.id));
    if (id) await this.pages.update(id, data, actor.id);
    await this.media.syncUsages('pagina', pageId, mediosEnBloques(data.bloques), data.estado === 'publicada');
    await this.audit.record({ actor, accion, recurso: 'pagina', recursoId: pageId, detalle: `${data.slug} (${data.estado})`, ip });
    this.cache.invalidate();
    return (await this.pages.findById(pageId)) as PageRecord;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(fn);
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw this.duplicate();
      throw err;
    }
  }

  async list(actor: Actor | null, filters: Parameters<PageRepository['list']>[0]) {
    authorize(actor, 'pages.read');
    return this.pages.list(filters);
  }

  async get(actor: Actor | null, id: number): Promise<PageRecord> {
    authorize(actor, 'pages.read');
    return this.requirePage(id);
  }

  async create(actor: Actor | null, input: PageInput & { titulo: string; estado: Estado }, ip: string | null): Promise<PageRecord> {
    authorize(actor, 'pages.create');
    if (requierePermisoPublicar(null, input.estado)) authorize(actor, 'pages.publish');
    const titulo = input.titulo.trim();
    const bloques = await this.prepareBlocks(input.bloques ?? []);
    return this.guard(async () => {
      const data: PageData = {
        titulo,
        resumen: (input.resumen ?? '').trim(),
        estado: input.estado,
        bloques,
        slug: await this.normalizeSlug(input.slug, titulo, 0),
      };
      return this.persist(actor, null, data, accionPublicacion('pagina', null, input.estado), ip);
    });
  }

  async update(actor: Actor | null, id: number, input: PageInput, ip: string | null): Promise<PageRecord> {
    authorize(actor, 'pages.update');
    const bloques = input.bloques ? await this.prepareBlocks(input.bloques) : null;
    return this.guard(async () => {
      const page = await this.requirePage(id, true);
      if (!versionCoincide(input.version, page.version)) throw new EditConflictError(page.version);
      const estado = input.estado ?? page.estado;
      if (requierePermisoPublicar(page.estado, estado)) authorize(actor, 'pages.publish');
      const slugInput = input.slug ?? page.slug;
      if (page.sistema && slugInput !== page.slug) throw new ForbiddenError('La dirección de las páginas del sistema no se puede cambiar.');
      const titulo = (input.titulo ?? page.titulo).trim();
      const data: PageData = {
        titulo,
        resumen: (input.resumen ?? page.resumen).trim(),
        estado,
        bloques: bloques ?? page.bloques,
        slug: page.sistema ? page.slug : await this.normalizeSlug(slugInput, titulo, id),
      };
      return this.persist(actor, id, data, accionPublicacion('pagina', page.estado, estado), ip);
    });
  }

  async remove(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'pages.delete');
    await this.db.transaction(async () => {
      const page = await this.requirePage(id, true);
      if (page.sistema) throw new ForbiddenError('Las páginas del sistema no se pueden eliminar; puede editarlas o pasarlas a borrador.');
      await this.media.clearUsages('pagina', [id]);
      await this.pages.delete(id);
      await this.audit.record({ actor, accion: 'pagina_eliminar', recurso: 'pagina', recursoId: id, detalle: page.slug, ip });
      this.cache.invalidate();
    });
  }

  /** Sitio público: solo páginas publicadas (en caché). */
  async getPublished(slug: string): Promise<PageRecord | null> {
    if (!SLUG_RE.test(String(slug))) return null;
    return this.cache.get(`pagina:${slug}`, async () => {
      const page = await this.pages.findPublishedBySlug(slug);
      if (page) page.bloques = this.sanitizeBlocks(page.bloques); // defensa en profundidad
      return page;
    });
  }

  async listPublished(): Promise<Array<{ slug: string; titulo: string }>> {
    return this.cache.get('paginas:publicadas', () => this.pages.listPublishedSlugs());
  }

  async countByStatus() {
    return this.pages.countByStatus();
  }
}

// ---------------------------------------------------------------- Noticias

export const CATEGORIAS = Object.freeze([
  'Institucional',
  'Cobertura',
  'Calidad educativa',
  'Normatividad',
  'Talento humano',
  'Bienestar',
  'Transparencia',
] as const);

export interface NewsInput {
  slug?: string;
  titulo?: string;
  resumen?: string;
  contenido?: string;
  categoria?: string;
  estado?: Estado;
  fechaPublicacion?: string;
  imagenId?: number | null;
  fotos?: number[];
  version?: number;
}

@Injectable()
export class NewsService {
  readonly CATEGORIAS = CATEGORIAS;

  constructor(
    private readonly db: Db,
    private readonly news: NewsRepository,
    private readonly media: MediaService,
    private readonly sanitizer: HtmlSanitizer,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
  ) {}

  private async requireNews(id: number, forUpdate = false): Promise<NewsRecord> {
    const n = await this.news.findById(id, { forUpdate });
    if (!n) throw new NotFoundError('La noticia no existe.');
    return n;
  }

  private duplicate() {
    return new ConflictError('Ya existe una noticia con esa dirección.', [{ campo: 'slug', mensaje: 'Duplicada' }]);
  }

  private async uniqueSlug(slug: string | undefined, titulo: string, exceptId: number): Promise<string> {
    if (slug) {
      if (!SLUG_RE.test(slug) || slug.length > 120) throw slugError();
      if (await this.news.slugExists(slug, exceptId)) throw this.duplicate();
      return slug;
    }
    const base = slugify(titulo) || 'noticia';
    let candidate = base;
    for (let i = 2; await this.news.slugExists(candidate, exceptId); i++) candidate = `${base}-${i}`;
    return candidate;
  }

  /** Combina la entrada con el estado actual y valida reglas de negocio (sin tocar la BD salvo multimedia). */
  private async prepare(input: NewsInput, current?: NewsRecord): Promise<Omit<NewsData, 'slug'> & { fotos: number[] }> {
    const defined = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as NewsInput;
    const merged = { ...(current ?? {}), ...defined } as NewsInput & Partial<NewsRecord>;
    if (!CATEGORIAS.includes(merged.categoria as (typeof CATEGORIAS)[number]))
      throw new ValidationError('Categoría no válida.', [{ campo: 'categoria', mensaje: `Use: ${CATEGORIAS.join(', ')}` }]);
    const contenido = this.sanitizer.sanitizeRichText(merged.contenido ?? '');
    if (this.sanitizer.stripTags(contenido).length < 20)
      throw new ValidationError('El contenido debe tener al menos 20 caracteres de texto.', [{ campo: 'contenido', mensaje: 'Muy corto' }]);
    const fotos = [...new Set(merged.fotos ?? [])];
    await this.media.assertUsable([merged.imagenId, ...fotos], 'imagen');
    return {
      titulo: String(merged.titulo ?? '').trim(),
      resumen: String(merged.resumen ?? '').trim(),
      contenido,
      categoria: merged.categoria as string,
      estado: merged.estado as Estado,
      fechaPublicacion: merged.fechaPublicacion as string,
      imagenId: merged.imagenId ?? null,
      fotos,
    };
  }

  private async persist(actor: Actor, id: number | null, data: NewsData & { fotos: number[] }, accion: string, ip: string | null): Promise<NewsRecord> {
    const newsId = id ?? (await this.news.create(data, actor.id));
    if (id) await this.news.update(id, data, actor.id);
    await this.news.setPhotos(newsId, data.fotos);
    await this.media.syncUsages('noticia', newsId, [data.imagenId, ...data.fotos], data.estado === 'publicada');
    await this.audit.record({ actor, accion, recurso: 'noticia', recursoId: newsId, detalle: `${data.slug} (${data.estado})`, ip });
    this.cache.invalidate(); // el inicio y el listado público se actualizan al publicar
    return (await this.news.findById(newsId)) as NewsRecord;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(fn);
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw this.duplicate();
      throw err;
    }
  }

  sanitize(html: string): string {
    return this.sanitizer.sanitizeRichText(html);
  }

  async list(actor: Actor | null, filters: Parameters<NewsRepository['list']>[0]) {
    authorize(actor, 'news.read');
    return this.news.list({ ...filters, soloPublicadas: false });
  }

  async get(actor: Actor | null, id: number): Promise<NewsRecord> {
    authorize(actor, 'news.read');
    return this.requireNews(id);
  }

  async create(actor: Actor | null, input: NewsInput, ip: string | null): Promise<NewsRecord> {
    authorize(actor, 'news.create');
    if (requierePermisoPublicar(null, input.estado as Estado)) authorize(actor, 'news.publish');
    const data = await this.prepare(input);
    return this.guard(async () =>
      this.persist(actor, null, { ...data, slug: await this.uniqueSlug(input.slug, data.titulo, 0) }, accionPublicacion('noticia', null, data.estado), ip),
    );
  }

  async update(actor: Actor | null, id: number, input: NewsInput, ip: string | null): Promise<NewsRecord> {
    authorize(actor, 'news.update');
    return this.guard(async () => {
      const current = await this.requireNews(id, true);
      if (!versionCoincide(input.version, current.version)) throw new EditConflictError(current.version);
      const data = await this.prepare(input, current);
      if (requierePermisoPublicar(current.estado, data.estado)) authorize(actor, 'news.publish');
      const slug = input.slug && input.slug !== current.slug ? await this.uniqueSlug(input.slug, data.titulo, id) : current.slug;
      return this.persist(actor, id, { ...data, slug }, accionPublicacion('noticia', current.estado, data.estado), ip);
    });
  }

  async remove(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'news.delete');
    await this.db.transaction(async () => {
      const n = await this.requireNews(id, true);
      await this.media.clearUsages('noticia', [id]);
      await this.news.delete(id);
      await this.audit.record({ actor, accion: 'noticia_eliminar', recurso: 'noticia', recursoId: id, detalle: n.slug, ip });
      this.cache.invalidate();
    });
  }

  // --- Sitio y API públicos: solo publicadas con fecha cumplida (en caché) ---

  async listPublished({ page = 1, pageSize = 9, q }: { page?: number; pageSize?: number; q?: string } = {}) {
    const load = () => this.news.list({ page, pageSize, q, soloPublicadas: true });
    // Las búsquedas libres no se guardan en caché (claves ilimitadas).
    return q ? load() : this.cache.get(`noticias:${page}:${pageSize}`, load);
  }

  async latestPublished(limit = 3): Promise<NewsRecord[]> {
    return (await this.listPublished({ page: 1, pageSize: limit })).items;
  }

  async getPublished(slug: string): Promise<NewsRecord | null> {
    if (!SLUG_RE.test(String(slug))) return null;
    return this.cache.get(`noticia:${slug}`, async () => {
      const n = await this.news.findPublishedBySlug(slug);
      if (n) n.contenido = this.sanitizer.sanitizeRichText(n.contenido); // defensa en profundidad
      return n;
    });
  }

  async countByStatus() {
    return this.news.countByStatus();
  }
}

// ---------------------------------------------------------------- Sliders

export interface SlideInput {
  medioId?: number | null;
  titulo?: string;
  texto?: string;
  enlace?: string;
  textoEnlace?: string;
  activa?: boolean;
}

/**
 * Sliders por ubicación ('inicio' o 'pagina:<slug>') con diapositivas ordenadas.
 * Editar y agregar exige sliders.update; eliminar (slider o diapositiva) exige sliders.delete.
 * Cada cambio de diapositivas incrementa la versión del slider (bloqueo optimista del conjunto).
 */
@Injectable()
export class SliderService {
  constructor(
    private readonly db: Db,
    private readonly sliders: SliderRepository,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
  ) {}

  private async requireSlider(id: number, forUpdate = false): Promise<SliderRecord> {
    const s = await this.sliders.findById(id, { forUpdate });
    if (!s) throw new NotFoundError('El slider no existe.');
    return s;
  }

  private async lockForChange(id: number, version: number | undefined): Promise<SliderRecord> {
    const s = await this.requireSlider(id, true);
    if (!versionCoincide(version, s.version)) throw new EditConflictError(s.version);
    return s;
  }

  private duplicate() {
    return new ConflictError('Ya existe un slider en esa ubicación.', [{ campo: 'ubicacion', mensaje: 'Ocupada' }]);
  }

  private async validateLocation(ubicacion: string, exceptId: number): Promise<void> {
    if (!UBICACION_RE.test(ubicacion))
      throw new ValidationError('Ubicación no válida. Use "inicio" o "pagina:<direccion>".', [{ campo: 'ubicacion', mensaje: 'Formato inválido' }]);
    if (await this.sliders.locationExists(ubicacion, exceptId)) throw this.duplicate();
  }

  /** Recalcula si cada imagen del slider está publicada (slider activo y diapositiva activa). */
  private async syncSliderUsages(sliderId: number): Promise<void> {
    const slider = (await this.sliders.findById(sliderId)) as SliderRecord;
    for (const d of slider.diapositivas ?? []) await this.media.syncUsages('diapositiva', d.id, [d.medioId], slider.activo && d.activa);
  }

  private async afterChange(actor: Actor, sliderId: number, accion: string, detalle: string, ip: string | null): Promise<SliderRecord> {
    await this.syncSliderUsages(sliderId);
    await this.audit.record({ actor, accion, recurso: 'slider', recursoId: sliderId, detalle, ip });
    this.cache.invalidate();
    return (await this.sliders.findById(sliderId)) as SliderRecord;
  }

  private async guard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(fn);
    } catch (err) {
      if (pgCode(err) === PG.UNIQUE_VIOLATION) throw this.duplicate();
      throw err;
    }
  }

  async list(actor: Actor | null): Promise<SliderRecord[]> {
    authorize(actor, 'sliders.read');
    return this.sliders.list();
  }

  async get(actor: Actor | null, id: number): Promise<SliderRecord> {
    authorize(actor, 'sliders.read');
    return this.requireSlider(id);
  }

  async create(actor: Actor | null, input: { nombre: string; ubicacion: string; activo?: boolean }, ip: string | null): Promise<SliderRecord> {
    authorize(actor, 'sliders.create');
    return this.guard(async () => {
      await this.validateLocation(input.ubicacion, 0);
      const id = await this.sliders.create({ nombre: input.nombre.trim(), ubicacion: input.ubicacion, activo: input.activo ?? true }, actor.id);
      await this.audit.record({ actor, accion: 'slider_crear', recurso: 'slider', recursoId: id, detalle: input.ubicacion, ip });
      this.cache.invalidate();
      return (await this.sliders.findById(id)) as SliderRecord;
    });
  }

  async update(
    actor: Actor | null,
    id: number,
    changes: { nombre?: string; ubicacion?: string; activo?: boolean; version?: number },
    ip: string | null,
  ): Promise<SliderRecord> {
    authorize(actor, 'sliders.update');
    return this.guard(async () => {
      const s = await this.lockForChange(id, changes.version);
      const data = { nombre: (changes.nombre ?? s.nombre).trim(), ubicacion: changes.ubicacion ?? s.ubicacion, activo: changes.activo ?? s.activo };
      if (data.ubicacion !== s.ubicacion) await this.validateLocation(data.ubicacion, id);
      await this.sliders.update(id, data, actor.id);
      return this.afterChange(actor, id, 'slider_actualizar', `${data.ubicacion}${data.activo ? '' : ' (inactivo)'}`, ip);
    });
  }

  async remove(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'sliders.delete');
    await this.db.transaction(async () => {
      const s = await this.requireSlider(id, true);
      await this.media.clearUsages('diapositiva', await this.sliders.slideIdsOf(id));
      await this.sliders.delete(id);
      await this.audit.record({ actor, accion: 'slider_eliminar', recurso: 'slider', recursoId: id, detalle: s.ubicacion, ip });
      this.cache.invalidate();
    });
  }

  private slideData(input: SlideInput, current?: SlideData): SlideData {
    const pick = <K extends keyof SlideData>(k: K, fallback: SlideData[K]): SlideData[K] =>
      input[k] !== undefined ? (input[k] as SlideData[K]) : (current?.[k] ?? fallback);
    return {
      medioId: pick('medioId', null),
      titulo: pick('titulo', ''),
      texto: pick('texto', ''),
      enlace: pick('enlace', ''),
      textoEnlace: pick('textoEnlace', ''),
      activa: pick('activa', true),
    };
  }

  async addSlide(actor: Actor | null, sliderId: number, input: SlideInput & { version?: number }, ip: string | null): Promise<SliderRecord> {
    authorize(actor, 'sliders.update');
    const data = this.slideData(input);
    if (!data.medioId) throw new ValidationError('Seleccione una imagen para la diapositiva.', [{ campo: 'medioId', mensaje: 'Requerido' }]);
    await this.media.assertUsable([data.medioId], 'imagen');
    return this.db.transaction(async () => {
      await this.lockForChange(sliderId, input.version);
      const slideId = await this.sliders.createSlide(sliderId, data);
      await this.sliders.touch(sliderId, actor.id);
      return this.afterChange(actor, sliderId, 'diapositiva_crear', `diapositiva ${slideId}`, ip);
    });
  }

  async updateSlide(
    actor: Actor | null,
    sliderId: number,
    slideId: number,
    input: SlideInput & { version?: number },
    ip: string | null,
  ): Promise<SliderRecord> {
    authorize(actor, 'sliders.update');
    return this.db.transaction(async () => {
      await this.lockForChange(sliderId, input.version);
      const current = await this.sliders.findSlide(sliderId, slideId);
      if (!current) throw new NotFoundError('La diapositiva no existe en este slider.');
      const data = this.slideData(input, current);
      await this.media.assertUsable([data.medioId], 'imagen');
      await this.sliders.updateSlide(sliderId, slideId, data);
      await this.sliders.touch(sliderId, actor.id);
      return this.afterChange(actor, sliderId, 'diapositiva_actualizar', `diapositiva ${slideId}`, ip);
    });
  }

  async reorder(actor: Actor | null, sliderId: number, ids: number[], ip: string | null, version?: number): Promise<SliderRecord> {
    authorize(actor, 'sliders.update');
    return this.db.transaction(async () => {
      await this.lockForChange(sliderId, version);
      if (!ordenValido(await this.sliders.slideIdsOf(sliderId), ids))
        throw new ValidationError('El orden debe incluir exactamente todas las diapositivas del slider.');
      await this.sliders.reorder(sliderId, ids);
      await this.sliders.touch(sliderId, actor.id);
      return this.afterChange(actor, sliderId, 'diapositivas_ordenar', '', ip);
    });
  }

  async removeSlide(actor: Actor | null, sliderId: number, slideId: number, ip: string | null, version?: number): Promise<SliderRecord> {
    authorize(actor, 'sliders.delete');
    return this.db.transaction(async () => {
      await this.lockForChange(sliderId, version);
      if (!(await this.sliders.findSlide(sliderId, slideId))) throw new NotFoundError('La diapositiva no existe en este slider.');
      await this.media.clearUsages('diapositiva', [slideId]);
      await this.sliders.deleteSlide(sliderId, slideId);
      await this.sliders.touch(sliderId, actor.id);
      return this.afterChange(actor, sliderId, 'diapositiva_eliminar', `diapositiva ${slideId}`, ip);
    });
  }

  /** Sitio y API públicos: slider activo con diapositivas activas y su imagen (en caché). */
  async getPublic(ubicacion: string) {
    if (!UBICACION_RE.test(String(ubicacion))) return null;
    return this.cache.get(`slider:${ubicacion}`, async () => {
      const s = await this.sliders.findActiveByLocation(ubicacion);
      if (!s?.diapositivas?.length) return null;
      const medios = new Map((await this.media.findByIds(s.diapositivas.map((d) => d.medioId))).map((m) => [m.id, m]));
      const diapositivas = s.diapositivas
        .filter((d) => d.medioId !== null && medios.has(d.medioId))
        .map((d) => ({ ...d, medio: medios.get(d.medioId as number) }));
      return diapositivas.length ? { ...s, diapositivas } : null;
    });
  }
}
