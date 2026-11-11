/// <reference lib="dom" />
/**
 * Pruebas de extremo a extremo en un navegador real (Playwright) contra la aplicación completa y
 * una base PostgreSQL temporal de PRUEBAS (se crea y se elimina en cada ejecución).
 *   npm run test:e2e        (requiere TEST_PG_ADMIN_URL; capturas e informe en test-results/e2e/)
 * Cubre ingreso, MFA, recuperación, sesiones, usuarios, roles, multimedia, páginas, noticias,
 * sliders, estadísticas, auditoría, documentación, sitio público, PQRSD, errores, desconexión,
 * persistencia tras recargar y tras reiniciar, restricciones por rol (también saltando la
 * interfaz), y la vista en escritorio, tableta y móvil (desborde, imágenes, foco y etiquetas).
 * Navegadores: Chromium (el único disponible en este entorno; Firefox/WebKit se informan como no ejecutados).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, devices, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';
import { createHarness, jpegBuffer, PASSWORD, type Harness } from '../support/harness';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.env.E2E_OUT ?? path.join(ROOT, 'test-results', 'e2e');
interface Step {
  modulo: string;
  nombre: string;
  resultado: 'aprobada' | 'fallida' | 'no_ejecutada';
  detalle?: string;
  ms: number;
}
const BROWSER = (process.env.E2E_BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';
const steps: Step[] = [];
const consoleErrors: string[] = [];
const serverErrors: string[] = [];
let h: Harness;
let base = '';
let port = 0;
let browser: Browser;

function watch(page: Page, label: string): Page {
  page.on('console', (m) => {
    // Esperados: 4xx provocados a propósito (sesión vencida) y la desconexión simulada de la prueba sin red.
    if (m.type() === 'error' && !/status of 4\d\d|ERR_INTERNET_DISCONNECTED/.test(m.text())) consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label} pageerror: ${e.message}`));
  return page;
}

async function step(modulo: string, nombre: string, page: Page | null, fn: () => Promise<void>): Promise<void> {
  const t = Date.now();
  try {
    await fn();
    steps.push({ modulo, nombre, resultado: 'aprobada', ms: Date.now() - t });
    console.log(`  ✓ [${modulo}] ${nombre}`);
  } catch (e) {
    const detalle = (e as Error).message.split('\n')[0];
    steps.push({ modulo, nombre, resultado: 'fallida', detalle, ms: Date.now() - t });
    console.log(`  ✗ [${modulo}] ${nombre}: ${detalle}`);
    if (page) await page.screenshot({ path: path.join(OUT, `fallo-${nombre.replace(/\W+/g, '_').slice(0, 60)}.png`), fullPage: true }).catch(() => undefined);
  }
}

function notRun(modulo: string, nombre: string, detalle: string): void {
  steps.push({ modulo, nombre, resultado: 'no_ejecutada', detalle, ms: 0 });
  console.log(`  – [${modulo}] ${nombre}: NO EJECUTADA (${detalle})`);
}

/** Perfil de dispositivo; Firefox no admite la emulación isMobile. */
function device(name: string): Parameters<Browser['newContext']>[0] {
  const d = { ...devices[name] } as Record<string, unknown>;
  delete d.defaultBrowserType;
  if (BROWSER === 'firefox') delete d.isMobile;
  return d;
}

const assert = (cond: unknown, msg: string): void => {
  if (!cond) throw new Error(msg);
};

async function login(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.goto(`${base}/admin/login`);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
}

async function totpFor(email: string): Promise<string> {
  await h.db.run('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE email = $1', [email]);
  const enc = await h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE email = $1', [email]);
  return h.totp.generate(h.get(CryptoService).decrypt(enc), h.clock.now());
}

