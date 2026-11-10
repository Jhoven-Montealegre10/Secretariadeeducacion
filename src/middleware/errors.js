'use strict';
/** Manejo centralizado de errores: nunca muestra trazas ni detalles internos al público. */
const config = require('../../config');

function notFound(req, res) {
  res.status(404).render('errors/error', {
    title: 'Página no encontrada',
    status: 404,
    message: 'La página que busca no existe o fue movida.',
  });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.publicMessage || 'Ocurrió un error inesperado. Intente de nuevo más tarde.';

  if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'El archivo supera el tamaño máximo permitido (10 MB).'; }
  if (err.type === 'entity.too.large') { status = 413; message = 'La solicitud es demasiado grande.'; }

  if (status >= 500 && !config.isTest) {
    // Se registra en el servidor sin datos del formulario (pueden contener datos personales).
    console.error(`[error] ${req.method} ${req.path}:`, err.stack || err.message);
  }
  if (res.headersSent) return;
  res.status(status).render('errors/error', { title: status === 404 ? 'No encontrado' : 'Error', status, message });
}

module.exports = { notFound, errorHandler };
