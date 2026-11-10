'use strict';
/**
 * Sesiones del panel:
 *  - cookie HttpOnly, SameSite=Strict, Secure y prefijo __Host- en producción;
 *  - expiración por inactividad (cookie renovable) y duración máxima absoluta;
 *  - en cada petición se revalida al usuario contra la base de datos: si fue desactivado,
 *    cambió de rol, de contraseña o de segundo factor, la sesión deja de ser válida.
 * El estado de la sesión vive en el servidor; el navegador solo tiene un ID firmado.
 */
const session = require('express-session');
const config = require('../../../config');
const SqliteSessionStore = require('../../../infrastructure/session/sqliteSessionStore');

const cookieName = config.isProd ? '__Host-sem.sid' : 'sem.sid';

const sessionMiddleware = session({
  name: cookieName,
  secret: config.sessionSecret,
  store: new SqliteSessionStore(config.session.idleMs),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { httpOnly: true, secure: config.isProd, sameSite: 'strict', maxAge: config.session.idleMs, path: '/' },
});

function regenerate(req) {
  return new Promise(/** @param {(v?: any) => void} resolve */ (resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

function save(req) {
  return new Promise(/** @param {(v?: any) => void} resolve */ (resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}

function destroy(req, res) {
  return new Promise(
    /** @param {(v?: any) => void} resolve */ (resolve) => {
      if (!req.session) return resolve();
      req.session.destroy(() => {
        res.clearCookie(cookieName, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.isProd });
        resolve();
      });
    },
  );
}

/** Carga req.actor desde la BD si la sesión está completa (contraseña + segundo factor) y vigente. */
function loadActor(authService) {
  return (req, res, next) => {
    req.actor = null;
    const auth = req.session?.auth;
    if (auth) {
      const expired = Date.now() - auth.loginAt > config.session.absoluteMs;
      const actor = expired ? null : authService.loadActor(auth.userId, auth.authVersion);
      if (actor) req.actor = actor;
      else delete req.session.auth;
    }
    res.locals.actor = req.actor;
    next();
  };
}

/** Marca la sesión como completamente autenticada, con un ID nuevo (evita fijación de sesión). */
async function establish(req, userId, authVersion) {
  await regenerate(req);
  req.session.auth = { userId, authVersion, loginAt: Date.now() };
  await save(req);
}

module.exports = { sessionMiddleware, loadActor, regenerate, save, destroy, establish, cookieName };
