'use strict';
/**
 * Carga datos de referencia (instituciones educativas). No crea noticias ni contenidos de
 * ejemplo: el contenido real se publica desde el panel. Se puede ejecutar varias veces.
 */
const { migrate } = require('../src/infrastructure/database/migrator');

migrate();
const institutionRepository = require('../src/infrastructure/repositories/institutionRepository');

const INSTITUCIONES = [
  ['Institución Educativa San Simón', 'Urbana'],
  ['Institución Educativa Liceo Nacional', 'Urbana'],
  ['Escuela Normal Superior de Ibagué', 'Urbana'],
  ['Institución Educativa Técnica Musical Amina Melendro de Pulecio', 'Urbana'],
  ['Institución Educativa Técnica Ambiental Combeima', 'Urbana'],
];
let n = 0;
for (const [nombre, zona] of INSTITUCIONES) n += Number(institutionRepository.create(nombre, zona));
console.log(`Instituciones nuevas: ${n}. Complete el directorio oficial antes de publicar.`);
