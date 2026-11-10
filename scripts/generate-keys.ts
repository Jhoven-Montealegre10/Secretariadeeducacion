/** Genera claves aleatorias para el archivo de entorno del servidor. Ejecutar: npm run generate-keys */
import crypto from 'node:crypto';

console.log('# Copie estas líneas en el gestor de secretos o en el archivo de entorno del servidor (NUNCA en Git).');
console.log(`SESSION_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`);
console.log('# Contraseñas de PostgreSQL (cuenta de la aplicación y cuenta de migraciones, distintas):');
console.log(`DB_PASSWORD=${crypto.randomBytes(24).toString('base64url')}`);
console.log(`DB_MIGRATION_PASSWORD=${crypto.randomBytes(24).toString('base64url')}`);
console.log('# IMPORTANTE: guarde una copia segura de DATA_ENCRYPTION_KEY, separada de las copias de la base de datos.');
