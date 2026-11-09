/**
 * Parte semanal por mail: qué pasó en el campo en los últimos 7 días.
 *
 * Lo manda un horario los sábados a las 8. Va a quien diga "mail_parte" en la
 * hoja Configuración; si está vacío no se manda nada.
 *
 * Los días se agrupan por la fecha en que pasaron las cosas, no por cuándo se
 * cargaron: un registro de ayer anotado hoy figura en el día de ayer.
 */

var DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves',
  'viernes', 'sábado'];

function diasAntes_(iso, dias) {
  var d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/** "lunes 3/11" */
function diaEnPalabras_(iso) {
  var d = new Date(iso + 'T12:00:00Z');
  return DIAS_SEMANA[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' +
    (d.getUTCMonth() + 1);
}

function escapar_(texto) {
  return String(texto === null || texto === undefined ? '' : texto)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Una recorrida "con problemas" es la que encontró algo que no está bien. */
function recorridaConProblema_(f) {
  return texto_(f.agua) !== 'Bien' || texto_(f.alambre) !== 'Bien' ||
    texto_(f.pasto) === '1 Poco';
}

/**
 * Arma el parte. No manda nada: devuelve el asunto, el HTML y los datos, así
 * se puede probar sin mandar mails.
 */
function parteSemanal_(hastaISO) {
  var hasta = hastaISO || hoyISO_();
  var desde = diasAntes_(hasta, 6);
  var calculo = calcularTodo_(false);

  // --- lo que pasó, día por día -------------------------------------------
  var porDia = {};
  var dias = [];
  for (var i = 0; i < 7; i++) {
    var d = diasAntes_(hasta, 6 - i);
    dias.push(d);
    porDia[d] = {lineas: [], mm: 0};
  }

  var quienes = {};    // "persona · dispositivo" -> cuántos registros
  var totalRegistros = 0;

  Object.keys(ESQUEMA).forEach(function (hoja) {
    leerHoja_(hoja).forEach(function (f) {
      if (texto_(f.estado) === 'borrado') return;
      var fecha = aISO_(f.fecha);
      if (!fecha || fecha < desde || fecha > hasta) return;

      totalRegistros++;
      var quien = (texto_(f.persona) || 'sin nombre') +
        (texto_(f.dispositivo) ? ' · ' + texto_(f.dispositivo) : '');
      quienes[quien] = (quienes[quien] || 0) + 1;

      if (hoja === HOJA.LLUVIAS) {
        porDia[fecha].mm += aNumero_(f.mm);
      }
      if (hoja === HOJA.RECORRIDAS && !recorridaConProblema_(f)) return;

      var registro = Object.assign({hoja: hoja}, f);
      porDia[fecha].lineas.push({
        texto: enPalabras_(registro),
        quien: texto_(f.persona) || 'sin nombre',
        dispositivo: texto_(f.dispositivo),
        nota: texto_(f.nota)
      });
    });
  });

  var sinNada = dias.filter(function (d) {
    return porDia[d].lineas.length === 0 && porDia[d].mm === 0;
  });
  var mmSemana = dias.reduce(function (a, d) { return a + porDia[d].mm; }, 0);

  // --- para revisar --------------------------------------------------------
  var paraRevisar = [];
  (calculo.altas || []).forEach(function (a) {
    if (a.fecha < desde || a.fecha > hasta) return;
    paraRevisar.push('Alta automática el ' + diaEnPalabras_(a.fecha) + ': ' +
      a.cabezas + ' ' + a.categoria + ' de ' + a.dueno + ' en el ' + a.potrero +
      ' (se movieron ' + a.movidas + ' y había ' + a.habia + ').');
  });
  calculo.stock.forEach(function (s) {
    if (s.cabezas < 0) {
      paraRevisar.push('El ' + s.potrero + ' está en ' + s.cabezas + ' ' +
        s.categoria + ' de ' + s.dueno + '. Falta contarlo.');
    }
  });

  // --- potreros ------------------------------------------------------------
  var maxDescanso = Math.round(aNumero_(config_('dias_descanso_max', '45')));
  var maxOcupado = Math.round(aNumero_(config_('dias_ocupado_max', '7')));
  var descansados = (calculo.descanso || []).filter(function (d) {
    return d.ocupado === 'no' && d.dias_descanso !== '' && d.dias_descanso > maxDescanso;
  }).sort(function (a, b) { return b.dias_descanso - a.dias_descanso; });
  var ocupados = (calculo.descanso || []).filter(function (d) {
    return d.ocupado === 'sí' && d.dias_ocupado !== '' && d.dias_ocupado > maxOcupado;
  }).sort(function (a, b) { return b.dias_ocupado - a.dias_ocupado; });

  // --- stock por cliente ---------------------------------------------------
  var porCliente = {};
  var ordenClientes = [];
  calculo.resumen.forEach(function (r) {
    if (!porCliente[r.dueno]) { porCliente[r.dueno] = []; ordenClientes.push(r.dueno); }
    porCliente[r.dueno].push(r);
  });
  var totalCabezas = calculo.resumen.reduce(function (a, r) { return a + r.cabezas; }, 0);

  return {
    desde: desde, hasta: hasta, dias: dias, porDia: porDia, sinNada: sinNada,
    mmSemana: mmSemana, quienes: quienes, totalRegistros: totalRegistros,
    paraRevisar: paraRevisar, descansados: descansados, ocupados: ocupados,
    porCliente: porCliente, ordenClientes: ordenClientes,
    totalCabezas: totalCabezas, maxDescanso: maxDescanso, maxOcupado: maxOcupado,
    asunto: 'Parte semanal del campo — ' + diaEnPalabras_(desde) + ' al ' +
      diaEnPalabras_(hasta),
    html: null
  };
}

/** El parte en HTML, listo para mandar por mail. */
function parteEnHtml_(p) {
  var css = 'font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#111';
  var h = ['<div style="' + css + ';max-width:640px">'];
  h.push('<h2 style="color:#1b5e20;margin:0 0 4px">Parte semanal del campo</h2>');
  h.push('<p style="color:#666;margin:0 0 18px">Del ' + diaEnPalabras_(p.desde) +
    ' al ' + diaEnPalabras_(p.hasta) + '</p>');

  if (p.paraRevisar.length) {
    h.push('<div style="background:#ffebee;border-left:6px solid #b71c1c;' +
      'padding:10px 14px;border-radius:6px;margin-bottom:18px">');
    h.push('<b style="color:#b71c1c">Para revisar</b><ul style="margin:6px 0 0;padding-left:20px">');
    p.paraRevisar.forEach(function (t) { h.push('<li>' + escapar_(t) + '</li>'); });
    h.push('</ul></div>');
  }

  h.push('<h3 style="color:#1b5e20;margin:0 0 8px">Qué pasó</h3>');
  if (!p.totalRegistros) {
    h.push('<p>No se cargó nada en toda la semana.</p>');
  } else {
    p.dias.forEach(function (d) {
      var dia = p.porDia[d];
      if (!dia.lineas.length && !dia.mm) return;
      h.push('<p style="margin:12px 0 4px"><b>' + diaEnPalabras_(d) + '</b>' +
        (dia.mm ? ' <span style="color:#1565c0">· ' + dia.mm + ' mm</span>' : '') +
        '</p>');
      if (dia.lineas.length) {
        h.push('<ul style="margin:0;padding-left:20px">');
        dia.lineas.forEach(function (l) {
          h.push('<li>' + escapar_(l.texto) +
            (l.nota ? '. <i>' + escapar_(l.nota) + '</i>' : '') +
            ' <span style="color:#888">— ' + escapar_(l.quien) +
            (l.dispositivo ? ' (' + escapar_(l.dispositivo) + ')' : '') +
            '</span></li>');
        });
        h.push('</ul>');
      }
    });
    h.push('<p style="margin:14px 0 0">Lluvia de la semana: <b>' + p.mmSemana +
      ' mm</b></p>');
  }

  if (p.sinNada.length) {
    h.push('<p style="color:#8d6e00;background:#fff8e1;padding:8px 12px;' +
      'border-radius:6px">Días sin nada anotado: ' +
      p.sinNada.map(diaEnPalabras_).join(', ') + '</p>');
  }

  if (Object.keys(p.quienes).length) {
    h.push('<p style="color:#666;margin:6px 0 18px">Cargaron: ' +
      Object.keys(p.quienes).map(function (q) {
        return escapar_(q) + ' (' + p.quienes[q] + ')';
      }).join(' · ') + '</p>');
  }

  h.push('<h3 style="color:#1b5e20;margin:18px 0 8px">Hacienda hoy</h3>');
  if (!p.ordenClientes.length) {
    h.push('<p>No hay hacienda anotada.</p>');
  } else {
    h.push('<table style="border-collapse:collapse;width:100%">');
    p.ordenClientes.forEach(function (dueno) {
      var filas = p.porCliente[dueno];
      var total = filas.reduce(function (a, r) { return a + r.cabezas; }, 0);
      h.push('<tr><td colspan="2" style="padding:8px 6px 2px"><b>' +
        escapar_(dueno) + '</b></td><td style="text-align:right;padding:8px 6px 2px">' +
        '<b>' + total + '</b></td></tr>');
      filas.forEach(function (r) {
        h.push('<tr><td style="width:18px"></td><td style="padding:2px 6px;' +
          'border-top:1px solid #eee">' + escapar_(r.categoria) + '</td>' +
          '<td style="text-align:right;padding:2px 6px;border-top:1px solid #eee">' +
          r.cabezas + '</td></tr>');
      });
    });
    h.push('<tr><td colspan="2" style="padding:10px 6px;border-top:2px solid #1b5e20">' +
      '<b>Total en el campo</b></td><td style="text-align:right;padding:10px 6px;' +
      'border-top:2px solid #1b5e20"><b>' + p.totalCabezas + '</b></td></tr>');
    h.push('</table>');
  }

  h.push('<h3 style="color:#1b5e20;margin:18px 0 8px">Potreros</h3>');
  if (p.descansados.length) {
    h.push('<p style="margin:0 0 6px">Descansando hace más de ' + p.maxDescanso +
      ' días: ' + p.descansados.map(function (d) {
        return escapar_(d.potrero) + ' (' + d.dias_descanso + ')';
      }).join(', ') + '</p>');
  }
  if (p.ocupados.length) {
    h.push('<p style="margin:0 0 6px">Ocupados hace más de ' + p.maxOcupado +
      ' días: ' + p.ocupados.map(function (d) {
        return escapar_(d.potrero) + ' (' + d.dias_ocupado + ', ' +
          d.cabezas_hoy + ' cab.)';
      }).join(', ') + '</p>');
  }
  if (!p.descansados.length && !p.ocupados.length) {
    h.push('<p style="margin:0">Ningún potrero pasado de descanso ni de ocupación.</p>');
  }

  h.push('<p style="color:#888;font-size:13px;margin-top:22px">' +
    'Planilla: <a href="' + ss_().getUrl() + '">Registro Campo Los Juancitos</a>. ' +
    'Este parte se configura en la hoja Configuración (mail_parte, ' +
    'dias_descanso_max, dias_ocupado_max).</p></div>');
  return h.join('');
}

/** Manda el parte. Lo llama el horario de los sábados y el menú. */
function mandarParteSemanal() {
  var destinos = mailsDe_('mail_parte');
  if (!destinos.length) {
    registrarLog_('parte semanal', '', '', 0, 0, 0, 'sin mail_parte: no se mandó');
    return {mandado: false, motivo: 'Falta completar "mail_parte" en la hoja Configuración.'};
  }
  var p = parteSemanal_();
  var html = parteEnHtml_(p);
  MailApp.sendEmail({to: destinos.join(','), subject: p.asunto, htmlBody: html});
  registrarLog_('parte semanal', '', '', p.totalRegistros, 0, 0,
    destinos.join(', '));
  return {mandado: true, destinos: destinos, asunto: p.asunto,
    registros: p.totalRegistros};
}

/** Horario de los sábados a las 8 de la mañana. */
function crearDisparadorParte() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'mandarParteSemanal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('mandarParteSemanal').timeBased()
    .onWeekDay(ScriptApp.WeekDay.SATURDAY).atHour(8).create();
}
