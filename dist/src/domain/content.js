"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bloquesSchema = exports.bloqueSchema = exports.TIPOS_BLOQUE = exports.BLOQUES = exports.UBICACION_RE = exports.SLUG_RE = exports.SLUGS_RESERVADOS = void 0;
exports.slugify = slugify;
exports.esEnlaceSeguro = esEnlaceSeguro;
exports.mediosEnBloques = mediosEnBloques;
/**
 * Reglas de dominio de los contenidos: slugs, enlaces seguros y estructura de los bloques del
 * editor de páginas. La sanitización del HTML se aplica en la capa de aplicación.
 */
const zod_1 = require("zod");
exports.SLUGS_RESERVADOS = Object.freeze([
    'admin', 'api', 'assets', 'media', 'documentos', 'noticias', 'normatividad', 'atencion', 'buscar', 'mapa-del-sitio',
    'inicio', 'login', 'logout', 'robots.txt', 'favicon.ico', 'security.txt', '.well-known', 'health',
]);
// Sin retroceso catastrófico: cada repetición empieza con '-' y la longitud se limita antes de evaluar.
// eslint-disable-next-line security/detect-unsafe-regex
exports.SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line security/detect-unsafe-regex
exports.UBICACION_RE = /^(inicio|pagina:[a-z0-9]+(?:-[a-z0-9]+)*)$/;
function slugify(text) {
    return (String(text)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'contenido');
}
/** Enlaces permitidos en contenidos: rutas internas, anclas, http(s), mailto y tel. */
function esEnlaceSeguro(url) {
    const v = String(url ?? '').trim();
    if (!v)
        return true;
    if (/^\/(?!\/)/.test(v) || /^#[\w-]+$/.test(v))
        return true;
    return /^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+)$/i.test(v);
}
const texto = (max) => zod_1.z.string().trim().max(max);
const enlace = zod_1.z.string().trim().max(500).refine(esEnlaceSeguro, 'Enlace no permitido. Use una ruta interna (/...), https://, mailto: o tel:.');
const html = zod_1.z.string().max(50000); // se sanitiza en el servicio
const ancla = zod_1.z.string().trim().max(60).regex(/^$|^[a-z0-9-]+$/, 'El ancla solo admite minúsculas, números y guiones.').default('');
const medioId = zod_1.z.number().int().positive();
exports.BLOQUES = {
    seccion: zod_1.z.object({ tipo: zod_1.z.literal('seccion'), titulo: texto(160).default(''), antetitulo: texto(80).default(''), ancla, fondo: zod_1.z.enum(['blanco', 'gris', 'azul']).default('blanco') }),
    texto: zod_1.z.object({ tipo: zod_1.z.literal('texto'), html }),
    aviso: zod_1.z.object({ tipo: zod_1.z.literal('aviso'), estilo: zod_1.z.enum(['informacion', 'advertencia']).default('informacion'), html }),
    imagen: zod_1.z.object({ tipo: zod_1.z.literal('imagen'), medioId, pie: texto(300).default('') }),
    galeria: zod_1.z.object({ tipo: zod_1.z.literal('galeria'), medios: zod_1.z.array(medioId).min(1).max(30) }),
    audio: zod_1.z.object({ tipo: zod_1.z.literal('audio'), medioId, titulo: texto(160).default('') }),
    tarjetas: zod_1.z.object({
        tipo: zod_1.z.literal('tarjetas'),
        columnas: zod_1.z.union([zod_1.z.literal(2), zod_1.z.literal(3), zod_1.z.literal(4)]).default(3),
        estilo: zod_1.z.enum(['tarjeta', 'servicio']).default('tarjeta'),
        items: zod_1.z
            .array(zod_1.z.object({ titulo: texto(160), texto: texto(600).default(''), enlace: enlace.default(''), textoEnlace: texto(60).default(''), etiqueta: texto(40).default(''), ancla }))
            .min(1)
            .max(24),
    }),
    acordeon: zod_1.z.object({
        tipo: zod_1.z.literal('acordeon'),
        titulo: texto(160).default(''),
        ancla,
        intro: html.default(''),
        items: zod_1.z.array(zod_1.z.object({ titulo: texto(200), html, ancla, abierto: zod_1.z.boolean().default(false) })).min(1).max(40),
    }),
    tabla: zod_1.z.object({ tipo: zod_1.z.literal('tabla'), encabezados: zod_1.z.array(texto(120)).min(1).max(8), filas: zod_1.z.array(zod_1.z.array(texto(500)).max(8)).max(200) }),
    boton: zod_1.z.object({
        tipo: zod_1.z.literal('boton'),
        texto: texto(60).min(1),
        enlace: enlace.refine((v) => v.length > 0, 'El botón necesita un enlace.'),
        estilo: zod_1.z.enum(['primario', 'secundario']).default('primario'),
    }),
    // Bloques dinámicos: muestran datos vivos del sistema, sin contenido editable propio.
    directorioInstituciones: zod_1.z.object({ tipo: zod_1.z.literal('directorioInstituciones') }),
    datosContacto: zod_1.z.object({ tipo: zod_1.z.literal('datosContacto'), mostrarMapa: zod_1.z.boolean().default(true) }),
};
exports.TIPOS_BLOQUE = Object.freeze(Object.keys(exports.BLOQUES));
exports.bloqueSchema = zod_1.z.discriminatedUnion('tipo', [
    exports.BLOQUES.seccion, exports.BLOQUES.texto, exports.BLOQUES.aviso, exports.BLOQUES.imagen, exports.BLOQUES.galeria, exports.BLOQUES.audio, exports.BLOQUES.tarjetas,
    exports.BLOQUES.acordeon, exports.BLOQUES.tabla, exports.BLOQUES.boton, exports.BLOQUES.directorioInstituciones, exports.BLOQUES.datosContacto,
]);
exports.bloquesSchema = zod_1.z.array(exports.bloqueSchema).max(150);
/** IDs de medios referenciados por una lista de bloques (para el registro de usos). */
function mediosEnBloques(bloques) {
    const ids = new Set();
    for (const b of bloques) {
        if (typeof b.medioId === 'number')
            ids.add(b.medioId);
        if (Array.isArray(b.medios))
            for (const id of b.medios)
                if (typeof id === 'number')
                    ids.add(id);
    }
    return [...ids];
}
//# sourceMappingURL=content.js.map