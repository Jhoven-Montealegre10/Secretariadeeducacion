# Portal web – Secretaría de Educación Municipal de Ibagué

Nueva versión del sitio de la Secretaría de Educación de Ibagué (reemplazo de http://www.semibague.gov.co/).

- Diseño basado en los lineamientos **GOV.CO** (barra superior y pie GOV.CO, azul `#3366CC`, azul oscuro `#004884`, tipografías Montserrat y Work Sans).
- **Responsive**: se adapta a celulares, tabletas y computadores (menú desplegable en móvil).
- **Accesible**: saltar al contenido, navegación por teclado, alto contraste, ajuste de tamaño de letra (pautas WCAG 2.1 AA / NTC 5854).
- **Sin dependencias**: HTML, CSS y JavaScript puros. Se puede publicar en cualquier servidor web (Apache, Nginx, IIS) o en GitHub Pages.

## Páginas

| Archivo | Contenido |
|---|---|
| `index.html` | Inicio: accesos rápidos, noticias, servicios por perfil, sistemas de información, horarios |
| `secretaria.html` | Misión, visión, funciones, organigrama, dependencias, sistema de gestión |
| `tramites.html` | Matrícula, docentes, Fondo de Prestaciones, establecimientos, certificados, plataformas |
| `atencion.html` | Canales de atención, PQRSD, notificaciones judiciales, preguntas frecuentes |
| `comunidad.html` | Estudiantes y familias, docentes, programas, directorio de instituciones |
| `normatividad.html` | Circulares, resoluciones, decretos y normatividad nacional |
| `transparencia.html` | Menú de transparencia (Ley 1712 de 2014, Res. 1519 de 2020), políticas |
| `noticias.html`, `contacto.html`, `buscar.html`, `mapa-sitio.html` | Noticias, contacto con mapa, buscador interno, mapa del sitio |

## Cómo editar

El encabezado y el pie de página se escriben **una sola vez** en `src/partials/`. El contenido de cada página está en `src/pages/`.

1. Edite el archivo en `src/pages/` (o `src/partials/` para menú y pie).
2. Ejecute `python3 build.py` para regenerar los `.html` de la raíz.
3. Publique la raíz del proyecto (los `.html`, `assets/`).

Para ver el sitio en local: `python3 -m http.server 8000` y abrir http://localhost:8000.

### Cómo agregar una noticia

Copie un bloque `<article class="card">…</article>` en `src/pages/noticias.html` (y en `index.html` si debe aparecer en el inicio), cambie título, fecha, resumen y enlace, y ejecute `python3 build.py`.

## Pendientes de migración (contenido del portal anterior)

El portal anterior no se pudo consultar automáticamente durante el desarrollo, así que estos puntos están marcados con `TODO` en el código y deben completarse con la información oficial:

- [ ] Escudo / logo oficial de la Alcaldía (`assets/img/`) para reemplazar el bloque "SEM" del encabezado.
- [ ] Misión y visión oficiales (`secretaria.html`, hoy con texto provisional).
- [ ] Organigrama oficial y directorio con responsables, extensiones y correos.
- [ ] URL de SAC, Humano en Línea y redes sociales oficiales (hoy en `#`).
- [ ] Correo de notificaciones judiciales.
- [ ] Noticias reales (las actuales son de ejemplo).
- [ ] Circulares, resoluciones y decretos en PDF (crear carpeta `documentos/`).
- [ ] Directorio completo de instituciones educativas oficiales y sus sedes.
- [ ] Documentos del menú de Transparencia (presupuesto, contratación, informes).

Datos ya incluidos (tomados de la información pública del portal actual): dirección Carrera 2 No. 17 piso 2 – Antiguo Edificio Cafeteros, teléfono (608) 262 3256, correo educacion@ibague.gov.co, horario general y horario del Fondo de Prestaciones Económicas, enlace a circulares 2025.
