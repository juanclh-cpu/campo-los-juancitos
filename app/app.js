/* Campo — registro de lo que pasa en el campo.
   Todo se guarda primero en el celular y se manda cuando hay señal.
   Sin frameworks: un solo archivo, para que ande rápido en un Android barato. */

'use strict';

// ===========================================================================
// 1. Cosas sueltas
// ===========================================================================

/* Subir esto y VERSION en sw.js juntos en cada cambio. Se ve abajo de la
   pantalla principal, para saber de un vistazo qué versión tiene el teléfono. */
var VERSION = 'v11';

var ENTRADA_CAMPO = 'Entrada al campo';
var SALIDA_CAMPO = 'Salida del campo';
var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function hoyISO() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

function ahoraISO() {
  var d = new Date();
  return hoyISO() + 'T' + ('0' + d.getHours()).slice(-2) + ':' +
    ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
}

function diasDesde(iso, dias) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

/** "viernes 31 de octubre" — y "Hoy" / "Ayer" cuando corresponde. */
function fechaEnPalabras(iso, corto) {
  if (iso === hoyISO()) return 'Hoy';
  if (iso === diasDesde(hoyISO(), -1)) return 'Ayer';
  if (iso === diasDesde(hoyISO(), -2)) return 'Anteayer';
  var d = new Date(iso + 'T12:00:00');
  if (corto) return d.getDate() + '/' + (d.getMonth() + 1);
  return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
}

function numeroLindo(n) {
  var s = String(n).replace('.', ',');
  return s;
}

function el(tag, clase, texto) {
  var e = document.createElement(tag);
  if (clase) e.className = clase;
  if (texto !== undefined && texto !== null) e.textContent = texto;
  return e;
}

function boton(texto, alApretar, clase) {
  var b = el('button', clase, texto);
  b.addEventListener('click', alApretar);
  return b;
}

// ===========================================================================
// 2. Configuración guardada en el celular
// ===========================================================================

var CFG = {api: '', token: '', dispositivo: '', persona: ''};
var PREFS = {};
var CAT = null;

function cargarCfg() {
  try {
    var c = JSON.parse(localStorage.getItem('cfg') || '{}');
    Object.keys(c).forEach(function (k) { CFG[k] = c[k]; });
  } catch (e) {}
  try { PREFS = JSON.parse(localStorage.getItem('prefs') || '{}'); } catch (e) { PREFS = {}; }
  try { CAT = JSON.parse(localStorage.getItem('catalogos') || 'null'); } catch (e) { CAT = null; }
  if (!CFG.dispositivo) {
    CFG.dispositivo = 'celu-' + uuid().slice(0, 6);
    guardarCfg();
  }
}

function guardarCfg() { localStorage.setItem('cfg', JSON.stringify(CFG)); }
function guardarPrefs() { localStorage.setItem('prefs', JSON.stringify(PREFS)); }

function guardarCatalogos(c) {
  CAT = c;
  localStorage.setItem('catalogos', JSON.stringify(c));
  localStorage.setItem('catalogos_fecha', hoyISO());
}

/** Potreros agrupados por lote, respetando el orden numérico de los lotes. */
function potrerosPorLote() {
  var grupos = {};
  (CAT && CAT.potreros ? CAT.potreros : []).forEach(function (p) {
    var lote = p.lote || 'Otros';
    if (!grupos[lote]) grupos[lote] = [];
    grupos[lote].push(p);
  });
  return Object.keys(grupos).sort(function (a, b) {
    var na = parseInt(a, 10), nb = parseInt(b, 10);
    if (isNaN(na) && isNaN(nb)) return a.localeCompare(b);
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  }).map(function (lote) { return {lote: lote, potreros: grupos[lote]}; });
}

function datosPotrero(id) {
  var lista = (CAT && CAT.potreros) ? CAT.potreros : [];
  for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
  return null;
}

/** Días desde el último registro cargado en este celular. null si nunca. */
function diasSinCargar() {
  if (!PREFS.ultimoRegistro) return null;
  var d = new Date(PREFS.ultimoRegistro + 'T12:00:00');
  var hoy = new Date(hoyISO() + 'T12:00:00');
  return Math.round((hoy - d) / 86400000);
}

function recordarPotrero(id) {
  if (!id || id === ENTRADA_CAMPO || id === SALIDA_CAMPO) return;
  var u = (PREFS.ultimosPotreros || []).filter(function (p) { return p !== id; });
  u.unshift(id);
  PREFS.ultimosPotreros = u.slice(0, 3);
  guardarPrefs();
}

// ===========================================================================
// 3. Base de datos del celular (IndexedDB)
// ===========================================================================

var BD = null;

function abrirBD() {
  return new Promise(function (listo, falla) {
    var p = indexedDB.open('campo', 1);
    p.onupgradeneeded = function (e) {
      var bd = e.target.result;
      if (!bd.objectStoreNames.contains('cola')) {
        bd.createObjectStore('cola', {keyPath: 'id'});
      }
      if (!bd.objectStoreNames.contains('enviados')) {
        bd.createObjectStore('enviados', {keyPath: 'id'});
      }
    };
    p.onsuccess = function (e) { BD = e.target.result; listo(BD); };
    p.onerror = function () { falla(p.error); };
  });
}

function tx(almacen, modo) {
  return BD.transaction(almacen, modo).objectStore(almacen);
}

function pedir(peticion) {
  return new Promise(function (listo, falla) {
    peticion.onsuccess = function () { listo(peticion.result); };
    peticion.onerror = function () { falla(peticion.error); };
  });
}

function guardarEnCola(item) { return pedir(tx('cola', 'readwrite').put(item)); }
function sacarDeCola(id) { return pedir(tx('cola', 'readwrite').delete(id)); }
function leerCola() { return pedir(tx('cola', 'readonly').getAll()); }
function leerUnoDeCola(id) { return pedir(tx('cola', 'readonly').get(id)); }
function guardarEnviado(item) { return pedir(tx('enviados', 'readwrite').put(item)); }
function leerEnviados() { return pedir(tx('enviados', 'readonly').getAll()); }
function sacarEnviado(id) { return pedir(tx('enviados', 'readwrite').delete(id)); }

/** Tira de "enviados" lo que pasó de 24 horas: ahí sólo vive lo corregible. */
async function limpiarEnviados() {
  var limite = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  var todos = await leerEnviados();
  for (var i = 0; i < todos.length; i++) {
    if (!todos[i].guardado_en || todos[i].guardado_en < limite) {
      await sacarEnviado(todos[i].id);
    }
  }
}

// ===========================================================================
// 4. Hablar con la planilla
// ===========================================================================

function urlApi(params) {
  var q = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  return CFG.api + (CFG.api.indexOf('?') >= 0 ? '&' : '?') + q;
}

async function apiGet(accion, extra) {
  var params = Object.assign({accion: accion, token: CFG.token}, extra || {});
  var r = await fetch(urlApi(params), {method: 'GET', redirect: 'follow'});
  if (!r.ok) throw new Error('No pude leer la planilla');
  return await r.json();
}

async function apiPost(cuerpo) {
  cuerpo.token = CFG.token;
  cuerpo.dispositivo = CFG.dispositivo;
  cuerpo.persona = CFG.persona;
  // Sin encabezados propios: así el navegador no pide permiso extra al servidor.
  var r = await fetch(CFG.api, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(cuerpo)
  });
  if (!r.ok) throw new Error('No pude escribir en la planilla');
  return await r.json();
}

// ===========================================================================
// 5. Cola de envío
// ===========================================================================

var ESTADO = {pendientes: 0, problemas: 0, enviando: false, ultimoEnvio: null};

/* Cómo quedó el stock después de cada guardado, por id de registro. Lo manda
   el script con la respuesta del POST: la cuenta la hace la planilla, no el
   teléfono. Se usa una vez, para mostrar la pantalla, y se tira. */
var ESTADO_STOCK_POR_ID = {};
var TEMPORIZADOR = null;

async function contarCola() {
  var cola = await leerCola();
  ESTADO.pendientes = cola.filter(function (c) { return !c.error; }).length;
  ESTADO.problemas = cola.filter(function (c) { return !!c.error; }).length;
  return cola;
}

/** Pone un registro en la cola y dispara el envío. */
async function encolarGuardar(registro, sinMandar) {
  registro.cargado_en = registro.cargado_en || ahoraISO();
  registro.persona = registro.persona || CFG.persona;
  registro.dispositivo = CFG.dispositivo;
  registro.origen_carga = 'App';
  PREFS.ultimoRegistro = hoyISO();
  guardarPrefs();
  await guardarEnCola({
    id: registro.id, op: 'guardar', tipo: registro.hoja,
    registro: registro, creado: new Date().toISOString(), error: ''
  });
  await contarCola();
  if (!sinMandar) sincronizar();
}

async function encolarBorrar(tipo, idRegistro) {
  var enCola = await leerUnoDeCola(idRegistro);
  if (enCola && enCola.op === 'guardar') {
    // Todavía no salió del celular: lo saco y listo.
    await sacarDeCola(idRegistro);
    await contarCola();
    return;
  }
  await guardarEnCola({
    id: 'borrar-' + idRegistro, op: 'borrar', tipo: tipo, idRegistro: idRegistro,
    creado: new Date().toISOString(), error: ''
  });
  await sacarEnviado(idRegistro);
  await contarCola();
  sincronizar();
}

/**
 * Manda todo lo que está esperando. Si un registro ya estaba en la planilla,
 * el script contesta "repetido" y lo sacamos igual: reenviar no duplica.
 */
async function sincronizar(forzar) {
  if (ESTADO.enviando) return;
  if (!CFG.api || !CFG.token) return;
  if (!navigator.onLine && !forzar) { pintarEstado(); return; }

  var cola = await leerCola();
  var pendientes = cola.filter(function (c) { return !c.error; });
  if (!pendientes.length) { pintarEstado(); return; }

  ESTADO.enviando = true;
  pintarEstado();
  try {
    var borrados = pendientes.filter(function (c) { return c.op === 'borrar'; });
    for (var i = 0; i < borrados.length; i++) {
      try {
        var rb = await apiPost({accion: 'borrar', hoja: borrados[i].tipo,
          id: borrados[i].idRegistro});
        if (rb.ok || (rb.error && /no encontr/i.test(rb.error))) {
          await sacarDeCola(borrados[i].id);
        } else {
          await marcarProblema(borrados[i], rb.error || 'No se pudo borrar');
        }
      } catch (e) { break; }   // sin señal: queda para después
    }

    var guardar = pendientes.filter(function (c) { return c.op === 'guardar'; });
    while (guardar.length) {
      // Con foto van de a pocos: pesan y la red del campo es flaca.
      var conFoto = guardar.slice(0, 3).some(function (c) { return !!c.registro.foto; });
      var lote = guardar.splice(0, conFoto ? 2 : 10);
      var respuesta = await apiPost({
        accion: 'guardar',
        registros: lote.map(function (c) { return c.registro; })
      });
      if (!respuesta.ok) {
        if (respuesta.codigo === 'token') {
          for (var k = 0; k < lote.length; k++) {
            await marcarProblema(lote[k], 'Hay que activar la app de nuevo');
          }
        }
        break;
      }
      var porId = {};
      (respuesta.resultados || []).forEach(function (r) { porId[r.id] = r; });
      if (respuesta.estado_stock) {
        lote.forEach(function (c) { ESTADO_STOCK_POR_ID[c.id] = respuesta.estado_stock; });
      }
      for (var j = 0; j < lote.length; j++) {
        var res = porId[lote[j].id];
        if (!res) continue;
        if (res.estado === 'guardado' || res.estado === 'repetido') {
          await sacarDeCola(lote[j].id);
          await guardarEnviado({
            id: lote[j].id, tipo: lote[j].tipo, registro: lote[j].registro,
            guardado_en: new Date().toISOString()
          });
        } else {
          await marcarProblema(lote[j], res.mensaje || 'No se pudo guardar');
        }
      }
      ESTADO.ultimoEnvio = ahoraISO();
    }
  } catch (e) {
    // Sin señal o la planilla no contesta: se reintenta solo.
  } finally {
    ESTADO.enviando = false;
    await contarCola();
    pintarEstado();
    programarReintento();
  }
}

async function marcarProblema(item, mensaje) {
  item.error = mensaje;
  await guardarEnCola(item);
}

function programarReintento() {
  if (TEMPORIZADOR) clearTimeout(TEMPORIZADOR);
  if (ESTADO.pendientes > 0) {
    TEMPORIZADOR = setTimeout(function () { sincronizar(); }, 60000);
  }
}

window.addEventListener('online', function () { sincronizar(true); });
document.addEventListener('visibilitychange', function () {
  if (!document.hidden) sincronizar();
});

// ===========================================================================
// 6. Navegación entre pantallas
// ===========================================================================

var PILA = [];
var RAIZ = document.getElementById('pantalla');

