/** Biblioteca multimedia: listado con búsqueda y filtros, carga, detalle, reemplazo y eliminación. */
import { get, patch, del, upload } from '../api.js';
import {
  h,
  mount,
  field,
  input,
  textarea,
  select,
  modal,
  confirmDialog,
  toast,
  errorMessage,
  loading,
  empty,
  errorBox,
  pagination,
  formatSize,
  formatDate,
  badge,
  busy,
  showFieldErrors,
} from '../ui.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,audio/mpeg,audio/ogg,audio/wav,.jpg,.jpeg,.png,.webp,.mp3,.ogg,.oga,.wav';

function preview(m, big = false) {
  if (m.tipo === 'imagen')
    return h('img', { src: big ? m.url : m.miniaturaUrl || m.url, alt: m.textoAlternativo || '', loading: 'lazy', class: big ? 'media-preview' : '' });
  return h(
    'div',
    { class: 'media-audio' },
    h('span', { 'aria-hidden': 'true' }, '♪'),
    big ? h('audio', { controls: true, src: m.url, preload: 'none' }) : null,
  );
}

function usageList(usos) {
  if (!usos?.length) return h('p', { class: 'muted' }, 'No se usa en ningún contenido.');
  const names = { pagina: 'Página', noticia: 'Noticia', diapositiva: 'Slider' };
  return h(
    'ul',
    {},
    usos.map((u) => h('li', {}, `${names[u.entidad]}: ${u.titulo || `#${u.entidadId}`}`, u.publicado ? ' (publicado)' : ' (borrador o inactivo)')),
  );
}

async function uploadFiles(files, extra = {}) {
  const form = new FormData();
  [...files].forEach((f) => form.append('archivos', f));
  Object.entries(extra).forEach(([k, v]) => v && form.append(k, v));
  const { data } = await upload('POST', '/medios', form);
  return data;
}

function uploadBox(ctx, onDone) {
  if (!ctx.can('media.upload')) return null;
  const file = h('input', { type: 'file', multiple: true, accept: ACCEPT, id: 'carga-archivos', class: 'file-input' });
  const status = h('p', { class: 'muted', role: 'status' });
  const go = async (files) => {
    if (!files.length) return;
    status.textContent = `Subiendo ${files.length} archivo(s)…`;
    try {
      const items = await uploadFiles(files);
      status.textContent = '';
      toast(`${items.length} archivo(s) subido(s). Quedan privados hasta usarse en contenido publicado.`);
      onDone(items);
    } catch (e) {
      status.textContent = '';
      toast(errorMessage(e), 'error');
    }
    file.value = '';
  };
  file.addEventListener('change', () => go(file.files));
  const zone = h(
    'div',
    { class: 'dropzone' },
    h(
      'label',
      { for: 'carga-archivos' },
      h('strong', {}, 'Subir archivos'),
      h('span', {}, ' · JPG, PNG, WebP (≤ 8 MB) · MP3, OGG, WAV (≤ 20 MB) · hasta 10 a la vez'),
    ),
    file,
    status,
  );
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('is-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('is-over');
    go(e.dataTransfer.files);
  });
  return zone;
}

/** Detalle editable de un archivo. */
async function openDetail(ctx, id, onChange) {
  const { data: m } = await get(`/medios/${id}`);
  const nombre = input({ name: 'nombreVisible', value: m.nombreVisible, maxlength: 150 });
  const alt = input({ name: 'textoAlternativo', value: m.textoAlternativo, maxlength: 250 });
  const desc = textarea({ name: 'descripcion', rows: 3, maxlength: 1000 }, m.descripcion);
  const vis = select(
    [
      ['privada', 'Privada (solo visible si la usa contenido publicado)'],
      ['publica', 'Pública'],
    ],
    m.visibilidad,
    { name: 'visibilidad' },
  );
  const canEdit = ctx.can('media.update');
  [nombre, alt, desc, vis].forEach((c) => {
    c.disabled = !canEdit;
  });
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field('Nombre visible', nombre, { required: true, help: 'Es el nombre que se ve en el panel; el archivo se guarda con un nombre interno distinto.' }),
    m.tipo === 'imagen' ? field('Texto alternativo', alt, { help: 'Describe la imagen para personas que usan lectores de pantalla.' }) : null,
    field('Descripción', desc),
    field('Visibilidad', vis),
  );
  const replace = h('input', {
    type: 'file',
    accept: m.tipo === 'imagen' ? 'image/jpeg,image/png,image/webp' : 'audio/mpeg,audio/ogg,audio/wav',
    id: 'reemplazo',
    class: 'file-input',
  });
  const actions = [];
  if (canEdit) {
    const save = h('button', { type: 'button', class: 'btn btn--primary' }, 'Guardar cambios');
    save.addEventListener('click', () =>
      busy(save, async () => {
        try {
          await patch(`/medios/${m.id}`, {
            nombreVisible: nombre.value,
            ...(m.tipo === 'imagen' ? { textoAlternativo: alt.value } : {}),
            descripcion: desc.value,
            visibilidad: vis.value,
          });
          toast('Archivo actualizado.');
          dlg.close();
          onChange();
        } catch (e) {
          showFieldErrors(form, e);
          toast(errorMessage(e), 'error');
        }
      }),
    );
    actions.push(save);
  }
  if (ctx.can('media.delete')) {
    actions.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--danger',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Eliminar archivo',
              message: h(
                'div',
                {},
                h('p', {}, `¿Eliminar definitivamente "${m.nombreVisible}"?`),
                m.usos.length
                  ? h('div', { class: 'notice notice--error' }, h('p', {}, 'Este archivo está en uso y dejará de mostrarse en:'), usageList(m.usos))
                  : null,
              ),
            });
            if (!ok) return;
            try {
              await del(`/medios/${m.id}`, { confirmar: m.usos.length ? 'true' : undefined });
              toast('Archivo eliminado.');
              dlg.close();
              onChange();
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          },
        },
        'Eliminar',
      ),
    );
  }
  replace.addEventListener('change', async () => {
    const f = replace.files[0];
    if (!f) return;
    if (
      m.usos.length &&
      !(await confirmDialog({
        title: 'Reemplazar archivo',
        confirmText: 'Reemplazar',
        danger: false,
        message: h('div', {}, h('p', {}, 'El archivo nuevo se mostrará en todos estos contenidos:'), usageList(m.usos)),
      }))
    ) {
      replace.value = '';
      return;
    }
    const form2 = new FormData();
    form2.append('archivo', f);
    if (m.usos.length) form2.append('confirmar', 'true');
    try {
      await upload('PUT', `/medios/${m.id}/archivo`, form2);
      toast('Archivo reemplazado.');
      dlg.close();
      onChange();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  });
  const dlg = modal({
    title: m.nombreVisible,
    wide: true,
    actions,
    content: h(
      'div',
      { class: 'media-detail' },
      h(
        'div',
        {},
        preview(m, true),
        h(
          'dl',
          { class: 'meta' },
          h('dt', {}, 'Tipo'),
          h('dd', {}, m.mime),
          h('dt', {}, 'Tamaño'),
          h('dd', {}, formatSize(m.tamano)),
          m.ancho ? [h('dt', {}, 'Dimensiones'), h('dd', {}, `${m.ancho} × ${m.alto} px`)] : null,
          h('dt', {}, 'Archivo original'),
          h('dd', {}, m.nombreOriginal),
          h('dt', {}, 'Subido'),
          h('dd', {}, formatDate(m.creadoEn)),
        ),
        h('h3', {}, 'Dónde se usa'),
        usageList(m.usos),
        canEdit ? h('div', { class: 'field' }, h('label', { for: 'reemplazo' }, 'Reemplazar archivo (mantiene los usos)'), replace) : null,
      ),
      form,
    ),
  });
}

