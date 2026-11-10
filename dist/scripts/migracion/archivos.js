"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.flag = void 0;
exports.sha256File = sha256File;
exports.manifest = manifest;
exports.copyVerified = copyVerified;
exports.arg = arg;
/** Utilidades de archivos para respaldo y migración: copia con verificación SHA-256. */
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function sha256File(file) {
    return node_crypto_1.default.createHash('sha256').update(node_fs_1.default.readFileSync(file)).digest('hex');
}
/** Lista los archivos de una carpeta (no recursivo: el almacenamiento usa una sola carpeta). */
function manifest(dir) {
    if (!node_fs_1.default.existsSync(dir))
        return [];
    return node_fs_1.default
        .readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => {
        const file = node_path_1.default.join(dir, d.name);
        return { ruta: d.name, bytes: node_fs_1.default.statSync(file).size, sha256: sha256File(file) };
    })
        .sort((a, b) => a.ruta.localeCompare(b.ruta));
}
/** Copia una carpeta conservando permisos restrictivos y verifica cada archivo copiado. */
function copyVerified(from, to) {
    node_fs_1.default.mkdirSync(to, { recursive: true, mode: 0o750 });
    const entries = manifest(from);
    for (const e of entries) {
        const dest = node_path_1.default.join(to, e.ruta);
        if (node_fs_1.default.existsSync(dest) && sha256File(dest) === e.sha256)
            continue;
        node_fs_1.default.copyFileSync(node_path_1.default.join(from, e.ruta), dest);
        node_fs_1.default.chmodSync(dest, 0o640);
        if (sha256File(dest) !== e.sha256)
            throw new Error(`La copia de ${e.ruta} no coincide (SHA-256).`);
    }
    return entries;
}
function arg(name, fallback) {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : fallback;
}
const flag = (name) => process.argv.includes(`--${name}`);
exports.flag = flag;
//# sourceMappingURL=archivos.js.map