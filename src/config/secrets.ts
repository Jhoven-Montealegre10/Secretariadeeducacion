/**
 * Lectura de secretos (contraseñas, claves de cifrado, URL de SMTP con credenciales).
 *
 * Los secretos NO viven en el código, en Git ni en el archivo .env de producción: los entrega un gestor de
 * secretos (HashiCorp Vault, AWS/Azure/GCP Secrets Manager, secretos de Docker o Kubernetes, credenciales
 * de systemd) como ARCHIVOS de solo lectura. Orden de búsqueda para un secreto NOMBRE:
 *   1. NOMBRE_FILE              ruta absoluta a un archivo (p. ej. /run/secrets/db_password);
 *   2. SECRETS_DIR/NOMBRE       carpeta de secretos montada por el gestor (también en minúsculas);
 *   3. CREDENTIALS_DIRECTORY    carpeta que crea systemd con LoadCredential=;
 *   4. variable NOMBRE          SOLO en desarrollo y pruebas. En producción el arranque falla.
 *
 * Los archivos se vuelven a leer cuando cambian (contraseña de la base de datos dinámica: el gestor la
 * rota y la aplicación la usa en la siguiente conexión, sin reiniciar).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface SecretSourceOptions {
  env: NodeJS.ProcessEnv;
  isProd: boolean;
  /** Avisos no fatales (permisos amplios, etc.). */
  warn?: (message: string) => void;
}

export interface ResolvedSecret {
  /** Valor actual (sin salto de línea final). */
  value: string;
  /** De dónde salió, para el diagnóstico (nunca incluye el valor). */
  origin: string;
  /** Ruta del archivo, si salió de uno: permite releerlo. */
  file: string | null;
}

export class SecretError extends Error {}

export class SecretSource {
  private readonly env: NodeJS.ProcessEnv;
  private readonly isProd: boolean;
  private readonly warn: (message: string) => void;
  private readonly cache = new Map<string, { mtimeMs: number; value: string }>();

  constructor({ env, isProd, warn }: SecretSourceOptions) {
    this.env = env;
    this.isProd = isProd;
    this.warn = warn ?? ((m) => console.warn(`[secretos] ${m}`));
  }

  /** Devuelve el secreto o null si no existe en ninguna fuente. Lanza SecretError si la fuente no es válida. */
  resolve(name: string): ResolvedSecret | null {
    const file = this.locate(name);
    if (file) return { value: this.readFile(name, file), origin: `archivo ${file}`, file };
    const fromEnv = this.env[name];
    if (fromEnv !== undefined && fromEnv !== '') {
      if (this.isProd) {
        throw new SecretError(
          `${name} está en una variable de entorno. En producción los secretos deben llegar como archivo ` +
            `(${name}_FILE, SECRETS_DIR o credenciales de systemd), nunca en el entorno ni en .env.`,
        );
      }
      return { value: fromEnv, origin: `variable ${name} (solo desarrollo/pruebas)`, file: null };
    }
    return null;
  }

  /** Ruta del archivo de un secreto (null si no viene de un archivo). La usa la herramienta de rotación. */
  fileOf(name: string): string | null {
    return this.locate(name);
  }

  /** Lee de nuevo el archivo solo si cambió (para secretos que el gestor rota en caliente). */
  reread(name: string, file: string): string {
    return this.readFile(name, file);
  }

  private locate(name: string): string | null {
    const explicit = this.env[`${name}_FILE`];
    if (explicit) {
      if (!path.isAbsolute(explicit)) throw new SecretError(`${name}_FILE debe ser una ruta absoluta.`);
      if (!fs.existsSync(explicit)) throw new SecretError(`${name}_FILE apunta a un archivo que no existe.`);
      return explicit;
    }
    for (const dir of [this.env.SECRETS_DIR, this.env.CREDENTIALS_DIRECTORY]) {
      if (!dir) continue;
      for (const candidate of [name, name.toLowerCase()]) {
        const p = path.join(dir, candidate);
        if (fs.existsSync(p)) return p;
      }
    }
    return null;
  }

