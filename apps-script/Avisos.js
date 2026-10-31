/**
 * Avisos por mail.
 *
 *  - Cada vez que llegan registros del celular, un mail con lo que se cargó.
 *    Es uno por envío, no uno por registro: si el celular estuvo sin señal y
 *    manda diez juntos, llega un solo mail con los diez.
 *  - Si pasan muchos días sin que nadie cargue nada, un mail de recordatorio
 *    al dueño y al encargado. Lo dispara un horario diario.
 *
 * A quién avisarle se edita en la hoja Configuración.
 */

var PROP_ULTIMO_AVISO_INACTIVIDAD = 'ULTIMO_AVISO_INACTIVIDAD';

/** Mail con lo que se acaba de cargar. Nunca hace fallar un guardado. */
function avisarRegistros_(registros, persona, dispositivo) {
  try {
    if (!registros || !registros.length) return;
    if (texto_(config_('avisar_cada_registro', 'sí')).toLowerCase() === 'no') return;
    var destinos = mailsDe_('mail_avisos');
    if (!destinos.length) return;

    var quien = texto_(persona) || 'Alguien';
    var cuantos = registros.length;
    var asunto = 'Campo: ' + quien + ' cargó ' + cuantos +
      (cuantos === 1 ? ' registro' : ' registros');

    var lineas = registros.map(function (r) {
      return '• ' + fechaCorta_(r.fecha) + ' — ' + enPalabras_(r);
    });

    var cuerpo = quien + ' cargó ' + cuantos +
      (cuantos === 1 ? ' registro' : ' registros') + ' en el campo:\n\n' +
      lineas.join('\n') +
      '\n\n— — —\nPlanilla: ' + ss_().getUrl() +
      '\nEste aviso se configura en la hoja Configuración de la planilla.';

    MailApp.sendEmail(destinos.join(','), asunto, cuerpo);
  } catch (e) {
    registrarLog_('aviso fallado', persona, dispositivo, 0, 0, 0,
      String(e && e.message ? e.message : e));
  }
}

/** "31/10" */
function fechaCorta_(iso) {
  var p = String(iso).split('-');
  return p.length === 3 ? (Number(p[2]) + '/' + Number(p[1])) : String(iso);
}

/** Describe un registro en castellano, para el mail. */
function enPalabras_(r) {
  var hoja = texto_(r.hoja);
  var cab = Math.round(aNumero_(r.cabezas));
  if (hoja === HOJA.LLUVIAS) {
    return 'Llovieron ' + aNumero_(r.mm) + ' mm (' + texto_(r.lugar) + ')';
  }
  if (hoja === HOJA.MOVIMIENTOS) {
    if (texto_(r.potrero_origen) === ENTRADA_CAMPO) {
      return 'Entraron ' + cab + ' ' + texto_(r.categoria) + ' de ' +
        texto_(r.dueno) + ' al ' + texto_(r.potrero_destino);
    }
    if (texto_(r.potrero_destino) === SALIDA_CAMPO) {
      return 'Salieron ' + cab + ' ' + texto_(r.categoria) + ' de ' +
        texto_(r.dueno) + ' del ' + texto_(r.potrero_origen) +
        ' (' + texto_(r.motivo) + ')';
    }
    return 'Movió ' + cab + ' ' + texto_(r.categoria) + ' de ' + texto_(r.dueno) +
      ': ' + texto_(r.potrero_origen) + ' → ' + texto_(r.potrero_destino);
  }
  if (hoja === HOJA.RECUENTOS) {
    return 'Contó ' + cab + ' ' + texto_(r.categoria) + ' de ' + texto_(r.dueno) +
      ' en el ' + texto_(r.potrero);
  }
  if (hoja === HOJA.PESADAS) {
    return 'Pesó ' + Math.round(aNumero_(r.cabezas_pesadas)) + ' ' +
      texto_(r.categoria) + ' en el ' + texto_(r.potrero) + ': ' +
      aNumero_(r.kg_cargados) + ' kg ' +
      (texto_(r.kg_modo) === 'promedio' ? 'cada una' : 'en total') +
      ' (' + texto_(r.momento) + ')';
  }
  if (hoja === HOJA.SANIDAD) {
    return texto_(r.tipo) + ': ' + cab + ' ' + texto_(r.categoria) + ' de ' +
      texto_(r.dueno) + ' en el ' + texto_(r.potrero) +
      (texto_(r.causa_producto) ? ' (' + texto_(r.causa_producto) + ')' : '');
  }
  if (hoja === HOJA.RECORRIDAS) {
    return 'Recorrió el ' + texto_(r.potrero) + ': agua ' + texto_(r.agua) +
      ', alambre ' + texto_(r.alambre) + ', pasto ' + texto_(r.pasto);
  }
  return hoja;
}

/** Fecha y hora del último registro cargado, o '' si no hay ninguno. */
function ultimoRegistro_() {
  var ultimo = '';
  Object.keys(ESQUEMA).forEach(function (nombre) {
    leerHoja_(nombre).forEach(function (f) {
      if (texto_(f.estado) === 'borrado') return;
      var sello = aSello_(f.cargado_en);
      if (sello && sello > ultimo) ultimo = sello;
    });
  });
  return ultimo;
}

/** Días enteros desde el último registro. -1 si nunca se cargó nada. */
function diasSinRegistrar_() {
  var ultimo = ultimoRegistro_();
  if (!ultimo) return -1;
  var d = new Date(ultimo.replace(' ', 'T'));
  return Math.floor((new Date().getTime() - d.getTime()) / 86400000);
}

/**
 * Corre todos los días. Si hace más de la cuenta que nadie carga nada, avisa
 * al dueño y al encargado. No repite el aviso hasta pasados tres días.
 */
function revisarInactividad() {
  var limite = Math.round(aNumero_(config_('dias_sin_registrar', '5')));
  if (limite <= 0) return;

  var dias = diasSinRegistrar_();
  if (dias < 0) return;        // todavía no se cargó nada nunca
  if (dias < limite) return;

  var props = PropertiesService.getScriptProperties();
  var ultimoAviso = props.getProperty(PROP_ULTIMO_AVISO_INACTIVIDAD) || '';
  if (ultimoAviso) {
    var pasaron = Math.floor(
      (new Date().getTime() - new Date(ultimoAviso).getTime()) / 86400000);
    if (pasaron < 3) return;   // no insistir todos los días
  }

  var destinos = mailsDe_('mail_avisos').concat(mailsDe_('mail_encargado'));
  if (!destinos.length) return;

  var asunto = 'Campo: hace ' + dias + ' días que no se carga nada';
  var cuerpo = 'Hace ' + dias + ' días que nadie carga un registro en el campo.\n\n' +
    'Si hubo lluvias, movimientos o recorridas sin anotar, conviene cargarlos ' +
    'ahora: la app deja poner la fecha de atrás.\n\n' +
    'App: ' + (PropertiesService.getScriptProperties().getProperty(PROP_URL_APP) || '') +
    '\nPlanilla: ' + ss_().getUrl() +
    '\n\nEste aviso se configura en la hoja Configuración de la planilla ' +
    '(dias_sin_registrar).';

  MailApp.sendEmail(destinos.join(','), asunto, cuerpo);
  props.setProperty(PROP_ULTIMO_AVISO_INACTIVIDAD, new Date().toISOString());
  registrarLog_('aviso inactividad', '', '', 0, 0, 0, dias + ' días');
}

/** Disparador diario del aviso de inactividad. */
function crearDisparadorInactividad() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarInactividad') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarInactividad').timeBased().atHour(9).everyDays(1).create();
}
