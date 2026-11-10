/** Bitácora de auditoría (solo lectura) con filtros y verificación de integridad. */
import { get } from '../api.js';
import { h, mount, field, input, select, table, pagination, loading, empty, errorBox, badge, formatDate, toast } from '../ui.js';

export async function render(main) {
  const state = { page: 1, pageSize: 50 };
  const q = input({ type: 'search', placeholder: 'Buscar en correo, recurso o detalle' });
  const resultado = select(
    [
      ['', 'Todos'],
      ['exito', 'Éxito'],
      ['fallo', 'Fallo'],
      ['denegado', 'Denegado'],
    ],
    '',
  );
  const desde = input({ type: 'date' });
  const hasta = input({ type: 'date' });
  const box = h('div', {}, loading());
  async function reload() {
    try {
      const { data, meta } = await get('/auditoria', { ...state, q: q.value, resultado: resultado.value, desde: desde.value, hasta: hasta.value });
      mount(
        box,
        data.length
          ? table(
              [
                { label: 'Fecha (UTC)', render: (e) => formatDate(e.creadoEn) },
                { label: 'Usuario', render: (e) => e.usuarioEmail || '—' },
                { label: 'Acción', render: (e) => e.accion },
                { label: 'Recurso', render: (e) => [e.recurso || '', e.recursoId ? ` #${e.recursoId}` : ''] },
                { label: 'Resultado', render: (e) => badge(e.resultado, e.resultado === 'exito' ? 'green' : 'yellow') },
                { label: 'Detalle', render: (e) => e.detalle || '' },
              ],
              data,
              { caption: 'Eventos de auditoría' },
            )
          : empty('No hay eventos que coincidan.'),
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
  [resultado, desde, hasta].forEach((c) =>
    c.addEventListener('change', () => {
      state.page = 1;
      reload();
    }),
  );
  const verify = h(
    'button',
    {
      type: 'button',
      class: 'btn btn--outline-blue',
      onclick: async () => {
        const { data } = await get('/auditoria/integridad');
        toast(
          data.integra ? 'La bitácora está íntegra: ningún registro fue alterado.' : `Alerta: el registro #${data.idAlterado} fue alterado o eliminado.`,
          data.integra ? 'ok' : 'error',
        );
      },
    },
    'Verificar integridad',
  );
  mount(
    main,
    h('div', { class: 'page-head' }, h('h1', {}, 'Auditoría'), verify),
    h(
      'p',
      { class: 'muted' },
      'Registro de solo lectura de accesos, intentos fallidos, cambios de roles y operaciones. No incluye contraseñas, tokens ni códigos.',
    ),
    h('div', { class: 'toolbar' }, field('Buscar', q), field('Resultado', resultado), field('Desde', desde), field('Hasta', hasta)),
    box,
  );
  await reload();
}
