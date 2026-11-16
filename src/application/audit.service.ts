/**
 * Registro de auditoría: quién, cuándo, qué acción, sobre qué recurso y con qué resultado.
 * NUNCA recibe contraseñas, tokens, secretos MFA ni códigos: solo identificadores y textos cortos.
 */
import { Injectable } from '@nestjs/common';
import type { Actor } from '../domain/permissions';
import { AuditRepository, type AuditFilters } from '../infrastructure/repositories/identity.repositories';
import { CryptoService } from '../infrastructure/security/crypto.service';
import { authorize } from './authorization';

// Defensa adicional: si un detalle parece un secreto (código de 6+ dígitos, token largo o hash
// de contraseña) se omite completo. Los servicios solo envían textos descriptivos.
const LOOKS_SECRET = /\b\d{6,}\b|[A-Za-z0-9_\-+/=]{24,}|\$argon2/;

export interface AuditInput {
  actor?: Pick<Actor, 'id' | 'email'> | { id: number; email: string } | null;
  email?: string | null;
  accion: string;
  recurso?: string | null;
  recursoId?: string | number | null;
  resultado?: 'exito' | 'fallo' | 'denegado';
  detalle?: string;
  ip?: string | null;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly repo: AuditRepository,
    private readonly crypto: CryptoService,
  ) {}

  static safeDetail(detalle: unknown): string {
    const text = String(detalle ?? '');
    return LOOKS_SECRET.test(text) ? '[detalle omitido]' : text.slice(0, 300);
  }

  async record(e: AuditInput): Promise<void> {
    await this.repo.append({
      usuarioId: e.actor?.id ?? null,
      usuarioEmail: e.actor?.email ?? (e.email ? String(e.email).slice(0, 120) : null),
      accion: e.accion,
      recurso: e.recurso ?? null,
      recursoId: e.recursoId === null || e.recursoId === undefined ? null : String(e.recursoId),
      resultado: e.resultado ?? 'exito',
      detalle: AuditService.safeDetail(e.detalle),
      // Misma derivación que la versión anterior: la IP nunca se guarda en claro.
      ipHash: e.ip ? this.crypto.statsHash('audit-ip', e.ip).slice(0, 16) : null,
    });
  }

  async list(actor: Actor | null, filters: AuditFilters) {
    authorize(actor, 'audit.read');
    return this.repo.list(filters);
  }

  async verify(actor: Actor | null) {
    authorize(actor, 'audit.read');
    return this.repo.verifyChain();
  }
}