function filters(state, reload) {
  const q = input({ type: 'search', placeholder: 'Buscar por nombre o descripción', value: state.q || '', 'aria-label': 'Buscar' });
  const tipo = select(
    [
      ['', 'Todos los tipos'],
      ['imagen', 'Imágenes'],
      ['audio', 'Audios'],
    ],
    state.tipo || '',
    { 'aria-label': 'Tipo' },
  );
  let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => reload({ q: q.value, page: 1 }), 300);
  });
  tipo.addEventListener('change', () => reload({ tipo: tipo.value, page: 1 }));
  return h('div', { class: 'toolbar' }, q, tipo);
}

function grid(items, onOpen, selected) {
  return h(
    'ul',
    { class: 'media-grid' },
    items.map((m) =>
      h(
        'li',
        {},
        h(
          'button',
          {
            type: 'button',
            class: `media-tile${selected?.has(m.id) ? ' is-selected' : ''}`,
            'aria-pressed': selected ? String(selected.has(m.id)) : false,
            onclick: () => onOpen(m),
          },
          preview(m),
          h('span', { class: 'media-tile__name' }, m.nombreVisible),
          h(
            'span',
            { class: 'media-tile__meta' },
            m.tipo === 'imagen' ? 'Imagen' : 'Audio',
            ' · ',
            formatSize(m.tamano),
            m.totalUsos ? ` · en uso (${m.totalUsos})` : '',
          ),
          m.tipo === 'imagen' && !m.textoAlternativo ? badge('Sin texto alternativo', 'yellow') : null,
        ),
      ),
    ),
  );
}

