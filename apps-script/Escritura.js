/**
 * Volcado del cálculo a las hojas de la planilla.
 * Las hojas Stock, Resumen stock, Libreta <Dueño> y Diario de ocupación se
 * reescriben completas: son el espejo legible del cálculo, no la fuente.
 */

/** Borra el contenido debajo del encabezado y escribe las filas nuevas. */
function volcar_(nombre, encabezados, filas) {
  var h = hoja_(nombre, encabezados);
  if (h.getLastRow() > 1) {
    h.getRange(2, 1, h.getLastRow() - 1, Math.max(h.getLastColumn(), encabezados.length))
      .clearContent();
  }
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
    return [r.dueno, r.categoria, r.cabezas, r.ultimo_evento, ahora];
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
    HOJA.RESUMEN, HOJA.LOG].forEach(function (n) {
    hoja_(n, ESQUEMA_REF[n]);
  });
  var libro = ss_();
  var h1 = libro.getSheetByName('Hoja 1') || libro.getSheetByName('Sheet1') ||
    libro.getSheetByName('Hoja1');
  if (h1 && libro.getSheets().length > 1 && h1.getLastRow() === 0) {
    libro.deleteSheet(h1);
  }
  return true;
}

/** Recalcula stock y libretas (rápido). */
function recalcularStockYLibretas() {
  escribirCalculos_(false);
}

/** Recalcula todo, incluido el diario de ocupación (más lento). */
function recalcularTodo() {
  escribirCalculos_(true);
}
