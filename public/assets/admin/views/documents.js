/** Normatividad: publicar PDF (circulares, resoluciones, decretos, acuerdos) y eliminarlos. */
import { get, del, upload } from '../api.js';
import {
  h,
  mount,
  field,
  input,
  select,
  textarea,
  table,
  pagination,
  loading,
  empty,
  errorBox,
  formatSize,
  toast,
  errorMessage,
  confirmDialog,
  busy,
  showFieldErrors,
} from '../ui.js';

const TIPOS = [
  ['circular', 'Circular'],
  ['resolucion', 'Resolución'],
  ['decreto', 'Decreto'],
  ['acuerdo', 'Acuerdo'],
];

export async function render(main, ctx) {
  const state = { page: 1, pageSize: 20 };
  const box = h('div', {}, loading());
  const tipoFiltro = select([['', 'Todos los tipos'], ...TIPOS], '', { 'aria-label': 'Tipo' });
  async function reload() {
    try {
      const { data, meta } = await get('/documentos', { ...state, tipo: tipoFiltro.value });
      mount(
        box,
        data.length
          ? table(
              [
                { label: 'Tipo', render: (d) => TIPOS.find((t) => t[0] === d.tipo)[1] },
                { label: 'Número', render: (d) => `${d.numero} de ${d.anio}` },
                { label: 'Fecha', render: (d) => d.fecha },
                { label: 'Asunto', render: (d) => d.asunto },
                { label: 'Archivo', render: (d) => h('a', { href: d.url, target: '_blank', rel: 'noopener' }, `PDF (${formatSize(d.tamano)})`) },
                {
                  label: 'Acciones',
                  render: (d) =>
                    ctx.can('documents.delete')
                      ? h(
                          'button',
                          {
                            type: 'button',
                            class: 'link-danger',
                            onclick: async () => {
                              if (!(await confirmDialog({ title: 'Eliminar documento', message: `¿Eliminar definitivamente ${d.numero} de ${d.anio}?` })))
                                return;
                              try {
                                await del(`/documentos/${d.id}`);
                                toast('Documento eliminado.');
                                reload();
                              } catch (e) {
                                toast(errorMessage(e), 'error');
                              }
                            },
                          },
                          'Eliminar',
                        )
                      : '',
                },
              ],
              data,
            )
          : empty('No hay documentos publicados.'),
        pagination(meta, (page) => {
          state.page = page;
          reload();
        }) || '',
      );
    } catch (e) {
      mount(box, errorBox(e, reload));
    }
  }
  tipoFiltro.addEventListener('change', () => {
    state.page = 1;
    reload();
  });

  let form = null;
  if (ctx.can('documents.create')) {
    const hoy = new Date().toISOString().slice(0, 10);
    const f = {
      tipo: select(TIPOS, 'circular', { name: 'tipo' }),
      numero: input({ name: 'numero', maxlength: 30 }),
      anio: input({ name: 'anio', type: 'number', min: 1990, max: 2100, value: hoy.slice(0, 4) }),
      fecha: input({ name: 'fecha', type: 'date', value: hoy }),
      asunto: textarea({ name: 'asunto', rows: 2, maxlength: 300 }),
      archivo: h('input', { type: 'file', name: 'archivo', accept: 'application/pdf,.pdf' }),
    };
    const send = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Publicar');
    form = h(
      'form',
      { class: 'form card card__body', novalidate: true },
      h('h2', { class: 'h3' }, 'Publicar documento'),
      h(
        'div',
        { class: 'grid grid--3' },
        field('Tipo', f.tipo, { required: true }),
        field('Número', f.numero, { required: true }),
        field('Año', f.anio, { required: true }),
      ),
      field('Fecha de expedición', f.fecha, { required: true }),
      field('Asunto', f.asunto, { required: true }),
      field('Archivo PDF (máx. 10 MB)', f.archivo, { required: true }),
      send,
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(send, async () => {
        const data = new FormData(form);
        try {
          await upload('POST', '/documentos', data);
          toast('Documento publicado en Normatividad.');
          form.reset();
          reload();
        } catch (err) {
          showFieldErrors(form, err);
          toast(errorMessage(err), 'error');
        }
      });
    });
  }
  mount(main, h('h1', {}, 'Normatividad'), form || '', h('div', { class: 'toolbar' }, tipoFiltro), box);
  await reload();
}
