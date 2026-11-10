"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentFields = exports.DocumentForm = exports.DocumentQuery = exports.DocumentOne = exports.DocumentList = exports.DocumentSchema = exports.toSlider = exports.toSliderSummary = exports.ReorderBody = exports.VersionQuery = exports.SlideParams = exports.SlideUpdate = exports.SlideCreate = exports.SliderUpdate = exports.SliderCreate = exports.SliderOne = exports.SliderList = exports.SliderSchema = exports.Slide = exports.toNewsItem = exports.toNews = exports.NewsUpdate = exports.NewsCreate = exports.NewsQuery = exports.NewsOne = exports.NewsList = exports.News = exports.toPage = exports.toPageSummary = exports.PageUpdate = exports.PageCreate = exports.PageQuery = exports.PageOne = exports.PageList = exports.PageSchema = exports.Bloque = exports.toMedia = exports.FileQuery = exports.ConfirmQuery = exports.MediaReplaceFields = exports.MediaReplaceForm = exports.MediaUploadFields = exports.MediaUploadForm = exports.MediaUpdate = exports.MediaQuery = exports.MediaUploadResult = exports.MediaOne = exports.MediaList = exports.Media = exports.mediaUrl = void 0;
exports.toPqrsd = exports.toPqrsdItem = exports.PqrsdRespond = exports.PqrsdQuery = exports.PqrsdOne = exports.PqrsdList = exports.Pqrsd = exports.toDocument = void 0;
/** DTOs de multimedia, páginas, noticias, sliders, normatividad y PQRSD. */
const content_services_1 = require("../../../../application/content.services");
const citizen_services_1 = require("../../../../application/citizen.services");
const content_1 = require("../../../../domain/content");
const file_type_detector_1 = require("../../../../infrastructure/storage/file-type-detector");
const openapi_1 = require("../openapi");
const common_1 = require("./common");
const mediaUrl = (m) => `/media/${m.archivo}`;
exports.mediaUrl = mediaUrl;
const privateUrl = (m, thumb = false) => `/api/v1/medios/${m.id}/archivo${thumb ? '?miniatura=true' : ''}`;
const atLeastOne = (v) => Object.keys(v).some((k) => k !== 'version');
const AT_LEAST_ONE = 'Envíe al menos un campo.';
// --- Multimedia ---
const Usage = common_1.z.strictObject({
    entidad: common_1.z.enum(['pagina', 'noticia', 'diapositiva']),
    entidadId: common_1.z.number().int(),
    titulo: common_1.z.string().nullable(),
    publicado: common_1.z.boolean(),
});
exports.Media = (0, openapi_1.named)('Medio', common_1.z.strictObject({
    id: common_1.z.number().int().meta({ example: 31 }),
    tipo: common_1.z.enum(['imagen', 'audio']),
    mime: common_1.z.string().meta({ example: 'image/jpeg' }),
    nombreVisible: common_1.z.string().meta({ example: 'Foto jornada de matrícula' }),
    nombreOriginal: common_1.z.string().meta({ example: 'IMG_2031.jpg' }),
    tamano: common_1.z.number().int().meta({ example: 248113 }),
    ancho: common_1.z.number().int().nullable(),
    alto: common_1.z.number().int().nullable(),
    textoAlternativo: common_1.z.string().meta({ example: 'Estudiantes haciendo fila en la institución' }),
    descripcion: common_1.z.string(),
    visibilidad: common_1.z.enum(['publica', 'privada']).meta({ description: 'privada: solo se sirve al público si la usa un contenido publicado.' }),
    totalUsos: common_1.z.number().int(),
    url: common_1.z.string().meta({ description: 'URL de acceso desde el panel (autenticada).', example: '/api/v1/medios/31/archivo' }),
    miniaturaUrl: common_1.z.string().nullable(),
    urlPublica: common_1.z
        .string()
        .meta({
        description: 'URL pública; responde 404 mientras el archivo sea privado y no esté en uso publicado.',
        example: '/media/3f2a9c0d1e4b5a6c7d8e9f0a1b2c3d4e.jpg',
    }),
    creadoEn: common_1.FechaHora,
    actualizadoEn: common_1.FechaHora,
    version: common_1.VersionOutput,
    usos: common_1.z.array(Usage).optional(),
}));
exports.MediaList = (0, common_1.paginated)('ListaMedios', exports.Media);
exports.MediaOne = (0, common_1.single)('MedioRespuesta', exports.Media);
exports.MediaUploadResult = (0, common_1.single)('MediosSubidos', common_1.z.array(exports.Media));
exports.MediaQuery = (0, common_1.listQuery)(['creadoEn', 'nombreVisible', 'tamano'], {
    tipo: common_1.z.enum(['imagen', 'audio']).optional(),
    visibilidad: common_1.z.enum(['publica', 'privada']).optional(),
});
exports.MediaUpdate = common_1.z
    .strictObject({
    nombreVisible: common_1.z.string().trim().min(1).max(150).optional(),
    textoAlternativo: common_1.z.string().trim().max(250).optional(),
    descripcion: common_1.z.string().trim().max(1000).optional(),
    visibilidad: common_1.z.enum(['publica', 'privada']).optional(),
    version: common_1.VersionInput,
})
    .refine(atLeastOne, AT_LEAST_ONE);
