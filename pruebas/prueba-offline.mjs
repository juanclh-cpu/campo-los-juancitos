/**
 * Prueba de punta a punta: 20 registros de cada tipo cargados con el celular
 * sin señal, reconexión, reenvío y verificación del stock y las libretas.
 *
 *   node pruebas/prueba-offline.mjs
 */

import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { armarRegistros, stockEsperado, stockPorDuenoYCategoria } from './datos-de-prueba.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PUERTO = 8899;
const BASE = 'http://localhost:' + PUERTO;

let fallas = 0;
function ok(condicion, texto, detalle) {
  console.log((condicion ? '  ✓ ' : '  ✗ ') + texto + (detalle ? ' — ' + detalle : ''));
  if (!condicion) fallas++;
}
function titulo(t) { console.log('\n' + t); }

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function esperar(fn, mensaje, limiteMs = 60000) {
  const hasta = Date.now() + limiteMs;
  while (Date.now() < hasta) {
    if (await fn()) return true;
    await dormir(250);
  }
  throw new Error('se acabó el tiempo esperando: ' + mensaje);
}

/** Cuenta las filas con datos de una hoja (sin el encabezado). */
function filasDe(planilla, hoja) {
  const d = planilla[hoja] || [];
  return d.slice(1).filter(f => f && f.some(v => v !== '' && v !== null && v !== undefined));
}

function columna(planilla, hoja, nombre) {
  const enc = (planilla[hoja] || [])[0] || [];
  return enc.indexOf(nombre);
}

