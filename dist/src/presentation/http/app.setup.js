"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureApp = configureApp;
/**
 * Ensamble HTTP (capa de presentación), compartido por el servidor y las pruebas:
 *   ID de solicitud → métricas → cabeceras de seguridad → estáticos → cuerpos → sesión →
 *   actor (revalidado contra la BD) → datos de vista → analítica → CORS de la API pública →
 *   rutas Nest (guard → interceptor → controlador) → filtro de errores.
 */
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_path_1 = __importDefault(require("node:path"));
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const swagger_ui_dist_1 = __importDefault(require("swagger-ui-dist"));
const auth_service_1 = require("../../application/auth.service");
const stats_service_1 = require("../../application/stats.service");
const configuration_1 = require("../../config/configuration");
const site_1 = require("../../config/site");
const db_service_1 = require("../../infrastructure/database/db.service");
const crypto_service_1 = require("../../infrastructure/security/crypto.service");
const pg_session_store_1 = require("../../infrastructure/session/pg-session.store");
const view_helpers_1 = require("../web/view-helpers");
const docs_controller_1 = require("./api/controllers/docs.controller");
const openapi_document_1 = require("./api/openapi-document");
const metrics_service_1 = require("./observability/metrics.service");
const csrf_service_1 = require("./security/csrf.service");
const headers_1 = require("./security/headers");
const session_helpers_1 = require("./session/session.helpers");
async function configureApp(app) {
    const config = app.get(configuration_1.APP_CONFIG);
    const auth = app.get(auth_service_1.AuthService);
    const stats = app.get(stats_service_1.StatsService);
    const csrf = app.get(csrf_service_1.CsrfService);
    const metrics = app.get(metrics_service_1.MetricsService);
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    app.set('query parser', 'simple');
    app.setViewEngine('ejs');
    app.setBaseViewsDir(node_path_1.default.join(config.root, 'views'));
    Object.assign(app.getHttpAdapter().getInstance().locals, view_helpers_1.viewHelpers);
    app.use((req, res, next) => {
        req.id = node_crypto_1.default.randomUUID();
        res.setHeader('X-Request-Id', req.id);
        next();
    });
    app.use(metrics.middleware());
    app.use((0, headers_1.securityHeaders)(config.isProd));
    app.use(express_1.default.static(node_path_1.default.join(config.root, 'public'), { index: false, dotfiles: 'deny', maxAge: config.isProd ? '7d' : 0 }));
    app.use('/api/docs/assets', express_1.default.static(swagger_ui_dist_1.default.getAbsoluteFSPath(), { index: false, maxAge: config.isProd ? '7d' : 0 }));
    // Cuerpos: JSON solo en la API (límite global 1 MB; cada ruta tiene el suyo), formularios pequeños en el sitio.
    app.use('/api', express_1.default.json({ limit: '1mb', strict: true }));
    app.use(express_1.default.urlencoded({ extended: false, limit: '20kb', parameterLimit: 30 }));
    const store = new pg_session_store_1.PgSessionStore(app.get(db_service_1.Db), app.get(crypto_service_1.CryptoService), config.session.idleMs);
    app.use((0, express_session_1.default)({
        name: (0, session_helpers_1.sessionCookieName)(config.isProd),
        secret: config.sessionSecret,
        store,
        resave: false,
        saveUninitialized: false,
        rolling: true,
        cookie: { httpOnly: true, secure: config.isProd, sameSite: 'strict', maxAge: config.session.idleMs, path: '/' },
    }));
    // Actor: se reconstruye desde la BD en cada petición; la sesión vence por inactividad y por tiempo absoluto.
    app.use((req, res, next) => {
        req.actor = null;
        const a = req.session?.auth;
        if (!a)
            return next();
        const expired = Date.now() - a.loginAt > config.session.absoluteMs;
        (expired ? Promise.resolve(null) : auth.loadActor(a.userId, a.authVersion))
            .then((actor) => {
            if (actor)
                req.actor = actor;
            else
                delete req.session.auth;
            next();
        })
            .catch(next);
    });
    app.use((req, res, next) => {
        res.locals.site = site_1.SITE;
        res.locals.path = req.path;
        res.locals.nav = '';
        res.locals.vistaPrevia = false;
        res.locals.actor = req.actor;
        res.locals.csrfToken = () => csrf.ensureToken(req);
        next();
    });
    // Analítica: solo vistas públicas exitosas marcadas por el controlador; nunca del panel.
    app.use((req, res, next) => {
        res.on('finish', () => {
            const ruta = res.locals.trackView;
            if (!ruta || res.statusCode !== 200 || req.method !== 'GET' || req.actor)
                return;
            stats.track({
                ruta,
                userAgent: req.get('user-agent') ?? '',
                referer: req.get('referer') ?? '',
                host: req.get('host') ?? '',
                ip: req.ip ?? '',
                doNotTrack: req.get('dnt') === '1' || req.get('sec-gpc') === '1',
                hasCampaign: typeof req.query.utm_source === 'string',
                pais: config.stats.geoHeader ? String(req.get(config.stats.geoHeader) ?? '').toUpperCase() : '',
            });
        });
        next();
    });
    // CORS solo para la API pública de lectura y solo para orígenes declarados (nunca "*" ni credenciales).
    app.use(['/api/v1/public', '/api/v1/openapi-publica.json'], (req, res, next) => {
        const origin = req.get('origin');
        if (origin && config.api.corsOrigins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Vary', 'Origin');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Accept');
            res.setHeader('Access-Control-Max-Age', '600');
            if (req.method === 'OPTIONS') {
                res.status(204).end();
                return;
            }
        }
        next();
    });
    app.enableShutdownHooks();
    await app.init();
    const docs = app.get(docs_controller_1.OpenApiDocs);
    docs.publicDoc = (0, openapi_document_1.buildOpenApiDocument)(app, 'public');
    docs.fullDoc = (0, openapi_document_1.buildOpenApiDocument)(app, 'full');
    return store;
}
//# sourceMappingURL=app.setup.js.map