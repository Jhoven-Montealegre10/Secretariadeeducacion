/**
 * Normatividad (PDF públicos), PQRSD (datos personales cifrados), instituciones y buscador.
 */
import path from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError, PayloadTooLargeError, ValidationError } from '../domain/errors';
import type { Actor } from '../domain/permissions';
import { APP_CONFIG, type AppConfig } from '../config/configuration';
import { PublicCache } from '../infrastructure/cache/public-cache.service';
import { Db } from '../infrastructure/database/db.service';
import { PqrsdRepository, type PqrsdInput } from '../infrastructure/repositories/citizen.repositories';
import { DocumentRepository, InstitutionRepository, type DocumentRecord } from '../infrastructure/repositories/content.repositories';
import { FileStorage } from '../infrastructure/storage/file-storage';
import { isPdf } from '../infrastructure/storage/file-type-detector';
import { MalwareScanner } from '../infrastructure/storage/malware-scanner.service';
import { DOCUMENT_STORAGE } from '../infrastructure/storage/storage.module';
import { AuditService } from './audit.service';
import { authorize } from './authorization';
import { NewsService, PageService } from './content.services';
import type { UploadedFile } from './media.service';
import { SEARCH_INDEX } from './search-index';

// ---------------------------------------------------------------- Normatividad

export const TIPOS_DOCUMENTO_NORMATIVO = Object.freeze({
  circular: 'Circulares',
  resolucion: 'Resoluciones',
  decreto: 'Decretos',
  acuerdo: 'Acuerdos',
} as const);
export type TipoNormativo = keyof typeof TIPOS_DOCUMENTO_NORMATIVO;

@Injectable()
export class DocumentService {
  readonly TIPOS = TIPOS_DOCUMENTO_NORMATIVO;

