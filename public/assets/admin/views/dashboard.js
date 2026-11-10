/** Resumen: cifras reales de cada módulo al que el usuario tiene acceso y accesos directos. */
import { get } from '../api.js';
import { h, mount } from '../ui.js';

export async function render(main, ctx) {
  const cards = [
    ['pages.read', 'Páginas', '/paginas', '/admin/paginas'],
    ['news.read', 'Noticias', '/noticias', '/admin/noticias'],
    ['media.read', 'Archivos multimedia', '/medios', '/admin/multimedia'],
    ['documents.read', 'Documentos de normatividad', '/documentos', '/admin/normatividad'],
    ['pqrsd.read', 'PQRSD radicadas', '/pqrsd', '/admin/pqrsd'],
    ['users.read', 'Usuarios', '/usuarios', '/admin/usuarios'],
  ].filter(([p]) => ctx.can(p));
  const totals = await Promise.all(
    cards.map(([, , api]) =>
      get(api, { pageSize: 1 })
        .then((r) => r.meta.total)
        .catch(() => null),
    ),
  );
  const drafts = ctx.can('news.read')
    ? await get('/noticias', { pageSize: 1, estado: 'borrador' })
        .then((r) => r.meta.total)
        .catch(() => 0)
    : 0;
  mount(
    main,
    h('h1', {}, `Hola, ${ctx.user.nombre.split(' ')[0]}`),
    h('p', { class: 'muted' }, `Rol: ${ctx.user.rol.nombre}. Los cambios que publique se reflejan de inmediato en el sitio.`),
    h(
      'div',
      { class: 'grid grid--3' },
      cards.map(([, label, , link], i) =>
        h(
          'a',
          { class: 'card card__body stat', href: link, 'data-link': true },
          h('span', {}, label),
          h('strong', {}, totals[i] === null ? '—' : totals[i].toLocaleString('es-CO')),
        ),
      ),
    ),
    drafts ? h('div', { class: 'notice mt-16' }, `Hay ${drafts} noticia(s) en borrador.`) : null,
    h('h2', { class: 'mt-40' }, 'Accesos rápidos'),
    h(
      'div',
      { class: 'toolbar' },
      ctx.can('news.create') ? h('a', { class: 'btn btn--primary', href: '/admin/noticias/nueva', 'data-link': true }, 'Nueva noticia') : null,
      ctx.can('pages.create') ? h('a', { class: 'btn btn--outline-blue', href: '/admin/paginas/nueva', 'data-link': true }, 'Nueva página') : null,
      ctx.can('media.upload') ? h('a', { class: 'btn btn--outline-blue', href: '/admin/multimedia', 'data-link': true }, 'Subir archivos') : null,
    ),
  );
}
