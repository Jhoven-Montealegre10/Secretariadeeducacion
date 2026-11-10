/**
 * Reglas de dominio de los contenidos: slugs, enlaces seguros y estructura de los bloques del
 * editor de páginas. La sanitización del HTML se aplica en la capa de aplicación.
 */
import { z } from 'zod';

export const SLUGS_RESERVADOS: readonly string[] = Object.freeze([
  'admin',
  'api',
  'assets',
  'media',
  'documentos',
  'noticias',
  'normatividad',
  'atencion',
  'buscar',
  'mapa-del-sitio',
  'inicio',
  'login',
  'logout',
  'robots.txt',
  'favicon.ico',
  'security.txt',
  '.well-known',
  'health',
]);

// Sin retroceso catastrófico: cada repetición empieza con '-' y la longitud se limita antes de evaluar.
// eslint-disable-next-line security/detect-unsafe-regex
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line security/detect-unsafe-regex
export const UBICACION_RE = /^(inicio|pagina:[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function slugify(text: string): string {
  return (
    String(text)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'contenido'
  );
}

/** Enlaces permitidos en contenidos: rutas internas, anclas, http(s), mailto y tel. */
export function esEnlaceSeguro(url: unknown): boolean {
  const v = String(url ?? '').trim();
  if (!v) return true;
  if (/^\/(?!\/)/.test(v) || /^#[\w-]+$/.test(v)) return true;
  return /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+)$/i.test(v);
}

const texto = (max: number) => z.string().trim().max(max);
const enlace = z.string().trim().max(500).refine(esEnlaceSeguro, 'Enlace no permitido. Use una ruta interna (/...), https://, mailto: o tel:.');
const html = z.string().max(50000); // se sanitiza en el servicio
const ancla = z
  .string()
  .trim()
  .max(60)
  .regex(/^$|^[a-z0-9-]+$/, 'El ancla solo admite minúsculas, números y guiones.')
  .default('');
const medioId = z.number().int().positive();

export const BLOQUES = {
  seccion: z.object({
    tipo: z.literal('seccion'),
    titulo: texto(160).default(''),
    antetitulo: texto(80).default(''),
    ancla,
    fondo: z.enum(['blanco', 'gris', 'azul']).default('blanco'),
  }),
  texto: z.object({ tipo: z.literal('texto'), html }),
  aviso: z.object({ tipo: z.literal('aviso'), estilo: z.enum(['informacion', 'advertencia']).default('informacion'), html }),
  imagen: z.object({ tipo: z.literal('imagen'), medioId, pie: texto(300).default('') }),
  galeria: z.object({ tipo: z.literal('galeria'), medios: z.array(medioId).min(1).max(30) }),
  audio: z.object({ tipo: z.literal('audio'), medioId, titulo: texto(160).default('') }),
  tarjetas: z.object({
    tipo: z.literal('tarjetas'),
    columnas: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
    estilo: z.enum(['tarjeta', 'servicio']).default('tarjeta'),
    items: z
      .array(
        z.object({
          titulo: texto(160),
          texto: texto(600).default(''),
          enlace: enlace.default(''),
          textoEnlace: texto(60).default(''),
          etiqueta: texto(40).default(''),
          ancla,
        }),
      )
      .min(1)
      .max(24),
  }),
  acordeon: z.object({
    tipo: z.literal('acordeon'),
    titulo: texto(160).default(''),
    ancla,
    intro: html.default(''),
    items: z
      .array(z.object({ titulo: texto(200), html, ancla, abierto: z.boolean().default(false) }))
      .min(1)
      .max(40),
  }),
  tabla: z.object({ tipo: z.literal('tabla'), encabezados: z.array(texto(120)).min(1).max(8), filas: z.array(z.array(texto(500)).max(8)).max(200) }),
  boton: z.object({
    tipo: z.literal('boton'),
    texto: texto(60).min(1),
    enlace: enlace.refine((v) => v.length > 0, 'El botón necesita un enlace.'),
    estilo: z.enum(['primario', 'secundario']).default('primario'),
  }),
  // Bloques dinámicos: muestran datos vivos del sistema, sin contenido editable propio.
  directorioInstituciones: z.object({ tipo: z.literal('directorioInstituciones') }),
  datosContacto: z.object({ tipo: z.literal('datosContacto'), mostrarMapa: z.boolean().default(true) }),
};

export const TIPOS_BLOQUE = Object.freeze(Object.keys(BLOQUES));
export const bloqueSchema = z.discriminatedUnion('tipo', [
  BLOQUES.seccion,
  BLOQUES.texto,
  BLOQUES.aviso,
  BLOQUES.imagen,
  BLOQUES.galeria,
  BLOQUES.audio,
  BLOQUES.tarjetas,
  BLOQUES.acordeon,
  BLOQUES.tabla,
  BLOQUES.boton,
  BLOQUES.directorioInstituciones,
  BLOQUES.datosContacto,
]);
export const bloquesSchema = z.array(bloqueSchema).max(150);
export type Bloque = z.infer<typeof bloqueSchema>;

/** IDs de medios referenciados por una lista de bloques (para el registro de usos). */
export function mediosEnBloques(bloques: ReadonlyArray<Record<string, unknown>>): number[] {
  const ids = new Set<number>();
  for (const b of bloques) {
    if (typeof b.medioId === 'number') ids.add(b.medioId);
    if (Array.isArray(b.medios)) for (const id of b.medios) if (typeof id === 'number') ids.add(id);
  }
  return [...ids];
}
