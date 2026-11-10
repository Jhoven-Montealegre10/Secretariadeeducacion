/**
 * Sanitización del texto enriquecido con `sanitize-html` y lista blanca estricta: sin scripts,
 * estilos, eventos, iframes ni esquemas peligrosos. Enlaces externos con rel="noopener noreferrer".
 */
import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    b: 'strong',
    i: 'em',
    a: (_tagName, attribs) => {
      const href = attribs.href || '#';
      const attrs: Record<string, string> = { href };
      if (/^https?:\/\//i.test(href)) {
        attrs.target = '_blank';
        attrs.rel = 'noopener noreferrer';
      }
      return { tagName: 'a', attribs: attrs };
    },
  },
};

@Injectable()
export class HtmlSanitizer {
  sanitizeRichText(html: string | null | undefined): string {
    return sanitizeHtml(String(html ?? ''), OPTIONS).trim();
  }

  stripTags(html: string | null | undefined): string {
    return sanitizeHtml(String(html ?? ''), { allowedTags: [], allowedAttributes: {} })
      .replace(/\s+/g, ' ')
      .trim();
  }
}
