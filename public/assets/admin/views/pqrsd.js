/** PQRSD: listado, detalle con datos personales (auditado) y respuesta al ciudadano. */
import { get, put } from '../api.js';
import { h, mount, field, select, textarea, table, pagination, loading, empty, errorBox, badge, formatDate, toast, errorMessage, busy } from '../ui.js';

const ESTADOS = ['Radicada', 'En trámite', 'Respondida', 'Cerrada'];

async function detail(main, ctx, id) {
  const { data: s } = await get(`/pqrsd/${id}`);
  const estado = select(ESTADOS, s.estado, { name: 'estado' });
  const respuesta = textarea({ name: 'respuesta', rows: 8, maxlength: 10000 }, s.respuesta);
  const save = h('button', { type: 'submit', class: 'btn btn--primary' }, 'Guardar respuesta');
  const form = h(
    'form',
    { class: 'form card card__body' },
    h('h2', { class: 'h3' }, 'Gestión'),
    field('Estado', estado),
    field('Respuesta al ciudadano', respuesta, { help: 'El ciudadano la verá al consultar con su radicado y documento.' }),
    save,
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(save, async () => {
      try {
        await put(`/pqrsd/${s.id}/respuesta`, { estado: estado.value, respuesta: respuesta.value });
        toast('Solicitud actualizada.');
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    });
  });
  mount(
    main,
    h('p', {}, h('a', { href: '/admin/pqrsd', 'data-link': true }, '← PQRSD')),
    h('h1', {}, `Radicado ${s.radicado}`),
    h('div', { class: 'notice' }, 'Contiene datos personales (Ley 1581 de 2012). Este acceso quedó registrado en la auditoría.'),
    h(
      'div',
      { class: 'grid grid--2 items-start' },
      h(
        'section',
        { class: 'card card__body' },
        h('h2', { class: 'h3' }, 'Solicitud'),
        h(
          'dl',
          { class: 'meta' },
          h('dt', {}, 'Tipo'),
          h('dd', {}, s.tipo),
          h('dt', {}, 'Radicada'),
          h('dd', {}, formatDate(s.creadoEn)),
          h('dt', {}, 'Ciudadano'),
          h('dd', {}, s.nombre),
          h('dt', {}, 'Documento'),
          h('dd', {}, `${s.tipoDocumento} ${s.documento}`),
          h('dt', {}, 'Correo'),
          h('dd', {}, s.email),
          h('dt', {}, 'Teléfono'),
          h('dd', {}, s.telefono || '—'),
        ),
        h('h3', {}, s.asunto),
        ...s.mensaje.split(/\n+/).map((p) => h('p', {}, p)),
      ),
      ctx.can('pqrsd.respond') ? form : null,
    ),
  );
}

export async function render(main, ctx, [id]) {
  if (id) return detail(main, ctx, id);
  const state = { page: 1, pageSize: 25 };
  const filtro = select([['', 'Todos los estados'], ...ESTADOS.map((e) => [e, e])], '', { 'aria-label': 'Estado' });
  const box = h('div', {}, loading());
  async function reload() {
    try {
      const { data, meta } = await get('/pqrsd', { ...state, estado: filtro.value });
      mount(
        box,
        data.length
          ? table(
              [
                { label: 'Radicado', render: (s) => h('a', { href: `/admin/pqrsd/${s.id}`, 'data-link': true }, s.radicado) },
                { label: 'Fecha', render: (s) => formatDate(s.creadoEn) },
                { label: 'Tipo', render: (s) => s.tipo },
                { label: 'Ciudadano', render: (s) => s.nombre },
                { label: 'Asunto', render: (s) => s.asunto },
                { label: 'Estado', render: (s) => badge(s.estado, s.estado === 'Respondida' || s.estado === 'Cerrada' ? 'green' : 'yellow') },
              ],
              data,
            )
          : empty('No hay solicitudes.'),
        pagination(meta, (page) => {
          state.page = page;
          reload();
        }) || '',
      );
    } catch (e) {
      mount(box, errorBox(e, reload));
    }
  }
  filtro.addEventListener('change', () => {
    state.page = 1;
    reload();
  });
  mount(main, h('h1', {}, 'PQRSD'), h('div', { class: 'toolbar' }, filtro), box);
  await reload();
}