exports.MediaUploadForm = common_1.z.object({
    archivos: common_1.z.array(common_1.z.string().meta({ format: 'binary' })).meta({
        description: `Hasta 10 archivos. Formatos: ${file_type_detector_1.ALLOWED_MEDIA.map((f) => f.extensiones.join('/')).join(', ')}. Imágenes ≤ 8 MB, audio ≤ 20 MB. SVG no se acepta.`,
    }),
    nombreVisible: common_1.z.string().max(150).optional(),
    textoAlternativo: common_1.z.string().max(250).optional(),
    descripcion: common_1.z.string().max(1000).optional(),
    visibilidad: common_1.z.enum(['publica', 'privada']).optional(),
});
exports.MediaUploadFields = exports.MediaUploadForm.omit({ archivos: true }).strict();
exports.MediaReplaceForm = common_1.z.object({
    archivo: common_1.z.string().meta({ format: 'binary' }),
    confirmar: common_1.z.enum(['true', 'false']).optional(),
    version: common_1.z.string().optional(),
});
exports.MediaReplaceFields = common_1.z.strictObject({ confirmar: common_1.BoolString.optional(), version: common_1.z.coerce.number().int().min(1).optional() });
exports.ConfirmQuery = common_1.z.object({
    confirmar: common_1.z
        .enum(['true', 'false'])
        .transform((v) => v === 'true')
        .optional()
        .meta({ description: 'Debe ser true si el archivo está en uso (respuesta 409 previa).' }),
});
exports.FileQuery = common_1.z.object({
    miniatura: common_1.z
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
    urlPublica: (0, exports.mediaUrl)(m),
    creadoEn: m.creadoEn,
    actualizadoEn: m.actualizadoEn,
    version: m.version,
    ...(m.usos ? { usos: m.usos.map((u) => ({ entidad: u.entidad, entidadId: u.entidadId, titulo: u.titulo ?? null, publicado: !!u.publicado })) } : {}),
});
exports.toMedia = toMedia;
// --- Páginas ---
exports.Bloque = (0, openapi_1.named)('Bloque', common_1.z.lazy(() => content_1.bloqueSchema).meta({ description: 'Bloque de contenido. El HTML de los bloques de texto se sanitiza en el servidor (lista blanca).' }));
const PageSummary = common_1.z.strictObject({
    id: common_1.z.number().int(),
    slug: common_1.z.string().meta({ example: 'secretaria' }),
    titulo: common_1.z.string().meta({ example: 'La Secretaría' }),
    resumen: common_1.z.string(),
    estado: common_1.Estado,
    sistema: common_1.z.boolean(),
    publicadaEn: common_1.FechaHora.nullable(),
    actualizadoEn: common_1.FechaHora,
    version: common_1.VersionOutput,
});
exports.PageSchema = (0, openapi_1.named)('Pagina', PageSummary.extend({ bloques: common_1.z.array(exports.Bloque) }));
exports.PageList = (0, common_1.paginated)('ListaPaginas', PageSummary);
exports.PageOne = (0, common_1.single)('PaginaRespuesta', exports.PageSchema);
exports.PageQuery = (0, common_1.listQuery)(['titulo', 'actualizadoEn', 'slug'], { estado: common_1.Estado.optional() });
const SlugInput = common_1.z.string().trim().toLowerCase().max(80).regex(content_1.SLUG_RE, 'Solo minúsculas, números y guiones');
exports.PageCreate = common_1.z.strictObject({
    titulo: common_1.z.string().trim().min(3).max(160).meta({ example: 'Calendario escolar 2027' }),
    slug: SlugInput.optional().meta({ example: 'calendario-escolar-2027', description: 'Opcional: se genera desde el título.' }),
    resumen: common_1.z.string().trim().max(300).default(''),
    estado: common_1.Estado.default('borrador'),
    bloques: common_1.z.array(common_1.z.any()).max(150).default([]).meta({ description: 'Lista de bloques (ver esquema Bloque). Se valida y sanitiza en el servidor.' }),
});
exports.PageUpdate = common_1.z
    .strictObject({
    titulo: common_1.z.string().trim().min(3).max(160).optional(),
    slug: SlugInput.optional(),
    resumen: common_1.z.string().trim().max(300).optional(),
    estado: common_1.Estado.optional(),
    bloques: common_1.z.array(common_1.z.any()).max(150).optional(),
    version: common_1.VersionInput,
})
    .refine(atLeastOne, AT_LEAST_ONE);
