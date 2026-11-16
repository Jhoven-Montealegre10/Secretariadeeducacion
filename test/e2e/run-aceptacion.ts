/**
 * Prueba de aceptación en un navegador real (Playwright) contra PostgreSQL de pruebas, con datos ficticios:
 *   1. crear un usuario por invitación, activar la cuenta y configurar el MFA;
 *   2. recuperar la contraseña por correo y volver a entrar (el MFA sigue exigido);
 *   3. crear una página desde el panel, publicarla y verla en el sitio;
 *   4. editarla desde el panel y comprobar el cambio en el sitio;
 *   5. crear un banner (slider) para esa página y comprobar que aparece solo allí y que su enlace funciona;
 *   6. recorrer todos los enlaces internos del sitio público y del menú del panel.
 *
 *   npm run build && node node_modules/typescript/bin/tsc -p tsconfig.json && node dist/test/e2e/run-aceptacion.js
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { CryptoService } from '../../src/infrastructure/security/crypto.service';
import { createHarness, jpegBuffer, type Harness } from '../support/harness';

const OUT = path.resolve(process.env.E2E_OUT ?? path.join(__dirname, '..', '..', '..', 'test-results', 'aceptacion'));
const results: Array<{ prueba: string; ok: boolean; detalle?: string }> = [];
const consoleErrors: string[] = [];
let h: Harness;
let base = '';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function check(prueba: string, page: Page | null, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ prueba, ok: true });
    console.log(`  ✓ ${prueba}`);
  } catch (e) {
    const detalle = (e as Error).message.split('\n')[0];
    results.push({ prueba, ok: false, detalle });
    console.log(`  ✗ ${prueba}: ${detalle}`);
    if (page) await page.screenshot({ path: path.join(OUT, `fallo-${results.length}.png`), fullPage: true }).catch(() => undefined);
  }
}

function watch(page: Page, label: string): Page {
  page.on('console', (m) => {
    if (m.type() === 'error' && !/status of 4\d\d/.test(m.text())) consoleErrors.push(`${label}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleErrors.push(`${label} pageerror: ${e.message}`));
  return page;
}

async function go(page: Page, url: string) {
  if (page.url() !== 'about:blank') await page.waitForLoadState('networkidle').catch(() => undefined);
  return page.goto(url.startsWith('http') ? url : base + url);
}

async function isolate(ctx: BrowserContext): Promise<BrowserContext> {
  await ctx.route('https://www.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Mapa</title>' }));
  await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route('https://fonts.gstatic.com/**', (r) => r.fulfill({ status: 404, body: '' }));
  return ctx;
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await go(page, '/admin/login');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('button[type=submit]');
}

/** Primer ingreso: lee el secreto mostrado junto al QR, confirma con un código y entra al panel. */
async function enrollMfa(page: Page): Promise<string> {
  await page.waitForSelector('img.qr');
  await page.click('details summary');
  const secret = (await page.textContent('code.secret'))?.trim() ?? '';
  await page.fill('input[name=codigo]', h.totp.generate(secret, h.clock.now()));
  await page.click('button[type=submit]');
  await page.waitForSelector('ul.codes');
  await page.check('#guardados');
  await page.click('text=Ir al panel');
  await page.waitForSelector('#admin-menu a');
  return secret;
}

async function totpFor(email: string): Promise<string> {
  await h.db.run('UPDATE usuarios SET mfa_ultimo_paso = 0 WHERE email = $1', [email]);
  const enc = await h.db.scalar<string>('SELECT mfa_secreto_enc FROM usuarios WHERE email = $1', [email]);
  return h.totp.generate(h.get(CryptoService).decrypt(enc), h.clock.now());
}

