'use strict';
/**
 * Ensamble de la aplicación (MVC):
 *   Modelos      -> src/models       (acceso a datos, consultas parametrizadas, cifrado)
 *   Vistas       -> src/views        (plantillas EJS, escapan toda salida)
 *   Controladores-> src/controllers  (reciben la petición, validan, llaman al modelo, eligen la vista)
 *   Rutas        -> src/routes       (URL -> middleware de seguridad -> controlador)
 */
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const site = require('./config/site');
const SqliteStore = require('./src/services/sessionStore');
const { securityHeaders, permissionsPolicy } = require('./src/middleware/security');
const { provideToken } = require('./src/middleware/csrf');
const { loadUser } = require('./src/middleware/auth');
const { notFound, errorHandler } = require('./src/middleware/errors');
const limits = require('./src/middleware/rateLimits');

const app = express();
const cookieName = config.isProd ? '__Host-sem.sid' : 'sem.sid';

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.set('sessionCookieName', cookieName);
Object.assign(app.locals, require('./src/services/viewHelpers'));

app.use(securityHeaders);
app.use(permissionsPolicy);
app.use(limits.general);

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  dotfiles: 'deny',
  maxAge: config.isProd ? '7d' : 0,
}));

app.use(session({
  name: cookieName,
  secret: config.sessionSecret,
  store: new SqliteStore(config.sessionMaxAgeMs),
  resave: false,
  saveUninitialized: false, // no se crean sesiones para visitantes que no envían formularios
  rolling: true,
  cookie: {
    httpOnly: true,               // JavaScript del navegador no puede leer la cookie
    secure: config.isProd,        // solo por HTTPS en producción
    sameSite: 'strict',           // no se envía desde otros sitios (CSRF)
    maxAge: config.sessionMaxAgeMs,
    path: '/',
  },
}));

app.use(provideToken);
app.use(loadUser);
app.use((req, res, next) => {
  res.locals.site = site;
  res.locals.path = req.path;
  res.locals.nav = '';
  next();
});

app.use('/', require('./src/routes/public'));
app.use('/admin', require('./src/routes/admin'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
