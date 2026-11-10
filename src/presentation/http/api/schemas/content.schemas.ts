/** DTOs de multimedia, páginas, noticias, sliders, normatividad y PQRSD. */
import { CATEGORIAS } from '../../../../application/content.services';
import { ESTADOS_PQRSD, TIPOS_DOCUMENTO_NORMATIVO } from '../../../../application/citizen.services';
import { bloqueSchema, esEnlaceSeguro, SLUG_RE, UBICACION_RE } from '../../../../domain/content';
import type {
  DocumentRecord,
  MediaRecord,
  MediaUsage,
  NewsRecord,
  PageRecord,
  SlideRecord,
  SliderRecord,
} from '../../../../infrastructure/repositories/content.repositories';
import type { PqrsdRecord } from '../../../../infrastructure/repositories/citizen.repositories';
import { ALLOWED_MEDIA } from '../../../../infrastructure/storage/file-type-detector';
import { named } from '../openapi';
import { BoolString, Estado, Fecha, FechaHora, Id, listQuery, paginated, single, VersionInput, VersionOutput, z } from './common';

export const mediaUrl = (m: Pick<MediaRecord, 'archivo'>) => `/media/${m.archivo}`;
const privateUrl = (m: Pick<MediaRecord, 'id'>, thumb = false) => `/api/v1/medios/${m.id}/archivo${thumb ? '?miniatura=true' : ''}`;
const atLeastOne = (v: Record<string, unknown>) => Object.keys(v).some((k) => k !== 'version');
const AT_LEAST_ONE = 'Envíe al menos un campo.';

