'use strict';
/** ESLint: reglas recomendadas + reglas de seguridad (eslint-plugin-security) + camelCase. */
const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');

module.exports = [
  { ignores: ['node_modules/', 'storage/', 'docs/', 'coverage/'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: {
      camelcase: ['error', { properties: 'never', ignoreDestructuring: true, ignoreImports: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Falsos positivos frecuentes en accesos a objetos con claves controladas por el código:
      'security/detect-object-injection': 'off',
      // Las rutas de archivos se construyen con nombres generados y validados (fileStorage).
      'security/detect-non-literal-fs-filename': 'off',
      // Falsos positivos: compara nombres de rutas/estados, no secretos. Los secretos usan timingSafeEqual (crypto.safeEqual).
      'security/detect-possible-timing-attacks': 'off',
    },
  },
  {
    files: ['public/assets/**/*.js'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser } },
  },
  { files: ['public/assets/js/**/*.js'], languageOptions: { sourceType: 'script' } },
  { files: ['tests/**/*.js'], rules: { 'security/detect-child-process': 'off', 'security/detect-non-literal-regexp': 'off' } },
];
