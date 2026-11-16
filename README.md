# Portal web – Secretaría de Educación Municipal de Ibagué

## Para qué sirve

Es el portal institucional de la Secretaría de Educación Municipal de Ibagué. Tiene dos partes:

- **Sitio público** para la ciudadanía: noticias, páginas institucionales, normatividad, transparencia, buscador y
  radicación y consulta de PQRSD (peticiones, quejas, reclamos, sugerencias y denuncias). Usa la identidad visual
  GOV.CO, es responsive y está pensado para ser accesible.
- **Panel de administración** para el personal autorizado: gestión de páginas, noticias, banners (sliders),
  documentos, archivos multimedia, usuarios y roles, y estadísticas de visitas.

El panel y el sitio usan una **API REST** versionada y documentada con OpenAPI.

## Tecnologías

| Área | Tecnología |
|---|---|
| Lenguaje y entorno | TypeScript (modo estricto) sobre Node.js 24 LTS |
| Framework | NestJS |
| Base de datos | PostgreSQL 16, con TypeORM para la conexión y las migraciones |
| Vistas del sitio | EJS (renderizado en el servidor) |
| Panel | HTML, CSS y JavaScript sin frameworks, que consume la API |
| Validación y contrato de la API | Zod y OpenAPI 3 (Swagger) |
| Pruebas | node:test, Supertest y Playwright (Chromium, Firefox y WebKit) |
| Calidad | ESLint, Prettier, c8 (cobertura) y SonarCloud |

## Arquitectura

Es un monolito modular organizado por capas. Cada capa solo depende de las capas que tiene debajo:

```
src/
├── presentation/     Entrada HTTP: controladores de la API, del sitio y del panel; vistas
├── application/      Casos de uso (servicios): contenidos, usuarios, multimedia, PQRSD, estadísticas
├── domain/           Reglas del negocio sin acceso a base de datos ni a red
├── infrastructure/   PostgreSQL (entidades, migraciones, repositorios), almacenamiento de archivos,
│                     correo, sesiones y caché
└── config/           Configuración y lectura de secretos
views/                Plantillas EJS del sitio público
public/               Recursos estáticos (estilos, scripts, imágenes) y el panel
scripts/              Herramientas de línea de comandos (migraciones, administrador inicial, secretos)
test/                 Pruebas unitarias, de integración, de navegador (E2E) y de carga
docs/                 Documentación técnica
```

- PostgreSQL es la única base de datos. También guarda las sesiones y la caché, así que no se necesitan otros
  servicios.
- Los archivos subidos (imágenes, audio, PDF) se guardan en disco, fuera de la carpeta pública. La base de datos solo
  guarda su información descriptiva.
- El esquema de la base de datos solo cambia mediante migraciones versionadas.

Más detalle: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y las decisiones registradas en [`docs/adr/`](docs/adr/).

## Instalación local (desarrollo)

### Requisitos

- Node.js 24 LTS
- PostgreSQL 16
- Git

### Pasos

```bash
# 1. Clonar e instalar dependencias (versiones exactas del package-lock.json)
git clone <url-del-repositorio>
cd Secretariadeeducacion
npm ci
npm run build

# 2. Generar los secretos de desarrollo en una carpeta FUERA del repositorio
npm run secrets -- generar --dir "$HOME/.semibague-secretos"

# 3. Crear la base de datos y sus usuarios (se ejecuta como administrador de PostgreSQL)
psql -U postgres \
  -v app_password="$(cat "$HOME/.semibague-secretos/DB_PASSWORD")" \
  -v migrator_password="$(cat "$HOME/.semibague-secretos/DB_MIGRATION_PASSWORD")" \
  -v db_name=semibague_dev \
  -f scripts/postgres/01-crear-roles-y-base.sql
```

4. Crear el archivo `.env` a partir de `.env.example`. Ese archivo **solo lleva configuración, nunca contraseñas**. Para
   desarrollo, ajuste estos valores:

   ```ini
   NODE_ENV=development
   APP_URL=http://localhost:3000
   DB_HOST=127.0.0.1
   DB_NAME=semibague_dev
   DB_SSL=disable
   SECRETS_DIR=/home/<usuario>/.semibague-secretos
   STORAGE_DIR=./storage
   ```

```bash
# 5. Crear las tablas, cargar los datos de referencia y crear el primer administrador
npm run migrate
npm run seed
npm run create-admin

# 6. Iniciar el portal
npm run dev        # http://localhost:3000
```

En Windows (PowerShell) use `npm.cmd` si la política de ejecución bloquea `npm`. La guía
[`docs/CALIDAD-Y-PRUEBAS.md`](docs/CALIDAD-Y-PRUEBAS.md) explica cómo preparar el entorno en Windows y en VS Code.

## Pruebas

Las pruebas de integración necesitan un PostgreSQL **exclusivo para pruebas**. Crean una base temporal y la eliminan
al terminar; nunca usan datos reales.

```bash
export TEST_PG_ADMIN_URL="postgres://<usuario>:<clave>@127.0.0.1:5432/postgres"   # servidor de PRUEBAS

npm run verify            # lint, formato, tipos, compilación, pruebas unitarias y de integración, contrato de la API
npm run test:e2e          # pruebas en navegador real (Playwright)
npm run test:acceptance   # recorrido completo del panel y del sitio
npm run test:coverage     # pruebas con informe de cobertura
```

## Instalación en servidores (pruebas, preproducción y producción)

### Requisitos del servidor

- Linux con Node.js 24 LTS y PostgreSQL 16 (en el mismo servidor o en otro, con conexión TLS)
- Proxy inverso con HTTPS (Nginx o Apache)
- ClamAV, obligatorio para cargar archivos en producción
- Servidor de correo SMTP con TLS
- Un gestor de secretos: HashiCorp Vault, AWS/Azure/GCP Secret Manager, secretos de Docker/Kubernetes o
  `LoadCredential` de systemd

### Pasos generales

```bash
npm ci
npm run build
npm run secrets -- generar --dir /etc/semibague/secretos   # o cargar los secretos desde el gestor
npm run migrate                                            # con la cuenta de migraciones
npm run seed                                               # solo en una instalación nueva
npm run create-admin
npm start                                                  # normalmente como servicio de systemd
```

- En servidores, `NODE_ENV=production`. El portal **no arranca** si encuentra contraseñas en variables de entorno o
  en `.env`: los secretos se entregan siempre como archivos del gestor de secretos.
- Use una base de datos distinta para cada entorno. En pruebas y preproducción use datos anonimizados.
- Las migraciones se aplican de forma explícita en cada despliegue, con un respaldo previo.

Guías completas:

- [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md): servidor, PostgreSQL, servicio de systemd, proxy inverso, monitoreo y
  respaldos
- [`docs/SECRETOS.md`](docs/SECRETOS.md): manejo y rotación de secretos
- [`docs/migracion/`](docs/migracion/): migración de los datos de la versión anterior (SQLite)
