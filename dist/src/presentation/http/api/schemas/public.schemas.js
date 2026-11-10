"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toPublicMedia = exports.toImage = exports.LocationParams = exports.SlugParams = exports.PublicInstitutions = exports.PublicSlider = exports.PublicPage = exports.PublicNewsQuery = exports.PublicNewsOne = exports.PublicNewsList = exports.PublicNewsItem = exports.PublicImage = void 0;
const openapi_1 = require("../openapi");
const content_schemas_1 = require("./content.schemas");
const common_1 = require("./common");
exports.PublicImage = (0, openapi_1.named)('ImagenPublica', common_1.z.strictObject({
    url: common_1.z.string().meta({ example: '/media/3f2a9c0d1e4b5a6c7d8e9f0a1b2c3d4e.jpg' }),
    textoAlternativo: common_1.z.string(),
    ancho: common_1.z.number().int().nullable(),
    alto: common_1.z.number().int().nullable(),
}));
const PublicMedia = common_1.z.strictObject({
    id: common_1.z.number().int(),
    tipo: common_1.z.enum(['imagen', 'audio']),
    mime: common_1.z.string(),
    url: common_1.z.string(),
    textoAlternativo: common_1.z.string(),
    ancho: common_1.z.number().int().nullable(),
    alto: common_1.z.number().int().nullable(),
});
exports.PublicNewsItem = (0, openapi_1.named)('NoticiaPublica', common_1.z.strictObject({
    slug: common_1.z.string(),
    titulo: common_1.z.string(),
    resumen: common_1.z.string(),
    categoria: common_1.z.string(),
    fechaPublicacion: common_1.z.string(),
    imagen: exports.PublicImage.nullable(),
    url: common_1.z.string().meta({ example: '/noticias/inscripciones-2027' }),
}));
const PublicNewsDetail = (0, openapi_1.named)('NoticiaPublicaDetalle', exports.PublicNewsItem.extend({ contenido: common_1.z.string(), fotos: common_1.z.array(exports.PublicImage) }));
exports.PublicNewsList = (0, common_1.paginated)('ListaNoticiasPublicas', exports.PublicNewsItem);
exports.PublicNewsOne = (0, common_1.single)('NoticiaPublicaRespuesta', PublicNewsDetail);
exports.PublicNewsQuery = (0, common_1.listQuery)([])
    .omit({ sort: true })
    .extend({ pageSize: common_1.z.coerce.number().int().min(1).max(50).default(9) });
exports.PublicPage = (0, common_1.single)('PaginaPublica', common_1.z.strictObject({
    slug: common_1.z.string(),
    titulo: common_1.z.string(),
    resumen: common_1.z.string(),
    bloques: common_1.z.array(common_1.z.any()).meta({ description: 'Bloques (ver esquema Bloque); `medioId` se resuelve en `medios`.' }),
    medios: common_1.z.array(PublicMedia),
}));
exports.PublicSlider = (0, common_1.single)('SliderPublico', common_1.z.strictObject({
    ubicacion: common_1.z.string(),
    diapositivas: common_1.z.array(common_1.z.strictObject({ titulo: common_1.z.string(), texto: common_1.z.string(), enlace: common_1.z.string(), textoEnlace: common_1.z.string(), imagen: exports.PublicImage })),
}));
exports.PublicInstitutions = (0, common_1.single)('Instituciones', common_1.z.array(common_1.z.strictObject({ nombre: common_1.z.string(), zona: common_1.z.enum(['Urbana', 'Rural']) })));
exports.SlugParams = common_1.z.object({ slug: common_1.z.string().max(90).meta({ example: 'secretaria' }) });
exports.LocationParams = common_1.z.object({ ubicacion: common_1.z.string().max(90).meta({ example: 'inicio' }) });
const toImage = (m) => (m ? { url: (0, content_schemas_1.mediaUrl)(m), textoAlternativo: m.textoAlternativo, ancho: m.ancho ?? null, alto: m.alto ?? null } : null);
exports.toImage = toImage;
const toPublicMedia = (m) => ({
    id: m.id,
    tipo: m.tipo,
    mime: m.mime,
    url: (0, content_schemas_1.mediaUrl)(m),
    textoAlternativo: m.textoAlternativo,
    ancho: m.ancho ?? null,
    alto: m.alto ?? null,
});
exports.toPublicMedia = toPublicMedia;
//# sourceMappingURL=public.schemas.js.map