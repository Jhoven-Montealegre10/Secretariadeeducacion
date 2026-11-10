'use strict';
/**
 * Protección CSRF para operaciones con cookie de sesión:
 *  1. token sincronizador secreto por sesión (cabecera X-CSRF-Token o campo _csrf);
 *  2. si el navegador envía Origin, debe ser el mismo sitio (defensa adicional);
 *  3. la cookie es SameSite=Strict.
 */
const { randomToken, safeEqual } = require('../../../infrastructure/security/crypto');
const { ForbiddenError } = require('../../../domain/errors');

function ensureToken(req) {
  if (!req.session.csrf) req.session.csrf = randomToken();
  return req.session.csrf;
}

/** Disponible en las vistas como csrfToken(); crea el token solo cuando se necesita. */
function provideToken(req, res, next) {
  res.locals.csrfToken = () => ensureToken(req);
  next();
}

function sameOrigin(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

function verifyCsrf(req, res, next) {
  const sent = req.get('x-csrf-token') || req.body?._csrf;
  const expected = req.session?.csrf;
  if (!sameOrigin(req) || !sent || !expected || !safeEqual(sent, expected)) {
    const err = new ForbiddenError('La sesión del formulario expiró o la solicitud no es válida. Recargue la página e intente de nuevo.');
    err.code = 'CSRF_INVALID';
    return next(err);
  }
  next();
}

module.exports = { provideToken, verifyCsrf, ensureToken };
