'use strict';
/** Datos institucionales públicos que se muestran en todas las páginas. */
module.exports = Object.freeze({
  nombre: 'Secretaría de Educación Municipal de Ibagué',
  entidad: 'Alcaldía de Ibagué',
  direccion: 'Carrera 2 No. 17, piso 2 – Antiguo Edificio Cafeteros, Ibagué, Tolima',
  telefono: '(608) 262 3256',
  telefonoLink: '+576082623256',
  correo: 'educacion@ibague.gov.co',
  horario: {
    general: ['Lunes a jueves: 7:30 a.m. – 4:30 p.m.', 'Viernes: 7:00 a.m. – 3:00 p.m.'],
    prestaciones: ['Lunes, miércoles y jueves: 7:30 a.m. – 3:30 p.m.', 'Martes y viernes: sin atención al público'],
  },
  // TODO: completar con las URL oficiales. Vacías = el enlace no se muestra.
  enlaces: {
    sac: '',
    humano: '',
    facebook: '',
    x: '',
    instagram: '',
    youtube: '',
  },
});
