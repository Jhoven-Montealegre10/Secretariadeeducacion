/**
 * Panel de administración (SPA sin dependencias). Enrutador por History API, menú lateral
 * según permisos y vistas por módulo. Ocultar opciones del menú es solo comodidad: cada
 * operación la autoriza el backend.
 */
import { get, post, setCsrf } from './api.js';
import { h, errorBox, toast } from './ui.js';

const MENU = [
  { path: '/admin', label: 'Resumen', perm: 'dashboard.access', load: () => import('./views/dashboard.js') },
  { path: '/admin/paginas', label: 'Páginas', perm: 'pages.read', load: () => import('./views/pages.js') },
  { path: '/admin/noticias', label: 'Noticias', perm: 'news.read', load: () => import('./views/news.js') },
  { path: '/admin/multimedia', label: 'Multimedia', perm: 'media.read', load: () => import('./views/media.js') },
  { path: '/admin/sliders', label: 'Sliders', perm: 'sliders.read', load: () => import('./views/sliders.js') },
  { path: '/admin/normatividad', label: 'Normatividad', perm: 'documents.read', load: () => import('./views/documents.js') },
  { path: '/admin/pqrsd', label: 'PQRSD', perm: 'pqrsd.read', load: () => import('./views/pqrsd.js') },
  { path: '/admin/usuarios', label: 'Usuarios', perm: 'users.read', load: () => import('./views/users.js') },
  { path: '/admin/roles', label: 'Roles y permisos', perm: 'roles.read', load: () => import('./views/roles.js') },
  { path: '/admin/estadisticas', label: 'Estadísticas', perm: 'stats.read', load: () => import('./views/stats.js') },
  { path: '/admin/auditoria', label: 'Auditoría', perm: 'audit.read', load: () => import('./views/audit.js') },
  { path: '/admin/cuenta', label: 'Mi cuenta', perm: 'dashboard.access', load: () => import('./views/account.js') },
];

const main = document.getElementById('vista');
const menu = document.getElementById('admin-menu');
const sidebar = document.getElementById('admin-sidebar');
const toggle = document.querySelector('.admin-menu-toggle');
let session = null;

const ctx = {
  get user() {
    return session.usuario;
  },
  can: (p) => session.usuario.permisos.includes(p),
  navigate,
  setTitle(text) {
    document.title = `${text} | Panel SEM Ibagué`;
  },
  refreshSession: loadSession,
};

function routeFor(pathname) {
  const sorted = [...MENU].sort((a, b) => b.path.length - a.path.length);
  // El resumen (/admin) solo responde a su ruta exacta: /admin/<algo-inexistente> no debe mostrarlo.
  return sorted.find((r) => pathname === r.path || (r.path !== '/admin' && pathname.startsWith(`${r.path}/`)));
}

function renderMenu(pathname) {
  const current = routeFor(pathname);
  menu.replaceChildren(
    ...MENU.filter((r) => ctx.can(r.perm)).map((r) =>
      h('li', {}, h('a', { href: r.path, 'aria-current': r === current ? 'page' : false, 'data-link': true }, r.label)),
    ),
  );
  menu.append(h('li', {}, h('a', { href: '/admin/api-docs', target: '_blank', rel: 'noopener' }, 'Documentación API ↗')));
}

async function render() {
  const pathname = location.pathname.replace(/\/+$/, '') || '/admin';
  const route = routeFor(pathname);
  renderMenu(pathname);
  sidebar.classList.remove('open');
  toggle.setAttribute('aria-expanded', 'false');
  if (!route || !ctx.can(route.perm)) {
    main.replaceChildren(h('h1', {}, 'Sin acceso'), h('p', {}, 'No tiene permisos para esta sección o la sección no existe.'));
    return;
  }
  main.replaceChildren(h('p', { class: 'state state--loading', role: 'status' }, 'Cargando…'));
  try {
    const mod = await route.load();
    const rest = pathname.slice(route.path.length).split('/').filter(Boolean);
    await mod.render(main, ctx, rest);
  } catch (err) {
    main.replaceChildren(h('h1', {}, 'Error'), errorBox(err, render));
  }
  const heading = main.querySelector('h1');
  if (heading) {
    heading.tabIndex = -1;
    heading.focus();
    ctx.setTitle(heading.textContent);
  }
}

function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  render();
}

async function loadSession() {
  const { data } = await get('/auth/sesion');
  session = data;
  setCsrf(data.csrfToken);
  document.getElementById('usuario-actual').textContent = `${data.usuario.nombre} · ${data.usuario.rol.nombre}`;
  return data;
}

// Aviso de inactividad: la sesión del servidor expira tras el tiempo configurado sin actividad.
let idleTimer;
function armIdleWarning() {
  clearTimeout(idleTimer);
  const ms = Math.max(60, (session?.expiraPorInactividadEnSegundos || 1800) - 120) * 1000;
  idleTimer = setTimeout(() => toast('Su sesión expirará en 2 minutos por inactividad. Guarde su trabajo.', 'warn'), ms);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
document.addEventListener('click', armIdleWarning);
window.addEventListener('popstate', render);
window.addEventListener('sesion-expirada', () => {
  toast('Su sesión terminó. Ingrese de nuevo.', 'error');
  setTimeout(() => location.assign('/admin/login'), 1500);
});
toggle.addEventListener('click', () => {
  const open = sidebar.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
});
document.getElementById('btn-salir').addEventListener('click', async () => {
  try {
    await post('/auth/logout');
  } finally {
    location.assign('/admin/login');
  }
});

(async () => {
  try {
    await loadSession();
  } catch {
    location.assign('/admin/login');
    return;
  }
  const aviso = sessionStorage.getItem('aviso-codigos');
  if (aviso) {
    sessionStorage.removeItem('aviso-codigos');
    toast(`Le quedan ${aviso} códigos de recuperación. Genere nuevos en "Mi cuenta".`, 'warn');
  }
  armIdleWarning();
  render();
})();
