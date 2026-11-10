'use strict';
/** Carga contenido inicial (instituciones y noticias de ejemplo). Se puede ejecutar varias veces. */
const Institucion = require('../src/models/Institucion');
const Noticia = require('../src/models/Noticia');

const instituciones = [
  ['Institución Educativa San Simón', 'Urbana'],
  ['Institución Educativa Liceo Nacional', 'Urbana'],
  ['Escuela Normal Superior de Ibagué', 'Urbana'],
  ['Institución Educativa Técnica Musical Amina Melendro de Pulecio', 'Urbana'],
  ['Institución Educativa Técnica Ambiental Combeima', 'Urbana'],
];
let n = 0;
for (const [nombre, zona] of instituciones) n += Institucion.crear(nombre, zona);
console.log(`Instituciones nuevas: ${n}`);

if (Noticia.contar() === 0) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ejemplos = [
    ['Inscripciones para estudiantes nuevos en instituciones oficiales', 'Cobertura', 'Conozca el cronograma, los requisitos y los canales para solicitar cupo en los colegios oficiales de Ibagué.'],
    ['Consulte las circulares expedidas por la Secretaría', 'Normatividad', 'Directrices para rectores, docentes, directivos y personal administrativo de las instituciones educativas.'],
    ['Programas para el fortalecimiento de la calidad educativa', 'Calidad educativa', 'Formación docente, alimentación escolar, transporte y bienestar para la comunidad estudiantil.'],
  ];
  for (const [titulo, categoria, resumen] of ejemplos) {
    Noticia.crear({
      titulo, categoria, resumen, fecha_publicacion: hoy, publicada: true,
      contenido: `${resumen}\n\n[Contenido de ejemplo] Reemplace esta noticia desde el panel de administración (/admin/noticias).`,
    });
  }
  console.log('Noticias de ejemplo creadas: 3');
}
