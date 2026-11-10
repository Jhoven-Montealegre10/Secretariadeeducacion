'use strict';
/**
 * Panel de administración: el servidor solo entrega la estructura (shell) y las vistas
 * previas protegidas; todas las operaciones se hacen desde el navegador contra la API REST.
 */
const { z } = require('zod');
const { authorize } = require('../../../../application/authorization');
const { NotFoundError } = require('../../../../domain/errors');

function createAdminWebController({ pageService, newsService, sliderService, siteController, mediaService }) {
  const id = (v) => {
    const r = z.coerce.number().int().positive().safeParse(v);
    if (!r.success) throw new NotFoundError();
    return r.data;
  };

  return {
    loginPage(req, res) {
      if (req.actor) return res.redirect('/admin');
      res.render('admin/auth', { title: 'Ingreso al panel', vista: 'login' });
    },

    resetPage(req, res) {
      res.render('admin/auth', { title: 'Definir contraseña', vista: 'restablecer' });
    },

    shell(req, res) {
      if (!req.actor) return res.redirect('/admin/login');
      res.render('admin/app', { title: 'Panel de administración' });
    },

    /** Vista previa protegida de páginas en borrador (no indexable, sin caché). */
    previewPage(req, res) {
      authorize(req.actor, 'pages.read');
      const pagina = pageService.get(req.actor, id(req.params.id));
      pagina.bloques = pageService.sanitizeBlocks(pagina.bloques);
      res.render('pages/pagina', {
        title: `Vista previa: ${pagina.titulo}`,
        nav: pagina.slug,
        pagina,
        vistaPrevia: true,
        slider: sliderService.getPublic(`pagina:${pagina.slug}`),
        ...siteController.blockContext(pagina.bloques),
      });
    },

    previewNews(req, res) {
      authorize(req.actor, 'news.read');
      const noticia = newsService.get(req.actor, id(req.params.id));
      noticia.contenido = newsService.sanitize(noticia.contenido);
      const imagenes = new Map(mediaService.findByIds([noticia.imagenId, ...noticia.fotos]).map((m) => [m.id, m]));
      res.render('pages/noticia', { title: `Vista previa: ${noticia.titulo}`, nav: 'noticias', noticia, otras: [], imagenes, vistaPrevia: true });
    },
  };
}

module.exports = { createAdminWebController };
