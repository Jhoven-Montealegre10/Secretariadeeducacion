/* Inicialización de Swagger UI sin scripts en línea (compatible con la CSP). */
(function () {
  'use strict';
  var el = document.getElementById('swagger');
  var mode = el.getAttribute('data-mode');
  var csrf = null;

  function getCsrf() {
    if (csrf) return Promise.resolve(csrf);
    return fetch('/api/v1/auth/csrf', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (j) {
        csrf = j.data.csrfToken;
        return csrf;
      });
  }

  window.SwaggerUIBundle({
    url: el.getAttribute('data-spec'),
    domNode: el,
    deepLinking: true,
    docExpansion: 'list',
    defaultModelsExpandDepth: 0,
    // Pública: solo GET. Panel en producción: solo lectura (sin "Try it out").
    supportedSubmitMethods: mode === 'public' ? ['get'] : mode === 'admin' ? ['get', 'post', 'put', 'patch', 'delete'] : [],
    requestInterceptor: function (req) {
      req.credentials = 'same-origin';
      if (mode !== 'admin' || /^(GET|HEAD|OPTIONS)$/i.test(req.method)) return req;
      return getCsrf().then(function (token) {
        req.headers['X-CSRF-Token'] = token;
        return req;
      });
    },
  });
})();
