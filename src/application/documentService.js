'use strict';
/** Normatividad: circulares, resoluciones, decretos y acuerdos en PDF (documentos públicos). */
const path = require('node:path');
const { authorize } = require('./authorization');
const { NotFoundError, ValidationError, PayloadTooLargeError } = require('../domain/errors');

const TIPOS = Object.freeze({ circular: 'Circulares', resolucion: 'Resoluciones', decreto: 'Decretos', acuerdo: 'Acuerdos' });

function createDocumentService({ documentRepository, storage, fileTypeDetector, malwareScanner, maxBytes, audit, transaction }) {
  return {
    TIPOS,

    listPublic(filters = {}) {
      return documentRepository.list({ ...filters, pageSize: Math.min(filters.pageSize || 100, 100) });
    },

    groupedPublic() {
      return Object.entries(TIPOS).map(([tipo, nombre]) => ({ tipo, nombre, documentos: documentRepository.list({ tipo, pageSize: 100 }).items }));
    },

    list(actor, filters) {
      authorize(actor, 'documents.read');
      return documentRepository.list(filters);
    },

    async create(actor, data, file, ip) {
      authorize(actor, 'documents.create');
      if (!file) throw new ValidationError('Adjunte el documento en PDF.', [{ campo: 'archivo', mensaje: 'Requerido' }]);
      if (file.size > maxBytes) throw new PayloadTooLargeError('El PDF supera el máximo de 10 MB.');
      if (!fileTypeDetector.isPdf(file.buffer, file.originalname))
        throw new ValidationError('El archivo no es un PDF válido.', [{ campo: 'archivo', mensaje: 'No es PDF' }]);
      const scan = await malwareScanner.scan(file.buffer);
      if (!scan.limpio) throw new ValidationError('El archivo fue rechazado por el análisis antimalware.');
      const archivo = storage.save(storage.newName('pdf'), file.buffer);
      try {
        return transaction(() => {
          const id = documentRepository.create(
            { ...data, archivo, nombreOriginal: path.basename(String(file.originalname)).slice(0, 120), tamano: file.size },
            actor.id,
          );
          audit.record({ actor, accion: 'documento_crear', recurso: 'documento', recursoId: id, detalle: `${data.tipo} ${data.numero}/${data.anio}`, ip });
          return documentRepository.findById(id);
        });
      } catch (err) {
        storage.remove(archivo);
        throw err;
      }
    },

    remove(actor, id, ip) {
      authorize(actor, 'documents.delete');
      const doc = documentRepository.findById(id);
      if (!doc) throw new NotFoundError('El documento no existe.');
      transaction(() => {
        documentRepository.delete(id);
        audit.record({ actor, accion: 'documento_eliminar', recurso: 'documento', recursoId: id, detalle: `${doc.tipo} ${doc.numero}/${doc.anio}`, ip });
      });
      storage.remove(doc.archivo);
    },

    /** Archivo para descarga pública: se busca por ID, nunca por una ruta enviada por el usuario. */
    file(id) {
      const doc = documentRepository.findById(id);
      if (!doc || !storage.exists(doc.archivo)) return null;
      return { path: storage.path(doc.archivo), nombre: `${doc.tipo}-${doc.numero}-${doc.anio}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_') };
    },

    count() {
      return documentRepository.count();
    },
  };
}

module.exports = { createDocumentService, TIPOS };
