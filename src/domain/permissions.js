'use strict';
/**
 * Catálogo de permisos: módulo.acción. Es la única fuente de verdad de lo que existe;
 * los roles asignan subconjuntos de este catálogo. Denegación por defecto: lo que no
 * está asignado explícitamente no está permitido.
 */
const MODULOS = Object.freeze({
  dashboard: { nombre: 'Panel', acciones: { access: 'Acceder al panel' } },
  users: { nombre: 'Usuarios', acciones: { read: 'Consultar', create: 'Crear', update: 'Actualizar', delete: 'Eliminar' } },
  roles: { nombre: 'Roles y permisos', acciones: { read: 'Consultar', create: 'Crear', update: 'Actualizar', delete: 'Eliminar' } },
  stats: { nombre: 'Estadísticas', acciones: { read: 'Consultar' } },
  audit: { nombre: 'Auditoría', acciones: { read: 'Consultar' } },
  media: { nombre: 'Multimedia', acciones: { read: 'Consultar', upload: 'Subir', update: 'Actualizar y reemplazar', delete: 'Eliminar definitivamente' } },
  pages: { nombre: 'Páginas', acciones: { read: 'Consultar', create: 'Crear', update: 'Editar', publish: 'Publicar', delete: 'Eliminar definitivamente' } },
  news: { nombre: 'Noticias', acciones: { read: 'Consultar', create: 'Crear', update: 'Editar', publish: 'Publicar', delete: 'Eliminar definitivamente' } },
  sliders: { nombre: 'Sliders', acciones: { read: 'Consultar', create: 'Crear', update: 'Editar', delete: 'Eliminar definitivamente' } },
  documents: { nombre: 'Normatividad', acciones: { read: 'Consultar', create: 'Publicar', delete: 'Eliminar definitivamente' } },
  pqrsd: { nombre: 'PQRSD', acciones: { read: 'Consultar datos personales', respond: 'Responder' } },
});

const TODOS = Object.freeze(Object.entries(MODULOS).flatMap(([modulo, def]) => Object.keys(def.acciones).map((accion) => `${modulo}.${accion}`)));

const ROL_ADMINISTRADOR = 'administrador';
const ROL_EDITOR = 'editor';

const PERMISOS_EDITOR = Object.freeze([
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
]);

function esPermisoValido(p) {
  return TODOS.includes(p);
}

function catalogo() {
  return Object.entries(MODULOS).map(([modulo, def]) => ({
    modulo,
    nombre: def.nombre,
    acciones: Object.entries(def.acciones).map(([accion, descripcion]) => ({ permiso: `${modulo}.${accion}`, descripcion })),
  }));
}

module.exports = { MODULOS, TODOS, ROL_ADMINISTRADOR, ROL_EDITOR, PERMISOS_EDITOR, esPermisoValido, catalogo };
