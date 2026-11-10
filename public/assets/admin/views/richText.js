/**
 * Editor de texto enriquecido mínimo (sin escribir HTML): negrita, cursiva, subtítulo,
 * listas, cita y enlaces. El resultado SIEMPRE se sanitiza en el servidor con lista blanca.
 */
import { h, nextId } from '../ui.js';

const TOOLS = [
  ['bold', 'N', 'Negrita'],
  ['italic', 'C', 'Cursiva'],
  ['h3', 'T', 'Subtítulo'],
  ['insertUnorderedList', '• Lista', 'Lista con viñetas'],
  ['insertOrderedList', '1. Lista', 'Lista numerada'],
  ['blockquote', '❝', 'Cita'],
  ['link', 'Enlace', 'Insertar enlace'],
  ['unlink', 'Quitar enlace', 'Quitar enlace'],
];

export function richText(label, html = '', { required = false, help = '' } = {}) {
  const id = nextId('editor');
  const area = h('div', { class: 'rte__area', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': `${id}-label`, id });
  // Contenido previamente sanitizado por el servidor; la CSP impide ejecutar scripts.
  area.innerHTML = html || '<p></p>';
  const bar = h(
    'div',
    { class: 'rte__bar', role: 'toolbar', 'aria-label': `Formato de ${label}` },
    TOOLS.map(([cmd, text, title]) =>
      h('button', { type: 'button', title, 'aria-label': title, onmousedown: (e) => e.preventDefault(), onclick: () => exec(cmd) }, text),
    ),
  );
  function exec(cmd) {
    area.focus();
    if (cmd === 'h3' || cmd === 'blockquote') document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'link') {
      const url = prompt('Dirección del enlace (https://…, /ruta interna, mailto: o tel:)');
      if (url && /^(https?:\/\/|\/(?!\/)|mailto:|tel:|#)/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
    } else document.execCommand(cmd);
  }
  area.addEventListener('paste', (e) => {
    // pegar como texto plano evita estilos y HTML ajenos
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  const el = h(
    'div',
    { class: 'field rte' },
    h('span', { class: 'label', id: `${id}-label` }, label, required ? ' *' : ''),
    bar,
    area,
    help ? h('small', {}, help) : null,
  );
  return {
    el,
    get value() {
      return area.innerHTML;
    },
    focus: () => area.focus(),
  };
}
