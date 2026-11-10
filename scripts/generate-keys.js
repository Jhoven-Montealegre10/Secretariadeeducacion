'use strict';
/** Genera claves aleatorias para el archivo .env del servidor. Ejecutar: npm run generate-keys */
const crypto = require('node:crypto');

console.log('# Copie estas líneas en el archivo .env del servidor (NUNCA lo suba a Git).');
console.log(`SESSION_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`);
console.log('# IMPORTANTE: guarde una copia segura de DATA_ENCRYPTION_KEY. Si se pierde, las PQRSD cifradas no se podrán leer.');
