# ADR 0001 — TypeScript estricto y NestJS como base del servidor

- **Estado:** aceptada (noviembre de 2026)
- **Contexto:** la versión 3 (Node 22 + Express 5 + JavaScript con JSDoc) funcionaba y estaba probada, pero la entidad
  pidió TypeScript, NestJS y PostgreSQL para facilitar el mantenimiento por varios equipos y el crecimiento.
- **Decisión:** TypeScript 6 con `strict` y NestJS 12 (módulos, controladores, servicios e inyección de dependencias)
  sobre Express 5. Se portaron módulo por módulo los servicios y reglas existentes (mismas reglas, mismos mensajes,
  mismos contratos de API), sin reescribir lo que funcionaba: vistas EJS, CSS y SPA del panel se conservan.
- **Consecuencias:** + tipos en todas las capas, DI explícita, pruebas con dependencias aisladas.
  − Mayor tamaño de dependencias; decoradores experimentales (`experimentalDecorators`), compilación previa a `dist/`.
- **Alternativas:** mantener Express (descartado: requisito explícito), Fastify/otros (sin beneficio claro para el volumen del portal).
