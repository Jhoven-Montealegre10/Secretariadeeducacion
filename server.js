'use strict';
const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, () => {
  console.log(`Portal SEM Ibagué escuchando en http://localhost:${config.port} (${config.env})`);
});

// Tiempos máximos para mitigar conexiones lentas intencionales (slowloris).
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
