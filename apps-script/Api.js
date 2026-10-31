/**
 * API del Web App.
 *
 *   GET  ?accion=ping|catalogos|stock|libreta|ultimos&token=...
 *   POST body JSON {token, accion:"guardar"|"borrar"|"editar", ...}
 *
 * El token vive en Script Properties (clave TOKEN). El celular lo recibe una
 * sola vez, en el código de activación, y lo guarda. Nunca más se muestra.
 */

var PROP_TOKEN = 'TOKEN';
var PROP_TOKEN_CREADO = 'TOKEN_CREADO';

/**
 * Se corre una vez por ejecución, antes de escribir: si al código se le sumó
 * una columna y la planilla todavía no la tiene, la agrega sin perder nada.
 * Así una versión nueva del script no necesita que nadie apriete un botón.
 */
var HOJAS_REVISADAS = false;
function asegurarHojasAlDia_() {
  if (HOJAS_REVISADAS) return;
  HOJAS_REVISADAS = true;
  try {
    armarHojas_();
    ponerHojasAlDia_();
  } catch (e) {
    registrarLog_('no pude poner las hojas al día', '', '', 0, 0, 0,
      String(e && e.message ? e.message : e));
  }
}

function tokenGuardado_() {
  return PropertiesService.getScriptProperties().getProperty(PROP_TOKEN) || '';
}

function tokenValido_(recibido) {
  var esperado = tokenGuardado_();
  if (!esperado) return false;
  recibido = texto_(recibido);
  if (recibido.length !== esperado.length) return false;
  var dif = 0;
  for (var i = 0; i < esperado.length; i++) {
    dif |= (esperado.charCodeAt(i) ^ recibido.charCodeAt(i));
  }
  return dif === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function error_(mensaje, codigo) {
  return json_({ok: false, error: mensaje, codigo: codigo || 'error'});
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    var accion = texto_(p.accion) || 'ping';

    if (accion === 'ping' && !p.token) {
      return json_({ok: true, servicio: 'Registro Campo Los Juancitos'});
    }
    if (!tokenValido_(p.token)) {
      return error_('Código de activación no válido', 'token');
    }

    if (accion === 'ping') {
      return json_({ok: true, hoy: hoyISO_()});
    }
    if (accion === 'catalogos') {
      return json_({ok: true, hoy: hoyISO_(), catalogos: catalogos_()});
    }
    if (accion === 'stock') {
      var c = calcularTodo_();
      return json_({ok: true, hoy: hoyISO_(), stock: c.stock, resumen: c.resumen});
    }
    if (accion === 'libreta') {
      var dueno = texto_(p.dueno);
      var calc = calcularTodo_();
      return json_({
        ok: true,
        dueno: dueno,
        filas: dueno ? (calc.libretas[dueno] || []) : [],
        duenos: Object.keys(calc.libretas).sort()
      });
    }
    if (accion === 'ultimos') {
      return json_({ok: true, registros: ultimosRegistros_(texto_(p.dispositivo))});
    }
    return error_('Acción desconocida: ' + accion, 'accion');
  } catch (err) {
    return error_(String(err && err.message ? err.message : err), 'interno');
  }
}

function catalogos_() {
  var potreros = leerHoja_(HOJA.POTREROS)
    .filter(function (f) { return texto_(f.activo).toLowerCase() !== 'no'; })
    .map(function (f) {
      return {
        id: texto_(f.id),
        lote: texto_(f.lote),
        hectareas: aNumero_(f.hectareas),
        uso: texto_(f.uso)
      };
    });
  var duenos = leerHoja_(HOJA.DUENOS)
    .filter(function (f) { return texto_(f.activo).toLowerCase() !== 'no'; })
    .sort(function (a, b) { return aNumero_(a.orden) - aNumero_(b.orden); })
    .map(function (f) { return texto_(f.dueno); })
    .filter(function (d) { return d; });
  var categorias = leerHoja_(HOJA.CATEGORIAS)
    .filter(function (f) { return texto_(f.activo).toLowerCase() !== 'no'; })
    .sort(function (a, b) { return aNumero_(a.orden) - aNumero_(b.orden); })
    .map(function (f) { return texto_(f.categoria); })
    .filter(function (c) { return c; });

  return {
    potreros: potreros,
    duenos: duenos,
    categorias: categorias,
    tipos_sanidad: TIPOS_SANIDAD,
    motivos: MOTIVOS_MOVIMIENTO,
    lugares_lluvia: LUGARES_LLUVIA,
    entrada_campo: ENTRADA_CAMPO,
    salida_campo: SALIDA_CAMPO,
    dias_sin_registrar: Math.round(aNumero_(config_('dias_sin_registrar', '5')))
  };
}

