/** Roles y permisos: matriz de módulo × acción con permisos explícitos. */
import { get, post, patch, del } from '../api.js';
import { h, mount, field, input, textarea, loading, badge, toast, errorMessage, confirmDialog, busy, showFieldErrors } from '../ui.js';

export async function render(main, ctx, [id]) {
  mount(main, h('h1', {}, 'Roles y permisos'), loading());
  const [{ data: catalog }, { data: roles }] = await Promise.all([get('/permisos'), get('/roles')]);
  if (id) return editor(main, ctx, catalog, id === 'nuevo' ? null : roles.find((r) => String(r.id) === id));

  mount(
    main,
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Roles y permisos'),
      ctx.can('roles.create') ? h('a', { class: 'btn btn--primary', href: '/admin/roles/nuevo', 'data-link': true }, '+ Nuevo rol') : null,
    ),
    h('p', { class: 'muted' }, 'Cada rol concede permisos explícitos por módulo y acción. Lo que no se concede está denegado.'),
    h(
      'div',
      { class: 'grid grid--3' },
      roles.map((r) =>
        h(
          'article',
          { class: 'card card__body' },
          h('h2', { class: 'h3' }, r.nombre, ' ', r.sistema ? badge('Sistema') : null),
          h('p', {}, r.descripcion || 'Sin descripción.'),
          h('p', { class: 'muted' }, `${r.permisos.length} permisos · ${r.totalUsuarios} usuario(s)`),
          h('a', { class: 'card__link', href: `/admin/roles/${r.id}`, 'data-link': true }, ctx.can('roles.update') ? 'Ver y editar' : 'Ver permisos'),
        ),
      ),
    ),
  );
}

function editor(main, ctx, catalog, role) {
  if (role === undefined) {
    mount(main, h('h1', {}, 'Rol no encontrado'));
    return;
  }
  const locked = role?.slug === 'administrador' || role?.id === ctx.user.rol.id || !ctx.can(role ? 'roles.update' : 'roles.create');
  const owned = new Set(ctx.user.permisos);
  const nombre = input({ name: 'nombre', value: role?.nombre || '', maxlength: 60, disabled: !!role?.sistema && locked });
  const descripcion = textarea({ name: 'descripcion', rows: 2, maxlength: 300 }, role?.descripcion || '');
  const selected = new Set(role?.permisos || ['dashboard.access']);
  const matrix = h(
    'div',
    { class: 'perm-matrix' },
    catalog.map((mod) =>
      h(
        'fieldset',
        { class: 'perm-group' },
        h('legend', {}, mod.nombre),
        mod.acciones.map((a) => {
          const id = `p-${a.permiso.replace('.', '-')}`;
          const cb = h('input', {
            type: 'checkbox',
            id,
            name: 'permisos',
            value: a.permiso,
            checked: selected.has(a.permiso),
            disabled: locked || !owned.has(a.permiso) || a.permiso === 'dashboard.access',
          });
          return h('label', { class: 'check', for: id }, cb, ' ', a.descripcion, h('code', { class: 'muted' }, ` ${a.permiso}`));
        }),
      ),
    ),
  );
  const form = h(
    'form',
    { class: 'form', novalidate: true },
    field('Nombre', nombre, { required: true }),
    field('Descripción', descripcion),
    h('h2', {}, 'Permisos'),
    locked && role
      ? h(
          'div',
          { class: 'notice' },
          role.slug === 'administrador'
            ? 'El rol Administrador es del sistema y siempre tiene todos los permisos.'
            : role.id === ctx.user.rol.id
              ? 'No puede modificar los permisos de su propio rol.'
              : 'Solo lectura.',
        )
      : null,
    matrix,
  );
  const save = h('button', { type: 'submit', class: 'btn btn--primary', disabled: locked && !!role }, 'Guardar rol');
  form.append(
    h(
      'div',
      { class: 'form-actions' },
      save,
      role && !role.sistema && ctx.can('roles.delete')
        ? h(
            'button',
            {
              type: 'button',
              class: 'btn btn--danger',
              onclick: async () => {
                if (
                  !(await confirmDialog({
                    title: 'Eliminar rol',
                    message: `¿Eliminar el rol "${role.nombre}"? Solo es posible si ningún usuario lo tiene asignado.`,
                  }))
                )
                  return;
                try {
                  await del(`/roles/${role.id}`);
                  toast('Rol eliminado.');
                  ctx.navigate('/admin/roles');
                } catch (e) {
                  toast(errorMessage(e), 'error');
                }
              },
            },
            'Eliminar rol',
          )
        : null,
    ),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(save, async () => {
      const permisos = [...form.querySelectorAll('input[name=permisos]:checked')].map((c) => c.value);
      try {
        if (role) await patch(`/roles/${role.id}`, { nombre: nombre.value, descripcion: descripcion.value, ...(locked ? {} : { permisos }) });
        else await post('/roles', { nombre: nombre.value, descripcion: descripcion.value, permisos });
        toast('Rol guardado. Los usuarios del rol deberán ingresar de nuevo para aplicar los cambios.');
        ctx.navigate('/admin/roles');
      } catch (err) {
        showFieldErrors(form, err);
        toast(errorMessage(err), 'error');
      }
    });
  });
  mount(main, h('p', {}, h('a', { href: '/admin/roles', 'data-link': true }, '← Roles')), h('h1', {}, role ? `Rol: ${role.nombre}` : 'Nuevo rol'), form);
}
