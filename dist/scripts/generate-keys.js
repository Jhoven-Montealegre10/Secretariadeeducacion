"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Genera claves aleatorias para el archivo de entorno del servidor. Ejecutar: npm run generate-keys */
const node_crypto_1 = __importDefault(require("node:crypto"));
console.log('# Copie estas líneas en el gestor de secretos o en el archivo de entorno del servidor (NUNCA en Git).');
console.log(`SESSION_SECRET=${node_crypto_1.default.randomBytes(48).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEY=${node_crypto_1.default.randomBytes(32).toString('base64')}`);
console.log('# Contraseñas de PostgreSQL (cuenta de la aplicación y cuenta de migraciones, distintas):');
console.log(`DB_PASSWORD=${node_crypto_1.default.randomBytes(24).toString('base64url')}`);
console.log(`DB_MIGRATION_PASSWORD=${node_crypto_1.default.randomBytes(24).toString('base64url')}`);
console.log('# IMPORTANTE: guarde una copia segura de DATA_ENCRYPTION_KEY, separada de las copias de la base de datos.');
//# sourceMappingURL=generate-keys.js.map