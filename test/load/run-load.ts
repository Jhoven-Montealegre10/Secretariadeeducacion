/**
 * Prueba de carga en un entorno AUTORIZADO de pruebas (base PostgreSQL temporal; nunca producción).
 *   npm run test:load   (requiere TEST_PG_ADMIN_URL; informe en test-results/carga/informe-carga.json)
 *
 * Escenarios: lectura pública (inicio en caché, API pública, detalle de noticia, búsqueda sin caché),
 * lectura autenticada del panel, y ediciones concurrentes de una misma página.
 * Mide latencia (p50/p97,5/p99/máx), solicitudes por segundo, errores, conexiones de PostgreSQL
 * (pg_stat_activity), CPU y memoria del proceso.
 *
 * SUPUESTOS (deben leerse junto con los resultados):
 *  - Una sola instancia de la aplicación y PostgreSQL en la MISMA máquina que el generador de carga;
 *    en producción la red, el TLS y el proxy añaden latencia.
 *  - Todas las solicitudes salen de una sola IP: el límite general por IP se eleva SOLO en este
 *    proceso de prueba (TEST_RATE_LIMIT_GENERAL); los límites sensibles (login, MFA…) no cambian y
 *    su bloqueo se verifica en test/integration/rate-limit.test.ts.
 *  - Datos sintéticos pequeños (decenas de noticias). Los resultados NO equivalen a un número de
 *    usuarios concurrentes garantizado en producción.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import autocannon from 'autocannon';
import { createHarness, type Harness } from '../support/harness';

process.env.TEST_RATE_LIMIT_GENERAL = '100000000';
const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT = process.env.LOAD_OUT ?? path.join(ROOT, 'test-results', 'carga');
const DURATION = Number(process.env.LOAD_SECONDS ?? 15);

interface Scenario {
  nombre: string;
  url: string;
  conexiones: number;
  headers?: Record<string, string>;
}

async function sampleDb(h: Harness, stop: { done: boolean }) {
  const samples: number[] = [];
  while (!stop.done) {
    try {
      samples.push(
        await h.db.scalar<number>("SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database() AND application_name LIKE 'semibague-%'"),
      );
    } catch {
      /* el muestreo no debe interrumpir la prueba */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return samples;
}

