-- Biblioteca multimedia. `archivo` es el nombre interno generado (nunca el que envió el usuario);
-- `nombre_visible` es el nombre editable que se muestra en el panel.
CREATE TABLE medios (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('imagen','audio')),
  mime TEXT NOT NULL,
  extension TEXT NOT NULL,
  archivo TEXT NOT NULL UNIQUE,
  miniatura TEXT,
  nombre_visible TEXT NOT NULL,
  nombre_original TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  ancho INTEGER,
  alto INTEGER,
  texto_alternativo TEXT NOT NULL DEFAULT '',
  descripcion TEXT NOT NULL DEFAULT '',
  visibilidad TEXT NOT NULL DEFAULT 'privada' CHECK (visibilidad IN ('publica','privada')),
  subido_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_medios_tipo ON medios(tipo, creado_en DESC);

-- Dónde se usa cada archivo. `publicado` = el contenido que lo usa está publicado,
-- condición para servir un archivo privado al público.
CREATE TABLE medios_usos (
  medio_id INTEGER NOT NULL REFERENCES medios(id) ON DELETE CASCADE,
  entidad TEXT NOT NULL CHECK (entidad IN ('pagina','noticia','diapositiva')),
  entidad_id INTEGER NOT NULL,
  publicado INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (medio_id, entidad, entidad_id)
);
CREATE INDEX idx_medios_usos_entidad ON medios_usos(entidad, entidad_id);
