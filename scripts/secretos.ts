/**
 * Gestión de secretos del portal (nunca imprime valores; solo identificadores y huellas SHA-256).
 *
 *   npm run secrets -- generar --dir <carpeta>     crea los archivos de secretos iniciales (0600)
 *   npm run secrets -- estado                      origen, edad y huella de cada clave; datos que dependen de cada una
 *   npm run secrets -- rotar-datos                 nueva clave de datos vigente + volver a cifrar (reinicie la app después)
 *   npm run secrets -- recifrar                    volver a cifrar con la clave vigente (repetible)
 *   npm run secrets -- retirar-datos <id>          retira una clave antigua cuando ya no cifra ningún dato
 *   npm run secrets -- rotar-sesion                nuevo secreto de sesión (conserva los 2 anteriores para no cerrar sesiones)
 *   npm run secrets -- rotar-bd [--migraciones]    nueva contraseña de PostgreSQL (la app la usa sin reiniciar)
 *
 * Los secretos se leen y escriben en los archivos que indique la configuración (NOMBRE_FILE o SECRETS_DIR).
 * Ver docs/SECRETOS.md.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { loadConfig } from '../src/config/configuration';
import { fingerprint, formatKeyring, keyCreatedAt, newKeyId, parseKeyring, parseSecretList, SecretSource, writeSecretFile } from '../src/config/secrets';
import { Db } from '../src/infrastructure/database/db.service';
import { connectionOptions } from '../src/infrastructure/database/data-source';
import { CryptoService } from '../src/infrastructure/security/crypto.service';
import { keyUsage, reencryptAll } from '../src/infrastructure/security/key-rotation';
import { withApp } from './cli-context';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const env = process.env;
const source = () => new SecretSource({ env, isProd: env.NODE_ENV === 'production' });

/** Archivo de un secreto (para rotarlo hay que poder reescribirlo). */
function secretFile(...names: string[]): { name: string; file: string } {
  for (const name of names) {
    const file = source().fileOf(name);
    if (file) return { name, file };
  }
  throw new Error(`${names[0]} no viene de un archivo (defina ${names[0]}_FILE o SECRETS_DIR). La rotación reescribe ese archivo.`);
}

function days(id: string): string {
  const c = keyCreatedAt(id);
  return c ? `${Math.floor((Date.now() - c.getTime()) / 86_400_000)} días` : 'sin fecha';
}

async function withDb<T>(fn: (db: Db, crypto: CryptoService) => Promise<T>): Promise<T> {
  return withApp(async (app) => fn(app.get(Db), app.get(CryptoService)));
}

async function generar(): Promise<void> {
  const dir = opt('dir');
  if (!dir || !path.isAbsolute(dir)) throw new Error('Indique --dir con una ruta absoluta (p. ej. /etc/semibague/secretos).');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const files: Record<string, string> = {
    SESSION_SECRETS: `${crypto.randomBytes(48).toString('base64url')}\n`,
    DATA_ENCRYPTION_KEYS: formatKeyring([{ id: newKeyId(), key: crypto.randomBytes(32), retired: false }]),
    DB_PASSWORD: `${crypto.randomBytes(24).toString('base64url')}\n`,
    DB_MIGRATION_PASSWORD: `${crypto.randomBytes(24).toString('base64url')}\n`,
  };
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    if (fs.existsSync(file)) {
      console.log(`· ${name}: ya existe, no se modifica.`);
      continue;
    }
    writeSecretFile(file, content);
    console.log(`✓ ${name}: creado (0600), huella ${fingerprint(content.trim())}.`);
  }
  console.log(`\nConfigure la aplicación con SECRETS_DIR=${dir} y guarde una copia de DATA_ENCRYPTION_KEYS fuera de los respaldos de la base de datos.`);
  console.log('Use DB_PASSWORD y DB_MIGRATION_PASSWORD al crear los roles (scripts/postgres/01-crear-roles-y-base.sql).');
}

async function estado(): Promise<void> {
  const config = loadConfig();
  console.log('Origen de cada secreto (nunca se muestra el valor):');
  for (const [name, origin] of Object.entries(config.secrets.origins)) console.log(`  ${name}: ${origin}`);
  console.log(`\nLlavero de datos (política: rotar cada ${config.secrets.maxAgeDays} días):`);
  const svc = new CryptoService(config);
  for (const k of svc.describeKeys()) {
    console.log(
      `  ${k.id}  huella ${k.fingerprint}  ${days(k.id)}${k.vigente ? '  ← vigente' : ''}${k.retirada ? '  (retirada: solo verifica auditoría)' : ''}`,
    );
  }
  console.log(
    `\nSecretos de sesión: ${config.sessionSecrets.length} (el primero firma). Huellas: ${config.sessionSecrets.map((s) => fingerprint(s)).join(', ')}`,
  );
  await withDb(async (db, crypto) => {
    const u = await keyUsage(db, crypto);
    console.log('\nDatos cifrados por clave:', JSON.stringify(u.cifrado));
    console.log('Eventos de auditoría por clave:', JSON.stringify(u.auditoria));
    console.log(`Códigos de recuperación sin usar: ${u.codigosRecuperacionSinUsar.length}`);
  });
}

