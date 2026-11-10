/**
 * Estadísticas (solo administradores). Gráficos de una sola serie en azul GOV.CO (#3366CC,
 * validado en contraste), barras finas con extremo redondeado, tooltip al pasar el cursor o
 * enfocar, y la misma información en tablas. Sin datos: estado vacío, nunca cifras inventadas.
 */
import { get } from '../api.js';
import { h, mount, field, input, loading, empty, errorBox, table } from '../ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVG, tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  kids.forEach((k) => el.append(k));
  return el;
};
const LABELS = {
  directo: 'Directo',
  buscador: 'Buscadores',
  redes_sociales: 'Redes sociales',
  otro_sitio: 'Otros sitios',
  interno: 'Navegación interna',
  campana: 'Campañas',
  escritorio: 'Computador',
  movil: 'Celular',
  tablet: 'Tableta',
  otro: 'Otro',
};
const label = (v) => LABELS[v] || v;
const fmt = (n) => Number(n).toLocaleString('es-CO');

function dailyChart(rows) {
  const W = 720,
    H = 220,
    P = { t: 12, r: 8, b: 28, l: 40 };
  const max = Math.max(1, ...rows.map((r) => r.visitas));
  const bw = (W - P.l - P.r) / rows.length;
  const y = (v) => H - P.b - (v / max) * (H - P.t - P.b);
  const tip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Visitas por día' });
  [0, 0.5, 1].forEach((f) => {
    const v = Math.round(max * f);
    svg.append(
      s('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'chart-grid' }),
      s('text', { x: P.l - 6, y: y(v) + 4, class: 'chart-axis', 'text-anchor': 'end' }, String(v)),
    );
  });
  rows.forEach((r, i) => {
    const x = P.l + i * bw;
    const barW = Math.max(2, Math.min(18, bw - 2)); // separación de 2px entre barras
    const top = y(r.visitas);
    const height = Math.max(0, H - P.b - top);
    const g = s('g', { tabindex: '0', class: 'chart-hit', 'aria-label': `${r.fecha}: ${r.visitas} visitas, ${r.visitantes} visitantes` });
    g.append(s('rect', { x, y: P.t, width: bw, height: H - P.t - P.b, fill: 'transparent' }));
    if (height > 0)
      g.append(s('path', { class: 'chart-bar', d: `M${x + (bw - barW) / 2},${H - P.b} v${-(height - 4)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 v${height - 4} z` }));
    const show = () => {
      tip.hidden = false;
      tip.textContent = `${r.fecha} · ${fmt(r.visitas)} visitas · ${fmt(r.visitantes)} visitantes`;
    };
    g.addEventListener('mouseenter', show);
    g.addEventListener('focus', show);
    g.addEventListener('mouseleave', () => {
      tip.hidden = true;
    });
    g.addEventListener('blur', () => {
      tip.hidden = true;
    });
    svg.append(g);
  });
  const every = Math.ceil(rows.length / 8);
  rows.forEach((r, i) => {
    if (i % every === 0) svg.append(s('text', { x: P.l + i * bw + bw / 2, y: H - 8, class: 'chart-axis', 'text-anchor': 'middle' }, r.fecha.slice(5)));
  });
  return h('div', { class: 'chart-box' }, svg, tip);
}

function bars(title, rows, map = (r) => [label(r.valor), r.visitas]) {
  if (!rows.length) return h('section', { class: 'card card__body' }, h('h2', { class: 'h3' }, title), h('p', { class: 'muted' }, 'Sin datos en el rango.'));
  const total = rows.reduce((a, r) => a + map(r)[1], 0);
  const max = Math.max(...rows.map((r) => map(r)[1]));
  return h(
    'section',
    { class: 'card card__body' },
    h('h2', { class: 'h3' }, title),
    h(
      'ul',
      { class: 'hbars' },
      rows.map((r) => {
        const [name, n] = map(r);
        return h(
          'li',
          {},
          h('span', { class: 'hbars__label' }, name),
          h('span', { class: 'hbars__track' }, h('span', { class: 'hbars__bar', style: null, dataset: { w: String(Math.round((n / max) * 100)) } })),
          h('span', { class: 'hbars__value' }, `${fmt(n)} (${Math.round((n / total) * 100)}%)`),
        );
      }),
    ),
  );
}

export async function render(main) {
  const hoy = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
  const hace30 = new Date(Date.now() - 5 * 3600e3 - 29 * 864e5).toISOString().slice(0, 10);
  const desde = input({ type: 'date', value: hace30, max: hoy });
  const hasta = input({ type: 'date', value: hoy, max: hoy });
  const box = h('div', {}, loading());
  async function load() {
    mount(box, loading());
    try {
      const { data: r } = await get('/estadisticas', { desde: desde.value, hasta: hasta.value });
      if (r.vacio) {
        mount(box, empty('Aún no hay visitas registradas en este rango. Las métricas aparecerán cuando el sitio público reciba visitas.'));
        return;
      }
      mount(
        box,
        h(
          'div',
          { class: 'grid grid--3 stat-cards' },
          h('div', { class: 'card card__body stat' }, h('span', {}, 'Visitas'), h('strong', {}, fmt(r.resumen.visitas))),
          h('div', { class: 'card card__body stat' }, h('span', {}, 'Visitantes únicos (estimado)'), h('strong', {}, fmt(r.resumen.visitantesUnicosEstimados))),
          h(
            'div',
            { class: 'card card__body stat' },
            h('span', {}, 'Promedio diario'),
            h('strong', {}, fmt(Math.round(r.resumen.visitas / Math.max(1, r.porDia.length)))),
          ),
        ),
        h(
          'section',
          { class: 'card card__body' },
          h('h2', { class: 'h3' }, 'Visitas por día'),
          dailyChart(r.porDia),
          h(
            'details',
            {},
            h('summary', {}, 'Ver como tabla'),
            table(
              [
                { label: 'Fecha', render: (d) => d.fecha },
                { label: 'Visitas', render: (d) => fmt(d.visitas) },
                { label: 'Visitantes', render: (d) => fmt(d.visitantes) },
              ],
              r.porDia,
            ),
          ),
        ),
        h(
          'div',
          { class: 'grid grid--2' },
          bars('Páginas más visitadas', r.paginas, (p) => [p.ruta, p.visitas]),
          bars('Fuentes de tráfico', r.fuentes),
          bars('Tipo de dispositivo', r.dispositivos),
          bars('Sitios que envían visitas', r.referentes, (p) => [p.valor, p.visitas]),
          bars('País (aproximado)', r.paises, (p) => [p.valor, p.visitas]),
        ),
        h(
          'p',
          { class: 'muted' },
          `Método: sin cookies ni direcciones IP; visitantes únicos estimados por día con un identificador temporal que se descarta a diario. Se excluyen robots y personas con "No rastrear" activado. Retención: ${r.retencionDias} días. El país solo aparece si el servidor proxy lo informa.`,
        ),
      );
      box.querySelectorAll('.hbars__bar').forEach((b) => b.style.setProperty('--w', `${b.dataset.w}%`));
    } catch (e) {
      mount(box, errorBox(e, load));
    }
  }
  desde.addEventListener('change', load);
  hasta.addEventListener('change', load);
  mount(main, h('h1', {}, 'Estadísticas'), h('div', { class: 'toolbar' }, field('Desde', desde), field('Hasta', hasta)), box);
  await load();
}
