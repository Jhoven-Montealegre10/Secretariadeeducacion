'use strict';
/** Atención al ciudadano: radicación y consulta de PQRSD. */
const Pqrsd = require('../models/Pqrsd');
const { rules, validate } = require('../services/validator');

const schema = {
  tipo: [rules.oneOf(Pqrsd.TIPOS), 'Tipo de solicitud'],
  nombre: [rules.text({ min: 3, max: 120 }), 'Nombre completo'],
  tipo_documento: [rules.oneOf(Pqrsd.TIPOS_DOCUMENTO), 'Tipo de documento'],
  documento: [rules.pattern(/^[A-Za-z0-9]{4,20}$/, 'debe tener entre 4 y 20 letras o números, sin puntos ni espacios.'), 'Número de documento'],
  email: [rules.email(), 'Correo electrónico'],
  telefono: [rules.pattern(/^$|^[0-9+()\s-]{7,20}$/, 'no es válido.'), 'Teléfono'],
  asunto: [rules.text({ min: 5, max: 150 }), 'Asunto'],
  mensaje: [rules.text({ min: 20, max: 5000 }), 'Descripción'],
  acepto: [rules.checkbox({ required: true }), 'la política de tratamiento de datos'],
};

const consultaSchema = {
  radicado: [rules.pattern(/^SEM-\d{4}-\d{8}$/, 'debe tener el formato SEM-AAAA-00000000.'), 'Radicado'],
  documento: [rules.pattern(/^[A-Za-z0-9]{4,20}$/, 'no es válido.'), 'Número de documento'],
};

function renderAtencion(res, extra = {}, status = 200) {
  res.status(status).render('pages/atencion', {
    title: 'Atención al ciudadano', nav: 'atencion',
    tipos: Pqrsd.TIPOS, tiposDocumento: Pqrsd.TIPOS_DOCUMENTO,
    form: {}, errors: {}, consulta: {}, consultaErrors: {}, resultado: null, ...extra,
  });
}

module.exports = {
  index(req, res) {
    renderAtencion(res);
  },

  crear(req, res) {
    // Campo trampa (honeypot): los humanos no lo ven; los robots lo llenan.
    if (req.body.sitio_web) return res.redirect(303, '/atencion');
    const { data, errors, ok } = validate(req.body, schema);
    if (!ok) {
      const { documento, ...seguro } = data; // no se reenvía el documento a la vista
      return renderAtencion(res, { form: seguro, errors }, 422);
    }
    const radicado = Pqrsd.crear(data);
    req.session.ultimoRadicado = radicado;
    res.redirect(303, '/atencion/pqrsd/confirmacion'); // patrón POST/Redirect/GET
  },

  confirmacion(req, res) {
    const radicado = req.session.ultimoRadicado;
    if (!radicado) return res.redirect('/atencion');
    delete req.session.ultimoRadicado;
    res.render('pages/pqrsd-confirmacion', { title: 'Solicitud radicada', nav: 'atencion', radicado });
  },

  consultar(req, res) {
    const { data, errors, ok } = validate(req.body, consultaSchema);
    if (!ok) return renderAtencion(res, { consulta: { radicado: data.radicado }, consultaErrors: errors }, 422);
    const resultado = Pqrsd.consultar(data.radicado, data.documento);
    if (!resultado) {
      return renderAtencion(res, { consulta: { radicado: data.radicado }, consultaErrors: { general: 'No encontramos una solicitud con esos datos.' } }, 404);
    }
    renderAtencion(res, { resultado });
  },
};
