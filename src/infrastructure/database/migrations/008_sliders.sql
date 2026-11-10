-- Sliders asignados a una ubicación ('inicio' o 'pagina:<slug>') y sus diapositivas ordenadas.
CREATE TABLE sliders (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL,
  ubicacion TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE diapositivas (
  id INTEGER PRIMARY KEY,
  slider_id INTEGER NOT NULL REFERENCES sliders(id) ON DELETE CASCADE,
  medio_id INTEGER REFERENCES medios(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL DEFAULT '',
  texto TEXT NOT NULL DEFAULT '',
  enlace TEXT NOT NULL DEFAULT '',
  texto_enlace TEXT NOT NULL DEFAULT '',
  orden INTEGER NOT NULL DEFAULT 0,
  activa INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_diapositivas_slider ON diapositivas(slider_id, orden);
