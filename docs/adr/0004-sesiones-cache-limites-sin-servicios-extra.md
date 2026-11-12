# ADR 0004 — Sesiones, caché y límites compartidos sin servicios adicionales

- **Estado:** aceptada
- **Contexto:** varias instancias necesitan compartir sesiones, invalidar caché y aplicar límites de intentos. Se pidió
  no agregar servicios sin necesidad.
- **Decisión:** todo sobre PostgreSQL:
  - sesiones en la tabla `sesiones`, con la clave como **HMAC del ID** (una fuga de la tabla no permite secuestrar sesiones);
  - caché en memoria solo de contenido público, con invalidación tras el COMMIT y aviso entre instancias por `LISTEN/NOTIFY`;
  - límites sensibles (login, MFA, recuperación, cargas, PQRSD) en la tabla UNLOGGED `limites_tasa` con la IP reducida
    a HMAC; límites generales en memoria por instancia.
- **Consecuencias:** + una sola dependencia de infraestructura. − Más escrituras en PostgreSQL por intento sensible
  (bajo volumen); los límites generales se multiplican por el número de instancias (documentado). Si el tráfico lo
  exige, Redis puede reemplazar estas piezas sin cambiar servicios (interfaces aisladas).
