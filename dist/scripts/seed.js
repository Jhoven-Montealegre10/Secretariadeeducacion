"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Carga datos de referencia (instituciones educativas). No crea noticias ni contenidos de
 * ejemplo: el contenido real se publica desde el panel. Se puede ejecutar varias veces.
 */
const content_repositories_1 = require("../src/infrastructure/repositories/content.repositories");
const cli_context_1 = require("./cli-context");
const INSTITUCIONES = [
    ['Institución Educativa San Simón', 'Urbana'],
    ['Institución Educativa Liceo Nacional', 'Urbana'],
    ['Escuela Normal Superior de Ibagué', 'Urbana'],
    ['Institución Educativa Técnica Musical Amina Melendro de Pulecio', 'Urbana'],
    ['Institución Educativa Técnica Ambiental Combeima', 'Urbana'],
];
(0, cli_context_1.withApp)(async (app) => {
    const repo = app.get(content_repositories_1.InstitutionRepository);
    let n = 0;
    for (const [nombre, zona] of INSTITUCIONES)
        n += await repo.create(nombre, zona);
    console.log(`Instituciones nuevas: ${n}. Complete el directorio oficial antes de publicar.`);
}).catch((e) => {
    console.error(e.message);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map