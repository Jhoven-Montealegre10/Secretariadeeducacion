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
exports.CryptoService = void 0;
/**
 * Primitivas criptográficas de `node:crypto` (sin implementaciones propias):
 *  - AES-256-GCM para datos personales y secretos MFA;
 *  - HMAC-SHA256 para tokens de alta entropía, índices ciegos, cadena de auditoría y estadísticas.
 * Cada propósito usa una clave derivada (HKDF) de DATA_ENCRYPTION_KEY.
 */
const node_crypto_1 = __importDefault(require("node:crypto"));
const common_1 = require("@nestjs/common");
const configuration_1 = require("../../config/configuration");
const VERSION = 'v1';
let CryptoService = class CryptoService {
    keys;
    constructor(config) {
        const derive = (label) => Buffer.from(node_crypto_1.default.hkdfSync('sha256', config.dataKey, Buffer.alloc(0), label, 32));
        this.keys = {
            encryption: derive('sem-encryption'),
            blindIndex: derive('sem-blind-index'),
            token: derive('sem-token'),
            audit: derive('sem-audit-chain'),
            stats: derive('sem-stats'),
        };
    }
    encrypt(plain) {
        if (plain === null || plain === undefined || plain === '')
            return null;
        const iv = node_crypto_1.default.randomBytes(12);
        const cipher = node_crypto_1.default.createCipheriv('aes-256-gcm', this.keys.encryption, iv);
        const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
        return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
    }
    decrypt(payload) {
        if (!payload)
            return '';
        const [version, iv, tag, data] = String(payload).split(':');
        if (version !== VERSION || !iv || !tag || !data)
            throw new Error('Formato de cifrado no soportado');
        const decipher = node_crypto_1.default.createDecipheriv('aes-256-gcm', this.keys.encryption, Buffer.from(iv, 'base64'));
        decipher.setAuthTag(Buffer.from(tag, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
    }
    hmac(key, value) {
        return node_crypto_1.default.createHmac('sha256', key).update(value).digest('hex');
    }
    blindIndex(value) {
        return this.hmac(this.keys.blindIndex, String(value).trim().toLowerCase());
    }
    tokenHash(value) {
        return this.hmac(this.keys.token, String(value));
    }
    auditChainHash(previous, row) {
        const canonical = JSON.stringify([
            row.usuarioId ?? null,
            row.usuarioEmail ?? null,
            row.accion,
            row.recurso ?? null,
            row.recursoId ?? null,
            row.resultado,
            row.detalle ?? null,
            row.ipHash ?? null,
            row.creadoEn,
        ]);
        return this.hmac(this.keys.audit, `${previous}|${canonical}`);
    }
    statsHash(salt, value) {
        return this.hmac(this.keys.stats, `${salt}|${value}`);
    }
    safeEqual(a, b) {
        const ba = Buffer.from(String(a));
        const bb = Buffer.from(String(b));
        return ba.length === bb.length && node_crypto_1.default.timingSafeEqual(ba, bb);
    }
    randomToken(bytes = 32) {
        return node_crypto_1.default.randomBytes(bytes).toString('base64url');
    }
};
exports.CryptoService = CryptoService;
exports.CryptoService = CryptoService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object])
], CryptoService);
//# sourceMappingURL=crypto.service.js.map