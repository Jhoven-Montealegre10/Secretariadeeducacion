/** Editor de páginas por bloques: cada tipo de bloque tiene su propio formulario. */
import { get } from '../api.js';
import { h, mount, field, input, select, checkbox, textarea, confirmDialog } from '../ui.js';
import { richText } from './richText.js';
import { pickMedia } from './media.js';

export const BLOCK_TYPES = {
  seccion: 'Sección (título y fondo)',
  texto: 'Texto',
  aviso: 'Aviso destacado',
  imagen: 'Imagen',
  galeria: 'Galería de fotos',
  audio: 'Audio',
  tarjetas: 'Tarjetas',
  acordeon: 'Lista desplegable (acordeón)',
  tabla: 'Tabla',
  boton: 'Botón',
  directorioInstituciones: 'Directorio de instituciones (automático)',
  datosContacto: 'Datos de contacto y mapa (automático)',
};

const DEFAULTS = {
  seccion: { titulo: '', antetitulo: '', ancla: '', fondo: 'blanco' },
  texto: { html: '' },
  aviso: { estilo: 'informacion', html: '' },
  imagen: { medioId: null, pie: '' },
  galeria: { medios: [] },
  audio: { medioId: null, titulo: '' },
  tarjetas: { columnas: 3, estilo: 'tarjeta', items: [{ titulo: '', texto: '', enlace: '', textoEnlace: '', etiqueta: '', ancla: '' }] },
  acordeon: { titulo: '', ancla: '', intro: '', items: [{ titulo: '', html: '', ancla: '', abierto: false }] },
  tabla: { encabezados: ['Columna 1', 'Columna 2'], filas: [] },
  boton: { texto: '', enlace: '', estilo: 'primario' },
  directorioInstituciones: {},
  datosContacto: { mostrarMapa: true },
};

const thumbCache = new Map();
async function mediaThumb(id) {
  if (!id) return h('span', { class: 'muted' }, 'Sin archivo');
  if (!thumbCache.has(id))
    thumbCache.set(
      id,
      get(`/medios/${id}`)
        .then((r) => r.data)
        .catch(() => null),
    );
  const m = await thumbCache.get(id);
  if (!m) return h('span', { class: 'field-error' }, `Archivo #${id} no disponible`);
  return m.tipo === 'imagen'
    ? h('img', { src: m.miniaturaUrl || m.url, alt: m.textoAlternativo || m.nombreVisible, class: 'thumb' })
    : h('span', {}, `♪ ${m.nombreVisible}`);
}

function mediaField(ctx, label, ids, { tipo = 'imagen', multiple = false }) {
  let current = [...ids];
  const preview = h('div', { class: 'thumbs' });
  const draw = async () =>
    mount(preview, ...(current.length ? await Promise.all(current.map(mediaThumb)) : [h('span', { class: 'muted' }, 'Ninguno seleccionado')]));
  draw();
  const el = h(
    'div',
    { class: 'field' },
    h('span', { class: 'label' }, label),
    preview,
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn--outline-blue',
        onclick: async () => {
          const chosen = await pickMedia(ctx, { tipo, multiple });
          if (!chosen) return;
          current = multiple ? [...new Set([...current, ...chosen.map((m) => m.id)])] : [chosen[0].id];
          draw();
        },
      },
      multiple ? 'Agregar desde la biblioteca' : 'Elegir desde la biblioteca',
    ),
    multiple
      ? h(
          'button',
          {
            type: 'button',
            class: 'link-button',
            onclick: () => {
              current = [];
              draw();
            },
          },
          'Quitar todas',
        )
      : null,
  );
  return { el, read: () => (multiple ? current : (current[0] ?? null)) };
}

function itemsEditor(items, renderItem, blank, labelOf) {
  const box = h('div', { class: 'items' });
  const rows = [];
  function add(data) {
    const editor = renderItem(data);
    const row = h(
      'fieldset',
      { class: 'item' },
      h('legend', {}, labelOf(rows.length + 1)),
      editor.el,
      h(
        'button',
        {
          type: 'button',
          class: 'link-danger',
          onclick: () => {
            rows.splice(rows.indexOf(entry), 1);
            row.remove();
          },
        },
        'Quitar',
      ),
    );
    const entry = { row, editor };
    rows.push(entry);
    box.append(row);
  }
  items.forEach(add);
  return {
    el: h('div', {}, box, h('button', { type: 'button', class: 'btn btn--outline-blue', onclick: () => add(structuredClone(blank)) }, '+ Agregar elemento')),
    read: () => rows.map((r) => r.editor.read()),
  };
}

