'use strict';
/** Aplica las migraciones pendientes: npm run migrate */
const { migrate, pending } = require('../src/infrastructure/database/migrator');

const before = pending().length;
const applied = migrate({ log: console.log });
console.log(applied ? `${applied} migración(es) aplicada(s).` : before === 0 ? 'La base de datos está al día.' : '');
