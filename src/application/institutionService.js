'use strict';
/** Directorio de instituciones educativas (lectura pública). */
function createInstitutionService({ institutionRepository }) {
  return {
    list(q = '') {
      return institutionRepository.list(String(q).slice(0, 80));
    },
  };
}

module.exports = { createInstitutionService };
