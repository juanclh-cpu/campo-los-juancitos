/**
 * Registro Campo Los Juancitos — configuración y esquema de hojas.
 *
 * Una hoja por tipo de registro. Todas las hojas de registro terminan con las
 * mismas cuatro columnas de control: cargado_en, dispositivo, origen_carga, estado.
 *
 *   origen_carga : "App" para lo que manda el celular, "Carga histórica" para
 *                  las filas que se pegan a mano en la planilla.
 *   estado       : "activo" o "borrado". Nunca se borra una fila de verdad;
 *                  las borradas quedan y el cálculo las ignora.
 */

var TZ = 'America/Argentina/Buenos_Aires';

var HOJA = {
  LLUVIAS: 'Lluvias',
  MOVIMIENTOS: 'Movimientos',
  RECUENTOS: 'Recuentos',
  PESADAS: 'Pesadas',
  SANIDAD: 'Sanidad',
  RECORRIDAS: 'Recorridas',
  POTREROS: 'Potreros',
  DUENOS: 'Dueños',
  CATEGORIAS: 'Categorías',
  STOCK: 'Stock',
  DIARIO: 'Diario de ocupación',
  RESUMEN: 'Resumen stock',
  DESCANSO: 'Descanso',
  CONFIG: 'Configuración',
  AVISOS: 'Avisos',
  LOG: 'Log'
};

var PREFIJO_LIBRETA = 'Libreta ';

/** Columnas de control que llevan todas las hojas de registro. */
var CONTROL = ['cargado_en', 'dispositivo', 'origen_carga', 'estado'];

/** Esquema exacto de cada hoja de registro (en orden de columna). */
var ESQUEMA = {};
ESQUEMA[HOJA.LLUVIAS] = ['id', 'fecha', 'persona', 'mm', 'lugar', 'nota'].concat(CONTROL);
ESQUEMA[HOJA.MOVIMIENTOS] = ['id', 'fecha', 'persona', 'potrero_origen',
  'potrero_destino', 'categoria', 'dueno', 'cabezas', 'motivo', 'nota'].concat(CONTROL);
ESQUEMA[HOJA.RECUENTOS] = ['id', 'fecha', 'persona', 'potrero', 'categoria',
  'dueno', 'cabezas', 'nota'].concat(CONTROL);
ESQUEMA[HOJA.PESADAS] = ['id', 'fecha', 'persona', 'potrero', 'categoria', 'dueno',
  'cabezas_pesadas', 'kg_modo', 'kg_cargados', 'kg_totales', 'kg_promedio',
  'momento', 'foto_url', 'nota'].concat(CONTROL);
ESQUEMA[HOJA.SANIDAD] = ['id', 'fecha', 'persona', 'potrero', 'tipo', 'categoria',
  'categoria_destino', 'dueno', 'cabezas', 'causa_producto', 'foto_url',
  'nota'].concat(CONTROL);
ESQUEMA[HOJA.RECORRIDAS] = ['id', 'fecha', 'persona', 'potrero', 'agua', 'alambre',
  'pasto', 'foto_url', 'nota'].concat(CONTROL);

/** Hojas de referencia y de cálculo. */
var ESQUEMA_REF = {};
// La app usa id, lote, hectareas, uso y activo. Las demás son para anotar a
// mano y para la planilla Financiera: el script no las toca ni las borra.
ESQUEMA_REF[HOJA.POTREROS] = ['id', 'lote', 'hectareas', 'uso', 'activo',
  'recurso', 'quien_lo_usa', 'nota'];
ESQUEMA_REF[HOJA.DUENOS] = ['dueno', 'orden', 'activo'];
ESQUEMA_REF[HOJA.CATEGORIAS] = ['categoria', 'orden', 'activo'];
ESQUEMA_REF[HOJA.STOCK] = ['potrero', 'lote', 'hectareas', 'categoria', 'dueno',
  'cabezas', 'desde', 'dias', 'recalculado_en'];
ESQUEMA_REF[HOJA.DIARIO] = ['fecha', 'potrero', 'lote', 'hectareas', 'categoria',
  'dueno', 'cabezas'];
ESQUEMA_REF[HOJA.RESUMEN] = ['dueno', 'categoria', 'cabezas', 'potreros',
  'ultimo_evento', 'recalculado_en'];