const toPageSummary = (p) => ({
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
exports.toPageSummary = toPageSummary;
const toPage = (p) => ({ ...(0, exports.toPageSummary)(p), bloques: p.bloques });
exports.toPage = toPage;
// --- Noticias ---
const NewsBase = {
    id: common_1.z.number().int(),
    slug: common_1.z.string().meta({ example: 'inscripciones-2027' }),
    titulo: common_1.z.string().meta({ example: 'Abiertas las inscripciones 2027' }),
    resumen: common_1.z.string(),
    categoria: common_1.z.string(),
    fechaPublicacion: common_1.z.string().meta({ example: '2026-11-10' }),
};
exports.News = (0, openapi_1.named)('Noticia', common_1.z.strictObject({
    ...NewsBase,
    estado: common_1.Estado,
    contenido: common_1.z.string().meta({ description: 'HTML sanitizado' }),
    imagenId: common_1.z.number().int().nullable(),
    fotos: common_1.z.array(common_1.z.number().int()),
    actualizadoEn: common_1.FechaHora,
    version: common_1.VersionOutput,
}));
exports.NewsList = (0, common_1.paginated)('ListaNoticias', exports.News.omit({ contenido: true, fotos: true }));
exports.NewsOne = (0, common_1.single)('NoticiaRespuesta', exports.News);
const Categoria = common_1.z.enum(content_services_1.CATEGORIAS);
exports.NewsQuery = (0, common_1.listQuery)(['fechaPublicacion', 'titulo', 'actualizadoEn'], { estado: common_1.Estado.optional(), categoria: Categoria.optional() });
exports.NewsCreate = common_1.z.strictObject({
    titulo: common_1.z.string().trim().min(5).max(160),
    slug: SlugInput.optional(),
    resumen: common_1.z.string().trim().min(10).max(300),
    contenido: common_1.z.string().min(1).max(100000).meta({ example: '<p>Texto de la noticia…</p>' }),
    categoria: Categoria.default('Institucional'),
    estado: common_1.Estado.default('borrador'),
    fechaPublicacion: common_1.Fecha,
    imagenId: common_1.Id.nullable().optional().meta({ description: 'Imagen principal desde la biblioteca' }),
    fotos: common_1.z.array(common_1.Id).max(30).default([]).meta({ description: 'Fotografías adicionales desde la biblioteca' }),
});
exports.NewsUpdate = common_1.z
    .strictObject({
    titulo: common_1.z.string().trim().min(5).max(160).optional(),
    slug: SlugInput.optional(),
    resumen: common_1.z.string().trim().min(10).max(300).optional(),
    contenido: common_1.z.string().min(1).max(100000).optional(),
    categoria: Categoria.optional(),
    estado: common_1.Estado.optional(),
    fechaPublicacion: common_1.Fecha.optional(),
    imagenId: common_1.Id.nullable().optional(),
    fotos: common_1.z.array(common_1.Id).max(30).optional(),
    version: common_1.VersionInput,
})
    .refine(atLeastOne, AT_LEAST_ONE);
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
    version: n.version,
});
exports.toNews = toNews;
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
    version: n.version,
});
exports.toNewsItem = toNewsItem;
// --- Sliders ---
const Ubicacion = common_1.z.string().regex(content_1.UBICACION_RE, 'Use "inicio" o "pagina:<direccion>"').meta({ example: 'pagina:contacto' });
const SafeLink = common_1.z.string().trim().max(500).refine(content_1.esEnlaceSeguro, 'Enlace no permitido');
exports.Slide = (0, openapi_1.named)('Diapositiva', common_1.z.strictObject({
    id: common_1.z.number().int(),
    medioId: common_1.z.number().int().nullable(),
    titulo: common_1.z.string(),
    texto: common_1.z.string(),
    enlace: common_1.z.string(),
    textoEnlace: common_1.z.string(),
    orden: common_1.z.number().int(),
    activa: common_1.z.boolean(),
}));
const SliderSummary = common_1.z.strictObject({
    id: common_1.z.number().int(),
    nombre: common_1.z.string(),
    ubicacion: common_1.z.string(),
    activo: common_1.z.boolean(),
    totalDiapositivas: common_1.z.number().int(),
    actualizadoEn: common_1.FechaHora,
    version: common_1.VersionOutput,
});
exports.SliderSchema = (0, openapi_1.named)('Slider', SliderSummary.omit({ totalDiapositivas: true }).extend({ diapositivas: common_1.z.array(exports.Slide) }));
exports.SliderList = (0, common_1.single)('ListaSliders', common_1.z.array(SliderSummary));
exports.SliderOne = (0, common_1.single)('SliderRespuesta', exports.SliderSchema);
exports.SliderCreate = common_1.z.strictObject({
    nombre: common_1.z.string().trim().min(3).max(80).meta({ example: 'Portada' }),
    ubicacion: Ubicacion,
    activo: common_1.z.boolean().default(true),
});
exports.SliderUpdate = common_1.z
    .strictObject({ nombre: common_1.z.string().trim().min(3).max(80).optional(), ubicacion: Ubicacion.optional(), activo: common_1.z.boolean().optional(), version: common_1.VersionInput })
    .refine(atLeastOne, AT_LEAST_ONE);
