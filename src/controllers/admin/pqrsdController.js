'use strict';
const Pqrsd = require('../../models/Pqrsd');
const Auditoria = require('../../models/Auditoria');
const { rules, validate, parseId, clean } = require('../../services/validator');

module.exports = {
  index(req, res) {
    const estado = clean(req.query.estado);
    res.render('admin/pqrsd', { title: 'PQRSD', solicitudes: Pqrsd.listar(estado), estados: Pqrsd.ESTADOS, estado });
  },

  show(req, res, next) {
    const s = Pqrsd.porId(parseId(req.params.id));
    if (!s) return next();
    // Cada consulta de datos personales queda auditada.
    Auditoria.registrar(req.user.id, 'pqrsd_ver', s.radicado);
    res.render('admin/pqrsd-detalle', { title: `PQRSD ${s.radicado}`, s, estados: Pqrsd.ESTADOS, errors: {} });
  },

  responder(req, res, next) {
    const id = parseId(req.params.id);
    const s = id && Pqrsd.porId(id);
    if (!s) return next();
    const { data, errors, ok } = validate(req.body, {
      estado: [rules.oneOf(Pqrsd.ESTADOS), 'Estado'],
      respuesta: [rules.optionalText({ max: 10000 }), 'Respuesta'],
    });
    if (!ok) return res.status(422).render('admin/pqrsd-detalle', { title: `PQRSD ${s.radicado}`, s: { ...s, ...data }, estados: Pqrsd.ESTADOS, errors });
    Pqrsd.responder(id, data.estado, data.respuesta);
    Auditoria.registrar(req.user.id, 'pqrsd_responder', `${s.radicado} → ${data.estado}`);
    res.redirect(303, `/admin/pqrsd/${id}`);
  },
};
