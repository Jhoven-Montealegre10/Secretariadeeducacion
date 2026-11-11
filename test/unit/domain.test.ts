/** Reglas de dominio: publicación, slugs, enlaces, bloques, contraseñas y permisos (sin base de datos). */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { bloquesSchema, esEnlaceSeguro, mediosEnBloques, SLUG_RE, slugify, UBICACION_RE } from '../../src/domain/content';
import { EditConflictError, ForbiddenError, ValidationError } from '../../src/domain/errors';
import { validarPassword } from '../../src/domain/password-policy';
import { catalogo, esPermisoValido, PERMISOS_EDITOR, TODOS } from '../../src/domain/permissions';
import {
  accionPublicacion,
  diapositivaVisible,
  fechaColombia,
  noticiaVisible,
  ordenValido,
  requierePermisoPublicar,
  versionCoincide,
} from '../../src/domain/publication';

describe('Estados de publicación', () => {
  test('una noticia solo es visible publicada y con fecha cumplida (hora de Colombia)', () => {
    assert.equal(noticiaVisible('publicada', '2026-11-10', '2026-11-10'), true);
    assert.equal(noticiaVisible('publicada', '2026-11-11', '2026-11-10'), false, 'fecha futura');
    assert.equal(noticiaVisible('borrador', '2026-01-01', '2026-11-10'), false, 'borrador');
  });

  test('fechaColombia usa UTC-5: a las 02:00 UTC todavía es el día anterior', () => {
    assert.equal(fechaColombia(Date.parse('2026-11-10T02:00:00Z')), '2026-11-09');
    assert.equal(fechaColombia(Date.parse('2026-11-10T05:00:00Z')), '2026-11-10');
  });

  test('publicar, despublicar o editar lo publicado exige permiso de publicación', () => {
    assert.equal(requierePermisoPublicar(null, 'borrador'), false);
    assert.equal(requierePermisoPublicar(null, 'publicada'), true);
    assert.equal(requierePermisoPublicar('publicada', 'borrador'), true, 'despublicar');
    assert.equal(requierePermisoPublicar('publicada', 'publicada'), true, 'editar algo publicado');
    assert.equal(requierePermisoPublicar('borrador', 'borrador'), false);
  });

  test('acción de auditoría según el cambio de estado', () => {
    assert.equal(accionPublicacion('pagina', null, 'borrador'), 'pagina_crear');
    assert.equal(accionPublicacion('pagina', 'borrador', 'publicada'), 'pagina_publicar');
    assert.equal(accionPublicacion('noticia', 'publicada', 'borrador'), 'noticia_despublicar');
    assert.equal(accionPublicacion('noticia', 'publicada', 'publicada'), 'noticia_editar');
  });

  test('bloqueo optimista: sin versión se acepta (compatibilidad); con versión debe coincidir', () => {
    assert.equal(versionCoincide(undefined, 7), true);
    assert.equal(versionCoincide(7, 7), true);
    assert.equal(versionCoincide(6, 7), false);
    const err = new EditConflictError(7);
    assert.equal(err.status, 409);
    assert.equal(err.code, 'EDIT_CONFLICT');
    assert.deepEqual(err.details, { versionActual: 7 });
  });

  test('orden de diapositivas: exactamente las existentes, sin repetir ni faltar', () => {
    assert.equal(ordenValido([1, 2, 3], [3, 1, 2]), true);
    assert.equal(ordenValido([1, 2, 3], [1, 2]), false, 'falta una');
    assert.equal(ordenValido([1, 2, 3], [1, 2, 2]), false, 'repetida');
    assert.equal(ordenValido([1, 2, 3], [1, 2, 4]), false, 'ajena');
    assert.equal(ordenValido([], []), true);
  });

  test('una diapositiva se muestra solo si el slider y ella están activos y tienen imagen', () => {
    assert.equal(diapositivaVisible(true, true, 5), true);
    assert.equal(diapositivaVisible(false, true, 5), false);
    assert.equal(diapositivaVisible(true, false, 5), false);
    assert.equal(diapositivaVisible(true, true, null), false);
  });
});

