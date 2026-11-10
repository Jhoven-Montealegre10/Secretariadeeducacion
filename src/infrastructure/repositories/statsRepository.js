'use strict';
const crypto = require('node:crypto');
const { db, toCamel } = require('../database/connection');

const statsRepository = {
  /** Sal aleatoria del día; las de días anteriores se borran (no se puede reidentificar). */
  saltFor(fecha) {
    const row = db.prepare('SELECT sal FROM sales_estadisticas WHERE fecha = ?').get(fecha);
    if (row) return row.sal;
    const sal = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT OR IGNORE INTO sales_estadisticas (fecha, sal) VALUES (?, ?)').run(fecha, sal);
    db.prepare('DELETE FROM sales_estadisticas WHERE fecha < ?').run(fecha);
    return db.prepare('SELECT sal FROM sales_estadisticas WHERE fecha = ?').get(fecha).sal;
  },

  insertVisit(v) {
    db.prepare('INSERT INTO visitas (fecha, ruta, visitante, fuente, referente_dominio, dispositivo, pais) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      v.fecha,
      v.ruta,
      v.visitante,
      v.fuente,
      v.referenteDominio ?? null,
      v.dispositivo,
      v.pais ?? null,
    );
  },

  purgeOlderThan(fecha) {
    return db.prepare('DELETE FROM visitas WHERE fecha < ?').run(fecha).changes;
  },

  summary(desde, hasta) {
    return toCamel(
      db
        .prepare(
          `SELECT COUNT(*) AS visitas,
        (SELECT COUNT(*) FROM (SELECT DISTINCT fecha, visitante FROM visitas WHERE fecha BETWEEN ? AND ?)) AS visitantes_unicos
      FROM visitas WHERE fecha BETWEEN ? AND ?`,
        )
        .get(desde, hasta, desde, hasta),
    );
  },

  byDay(desde, hasta) {
    return db
      .prepare(
        `SELECT fecha, COUNT(*) AS visitas, COUNT(DISTINCT visitante) AS visitantes FROM visitas
      WHERE fecha BETWEEN ? AND ? GROUP BY fecha ORDER BY fecha`,
      )
      .all(desde, hasta)
      .map(toCamel);
  },

  topPages(desde, hasta, limit = 10) {
    return db
      .prepare(`SELECT ruta, COUNT(*) AS visitas FROM visitas WHERE fecha BETWEEN ? AND ? GROUP BY ruta ORDER BY visitas DESC LIMIT ?`)
      .all(desde, hasta, limit)
      .map(toCamel);
  },

  groupBy(column, desde, hasta, limit = 20) {
    const allowed = { fuente: 'fuente', dispositivo: 'dispositivo', pais: 'pais', referenteDominio: 'referente_dominio' };
    const col = allowed[column];
    if (!col) throw new Error('Agrupación no permitida');
    return db
      .prepare(
        `SELECT ${col} AS valor, COUNT(*) AS visitas FROM visitas WHERE fecha BETWEEN ? AND ? AND ${col} IS NOT NULL
      GROUP BY ${col} ORDER BY visitas DESC LIMIT ?`,
      )
      .all(desde, hasta, limit)
      .map(toCamel);
  },
};

module.exports = statsRepository;