exports.SlideCreate = common_1.z.strictObject({
    medioId: common_1.Id,
    titulo: common_1.z.string().trim().max(120).default(''),
    texto: common_1.z.string().trim().max(300).default(''),
    enlace: SafeLink.default(''),
    textoEnlace: common_1.z.string().trim().max(40).default(''),
    activa: common_1.z.boolean().default(true),
    version: common_1.VersionInput,
});
exports.SlideUpdate = common_1.z
    .strictObject({
    medioId: common_1.Id.optional(),
    titulo: common_1.z.string().trim().max(120).optional(),
    texto: common_1.z.string().trim().max(300).optional(),
    enlace: SafeLink.optional(),
    textoEnlace: common_1.z.string().trim().max(40).optional(),
    activa: common_1.z.boolean().optional(),
    version: common_1.VersionInput,
})
    .refine(atLeastOne, AT_LEAST_ONE);
exports.SlideParams = common_1.z.object({ id: common_1.Id, diapositivaId: common_1.Id });
exports.VersionQuery = common_1.z.object({
    version: common_1.z.coerce.number().int().min(1).optional().meta({ description: 'Versión del slider que se editó (bloqueo optimista).' }),
});
exports.ReorderBody = common_1.z.strictObject({
    orden: common_1.z
        .array(common_1.Id)
        .min(1)
        .max(50)
        .meta({ example: [5, 3, 4], description: 'IDs de todas las diapositivas en el nuevo orden' }),
    version: common_1.VersionInput,
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
    totalDiapositivas: s.totalDiapositivas ?? 0,
    actualizadoEn: s.actualizadoEn,
    version: s.version,
});
exports.toSliderSummary = toSliderSummary;
const toSlider = (s) => ({
    id: s.id,
    nombre: s.nombre,
    ubicacion: s.ubicacion,
    activo: !!s.activo,
    actualizadoEn: s.actualizadoEn,
    version: s.version,
    diapositivas: (s.diapositivas ?? []).map(toSlide),
});
exports.toSlider = toSlider;
// --- Normatividad ---
const DocTipo = common_1.z.enum(Object.keys(citizen_services_1.TIPOS_DOCUMENTO_NORMATIVO));
exports.DocumentSchema = (0, openapi_1.named)('Documento', common_1.z.strictObject({
    id: common_1.z.number().int(),
    tipo: DocTipo,
    numero: common_1.z.string().meta({ example: '015' }),
    anio: common_1.z.number().int().meta({ example: 2026 }),
    fecha: common_1.z.string().meta({ example: '2026-11-05' }),
    asunto: common_1.z.string().meta({ example: 'Calendario académico 2027' }),
    tamano: common_1.z.number().int(),
    url: common_1.z.string().meta({ example: '/documentos/9' }),
}));
exports.DocumentList = (0, common_1.paginated)('ListaDocumentos', exports.DocumentSchema);
exports.DocumentOne = (0, common_1.single)('DocumentoRespuesta', exports.DocumentSchema);
exports.DocumentQuery = (0, common_1.listQuery)([], { tipo: DocTipo.optional(), anio: common_1.z.coerce.number().int().min(1990).max(2100).optional() }).omit({ sort: true });
exports.DocumentForm = common_1.z.object({
    archivo: common_1.z.string().meta({ format: 'binary', description: 'PDF real (se verifica su firma), máx. 10 MB' }),
    tipo: DocTipo,
    numero: common_1.z.string(),
    anio: common_1.z.string(),
    fecha: common_1.z.string(),
    asunto: common_1.z.string(),
});
exports.DocumentFields = common_1.z.strictObject({
    tipo: DocTipo,
    numero: common_1.z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9.\-/ ]{1,30}$/, 'Solo letras, números, puntos, guiones y barras'),
    anio: common_1.z.coerce.number().int().min(1990).max(2100),
    fecha: common_1.Fecha,
    asunto: common_1.z.string().trim().min(5).max(300),
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
exports.toDocument = toDocument;
// --- PQRSD ---
const EstadoPqrsd = common_1.z.enum(citizen_services_1.ESTADOS_PQRSD);
const PqrsdItem = common_1.z.strictObject({
    id: common_1.z.number().int(),
    radicado: common_1.z.string().meta({ example: 'SEM-2026-00000000' }),
    tipo: common_1.z.string(),
    estado: EstadoPqrsd,
    nombre: common_1.z.string(),
    asunto: common_1.z.string(),
    creadoEn: common_1.FechaHora,
});
exports.Pqrsd = (0, openapi_1.named)('Pqrsd', PqrsdItem.extend({
    tipoDocumento: common_1.z.string(),
    documento: common_1.z.string(),
    email: common_1.z.string(),
    telefono: common_1.z.string(),
    mensaje: common_1.z.string(),
    respuesta: common_1.z.string(),
    actualizadoEn: common_1.FechaHora,
}).meta({ description: 'Contiene datos personales: solo con permiso pqrsd.read; cada consulta queda auditada.' }));
exports.PqrsdList = (0, common_1.paginated)('ListaPqrsd', PqrsdItem);
exports.PqrsdOne = (0, common_1.single)('PqrsdRespuesta', exports.Pqrsd);
exports.PqrsdQuery = (0, common_1.listQuery)([], { estado: EstadoPqrsd.optional() }).omit({ sort: true, q: true });
exports.PqrsdRespond = common_1.z.strictObject({ estado: EstadoPqrsd, respuesta: common_1.z.string().trim().max(10000).default('') });
const toPqrsdItem = (d) => ({
    id: d.id,
    radicado: d.radicado,
    tipo: d.tipo,
    estado: d.estado,
    nombre: d.nombre,
    asunto: d.asunto,
    creadoEn: d.creadoEn,
});
exports.toPqrsdItem = toPqrsdItem;
const toPqrsd = (d) => ({
    ...(0, exports.toPqrsdItem)(d),
    tipoDocumento: d.tipoDocumento,
    documento: d.documento,
    email: d.email,
    telefono: d.telefono || '',
    mensaje: d.mensaje,
    respuesta: d.respuesta || '',
    actualizadoEn: d.actualizadoEn,
});
exports.toPqrsd = toPqrsd;
//# sourceMappingURL=content.schemas.js.map