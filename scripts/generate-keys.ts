/**
 * Genera valores aleatorios para DESARROLLO local. En servidores use el gestor de secretos o
 * `npm run secrets -- generar --dir <carpeta>`: en producción los secretos NO pueden ir en .env ni en el entorno.
 */
import crypto from 'node:crypto';
import { formatKeyring, newKeyId } from '../src/config/secrets';

console.log('# SOLO DESARROLLO. En servidores: npm run secrets -- generar --dir /etc/semibague/secretos (ver docs/SECRETOS.md).');
console.log(`SESSION_SECRETS=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`DATA_ENCRYPTION_KEYS=${formatKeyring([{ id: newKeyId(), key: crypto.randomBytes(32), retired: false }]).trim()}`);
console.log(`DB_PASSWORD=${crypto.randomBytes(24).toString('base64url')}`);
console.log(`DB_MIGRATION_PASSWORD=${crypto.randomBytes(24).toString('base64url')}`);