function ir(nombre, datos) {
  PILA.push({nombre: nombre, datos: datos || {}});
  pintar();
}

function reemplazar(nombre, datos) {
  PILA[PILA.length - 1] = {nombre: nombre, datos: datos || {}};
  pintar();
}

function volver() {
  PILA.pop();
  if (!PILA.length) PILA.push({nombre: 'inicio', datos: {}});
  pintar();
}

function alInicio() {
  PILA = [{nombre: 'inicio', datos: {}}];
  pintar();
}

function pintar() {
  var actual = PILA[PILA.length - 1];
  var armar = PANTALLAS[actual.nombre] || PANTALLAS.inicio;
  RAIZ.innerHTML = '';
  RAIZ.appendChild(armar(actual.datos || {}));
  window.scrollTo(0, 0);
}

/** Barra verde arriba + cuerpo. */
function marco(titulo, cuerpo, opciones) {
  opciones = opciones || {};
  var cont = document.createDocumentFragment();
  var barra = el('div', 'barra');
  if (!opciones.sinVolver) {
    barra.appendChild(boton('‹', opciones.alVolver || volver, 'volver'));
  }
  barra.appendChild(el('h1', null, titulo));
  if (opciones.derecha) barra.appendChild(opciones.derecha);
  cont.appendChild(barra);
  var c = el('div', 'cuerpo');
  if (Array.isArray(cuerpo)) {
    cuerpo.forEach(function (n) { if (n) c.appendChild(n); });
  } else if (cuerpo) {
    c.appendChild(cuerpo);
  }
  cont.appendChild(c);
  return cont;
}

// ===========================================================================
// 7. Estado del envío
// ===========================================================================

function nodoEstado() {
  var d = el('div', 'estado');
  d.id = 'estado';
  var texto, clase;
  if (ESTADO.problemas > 0) {
    clase = 'problema';
    texto = '⚠ ' + ESTADO.problemas + (ESTADO.problemas === 1
      ? ' registro con problema' : ' registros con problema');
    d.addEventListener('click', function () { ir('problemas'); });
  } else if (ESTADO.enviando) {
    clase = 'espera';
    texto = '↑ Mandando…';
  } else if (ESTADO.pendientes > 0) {
    clase = 'espera';
    texto = ESTADO.pendientes + (ESTADO.pendientes === 1
      ? ' registro esperando señal' : ' registros esperando señal');
  } else {
    clase = 'ok';
    texto = '✓ Todo enviado';
  }
  d.className = 'estado ' + clase;
  d.appendChild(el('span', null, texto));
  return d;
}

function pintarEstado() {
  var viejo = document.getElementById('estado');
  if (viejo && viejo.parentNode) viejo.parentNode.replaceChild(nodoEstado(), viejo);
}

// ===========================================================================
// 8. Pantallas: activación y PIN
// ===========================================================================

var PANTALLAS = {};

