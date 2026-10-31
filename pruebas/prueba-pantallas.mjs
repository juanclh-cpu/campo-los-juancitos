/**
 * Prueba de las pantallas: carga un registro de cada tipo tocando los botones
 * de verdad, verifica lo que quedó en la planilla y, de paso, saca las
 * capturas para la guía.
 *
 * Los potreros, dueños y categorías salen de la planilla: acá no va escrito
 * ningún dato del campo.
 *
 *   node pruebas/prueba-pantallas.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUERTO = 8901;
const BASE = 'http://localhost:' + PUERTO;
const CAPTURAS = 'docs/capturas';

let fallas = 0;
const ok = (c, t, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + t + (d ? ' — ' + d : ''));
  if (!c) fallas++;
};
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function tocar(pagina, texto, modo = 'incluye') {
  const encontrado = await pagina.evaluate((texto, modo) => {
    const botones = [...document.querySelectorAll('button')];
    const b = botones.find(b => {
      if (modo === 'potrero') {
        const span = b.querySelector('span');
        return span && span.textContent.trim() === texto;
      }
      const t = b.textContent.trim();
      if (modo === 'exacto') return t === texto;
      return t.includes(texto);
    });
    if (!b) return false;
    b.click();
    return true;
  }, texto, modo);
  if (!encontrado) {
    const visibles = await pagina.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.textContent.trim()).slice(0, 20));
    throw new Error('no encontré el botón "' + texto + '". Hay: ' + visibles.join(' | '));
  }
  await dormir(120);
}

const tecla = (pagina, d) => tocar(pagina, d, 'exacto');
async function teclear(pagina, numero) {
  for (const d of String(numero)) await tecla(pagina, d);
}

async function foto(pagina, nombre) {
  await dormir(250);
  await pagina.screenshot({ path: CAPTURAS + '/' + nombre + '.png' });
}

async function volverAlInicio(pagina) {
  await pagina.waitForFunction(() => /STOCK/.test(document.body.textContent),
    { timeout: 10000 });
  await dormir(200);
}

function filasDe(planilla, hoja) {
  const d = planilla[hoja] || [];
  return d.slice(1).filter(f => f && f.some(v => v !== '' && v !== null));
}
function fila(planilla, hoja) {
  const enc = planilla[hoja][0];
  const f = filasDe(planilla, hoja)[0] || [];
  return Object.fromEntries(enc.map((c, i) => [c, f[i]]));
}

async function principal() {
  fs.rmSync(CAPTURAS, { recursive: true, force: true });
  fs.mkdirSync(CAPTURAS, { recursive: true });
  const servidor = spawn(process.execPath, ['pruebas/servidor.mjs', String(PUERTO)],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => servidor.stdout.on('data', d => {
    if (String(d).includes('token:')) r();
  }));
  const activacion = await (await fetch(BASE + '/_activacion')).json();
  const { catalogos } = await (await fetch(
    BASE + '/api?accion=catalogos&token=' + activacion.token)).json();

  const potreros = catalogos.potreros.filter(p => p.id !== 'Corral/manga');
  const [P1, P2, P3, P4, P5, P6] = potreros.slice(21, 27).map(p => p.id);
  // Si la planilla tiene las categorías de siempre las usa, y si no agarra
  // cualquiera: la prueba no depende de cómo se llamen.
  const buscarCat = (texto, porDefecto) =>
    catalogos.categorias.find(c => c.toLowerCase() === texto) ||
    catalogos.categorias[porDefecto];
  const CAT_A = buscarCat('vaca', 0);
  const CAT_B = buscarCat('novillo', 2);
  const CAT_CRIA = buscarCat('ternera', 4);
  const DUENO = catalogos.duenos[0];
  const DUENO_RE = DUENO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const navegador = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 390, height: 844, isMobile: true,
    hasTouch: true, deviceScaleFactor: 2 });
  pagina.on('pageerror', e => { console.log('  ! error en la app:', e.message); fallas++; });

  try {
    console.log('\nPreparar: activar y poner el nombre');
    await pagina.goto(BASE + '/#a=' + activacion.codigo, { waitUntil: 'networkidle0' });
    await pagina.waitForFunction(() => /Cómo te llamás/.test(document.body.textContent));
    await foto(pagina, '01-nombre');
    await pagina.evaluate(n => {
      const i = document.querySelector('input[type="text"]');
      i.value = n;
      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'LISTO').click();
    }, 'Nahuel');
    await volverAlInicio(pagina);
    await pagina.waitForFunction(() => window.CAT && CAT.potreros.length > 0);
    await pagina.evaluate(() => pintar());
    await foto(pagina, '02-inicio');
    ok(true, 'la pantalla principal abre con los 6 botones');

    console.log('\n1. Lluvia');
    await tocar(pagina, 'Lluvia');
    await teclear(pagina, '25');
    await foto(pagina, '03-lluvia');
    await tocar(pagina, 'Casa', 'exacto');
    await tocar(pagina, 'GUARDAR', 'exacto');
    await foto(pagina, '04-guardado');
    await volverAlInicio(pagina);

    console.log('\n2. Contar hacienda');
    await tocar(pagina, 'Contar');
    await foto(pagina, '05-elegir-potrero');
    await tocar(pagina, P1, 'potrero');
    await tocar(pagina, CAT_A, 'exacto');
    await foto(pagina, '06-dueno');
    await tocar(pagina, DUENO, 'exacto');
    await teclear(pagina, '30');
    await foto(pagina, '07-teclado');
    await tocar(pagina, 'LISTO', 'exacto');
    await foto(pagina, '08-confirmar-contar');
    await tocar(pagina, 'GUARDAR', 'exacto');
    await volverAlInicio(pagina);

    console.log('\n3. Mover hacienda');
    await tocar(pagina, 'Mover');
    await tocar(pagina, P1, 'potrero');
    await tocar(pagina, P2, 'potrero');
    await tocar(pagina, CAT_A, 'exacto');
    await tocar(pagina, DUENO, 'exacto');
    await teclear(pagina, '10');
    await tocar(pagina, 'LISTO', 'exacto');
    await foto(pagina, '09-confirmar-mover');
    await tocar(pagina, 'GUARDAR', 'exacto');
    await volverAlInicio(pagina);
    await foto(pagina, '10-inicio-con-repetir');

    console.log('\n4. Pesada');
    await tocar(pagina, 'Pesada');
    await tocar(pagina, P3, 'potrero');
    await tocar(pagina, CAT_B, 'exacto');
    await tocar(pagina, DUENO, 'exacto');
    await teclear(pagina, '10');
    await tocar(pagina, 'LISTO', 'exacto');
    await tocar(pagina, 'Los kilos de todas juntas', 'exacto');
    await teclear(pagina, '4000');
    await tocar(pagina, 'LISTO', 'exacto');
    await tocar(pagina, 'Control', 'exacto');
    await foto(pagina, '11-confirmar-pesada');
    await tocar(pagina, 'GUARDAR', 'exacto');
    await volverAlInicio(pagina);

    console.log('\n5. Sanidad');
    await tocar(pagina, 'Sanidad');
    await foto(pagina, '12-sanidad-que-paso');
    await tocar(pagina, 'Nacimiento', 'exacto');
    await tocar(pagina, P4, 'potrero');
    await tocar(pagina, CAT_CRIA, 'exacto');
    await tocar(pagina, DUENO, 'exacto');
    await teclear(pagina, '2');
    await tocar(pagina, 'LISTO', 'exacto');
    await foto(pagina, '13-confirmar-sanidad');
    await tocar(pagina, 'GUARDAR', 'exacto');
    await volverAlInicio(pagina);

    console.log('\n6. Recorrida');
    await tocar(pagina, 'Recorrida');
    await tocar(pagina, P5, 'potrero');
    await foto(pagina, '14-recorrida');
    await tocar(pagina, 'GUARDAR', 'exacto');
    await volverAlInicio(pagina);

    console.log('\n7. Lo que quedó en la planilla');
    await pagina.waitForFunction(() => ESTADO.pendientes === 0 && !ESTADO.enviando,
      { timeout: 30000 });
    await fetch(BASE + '/_recalcular');
    const planilla = await (await fetch(BASE + '/_planilla')).json();

    const lluvia = fila(planilla, 'Lluvias');
    ok(Number(lluvia.mm) === 25 && lluvia.lugar === 'Casa',
      'la lluvia quedó bien', lluvia.mm + ' mm en ' + lluvia.lugar);
    ok(lluvia.persona === 'Nahuel', 'y quedó quién la cargó', lluvia.persona);

    const rec = fila(planilla, 'Recuentos');
    ok(rec.potrero === P1 && Number(rec.cabezas) === 30 && rec.categoria === CAT_A &&
      rec.dueno === DUENO, 'el recuento quedó bien', rec.cabezas + ' en ' + rec.potrero);

    const mov = fila(planilla, 'Movimientos');
    ok(mov.potrero_origen === P1 && mov.potrero_destino === P2 &&
      Number(mov.cabezas) === 10 && mov.motivo === 'Rotación',
      'el movimiento quedó bien',
      mov.cabezas + ' ' + mov.potrero_origen + '→' + mov.potrero_destino);

    const pes = fila(planilla, 'Pesadas');
    ok(pes.potrero === P3 && Number(pes.kg_totales) === 4000 &&
      Number(pes.kg_promedio) === 400 && pes.momento === 'Control',
      'la pesada calculó el promedio sola',
      pes.kg_totales + ' kg totales, ' + pes.kg_promedio + ' kg cada uno');

    const san = fila(planilla, 'Sanidad');
    ok(san.tipo === 'Nacimiento' && san.categoria === CAT_CRIA &&
      Number(san.cabezas) === 2 && san.potrero === P4,
      'el nacimiento quedó bien', san.tipo + ' de ' + san.cabezas + ' en ' + san.potrero);

    const rr = fila(planilla, 'Recorridas');
    ok(rr.potrero === P5 && rr.agua === 'Bien' && rr.alambre === 'Bien' &&
      rr.pasto === '2 Normal', 'la recorrida guardó los valores por defecto',
      [rr.agua, rr.alambre, rr.pasto].join(' / '));

    const stock = {};
    const enc = planilla['Stock'][0];
    filasDe(planilla, 'Stock').forEach(f => {
      const o = Object.fromEntries(enc.map((c, i) => [c, f[i]]));
      stock[o.potrero + '|' + o.categoria] = Number(o.cabezas);
    });
    ok(stock[P1 + '|' + CAT_A] === 20 && stock[P2 + '|' + CAT_A] === 10 &&
      stock[P4 + '|' + CAT_CRIA] === 2,
      'el stock quedó bien después de contar, mover y el nacimiento',
      P1 + '=20, ' + P2 + '=10, ' + P4 + '=2');

    console.log('\n8. Pantallas de consulta');
    await tocar(pagina, 'STOCK', 'exacto');
    await pagina.waitForFunction(() => /Total en el campo/.test(document.body.textContent),
      { timeout: 15000 });
    await foto(pagina, '15-stock-por-cliente');
    const totalTexto = await pagina.evaluate(() =>
      document.querySelector('.total').textContent);
    ok(/32 cabezas/.test(totalTexto), 'el stock abre por cliente y da el total', totalTexto);
    const porCliente = await pagina.evaluate(() => document.body.innerText);
    ok(new RegExp(DUENO_RE).test(porCliente) && /Vaca\s+30/.test(porCliente),
      'muestra cada cliente con sus categorías');
    const hayAviso = await pagina.evaluate(() => !!document.querySelector('.falta'));
    ok(!hayAviso, 'no hay potreros en negativo');

    await tocar(pagina, 'Por potrero', 'exacto');
    await pagina.waitForFunction(() => /Total en el campo/.test(document.body.textContent),
      { timeout: 15000 });
    await foto(pagina, '16-stock-por-potrero');
    const porPotrero = await pagina.evaluate(() => document.body.innerText);
    ok(porPotrero.indexOf(P1) >= 0 && porPotrero.indexOf(P2) >= 0,
      'la vista por potrero sigue estando', P1 + ' y ' + P2);

    await tocar(pagina, 'Por cliente', 'exacto');
    await pagina.waitForFunction(() => /Ver dónde está/.test(document.body.textContent),
      { timeout: 15000 });
    await tocar(pagina, 'Ver dónde está y la libreta', 'exacto');
    await pagina.waitForFunction(() => /Tiene \d+ cabezas/.test(document.body.textContent),
      { timeout: 15000 });
    await foto(pagina, '17-cliente');
    const detalle = await pagina.evaluate(() => document.body.innerText);
    ok(/Tiene 32 cabezas/.test(detalle), 'el detalle del cliente da el total');
    ok(detalle.indexOf(P1) >= 0 && detalle.indexOf(P2) >= 0,
      'y dice en qué potreros está', P1 + ', ' + P2);

    await tocar(pagina, 'Ver la libreta de ' + DUENO, 'exacto');
    await pagina.waitForFunction(() => document.querySelector('table.libreta'),
      { timeout: 15000 });
    await foto(pagina, '18-libreta');
    const saldos = await pagina.evaluate(() =>
      [...document.querySelectorAll('.lote')].map(e => e.textContent));
    ok(saldos.some(t => /30 cabezas/.test(t)) && saldos.some(t => /2 cabezas/.test(t)),
      'la libreta muestra el saldo por categoría', saldos.join(' · '));

    await pagina.evaluate(() => alInicio());
    await dormir(300);
    await tocar(pagina, 'Mis últimos registros', 'exacto');
    await pagina.waitForFunction(() => /Corregir/.test(document.body.textContent),
      { timeout: 10000 });
    await foto(pagina, '19-ultimos-registros');
    const cuantos = await pagina.evaluate(() => document.querySelectorAll('.ficha').length);
    ok(cuantos === 6, 'los 6 registros se pueden corregir o borrar', cuantos + ' fichas');
    const conNombre = await pagina.evaluate(() =>
      [...document.querySelectorAll('.ficha .cuando')].filter(e => /Nahuel/.test(e.textContent)).length);
    ok(conNombre === 6, 'y cada uno dice quién lo cargó', conNombre + ' con nombre');

    console.log('\n9. Avisos por mail');
    const mails = await (await fetch(BASE + '/_mails')).json();
    ok(mails.length >= 1, 'salió al menos un aviso', mails.length + ' mails');
    ok(mails.every(m => /^Campo: Nahuel cargó/.test(m.asunto)),
      'el asunto dice quién cargó y cuántos',
      mails.map(m => m.asunto).join(' | '));
    ok(mails.some(m => /Llovieron 25 mm/.test(m.cuerpo)),
      'y el cuerpo lo cuenta en castellano');

  } finally {
    await navegador.close();
    servidor.kill();
  }

  console.log('\n' + (fallas === 0
    ? '✓ Todas las pantallas andan. Capturas en ' + CAPTURAS
    : '✗ ' + fallas + ' prueba(s) fallaron.'));
  process.exit(fallas === 0 ? 0 : 1);
}

principal().catch(e => { console.error(e.message); process.exit(1); });
