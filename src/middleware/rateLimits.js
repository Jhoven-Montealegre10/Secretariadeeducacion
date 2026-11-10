'use strict';
/** Límites de peticiones por IP: frenan fuerza bruta, spam de formularios y abuso automatizado. */
const rateLimit = require('express-rate-limit');
const config = require('../../config');

function limiter(windowMinutes, limit, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: config.isTest ? Number(process.env.TEST_RATE_LIMIT || 1000) : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).render('errors/error', { title: 'Demasiadas solicitudes', status: 429, message });
    },
  });
}

module.exports = {
  general: limiter(15, 600, 'Ha realizado demasiadas solicitudes. Intente de nuevo en unos minutos.'),
  login: limiter(15, 10, 'Demasiados intentos de inicio de sesión. Espere 15 minutos.'),
  pqrsd: limiter(60, 5, 'Ha enviado demasiadas solicitudes en la última hora. Intente más tarde.'),
  consulta: limiter(15, 20, 'Demasiadas consultas. Intente de nuevo en unos minutos.'),
  limiter,
};
