-- Analítica propia y mínima: sin cookies, sin IP ni User-Agent completos.
-- `visitante` = HMAC(ip + navegador, sal del día) truncado; la sal se borra al día siguiente,
-- por lo que no se puede seguir a una persona entre días ni recuperar su IP.
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
CREATE INDEX idx_visitas_fecha ON visitas(fecha);
CREATE INDEX idx_visitas_fecha_ruta ON visitas(fecha, ruta);

CREATE TABLE sales_estadisticas (
  fecha TEXT PRIMARY KEY,
  sal TEXT NOT NULL
);
