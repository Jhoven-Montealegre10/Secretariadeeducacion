"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityModule = void 0;
const common_1 = require("@nestjs/common");
const crypto_service_1 = require("./crypto.service");
const password_hasher_service_1 = require("./password-hasher.service");
const totp_service_1 = require("./totp.service");
const html_sanitizer_service_1 = require("./html-sanitizer.service");
const password_strength_service_1 = require("./password-strength.service");
let SecurityModule = class SecurityModule {
};
exports.SecurityModule = SecurityModule;
exports.SecurityModule = SecurityModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        providers: [crypto_service_1.CryptoService, password_hasher_service_1.PasswordHasher, totp_service_1.TotpService, html_sanitizer_service_1.HtmlSanitizer, password_strength_service_1.PasswordStrength],
        exports: [crypto_service_1.CryptoService, password_hasher_service_1.PasswordHasher, totp_service_1.TotpService, html_sanitizer_service_1.HtmlSanitizer, password_strength_service_1.PasswordStrength],
    })
], SecurityModule);
//# sourceMappingURL=security.module.js.map