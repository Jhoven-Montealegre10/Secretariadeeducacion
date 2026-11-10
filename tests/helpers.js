'use strict';
/**
 * Utilidades de prueba. Cada archivo de prueba corre en su propio proceso con una base de
 * datos en memoria y carpetas temporales: nunca toca datos reales ni producción.
 * Todos los datos son ficticios.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sem-test-'));
process.env.NODE_ENV = 'test';
process.env.MEDIA_DIR = path.join(tmp, 'media');
process.env.UPLOADS_DIR = path.join(tmp, 'uploads');
process.env.STORAGE_DIR = tmp;

const request = require('supertest');
const app = require('../app');
const { db } = require('../src/infrastructure/database/connection');
const userRepository = require('../src/infrastructure/repositories/userRepository');
const roleRepository = require('../src/infrastructure/repositories/roleRepository');
const passwordHasher = require('../src/infrastructure/security/passwordHasher');
const totp = require('../src/infrastructure/security/totp');
const { encrypt } = require('../src/infrastructure/security/crypto');
const mailer = require('../src/infrastructure/mail/mailer');

const PASSWORD = 'cometa verde sobre el nevado del tolima';

/** Crea un usuario con segundo factor ya configurado. Devuelve sus datos y su secreto TOTP. */
async function createUser({ email, nombre = 'Usuario de Prueba', rol = 'editor', password = PASSWORD, mfa = true }) {
  const role = roleRepository.findBySlug(rol);
  const id = userRepository.create({ email, nombre, passwordHash: await passwordHasher.hash(password), rolId: role.id });
  const secret = totp.createSecret();
  if (mfa) userRepository.setMfa(id, { secretoEnc: encrypt(secret), activo: true });
  return { id, email, password, secret };
}

async function csrf(agent) {
  const res = await agent.get('/api/v1/auth/csrf');
  return res.body.data.csrfToken;
}

/** Inicio de sesión completo (contraseña + TOTP). Devuelve un agente con sesión y su token CSRF. */
async function login(user) {
  const agent = request.agent(app);
  let token = await csrf(agent);
  const r1 = await agent.post('/api/v1/auth/login').set('X-CSRF-Token', token).send({ email: user.email, password: user.password });
  if (r1.status !== 200) throw new Error(`login ${r1.status}: ${JSON.stringify(r1.body)}`);
  token = r1.body.data.csrfToken;
  db.prepare('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE id = ?').run(user.id); // permite reutilizar el mismo minuto en pruebas
  const r2 = await agent
    .post('/api/v1/auth/mfa/verificar')
    .set('X-CSRF-Token', token)
    .send({ codigo: totp.generate(user.secret) });
  if (r2.status !== 200) throw new Error(`mfa ${r2.status}: ${JSON.stringify(r2.body)}`);
  agent.csrf = r2.body.data.csrfToken;
  return agent;
}

/** Atajos que agregan la cabecera CSRF a las peticiones que modifican datos. */
function call(agent, method, url, body) {
  const req = agent[method](url).set('Accept', 'application/json');
  if (method !== 'get') req.set('X-CSRF-Token', agent.csrf || 'sin-token');
  return body === undefined ? req : req.send(body);
}

/** Imagen PNG real generada con sharp (con metadatos EXIF para comprobar que se eliminan). */
async function pngBuffer({ width = 40, height = 30, exif = false } = {}) {
  const sharp = require('sharp');
  let img = sharp({ create: { width, height, channels: 3, background: '#3366cc' } }).png();
  if (exif) img = img.withExif({ IFD0: { Copyright: 'GPS-SECRETO-DE-PRUEBA' } });
  return img.toBuffer();
}

async function jpegBuffer({ exif = false } = {}) {
  const sharp = require('sharp');
  let img = sharp({ create: { width: 60, height: 40, channels: 3, background: '#004884' } }).jpeg();
  if (exif) img = img.withExif({ IFD0: { Copyright: 'GPS-SECRETO-DE-PRUEBA' } });
  return img.toBuffer();
}

module.exports = { app, request, db, createUser, login, call, csrf, totp, mailer, pngBuffer, jpegBuffer, PASSWORD, userRepository, roleRepository };
