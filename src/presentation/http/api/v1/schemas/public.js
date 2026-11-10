'use strict';
/** DTOs de la API pública: solo contenido publicado y solo campos aptos para visitantes. */
const { registry } = require('../../openapi');
const { z, listQuery, paginated, single } = require('./common');
const { mediaUrl } = require('./content');

const PublicImage = registry.register(
  'ImagenPublica',
  z.strictObject({
    url: z.string().openapi({ example: '/media/3f2a9c0d1e4b5a6c7d8e9f0a1b2c3d4e.jpg' }),
    textoAlternativo: z.string(),
    ancho: z.number().int().nullable(),
    alto: z.number().int().nullable(),
  }),
);
const PublicMedia = z.strictObject({
  id: z.number().int(),
  tipo: z.enum(['imagen', 'audio']),
  mime: z.string(),
  url: z.string(),
  textoAlternativo: z.string(),
  ancho: z.number().int().nullable(),
  alto: z.number().int().nullable(),
});

const PublicNewsItem = registry.register(
  'NoticiaPublica',
  z.strictObject({
    slug: z.string(),
    titulo: z.string(),
    resumen: z.string(),
    categoria: z.string(),
    fechaPublicacion: z.string(),
    imagen: PublicImage.nullable(),
    url: z.string().openapi({ example: '/noticias/inscripciones-2027' }),
  }),
);
const PublicNewsDetail = registry.register('NoticiaPublicaDetalle', PublicNewsItem.extend({ contenido: z.string(), fotos: z.array(PublicImage) }));
const PublicNewsList = paginated('ListaNoticiasPublicas', PublicNewsItem);
const PublicNewsOne = single('NoticiaPublicaRespuesta', PublicNewsDetail);
const PublicNewsQuery = listQuery([])
  .omit({ sort: true })
  .extend({ pageSize: z.coerce.number().int().min(1).max(50).default(9) });

const PublicPage = single(
  'PaginaPublica',
  z.strictObject({
    slug: z.string(),
    titulo: z.string(),
    resumen: z.string(),
    bloques: z.array(z.any()).openapi({ description: 'Bloques (ver esquema Bloque); `medioId` se resuelve en `medios`.' }),
    medios: z.array(PublicMedia),
  }),
);
const PublicSlider = single(
  'SliderPublico',
  z.strictObject({
    ubicacion: z.string(),
    diapositivas: z.array(z.strictObject({ titulo: z.string(), texto: z.string(), enlace: z.string(), textoEnlace: z.string(), imagen: PublicImage })),
  }),
);
const PublicInstitutions = single('Instituciones', z.array(z.strictObject({ nombre: z.string(), zona: z.enum(['Urbana', 'Rural']) })));
const SlugParams = z.object({
  slug: z
    .string()
    .max(90)
    .openapi({ param: { name: 'slug', in: 'path' }, example: 'secretaria' }),
});
const LocationParams = z.object({
  ubicacion: z
    .string()
    .max(90)
    .openapi({ param: { name: 'ubicacion', in: 'path' }, example: 'inicio' }),
});

const toImage = (m) => (m ? { url: mediaUrl(m), textoAlternativo: m.textoAlternativo, ancho: m.ancho ?? null, alto: m.alto ?? null } : null);
const toPublicMedia = (m) => ({
  id: m.id,
  tipo: m.tipo,
  mime: m.mime,
  url: mediaUrl(m),
  textoAlternativo: m.textoAlternativo,
  ancho: m.ancho ?? null,
  alto: m.alto ?? null,
});

module.exports = {
  PublicNewsList,
  PublicNewsOne,
  PublicNewsQuery,
  PublicPage,
  PublicSlider,
  PublicInstitutions,
  SlugParams,
  LocationParams,
  toImage,
  toPublicMedia,
};
