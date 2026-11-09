/**
 * Motor de cálculo. Todo se calcula en JavaScript a partir de los registros;
 * no hay fórmulas en la planilla.
 *
 * Orden de los eventos del mismo día:
 *   1) Carga histórica: primero los recuentos, después el resto (no tienen hora).
 *   2) Lo cargado con la app: por hora real de carga (cargado_en).
 *   Así, si Nahuel mueve y después cuenta, manda el recuento.
 *
 * Un recuento reemplaza el stock de ese potrero + categoría + dueño; los
 * movimientos, nacimientos y muertes posteriores se aplican sobre ese número.
 */

function siguienteDia_(iso) {
  var d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Arma la lista de eventos que mueven el stock, ya ordenada. */
function eventos_() {
  var ev = [];

  leerHoja_(HOJA.RECUENTOS).forEach(function (f) {
    if (texto_(f.estado) === 'borrado') return;
    var fecha = aISO_(f.fecha);
    if (!fecha) return;
    ev.push({
      clase: 'recuento', id: texto_(f.id), fecha: fecha,
      potrero: texto_(f.potrero), categoria: texto_(f.categoria),
      dueno: texto_(f.dueno), cabezas: Math.round(aNumero_(f.cabezas)),
      nota: texto_(f.nota), historico: texto_(f.origen_carga) === 'Carga histórica',
      sello: aSello_(f.cargado_en)
    });
  });

  leerHoja_(HOJA.MOVIMIENTOS).forEach(function (f) {
    if (texto_(f.estado) === 'borrado') return;
    var fecha = aISO_(f.fecha);
    if (!fecha) return;
    ev.push({
      clase: 'movimiento', id: texto_(f.id), fecha: fecha,
      origen: texto_(f.potrero_origen), destino: texto_(f.potrero_destino),
      categoria: texto_(f.categoria), dueno: texto_(f.dueno),
      cabezas: Math.round(aNumero_(f.cabezas)), motivo: texto_(f.motivo),
      nota: texto_(f.nota), historico: texto_(f.origen_carga) === 'Carga histórica',
      sello: aSello_(f.cargado_en)
    });
  });

  leerHoja_(HOJA.SANIDAD).forEach(function (f) {
    if (texto_(f.estado) === 'borrado') return;
    var fecha = aISO_(f.fecha);
    if (!fecha) return;
    var tipo = texto_(f.tipo);
    if (['Nacimiento', 'Muerte', 'Cambio de categoría'].indexOf(tipo) < 0) return;
    ev.push({
      clase: 'sanidad', tipo: tipo, id: texto_(f.id), fecha: fecha,
      potrero: texto_(f.potrero), categoria: texto_(f.categoria),
      categoria_destino: texto_(f.categoria_destino), dueno: texto_(f.dueno),
      cabezas: Math.round(aNumero_(f.cabezas)),
      causa: texto_(f.causa_producto), nota: texto_(f.nota),
      historico: texto_(f.origen_carga) === 'Carga histórica',
      sello: aSello_(f.cargado_en)
    });
  });

  ev.forEach(function (e) {
    if (e.historico) {
      e.orden = (e.clase === 'recuento') ? 0 : 1;
    } else {
      e.orden = 2;
    }
  });

  ev.sort(function (a, b) {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    if (a.orden !== b.orden) return a.orden - b.orden;
    if (a.sello !== b.sello) return a.sello < b.sello ? -1 : 1;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });

  return ev;
}

/**
 * Recorre todos los eventos y devuelve:
 *   stock     : cabezas por potrero + categoría + dueño, con la fecha desde
 *               la que ese grupo está en ese potrero.
 *   libretas  : {dueño: [filas de libreta]} — una fila por evento que cambia
 *               el stock del cliente (los traslados internos no aparecen).
 *   resumen   : stock actual por dueño y categoría.
 *   diario    : una fila por día, potrero, categoría y dueño.
 */
function calcularTodo_(conDiario) {
  var ev = eventos_();
  var hoy = hoyISO_();

  var stock = {};      // clave potrero+cat+dueño -> {cabezas, desde, potrero, categoria, dueno}
  var libretas = {};   // dueño -> filas
  var ultimoEvento = {}; // dueño+cat -> fecha
  var diario = [];
  var altas = [];      // altas automáticas, para poder avisarlas
  var ocupacion = {};  // potrero -> desde cuándo está ocupado y cuándo se vació
  var fechaCursor = null;

  function grupo_(potrero, categoria, dueno) {
    var k = clave_(potrero, categoria, dueno);
    if (!stock[k]) {
      stock[k] = {potrero: potrero, categoria: categoria, dueno: dueno,
        cabezas: 0, desde: ''};
    }
    return stock[k];
  }

  function sumar_(potrero, categoria, dueno, delta, fecha) {
    if (!potrero || potrero === ENTRADA_CAMPO || potrero === SALIDA_CAMPO) return;
    var g = grupo_(potrero, categoria, dueno);
    var antes = g.cabezas;
    g.cabezas = antes + delta;
    if (antes <= 0 && g.cabezas > 0) g.desde = fecha;
    if (g.cabezas <= 0) g.desde = '';
  }

  /** Total de un cliente en una categoría, sumando todos los potreros. */
  function total_(categoria, dueno) {
    var t = 0;
    Object.keys(stock).forEach(function (k) {
      var g = stock[k];
      if (g.categoria === categoria && g.dueno === dueno) t += g.cabezas;
    });
    return t;
  }

  function filaLibreta_(dueno, fila) {
    if (!libretas[dueno]) libretas[dueno] = [];
    libretas[dueno].push(fila);
    ultimoEvento[dueno + '\u0000' + fila.categoria] = fila.fecha;
  }

  function anotar_(ev, dueno, categoria, ingreso, egreso, muertes, potrero, comentario) {
    filaLibreta_(dueno, {
      fecha: ev.fecha, categoria: categoria,
      ingreso: ingreso || '', egreso: egreso || '', muertes: muertes || '',
      stock: total_(categoria, dueno), potrero: potrero || '',
      comentario: comentario || '', id: ev.id
    });
  }

  /** Cabezas que hay hoy en un potrero, sumando todas las categorías. */
  function cabezasEn_(potrero) {
    var t = 0;
    Object.keys(stock).forEach(function (k) {
      if (stock[k].potrero === potrero) t += stock[k].cabezas;
    });
    return t;
  }

  /**
   * Anota cuándo un potrero se llenó y cuándo se vació. Es la misma historia
   * de ocupación que arma el diario, pero sin tener que recorrerlo después:
   * así la hoja Descanso se puede calcular en cada recálculo, no sólo de noche.
   */
  function revisarOcupacion_(potreros, fecha) {
    potreros.forEach(function (p) {
      if (!p || p === ENTRADA_CAMPO || p === SALIDA_CAMPO) return;
      if (!ocupacion[p]) ocupacion[p] = {ocupado: false, desde: '', ultimaSalida: ''};
      var o = ocupacion[p];
      var hayHacienda = cabezasEn_(p) > 0;
      if (hayHacienda && !o.ocupado) {
        o.ocupado = true;
        o.desde = fecha;
      } else if (!hayHacienda && o.ocupado) {
        o.ocupado = false;
        o.desde = '';
        o.ultimaSalida = fecha;
      }
    });
  }

  function instantanea_(fecha) {
    Object.keys(stock).forEach(function (k) {
      var g = stock[k];
      if (g.cabezas !== 0) {
        diario.push([fecha, g.potrero, g.categoria, g.dueno, g.cabezas]);
      }
    });
  }

  for (var i = 0; i < ev.length; i++) {
    var e = ev[i];

    if (conDiario) {
      if (fechaCursor === null) fechaCursor = e.fecha;
      var vueltas = 0;
      while (fechaCursor < e.fecha && vueltas < 4000) {
        instantanea_(fechaCursor);
        fechaCursor = siguienteDia_(fechaCursor);
        vueltas++;
      }
    }

    if (e.clase === 'recuento') {
      var antesTotal = total_(e.categoria, e.dueno);
      var g = grupo_(e.potrero, e.categoria, e.dueno);
      var previo = g.cabezas;
      g.cabezas = e.cabezas;
      if (previo <= 0 && e.cabezas > 0) g.desde = e.fecha;
      if (e.cabezas <= 0) g.desde = '';
      var dif = total_(e.categoria, e.dueno) - antesTotal;
      if (dif !== 0) {
        var comentario = 'Ajuste por recuento (' + (previo || 0) + ' → ' +
          e.cabezas + ' en ' + e.potrero + ')';
        if (e.nota) comentario += '. ' + e.nota;
        anotar_(e, e.dueno, e.categoria, dif > 0 ? dif : '', dif < 0 ? -dif : '',
          '', e.potrero, comentario);
      }

    } else if (e.clase === 'movimiento') {
      // Si se saca de un potrero más hacienda de la que había cargada (por
      // ejemplo, un cliente que nunca se dio de alta), la diferencia se da de
      // alta sola a nombre de ese dueño, así el movimiento no deja negativos.
      if (e.origen && e.origen !== ENTRADA_CAMPO && e.origen !== SALIDA_CAMPO) {
        var go = grupo_(e.origen, e.categoria, e.dueno);
        var habia = Math.max(go.cabezas, 0);
        var falta = e.cabezas - habia;
        if (falta > 0) {
          sumar_(e.origen, e.categoria, e.dueno, falta, e.fecha);
          altas.push({id: e.id, fecha: e.fecha, potrero: e.origen,
            categoria: e.categoria, dueno: e.dueno, cabezas: falta,
            movidas: e.cabezas, habia: habia});
          anotar_(e, e.dueno, e.categoria, falta, '', '', e.origen,
            'Alta automática: se movieron ' + e.cabezas + ' desde ' + e.origen +
            ' y había ' + habia + ' cargadas. Confirmar con un recuento.');
        }
      }
      sumar_(e.origen, e.categoria, e.dueno, -e.cabezas, e.fecha);
      sumar_(e.destino, e.categoria, e.dueno, e.cabezas, e.fecha);
      var entra = (e.origen === ENTRADA_CAMPO);
      var sale = (e.destino === SALIDA_CAMPO);
      if (entra || sale) {
        var com = e.motivo || '';
        if (e.nota) com += (com ? '. ' : '') + e.nota;
        anotar_(e, e.dueno, e.categoria, entra ? e.cabezas : '',
          sale ? e.cabezas : '', '', entra ? e.destino : e.origen, com);
      }

    } else if (e.clase === 'sanidad') {
      if (e.tipo === 'Nacimiento') {
        sumar_(e.potrero, e.categoria, e.dueno, e.cabezas, e.fecha);
        anotar_(e, e.dueno, e.categoria, e.cabezas, '', '', e.potrero,
          ['Nacimiento', e.causa, e.nota].filter(String).join('. '));
      } else if (e.tipo === 'Muerte') {
        sumar_(e.potrero, e.categoria, e.dueno, -e.cabezas, e.fecha);
        anotar_(e, e.dueno, e.categoria, '', '', e.cabezas, e.potrero,
          ['Muerte', e.causa, e.nota].filter(String).join('. '));
      } else if (e.tipo === 'Cambio de categoría') {
        sumar_(e.potrero, e.categoria, e.dueno, -e.cabezas, e.fecha);
        var txt = ['Cambio de categoría: ' + e.categoria + ' → ' +
          e.categoria_destino, e.causa, e.nota].filter(String).join('. ');
        anotar_(e, e.dueno, e.categoria, '', e.cabezas, '', e.potrero, txt);
        sumar_(e.potrero, e.categoria_destino, e.dueno, e.cabezas, e.fecha);
        anotar_(e, e.dueno, e.categoria_destino, e.cabezas, '', '', e.potrero, txt);
      }
    }

    revisarOcupacion_(e.clase === 'movimiento' ? [e.origen, e.destino] : [e.potrero],
      e.fecha);
  }

  if (conDiario && fechaCursor !== null) {
    var v = 0;
    while (fechaCursor <= hoy && v < 4000) {
      instantanea_(fechaCursor);
      fechaCursor = siguienteDia_(fechaCursor);
      v++;
    }
  }

  // Stock como lista, con lote, hectáreas y días de pastoreo
  var datosPotrero = {};
  var ordenPotreros = [];
  leerHoja_(HOJA.POTREROS).forEach(function (f) {
    var id = texto_(f.id);
    if (!id) return;
    datosPotrero[id] = {lote: texto_(f.lote), ha: aNumero_(f.hectareas),
      uso: texto_(f.uso)};
    ordenPotreros.push(id);
  });

  var listaStock = [];
  Object.keys(stock).forEach(function (k) {
    var g = stock[k];
    if (g.cabezas === 0) return;   // los negativos se muestran: avisan que falta un recuento
    var p = datosPotrero[g.potrero] || {lote: '', ha: ''};
    listaStock.push({
      potrero: g.potrero, lote: p.lote, hectareas: p.ha,
      categoria: g.categoria, dueno: g.dueno, cabezas: g.cabezas,
      desde: g.desde,
      dias: g.desde ? Math.round(
        (new Date(hoy + 'T12:00:00Z') - new Date(g.desde + 'T12:00:00Z')) / 86400000) : ''
    });
  });
  listaStock.sort(function (a, b) {
    return (a.potrero + a.categoria + a.dueno).localeCompare(b.potrero + b.categoria + b.dueno);
  });

  // Resumen por dueño y categoría
  var resumen = [];
  var vistos = {};
  Object.keys(stock).forEach(function (k) {
    var g = stock[k];
    var kk = g.dueno + '\u0000' + g.categoria;
    if (vistos[kk]) return;
    vistos[kk] = true;
    var cab = total_(g.categoria, g.dueno);
    var donde = [];
    Object.keys(stock).forEach(function (k2) {
      var o = stock[k2];
      if (o.categoria === g.categoria && o.dueno === g.dueno && o.cabezas !== 0) {
        donde.push(o.potrero + ': ' + o.cabezas);
      }
    });
    donde.sort();
    resumen.push({
      dueno: g.dueno, categoria: g.categoria, cabezas: cab,
      potreros: donde.join(' · '),
      ultimo_evento: ultimoEvento[kk] || ''
    });
  });
  resumen.sort(function (a, b) {
    return (a.dueno + a.categoria).localeCompare(b.dueno + b.categoria);
  });

  // Descanso: cuántos días hace que cada potrero está vacío, o ocupado.
  var vistosPotrero = {};
  var listaDescanso = [];
  function diasEntre_(desde) {
    return Math.round((new Date(hoy + 'T12:00:00Z') -
      new Date(desde + 'T12:00:00Z')) / 86400000);
  }
  function filaDescanso_(potrero) {
    if (vistosPotrero[potrero]) return;
    vistosPotrero[potrero] = true;
    var p = datosPotrero[potrero] || {lote: '', ha: '', uso: ''};
    var o = ocupacion[potrero] || {ocupado: false, desde: '', ultimaSalida: ''};
    var cabezas = cabezasEn_(potrero);
    var ocupado = cabezas > 0;
    listaDescanso.push({
      potrero: potrero, lote: p.lote, hectareas: p.ha, uso: p.uso,
      ocupado: ocupado ? 'sí' : 'no',
      cabezas_hoy: cabezas,
      ultima_salida: ocupado ? '' : (o.ultimaSalida || ''),
      dias_descanso: (!ocupado && o.ultimaSalida) ? diasEntre_(o.ultimaSalida) : '',
      dias_ocupado: (ocupado && o.desde) ? diasEntre_(o.desde) : ''
    });
  }
  // Primero los de la hoja Potreros, en su orden; después los que aparezcan
  // en los registros sin estar en la lista.
  ordenPotreros.forEach(filaDescanso_);
  Object.keys(stock).forEach(function (k) { filaDescanso_(stock[k].potrero); });

  return {stock: listaStock, libretas: libretas, resumen: resumen,
    diario: diario, descanso: listaDescanso, altas: altas};
}
