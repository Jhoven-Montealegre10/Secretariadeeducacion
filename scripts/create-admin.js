'use strict';
/**
 * Crea un usuario del panel. No existen usuarios ni contraseñas por defecto.
 *   npm run create-admin
 * La contraseña se escribe de forma oculta y nunca queda en el historial de la terminal.
 */
const readline = require('node:readline');
const Usuario = require('../src/models/Usuario');

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
  });
}

(async () => {
  const email = await ask('Correo institucional: ');
  const nombre = await ask('Nombre completo: ');
  const rolIn = (await ask('Rol (admin/editor) [admin]: ')) || 'admin';
  const password = await ask('Contraseña (mín. 12, mayúsculas, minúsculas y números): ', true);
  const confirmar = await ask('Confirmar contraseña: ', true);

  const errores = [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errores.push('Correo inválido.');
  if (nombre.length < 3) errores.push('Nombre demasiado corto.');
  if (!['admin', 'editor'].includes(rolIn)) errores.push('Rol inválido.');
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) errores.push('Contraseña débil.');
  if (password !== confirmar) errores.push('Las contraseñas no coinciden.');
  if (errores.length) { console.error(errores.join('\n')); process.exit(1); }

  try {
    Usuario.crear({ email, nombre, password, rol: rolIn });
    console.log(`Usuario ${email} creado con rol ${rolIn}.`);
  } catch (e) {
    console.error(/UNIQUE/.test(e.message) ? 'Ya existe un usuario con ese correo.' : e.message);
    process.exit(1);
  }
})();
