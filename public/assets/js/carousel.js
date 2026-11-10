/* Carrusel accesible: controles con etiqueta, pausa, teclado y respeto a "reducir movimiento". */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-carousel]').forEach(function (root) {
    var slides = root.querySelectorAll('.slider__slide');
    if (slides.length < 2) return;
    var index = 0;
    var timer = null;
    var toggle = root.querySelector('[data-toggle]');

    function show(i) {
      slides[index].classList.remove('is-active');
      slides[index].hidden = true;
      index = (i + slides.length) % slides.length;
      slides[index].hidden = false;
      slides[index].classList.add('is-active');
    }
    function play() {
      if (reduce) return;
      stop();
      timer = setInterval(function () {
        show(index + 1);
      }, 7000);
      toggle.setAttribute('aria-label', 'Pausar el carrusel');
      toggle.textContent = '❚❚';
    }
    function stop() {
      clearInterval(timer);
      timer = null;
      toggle.setAttribute('aria-label', 'Reanudar el carrusel');
      toggle.textContent = '▶';
    }
    root.querySelector('[data-prev]').addEventListener('click', function () {
      stop();
      show(index - 1);
    });
    root.querySelector('[data-next]').addEventListener('click', function () {
      stop();
      show(index + 1);
    });
    toggle.addEventListener('click', function () {
      if (timer) stop();
      else play();
    });
    root.addEventListener('focusin', stop);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        stop();
        show(index - 1);
      }
      if (e.key === 'ArrowRight') {
        stop();
        show(index + 1);
      }
    });
    if (reduce) stop();
    else play();
  });
})();
