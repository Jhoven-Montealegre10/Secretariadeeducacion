/** Flujo de acceso: contraseña → segundo factor (o configuración inicial) → panel. */
import { post, setCsrf } from './api.js';
import { h, mount, field, input, errorMessage, showFieldErrors, busy } from './ui.js';

const root = document.getElementById('auth-root');
const view = document.querySelector('[data-auth-view]').dataset.authView;

function render(...nodes) {
  mount(root, ...nodes);
  root.querySelector('h1')?.setAttribute('tabindex', '-1');
  (root.querySelector('input') || root.querySelector('h1'))?.focus();
}

function alertBox() {
  return h('div', { class: 'notice notice--error', role: 'alert', hidden: true });
}
function showError(box, err) {
  box.textContent = errorMessage(err);
  box.hidden = false;
}

function form(onSubmit, ...children) {
  const f = h('form', { class: 'form', novalidate: true }, children);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = f.querySelector('button[type=submit]');
    await busy(button, () => onSubmit(f));
  });
  return f;
}

function loginView() {
  const err = alertBox();
  const email = input({ type: 'email', name: 'email', autocomplete: 'username', maxlength: 254 });
  const password = input({ type: 'password', name: 'password', autocomplete: 'current-password', maxlength: 128 });
  render(
    h('h1', {}, 'Ingresar'),
    err,
    form(
      async (f) => {
        try {
          const { data } = await post('/auth/login', { email: email.value, password: password.value });
          password.value = '';
          if (data.siguientePaso === 'mfa') mfaView();
          else setupView();
        } catch (e) {
          showError(err, e);
          showFieldErrors(f, e);
          password.value = '';
          password.focus();
        }
      },
      field('Correo institucional', email, { required: true }),
      field('Contraseña', password, { required: true }),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Continuar'),
    ),
    h(
      'p',
      {},
      h(
        'a',
        {
          href: '#',
          onclick: (e) => {
            e.preventDefault();
            recoverView();
          },
        },
        '¿Olvidó su contraseña?',
      ),
    ),
  );
}

function mfaView() {
  const err = alertBox();
  let useRecovery = false;
  const code = input({ name: 'codigo', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, pattern: '\\d{6}' });
  const label = h('span', {}, 'Código de 6 dígitos de su aplicación autenticadora');
  const fieldBox = field(label, code, { required: true });
  const toggle = h(
    'button',
    {
      type: 'button',
      class: 'link-button',
      onclick: () => {
        useRecovery = !useRecovery;
        label.textContent = useRecovery ? 'Código de recuperación (formato ABCDE-FGHJK)' : 'Código de 6 dígitos de su aplicación autenticadora';
        code.name = useRecovery ? 'codigoRecuperacion' : 'codigo';
        code.maxLength = useRecovery ? 20 : 6;
        code.inputMode = useRecovery ? 'text' : 'numeric';
        toggle.textContent = useRecovery ? 'Usar la aplicación autenticadora' : 'Usar un código de recuperación';
        code.value = '';
        code.focus();
      },
    },
    'Usar un código de recuperación',
  );
  render(
    h('h1', {}, 'Verificación en dos pasos'),
    err,
    form(
      async () => {
        try {
          const body = useRecovery ? { codigoRecuperacion: code.value } : { codigo: code.value.trim() };
          const { data } = await post('/auth/mfa/verificar', body);
          if (useRecovery && data.codigosRestantes <= 3) sessionStorage.setItem('aviso-codigos', String(data.codigosRestantes));
          location.assign('/admin');
        } catch (e) {
          showError(err, e);
          code.value = '';
          if (e.code === 'LOGIN_REQUIRED' || e.status === 429) setTimeout(loginView, 2500);
        }
      },
      fieldBox,
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Verificar'),
    ),
    toggle,
  );
}

async function setupView() {
  const err = alertBox();
  render(h('h1', {}, 'Configure su segundo factor'), h('p', { class: 'state state--loading' }, 'Generando código…'));
  let setup;
  try {
    setup = (await post('/auth/mfa/configuracion')).data;
  } catch (e) {
    render(h('h1', {}, 'No fue posible continuar'), h('p', {}, errorMessage(e)), h('button', { class: 'btn btn--primary', onclick: loginView }, 'Volver'));
    return;
  }
  const code = input({ name: 'codigo', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6 });
  render(
    h('h1', {}, 'Configure su segundo factor'),
    h('p', {}, 'El acceso al panel exige una aplicación autenticadora (por ejemplo, Google Authenticator, Microsoft Authenticator o FreeOTP).'),
    h(
      'ol',
      { class: 'steps' },
      h('li', {}, 'Abra la aplicación y escanee este código QR:'),
      h('li', {}, 'Escriba el código de 6 dígitos que muestra la aplicación.'),
    ),
    h('img', { src: setup.qrDataUrl, alt: 'Código QR para configurar la aplicación autenticadora', class: 'qr', width: 220, height: 220 }),
    h('details', {}, h('summary', {}, '¿No puede escanear? Escriba esta clave'), h('code', { class: 'secret' }, setup.secretoManual)),
    err,
    form(
      async (f) => {
        try {
          const { data } = await post('/auth/mfa/activar', { codigo: code.value.trim() });
          recoveryCodesView(data.codigosRecuperacion);
        } catch (e) {
          showError(err, e);
          showFieldErrors(f, e);
          code.value = '';
        }
      },
      field('Código de la aplicación', code, { required: true }),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Activar'),
    ),
  );
}

