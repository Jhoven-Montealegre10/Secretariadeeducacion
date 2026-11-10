"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordHasher = void 0;
/**
 * Argon2id (biblioteca `argon2`, sal aleatoria única por hash; m=64 MiB, t=3, p=1, por encima del
 * mínimo de OWASP). Los hashes scrypt de la versión anterior se verifican y se reemplazan por
 * Argon2id en el siguiente inicio de sesión correcto.
 */
const node_crypto_1 = __importDefault(require("node:crypto"));
const common_1 = require("@nestjs/common");
const argon2_1 = __importDefault(require("argon2"));
const OPTIONS = { type: argon2_1.default.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
const LEGACY_SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
let PasswordHasher = class PasswordHasher {
    dummyHash = null;
    hash(password) {
        return argon2_1.default.hash(String(password), OPTIONS);
    }
    async verify(password, stored) {
        const value = String(stored ?? '');
        try {
            if (value.startsWith('$argon2'))
                return await argon2_1.default.verify(value, String(password));
            if (value.startsWith('scrypt$'))
                return this.verifyLegacyScrypt(password, value);
        }
        catch {
            return false;
        }
        return false;
    }
    needsRehash(stored) {
        return !stored.startsWith('$argon2id$') || argon2_1.default.needsRehash(stored, OPTIONS);
    }
    /** Gasta el mismo tiempo cuando el usuario no existe (evita la enumeración por tiempos). */
    async verifyDummy(password) {
        this.dummyHash ??= await this.hash(node_crypto_1.default.randomBytes(16).toString('hex'));
        await this.verify(password, this.dummyHash);
        return false;
    }
    verifyLegacyScrypt(password, stored) {
        const [, salt, digest] = stored.split('$');
        if (!salt || !digest)
            return false;
        const expected = Buffer.from(digest, 'base64');
        const actual = node_crypto_1.default.scryptSync(String(password), Buffer.from(salt, 'base64'), expected.length, LEGACY_SCRYPT);
        return node_crypto_1.default.timingSafeEqual(expected, actual);
    }
};
exports.PasswordHasher = PasswordHasher;
exports.PasswordHasher = PasswordHasher = __decorate([
    (0, common_1.Injectable)()
], PasswordHasher);
//# sourceMappingURL=password-hasher.service.js.map