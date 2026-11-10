"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PERMISOS_EDITOR = exports.ROL_EDITOR = exports.ROL_ADMINISTRADOR = exports.TODOS = exports.MODULOS = void 0;
exports.esPermisoValido = esPermisoValido;
exports.catalogo = catalogo;
/**
 * Catálogo de permisos (módulo.acción): única fuente de verdad. Los roles asignan
 * subconjuntos; lo que no está concedido explícitamente está prohibido (denegación por defecto).
 */
exports.MODULOS = {
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
};
exports.TODOS = Object.freeze(Object.entries(exports.MODULOS).flatMap(([modulo, def]) => Object.keys(def.acciones).map((accion) => `${modulo}.${accion}`)));
exports.ROL_ADMINISTRADOR = 'administrador';
exports.ROL_EDITOR = 'editor';
exports.PERMISOS_EDITOR = Object.freeze([
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
    return exports.TODOS.includes(p);
}
function catalogo() {
    return Object.entries(exports.MODULOS).map(([modulo, def]) => ({
        modulo,
        nombre: def.nombre,
        acciones: Object.entries(def.acciones).map(([accion, descripcion]) => ({ permiso: `${modulo}.${accion}`, descripcion: descripcion })),
    }));
}
//# sourceMappingURL=permissions.js.map