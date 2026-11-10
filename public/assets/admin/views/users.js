/** Usuarios (solo administradores): crear con invitación, editar, cambiar rol, desactivar, restablecer MFA, eliminar. */
import { get, post, patch, del } from '../api.js';
import {
  h,
  mount,
  field,
  input,
  select,
  checkbox,
  table,
  pagination,
  loading,
  empty,
  errorBox,
  badge,
  formatDate,
  toast,
  errorMessage,
  confirmDialog,
  modal,
  busy,
  showFieldErrors,
} from '../ui.js';

export async function render(main, ctx) {
  const state = { page: 1, pageSize: 20, sort: 'nombre' };
  const box = h('div', {}, loading());
  const roles = ctx.can('roles.read') ? (await get('/roles')).data : [];
  const q = input({ type: 'search', placeholder: 'Buscar por nombre o correo', 'aria-label': 'Buscar usuarios' });

  function openForm(u) {
    const email = input({ type: 'email', name: 'email', value: u?.email || '', maxlength: 254 });
    const nombre = input({ name: 'nombre', value: u?.nombre || '', maxlength: 120 });
    const self = u && u.id === ctx.user.id;
    const rol = roles.length
      ? select(
          roles.map((r) => [r.id, r.nombre]),
          u?.rol.id || roles.find((r) => r.slug === 'editor')?.id,
          { name: 'rolId', disabled: self },
        )
      : input({ name: 'rolId', type: 'number', value: u?.rol.id || '' });
    const activo = checkbox('Cuenta activa', u ? u.activo : true, { disabled: self });
    const form = h(
      'form',
      { class: 'form', novalidate: true },
      field('Nombre completo', nombre, { required: true }),
      field('Correo institucional', email, { required: true }),
      field('Rol', rol, { help: self ? 'No puede cambiar su propio rol.' : 'Solo puede asignar roles cuyos permisos usted también tiene.' }),
      u
        ? activo
        : h('p', { class: 'muted' }, 'Se enviará una invitación de un solo uso (72 h) para que la persona defina su contraseña y configure el segundo factor.'),
    );
    const save = h('button', { type: 'button', class: 'btn btn--primary' }, u ? 'Guardar' : 'Crear e invitar');
    const m = modal({ title: u ? 'Editar usuario' : 'Nuevo usuario', content: form, actions: [save] });
    save.addEventListener('click', () =>
      busy(save, async () => {
        const body = u
          ? { nombre: nombre.value, email: email.value, ...(self ? {} : { rolId: Number(rol.value), activo: activo.querySelector('input').checked }) }
          : { nombre: nombre.value, email: email.value, rolId: Number(rol.value) };
        try {
          u ? await patch(`/usuarios/${u.id}`, body) : await post('/usuarios', body);
          m.close();
          toast(u ? 'Usuario actualizado. Si cambió rol o estado, sus sesiones se cerraron.' : 'Usuario creado e invitación enviada.');
          reload();
        } catch (e) {
          showFieldErrors(form, e);
          toast(errorMessage(e), 'error');
        }
      }),
    );
  }

  async function action(u, kind) {
    const cfg = {
      mfa: {
        t: 'Restablecer segundo factor',
        m: `${u.nombre} deberá configurar de nuevo la aplicación autenticadora en su próximo ingreso. Sus sesiones se cerrarán.`,
        c: 'Restablecer',
        run: () => post(`/usuarios/${u.id}/mfa/restablecer`),
        ok: 'Segundo factor restablecido.',
      },
      invite: {
        t: 'Enviar enlace de acceso',
        m: `Se enviará a ${u.email} un enlace de un solo uso para definir su contraseña.`,
        c: 'Enviar',
        run: () => post(`/usuarios/${u.id}/invitacion`),
        ok: 'Enlace enviado.',
      },
      delete: {
        t: 'Eliminar usuario',
        m: `¿Eliminar definitivamente a ${u.nombre}? Considere desactivarlo en su lugar para conservar el historial.`,
        c: 'Eliminar',
        run: () => del(`/usuarios/${u.id}`),
        ok: 'Usuario eliminado.',
      },
    }[kind];
    if (!(await confirmDialog({ title: cfg.t, message: cfg.m, confirmText: cfg.c, danger: kind !== 'invite' }))) return;
    try {
      await cfg.run();
      toast(cfg.ok);
      reload();
    } catch (e) {
      toast(errorMessage(e), 'error');
    }
  }

  async function reload() {
    try {
      const { data, meta } = await get('/usuarios', { ...state, q: q.value });
      mount(
        box,
        data.length
          ? table(
              [
                { label: 'Nombre', render: (u) => [u.nombre, u.id === ctx.user.id ? ' (usted)' : ''] },
                { label: 'Correo', render: (u) => u.email },
                { label: 'Rol', render: (u) => u.rol.nombre },
                {
                  label: 'Estado',
                  render: (u) => [
                    u.activo ? badge('Activo', 'green') : badge('Inactivo', 'yellow'),
                    ' ',
                    u.mfaConfigurado ? badge('MFA') : badge('Sin MFA', 'yellow'),
                  ],
                },
                { label: 'Último acceso', render: (u) => formatDate(u.ultimoAcceso) },
                {
                  label: 'Acciones',
                  render: (u) =>
                    h(
                      'div',
                      { class: 'actions' },
                      ctx.can('users.update') ? h('button', { type: 'button', class: 'link-button', onclick: () => openForm(u) }, 'Editar') : null,
                      ctx.can('users.update') && u.id !== ctx.user.id
                        ? h('button', { type: 'button', class: 'link-button', onclick: () => action(u, 'invite') }, 'Enviar acceso')
                        : null,
                      ctx.can('users.update') && u.id !== ctx.user.id && u.mfaConfigurado
                        ? h('button', { type: 'button', class: 'link-button', onclick: () => action(u, 'mfa') }, 'Restablecer MFA')
                        : null,
                      ctx.can('users.delete') && u.id !== ctx.user.id
                        ? h('button', { type: 'button', class: 'link-danger', onclick: () => action(u, 'delete') }, 'Eliminar')
                        : null,
                    ),
                },
              ],
              data,
              { caption: 'Usuarios' },
            )
          : empty('No hay usuarios que coincidan.'),
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
  mount(
    main,
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Usuarios'),
      ctx.can('users.create') ? h('button', { type: 'button', class: 'btn btn--primary', onclick: () => openForm(null) }, '+ Nuevo usuario') : null,
    ),
    h('div', { class: 'toolbar' }, q),
    box,
  );
  await reload();
}
