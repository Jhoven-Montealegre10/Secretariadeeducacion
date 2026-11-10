"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.TotpService = void 0;
/** TOTP (RFC 6238) con `otpauth`: ±1 paso de 30 s y número de paso para impedir reutilizar códigos. */
const common_1 = require("@nestjs/common");
const OTPAuth = __importStar(require("otpauth"));
const qrcode_1 = __importDefault(require("qrcode"));
const configuration_1 = require("../../config/configuration");
const PERIOD = 30;
let TotpService = class TotpService {
    config;
    constructor(config) {
        this.config = config;
    }
    createSecret() {
        return new OTPAuth.Secret({ size: 20 }).base32;
    }
    build(secret, label = '') {
        return new OTPAuth.TOTP({ issuer: this.config.mfa.issuer, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secret) });
    }
    /** Número de paso de tiempo si el código es válido; null si no lo es. */
    verify(secret, code, now = Date.now()) {
        if (!/^\d{6}$/.test(String(code ?? '')))
            return null;
        const delta = this.build(secret).validate({ token: String(code), timestamp: now, window: 1 });
        return delta === null ? null : Math.floor(now / 1000 / PERIOD) + delta;
    }
    async enrollment(secret, accountLabel) {
        const uri = this.build(secret, accountLabel).toString();
        return { uri, qrDataUrl: await qrcode_1.default.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 220 }) };
    }
    /** Solo para pruebas automatizadas. */
    generate(secret, now = Date.now()) {
        return this.build(secret).generate({ timestamp: now });
    }
};
exports.TotpService = TotpService;
exports.TotpService = TotpService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(configuration_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object])
], TotpService);
//# sourceMappingURL=totp.service.js.map