/**
 * Crea el primer administrador (no existen usuarios ni contraseñas por defecto):
 *   npm run create-admin
 * La contraseña se escribe oculta y debe cumplir la política (≥ 12 caracteres, no común).
 * En el primer ingreso el sistema exigirá configurar el segundo factor (TOTP).
 * Para automatización (CI, pruebas): ADMIN_EMAIL, ADMIN_NOMBRE y ADMIN_PASSWORD por entorno.
 */
import readline from 'node:readline';
import { AuditService } from '../src/application/audit.service';
import { AuthService } from '../src/application/auth.service';
import { RoleRepository, UserRepository } from '../src/infrastructure/repositories/identity.repositories';
import { PasswordHasher } from '../src/infrastructure/security/password-hasher.service';
import { withApp } from './cli-context';

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? (await ask('Correo institucional: '))).trim().toLowerCase();
  const nombre = (process.env.ADMIN_NOMBRE ?? (await ask('Nombre completo: '))).trim();
  const password = process.env.ADMIN_PASSWORD ?? (await ask('Contraseña (mínimo 12 caracteres, no común): ', true));
  const confirmar = process.env.ADMIN_PASSWORD ?? (await ask('Confirmar contraseña: ', true));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo inválido.');
  if (nombre.length < 3) throw new Error('Nombre demasiado corto.');
  if (password !== confirmar) throw new Error('Las contraseñas no coinciden.');
  await withApp(async (app) => {
    app.get(AuthService).checkPolicy(password, { email, nombre });
    const users = app.get(UserRepository);
    if (await users.findByEmail(email)) throw new Error('Ya existe un usuario con ese correo.');
    const role = await app.get(RoleRepository).findBySlug('administrador');
    if (!role) throw new Error('No existe el rol administrador: ejecute las migraciones.');
    const id = await users.create({ email, nombre, passwordHash: await app.get(PasswordHasher).hash(password), rolId: role.id });
    await app.get(AuditService).record({ email, accion: 'usuario_crear', recurso: 'usuario', recursoId: id, detalle: 'administrador creado por consola' });
  });
  console.log(`Administrador ${email} creado. En el primer ingreso deberá configurar el segundo factor.`);
}

main().catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
