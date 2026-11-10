'use strict';
/**
 * Envío de correo con nodemailer (SMTP_URL). Sin SMTP configurado:
 *  - en desarrollo, el correo se guarda como archivo en storage/correo-desarrollo/ (no en los
 *    logs, porque puede contener enlaces de recuperación);
 *  - en producción, el envío falla de forma explícita.
 * En pruebas, los mensajes quedan en `outbox` y nunca salen del proceso.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const nodemailer = require('nodemailer');
const config = require('../../config');

const outbox = [];
const transport = config.mail.smtpUrl ? nodemailer.createTransport(config.mail.smtpUrl) : null;
const devDir = path.join(path.dirname(config.mediaDir), 'correo-desarrollo');

async function send({ to, subject, text }) {
  if (config.isTest) {
    outbox.push({ to, subject, text });
    return;
  }
  if (transport) {
    await transport.sendMail({ from: config.mail.from, to, subject, text });
    return;
  }
  if (config.isProd) throw new Error('SMTP_URL no configurado: no se pueden enviar correos.');
  fs.mkdirSync(devDir, { recursive: true, mode: 0o700 });
  const file = path.join(devDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`);
  fs.writeFileSync(file, `Para: ${to}\nAsunto: ${subject}\n\n${text}\n`, { mode: 0o600 });
  console.info(`[correo de desarrollo] mensaje guardado en ${path.relative(config.root, file)}`);
}

module.exports = { send, outbox };
