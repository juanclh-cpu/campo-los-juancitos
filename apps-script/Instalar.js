/**
 * Instalación de una sola vez.
 *
 * Correr instalar() desde el editor de Apps Script. Google va a pedir permiso
 * la primera vez (es la autorización que sólo puede dar una persona).
 *
 * Usa dos valores que viven en Semilla.js, que no se publica:
 *   CARPETA_DESTINO : ['Carpeta', 'Subcarpeta', ...] dónde guardar la planilla.
 *   URL_DE_LA_APP   : la dirección de GitHub Pages donde está la app.
 * Si no están definidos, salta esos dos pasos y avisa.
 */

function instalar() {
  var lineas = [];
  lineas.push(sembrarCatalogos());
  ponerHojasAlDia_();
  lineas.push(moverPlanilla_());

  if (typeof URL_DE_LA_APP === 'string' && URL_DE_LA_APP) {
    PropertiesService.getScriptProperties().setProperty(PROP_URL_APP, URL_DE_LA_APP);
    lineas.push('Dirección de la app: ' + URL_DE_LA_APP);
  } else {
    lineas.push('Falta URL_DE_LA_APP: cargala con el menú de la planilla.');
  }

  try {
    crearDisparadorDiario();
    crearDisparadorInactividad();
    crearDisparadorParte();
    crearDisparadorRecalculo();
    lineas.push('Recálculo automático: todas las noches a las 22.');
    lineas.push('Revisión de cambios: cada 5 minutos.');
    lineas.push('Aviso por inactividad: todas las mañanas a las 9.');
    lineas.push('Parte semanal: los sábados a las 8.');
  } catch (e) {
    lineas.push('Sin tareas automáticas (falta el permiso de disparadores): ' +
      'usá el menú para recalcular.');
  }

  var avisos = mailsDe_('mail_avisos');
  lineas.push(avisos.length
    ? 'Los avisos van a: ' + avisos.join(', ')
    : 'Falta completar "mail_avisos" en la hoja Configuración.');

  escribirCalculos_(true);

  var info = enlaceActivacion_();
  lineas.push('Web App: ' + (info.urlApi || '(todavía no está desplegado)'));
  lineas.push('ENLACE DE ACTIVACIÓN: ' + (info.enlace || '(falta la dirección de la app)'));

  var texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/** Pone un valor en la hoja Configuración sólo si está vacío. */
function completarConfig_(clave, valor) {
  if (!valor) return;
  var h = hoja_(HOJA.CONFIG, ESQUEMA_REF[HOJA.CONFIG]);
  var filas = leerHoja_(HOJA.CONFIG);
  for (var i = 0; i < filas.length; i++) {
    if (texto_(filas[i].clave) === clave) {
      if (!texto_(filas[i].valor)) h.getRange(filas[i]._fila, 2).setValue(valor);
      return;
    }
  }
  h.appendRow([clave, valor, '']);
}

/**
 * Deja un nombre de carpeta comparable: sin mayúsculas, sin acentos y sin
 * espacios ni signos.
 *
 * Drive guarda los acentos de dos formas distintas: "ó" puede ser un solo
 * carácter o una "o" seguida de una tilde aparte. Hay que contemplar las dos,
 * si no "Administración" no coincide con "Administración".
 */
function sinAcentos_(texto) {
  texto = String(texto).toLowerCase();
  texto = texto.replace(/[\u0300-\u036f]/g, '');   // tildes escritas aparte
  var de = 'áàäâãéèëêíìïîóòöôõúùüûñç';
  var a = 'aaaaaeeeeiiiiooooouuuunc';
  var salida = '';
  for (var i = 0; i < texto.length; i++) {
    var p = de.indexOf(texto.charAt(i));
    salida += (p >= 0) ? a.charAt(p) : texto.charAt(i);
  }
  return salida.replace(/[^a-z0-9]/g, '');          // espacios, puntos, guiones
}

/** Busca una subcarpeta por nombre, perdonando acentos y mayúsculas. */
function subcarpeta_(padre, nombre) {
  var exacta = padre.getFoldersByName(nombre);
  if (exacta.hasNext()) return exacta.next();
  var buscado = sinAcentos_(nombre);
  var todas = padre.getFolders();
  var vistas = [];
  while (todas.hasNext()) {
    var c = todas.next();
    if (sinAcentos_(c.getName()) === buscado) return c;
    if (vistas.length < 25) vistas.push(c.getName());
  }
  throw new Error('No encontré la carpeta "' + nombre + '" dentro de "' +
    padre.getName() + '". Ahí adentro hay: ' + vistas.join(', '));
}

/** Mueve la planilla a la carpeta de Drive que indica CARPETA_DESTINO. */
function moverPlanilla_() {
  if (typeof CARPETA_DESTINO === 'undefined' || !CARPETA_DESTINO ||
      !CARPETA_DESTINO.length) {
    return 'Falta CARPETA_DESTINO: la planilla queda donde está.';
  }
  var archivo = DriveApp.getFileById(ss_().getId());
  var carpeta = DriveApp.getRootFolder();
  for (var i = 0; i < CARPETA_DESTINO.length; i++) {
    carpeta = subcarpeta_(carpeta, CARPETA_DESTINO[i]);
  }

  var yaEsta = false;
  var padres = archivo.getParents();
  var anteriores = [];
  while (padres.hasNext()) {
    var p = padres.next();
    if (p.getId() === carpeta.getId()) yaEsta = true;
    else anteriores.push(p);
  }
  if (!yaEsta) carpeta.addFile(archivo);
  for (var j = 0; j < anteriores.length; j++) anteriores[j].removeFile(archivo);

  return 'Planilla guardada en: ' + CARPETA_DESTINO.join(' / ');
}
