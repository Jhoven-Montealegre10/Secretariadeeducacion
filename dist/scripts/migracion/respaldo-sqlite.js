"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Respaldo verificado de la base SQLite y de los archivos ANTES de migrar (no modifica el origen):
 *   npm run backup:sqlite -- --sqlite /var/lib/semibague/semibague.sqlite \
 *     --media /var/lib/semibague/media --uploads /var/lib/semibague/uploads --destino /respaldos
 * Genera <destino>/respaldo-AAAAMMDD-HHMMSS/ con:
 *   semibague.sqlite (copia consistente con VACUUM INTO), media/, uploads/ y manifiesto.json (SHA-256).
 * Y verifica la RESTAURACIÓN: abre la copia, ejecuta PRAGMA integrity_check, compara el número de
 * filas de cada tabla con el origen y comprueba el hash de cada archivo copiado.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const archivos_1 = require("./archivos");
function counts(db) {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
    return Object.fromEntries(tables.map(({ name }) => [name, Number(db.prepare(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '')}"`).get().n)]));
}
function main() {
    const sqlite = (0, archivos_1.arg)('sqlite');
    const destino = (0, archivos_1.arg)('destino');
    if (!sqlite || !destino)
        throw new Error('Uso: --sqlite <archivo> --destino <carpeta> [--media <carpeta>] [--uploads <carpeta>]');
    const media = (0, archivos_1.arg)('media', node_path_1.default.join(node_path_1.default.dirname(sqlite), 'media'));
    const uploads = (0, archivos_1.arg)('uploads', node_path_1.default.join(node_path_1.default.dirname(sqlite), 'uploads'));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const out = node_path_1.default.join(destino, `respaldo-${stamp}`);
    node_fs_1.default.mkdirSync(out, { recursive: true, mode: 0o700 });
    const source = new node_sqlite_1.DatabaseSync(sqlite, { readOnly: true });
    const sourceCounts = counts(source);
    const backupFile = node_path_1.default.join(out, 'semibague.sqlite');
    source.exec(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`);
    source.close();
    node_fs_1.default.chmodSync(backupFile, 0o600);
    const mediaFiles = (0, archivos_1.copyVerified)(media, node_path_1.default.join(out, 'media'));
    const uploadFiles = (0, archivos_1.copyVerified)(uploads, node_path_1.default.join(out, 'uploads'));
    // --- Verificación de restauración ---
    const restored = new node_sqlite_1.DatabaseSync(backupFile, { readOnly: true });
    const integrity = restored.prepare('PRAGMA integrity_check').get().integrity_check;
    const restoredCounts = counts(restored);
    restored.close();
    const diffs = Object.keys(sourceCounts).filter((t) => sourceCounts[t] !== restoredCounts[t]);
    const mediaOk = JSON.stringify((0, archivos_1.manifest)(node_path_1.default.join(out, 'media'))) === JSON.stringify(mediaFiles);
    const uploadsOk = JSON.stringify((0, archivos_1.manifest)(node_path_1.default.join(out, 'uploads'))) === JSON.stringify(uploadFiles);
    const report = {
        creadoEn: new Date().toISOString(),
        origen: { sqlite: node_path_1.default.resolve(sqlite), media: node_path_1.default.resolve(media), uploads: node_path_1.default.resolve(uploads) },
        sqlite: { archivo: 'semibague.sqlite', sha256: (0, archivos_1.sha256File)(backupFile), integridad: integrity, filas: sourceCounts },
        media: mediaFiles,
        uploads: uploadFiles,
        verificacion: { integridadSqlite: integrity === 'ok', filasCoinciden: diffs.length === 0, tablasDistintas: diffs, mediaCoincide: mediaOk, uploadsCoincide: uploadsOk },
    };
    node_fs_1.default.writeFileSync(node_path_1.default.join(out, 'manifiesto.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    const ok = report.verificacion.integridadSqlite && report.verificacion.filasCoinciden && mediaOk && uploadsOk;
    console.log(`${ok ? '✓' : '✗'} Respaldo en ${out}`);
    console.log(`  SQLite: integridad=${integrity}, tablas=${Object.keys(sourceCounts).length}, filas=${Object.values(sourceCounts).reduce((a, b) => a + b, 0)}`);
    console.log(`  Archivos: media=${mediaFiles.length}, uploads=${uploadFiles.length} (SHA-256 verificado)`);
    if (!ok)
        process.exit(1);
}
try {
    main();
}
catch (e) {
    console.error(e.message);
    process.exit(1);
}
//# sourceMappingURL=respaldo-sqlite.js.map