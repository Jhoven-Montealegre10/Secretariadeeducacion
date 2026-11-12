/**
 * Correo con nodemailer (SMTP_URL, software libre o servidor institucional). Sin SMTP:
 *  - desarrollo: el mensaje se guarda en storage/correo-desarrollo/ (no en los logs: puede llevar enlaces de recuperación);
 *  - producción: el envío falla de forma explícita;
 *  - pruebas: queda en `outbox` y nunca sale del proceso.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class Mailer {
  readonly outbox: MailMessage[] = [];
  private readonly transport: Transporter | null;
  private readonly logger = new Logger('Correo');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    // El correo exige siempre TLS (STARTTLS o smtps://) con versión mínima 1.2 y certificado válido: nunca en texto plano.
    this.transport = config.mail.smtpUrl
      ? nodemailer.createTransport({
          url: config.mail.smtpUrl,
          requireTLS: true,
          tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
        })
      : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (this.config.isTest) {
      this.outbox.push(message);
      return;
    }
    if (this.transport) {
      await this.transport.sendMail({ from: this.config.mail.from, ...message });
      return;
    }
    if (this.config.isProd) throw new Error('SMTP_URL no configurado: no se pueden enviar correos.');
    fs.mkdirSync(this.config.devMailDir, { recursive: true, mode: 0o700 });
    const file = path.join(this.config.devMailDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.txt`);
    fs.writeFileSync(file, `Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n`, { mode: 0o600 });
    this.logger.log(`Correo de desarrollo guardado en ${path.relative(this.config.root, file)}`);
  }
}

@Global()
@Module({ providers: [Mailer], exports: [Mailer] })
export class MailModule {}
