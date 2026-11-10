/**
 * Utilidades de interfaz del panel. Todo el contenido dinámico se inserta con textContent
 * o atributos (h()), nunca con innerHTML, para evitar XSS con datos provenientes de la API.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

let uid = 0;
export const nextId = (p = 'f') => `${p}-${++uid}`;

export function toast(message, type = 'ok') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = h('div', { class: `toast toast--${type}`, role: type === 'error' ? 'alert' : 'status' }, message);
  box.append(t);
  setTimeout(() => t.remove(), type === 'error' ? 8000 : 4000);
}

export function errorMessage(err) {
  if (!err) return 'Ocurrió un error.';
  if (err.code === 'EDIT_CONFLICT') return `${err.message} (Sus cambios no se guardaron: copie lo que necesite y recargue la página.)`;
  const extra = err.details?.length ? ' ' + err.details.map((d) => (d.campo ? `${d.campo}: ${d.mensaje}` : d.mensaje)).join(' · ') : '';
  return err.message + extra;
}

/** Diálogo modal accesible: atrapa el foco, Esc cierra, devuelve el foco al cerrar. */
export function modal({ title, content, actions = [], wide = false, onClose }) {
  const previous = document.activeElement;
  const titleId = nextId('modal-titulo');
  const dialog = h(
    'div',
    { class: `modal${wide ? ' modal--wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h(
      'div',
      { class: 'modal__head' },
      h('h2', { id: titleId }, title),
      h('button', { type: 'button', class: 'modal__close', 'aria-label': 'Cerrar', onclick: () => close() }, '×'),
    ),
    h('div', { class: 'modal__body' }, content),
    actions.length ? h('div', { class: 'modal__actions' }, actions) : null,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
  function close(result) {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    previous?.focus?.();
    onClose?.(result);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  (dialog.querySelector('input, select, textarea, .modal__actions button') || dialog.querySelector('.modal__close')).focus();
  return { close, dialog };
}

/** Confirmación de operaciones destructivas. Resuelve true/false. */
export function confirmDialog({ title = 'Confirmar', message, confirmText = 'Eliminar', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      content: typeof message === 'string' ? h('p', {}, message) : message,
      actions: [
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--outline-blue',
            onclick: () => {
              done = true;
              m.close();
              resolve(false);
            },
          },
          'Cancelar',
        ),
        h(
          'button',
          {
            type: 'button',
            class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
            onclick: () => {
              done = true;
              m.close();
              resolve(true);
            },
          },
          confirmText,
        ),
      ],
      onClose: () => {
        if (!done) resolve(false);
      },
    });
  });
}

/** Campo de formulario con etiqueta asociada, ayuda y mensaje de error. */
export function field(label, control, { help, required } = {}) {
  const id = control.id || nextId();
  control.id = id;
  if (required) control.required = true;
  const helpId = help ? `${id}-ayuda` : null;
  if (helpId) control.setAttribute('aria-describedby', helpId);
  return h(
    'div',
    { class: 'field' },
    h('label', { for: id }, label, required ? ' *' : ''),
    control,
    help ? h('small', { id: helpId }, help) : null,
    h('p', { class: 'field-error', id: `${id}-error`, hidden: true }),
  );
}

export function input(attrs = {}) {
  return h('input', { type: 'text', ...attrs });
}
export function textarea(attrs = {}, value = '') {
  const t = h('textarea', attrs);
  t.value = value;
  return t;
}
export function select(options, value, attrs = {}) {
  return h(
    'select',
    attrs,
    options.map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return h('option', { value: v, selected: String(v) === String(value) }, l);
    }),
  );
}
export function checkbox(label, checked, attrs = {}) {
  const id = attrs.id || nextId();
  return h('label', { class: 'check', for: id }, h('input', { type: 'checkbox', id, checked: !!checked, ...attrs }), ' ', label);
}

/** Marca los errores de validación del servidor en el formulario y enfoca el primero. */
export function showFieldErrors(form, err) {
  form.querySelectorAll('.field-error').forEach((p) => {
    p.hidden = true;
    p.textContent = '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((c) => c.removeAttribute('aria-invalid'));
  let first = null;
  for (const d of err.details || []) {
    const name = String(d.campo || '').split('.')[0];
    const control = name && form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!control) continue;
    control.setAttribute('aria-invalid', 'true');
    const p = document.getElementById(`${control.id}-error`);
    if (p) {
      p.textContent = d.mensaje;
      p.hidden = false;
    }
    first ||= control;
  }
  first?.focus();
}

export function loading(text = 'Cargando…') {
  return h('p', { class: 'state state--loading', role: 'status' }, text);
}
export function empty(text, action) {
  return h('div', { class: 'state state--empty' }, h('p', {}, text), action || null);
}
export function errorBox(err, retry) {
  return h(
    'div',
    { class: 'notice notice--error', role: 'alert' },
    h('p', {}, errorMessage(err)),
    retry ? h('button', { type: 'button', class: 'btn btn--outline-blue', onclick: retry }, 'Reintentar') : null,
  );
}

/** Tabla accesible con encabezados de columna. */
export function table(columns, rows, { caption } = {}) {
  return h(
    'div',
    { class: 'table-wrap' },
    h(
      'table',
      {},
      caption ? h('caption', { class: 'sr-only' }, caption) : null,
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          columns.map((c) => h('th', { scope: 'col' }, c.label)),
        ),
      ),
      h(
        'tbody',
        {},
        rows.map((r) =>
          h(
            'tr',
            {},
            columns.map((c) => h('td', { 'data-label': c.label }, c.render(r))),
          ),
        ),
      ),
    ),
  );
}

export function pagination(meta, onPage) {
  if (!meta || meta.totalPages <= 1) return null;
  return h(
    'nav',
    { class: 'pagination', 'aria-label': 'Paginación' },
    h('button', { type: 'button', class: 'btn btn--outline-blue', disabled: meta.page <= 1, onclick: () => onPage(meta.page - 1) }, '← Anterior'),
    h('span', {}, `Página ${meta.page} de ${meta.totalPages} · ${meta.total} registros`),
    h(
      'button',
      { type: 'button', class: 'btn btn--outline-blue', disabled: meta.page >= meta.totalPages, onclick: () => onPage(meta.page + 1) },
      'Siguiente →',
    ),
  );
}

export function formatDate(s) {
  if (!s) return '—';
  const d = new Date(s.includes('T') || s.length <= 10 ? s : s.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString('es-CO', s.length <= 10 ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', timeStyle: 'short' });
}
export const formatSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const badge = (text, kind = '') => h('span', { class: `badge${kind ? ` badge--${kind}` : ''}` }, text);
export const statusBadge = (estado) => badge(estado === 'publicada' ? 'Publicada' : 'Borrador', estado === 'publicada' ? 'green' : 'yellow');

/** Botón que muestra estado de carga mientras corre la acción y evita envíos dobles. */
export async function busy(button, fn) {
  const text = button.textContent;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Guardando…';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = text;
  }
}

/** Reemplaza el contenido de un contenedor ignorando nodos vacíos (null/false/undefined). */
export function mount(el, ...nodes) {
  el.replaceChildren(...nodes.flat(Infinity).filter((n) => n !== null && n !== undefined && n !== false && n !== ''));
}
