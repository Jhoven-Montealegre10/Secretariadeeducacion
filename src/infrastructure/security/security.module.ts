import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { PasswordHasher } from './password-hasher.service';
import { TotpService } from './totp.service';
import { HtmlSanitizer } from './html-sanitizer.service';
import { PasswordStrength } from './password-strength.service';

@Global()
@Module({
  providers: [CryptoService, PasswordHasher, TotpService, HtmlSanitizer, PasswordStrength],
  exports: [CryptoService, PasswordHasher, TotpService, HtmlSanitizer, PasswordStrength],
})
export class SecurityModule {}
