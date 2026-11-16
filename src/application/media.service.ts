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
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, EditConflictError, NotFoundError, PayloadTooLargeError, ValidationError } from '../domain/errors';
import type { Actor } from '../domain/permissions';
import { versionCoincide } from '../domain/publication';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { PublicCache } from '../infrastructure/cache/public-cache.service';
import { Db } from '../infrastructure/database/db.service';
import { MediaRepository, type MediaRecord, type MediaUsage, type StoredFile } from '../infrastructure/repositories/content.repositories';
import { FileStorage } from '../infrastructure/storage/file-storage';
import { detectMedia } from '../infrastructure/storage/file-type-detector';
import { ImageProcessor } from '../infrastructure/storage/image-processor.service';
import { MalwareScanner } from '../infrastructure/storage/malware-scanner.service';
import { MEDIA_STORAGE } from '../infrastructure/storage/storage.module';
import { AuditService } from './audit.service';
import { authorize } from './authorization';

export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  size: number;
}

export interface MediaMeta {
  nombreVisible?: string;
  textoAlternativo?: string;
  descripcion?: string;
  visibilidad?: 'publica' | 'privada';
}

export type MediaWithUsages = MediaRecord & { usos: MediaUsage[] };

@Injectable()
export class MediaService {
  constructor(
    private readonly db: Db,
    private readonly media: MediaRepository,
    @Inject(MEDIA_STORAGE) private readonly storage: FileStorage,
    private readonly images: ImageProcessor,
    private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private async requireMedia(id: number, forUpdate = false): Promise<MediaRecord> {
    const m = await this.media.findById(id, { forUpdate });
    if (!m) throw new NotFoundError('El archivo no existe.');
    return m;
  }

  /** Valida, analiza y guarda los bytes; devuelve los datos del archivo almacenado. */
  private async ingest(file: UploadedFile): Promise<StoredFile> {
    const original = path.basename(String(file.originalname));
    const detected = detectMedia(file.buffer, file.originalname);
    if (!detected) {
      throw new ValidationError(
        `"${original.slice(0, 80)}" no es un formato permitido (JPG, PNG, WebP, MP3, OGG o WAV) o su extensión no coincide con su contenido.`,
      );
    }
    const max = detected.tipo === 'imagen' ? this.config.uploads.maxImageBytes : this.config.uploads.maxAudioBytes;
    if (file.size > max) throw new PayloadTooLargeError(`El archivo supera el máximo de ${Math.round(max / 1048576)} MB para ${detected.tipo}.`);
    const scan = await this.scanner.scan(file.buffer);
    if (!scan.limpio) throw new ValidationError('El archivo fue rechazado por el análisis antimalware.');

    let data = file.buffer;
    let thumbnail: Buffer | null = null;
    let ancho: number | null = null;
    let alto: number | null = null;
    if (detected.tipo === 'imagen') {
      try {
        ({ data, thumbnail, ancho, alto } = await this.images.process(file.buffer, detected.mime));
      } catch {
        throw new ValidationError('La imagen está dañada o no se pudo procesar.');
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

  private async discard(stored: Pick<StoredFile, 'archivo' | 'miniatura'>): Promise<void> {
    await this.storage.remove(stored.archivo);
    await this.storage.remove(stored.miniatura);
  }

  async list(actor: Actor | null, filters: Parameters<MediaRepository['list']>[0]) {
    authorize(actor, 'media.read');
    return this.media.list(filters);
  }

  async get(actor: Actor | null, id: number): Promise<MediaWithUsages> {
    authorize(actor, 'media.read');
    const m = await this.requireMedia(id);
    return { ...m, usos: await this.media.usagesOf(id) };
  }

  async upload(actor: Actor | null, files: UploadedFile[], meta: MediaMeta, ip: string | null): Promise<MediaRecord[]> {
    authorize(actor, 'media.upload');
    if (!files?.length) throw new ValidationError('Adjunte al menos un archivo.', [{ campo: 'archivos', mensaje: 'Requerido' }]);
    const max = this.config.uploads.maxFilesPerRequest;
    if (files.length > max) throw new ValidationError(`Máximo ${max} archivos por envío.`);
    const stored: StoredFile[] = [];
    try {
      for (const f of files) stored.push(await this.ingest(f));
      return await this.db.transaction(async () => {
        const created: MediaRecord[] = [];
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
          created.push((await this.media.findById(id)) as MediaRecord);
        }
        return created;
      });
    } catch (err) {
      await Promise.all(stored.map((s) => this.discard(s)));
      throw err;
    }
  }

  async update(actor: Actor | null, id: number, changes: MediaMeta & { version?: number }, ip: string | null): Promise<MediaWithUsages> {
    authorize(actor, 'media.update');
    return this.db.transaction(async () => {
      const m = await this.requireMedia(id, true);
      if (!versionCoincide(changes.version, m.version)) throw new EditConflictError(m.version);
      if (changes.textoAlternativo && m.tipo !== 'imagen') throw new ValidationError('El texto alternativo solo aplica a imágenes.');
      await this.media.update(
        id,
        {
          nombreVisible: changes.nombreVisible,
          textoAlternativo: changes.textoAlternativo,
          descripcion: changes.descripcion,
          visibilidad: changes.visibilidad,
        },
        actor.id,
      );
      await this.audit.record({ actor, accion: 'medio_actualizar', recurso: 'medio', recursoId: id, ip });
      this.cache.invalidate(); // el texto alternativo o la visibilidad pueden aparecer en el sitio
      return { ...((await this.media.findById(id)) as MediaRecord), usos: await this.media.usagesOf(id) };
    });
  }

  /** Reemplaza el contenido manteniendo el ID: todos los contenidos que lo usan se actualizan. */
  async replace(
    actor: Actor | null,
    id: number,
    file: UploadedFile | undefined,
    opts: { confirmar?: boolean; version?: number },
    ip: string | null,
  ): Promise<MediaWithUsages> {
    authorize(actor, 'media.update');
    if (!file) throw new ValidationError('Adjunte el archivo de reemplazo.', [{ campo: 'archivo', mensaje: 'Requerido' }]);
    const before = await this.requireMedia(id);
    const usosAntes = await this.media.usagesOf(id);
    if (usosAntes.length && !opts.confirmar)
      throw new ConflictError(`El archivo se usa en ${usosAntes.length} contenido(s). Confirme para reemplazarlo en todos.`, usosAntes);
    const stored = await this.ingest(file);
    if (stored.tipo !== before.tipo) {
      await this.discard(stored);
      throw new ValidationError(`Debe reemplazarse por otro archivo de tipo ${before.tipo}.`);
    }
    try {
      return await this.db.transaction(async () => {
        const m = await this.requireMedia(id, true);
        if (!versionCoincide(opts.version, m.version)) throw new EditConflictError(m.version);
        const usos = await this.media.usagesOf(id);
        await this.media.replaceFile(id, stored, actor.id);
        await this.audit.record({ actor, accion: 'medio_reemplazar', recurso: 'medio', recursoId: id, detalle: `usos: ${usos.length}`, ip });
        this.db.afterCommit(() => this.discard(m)); // el archivo anterior solo se borra si el cambio quedó guardado
        this.cache.invalidate();
        return { ...((await this.media.findById(id)) as MediaRecord), usos };
      });
    } catch (err) {
      await this.discard(stored);
      throw err;
    }
  }

  async remove(actor: Actor | null, id: number, opts: { confirmar?: boolean }, ip: string | null): Promise<void> {
    authorize(actor, 'media.delete');
    await this.db.transaction(async () => {
      const m = await this.requireMedia(id, true);
      const usos = await this.media.usagesOf(id);
      if (usos.length && !opts.confirmar)
        throw new ConflictError(`El archivo se usa en ${usos.length} contenido(s). Si lo elimina, dejará de mostrarse allí.`, usos);
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
  async publicFile(name: string): Promise<{ path: string; mime: string } | null> {
    const file = this.storage.resolve(name);
    if (!file) return null;
    const m = await this.media.findByFile(name);
    if (!m || !(await this.media.isPubliclyServable(m.id)) || !this.storage.exists(name)) return null;
    return { path: file, mime: name === m.miniatura ? 'image/webp' : m.mime };
  }

  /** Archivo para el panel (también privados), con permiso media.read. */
  async privateFile(actor: Actor | null, id: number, { miniatura = false } = {}): Promise<{ path: string; mime: string }> {
    authorize(actor, 'media.read');
    const m = await this.requireMedia(id);
    const name = miniatura && m.miniatura ? m.miniatura : m.archivo;
    const file = this.storage.resolve(name);
    if (!file || !this.storage.exists(name)) throw new NotFoundError('El archivo no está disponible.');
    return { path: file, mime: name === m.miniatura ? 'image/webp' : m.mime };
  }

  // --- Uso desde otros módulos (páginas, noticias, sliders) ---

  async assertUsable(ids: Array<number | null | undefined>, tipo?: 'imagen' | 'audio'): Promise<void> {
    const unique = [...new Set(ids.filter((v): v is number => typeof v === 'number' && v > 0))];
    if (!unique.length) return;
    const found = await this.media.findByIds(unique);
    const missing = unique.filter((id) => !found.some((m) => m.id === id));
    if (missing.length) throw new ValidationError(`Archivos inexistentes en la biblioteca: ${missing.join(', ')}.`);
    if (tipo && found.some((m) => m.tipo !== tipo)) throw new ValidationError(`Se esperaba un archivo de tipo ${tipo}.`);
  }

  async syncUsages(entidad: 'pagina' | 'noticia' | 'diapositiva', entidadId: number, ids: Array<number | null | undefined>, publicado: boolean): Promise<void> {
    await this.media.setUsages(entidad, entidadId, [...new Set(ids.filter((v): v is number => typeof v === 'number' && v > 0))], publicado);
  }

  async clearUsages(entidad: 'pagina' | 'noticia' | 'diapositiva', entidadIds: number[]): Promise<void> {
    await this.media.clearUsages(entidad, entidadIds);
  }

  async findByIds(ids: Array<number | null | undefined>): Promise<MediaRecord[]> {
    return this.media.findByIds([...new Set(ids.filter((v): v is number => typeof v === 'number' && v > 0))]);
  }
}
