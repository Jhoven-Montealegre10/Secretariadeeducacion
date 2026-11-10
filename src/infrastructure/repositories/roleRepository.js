'use strict';
const { db, toCamel } = require('../database/connection');

const SELECT = `r.id, r.slug, r.nombre, r.descripcion, r.sistema, r.creado_en, r.actualizado_en,
  (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id) AS total_usuarios`;

function withPermissions(role) {
  if (!role) return null;
  role.permisos = db
    .prepare('SELECT permiso FROM rol_permisos WHERE rol_id = ? ORDER BY permiso')
    .all(role.id)
    .map((r) => r.permiso);
  return role;
}

const roleRepository = {
  list() {
    return db
      .prepare(`SELECT ${SELECT} FROM roles r ORDER BY r.sistema DESC, r.nombre`)
      .all()
      .map((r) => withPermissions(toCamel(r)));
  },

  findById(id) {
    return withPermissions(toCamel(db.prepare(`SELECT ${SELECT} FROM roles r WHERE r.id = ?`).get(id)));
  },

  findBySlug(slug) {
    return withPermissions(toCamel(db.prepare(`SELECT ${SELECT} FROM roles r WHERE r.slug = ?`).get(slug)));
  },

  permissionsOf(rolId) {
    return db
      .prepare('SELECT permiso FROM rol_permisos WHERE rol_id = ?')
      .all(rolId)
      .map((r) => r.permiso);
  },

  create({ slug, nombre, descripcion }) {
    return Number(db.prepare('INSERT INTO roles (slug, nombre, descripcion) VALUES (?, ?, ?)').run(slug, nombre, descripcion).lastInsertRowid);
  },

  update(id, { nombre, descripcion }) {
    return db
      .prepare(`UPDATE roles SET nombre = COALESCE(?, nombre), descripcion = COALESCE(?, descripcion), actualizado_en = datetime('now') WHERE id = ?`)
      .run(nombre ?? null, descripcion ?? null, id).changes;
  },

  setPermissions(id, permisos) {
    db.prepare('DELETE FROM rol_permisos WHERE rol_id = ?').run(id);
    const ins = db.prepare('INSERT INTO rol_permisos (rol_id, permiso) VALUES (?, ?)');
    for (const p of permisos) ins.run(id, p);
  },

  delete(id) {
    return db.prepare('DELETE FROM roles WHERE id = ?').run(id).changes;
  },
};

module.exports = roleRepository;
