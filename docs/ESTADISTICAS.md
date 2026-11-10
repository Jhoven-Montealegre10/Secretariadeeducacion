# Estadísticas: cómo se recopilan y sus limitaciones

## Qué se registra

Una fila por cada vista **exitosa** de una página pública (inicio, páginas, noticias, normatividad, atención) con:

| Dato | Cómo se obtiene | Qué NO se guarda |
|---|---|---|
| Fecha (día, hora de Colombia) | Reloj del servidor | Hora exacta |
| Ruta | Ruta de la página (sin parámetros) | Parámetros de búsqueda |
| Visitante estimado | `HMAC(IP + navegador, sal del día)` truncado a 16 caracteres | IP, User-Agent, cookies |
| Fuente | Dominio del `Referer`: directo, buscador, redes sociales, otro sitio, interno, campaña (`utm_source`) | URL completa de origen |
| Dispositivo | Computador, celular, tableta u otro, deducido del navegador | Modelo, sistema operativo, versión |
| País | **Solo** si el proxy inverso entrega una cabecera de país (`STATS_GEO_HEADER`, p. ej. `cf-ipcountry`) | Ciudad, coordenadas |

**No se registran:** el panel, la API, los archivos, los errores (404/500), robots conocidos, ni visitantes con
"No rastrear" (`DNT: 1`) o "Global Privacy Control" (`Sec-GPC: 1`). El sitio público **no usa cookies** de analítica
(la única cookie, de sesión y técnica, aparece solo en páginas con formulario —Atención al ciudadano— para la protección CSRF).

## Visitantes únicos: una estimación

La sal aleatoria del día se borra al día siguiente, por lo que **no es posible seguir a una persona entre días** ni
recuperar su IP. Consecuencias:

- "Visitantes únicos" del rango = suma de visitantes distintos de cada día. Una persona que vuelve otro día cuenta otra vez.
- Varias personas detrás de la misma IP y el mismo navegador (p. ej. una sala de cómputo) cuentan como una.
- Una persona que cambia de red o de navegador en el mismo día cuenta dos veces.
- **El sistema no identifica a los visitantes por nombre ni puede hacerlo.**

## Procedencia geográfica

No se usa ninguna base de datos de geolocalización por IP. El país solo se muestra si la infraestructura lo provee
(p. ej. Cloudflare con `cf-ipcountry`). Sin esa cabecera, la tabla "País" queda vacía. Integrar una base GeoIP local
(p. ej. MaxMind GeoLite2) es posible, pero exige revisar su licencia y el tratamiento de la IP antes de descartarla.

## Retención y privacidad

- Retención: `STATS_RETENTION_DAYS` (por defecto 395 días ≈ 13 meses). Las filas más antiguas se eliminan automáticamente una vez al día.
- Los datos son agregados y no permiten identificar a una persona; aun así se informan en la política de tratamiento
  de datos (página Transparencia) conforme a la Ley 1581 de 2012. Como no se usan cookies ni identificadores
  persistentes, no se requiere un aviso de consentimiento de cookies para esta analítica; si se agrega una herramienta
  de terceros (p. ej. Google Analytics), sí se debe implementar consentimiento previo.
- Solo el rol con `stats.read` (Administrador) consulta el reporte.

## Si no hay datos

El reporte devuelve `vacio: true` y el panel muestra un estado vacío. **No se generan cifras de ejemplo.**
