'use strict';
/**
 * Registro de auditoría: quién, cuándo, qué acción, sobre qué recurso y con qué resultado.
 * NUNCA recibe contraseñas, tokens, secretos MFA ni códigos: solo identificadores y textos cortos.
 */
const { authorize } = require('./authorization');

// Defensa adicional: si un detalle contiene algo con forma de secreto (código de 6 dígitos o
// token largo), se omite completo. Los servicios solo envían textos descriptivos.
const LOOKS_SECRET = /\b\d{6,}\b|[A-Za-z0-9_\-+/=]{24,}|\$argon2/;

function createAuditService({ auditRepository, hashIp }) {
  return {
    record({ actor = null, email = null, accion, recurso = null, recursoId = null, resultado = 'exito', detalle = '', ip = null }) {
      const safeDetail = LOOKS_SECRET.test(String(detalle)) ? '[detalle omitido]' : String(detalle).slice(0, 300);
      auditRepository.append({
        usuarioId: actor?.id ?? null,
        usuarioEmail: actor?.email ?? (email ? String(email).slice(0, 120) : null),
        accion,
        recurso,
        recursoId: recursoId === null ? null : String(recursoId),
        resultado,
        detalle: safeDetail,
        ipHash: ip ? hashIp(ip) : null,
      });
    },

    list(actor, filters) {
      authorize(actor, 'audit.read');
      return auditRepository.list(filters);
    },

    verify(actor) {
      authorize(actor, 'audit.read');
      return auditRepository.verifyChain();
    },
  };
}

module.exports = { createAuditService };
