'use strict';
const Usuario = require('../models/Usuario');

/** Carga el usuario de la sesión (si existe) para las vistas. */
function loadUser(req, res, next) {
  res.locals.usuario = null;
  if (req.session?.userId) {
    const u = Usuario.porId(req.session.userId);
    if (u) { req.user = u; res.locals.usuario = u; } else { delete req.session.userId; }
  }
  next();
}

function requireAuth(req, res, next) {
  if (req.user) return next();
  return res.redirect('/admin/login');
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (req.user && roles.includes(req.user.rol)) return next();
    const err = new Error('Acceso denegado');
    err.status = 403;
    err.publicMessage = 'No tiene permisos para realizar esta acción.';
    next(err);
  };
}

module.exports = { loadUser, requireAuth, requireRole };
