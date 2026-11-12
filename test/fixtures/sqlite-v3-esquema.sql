-- Esquema de la versión anterior (SQLite, v3). Solo estructura, sin datos: se usa para probar la migración.

CREATE TABLE auditoria_eventos (
        id INTEGER PRIMARY KEY,
        usuario_id INTEGER,
        usuario_email TEXT,
        accion TEXT NOT NULL,
        recurso TEXT,
        recurso_id TEXT,
        resultado TEXT NOT NULL CHECK (resultado IN ('exito','fallo','denegado')),
        detalle TEXT,
        ip_hash TEXT,
        creado_en TEXT NOT NULL,
        hash_anterior TEXT NOT NULL,
        hash TEXT NOT NULL
      );

CREATE TABLE codigos_recuperacion (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo_hash TEXT NOT NULL,
  usado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE documentos (
  id INTEGER PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('circular','resolucion','decreto','acuerdo')),
  numero TEXT NOT NULL,
  anio INTEGER NOT NULL,
  fecha TEXT NOT NULL,
  asunto TEXT NOT NULL,
  archivo TEXT NOT NULL UNIQUE,
  nombre_original TEXT NOT NULL,
  tamano INTEGER NOT NULL,
  autor_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE instituciones (
  id INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  zona TEXT NOT NULL CHECK (zona IN ('Urbana','Rural'))
);

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

CREATE TABLE medios_usos (
  medio_id INTEGER NOT NULL REFERENCES medios(id) ON DELETE CASCADE,
  entidad TEXT NOT NULL CHECK (entidad IN ('pagina','noticia','diapositiva')),
  entidad_id INTEGER NOT NULL,
  publicado INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (medio_id, entidad, entidad_id)
);

CREATE TABLE noticia_fotos (
        noticia_id INTEGER NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
        medio_id INTEGER NOT NULL REFERENCES medios(id) ON DELETE CASCADE,
        orden INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (noticia_id, medio_id)
      );

CREATE TABLE "noticias" (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        resumen TEXT NOT NULL,
        contenido TEXT NOT NULL,
        categoria TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicada')),
        fecha_publicacion TEXT NOT NULL,
        imagen_id INTEGER REFERENCES medios(id) ON DELETE SET NULL,
        creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );

CREATE TABLE paginas (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        titulo TEXT NOT NULL,
        resumen TEXT NOT NULL DEFAULT '',
        bloques TEXT NOT NULL DEFAULT '[]',
        estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','publicada')),
        sistema INTEGER NOT NULL DEFAULT 0,
        creado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        actualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
        publicada_en TEXT,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );

CREATE TABLE pqrsd (
  id INTEGER PRIMARY KEY,
  radicado TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'Radicada' CHECK (estado IN ('Radicada','En trámite','Respondida','Cerrada')),
  tipo_documento TEXT NOT NULL,
  documento_hash TEXT NOT NULL,
  documento_enc TEXT NOT NULL,
  nombre_enc TEXT NOT NULL,
  email_enc TEXT NOT NULL,
  telefono_enc TEXT,
  asunto_enc TEXT NOT NULL,
  mensaje_enc TEXT NOT NULL,
  respuesta_enc TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rol_permisos (
        rol_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
        permiso TEXT NOT NULL,
        PRIMARY KEY (rol_id, permiso)
      );

CREATE TABLE roles (
        id INTEGER PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        nombre TEXT NOT NULL UNIQUE,
        descripcion TEXT NOT NULL DEFAULT '',
        sistema INTEGER NOT NULL DEFAULT 0,
        creado_en TEXT NOT NULL DEFAULT (datetime('now')),
        actualizado_en TEXT NOT NULL DEFAULT (datetime('now'))
      );

CREATE TABLE sales_estadisticas (
  fecha TEXT PRIMARY KEY,
  sal TEXT NOT NULL
);

CREATE TABLE schema_migraciones (
  version TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  checksum TEXT NOT NULL,
  aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sesiones (
  sid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  expira INTEGER NOT NULL
, usuario_id INTEGER);

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

CREATE TABLE tokens_recuperacion (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_en INTEGER NOT NULL,
  usado_en TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE "usuarios" (
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

CREATE TABLE visitas (
  id INTEGER PRIMARY KEY,
  fecha TEXT NOT NULL,
  ruta TEXT NOT NULL,
  visitante TEXT NOT NULL,
  fuente TEXT NOT NULL CHECK (fuente IN ('directo','buscador','redes_sociales','otro_sitio','interno','campana')),
  referente_dominio TEXT,
  dispositivo TEXT NOT NULL CHECK (dispositivo IN ('escritorio','movil','tablet','otro')),
  pais TEXT
);

CREATE INDEX idx_auditoria_fecha ON auditoria_eventos(creado_en);

CREATE INDEX idx_auditoria_usuario ON auditoria_eventos(usuario_id);

CREATE INDEX idx_codigos_usuario ON codigos_recuperacion(usuario_id);

CREATE INDEX idx_diapositivas_slider ON diapositivas(slider_id, orden);

CREATE INDEX idx_documentos_tipo ON documentos(tipo, anio DESC);

CREATE INDEX idx_medios_tipo ON medios(tipo, creado_en DESC);

CREATE INDEX idx_medios_usos_entidad ON medios_usos(entidad, entidad_id);

CREATE INDEX idx_noticias_estado_fecha ON noticias(estado, fecha_publicacion DESC);

CREATE INDEX idx_sesiones_expira ON sesiones(expira);

CREATE INDEX idx_sesiones_usuario ON sesiones(usuario_id);

CREATE INDEX idx_tokens_usuario ON tokens_recuperacion(usuario_id);

CREATE INDEX idx_usuarios_rol ON usuarios(rol_id);

CREATE INDEX idx_visitas_fecha ON visitas(fecha);

CREATE INDEX idx_visitas_fecha_ruta ON visitas(fecha, ruta);

CREATE TRIGGER auditoria_sin_delete BEFORE DELETE ON auditoria_eventos
        BEGIN SELECT RAISE(ABORT, 'La bitácora de auditoría no se puede eliminar'); END;

CREATE TRIGGER auditoria_sin_update BEFORE UPDATE ON auditoria_eventos
        BEGIN SELECT RAISE(ABORT, 'La bitácora de auditoría no se puede modificar'); END;

