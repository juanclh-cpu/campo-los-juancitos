/**
 * EJEMPLO de la carga inicial de las hojas de referencia.
 *
 * El archivo de verdad (apps-script/Semilla.js) no se publica: tiene el
 * listado de potreros del campo y los nombres de los clientes, que viven en la
 * planilla y no en el repo. Para armar un campo nuevo: copiá este archivo a
 * apps-script/Semilla.js, poné tus datos y corré sembrarCatalogos() una vez
 * desde el editor de Apps Script.
 *
 *   cp apps-script/Semilla.ejemplo.js apps-script/Semilla.js
 */

// [id del potrero, hectáreas, uso]. El lote sale del número del id: "3b" es del lote 3.
/** Dónde guardar la planilla dentro de tu Drive (carpeta, subcarpeta, ...). */
var CARPETA_DESTINO = ['Mi empresa', 'Administración'];

/** Dónde está publicada la app. De acá sale el enlace de activación. */
var URL_DE_LA_APP = 'https://TU-USUARIO.github.io/TU-REPO/app/';

var POTREROS_INICIALES = [
  ['1a', 20.0, 'Pastura'], ['1b', 25.0, 'Agrícola'], ['1c', 18.5, 'Pastura'],
  ['1d', 12.0, 'Pastura'], ['1e', 30.0, 'Agrícola'], ['1f', 15.5, 'Pastura'],
  ['2a', 22.0, 'Pastura'], ['2b', 17.0, 'Verdeo'], ['2c', 28.0, 'Agrícola'],
  ['2d', 10.5, 'Pastura'], ['2e', 35.0, 'Campo natural'], ['2f', 19.0, 'Verdeo'],
  ['3a', 40.0, 'Pastura'], ['3b', 33.5, 'Pastura'], ['3c', 26.0, 'Agrícola'],
  ['3d', 14.0, 'Verdeo'], ['3e', 45.0, 'Pastura'], ['3f', 21.5, 'Agrícola'],
  ['4a', 50.0, 'Pastura'], ['4b', 38.0, 'Pastura'], ['4c', 29.5, 'Verdeo'],
  ['4d', 16.0, 'Pastura'], ['4e', 42.0, 'Agrícola'], ['4f', 24.0, 'Pastura'],
  ['5a', 55.0, 'Agrícola'], ['5b', 31.0, 'Pastura'], ['5c', 27.5, 'Verdeo'],
  ['5d', 13.5, 'Pastura'], ['5e', 48.0, 'Agrícola'], ['5f', 36.0, 'Pastura'],
  ['6a', 60.0, 'Pastura'], ['6b', 23.0, 'Campo natural']
];

var DUENOS_INICIALES = ['Propio', 'Cliente 1', 'Cliente 2', 'Cliente 3', 'Cliente 4'];

/** Las más usadas primero: así quedan arriba en la grilla de la app. */
var CATEGORIAS_INICIALES = ['Vaca', 'Vaca preñada', 'Vaca vacía', 'Vaca CUT',
  'Descarte', 'Vaquillona', 'Ternero macho', 'Ternera', 'Novillito', 'Novillo',
  'Toro', 'Caballo'];

function sembrarCatalogos() {
  armarHojas_();

  var filasPotrero = POTREROS_INICIALES.map(function (p) {
    var lote = String(p[0]).match(/^\d+/);
    return [p[0], lote ? lote[0] : '', p[1], p[2], 'sí'];
  });
  filasPotrero.push(['Corral/manga', 'Instalaciones', '', 'Instalaciones', 'sí']);
  volcar_(HOJA.POTREROS, ESQUEMA_REF[HOJA.POTREROS], filasPotrero);

  volcar_(HOJA.DUENOS, ESQUEMA_REF[HOJA.DUENOS],
    DUENOS_INICIALES.map(function (d, i) { return [d, i + 1, 'sí']; }));

  volcar_(HOJA.CATEGORIAS, ESQUEMA_REF[HOJA.CATEGORIAS],
    CATEGORIAS_INICIALES.map(function (c, i) { return [c, i + 1, 'sí']; }));

  enlaceActivacion_();   // crea el token si todavía no existe
  crearDisparadorDiario();
  return 'Catálogos cargados: ' + filasPotrero.length + ' potreros, ' +
    DUENOS_INICIALES.length + ' dueños, ' + CATEGORIAS_INICIALES.length + ' categorías.';
}
