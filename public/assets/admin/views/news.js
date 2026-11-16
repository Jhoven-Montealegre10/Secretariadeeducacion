/** Módulo de noticias: listado con filtros, editor, imagen principal y galería desde la biblioteca. */
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
} from '../ui.js';
import { richText } from './richText.js';
import { pickMedia } from './media.js';

const CATEGORIAS = ['Institucional', 'Cobertura', 'Calidad educativa', 'Normatividad', 'Talento humano', 'Bienestar', 'Transparencia'];
const today = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

async function list(main, ctx) {
  const state = { page: 1, pageSize: 20, sort: '-fechaPublicacion' };
  const box = h('div', {}, loading());
  const q = input({ type: 'search', placeholder: 'Buscar noticias', 'aria-label': 'Buscar noticias' });
  const estado = select(
    [
      ['', 'Todos los estados'],
      ['publicada', 'Publicadas'],
      ['borrador', 'Borradores'],
    ],
    '',
    { 'aria-label': 'Estado' },
  );
  const categoria = select([['', 'Todas las categorías'], ...CATEGORIAS.map((c) => [c, c])], '', { 'aria-label': 'Categoría' });
  async function reload() {
    try {
      const { data, meta } = await get('/noticias', { ...state, q: q.value, estado: estado.value, categoria: categoria.value });
      mount(
        box,
        data.length
          ? table(
              [
                { label: 'Fecha', render: (n) => formatDate(n.fechaPublicacion) },
                { label: 'Título', render: (n) => h('a', { href: `/admin/noticias/${n.id}`, 'data-link': true }, n.titulo) },
                { label: 'Categoría', render: (n) => n.categoria },
                { label: 'Estado', render: (n) => statusBadge(n.estado) },
              ],
              data,
              { caption: 'Noticias' },
            )
          : empty('No hay noticias que coincidan.'),
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
  [estado, categoria].forEach((s) =>
    s.addEventListener('change', () => {
      state.page = 1;
      reload();
    }),
  );
  mount(
    main,
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Noticias'),
      ctx.can('news.create') ? h('a', { class: 'btn btn--primary', href: '/admin/noticias/nueva', 'data-link': true }, '+ Nueva noticia') : null,
    ),
    h('p', { class: 'muted' }, 'Las noticias publicadas aparecen automáticamente en el inicio, de la más reciente a la más antigua.'),
    h('div', { class: 'toolbar' }, q, estado, categoria),
    box,
  );
  await reload();
}

function imagesField(ctx, label, initialIds, multiple) {
  let ids = [...initialIds];
  const box = h('div', { class: 'thumbs' });
  async function draw() {
    const items = await Promise.all(
      ids.map((id) =>
        get(`/medios/${id}`)
          .then((r) => r.data)
          .catch(() => null),
      ),
    );
    mount(
      box,
      ...(items.filter(Boolean).length
        ? items.filter(Boolean).map((m) =>
            h(
              'figure',
              { class: 'thumb-item' },
              h('img', { src: m.miniaturaUrl || m.url, alt: m.textoAlternativo || m.nombreVisible, class: 'thumb' }),
              h(
                'button',
                {
                  type: 'button',
                  class: 'link-danger',
                  'aria-label': `Quitar ${m.nombreVisible}`,
                  onclick: () => {
                    ids = ids.filter((x) => x !== m.id);
                    draw();
                  },
                },
                'Quitar',
              ),
            ),
          )
        : [h('span', { class: 'muted' }, 'Ninguna')]),
    );
  }
  draw();
  return {
    el: h(
      'div',
      { class: 'field' },
      h('span', { class: 'label' }, label),
      box,
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--outline-blue',
          onclick: async () => {
            const chosen = await pickMedia(ctx, { tipo: 'imagen', multiple });
            if (!chosen) return;
            ids = multiple ? [...new Set([...ids, ...chosen.map((m) => m.id)])] : [chosen[0].id];
            draw();
          },
        },
        'Elegir desde la biblioteca',
      ),
    ),
    read: () => ids,
  };
}