ESQUEMA_REF[HOJA.DESCANSO] = ['potrero', 'lote', 'hectareas', 'uso', 'ocupado',
  'cabezas_hoy', 'ultima_salida', 'dias_descanso', 'dias_ocupado'];
ESQUEMA_REF[HOJA.CONFIG] = ['clave', 'valor', 'qué es'];
ESQUEMA_REF[HOJA.AVISOS] = ['fecha', 'mensaje', 'activo'];
ESQUEMA_REF[HOJA.LOG] = ['cargado_en', 'accion', 'persona', 'dispositivo',
  'recibidos', 'guardados', 'repetidos', 'detalle'];

/** Columnas de las hojas "Libreta <Dueño>" (una por cliente). */
var ESQUEMA_LIBRETA = ['Fecha', 'Categoría', 'Ingreso', 'Egreso', 'Muertes',
  'Stock', 'Potrero', 'Comentarios / sanidad', 'id_registro'];

/** Valores que la app usa como potrero y que no son un potrero real. */
var ENTRADA_CAMPO = 'Entrada al campo';
var SALIDA_CAMPO = 'Salida del campo';

// Lo que se anota en "Manejo" (la hoja sigue llamándose Sanidad). Sólo
// Nacimiento, Muerte y Cambio de categoría mueven el stock.
var TIPOS_SANIDAD = ['Nacimiento', 'Muerte', 'Enfermo', 'Tratamiento',
  'Vacunación', 'Capada de terneros', 'Inseminación', 'Tacto',
  'Servicio con toro', 'Cambio de categoría'];

/** Tipos de manejo que no tocan el stock. */
var TIPOS_SANIDAD_SIN_STOCK = ['Enfermo', 'Tratamiento', 'Vacunación',
  'Capada de terneros', 'Inseminación', 'Tacto', 'Servicio con toro'];
var MOTIVOS_MOVIMIENTO = ['Rotación', 'Entrada', 'Venta', 'Faena',
  'Devolución a dueño', 'Otro'];
var LUGARES_LLUVIA = ['Casa', 'Manga', 'Otro'];

var CARPETA_FOTOS = 'Registro Campo - Fotos';

// ---------------------------------------------------------------------------
// Formato de las columnas
// ---------------------------------------------------------------------------

/**
 * Al escribir, la planilla interpreta el texto como si lo tipeara una persona.
 * Por eso un potrero que se llama "7" queda guardado como el número 7, y el
 * texto "7: 141" (141 cabezas en el potrero 7) queda guardado como la hora
 * 9:21, que es 7 horas más 141 minutos.
 *
 * La solución es poner en texto plano todas las columnas, menos las que de
 * verdad son números o fechas, que se listan acá.
 */
var COLUMNAS_NUMERO = ['mm', 'cabezas', 'cabezas_pesadas', 'kg_cargados',
  'kg_totales', 'kg_promedio', 'hectareas', 'dias', 'orden', 'recibidos',
  'guardados', 'repetidos', 'Ingreso', 'Egreso', 'Muertes', 'Stock',
  'cabezas_hoy', 'dias_descanso', 'dias_ocupado'];

var COLUMNAS_FECHA = ['fecha', 'Fecha', 'desde', 'ultimo_evento', 'cargado_en',
  'recalculado_en', 'ultima_salida'];

/** Pone en texto plano las columnas que no son números ni fechas. */
function formatoDeColumnas_(h, encabezados) {
  if (!encabezados || !encabezados.length) return;
  var filas = Math.max(h.getMaxRows(), 2);
  for (var i = 0; i < encabezados.length; i++) {
    var col = encabezados[i];
    if (COLUMNAS_NUMERO.indexOf(col) >= 0 || COLUMNAS_FECHA.indexOf(col) >= 0) continue;
    h.getRange(1, i + 1, filas, 1).setNumberFormat('@');
  }
}

// ---------------------------------------------------------------------------
// Helpers de planilla
// ---------------------------------------------------------------------------

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** Devuelve la hoja, creándola con sus encabezados si no existe. */
function hoja_(nombre, encabezados) {
  var libro = ss_();
  var h = libro.getSheetByName(nombre);
  if (!h) {
    h = libro.insertSheet(nombre);
    if (encabezados) {
      formatoDeColumnas_(h, encabezados);
      h.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      h.setFrozenRows(1);
      h.getRange(1, 1, 1, encabezados.length).setFontWeight('bold');
    }
  }
  return h;
}

