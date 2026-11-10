"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityHeaders = securityHeaders;
exports.sandboxFile = sandboxFile;
exports.noStore = noStore;
const helmet_1 = __importDefault(require("helmet"));
function directives(isProd) {
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
function common(isProd) {
    return {
        strictTransportSecurity: isProd ? { maxAge: 31536000, includeSubDomains: true } : false,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'same-origin' },
    };
}
function securityHeaders(isProd) {
    const site = (0, helmet_1.default)({ ...common(isProd), contentSecurityPolicy: { useDefaults: false, directives: directives(isProd) } });
    const docs = (0, helmet_1.default)({
        ...common(isProd),
        contentSecurityPolicy: { useDefaults: false, directives: { ...directives(isProd), styleSrc: ["'self'", "'unsafe-inline'"], frameSrc: ["'none'"] } },
    });
    return (req, res, next) => {
        res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
        const isDocs = req.path === '/api/docs' || req.path === '/admin/api-docs';
        return (isDocs ? docs : site)(req, res, next);
    };
}
/** Archivos subidos: sin ejecución ni interpretación aunque alguien logre colar contenido activo. */
function sandboxFile(res) {
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
}
function noStore(res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
}
//# sourceMappingURL=headers.js.map