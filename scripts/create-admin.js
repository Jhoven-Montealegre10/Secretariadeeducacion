'use strict';
/**
 * Crea el primer administrador (no existen usuarios ni contraseñas por defecto):
 *   npm run create-admin
 * La contraseña se escribe oculta y debe cumplir la política (≥ 12 caracteres, no común).
 * En el primer ingreso el sistema exigirá configurar el segundo factor (TOTP).
 */
const readline = require('node:readline');
const { migrate } = require('../src/infrastructure/database/migrator');

migrate();
const services = require('../src/container');
const userRepository = require('../src/infrastructure/repositories/userRepository');
const roleRepository = require('../src/infrastructure/repositories/roleRepository');
const passwordHasher = require('../src/infrastructure/security/passwordHasher');

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    // Oculta lo que se escribe (API interna de readline, sin dependencias externas).
    if (hidden)
      /** @type {any} */ (rl)._writeToOutput = (s) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const email = (await ask('Correo institucional: ')).trim().toLowerCase();
  const nombre = (await ask('Nombre completo: ')).trim();
  const password = await ask('Contraseña (mínimo 12 caracteres, no común): ', true);
  const confirmar = await ask('Confirmar contraseña: ', true);
  try {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Correo inválido.');
    if (nombre.length < 3) throw new Error('Nombre demasiado corto.');
    if (password !== confirmar) throw new Error('Las contraseñas no coinciden.');
    services.authService.checkPolicy(password, { email, nombre });
    if (userRepository.findByEmail(email)) throw new Error('Ya existe un usuario con ese correo.');
    const role = roleRepository.findBySlug('administrador');
    const id = userRepository.create({ email, nombre, passwordHash: await passwordHasher.hash(password), rolId: role.id });
    services.audit.record({ email, accion: 'usuario_crear', recurso: 'usuario', recursoId: id, detalle: 'administrador creado por consola' });
    console.log(`Administrador ${email} creado. En el primer ingreso deberá configurar el segundo factor.`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
})();
