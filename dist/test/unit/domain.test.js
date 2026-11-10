"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/** Reglas de dominio: publicación, slugs, enlaces, bloques, contraseñas y permisos (sin base de datos). */
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const content_1 = require("../../src/domain/content");
const errors_1 = require("../../src/domain/errors");
const password_policy_1 = require("../../src/domain/password-policy");
const permissions_1 = require("../../src/domain/permissions");
const publication_1 = require("../../src/domain/publication");
(0, node_test_1.describe)('Estados de publicación', () => {
    (0, node_test_1.test)('una noticia solo es visible publicada y con fecha cumplida (hora de Colombia)', () => {
        strict_1.default.equal((0, publication_1.noticiaVisible)('publicada', '2026-11-10', '2026-11-10'), true);
        strict_1.default.equal((0, publication_1.noticiaVisible)('publicada', '2026-11-11', '2026-11-10'), false, 'fecha futura');
        strict_1.default.equal((0, publication_1.noticiaVisible)('borrador', '2026-01-01', '2026-11-10'), false, 'borrador');
    });
    (0, node_test_1.test)('fechaColombia usa UTC-5: a las 02:00 UTC todavía es el día anterior', () => {
        strict_1.default.equal((0, publication_1.fechaColombia)(Date.parse('2026-11-10T02:00:00Z')), '2026-11-09');
        strict_1.default.equal((0, publication_1.fechaColombia)(Date.parse('2026-11-10T05:00:00Z')), '2026-11-10');
    });
    (0, node_test_1.test)('publicar, despublicar o editar lo publicado exige permiso de publicación', () => {
        strict_1.default.equal((0, publication_1.requierePermisoPublicar)(null, 'borrador'), false);
        strict_1.default.equal((0, publication_1.requierePermisoPublicar)(null, 'publicada'), true);
        strict_1.default.equal((0, publication_1.requierePermisoPublicar)('publicada', 'borrador'), true, 'despublicar');
        strict_1.default.equal((0, publication_1.requierePermisoPublicar)('publicada', 'publicada'), true, 'editar algo publicado');
        strict_1.default.equal((0, publication_1.requierePermisoPublicar)('borrador', 'borrador'), false);
    });
    (0, node_test_1.test)('acción de auditoría según el cambio de estado', () => {
        strict_1.default.equal((0, publication_1.accionPublicacion)('pagina', null, 'borrador'), 'pagina_crear');
        strict_1.default.equal((0, publication_1.accionPublicacion)('pagina', 'borrador', 'publicada'), 'pagina_publicar');
        strict_1.default.equal((0, publication_1.accionPublicacion)('noticia', 'publicada', 'borrador'), 'noticia_despublicar');
        strict_1.default.equal((0, publication_1.accionPublicacion)('noticia', 'publicada', 'publicada'), 'noticia_editar');
    });
    (0, node_test_1.test)('bloqueo optimista: sin versión se acepta (compatibilidad); con versión debe coincidir', () => {
        strict_1.default.equal((0, publication_1.versionCoincide)(undefined, 7), true);
        strict_1.default.equal((0, publication_1.versionCoincide)(7, 7), true);
        strict_1.default.equal((0, publication_1.versionCoincide)(6, 7), false);
        const err = new errors_1.EditConflictError(7);
        strict_1.default.equal(err.status, 409);
        strict_1.default.equal(err.code, 'EDIT_CONFLICT');
        strict_1.default.deepEqual(err.details, { versionActual: 7 });
    });
    (0, node_test_1.test)('orden de diapositivas: exactamente las existentes, sin repetir ni faltar', () => {
        strict_1.default.equal((0, publication_1.ordenValido)([1, 2, 3], [3, 1, 2]), true);
        strict_1.default.equal((0, publication_1.ordenValido)([1, 2, 3], [1, 2]), false, 'falta una');
        strict_1.default.equal((0, publication_1.ordenValido)([1, 2, 3], [1, 2, 2]), false, 'repetida');
        strict_1.default.equal((0, publication_1.ordenValido)([1, 2, 3], [1, 2, 4]), false, 'ajena');
        strict_1.default.equal((0, publication_1.ordenValido)([], []), true);
    });
    (0, node_test_1.test)('una diapositiva se muestra solo si el slider y ella están activos y tienen imagen', () => {
        strict_1.default.equal((0, publication_1.diapositivaVisible)(true, true, 5), true);
        strict_1.default.equal((0, publication_1.diapositivaVisible)(false, true, 5), false);
        strict_1.default.equal((0, publication_1.diapositivaVisible)(true, false, 5), false);
        strict_1.default.equal((0, publication_1.diapositivaVisible)(true, true, null), false);
    });
});
(0, node_test_1.describe)('Slugs, ubicaciones y enlaces', () => {
    (0, node_test_1.test)('slugify quita tildes y símbolos y nunca devuelve vacío', () => {
        strict_1.default.equal((0, content_1.slugify)('Matrícula 2027: ¡Inscripciones abiertas!'), 'matricula-2027-inscripciones-abiertas');
        strict_1.default.equal((0, content_1.slugify)('¿¿??'), 'contenido');
        strict_1.default.ok((0, content_1.slugify)('a'.repeat(200)).length <= 80);
    });
    (0, node_test_1.test)('formato de slug y de ubicación de slider', () => {
        for (const ok of ['secretaria', 'plan-2027', 'a1-b2'])
            strict_1.default.match(ok, content_1.SLUG_RE);
        for (const bad of ['-x', 'x-', 'a--b', 'Mayus', '../etc', 'con espacio', ''])
            strict_1.default.doesNotMatch(bad, content_1.SLUG_RE);
        strict_1.default.match('inicio', content_1.UBICACION_RE);
        strict_1.default.match('pagina:contacto', content_1.UBICACION_RE);
        strict_1.default.doesNotMatch('pagina:../../x', content_1.UBICACION_RE);
        strict_1.default.doesNotMatch('portada', content_1.UBICACION_RE);
    });
    (0, node_test_1.test)('enlaces seguros: internos, https, mailto y tel; nunca javascript:, data: ni //externo', () => {
        for (const ok of ['', '/tramites', '#mision', 'https://www.gov.co/', 'mailto:educacion@example.gov.co', 'tel:+57 608 000 0000'])
            strict_1.default.equal((0, content_1.esEnlaceSeguro)(ok), true, ok);
        for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', '//malicioso.example', 'vbscript:x', 'https://x" onmouseover="a']) {
            strict_1.default.equal((0, content_1.esEnlaceSeguro)(bad), false, bad);
        }
    });
});
(0, node_test_1.describe)('Bloques del editor de páginas', () => {
    (0, node_test_1.test)('acepta bloques válidos y extrae las imágenes y audios usados', () => {
        const r = content_1.bloquesSchema.safeParse([
            { tipo: 'texto', html: '<p>Hola</p>' },
            { tipo: 'imagen', medioId: 4 },
            { tipo: 'galeria', medios: [5, 6] },
            { tipo: 'audio', medioId: 7 },
        ]);
        strict_1.default.ok(r.success, JSON.stringify(r.error?.issues));
        strict_1.default.deepEqual((0, content_1.mediosEnBloques)(r.data).sort(), [4, 5, 6, 7]);
    });
    (0, node_test_1.test)('rechaza tipos desconocidos, enlaces peligrosos y exceso de bloques', () => {
        strict_1.default.equal(content_1.bloquesSchema.safeParse([{ tipo: 'script', codigo: 'alert(1)' }]).success, false);
        strict_1.default.equal(content_1.bloquesSchema.safeParse([{ tipo: 'boton', texto: 'x', enlace: 'javascript:alert(1)' }]).success, false);
        strict_1.default.equal(content_1.bloquesSchema.safeParse(Array.from({ length: 151 }, () => ({ tipo: 'texto', html: '' }))).success, false);
    });
});
(0, node_test_1.describe)('Política de contraseñas', () => {
    const evaluar = (p) => ({ score: /^(.)\1+$|password|qwerty|123456/i.test(p) ? 0 : 4 });
    (0, node_test_1.test)('longitud mínima 12 y máxima 128', () => {
        strict_1.default.match(String((0, password_policy_1.validarPassword)('corta', evaluar)), /12/);
        strict_1.default.match(String((0, password_policy_1.validarPassword)('x'.repeat(129), evaluar)), /128/);
        strict_1.default.equal((0, password_policy_1.validarPassword)('una frase larga y poco común', evaluar), null);
    });
    (0, node_test_1.test)('rechaza contraseñas débiles según el evaluador', () => {
        strict_1.default.ok((0, password_policy_1.validarPassword)('password1234', evaluar));
        strict_1.default.ok((0, password_policy_1.validarPassword)('aaaaaaaaaaaa', evaluar));
    });
    (0, node_test_1.test)('pasa los datos del usuario al evaluador (no se permite usar el propio correo)', () => {
        let recibidos = [];
        (0, password_policy_1.validarPassword)('una frase larga y poco común', (_p, inputs) => {
            recibidos = inputs;
            return { score: 4 };
        }, ['ana@example.gov.co', undefined, 'Ana']);
        strict_1.default.deepEqual(recibidos, ['ana@example.gov.co', 'Ana']);
    });
});
(0, node_test_1.describe)('Permisos', () => {
    (0, node_test_1.test)('el catálogo contiene todos los permisos y solo esos son válidos', () => {
        const fromCatalog = (0, permissions_1.catalogo)().flatMap((m) => m.acciones.map((a) => a.permiso));
        strict_1.default.deepEqual([...fromCatalog].sort(), [...permissions_1.TODOS].sort());
        strict_1.default.equal((0, permissions_1.esPermisoValido)('news.publish'), true);
        strict_1.default.equal((0, permissions_1.esPermisoValido)('todo.poder'), false);
    });
    (0, node_test_1.test)('el editor no tiene permisos administrativos ni de eliminación definitiva', () => {
        for (const p of permissions_1.PERMISOS_EDITOR)
            strict_1.default.ok(!/^(users|roles|audit|stats|system|pqrsd)\.|\.delete$/.test(p), p);
        strict_1.default.ok(permissions_1.PERMISOS_EDITOR.includes('dashboard.access'));
    });
    (0, node_test_1.test)('errores del dominio con su código HTTP', () => {
        strict_1.default.equal(new errors_1.ValidationError().status, 422);
        const f = new errors_1.ForbiddenError();
        strict_1.default.equal(f.status, 403);
        strict_1.default.equal(f.permiso, null);
    });
});
//# sourceMappingURL=domain.test.js.map