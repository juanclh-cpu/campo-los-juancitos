/**
 * El mapa: que los colores clasifiquen bien, que el plano se dibuje en los
 * tres modos y que la ficha del potrero muestre lo que tiene que mostrar.
 *
 *   node pruebas/prueba-mapa.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = process.env.CHROME ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUERTO = 8911;
const BASE = 'http://localhost:' + PUERTO;
const CAPTURAS = 'docs/capturas';

let fallas = 0;
const ok = (c, t, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + t + (d ? ' — ' + d : ''));
  if (!c) fallas++;
};
const titulo = t => console.log('\n' + t);
const dormir = ms => new Promise(r => setTimeout(r, ms));
// En hora argentina, que es la del script: con UTC, de noche da un día de más.
const EN_EL_CAMPO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric', month: '2-digit', day: '2-digit'
});
const haceDias = n => EN_EL_CAMPO.format(new Date(Date.now() - n * 86400000));

async function tocar(pagina, texto, modo = 'exacto') {
  const hecho = await pagina.evaluate((texto, modo) => {
    const b = [...document.querySelectorAll('button')].find(b => {
      const t = b.textContent.trim();
      return modo === 'exacto' ? t === texto : t.includes(texto);
    });
    if (!b) return false;
    b.click();
    return true;
  }, texto, modo);
  if (!hecho) throw new Error('no encontré el botón "' + texto + '"');
  await dormir(200);
}

async function principal() {
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const servidor = spawn(process.execPath, ['pruebas/servidor.mjs', String(PUERTO)],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => servidor.stdout.on('data', d =>
    String(d).includes('token:') && r()));
  const activacion = await (await fetch(BASE + '/_activacion')).json();
  const { catalogos } = await (await fetch(
    BASE + '/api?accion=catalogos&token=' + activacion.token)).json();
  const CAT = catalogos.categorias[0];
  const D1 = catalogos.duenos[0];
  const D2 = catalogos.duenos[1];

  // Los potreros se eligen según lo que diga el plano y la lista, así la
  // prueba anda igual con los datos del campo o con los de ejemplo.
  const geo = JSON.parse(fs.readFileSync('app/potreros-geo.json', 'utf8'));
  const enPlano = Object.fromEntries(geo.potreros.map(g => [g.id, g]));
  const enLista = Object.fromEntries(catalogos.potreros.map(p => [p.id, p]));

  const dePastoreo = catalogos.potreros
    .filter(p => enPlano[p.id] && enPlano[p.id].car === 'Pastoreo' &&
      p.uso !== 'Agrícola' && p.uso !== 'Instalaciones' && p.hectareas > 5)
    .sort((a, b) => b.hectareas - a.hectareas);
  const AGRICOLA = catalogos.potreros.find(p => enPlano[p.id] &&
    enPlano[p.id].car === 'Pastoreo' && p.uso === 'Agrícola');
  const SIN_LISTA = geo.potreros.find(g => g.car === 'Pastoreo' && !enLista[g.id]);
  const INSTALACION = geo.potreros.find(g => g.car !== 'Pastoreo');
  const SIN_PLANO = catalogos.potreros.find(p => !enPlano[p.id]);

  if (dePastoreo.length < 6 || !AGRICOLA || !SIN_LISTA || !INSTALACION) {
    throw new Error('no hay potreros suficientes para la prueba');
  }

  // Tres ocupados con distinta carga y tres vacíos con distinto descanso.
  const [CARGADO, MEDIO, HOLGADO, RECIEN, LISTO, MITAD] = dePastoreo;
  const cab = (p, ev) => Math.max(1, Math.round(p.hectareas * ev));

  const registros = [
    { id: 'x1', hoja: 'Recuentos', fecha: haceDias(10), potrero: MEDIO.id,
      categoria: CAT, dueno: D1, cabezas: cab(MEDIO, 1.25) },
    { id: 'x2', hoja: 'Recuentos', fecha: haceDias(10), potrero: HOLGADO.id,
      categoria: CAT, dueno: D2, cabezas: cab(HOLGADO, 0.5) },
    { id: 'x3', hoja: 'Recuentos', fecha: haceDias(10), potrero: CARGADO.id,
      categoria: CAT, dueno: D1, cabezas: cab(CARGADO, 3) },
    // Entran y salen del campo, para que el descanso quede limpio.
    { id: 'x4', hoja: 'Recuentos', fecha: haceDias(50), potrero: RECIEN.id,
      categoria: CAT, dueno: D1, cabezas: 20 },
    { id: 'x5', hoja: 'Movimientos', fecha: haceDias(3), potrero_origen: RECIEN.id,
      potrero_destino: 'Salida del campo', categoria: CAT, dueno: D1,
      cabezas: 20, motivo: 'Venta' },
    { id: 'x6', hoja: 'Recuentos', fecha: haceDias(60), potrero: LISTO.id,
      categoria: CAT, dueno: D1, cabezas: 10 },
    { id: 'x7', hoja: 'Movimientos', fecha: haceDias(40), potrero_origen: LISTO.id,
      potrero_destino: 'Salida del campo', categoria: CAT, dueno: D1,
      cabezas: 10, motivo: 'Venta' },
    { id: 'x8', hoja: 'Recuentos', fecha: haceDias(50), potrero: MITAD.id,
      categoria: CAT, dueno: D1, cabezas: 15 },
    { id: 'x9', hoja: 'Movimientos', fecha: haceDias(25), potrero_origen: MITAD.id,
      potrero_destino: 'Salida del campo', categoria: CAT, dueno: D1,
      cabezas: 15, motivo: 'Venta' },
    { id: 'x10', hoja: 'Recorridas', fecha: haceDias(1), potrero: MEDIO.id,
      agua: 'Sin agua', alambre: 'Roto', pasto: '2 Normal', nota: 'bebedero roto' },
    { id: 'x11', hoja: 'Lluvias', fecha: haceDias(2), mm: 31, lugar: 'Casa' },
    { id: 'x12', hoja: 'Sanidad', fecha: haceDias(4), potrero: MEDIO.id,
      tipo: 'Vacunación', categoria: CAT, dueno: D1, cabezas: 70,
      causa_producto: 'aftosa' }
  ].map(r => Object.assign({ cargado_en: r.fecha + 'T09:00:00', persona: 'Nahuel' }, r));

  await fetch(BASE + '/api', {
    method: 'POST',
    body: JSON.stringify({ token: activacion.token, accion: 'guardar',
      persona: 'Nahuel', dispositivo: 'prueba', registros })
  });

  await fetch(BASE + '/_editar-potrero', {
    method: 'POST',
    body: JSON.stringify({ id: AGRICOLA.id, quien_lo_usa: 'Diego Pardo' })
  });

  const navegador = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 390, height: 844, isMobile: true,
    hasTouch: true, deviceScaleFactor: 2 });
  pagina.on('pageerror', e => { console.log('  ! error en la app:', e.message); fallas++; });

  try {
    await pagina.goto(BASE + '/#a=' + activacion.codigo, { waitUntil: 'networkidle0' });
    await pagina.waitForFunction(() => /Cómo te llamás/.test(document.body.textContent));
    await pagina.evaluate(() => {
      document.querySelector('input[type="text"]').value = 'Nahuel';
      [...document.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'LISTO').click();
    });
    await pagina.waitForFunction(() => /MAPA DEL CAMPO/.test(document.body.textContent),
      { timeout: 20000 });
    ok(true, 'el botón del mapa está en la pantalla principal');

    titulo('1. Los colores del descanso');
    const umbrales = { dias_descanso_min: 20, dias_descanso_listo: 35 };
    const casos = [
      [{ ocupado: 'no', dias_descanso: 5 }, 'rojo', 'recién salió'],
      [{ ocupado: 'no', dias_descanso: 19 }, 'rojo', 'justo antes del mínimo'],
      [{ ocupado: 'no', dias_descanso: 20 }, 'amarillo', 'en el mínimo'],
      [{ ocupado: 'no', dias_descanso: 35 }, 'amarillo', 'en el límite de listo'],
      [{ ocupado: 'no', dias_descanso: 36 }, 'verde', 'listo para entrar'],
      [{ ocupado: 'sí', dias_ocupado: 3 }, 'azul', 'con hacienda'],
      [{ ocupado: 'no', dias_descanso: '' }, 'sindatos', 'sin saber cuándo salió'],
      [null, 'sindatos', 'sin fila de descanso']
    ];
    for (const [fila, esperado, que] of casos) {
      const color = await pagina.evaluate((f, u) => colorDescanso(f, u), fila, umbrales);
      ok(color === esperado, que + ' → ' + esperado, color);
    }

    titulo('2. Los colores de la carga');
    const cargas = [
      [0.5, 'verde', 'holgado'],
      [1.11, 'verde', 'justo abajo del amarillo'],
      [1.2, 'amarillo', 'cerca del tope'],
      [1.6, 'amarillo', 'justo en el tope'],
      [1.7, 'rojo', 'pasado del tope'],
      [null, 'sindatos', 'sin hacienda']
    ];
    for (const [ev, esperado, que] of cargas) {
      const color = await pagina.evaluate(v => colorCarga(v, 1.6), ev);
      ok(color === esperado, que + ' → ' + esperado, color);
    }

    const ev = await pagina.evaluate(() => evPorHectarea(
      [{ categoria: 'Vaquillona', cabezas: 10 }, { categoria: 'Toro', cabezas: 2 }],
      10, { Vaquillona: 0.8, Toro: 1.3 }));
    ok(ev === 1.06, 'la cuenta de EV por hectárea usa los coeficientes', String(ev));

    titulo('3. El plano en los tres modos');
    await tocar(pagina, 'MAPA DEL CAMPO', 'incluye');
    await pagina.waitForFunction(() => document.querySelectorAll('polygon').length > 10,
      { timeout: 25000 });
    await dormir(600);
    await pagina.screenshot({ path: CAPTURAS + '/20-mapa-descanso.png' });

    const franja = await pagina.evaluate(() => document.body.innerText);
    ok(/cabezas en el campo/.test(franja), 'la franja dice las cabezas del campo');
    ok(/31 mm/.test(franja), 'la lluvia de 7 días', '31 mm');
    ok(/potreros listos para entrar/.test(franja), 'y cuántos están listos');
    ok(/1a/.test(franja) && /con problema/.test(franja),
      'avisa del potrero con problema en la recorrida');

    const colores = () => pagina.evaluate(() => {
      const r = {};
      document.querySelectorAll('polygon[data-potrero]').forEach(p => {
        r[p.getAttribute('data-potrero')] = p.getAttribute('class');
      });
      return r;
    });
    const c1 = await colores();
    ok(/p-azul/.test(c1[MEDIO.id] || ''), 'el ocupado va en azul',
      MEDIO.id + ': ' + c1[MEDIO.id]);
    ok(/p-rojo/.test(c1[RECIEN.id] || ''), 'el que recién salió, en rojo',
      RECIEN.id + ': ' + c1[RECIEN.id]);
    ok(/p-verde/.test(c1[LISTO.id] || ''), 'el descansado, en verde',
      LISTO.id + ': ' + c1[LISTO.id]);
    ok(/p-amarillo/.test(c1[MITAD.id] || ''), 'el del medio, en amarillo',
      MITAD.id + ': ' + c1[MITAD.id]);
    ok(/p-gris/.test(c1[AGRICOLA.id] || ''), 'el agrícola, en gris rayado',
      AGRICOLA.id + ': ' + c1[AGRICOLA.id]);
    ok(/p-gris/.test(c1[INSTALACION.id] || ''), 'las instalaciones, en gris liso',
      INSTALACION.id + ' (' + INSTALACION.car + '): ' + c1[INSTALACION.id]);
    ok(/p-sindatos/.test(c1[SIN_LISTA.id] || ''),
      'el que no está en la lista, sin datos',
      SIN_LISTA.id + ': ' + c1[SIN_LISTA.id]);
    if (SIN_PLANO) {
      ok(c1[SIN_PLANO.id] === undefined,
        'un potrero sin dibujo en el plano no se inventa', SIN_PLANO.id);
    }
    ok(/ocupado-de-mas/.test(c1[MEDIO.id] || ''),
      'el ocupado hace mucho lleva borde rojo', c1[MEDIO.id]);

    const textos = await pagina.evaluate(() =>
      [...document.querySelectorAll('.mapa-caja text')].map(t => t.textContent));
    ok(textos.indexOf(MEDIO.id) >= 0, 'los potreros llevan su número', MEDIO.id);
    ok(textos.some(t => /cab\./.test(t)), 'y los grandes, las cabezas',
      textos.filter(t => /cab\./.test(t)).join(', '));
    ok(textos.some(t => /Agricultura: no entrar/.test(t)),
      'el agrícola avisa que no se entra');
    ok(textos.some(t => /Ercolano/.test(t)), 'se ven los linderos');

    await tocar(pagina, 'Carga');
    await dormir(700);
    await pagina.screenshot({ path: CAPTURAS + '/21-mapa-carga.png' });
    const c2 = await colores();
    ok(/p-rojo/.test(c2[CARGADO.id] || ''), 'en Carga, el cargado va en rojo',
      CARGADO.id + ': ' + c2[CARGADO.id]);
    ok(/p-amarillo/.test(c2[MEDIO.id] || ''), 'el del medio, amarillo',
      MEDIO.id + ': ' + c2[MEDIO.id]);
    ok(/p-verde/.test(c2[HOLGADO.id] || ''), 'y el holgado, verde',
      HOLGADO.id + ': ' + c2[HOLGADO.id]);

    await tocar(pagina, 'Clientes');
    await dormir(700);
    await pagina.screenshot({ path: CAPTURAS + '/22-mapa-clientes.png' });
    const leyenda = await pagina.evaluate(() => document.body.innerText);
    ok(leyenda.indexOf(D1) >= 0 && leyenda.indexOf(D2) >= 0,
      'en Clientes la leyenda nombra a los dueños');
    // El cuadradito de cada dueño es un span: con fill solo (que es de SVG)
    // quedaba invisible y la leyenda no servía para leer el plano.
    const cuadros = await pagina.evaluate(() =>
      [...document.querySelectorAll('.leyenda .cuadro')]
        .map(c => getComputedStyle(c).backgroundColor));
    const sinColor = cuadros.filter(c =>
      !c || c === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(c));
    ok(cuadros.length > 1 && sinColor.length === 0,
      'y cada dueño tiene su color a la vista',
      cuadros.length + ' cuadros, ' + sinColor.length + ' sin color');

    titulo('4. La ficha del potrero');
    await tocar(pagina, 'Descanso');
    await dormir(500);
    await pagina.evaluate(id => {
      document.querySelector('polygon[data-potrero="' + id + '"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, MEDIO.id);
    await pagina.waitForFunction(() => /Hacienda/.test(document.body.textContent),
      { timeout: 10000 });
    await dormir(400);
    await pagina.screenshot({ path: CAPTURAS + '/23-ficha-potrero.png' });
    const ficha = await pagina.evaluate(() => document.body.innerText);
    ok(/hect/.test(ficha), 'la ficha dice las hectáreas');
    ok(/EV por hect/.test(ficha), 'y la carga en EV por hectárea');
    ok(/Última recorrida/.test(ficha) && /Sin agua/.test(ficha),
      'muestra la última recorrida y su problema');
    ok(/Último manejo/.test(ficha) && /Vacunación/.test(ficha),
      'y el último manejo');
    ok(/Ocupado hace/.test(ficha), 'dice hace cuánto está ocupado');
    ok(/Mover hacienda desde acá/.test(ficha) && /Contar este potrero/.test(ficha),
      'con los dos botones para cargar');

    await tocar(pagina, 'Contar este potrero');
    await dormir(500);
    const contar = await pagina.evaluate(() => document.body.innerText);
    ok(/Qué son|categoría/i.test(contar),
      'Contar abre el formulario con el potrero ya elegido',
      contar.replace(/\n+/g, ' | ').slice(0, 70));

    titulo('5. Aviso al mover hacia un potrero de agricultura');
    await pagina.evaluate(() => alInicio());
    await dormir(300);
    await tocar(pagina, 'Mover', 'incluye');
    const tocarPotrero = async id => {
      await pagina.waitForFunction(id => [...document.querySelectorAll('button span')]
        .some(s => s.textContent.trim() === id), { timeout: 10000 }, id);
      await pagina.evaluate(id => {
        [...document.querySelectorAll('button')]
          .find(b => b.querySelector('span') &&
            b.querySelector('span').textContent.trim() === id).click();
      }, id);
      await dormir(300);
    };
    await pagina.waitForFunction(() => /De dónde salen/.test(document.body.textContent),
      { timeout: 10000 });
    await tocarPotrero(MEDIO.id);
    await tocarPotrero(AGRICOLA.id);
    await tocar(pagina, CAT);
    await tocar(pagina, D1);
    for (const d of ['5']) await tocar(pagina, d);
    await tocar(pagina, 'LISTO');
    await dormir(400);
    const confirmacion = await pagina.evaluate(() => document.body.innerText);
    ok(/agricultura/i.test(confirmacion),
      'la confirmación avisa que el destino es de agricultura');
    await pagina.screenshot({ path: CAPTURAS + '/24-aviso-agricola.png' });
    await tocar(pagina, 'GUARDAR');
    await dormir(400);
    const seguro = await pagina.evaluate(() => document.body.innerText);
    ok(/Seguro/.test(seguro) && /SÍ, GUARDAR IGUAL/.test(seguro),
      'y antes de guardar pregunta de nuevo',
      seguro.replace(/\n+/g, ' | ').slice(0, 80));

  } finally {
    await navegador.close();
    servidor.kill();
  }

  console.log('\n' + (fallas === 0
    ? '✓ El mapa anda. Capturas en ' + CAPTURAS
    : '✗ ' + fallas + ' prueba(s) fallaron.'));
  process.exit(fallas === 0 ? 0 : 1);
}

principal().catch(e => { console.error(e.message); process.exit(1); });
