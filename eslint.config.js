'use strict';
/**
 * ESLint: reglas recomendadas de JS y TypeScript (con información de tipos), reglas de
 * seguridad (eslint-plugin-security) y convención camelCase.
 */
const js = require('@eslint/js');
const globals = require('globals');
const security = require('eslint-plugin-security');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  { ignores: ['node_modules/', 'dist/', 'storage/', 'docs/', 'coverage/', 'test-results/'] },
  js.configs.recommended,
  security.configs.recommended,
  {
    rules: {
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Falsos positivos frecuentes en accesos a objetos con claves controladas por el código:
      'security/detect-object-injection': 'off',
      // Las rutas de archivos se construyen con nombres generados y validados (FileStorage).
      'security/detect-non-literal-fs-filename': 'off',
      // Compara nombres de rutas/estados, no secretos. Los secretos usan timingSafeEqual (CryptoService.safeEqual).
      'security/detect-possible-timing-attacks': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname }, globals: { ...globals.node } },
    rules: {
      camelcase: ['error', { properties: 'never', ignoreDestructuring: true, ignoreImports: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Las firmas async de los controladores Nest se mantienen aunque no esperen nada.
      '@typescript-eslint/require-await': 'off',
      // Express/multer y pg devuelven tipos amplios en las fronteras; se validan con Zod.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true, allowNullish: true }],
      '@typescript-eslint/unbound-method': 'off',
      // String(valor desconocido) es una conversión defensiva intencional de entradas externas.
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },
  { files: ['test/**/*.ts', 'scripts/**/*.ts'], rules: { 'security/detect-child-process': 'off', 'security/detect-non-literal-regexp': 'off' } },
  // node:test: describe/test devuelven promesas que el propio ejecutor espera.
  { files: ['test/**/*.ts'], rules: { '@typescript-eslint/no-floating-promises': 'off', '@typescript-eslint/no-non-null-assertion': 'off' } },
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } } },
  { files: ['public/assets/**/*.js'], languageOptions: { sourceType: 'module', globals: { ...globals.browser } } },
  { files: ['public/assets/js/**/*.js'], languageOptions: { sourceType: 'script' } },
);