async function edit(main, ctx, id) {
  const isNew = id === 'nueva';
  const n = isNew
    ? { titulo: '', slug: '', resumen: '', contenido: '', categoria: 'Institucional', estado: 'borrador', fechaPublicacion: today(), imagenId: null, fotos: [] }
    : (await get(`/noticias/${id}`)).data;
  const canPublish = ctx.can('news.publish');
  const canSave = isNew ? ctx.can('news.create') : ctx.can('news.update') && (n.estado !== 'publicada' || canPublish);
  const f = {
    titulo: input({ name: 'titulo', value: n.titulo, maxlength: 160 }),
    slug: input({ name: 'slug', value: n.slug, maxlength: 80 }),
    resumen: textarea({ name: 'resumen', rows: 2, maxlength: 300 }, n.resumen),
    categoria: select(CATEGORIAS, n.categoria, { name: 'categoria' }),
    fechaPublicacion: input({ type: 'date', name: 'fechaPublicacion', value: n.fechaPublicacion }),
    estado: select([['borrador', 'Borrador (no visible)'], ...(canPublish ? [['publicada', 'Publicada']] : [])], n.estado, { name: 'estado' }),
  };
  const contenido = richText('Contenido completo', n.contenido, { required: true });
  const principal = imagesField(ctx, 'Imagen principal', n.imagenId ? [n.imagenId] : [], false);
  const fotos = imagesField(ctx, 'Fotografías adicionales', n.fotos, true);
  const save = h('button', { type: 'submit', class: 'btn btn--primary', disabled: !canSave }, 'Guardar');
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field('Título', f.titulo, { required: true }),
    field('Resumen', f.resumen, { required: true, help: 'Se muestra en el inicio y en el listado (10 a 300 caracteres).' }),
    h(
      'div',
      { class: 'grid grid--3' },
      field('Categoría', f.categoria),
      field('Fecha de publicación', f.fechaPublicacion, { required: true, help: 'Si es futura, aparecerá ese día.' }),
      field('Estado', f.estado),
    ),
    field('Dirección amigable', f.slug, { help: 'Opcional: se genera desde el título.' }),
    contenido.el,
    h('div', { class: 'grid grid--2' }, principal.el, fotos.el),
    h(
      'div',
      { class: 'form-actions' },
      save,
      !isNew
        ? h('a', { class: 'btn btn--outline-blue', href: `/admin/vista-previa/noticias/${n.id}`, target: '_blank', rel: 'noopener' }, 'Vista previa ↗')
        : null,
      !isNew && ctx.can('news.delete')
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn--danger',
              onclick: async () => {
                if (!(await confirmDialog({ title: 'Eliminar noticia', message: `¿Eliminar definitivamente "${n.titulo}"?` }))) return;
                try {
                  await del(`/noticias/${n.id}`);
                  toast('Noticia eliminada.');
                  ctx.navigate('/admin/noticias');
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
        titulo: f.titulo.value,
        resumen: f.resumen.value,
        categoria: f.categoria.value,
        fechaPublicacion: f.fechaPublicacion.value,
        estado: f.estado.value,
        contenido: contenido.value,
        imagenId: principal.read()[0] ?? null,
        fotos: fotos.read(),
        ...(f.slug.value ? { slug: f.slug.value } : {}),
        ...(isNew ? {} : { version: n.version }),
      };
      try {
        const { data } = isNew ? await post('/noticias', body) : await put(`/noticias/${n.id}`, body);
        n.version = data.version;
        toast(data.estado === 'publicada' ? 'Noticia publicada. Ya aparece en el inicio.' : 'Borrador guardado.');
        if (isNew) ctx.navigate(`/admin/noticias/${data.id}`, { replace: true });
      } catch (err) {
        showFieldErrors(form, err);
        toast(errorMessage(err), 'error');
      }
    });
  });
  mount(
    main,
    h('p', {}, h('a', { href: '/admin/noticias', 'data-link': true }, '← Noticias')),
    h('h1', {}, isNew ? 'Nueva noticia' : `Editar: ${n.titulo}`),
    !canSave ? h('div', { class: 'notice' }, 'Puede consultar esta noticia, pero no tiene permiso para modificarla.') : null,
    form,
  );
}

export async function render(main, ctx, [id]) {
  return id ? edit(main, ctx, id) : list(main, ctx);
}
