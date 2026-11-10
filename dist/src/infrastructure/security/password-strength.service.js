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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PasswordStrength = void 0;
/** Fortaleza de contraseñas con zxcvbn-ts: diccionarios de contraseñas comunes y filtradas, sin servicios externos. */
const common_1 = require("@nestjs/common");
const core_1 = require("@zxcvbn-ts/core");
const common = __importStar(require("@zxcvbn-ts/language-common"));
const PROPIAS = ['ibague', 'ibagué', 'tolima', 'semibague', 'secretaria', 'educacion', 'educación', 'alcaldia', 'colombia', 'gobierno'];
let PasswordStrength = class PasswordStrength {
    checker = new core_1.ZxcvbnFactory({ dictionary: { ...common.dictionary, userInputs: PROPIAS }, graphs: common.adjacencyGraphs });
    evaluate = (password, userInputs = []) => {
        const result = this.checker.check(String(password).slice(0, 128), userInputs.map(String));
        return { score: result.score };
    };
};
exports.PasswordStrength = PasswordStrength;
exports.PasswordStrength = PasswordStrength = __decorate([
    (0, common_1.Injectable)()
], PasswordStrength);
//# sourceMappingURL=password-strength.service.js.map