  constructor(
    private readonly db: Db,
    private readonly docs: DocumentRepository,
    @Inject(DOCUMENT_STORAGE) private readonly storage: FileStorage,
    private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
    private readonly cache: PublicCache,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listPublic(filters: { tipo?: string; anio?: number; q?: string; page?: number; pageSize?: number } = {}) {
    return this.docs.list({ ...filters, pageSize: Math.min(filters.pageSize || 100, 100) });
  }

  /** Documentos agrupados por tipo en una sola consulta (sin N+1). */
  async groupedPublic(): Promise<Array<{ tipo: string; nombre: string; documentos: DocumentRecord[] }>> {
    return this.cache.get('normatividad', async () => {
      const all = await this.docs.latestByType(100);
      return Object.entries(TIPOS_DOCUMENTO_NORMATIVO).map(([tipo, nombre]) => ({ tipo, nombre, documentos: all.filter((d) => d.tipo === tipo) }));
    });
  }

  async list(actor: Actor | null, filters: Parameters<DocumentRepository['list']>[0]) {
    authorize(actor, 'documents.read');
    return this.docs.list(filters);
  }

  async create(
    actor: Actor | null,
    data: { tipo: TipoNormativo; numero: string; anio: number; fecha: string; asunto: string },
    file: UploadedFile | undefined,
    ip: string | null,
  ): Promise<DocumentRecord> {
    authorize(actor, 'documents.create');
    if (!file) throw new ValidationError('Adjunte el documento en PDF.', [{ campo: 'archivo', mensaje: 'Requerido' }]);
    const max = this.config.uploads.maxDocumentBytes;
    if (file.size > max) throw new PayloadTooLargeError(`El PDF supera el máximo de ${Math.round(max / 1048576)} MB.`);
    if (!isPdf(file.buffer, file.originalname)) throw new ValidationError('El archivo no es un PDF válido.', [{ campo: 'archivo', mensaje: 'No es PDF' }]);
    const scan = await this.scanner.scan(file.buffer);
    if (!scan.limpio) throw new ValidationError('El archivo fue rechazado por el análisis antimalware.');
    const archivo = await this.storage.save(this.storage.newName('pdf'), file.buffer);
    try {
      return await this.db.transaction(async () => {
        const id = await this.docs.create(
          { ...data, archivo, nombreOriginal: path.basename(String(file.originalname)).slice(0, 120), tamano: file.size },
          actor.id,
        );
        await this.audit.record({
          actor,
          accion: 'documento_crear',
          recurso: 'documento',
          recursoId: id,
          detalle: `${data.tipo} ${data.numero}/${data.anio}`,
          ip,
        });
        this.cache.invalidate();
        return (await this.docs.findById(id)) as DocumentRecord;
      });
    } catch (err) {
      await this.storage.remove(archivo);
      throw err;
    }
  }

  async remove(actor: Actor | null, id: number, ip: string | null): Promise<void> {
    authorize(actor, 'documents.delete');
    await this.db.transaction(async () => {
      const doc = await this.docs.findById(id);
      if (!doc) throw new NotFoundError('El documento no existe.');
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
  async file(id: number): Promise<{ path: string; nombre: string } | null> {
    const doc = await this.docs.findById(id);
    const file = doc ? this.storage.resolve(doc.archivo) : null;
    if (!doc || !file || !this.storage.exists(doc.archivo)) return null;
    return { path: file, nombre: `${doc.tipo}-${doc.numero}-${doc.anio}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_') };
  }

  async count(): Promise<number> {
    return this.docs.count();
  }
}

// ---------------------------------------------------------------- PQRSD

export const TIPOS_PQRSD = Object.freeze(['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Denuncia', 'Solicitud de información'] as const);
export const TIPOS_IDENTIFICACION = Object.freeze([
  'Cédula de ciudadanía',
  'Tarjeta de identidad',
  'Cédula de extranjería',
  'Pasaporte',
  'NIT',
  'PPT',
] as const);
export const ESTADOS_PQRSD = Object.freeze(['Radicada', 'En trámite', 'Respondida', 'Cerrada'] as const);

@Injectable()
export class PqrsdService {
  readonly TIPOS = TIPOS_PQRSD;
  readonly TIPOS_DOCUMENTO = TIPOS_IDENTIFICACION;
  readonly ESTADOS = ESTADOS_PQRSD;

  constructor(
    private readonly repo: PqrsdRepository,
    private readonly audit: AuditService,
  ) {}

  async file(data: PqrsdInput): Promise<string> {
    return this.repo.create(data);
  }

  /** Vista ciudadana: sin correo, teléfono ni documento. */
  async lookup(radicado: string, documento: string) {
    const d = await this.repo.findByRadicadoAndDocument(radicado, documento);
    if (!d) return null;
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

  async list(actor: Actor | null, filters: { estado?: string; page?: number; pageSize?: number }) {
    authorize(actor, 'pqrsd.read');
    return this.repo.list(filters);
  }

  async get(actor: Actor | null, id: number, ip: string | null) {
    authorize(actor, 'pqrsd.read');
    const d = await this.repo.findById(id);
    if (!d) throw new NotFoundError('La solicitud no existe.');
    await this.audit.record({ actor, accion: 'pqrsd_ver', recurso: 'pqrsd', recursoId: d.radicado, ip }); // cada acceso a datos personales queda registrado
    return d;
  }

  async respond(actor: Actor | null, id: number, input: { estado: string; respuesta: string }, ip: string | null) {
    authorize(actor, 'pqrsd.respond');
    const d = await this.repo.findById(id);
    if (!d) throw new NotFoundError('La solicitud no existe.');
    await this.repo.respond(id, input.estado, input.respuesta);
    await this.audit.record({ actor, accion: 'pqrsd_responder', recurso: 'pqrsd', recursoId: d.radicado, detalle: `${d.estado} → ${input.estado}`, ip });
    return this.repo.findById(id);
  }

  async countByStatus() {
    return this.repo.countByStatus();
  }
}

// ---------------------------------------------------------------- Instituciones y buscador

@Injectable()
export class InstitutionService {
  constructor(
    private readonly repo: InstitutionRepository,
    private readonly cache: PublicCache,
  ) {}

  async list(q = '') {
    const term = String(q).slice(0, 80);
    return term ? this.repo.list(term) : this.cache.get('instituciones', () => this.repo.list(''));
  }
}

const norm = (s: string) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Buscador del sitio público: secciones fijas, páginas, noticias y documentos publicados. */
@Injectable()
export class SearchService {
  constructor(
    private readonly pages: PageService,
    private readonly news: NewsService,
    private readonly documents: DocumentService,
  ) {}

  async search(q: string) {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const matches = (text: string) => {
      const hay = norm(text);
      return words.every((w) => hay.includes(w));
    };
    const secciones = SEARCH_INDEX.filter((p) => matches(`${p.t} ${p.k}`));
    const [publicadas, noticias, documentos] = await Promise.all([
      this.pages.listPublished(),
      this.news.listPublished({ q, pageSize: 10 }),
      this.documents.listPublic({ q, pageSize: 10 }),
    ]);
    const paginas = publicadas.filter((p) => matches(`${p.titulo} ${p.slug}`) && !secciones.some((s) => s.u === `/${p.slug}`));
    return { secciones, paginas, noticias: noticias.items, documentos: documentos.items };
  }
}
