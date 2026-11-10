'use strict';
/**
 * Registra una visita cuando un controlador del sitio público marca la respuesta con
 * res.locals.trackView y la respuesta termina con éxito. No usa cookies.
 */
const config = require('../../../config');

function analytics(statsService) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (!res.locals.trackView || res.statusCode !== 200 || req.method !== 'GET' || req.actor) return;
      statsService.track({
        ruta: res.locals.trackView === true ? req.path : res.locals.trackView,
        userAgent: req.get('user-agent') || '',
        referer: req.get('referer') || '',
        host: req.get('host') || '',
        ip: req.ip,
        doNotTrack: req.get('dnt') === '1' || req.get('sec-gpc') === '1',
        hasCampaign: typeof req.query.utm_source === 'string',
        pais: config.stats.geoHeader ? String(req.get(config.stats.geoHeader) || '').toUpperCase() : '',
      });
    });
    next();
  };
}

module.exports = { analytics };