async function rotarDatos(): Promise<void> {
  const { name, file } = secretFile('DATA_ENCRYPTION_KEYS', 'DATA_ENCRYPTION_KEY');
  const current = parseKeyring(source().reread(name, file), name);
  const id = newKeyId();
  if (current.some((k) => k.id === id)) throw new Error('Ya se creó una clave en este mismo minuto; espere y repita.');
  const next = [{ id, key: crypto.randomBytes(32), retired: false }, ...current];
  writeSecretFile(file, formatKeyring(next));
  console.log(`✓ Nueva clave de datos vigente ${id} (huella ${fingerprint(next[0].key)}). Las anteriores siguen descifrando.`);
  await recifrar();
  console.log('\nSiguientes pasos: reinicie la aplicación (cada instancia) para que cifre con la clave nueva y ejecute');
  console.log('de nuevo "npm run secrets -- recifrar" para incluir lo que se haya guardado mientras tanto.');
}

async function recifrar(): Promise<void> {
  await withDb(async (db, crypto) => {
    const r = await reencryptAll(db, crypto);
    console.log(`✓ Vuelto a cifrar con ${crypto.currentKeyId}: ${r.usuariosMfa} secretos MFA, ${r.pqrsd} PQRSD.`);
  });
}

async function retirarDatos(): Promise<void> {
  const target = args[1];
  if (!target) throw new Error('Indique el identificador de la clave a retirar.');
  const { name, file } = secretFile('DATA_ENCRYPTION_KEYS', 'DATA_ENCRYPTION_KEY');
  const keys = parseKeyring(source().reread(name, file), name);
  const idx = keys.findIndex((k) => k.id === target);
  if (idx < 0) throw new Error(`La clave ${target} no está en el llavero.`);
  if (keys.find((k) => !k.retired)?.id === target) throw new Error('No se puede retirar la clave vigente: rote primero (rotar-datos).');
  await withDb(async (db, crypto) => {
    const u = await keyUsage(db, crypto);
    // El formato anterior (v1) no dice con qué clave se cifró: debe volver a cifrarse antes de retirar cualquier clave.
    const pending = (u.cifrado[target] ?? 0) + (u.cifrado.v1 ?? 0);
    if (pending) throw new Error(`Todavía hay ${pending} datos cifrados con ${target}. Ejecute "npm run secrets -- recifrar" primero.`);
    // Los códigos de recuperación y los enlaces creados antes de la clave siguiente se firmaron con esta clave.
    const sucesora = keys
      .slice(0, idx)
      .filter((k) => !k.retired)
      .pop();
    const desde = sucesora ? keyCreatedAt(sucesora.id) : null;
    // El identificador de la clave tiene precisión de minutos: los códigos de ese mismo minuto también se
    // consideran firmados con la clave anterior (en la duda, se avisa).
    const limite = desde ? desde.getTime() + 60_000 : Number.POSITIVE_INFINITY;
    const antiguos = u.codigosRecuperacionSinUsar.filter((c) => new Date(c.creadoEn).getTime() < limite).length;
    if (antiguos && !flag('forzar')) {
      throw new Error(
        `${antiguos} códigos de recuperación sin usar se crearon con esta clave y dejarían de servir. Pida a esas personas ` +
          'que generen códigos nuevos en "Mi cuenta", o repita con --forzar (podrán seguir entrando con su aplicación autenticadora).',
      );
    }
  });
  keys[idx] = { ...keys[idx], retired: true };
  writeSecretFile(file, formatKeyring(keys));
  console.log(`✓ Clave ${target} retirada: ya no cifra ni descifra; se conserva solo para verificar la auditoría antigua.`);
  console.log('Reinicie la aplicación para aplicar el cambio.');
}

async function rotarSesion(): Promise<void> {
  const { name, file } = secretFile('SESSION_SECRETS', 'SESSION_SECRET');
  const current = parseSecretList(source().reread(name, file), name, 32);
  const next = [crypto.randomBytes(48).toString('base64url'), ...current].slice(0, 3);
  writeSecretFile(file, `${next.join('\n')}\n`);
  console.log(`✓ Nuevo secreto de sesión (huella ${fingerprint(next[0])}); se conservan ${next.length - 1} anteriores para no cerrar sesiones.`);
  console.log('Reinicie la aplicación para que firme con el nuevo secreto.');
}

async function rotarBd(): Promise<void> {
  const migr = flag('migraciones');
  const config = loadConfig();
  const role = migr ? config.db.migrationUser : config.db.user;
  const { name, file } = secretFile(migr ? 'DB_MIGRATION_PASSWORD' : 'DB_PASSWORD');
  const admin = source().resolve('DB_ADMIN_URL');
  if (!admin) throw new Error('Falta DB_ADMIN_URL (archivo de secreto con la conexión de un administrador de PostgreSQL que pueda cambiar contraseñas).');
  const password = crypto.randomBytes(24).toString('base64url');
  const c = new Client({ connectionString: admin.value, ssl: connectionOptions(config).ssl });
  await c.connect();
  try {
    await c.query(`ALTER ROLE ${c.escapeIdentifier(role)} PASSWORD ${c.escapeLiteral(password)}`);
  } finally {
    await c.end();
  }
  writeSecretFile(file, `${password}\n`);
  console.log(`✓ Contraseña de ${role} rotada (huella ${fingerprint(password)}) y guardada en ${name}.`);
  console.log('Las conexiones nuevas la usan de inmediato, sin reiniciar; las ya abiertas siguen válidas hasta cerrarse.');
}

const commands: Record<string, () => Promise<void>> = {
  generar,
  estado,
  'rotar-datos': rotarDatos,
  recifrar,
  'retirar-datos': retirarDatos,
  'rotar-sesion': rotarSesion,
  'rotar-bd': rotarBd,
};

const run = cmd ? commands[cmd] : undefined;
if (!run) {
  console.error(`Comandos: ${Object.keys(commands).join(', ')}. Ver docs/SECRETOS.md.`);
  process.exit(2);
}
run().catch((err: unknown) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
