/**
 * Cabeceras de seguridad HTTP. CSP estricta: solo scripts propios, sin scripts ni estilos en
 * línea, y el sitio no puede incrustarse en otros (frame-ancestors 'none').
 * Swagger UI usa estilos en línea propios de la biblioteca: en esas rutas se permite
 * 'unsafe-inline' SOLO para estilos (nunca para scripts).
 */
import type { NextFunction, Request, Response } from 'express';
import helmet, { type HelmetOptions } from 'helmet';

function directives(isProd: boolean) {
  return {
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
    ...(isProd ? { upgradeInsecureRequests: [] } : {}),
  };
}

function common(isProd: boolean): HelmetOptions {
  return {
    strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
  };
}

export function securityHeaders(isProd: boolean) {
  const site = helmet({ ...common(isProd), contentSecurityPolicy: { useDefaults: false, directives: directives(isProd) } });
  const docs = helmet({
    ...common(isProd),
    contentSecurityPolicy: { useDefaults: false, directives: { ...directives(isProd), styleSrc: ["'self'", "'unsafe-inline'"], frameSrc: ["'none'"] } },
  });
  return (req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
    const isDocs = req.path === '/api/docs' || req.path === '/admin/api-docs';
    return (isDocs ? docs : site)(req, res, next);
  };
}

/** Archivos subidos: sin ejecución ni interpretación aunque alguien logre colar contenido activo. */
export function sandboxFile(res: Response): void {
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}