function decodificarCodigo(codigo) {
  var limpio = String(codigo).trim().replace(/^.*#a=/, '').replace(/\s+/g, '');
  var b64 = limpio.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var datos = JSON.parse(decodeURIComponent(escape(atob(b64))));
  if (!datos.u || !datos.t) throw new Error('código incompleto');
  return datos;
}

PANTALLAS.activar = function (datos) {
  var cuerpo = [];
  if (datos.error) cuerpo.push(el('div', 'falta', datos.error));
  cuerpo.push(el('p', 'pregunta', 'Hay que activar la app'));
  cuerpo.push(el('p', null,
    'Pegá acá el código de activación que te pasó Juan Cruz. Es una sola vez.'));
  var caja = el('textarea');
  caja.rows = 4;
  caja.placeholder = 'Pegar el código acá';
  cuerpo.push(caja);
  cuerpo.push(boton('ACTIVAR', function () {
    var info;
    try {
      info = decodificarCodigo(caja.value);
    } catch (e) {
      return reemplazar('activar', {error: 'Ese código no sirve. Pedí uno nuevo.'});
    }
    CFG.api = info.u;
    CFG.token = info.t;
    guardarCfg();
    ir('nombre', {primera: true});
  }, 'ancho'));
  return marco('Activar', cuerpo, {sinVolver: true});
};

/**
 * Quién carga. Va en cada registro, así se sabe quién anotó qué.
 * Se pregunta una vez y se puede cambiar desde la pantalla principal.
 */
PANTALLAS.nombre = function (datos) {
  var cuerpo = [];
  if (datos.aviso) cuerpo.push(el('div', 'falta', datos.aviso));
  cuerpo.push(el('p', 'pregunta', '¿Cómo te llamás?'));
  cuerpo.push(el('p', null,
    'Va en cada cosa que cargues, para saber quién la anotó.'));
  var entrada = el('input');
  entrada.type = 'text';
  entrada.value = CFG.persona || '';
  entrada.placeholder = 'Tu nombre';
  entrada.autocapitalize = 'words';
  cuerpo.push(entrada);
  cuerpo.push(boton('LISTO', async function () {
    var nombre = entrada.value.trim();
    if (!nombre) {
      return reemplazar('nombre', Object.assign({}, datos,
        {aviso: 'Escribí tu nombre para seguir.'}));
    }
    CFG.persona = nombre;
    guardarCfg();
    if (datos.primera) {
      PILA = [{nombre: 'inicio', datos: {}}];
      await arrancarDatos();
      pintar();
    } else {
      volver();
    }
  }, 'ancho'));
  return marco('Tu nombre', cuerpo, {sinVolver: !!datos.primera});
};

// ===========================================================================
// 9. Pantalla principal
// ===========================================================================

var BOTONES_INICIO = [
  {ico: '🌧️', texto: 'Lluvia', pantalla: 'lluvia'},
  {ico: '🐄', texto: 'Mover', pantalla: 'mover'},
  {ico: '🔢', texto: 'Contar', pantalla: 'contar'},
  {ico: '⚖️', texto: 'Pesada', pantalla: 'pesada'},
  {ico: '🩺', texto: 'Manejo', pantalla: 'sanidad'},
  {ico: '👁️', texto: 'Recorrida', pantalla: 'recorrida'}
];

PANTALLAS.inicio = function () {
  var cuerpo = [];
  cuerpo.push(nodoEstado());

  if (!CAT) {
    cuerpo.push(el('div', 'falta',
      'Falta bajar la lista de potreros. Buscá un lugar con señal y abrí la app otra vez.'));
  }

  ((CAT && CAT.avisos) || []).forEach(function (m) {
    cuerpo.push(el('div', 'falta', '📣 ' + m));
  });

  var sinCargar = diasSinCargar();
  var limite = (CAT && CAT.dias_sin_registrar) || 5;
  if (sinCargar !== null && sinCargar >= limite) {
    cuerpo.push(el('div', 'falta', 'Hace ' + sinCargar + ' días que no cargás nada. ' +
      'Si quedó algo sin anotar, cargalo ahora: podés poner la fecha de atrás.'));
  }

  var menu = el('div', 'menu');
  BOTONES_INICIO.forEach(function (b) {
    var bt = boton('', function () { ir(b.pantalla); });
    bt.appendChild(el('span', 'ico', b.ico));
    bt.appendChild(el('span', null, b.texto));
    menu.appendChild(bt);
  });
  cuerpo.push(menu);

  // Repetir el último movimiento: el traslado de rutina en dos toques.
  var um = PREFS.ultimoMovimiento;
  if (um) {
    cuerpo.push(boton('🔁 Repetir: ' + um.cabezas + ' ' +
      pluralizar(um.categoria, um.cabezas) + ' ' + um.dueno + ' ' +
      um.potrero_origen + ' → ' + um.potrero_destino,
      function () {
        ir('mover', {repetir: true, valores: {
          fecha: hoyISO(),
          potrero_origen: um.potrero_origen,
          potrero_destino: um.potrero_destino,
          categoria: um.categoria,
          dueno: um.dueno,
          cabezas: um.cabezas,
          motivo: um.motivo
        }});
      }, 'repetir'));
  }

  cuerpo.push(boton('🗺️ MAPA DEL CAMPO', function () { ir('mapa'); }, 'ancho'));
  cuerpo.push(boton('STOCK', function () { ir('stock'); }, 'ancho'));
  cuerpo.push(boton('Mis últimos registros', function () { ir('ultimos'); }, 'secundario'));

  cuerpo.push(boton('Carga: ' + (CFG.persona || 'sin nombre') + ' — cambiar',
    function () { ir('nombre', {}); }, 'secundario'));
  cuerpo.push(el('p', 'pie', 'Campo LJ ' + VERSION + ' · ' + fechaEnPalabras(hoyISO())));
  return marco('Registro Campo LJ', cuerpo, {sinVolver: true});
};

// ===========================================================================
// 10. Piezas que se reusan: fecha, potrero, teclado, foto
// ===========================================================================

/** Chip con la fecha: un toque y la cambia. */
function chipFecha(valores, alCambiar) {
  return boton('📅 ' + fechaEnPalabras(valores.fecha), function () {
    ir('fecha', {valores: valores, alCambiar: alCambiar});
  }, 'fecha-chip');
}

PANTALLAS.fecha = function (datos) {
  var cuerpo = [el('p', 'pregunta', '¿De qué día es?')];
  var opciones = el('div', 'opciones una');
  [['Hoy', hoyISO()], ['Ayer', diasDesde(hoyISO(), -1)],
    ['Anteayer', diasDesde(hoyISO(), -2)]].forEach(function (o) {
    var b = boton(o[0] + ' · ' + fechaEnPalabras(o[1], true), function () {
      datos.valores.fecha = o[1];
      volver();
      if (datos.alCambiar) datos.alCambiar();
    });
    if (datos.valores.fecha === o[1]) b.className = 'elegido';
    opciones.appendChild(b);
  });
  cuerpo.push(opciones);

  cuerpo.push(el('p', 'lote', 'Otro día'));
  var entrada = el('input');
  entrada.type = 'date';
  entrada.value = datos.valores.fecha;
  entrada.max = hoyISO();
  entrada.addEventListener('change', function () {
    if (entrada.value) {
      datos.valores.fecha = entrada.value;
      volver();
      if (datos.alCambiar) datos.alCambiar();
    }
  });
  cuerpo.push(entrada);
  return marco('Fecha', cuerpo);
};

/** Grilla de potreros por lote, con los últimos 3 usados arriba. */
function grillaPotreros(opciones) {
  var cuerpo = [];
  var elegir = opciones.alElegir;
  var excluir = opciones.excluir;

  function botonPotrero(p) {
    var b = boton('', function () { elegir(p.id); });
    b.appendChild(el('span', null, p.id));
    if (p.hectareas) b.appendChild(el('small', null, numeroLindo(p.hectareas) + ' ha'));
    else if (p.uso) b.appendChild(el('small', null, p.uso));
    if (opciones.elegido === p.id) b.className = 'elegido';
    return b;
  }

  if (opciones.entrada) {
    var be = boton(opciones.entrada, function () { elegir(opciones.entrada); },
      'especial');
    var ge = el('div', 'potreros');
    ge.appendChild(be);
    cuerpo.push(ge);
  }

  var recientes = (PREFS.ultimosPotreros || []).filter(function (id) {
    return id !== excluir && datosPotrero(id);
  });
  if (recientes.length) {
    cuerpo.push(el('p', 'lote', 'Los últimos que usaste'));
    var g = el('div', 'potreros');
    recientes.forEach(function (id) { g.appendChild(botonPotrero(datosPotrero(id))); });
    cuerpo.push(g);
  }

  potrerosPorLote().forEach(function (grupo) {
    var lista = grupo.potreros.filter(function (p) { return p.id !== excluir; });
    if (!lista.length) return;
    cuerpo.push(el('p', 'lote', isNaN(parseInt(grupo.lote, 10))
      ? grupo.lote : 'Lote ' + grupo.lote));
    var gg = el('div', 'potreros');
    lista.forEach(function (p) { gg.appendChild(botonPotrero(p)); });
    cuerpo.push(gg);
  });

  if (opciones.salida) {
    var gs = el('div', 'potreros');
    gs.appendChild(boton(opciones.salida, function () { elegir(opciones.salida); },
      'especial'));
    cuerpo.push(gs);
  }
  return cuerpo;
}

/** Teclado numérico propio: grande, sin el del sistema. */
function tecladoNumerico(opciones) {
  var valor = opciones.inicial !== undefined && opciones.inicial !== null
    ? String(opciones.inicial).replace('.', ',') : '';
  var cont = el('div');
  var visor = el('div', 'visor vacio');
  cont.appendChild(visor);

  function repintar() {
    visor.innerHTML = '';
    visor.appendChild(document.createTextNode(valor || '0'));
    if (opciones.unidad) {
      visor.appendChild(el('span', 'unidad', ' ' + opciones.unidad));
    }
    visor.className = valor ? 'visor' : 'visor vacio';
    if (opciones.alCambiar) opciones.alCambiar(valor);
  }
  repintar();

  function agregar(d) {
    if (d === ',') {
      if (!opciones.decimales || valor.indexOf(',') >= 0) return;
      valor = (valor || '0') + ',';
    } else if (valor.replace(/[^0-9]/g, '').length < 7) {
      if (valor === '0') valor = d; else valor += d;
    }
    repintar();
  }

  var teclado = el('div', 'teclado');
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(function (d) {
    teclado.appendChild(boton(d, function () { agregar(d); }));
  });
  teclado.appendChild(boton('←', function () {
    valor = valor.slice(0, -1);
    repintar();
  }));
  teclado.appendChild(boton('0', function () { agregar('0'); }));
  teclado.appendChild(boton(opciones.decimales ? ',' : 'C', function () {
    if (opciones.decimales) agregar(',');
    else { valor = ''; repintar(); }
  }));
  cont.appendChild(teclado);

  (opciones.extras || []).forEach(function (n) { if (n) cont.appendChild(n); });

  cont.appendChild(boton(opciones.textoListo || 'LISTO', function () {
    if (valor === '' || valor === ',') return;
    opciones.alListo(parseFloat(valor.replace(',', '.')));
  }, 'ancho'));
  return cont;
}

/** Comprime la foto en el celular: 1280 px de lado mayor y ~300 KB. */
function comprimirFoto(archivo) {
  return new Promise(function (listo, falla) {
    var lector = new FileReader();
    lector.onload = function () {
      var img = new Image();
      img.onload = function () {
        var max = 1280;
        var escala = Math.min(1, max / Math.max(img.width, img.height));
        var lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
        var calidad = 0.82;
        var datos = lienzo.toDataURL('image/jpeg', calidad);
        while (datos.length * 0.75 > 300 * 1024 && calidad > 0.3) {
          calidad -= 0.1;
          datos = lienzo.toDataURL('image/jpeg', calidad);
        }
        listo(datos);
      };
      img.onerror = function () { falla(new Error('no pude leer la foto')); };
      img.src = lector.result;
    };
    lector.onerror = function () { falla(new Error('no pude leer la foto')); };
    lector.readAsDataURL(archivo);
  });
}

function nodoFoto(valores, repintarConfirmacion) {
  var cont = el('div');
  var entrada = el('input');
  entrada.type = 'file';
  entrada.accept = 'image/*';
  entrada.capture = 'environment';
  entrada.style.display = 'none';
  entrada.addEventListener('change', async function () {
    if (!entrada.files || !entrada.files[0]) return;
    try {
      valores.foto = await comprimirFoto(entrada.files[0]);
    } catch (e) {
      valores.foto = null;
    }
    repintarConfirmacion();
  });
  cont.appendChild(entrada);
  cont.appendChild(boton(valores.foto ? '📷 Foto puesta — cambiar' : '📷 Sacar una foto',
    function () { entrada.click(); }, 'secundario'));
  if (valores.foto) {
    cont.appendChild(boton('Quitar la foto', function () {
      valores.foto = null;
      repintarConfirmacion();
    }, 'secundario'));
  }
  return cont;
}

// ===========================================================================
// 11. Formularios: una decisión por pantalla
// ===========================================================================

function textoOpcion(o) { return (typeof o === 'string') ? o : o.texto; }
function valorOpcion(o) { return (typeof o === 'string') ? o : o.valor; }

/** Pasos visibles de una definición, según lo que ya se eligió. */
function pasosVisibles(def, valores) {
  return def.pasos.filter(function (p) { return !p.si || p.si(valores); });
}

PANTALLAS.form = function (datos) {
  var def = datos.def;
  var valores = datos.valores;
  var pasos = pasosVisibles(def, valores);
  var i = datos.paso || 0;

  if (i >= pasos.length) return confirmacion(def, valores);

  var paso = pasos[i];
  var cuerpo = [];
  cuerpo.push(chipFecha(valores, function () {
    reemplazar('form', {def: def, valores: valores, paso: i});
  }));
  cuerpo.push(el('p', 'paso', 'Paso ' + (i + 1) + ' de ' + pasos.length));
  cuerpo.push(el('p', 'pregunta', paso.pregunta));

  function seguir(valor) {
    valores[paso.campo] = valor;
    if (paso.campo === 'potrero' || paso.campo === 'potrero_origen' ||
        paso.campo === 'potrero_destino') {
      recordarPotrero(valor);
    }
    if (paso.recordar) {
      PREFS[paso.recordar] = valor;
      guardarPrefs();
    }
    ir('form', {def: def, valores: valores, paso: i + 1});
  }

  if (paso.tipo === 'potrero') {
    grillaPotreros({
      alElegir: seguir,
      elegido: valores[paso.campo],
      excluir: paso.excluir ? valores[paso.excluir] : null,
      entrada: paso.entrada ? ENTRADA_CAMPO : null,
      salida: paso.salida ? SALIDA_CAMPO : null
    }).forEach(function (n) { cuerpo.push(n); });

  } else if (paso.tipo === 'opciones') {
    var lista = (typeof paso.opciones === 'function') ? paso.opciones(valores) : paso.opciones;
    var cont = el('div', 'opciones' + (paso.columnas === 1 ? ' una' : ''));
    var preferido = paso.recordar ? PREFS[paso.recordar] : null;
    lista.forEach(function (o) {
      var b = boton(textoOpcion(o), function () { seguir(valorOpcion(o)); });
      if (valores[paso.campo] === valorOpcion(o) ||
          (!valores[paso.campo] && preferido === valorOpcion(o))) {
        b.className = 'elegido';
      }
      cont.appendChild(b);
    });
    cuerpo.push(cont);
    if (paso.conOtro) {
      cuerpo.push(boton('Otro (escribir el nombre)', function () {
        ir('otroNombre', {def: def, valores: valores, paso: i, campo: paso.campo,
          recordar: paso.recordar});
      }, 'secundario'));
    }

  } else if (paso.tipo === 'numero') {
    cuerpo.push(tecladoNumerico({
      unidad: paso.unidad,
      decimales: !!paso.decimales,
      inicial: valores['_' + paso.campo] !== undefined
        ? valores['_' + paso.campo] : valores[paso.campo],
      alCambiar: function (t) { valores['_' + paso.campo] = t; },
      alListo: function (v) { delete valores['_' + paso.campo]; seguir(v); }
    }));
  }

  return marco(def.titulo, cuerpo);
};

/** Dueño que no está en la lista: se escribe el nombre. */
PANTALLAS.otroNombre = function (datos) {
  var cuerpo = [el('p', 'pregunta', '¿De quién es?')];
  var entrada = el('input');
  entrada.type = 'text';
  entrada.placeholder = 'Nombre';
  cuerpo.push(entrada);
  cuerpo.push(boton('SEGUIR', function () {
    var nombre = entrada.value.trim();
    if (!nombre) return;
    datos.valores[datos.campo] = nombre;
    if (datos.recordar) { PREFS[datos.recordar] = nombre; guardarPrefs(); }
    PILA.pop();
    ir('form', {def: datos.def, valores: datos.valores, paso: datos.paso + 1});
  }, 'ancho'));
  return marco('Dueño', cuerpo);
};

/** Última pantalla: lo dice en castellano y se guarda. */
function confirmacion(def, valores) {
  var cuerpo = [];
  function repintarme() { reemplazar('form', {def: def, valores: valores, paso: 999}); }

  if (valores._falta) cuerpo.push(el('div', 'falta', valores._falta));
  cuerpo.push(el('div', 'frase', def.frase(valores)));
  if (def.aviso) cuerpo.push(el('p', null, def.aviso(valores)));

  // Chips para volver a cualquier dato sin perder el resto.
  var chips = el('div', 'chips');
  chips.appendChild(boton('📅 ' + fechaEnPalabras(valores.fecha, true), function () {
    ir('fecha', {valores: valores, alCambiar: repintarme});
  }));
  pasosVisibles(def, valores).forEach(function (p, idx) {
    var v = valores[p.campo];
    if (v === undefined || v === '') return;
    chips.appendChild(boton(p.chip ? p.chip(v, valores) : String(v), function () {
      ir('form', {def: def, valores: valores, paso: idx});
    }));
  });
  cuerpo.push(chips);

  (def.inline || []).forEach(function (campo) {
    cuerpo.push(el('p', 'lote', campo.etiqueta));
    var lista = (typeof campo.opciones === 'function')
      ? campo.opciones(valores) : campo.opciones;
    if (valores[campo.campo] === undefined && campo.defecto !== undefined) {
      valores[campo.campo] = (typeof campo.defecto === 'function')
        ? campo.defecto(valores) : campo.defecto;
    }
    var cont = el('div', 'opciones' + (campo.columnas === 1 ? ' una' : ''));
    lista.forEach(function (o) {
      var b = boton(textoOpcion(o), function () {
        valores[campo.campo] = valorOpcion(o);
        repintarme();
      });
      if (valores[campo.campo] === valorOpcion(o)) b.className = 'elegido';
      cont.appendChild(b);
    });
    cuerpo.push(cont);
  });

  if (def.textoCorto) {
    var etiqueta = def.textoCorto.etiqueta;
    var ejemplo = def.textoCorto.ejemplo;
    cuerpo.push(el('p', 'lote',
      typeof etiqueta === 'function' ? etiqueta(valores) : etiqueta));
    var ec = el('input');
    ec.type = 'text';
    ec.value = valores[def.textoCorto.campo] || '';
    ec.placeholder = (typeof ejemplo === 'function' ? ejemplo(valores) : ejemplo) || '';
    ec.addEventListener('input', function () {
      valores[def.textoCorto.campo] = ec.value;
    });
    cuerpo.push(ec);
  }

  if (def.conFoto) cuerpo.push(nodoFoto(valores, repintarme));

  cuerpo.push(el('p', 'lote', 'Nota (si querés)'));
  var nota = el('textarea');
  nota.rows = 2;
  nota.value = valores.nota || '';
  nota.placeholder = 'No hace falta escribir nada';
  nota.addEventListener('input', function () { valores.nota = nota.value; });
  cuerpo.push(nota);

  var aviso = def.advertencia ? def.advertencia(valores) : '';
  if (aviso) cuerpo.push(el('div', 'aviso-agricola', '⚠️ ' + aviso));

  cuerpo.push(boton('GUARDAR', function () {
    var falta = def.validar ? def.validar(valores) : '';
    if (falta) {
      valores._falta = falta;
      return repintarme();
    }
    if (aviso && !valores._avisoVisto) {
      return ir('confirmarAviso', {def: def, valores: valores, aviso: aviso});
    }
    guardarRegistro(def, valores);
  }, 'ancho'));

  return marco(def.titulo, cuerpo);
}

/** Cuando algo no cuadra, se pregunta de nuevo antes de guardar. */
PANTALLAS.confirmarAviso = function (datos) {
  var cuerpo = [];
  cuerpo.push(el('div', 'aviso-agricola', '⚠️ ' + datos.aviso));
  cuerpo.push(el('div', 'frase', datos.def.frase(datos.valores)));
  cuerpo.push(boton('SÍ, GUARDAR IGUAL', function () {
    datos.valores._avisoVisto = true;
    guardarRegistro(datos.def, datos.valores);
  }, 'ancho'));
  cuerpo.push(boton('No, volver', function () { volver(); }, 'secundario'));
  return marco('Un momento', cuerpo);
};

/** ¿Este registro mueve el stock? Los tipos los dice la planilla. */
function mueveStock(registro) {
  if (registro.hoja === 'Movimientos' || registro.hoja === 'Recuentos') return true;
  if (registro.hoja === 'Sanidad') {
    var sinStock = (CAT && CAT.tipos_sanidad_sin_stock) || [];
    return sinStock.indexOf(registro.tipo) < 0;
  }
  return false;
}

/** Pantalla verde y vuelta sola al inicio. */
async function guardarRegistro(def, valores) {
  var registro = {id: uuid(), hoja: def.tipo, fecha: valores.fecha, nota: valores.nota || ''};
  delete valores._mm;
  delete valores._avisoVisto;
  def.campos.forEach(function (c) {
    if (valores[c] !== undefined && valores[c] !== null) registro[c] = valores[c];
  });
  if (def.conFoto && valores.foto) registro.foto = valores.foto;
  if (def.alGuardar) def.alGuardar(valores);

  RAIZ.innerHTML = '';
  var tapa = el('div', 'listo');
  tapa.appendChild(el('div', 'tic', '✓'));
  tapa.appendChild(el('p', null, 'LISTO, GUARDADO'));
  tapa.appendChild(el('small', null, navigator.onLine
    ? 'Se está mandando a la planilla' : 'Se manda cuando haya señal'));
  RAIZ.appendChild(tapa);

  // Si el registro mueve hacienda y hay señal, esperamos la respuesta de la
  // planilla para mostrar cómo quedó el potrero. Sin señal, como siempre.
  if (mueveStock(registro) && navigator.onLine) {
    await encolarGuardar(registro, true);
    try {
      await sincronizar(true);
    } catch (e) {}
    var estado = ESTADO_STOCK_POR_ID[registro.id];
    delete ESTADO_STOCK_POR_ID[registro.id];
    if (estado && estado.potreros && estado.potreros.length) {
      PILA = [{nombre: 'inicio', datos: {}}];
      ir('comoQuedo', {estado: estado});
      return;
    }
  } else {
    await encolarGuardar(registro);
  }
  setTimeout(alInicio, 1300);
}

/** Cómo quedó el potrero después de guardar, con los datos de la planilla. */
PANTALLAS.comoQuedo = function (datos) {
  var estado = datos.estado || {potreros: [], revisar: []};
  var hayQueRevisar = (estado.revisar || []).length > 0;
  var cuerpo = [];

  cuerpo.push(el('div', 'estado ok', '✓ Guardado'));

  (estado.revisar || []).forEach(function (t) {
    cuerpo.push(el('div', 'falta', 'Revisar: ' + t));
  });

  estado.potreros.forEach(function (p) {
    var grupo = el('div', 'grupo-potrero');
    grupo.appendChild(el('h3', null, p.potrero));
    var datosP = datosPotrero(p.potrero);
    if (datosP && datosP.hectareas) {
      grupo.appendChild(el('div', 'sub', numeroLindo(datosP.hectareas) + ' ha'));
    }
    if (!p.grupos.length) {
      grupo.appendChild(el('div', 'sub', 'Quedó sin hacienda'));
    }
    p.grupos.forEach(function (g) {
      var linea = el('div', 'linea');
      linea.appendChild(el('span', null, g.categoria + ' · ' + g.dueno));
      var b = el('b', null, String(g.cabezas));
      if (g.cabezas < 0) b.style.color = '#b71c1c';
      linea.appendChild(b);
      grupo.appendChild(linea);
    });
    cuerpo.push(grupo);
  });

  cuerpo.push(boton('LISTO', alInicio, 'ancho'));

  // Si no hay nada raro, vuelve sola: no le agregamos un toque a cada carga.
  if (!hayQueRevisar) {
    setTimeout(function () {
      var actual = PILA[PILA.length - 1];
      if (actual && actual.nombre === 'comoQuedo') alInicio();
    }, 8000);
  }
  return marco('Cómo quedó', cuerpo, {alVolver: alInicio});
};

// ===========================================================================
// 12. Los seis formularios
// ===========================================================================

function catCategorias() { return (CAT && CAT.categorias) ? CAT.categorias : []; }
function catDuenos() { return (CAT && CAT.duenos) ? CAT.duenos : []; }

/** "Vaca" → "vacas", "Ternero macho" → "terneros machos", "Vaca CUT" → "vacas CUT". */
function pluralizar(texto, cantidad) {
  if (cantidad === 1) return texto.toLowerCase();
  return texto.split(' ').map(function (p) {
    if (p === p.toUpperCase() && p.length <= 4) return p;   // CUT queda igual
    var b = p.toLowerCase();
    if (/[aeiouáéíóú]$/.test(b)) return b + 's';
    if (/[zZ]$/.test(b)) return b.slice(0, -1) + 'ces';
    return b + 'es';
  }).join(' ');
}

function cabezasEnPalabras(v) {
  return v.cabezas + ' ' + pluralizar(v.categoria || '', v.cabezas);
}

var PASO_CATEGORIA = {
  campo: 'categoria', tipo: 'opciones', pregunta: '¿Qué son?',
  opciones: catCategorias
};
var PASO_DUENO = {
  campo: 'dueno', tipo: 'opciones', pregunta: '¿De quién son?',
  opciones: catDuenos, recordar: 'ultimoDueno', conOtro: true, columnas: 1
};

function defMover() {
  return {
    tipo: 'Movimientos',
    titulo: 'Mover hacienda',
    campos: ['potrero_origen', 'potrero_destino', 'categoria', 'dueno', 'cabezas', 'motivo'],
    pasos: [
      {campo: 'potrero_origen', tipo: 'potrero', pregunta: '¿De dónde salen?',
        entrada: true, chip: function (v) { return 'de ' + v; }},
      {campo: 'potrero_destino', tipo: 'potrero', pregunta: '¿A dónde van?',
        salida: true, excluir: 'potrero_origen', chip: function (v) { return 'a ' + v; }},
      PASO_CATEGORIA,
      PASO_DUENO,
      {campo: 'cabezas', tipo: 'numero', pregunta: '¿Cuántas cabezas?',
        unidad: 'cabezas', chip: function (v) { return v + ' cabezas'; }}
    ],
    inline: [{
      campo: 'motivo', etiqueta: '¿Por qué se mueven?',
      opciones: function () { return (CAT && CAT.motivos) || []; },
      defecto: function (v) {
        if (v.potrero_origen === ENTRADA_CAMPO) return 'Entrada';
        if (v.potrero_destino === SALIDA_CAMPO) return 'Venta';
        return 'Rotación';
      }
    }],
    advertencia: function (v) {
      var p = datosPotrero(v.potrero_destino);
      if (p && p.uso === 'Agrícola') {
        return 'Ese potrero es de agricultura. ¿Seguro?';
      }
      return '';
    },
    frase: function (v) {
      var que = cabezasEnPalabras(v) + ' de ' + v.dueno;
      if (v.potrero_origen === ENTRADA_CAMPO) return 'Entran ' + que + ' al ' + v.potrero_destino;
      if (v.potrero_destino === SALIDA_CAMPO) return 'Salen ' + que + ' del ' + v.potrero_origen;
      return 'Pasan ' + que + ' del ' + v.potrero_origen + ' al ' + v.potrero_destino;
    },
    validar: function (v) {
      if (!v.potrero_origen) return 'Falta decir de dónde salen.';
      if (!v.potrero_destino) return 'Falta decir a dónde van.';
      if (!v.categoria) return 'Falta decir qué son.';
      if (!v.dueno) return 'Falta decir de quién son.';
      if (!v.cabezas) return 'Faltan las cabezas.';
      if (!v.motivo) return 'Falta decir por qué se mueven.';
      return '';
    },
    alGuardar: function (v) {
      PREFS.ultimoMovimiento = {
        potrero_origen: v.potrero_origen, potrero_destino: v.potrero_destino,
        categoria: v.categoria, dueno: v.dueno, cabezas: v.cabezas, motivo: v.motivo
      };
      guardarPrefs();
    }
  };
}

function defContar() {
  return {
    tipo: 'Recuentos',
    titulo: 'Contar hacienda',
    campos: ['potrero', 'categoria', 'dueno', 'cabezas'],
    pasos: [
      {campo: 'potrero', tipo: 'potrero', pregunta: '¿Qué potrero contaste?',
        chip: function (v) { return 'en ' + v; }},
      PASO_CATEGORIA,
      PASO_DUENO,
      {campo: 'cabezas', tipo: 'numero', pregunta: '¿Cuántas contaste?',
        unidad: 'cabezas', chip: function (v) { return v + ' cabezas'; }}
    ],
    frase: function (v) {
      return 'En el ' + v.potrero + ' hay ' + cabezasEnPalabras(v) + ' de ' + v.dueno;
    },
    aviso: function (v) {
      return 'Esto reemplaza lo que estaba anotado de ' +
        pluralizar(v.categoria, 2) + ' de ' + v.dueno + ' en el ' + v.potrero + '.';
    },
    validar: function (v) {
      if (!v.potrero) return 'Falta el potrero.';
      if (!v.categoria) return 'Falta decir qué son.';
      if (!v.dueno) return 'Falta decir de quién son.';
      if (v.cabezas === undefined || v.cabezas === null) return 'Faltan las cabezas.';
      return '';
    }
  };
}

function defPesada() {
  return {
    tipo: 'Pesadas',
    titulo: 'Pesada',
    campos: ['potrero', 'categoria', 'dueno', 'cabezas_pesadas', 'kg_modo',
      'kg_cargados', 'momento'],
    conFoto: true,
    pasos: [
      {campo: 'potrero', tipo: 'potrero', pregunta: '¿De qué potrero son?',
        chip: function (v) { return 'del ' + v; }},
      PASO_CATEGORIA,
      PASO_DUENO,
      {campo: 'cabezas_pesadas', tipo: 'numero', pregunta: '¿Cuántas pesaste?',
        unidad: 'cabezas', chip: function (v) { return v + ' pesadas'; }},
      {campo: 'kg_modo', tipo: 'opciones', pregunta: '¿Qué kilos vas a poner?',
        columnas: 1,
        opciones: [
          {valor: 'total', texto: 'Los kilos de todas juntas'},
          {valor: 'promedio', texto: 'Los kilos de cada una'}
        ],
        chip: function (v) { return v === 'total' ? 'kilos totales' : 'kilos de cada una'; }},
      {campo: 'kg_cargados', tipo: 'numero', decimales: true, unidad: 'kg',
        pregunta: '¿Cuántos kilos?',
        chip: function (v) { return numeroLindo(v) + ' kg'; }},
      {campo: 'momento', tipo: 'opciones', pregunta: '¿Qué pesada es?', columnas: 1,
        opciones: ['Entrada', 'Salida', 'Control']}
    ],
    frase: function (v) {
      var total = v.kg_modo === 'promedio'
        ? Math.round(v.kg_cargados * v.cabezas_pesadas) : v.kg_cargados;
      var prom = v.kg_modo === 'promedio'
        ? v.kg_cargados : Math.round(v.kg_cargados / v.cabezas_pesadas);
      return 'Pesada de ' + v.cabezas_pesadas + ' ' +
        pluralizar(v.categoria, v.cabezas_pesadas) + ' de ' + v.dueno +
        ' en el ' + v.potrero + ': ' + numeroLindo(total) + ' kg en total, ' +
        numeroLindo(prom) + ' kg cada una';
    },
    validar: function (v) {
      if (!v.potrero) return 'Falta el potrero.';
      if (!v.categoria) return 'Falta decir qué son.';
      if (!v.dueno) return 'Falta decir de quién son.';
      if (!v.cabezas_pesadas) return 'Faltan las cabezas pesadas.';
      if (!v.kg_modo) return 'Falta decir si son los kilos de todas o de cada una.';
      if (!v.kg_cargados) return 'Faltan los kilos.';
      if (!v.momento) return 'Falta decir si es entrada, salida o control.';
      return '';
    }
  };
}

function defSanidad() {
  return {
    tipo: 'Sanidad',      // el nombre de la hoja no cambia
    titulo: 'Manejo',
    campos: ['potrero', 'tipo', 'categoria', 'categoria_destino', 'dueno',
      'cabezas', 'causa_producto'],
    conFoto: true,
    textoCorto: {
      campo: 'causa_producto',
      etiqueta: function (v) {
        if (v.tipo === 'Inseminación' || v.tipo === 'Tacto') {
          return 'Detalle (toro / pajuela / resultado)';
        }
        return 'Causa o producto (si querés)';
      },
      ejemplo: function (v) {
        if (v.tipo === 'Inseminación') return 'toro, pajuela...';
        if (v.tipo === 'Tacto') return 'resultado del tacto...';
        return 'empaste, aftosa, mancha...';
      }
    },
    pasos: [
      {campo: 'tipo', tipo: 'opciones', pregunta: '¿Qué pasó?', columnas: 1,
        opciones: function () { return (CAT && CAT.tipos_sanidad) || []; }},
      {campo: 'potrero', tipo: 'potrero', pregunta: '¿En qué potrero?',
        chip: function (v) { return 'en ' + v; }},
      PASO_CATEGORIA,
      {campo: 'categoria_destino', tipo: 'opciones', pregunta: '¿A qué categoría pasan?',
        opciones: function (v) {
          return catCategorias().filter(function (c) { return c !== v.categoria; });
        },
        si: function (v) { return v.tipo === 'Cambio de categoría'; },
        chip: function (v) { return 'pasan a ' + v; }},
      PASO_DUENO,
      {campo: 'cabezas', tipo: 'numero', pregunta: '¿Cuántas cabezas?',
        unidad: 'cabezas', chip: function (v) { return v + ' cabezas'; }}
    ],
    frase: function (v) {
      var que = cabezasEnPalabras(v) + ' de ' + v.dueno;
      var donde = ' en el ' + v.potrero;
      if (v.tipo === 'Nacimiento') return 'Nacieron ' + que + donde;
      if (v.tipo === 'Muerte') return 'Murieron ' + que + donde;
      if (v.tipo === 'Enfermo') return 'Hay ' + que + ' enfermas' + donde;
      if (v.tipo === 'Tratamiento') return 'Tratamiento a ' + que + donde;
      if (v.tipo === 'Vacunación') return 'Vacunación de ' + que + donde;
      if (v.tipo === 'Capada de terneros') return 'Se caparon ' + que + donde;
      if (v.tipo === 'Inseminación') return 'Se inseminaron ' + que + donde;
      if (v.tipo === 'Tacto') return 'Se tactaron ' + que + donde;
      if (v.tipo === 'Servicio con toro') return 'Servicio con toro a ' + que + donde;
      if (v.tipo === 'Cambio de categoría') {
        return que + donde + ' pasan a ' + (v.categoria_destino || '').toLowerCase();
      }
      return que + donde;
    },
    validar: function (v) {
      if (!v.tipo) return 'Falta decir qué pasó.';
      if (!v.potrero) return 'Falta el potrero.';
      if (!v.categoria) return 'Falta decir qué son.';
      if (v.tipo === 'Cambio de categoría' && !v.categoria_destino) {
        return 'Falta decir a qué categoría pasan.';
      }
      if (!v.dueno) return 'Falta decir de quién son.';
      if (!v.cabezas) return 'Faltan las cabezas.';
      return '';
    }
  };
}

function defRecorrida() {
  return {
    tipo: 'Recorridas',
    titulo: 'Recorrida',
    campos: ['potrero', 'agua', 'alambre', 'pasto'],
    conFoto: true,
    pasos: [
      {campo: 'potrero', tipo: 'potrero', pregunta: '¿Qué potrero recorriste?',
        chip: function (v) { return v; }}
    ],
    inline: [
      {campo: 'agua', etiqueta: '¿Cómo está el agua?',
        opciones: ['Bien', 'Poca', 'Sin agua'], defecto: 'Bien'},
      {campo: 'alambre', etiqueta: '¿Cómo está el alambre?',
        opciones: ['Bien', 'Roto'], defecto: 'Bien'},
      {campo: 'pasto', etiqueta: '¿Cómo está el pasto?',
        opciones: ['1 Poco', '2 Normal', '3 Mucho'], defecto: '2 Normal'}
    ],
    frase: function (v) { return 'Recorrida del ' + v.potrero; },
    validar: function (v) {
      if (!v.potrero) return 'Falta el potrero.';
      if (!v.agua) return 'Falta decir cómo está el agua.';
      if (!v.alambre) return 'Falta decir cómo está el alambre.';
      if (!v.pasto) return 'Falta decir cómo está el pasto.';
      return '';
    }
  };
}

function pantallaForm(crearDef) {
  return function (datos) {
    datos = datos || {};
    var def = crearDef();
    var valores = Object.assign({fecha: hoyISO()}, datos.valores || {});
    return PANTALLAS.form({
      def: def, valores: valores,
      paso: datos.repetir ? 999 : (datos.paso || 0)
    });
  };
}

PANTALLAS.mover = pantallaForm(defMover);
PANTALLAS.contar = pantallaForm(defContar);
PANTALLAS.pesada = pantallaForm(defPesada);
PANTALLAS.sanidad = pantallaForm(defSanidad);
PANTALLAS.recorrida = pantallaForm(defRecorrida);

// Lluvia va en una sola pantalla: es el registro de todos los días.
PANTALLAS.lluvia = function (datos) {
  datos = datos || {};
  var valores = Object.assign({
    fecha: hoyISO(),
    lugar: PREFS.ultimoLugarLluvia || 'Casa'
  }, datos.valores || {});
  var def = {
    tipo: 'Lluvias', titulo: 'Lluvia',
    campos: ['mm', 'lugar'],
    validar: function (v) {
      if (v.mm === undefined || v.mm === null) return 'Faltan los milímetros.';
      if (!v.lugar) return 'Falta decir de qué pluviómetro.';
      return '';
    }
  };

  function repintarme() { reemplazar('lluvia', {valores: valores}); }

  var extras = [];
  extras.push(el('p', 'lote', '¿Qué pluviómetro?'));
  var cont = el('div', 'opciones');
  ((CAT && CAT.lugares_lluvia) || ['Casa', 'Manga', 'Otro']).forEach(function (o) {
    var b = boton(o, function () {
      valores.lugar = o;
      PREFS.ultimoLugarLluvia = o;
      guardarPrefs();
      repintarme();
    });
    if (valores.lugar === o) b.className = 'elegido';
    cont.appendChild(b);
  });
  extras.push(cont);
  extras.push(el('p', 'lote', 'Nota (si querés)'));
  var nota = el('textarea');
  nota.rows = 2;
  nota.value = valores.nota || '';
  nota.placeholder = 'No hace falta escribir nada';
  nota.addEventListener('input', function () { valores.nota = nota.value; });
  extras.push(nota);

  var cuerpo = [];
  if (valores._falta) cuerpo.push(el('div', 'falta', valores._falta));
  cuerpo.push(chipFecha(valores, repintarme));
  cuerpo.push(tecladoNumerico({
    unidad: 'mm', decimales: true, textoListo: 'GUARDAR',
    inicial: valores._mm !== undefined ? valores._mm : valores.mm,
    alCambiar: function (t) { valores._mm = t; },
    extras: extras,
    alListo: function (mm) {
      valores.mm = mm;
      var falta = def.validar(valores);
      if (falta) { valores._falta = falta; return repintarme(); }
      guardarRegistro(def, valores);
    }
  }));
  return marco('Lluvia', cuerpo);
};

var PANTALLA_DE_TIPO = {
  'Lluvias': 'lluvia', 'Movimientos': 'mover', 'Recuentos': 'contar',
  'Pesadas': 'pesada', 'Sanidad': 'sanidad', 'Recorridas': 'recorrida'
};

// ===========================================================================
// 13. Hacienda hoy
// ===========================================================================

function guardarCache(clave, datos) {
  try {
    localStorage.setItem(clave, JSON.stringify({cuando: ahoraISO(), datos: datos}));
  } catch (e) {}
}

function leerCache(clave) {
  try { return JSON.parse(localStorage.getItem(clave) || 'null'); } catch (e) { return null; }
}

/**
 * Stock. Se entra por cliente, que es como se piensa la hacienda de terceros,
 * y con un toque se pasa a la vista por potrero, que es la que sirve para
 * salir a buscar los animales al campo. Los dos salen del mismo cálculo.
 */
PANTALLAS.stock = function (datos) {
  var vista = datos.vista || 'cliente';
  var cuerpo = [];
  var cont = el('div');
  var cache = leerCache('stock');

  var selector = el('div', 'opciones');
  [['cliente', 'Por cliente'], ['potrero', 'Por potrero']].forEach(function (o) {
    var b = boton(o[1], function () { reemplazar('stock', {vista: o[0]}); });
    if (vista === o[0]) b.className = 'elegido';
    selector.appendChild(b);
  });
  cuerpo.push(selector);
  cuerpo.push(cont);

  function pintarTodo(lista, cuando, enVivo) {
    cont.innerHTML = '';
    if (!enVivo) {
      cont.appendChild(el('div', 'estado espera', cuando
        ? 'Sin señal. Esto es de ' + fechaEnPalabras(cuando.slice(0, 10)) +
          ' a las ' + cuando.slice(11, 16)
        : 'Sin señal y todavía no bajé los datos'));
    }
    if (!lista || !lista.length) {
      cont.appendChild(el('p', 'vacio-aviso', 'Todavía no hay hacienda anotada.'));
      return;
    }
    if (vista === 'cliente') pintarPorCliente(lista);
    else pintarPorPotrero(lista);

    var total = lista.reduce(function (a, s) { return a + s.cabezas; }, 0);
    cont.appendChild(el('div', 'total', 'Total en el campo: ' + total + ' cabezas'));
    avisarNegativos(lista);
    if (vista === 'cliente') {
      cont.appendChild(boton('Ver la libreta de otro cliente',
        function () { ir('libretas'); }, 'secundario'));
    }
  }

  function pintarPorCliente(lista) {
    var porDueno = {};
    var orden = [];
    lista.forEach(function (s) {
      if (!porDueno[s.dueno]) { porDueno[s.dueno] = []; orden.push(s.dueno); }
      porDueno[s.dueno].push(s);
    });
    orden.sort();
    orden.forEach(function (dueno) {
      var filas = porDueno[dueno];
      var total = filas.reduce(function (a, s) { return a + s.cabezas; }, 0);

      var tarjeta = el('div', 'grupo-potrero');
      var cab = el('div', 'linea');
      cab.style.borderTop = 'none';
      cab.style.marginTop = '0';
      cab.style.paddingTop = '0';
      cab.appendChild(el('h3', null, dueno));
      cab.appendChild(el('b', null, total + ' cab.'));
      tarjeta.appendChild(cab);

      var porCategoria = {};
      filas.forEach(function (s) {
        porCategoria[s.categoria] = (porCategoria[s.categoria] || 0) + s.cabezas;
      });
      Object.keys(porCategoria).sort().forEach(function (cat) {
        var linea = el('div', 'linea');
        linea.appendChild(el('span', null, cat));
        linea.appendChild(el('b', null, String(porCategoria[cat])));
        tarjeta.appendChild(linea);
      });

      tarjeta.appendChild(boton('Ver dónde está y la libreta',
        function () { ir('cliente', {dueno: dueno}); }, 'secundario'));
      cont.appendChild(tarjeta);
    });
  }

  function pintarPorPotrero(lista) {
    var porPotrero = {};
    var orden = [];
    lista.forEach(function (s) {
      if (!porPotrero[s.potrero]) { porPotrero[s.potrero] = []; orden.push(s.potrero); }
      porPotrero[s.potrero].push(s);
    });
    orden.forEach(function (potrero) {
      var grupo = el('div', 'grupo-potrero');
      var p = datosPotrero(potrero);
      grupo.appendChild(el('h3', null, potrero));
      var sub = [];
      if (p && p.hectareas) sub.push(numeroLindo(p.hectareas) + ' ha');
      if (p && p.uso) sub.push(p.uso);
      var dias = porPotrero[potrero][0].dias;
      if (dias !== '' && dias !== undefined && dias !== null) {
        sub.push(dias + (dias === 1 ? ' día' : ' días'));
      }
      if (sub.length) grupo.appendChild(el('div', 'sub', sub.join(' · ')));
      porPotrero[potrero].forEach(function (s) {
        var linea = el('div', 'linea');
        linea.appendChild(el('span', null, s.categoria + ' · ' + s.dueno));
        linea.appendChild(el('b', null, String(s.cabezas)));
        grupo.appendChild(linea);
      });
      cont.appendChild(grupo);
    });
  }

  function avisarNegativos(lista) {
    var enRojo = lista.filter(function (s) { return s.cabezas < 0; });
    if (!enRojo.length) return;
    cont.appendChild(el('div', 'falta',
      'Hay potreros con número negativo (' +
      enRojo.map(function (s) { return s.potrero; }).join(', ') +
      '). Quiere decir que se sacó hacienda de ahí sin haberla contado antes. ' +
      'Contá ese potrero con el botón Contar y se arregla.'));
  }

  pintarTodo(cache ? cache.datos : null, cache ? cache.cuando : null, false);

  if (navigator.onLine) {
    cont.innerHTML = '';
    cont.appendChild(el('p', 'vacio-aviso', 'Buscando los datos…'));
    apiGet('stock').then(function (r) {
      if (!r.ok) throw new Error(r.error || 'error');
      guardarCache('stock', r.stock);
      pintarTodo(r.stock, ahoraISO(), true);
    }).catch(function () {
      pintarTodo(cache ? cache.datos : null, cache ? cache.cuando : null, false);
    });
  }
  return marco('Stock', cuerpo);
};

/** Un cliente: cuánto tiene de cada categoría y en qué potrero está. */
PANTALLAS.cliente = function (datos) {
  var cuerpo = [];
  var cache = leerCache('stock');
  var lista = (cache && cache.datos ? cache.datos : [])
    .filter(function (s) { return s.dueno === datos.dueno; });

  if (!lista.length) {
    cuerpo.push(el('p', 'vacio-aviso',
      'Este cliente no tiene hacienda anotada en el campo.'));
  } else {
    var total = lista.reduce(function (a, s) { return a + s.cabezas; }, 0);
    cuerpo.push(el('div', 'total', 'Tiene ' + total + ' cabezas en el campo'));

    var porCategoria = {};
    var orden = [];
    lista.forEach(function (s) {
      if (!porCategoria[s.categoria]) { porCategoria[s.categoria] = []; orden.push(s.categoria); }
      porCategoria[s.categoria].push(s);
    });
    orden.sort();
    orden.forEach(function (cat) {
      var filas = porCategoria[cat];
      var suma = filas.reduce(function (a, s) { return a + s.cabezas; }, 0);
      var tarjeta = el('div', 'grupo-potrero');
      var cab = el('div', 'linea');
      cab.style.borderTop = 'none';
      cab.style.marginTop = '0';
      cab.style.paddingTop = '0';
      cab.appendChild(el('h3', null, cat));
      cab.appendChild(el('b', null, suma + ' cab.'));
      tarjeta.appendChild(cab);
      filas.forEach(function (s) {
        var linea = el('div', 'linea');
        var donde = s.potrero;
        var p = datosPotrero(s.potrero);
        if (p && p.hectareas) donde += ' · ' + numeroLindo(p.hectareas) + ' ha';
        if (s.dias !== '' && s.dias !== undefined && s.dias !== null) {
          donde += ' · hace ' + s.dias + (s.dias === 1 ? ' día' : ' días');
        }
        linea.appendChild(el('span', null, donde));
        linea.appendChild(el('b', null, String(s.cabezas)));
        tarjeta.appendChild(linea);
      });
      cuerpo.push(tarjeta);
    });
  }

  cuerpo.push(boton('Ver la libreta de ' + datos.dueno,
    function () { ir('libreta', {dueno: datos.dueno}); }, 'ancho'));
  return marco(datos.dueno, cuerpo);
};

// ===========================================================================
// 14. Libretas por cliente
// ===========================================================================

PANTALLAS.libretas = function () {
  var cuerpo = [el('p', 'pregunta', '¿De qué cliente?')];
  cuerpo.push(el('p', null,
    'Están todos, incluso los que hoy no tienen hacienda en el campo.'));
  var cont = el('div', 'opciones una');
  var lista = catDuenos();
  var cache = leerCache('libretaDuenos');
  if (cache && cache.datos) {
    cache.datos.forEach(function (d) {
      if (lista.indexOf(d) < 0) lista = lista.concat([d]);
    });
  }
  lista.forEach(function (d) {
    cont.appendChild(boton(d, function () { ir('libreta', {dueno: d}); }));
  });
  cuerpo.push(cont);
  if (!lista.length) {
    cuerpo.push(el('p', 'vacio-aviso', 'Todavía no hay clientes cargados.'));
  }
  return marco('Libretas', cuerpo);
};

PANTALLAS.libreta = function (datos) {
  var cuerpo = [];
  var cont = el('div');
  var claveCache = 'libreta:' + datos.dueno;
  var cache = leerCache(claveCache);

  function pintarLibreta(filas, cuando, enVivo) {
    cont.innerHTML = '';
    if (!enVivo) {
      cont.appendChild(el('div', 'estado espera', cuando
        ? 'Sin señal. Esto es de ' + fechaEnPalabras(cuando.slice(0, 10))
        : 'Sin señal y todavía no bajé esta libreta'));
    }
    if (!filas || !filas.length) {
      cont.appendChild(el('p', 'vacio-aviso', 'Esta libreta todavía está vacía.'));
      return;
    }
    // Lo último arriba, que es lo que se mira.
    var porCategoria = {};
    filas.forEach(function (f) {
      if (!porCategoria[f.categoria]) porCategoria[f.categoria] = [];
      porCategoria[f.categoria].push(f);
    });
    Object.keys(porCategoria).forEach(function (cat) {
      var grupo = porCategoria[cat];
      var ultimo = grupo[grupo.length - 1];
      cont.appendChild(el('p', 'lote', cat + ' — hoy: ' + ultimo.stock + ' cabezas'));
      var caja = el('div', 'scroll-x');
      var t = el('table', 'libreta');
      var thead = el('tr');
      ['Fecha', 'Ingreso', 'Egreso', 'Muertes', 'Stock', 'Potrero', 'Comentario']
        .forEach(function (h, i) {
          var th = el('th', (i === 0 || i >= 5) ? 'izq' : null, h);
          thead.appendChild(th);
        });
      t.appendChild(thead);
      grupo.slice().reverse().forEach(function (f) {
        var tr = el('tr', /recuento/i.test(f.comentario || '') ? 'ajuste' : null);
        tr.appendChild(el('td', 'izq', fechaEnPalabras(f.fecha, true)));
        tr.appendChild(el('td', null, f.ingreso || ''));
        tr.appendChild(el('td', null, f.egreso || ''));
        tr.appendChild(el('td', null, f.muertes || ''));
        tr.appendChild(el('td', null, String(f.stock)));
        tr.appendChild(el('td', 'izq', f.potrero || ''));
        tr.appendChild(el('td', 'izq', f.comentario || ''));
        t.appendChild(tr);
      });
      caja.appendChild(t);
      cont.appendChild(caja);
    });
  }

  cuerpo.push(cont);
  pintarLibreta(cache ? cache.datos : null, cache ? cache.cuando : null, false);

  if (navigator.onLine) {
    cont.innerHTML = '';
    cont.appendChild(el('p', 'vacio-aviso', 'Buscando la libreta…'));
    apiGet('libreta', {dueno: datos.dueno}).then(function (r) {
      if (!r.ok) throw new Error(r.error || 'error');
      guardarCache(claveCache, r.filas);
      if (r.duenos) guardarCache('libretaDuenos', r.duenos);
      pintarLibreta(r.filas, ahoraISO(), true);
    }).catch(function () {
      pintarLibreta(cache ? cache.datos : null, cache ? cache.cuando : null, false);
    });
  }
  return marco(datos.dueno, cuerpo);
};

// ===========================================================================
// 15. Mis últimos registros
// ===========================================================================

/** Una línea en castellano que describe el registro. */
function resumenRegistro(tipo, r) {
  if (tipo === 'Lluvias') {
    return numeroLindo(r.mm) + ' mm en ' + (r.lugar || '').toLowerCase();
  }
  if (tipo === 'Movimientos') {
    if (r.potrero_origen === ENTRADA_CAMPO) {
      return 'Entraron ' + r.cabezas + ' ' + pluralizar(r.categoria, r.cabezas) +
        ' de ' + r.dueno + ' al ' + r.potrero_destino;
    }
    if (r.potrero_destino === SALIDA_CAMPO) {
      return 'Salieron ' + r.cabezas + ' ' + pluralizar(r.categoria, r.cabezas) +
        ' de ' + r.dueno + ' del ' + r.potrero_origen;
    }
    return r.cabezas + ' ' + pluralizar(r.categoria, r.cabezas) + ' de ' + r.dueno +
      ': ' + r.potrero_origen + ' → ' + r.potrero_destino;
  }
  if (tipo === 'Recuentos') {
    return 'Conté ' + r.cabezas + ' ' + pluralizar(r.categoria, r.cabezas) +
      ' de ' + r.dueno + ' en el ' + r.potrero;
  }
  if (tipo === 'Pesadas') {
    return 'Pesada de ' + r.cabezas_pesadas + ' ' +
      pluralizar(r.categoria, r.cabezas_pesadas) + ' en el ' + r.potrero +
      ' (' + numeroLindo(r.kg_cargados) + ' kg ' +
      (r.kg_modo === 'promedio' ? 'cada una' : 'en total') + ')';
  }
  if (tipo === 'Sanidad') {
    return r.tipo + ': ' + r.cabezas + ' ' + pluralizar(r.categoria, r.cabezas) +
      ' de ' + r.dueno + ' en el ' + r.potrero;
  }
  if (tipo === 'Recorridas') {
    return 'Recorrida del ' + r.potrero + ' — agua ' + r.agua +
      ', alambre ' + r.alambre + ', pasto ' + r.pasto;
  }
  return tipo;
}

async function listaDeRegistros() {
  var cola = await leerCola();
  var enviados = await leerEnviados();
  var items = [];
  cola.forEach(function (c) {
    if (c.op !== 'guardar') return;
    items.push({
      id: c.id, tipo: c.tipo, registro: c.registro,
      estado: c.error ? 'mal' : 'pendiente', mensaje: c.error,
      cuando: c.registro.cargado_en
    });
  });
  enviados.forEach(function (e) {
    items.push({
      id: e.id, tipo: e.tipo, registro: e.registro, estado: 'guardado',
      cuando: e.registro.cargado_en
    });
  });
  items.sort(function (a, b) { return (a.cuando < b.cuando) ? 1 : -1; });
  return items;
}

PANTALLAS.ultimos = function () {
  var cuerpo = [nodoEstado()];
  var cont = el('div');
  cont.appendChild(el('p', 'vacio-aviso', 'Buscando…'));
  cuerpo.push(cont);

  listaDeRegistros().then(function (items) {
    cont.innerHTML = '';
    if (!items.length) {
      cont.appendChild(el('p', 'vacio-aviso',
        'Todavía no cargaste nada en las últimas 24 horas.'));
      return;
    }
    cont.appendChild(el('p', null,
      'Lo de las últimas 24 horas. Se puede corregir o borrar.'));
    items.forEach(function (it) {
      var ficha = el('div', 'ficha' + (it.estado === 'guardado' ? '' : ' ' + it.estado));
      var cuando = (it.cuando || '').slice(11, 16);
      ficha.appendChild(el('div', 'cuando',
        fechaEnPalabras(it.registro.fecha) +
        (it.registro.persona ? ' · ' + it.registro.persona : '') +
        (cuando ? ' · ' + cuando : '') +
        (it.estado === 'pendiente' ? ' · esperando señal' : '') +
        (it.estado === 'mal' ? ' · ' + it.mensaje : '')));
      ficha.appendChild(el('div', 'que', resumenRegistro(it.tipo, it.registro)));
      var acciones = el('div', 'acciones');
      acciones.appendChild(boton('Corregir', function () {
        ir('corregir', {item: it});
      }));
      acciones.appendChild(boton('Borrar', function () {
        ir('borrar', {item: it});
      }));
      ficha.appendChild(acciones);
      cont.appendChild(ficha);
    });
  });
  return marco('Mis últimos registros', cuerpo);
};

PANTALLAS.borrar = function (datos) {
  var it = datos.item;
  var cuerpo = [];
  cuerpo.push(el('div', 'frase', resumenRegistro(it.tipo, it.registro)));
  cuerpo.push(el('p', 'pregunta', '¿Lo borro?'));
  cuerpo.push(boton('SÍ, BORRALO', async function () {
    await encolarBorrar(it.tipo, it.id);
    PILA.pop();
    reemplazar('ultimos', {});
  }, 'ancho'));
  cuerpo.push(boton('No, dejalo', function () { volver(); }, 'secundario'));
  return marco('Borrar', cuerpo);
};

/** Corregir = borrar el viejo y cargar uno nuevo con los datos a la vista. */
PANTALLAS.corregir = function (datos) {
  var it = datos.item;
  var cuerpo = [];
  cuerpo.push(el('div', 'frase', resumenRegistro(it.tipo, it.registro)));
  cuerpo.push(el('p', null,
    'Se borra este y cargás uno nuevo, con los datos ya puestos para cambiar lo que esté mal.'));
  cuerpo.push(boton('CORREGIR', async function () {
    await encolarBorrar(it.tipo, it.id);
    var valores = Object.assign({}, it.registro);
    delete valores.id;
    delete valores.hoja;
    delete valores.cargado_en;
    delete valores.foto;
    PILA = [{nombre: 'inicio', datos: {}}];
    ir(PANTALLA_DE_TIPO[it.tipo], {valores: valores, repetir: true});
  }, 'ancho'));
  cuerpo.push(boton('Dejar así', function () { volver(); }, 'secundario'));
  return marco('Corregir', cuerpo);
};

PANTALLAS.problemas = function () {
  var cuerpo = [];
  var cont = el('div');
  cuerpo.push(cont);
  leerCola().then(function (cola) {
    var malos = cola.filter(function (c) { return !!c.error; });
    cont.innerHTML = '';
    if (!malos.length) {
      cont.appendChild(el('p', 'vacio-aviso', 'No hay nada con problemas.'));
      return;
    }
    cont.appendChild(el('p', null, 'Esto no se pudo guardar en la planilla:'));
    malos.forEach(function (c) {
      var ficha = el('div', 'ficha mal');
      ficha.appendChild(el('div', 'cuando', c.error));
      ficha.appendChild(el('div', 'que', c.op === 'borrar'
        ? 'Borrar un registro' : resumenRegistro(c.tipo, c.registro)));
      var acciones = el('div', 'acciones');
      acciones.appendChild(boton('Probar de nuevo', async function () {
        c.error = '';
        await guardarEnCola(c);
        await contarCola();
        sincronizar(true);
        reemplazar('problemas', {});
      }));
      acciones.appendChild(boton('Tirarlo', async function () {
        await sacarDeCola(c.id);
        await contarCola();
        reemplazar('problemas', {});
      }));
      ficha.appendChild(acciones);
      cont.appendChild(ficha);
    });
  });
  return marco('Registros con problema', cuerpo);
};

// ===========================================================================
// 17. Mapa del campo
// ===========================================================================

var GEO = null;                 // el plano: polígonos y linderos
var COLORES_CLIENTE = 12;       // cuántos colores distintos para los dueños
var CARGA_AMARILLA = 0.7;       // a partir de este porcentaje del tope, amarillo

/** Baja el plano una sola vez. Queda cacheado por el service worker. */
async function cargarGeo() {
  if (GEO) return GEO;
  try {
    var r = await fetch('potreros-geo.json');
    GEO = await r.json();
  } catch (e) {
    GEO = null;
  }
  return GEO;
}

/**
 * Color de un potrero según cuántos días lleva descansando.
 * Devuelve el nombre del color, no el color: así se puede probar.
 */
function colorDescanso(fila, umbrales) {
  if (!fila) return 'sindatos';
  if (fila.ocupado === 'sí') return 'azul';
  var dias = fila.dias_descanso;
  if (dias === '' || dias === null || dias === undefined) return 'sindatos';
  if (dias < umbrales.dias_descanso_min) return 'rojo';
  if (dias <= umbrales.dias_descanso_listo) return 'amarillo';
  return 'verde';
}

/** Color de un potrero según la carga: equivalentes vaca por hectárea. */
function colorCarga(evPorHa, tope) {
  if (evPorHa === null || evPorHa === undefined || !tope) return 'sindatos';
  if (evPorHa <= 0) return 'sindatos';
  if (evPorHa > tope) return 'rojo';
  if (evPorHa > tope * CARGA_AMARILLA) return 'amarillo';
  return 'verde';
}

/** Equivalentes vaca por hectárea de un potrero. null si no se puede saber. */
function evPorHectarea(grupos, hectareas, coeficientes) {
  if (!hectareas || !grupos || !grupos.length) return null;
  var ev = grupos.reduce(function (a, g) {
    var coef = coeficientes[g.categoria];
    return a + g.cabezas * (coef === undefined ? 1 : coef);
  }, 0);
  if (ev <= 0) return null;
  return Math.round(ev / hectareas * 100) / 100;
}

/** Los datos del mapa, ordenados por potrero para dibujar rápido. */
function armarIndice(datos) {
  var ix = {potreros: {}, stock: {}, descanso: {}, duenos: []};
  (datos.potreros || []).forEach(function (p) { ix.potreros[p.id] = p; });
  (datos.descanso || []).forEach(function (d) { ix.descanso[d.potrero] = d; });
  (datos.stock || []).forEach(function (s) {
    if (!ix.stock[s.potrero]) ix.stock[s.potrero] = [];
    ix.stock[s.potrero].push(s);
    if (ix.duenos.indexOf(s.dueno) < 0) ix.duenos.push(s.dueno);
  });
  ix.duenos.sort();
  return ix;
}

/** Qué tipo de dibujo le toca a cada polígono del plano. */
function claseDePotrero(geo, ix) {
  var p = ix.potreros[geo.id];
  if (p && p.activo === false) return 'oculto';
  var instalacion = geo.car && geo.car !== 'Pastoreo';
  if (instalacion) return 'instalacion';
  if (p && p.uso === 'Instalaciones') return 'instalacion';
  if (p && p.uso === 'Agrícola') return 'agricola';
  if (!p) return 'sinlista';
  return 'potrero';
}

PANTALLAS.mapa = function (datos) {
  var modo = datos.modo || 'descanso';
  var cuerpo = [];
  var cont = el('div');

  var selector = el('div', 'modos');
  [['descanso', 'Descanso'], ['carga', 'Carga'], ['clientes', 'Clientes']]
    .forEach(function (o) {
      var b = boton(o[1], function () { reemplazar('mapa', {modo: o[0]}); });
      if (modo === o[0]) b.className = 'elegido';
      selector.appendChild(b);
    });

  var cache = leerCache('mapa');
  cuerpo.push(cont);

  function pintarTodo(d, cuando, enVivo) {
    cont.innerHTML = '';
    if (!d) {
      cont.appendChild(el('p', 'vacio-aviso',
        'Sin señal y todavía no bajé el mapa. Buscá un lugar con señal.'));
      return;
    }
    var ix = armarIndice(d);

    cont.appendChild(franjaDelCampo(d, ix));
    cont.appendChild(selector);
    if (!enVivo) {
      cont.appendChild(el('div', 'estado espera', 'Datos del ' +
        (cuando ? fechaEnPalabras(cuando.slice(0, 10), true) + ' ' +
          cuando.slice(11, 16) : 'último rato')));
    }
    cont.appendChild(dibujarMapa(d, ix, modo));
    cont.appendChild(leyendaDe(modo, d, ix));

    if (d.fuera_de_lista && d.fuera_de_lista.length) {
      cont.appendChild(el('p', 'pie', 'Con hacienda pero sin dibujo en el plano: ' +
        d.fuera_de_lista.join(', ') + '.'));
    }
  }

  pintarTodo(cache ? cache.datos : null, cache ? cache.cuando : null, false);

  cargarGeo().then(function () {
    if (!navigator.onLine) {
      pintarTodo(cache ? cache.datos : null, cache ? cache.cuando : null, false);
      return;
    }
    cont.innerHTML = '';
    cont.appendChild(el('p', 'vacio-aviso', 'Buscando el mapa…'));
    return apiGet('mapa').then(function (r) {
      if (!r.ok) throw new Error(r.error || 'error');
      guardarCache('mapa', r);
      pintarTodo(r, ahoraISO(), true);
    }).catch(function () {
      pintarTodo(cache ? cache.datos : null, cache ? cache.cuando : null, false);
    });
  });

  return marco('Mapa', cuerpo);
};

/** La franja de arriba: lo que hay que saber de un vistazo. */
function franjaDelCampo(d, ix) {
  var franja = el('div', 'franja');

  var total = (d.stock || []).reduce(function (a, s) { return a + s.cabezas; }, 0);
  var listos = (d.descanso || []).filter(function (f) {
    var p = ix.potreros[f.potrero];
    if (!p || p.activo === false || p.uso === 'Agrícola' ||
        p.uso === 'Instalaciones') return false;
    return colorDescanso(f, d.umbrales) === 'verde';
  }).length;
  var conProblema = Object.keys(d.recorridas || {}).filter(function (k) {
    return d.recorridas[k].problema && ix.potreros[k] &&
      ix.potreros[k].activo !== false;
  });

  function dato(valor, texto, clase) {
    var c = el('div', 'dato' + (clase ? ' ' + clase : ''));
    c.appendChild(el('b', null, String(valor)));
    c.appendChild(el('span', null, texto));
    return c;
  }

  franja.appendChild(dato(total, 'cabezas en el campo'));
  franja.appendChild(dato(numeroLindo(d.lluvia_7_dias || 0) + ' mm',
    'llovió en 7 días'));
  franja.appendChild(dato(listos, 'potreros listos para entrar',
    listos > 0 ? 'ok' : ''));
  franja.appendChild(dato(conProblema.length,
    conProblema.length ? 'con problema: ' + conProblema.join(', ')
      : 'potreros con problema',
    conProblema.length ? 'mal' : ''));
  return franja;
}

/** El plano en sí. */
function dibujarMapa(d, ix, modo) {
  var caja = el('div', 'mapa-caja');
  if (!GEO) {
    caja.appendChild(el('p', 'vacio-aviso', 'No pude bajar el plano.'));
    return caja;
  }

  var NS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', GEO.viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  // Rayado para los potreros de agricultura.
  var defs = document.createElementNS(NS, 'defs');
  defs.innerHTML = '<pattern id="rayado" width="10" height="10" ' +
    'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="10" height="10" fill="#dcdcd4"/>' +
    '<line x1="0" y1="0" x2="0" y2="10" stroke="#a9a9a0" stroke-width="4"/>' +
    '</pattern>';
  svg.appendChild(defs);

  var lienzo = document.createElementNS(NS, 'g');
  svg.appendChild(lienzo);

  (GEO.potreros || []).forEach(function (geo) {
    var clase = claseDePotrero(geo, ix);
    if (clase === 'oculto') return;
    dibujarPotrero(NS, lienzo, geo, clase, d, ix, modo);
  });

  dibujarLinderos(NS, lienzo, GEO);
  caja.appendChild(svg);

  var envoltorio = el('div');
  envoltorio.appendChild(caja);
  envoltorio.appendChild(hacerZoom(svg, lienzo));
  return envoltorio;
}

function centroDe(pts) {
  var x = 0, y = 0;
  pts.forEach(function (p) { x += p[0]; y += p[1]; });
  return [x / pts.length, y / pts.length];
}

function cajaDe(pts) {
  var xs = pts.map(function (p) { return p[0]; });
  var ys = pts.map(function (p) { return p[1]; });
  return {
    ancho: Math.max.apply(null, xs) - Math.min.apply(null, xs),
    alto: Math.max.apply(null, ys) - Math.min.apply(null, ys)
  };
}

function dibujarPotrero(NS, lienzo, geo, clase, d, ix, modo) {
  var p = ix.potreros[geo.id];
  var grupos = ix.stock[geo.id] || [];
  var cabezas = grupos.reduce(function (a, g) { return a + g.cabezas; }, 0);

  var poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('points', geo.pts.map(function (q) { return q.join(','); }).join(' '));
  poly.setAttribute('data-potrero', geo.id);
  poly.setAttribute('class', 'potrero ' + claseColor(clase, geo, d, ix, modo));
  if (clase === 'agricola') poly.setAttribute('fill', 'url(#rayado)');

  var descanso = ix.descanso[geo.id];
  if (clase === 'potrero' && descanso && descanso.ocupado === 'sí' &&
      descanso.dias_ocupado !== '' && descanso.dias_ocupado > d.umbrales.dias_ocupado_max) {
    poly.setAttribute('class', poly.getAttribute('class') + ' ocupado-de-mas');
  }

  if (clase !== 'instalacion') {
    poly.addEventListener('click', function () {
      ir('ficha', {potrero: geo.id});
    });
  }
  lienzo.appendChild(poly);

  if (clase === 'instalacion') return;

  var centro = centroDe(geo.pts);
  var caja = cajaDe(geo.pts);
  var etiqueta = geo.id;
  var tam = Math.min(caja.ancho / (etiqueta.length * 0.62), caja.alto * 0.5, 34);
  if (tam < 7) return;

  var claro = ['azul', 'rojo', 'verde'].indexOf(
    claseColor(clase, geo, d, ix, modo).replace('p-', '')) >= 0 ||
    /p-cliente/.test(claseColor(clase, geo, d, ix, modo));

  var t = document.createElementNS(NS, 'text');
  t.setAttribute('x', centro[0]);
  t.setAttribute('y', centro[1] + tam * 0.34);
  t.setAttribute('font-size', tam);
  t.setAttribute('class', 'etiqueta' + (claro ? ' clara' : ''));
  t.textContent = etiqueta;
  lienzo.appendChild(t);

  // En los grandes entra también la hacienda que tienen.
  if (clase === 'potrero' && cabezas > 0 && caja.alto > 46 && tam >= 14) {
    var t2 = document.createElementNS(NS, 'text');
    t2.setAttribute('x', centro[0]);
    t2.setAttribute('y', centro[1] + tam * 1.25);
    t2.setAttribute('font-size', tam * 0.62);
    t2.setAttribute('class', 'etiqueta-chica' + (claro ? ' clara' : ''));
    t2.setAttribute('fill', claro ? '#fff' : '#333');
    t2.textContent = cabezas + ' cab.';
    lienzo.appendChild(t2);
  }

  if (clase === 'agricola' && caja.alto > 58 && caja.ancho > 95 && tam >= 14) {
    var t3 = document.createElementNS(NS, 'text');
    t3.setAttribute('x', centro[0]);
    t3.setAttribute('y', centro[1] + tam * 1.2);
    t3.setAttribute('font-size', Math.min(tam * 0.5, 15));
    t3.setAttribute('class', 'etiqueta-chica');
    t3.setAttribute('fill', '#5f6368');
    t3.textContent = 'Agricultura: no entrar';
    lienzo.appendChild(t3);
    var quien = p && p.quien_lo_usa;
    if (quien && caja.alto > 80) {
      var t4 = document.createElementNS(NS, 'text');
      t4.setAttribute('x', centro[0]);
      t4.setAttribute('y', centro[1] + tam * 1.85);
      t4.setAttribute('font-size', Math.min(tam * 0.46, 14));
      t4.setAttribute('class', 'etiqueta-chica');
      t4.setAttribute('fill', '#5f6368');
      t4.textContent = quien;
      lienzo.appendChild(t4);
    }
  }
}

/** La clase CSS con el color que le toca al potrero en este modo. */
function claseColor(clase, geo, d, ix, modo) {
  if (clase === 'instalacion') return 'p-gris';
  if (clase === 'agricola') return 'p-gris';
  if (clase === 'sinlista') return 'p-sindatos';

  var grupos = ix.stock[geo.id] || [];
  if (modo === 'descanso') {
    return 'p-' + colorDescanso(ix.descanso[geo.id], d.umbrales);
  }
  if (modo === 'carga') {
    var p = ix.potreros[geo.id];
    var ev = evPorHectarea(grupos, p ? p.hectareas : 0, d.coeficientes || {});
    return 'p-' + colorCarga(ev, d.umbrales.tope_carga);
  }
  // Clientes: manda el dueño que más cabezas tiene en el potrero.
  if (!grupos.length) return 'p-sindatos';
  var porDueno = {};
  grupos.forEach(function (g) {
    porDueno[g.dueno] = (porDueno[g.dueno] || 0) + g.cabezas;
  });
  var mayor = Object.keys(porDueno).sort(function (a, b) {
    return porDueno[b] - porDueno[a];
  })[0];
  var i = ix.duenos.indexOf(mayor);
  return 'p-cliente-' + (i < 0 ? 0 : i % COLORES_CLIENTE);
}

function dibujarLinderos(NS, lienzo, geo) {
  var l = geo.linderos || {};
  var caja = geo.viewBox.split(/\s+/).map(Number);
  var x0 = caja[0], y0 = caja[1], ancho = caja[2], alto = caja[3];
  function texto(t, x, y, rotar) {
    if (!t) return;
    var e = document.createElementNS(NS, 'text');
    e.setAttribute('x', x);
    e.setAttribute('y', y);
    e.setAttribute('class', 'lindero');
    if (rotar) e.setAttribute('transform', 'rotate(' + rotar + ' ' + x + ' ' + y + ')');
    e.textContent = [].concat(t).join(' · ');
    lienzo.appendChild(e);
  }
  texto(l.norte, x0 + ancho / 2, y0 + 12);
  texto(l.sur, x0 + ancho / 2, y0 + alto - 4);
  texto(l.oeste, x0 + 10, y0 + alto / 2, -90);
  texto(l.este, x0 + ancho - 6, y0 + alto / 2, 90);
}

/** Zoom con dos dedos y arrastre con uno. */
function hacerZoom(svg, lienzo) {
  var escala = 1, dx = 0, dy = 0;
  var punteros = {};
  var distanciaInicial = 0, escalaInicial = 1;
  var movido = 0;

  function aplicar() {
    lienzo.setAttribute('transform',
      'translate(' + dx + ' ' + dy + ') scale(' + escala + ')');
  }

  svg.addEventListener('pointerdown', function (e) {
    punteros[e.pointerId] = {x: e.clientX, y: e.clientY};
    movido = 0;
    if (Object.keys(punteros).length === 2) {
      var p = Object.keys(punteros).map(function (k) { return punteros[k]; });
      distanciaInicial = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      escalaInicial = escala;
    }
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', function (e) {
    var anterior = punteros[e.pointerId];
    if (!anterior) return;
    var claves = Object.keys(punteros);
    if (claves.length === 1) {
      var mx = e.clientX - anterior.x, my = e.clientY - anterior.y;
      movido += Math.abs(mx) + Math.abs(my);
      var ancho = svg.clientWidth || 1;
      var caso = Number(svg.getAttribute('viewBox').split(/\s+/)[2]) / ancho;
      dx += mx * caso;
      dy += my * caso;
      aplicar();
    }
    punteros[e.pointerId] = {x: e.clientX, y: e.clientY};
    if (claves.length === 2 && distanciaInicial) {
      var p = claves.map(function (k) { return punteros[k]; });
      var ahora = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      escala = Math.min(8, Math.max(1, escalaInicial * (ahora / distanciaInicial)));
      movido += 20;
      aplicar();
    }
  });

  function soltar(e) {
    delete punteros[e.pointerId];
    if (Object.keys(punteros).length < 2) distanciaInicial = 0;
  }
  svg.addEventListener('pointerup', soltar);
  svg.addEventListener('pointercancel', soltar);
  // Un arrastre no tiene que abrir la ficha del potrero.
  svg.addEventListener('click', function (e) {
    if (movido > 12) { e.stopPropagation(); e.preventDefault(); }
  }, true);

  return boton('Ver todo el campo', function () {
    escala = 1; dx = 0; dy = 0;
    aplicar();
  }, 'secundario');
}

function leyendaDe(modo, d, ix) {
  var cont = el('div', 'leyenda');
  function item(color, texto) {
    var i = el('div', 'item');
    var c = el('span', 'cuadro');
    c.style.background = color;
    i.appendChild(c);
    i.appendChild(el('span', null, texto));
    cont.appendChild(i);
  }
  if (modo === 'descanso') {
    item('#e53935', 'Recién salió (menos de ' + d.umbrales.dias_descanso_min + ' días)');
    item('#f9a825', 'Descansando');
    item('#43a047', 'Listo para entrar (más de ' + d.umbrales.dias_descanso_listo + ')');
    item('#1e88e5', 'Con hacienda');
  } else if (modo === 'carga') {
    item('#43a047', 'Holgado');
    item('#f9a825', 'Cerca del tope');
    item('#e53935', 'Pasado de ' + numeroLindo(d.umbrales.tope_carga) + ' EV/ha');
    item('#eceff1', 'Vacío');
  } else {
    ix.duenos.forEach(function (dueno, i) {
      var muestra = el('div', 'item');
      var c = el('span', 'cuadro');
      c.className = 'cuadro p-cliente-' + (i % COLORES_CLIENTE);
      muestra.appendChild(c);
      muestra.appendChild(el('span', null, dueno));
      cont.appendChild(muestra);
    });
    if (!ix.duenos.length) item('#eceff1', 'Todavía no hay hacienda');
  }
  item('#cfd3cd', 'Agricultura e instalaciones');
  return cont;
}

/** La ficha de un potrero: todo lo que se sabe de él, en una pantalla. */
PANTALLAS.ficha = function (datos) {
  var cache = leerCache('mapa');
  var d = cache ? cache.datos : null;
  var id = datos.potrero;
  var cuerpo = [];

  if (!d) {
    cuerpo.push(el('p', 'vacio-aviso', 'Todavía no bajé los datos del mapa.'));
    return marco(id, cuerpo);
  }

  var ix = armarIndice(d);
  var p = ix.potreros[id];
  var grupos = ix.stock[id] || [];
  var descanso = ix.descanso[id];
  var cabezas = grupos.reduce(function (a, g) { return a + g.cabezas; }, 0);

  if (p && p.uso === 'Agrícola') {
    cuerpo.push(el('div', 'aviso-agricola', 'Reservado para agricultura' +
      (p.quien_lo_usa ? ' (' + p.quien_lo_usa + ')' : '') + '. No meter hacienda.'));
  }

  var ficha = el('div', 'grupo-potrero');
  if (p) {
    if (p.hectareas) ficha.appendChild(el('p', 'ficha-dato',
      numeroLindo(p.hectareas) + ' hectáreas'));
    if (p.uso) ficha.appendChild(el('p', 'ficha-dato', 'Uso: ' + p.uso));
    if (p.recurso) ficha.appendChild(el('p', 'ficha-dato', 'Recurso: ' + p.recurso));
    if (p.nota) ficha.appendChild(el('p', 'ficha-dato', p.nota));
  } else {
    ficha.appendChild(el('p', 'ficha-dato', 'Este potrero no está en la lista.'));
  }
  cuerpo.push(ficha);

  // --- hacienda ------------------------------------------------------------
  var haciendaCaja = el('div', 'grupo-potrero');
  haciendaCaja.appendChild(el('h3', null, 'Hacienda'));
  if (!grupos.length) {
    haciendaCaja.appendChild(el('div', 'sub', 'No tiene hacienda.'));
  } else {
    grupos.slice().sort(function (a, b) {
      return (a.dueno + a.categoria).localeCompare(b.dueno + b.categoria);
    }).forEach(function (g) {
      var linea = el('div', 'linea');
      var texto = g.categoria + ' · ' + g.dueno;
      if (g.dias !== '' && g.dias !== null && g.dias !== undefined) {
        texto += ' · hace ' + g.dias + (g.dias === 1 ? ' día' : ' días');
      }
      linea.appendChild(el('span', null, texto));
      linea.appendChild(el('b', null, String(g.cabezas)));
      haciendaCaja.appendChild(linea);
    });
    var ev = evPorHectarea(grupos, p ? p.hectareas : 0, d.coeficientes || {});
    var total = el('div', 'linea');
    total.appendChild(el('span', null, 'Total' +
      (ev ? ' · ' + numeroLindo(ev) + ' EV por hectárea' : '')));
    total.appendChild(el('b', null, String(cabezas)));
    haciendaCaja.appendChild(total);
  }
  cuerpo.push(haciendaCaja);

  // --- descanso ------------------------------------------------------------
  if (descanso) {
    var texto;
    if (descanso.ocupado === 'sí') {
      texto = descanso.dias_ocupado === ''
        ? 'Con hacienda.'
        : 'Ocupado hace ' + descanso.dias_ocupado +
          (descanso.dias_ocupado === 1 ? ' día.' : ' días.');
    } else if (descanso.dias_descanso === '') {
      texto = 'Vacío. Todavía no hay registro de cuándo salió la hacienda.';
    } else {
      texto = 'Descansando hace ' + descanso.dias_descanso +
        (descanso.dias_descanso === 1 ? ' día' : ' días') +
        (descanso.ultima_salida ? ' (salió el ' +
          fechaEnPalabras(descanso.ultima_salida, true) + ').' : '.');
    }
    cuerpo.push(el('div', 'total', texto));
  }

  // --- última recorrida y último manejo ------------------------------------
  var r = (d.recorridas || {})[id];
  if (r) {
    var caja = el('div', 'grupo-potrero' );
    caja.appendChild(el('h3', null, 'Última recorrida'));
    caja.appendChild(el('div', 'sub', fechaEnPalabras(r.fecha)));
    var linea = el('div', 'linea');
    linea.appendChild(el('span', null, 'Agua ' + r.agua + ' · alambre ' +
      r.alambre + ' · pasto ' + r.pasto));
    caja.appendChild(linea);
    if (r.problema) {
      caja.appendChild(el('div', 'falta', 'Revisar: ' +
        (r.agua !== 'Bien' ? 'agua ' + r.agua.toLowerCase() : '') +
        (r.agua !== 'Bien' && r.alambre !== 'Bien' ? ', ' : '') +
        (r.alambre !== 'Bien' ? 'alambre ' + r.alambre.toLowerCase() : '')));
    }
    if (r.nota) caja.appendChild(el('div', 'sub', r.nota));
    cuerpo.push(caja);
  }

  var m = (d.manejo || {})[id];
  if (m) {
    var cajaM = el('div', 'grupo-potrero');
    cajaM.appendChild(el('h3', null, 'Último manejo'));
    cajaM.appendChild(el('div', 'sub', fechaEnPalabras(m.fecha)));
    var lineaM = el('div', 'linea');
    lineaM.appendChild(el('span', null, m.tipo + ' · ' + m.categoria +
      ' · ' + m.dueno + (m.detalle ? ' · ' + m.detalle : '')));
    lineaM.appendChild(el('b', null, String(m.cabezas)));
    cajaM.appendChild(lineaM);
    cuerpo.push(cajaM);
  }

  // --- qué hacer desde acá --------------------------------------------------
  cuerpo.push(boton('Mover hacienda desde acá', function () {
    PILA = [{nombre: 'inicio', datos: {}}];
    ir('mover', {valores: {potrero_origen: id}, paso: 1});
  }, 'ancho'));
  cuerpo.push(boton('Contar este potrero', function () {
    PILA = [{nombre: 'inicio', datos: {}}];
    ir('contar', {valores: {potrero: id}, paso: 1});
  }, 'ancho'));

  return marco(id, cuerpo);
};

// ===========================================================================
// 16. Arranque
// ===========================================================================

/**
 * Baja las listas de potreros, dueños y categorías cada vez que se abre la
 * app con señal. Son unos pocos kilobytes y así un cambio hecho en la planilla
 * aparece en el teléfono la próxima vez que lo abren, sin esperar a mañana.
 * Si no hay señal queda la copia guardada.
 */
async function arrancarDatos() {
  await contarCola();
  pintarEstado();
  if (!navigator.onLine) return;
  try {
    var r = await apiGet('catalogos');
    if (r.ok) {
      var antes = JSON.stringify(CAT);
      guardarCatalogos(r.catalogos);
      var cambiaron = antes !== JSON.stringify(CAT);
      if (cambiaron && PILA.length && PILA[PILA.length - 1].nombre === 'inicio') {
        pintar();
      }
    }
  } catch (e) {}
  sincronizar();
}

async function arrancar() {
  cargarCfg();

  if (location.hash.indexOf('#a=') === 0) {
    try {
      var info = decodificarCodigo(location.hash);
      CFG.api = info.u;
      CFG.token = info.t;
      guardarCfg();
    } catch (e) {}
    // El código no queda a la vista ni en el historial.
    history.replaceState(null, '', location.pathname + location.search);
  }

  try {
    await abrirBD();
    await limpiarEnviados();
  } catch (e) {}

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  if (!CFG.api || !CFG.token) { PILA = [{nombre: 'activar', datos: {}}]; return pintar(); }
  if (!CFG.persona) { PILA = [{nombre: 'nombre', datos: {primera: true}}]; return pintar(); }

  PILA = [{nombre: 'inicio', datos: {}}];
  pintar();
  arrancarDatos();
}

arrancar();