function editorFor(ctx, block) {
  const b = { ...structuredClone(DEFAULTS[block.tipo]), ...block };
  const txt = (label, key, attrs = {}, opts = {}) => {
    const c = input({ value: b[key] ?? '', ...attrs });
    return { el: field(label, c, opts), read: () => c.value };
  };
  switch (b.tipo) {
    case 'seccion': {
      const t = txt('Título', 'titulo', { maxlength: 160 });
      const a = txt('Antetítulo', 'antetitulo', { maxlength: 80 });
      const an = txt('Ancla (para enlaces #)', 'ancla', { maxlength: 60, pattern: '[a-z0-9\\-]*' }, { help: 'Ej.: dependencias → enlace /pagina#dependencias' });
      const f = select(
        [
          ['blanco', 'Blanco'],
          ['gris', 'Gris'],
          ['azul', 'Azul claro'],
        ],
        b.fondo,
      );
      return {
        el: h('div', { class: 'grid grid--2' }, t.el, a.el, an.el, field('Fondo', f)),
        read: () => ({ tipo: 'seccion', titulo: t.read(), antetitulo: a.read(), ancla: an.read(), fondo: f.value }),
      };
    }
    case 'texto': {
      const r = richText('Contenido', b.html);
      return { el: r.el, read: () => ({ tipo: 'texto', html: r.value }) };
    }
    case 'aviso': {
      const e = select(
        [
          ['informacion', 'Información (azul)'],
          ['advertencia', 'Advertencia (amarillo)'],
        ],
        b.estilo,
      );
      const r = richText('Contenido', b.html);
      return { el: h('div', {}, field('Estilo', e), r.el), read: () => ({ tipo: 'aviso', estilo: e.value, html: r.value }) };
    }
    case 'imagen': {
      const m = mediaField(ctx, 'Imagen', b.medioId ? [b.medioId] : [], {});
      const p = txt('Pie de foto', 'pie', { maxlength: 300 });
      return { el: h('div', {}, m.el, p.el), read: () => ({ tipo: 'imagen', medioId: m.read(), pie: p.read() }) };
    }
    case 'galeria': {
      const m = mediaField(ctx, 'Fotografías', b.medios, { multiple: true });
      return { el: m.el, read: () => ({ tipo: 'galeria', medios: m.read() }) };
    }
    case 'audio': {
      const m = mediaField(ctx, 'Audio', b.medioId ? [b.medioId] : [], { tipo: 'audio' });
      const t = txt('Título', 'titulo', { maxlength: 160 });
      return { el: h('div', {}, m.el, t.el), read: () => ({ tipo: 'audio', medioId: m.read(), titulo: t.read() }) };
    }
    case 'tarjetas': {
      const c = select(
        [
          [2, '2 columnas'],
          [3, '3 columnas'],
          [4, '4 columnas'],
        ],
        b.columnas,
      );
      const e = select(
        [
          ['tarjeta', 'Tarjeta'],
          ['servicio', 'Acceso (toda la tarjeta es un enlace)'],
        ],
        b.estilo,
      );
      const items = itemsEditor(
        b.items,
        (it) => {
          const f = {
            titulo: input({ value: it.titulo, maxlength: 160 }),
            texto: textarea({ rows: 2, maxlength: 600 }, it.texto),
            etiqueta: input({ value: it.etiqueta, maxlength: 40 }),
            enlace: input({ value: it.enlace, maxlength: 500, placeholder: '/tramites o https://…' }),
            textoEnlace: input({ value: it.textoEnlace, maxlength: 60 }),
            ancla: input({ value: it.ancla, maxlength: 60 }),
          };
          return {
            el: h(
              'div',
              { class: 'grid grid--2' },
              field('Título', f.titulo, { required: true }),
              field('Etiqueta', f.etiqueta),
              field('Texto', f.texto),
              field('Enlace', f.enlace),
              field('Texto del enlace', f.textoEnlace),
              field('Ancla', f.ancla),
            ),
            read: () => Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])),
          };
        },
        DEFAULTS.tarjetas.items[0],
        (n) => `Tarjeta ${n}`,
      );
      return {
        el: h('div', {}, h('div', { class: 'grid grid--2' }, field('Columnas', c), field('Estilo', e)), items.el),
        read: () => ({ tipo: 'tarjetas', columnas: Number(c.value), estilo: e.value, items: items.read() }),
      };
    }
    case 'acordeon': {
      const t = txt('Título del grupo', 'titulo', { maxlength: 160 });
      const an = txt('Ancla', 'ancla', { maxlength: 60 });
      const intro = richText('Introducción (opcional)', b.intro);
      const items = itemsEditor(
        b.items,
        (it) => {
          const ti = input({ value: it.titulo, maxlength: 200 });
          const r = richText('Contenido', it.html);
          const a = input({ value: it.ancla, maxlength: 60 });
          const o = checkbox('Abierto por defecto', it.abierto);
          return {
            el: h('div', {}, field('Pregunta o título', ti, { required: true }), r.el, h('div', { class: 'grid grid--2' }, field('Ancla', a), o)),
            read: () => ({ titulo: ti.value, html: r.value, ancla: a.value, abierto: o.querySelector('input').checked }),
          };
        },
        DEFAULTS.acordeon.items[0],
        (n) => `Elemento ${n}`,
      );
      return {
        el: h('div', {}, h('div', { class: 'grid grid--2' }, t.el, an.el), intro.el, items.el),
        read: () => ({ tipo: 'acordeon', titulo: t.read(), ancla: an.read(), intro: intro.value, items: items.read() }),
      };
    }
    case 'tabla': {
      const lines = [b.encabezados.join(' | '), ...b.filas.map((f) => f.join(' | '))].join('\n');
      const ta = textarea({ rows: 8, class: 'mono' }, lines);
      return {
        el: field('Contenido de la tabla', ta, {
          help: 'Una fila por línea; separe las columnas con |. La primera línea son los encabezados (máx. 8 columnas).',
        }),
        read: () => {
          const rows = ta.value
            .split('\n')
            .map((l) => l.split('|').map((c) => c.trim()))
            .filter((r) => r.some(Boolean));
          return { tipo: 'tabla', encabezados: rows[0] || [''], filas: rows.slice(1) };
        },
      };
    }
    case 'boton': {
      const t = txt('Texto', 'texto', { maxlength: 60 }, { required: true });
      const e = txt('Enlace', 'enlace', { maxlength: 500, placeholder: '/atencion o https://…' }, { required: true });
      const s = select(
        [
          ['primario', 'Principal'],
          ['secundario', 'Secundario'],
        ],
        b.estilo,
      );
      return {
        el: h('div', { class: 'grid grid--2' }, t.el, e.el, field('Estilo', s)),
        read: () => ({ tipo: 'boton', texto: t.read(), enlace: e.read(), estilo: s.value }),
      };
    }
    case 'datosContacto': {
      const c = checkbox('Mostrar mapa', b.mostrarMapa);
      return {
        el: h('div', {}, h('p', { class: 'muted' }, 'Muestra la dirección, teléfonos y horarios configurados del portal.'), c),
        read: () => ({ tipo: 'datosContacto', mostrarMapa: c.querySelector('input').checked }),
      };
    }
    default:
      return { el: h('p', { class: 'muted' }, 'Este bloque se genera automáticamente con datos del sistema.'), read: () => ({ tipo: b.tipo }) };
  }
}