/** Registros de las últimas 24 h, para "Mis últimos registros". */
function ultimosRegistros_(dispositivo) {
  var limite = new Date(new Date().getTime() - 24 * 3600 * 1000);
  var limiteTexto = Utilities.formatDate(limite, TZ, "yyyy-MM-dd'T'HH:mm:ss");
  var salida = [];
  Object.keys(ESQUEMA).forEach(function (nombre) {
    leerHoja_(nombre).forEach(function (f) {
      if (texto_(f.estado) === 'borrado') return;
      var sello = aSello_(f.cargado_en);
      if (!sello || sello < limiteTexto) return;
      if (dispositivo && texto_(f.dispositivo) !== dispositivo) return;
      var r = {hoja: nombre, id: texto_(f.id), fecha: aISO_(f.fecha), cargado_en: sello};
      ESQUEMA[nombre].forEach(function (col) {
        if (CONTROL.indexOf(col) < 0 && col !== 'id' && col !== 'fecha') {
          r[col] = (f[col] instanceof Date) ? aISO_(f[col]) : f[col];
        }
      });
      salida.push(r);
    });
  });
  salida.sort(function (a, b) { return a.cargado_en < b.cargado_en ? 1 : -1; });
  return salida.slice(0, 60);
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var cuerpo = {};
    try {
      cuerpo = JSON.parse(e.postData.contents);
    } catch (err) {
      return error_('No pude leer el pedido', 'cuerpo');
    }
    if (!tokenValido_(cuerpo.token)) {
      return error_('Código de activación no válido', 'token');
    }

    if (!lock.tryLock(30000)) {
      return error_('La planilla está ocupada, probá de nuevo', 'ocupado');
    }

    asegurarHojasAlDia_();

    var accion = texto_(cuerpo.accion) || 'guardar';
    var respuesta;
    if (accion === 'guardar') {
      respuesta = guardarRegistros_(cuerpo.registros || [],
        texto_(cuerpo.dispositivo), texto_(cuerpo.persona));
    } else if (accion === 'borrar') {
      respuesta = borrarRegistro_(texto_(cuerpo.hoja), texto_(cuerpo.id));
    } else if (accion === 'editar') {
      respuesta = editarRegistro_(texto_(cuerpo.hoja), texto_(cuerpo.id), cuerpo.campos || {});
    } else {
      return error_('Acción desconocida: ' + accion, 'accion');
    }

    if (respuesta.cambio) {
      try {
        escribirCalculos_(false);
      } catch (err) {
        respuesta.aviso = 'Guardado, pero el stock se recalcula más tarde';
      }
    }
    return json_(respuesta);
  } catch (err) {
    return error_(String(err && err.message ? err.message : err), 'interno');
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

/** Ids ya presentes en una hoja. */
function idsDeHoja_(nombre) {
  var h = hojaRegistro_(nombre);
  var ultima = h.getLastRow();
  var set = {};
  if (ultima < 2) return set;
  var ids = h.getRange(2, 1, ultima - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    var id = texto_(ids[i][0]);
    if (id) set[id] = i + 2;
  }
  return set;
}

/**
 * Guarda un lote de registros. Un id que ya está en la hoja se descarta:
 * reenviar el mismo registro nunca duplica.
 */
function guardarRegistros_(registros, dispositivo, persona) {
  var resultados = [];
  var porTipo = {};
  var repetidos = 0, guardados = 0;
  var avisar = [];

  registros.forEach(function (r) {
    // "hoja" es a qué hoja va el registro. No se llama "tipo" porque Sanidad
    // ya tiene una columna "tipo" (Nacimiento, Muerte, ...).
    var tipo = texto_(r.hoja);
    if (!ESQUEMA[tipo]) {
      resultados.push({id: texto_(r.id), estado: 'error', mensaje: 'Tipo desconocido: ' + tipo});
      return;
    }
    if (!porTipo[tipo]) porTipo[tipo] = [];
    porTipo[tipo].push(r);
  });

  Object.keys(porTipo).forEach(function (tipo) {
    var existentes = idsDeHoja_(tipo);
    var filas = [];
    porTipo[tipo].forEach(function (r) {
      var id = texto_(r.id);
      if (!id) {
        resultados.push({id: '', estado: 'error', mensaje: 'Falta el id'});
        return;
      }
      if (existentes[id]) {
        resultados.push({id: id, estado: 'repetido'});
        repetidos++;
        return;
      }
      var problema = validar_(tipo, r);
      if (problema) {
        resultados.push({id: id, estado: 'error', mensaje: problema});
        return;
      }
      var datos = normalizar_(tipo, r);
      if (r.foto) {
        try {
          datos.foto_url = guardarFoto_(r.foto, tipo, datos.fecha, id);
        } catch (err) {
          datos.foto_url = 'ERROR AL GUARDAR FOTO';
        }
      }
      datos.cargado_en = texto_(r.cargado_en) || ahoraISO_();
      datos.persona = texto_(r.persona) || persona;
      datos.dispositivo = texto_(r.dispositivo) || dispositivo;
      datos.origen_carga = texto_(r.origen_carga) || 'App';
      datos.estado = 'activo';
      filas.push(ESQUEMA[tipo].map(function (col) {
        var v = datos[col];
        return (v === undefined || v === null) ? '' : v;
      }));
      existentes[id] = true;
      resultados.push({id: id, estado: 'guardado'});
      avisar.push(Object.assign({hoja: tipo}, datos));
      guardados++;
    });
    if (filas.length) {
      var h = hojaRegistro_(tipo);
      h.getRange(h.getLastRow() + 1, 1, filas.length, ESQUEMA[tipo].length)
        .setValues(filas);
    }
  });

  registrarLog_('guardar', persona, dispositivo, registros.length, guardados,
    repetidos, '');
  avisarRegistros_(avisar, persona, dispositivo);
  return {ok: true, resultados: resultados, cambio: guardados > 0};
}

/** Marca un registro como borrado (no se borra la fila). */
function borrarRegistro_(tipo, id) {
  if (!ESQUEMA[tipo]) return {ok: false, error: 'Tipo desconocido'};
  var h = hojaRegistro_(tipo);
  var existentes = idsDeHoja_(tipo);
  var fila = existentes[id];
  if (!fila) return {ok: false, error: 'No encontré ese registro'};
  var col = ESQUEMA[tipo].indexOf('estado') + 1;
  h.getRange(fila, col).setValue('borrado');
  registrarLog_('borrar', '', '', 1, 1, 0, tipo + ' ' + id);
  return {ok: true, cambio: true};
}

/** Corrige campos de un registro ya guardado. */
function editarRegistro_(tipo, id, campos) {
  if (!ESQUEMA[tipo]) return {ok: false, error: 'Tipo desconocido'};
  var h = hojaRegistro_(tipo);
  var fila = idsDeHoja_(tipo)[id];
  if (!fila) return {ok: false, error: 'No encontré ese registro'};
  var enc = ESQUEMA[tipo];
  var actual = h.getRange(fila, 1, 1, enc.length).getValues()[0];
  var objeto = {};
  enc.forEach(function (c, i) { objeto[c] = actual[i]; });
  Object.keys(campos).forEach(function (c) {
    if (enc.indexOf(c) >= 0 && CONTROL.indexOf(c) < 0 && c !== 'id') {
      objeto[c] = campos[c];
    }
  });
  objeto.fecha = aISO_(objeto.fecha);
  var problema = validar_(tipo, objeto);
  if (problema) return {ok: false, error: problema};
  var normalizado = normalizar_(tipo, objeto);
  enc.forEach(function (c) {
    if (CONTROL.indexOf(c) < 0 && normalizado[c] !== undefined) objeto[c] = normalizado[c];
  });
  h.getRange(fila, 1, 1, enc.length)
    .setValues([enc.map(function (c) {
      return (objeto[c] === undefined || objeto[c] === null) ? '' : objeto[c];
    })]);
  registrarLog_('editar', '', '', 1, 1, 0, tipo + ' ' + id);
  return {ok: true, cambio: true};
}

// ---------------------------------------------------------------------------
// Validación y normalización
// ---------------------------------------------------------------------------

function validar_(tipo, r) {
  if (!aISO_(r.fecha)) return 'Falta la fecha';
  if (tipo === HOJA.LLUVIAS) {
    if (texto_(r.mm) === '') return 'Faltan los milímetros';
    if (aNumero_(r.mm) < 0) return 'Los milímetros no pueden ser negativos';
    if (!texto_(r.lugar)) return 'Falta el lugar del pluviómetro';
  }
  if (tipo === HOJA.MOVIMIENTOS) {
    if (!texto_(r.potrero_origen)) return 'Falta de dónde salen';
    if (!texto_(r.potrero_destino)) return 'Falta a dónde van';
    if (texto_(r.potrero_origen) === texto_(r.potrero_destino)) {
      return 'El potrero de salida y el de llegada son el mismo';
    }
    if (!texto_(r.categoria)) return 'Falta la categoría';
    if (!texto_(r.dueno)) return 'Falta el dueño';
    if (aNumero_(r.cabezas) <= 0) return 'Faltan las cabezas';
  }
  if (tipo === HOJA.RECUENTOS) {
    if (!texto_(r.potrero)) return 'Falta el potrero';
    if (!texto_(r.categoria)) return 'Falta la categoría';
    if (!texto_(r.dueno)) return 'Falta el dueño';
    if (texto_(r.cabezas) === '') return 'Faltan las cabezas';
    if (aNumero_(r.cabezas) < 0) return 'Las cabezas no pueden ser negativas';
  }
  if (tipo === HOJA.PESADAS) {
    if (!texto_(r.potrero)) return 'Falta el potrero';
    if (!texto_(r.categoria)) return 'Falta la categoría';
    if (!texto_(r.dueno)) return 'Falta el dueño';
    if (aNumero_(r.cabezas_pesadas) <= 0) return 'Faltan las cabezas pesadas';
    if (aNumero_(r.kg_cargados) <= 0) return 'Faltan los kilos';
    if (['total', 'promedio'].indexOf(texto_(r.kg_modo)) < 0) {
      return 'Falta decir si son kilos totales o promedio';
    }
    if (!texto_(r.momento)) return 'Falta si es entrada, salida o control';
  }
  if (tipo === HOJA.SANIDAD) {
    if (!texto_(r.potrero)) return 'Falta el potrero';
    if (TIPOS_SANIDAD.indexOf(texto_(r.tipo)) < 0) return 'Falta qué pasó';
    if (!texto_(r.categoria)) return 'Falta la categoría';
    if (!texto_(r.dueno)) return 'Falta el dueño';
    if (aNumero_(r.cabezas) <= 0) return 'Faltan las cabezas';
    if (texto_(r.tipo) === 'Cambio de categoría') {
      if (!texto_(r.categoria_destino)) return 'Falta la categoría nueva';
      if (texto_(r.categoria_destino) === texto_(r.categoria)) {
        return 'La categoría nueva es igual a la vieja';
      }
    }
  }
  if (tipo === HOJA.RECORRIDAS) {
    if (!texto_(r.potrero)) return 'Falta el potrero';
    if (!texto_(r.agua)) return 'Falta cómo está el agua';
    if (!texto_(r.alambre)) return 'Falta cómo está el alambre';
    if (!texto_(r.pasto)) return 'Falta cómo está el pasto';
  }
  return '';
}

function normalizar_(tipo, r) {
  var d = {id: texto_(r.id), fecha: aISO_(r.fecha), nota: texto_(r.nota),
    persona: texto_(r.persona)};
  if (tipo === HOJA.LLUVIAS) {
    d.mm = aNumero_(r.mm);
    d.lugar = texto_(r.lugar);
  } else if (tipo === HOJA.MOVIMIENTOS) {
    d.potrero_origen = texto_(r.potrero_origen);
    d.potrero_destino = texto_(r.potrero_destino);
    d.categoria = texto_(r.categoria);
    d.dueno = texto_(r.dueno);
    d.cabezas = Math.round(aNumero_(r.cabezas));
    d.motivo = texto_(r.motivo) || 'Otro';
  } else if (tipo === HOJA.RECUENTOS) {
    d.potrero = texto_(r.potrero);
    d.categoria = texto_(r.categoria);
    d.dueno = texto_(r.dueno);
    d.cabezas = Math.round(aNumero_(r.cabezas));
  } else if (tipo === HOJA.PESADAS) {
    d.potrero = texto_(r.potrero);
    d.categoria = texto_(r.categoria);
    d.dueno = texto_(r.dueno);
    d.cabezas_pesadas = Math.round(aNumero_(r.cabezas_pesadas));
    d.kg_modo = texto_(r.kg_modo);
    d.kg_cargados = aNumero_(r.kg_cargados);
    if (d.kg_modo === 'promedio') {
      d.kg_promedio = d.kg_cargados;
      d.kg_totales = Math.round(d.kg_cargados * d.cabezas_pesadas * 100) / 100;
    } else {
      d.kg_totales = d.kg_cargados;
      d.kg_promedio = d.cabezas_pesadas
        ? Math.round(d.kg_cargados / d.cabezas_pesadas * 100) / 100 : '';
    }
    d.momento = texto_(r.momento);
    d.foto_url = texto_(r.foto_url);
  } else if (tipo === HOJA.SANIDAD) {
    d.potrero = texto_(r.potrero);
    d.tipo = texto_(r.tipo);
    d.categoria = texto_(r.categoria);
    d.categoria_destino = texto_(r.categoria_destino);
    d.dueno = texto_(r.dueno);
    d.cabezas = Math.round(aNumero_(r.cabezas));
    d.causa_producto = texto_(r.causa_producto);
    d.foto_url = texto_(r.foto_url);
  } else if (tipo === HOJA.RECORRIDAS) {
    d.potrero = texto_(r.potrero);
    d.agua = texto_(r.agua);
    d.alambre = texto_(r.alambre);
    d.pasto = texto_(r.pasto);
    d.foto_url = texto_(r.foto_url);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

/** Guarda la foto en Drive (subcarpeta propia) y devuelve el link. */
function guardarFoto_(dataUrl, tipo, fecha, id) {
  var m = String(dataUrl).match(/^data:(image\/[a-z+]+);base64,(.+)$/i);
  if (!m) return '';
  var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1],
    tipo + '_' + fecha + '_' + id + '.jpg');
  var archivo = carpetaFotos_().createFile(blob);
  return archivo.getUrl();
}

function carpetaFotos_() {
  var archivo = DriveApp.getFileById(ss_().getId());
  var padres = archivo.getParents();
  var base = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  var sub = base.getFoldersByName(CARPETA_FOTOS);
  return sub.hasNext() ? sub.next() : base.createFolder(CARPETA_FOTOS);
}
