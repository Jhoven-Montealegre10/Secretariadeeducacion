"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Crea el primer administrador (no existen usuarios ni contraseñas por defecto):
 *   npm run create-admin
 * La contraseña se escribe oculta y debe cumplir la política (≥ 12 caracteres, no común).
 * En el primer ingreso el sistema exigirá configurar el segundo factor (TOTP).
 * Para automatización (CI, pruebas): ADMIN_EMAIL, ADMIN_NOMBRE y ADMIN_PASSWORD por entorno.
 */
const node_readline_1 = __importDefault(require("node:readline"));
const audit_service_1 = require("../src/application/audit.service");
const auth_service_1 = require("../src/application/auth.service");
const identity_repositories_1 = require("../src/infrastructure/repositories/identity.repositories");
const password_hasher_service_1 = require("../src/infrastructure/security/password-hasher.service");
const cli_context_1 = require("./cli-context");
function ask(question, hidden = false) {
    return new Promise((resolve) => {
        const rl = node_readline_1.default.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        if (hidden) {
            rl._writeToOutput = (s) => {
                if (s.includes(question))
                    process.stdout.write(s);
            };
        }
        rl.question(question, (answer) => {
            rl.close();
            if (hidden)
                process.stdout.write('\n');
            resolve(answer);
        });
    });
}
async function main() {
    const email = (process.env.ADMIN_EMAIL ?? (await ask('Correo institucional: '))).trim().toLowerCase();
    const nombre = (process.env.ADMIN_NOMBRE ?? (await ask('Nombre completo: '))).trim();
    const password = process.env.ADMIN_PASSWORD ?? (await ask('Contraseña (mínimo 12 caracteres, no común): ', true));
    const confirmar = process.env.ADMIN_PASSWORD ?? (await ask('Confirmar contraseña: ', true));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new Error('Correo inválido.');
    if (nombre.length < 3)
        throw new Error('Nombre demasiado corto.');
    if (password !== confirmar)
        throw new Error('Las contraseñas no coinciden.');
    await (0, cli_context_1.withApp)(async (app) => {
        app.get(auth_service_1.AuthService).checkPolicy(password, { email, nombre });
        const users = app.get(identity_repositories_1.UserRepository);
        if (await users.findByEmail(email))
            throw new Error('Ya existe un usuario con ese correo.');
        const role = await app.get(identity_repositories_1.RoleRepository).findBySlug('administrador');
        if (!role)
            throw new Error('No existe el rol administrador: ejecute las migraciones.');
        const id = await users.create({ email, nombre, passwordHash: await app.get(password_hasher_service_1.PasswordHasher).hash(password), rolId: role.id });
        await app.get(audit_service_1.AuditService).record({ email, accion: 'usuario_crear', recurso: 'usuario', recursoId: id, detalle: 'administrador creado por consola' });
    });
    console.log(`Administrador ${email} creado. En el primer ingreso deberá configurar el segundo factor.`);
}
main().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
//# sourceMappingURL=create-admin.js.map