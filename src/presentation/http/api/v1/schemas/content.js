'use strict';
/** DTOs de multimedia, páginas, noticias, sliders, normatividad y PQRSD. */
const { registry } = require('../../openapi');
const { z, Id, Fecha, FechaHora, Estado, listQuery, paginated, single, BoolString } = require('./common');
const { bloqueSchema, esEnlaceSeguro, SLUG_RE } = require('../../../../../domain/content');
const { UBICACION_RE } = require('../../../../../application/sliderService');
const { CATEGORIAS } = require('../../../../../application/newsService');
const { TIPOS: TIPOS_DOC } = require('../../../../../application/documentService');
const { ESTADOS: ESTADOS_PQRSD } = require('../../../../../application/pqrsdService');
const { ALLOWED_MEDIA } = require('../../../../../infrastructure/storage/fileTypeDetector');

const mediaUrl = (m) => `/media/${m.archivo}`;
const privateUrl = (m, thumb = false) => `/api/v1/medios/${m.id}/archivo${thumb ? '?miniatura=true' : ''}`;

// --- Multimedia ---
const Usage = z.strictObject({
  entidad: z.enum(['pagina', 'noticia', 'diapositiva']),
  entidadId: z.number().int(),
  titulo: z.string().nullable(),
  publicado: z.boolean(),
});
const Media = registry.register(
  'Medio',
  z.strictObject({
    id: z.number().int().openapi({ example: 31 }),
    tipo: z.enum(['imagen', 'audio']),
    mime: z.string().openapi({ example: 'image/jpeg' }),
    nombreVisible: z.string().openapi({ example: 'Foto jornada de matrícula' }),
    nombreOriginal: z.string().openapi({ example: 'IMG_2031.jpg' }),
    tamano: z.number().int().openapi({ example: 248113 }),
    ancho: z.number().int().nullable(),
    alto: z.number().int().nullable(),
    textoAlternativo: z.string().openapi({ example: 'Estudiantes haciendo fila en la institución' }),
    descripcion: z.string(),
    visibilidad: z.enum(['publica', 'privada']).openapi({ description: 'privada: solo se sirve al público si la usa un contenido publicado.' }),
    totalUsos: z.number().int(),
    url: z.string().openapi({ description: 'URL de acceso desde el panel (autenticada).', example: '/api/v1/medios/31/archivo' }),
    miniaturaUrl: z.string().nullable(),
    urlPublica: z.string().openapi({
      description: 'URL pública; responde 404 mientras el archivo sea privado y no esté en uso publicado.',
      example: '/media/3f2a9c0d1e4b5a6c7d8e9f0a1b2c3d4e.jpg',
    }),
    creadoEn: FechaHora,
    actualizadoEn: FechaHora,
    usos: z.array(Usage).optional(),
  }),
);
const MediaList = paginated('ListaMedios', Media);
const MediaOne = single('MedioRespuesta', Media);
const MediaUploadResult = single('MediosSubidos', z.array(Media));
const MediaQuery = listQuery(['creadoEn', 'nombreVisible', 'tamano'], {
  tipo: z.enum(['imagen', 'audio']).optional(),
  visibilidad: z.enum(['publica', 'privada']).optional(),
});
const MediaUpdate = z
  .strictObject({
    nombreVisible: z.string().trim().min(1).max(150).optional(),
    textoAlternativo: z.string().trim().max(250).optional(),
    descripcion: z.string().trim().max(1000).optional(),
    visibilidad: z.enum(['publica', 'privada']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');
const MediaUploadForm = z.object({
  archivos: z.array(z.string().openapi({ type: 'string', format: 'binary' })).openapi({
    description: `Hasta 10 archivos. Formatos: ${ALLOWED_MEDIA.map((f) => f.extensiones.join('/')).join(', ')}. Imágenes ≤ 8 MB, audio ≤ 20 MB. SVG no se acepta.`,
  }),
  nombreVisible: z.string().max(150).optional(),
  textoAlternativo: z.string().max(250).optional(),
  descripcion: z.string().max(1000).optional(),
  visibilidad: z.enum(['publica', 'privada']).optional(),
});
const MediaUploadFields = MediaUploadForm.omit({ archivos: true }).strict();
const MediaReplaceForm = z.object({ archivo: z.string().openapi({ type: 'string', format: 'binary' }), confirmar: z.enum(['true', 'false']).optional() });
const MediaReplaceFields = z.strictObject({ confirmar: BoolString.optional() });
const ConfirmQuery = z.object({
  confirmar: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
    .openapi({ description: 'Debe ser true si el archivo está en uso (respuesta 409 previa).' }),
});
const FileQuery = z.object({
  miniatura: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const toMedia = (m) => ({
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
  ...(m.usos ? { usos: m.usos.map((u) => ({ entidad: u.entidad, entidadId: u.entidadId, titulo: u.titulo ?? null, publicado: !!u.publicado })) } : {}),
});

// --- Páginas ---
// z.lazy: el esquema del dominio se crea antes de activar la extensión OpenAPI de Zod.
const Bloque = registry.register(
  'Bloque',
  z.lazy(() => bloqueSchema).openapi({ description: 'Bloque de contenido. El HTML de los bloques de texto se sanitiza en el servidor (lista blanca).' }),
);
const PageSummary = z.strictObject({
  id: z.number().int(),
  slug: z.string().openapi({ example: 'secretaria' }),
  titulo: z.string().openapi({ example: 'La Secretaría' }),
  resumen: z.string(),
  estado: Estado,
  sistema: z.boolean(),
  publicadaEn: FechaHora.nullable(),
  actualizadoEn: FechaHora,
});
const Page = registry.register('Pagina', PageSummary.extend({ bloques: z.array(Bloque) }));
const PageList = paginated('ListaPaginas', PageSummary);
const PageOne = single('PaginaRespuesta', Page);
const PageQuery = listQuery(['titulo', 'actualizadoEn', 'slug'], { estado: Estado.optional() });
const SlugInput = z.string().trim().toLowerCase().max(80).regex(SLUG_RE, 'Solo minúsculas, números y guiones');
const PageCreate = z.strictObject({
  titulo: z.string().trim().min(3).max(160).openapi({ example: 'Calendario escolar 2027' }),
  slug: SlugInput.optional().openapi({ example: 'calendario-escolar-2027', description: 'Opcional: se genera desde el título.' }),
  resumen: z.string().trim().max(300).default(''),
  estado: Estado.default('borrador'),
  bloques: z.array(z.any()).max(150).default([]).openapi({ description: 'Lista de bloques (ver esquema Bloque). Se valida y sanitiza en el servidor.' }),
});
const PageUpdate = z
  .strictObject({
    titulo: z.string().trim().min(3).max(160).optional(),
    slug: SlugInput.optional(),
    resumen: z.string().trim().max(300).optional(),
    estado: Estado.optional(),
    bloques: z.array(z.any()).max(150).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');
const toPageSummary = (p) => ({
  id: p.id,
  slug: p.slug,
  titulo: p.titulo,
  resumen: p.resumen,
  estado: p.estado,
  sistema: !!p.sistema,
  publicadaEn: p.publicadaEn ?? null,
  actualizadoEn: p.actualizadoEn,
});
const toPage = (p) => ({ ...toPageSummary(p), bloques: p.bloques });

// --- Noticias ---
const NewsBase = {
  id: z.number().int(),
  slug: z.string().openapi({ example: 'inscripciones-2027' }),
  titulo: z.string().openapi({ example: 'Abiertas las inscripciones 2027' }),
  resumen: z.string(),
  categoria: z.string(),
  fechaPublicacion: z.string().openapi({ example: '2026-11-10' }),
};
const News = registry.register(
  'Noticia',
  z.strictObject({
    ...NewsBase,
    estado: Estado,
    contenido: z.string().openapi({ description: 'HTML sanitizado' }),
    imagenId: z.number().int().nullable(),
    fotos: z.array(z.number().int()),
    actualizadoEn: FechaHora,
  }),
);
const NewsList = paginated('ListaNoticias', News.omit({ contenido: true, fotos: true }));
const NewsOne = single('NoticiaRespuesta', News);
const NewsQuery = listQuery(['fechaPublicacion', 'titulo', 'actualizadoEn'], { estado: Estado.optional(), categoria: z.enum(CATEGORIAS).optional() });
const NewsCreate = z.strictObject({
  titulo: z.string().trim().min(5).max(160),
  slug: SlugInput.optional(),
  resumen: z.string().trim().min(10).max(300),
  contenido: z.string().min(1).max(100000).openapi({ example: '<p>Texto de la noticia…</p>' }),
  categoria: z.enum(CATEGORIAS).default('Institucional'),
  estado: Estado.default('borrador'),
  fechaPublicacion: Fecha,
  imagenId: Id.nullable().optional().openapi({ description: 'Imagen principal desde la biblioteca' }),
  fotos: z.array(Id).max(30).default([]).openapi({ description: 'Fotografías adicionales desde la biblioteca' }),
});
const NewsUpdate = z
  .strictObject({
    titulo: z.string().trim().min(5).max(160).optional(),
    slug: SlugInput.optional(),
    resumen: z.string().trim().min(10).max(300).optional(),
    contenido: z.string().min(1).max(100000).optional(),
    categoria: z.enum(CATEGORIAS).optional(),
    estado: Estado.optional(),
    fechaPublicacion: Fecha.optional(),
    imagenId: Id.nullable().optional(),
    fotos: z.array(Id).max(30).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');
const toNews = (n) => ({
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
});
const toNewsItem = (n) => ({
  id: n.id,
  slug: n.slug,
  titulo: n.titulo,
  resumen: n.resumen,
  categoria: n.categoria,
  fechaPublicacion: n.fechaPublicacion,
  estado: n.estado,
  imagenId: n.imagenId ?? null,
  actualizadoEn: n.actualizadoEn,
});

// --- Sliders ---
const Ubicacion = z.string().regex(UBICACION_RE, 'Use "inicio" o "pagina:<direccion>"').openapi({ example: 'pagina:contacto' });
const SafeLink = z.string().trim().max(500).refine(esEnlaceSeguro, 'Enlace no permitido');
const Slide = registry.register(
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
});
const Slider = registry.register('Slider', SliderSummary.omit({ totalDiapositivas: true }).extend({ diapositivas: z.array(Slide) }));
const SliderList = single('ListaSliders', z.array(SliderSummary));
const SliderOne = single('SliderRespuesta', Slider);
const SliderCreate = z.strictObject({
  nombre: z.string().trim().min(3).max(80).openapi({ example: 'Portada' }),
  ubicacion: Ubicacion,
  activo: z.boolean().default(true),
});
const SliderUpdate = z
  .strictObject({ nombre: z.string().trim().min(3).max(80).optional(), ubicacion: Ubicacion.optional(), activo: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');
const SlideCreate = z.strictObject({
  medioId: Id,
  titulo: z.string().trim().max(120).default(''),
  texto: z.string().trim().max(300).default(''),
  enlace: SafeLink.default(''),
  textoEnlace: z.string().trim().max(40).default(''),
  activa: z.boolean().default(true),
});
const SlideUpdate = z
  .strictObject({
    medioId: Id.optional(),
    titulo: z.string().trim().max(120).optional(),
    texto: z.string().trim().max(300).optional(),
    enlace: SafeLink.optional(),
    textoEnlace: z.string().trim().max(40).optional(),
    activa: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Envíe al menos un campo.');
const SlideParams = z.object({ id: Id, diapositivaId: Id });
const ReorderBody = z.strictObject({
  orden: z
    .array(Id)
    .min(1)
    .max(50)
    .openapi({ example: [5, 3, 4], description: 'IDs de todas las diapositivas en el nuevo orden' }),
});
const toSlide = (d) => ({
  id: d.id,
  medioId: d.medioId ?? null,
  titulo: d.titulo,
  texto: d.texto,
  enlace: d.enlace,
  textoEnlace: d.textoEnlace,
  orden: d.orden,
  activa: !!d.activa,
});
const toSliderSummary = (s) => ({
  id: s.id,
  nombre: s.nombre,
  ubicacion: s.ubicacion,
  activo: !!s.activo,
  totalDiapositivas: s.totalDiapositivas,
  actualizadoEn: s.actualizadoEn,
});
const toSlider = (s) => ({
  id: s.id,
  nombre: s.nombre,
  ubicacion: s.ubicacion,
  activo: !!s.activo,
  actualizadoEn: s.actualizadoEn,
  diapositivas: s.diapositivas.map(toSlide),
});

// --- Normatividad ---
const DocTipo = z.enum(Object.keys(TIPOS_DOC));
const Document = registry.register(
  'Documento',
  z.strictObject({
    id: z.number().int(),
    tipo: DocTipo,
    numero: z.string().openapi({ example: '015' }),
    anio: z.number().int().openapi({ example: 2026 }),
    fecha: z.string().openapi({ example: '2026-11-05' }),
    asunto: z.string().openapi({ example: 'Calendario académico 2027' }),
    tamano: z.number().int(),
    url: z.string().openapi({ example: '/documentos/9' }),
  }),
);
const DocumentList = paginated('ListaDocumentos', Document);
const DocumentOne = single('DocumentoRespuesta', Document);
const DocumentQuery = listQuery([], { tipo: DocTipo.optional(), anio: z.coerce.number().int().min(1990).max(2100).optional() }).omit({ sort: true });
const DocumentForm = z.object({
  archivo: z.string().openapi({ type: 'string', format: 'binary', description: 'PDF real (se verifica su firma), máx. 10 MB' }),
  tipo: DocTipo,
  numero: z.string(),
  anio: z.string(),
  fecha: z.string(),
  asunto: z.string(),
});
const DocumentFields = z.strictObject({
  tipo: DocTipo,
  numero: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9.\-/ ]{1,30}$/, 'Solo letras, números, puntos, guiones y barras'),
  anio: z.coerce.number().int().min(1990).max(2100),
  fecha: Fecha,
  asunto: z.string().trim().min(5).max(300),
});
const toDocument = (d) => ({
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
const PqrsdItem = z.strictObject({
  id: z.number().int(),
  radicado: z.string().openapi({ example: 'SEM-2026-00000000' }),
  tipo: z.string(),
  estado: z.enum(ESTADOS_PQRSD),
  nombre: z.string(),
  asunto: z.string(),
  creadoEn: FechaHora,
});
const Pqrsd = registry.register(
  'Pqrsd',
  PqrsdItem.extend({
    tipoDocumento: z.string(),
    documento: z.string(),
    email: z.string(),
    telefono: z.string(),
    mensaje: z.string(),
    respuesta: z.string(),
    actualizadoEn: FechaHora,
  }).openapi({ description: 'Contiene datos personales: solo con permiso pqrsd.read; cada consulta queda auditada.' }),
);
const PqrsdList = paginated('ListaPqrsd', PqrsdItem);
const PqrsdOne = single('PqrsdRespuesta', Pqrsd);
const PqrsdQuery = listQuery([], { estado: z.enum(ESTADOS_PQRSD).optional() }).omit({ sort: true, q: true });
const PqrsdRespond = z.strictObject({ estado: z.enum(ESTADOS_PQRSD), respuesta: z.string().trim().max(10000).default('') });
const toPqrsdItem = (d) => ({ id: d.id, radicado: d.radicado, tipo: d.tipo, estado: d.estado, nombre: d.nombre, asunto: d.asunto, creadoEn: d.creadoEn });
const toPqrsd = (d) => ({
  ...toPqrsdItem(d),
  tipoDocumento: d.tipoDocumento,
  documento: d.documento,
  email: d.email,
  telefono: d.telefono || '',
  mensaje: d.mensaje,
  respuesta: d.respuesta || '',
  actualizadoEn: d.actualizadoEn,
});

module.exports = {
  mediaUrl,
  Media,
  MediaList,
  MediaOne,
  MediaUploadResult,
  MediaQuery,
  MediaUpdate,
  MediaUploadForm,
  MediaUploadFields,
  MediaReplaceForm,
  MediaReplaceFields,
  ConfirmQuery,
  FileQuery,
  toMedia,
  PageList,
  PageOne,
  PageQuery,
  PageCreate,
  PageUpdate,
  toPage,
  toPageSummary,
  NewsList,
  NewsOne,
  NewsQuery,
  NewsCreate,
  NewsUpdate,
  toNews,
  toNewsItem,
  CATEGORIAS,
  SliderList,
  SliderOne,
  SliderCreate,
  SliderUpdate,
  SlideCreate,
  SlideUpdate,
  SlideParams,
  ReorderBody,
  toSlider,
  toSliderSummary,
  DocumentList,
  DocumentOne,
  DocumentQuery,
  DocumentForm,
  DocumentFields,
  toDocument,
  PqrsdList,
  PqrsdOne,
  PqrsdQuery,
  PqrsdRespond,
  toPqrsd,
  toPqrsdItem,
};
