/* Secretaría de Educación Municipal de Ibagué - interacciones del sitio */
(function () {
  'use strict';

  // ---------- Menú móvil ----------
  var toggle = document.querySelector('.menu-toggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? '✕ Cerrar' : '☰ Menú';
    });
  }

  // ---------- Submenús (clic / teclado) ----------
  // Un submenú solo está abierto si su botón dice aria-expanded="true" (estado y vista siempre coinciden).
  function closeSub(li, returnFocus) {
    if (!li.classList.contains('open')) return;
    li.classList.remove('open');
    var b = li.querySelector('.nav-btn');
    b.setAttribute('aria-expanded', 'false');
    if (returnFocus) b.focus();
  }
  function closeAll(except) {
    document.querySelectorAll('.has-sub.open').forEach(function (o) {
      if (o !== except) closeSub(o, false);
    });
  }
  document.querySelectorAll('.has-sub > .nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var li = btn.parentElement;
      var isOpen = li.classList.contains('open');
      closeAll(li);
      if (isOpen) closeSub(li, false);
      else {
        li.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
  document.querySelectorAll('.has-sub').forEach(function (li) {
    // Al salir del submenú con el teclado (Tab) se cierra.
    li.addEventListener('focusout', function (e) {
      if (!li.contains(e.relatedTarget)) closeSub(li, false);
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.has-sub')) closeAll(null);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.has-sub.open').forEach(function (o) {
        closeSub(o, o.contains(document.activeElement)); // el foco vuelve al botón que abrió el submenú
      });
    }
  });

  // ---------- Accesibilidad: tamaño de letra y contraste ----------
  var size = 100;
  // Solo preferencias de accesibilidad (tamaño de letra, contraste); nunca datos de sesión.
  function store(k, v) {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* almacenamiento no disponible */
    }
  }
  function read(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }

  var savedSize = parseInt(read('sem-font'), 10);
  if (savedSize) {
    size = savedSize;
    document.documentElement.style.fontSize = size + '%';
  }
  if (read('sem-contrast') === '1') document.body.classList.add('high-contrast');

  document.querySelectorAll('[data-font]').forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.getAttribute('data-font');
      size = a === '+' ? Math.min(size + 10, 140) : a === '-' ? Math.max(size - 10, 80) : 100;
      document.documentElement.style.fontSize = size + '%';
      store('sem-font', size);
    });
  });
  var contrast = document.querySelector('[data-contrast]');
  if (contrast) {
    contrast.addEventListener('click', function () {
      var on = document.body.classList.toggle('high-contrast');
      store('sem-contrast', on ? '1' : '0');
    });
  }

  // ---------- Botón volver arriba ----------
  var top = document.querySelector('.to-top');
  if (top) {
    window.addEventListener(
      'scroll',
      function () {
        top.classList.toggle('show', window.scrollY > 500);
      },
      { passive: true },
    );
    top.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ---------- Filtro instantáneo de tablas (sin recargar) ----------
  var norm = function (s) {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  };
  document.querySelectorAll('[data-filter-table]').forEach(function (input) {
    var table = document.getElementById(input.getAttribute('data-filter-table'));
    if (!table) return;
    var rows = table.querySelectorAll('tbody tr');
    input.addEventListener('input', function () {
      var q = norm(input.value);
      rows.forEach(function (r) {
        r.hidden = norm(r.textContent).indexOf(q) === -1;
      });
    });
  });

  // ---------- Confirmación antes de acciones destructivas ----------
  document.querySelectorAll('form[data-confirm]').forEach(function (f) {
    f.addEventListener('submit', function (e) {
      if (!window.confirm(f.getAttribute('data-confirm'))) e.preventDefault();
    });
  });

  // ---------- Envío automático de filtros ----------
  document.querySelectorAll('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () {
      el.form.submit();
    });
  });
})();
