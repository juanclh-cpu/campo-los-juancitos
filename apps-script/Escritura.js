/**
 * Volcado del cálculo a las hojas de la planilla.
 * Las hojas Stock, Resumen stock, Libreta <Dueño> y Diario de ocupación se
 * reescriben completas: son el espejo legible del cálculo, no la fuente.
 */

/**
 * Borra el contenido debajo del encabezado y escribe las filas nuevas.
 * El encabezado se reescribe siempre: estas hojas las maneja el script, así
 * que si al código se le sumó una columna la hoja se acomoda sola.
 */
function volcar_(nombre, encabezados, filas) {
  var h = hoja_(nombre, encabezados);
  if (h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, Math.max(h.getLastColumn(), encabezados.length))
      .clearContent();
  }
  // El formato va antes de escribir: después ya es tarde, el valor quedó mal.
  formatoDeColumnas_(h, encabezados);
  h.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
  h.setFrozenRows(1);
  if (filas.length) {
    h.getRange(2, 1, filas.length, encabezados.length).setValues(filas);
  }
  return h;
}

function escribirCalculos_(conDiario) {
  var c = calcularTodo_(conDiario);
  var ahora = ahoraISO_();

  volcar_(HOJA.STOCK, ESQUEMA_REF[HOJA.STOCK], c.stock.map(function (s) {
    return [s.potrero, s.lote, s.hectareas, s.categoria, s.dueno, s.cabezas,
      s.desde, s.dias, ahora];
  }));

  volcar_(HOJA.RESUMEN, ESQUEMA_REF[HOJA.RESUMEN], c.resumen.map(function (r) {
    return [r.dueno, r.categoria, r.cabezas, r.potreros, r.ultimo_evento, ahora];
  }));

  Object.keys(c.libretas).forEach(function (dueno) {
    volcar_(PREFIJO_LIBRETA + dueno, ESQUEMA_LIBRETA,
      c.libretas[dueno].map(function (f) {
        return [f.fecha, f.categoria, f.ingreso, f.egreso, f.muertes, f.stock,
          f.potrero, f.comentario, f.id];
      }));
  });

  if (conDiario) {
    var potreros = {};
    leerHoja_(HOJA.POTREROS).forEach(function (f) {
      potreros[texto_(f.id)] = {lote: texto_(f.lote), ha: aNumero_(f.hectareas)};
    });
    volcar_(HOJA.DIARIO, ESQUEMA_REF[HOJA.DIARIO], c.diario.map(function (d) {
      var p = potreros[d[1]] || {lote: '', ha: ''};
      return [d[0], d[1], p.lote, p.ha, d[2], d[3], d[4]];
    }));
  }

  return c;
}

/** Crea todas las hojas que falten, con sus encabezados. */
function armarHojas_() {
  Object.keys(ESQUEMA).forEach(function (n) { hoja_(n, ESQUEMA[n]); });
  [HOJA.POTREROS, HOJA.DUENOS, HOJA.CATEGORIAS, HOJA.STOCK, HOJA.DIARIO,
    HOJA.RESUMEN, HOJA.CONFIG, HOJA.AVISOS, HOJA.LOG].forEach(function (n) {
    hoja_(n, ESQUEMA_REF[n]);
  });
  sembrarConfiguracion_();
  var libro = ss_();
  var h1 = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1') ||
    libro.getSheetByName('Hoja1');
  if (h1 && libro.getSheets().length > 1 && h1.getLastRow() === 0) {
    libro.deleteSheet(h1);
  }
  return true;
}

/** Carga las filas de Configuración que falten, sin pisar las que ya están. */
function sembrarConfiguracion_() {
  var h = hoja_(HOJA.CONFIG, ESQUEMA_REF[HOJA.CONFIG]);
  var existentes = {};
  leerHoja_(HOJA.CONFIG).forEach(function (f) { existentes[texto_(f.clave)] = true; });
  CONFIG_POR_DEFECTO.forEach(function (fila) {
    if (!existentes[fila[0]]) h.appendRow(fila);
  });
  // Los mails de arranque viven en Semilla.js, que no se publica.
  completarConfig_('mail_avisos',
    typeof MAIL_AVISOS !== 'undefined' ? MAIL_AVISOS : '');
  completarConfig_('mail_encargado',
    typeof MAIL_ENCARGADO !== 'undefined' ? MAIL_ENCARGADO : '');
}

/**
 * Pone los encabezados al día sin perder lo cargado: si al esquema se le
 * sumó una columna, la agrega y acomoda los datos por nombre de columna.
 */
