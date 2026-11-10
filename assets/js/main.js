/* Secretaría de Educación Municipal de Ibagué - interacciones del sitio */
(function () {
  "use strict";

  // ---------- Menú móvil ----------
  var toggle = document.querySelector(".menu-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "✕ Cerrar" : "☰ Menú";
    });
  }

  // ---------- Submenús (clic / teclado) ----------
  document.querySelectorAll(".has-sub > .nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var li = btn.parentElement;
      var isOpen = li.classList.contains("open");
      document.querySelectorAll(".has-sub.open").forEach(function (o) {
        o.classList.remove("open");
        o.querySelector(".nav-btn").setAttribute("aria-expanded", "false");
      });
      if (!isOpen) {
        li.classList.add("open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".has-sub")) {
      document.querySelectorAll(".has-sub.open").forEach(function (o) { o.classList.remove("open"); });
    }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".has-sub.open").forEach(function (o) { o.classList.remove("open"); });
    }
  });

  // ---------- Accesibilidad: tamaño de letra y contraste ----------
  var size = 100;
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  var savedSize = parseInt(read("sem-font"), 10);
  if (savedSize) { size = savedSize; document.documentElement.style.fontSize = size + "%"; }
  if (read("sem-contrast") === "1") document.body.classList.add("high-contrast");

  document.querySelectorAll("[data-font]").forEach(function (b) {
    b.addEventListener("click", function () {
      var a = b.getAttribute("data-font");
      size = a === "+" ? Math.min(size + 10, 140) : a === "-" ? Math.max(size - 10, 80) : 100;
      document.documentElement.style.fontSize = size + "%";
      store("sem-font", size);
    });
  });
  var contrast = document.querySelector("[data-contrast]");
  if (contrast) {
    contrast.addEventListener("click", function () {
      var on = document.body.classList.toggle("high-contrast");
      store("sem-contrast", on ? "1" : "0");
    });
  }

  // ---------- Botón volver arriba ----------
  var top = document.querySelector(".to-top");
  if (top) {
    window.addEventListener("scroll", function () {
      top.classList.toggle("show", window.scrollY > 500);
    }, { passive: true });
    top.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  // ---------- Año actual en el pie de página ----------
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // ---------- Buscador interno ----------
  var INDEX = [
    { t: "Inicio", u: "index.html", k: "inicio portal secretaría educación ibagué" },
    { t: "La Secretaría: misión, visión y funciones", u: "secretaria.html", k: "misión visión objetivos funciones organigrama secretario despacho quiénes somos" },
    { t: "Dependencias y directorio", u: "secretaria.html#dependencias", k: "dependencias direcciones oficinas directorio funcionarios cobertura calidad talento humano" },
    { t: "Trámites y servicios", u: "tramites.html", k: "trámites servicios matrícula cupos certificados laborales legalización títulos licencia funcionamiento" },
    { t: "Certificados laborales y de tiempo de servicio", u: "tramites.html#docentes", k: "certificado laboral docente tiempo servicio salario humano" },
    { t: "Fondo de Prestaciones Económicas (FOMAG)", u: "tramites.html#prestaciones", k: "fondo prestaciones cesantías pensiones fomag docentes" },
    { t: "Matrícula y cupos escolares", u: "tramites.html#matricula", k: "matrícula cupos inscripción estudiantes simat traslado" },
    { t: "Atención al ciudadano y PQRSD", u: "atencion.html", k: "pqrsd peticiones quejas reclamos sugerencias denuncias sac radicar" },
    { t: "Comunidad educativa", u: "comunidad.html", k: "docentes directivos estudiantes padres familia instituciones educativas colegios" },
    { t: "Instituciones educativas oficiales", u: "comunidad.html#instituciones", k: "instituciones educativas colegios oficiales sedes rurales urbanas" },
    { t: "Normatividad: circulares, resoluciones y decretos", u: "normatividad.html", k: "normatividad circulares resoluciones decretos acuerdos leyes 2025 2026" },
    { t: "Transparencia y acceso a la información", u: "transparencia.html", k: "transparencia ley 1712 contratación presupuesto planes informes gestión rendición cuentas" },
    { t: "Noticias", u: "noticias.html", k: "noticias eventos comunicados boletines" },
    { t: "Contacto", u: "contacto.html", k: "contacto dirección teléfono correo horario ubicación mapa" }
  ];

  var results = document.getElementById("search-results");
  if (results) {
    var q = (new URLSearchParams(location.search).get("q") || "").trim();
    var input = document.getElementById("q-page");
    if (input) input.value = q;
    var norm = function (s) { return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); };
    var words = norm(q).split(/\s+/).filter(Boolean);
    var hits = INDEX.filter(function (p) {
      var hay = norm(p.t + " " + p.k);
      return words.length && words.every(function (w) { return hay.indexOf(w) !== -1; });
    });
    if (!q) {
      results.innerHTML = "<p>Escriba un término en el buscador.</p>";
    } else if (!hits.length) {
      results.innerHTML = "<p>No se encontraron resultados para <strong></strong>. Intente con otras palabras o visite <a href=\"tramites.html\">Trámites y servicios</a>.</p>";
      results.querySelector("strong").textContent = q;
    } else {
      var ul = document.createElement("ul");
      ul.className = "footer-list";
      hits.forEach(function (h) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.href = h.u; a.textContent = h.t; a.style.fontSize = "1.1rem"; a.style.fontWeight = "600";
        li.appendChild(a); ul.appendChild(li);
      });
      results.innerHTML = "<p>" + hits.length + " resultado(s):</p>";
      results.appendChild(ul);
    }
  }
})();
