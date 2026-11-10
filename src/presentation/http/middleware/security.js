'use strict';
/**
 * Cabeceras de seguridad HTTP. CSP estricta: solo scripts propios, sin scripts ni estilos en
 * línea, y el sitio no puede incrustarse en otros (frame-ancestors 'none').
 * La documentación Swagger UI usa estilos en línea propios de la biblioteca, por lo que en
 * esas rutas se permite 'unsafe-inline' SOLO para estilos (nunca para scripts).
 */
const { default: helmet } = require('helmet');
const config = require('../../../config');

const baseDirectives = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:'],
  mediaSrc: ["'self'"],
  frameSrc: ['https://www.google.com'],
  connectSrc: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
};

/** @type {any} Opciones compartidas de helmet (tipadas como HelmetOptions al usarse). */
const common = {
  strictTransportSecurity: config.isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'same-origin' },
};

const securityHeaders = helmet({ ...common, contentSecurityPolicy: { useDefaults: false, directives: baseDirectives } });
const docsHeaders = helmet({
  ...common,
  contentSecurityPolicy: { useDefaults: false, directives: { ...baseDirectives, styleSrc: ["'self'", "'unsafe-inline'"], frameSrc: ["'none'"] } },
});

function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  next();
}

/** Respuestas con datos privados: ni navegadores ni proxies deben guardarlas. */
function noStore(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

/** Archivos subidos: sin ejecución ni interpretación aunque alguien logre colar contenido activo. */
function sandboxFile(res) {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

module.exports = { securityHeaders, docsHeaders, permissionsPolicy, noStore, sandboxFile };
