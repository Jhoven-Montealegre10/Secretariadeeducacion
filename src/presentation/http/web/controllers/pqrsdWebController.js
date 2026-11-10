'use strict';
/** Formularios públicos de PQRSD (radicación y consulta), validados con esquemas Zod. */
const { z } = require('zod');

function details(error) {
  const out = {};
  for (const i of error.issues) out[i.path[0]] ||= i.message;
  return out;
}

function createPqrsdWebController({ pqrsdService }) {
  const fileSchema = z.object({
    tipo: z.enum(pqrsdService.TIPOS, { message: 'Seleccione un tipo de solicitud válido.' }),
    nombre: z.string().trim().min(3, 'Nombre completo debe tener al menos 3 caracteres.').max(120, 'Nombre completo admite máximo 120 caracteres.'),
    tipoDocumento: z.enum(pqrsdService.TIPOS_DOCUMENTO, { message: 'Seleccione un tipo de documento válido.' }),
    documento: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,20}$/, 'Número de documento debe tener entre 4 y 20 letras o números, sin puntos ni espacios.'),
    email: z.string().trim().toLowerCase().email('Correo electrónico no es un correo válido.').max(254),
    telefono: z
      .string()
      .trim()
      .regex(/^$|^[0-9+()\s-]{7,20}$/, 'Teléfono no es válido.')
      .default(''),
    asunto: z.string().trim().min(5, 'Asunto debe tener al menos 5 caracteres.').max(150),
    mensaje: z.string().trim().min(20, 'Descripción debe tener al menos 20 caracteres.').max(5000),
    acepto: z.literal('on', { message: 'Debe aceptar la política de tratamiento de datos.' }),
  });
  const lookupSchema = z.object({
    radicado: z
      .string()
      .trim()
      .regex(/^SEM-\d{4}-\d{8}$/, 'Radicado debe tener el formato SEM-AAAA-00000000.'),
    documento: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9]{4,20}$/, 'Número de documento no es válido.'),
  });

  function render(res, extra = {}, status = 200) {
    res.status(status).render('pages/atencion', {
      title: 'Atención al ciudadano',
      nav: 'atencion',
      tipos: pqrsdService.TIPOS,
      tiposDocumento: pqrsdService.TIPOS_DOCUMENTO,
      form: {},
      errors: {},
      consulta: {},
      consultaErrors: {},
      resultado: null,
      ...extra,
    });
  }

  return {
    index(req, res) {
      res.locals.trackView = '/atencion';
      render(res);
    },

    file(req, res) {
      if (req.body.sitio_web) return res.redirect(303, '/atencion'); // campo trampa anti-robots
      const input = { ...req.body, tipoDocumento: req.body.tipo_documento };
      const parsed = fileSchema.safeParse(input);
      if (!parsed.success) {
        const { documento, ...safe } = input; // eslint-disable-line no-unused-vars
        return render(res, { form: safe, errors: details(parsed.error) }, 422);
      }
      req.session.ultimoRadicado = pqrsdService.file(parsed.data);
      res.redirect(303, '/atencion/pqrsd/confirmacion');
    },

    confirmation(req, res) {
      const radicado = req.session.ultimoRadicado;
      if (!radicado) return res.redirect('/atencion');
      delete req.session.ultimoRadicado;
      res.render('pages/pqrsd-confirmacion', { title: 'Solicitud radicada', nav: 'atencion', radicado });
    },

    lookup(req, res) {
      const parsed = lookupSchema.safeParse(req.body);
      if (!parsed.success)
        return render(res, { consulta: { radicado: String(req.body.radicado || '').slice(0, 20) }, consultaErrors: details(parsed.error) }, 422);
      const resultado = pqrsdService.lookup(parsed.data.radicado, parsed.data.documento);
      if (!resultado)
        return render(res, { consulta: { radicado: parsed.data.radicado }, consultaErrors: { general: 'No encontramos una solicitud con esos datos.' } }, 404);
      render(res, { resultado });
    },
  };
}

module.exports = { createPqrsdWebController };