async function run(h: Harness, base: string, s: Scenario) {
  const stop = { done: false };
  const dbSampling = sampleDb(h, stop);
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  let rssMax = 0;
  const memTimer = setInterval(() => (rssMax = Math.max(rssMax, process.memoryUsage().rss)), 250);
  const result = await autocannon({
    url: base + s.url,
    connections: s.conexiones,
    duration: DURATION,
    headers: { 'user-agent': 'autocannon', ...(s.headers ?? {}) },
  });
  clearInterval(memTimer);
  stop.done = true;
  const db = await dbSampling;
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const cpu = process.cpuUsage(cpu0);
  return {
    escenario: s.nombre,
    url: s.url,
    conexiones: s.conexiones,
    duracionS: DURATION,
    solicitudes: result.requests.total,
    solicitudesPorSegundo: Math.round(result.requests.average),
    latenciaMs: {
      p50: result.latency.p50,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
      promedio: Math.round(result.latency.average * 10) / 10,
    },
    errores: { conexion: result.errors, tiempoAgotado: result.timeouts, no2xx: result.non2xx, estados: result.statusCodeStats },
    postgres: {
      conexionesMax: Math.max(0, ...db),
      conexionesPromedio: db.length ? Math.round((db.reduce((a, b) => a + b, 0) / db.length) * 10) / 10 : 0,
      poolMaximoConfigurado: h.config.db.poolMax,
    },
    proceso: { cpuPorcentaje: Math.round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 100), rssMaxMb: Math.round(rssMax / 1048576) },
  };
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  const h = await createHarness();
  await h.app.listen(0, '127.0.0.1');
  const base = `http://127.0.0.1:${(h.app.getHttpServer().address() as AddressInfo).port}`;
  const admin = await h.createUser({ email: 'admin@example.gov.co', rol: 'administrador' });
  const agent = await h.login(admin);
  for (let i = 1; i <= 40; i++) {
    await h.call(agent, 'post', '/api/v1/noticias', {
      titulo: `Noticia de carga número ${i}`,
      resumen: 'Resumen de la noticia de la prueba de carga.',
      contenido: `<p>${'Contenido de la noticia de prueba de carga. '.repeat(20)}</p>`,
      categoria: 'Institucional',
      estado: 'publicada',
      fechaPublicacion: `2026-0${1 + (i % 9)}-1${i % 9}`,
    });
  }
  const cookie = String((await agent.get('/api/v1/auth/sesion')).request.getHeader?.('cookie') ?? '');
  const sessionCookie =
    cookie ||
    (agent as unknown as { jar: { getCookies: (o: object) => Array<{ name: string; value: string }> } }).jar
      .getCookies({ domain: '127.0.0.1', path: '/', secure: false, script: false })
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');

  const scenarios: Scenario[] = [
    { nombre: 'Inicio (HTML, caché pública)', url: '/', conexiones: 50 },
    { nombre: 'API pública de noticias', url: '/api/v1/public/noticias?page=2', conexiones: 50 },
    { nombre: 'Detalle de noticia (HTML)', url: '/noticias/noticia-de-carga-numero-7', conexiones: 50 },
    { nombre: 'Búsqueda (sin caché, consulta a PostgreSQL)', url: '/buscar?q=carga', conexiones: 25 },
    {
      nombre: 'Panel: listado autenticado de noticias',
      url: '/api/v1/noticias?pageSize=20',
      conexiones: 20,
      headers: { cookie: sessionCookie, accept: 'application/json' },
    },
  ];
  const results = [];
  for (const s of scenarios) {
    console.log(`→ ${s.nombre} (${s.conexiones} conexiones, ${DURATION} s)`);
    const r = await run(h, base, s);
    results.push(r);
    console.log(
      `  ${r.solicitudesPorSegundo} sol/s · p50 ${r.latenciaMs.p50} ms · p99 ${r.latenciaMs.p99} ms · no-2xx ${r.errores.no2xx} · errores ${r.errores.conexion} · PG máx ${r.postgres.conexionesMax}`,
    );
  }

  // Ediciones concurrentes: 30 editores guardan a la vez la misma versión de una página.
  const page = await h.call(agent, 'post', '/api/v1/paginas', { titulo: 'Página de concurrencia', bloques: [] });
  const t0 = Date.now();
  const edits = await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      h.call(agent, 'put', `/api/v1/paginas/${page.body.data.id}`, { titulo: `Edición simultánea ${i}`, version: page.body.data.version }),
    ),
  );
  const codes = edits.reduce<Record<number, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), {});
  const concurrency = {
    escenario: 'Ediciones concurrentes de una misma página (30 a la vez)',
    duracionMs: Date.now() - t0,
    estados: codes,
    unaSolaGanadora: codes[200] === 1,
    sinErrores5xx: Object.keys(codes).every((c) => Number(c) < 500),
  };
  console.log(`→ ${concurrency.escenario}: ${JSON.stringify(codes)} en ${concurrency.duracionMs} ms`);

  const metrics = (await h.call(agent, 'get', '/api/v1/sistema/metricas')).body.data;
  const report = {
    fecha: new Date().toISOString(),
    entorno: {
      node: process.version,
      cpus: (await import('node:os')).cpus().length,
      memoriaTotalMb: Math.round((await import('node:os')).totalmem() / 1048576),
      postgres: await h.db.scalar<string>('SHOW server_version'),
      poolMax: h.config.db.poolMax,
      cacheTtlS: h.config.cache.ttlSeconds,
    },
    supuestos: [
      'Una instancia de la aplicación; PostgreSQL y el generador de carga en la misma máquina (sin red, TLS ni proxy).',
      'Todas las solicitudes desde una IP: el límite general por IP se elevó solo en este proceso de prueba; los límites sensibles no cambiaron.',
      'Datos sintéticos (40 noticias). Los resultados no garantizan una cantidad de usuarios concurrentes en producción.',
    ],
    escenarios: results,
    concurrencia: concurrency,
    metricasServidor: { cache: metrics.cache, baseDeDatos: metrics.baseDeDatos, eventLoopRetrasoP99Ms: metrics.eventLoopRetrasoP99Ms },
  };
  fs.writeFileSync(path.join(OUT, 'informe-carga.json'), JSON.stringify(report, null, 2));
  console.log(`Informe: ${path.relative(ROOT, OUT)}/informe-carga.json`);
  await h.close();
  const failed = results.some((r) => r.errores.conexion > 0 || r.errores.no2xx > 0) || !concurrency.sinErrores5xx || !concurrency.unaSolaGanadora;
  process.exit(failed ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
