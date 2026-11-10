'use strict';
/**
 * Roles con permisos por módulo/acción y nuevas columnas de autenticación (Argon2id, MFA,
 * versión de sesión). La lista de permisos se copia aquí (no se importa) para que la
 * migración sea inmutable aunque el catálogo cambie después.
 */
const ADMIN = [
  'dashboard.access',
  'users.read',
  'users.create',
  'users.update',
  'users.delete',
  'roles.read',
  'roles.create',
  'roles.update',
  'roles.delete',
  'stats.read',
  'audit.read',
  'media.read',
  'media.upload',
  'media.update',
  'media.delete',
  'pages.read',
  'pages.create',
  'pages.update',
  'pages.publish',
  'pages.delete',
  'news.read',
  'news.create',
  'news.update',
  'news.publish',
  'news.delete',
  'sliders.read',
  'sliders.create',
  'sliders.update',
  'sliders.delete',
  'documents.read',
  'documents.create',
  'documents.delete',
  'pqrsd.read',
  'pqrsd.respond',
];
const EDITOR = [
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
];

module.exports = {
  up(db) {
    db.exec(`
      CREATE TABLE roles (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT NOT NULL DEFAULT '',
        sistema INTEGER NOT NULL DEFAULT 0,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE rol_permisos (
        rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permiso TEXT NOT NULL,
        PRIMARY KEY (rol_id, permiso)
      );
    `);
    const insRol = db.prepare('INSERT INTO roles (slug, nombre, descripcion, sistema) VALUES (?, ?, ?, 1)');
    const adminId = Number(insRol.run('administrador', 'Administrador', 'Acceso total. Rol del sistema: sus permisos no se pueden modificar.').lastInsertRowid);
    const editorId = Number(
      insRol.run('editor', 'Editor', 'Gestiona contenidos y multimedia. No elimina definitivamente ni administra usuarios.').lastInsertRowid,
    );
    const insPerm = db.prepare('INSERT INTO rol_permisos (rol_id, permiso) VALUES (?, ?)');
    ADMIN.forEach((p) => insPerm.run(adminId, p));
    EDITOR.forEach((p) => insPerm.run(editorId, p));

    // Reconstrucción de usuarios (SQLite no permite cambiar un CHECK con ALTER TABLE).
    db.exec(`
      CREATE TABLE usuarios_nueva (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nombre TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
        activo INTEGER NOT NULL DEFAULT 1,
        intentos_fallidos INTEGER NOT NULL DEFAULT 0,
        bloqueado_hasta INTEGER,
        ultimo_acceso TEXT,
        mfa_secreto_enc TEXT,
        mfa_activo INTEGER NOT NULL DEFAULT 0,
        mfa_ultimo_paso INTEGER NOT NULL DEFAULT 0,
        mfa_intentos_fallidos INTEGER NOT NULL DEFAULT 0,
        auth_version INTEGER NOT NULL DEFAULT 1,
        password_actualizada_en TEXT NOT NULL DEFAULT (datetime('now')),
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.prepare(
      `INSERT INTO usuarios_nueva (id, email, nombre, password_hash, rol_id, activo, intentos_fallidos, bloqueado_hasta, ultimo_acceso, creado_en)
      SELECT id, email, nombre, password_hash, CASE rol WHEN 'admin' THEN ? ELSE ? END, activo, intentos_fallidos, bloqueado_hasta, ultimo_acceso, creado_en FROM usuarios`,
    ).run(adminId, editorId);
    db.exec(`
      DROP TABLE usuarios;
      ALTER TABLE usuarios_nueva RENAME TO usuarios;
      CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);
    `);
  },
};
