# Portal web – Secretaría de Educación Municipal de Ibagué

Portal institucional con identidad **GOV.CO**, **panel de administración propio** (sin WordPress), **API REST
documentada con OpenAPI/Swagger**, arquitectura por capas con MVC y controles de seguridad verificados con pruebas.

## Qué incluye

| Módulo | Funciones |
|---|---|
| **Sitio público** | Inicio con noticias y slider, páginas institucionales editables, noticias, normatividad, PQRSD, buscador, transparencia. Responsive y accesible. |
| **Acceso al panel** | Usuario y contraseña (Argon2id), **doble autenticación TOTP obligatoria**, códigos de recuperación, recuperación por correo de un solo uso, cierre de sesión. |
| **Usuarios y roles** | Alta por invitación, edición, desactivación, eliminación, restablecimiento de MFA; roles con permisos por módulo y acción. |
| **Multimedia** | Imágenes y audios con búsqueda, filtros, previsualización, texto alternativo, nombre visible, reemplazo, aviso de uso y selector reutilizable. |
| **Páginas** | Editor por bloques (sin escribir código), slug único, borrador/publicada, vista previa protegida. |
| **Noticias** | Título, resumen, contenido enriquecido, imagen principal, galería, fecha, slug y estado; publicación automática en el inicio. |
| **Sliders** | Por ubicación (Inicio, La Secretaría, Contacto u otra página), diapositivas ordenables, activables y con enlace. |
| **Estadísticas** | Visitas, visitantes únicos estimados, páginas, fuentes, dispositivos y país, con filtros por fechas, sin cookies ni IP. |
| **Auditoría** | Bitácora de solo inserción con verificación de integridad. |
| **API REST** | `/api/v1` pública y privada, 48 operaciones, Swagger en `/api/docs` (pública) y `/admin/api-docs` (completa). |

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/01-DIAGNOSTICO-INICIAL.md`](docs/01-DIAGNOSTICO-INICIAL.md) | Revisión del proyecto existente y hallazgos iniciales |
| [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) | Capas, MVC, estructura de carpetas, convenciones |
| [`docs/PERMISOS.md`](docs/PERMISOS.md) | Matriz de permisos y reglas de autorización |
| [`docs/API.md`](docs/API.md) | Uso de la API, autenticación, paginación, errores, versionado, integraciones |
| [`docs/openapi.json`](docs/openapi.json) | Especificación OpenAPI 3.1 completa (y `openapi-publica.json`) |
| [`docs/ESTADISTICAS.md`](docs/ESTADISTICAS.md) | Cómo se recopilan las métricas, privacidad y limitaciones |
| [`docs/SEGURIDAD-AUDITORIA.md`](docs/SEGURIDAD-AUDITORIA.md) | Informe de auditoría (ASVS / Top 10), hallazgos, correcciones y pendientes |
| [`docs/DESPLIEGUE.md`](docs/DESPLIEGUE.md) | Configuración y despliegue seguro, copias de seguridad, lista de verificación |

## Inicio rápido (desarrollo)

Requisitos: **Node.js 22.13 o superior**.

```bash
npm ci
npm run generate-keys      # copie los valores en .env (ver .env.example)
npm run migrate            # crea o actualiza la base de datos
npm run seed               # instituciones de referencia
npm run create-admin       # primer administrador (no hay usuarios por defecto)
npm run dev                # http://localhost:3000 — panel en /admin
```

En el primer ingreso el sistema pide configurar la aplicación autenticadora (Google Authenticator, Microsoft
Authenticator, FreeOTP…) y entrega 10 códigos de recuperación. Sin SMTP configurado, en desarrollo los correos de
invitación y recuperación se guardan en `storage/correo-desarrollo/`.

## Calidad y verificación

La guía [Calidad y pruebas](docs/CALIDAD-Y-PRUEBAS.md) explica SonarQube for IDE,
las tareas de VS Code y cómo consultar la cobertura. En Windows use `npm.cmd` si PowerShell bloquea `npm.ps1`.

```bash
npm run verify     # lint + tipos + pruebas + contrato OpenAPI + auditoría de dependencias
npm test           # 78 pruebas de seguridad y flujos críticos
npm run test:coverage # genera coverage/index.html y coverage/lcov.info
npm run quality    # código + tipos + pruebas con cobertura + OpenAPI + dependencias
npm run openapi:export   # regenera docs/openapi*.json desde el código
```

## Pendientes antes de publicar

Ver `docs/SEGURIDAD-AUDITORIA.md` §6 y la lista de verificación de `docs/DESPLIEGUE.md` §8. Los principales:
configurar SMTP y antimalware, ejecutar un escaneo DAST en preproducción, probar la restauración de copias, y
cargar el contenido oficial (misión, visión, directorio, enlaces SAC y Humano) desde el panel.
