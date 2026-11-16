/** Utilidades de archivos para respaldo y migración: copia con verificación SHA-256. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface FileEntry {
  ruta: string;
  bytes: number;
  sha256: string;
}

export function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Lista los archivos de una carpeta (no recursivo: el almacenamiento usa una sola carpeta). */
export function manifest(dir: string): FileEntry[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => {
      const file = path.join(dir, d.name);
      return { ruta: d.name, bytes: fs.statSync(file).size, sha256: sha256File(file) };
    })
    .sort((a, b) => a.ruta.localeCompare(b.ruta));
}

/** Copia una carpeta conservando permisos restrictivos y verifica cada archivo copiado. */
export function copyVerified(from: string, to: string): FileEntry[] {
  fs.mkdirSync(to, { recursive: true, mode: 0o750 });
  const entries = manifest(from);
  for (const e of entries) {
    const dest = path.join(to, e.ruta);
    if (fs.existsSync(dest) && sha256File(dest) === e.sha256) continue;
    fs.copyFileSync(path.join(from, e.ruta), dest);
    fs.chmodSync(dest, 0o640);
    if (sha256File(dest) !== e.sha256) throw new Error(`La copia de ${e.ruta} no coincide (SHA-256).`);
  }
  return entries;
}

export function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

export const flag = (name: string): boolean => process.argv.includes(`--${name}`);