function hojaRegistro_(nombre) {
  return hoja_(nombre, ESQUEMA[nombre]);
}

/** Lee una hoja completa como array de objetos {columna: valor}. */
function leerHoja_(nombre) {
  var h = ss_().getSheetByName(nombre);
  if (!h) return [];
  var valores = h.getDataRange().getValues();
  if (valores.length < 2) return [];
  var enc = valores[0];
  var filas = [];
  for (var i = 1; i < valores.length; i++) {
    var o = {_fila: i + 1};
    var vacia = true;
    for (var j = 0; j < enc.length; j++) {
      o[enc[j]] = valores[i][j];
      if (valores[i][j] !== '' && valores[i][j] !== null) vacia = false;
    }
    if (!vacia) filas.push(o);
  }
  return filas;
}

/** Fecha (Date o texto) a "aaaa-mm-dd". */
function aISO_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);  // 31/10/2026
  if (m) {
    return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  }
  return s;
}

/** Timestamp (Date o texto ISO) a texto ordenable; '' si no hay. */
function aSello_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) {
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  }
  return String(v).trim();
}

function hoyISO_() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function ahoraISO_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss");
}

function aNumero_(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function texto_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

/** Clave de agrupación potrero+categoría+dueño. */
function clave_(potrero, categoria, dueno) {
  return potrero + '\u0000' + categoria + '\u0000' + dueno;
}

/**
 * Valores que se editan a mano en la hoja Configuración: a quién avisarle,
 * cada cuánto, etc. Así se cambian sin tocar el código.
 */
var CONFIG_POR_DEFECTO = [
  ['mail_avisos', '', 'A quién le llegan los avisos. Varios mails separados por coma.'],
  ['mail_encargado', '', 'Mail del encargado, para el aviso de "hace días que no cargás".'],
  ['avisar_cada_registro', 'sí', '¿Mandar un mail cada vez que llegan registros? sí / no'],
  ['dias_sin_registrar', '5', 'A los cuántos días sin registros avisar.'],
  ['mail_parte', '', 'A quién le llega el parte semanal de los sábados. Vacío: no se manda.'],
  ['dias_descanso_max', '45', 'En el parte, avisar los potreros con más días de descanso que esto.'],
  ['dias_ocupado_max', '7', 'En el parte, avisar los potreros ocupados hace más días que esto.'],
  ['recalcular_pedido', 'no', 'Poner "sí" para que recalcule en los próximos 5 minutos. Se vuelve solo a "no".'],
  ['ultimo_recalculo', '', 'Cuándo se recalculó por última vez. Lo escribe el script.']
];

/**
 * Una fila de catálogo está activa salvo que diga claramente que no.
 * Se contemplan varias formas de escribirlo porque la columna se edita a mano.
 */
function estaActivo_(valor) {
  var t = texto_(valor).toLowerCase();
  if (['no', 'n', 'false', '0', 'inactivo', 'inactiva'].indexOf(t) >= 0) return false;
  if (t.indexOf('baja') >= 0) return false;   // "baja", "dado de baja", "de baja"
  return true;
}

/** Lee un valor de la hoja Configuración. */
function config_(clave, porDefecto) {
  var filas = leerHoja_(HOJA.CONFIG);
  for (var i = 0; i < filas.length; i++) {
    if (texto_(filas[i].clave) === clave) {
      var v = texto_(filas[i].valor);
      if (v !== '') return v;
    }
  }
  return porDefecto;
}

/** Lista de mails de una clave de configuración, ya limpia. */
function mailsDe_(clave) {
  return config_(clave, '').split(',')
    .map(function (m) { return texto_(m); })
    .filter(function (m) { return m.indexOf('@') > 0; });
}

function registrarLog_(accion, persona, dispositivo, recibidos, guardados, repetidos, detalle) {
  try {
    var h = hoja_(HOJA.LOG, ESQUEMA_REF[HOJA.LOG]);
    h.appendRow([ahoraISO_(), accion, persona || '', dispositivo || '',
      recibidos || 0, guardados || 0, repetidos || 0, detalle || '']);
  } catch (e) {
    // el log nunca debe hacer fallar un guardado
  }
}