describe('Slugs, ubicaciones y enlaces', () => {
  test('slugify quita tildes y símbolos y nunca devuelve vacío', () => {
    assert.equal(slugify('Matrícula 2027: ¡Inscripciones abiertas!'), 'matricula-2027-inscripciones-abiertas');
    assert.equal(slugify('¿¿??'), 'contenido');
    assert.ok(slugify('a'.repeat(200)).length <= 80);
  });

  test('formato de slug y de ubicación de slider', () => {
    for (const ok of ['secretaria', 'plan-2027', 'a1-b2']) assert.match(ok, SLUG_RE);
    for (const bad of ['-x', 'x-', 'a--b', 'Mayus', '../etc', 'con espacio', '']) assert.doesNotMatch(bad, SLUG_RE);
    assert.match('inicio', UBICACION_RE);
    assert.match('pagina:contacto', UBICACION_RE);
    assert.doesNotMatch('pagina:../../x', UBICACION_RE);
    assert.doesNotMatch('portada', UBICACION_RE);
  });

  test('enlaces seguros: internos, https, mailto y tel; nunca javascript:, data: ni //externo', () => {
    for (const ok of ['', '/tramites', '#mision', 'https://www.gov.co/', 'mailto:educacion@example.gov.co', 'tel:+57 608 000 0000'])
      assert.equal(esEnlaceSeguro(ok), true, ok);
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>',
      '//malicioso.example',
      'vbscript:x',
      'https://x" onmouseover="a',
    ]) {
      assert.equal(esEnlaceSeguro(bad), false, bad);
    }
  });
});

describe('Bloques del editor de páginas', () => {
  test('acepta bloques válidos y extrae las imágenes y audios usados', () => {
    const r = bloquesSchema.safeParse([
      { tipo: 'texto', html: '<p>Hola</p>' },
      { tipo: 'imagen', medioId: 4 },
      { tipo: 'galeria', medios: [5, 6] },
      { tipo: 'audio', medioId: 7 },
    ]);
    assert.ok(r.success, JSON.stringify(r.error?.issues));
    assert.deepEqual(mediosEnBloques(r.data as Array<Record<string, unknown>>).sort(), [4, 5, 6, 7]);
  });

  test('rechaza tipos desconocidos, enlaces peligrosos y exceso de bloques', () => {
    assert.equal(bloquesSchema.safeParse([{ tipo: 'script', codigo: 'alert(1)' }]).success, false);
    assert.equal(bloquesSchema.safeParse([{ tipo: 'boton', texto: 'x', enlace: 'javascript:alert(1)' }]).success, false);
    assert.equal(bloquesSchema.safeParse(Array.from({ length: 151 }, () => ({ tipo: 'texto', html: '' }))).success, false);
  });
});

describe('Política de contraseñas', () => {
  const evaluar = (p: string) => ({ score: /^(.)\1+$|password|qwerty|123456/i.test(p) ? 0 : 4 });

  test('longitud mínima 12 y máxima 128', () => {
    assert.match(String(validarPassword('corta', evaluar)), /12/);
    assert.match(String(validarPassword('x'.repeat(129), evaluar)), /128/);
    assert.equal(validarPassword('una frase larga y poco común', evaluar), null);
  });

  test('rechaza contraseñas débiles según el evaluador', () => {
    assert.ok(validarPassword('password1234', evaluar));
    assert.ok(validarPassword('aaaaaaaaaaaa', evaluar));
  });

  test('pasa los datos del usuario al evaluador (no se permite usar el propio correo)', () => {
    let recibidos: string[] = [];
    validarPassword(
      'una frase larga y poco común',
      (_p, inputs) => {
        recibidos = inputs;
        return { score: 4 };
      },
      ['ana@example.gov.co', undefined, 'Ana'],
    );
    assert.deepEqual(recibidos, ['ana@example.gov.co', 'Ana']);
  });
});

describe('Contraseñas derivadas de datos personales o de la entidad (QA-03)', () => {
  const evaluar = () => ({ score: 4 });
  test('se rechazan aunque el evaluador las puntúe alto', () => {
    for (const pw of ['QA Editor Dos QA Editor Dos', 'secretaria educacion ibague', 'Secretaría de Educación 2026', 'alcaldia de ibague tolima'])
      assert.ok(validarPassword(pw, evaluar, ['qa-editor@example.gov.co', 'QA Editor Dos']), pw);
  });
  test('una frase propia que menciona la entidad sí se acepta', () => {
    assert.equal(validarPassword('la secretaria toma cafe en el parque', evaluar, ['ana@example.gov.co', 'Ana Pérez']), null);
  });
});

describe('Permisos', () => {
  test('el catálogo contiene todos los permisos y solo esos son válidos', () => {
    const fromCatalog = catalogo().flatMap((m) => m.acciones.map((a) => a.permiso));
    assert.deepEqual([...fromCatalog].sort(), [...TODOS].sort());
    assert.equal(esPermisoValido('news.publish'), true);
    assert.equal(esPermisoValido('todo.poder'), false);
  });

  test('el editor no tiene permisos administrativos ni de eliminación definitiva', () => {
    for (const p of PERMISOS_EDITOR) assert.ok(!/^(users|roles|audit|stats|system|pqrsd)\.|\.delete$/.test(p), p);
    assert.ok(PERMISOS_EDITOR.includes('dashboard.access'));
  });

  test('errores del dominio con su código HTTP', () => {
    assert.equal(new ValidationError().status, 422);
    const f = new ForbiddenError();
    assert.equal(f.status, 403);
    assert.equal(f.permiso, null);
  });
});
