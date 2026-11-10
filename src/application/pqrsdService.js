'use strict';
/** PQRSD: radicación y consulta ciudadana; gestión con permisos pqrsd.* (datos personales). */
const { authorize } = require('./authorization');
const { NotFoundError } = require('../domain/errors');

const TIPOS = Object.freeze(['Petición', 'Queja', 'Reclamo', 'Sugerencia', 'Denuncia', 'Solicitud de información']);
const TIPOS_DOCUMENTO = Object.freeze(['Cédula de ciudadanía', 'Tarjeta de identidad', 'Cédula de extranjería', 'Pasaporte', 'NIT', 'PPT']);
const ESTADOS = Object.freeze(['Radicada', 'En trámite', 'Respondida', 'Cerrada']);

function createPqrsdService({ pqrsdRepository, audit }) {
  return {
    TIPOS,
    TIPOS_DOCUMENTO,
    ESTADOS,

    file(data) {
      return pqrsdRepository.create(data);
    },

    /** Vista ciudadana: sin correo, teléfono ni documento. */
    lookup(radicado, documento) {
      const d = pqrsdRepository.findByRadicadoAndDocument(radicado, documento);
      if (!d) return null;
      return {
        radicado: d.radicado,
        tipo: d.tipo,
        estado: d.estado,
        asunto: d.asunto,
        respuesta: d.respuesta,
        creadoEn: d.creadoEn,
        actualizadoEn: d.actualizadoEn,
      };
    },

    list(actor, filters) {
      authorize(actor, 'pqrsd.read');
      return pqrsdRepository.list(filters);
    },

    get(actor, id, ip) {
      authorize(actor, 'pqrsd.read');
      const d = pqrsdRepository.findById(id);
      if (!d) throw new NotFoundError('La solicitud no existe.');
      audit.record({ actor, accion: 'pqrsd_ver', recurso: 'pqrsd', recursoId: d.radicado, ip }); // cada acceso a datos personales queda registrado
      return d;
    },

    respond(actor, id, { estado, respuesta }, ip) {
      authorize(actor, 'pqrsd.respond');
      const d = pqrsdRepository.findById(id);
      if (!d) throw new NotFoundError('La solicitud no existe.');
      pqrsdRepository.respond(id, estado, respuesta);
      audit.record({ actor, accion: 'pqrsd_responder', recurso: 'pqrsd', recursoId: d.radicado, detalle: `${d.estado} → ${estado}`, ip });
      return pqrsdRepository.findById(id);
    },

    countByStatus() {
      return pqrsdRepository.countByStatus();
    },
  };
}

module.exports = { createPqrsdService, TIPOS, TIPOS_DOCUMENTO, ESTADOS };