const lastLink = (to: string) => {
  const m = [...h.mailer.outbox].reverse().find((x) => x.to === to);
  return /#token=([\w-]+)/.exec(m?.text ?? '')?.[1] ?? '';
};

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  h = await createHarness();
  await h.app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(h.app.getHttpServer().address() as AddressInfo).port}`;
  await h.createUser({ email: 'admin@example.gov.co', nombre: 'Ana Administradora', rol: 'administrador', mfa: false });
  const foto = path.join(OUT, 'banner.jpg');
  fs.writeFileSync(foto, await jpegBuffer());

  const browser = await chromium.launch();
  const ctx = await isolate(await browser.newContext({ viewport: { width: 1366, height: 900 } }));
  const p = watch(await ctx.newPage(), 'admin');
  console.log(`Prueba de aceptación (Chromium) contra ${base}`);

  await check('Administrador: primer ingreso con MFA', p, async () => {
    await login(p, 'admin@example.gov.co', 'cometa verde sobre el nevado del tolima');
    await enrollMfa(p);
  });

  // ---------------------------------------------------------------- 1. Nuevo usuario
  const nuevo = { email: 'paula.prueba@example.gov.co', nombre: 'Paula Prueba', password: 'mariposas azules sobre el rio combeima' };
  let secretoPaula = '';
  await check('Usuarios: crear un usuario nuevo desde el panel (se envía la invitación)', p, async () => {
    await go(p, '/admin/usuarios');
    await p.click('text=+ Nuevo usuario');
    await p.fill('.modal input[name=nombre]', nuevo.nombre);
    await p.fill('.modal input[name=email]', nuevo.email);
    await p.click('.modal >> text=Crear e invitar');
    await p.waitForSelector(`text=${nuevo.email}`);
    assert(lastLink(nuevo.email), 'no llegó el correo de invitación');
  });

  const u = watch(await (await isolate(await browser.newContext())).newPage(), 'usuario');
  await check('Usuarios: la persona activa su cuenta con el enlace, define su contraseña y configura el MFA', u, async () => {
    await go(u, `/admin/restablecer#token=${lastLink(nuevo.email)}`);
    await u.fill('input[name=password]', nuevo.password);
    await u.fill('input[name=confirmar]', nuevo.password);
    await u.click('button[type=submit]');
    await u.waitForSelector('h1:has-text("Contraseña actualizada")');
    await login(u, nuevo.email, nuevo.password);
    secretoPaula = await enrollMfa(u);
    assert(secretoPaula, 'sin secreto MFA');
    assert((await u.textContent('h1')) ?? ''.includes('Hola'), 'no se ve el resumen');
  });

  // ---------------------------------------------------------------- 2. Recuperar contraseña
  const nuevaClave = 'tortugas verdes caminan por la playa dorada';
  await check('Recuperar contraseña: "¿Olvidó su contraseña?" envía el correo y el enlace cambia la clave', u, async () => {
    await u.context().clearCookies();
    await go(u, '/admin/login');
    await u.click('text=¿Olvidó su contraseña?');
    await u.fill('input[name=email]', nuevo.email);
    await u.click('button[type=submit]');
    await u.waitForSelector('h1:has-text("Revise su correo")');
    const token = lastLink(nuevo.email);
    assert(token, 'no llegó el correo de recuperación');
    await go(u, `/admin/restablecer#token=${token}`);
    await u.fill('input[name=password]', nuevaClave);
    await u.fill('input[name=confirmar]', nuevaClave);
    await u.click('button[type=submit]');
    await u.waitForSelector('h1:has-text("Contraseña actualizada")');
  });
  await check('Recuperar contraseña: la clave anterior ya no sirve; la nueva sí, y se sigue pidiendo el código MFA', u, async () => {
    await login(u, nuevo.email, nuevo.password);
    await u.waitForSelector('.notice--error:not([hidden])');
    await login(u, nuevo.email, nuevaClave);
    await u.waitForSelector('input[name=codigo]');
    await u.fill('input[name=codigo]', await totpFor(nuevo.email));
    await u.click('button[type=submit]');
    await u.waitForSelector('#admin-menu a');
  });
  await check('Recuperar contraseña: un correo inexistente recibe la misma respuesta (no revela cuentas)', u, async () => {
    await u.context().clearCookies();
    const antes = h.mailer.outbox.length;
    await go(u, '/admin/login');
    await u.click('text=¿Olvidó su contraseña?');
    await u.fill('input[name=email]', 'no-existe@example.gov.co');
    await u.click('button[type=submit]');
    await u.waitForSelector('h1:has-text("Revise su correo")');
    assert(h.mailer.outbox.length === antes, 'se envió correo a una cuenta inexistente');
  });

  // ---------------------------------------------------------------- 3 y 4. Páginas
  let slug = '';
  await check('Páginas: crear una página desde el panel con texto y botones, y publicarla', p, async () => {
    await go(p, '/admin/paginas/nueva');
    await p.fill('input[name=titulo]', 'Programa de Alimentación Escolar');
    await p.selectOption('.block-editor .toolbar select', 'texto');
    await p.click('text=+ Agregar bloque');
    await p.click('.block .rte__area');
    await p.keyboard.type('Información del PAE para familias y colegios.');
    for (const [texto, enlace] of [
      ['Radicar una PQRSD', '/atencion'],
      ['Ver la Secretaría', '/secretaria'],
    ]) {
      await p.selectOption('.block-editor .toolbar select', 'boton');
      await p.click('text=+ Agregar bloque');
      const b = p.locator('.block').last();
      await b.getByLabel('Texto').fill(texto);
      await b.getByLabel('Enlace').fill(enlace);
    }
    await p.selectOption('select[name=estado]', 'publicada');
    await p.click('button[type=submit]');
    await p.waitForURL(/\/admin\/paginas\/\d+/);
    await p.waitForSelector('.toast--ok');
    slug = String(await h.db.scalar<string>("SELECT slug FROM paginas WHERE titulo = 'Programa de Alimentación Escolar'"));
    assert(slug === 'programa-de-alimentacion-escolar', `slug inesperado: ${slug}`);
  });

  const pub = watch(await (await isolate(await browser.newContext())).newPage(), 'publico');
  await check('Páginas: la página publicada se ve en el sitio en su dirección', pub, async () => {
    const r = await go(pub, `/${slug}`);
    assert(r?.status() === 200, `estado ${r?.status()}`);
    assert((await pub.content()).includes('Información del PAE para familias y colegios.'), 'no aparece el texto');
    assert((await pub.title()).includes('Programa de Alimentación Escolar'), 'título de la pestaña');
  });
  await check('Páginas: los botones de la página llevan a donde se configuraron', pub, async () => {
    for (const [texto, destino] of [
      ['Radicar una PQRSD', '/atencion'],
      ['Ver la Secretaría', '/secretaria'],
    ]) {
      await go(pub, `/${slug}`);
      const link = pub.getByRole('link', { name: texto });
      assert((await link.getAttribute('href')) === destino, `href de "${texto}"`);
      await Promise.all([pub.waitForURL(`**${destino}`), link.click()]);
      assert((await pub.locator('h1').first().textContent())?.trim(), `la página ${destino} no cargó`);
    }
  });
  await check('Páginas: editar la página desde el panel (título y texto) y ver el cambio en el sitio', p, async () => {
    await p.fill('input[name=titulo]', 'Programa de Alimentación Escolar (PAE)');
    await p.click('.block .rte__area');
    await p.keyboard.press('End');
    await p.keyboard.type(' Inscripciones abiertas hasta diciembre.');
    await p.click('button[type=submit]');
    await p.waitForSelector('.toast--ok:has-text("Página guardada")');
    await go(pub, `/${slug}`);
    const html = await pub.content();
    assert(html.includes('Inscripciones abiertas hasta diciembre.'), 'el texto editado no aparece');
    assert(html.includes('Programa de Alimentación Escolar (PAE)'), 'el título editado no aparece');
    assert((await h.db.scalar<string>('SELECT slug FROM paginas WHERE id = (SELECT max(id) FROM paginas)')) === slug, 'la dirección cambió al editar');
  });
  await check('Páginas: pasar a borrador la oculta del sitio; publicarla de nuevo la muestra', p, async () => {
    await p.selectOption('select[name=estado]', 'borrador');
    await p.click('button[type=submit]');
    await p.waitForSelector('.toast--ok:has-text("Borrador guardado")');
    assert((await go(pub, `/${slug}`))?.status() === 404, 'el borrador sigue visible');
    await p.selectOption('select[name=estado]', 'publicada');
    await p.click('button[type=submit]');
    await p.waitForSelector('.toast--ok:has-text("Página guardada")');
    assert((await go(pub, `/${slug}`))?.status() === 200, 'no volvió a publicarse');
  });

  // ---------------------------------------------------------------- 5. Banner de la página
  await check('Banners: subir la imagen del banner a la biblioteca', p, async () => {
    await go(p, '/admin/multimedia');
    await p.setInputFiles('#carga-archivos', foto);
    await p.waitForSelector('.media-tile');
  });
  await check('Banners: crear un slider para la página con una diapositiva enlazada', p, async () => {
    await go(p, '/admin/sliders');
    await p.click('text=+ Nuevo slider');
    await p.fill('.modal input[name=nombre]', 'Banner PAE');
    await p.fill('.modal input[name=ubicacion]', `pagina:${slug}`);
    await p.click('.modal >> text=Guardar');
    await p.waitForURL(/\/admin\/sliders\/\d+/);
    await p.click('text=+ Agregar diapositiva');
    await p.click('.modal >> text=Elegir imagen');
    await p.locator('.modal').last().locator('.media-tile').first().click();
    const form = p.locator('.modal').last();
    const inputs = form.locator('input:not([type=checkbox]):not([type=hidden])');
    await inputs.nth(0).fill('Alimentación escolar 2027');
    await inputs.nth(1).fill('Conozca el calendario de entregas');
    await inputs.nth(2).fill('/noticias');
    await inputs.nth(3).fill('Ver noticias');
    await p.click('.modal >> text=Guardar');
    await p.waitForSelector('.slide-row:has-text("Alimentación escolar 2027")');
  });
  await check('Banners: el banner aparece en su página, con imagen, y su enlace lleva a /noticias', pub, async () => {
    await go(pub, `/${slug}`);
    await pub.waitForSelector('[data-carousel]');
    const html = await pub.content();
    assert(html.includes('Alimentación escolar 2027'), 'no aparece el título del banner');
    const img = pub.locator('[data-carousel] img').first();
    assert(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), 'la imagen del banner no carga');
    const link = pub.locator('[data-carousel] a', { hasText: 'Ver noticias' });
    assert((await link.getAttribute('href')) === '/noticias', 'href del banner');
    await Promise.all([pub.waitForURL('**/noticias'), link.click()]);
    assert((await pub.locator('h1').first().textContent())?.includes('Noticias'), 'la página de noticias no cargó');
  });
  await check('Banners: el banner de la página NO aparece en el inicio ni en otras páginas', pub, async () => {
    for (const url of ['/', '/secretaria', '/atencion']) {
      await go(pub, url);
      assert(!(await pub.content()).includes('Alimentación escolar 2027'), `aparece en ${url}`);
    }
  });
  await check('Banners: desactivar el slider lo quita de la página', p, async () => {
    await p.click('text=Editar datos');
    await p.locator('.modal input[type=checkbox]').uncheck();
    await p.click('.modal >> text=Guardar');
    await p.waitForSelector('text=Inactivo');
    await go(pub, `/${slug}`);
    assert(!(await pub.content()).includes('Alimentación escolar 2027'), 'sigue visible');
    await p.click('text=Editar datos');
    await p.locator('.modal input[type=checkbox]').check();
    await p.click('.modal >> text=Guardar');
    await p.waitForSelector('text=Activo');
  });

  // ---------------------------------------------------------------- 6. Enlaces
  const broken: string[] = [];
  const paginas: string[] = [];
  const external = new Set<string>();
  let visited = 0;
  await check('Enlaces: todos los enlaces internos del sitio público responden y las anclas (#) existen', pub, async () => {
    const queue = ['/'];
    const seen = new Set(queue);
    const anchors: Array<[string, string, string]> = [];
    while (queue.length && visited < 400) {
      const url = queue.shift() as string;
      const res = await pub.request.get(base + url, { maxRedirects: 5 });
      visited++;
      paginas.push(`${res.status()} ${url}`);
      if (res.status() >= 400) {
        broken.push(`${url} → ${res.status()}`);
        continue;
      }
      if (!(res.headers()['content-type'] ?? '').includes('text/html')) continue;
      await go(pub, url);
      const hrefs = await pub.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href') ?? ''));
      for (const raw of hrefs) {
        if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
        const abs = new URL(raw, base + url);
        if (abs.origin !== base) {
          external.add(abs.origin);
          continue;
        }
        if (abs.hash && abs.hash.length > 1) anchors.push([url, abs.pathname + abs.search, decodeURIComponent(abs.hash.slice(1))]);
        const key = abs.pathname + abs.search;
        if (key.startsWith('/admin')) continue; // el panel se revisa aparte
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(key);
        }
      }
    }
    for (const [from, target, id] of anchors) {
      if (id === 'contenido') continue; // enlace "Saltar al contenido": el destino es <main id="contenido">
      await go(pub, target);
      if (!(await pub.locator(`[id="${id}"]`).count())) broken.push(`ancla #${id} en ${target} (enlazada desde ${from}) no existe`);
    }
    assert(!broken.length, broken.slice(0, 10).join(' | '));
  });
  await check('Enlaces: cada opción del menú del panel abre su sección (sin "No existe")', p, async () => {
    await go(p, '/admin');
    const links = await p.$$eval('#admin-menu a[href]', (as) => as.map((a) => ({ t: a.textContent?.trim() ?? '', href: a.getAttribute('href') ?? '' })));
    assert(links.length >= 8, `solo ${links.length} opciones`);
    const fallos: string[] = [];
    for (const l of links) {
      if (!l.href.startsWith('/admin')) continue;
      await go(p, l.href);
      if (l.href === '/admin/api-docs') {
        await p.waitForSelector('.opblock'); // documentación Swagger: página propia, sin el encabezado del panel
        continue;
      }
      await p.waitForSelector('main h1');
      const h1 = (await p.textContent('main h1'))?.trim() ?? '';
      if (/no existe|sin permiso/i.test(h1)) fallos.push(`${l.t} (${l.href}) → ${h1}`);
    }
    assert(!fallos.length, fallos.join(' | '));
  });

  await check('Calidad: sin errores en la consola del navegador durante toda la prueba', null, async () => {
    assert(!consoleErrors.length, consoleErrors.slice(0, 5).join(' | '));
  });

  await browser.close();
  await h.close();
  const fallidas = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'informe.json'), JSON.stringify({ results, visited, paginas, broken, external: [...external], consoleErrors }, null, 2));
  console.log(`\nAceptación: ${results.length - fallidas.length} aprobadas, ${fallidas.length} fallidas. Enlaces internos revisados: ${visited}.`);
  console.log(`Sitios externos enlazados (no se visitan): ${[...external].join(', ') || 'ninguno'}`);
  process.exit(fallidas.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
