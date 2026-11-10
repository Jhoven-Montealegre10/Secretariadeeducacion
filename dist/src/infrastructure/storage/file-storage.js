"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileStorage = void 0;
/**
 * Almacenamiento en disco FUERA de la carpeta pública: carpetas 0750, archivos 0640 (nunca
 * ejecutables) y nombres internos aleatorios. Solo se aceptan nombres con el formato generado,
 * lo que impide rutas como "../". Los archivos no se guardan en la base de datos.
 */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const NAME_RE = /^[a-f0-9]{32}(?:-t)?\.[a-z0-9]{2,4}$/;
class FileStorage {
    dir;
    constructor(dir) {
        this.dir = dir;
        node_fs_1.default.mkdirSync(dir, { recursive: true, mode: 0o750 });
    }
    newName(extension, { thumbnail = false } = {}) {
        return `${node_crypto_1.default.randomBytes(16).toString('hex')}${thumbnail ? '-t' : ''}.${extension}`;
    }
    resolve(name) {
        return NAME_RE.test(String(name)) ? node_path_1.default.join(this.dir, name) : null;
    }
    async save(name, buffer) {
        const file = this.resolve(name);
        if (!file)
            throw new Error('Nombre de archivo interno inválido');
        await node_fs_1.default.promises.writeFile(file, buffer, { mode: 0o640, flag: 'wx' });
        return name;
    }
    exists(name) {
        const file = this.resolve(name);
        return !!file && node_fs_1.default.existsSync(file);
    }
    async remove(name) {
        const file = name ? this.resolve(name) : null;
        if (file)
            await node_fs_1.default.promises.rm(file, { force: true });
    }
}
exports.FileStorage = FileStorage;
//# sourceMappingURL=file-storage.js.map