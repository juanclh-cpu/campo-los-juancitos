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
  lineas.push(moverPlanilla_());

  if (typeof URL_DE_LA_APP === 'string' && URL_DE_LA_APP) {
    PropertiesService.getScriptProperties().setProperty(PROP_URL_APP, URL_DE_LA_APP);
    lineas.push('Dirección de la app: ' + URL_DE_LA_APP);
  } else {
    lineas.push('Falta URL_DE_LA_APP: cargala con el menú de la planilla.');
  }

  escribirCalculos_(true);

  var info = enlaceActivacion_();
  lineas.push('Web App: ' + (info.urlApi || '(todavía no está desplegado)'));
  lineas.push('ENLACE DE ACTIVACIÓN: ' + (info.enlace || '(falta la dirección de la app)'));

  var texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/** Saca los acentos y las mayúsculas, para comparar nombres de carpeta. */
function sinAcentos_(texto) {
  var de = 'áàäâãéèëêíìïîóòöôõúùüûñç';
  var a = 'aaaaaeeeeiiiiooooouuuunc';
  var salida = '';
  texto = String(texto).toLowerCase();
  for (var i = 0; i < texto.length; i++) {
    var p = de.indexOf(texto.charAt(i));
    salida += (p >= 0) ? a.charAt(p) : texto.charAt(i);
  }
  return salida.trim();
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
