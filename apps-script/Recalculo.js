/**
 * Recálculo a pedido, sin esperar al horario de la noche ni a que alguien
 * cargue algo con la app.
 *
 * Un horario cada 5 minutos mira si hay algo que recalcular:
 *   - si "recalcular_pedido" de la hoja Configuración dice "sí", o
 *   - si cambió alguna de las hojas de eventos desde el último cálculo.
 *
 * Para darse cuenta de lo segundo guarda una huella de cada hoja (cantidad de
 * filas más un hash de los valores) en las propiedades del script. Así detecta
 * también las filas pegadas a mano o por la API, que no pasan por la app.
 */

var PROP_HUELLA = 'HUELLA_EVENTOS';

/** Hojas cuyo cambio obliga a recalcular. */
var HOJAS_EVENTOS = ['Movimientos', 'Recuentos', 'Pesadas', 'Sanidad'];

/** De esas, las que además cambian el diario de ocupación. */
var HOJAS_DIARIO = ['Movimientos', 'Recuentos', 'Sanidad'];

/** Huella de una hoja: cuántas filas tiene y un hash de lo que dice. */
function huellaDeHoja_(nombre) {
  var h = ss_().getSheetByName(nombre);
  if (!h) return '0:vacia';
  var filas = h.getLastRow();
  if (filas < 2) return '0:vacia';
  var valores = h.getRange(1, 1, filas, h.getLastColumn()).getValues();
  var texto = valores.map(function (f) { return f.join('\u0001'); }).join('\u0002');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, texto);
  var hash = digest.map(function (b) {
    return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2);
  }).join('');
  return (filas - 1) + ':' + hash;
}

/** Huella de todas las hojas de eventos. */
function huellaEventos_() {
  var h = {};
  HOJAS_EVENTOS.forEach(function (n) { h[n] = huellaDeHoja_(n); });
  return h;
}

function huellaGuardada_() {
  try {
    return JSON.parse(
      PropertiesService.getScriptProperties().getProperty(PROP_HUELLA) || '{}');
  } catch (e) {
    return {};
  }
}

/** Escribe un valor en la hoja Configuración, pisando lo que haya. */
function ponerConfig_(clave, valor) {
  var h = hoja_(HOJA.CONFIG, ESQUEMA_REF[HOJA.CONFIG]);
  var filas = leerHoja_(HOJA.CONFIG);
  for (var i = 0; i < filas.length; i++) {
    if (texto_(filas[i].clave) === clave) {
      h.getRange(filas[i]._fila, 2).setValue(valor);
      return;
    }
  }
  h.appendRow([clave, valor, '']);
}

/**
 * Lo que corre cada 5 minutos. Devuelve qué hizo, así sirve igual para el
 * menú y para el pedido por la API.
 */
function recalcularSiHaceFalta(forzar) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    return {recalculado: false, motivo: 'la planilla estaba ocupada'};
  }
  try {
    var pedido = texto_(config_('recalcular_pedido', 'no')).toLowerCase();
    var aPedido = forzar === true || pedido === 'sí' || pedido === 'si';

    var ahora = huellaEventos_();
    var antes = huellaGuardada_();
    var cambiaron = HOJAS_EVENTOS.filter(function (n) { return ahora[n] !== antes[n]; });

    if (!aPedido && !cambiaron.length) {
      return {recalculado: false, motivo: 'no cambió nada'};
    }

    // El diario sólo hace falta si cambió algo que lo mueva.
    var conDiario = aPedido || cambiaron.some(function (n) {
      return HOJAS_DIARIO.indexOf(n) >= 0;
    });

    var calculo = escribirCalculos_(conDiario);

    PropertiesService.getScriptProperties()
      .setProperty(PROP_HUELLA, JSON.stringify(ahora));
    ponerConfig_('recalcular_pedido', 'no');
    ponerConfig_('ultimo_recalculo', ahoraISO_());

    var detalle = (aPedido ? 'a pedido' : 'cambió ' + cambiaron.join(', ')) +
      (conDiario ? ' (con diario)' : '');
    registrarLog_('recalculo', '', '', 0, 0, 0, detalle);

    return {
      recalculado: true,
      a_pedido: aPedido,
      cambiaron: cambiaron,
      con_diario: conDiario,
      cuando: ahoraISO_(),
      lineas_stock: calculo.stock.length,
      lineas_resumen: calculo.resumen.length,
      lineas_descanso: (calculo.descanso || []).length,
      cabezas: calculo.stock.reduce(function (a, s) { return a + s.cabezas; }, 0)
    };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** El horario cada 5 minutos. */
function crearDisparadorRecalculo() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recalcularSiHaceFalta') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recalcularSiHaceFalta').timeBased().everyMinutes(5).create();
}
