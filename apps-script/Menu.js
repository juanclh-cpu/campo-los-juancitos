/**
 * Menú de la planilla y código de activación del celular.
 */

var PROP_URL_APP = 'URL_APP';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Campo Los Juancitos')
    .addItem('Instalar (una sola vez)', 'menuInstalar')
    .addItem('Poner las hojas al día', 'menuPonerAlDia')
    .addSeparator()
    .addItem('Recalcular stock y libretas', 'menuRecalcularRapido')
    .addItem('Recalcular todo (incluye diario de ocupación)', 'menuRecalcularTodo')
    .addSeparator()
    .addItem('Probar los avisos por mail', 'menuProbarAviso')
    .addItem('Mandar parte semanal ahora', 'menuParteSemanal')
    .addSeparator()
    .addItem('Ver el código de activación', 'menuVerCodigo')
    .addItem('Generar un código nuevo (anula el anterior)', 'menuNuevoCodigo')
    .addItem('Cambiar la dirección de la app', 'menuCambiarUrlApp')
    .addSeparator()
    .addItem('Armar o reparar las hojas', 'menuArmarHojas')
    .addItem('Vaciar todos los registros', 'menuVaciar')
    .addToUi();
}

/**
 * Instalación desde el menú de la planilla, para no depender del editor de
 * Apps Script: hay cuentas de Workspace donde el editor no abre.
 * La primera vez Google pide permiso acá mismo.
 */
function menuInstalar() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Instalar',
    'Carga los potreros, los dueños y las categorías de arranque, y pisa lo que ' +
    'haya en esas tres hojas. Después mueve la planilla a su carpeta.\n\n' +
    'Tarda hasta un minuto. ¿Sigo?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  var texto;
  try {
    texto = instalar();
  } catch (e) {
    ui.alert('No pude terminar', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
    return;
  }

  var info = enlaceActivacion_();
  var html = '<div style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif">' +
    '<p style="white-space:pre-wrap;margin:0 0 12px">' +
    texto.split('ENLACE DE ACTIVACIÓN:')[0].replace(/</g, '&lt;') + '</p>' +
    '<p style="margin:0 0 6px"><b>Enlace de activación para el celular</b><br>' +
    '<span style="color:#666">Abrilo una sola vez en el teléfono de quien va a ' +
    'cargar. No lo mandes a grupos.</span></p>' +
    '<textarea rows="4" style="width:100%;font:12px monospace" readonly>' +
    (info.enlace || '(falta la dirección de la app)') + '</textarea></div>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(560).setHeight(380),
    'Listo');
}

function menuRecalcularRapido() {
  escribirCalculos_(false);
  SpreadsheetApp.getUi().alert('Listo. Stock, resumen y libretas actualizados.');
}

function menuRecalcularTodo() {
  escribirCalculos_(true);
  SpreadsheetApp.getUi().alert('Listo. Todo actualizado, incluido el diario de ocupación.');
}

function menuArmarHojas() {
  armarHojas_();
  SpreadsheetApp.getUi().alert('Hojas listas.');
}

/** Agrega las columnas nuevas sin perder lo que ya está cargado. */
function menuPonerAlDia() {
  var ui = SpreadsheetApp.getUi();
  armarHojas_();
  var cambiadas = ponerHojasAlDia_();
  aplicarFormatoATodo_();
  try {
    crearDisparadorDiario();
    crearDisparadorInactividad();
    crearDisparadorParte();
  } catch (e) {}
  escribirCalculos_(true);
  ui.alert('Listo', cambiadas.length
    ? 'Puse al día estas hojas (entre paréntesis, las filas que se conservaron):\n\n' +
      cambiadas.join('\n') +
      '\n\nAcordate de completar los mails en la hoja Configuración.'
    : 'Ya estaba todo al día.', ui.ButtonSet.OK);
}

/** Borra todos los registros. Pide escribir BORRAR para confirmar. */
function menuVaciar() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Vaciar todos los registros',
    'Borra TODO lo cargado: lluvias, movimientos, recuentos, pesadas, sanidad, ' +
    'recorridas, las libretas y el log. No se puede deshacer.\n\n' +
    'No toca los potreros, los dueños, las categorías ni la configuración.\n\n' +
    'Si estás seguro, escribí BORRAR y dale Aceptar.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  if (texto_(r.getResponseText()).toUpperCase() !== 'BORRAR') {
    ui.alert('No borré nada.');
    return;
  }
  var cuantas = vaciarRegistros_();
  ui.alert('Listo',
    'Borré ' + cuantas + (cuantas === 1 ? ' fila.' : ' filas.') +
    ' La planilla quedó en cero y con las columnas al día.', ui.ButtonSet.OK);
}

/** Manda el parte semanal en el momento, para probarlo. */
function menuParteSemanal() {
  var ui = SpreadsheetApp.getUi();
  try {
    var r = mandarParteSemanal();
    if (!r.mandado) {
      ui.alert('No lo mandé', r.motivo, ui.ButtonSet.OK);
      return;
    }
    ui.alert('Mandado',
      'Parte semanal enviado a: ' + r.destinos.join(', ') + '\n\n' +
      r.registros + ' registros en los últimos 7 días.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('No pude mandarlo', String(e && e.message ? e.message : e),
      ui.ButtonSet.OK);
  }
}

