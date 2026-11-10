'use strict';
/**
 * CORS solo para la API PÚBLICA de lectura y solo para orígenes declarados en CORS_ORIGINS.
 * Nunca "*", nunca con credenciales: las integraciones externas no usan la sesión del panel.
 */
const config = require('../../../config');

function publicCors(req, res, next) {
  const origin = req.get('origin');
  if (origin && config.api.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Accept');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.status(204).end();
  }
  next();
}

module.exports = { publicCors };
