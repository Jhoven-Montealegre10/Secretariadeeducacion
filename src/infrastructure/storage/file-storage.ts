/**
 * Almacenamiento en disco FUERA de la carpeta pública: carpetas 0750, archivos 0640 (nunca
 * ejecutables) y nombres internos aleatorios. Solo se aceptan nombres con el formato generado,
 * lo que impide rutas como "../". Los archivos no se guardan en la base de datos.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NAME_RE = /^[a-f0-9]{32}(?:-t)?\.[a-z0-9]{2,4}$/;

export class FileStorage {
  constructor(private readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  }

  newName(extension: string, { thumbnail = false } = {}): string {
    return `${crypto.randomBytes(16).toString('hex')}${thumbnail ? '-t' : ''}.${extension}`;
  }

  resolve(name: string): string | null {
    return NAME_RE.test(String(name)) ? path.join(this.dir, name) : null;
  }

  async save(name: string, buffer: Buffer): Promise<string> {
    const file = this.resolve(name);
    if (!file) throw new Error('Nombre de archivo interno inválido');
    await fs.promises.writeFile(file, buffer, { mode: 0o640, flag: 'wx' });
    return name;
  }

  exists(name: string): boolean {
    const file = this.resolve(name);
    return !!file && fs.existsSync(file);
  }

  async remove(name: string | null | undefined): Promise<void> {
    const file = name ? this.resolve(name) : null;
    if (file) await fs.promises.rm(file, { force: true });
  }
}
