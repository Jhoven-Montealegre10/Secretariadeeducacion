/**
 * Carga datos de referencia (instituciones educativas). No crea noticias ni contenidos de
 * ejemplo: el contenido real se publica desde el panel. Se puede ejecutar varias veces.
 */
import { InstitutionRepository } from '../src/infrastructure/repositories/content.repositories';
import { withApp } from './cli-context';

const INSTITUCIONES: Array<[string, 'Urbana' | 'Rural']> = [
  ['Institución Educativa San Simón', 'Urbana'],
  ['Institución Educativa Liceo Nacional', 'Urbana'],
  ['Escuela Normal Superior de Ibagué', 'Urbana'],
  ['Institución Educativa Técnica Musical Amina Melendro de Pulecio', 'Urbana'],
  ['Institución Educativa Técnica Ambiental Combeima', 'Urbana'],
];

withApp(async (app) => {
  const repo = app.get(InstitutionRepository);
  let n = 0;
  for (const [nombre, zona] of INSTITUCIONES) n += await repo.create(nombre, zona);
  console.log(`Instituciones nuevas: ${n}. Complete el directorio oficial antes de publicar.`);
}).catch((e: unknown) => {
  console.error((e as Error).message);
  process.exit(1);
});
