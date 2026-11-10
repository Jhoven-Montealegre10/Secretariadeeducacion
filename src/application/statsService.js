'use strict';
/**
 * Estadísticas de visitas con privacidad por diseño (ver docs/ESTADISTICAS.md):
 *  - sin cookies ni identificadores persistentes; respeta "Do Not Track" y "Global Privacy Control";
 *  - no guarda IP ni User-Agent: solo un hash con sal diaria que se descarta al día siguiente
 *    (visitantes únicos ESTIMADOS por día, imposible seguir a alguien entre días);
 *  - excluye robots conocidos, el panel, la API y los archivos;
 *  - país solo si el proxy lo entrega en una cabecera (no hay geolocalización por IP);
 *  - retención configurable (STATS_RETENTION_DAYS).
 */
const { authorize } = require('./authorization');
const { ValidationError } = require('../domain/errors');

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|python-requests|curl|wget|httpclient|monitor/i;
const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex|baidu|brave)\./i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|t|twitter|x|linkedin|youtube|whatsapp|tiktok|threads)\.(com|co|me)$/i;
const DAY_MS = 86400000;

const localDate = (ms) => new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10); // America/Bogota (UTC-5, sin horario de verano)

function device(ua) {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'movil';
  if (/Windows|Macintosh|Linux|CrOS|X11/i.test(ua)) return 'escritorio';
  return 'otro';
}

function source(referer, host, hasCampaign) {
  if (hasCampaign) return { fuente: 'campana', dominio: null };
  let refHost;
  try {
    refHost = referer ? new URL(referer).hostname.toLowerCase() : '';
  } catch {
    refHost = '';
  }
  if (!refHost) return { fuente: 'directo', dominio: null };
  if (refHost === String(host).toLowerCase().split(':')[0]) return { fuente: 'interno', dominio: null };
  if (SEARCH.test(refHost)) return { fuente: 'buscador', dominio: refHost };
  if (SOCIAL.test(refHost)) return { fuente: 'redes_sociales', dominio: refHost };
  return { fuente: 'otro_sitio', dominio: refHost.slice(0, 120) };
}

function createStatsService({ statsRepository, statsHash, retentionDays, clock = Date }) {
  let lastPurge = '';

  return {
    /** Registra una vista de página pública. No lanza: la analítica nunca rompe el sitio. */
    track({ ruta, userAgent = '', referer = '', host = '', ip = '', doNotTrack = false, hasCampaign = false, pais = '' }) {
      try {
        if (doNotTrack || !userAgent || BOT_RE.test(userAgent)) return false;
        const now = clock.now();
        const fecha = localDate(now);
        const salt = statsRepository.saltFor(fecha);
        const { fuente, dominio } = source(referer, host, hasCampaign);
        statsRepository.insertVisit({
          fecha,
          ruta: String(ruta).slice(0, 200),
          visitante: statsHash(salt, `${ip}|${userAgent}`).slice(0, 16),
          fuente,
          referenteDominio: dominio,
          dispositivo: device(userAgent),
          pais: /^[A-Z]{2}$/.test(pais) ? pais : null,
        });
        if (lastPurge !== fecha) {
          statsRepository.purgeOlderThan(localDate(now - retentionDays * DAY_MS));
          lastPurge = fecha;
        }
        return true;
      } catch {
        return false;
      }
    },

    report(actor, { desde, hasta }) {
      authorize(actor, 'stats.read');
      const today = localDate(clock.now());
      const to = hasta || today;
      const from = desde || localDate(Date.parse(`${to}T12:00:00Z`) - 29 * DAY_MS);
      if (from > to) throw new ValidationError('La fecha inicial debe ser anterior a la final.', [{ campo: 'desde', mensaje: 'Rango inválido' }]);
      if ((Date.parse(to) - Date.parse(from)) / DAY_MS > 366)
        throw new ValidationError('El rango máximo es de 366 días.', [{ campo: 'hasta', mensaje: 'Rango demasiado amplio' }]);
      const resumen = statsRepository.summary(from, to);
      return {
        desde: from,
        hasta: to,
        vacio: resumen.visitas === 0,
        resumen: { visitas: resumen.visitas, visitantesUnicosEstimados: resumen.visitantesUnicos },
        porDia: statsRepository.byDay(from, to),
        paginas: statsRepository.topPages(from, to, 10),
        fuentes: statsRepository.groupBy('fuente', from, to),
        referentes: statsRepository.groupBy('referenteDominio', from, to, 10),
        dispositivos: statsRepository.groupBy('dispositivo', from, to),
        paises: statsRepository.groupBy('pais', from, to, 15),
        retencionDias: retentionDays,
      };
    },
  };
}

module.exports = { createStatsService, device, source, localDate };