export function recoveryCodesView(codes, next = () => location.assign('/admin')) {
  const confirmBox = h('input', { type: 'checkbox', id: 'guardados' });
  const go = h('button', { type: 'button', class: 'btn btn--primary', disabled: true, onclick: next }, 'Ir al panel');
  confirmBox.addEventListener('change', () => {
    go.disabled = !confirmBox.checked;
  });
  render(
    h('h1', {}, 'Guarde sus códigos de recuperación'),
    h(
      'div',
      { class: 'notice' },
      'Cada código sirve una sola vez si pierde el teléfono. No se volverán a mostrar. Guárdelos en un lugar seguro y no los comparta.',
    ),
    h(
      'ul',
      { class: 'codes' },
      codes.map((c) => h('li', {}, h('code', {}, c))),
    ),
    h('label', { class: 'check', for: 'guardados' }, confirmBox, ' Ya guardé mis códigos en un lugar seguro'),
    go,
  );
}

function recoverView() {
  const err = alertBox();
  const email = input({ type: 'email', name: 'email', autocomplete: 'username' });
  render(
    h('h1', {}, 'Recuperar acceso'),
    h('p', {}, 'Le enviaremos un enlace de un solo uso, válido por 30 minutos.'),
    err,
    form(
      async (f) => {
        try {
          await post('/auth/recuperacion', { email: email.value });
          render(
            h('h1', {}, 'Revise su correo'),
            h('p', {}, 'Si el correo está registrado y activo, recibirá un enlace para definir una contraseña nueva.'),
            h('button', { class: 'btn btn--primary', onclick: loginView }, 'Volver al ingreso'),
          );
        } catch (e) {
          showError(err, e);
          showFieldErrors(f, e);
        }
      },
      field('Correo institucional', email, { required: true }),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Enviar enlace'),
    ),
    h('p', {}, h('a', { href: '/admin/login' }, 'Volver al ingreso')),
  );
}

function resetView() {
  // El token viaja en el fragmento (#token=…): no llega al servidor en la URL ni queda en registros.
  const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
  history.replaceState(null, '', location.pathname);
  const err = alertBox();
  const pass = input({ type: 'password', name: 'password', autocomplete: 'new-password', minlength: 12, maxlength: 128 });
  const pass2 = input({ type: 'password', name: 'confirmar', autocomplete: 'new-password' });
  if (!token) {
    render(
      h('h1', {}, 'Enlace no válido'),
      h('p', {}, 'Solicite un enlace nuevo.'),
      h('a', { class: 'btn btn--primary', href: '/admin/login' }, 'Ir al ingreso'),
    );
    return;
  }
  render(
    h('h1', {}, 'Defina su contraseña'),
    h('p', {}, 'Use una frase larga (mínimo 12 caracteres), fácil de recordar para usted y difícil de adivinar. Se rechazan contraseñas comunes.'),
    err,
    form(
      async (f) => {
        if (pass.value !== pass2.value) {
          showError(err, { message: 'Las contraseñas no coinciden.' });
          pass2.focus();
          return;
        }
        try {
          await post('/auth/recuperacion/restablecer', { token, password: pass.value });
          pass.value = '';
          pass2.value = '';
          render(
            h('h1', {}, 'Contraseña actualizada'),
            h('p', {}, 'Ya puede ingresar. Se le pedirá su segundo factor (o configurarlo si es su primer ingreso).'),
            h('a', { class: 'btn btn--primary', href: '/admin/login' }, 'Ingresar'),
          );
        } catch (e) {
          showError(err, e);
          showFieldErrors(f, e);
        }
      },
      field('Nueva contraseña', pass, { required: true }),
      field('Confirmar contraseña', pass2, { required: true }),
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Guardar contraseña'),
    ),
  );
}

setCsrf(null);
if (view === 'restablecer') resetView();
else loginView();
