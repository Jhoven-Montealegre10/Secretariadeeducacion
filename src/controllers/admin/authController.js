'use strict';
const Usuario = require('../../models/Usuario');
const Auditoria = require('../../models/Auditoria');
const { rules, validate } = require('../../services/validator');

const MENSAJES = {
  credenciales: 'Correo o contraseña incorrectos.',
  bloqueado: 'Cuenta bloqueada temporalmente por intentos fallidos. Intente en 15 minutos.',
};

module.exports = {
  loginForm(req, res) {
    if (req.user) return res.redirect('/admin');
    res.render('admin/login', { title: 'Ingreso administradores', error: null, email: '' });
  },

  login(req, res, next) {
    const { data } = validate(req.body, {
      email: [rules.text({ max: 254 }), 'Correo'],
      password: [rules.text({ max: 200 }), 'Contraseña'],
    });
    const { usuario, error } = Usuario.autenticar(data.email, data.password);
    if (!usuario) {
      Auditoria.registrar(null, 'login_fallido', data.email.slice(0, 80));
      return res.status(401).render('admin/login', { title: 'Ingreso administradores', error: MENSAJES[error], email: data.email });
    }
    // Nueva sesión al iniciar: evita la fijación de sesión.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.userId = usuario.id;
      Auditoria.registrar(usuario.id, 'login');
      req.session.save((e) => (e ? next(e) : res.redirect(303, '/admin')));
    });
  },

  logout(req, res, next) {
    const id = req.user?.id;
    req.session.destroy((err) => {
      if (err) return next(err);
      if (id) Auditoria.registrar(id, 'logout');
      res.clearCookie(req.app.get('sessionCookieName'));
      res.redirect(303, '/admin/login');
    });
  },

  passwordForm(req, res) {
    res.render('admin/password', { title: 'Cambiar contraseña', errors: {}, ok: false });
  },

  cambiarPassword(req, res) {
    const { data, errors } = validate(req.body, {
      actual: [rules.text({ max: 200 }), 'Contraseña actual'],
      nueva: [rules.text({ min: 12, max: 200 }), 'Nueva contraseña'],
      confirmar: [rules.text({ max: 200 }), 'Confirmación'],
    });
    const robusta = /[A-Z]/.test(data.nueva) && /[a-z]/.test(data.nueva) && /\d/.test(data.nueva);
    if (!errors.nueva && !robusta) {
      errors.nueva = 'Debe incluir mayúsculas, minúsculas y números.';
    }
    if (data.nueva !== data.confirmar) errors.confirmar = 'Las contraseñas no coinciden.';
    if (!errors.actual && !Usuario.autenticar(req.user.email, data.actual).usuario) errors.actual = 'La contraseña actual no es correcta.';
    if (Object.keys(errors).length) return res.status(422).render('admin/password', { title: 'Cambiar contraseña', errors, ok: false });
    Usuario.cambiarPassword(req.user.id, data.nueva);
    Auditoria.registrar(req.user.id, 'cambio_password');
    res.render('admin/password', { title: 'Cambiar contraseña', errors: {}, ok: true });
  },
};