export async function render(main, ctx) {
  const state = { page: 1, pageSize: 24, sort: '-creadoEn' };
  const list = h('div', {}, loading());
  async function reload(changes = {}) {
    Object.assign(state, changes);
    mount(list, loading());
    try {
      const { data, meta } = await get('/medios', state);
      mount(
        list,
        data.length ? grid(data, (m) => openDetail(ctx, m.id, () => reload())) : empty('No hay archivos que coincidan.'),
        pagination(meta, (page) => reload({ page })) || '',
      );
    } catch (e) {
      mount(
        list,
        errorBox(e, () => reload()),
      );
    }
  }
  mount(main, h('h1', {}, 'Multimedia'), uploadBox(ctx, () => reload({ page: 1 })) || '', filters(state, reload), list);
  await reload();
}

/**
 * Selector reutilizable para páginas, noticias y sliders: elige archivos existentes de la
 * biblioteca (o sube nuevos) sin duplicarlos. Resuelve con la lista elegida o null.
 */
export function pickMedia(ctx, { tipo = 'imagen', multiple = false, title } = {}) {
  return new Promise((resolve) => {
    const state = { page: 1, pageSize: 18, tipo, sort: '-creadoEn' };
    const chosen = new Map();
    const list = h('div', {}, loading());
    let resolved = false;
    const finish = (value) => {
      resolved = true;
      dlg.close();
      resolve(value);
    };
    async function reload(changes = {}) {
      Object.assign(state, changes);
      try {
        const { data, meta } = await get('/medios', state);
        mount(
          list,
          data.length
            ? grid(
                data,
                (m) => {
                  if (!multiple) return finish([m]);
                  if (chosen.has(m.id)) chosen.delete(m.id);
                  else chosen.set(m.id, m);
                  reload();
                },
                new Set(chosen.keys()),
              )
            : empty('No hay archivos. Suba uno nuevo.'),
          pagination(meta, (page) => reload({ page })) || '',
        );
      } catch (e) {
        mount(
          list,
          errorBox(e, () => reload()),
        );
      }
    }
    const actions = multiple
      ? [h('button', { type: 'button', class: 'btn btn--primary', onclick: () => finish([...chosen.values()]) }, 'Usar seleccionados')]
      : [];
    const dlg = modal({
      title: title || (tipo === 'audio' ? 'Elegir audio' : 'Elegir imagen'),
      wide: true,
      actions,
      content: h(
        'div',
        {},
        uploadBox(ctx, (items) => {
          if (!multiple && items.length === 1) finish(items);
          else {
            items.forEach((m) => chosen.set(m.id, m));
            reload({ page: 1 });
          }
        }) || '',
        filters(state, reload),
        list,
      ),
      onClose: () => {
        if (!resolved) resolve(null);
      },
    });
    reload();
  });
}

export { preview };