function ponerHojasAlDia_() {
  var cambiadas = [];
  Object.keys(ESQUEMA).forEach(function (nombre) {
    var h = hoja_(nombre, ESQUEMA[nombre]);
    var esquema = ESQUEMA[nombre];
    var ultimaFila = h.getLastRow();
    var ultimaCol = Math.max(h.getLastColumn(), esquema.length);

    // Con mirar el encabezado alcanza para saber si hay que hacer algo.
    var viejos = h.getRange(1, 1, 1, ultimaCol).getValues()[0]
      .map(function (v) { return texto_(v); });
    var igual = esquema.every(function (c, i) { return viejos[i] === c; });
    if (igual) return;

    var valores = h.getRange(1, 1, Math.max(ultimaFila, 1), ultimaCol).getValues();
    var filas = valores.slice(1).map(function (f) {
      return esquema.map(function (col) {
        var i = viejos.indexOf(col);
        return (i >= 0 && f[i] !== undefined && f[i] !== null) ? f[i] : '';
      });
    }).filter(function (f) {
      return f.some(function (v) { return v !== '' && v !== null; });
    });

    h.clear();
    formatoDeColumnas_(h, esquema);
    h.getRange(1, 1, 1, esquema.length).setValues([esquema]);
    h.getRange(1, 1, 1, esquema.length).setFontWeight('bold');
    h.setFrozenRows(1);
    if (filas.length) {
      h.getRange(2, 1, filas.length, esquema.length).setValues(filas);
    }
    cambiadas.push(nombre + ' (' + filas.length + ')');
  });
  return cambiadas;
}

/**
 * Borra TODOS los registros y deja las hojas con los encabezados al día.
 * No toca los potreros, los dueños, las categorías ni la configuración.
 */
function vaciarRegistros_() {
  var borradas = 0;
  Object.keys(ESQUEMA).forEach(function (nombre) {
    var h = hoja_(nombre, ESQUEMA[nombre]);
    if (h.getLastRow() > 1) borradas += h.getLastRow() - 1;
    h.clear();
    formatoDeColumnas_(h, ESQUEMA[nombre]);
    h.getRange(1, 1, 1, ESQUEMA[nombre].length).setValues([ESQUEMA[nombre]]);
    h.getRange(1, 1, 1, ESQUEMA[nombre].length).setFontWeight('bold');
    h.setFrozenRows(1);
  });

  // Las libretas se vuelven a armar solas; las viejas se van.
  var libro = ss_();
  libro.getSheets().forEach(function (h) {
    if (h.getName().indexOf(PREFIJO_LIBRETA) === 0) libro.deleteSheet(h);
  });

  var hLog = hoja_(HOJA.LOG, ESQUEMA_REF[HOJA.LOG]);
  if (hLog.getLastRow() > 1) {
    hLog.getRange(2, 1, hLog.getLastRow() - 1, hLog.getLastColumn()).clearContent();
  }

  escribirCalculos_(true);
  return borradas;
}

var PROP_FORMATO_TEXTO = 'FORMATO_TEXTO_APLICADO';

/**
 * Arregla de una sola vez las hojas que ya existían antes de que las columnas
 * se escribieran como texto. Corre una vez y queda anotado, así no cuesta
 * nada en cada envío.
 */
function asegurarFormatoTexto_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(PROP_FORMATO_TEXTO)) return false;
  aplicarFormatoATodo_();
  props.setProperty(PROP_FORMATO_TEXTO, ahoraISO_());
  return true;
}

/** Pone el formato de texto en todas las hojas, incluidas las libretas. */
function aplicarFormatoATodo_() {
  Object.keys(ESQUEMA).forEach(function (n) {
    formatoDeColumnas_(hoja_(n, ESQUEMA[n]), ESQUEMA[n]);
  });
  Object.keys(ESQUEMA_REF).forEach(function (n) {
    formatoDeColumnas_(hoja_(n, ESQUEMA_REF[n]), ESQUEMA_REF[n]);
  });
  ss_().getSheets().forEach(function (h) {
    if (h.getName().indexOf(PREFIJO_LIBRETA) === 0) {
      formatoDeColumnas_(h, ESQUEMA_LIBRETA);
    }
  });
}

/** Recalcula stock y libretas (rápido). */
function recalcularStockYLibretas() {
  escribirCalculos_(false);
}

/** Recalcula todo, incluido el diario de ocupación (más lento). */
function recalcularTodo() {
  escribirCalculos_(true);
}