/** Manda un mail de prueba a los destinatarios configurados. */
function menuProbarAviso() {
  var ui = SpreadsheetApp.getUi();
  var destinos = mailsDe_('mail_avisos');
  if (!destinos.length) {
    ui.alert('Falta el mail',
      'Completá "mail_avisos" en la hoja Configuración y probá de nuevo.',
      ui.ButtonSet.OK);
    return;
  }
  var dias = diasSinRegistrar_();
  try {
    MailApp.sendEmail(destinos.join(','), 'Campo: prueba de avisos',
      'Si estás leyendo esto, los avisos del campo funcionan.\n\n' +
      'Van a llegar a: ' + destinos.join(', ') + '\n' +
      'Aviso por inactividad: a los ' + config_('dias_sin_registrar', '5') +
      ' días sin registros.\n' +
      'Último registro: ' + (dias < 0 ? 'todavía no hay ninguno' : 'hace ' + dias + ' días') +
      '\n\nPlanilla: ' + ss_().getUrl());
    ui.alert('Mandado', 'Mail de prueba enviado a: ' + destinos.join(', '),
      ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('No pude mandarlo', String(e && e.message ? e.message : e), ui.ButtonSet.OK);
  }
}

/** Token nuevo al azar. */
function generarToken_() {
  var bytes = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  return bytes.slice(0, 40);
}

function base64url_(texto) {
  return Utilities.base64EncodeWebSafe(texto).replace(/=+$/, '');
}

/** Enlace de activación: dirección de la app + #a=<datos de conexión>. */
function enlaceActivacion_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty(PROP_TOKEN);
  if (!token) {
    token = generarToken_();
    props.setProperty(PROP_TOKEN, token);
    props.setProperty(PROP_TOKEN_CREADO, ahoraISO_());
  }
  var urlApp = props.getProperty(PROP_URL_APP) || '';
  // Preferimos la /exec que quedó guardada: getUrl() devuelve la /dev cuando
  // el script corre desde la planilla, y esa no le sirve al celular.
  var urlApi = (typeof URL_WEBAPP === 'string' && URL_WEBAPP) ? URL_WEBAPP : '';
  if (!urlApi) {
    try { urlApi = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  }
  var datos = base64url_(JSON.stringify({u: urlApi, t: token}));
  return {
    urlApp: urlApp,
    urlApi: urlApi,
    token: token,
    creado: props.getProperty(PROP_TOKEN_CREADO) || '',
    enlace: urlApp ? (urlApp + '#a=' + datos) : '',
    codigo: datos
  };
}

function menuVerCodigo() {
  mostrarCodigo_(enlaceActivacion_(), false);
}

function menuNuevoCodigo() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Generar un código nuevo',
    'El celular que esté usando el código viejo deja de poder guardar y hay que ' +
    'activarlo de nuevo. ¿Sigo?', ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;
  var props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_TOKEN, generarToken_());
  props.setProperty(PROP_TOKEN_CREADO, ahoraISO_());
  registrarLog_('token nuevo', '', '', 0, 0, 0, 'generado desde el menú');
  mostrarCodigo_(enlaceActivacion_(), true);
}

function menuCambiarUrlApp() {
  var ui = SpreadsheetApp.getUi();
  var actual = PropertiesService.getScriptProperties().getProperty(PROP_URL_APP) || '';
  var r = ui.prompt('Dirección de la app',
    'Pegá la dirección de GitHub Pages donde está la app.\nAhora: ' + (actual || '(vacía)'),
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var url = r.getResponseText().trim();
  if (url) {
    PropertiesService.getScriptProperties().setProperty(PROP_URL_APP, url);
    ui.alert('Guardada.');
  }
}

function mostrarCodigo_(info, esNuevo) {
  var html = '<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif">' +
    (esNuevo ? '<p><b>Código nuevo generado.</b> El anterior ya no sirve.</p>' : '') +
    '<p>Abrí este enlace <b>una sola vez en el celular de Nahuel</b>. ' +
    'La app queda activada y el código no se vuelve a ver.</p>' +
    '<p><a href="' + info.enlace + '" target="_blank" style="word-break:break-all">' +
    (info.enlace || '(falta configurar la dirección de la app)') + '</a></p>' +
    '<p style="color:#666">Generado: ' + info.creado + '</p>' +
    '<textarea rows="4" style="width:100%;font:12px monospace" readonly>' +
    info.enlace + '</textarea>' +
    '<p style="color:#666">No lo compartas por grupos de WhatsApp: con ese enlace ' +
    'cualquiera puede cargar registros.</p></div>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(520).setHeight(360),
    esNuevo ? 'Código de activación nuevo' : 'Código de activación');
}

/** Disparador diario que recalcula todo de noche. */
function crearDisparadorDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'recalcularTodo') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('recalcularTodo').timeBased().atHour(22).everyDays(1).create();
}
