/** TOTP (RFC 6238) con `otpauth`: ±1 paso de 30 s y número de paso para impedir reutilizar códigos. */
import { Inject, Injectable } from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { APP_CONFIG, type AppConfig } from '../../config/configuration';

const PERIOD = 30;

@Injectable()
export class TotpService {
  constructor(@Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'mfa'>) {}

  createSecret(): string {
    return new OTPAuth.Secret({ size: 20 }).base32;
  }

  private build(secret: string, label = ''): OTPAuth.TOTP {
    return new OTPAuth.TOTP({ issuer: this.config.mfa.issuer, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secret) });
  }

  /** Número de paso de tiempo si el código es válido; null si no lo es. */
  verify(secret: string, code: string | undefined, now = Date.now()): number | null {
    if (!/^\d{6}$/.test(String(code ?? ''))) return null;
    const delta = this.build(secret).validate({ token: String(code), timestamp: now, window: 1 });
    return delta === null ? null : Math.floor(now / 1000 / PERIOD) + delta;
  }

  async enrollment(secret: string, accountLabel: string): Promise<{ uri: string; qrDataUrl: string }> {
    const uri = this.build(secret, accountLabel).toString();
    return { uri, qrDataUrl: await QRCode.toDataURL(uri, { errorCorrectionLevel: 'M', margin: 1, width: 220 }) };
  }

  /** Solo para pruebas automatizadas. */
  generate(secret: string, now = Date.now()): string {
    return this.build(secret).generate({ timestamp: now });
  }
}
