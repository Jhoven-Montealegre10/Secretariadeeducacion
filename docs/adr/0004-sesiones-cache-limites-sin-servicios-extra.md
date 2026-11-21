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

## Actualización: Redis opcional para los límites de peticiones

- **Contexto:** se pidió protección explícita contra ráfagas y bots (miles de peticiones por segundo).
- **Decisión:** un **límite de borde** se aplica a toda petición antes de sesiones y base de datos, con bloqueo
  temporal. Sus contadores (y los generales) usan **Redis** si se configura el secreto `REDIS_URL`; si no, memoria
  por instancia. Los límites sensibles siguen en PostgreSQL. Redis es opcional: si falla, se limita en memoria.
- **Consecuencias:** + límites compartidos entre instancias con una ida y vuelta por petición (script Lua atómico).
  − Un servicio más que operar cuando hay varias instancias. Los ataques distribuidos se frenan en CDN/WAF y Nginx.