// --- Multimedia ---
const Usage = z.strictObject({
  entidad: z.enum(['pagina', 'noticia', 'diapositiva']),
  entidadId: z.number().int(),
  titulo: z.string().nullable(),
  publicado: z.boolean(),
});
export const Media = named(
  'Medio',
  z.strictObject({
    id: z.number().int().meta({ example: 31 }),
    tipo: z.enum(['imagen', 'audio']),
    mime: z.string().meta({ example: 'image/jpeg' }),
    nombreVisible: z.string().meta({ example: 'Foto jornada de matrícula' }),
    nombreOriginal: z.string().meta({ example: 'IMG_2031.jpg' }),
    tamano: z.number().int().meta({ example: 248113 }),
    ancho: z.number().int().nullable(),
    alto: z.number().int().nullable(),
    textoAlternativo: z.string().meta({ example: 'Estudiantes haciendo fila en la institución' }),
    descripcion: z.string(),
    visibilidad: z.enum(['publica', 'privada']).meta({ description: 'privada: solo se sirve al público si la usa un contenido publicado.' }),
    totalUsos: z.number().int(),
    url: z.string().meta({ description: 'URL de acceso desde el panel (autenticada).', example: '/api/v1/medios/31/archivo' }),
    miniaturaUrl: z.string().nullable(),
    urlPublica: z
      .string()
      .meta({
        description: 'URL pública; responde 404 mientras el archivo sea privado y no esté en uso publicado.',
        example: '/media/3f2a9c0d1e4b5a6c7d8e9f0a1b2c3d4e.jpg',
      }),
    creadoEn: FechaHora,
    actualizadoEn: FechaHora,
    version: VersionOutput,
    usos: z.array(Usage).optional(),
  }),
);
export const MediaList = paginated('ListaMedios', Media);
export const MediaOne = single('MedioRespuesta', Media);
export const MediaUploadResult = single('MediosSubidos', z.array(Media));
export const MediaQuery = listQuery(['creadoEn', 'nombreVisible', 'tamano'], {
  tipo: z.enum(['imagen', 'audio']).optional(),
  visibilidad: z.enum(['publica', 'privada']).optional(),
});
export const MediaUpdate = z
  .strictObject({
    nombreVisible: z.string().trim().min(1).max(150).optional(),
    textoAlternativo: z.string().trim().max(250).optional(),
    descripcion: z.string().trim().max(1000).optional(),
    visibilidad: z.enum(['publica', 'privada']).optional(),
    version: VersionInput,
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export const MediaUploadForm = z.object({
  archivos: z.array(z.string().meta({ format: 'binary' })).meta({
    description: `Hasta 10 archivos. Formatos: ${ALLOWED_MEDIA.map((f) => f.extensiones.join('/')).join(', ')}. Imágenes ≤ 8 MB, audio ≤ 20 MB. SVG no se acepta.`,
  }),
  nombreVisible: z.string().max(150).optional(),
  textoAlternativo: z.string().max(250).optional(),
  descripcion: z.string().max(1000).optional(),
  visibilidad: z.enum(['publica', 'privada']).optional(),
});
export const MediaUploadFields = MediaUploadForm.omit({ archivos: true }).strict();
export const MediaReplaceForm = z.object({
  archivo: z.string().meta({ format: 'binary' }),
  confirmar: z.enum(['true', 'false']).optional(),
  version: z.string().optional(),
});
export const MediaReplaceFields = z.strictObject({ confirmar: BoolString.optional(), version: z.coerce.number().int().min(1).optional() });
export const ConfirmQuery = z.object({
  confirmar: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .meta({ description: 'Debe ser true si el archivo está en uso (respuesta 409 previa).' }),
});
export const FileQuery = z.object({
  miniatura: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const toMedia = (m: MediaRecord & { usos?: MediaUsage[] }) => ({
  id: m.id,
  tipo: m.tipo,
  mime: m.mime,
  nombreVisible: m.nombreVisible,
  nombreOriginal: m.nombreOriginal,
  tamano: m.tamano,
  ancho: m.ancho ?? null,
  alto: m.alto ?? null,
  textoAlternativo: m.textoAlternativo,
  descripcion: m.descripcion,
  visibilidad: m.visibilidad,
  totalUsos: m.totalUsos ?? 0,
  url: privateUrl(m),
  miniaturaUrl: m.miniatura ? privateUrl(m, true) : null,
  urlPublica: mediaUrl(m),
  creadoEn: m.creadoEn,
  actualizadoEn: m.actualizadoEn,
  version: m.version,
  ...(m.usos ? { usos: m.usos.map((u) => ({ entidad: u.entidad, entidadId: u.entidadId, titulo: u.titulo ?? null, publicado: !!u.publicado })) } : {}),
});

// --- Páginas ---
export const Bloque = named(
  'Bloque',
  z.lazy(() => bloqueSchema).meta({ description: 'Bloque de contenido. El HTML de los bloques de texto se sanitiza en el servidor (lista blanca).' }),
);
const PageSummary = z.strictObject({
  id: z.number().int(),
  slug: z.string().meta({ example: 'secretaria' }),
  titulo: z.string().meta({ example: 'La Secretaría' }),
  resumen: z.string(),
  estado: Estado,
  sistema: z.boolean(),
  publicadaEn: FechaHora.nullable(),
  actualizadoEn: FechaHora,
  version: VersionOutput,
});
export const PageSchema = named('Pagina', PageSummary.extend({ bloques: z.array(Bloque) }));
export const PageList = paginated('ListaPaginas', PageSummary);
export const PageOne = single('PaginaRespuesta', PageSchema);
export const PageQuery = listQuery(['titulo', 'actualizadoEn', 'slug'], { estado: Estado.optional() });
const SlugInput = z.string().trim().toLowerCase().max(80).regex(SLUG_RE, 'Solo minúsculas, números y guiones');
export const PageCreate = z.strictObject({
  titulo: z.string().trim().min(3).max(160).meta({ example: 'Calendario escolar 2027' }),
  slug: SlugInput.optional().meta({ example: 'calendario-escolar-2027', description: 'Opcional: se genera desde el título.' }),
  resumen: z.string().trim().max(300).default(''),
  estado: Estado.default('borrador'),
  bloques: z.array(z.any()).max(150).default([]).meta({ description: 'Lista de bloques (ver esquema Bloque). Se valida y sanitiza en el servidor.' }),
});
export const PageUpdate = z
  .strictObject({
    titulo: z.string().trim().min(3).max(160).optional(),
    slug: SlugInput.optional(),
    resumen: z.string().trim().max(300).optional(),
    estado: Estado.optional(),
    bloques: z.array(z.any()).max(150).optional(),
    version: VersionInput,
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export const toPageSummary = (p: Omit<PageRecord, 'bloques'>) => ({
  id: p.id,
  slug: p.slug,
  titulo: p.titulo,
  resumen: p.resumen,
  estado: p.estado,
  sistema: !!p.sistema,
  publicadaEn: p.publicadaEn ?? null,
  actualizadoEn: p.actualizadoEn,
  version: p.version,
});
export const toPage = (p: PageRecord) => ({ ...toPageSummary(p), bloques: p.bloques });

// --- Noticias ---
const NewsBase = {
  id: z.number().int(),
  slug: z.string().meta({ example: 'inscripciones-2027' }),
  titulo: z.string().meta({ example: 'Abiertas las inscripciones 2027' }),
  resumen: z.string(),
  categoria: z.string(),
  fechaPublicacion: z.string().meta({ example: '2026-11-10' }),
};
export const News = named(
  'Noticia',
  z.strictObject({
    ...NewsBase,
    estado: Estado,
    contenido: z.string().meta({ description: 'HTML sanitizado' }),
    imagenId: z.number().int().nullable(),
    fotos: z.array(z.number().int()),
    actualizadoEn: FechaHora,
    version: VersionOutput,
  }),
);
export const NewsList = paginated('ListaNoticias', News.omit({ contenido: true, fotos: true }));
export const NewsOne = single('NoticiaRespuesta', News);
const Categoria = z.enum(CATEGORIAS as unknown as [string, ...string[]]);
export const NewsQuery = listQuery(['fechaPublicacion', 'titulo', 'actualizadoEn'], { estado: Estado.optional(), categoria: Categoria.optional() });
export const NewsCreate = z.strictObject({
  titulo: z.string().trim().min(5).max(160),
  slug: SlugInput.optional(),
  resumen: z.string().trim().min(10).max(300),
  contenido: z.string().min(1).max(100000).meta({ example: '<p>Texto de la noticia…</p>' }),
  categoria: Categoria.default('Institucional'),
  estado: Estado.default('borrador'),
  fechaPublicacion: Fecha,
  imagenId: Id.nullable().optional().meta({ description: 'Imagen principal desde la biblioteca' }),
  fotos: z.array(Id).max(30).default([]).meta({ description: 'Fotografías adicionales desde la biblioteca' }),
});
export const NewsUpdate = z
  .strictObject({
    titulo: z.string().trim().min(5).max(160).optional(),
    slug: SlugInput.optional(),
    resumen: z.string().trim().min(10).max(300).optional(),
    contenido: z.string().min(1).max(100000).optional(),
    categoria: Categoria.optional(),
    estado: Estado.optional(),
    fechaPublicacion: Fecha.optional(),
    imagenId: Id.nullable().optional(),
    fotos: z.array(Id).max(30).optional(),
    version: VersionInput,
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export const toNews = (n: NewsRecord) => ({
  id: n.id,
  slug: n.slug,
  titulo: n.titulo,
  resumen: n.resumen,
  categoria: n.categoria,
  fechaPublicacion: n.fechaPublicacion,
  estado: n.estado,
  contenido: n.contenido,
  imagenId: n.imagenId ?? null,
  fotos: n.fotos ?? [],
  actualizadoEn: n.actualizadoEn,
  version: n.version,
});
export const toNewsItem = (n: NewsRecord) => ({
  id: n.id,
  slug: n.slug,
  titulo: n.titulo,
  resumen: n.resumen,
  categoria: n.categoria,
  fechaPublicacion: n.fechaPublicacion,
  estado: n.estado,
  imagenId: n.imagenId ?? null,
  actualizadoEn: n.actualizadoEn,
  version: n.version,
});

// --- Sliders ---
const Ubicacion = z.string().regex(UBICACION_RE, 'Use "inicio" o "pagina:<direccion>"').meta({ example: 'pagina:contacto' });
const SafeLink = z.string().trim().max(500).refine(esEnlaceSeguro, 'Enlace no permitido');
export const Slide = named(
  'Diapositiva',
  z.strictObject({
    id: z.number().int(),
    medioId: z.number().int().nullable(),
    titulo: z.string(),
    texto: z.string(),
    enlace: z.string(),
    textoEnlace: z.string(),
    orden: z.number().int(),
    activa: z.boolean(),
  }),
);
const SliderSummary = z.strictObject({
  id: z.number().int(),
  nombre: z.string(),
  ubicacion: z.string(),
  activo: z.boolean(),
  totalDiapositivas: z.number().int(),
  actualizadoEn: FechaHora,
  version: VersionOutput,
});
export const SliderSchema = named('Slider', SliderSummary.omit({ totalDiapositivas: true }).extend({ diapositivas: z.array(Slide) }));
export const SliderList = single('ListaSliders', z.array(SliderSummary));
export const SliderOne = single('SliderRespuesta', SliderSchema);
export const SliderCreate = z.strictObject({
  nombre: z.string().trim().min(3).max(80).meta({ example: 'Portada' }),
  ubicacion: Ubicacion,
  activo: z.boolean().default(true),
});
export const SliderUpdate = z
  .strictObject({ nombre: z.string().trim().min(3).max(80).optional(), ubicacion: Ubicacion.optional(), activo: z.boolean().optional(), version: VersionInput })
  .refine(atLeastOne, AT_LEAST_ONE);
export const SlideCreate = z.strictObject({
  medioId: Id,
  titulo: z.string().trim().max(120).default(''),
  texto: z.string().trim().max(300).default(''),
  enlace: SafeLink.default(''),
  textoEnlace: z.string().trim().max(40).default(''),
  activa: z.boolean().default(true),
  version: VersionInput,
});
export const SlideUpdate = z
  .strictObject({
    medioId: Id.optional(),
    titulo: z.string().trim().max(120).optional(),
    texto: z.string().trim().max(300).optional(),
    enlace: SafeLink.optional(),
    textoEnlace: z.string().trim().max(40).optional(),
    activa: z.boolean().optional(),
    version: VersionInput,
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export const SlideParams = z.object({ id: Id, diapositivaId: Id });
export const VersionQuery = z.object({
  version: z.coerce.number().int().min(1).optional().meta({ description: 'Versión del slider que se editó (bloqueo optimista).' }),
});
export const ReorderBody = z.strictObject({
  orden: z
    .array(Id)
    .min(1)
    .max(50)
    .meta({ example: [5, 3, 4], description: 'IDs de todas las diapositivas en el nuevo orden' }),
  version: VersionInput,
});
const toSlide = (d: SlideRecord) => ({
  id: d.id,
  medioId: d.medioId ?? null,
  titulo: d.titulo,
  texto: d.texto,
  enlace: d.enlace,
  textoEnlace: d.textoEnlace,
  orden: d.orden,
  activa: !!d.activa,
});
export const toSliderSummary = (s: SliderRecord) => ({
  id: s.id,
  nombre: s.nombre,
  ubicacion: s.ubicacion,
  activo: !!s.activo,
  totalDiapositivas: s.totalDiapositivas ?? 0,
  actualizadoEn: s.actualizadoEn,
  version: s.version,
});
export const toSlider = (s: SliderRecord) => ({
  id: s.id,
  nombre: s.nombre,
  ubicacion: s.ubicacion,
  activo: !!s.activo,
  actualizadoEn: s.actualizadoEn,
  version: s.version,
  diapositivas: (s.diapositivas ?? []).map(toSlide),
});

// --- Normatividad ---
const DocTipo = z.enum(Object.keys(TIPOS_DOCUMENTO_NORMATIVO) as [keyof typeof TIPOS_DOCUMENTO_NORMATIVO, ...Array<keyof typeof TIPOS_DOCUMENTO_NORMATIVO>]);
export const DocumentSchema = named(
  'Documento',
  z.strictObject({
    id: z.number().int(),
    tipo: DocTipo,
    numero: z.string().meta({ example: '015' }),
    anio: z.number().int().meta({ example: 2026 }),
    fecha: z.string().meta({ example: '2026-11-05' }),
    asunto: z.string().meta({ example: 'Calendario académico 2027' }),
    tamano: z.number().int(),
    url: z.string().meta({ example: '/documentos/9' }),
  }),
);
export const DocumentList = paginated('ListaDocumentos', DocumentSchema);
export const DocumentOne = single('DocumentoRespuesta', DocumentSchema);
export const DocumentQuery = listQuery([], { tipo: DocTipo.optional(), anio: z.coerce.number().int().min(1990).max(2100).optional() }).omit({ sort: true });
export const DocumentForm = z.object({
  archivo: z.string().meta({ format: 'binary', description: 'PDF real (se verifica su firma), máx. 10 MB' }),
  tipo: DocTipo,
  numero: z.string(),
  anio: z.string(),
  fecha: z.string(),
  asunto: z.string(),
});
export const DocumentFields = z.strictObject({
  tipo: DocTipo,
  numero: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.\-/ ]{1,30}$/, 'Solo letras, números, puntos, guiones y barras'),
  anio: z.coerce.number().int().min(1990).max(2100),
  fecha: Fecha,
  asunto: z.string().trim().min(5).max(300),
});
export const toDocument = (d: DocumentRecord) => ({
  id: d.id,
  tipo: d.tipo,
  numero: d.numero,
  anio: d.anio,
  fecha: d.fecha,
  asunto: d.asunto,
  tamano: d.tamano,
  url: `/documentos/${d.id}`,
});

// --- PQRSD ---
const EstadoPqrsd = z.enum(ESTADOS_PQRSD as unknown as [string, ...string[]]);
const PqrsdItem = z.strictObject({
  id: z.number().int(),
  radicado: z.string().meta({ example: 'SEM-2026-00000000' }),
  tipo: z.string(),
  estado: EstadoPqrsd,
  nombre: z.string(),
  asunto: z.string(),
  creadoEn: FechaHora,
});
export const Pqrsd = named(
  'Pqrsd',
  PqrsdItem.extend({
    tipoDocumento: z.string(),
    documento: z.string(),
    email: z.string(),
    telefono: z.string(),
    mensaje: z.string(),
    respuesta: z.string(),
    actualizadoEn: FechaHora,
  }).meta({ description: 'Contiene datos personales: solo con permiso pqrsd.read; cada consulta queda auditada.' }),
);
export const PqrsdList = paginated('ListaPqrsd', PqrsdItem);
export const PqrsdOne = single('PqrsdRespuesta', Pqrsd);
export const PqrsdQuery = listQuery([], { estado: EstadoPqrsd.optional() }).omit({ sort: true, q: true });
export const PqrsdRespond = z.strictObject({ estado: EstadoPqrsd, respuesta: z.string().trim().max(10000).default('') });
export const toPqrsdItem = (d: PqrsdRecord) => ({
  id: d.id,
  radicado: d.radicado,
  tipo: d.tipo,
  estado: d.estado,
  nombre: d.nombre,
  asunto: d.asunto,
  creadoEn: d.creadoEn,
});
export const toPqrsd = (d: PqrsdRecord) => ({
  ...toPqrsdItem(d),
  tipoDocumento: d.tipoDocumento,
  documento: d.documento,
  email: d.email,
  telefono: d.telefono || '',
  mensaje: d.mensaje,
  respuesta: d.respuesta || '',
  actualizadoEn: d.actualizadoEn,
});
