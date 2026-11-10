/** Mi cuenta: nombre, contraseña, cambio de dispositivo MFA y códigos de recuperación (con reautenticación). */
import { post, put, patch } from '../api.js';
import { h, mount, field, input, toast, errorMessage, showFieldErrors, busy, modal } from '../ui.js';

function reauth() {
  return new Promise((resolve) => {
    const pass = input({ type: 'password', autocomplete: 'current-password', name: 'password' });
    const code = input({ inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', name: 'codigo' });
    let ok = false;
    const go = h('button', { type: 'button', class: 'btn btn--primary' }, 'Confirmar');
    const m = modal({
      title: 'Confirme su identidad',
      content: h('div', { class: 'form' }, field('Contraseña', pass, { required: true }), field('Código de su aplicación', code, { required: true })),
      actions: [go],
      onClose: () => resolve(ok),
    });
    go.addEventListener('click', () =>
      busy(go, async () => {
        try {
          await post('/cuenta/reautenticar', { password: pass.value, codigo: code.value.trim() });
          ok = true;
          m.close();
        } catch (e) {
          toast(errorMessage(e), 'error');
          pass.value = '';
          code.value = '';
        }
      }),
    );
  });
}

function showCodes(codes) {
  modal({
    title: 'Códigos de recuperación nuevos',
    content: h(
      'div',
      {},
      h('div', { class: 'notice' }, 'Guárdelos en un lugar seguro. Los anteriores ya no sirven y estos no se volverán a mostrar.'),
      h(
        'ul',
        { class: 'codes' },
        codes.map((c) => h('li', {}, h('code', {}, c))),
      ),
    ),
  });
}

export async function render(main, ctx) {
  const nombre = input({ name: 'nombre', value: ctx.user.nombre, maxlength: 120 });
  const profile = h(
    'form',
    { class: 'form card card__body', novalidate: true },
    h('h2', { class: 'h3' }, 'Datos'),
    h('p', {}, `${ctx.user.email} · Rol: ${ctx.user.rol.nombre}`),
    field('Nombre', nombre, { required: true }),
    h('button', { type: 'submit', class: 'btn btn--primary' }, 'Guardar'),
  );
  profile.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(profile.querySelector('button'), async () => {
      try {
        await patch('/cuenta/perfil', { nombre: nombre.value });
        await ctx.refreshSession();
        toast('Datos actualizados.');
      } catch (err) {
        showFieldErrors(profile, err);
        toast(errorMessage(err), 'error');
      }
    });
  });

  const actual = input({ type: 'password', name: 'actual', autocomplete: 'current-password' });
  const nueva = input({ type: 'password', name: 'nueva', autocomplete: 'new-password', minlength: 12, maxlength: 128 });
  const password = h(
    'form',
    { class: 'form card card__body', novalidate: true },
    h('h2', { class: 'h3' }, 'Contraseña'),
    field('Contraseña actual', actual, { required: true }),
    field('Nueva contraseña', nueva, {
      required: true,
      help: 'Mínimo 12 caracteres. Se rechazan contraseñas comunes o filtradas. Se cerrarán sus otras sesiones.',
    }),
    h('button', { type: 'submit', class: 'btn btn--primary' }, 'Cambiar contraseña'),
  );
  password.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(password.querySelector('button'), async () => {
      try {
        await put('/cuenta/password', { actual: actual.value, nueva: nueva.value });
        actual.value = '';
        nueva.value = '';
        toast('Contraseña actualizada. Sus otras sesiones se cerraron.');
      } catch (err) {
        showFieldErrors(password, err);
        toast(errorMessage(err), 'error');
      }
    });
  });

  const mfa = h(
    'section',
    { class: 'card card__body' },
    h('h2', { class: 'h3' }, 'Segundo factor (MFA)'),
    h('p', {}, 'El segundo factor es obligatorio. Para operaciones sobre él se le pedirá su contraseña y un código.'),
    h(
      'div',
      { class: 'form-actions' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--outline-blue',
          onclick: async () => {
            if (!(await reauth())) return;
            try {
              showCodes((await post('/cuenta/mfa/codigos-recuperacion')).data.codigosRecuperacion);
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          },
        },
        'Generar códigos de recuperación nuevos',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--outline-blue',
          onclick: async () => {
            if (!(await reauth())) return;
            try {
              const { data } = await post('/cuenta/mfa/configuracion');
              const code = input({ inputmode: 'numeric', maxlength: 6, name: 'codigo' });
              const go = h('button', { type: 'button', class: 'btn btn--primary' }, 'Activar nuevo dispositivo');
              const m = modal({
                title: 'Configurar nuevo dispositivo',
                actions: [go],
                content: h(
                  'div',
                  {},
                  h('p', {}, 'Escanee el código con la nueva aplicación y escriba el código que muestra.'),
                  h('img', { src: data.qrDataUrl, alt: 'Código QR para la aplicación autenticadora', class: 'qr', width: 220, height: 220 }),
                  h('details', {}, h('summary', {}, 'Clave manual'), h('code', { class: 'secret' }, data.secretoManual)),
                  field('Código', code, { required: true }),
                ),
              });
              go.addEventListener('click', () =>
                busy(go, async () => {
                  try {
                    const r = await post('/cuenta/mfa/activar', { codigo: code.value.trim() });
                    m.close();
                    showCodes(r.data.codigosRecuperacion);
                    toast('Nuevo dispositivo activo. El anterior dejó de funcionar.');
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                  }
                }),
              );
            } catch (e) {
              toast(errorMessage(e), 'error');
            }
          },
        },
        'Cambiar de dispositivo',
      ),
    ),
  );

  mount(main, h('h1', {}, 'Mi cuenta'), h('div', { class: 'grid grid--2 items-start' }, profile, password), mfa);
}
