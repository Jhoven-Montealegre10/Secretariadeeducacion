'use strict';
/**
 * Límites de peticiones por IP (express-rate-limit). Frenan fuerza bruta, spam y abuso.
 * LIMITACIÓN: el almacén es en memoria (una instancia). Con varias instancias, use un
 * almacén compartido (p. ej. Redis) — ver docs/DESPLIEGUE.md.
 */
const { rateLimit } = require('express-rate-limit');
const config = require('../../../config');
const { TooManyRequestsError } = require('../../../domain/errors');

function limiter(windowMinutes, limit, message) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: config.isTest ? Number(process.env.TEST_RATE_LIMIT || 10000) : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next) => next(new TooManyRequestsError(message)),
  });
}

module.exports = {
  general: limiter(15, 900, 'Ha realizado demasiadas solicitudes. Intente de nuevo en unos minutos.'),
  api: limiter(15, 600, 'Demasiadas solicitudes a la API. Intente de nuevo en unos minutos.'),
  login: limiter(15, 10, 'Demasiados intentos de inicio de sesión. Espere 15 minutos.'),
  mfa: limiter(15, 10, 'Demasiados intentos de verificación. Espere 15 minutos.'),
  recovery: limiter(60, 5, 'Demasiadas solicitudes de recuperación. Intente en una hora.'),
  upload: limiter(60, 60, 'Demasiadas cargas de archivos en la última hora.'),
  pqrsd: limiter(60, 5, 'Ha enviado demasiadas solicitudes en la última hora. Intente más tarde.'),
  consulta: limiter(15, 20, 'Demasiadas consultas. Intente de nuevo en unos minutos.'),
  limiter,
};