  private readFile(name: string, file: string): string {
    const st = fs.statSync(file);
    const cached = this.cache.get(file);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.value;
    if (process.platform !== 'win32') {
      if (st.mode & 0o002)
        throw new SecretError(`El archivo del secreto ${name} permite escritura a cualquier usuario (modo ${(st.mode & 0o777).toString(8)}).`);
      if (st.mode & 0o004) this.warn(`El archivo del secreto ${name} es legible por cualquier usuario del servidor; se recomienda 0400 o 0440.`);
    }
    const value = fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '');
    if (!value) throw new SecretError(`El archivo del secreto ${name} está vacío.`);
    this.cache.set(file, { mtimeMs: st.mtimeMs, value });
    return value;
  }
}

// ---------------------------------------------------------------- Llaveros (rotación)

/** Una clave con identificador. El identificador lleva la fecha de creación: kAAAAMMDDhhmm. */
export interface KeyEntry {
  id: string;
  key: Buffer;
  /** Retirada: ya no cifra ni descifra; solo se conserva para verificar la cadena de auditoría antigua. */
  retired: boolean;
}

const KEY_ID = /^[A-Za-z0-9_-]{1,32}$/;

/**
 * Llavero de claves de 32 bytes. Formato (una por línea, la PRIMERA activa es la vigente):
 *   k202611161200:BASE64_DE_32_BYTES
 *   k202608011000:BASE64_DE_32_BYTES:retirada
 * Una sola clave en base64, sin identificador (formato anterior), se acepta como "k0".
 */
export function parseKeyring(raw: string, name: string): KeyEntry[] {
  const lines = raw
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (!lines.length) throw new SecretError(`${name} no contiene claves.`);
  const entries = lines.map((line): KeyEntry => {
    const parts = line.split(':');
    const [id, b64, flag] = parts.length === 1 ? ['k0', parts[0], undefined] : parts;
    if (!KEY_ID.test(id)) throw new SecretError(`${name}: identificador de clave inválido.`);
    const key = Buffer.from(b64 ?? '', 'base64');
    if (key.length !== 32) throw new SecretError(`${name}: la clave ${id} debe tener 32 bytes en base64.`);
    if (flag !== undefined && flag !== 'retirada') throw new SecretError(`${name}: marca desconocida en la clave ${id}.`);
    return { id, key, retired: flag === 'retirada' };
  });
  const ids = new Set(entries.map((e) => e.id));
  if (ids.size !== entries.length) throw new SecretError(`${name}: hay identificadores de clave repetidos.`);
  if (!entries.some((e) => !e.retired)) throw new SecretError(`${name}: no hay ninguna clave activa.`);
  return entries;
}

export function formatKeyring(entries: KeyEntry[]): string {
  return entries.map((e) => `${e.id}:${e.key.toString('base64')}${e.retired ? ':retirada' : ''}`).join('\n') + '\n';
}

/** Llavero de secretos de texto (p. ej. de sesión): uno por línea, el primero firma y todos verifican. */
export function parseSecretList(raw: string, name: string, minLength: number): string[] {
  const list = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (!list.length) throw new SecretError(`${name} no contiene valores.`);
  for (const s of list) if (s.length < minLength) throw new SecretError(`${name}: cada valor debe tener al menos ${minLength} caracteres.`);
  return list;
}

/** Identificador nuevo con la fecha y hora (UTC) de creación. */
export function newKeyId(now = new Date()): string {
  return `k${now.toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;
}

/** Fecha de creación de una clave según su identificador (null si es del formato anterior). */
export function keyCreatedAt(id: string): Date | null {
  const m = /^k(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(id);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])) : null;
}

/**
 * Huella SHA-256 (primeros 16 caracteres hexadecimales) de un secreto: permite saber QUÉ clave está
 * desplegada y comparar servidores sin revelar el valor.
 */
export function fingerprint(value: Buffer | string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** Escribe un archivo de secreto de forma atómica y con permisos 0600 (no queda a medio escribir). */
export function writeSecretFile(file: string, content: string): void {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  fs.writeFileSync(tmp, content, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
