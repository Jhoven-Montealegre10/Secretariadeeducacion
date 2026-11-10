'use strict';
/**
 * Protección CSRF (patrón de token sincronizador): cada sesión tiene un token secreto
 * que debe venir en todo formulario POST. Un sitio externo no puede conocerlo.
 */
const { randomToken, safeEqual } = require('../services/crypto');

/** Pone a disposición de la vista una función csrfToken() que crea el token bajo demanda. */
function provideToken(req, res, next) {
  res.locals.csrfToken = () => {
    if (!req.session.csrf) req.session.csrf = randomToken();
    return req.session.csrf;
  };
  next();
}

function verifyToken(req, res, next) {
  const sent = req.body?._csrf || req.get('x-csrf-token');
  const expected = req.session?.csrf;
  if (!sent || !expected || !safeEqual(sent, expected)) {
    const err = new Error('Token CSRF inválido');
    err.status = 403;
    err.publicMessage = 'La sesión del formulario expiró. Recargue la página e intente de nuevo.';
    return next(err);
  }
  next();
}

module.exports = { provideToken, verifyToken };
