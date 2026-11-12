# ADR 0003 — Concurrencia: bloqueo optimista con versión y transacciones cortas

- **Estado:** aceptada
- **Contexto:** varios editores pueden modificar la misma página, noticia o slider; antes ganaba el último en guardar
  sin aviso. PostgreSQL permite escrituras concurrentes.
- **Decisión:** columna `version` en recursos editables. El cliente envía la versión que editó; el servicio bloquea
  la fila (`SELECT … FOR UPDATE`) dentro de una transacción corta, compara y responde `409 EDIT_CONFLICT` con
  `versionActual` si no coincide. `version` es opcional para no romper clientes de la API v1. Reglas globales (último
  administrador activo) bloquean las filas que consultan; la bitácora usa `pg_advisory_xact_lock` para mantener la
  cadena HMAC. E/S externa siempre fuera de la transacción; efectos posteriores con `afterCommit`.
- **Consecuencias:** + no se pierden cambios en silencio; + transacciones de milisegundos. − El editor que pierde debe
  recargar (el panel lo explica).