async function principal() {
  const servidor = spawn(process.execPath, ['pruebas/servidor.mjs', String(PUERTO)],
    { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => servidor.stdout.on('data', d => {
    if (String(d).includes('token:')) r();
  }));

  const activacion = await (await fetch(BASE + '/_activacion')).json();
  const catalogos = await (await fetch(
    BASE + '/api?accion=catalogos&token=' + activacion.token)).json();
  const registros = armarRegistros(catalogos.catalogos);

  const navegador = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  pagina.on('pageerror', e => { console.log('  ! error en la app:', e.message); fallas++; });

  try {
    titulo('1. Activar la app con el código y poner el PIN');
    await pagina.goto(BASE + '/#a=' + activacion.codigo, { waitUntil: 'networkidle0' });
    await pagina.waitForFunction(() => /Elegí 4 números/.test(document.body.textContent));
    const hash = await pagina.evaluate(() => location.hash);
    ok(hash === '', 'el código no queda en la barra de direcciones',
      hash || '(vacío)');
    for (const vuelta of [1, 2]) {
      for (const d of ['1', '2', '3', '4']) {
        await pagina.evaluate(t => {
          [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t).click();
        }, d);
        await dormir(60);
      }
      await dormir(250);
    }
    await pagina.waitForFunction(() => /HACIENDA HOY/.test(document.body.textContent));
    ok(true, 'la app abre en la pantalla principal');

    await esperar(() => pagina.evaluate(() => !!(window.CAT && CAT.potreros.length)),
      'que baje la lista de potreros');
    const cuantosPotreros = await pagina.evaluate(() => CAT.potreros.length);
    ok(cuantosPotreros === catalogos.catalogos.potreros.length,
      'bajó la lista de potreros entera', cuantosPotreros + ' potreros');

    titulo('2. Cortar la señal y cargar 120 registros');
    await pagina.setOfflineMode(true);
    await pagina.evaluate(() => { window.dispatchEvent(new Event('offline')); });

    await pagina.evaluate(async regs => {
      for (const r of regs) await encolarGuardar(r);
    }, registros);
    await dormir(500);

    const pendientes = await pagina.evaluate(() => ESTADO.pendientes);
    ok(pendientes === 120, 'quedaron 120 registros esperando señal', String(pendientes));

    await pagina.evaluate(() => alInicio());
    await dormir(300);
    const textoEstado = await pagina.evaluate(() =>
      document.getElementById('estado').textContent.trim());
    ok(textoEstado === '120 registros esperando señal',
      'la pantalla principal lo dice clarito', '"' + textoEstado + '"');

    let planilla = await (await fetch(BASE + '/_planilla')).json();
    ok(filasDe(planilla, 'Movimientos').length === 0,
      'sin señal no llegó nada a la planilla');

    titulo('3. Volver la señal y dejar que mande solo');
    await pagina.setOfflineMode(false);
    await pagina.evaluate(() => { window.dispatchEvent(new Event('online')); });
    await esperar(() => pagina.evaluate(() => ESTADO.pendientes === 0 && !ESTADO.enviando),
      'que termine de mandar todo', 120000);

    await pagina.evaluate(() => alInicio());
    await dormir(300);
    const estadoFinal = await pagina.evaluate(() =>
      document.getElementById('estado').textContent.trim());
    ok(estadoFinal === '✓ Todo enviado', 'la pantalla dice "Todo enviado"',
      '"' + estadoFinal + '"');

    planilla = await (await fetch(BASE + '/_planilla')).json();
    const HOJAS = ['Lluvias', 'Movimientos', 'Recuentos', 'Pesadas', 'Sanidad', 'Recorridas'];
    for (const h of HOJAS) {
      ok(filasDe(planilla, h).length === 20, 'llegaron los 20 de ' + h,
        filasDe(planilla, h).length + ' filas');
    }

    const todosLosIds = [];
    HOJAS.forEach(h => {
      const c = columna(planilla, h, 'id');
      filasDe(planilla, h).forEach(f => todosLosIds.push(f[c]));
    });
    ok(todosLosIds.length === 120 && new Set(todosLosIds).size === 120,
      'los 120 ids son distintos: no hay duplicados',
      todosLosIds.length + ' filas, ' + new Set(todosLosIds).size + ' ids');

    titulo('4. Reenviar todo de nuevo (lo que pasa si se corta a mitad de camino)');
    const repetidos = await pagina.evaluate(async regs => {
      const r = await apiPost({ accion: 'guardar', registros: regs });
      return (r.resultados || []).filter(x => x.estado === 'repetido').length;
    }, registros);
    ok(repetidos === 120, 'el script marcó los 120 como repetidos', String(repetidos));

    planilla = await (await fetch(BASE + '/_planilla')).json();
    const despues = HOJAS.reduce((a, h) => a + filasDe(planilla, h).length, 0);
    ok(despues === 120, 'la planilla sigue con 120 filas, no se duplicó nada',
      String(despues));

    titulo('5. ¿El stock da bien?');
    await fetch(BASE + '/_recalcular');
    planilla = await (await fetch(BASE + '/_planilla')).json();
    const esperado = stockEsperado(registros);
    const cPot = columna(planilla, 'Stock', 'potrero');
    const cCat = columna(planilla, 'Stock', 'categoria');
    const cDue = columna(planilla, 'Stock', 'dueno');
    const cCab = columna(planilla, 'Stock', 'cabezas');
    const cDesde = columna(planilla, 'Stock', 'desde');
    const calculado = new Map();
    filasDe(planilla, 'Stock').forEach(f => {
      calculado.set(f[cPot] + '|' + f[cCat] + '|' + f[cDue], Number(f[cCab]));
    });

    ok(calculado.size === esperado.size,
      'la misma cantidad de grupos potrero+categoría+dueño',
      'planilla ' + calculado.size + ', esperado ' + esperado.size);
    let diferencias = [];
    for (const [clave, cabezas] of esperado) {
      if (calculado.get(clave) !== cabezas) {
        diferencias.push(clave + ': planilla ' + calculado.get(clave) + ', esperado ' + cabezas);
      }
    }
    ok(diferencias.length === 0, 'todas las cabezas coinciden',
      diferencias.slice(0, 3).join(' / '));

    const totalPlanilla = [...calculado.values()].reduce((a, b) => a + b, 0);
    const totalEsperado = [...esperado.values()].reduce((a, b) => a + b, 0);
    ok(totalPlanilla === totalEsperado, 'el total de cabezas coincide',
      totalPlanilla + ' cabezas');

    const sinFecha = filasDe(planilla, 'Stock').filter(f => !f[cDesde]).length;
    ok(sinFecha === 0, 'todos los grupos tienen fecha de entrada al potrero');

    titulo('6. ¿Las libretas por cliente dan bien?');
    const porCliente = stockPorDuenoYCategoria(registros);
    let malas = [];
    for (const [clave, cabezas] of porCliente) {
      const [dueno, categoria] = clave.split('|');
      const hoja = 'Libreta ' + dueno;
      const filas = filasDe(planilla, hoja).filter(f => f[1] === categoria);
      if (!filas.length) { malas.push(clave + ': no hay filas'); continue; }
      const saldo = Number(filas[filas.length - 1][5]);
      if (saldo !== cabezas) malas.push(clave + ': libreta ' + saldo + ', esperado ' + cabezas);
    }
    ok(malas.length === 0, 'el saldo de cada libreta coincide con el stock',
      malas.slice(0, 3).join(' / '));

    const resumen = filasDe(planilla, 'Resumen stock');
    const totalResumen = resumen.reduce((a, f) => a + Number(f[2] || 0), 0);
    ok(totalResumen === totalEsperado, 'el resumen por cliente suma lo mismo',
      totalResumen + ' cabezas en ' + resumen.length + ' líneas');

    titulo('7. Diario de ocupación');
    const diario = filasDe(planilla, 'Diario de ocupación');
    const dias = new Set(diario.map(f => f[0]));
    ok(dias.size === 17, 'hay una foto por día desde el primer recuento hasta hoy',
      dias.size + ' días (' + [...dias][0] + ' → ' + [...dias][dias.size - 1] + ')');
    const ultimoDia = [...dias].sort().pop();
    const cabezasUltimoDia = diario.filter(f => f[0] === ultimoDia)
      .reduce((a, f) => a + Number(f[6] || 0), 0);
    ok(cabezasUltimoDia === totalEsperado,
      'el último día del diario coincide con el stock de hoy', String(cabezasUltimoDia));

    titulo('8. Borrar un registro desde el celular');
    const idABorrar = registros.find(r => r.hoja === 'Sanidad' && r.tipo === 'Muerte').id;
    await pagina.evaluate(async id => {
      await encolarBorrar('Sanidad', id);
      await sincronizar(true);
    }, idABorrar);
    await esperar(() => pagina.evaluate(() => ESTADO.pendientes === 0 && !ESTADO.enviando),
      'que se mande el borrado');
    await fetch(BASE + '/_recalcular');
    planilla = await (await fetch(BASE + '/_planilla')).json();
    const cEstado = columna(planilla, 'Sanidad', 'estado');
    const cId = columna(planilla, 'Sanidad', 'id');
    const borrada = filasDe(planilla, 'Sanidad').find(f => f[cId] === idABorrar);
    ok(borrada && borrada[cEstado] === 'borrado',
      'la fila queda marcada como borrada, no se borra de la planilla');
    ok(filasDe(planilla, 'Sanidad').length === 20, 'la fila sigue estando para auditoría');
    const muerte = registros.find(r => r.id === idABorrar);
    const claveMuerte = muerte.potrero + '|' + muerte.categoria + '|' + muerte.dueno;
    const nuevoStock = new Map();
    filasDe(planilla, 'Stock').forEach(f => {
      nuevoStock.set(f[cPot] + '|' + f[cCat] + '|' + f[cDue], Number(f[cCab]));
    });
    ok(nuevoStock.get(claveMuerte) === esperado.get(claveMuerte) + muerte.cabezas,
      'al borrar la muerte, el stock vuelve a sumar esa cabeza',
      claveMuerte + ' = ' + nuevoStock.get(claveMuerte));

  } finally {
    await navegador.close();
    servidor.kill();
  }

  console.log('\n' + (fallas === 0
    ? '✓ Todas las pruebas pasaron.'
    : '✗ ' + fallas + ' prueba(s) fallaron.'));
  process.exit(fallas === 0 ? 0 : 1);
}

principal().catch(e => { console.error(e); process.exit(1); });
