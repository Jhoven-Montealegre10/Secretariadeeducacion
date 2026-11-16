-- Preparación de PostgreSQL para el portal (ejecutar UNA vez como superusuario/DBA).
-- Uso:
--   psql -v app_password='...' -v migrator_password='...' -v db_name=semibague -f 01-crear-roles-y-base.sql
--
-- Modelo de mínimo privilegio:
--   semibague_owner    sin inicio de sesión; dueño del esquema y de todas las tablas.
--   semibague_migrator inicia sesión solo para aplicar migraciones (actúa como semibague_owner).
--   semibague_app      usuario de la aplicación: solo SELECT/INSERT/UPDATE/DELETE; no crea ni borra tablas,
--                      no es superusuario y no puede modificar ni borrar la bitácora de auditoría.
\set ON_ERROR_STOP on

SELECT 'CREATE ROLE semibague_owner NOLOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'semibague_owner') \gexec
SELECT format('CREATE ROLE semibague_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE IN ROLE semibague_owner', :'migrator_password')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'semibague_migrator') \gexec
SELECT format('CREATE ROLE semibague_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 200', :'app_password')
  WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'semibague_app') \gexec

SELECT format('CREATE DATABASE %I OWNER semibague_owner ENCODING ''UTF8'' TEMPLATE template0', :'db_name')
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db_name') \gexec

\connect :db_name
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db_name" TO semibague_app;
GRANT CONNECT, CREATE ON DATABASE :"db_name" TO semibague_owner;
GRANT CONNECT ON DATABASE :"db_name" TO semibague_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

CREATE SCHEMA IF NOT EXISTS portal AUTHORIZATION semibague_owner;
GRANT USAGE ON SCHEMA portal TO semibague_app;
ALTER ROLE semibague_app IN DATABASE :"db_name" SET search_path = portal;
ALTER ROLE semibague_migrator IN DATABASE :"db_name" SET search_path = portal;
ALTER ROLE semibague_migrator IN DATABASE :"db_name" SET role = semibague_owner;

-- Permisos de la aplicación sobre los objetos que creen las migraciones (dueño: semibague_owner).
ALTER DEFAULT PRIVILEGES FOR ROLE semibague_owner IN SCHEMA portal GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO semibague_app;
ALTER DEFAULT PRIVILEGES FOR ROLE semibague_owner IN SCHEMA portal GRANT USAGE, SELECT ON SEQUENCES TO semibague_app;
ALTER DEFAULT PRIVILEGES FOR ROLE semibague_owner IN SCHEMA portal GRANT EXECUTE ON FUNCTIONS TO semibague_app;
