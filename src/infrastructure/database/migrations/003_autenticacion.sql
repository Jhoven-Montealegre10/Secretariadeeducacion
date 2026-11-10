-- Códigos de recuperación MFA (solo su hash) y tokens de restablecimiento de contraseña (solo su hash).
CREATE TABLE codigos_recuperacion (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  usado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_codigos_usuario ON codigos_recuperacion(usuario_id);

CREATE TABLE tokens_recuperacion (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_en INTEGER NOT NULL,
  usado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tokens_usuario ON tokens_recuperacion(usuario_id);

-- Permite revocar todas las sesiones de un usuario.
ALTER TABLE sesiones ADD COLUMN usuario_id INTEGER;
CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);
