/**
 * Respaldo verificado de la base SQLite y de los archivos ANTES de migrar (no modifica el origen):
 *   npm run backup:sqlite -- --sqlite /var/lib/semibague/semibague.sqlite \
 *     --media /var/lib/semibague/media --uploads /var/lib/semibague/uploads --destino /respaldos
 * Genera <destino>/respaldo-AAAAMMDD-HHMMSS/ con:
 *   semibague.sqlite (copia consistente con VACUUM INTO), media/, uploads/ y manifiesto.json (SHA-256).
 * Y verifica la RESTAURACIÓN: abre la copia, ejecuta PRAGMA integrity_check, compara el número de
 * filas de cada tabla con el origen y comprueba el hash de cada archivo copiado.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { arg, copyVerified, manifest, sha256File } from './archivos';

function counts(db: DatabaseSync): Record<string, number> {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>;
  return Object.fromEntries(
    tables.map(({ name }) => [name, Number((db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '')}"`).get() as { n: number }).n)]),
  );
}

function main(): void {
  const sqlite = arg('sqlite');
  const destino = arg('destino');
  if (!sqlite || !destino) throw new Error('Uso: --sqlite <archivo> --destino <carpeta> [--media <carpeta>] [--uploads <carpeta>]');
  const media = arg('media', path.join(path.dirname(sqlite), 'media')) as string;
  const uploads = arg('uploads', path.join(path.dirname(sqlite), 'uploads')) as string;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const out = path.join(destino, `respaldo-${stamp}`);
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });

  const source = new DatabaseSync(sqlite, { readOnly: true });
  const sourceCounts = counts(source);
  const backupFile = path.join(out, 'semibague.sqlite');
  source.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
  source.close();
  fs.chmodSync(backupFile, 0o600);

  const mediaFiles = copyVerified(media, path.join(out, 'media'));
  const uploadFiles = copyVerified(uploads, path.join(out, 'uploads'));

  // --- Verificación de restauración ---
  const restored = new DatabaseSync(backupFile, { readOnly: true });
  const integrity = (restored.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check;
  const restoredCounts = counts(restored);
  restored.close();
  const diffs = Object.keys(sourceCounts).filter((t) => sourceCounts[t] !== restoredCounts[t]);
  const mediaOk = JSON.stringify(manifest(path.join(out, 'media'))) === JSON.stringify(mediaFiles);
  const uploadsOk = JSON.stringify(manifest(path.join(out, 'uploads'))) === JSON.stringify(uploadFiles);

  const report = {
    creadoEn: new Date().toISOString(),
    origen: { sqlite: path.resolve(sqlite), media: path.resolve(media), uploads: path.resolve(uploads) },
    sqlite: { archivo: 'semibague.sqlite', sha256: sha256File(backupFile), integridad: integrity, filas: sourceCounts },
    media: mediaFiles,
    uploads: uploadFiles,
    verificacion: {
      integridadSqlite: integrity === 'ok',
      filasCoinciden: diffs.length === 0,
      tablasDistintas: diffs,
      mediaCoincide: mediaOk,
      uploadsCoincide: uploadsOk,
    },
  };
  fs.writeFileSync(path.join(out, 'manifiesto.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  const ok = report.verificacion.integridadSqlite && report.verificacion.filasCoinciden && mediaOk && uploadsOk;
  console.log(`${ok ? '✓' : '✗'} Respaldo en ${out}`);
  console.log(`  SQLite: integridad=${integrity}, tablas=${Object.keys(sourceCounts).length}, filas=${Object.values(sourceCounts).reduce((a, b) => a + b, 0)}`);
  console.log(`  Archivos: media=${mediaFiles.length}, uploads=${uploadFiles.length} (SHA-256 verificado)`);
  if (!ok) process.exit(1);
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
