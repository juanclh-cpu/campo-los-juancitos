/**
 * Menú de la planilla y código de activación del celular.
 */

var PROP_URL_APP = 'URL_APP';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Campo Los Juancitos')
    .addItem('Instalar (una sola vez)', 'menuInstalar')
    .addSeparator()
    .addItem('Recalcular stock y libretas', 'menuRecalcularRapido')
    .addItem('Recalcular todo (incluye diario de ocupación)', 'menuRecalcularTodo')
    .addSeparator()
    .addItem('Ver el código de activación', 'menuVerCodigo')
    .addItem('Generar un código nuevo (anula el anterior)', 'menuNuevoCodigo')
    .addItem('Cambiar la dirección de la app', 'menuCambiarUrlApp')
    .addSeparator()
    .addItem('Armar o reparar las hojas', 'menuArmarHojas')
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
  var urlApi = '';
  try { urlApi = ScriptApp.getService().getUrl() || ''; } catch (e) {}
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
  registrarLog_('token nuevo', '', 0, 0, 0, 'generado desde el menú');
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
