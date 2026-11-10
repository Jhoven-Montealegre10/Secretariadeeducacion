/**
 * Catálogo de permisos (módulo.acción): única fuente de verdad. Los roles asignan
 * subconjuntos; lo que no está concedido explícitamente está prohibido (denegación por defecto).
 */
export const MODULOS = {
  dashboard: { nombre: 'Panel', acciones: { access: 'Acceder al panel' } },
  users: { nombre: 'Usuarios', acciones: { read: 'Consultar', create: 'Crear', update: 'Actualizar', delete: 'Eliminar' } },
  roles: { nombre: 'Roles y permisos', acciones: { read: 'Consultar', create: 'Crear', update: 'Actualizar', delete: 'Eliminar' } },
  stats: { nombre: 'Estadísticas', acciones: { read: 'Consultar' } },
  audit: { nombre: 'Auditoría', acciones: { read: 'Consultar' } },
  system: { nombre: 'Sistema', acciones: { read: 'Consultar métricas de operación' } },
  media: { nombre: 'Multimedia', acciones: { read: 'Consultar', upload: 'Subir', update: 'Actualizar y reemplazar', delete: 'Eliminar definitivamente' } },
  pages: { nombre: 'Páginas', acciones: { read: 'Consultar', create: 'Crear', update: 'Editar', publish: 'Publicar', delete: 'Eliminar definitivamente' } },
  news: { nombre: 'Noticias', acciones: { read: 'Consultar', create: 'Crear', update: 'Editar', publish: 'Publicar', delete: 'Eliminar definitivamente' } },
  sliders: { nombre: 'Sliders', acciones: { read: 'Consultar', create: 'Crear', update: 'Editar', delete: 'Eliminar definitivamente' } },
  documents: { nombre: 'Normatividad', acciones: { read: 'Consultar', create: 'Publicar', delete: 'Eliminar definitivamente' } },
  pqrsd: { nombre: 'PQRSD', acciones: { read: 'Consultar datos personales', respond: 'Responder' } },
} as const;

type Modulos = typeof MODULOS;
export type Permiso = { [M in keyof Modulos]: `${M & string}.${keyof Modulos[M]['acciones'] & string}` }[keyof Modulos];

export const TODOS: readonly Permiso[] = Object.freeze(
  Object.entries(MODULOS).flatMap(([modulo, def]) => Object.keys(def.acciones).map((accion) => `${modulo}.${accion}` as Permiso)),
);

export const ROL_ADMINISTRADOR = 'administrador';
export const ROL_EDITOR = 'editor';

export const PERMISOS_EDITOR: readonly Permiso[] = Object.freeze([
  'dashboard.access',
  'media.read',
  'media.upload',
  'media.update',
  'pages.read',
  'pages.create',
  'pages.update',
  'pages.publish',
  'news.read',
  'news.create',
  'news.update',
  'news.publish',
  'sliders.read',
  'sliders.create',
  'sliders.update',
  'documents.read',
  'documents.create',
] as Permiso[]);

export function esPermisoValido(p: string): p is Permiso {
  return (TODOS as readonly string[]).includes(p);
}

export function catalogo() {
  return Object.entries(MODULOS).map(([modulo, def]) => ({
    modulo,
    nombre: def.nombre,
    acciones: Object.entries(def.acciones).map(([accion, descripcion]) => ({ permiso: `${modulo}.${accion}`, descripcion: descripcion as string })),
  }));
}

/** Identidad y permisos del usuario autenticado, construidos SIEMPRE desde la base de datos. */
export interface Actor {
  id: number;
  email: string;
  nombre: string;
  rolId: number;
  rolSlug: string;
  rolNombre: string;
  permisos: ReadonlySet<string>;
  authVersion: number;
}
