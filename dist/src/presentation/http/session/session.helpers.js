"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientIp = exports.sessionCookieName = void 0;
exports.regenerate = regenerate;
exports.save = save;
exports.destroy = destroy;
exports.establish = establish;
exports.valid = valid;
const sessionCookieName = (isProd) => (isProd ? '__Host-sem.sid' : 'sem.sid');
exports.sessionCookieName = sessionCookieName;
function regenerate(req) {
    return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}
function save(req) {
    return new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
}
function destroy(req, res, isProd) {
    return new Promise((resolve) => {
        if (!req.session)
            return resolve();
        req.session.destroy(() => {
            res.clearCookie((0, exports.sessionCookieName)(isProd), { path: '/', httpOnly: true, sameSite: 'strict', secure: isProd });
            resolve();
        });
    });
}
/** Marca la sesión como completamente autenticada, con un ID nuevo. */
async function establish(req, userId, authVersion) {
    await regenerate(req);
    req.session.auth = { userId, authVersion, loginAt: Date.now() };
    await save(req);
}
/** Entrada ya validada por el interceptor, con el tipo de salida del esquema. */
function valid(req, part, _schema) {
    return req.valid[part];
}
const clientIp = (req) => req.ip ?? null;
exports.clientIp = clientIp;
//# sourceMappingURL=session.helpers.js.map