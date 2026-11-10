'use strict';
/**
 * Sanitización del texto enriquecido (páginas y noticias) con `sanitize-html`, lista blanca
 * estricta: sin scripts, estilos, atributos de eventos, iframes ni esquemas peligrosos.
 * Se aplica al guardar; las vistas solo imprimen sin escapar el HTML que pasó por aquí.
 */
const sanitizeHtml = require('sanitize-html');

/** @type {import('sanitize-html').IOptions} */
const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: /** @type {const} */ ('discard'),
  enforceHtmlBoundary: false,
  transformTags: {
    b: 'strong',
    i: 'em',
    a: (tagName, attribs) => {
      const external = /^https?:\/\//i.test(attribs.href || '');
      const attrs = { href: attribs.href || '#' };
      if (external) {
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      return { tagName: 'a', attribs: attrs };
    },
  },
};

function sanitizeRichText(html) {
  return sanitizeHtml(String(html || ''), OPTIONS).trim();
}

/** Texto plano: elimina cualquier etiqueta. */
function stripTags(html) {
  return sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { sanitizeRichText, stripTags };