async function startServer(): Promise<void> {
  await h.app.listen(port, '127.0.0.1');
  port = (h.app.getHttpServer().address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  for (const stream of [process.stdout, process.stderr]) {
    const orig = stream.write.bind(stream);
    stream.write = (chunk: unknown, ...rest: unknown[]) => {
      if (/\bERROR\b/.test(String(chunk))) serverErrors.push(String(chunk).trim().slice(0, 300));
      return (orig as (...a: unknown[]) => boolean)(chunk, ...rest);
    };
  }
  h = await createHarness();
  await startServer();
  await h.createUser({ email: 'admin@example.gov.co', nombre: 'Ana Administradora', rol: 'administrador', mfa: false });
  await h.createUser({ email: 'editor@example.gov.co', nombre: 'Ernesto Editor', rol: 'editor', mfa: false });
  fs.writeFileSync(path.join(OUT, 'portada.jpg'), await jpegBuffer());
  browser = await { chromium, firefox, webkit }[BROWSER].launch();
  const desktop: BrowserContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p = watch(await desktop.newPage(), 'admin');
  let recoveryCodes: string[] = [];

  console.log(`E2E (${BROWSER}) contra ${base} (base ${h.dbName})`);

  await step('Autenticación', 'credenciales inválidas muestran un error genérico', p, async () => {
    await login(p, 'admin@example.gov.co', 'contraseña equivocada');
    await p.waitForSelector('.notice--error:not([hidden])');
    assert(/incorrectos/.test((await p.textContent('.notice--error')) ?? ''), 'mensaje genérico');
  });

  await step('Autenticación', 'primer ingreso: configurar MFA y recibir códigos de recuperación', p, async () => {
    await login(p, 'admin@example.gov.co');
    await p.waitForSelector('img.qr');
    await p.click('details summary');
    const secret = (await p.textContent('code.secret'))?.trim() ?? '';
    await p.fill('input[name=codigo]', '000000');
    await p.click('button[type=submit]');
    await p.waitForSelector('.notice--error:not([hidden])');
    await p.fill('input[name=codigo]', h.totp.generate(secret, h.clock.now()));
    await p.click('button[type=submit]');
    await p.waitForSelector('ul.codes');
    recoveryCodes = await p.$$eval('ul.codes li', (li) => li.map((x) => x.textContent?.trim() ?? ''));
    assert(recoveryCodes.length === 10, `códigos: ${recoveryCodes.length}`);
    await p.screenshot({ path: path.join(OUT, '01-codigos-recuperacion.png') });
    await p.check('#guardados');
    await p.click('text=Ir al panel');
    await p.waitForSelector('#admin-menu a');
  });

  await step('Panel', 'resumen y menú completo del administrador', p, async () => {
    await p.waitForSelector('h1:has-text("Hola")');
    const items = await p.$$eval('#admin-menu a', (as) => as.map((a) => a.textContent ?? ''));
    for (const m of ['Usuarios', 'Roles', 'Estadísticas', 'Auditoría', 'Multimedia', 'Páginas', 'Noticias', 'Sliders'])
      assert(
        items.some((i) => i.includes(m)),
        `falta ${m}: ${items.join(',')}`,
      );
    await p.screenshot({ path: path.join(OUT, '02-resumen.png') });
  });

  await step('Multimedia', 'subir, buscar, editar texto alternativo', p, async () => {
    await p.click('#admin-menu >> text=Multimedia');
    await p.setInputFiles('#carga-archivos', path.join(OUT, 'portada.jpg'));
    await p.waitForSelector('.media-tile');
    await p.fill('input[type=search]', 'no-existe-zzz');
    await p.waitForSelector('.state--empty');
    await p.fill('input[type=search]', 'portada');
    await p.waitForSelector('.media-tile');
    await p.click('.media-tile');
    await p.fill('.modal input[name=textoAlternativo]', 'Portada institucional');
    await p.click('.modal >> text=Guardar cambios');
    await p.waitForSelector('.toast--ok');
    assert((await h.db.scalar<string>('SELECT texto_alternativo FROM medios ORDER BY id DESC LIMIT 1')) === 'Portada institucional', 'persistió');
    await p.screenshot({ path: path.join(OUT, '03-multimedia.png') });
  });

  await step('Noticias', 'crear y publicar con imagen; aparece en el inicio en orden', p, async () => {
    const make = async (titulo: string, fecha: string) => {
      await p.goto(`${base}/admin/noticias/nueva`);
      await p.fill('input[name=titulo]', titulo);
      await p.fill('textarea[name=resumen]', 'Conozca fechas y requisitos para solicitar cupo.');
      await p.fill('input[name=fechaPublicacion]', fecha);
      await p.click('.rte__area');
      await p.keyboard.type('Las inscripciones para estudiantes nuevos estarán abiertas durante noviembre.');
      await p.selectOption('select[name=estado]', 'publicada');
      await p.click('text=Elegir desde la biblioteca >> nth=0');
      await p.click('.modal .media-tile');
      await p.waitForSelector('.thumb');
      await p.click('button[type=submit]');
      await p.waitForURL(/\/admin\/noticias\/\d+/);
    };
    await make('Inscripciones escolares antiguas', '2026-01-10');
    await make('Inscripciones escolares recientes', '2026-03-10');
    await p.reload();
    assert((await p.inputValue('input[name=titulo]')) === 'Inscripciones escolares recientes', 'persiste tras recargar');
    const home = await (await desktop.request.get(`${base}/`)).text();
    assert(home.indexOf('Inscripciones escolares recientes') < home.indexOf('Inscripciones escolares antiguas'), 'orden en el inicio');
    await p.screenshot({ path: path.join(OUT, '04-noticia.png'), fullPage: true });
  });

  await step('Noticias', 'dos pestañas editando la misma noticia: la segunda recibe aviso de conflicto', p, async () => {
    const url = p.url();
    const p2 = watch(await desktop.newPage(), 'admin-2');
    await p2.goto(url);
    await p2.waitForSelector('input[name=titulo]');
    await p.fill('input[name=titulo]', 'Inscripciones escolares recientes (A)');
    await p.click('button[type=submit]');
    await p.waitForSelector('.toast--ok');
    await p2.fill('input[name=titulo]', 'Inscripciones escolares recientes (B)');
    await p2.click('button[type=submit]');
    await p2.waitForSelector('.toast--error');
    assert(/Otra persona modificó/.test((await p2.textContent('.toast--error')) ?? ''), 'mensaje de conflicto');
    await p2.close();
    assert(
      (await h.db.scalar<string>('SELECT titulo FROM noticias ORDER BY id DESC LIMIT 1')) === 'Inscripciones escolares recientes (A)',
      'el cambio de A no se perdió',
    );
  });

  await step('Páginas', 'crear borrador, vista previa protegida y publicar', p, async () => {
    await p.goto(`${base}/admin/paginas/nueva`);
    await p.fill('input[name=titulo]', 'Calendario escolar 2027');
    await p.selectOption('.block-editor .toolbar select', 'texto');
    await p.click('text=+ Agregar bloque');
    await p.click('.block .rte__area');
    await p.keyboard.type('Fechas del calendario escolar.');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/paginas\/\d+/);
    const id = p.url().split('/').pop();
    assert((await desktop.request.get(`${base}/calendario-escolar-2027`)).status() === 404, 'borrador oculto');
    const anon = await browser.newContext();
    assert(
      (await anon.request.get(`${base}/admin/vista-previa/paginas/${id}`, { headers: { accept: 'application/json' } })).status() === 401,
      'vista previa exige sesión',
    );
    await anon.close();
    const preview = watch(await desktop.newPage(), 'preview');
    await preview.goto(`${base}/admin/vista-previa/paginas/${id}`);
    await preview.waitForSelector('.preview-banner');
    await preview.close();
    await p.selectOption('select[name=estado]', 'publicada');
    await p.click('button[type=submit]');
    await p.waitForSelector('.toast--ok');
    assert((await (await desktop.request.get(`${base}/calendario-escolar-2027`)).text()).includes('Fechas del calendario'), 'publicada');
    await p.screenshot({ path: path.join(OUT, '05-pagina.png'), fullPage: true });
  });

  await step('Sliders', 'configurar, ordenar y mostrar en el inicio', p, async () => {
    await p.goto(`${base}/admin/sliders`);
    await p.click('text=+ Nuevo slider');
    await p.fill('.modal input[name=nombre]', 'Portada');
    await p.click('.modal >> text=Guardar');
    await p.waitForURL(/\/admin\/sliders\/\d+/);
    for (const t of ['Primera diapositiva', 'Segunda diapositiva']) {
      await p.click('text=+ Agregar diapositiva');
      await p.click('.modal >> text=Elegir imagen');
      await p.locator('.modal').last().locator('.media-tile').first().click();
      await p.locator('.modal input').first().fill(t);
      await p.click('.modal >> text=Guardar');
      await p.waitForSelector(`.slide-row:has-text("${t}")`);
    }
    await p.locator('.slide-row').nth(1).locator('button[aria-label=Subir]').click();
    await p.waitForFunction(() => document.querySelector('.slide-row')?.textContent?.includes('Segunda'));
    const home = watch(await desktop.newPage(), 'inicio');
    await home.goto(`${base}/`);
    await home.waitForSelector('[data-carousel]');
    const html = await home.content();
    assert(html.indexOf('Segunda diapositiva') < html.indexOf('Primera diapositiva'), 'orden en el sitio');
    await home.screenshot({ path: path.join(OUT, '06-inicio.png') });
    await home.close();
  });

  await step('Usuarios', 'crear por invitación, editar y desactivar', p, async () => {
    await p.goto(`${base}/admin/usuarios`);
    await p.click('text=+ Nuevo usuario');
    await p.fill('.modal input[name=nombre]', 'Laura Comunicaciones');
    await p.fill('.modal input[name=email]', 'laura@example.gov.co');
    await p.click('.modal >> text=Crear e invitar');
    await p.waitForSelector('text=laura@example.gov.co');
    assert(
      h.mailer.outbox.some((m) => m.to === 'laura@example.gov.co'),
      'invitación enviada',
    );
    await p.locator('tr:has-text("laura@example.gov.co") >> text=Editar').click();
    await p.fill('.modal input[name=nombre]', 'Laura Comunicaciones SEM');
    await p.locator('.modal input[type=checkbox]').last().uncheck();
    await p.click('.modal >> text=Guardar');
    await p.waitForSelector('.toast--ok');
    assert(
      (await h.db.one<{ nombre: string; activo: boolean }>("SELECT nombre, activo FROM usuarios WHERE email = 'laura@example.gov.co'"))?.activo === false,
      'desactivado',
    );
  });

  await step('Roles', 'matriz de permisos visible', p, async () => {
    await p.goto(`${base}/admin/roles`);
    await p.click('text=Ver y editar >> nth=1');
    await p.waitForSelector('.perm-matrix');
    await p.screenshot({ path: path.join(OUT, '07-roles.png'), fullPage: true });
  });

  await step('Estadísticas', 'filtros por fecha muestran las cifras de los datos de prueba', p, async () => {
    await h.db.run(
      `INSERT INTO visitas (fecha, ruta, visitante, fuente, dispositivo) VALUES
       ('2026-02-01', '/', 'v1', 'directo', 'movil'), ('2026-02-01', '/noticias', 'v1', 'buscador', 'movil'), ('2026-02-02', '/', 'v2', 'directo', 'escritorio')`,
    );
    await p.goto(`${base}/admin/estadisticas`);
    await p.getByLabel('Desde').fill('2026-02-01');
    await p.getByLabel('Hasta').fill('2026-02-02');
    await p.waitForFunction(() => /Visitas\s*3(?!\d)/.test(document.querySelector('.stat-cards')?.textContent ?? ''), undefined, { timeout: 10000 });
    const cards = await p.textContent('.stat-cards');
    assert(/Visitantes[^0-9]*2/.test(cards ?? ''), `tarjetas: ${cards}`);
    await p.screenshot({ path: path.join(OUT, '08-estadisticas.png'), fullPage: true });
  });

  await step('Auditoría', 'consultar y verificar integridad', p, async () => {
    await p.goto(`${base}/admin/auditoria`);
    await p.waitForSelector('table');
    await p.click('text=Verificar integridad');
    await p.waitForSelector('.toast');
    assert(/íntegra|intacta|correcta/i.test((await p.textContent('.toast')) ?? ''), 'integridad');
  });

  await step('API', 'documentación Swagger del panel', p, async () => {
    await p.goto(`${base}/admin/api-docs`);
    await p.waitForSelector('.opblock', { timeout: 15000 });
    await p.screenshot({ path: path.join(OUT, '09-swagger.png') });
  });

  await step('Errores', 'sin conexión con el servidor el panel lo informa', p, async () => {
    // Se visita antes la vista para que su código ya esté en el navegador; sin red solo falla la API.
    await p.goto(`${base}/admin/paginas`);
    await p.waitForSelector('table');
    await p.click('#admin-menu >> text=Noticias');
    await p.waitForSelector('table');
    await desktop.setOffline(true);
    try {
      await p.click('#admin-menu >> text=Páginas');
      await p.waitForSelector('text=No hay conexión', { timeout: 10000 });
    } finally {
      await desktop.setOffline(false);
    }
  });

  await step('Persistencia', 'tras reiniciar la aplicación la sesión y los datos siguen', p, async () => {
    await h.restart();
    await startServer();
    await p.goto(`${base}/admin/noticias`);
    await p.waitForSelector('text=Inscripciones escolares recientes (A)');
  });

  await step('Autenticación', 'cerrar sesión y volver a entrar con un código de recuperación', p, async () => {
    await p.click('#btn-salir');
    await p.waitForURL('**/admin/login');
    await p.goto(`${base}/admin`);
    await p.waitForURL('**/admin/login');
    await login(p, 'admin@example.gov.co');
    await p.click('text=Usar un código de recuperación');
    await p.fill('input[name=codigoRecuperacion]', recoveryCodes[0]);
    await p.click('button[type=submit]');
    await p.waitForSelector('#admin-menu a');
  });

  await step('Autenticación', 'la sesión vence (duración máxima) y el panel pide ingresar de nuevo', p, async () => {
    await h.db.run(
      `UPDATE sesiones SET data = jsonb_set(data, '{auth,loginAt}', to_jsonb((data->'auth'->>'loginAt')::bigint - 9*3600*1000)) WHERE data ? 'auth'`,
    );
    await p.goto(`${base}/admin/noticias`);
    await p.waitForURL('**/admin/login', { timeout: 10000 });
  });

  await step('Autenticación', 'recuperar la contraseña por correo y entrar con la nueva (MFA sigue exigido)', p, async () => {
    h.mailer.outbox.length = 0;
    await p.goto(`${base}/admin/login`);
    await p.click('text=¿Olvidó su contraseña?');
    await p.fill('input[name=email]', 'admin@example.gov.co');
    await p.click('button[type=submit]');
    await p.waitForSelector('h1:has-text("Revise su correo")');
    const link = /https?:\/\/\S+#token=[\w-]+/.exec(h.mailer.outbox[0]?.text ?? '')?.[0] ?? '';
    assert(link, 'correo con enlace');
    await p.goto(`${base}/admin/restablecer#token=${link.split('#token=')[1]}`);
    await p.fill('input[name=password]', 'girasoles en la ventana del colegio');
    await p.fill('input[name=confirmar]', 'girasoles en la ventana del colegio');
    await p.click('button[type=submit]');
    await p.waitForSelector('h1:has-text("Contraseña actualizada")');
    await login(p, 'admin@example.gov.co', 'girasoles en la ventana del colegio');
    await p.waitForSelector('input[name=codigo]');
    await p.fill('input[name=codigo]', await totpFor('admin@example.gov.co'));
    await p.click('button[type=submit]');
    await p.waitForSelector('#admin-menu a');
  });

  // --- Editor ---
  const ed = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const ep = watch(await ed.newPage(), 'editor');
  await step('Permisos', 'el editor no ve opciones administrativas y el acceso directo se bloquea', ep, async () => {
    await login(ep, 'editor@example.gov.co');
    await ep.waitForSelector('img.qr');
    await ep.click('details summary');
    await ep.fill('input[name=codigo]', h.totp.generate((await ep.textContent('code.secret'))?.trim() ?? '', h.clock.now()));
    await ep.click('button[type=submit]');
    await ep.waitForSelector('ul.codes');
    await ep.check('#guardados');
    await ep.click('text=Ir al panel');
    await ep.waitForSelector('#admin-menu a');
    const items = await ep.$$eval('#admin-menu a', (as) => as.map((a) => a.textContent ?? ''));
    assert(!items.some((i) => /Usuarios|Estadísticas|Auditoría|Roles/.test(i)), `menú: ${items.join(',')}`);
    await ep.goto(`${base}/admin/usuarios`);
    await ep.waitForSelector('h1:has-text("Sin acceso")');
    // Saltando la interfaz: la API también lo niega, incluso con el token CSRF correcto.
    const r = await ep.evaluate(async () => {
      const t = (await (await fetch('/api/v1/auth/csrf')).json()).data.csrfToken;
      const a = await fetch('/api/v1/usuarios');
      const b = await fetch('/api/v1/noticias/1', { method: 'DELETE', headers: { 'X-CSRF-Token': t } });
      const c = await fetch('/api/v1/estadisticas');
      return [a.status, b.status, c.status];
    });
    assert(
      r.every((s) => s === 403),
      `estados: ${r.join(',')}`,
    );
  });
  await step('Panel', 'QA-11: una sección inexistente del panel no muestra el Resumen', ep, async () => {
    await ep.goto(`${base}/admin/esta-seccion-no-existe`);
    await ep.waitForSelector('h1:has-text("Sin acceso")');
    await ep.goto(`${base}/admin/paginas/xyz`); // QA-18: sin mensajes técnicos
    await ep.waitForSelector('h1:has-text("No existe")');
    assert(!/Invalid input|NaN/.test(await ep.content()), 'sin texto técnico');
  });
  await ed.close();

  // --- Sitio público ---
  const pub = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const pp = watch(await pub.newPage(), 'publico');
  await step('Sitio público', 'navegación por el menú, búsqueda y paginación', pp, async () => {
    await pp.goto(`${base}/`);
    // Submenús desplegables (botón con aria-expanded) y enlaces directos.
    await pp.locator('#menu-principal .nav-btn', { hasText: 'La Secretaría' }).click();
    assert((await pp.locator('#menu-principal .nav-btn', { hasText: 'La Secretaría' }).getAttribute('aria-expanded')) === 'true', 'submenú abierto');
    await pp.locator('#menu-principal a', { hasText: 'Misión y visión' }).click();
    await pp.waitForURL('**/secretaria#mision');
    await pp
      .locator('#menu-principal a', { hasText: /^Noticias$/ })
      .first()
      .click();
    await pp.waitForURL('**/noticias');
    await pp.goto(`${base}/buscar?q=inscripciones`);
    assert((await pp.content()).includes('Inscripciones escolares'), 'resultados de búsqueda');
    const r = await pub.request.get(`${base}/noticias?page=2`);
    assert(r.status() === 200, 'paginación');
  });
  await step('Sitio público', 'formulario PQRSD: validación y radicación', pp, async () => {
    await pp.goto(`${base}/atencion`);
    await pp.locator('form[action="/atencion/pqrsd"] button[type=submit]').click();
    // La validación del navegador (required) impide el envío vacío; se envía con datos inválidos.
    await pp.evaluate(() => document.querySelectorAll('form[action="/atencion/pqrsd"] [required]').forEach((el) => el.removeAttribute('required')));
    await pp.locator('form[action="/atencion/pqrsd"] button[type=submit]').click();
    await pp.waitForSelector('.field-error, .notice--error');
    await pp.selectOption('select[name=tipo]', { index: 1 });
    await pp.fill('input[name=nombre]', 'María Pérez Gómez');
    await pp.selectOption('select[name=tipo_documento]', { index: 1 });
    await pp.fill('input[name=documento]', '1110123456');
    await pp.fill('input[name=email]', 'maria@example.com');
    await pp.fill('input[name=asunto]', 'Solicitud de certificado');
    await pp.fill('textarea[name=mensaje]', 'Solicito un certificado de estudios del año 2019, gracias.');
    await pp.check('input[name=acepto]');
    await pp.locator('form[action="/atencion/pqrsd"] button[type=submit]').click();
    await pp.waitForURL('**/atencion/pqrsd/confirmacion');
    assert(/SEM-\d{4}-\d{8}/.test(await pp.content()), 'radicado');
  });
  await step('Errores', 'página 404 con diseño institucional', pp, async () => {
    const res = await pp.goto(`${base}/esta-pagina-no-existe`);
    assert(res?.status() === 404, 'estado 404');
    assert((await pp.content()).includes('no existe'), 'mensaje');
    await pp.screenshot({ path: path.join(OUT, '10-404.png') });
  });

  // --- Vista en dispositivos ---
  const authState = await desktop.storageState();
  const profiles: Array<[string, Parameters<Browser['newContext']>[0]]> = [
    ['escritorio', { viewport: { width: 1366, height: 900 } }],
    ['tableta', device('iPad (gen 7)')],
    ['movil', device('Pixel 7')],
  ];
  const publicPaths = ['/', '/secretaria', '/tramites', '/noticias', '/normatividad', '/atencion', '/transparencia', '/contacto', '/buscar?q=matricula'];
  const adminPaths = [
    '/admin',
    '/admin/paginas',
    '/admin/noticias',
    '/admin/multimedia',
    '/admin/sliders',
    '/admin/usuarios',
    '/admin/estadisticas',
    '/admin/cuenta',
  ];
  for (const [name, opts] of profiles) {
    const ctx = await browser.newContext({ ...opts, storageState: authState });
    const vp = watch(await ctx.newPage(), name);
    await step('Visual', `${name}: sin desborde horizontal, imágenes cargadas y etiquetas en formularios`, vp, async () => {
      const problems: string[] = [];
      for (const url of [...publicPaths, ...adminPaths]) {
        await vp.goto(base + url);
        await vp.waitForLoadState('networkidle');
        const r = await vp.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: window.innerWidth,
          broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
          unlabeled: [...document.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')].filter(
            (el) => !el.getAttribute('aria-label') && !(el.id && document.querySelector(`label[for="${el.id}"]`)) && !el.closest('label'),
          ).length,
        }));
        if (r.sw > r.iw + 1) problems.push(`${url} desborda ${r.sw}>${r.iw}`);
        if (r.broken.length) problems.push(`${url} imágenes rotas ${r.broken.join(' ')}`);
        if (r.unlabeled) problems.push(`${url} ${r.unlabeled} campo(s) sin etiqueta`);
      }
      await vp.goto(`${base}/`);
      await vp.screenshot({ path: path.join(OUT, `vista-${name}-inicio.png`), fullPage: true });
      await vp.goto(`${base}/admin/noticias`);
      await vp.waitForSelector('table, .state');
      await vp.screenshot({ path: path.join(OUT, `vista-${name}-panel.png`) });
      assert(!problems.length, problems.join(' | '));
    });
    if (name === 'movil') {
      await step('Visual', 'móvil: menú del sitio y del panel se abren', vp, async () => {
        await vp.goto(`${base}/`);
        await vp.click('.menu-toggle');
        await vp.waitForSelector('#menu-principal a', { state: 'visible' });
        await vp.screenshot({ path: path.join(OUT, 'vista-movil-menu-sitio.png') });
        await vp.goto(`${base}/admin`);
        await vp.click('.admin-menu-toggle');
        await vp.waitForSelector('#admin-menu a', { state: 'visible' });
        await vp.screenshot({ path: path.join(OUT, 'vista-movil-menu-panel.png') });
      });
    }
    await ctx.close();
  }

  await step('Accesibilidad', 'QA-06: Escape cierra el submenú y actualiza aria-expanded', pp, async () => {
    await pp.goto(`${base}/`);
    const btn = pp.locator('#menu-principal .nav-btn', { hasText: 'La Secretaría' });
    await btn.click();
    assert((await btn.getAttribute('aria-expanded')) === 'true', 'abierto');
    await pp.keyboard.press('Escape');
    assert((await btn.getAttribute('aria-expanded')) === 'false', 'aria-expanded tras Escape');
    assert(!(await pp.locator('#menu-principal .has-sub', { has: btn }).locator('.submenu').isVisible()), 'QA-06b: el submenú queda oculto');
  });
  await step('Accesibilidad', 'QA-16: el enlace "Saltar al contenido" mueve el foco al contenido principal', pp, async () => {
    await pp.goto(`${base}/`);
    await pp.keyboard.press('Tab');
    await pp.keyboard.press('Enter');
    assert((await pp.evaluate(() => document.activeElement?.id)) === 'contenido', 'foco en <main>');
  });
  await step('Accesibilidad', 'navegación por teclado: enlace para saltar al contenido y foco visible', pp, async () => {
    await pp.goto(`${base}/`);
    await pp.keyboard.press('Tab');
    const first = await pp.evaluate(() => ({
      cls: document.activeElement?.className ?? '',
      outline: getComputedStyle(document.activeElement as Element).outlineStyle,
    }));
    assert(/skip-link/.test(first.cls), `primer foco: ${first.cls}`);
    assert(first.outline !== 'none', 'foco visible');
  });

  if (BROWSER === 'chromium')
    notRun('Visual', 'Firefox y WebKit en esta ejecución', 'solo Chromium está instalado aquí; la CI los ejecuta con E2E_BROWSER=firefox|webkit');
  notRun(
    'Errores',
    'error 500 provocado en el navegador',
    'no hay forma segura de provocarlo sin alterar el código; cubierto por pruebas unitarias del filtro de errores y por la validación de contratos',
  );

  await step('Calidad', 'sin errores inesperados en la consola del navegador', null, async () => {
    assert(consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  });
  await step('Calidad', 'sin errores en el registro del servidor', null, async () => {
    assert(serverErrors.length === 0, serverErrors.slice(0, 3).join(' | '));
  });

  await browser.close();
  await h.close();
  const summary = {
    fecha: new Date().toISOString(),
    navegador: `${BROWSER} ${browser.version()}`,
    aprobadas: steps.filter((s) => s.resultado === 'aprobada').length,
    fallidas: steps.filter((s) => s.resultado === 'fallida').length,
    noEjecutadas: steps.filter((s) => s.resultado === 'no_ejecutada').length,
    pasos: steps,
    erroresConsola: consoleErrors,
    erroresServidor: serverErrors,
  };
  fs.writeFileSync(path.join(OUT, 'informe-e2e.json'), JSON.stringify(summary, null, 2));
  console.log(
    `\nE2E: ${summary.aprobadas} aprobadas, ${summary.fallidas} fallidas, ${summary.noEjecutadas} no ejecutadas. Informe: ${path.relative(ROOT, OUT)}/informe-e2e.json`,
  );
  process.exit(summary.fallidas ? 1 : 0);
}

main().catch(async (e: unknown) => {
  console.error(e);
  await browser?.close().catch(() => undefined);
  await h?.close().catch(() => undefined);
  process.exit(1);
});