export function blockEditor(ctx, initial) {
  const list = h('ol', { class: 'blocks' });
  const entries = [];
  function redrawControls() {
    entries.forEach((e, i) => {
      e.up.disabled = i === 0;
      e.down.disabled = i === entries.length - 1;
      e.title.textContent = `${i + 1}. ${BLOCK_TYPES[e.tipo]}`;
    });
  }
  function add(block, at = entries.length) {
    const editor = editorFor(ctx, block);
    const title = h('h3', {}, '');
    const up = h('button', { type: 'button', 'aria-label': 'Subir bloque', onclick: () => move(entry, -1) }, '↑');
    const down = h('button', { type: 'button', 'aria-label': 'Bajar bloque', onclick: () => move(entry, 1) }, '↓');
    const remove = h(
      'button',
      {
        type: 'button',
        class: 'link-danger',
        onclick: async () => {
          if (
            await confirmDialog({ title: 'Quitar bloque', message: '¿Quitar este bloque de la página? El cambio se aplica al guardar.', confirmText: 'Quitar' })
          ) {
            entries.splice(entries.indexOf(entry), 1);
            li.remove();
            redrawControls();
          }
        },
      },
      'Quitar',
    );
    const li = h('li', { class: 'block' }, h('div', { class: 'block__head' }, title, h('div', { class: 'block__tools' }, up, down, remove)), editor.el);
    const entry = { tipo: block.tipo, editor, li, up, down, title };
    entries.splice(at, 0, entry);
    if (at >= list.children.length) list.append(li);
    else list.insertBefore(li, list.children[at]);
    redrawControls();
    return entry;
  }
  function move(entry, delta) {
    const i = entries.indexOf(entry);
    const j = i + delta;
    if (j < 0 || j >= entries.length) return;
    entries.splice(i, 1);
    entries.splice(j, 0, entry);
    if (delta < 0) list.insertBefore(entry.li, entries[j + 1].li);
    else list.insertBefore(entry.li, entries[j - 1].li.nextSibling);
    redrawControls();
    (delta < 0 ? entry.up : entry.down).focus();
  }
  initial.forEach((b) => add(b));
  const typeSelect = select(Object.entries(BLOCK_TYPES), 'texto', { 'aria-label': 'Tipo de bloque a agregar' });
  const el = h(
    'div',
    { class: 'block-editor' },
    list.childElementCount || initial.length ? null : h('p', { class: 'muted' }, 'La página aún no tiene bloques.'),
    list,
    h(
      'div',
      { class: 'toolbar' },
      typeSelect,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--outline-blue',
          onclick: () => {
            const e = add({ tipo: typeSelect.value });
            e.li.querySelector('input, select, [contenteditable]')?.focus();
          },
        },
        '+ Agregar bloque',
      ),
    ),
  );
  return { el, read: () => entries.map((e) => e.editor.read()) };
}
