# ADR 0006 — Monolito modular

- **Estado:** aceptada
- **Contexto:** portal institucional con un equipo pequeño y tráfico moderado.
- **Decisión:** un solo despliegue con módulos NestJS por área (identidad, contenido, ciudadanía, HTTP) y capas
  (presentación, aplicación, dominio, infraestructura). Escala horizontalmente con varias instancias detrás del proxy,
  compartiendo PostgreSQL y la carpeta de archivos.
- **Consecuencias:** + operación simple, transacciones locales, sin latencia entre servicios. − Un despliegue para todo;
  si un módulo creciera mucho, sus fronteras ya están definidas para separarlo.
