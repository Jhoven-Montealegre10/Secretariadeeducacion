/** Módulo de páginas: listado, editor por bloques, vista previa protegida, publicación y eliminación. */
import { get, post, put, del } from '../api.js';
import {
  h,
  mount,
  field,
  input,
  textarea,
  select,
  table,
  pagination,
  loading,
  empty,
  errorBox,
  statusBadge,
  formatDate,
  toast,
  errorMessage,
  showFieldErrors,
  confirmDialog,
  busy,
  badge,
} from '../ui.js';
import { blockEditor } from './blockEditor.js';

async function list(main, ctx) {
  const state = { page: 1, pageSize: 20 };
  const box = h('div', {}, loading());
  const q = input({ type: 'search', placeholder: 'Buscar por título o dirección', 'aria-label': 'Buscar páginas' });
  const estado = select(
    [
      ['', 'Todos los estados'],
      ['publicada', 'Publicadas'],
      ['borrador', 'Borradores'],
    ],
    '',
    { 'aria-label': 'Estado' },
  );
  async function reload() {
    try {
      const { data, meta } = await get('/paginas', { ...state, q: q.value, estado: estado.value });
      mount(
        box,
        data.length
          ? table(
              [
                { label: 'Título', render: (p) => h('a', { href: `/admin/paginas/${p.id}`, 'data-link': true }, p.titulo) },
                { label: 'Dirección', render: (p) => h('code', {}, `/${p.slug}`) },
                { label: 'Estado', render: (p) => [statusBadge(p.estado), p.sistema ? [' ', badge('Menú principal')] : null] },
                { label: 'Actualizada', render: (p) => formatDate(p.actualizadoEn) },
              ],
              data,
              { caption: 'Páginas' },
            )
          : empty('No hay páginas que coincidan.'),
        pagination(meta, (page) => {
          state.page = page;
          reload();
        }) || '',
      );
    } catch (e) {
      mount(box, errorBox(e, reload));
    }
  }
  let t;
  q.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.page = 1;
      reload();
    }, 300);
  });
  estado.addEventListener('change', () => {
    state.page = 1;
    reload();
  });
  mount(
    main,
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Páginas'),
      ctx.can('pages.create') ? h('a', { class: 'btn btn--primary', href: '/admin/paginas/nueva', 'data-link': true }, '+ Nueva página') : null,
    ),
    h('div', { class: 'toolbar' }, q, estado),
    box,
  );
  await reload();
}

async function edit(main, ctx, id) {
  const isNew = id === 'nueva';
  const page = isNew
    ? {
        titulo: '',
        slug: '',
        resumen: '',
        estado: 'borrador',
        bloques: [
          { tipo: 'seccion', titulo: '', antetitulo: '', ancla: '', fondo: 'blanco' },
          { tipo: 'texto', html: '' },
        ],
        sistema: false,
      }
    : (await get(`/paginas/${id}`)).data;
  const canPublish = ctx.can('pages.publish');
  const canSave = isNew ? ctx.can('pages.create') : ctx.can('pages.update') && (page.estado !== 'publicada' || canPublish);
  const titulo = input({ name: 'titulo', value: page.titulo, maxlength: 160 });
  const slug = input({ name: 'slug', value: page.slug, maxlength: 80, pattern: '[a-z0-9-]+', disabled: page.sistema });
  const resumen = textarea({ name: 'resumen', rows: 2, maxlength: 300 }, page.resumen);
  const estado = select([['borrador', 'Borrador (no visible al público)'], ...(canPublish ? [['publicada', 'Publicada']] : [])], page.estado, {
    name: 'estado',
  });
  const blocks = blockEditor(ctx, page.bloques);
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    h(
      'div',
      { class: 'grid grid--2' },
      field('Título', titulo, { required: true }),
      field('Dirección amigable', slug, {
        help: page.sistema ? 'Las páginas del menú principal conservan su dirección.' : 'Solo minúsculas, números y guiones. Vacío: se genera desde el título.',
      }),
    ),
    field('Resumen (se muestra bajo el título)', resumen),
    field('Estado', estado),
    h('h2', {}, 'Contenido'),
    blocks.el,
  );
  const save = h('button', { type: 'submit', class: 'btn btn--primary', disabled: !canSave }, 'Guardar');
  form.append(
    h(
      'div',
      { class: 'form-actions' },
      save,
      !isNew
        ? h('a', { class: 'btn btn--outline-blue', href: `/admin/vista-previa/paginas/${page.id}`, target: '_blank', rel: 'noopener' }, 'Vista previa ↗')
        : null,
      !isNew && page.estado === 'publicada'
        ? h('a', { class: 'btn btn--outline-blue', href: `/${page.slug}`, target: '_blank', rel: 'noopener' }, 'Ver publicada ↗')
        : null,
      !isNew && ctx.can('pages.delete') && !page.sistema
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn--danger',
              onclick: async () => {
                if (
                  !(await confirmDialog({ title: 'Eliminar página', message: `¿Eliminar definitivamente "${page.titulo}"? Esta acción no se puede deshacer.` }))
                )
                  return;
                try {
                  await del(`/paginas/${page.id}`);
                  toast('Página eliminada.');
                  ctx.navigate('/admin/paginas');
                } catch (e) {
                  toast(errorMessage(e), 'error');
                }
              },
            },
            'Eliminar',
          )
        : null,
    ),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(save, async () => {
      const body = {
        titulo: titulo.value,
        resumen: resumen.value,
        estado: estado.value,
        bloques: blocks.read(),
        ...(slug.value && !page.sistema ? { slug: slug.value } : {}),
      };
      try {
        const { data } = isNew ? await post('/paginas', body) : await put(`/paginas/${page.id}`, body);
        toast(data.estado === 'publicada' ? 'Página guardada y publicada. El sitio ya muestra los cambios.' : 'Borrador guardado. No es visible al público.');
        if (isNew) ctx.navigate(`/admin/paginas/${data.id}`, { replace: true });
      } catch (err) {
        showFieldErrors(form, err);
        toast(errorMessage(err), 'error');
      }
    });
  });
  mount(
    main,
    h('p', {}, h('a', { href: '/admin/paginas', 'data-link': true }, '← Páginas')),
    h('h1', {}, isNew ? 'Nueva página' : `Editar: ${page.titulo}`),
    !canSave ? h('div', { class: 'notice' }, 'Puede consultar esta página, pero no tiene permiso para modificarla.') : null,
    form,
  );
}

export async function render(main, ctx, [id]) {
  if (id) return edit(main, ctx, id);
  return list(main, ctx);
}
