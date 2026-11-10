# ADR 0002 — PostgreSQL con TypeORM para esquema y migraciones, y SQL explícito en repositorios

- **Estado:** aceptada
- **Contexto:** SQLite bloquea toda la base en cada escritura (`BEGIN IMMEDIATE`), no admite varias instancias y no
  ofrece cuentas con privilegios separados. Se exige PostgreSQL, migraciones versionadas y consultas parametrizadas.
- **Decisión:** PostgreSQL 16. TypeORM 1.1 aporta el pool, las **entidades como fuente del esquema** y las
  **migraciones versionadas** (`synchronize` siempre desactivado; `migration:generate --dr --ch` en CI detecta
  desviaciones). Los repositorios usan **SQL explícito con parámetros `$n`** a través de `Db` (no QueryBuilder ni
  repositorios de entidades) para controlar índices, bloqueos (`FOR UPDATE`), lotes (`unnest`) y evitar N+1.
- **Consecuencias:** + consultas revisables y predecibles; + mínimo privilegio real (app sin DDL); + concurrencia por
  fila. − Los cambios de columnas se hacen en entidad + migración + SQL del repositorio (las pruebas de contrato y de
  integración lo detectan).
