'use strict';
/** Punto de entrada de la aplicación (usado por server.js y por las pruebas). */
const config = require('./src/config');
const { migrate, pending } = require('./src/infrastructure/database/migrator');

if (config.autoMigrate) {
  migrate({
    log: (m) => {
      if (!config.isTest) console.log(m);
    },
  });
} else if (pending().length) {
  throw new Error(`Hay ${pending().length} migración(es) pendientes. Ejecute "npm run migrate" antes de iniciar.`);
}

const services = require('./src/container');
const { createApp } = require('./src/presentation/http/app');

module.exports = Object.assign(createApp(services), { services });
