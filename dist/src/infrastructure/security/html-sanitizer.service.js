"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HtmlSanitizer = void 0;
/**
 * Sanitización del texto enriquecido con `sanitize-html` y lista blanca estricta: sin scripts,
 * estilos, eventos, iframes ni esquemas peligrosos. Enlaces externos con rel="noopener noreferrer".
 */
const common_1 = require("@nestjs/common");
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const OPTIONS = {
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
            const attrs = { href };
            if (/^https?:\/\//i.test(href)) {
                attrs.target = '_blank';
                attrs.rel = 'noopener noreferrer';
            }
            return { tagName: 'a', attribs: attrs };
        },
    },
};
let HtmlSanitizer = class HtmlSanitizer {
    sanitizeRichText(html) {
        return (0, sanitize_html_1.default)(String(html ?? ''), OPTIONS).trim();
    }
    stripTags(html) {
        return (0, sanitize_html_1.default)(String(html ?? ''), { allowedTags: [], allowedAttributes: {} })
            .replace(/\s+/g, ' ')
            .trim();
    }
};
exports.HtmlSanitizer = HtmlSanitizer;
exports.HtmlSanitizer = HtmlSanitizer = __decorate([
    (0, common_1.Injectable)()
], HtmlSanitizer);
//# sourceMappingURL=html-sanitizer.service.js.map