/* global document, innerWidth */
/**
 * Prueba de extremo a extremo del panel en un navegador real (Playwright/Chromium).
 * Requiere un servidor de PRUEBAS en ejecución (nunca producción) con dos usuarios sin MFA:
 *   admin@example.gov.co (administrador) y editor@example.gov.co (editor), contraseña E2E_PASSWORD.
 * Uso: E2E_BASE_URL=http://localhost:3999 npm run test:e2e
 * Las capturas se guardan en E2E_OUT (por defecto, la carpeta temporal del sistema).
 */
const os = require('node:os');
const path = require('node:path');
const { chromium, devices } = require('playwright');
const sharp = require('sharp');
const totp = require('../../src/infrastructure/security/totp');

const S = process.env.E2E_OUT || os.tmpdir();
const B = process.env.E2E_BASE_URL || 'http://localhost:3999';
const PASSWORD = process.env.E2E_PASSWORD || 'cometa verde sobre el nevado del tolima';
const errors = [];
(async () => {
  await sharp({ create: { width: 1600, height: 700, channels: 3, background: '#3366cc' } })
    .jpeg()
    .toFile(path.join(S, 'e2e-portada.jpg'));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  p.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) errors.push('console: ' + m.text());
  });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const step = async (name, fn) => {
    try {
      await fn();
      console.log('✓', name);
    } catch (e) {
      console.log('✗', name, e.message.split('\n')[0]);
      errors.push(name);
      await p.screenshot({ path: `${S}/fail-${name.replace(/\W+/g, '_')}.png` });
    }
  };

  await step('login + configurar MFA', async () => {
    await p.goto(B + '/admin');
    await p.waitForURL('**/admin/login');
    await p.fill('input[name=email]', 'admin@example.gov.co');
    await p.fill('input[name=password]', PASSWORD);
    await p.click('button[type=submit]');
    await p.waitForSelector('img.qr');
    await p.screenshot({ path: `${S}/01-mfa-setup.png` });
    await p.click('details summary');
    const secret = (await p.textContent('code.secret')).trim();
    await p.fill('input[name=codigo]', totp.generate(secret));
    await p.click('button[type=submit]');
    await p.waitForSelector('ul.codes');
    await p.check('#guardados');
    await p.click('text=Ir al panel');
    await p.waitForSelector('#admin-menu a');
  });
  await step('resumen y menú admin', async () => {
    await p.waitForSelector('h1:has-text("Hola")');
    const items = await p.$$eval('#admin-menu a', (as) => as.map((a) => a.textContent));
    if (!items.includes('Usuarios') || !items.includes('Estadísticas')) throw new Error('menú incompleto: ' + items);
    await p.screenshot({ path: `${S}/02-resumen.png` });
  });
  await step('subir imagen a multimedia', async () => {
    await p.click('#admin-menu >> text=Multimedia');
    await p.setInputFiles('#carga-archivos', path.join(S, 'e2e-portada.jpg'));
    await p.waitForSelector('.media-tile');
    await p.click('.media-tile');
    await p.fill('.modal input[name=textoAlternativo]', 'Portada con figuras institucionales');
    await p.click('.modal >> text=Guardar cambios');
    await p.waitForSelector('.toast');
    await p.screenshot({ path: `${S}/03-multimedia.png` });
  });
  await step('crear y publicar noticia con imagen', async () => {
    await p.goto(B + '/admin/noticias/nueva');
    await p.fill('input[name=titulo]', 'Abiertas las inscripciones escolares 2027');
    await p.fill('textarea[name=resumen]', 'Conozca fechas y requisitos para solicitar cupo en colegios oficiales.');
    await p.click('.rte__area');
    await p.keyboard.type('Las inscripciones para estudiantes nuevos estarán abiertas durante noviembre en todas las instituciones oficiales.');
    await p.selectOption('select[name=estado]', 'publicada');
    await p.click('text=Elegir desde la biblioteca >> nth=0');
    await p.click('.modal .media-tile');
    await p.waitForSelector('.thumb');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/noticias\/\d+/);
    await p.screenshot({ path: `${S}/04-noticia.png`, fullPage: true });
    const home = await (await ctx.request.get(B + '/')).text();
    if (!home.includes('Abiertas las inscripciones escolares 2027')) throw new Error('no aparece en inicio');
  });
  await step('editar página institucional por bloques', async () => {
    await p.click('#admin-menu >> text=Páginas');
    await p.click('text=La Secretaría');
    await p.waitForSelector('.block');
    const n = await p.$$eval('.block', (b) => b.length);
    await p.selectOption('.block-editor .toolbar select', 'boton');
    await p.click('text=+ Agregar bloque');
    const last = p.locator('.block').last();
    await last.locator('input').nth(0).fill('Radicar una PQRSD');
    await last.locator('input').nth(1).fill('/atencion#pqrsd');
    await p.click('button[type=submit]');
    await p.waitForSelector('.toast');
    await p.screenshot({ path: `${S}/05-pagina.png` });
    const html = await (await ctx.request.get(B + '/secretaria')).text();
    if (!html.includes('Radicar una PQRSD')) throw new Error(`no se publicó (bloques ${n})`);
  });
  await step('slider en inicio', async () => {
    await p.goto(B + '/admin/sliders');
    await p.click('text=+ Nuevo slider');
    await p.fill('.modal input[name=nombre]', 'Portada');
    await p.click('.modal >> text=Guardar');
    await p.waitForURL(/\/admin\/sliders\/\d+/);
    await p.click('text=+ Agregar diapositiva');
    await p.click('.modal >> text=Elegir imagen');
    await p.locator('.modal').last().locator('.media-tile').first().click();
    await p.locator('.modal input').first().fill('Bienvenidos al nuevo portal');
    await p.click('.modal >> text=Guardar');
    await p.waitForSelector('.slide-row');
    await p.goto(B + '/');
    await p.waitForSelector('[data-carousel]');
    await p.screenshot({ path: `${S}/06-inicio.png` });
  });
  await step('crear editor por invitación y ver roles', async () => {
    await p.goto(B + '/admin/usuarios');
    await p.click('text=+ Nuevo usuario');
    await p.fill('.modal input[name=nombre]', 'Laura Comunicaciones');
    await p.fill('.modal input[name=email]', 'laura@example.gov.co');
    await p.click('.modal >> text=Crear e invitar');
    await p.waitForSelector('text=laura@example.gov.co');
    await p.goto(B + '/admin/roles');
    await p.click('text=Ver y editar >> nth=1');
    await p.waitForSelector('.perm-matrix');
    await p.screenshot({ path: `${S}/07-roles.png`, fullPage: true });
  });
  await step('estadísticas y auditoría', async () => {
    await p.goto(B + '/admin/estadisticas');
    await p.waitForSelector('.stat-cards, .state--empty');
    await p.screenshot({ path: `${S}/08-estadisticas.png`, fullPage: true });
    await p.goto(B + '/admin/auditoria');
    await p.waitForSelector('table');
    await p.click('text=Verificar integridad');
    await p.waitForSelector('.toast');
  });
  await step('documentación API', async () => {
    await p.goto(B + '/admin/api-docs');
    await p.waitForSelector('.opblock', { timeout: 15000 });
    await p.screenshot({ path: `${S}/09-swagger.png` });
  });

  // Móvil: vistas del panel sin desborde horizontal
  const m = await browser.newContext({ ...devices['iPhone 13'], storageState: await ctx.storageState() });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
  for (const path of [
    '/admin',
    '/admin/paginas',
    '/admin/noticias',
    '/admin/multimedia',
    '/admin/sliders',
    '/admin/usuarios',
    '/admin/roles',
    '/admin/estadisticas',
    '/admin/auditoria',
    '/admin/cuenta',
    '/',
    '/secretaria',
    '/noticias',
  ]) {
    await mp.goto(B + path);
    await mp.waitForLoadState('networkidle');
    const [sw, iw] = await mp.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    if (sw > iw) errors.push(`overflow móvil ${path} ${sw}>${iw}`);
  }
  await mp.goto(B + '/admin/noticias');
  await mp.waitForSelector('table');
  await mp.screenshot({ path: `${S}/10-movil-noticias.png` });
  await mp.click('.admin-menu-toggle');
  await mp.screenshot({ path: `${S}/11-movil-menu.png` });

  // Editor: sin opciones administrativas, y la API las niega
  const e = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ep = await e.newPage();
  await step('editor sin acceso administrativo', async () => {
    await ep.goto(B + '/admin/login');
    await ep.fill('input[name=email]', 'editor@example.gov.co');
    await ep.fill('input[name=password]', PASSWORD);
    await ep.click('button[type=submit]');
    await ep.waitForSelector('img.qr');
    await ep.click('details summary');
    await ep.fill('input[name=codigo]', totp.generate((await ep.textContent('code.secret')).trim()));
    await ep.click('button[type=submit]');
    await ep.waitForSelector('ul.codes');
    await ep.check('#guardados');
    await ep.click('text=Ir al panel');
    await ep.waitForSelector('#admin-menu a');
    const items = await ep.$$eval('#admin-menu a', (as) => as.map((a) => a.textContent));
    if (items.includes('Usuarios') || items.includes('Estadísticas') || items.includes('Auditoría')) throw new Error('menú expone admin: ' + items);
    await ep.goto(B + '/admin/usuarios');
    await ep.waitForSelector('h1:has-text("Sin acceso")');
    const r = await e.request.get(B + '/api/v1/usuarios');
    if (r.status() !== 403) throw new Error('API devolvió ' + r.status());
  });
  console.log(errors.length ? 'ERRORES:\n' + errors.join('\n') : 'SIN ERRORES');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
