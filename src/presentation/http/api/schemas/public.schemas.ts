/** DTOs de la API pública: solo contenido publicado y solo campos aptos para visitantes. */
import type { MediaRecord } from '../../../../infrastructure/repositories/content.repositories';
import { named } from '../openapi';
import { mediaUrl } from './content.schemas';
import { listQuery, paginated, single, z } from './common';

export const PublicImage = named(
  'ImagenPublica',
  z.strictObject({
    url: z.string().meta({ example: '/media/3f2a9c0d1e4b5a6c7d8e9f0a1b2c3d4e.jpg' }),
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

export const PublicNewsItem = named(
  'NoticiaPublica',
  z.strictObject({
    slug: z.string(),
    titulo: z.string(),
    resumen: z.string(),
    categoria: z.string(),
    fechaPublicacion: z.string(),
    imagen: PublicImage.nullable(),
    url: z.string().meta({ example: '/noticias/inscripciones-2027' }),
  }),
);
const PublicNewsDetail = named('NoticiaPublicaDetalle', PublicNewsItem.extend({ contenido: z.string(), fotos: z.array(PublicImage) }));
export const PublicNewsList = paginated('ListaNoticiasPublicas', PublicNewsItem);
export const PublicNewsOne = single('NoticiaPublicaRespuesta', PublicNewsDetail);
export const PublicNewsQuery = listQuery([])
  .omit({ sort: true })
  .extend({ pageSize: z.coerce.number().int().min(1).max(50).default(9) });

export const PublicPage = single(
  'PaginaPublica',
  z.strictObject({
    slug: z.string(),
    titulo: z.string(),
    resumen: z.string(),
    bloques: z.array(z.any()).meta({ description: 'Bloques (ver esquema Bloque); `medioId` se resuelve en `medios`.' }),
    medios: z.array(PublicMedia),
  }),
);
export const PublicSlider = single(
  'SliderPublico',
  z.strictObject({
    ubicacion: z.string(),
    diapositivas: z.array(z.strictObject({ titulo: z.string(), texto: z.string(), enlace: z.string(), textoEnlace: z.string(), imagen: PublicImage })),
  }),
);
export const PublicInstitutions = single('Instituciones', z.array(z.strictObject({ nombre: z.string(), zona: z.enum(['Urbana', 'Rural']) })));
export const SlugParams = z.object({ slug: z.string().max(90).meta({ example: 'secretaria' }) });
export const LocationParams = z.object({ ubicacion: z.string().max(90).meta({ example: 'inicio' }) });

export const toImage = (m: MediaRecord | undefined | null) =>
  m ? { url: mediaUrl(m), textoAlternativo: m.textoAlternativo, ancho: m.ancho ?? null, alto: m.alto ?? null } : null;
export const toPublicMedia = (m: MediaRecord) => ({
  id: m.id,
  tipo: m.tipo,
  mime: m.mime,
  url: mediaUrl(m),
  textoAlternativo: m.textoAlternativo,
  ancho: m.ancho ?? null,
  alto: m.alto ?? null,
});
