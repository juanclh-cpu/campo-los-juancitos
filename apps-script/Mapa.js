/**
 * Datos del mapa: todo lo que necesita la pantalla del plano, en un solo
 * pedido, para que el celular no tenga que hacer cuentas ni varias llamadas.
 *
 * Nada se calcula acá de nuevo: el stock y el descanso salen del mismo
 * cálculo que escribe las hojas.
 */

/** Suma de milímetros de los últimos N días. */
function lluviaDeDias_(dias) {
  var hasta = hoyISO_();
  var desde = diasAntes_(hasta, dias - 1);
  var mm = 0;
  leerHoja_(HOJA.LLUVIAS).forEach(function (f) {
    if (texto_(f.estado) === 'borrado') return;
    var fecha = aISO_(f.fecha);
    if (fecha >= desde && fecha <= hasta) mm += aNumero_(f.mm);
  });
  return Math.round(mm * 10) / 10;
}

/** La última fila de una hoja por potrero, mirando la fecha. */
function ultimoPorPotrero_(hoja, armar) {
  var salida = {};
  leerHoja_(hoja).forEach(function (f) {
    if (texto_(f.estado) === 'borrado') return;
    var potrero = texto_(f.potrero);
    var fecha = aISO_(f.fecha);
    if (!potrero || !fecha) return;
    var actual = salida[potrero];
    if (actual && actual.fecha > fecha) return;
    if (actual && actual.fecha === fecha &&
        aSello_(actual._sello) > aSello_(f.cargado_en)) return;
    var o = armar(f);
    o.fecha = fecha;
    o._sello = aSello_(f.cargado_en);
    salida[potrero] = o;
  });
  Object.keys(salida).forEach(function (k) { delete salida[k]._sello; });
  return salida;
}

function datosMapa_() {
  var calculo = calcularTodo_(false);

  // Van todos, con su "activo": el mapa no dibuja los dados de baja, pero
  // necesita saber cuáles son para no mostrarlos como potreros sin datos.
  var potreros = leerHoja_(HOJA.POTREROS)
    .filter(function (f) { return texto_(f.id); })
    .map(function (f) {
      return {
        id: texto_(f.id),
        lote: texto_(f.lote),
        hectareas: aNumero_(f.hectareas),
        uso: texto_(f.uso),
        activo: estaActivo_(f.activo),
        recurso: texto_(f.recurso),
        quien_lo_usa: texto_(f.quien_lo_usa),
        nota: texto_(f.nota)
      };
    });

  var coeficientes = {};
  leerHoja_(HOJA.COEFICIENTES).forEach(function (f) {
    var cat = texto_(f.categoria);
    if (cat) coeficientes[cat] = aNumero_(f.ev);
  });

  var stock = calculo.stock.map(function (s) {
    return {
      potrero: s.potrero, categoria: s.categoria, dueno: s.dueno,
      cabezas: s.cabezas, desde: s.desde, dias: s.dias
    };
  });

  var recorridas = ultimoPorPotrero_(HOJA.RECORRIDAS, function (f) {
    var agua = texto_(f.agua), alambre = texto_(f.alambre), pasto = texto_(f.pasto);
    return {
      agua: agua, alambre: alambre, pasto: pasto,
      problema: (agua !== 'Bien' || alambre !== 'Bien'),
      nota: texto_(f.nota)
    };
  });

  var manejo = ultimoPorPotrero_(HOJA.SANIDAD, function (f) {
    return {
      tipo: texto_(f.tipo), categoria: texto_(f.categoria),
      dueno: texto_(f.dueno), cabezas: Math.round(aNumero_(f.cabezas)),
      detalle: texto_(f.causa_producto)
    };
  });

  // Potreros con hacienda que no están en la lista: así no se pierden de vista.
  var enLista = {};
  potreros.forEach(function (p) { enLista[p.id] = true; });
  var fuera = [];
  stock.forEach(function (s) {
    if (!enLista[s.potrero] && fuera.indexOf(s.potrero) < 0) fuera.push(s.potrero);
  });

  return {
    hoy: hoyISO_(),
    potreros: potreros,
    stock: stock,
    descanso: calculo.descanso || [],
    coeficientes: coeficientes,
    recorridas: recorridas,
    manejo: manejo,
    fuera_de_lista: fuera,
    lluvia_7_dias: lluviaDeDias_(7),
    ultimo_recalculo: config_('ultimo_recalculo', ''),
    umbrales: {
      dias_descanso_min: Math.round(aNumero_(config_('dias_descanso_min', '20'))),
      dias_descanso_listo: Math.round(aNumero_(config_('dias_descanso_listo', '35'))),
      dias_ocupado_max: Math.round(aNumero_(config_('dias_ocupado_max', '7'))),
      tope_carga: aNumero_(config_('tope_carga', '1,6'))
    }
  };
}
