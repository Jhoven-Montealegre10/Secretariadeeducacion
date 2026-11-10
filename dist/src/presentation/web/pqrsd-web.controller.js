"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PqrsdWebController = void 0;
/** Formularios públicos de PQRSD (radicación y consulta), validados con esquemas Zod. */
const common_1 = require("@nestjs/common");
const zod_1 = require("zod");
const citizen_services_1 = require("../../application/citizen.services");
const route_spec_1 = require("../http/route-spec");
const headers_1 = require("../http/security/headers");
const session_helpers_1 = require("../http/session/session.helpers");
function details(error) {
    const out = {};
    for (const i of error.issues)
        out[String(i.path[0])] ||= i.message;
    return out;
}
const fileSchema = zod_1.z.object({
    tipo: zod_1.z.enum(citizen_services_1.TIPOS_PQRSD, { message: 'Seleccione un tipo de solicitud válido.' }),
    nombre: zod_1.z.string().trim().min(3, 'Nombre completo debe tener al menos 3 caracteres.').max(120, 'Nombre completo admite máximo 120 caracteres.'),
    tipoDocumento: zod_1.z.enum(citizen_services_1.TIPOS_IDENTIFICACION, { message: 'Seleccione un tipo de documento válido.' }),
    documento: zod_1.z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{4,20}$/, 'Número de documento debe tener entre 4 y 20 letras o números, sin puntos ni espacios.'),
    email: zod_1.z.string().trim().toLowerCase().email('Correo electrónico no es un correo válido.').max(254),
    telefono: zod_1.z
        .string()
        .trim()
        .regex(/^$|^[0-9+()\s-]{7,20}$/, 'Teléfono no es válido.')
        .default(''),
    asunto: zod_1.z.string().trim().min(5, 'Asunto debe tener al menos 5 caracteres.').max(150),
    mensaje: zod_1.z.string().trim().min(20, 'Descripción debe tener al menos 20 caracteres.').max(5000),
    acepto: zod_1.z.literal('on', { message: 'Debe aceptar la política de tratamiento de datos.' }),
});
const lookupSchema = zod_1.z.object({
    radicado: zod_1.z
        .string()
        .trim()
        .regex(/^SEM-\d{4}-\d{8}$/, 'Radicado debe tener el formato SEM-AAAA-00000000.'),
    documento: zod_1.z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{4,20}$/, 'Número de documento no es válido.'),
});
let PqrsdWebController = class PqrsdWebController {
    pqrsd;
    constructor(pqrsd) {
        this.pqrsd = pqrsd;
    }
    render(res, extra = {}, status = 200) {
        (0, headers_1.noStore)(res);
        res.status(status).render('pages/atencion', {
            title: 'Atención al ciudadano',
            nav: 'atencion',
            tipos: this.pqrsd.TIPOS,
            tiposDocumento: this.pqrsd.TIPOS_DOCUMENTO,
            form: {},
            errors: {},
            consulta: {},
            consultaErrors: {},
            resultado: null,
            ...extra,
        });
    }
    index(res) {
        res.locals.trackView = '/atencion';
        this.render(res);
    }
    async file(req, res) {
        const body = (req.body ?? {});
        if (body.sitio_web)
            return res.redirect(303, '/atencion'); // campo trampa anti-robots
        const input = { ...body, tipoDocumento: body.tipo_documento };
        const parsed = fileSchema.safeParse(input);
        if (!parsed.success) {
            const { documento: _omit, _csrf: _token, ...safe } = input; // nunca se devuelve el documento ni el token
            return this.render(res, { form: safe, errors: details(parsed.error) }, 422);
        }
        req.session.ultimoRadicado = await this.pqrsd.file(parsed.data);
        await (0, session_helpers_1.save)(req);
        res.redirect(303, '/atencion/pqrsd/confirmacion');
    }
    async confirmation(req, res) {
        (0, headers_1.noStore)(res);
        const radicado = req.session.ultimoRadicado;
        if (!radicado)
            return res.redirect('/atencion');
        delete req.session.ultimoRadicado;
        res.render('pages/pqrsd-confirmacion', { title: 'Solicitud radicada', nav: 'atencion', radicado });
    }
    async lookup(req, res) {
        const body = (req.body ?? {});
        const parsed = lookupSchema.safeParse(body);
        if (!parsed.success)
            return this.render(res, { consulta: { radicado: String(body.radicado ?? '').slice(0, 20) }, consultaErrors: details(parsed.error) }, 422);
        const resultado = await this.pqrsd.lookup(parsed.data.radicado, parsed.data.documento);
        if (!resultado)
            return this.render(res, { consulta: { radicado: parsed.data.radicado }, consultaErrors: { general: 'No encontramos una solicitud con esos datos.' } }, 404);
        this.render(res, { resultado });
    }
};
exports.PqrsdWebController = PqrsdWebController;
__decorate([
    (0, route_spec_1.WebRoute)('get', '/atencion', { auth: 'public' }),
    __param(0, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], PqrsdWebController.prototype, "index", null);
__decorate([
    (0, route_spec_1.WebRoute)('post', '/atencion/pqrsd', { auth: 'public', rateLimit: 'pqrsd', status: 303 }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PqrsdWebController.prototype, "file", null);
__decorate([
    (0, route_spec_1.WebRoute)('get', '/atencion/pqrsd/confirmacion', { auth: 'public' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PqrsdWebController.prototype, "confirmation", null);
__decorate([
    (0, route_spec_1.WebRoute)('post', '/atencion/consulta', { auth: 'public', rateLimit: 'consulta', status: 200 }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], PqrsdWebController.prototype, "lookup", null);
exports.PqrsdWebController = PqrsdWebController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [citizen_services_1.PqrsdService])
], PqrsdWebController);
//# sourceMappingURL=pqrsd-web.controller.js.map