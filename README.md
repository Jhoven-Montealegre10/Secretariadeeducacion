# Portal web – Secretaría de Educación Municipal de Ibagué

Nueva versión del sitio de la Secretaría de Educación de Ibagué (reemplazo de http://www.semibague.gov.co/).

- **Diseño GOV.CO**: barra superior y pie GOV.CO, azul `#3366CC` / `#004884`, tipografías Montserrat y Work Sans.
- **Responsive**: celulares, tabletas y computadores.
- **Accesible**: navegación por teclado, alto contraste, tamaño de letra ajustable (WCAG 2.1 AA / NTC 5854).
- **Arquitectura MVC** con Node.js + Express, vistas EJS y base de datos SQLite.
- **Seguro por diseño**: ver la sección [Seguridad](#seguridad).

## Arquitectura (Modelo – Vista – Controlador)

```
server.js              Arranque del servidor HTTP
app.js                 Ensambla la app: middleware de seguridad, sesiones, rutas
config/
  index.js             Configuración y secretos (leídos de .env, nunca del código)
  site.js              Datos institucionales públicos (dirección, teléfonos, horarios, enlaces)
src/
  models/              MODELO: acceso a datos. Solo consultas preparadas (?).
    db.js              Conexión y esquema de la base de datos
    Noticia.js  Documento.js  Institucion.js  Pqrsd.js  Usuario.js  Auditoria.js
  views/               VISTA: plantillas EJS (escapan toda salida)
    partials/          Encabezado, pie, tarjetas reutilizables
    pages/             Páginas públicas
    admin/             Panel de administración
    errors/            Páginas de error
  controllers/         CONTROLADOR: reciben la petición, validan, llaman al modelo y eligen la vista
    admin/             Controladores del panel
  routes/              Mapa URL -> middleware -> controlador (public.js, admin.js)
  middleware/          Seguridad: cabeceras/CSP, CSRF, autenticación, límites, subida de archivos, errores
  services/            Cifrado, validación, sesiones, utilidades de vista
public/assets/         CSS, JavaScript del navegador e imágenes (lo único público)
scripts/               generate-keys, create-admin, seed
tests/                 Pruebas automáticas de seguridad y funcionamiento
storage/               Base de datos y PDF subidos (fuera de Git y fuera de /public)
```

Flujo de una petición: **Ruta** → middleware (límite, CSRF, sesión, rol) → **Controlador** (valida entrada) → **Modelo** (consulta parametrizada / cifrado) → **Vista** (HTML escapado).

## Instalación

Requisitos: **Node.js 22.13 o superior**.

```bash
npm ci                    # instala dependencias exactas (package-lock.json)
npm run generate-keys     # genera SESSION_SECRET y DATA_ENCRYPTION_KEY
cp .env.example .env      # pegue las claves generadas en .env
npm run seed              # carga instituciones y noticias de ejemplo
npm run create-admin      # crea el primer usuario administrador (no hay usuarios por defecto)
npm start                 # http://localhost:3000   — panel en /admin
npm test                  # ejecuta las 25 pruebas de seguridad
```

En producción, ejecute la app detrás de Nginx/Apache con **HTTPS** obligatorio (`TRUST_PROXY=1`), con un gestor de procesos (systemd o PM2), y haga copia de seguridad diaria de `storage/` y de la clave `DATA_ENCRYPTION_KEY` (guardada aparte).

## Panel de administración (`/admin`)

| Rol | Puede |
|---|---|
| `admin` | Todo: noticias, documentos, ver y responder PQRSD, ver auditoría |
| `editor` | Noticias y documentos. **No** ve datos personales de PQRSD |

- **Noticias**: crear, editar, publicar/ocultar, eliminar.
- **Documentos**: publicar circulares, resoluciones, decretos y acuerdos en PDF.
- **PQRSD**: ver solicitudes, cambiar estado y responder. El ciudadano consulta la respuesta con su radicado y documento.

## Seguridad

| Riesgo | Medida |
|---|---|
| **Inyección SQL** | Todas las consultas son sentencias preparadas con parámetros (`?`); los comodines de `LIKE` se escapan. Los IDs de las URL se validan como números. |
| **Datos sensibles expuestos** | Los datos personales de las PQRSD (nombre, documento, correo, teléfono, asunto, mensaje, respuesta) se guardan **cifrados con AES-256-GCM**. La búsqueda por documento usa un índice ciego HMAC. Las contraseñas se guardan con **scrypt** + sal. |
| **Claves en el frontend** | No hay claves, tokens ni lógica sensible en el navegador. Los secretos viven solo en `.env` del servidor (excluido de Git). En producción el servidor **no arranca** sin ellos. |
| **XSS** | Las vistas escapan toda salida (`<%= %>`). Política CSP estricta: solo scripts propios, sin scripts ni estilos en línea. |
| **CSRF** | Token secreto por sesión en todos los formularios + cookies `SameSite=Strict`. |
| **Robo de sesión** | Cookie `HttpOnly`, `Secure` (HTTPS), `__Host-`, sesión guardada en el servidor, regeneración del ID al iniciar sesión, expiración a las 2 horas. |
| **Fuerza bruta** | Límite de intentos por IP y bloqueo de la cuenta 15 min tras 5 intentos fallidos. Respuesta idéntica si el usuario no existe. |
| **Spam / abuso** | Límites por IP (PQRSD 5/hora, consultas 20/15 min, general 600/15 min) y campo trampa anti-robots. |
| **Archivos maliciosos** | Solo PDF verificados por su firma real (`%PDF-`), máx. 10 MB, guardados fuera de `/public` con nombre aleatorio; se descargan por ID. |
| **Clickjacking, sniffing** | `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy`. |
| **Fuga de información** | Errores genéricos sin trazas; sin `X-Powered-By`; páginas privadas con `Cache-Control: no-store`; panel con `noindex`. |
| **Trazabilidad** | Bitácora de auditoría de inicios de sesión y de cada acción del panel, incluida cada vez que alguien abre una PQRSD. |
| **Dependencias** | Solo 6 dependencias de producción; `npm audit` sin vulnerabilidades. |

## Pendientes de contenido

Marcados con `TODO` en el código:

- [ ] Escudo oficial de la Alcaldía (`public/assets/img/`).
- [ ] Misión y visión oficiales (`src/views/pages/secretaria.ejs`).
- [ ] Organigrama y directorio de funcionarios.
- [ ] URL oficiales de SAC, Humano en Línea y redes sociales (`config/site.js`).
- [ ] Correo de notificaciones judiciales.
- [ ] Noticias y documentos reales (se cargan desde el panel `/admin`).
- [ ] Directorio completo de instituciones educativas (`scripts/seed.js`).
- [ ] Documentos del menú de Transparencia.
- [ ] Notificación por correo al ciudadano al radicar/responder (requiere servidor SMTP institucional).
