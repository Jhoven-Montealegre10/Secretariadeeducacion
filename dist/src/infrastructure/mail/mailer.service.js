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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MailModule = exports.Mailer = void 0;
/**
 * Correo con nodemailer (SMTP_URL, software libre o servidor institucional). Sin SMTP:
 *  - desarrollo: el mensaje se guarda en storage/correo-desarrollo/ (no en los logs: puede llevar enlaces de recuperación);
 *  - producción: el envío falla de forma explícita;
 *  - pruebas: queda en `outbox` y nunca sale del proceso.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const common_1 = require("@nestjs/common");
const nodemailer_1 = __importDefault(require("nodemailer"));
const configuration_1 = require("../../config/configuration");
let Mailer = class Mailer {
    config;
    outbox = [];
    transport;
    logger = new common_1.Logger('Correo');
    constructor(config) {
        this.config = config;
        this.transport = config.mail.smtpUrl ? nodemailer_1.default.createTransport(config.mail.smtpUrl) : null;
    }
    async send(message) {
        if (this.config.isTest) {
            this.outbox.push(message);
            return;
        }
        if (this.transport) {
            await this.transport.sendMail({ from: this.config.mail.from, ...message });
            return;
        }
        if (this.config.isProd)
            throw new Error('SMTP_URL no configurado: no se pueden enviar correos.');
        node_fs_1.default.mkdirSync(this.config.devMailDir, { recursive: true, mode: 0o700 });
        const file = node_path_1.default.join(this.config.devMailDir, `${Date.now()}-${node_crypto_1.default.randomBytes(4).toString('hex')}.txt`);
        node_fs_1.default.writeFileSync(file, `Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n`, { mode: 0o600 });
        this.logger.log(`Correo de desarrollo guardado en ${node_path_1.default.relative(this.config.root, file)}`);
    }
};
exports.Mailer = Mailer;
exports.Mailer = Mailer = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object])
], Mailer);
let MailModule = class MailModule {
};
exports.MailModule = MailModule;
exports.MailModule = MailModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({ providers: [Mailer], exports: [Mailer] })
], MailModule);
//# sourceMappingURL=mailer.service.js.map