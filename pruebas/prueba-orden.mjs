/**
 * Dos cosas finas:
 *  a) el orden de los eventos del mismo día (manda la hora real de carga);
 *  b) la carga histórica pegada a mano en la planilla (sin hora), donde
 *     primero va el recuento y después los movimientos.
 *
 *   node pruebas/prueba-orden.mjs
 */

import { crearEntorno } from './google-falso.mjs';

let fallas = 0;
const ok = (c, t, d) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + t + (d ? ' — ' + d : ''));
  if (!c) fallas++;
};
const titulo = t => console.log('\n' + t);

function nuevoCampo() {
  const e = crearEntorno();
  e.contexto.sembrarCatalogos();
  const token = e.contexto.enlaceActivacion_().token;
  const post = cuerpo => JSON.parse(e.contexto.doPost({
    postData: { contents: JSON.stringify(Object.assign({ token }, cuerpo)) }
  }).getContent());
  const stock = () => {
    const c = e.contexto.calcularTodo_(false);
    const m = new Map();
    c.stock.forEach(s => m.set(s.potrero + '|' + s.categoria + '|' + s.dueno, s.cabezas));
    return m;
  };
  const libreta = dueno => e.contexto.calcularTodo_(false).libretas[dueno] || [];
  /** Pega filas a mano en una hoja, como hace Juan Cruz con la carga histórica. */
  const pegar = (hoja, filas) => {
    const h = e.contexto.hojaRegistro_(hoja);
    const enc = e.contexto.ESQUEMA[hoja];
    filas.forEach(f => h.appendRow(enc.map(c => (f[c] === undefined ? '' : f[c]))));
  };
  const cat = e.contexto.catalogos_();
  const potreros = cat.potreros.filter(p => p.id !== 'Corral/manga').map(p => p.id);
  return {
    potrerosSembrados: e.contexto.leerHoja_('Potreros').length,
    post, stock, libreta, pegar, entorno: e, mails: e.mails,
    config: (clave, valor) => {
      const h = e.contexto.hoja_('Configuración', ['clave', 'valor', 'qué es']);
      const filas = e.contexto.leerHoja_('Configuración');
      const fila = filas.find(f => String(f.clave) === clave);
      if (fila) h.getRange(fila._fila, 2).setValue(valor);
      else h.appendRow([clave, valor, '']);
    },
    revisarInactividad: () => e.contexto.revisarInactividad(),
    P1: potreros[0], P2: potreros[1],
    D1: cat.duenos[0], D2: cat.duenos[1], D3: cat.duenos[2], D4: cat.duenos[3],
    C1: cat.categorias[0], C2: cat.categorias[1]
  };
}

titulo('1. Mismo día: mueve a las 10 y cuenta a las 11 → manda el recuento');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', registros: [
    { id: 'm1', hoja: 'Movimientos', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      potrero_origen: 'Entrada al campo', potrero_destino: campo.P1, categoria: campo.C1,
      dueno: campo.D1, cabezas: 100, motivo: 'Entrada' },
    { id: 'r1', hoja: 'Recuentos', fecha: '2026-10-20', cargado_en: '2026-10-20T11:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 97 }
  ] });
  const s = campo.stock();
  ok(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1) === 97,
    'queda lo que contó, no lo que movió', String(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1)));
}

titulo('2. Mismo día: cuenta a las 10 y mueve a las 11 → el movimiento va después');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', registros: [
    { id: 'r1', hoja: 'Recuentos', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 100 },
    { id: 'm1', hoja: 'Movimientos', fecha: '2026-10-20', cargado_en: '2026-10-20T11:00:00',
      potrero_origen: campo.P1, potrero_destino: campo.P2, categoria: campo.C1,
      dueno: campo.D1, cabezas: 40, motivo: 'Rotación' }
  ] });
  const s = campo.stock();
  ok(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1) === 60 && s.get(campo.P2 + '|' + campo.C1 + '|' + campo.D1) === 40,
    'el recuento es la base y el movimiento se le resta',
    campo.P1 + '=' + s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1) + ' / ' + campo.P2 + '=' + s.get(campo.P2 + '|' + campo.C1 + '|' + campo.D1));
}

titulo('3. Carga histórica pegada a mano, sin hora: primero el recuento');
{
  const campo = nuevoCampo();
  // Pegadas en el orden "equivocado" a propósito: el movimiento antes del recuento.
  campo.pegar('Movimientos', [{
    id: 'h-m1', fecha: '2026-04-01', potrero_origen: campo.P1, potrero_destino: campo.P2,
    categoria: campo.C1, dueno: campo.D2, cabezas: 20, motivo: 'Rotación',
    origen_carga: 'Carga histórica', estado: 'activo'
  }]);
  campo.pegar('Recuentos', [{
    id: 'h-r1', fecha: '2026-04-01', potrero: campo.P1, categoria: campo.C1,
    dueno: campo.D2, cabezas: 80, origen_carga: 'Carga histórica', estado: 'activo'
  }]);
  const s = campo.stock();
  ok(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D2) === 60 && s.get(campo.P2 + '|' + campo.C1 + '|' + campo.D2) === 20,
    'el recuento de 80 va primero y después salen las 20',
    campo.P1 + '=' + s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D2) + ' / ' + campo.P2 + '=' + s.get(campo.P2 + '|' + campo.C1 + '|' + campo.D2));
}

titulo('4. La libreta del cliente se arma con la carga histórica');
{
  const campo = nuevoCampo();
  campo.pegar('Recuentos', [{
    id: 'h-r1', fecha: '2026-04-01', potrero: campo.P1, categoria: campo.C1,
    dueno: campo.D3, cabezas: 100, origen_carga: 'Carga histórica', estado: 'activo'
  }]);
  campo.pegar('Movimientos', [
    { id: 'h-m1', fecha: '2026-05-10', potrero_origen: 'Entrada al campo',
      potrero_destino: campo.P1, categoria: campo.C1, dueno: campo.D3, cabezas: 25,
      motivo: 'Entrada', origen_carga: 'Carga histórica', estado: 'activo' },
    { id: 'h-m2', fecha: '2026-06-02', potrero_origen: campo.P1,
      potrero_destino: 'Salida del campo', categoria: campo.C1, dueno: campo.D3,
      cabezas: 30, motivo: 'Venta', origen_carga: 'Carga histórica', estado: 'activo' },
    { id: 'h-m3', fecha: '2026-06-20', potrero_origen: campo.P1, potrero_destino: campo.P2,
      categoria: campo.C1, dueno: campo.D3, cabezas: 40, motivo: 'Rotación',
      origen_carga: 'Carga histórica', estado: 'activo' }
  ]);
  campo.pegar('Sanidad', [
    { id: 'h-s1', fecha: '2026-07-01', potrero: campo.P1, tipo: 'Muerte', categoria: campo.C1,
      dueno: campo.D3, cabezas: 2, causa_producto: 'rayo',
      origen_carga: 'Carga histórica', estado: 'activo' },
    { id: 'h-s2', fecha: '2026-08-01', potrero: campo.P1, tipo: 'Cambio de categoría',
      categoria: campo.C1, categoria_destino: campo.C2, dueno: campo.D3,
      cabezas: 10, causa_producto: 'tacto', origen_carga: 'Carga histórica',
      estado: 'activo' }
  ]);

  const filas = campo.libreta(campo.D3);
  const vacas = filas.filter(f => f.categoria === campo.C1);
  const vacias = filas.filter(f => f.categoria === campo.C2);

  ok(vacas.length === 5,
    'la libreta tiene una fila por evento que cambia el stock',
    vacas.length + ' filas');
  ok(!filas.some(f => /Rotación/.test(f.comentario || '')),
    'el traslado entre potreros del mismo dueño no ensucia la libreta');
  const saldos = vacas.map(f => f.stock);
  ok(JSON.stringify(saldos) === JSON.stringify([100, 125, 95, 93, 83]),
    'el saldo corrido va bien', saldos.join(' → '));
  ok(vacas[0].ingreso === 100 && /recuento/i.test(vacas[0].comentario),
    'el primer recuento entra como ajuste de apertura');
  ok(vacas[2].egreso === 30 && /Venta/.test(vacas[2].comentario),
    'la venta sale como egreso');
  ok(vacas[3].muertes === 2 && /rayo/.test(vacas[3].comentario),
    'la muerte va en su propia columna');
  ok(vacas[4].egreso === 10 && vacias.length === 1 && vacias[0].ingreso === 10,
    'el cambio de categoría sale de una y entra en la otra',
    campo.C1 + ' -10 / ' + campo.C2 + ' +10');
  ok(vacias[0].stock === 10, 'y la categoría nueva arranca su propio saldo');
}

titulo('5. Un registro borrado deja de contar');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', registros: [
    { id: 'r1', hoja: 'Recuentos', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D4, cabezas: 50 },
    { id: 's1', hoja: 'Sanidad', fecha: '2026-10-21', cargado_en: '2026-10-21T10:00:00',
      potrero: campo.P1, tipo: 'Nacimiento', categoria: campo.C2, dueno: campo.D4, cabezas: 4 }
  ] });
  ok(campo.stock().get(campo.P1 + '|' + campo.C2 + '|' + campo.D4) === 4, 'el nacimiento sumó 4');
  const r = campo.post({ accion: 'borrar', hoja: 'Sanidad', id: 's1' });
  ok(r.ok === true, 'el borrado se acepta');
  ok(campo.stock().get(campo.P1 + '|' + campo.C2 + '|' + campo.D4) === undefined,
    'después de borrarlo esa categoría queda en cero');
}

titulo('6. Datos incompletos: el script los rechaza con palabras simples');
{
  const campo = nuevoCampo();
  const r = campo.post({ accion: 'guardar', registros: [
    { id: 'x1', hoja: 'Movimientos', fecha: '2026-10-20', potrero_origen: campo.P1,
      potrero_destino: campo.P1, categoria: campo.C1, dueno: campo.D4, cabezas: 10 },
    { id: 'x2', hoja: 'Lluvias', fecha: '2026-10-20', lugar: 'Casa' }
  ] });
  const porId = Object.fromEntries(r.resultados.map(x => [x.id, x]));
  ok(porId.x1.estado === 'error' && /mismo/.test(porId.x1.mensaje),
    'avisa si el potrero de salida y el de llegada son el mismo', porId.x1.mensaje);
  ok(porId.x2.estado === 'error' && /milímetros/.test(porId.x2.mensaje),
    'avisa si faltan los milímetros', porId.x2.mensaje);
}

titulo('7. Aviso por mail cuando llegan registros');
{
  const campo = nuevoCampo();
  campo.config('mail_avisos', 'dueno@ejemplo.com');
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'a1', hoja: 'Lluvias', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      mm: 32, lugar: 'Casa' },
    { id: 'a2', hoja: 'Recorridas', fecha: '2026-10-20', cargado_en: '2026-10-20T10:05:00',
      potrero: campo.P1, agua: 'Poca', alambre: 'Roto', pasto: '1 Poco' }
  ] });
  ok(campo.mails.length === 1, 'llega un solo mail por envío, no uno por registro',
    campo.mails.length + ' mail(s)');
  const m = campo.mails[0];
  ok(m.para === 'dueno@ejemplo.com', 'va a quien dice la configuración', m.para);
  ok(m.asunto === 'Campo: Nahuel cargó 2 registros', 'el asunto dice quién y cuántos',
    m.asunto);
  ok(/Llovieron 32 mm/.test(m.cuerpo) && /alambre Roto/.test(m.cuerpo),
    'el cuerpo lo cuenta en castellano');

  // reenviar lo mismo no tiene que volver a avisar
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'a1', hoja: 'Lluvias', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      mm: 32, lugar: 'Casa' }
  ] });
  ok(campo.mails.length === 1, 'un reenvío repetido no manda otro mail',
    campo.mails.length + ' mail(s)');
}

titulo('8. Se puede apagar el aviso de cada registro');
{
  const campo = nuevoCampo();
  campo.config('mail_avisos', 'dueno@ejemplo.com');
  campo.config('avisar_cada_registro', 'no');
  campo.post({ accion: 'guardar', persona: 'Juan Cruz', registros: [
    { id: 'b1', hoja: 'Lluvias', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      mm: 10, lugar: 'Manga' }
  ] });
  ok(campo.mails.length === 0, 'con avisar_cada_registro en "no" no manda nada');
}

titulo('9. Aviso cuando hace días que nadie carga');
{
  const campo = nuevoCampo();
  campo.config('mail_avisos', 'dueno@ejemplo.com');
  campo.config('mail_encargado', 'encargado@ejemplo.com');
  campo.config('avisar_cada_registro', 'no');

  // En hora local, igual que como lo manda la app.
  const haceDias = n => {
    const d = new Date(Date.now() - n * 86400000);
    const p = x => String(x).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  };

  campo.pegar('Lluvias', [{ id: 'v1', fecha: haceDias(2).slice(0, 10), mm: 5,
    lugar: 'Casa', cargado_en: haceDias(2), origen_carga: 'App', estado: 'activo' }]);
  campo.revisarInactividad();
  ok(campo.mails.length === 0, 'a los 2 días no avisa');

  const campo2 = nuevoCampo();
  campo2.config('mail_avisos', 'dueno@ejemplo.com');
  campo2.config('mail_encargado', 'encargado@ejemplo.com');
  campo2.config('avisar_cada_registro', 'no');
  campo2.pegar('Lluvias', [{ id: 'v1', fecha: haceDias(7).slice(0, 10), mm: 5,
    lugar: 'Casa', cargado_en: haceDias(7), origen_carga: 'App', estado: 'activo' }]);
  campo2.revisarInactividad();
  ok(campo2.mails.length === 1, 'a los 7 días sí avisa', campo2.mails.length + ' mail(s)');
  ok(/dueno@ejemplo.com/.test(campo2.mails[0].para) &&
     /encargado@ejemplo.com/.test(campo2.mails[0].para),
    'les llega a los dos', campo2.mails[0].para);
  ok(/hace 7 días/.test(campo2.mails[0].asunto), 'y dice cuántos días',
    campo2.mails[0].asunto);

  campo2.revisarInactividad();
  ok(campo2.mails.length === 1, 'y no insiste todos los días');
}

titulo('10. Quién cargó queda guardado en la hoja');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', persona: 'Juan Cruz', registros: [
    { id: 'c1', hoja: 'Lluvias', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      mm: 12, lugar: 'Casa' },
    { id: 'c2', hoja: 'Lluvias', fecha: '2026-10-21', cargado_en: '2026-10-21T10:00:00',
      mm: 8, lugar: 'Casa', persona: 'Nahuel' }
  ] });
  const filas = campo.entorno.contexto.leerHoja_('Lluvias');
  ok(filas[0].persona === 'Juan Cruz', 'toma el nombre del celular que manda',
    filas[0].persona);
  ok(filas[1].persona === 'Nahuel', 'y respeta el del registro si viene puesto',
    filas[1].persona);
}

titulo('11. Vaciar los registros deja la planilla en cero');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'd1', hoja: 'Recuentos', fecha: '2026-10-20', cargado_en: '2026-10-20T10:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 40 }
  ] });
  ok(campo.stock().size === 1, 'había stock antes de vaciar');
  const borradas = campo.entorno.contexto.vaciarRegistros_();
  ok(borradas === 1, 'dice cuántas filas borró', String(borradas));
  ok(campo.entorno.contexto.leerHoja_('Recuentos').length === 0, 'la hoja quedó vacía');
  ok(campo.stock().size === 0, 'y el stock en cero');
  var cuantosPotreros = campo.entorno.contexto.leerHoja_('Potreros').length;
  ok(cuantosPotreros === campo.potrerosSembrados,
    'pero los potreros siguen estando',
    cuantosPotreros + ' potreros');
}

titulo('12. Una planilla con los encabezados viejos se pone al día sola');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;

  // Dejamos la hoja como estaba antes de que existiera la columna "persona",
  // con una fila ya cargada.
  const viejas = ['id', 'fecha', 'mm', 'lugar', 'nota', 'cargado_en',
    'dispositivo', 'origen_carga', 'estado'];
  const h = ctx.hoja_('Lluvias', viejas);
  h.clear();
  h.getRange(1, 1, 1, viejas.length).setValues([viejas]);
  h.appendRow(['vieja-1', '2026-09-01', 18, 'Casa', 'antes del cambio',
    '2026-09-01T10:00:00', 'celu-viejo', 'App', 'activo']);

  const antes = ctx.leerHoja_('Lluvias');
  ok(antes.length === 1 && antes[0].persona === undefined,
    'la hoja arranca sin la columna persona');

  // Llega un registro del celular: eso solo tiene que acomodar la hoja.
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'nueva-1', hoja: 'Lluvias', fecha: '2026-10-20',
      cargado_en: '2026-10-20T10:00:00', mm: 42, lugar: 'Manga' }
  ] });

  const despues = ctx.leerHoja_('Lluvias');
  ok(despues.length === 2, 'quedan las dos filas: no se perdió la vieja',
    despues.length + ' filas');
  const vieja = despues.find(f => f.id === 'vieja-1');
  const nueva = despues.find(f => f.id === 'nueva-1');
  ok(vieja && Number(vieja.mm) === 18 && vieja.lugar === 'Casa' &&
     vieja.nota === 'antes del cambio',
    'la fila vieja conservó todos sus datos en su lugar',
    vieja ? vieja.mm + ' mm en ' + vieja.lugar : 'no está');
  ok(vieja && vieja.persona === '', 'con la columna nueva vacía');
  ok(nueva && nueva.persona === 'Nahuel' && Number(nueva.mm) === 42,
    'y la nueva entró con quién la cargó',
    nueva ? nueva.persona + ', ' + nueva.mm + ' mm' : 'no está');
}

titulo('13. Mover más hacienda de la que había: se da de alta sola');
{
  const campo = nuevoCampo();
  // Sin ningún recuento previo: el potrero está en cero.
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'alta-1', hoja: 'Movimientos', fecha: '2026-10-20',
      cargado_en: '2026-10-20T10:00:00', potrero_origen: campo.P1,
      potrero_destino: campo.P2, categoria: campo.C1, dueno: campo.D1,
      cabezas: 30, motivo: 'Rotación' }
  ] });
  const s = campo.stock();
  ok(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1) === undefined,
    'el potrero de salida queda en cero, no en negativo',
    String(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1)));
  ok(s.get(campo.P2 + '|' + campo.C1 + '|' + campo.D1) === 30,
    'las 30 llegaron al destino');

  const filas = campo.libreta(campo.D1);
  ok(filas.length === 1 && filas[0].ingreso === 30 && filas[0].stock === 30,
    'la libreta del cliente las anota como ingreso',
    filas.length ? ('ingreso ' + filas[0].ingreso + ', stock ' + filas[0].stock) : 'vacía');
  ok(/Alta autom/.test(filas[0].comentario) && /recuento/.test(filas[0].comentario),
    'y el comentario explica que hay que confirmarlo con un recuento',
    filas[0].comentario);
}

titulo('14. Mover más de lo que había: sólo da de alta la diferencia');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'r1', hoja: 'Recuentos', fecha: '2026-10-19', cargado_en: '2026-10-19T10:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 10 },
    { id: 'm1', hoja: 'Movimientos', fecha: '2026-10-20',
      cargado_en: '2026-10-20T10:00:00', potrero_origen: campo.P1,
      potrero_destino: campo.P2, categoria: campo.C1, dueno: campo.D1,
      cabezas: 30, motivo: 'Rotación' }
  ] });
  const s = campo.stock();
  ok(s.get(campo.P2 + '|' + campo.C1 + '|' + campo.D1) === 30, 'llegaron las 30');
  ok(s.get(campo.P1 + '|' + campo.C1 + '|' + campo.D1) === undefined,
    'y el de salida quedó en cero');

  const filas = campo.libreta(campo.D1);
  const alta = filas.find(f => /Alta autom/.test(f.comentario || ''));
  ok(alta && alta.ingreso === 20, 'dio de alta sólo las 20 que faltaban',
    alta ? String(alta.ingreso) : 'no hay alta');
  ok(filas[filas.length - 1].stock === 30,
    'el saldo del cliente queda en 30', String(filas[filas.length - 1].stock));
}

titulo('15. Avisos para el encargado');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;
  const h = ctx.hoja_('Avisos', ['fecha', 'mensaje', 'activo']);
  h.appendRow(['2026-11-03', 'El lunes viene el veterinario', 'sí']);
  h.appendRow(['2026-10-01', 'Aviso viejo', 'no']);
  h.appendRow(['2026-11-03', '', 'sí']);

  const avisos = ctx.catalogos_().avisos;
  ok(avisos.length === 1 && avisos[0] === 'El lunes viene el veterinario',
    'la app recibe sólo los avisos activos y con texto',
    JSON.stringify(avisos));

  ok(ctx.leerHoja_('Avisos').length === 3,
    'la hoja Avisos existe y se crea sola con armarHojas_');
}

titulo('16. Capada de terneros');
{
  const campo = nuevoCampo();
  const r = campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'r1', hoja: 'Recuentos', fecha: '2026-10-19', cargado_en: '2026-10-19T10:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 40 },
    { id: 'cap-1', hoja: 'Sanidad', fecha: '2026-10-20',
      cargado_en: '2026-10-20T10:00:00', potrero: campo.P1,
      tipo: 'Capada de terneros', categoria: campo.C1, dueno: campo.D1,
      cabezas: 12, causa_producto: '' }
  ] });
  const porId = Object.fromEntries(r.resultados.map(x => [x.id, x]));
  ok(porId['cap-1'].estado === 'guardado', 'el script la acepta como tipo válido',
    porId['cap-1'].mensaje || '');
  ok(campo.stock().get(campo.P1 + '|' + campo.C1 + '|' + campo.D1) === 40,
    'y no mueve el stock, como tratamiento o vacunación',
    String(campo.stock().get(campo.P1 + '|' + campo.C1 + '|' + campo.D1)));
}

titulo('17. Un potrero con nombre de número no se convierte en hora ni en número');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;

  // El potrero "7" con 141 cabezas: en Resumen stock la columna potreros
  // dice "7: 141", que Sheets leería como 7 horas y 141 minutos = 9:21.
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'n1', hoja: 'Recuentos', fecha: '2026-11-01', cargado_en: '2026-11-01T10:00:00',
      potrero: '7', categoria: campo.C1, dueno: campo.D1, cabezas: 141 },
    { id: 'n2', hoja: 'Recuentos', fecha: '2026-11-01', cargado_en: '2026-11-01T10:05:00',
      potrero: '7', categoria: campo.C2, dueno: campo.D1, cabezas: 4 }
  ] });
  ctx.escribirCalculos_(true);

  const leer = (hoja) => {
    const filas = ctx.leerHoja_(hoja);
    return filas;
  };

  const resumen = leer('Resumen stock');
  const fila141 = resumen.find(f => String(f.categoria) === campo.C1);
  const fila4 = resumen.find(f => String(f.categoria) === campo.C2);

  ok(fila141 && fila141.potreros === '7: 141',
    'la columna potreros guarda el texto tal cual, no una hora',
    fila141 ? JSON.stringify(fila141.potreros) : 'no está');
  ok(fila4 && fila4.potreros === '7: 4',
    'y también cuando los minutos serían una hora válida',
    fila4 ? JSON.stringify(fila4.potreros) : 'no está');
  ok(fila141 && typeof fila141.potreros === 'string',
    'queda guardada como texto');

  const stock = leer('Stock');
  ok(stock.every(f => typeof f.potrero === 'string'),
    'en Stock el potrero "7" sigue siendo texto, no el número 7',
    JSON.stringify(stock.map(f => f.potrero)));

  const libreta = leer('Libreta ' + campo.D1);
  ok(libreta.every(f => typeof f.Potrero === 'string'),
    'y en la libreta del cliente también',
    JSON.stringify(libreta.map(f => f.Potrero)));

  const diario = leer('Diario de ocupación');
  ok(diario.every(f => typeof f.potrero === 'string'),
    'y en el diario de ocupación');

  // Los números tienen que seguir siendo números.
  ok(stock.every(f => typeof f.cabezas === 'number'),
    'las cabezas siguen siendo números, no texto',
    JSON.stringify(stock.map(f => f.cabezas)));
  ok(fila141 && typeof fila141.cabezas === 'number',
    'también en el resumen');
}

titulo('18. Una planilla que ya tenía el valor mal guardado se arregla sola');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;
  const props = campo.entorno.propiedades;

  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'v1', hoja: 'Recuentos', fecha: '2026-11-01', cargado_en: '2026-11-01T10:00:00',
      potrero: '7', categoria: campo.C1, dueno: campo.D1, cabezas: 141 }
  ] });

  // Dejamos la planilla como estaba antes del arreglo: sin formato de texto,
  // con la hora 9:21 en la columna potreros y sin la marca de reparado.
  const h = ctx.hoja_('Resumen stock', []);
  h.formatos = [];
  h.getRange(2, 4).setValues([['7: 141']]);
  props.delete('FORMATO_TEXTO_APLICADO');
  // En Google cada pedido es una ejecución nueva; acá el contexto se comparte,
  // así que reseteamos la marca de "ya revisé las hojas" a mano.
  ctx.HOJAS_REVISADAS = false;

  ok(ctx.leerHoja_('Resumen stock')[0].potreros === '9:21',
    'arrancamos con el error puesto, como la planilla de JC',
    JSON.stringify(ctx.leerHoja_('Resumen stock')[0].potreros));

  // Llega un registro cualquiera del celular.
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'v2', hoja: 'Lluvias', fecha: '2026-11-02', cargado_en: '2026-11-02T10:00:00',
      mm: 12, lugar: 'Casa' }
  ] });

  ok(ctx.leerHoja_('Resumen stock')[0].potreros === '7: 141',
    'el primer envío que llega lo deja bien, sin que nadie toque nada',
    JSON.stringify(ctx.leerHoja_('Resumen stock')[0].potreros));
  ok(!!props.get('FORMATO_TEXTO_APLICADO'), 'y queda anotado que ya se reparó');

  // Y no se repite en cada envío.
  const marca = props.get('FORMATO_TEXTO_APLICADO');
  ctx.HOJAS_REVISADAS = false;
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'v3', hoja: 'Lluvias', fecha: '2026-11-03', cargado_en: '2026-11-03T10:00:00',
      mm: 3, lugar: 'Casa' }
  ] });
  ok(props.get('FORMATO_TEXTO_APLICADO') === marca,
    'la reparación corre una sola vez');
}

const HOY = new Date().toISOString().slice(0, 10);
const haceDiasISO = n => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (desde, hasta) => Math.round(
  (new Date(hasta + 'T12:00:00Z') - new Date(desde + 'T12:00:00Z')) / 86400000);

titulo('19. Hoja Descanso: un potrero que se vacía y otro ocupado');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;
  const entrada = haceDiasISO(20);
  const salida = haceDiasISO(4);

  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'd1', hoja: 'Recuentos', fecha: entrada, cargado_en: entrada + 'T09:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 40 },
    { id: 'd2', hoja: 'Movimientos', fecha: salida, cargado_en: salida + 'T09:00:00',
      potrero_origen: campo.P1, potrero_destino: campo.P2, categoria: campo.C1,
      dueno: campo.D1, cabezas: 40, motivo: 'Rotación' }
  ] });
  ctx.escribirCalculos_(false);

  const filas = ctx.leerHoja_('Descanso');
  const vacio = filas.find(f => f.potrero === campo.P1);
  const ocupado = filas.find(f => f.potrero === campo.P2);

  ok(!!vacio && vacio.ocupado === 'no', 'el potrero que se vació figura como no ocupado',
    vacio ? vacio.ocupado : 'no está');
  ok(vacio && vacio.cabezas_hoy === 0, 'sin cabezas', String(vacio && vacio.cabezas_hoy));
  ok(vacio && vacio.ultima_salida === salida,
    'con la fecha en que quedó vacío', String(vacio && vacio.ultima_salida));
  ok(vacio && vacio.dias_descanso === diasEntre(salida, HOY),
    'y los días de descanso bien contados',
    vacio ? vacio.dias_descanso + ' días' : '');
  ok(vacio && vacio.dias_ocupado === '', 'no dice días de ocupación');

  ok(!!ocupado && ocupado.ocupado === 'sí', 'el potrero que recibió figura como ocupado');
  ok(ocupado && ocupado.cabezas_hoy === 40, 'con sus 40 cabezas',
    String(ocupado && ocupado.cabezas_hoy));
  ok(ocupado && ocupado.dias_ocupado === diasEntre(salida, HOY),
    'y los días que lleva ocupado', ocupado ? ocupado.dias_ocupado + ' días' : '');
  ok(ocupado && ocupado.dias_descanso === '' && ocupado.ultima_salida === '',
    'sin días de descanso mientras está ocupado');

  const nuncaUsado = filas.find(f => f.potrero !== campo.P1 && f.potrero !== campo.P2);
  ok(!!nuncaUsado && nuncaUsado.ocupado === 'no' && nuncaUsado.dias_descanso === '',
    'un potrero que nunca se usó aparece vacío y sin días',
    nuncaUsado ? nuncaUsado.potrero : 'no hay');
  ok(filas.length >= campo.potrerosSembrados,
    'están todos los potreros de la planilla', filas.length + ' filas');
}

titulo('20. Al guardar, la respuesta dice cómo quedó el potrero');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'e0', hoja: 'Recuentos', fecha: '2026-11-01', cargado_en: '2026-11-01T09:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 50 }
  ] });

  const r = campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'e1', hoja: 'Movimientos', fecha: '2026-11-02', cargado_en: '2026-11-02T09:00:00',
      potrero_origen: campo.P1, potrero_destino: campo.P2, categoria: campo.C1,
      dueno: campo.D1, cabezas: 20, motivo: 'Rotación' }
  ] });

  const est = r.estado_stock;
  ok(!!est, 'la respuesta trae el estado del stock');
  ok(est && est.potreros.length === 2, 'con el potrero de salida y el de llegada',
    est ? est.potreros.map(p => p.potrero).join(', ') : '');
  const origen = est && est.potreros.find(p => p.potrero === campo.P1);
  const destino = est && est.potreros.find(p => p.potrero === campo.P2);
  ok(origen && origen.grupos[0].cabezas === 30, 'en el de salida quedan 30',
    origen ? String(origen.grupos[0].cabezas) : '');
  ok(destino && destino.grupos[0].cabezas === 20, 'y en el de llegada 20');
  ok(origen && origen.grupos[0].categoria === campo.C1 &&
     origen.grupos[0].dueno === campo.D1, 'con la categoría y el dueño');
  ok(est && est.revisar.length === 0, 'y nada para revisar');

  ok(!('_guardados' in r), 'la respuesta no filtra datos internos');
}

titulo('21. Si algo queda en negativo, la respuesta lo marca para revisar');
{
  const campo = nuevoCampo();
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'n0', hoja: 'Recuentos', fecha: '2026-11-01', cargado_en: '2026-11-01T09:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 5 }
  ] });
  const r = campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'n1', hoja: 'Sanidad', fecha: '2026-11-02', cargado_en: '2026-11-02T09:00:00',
      potrero: campo.P1, tipo: 'Muerte', categoria: campo.C1, dueno: campo.D1,
      cabezas: 8, causa_producto: 'rayo' }
  ] });
  const est = r.estado_stock;
  ok(est && est.potreros[0].grupos[0].cabezas === -3, 'el grupo queda en -3',
    est ? String(est.potreros[0].grupos[0].cabezas) : '');
  ok(est && est.revisar.length === 1 && /-3/.test(est.revisar[0]) &&
     /Contá ese potrero/.test(est.revisar[0]),
    'y sale una línea para revisar', est ? est.revisar[0] : '');
}

titulo('22. El alta automática también se avisa al guardar');
{
  const campo = nuevoCampo();
  const r = campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'a1', hoja: 'Movimientos', fecha: '2026-11-02', cargado_en: '2026-11-02T09:00:00',
      potrero_origen: campo.P1, potrero_destino: campo.P2, categoria: campo.C1,
      dueno: campo.D1, cabezas: 12, motivo: 'Rotación' }
  ] });
  const est = r.estado_stock;
  ok(est && est.revisar.length === 1 && /Se dieron de alta 12/.test(est.revisar[0]),
    'avisa que se dieron de alta solas', est ? est.revisar[0] : '');
}

titulo('23. Manejo: inseminación, tacto y servicio con toro');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;
  const tipos = ctx.catalogos_().tipos_sanidad;
  ['Inseminación', 'Tacto', 'Servicio con toro'].forEach(t => {
    ok(tipos.indexOf(t) >= 0, 'la app ofrece "' + t + '"');
  });
  ok(ctx.catalogos_().tipos_sanidad_sin_stock.indexOf('Inseminación') >= 0,
    'y sabe que no mueven stock');

  // Las dos filas que ya están cargadas a mano en la planilla.
  campo.pegar('Recuentos', [
    { id: 'base-1', fecha: '2026-11-05', potrero: '1i', categoria: campo.C1,
      dueno: campo.D1, cabezas: 141, origen_carga: 'Carga histórica', estado: 'activo' }
  ]);
  campo.pegar('Sanidad', [
    { id: 'ins-1', fecha: '2026-11-06', potrero: '1i', tipo: 'Inseminación',
      categoria: campo.C1, dueno: campo.D1, cabezas: 141,
      causa_producto: 'toro 1', origen_carga: 'Carga histórica', estado: 'activo' },
    { id: 'ins-2', fecha: '2026-11-06', potrero: '1i', tipo: 'Inseminación',
      categoria: campo.C1, dueno: campo.D2, cabezas: 27,
      causa_producto: 'toro 2', origen_carga: 'Carga histórica', estado: 'activo' }
  ]);
  const s = campo.stock();
  ok(s.get('1i|' + campo.C1 + '|' + campo.D1) === 141,
    'las inseminaciones no tocan el stock',
    String(s.get('1i|' + campo.C1 + '|' + campo.D1)));
  ok(s.get('1i|' + campo.C1 + '|' + campo.D2) === undefined,
    'ni dan de alta hacienda que no estaba');
  ok(campo.libreta(campo.D2).length === 0,
    'ni ensucian la libreta del cliente');

  const r = campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'ins-3', hoja: 'Sanidad', fecha: '2026-11-07', cargado_en: '2026-11-07T09:00:00',
      potrero: '1i', tipo: 'Tacto', categoria: campo.C1, dueno: campo.D1,
      cabezas: 141, causa_producto: '120 preñadas' }
  ] });
  ok(r.resultados[0].estado === 'guardado', 'un tacto cargado desde la app entra bien',
    r.resultados[0].mensaje || '');
  ok(!r.estado_stock, 'y no muestra pantalla de stock, porque no lo mueve');
}

titulo('24. Un potrero dado de baja no le aparece al encargado');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;
  const h = ctx.hoja_('Potreros', []);
  const filas = ctx.leerHoja_('Potreros');
  const baja = filas[1];
  // La columna activo se edita a mano: puede decir "no", "No", "NO" o "false".
  ['no', 'No', 'NO', 'false', 'baja'].forEach(valor => {
    h.getRange(baja._fila, 5).setValue(valor);
    const ids = ctx.catalogos_().potreros.map(p => p.id);
    ok(ids.indexOf(baja.id) < 0, 'con activo = "' + valor + '" no aparece en la grilla');
  });
  h.getRange(baja._fila, 5).setValue('sí');
  ok(ctx.catalogos_().potreros.map(p => p.id).indexOf(baja.id) >= 0,
    'y vuelve a aparecer si se le pone sí');

  // Pero si tiene hacienda, el stock y Descanso lo siguen mostrando.
  h.getRange(baja._fila, 5).setValue('no');
  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'b1', hoja: 'Recuentos', fecha: '2026-11-02', cargado_en: '2026-11-02T09:00:00',
      potrero: baja.id, categoria: campo.C1, dueno: campo.D1, cabezas: 4 }
  ] });
  ok(campo.stock().get(baja.id + '|' + campo.C1 + '|' + campo.D1) === 4,
    'la hacienda que quedó ahí se sigue viendo en el stock');
  ctx.escribirCalculos_(false);
  const enDescanso = ctx.leerHoja_('Descanso').find(f => f.potrero === baja.id);
  ok(!!enDescanso && enDescanso.cabezas_hoy === 4,
    'y en Descanso también, para que no se olvide');
}

titulo('25. Parte semanal');
{
  const campo = nuevoCampo();
  const ctx = campo.entorno.contexto;

  campo.post({ accion: 'guardar', persona: 'Nahuel', registros: [
    { id: 'p1', hoja: 'Recuentos', fecha: haceDiasISO(5), cargado_en: haceDiasISO(5) + 'T09:00:00',
      potrero: campo.P1, categoria: campo.C1, dueno: campo.D1, cabezas: 60 },
    { id: 'p2', hoja: 'Lluvias', fecha: haceDiasISO(3), cargado_en: haceDiasISO(3) + 'T09:00:00',
      mm: 18, lugar: 'Casa' },
    { id: 'p3', hoja: 'Lluvias', fecha: haceDiasISO(1), cargado_en: haceDiasISO(1) + 'T09:00:00',
      mm: 12, lugar: 'Casa' },
    { id: 'p4', hoja: 'Recorridas', fecha: haceDiasISO(2), cargado_en: haceDiasISO(2) + 'T09:00:00',
      potrero: campo.P1, agua: 'Sin agua', alambre: 'Roto', pasto: '1 Poco' },
    { id: 'p5', hoja: 'Recorridas', fecha: haceDiasISO(2), cargado_en: haceDiasISO(2) + 'T09:05:00',
      potrero: campo.P2, agua: 'Bien', alambre: 'Bien', pasto: '2 Normal' },
    { id: 'p6', hoja: 'Movimientos', fecha: haceDiasISO(1), cargado_en: haceDiasISO(1) + 'T10:00:00',
      potrero_origen: campo.P2, potrero_destino: campo.P1, categoria: campo.C1,
      dueno: campo.D2, cabezas: 9, motivo: 'Rotación' }
  ] });
  // Algo viejo, que no tiene que salir en el parte.
  campo.pegar('Lluvias', [{ id: 'viejo', fecha: haceDiasISO(30), mm: 99,
    lugar: 'Casa', origen_carga: 'App', estado: 'activo' }]);

  const p = ctx.parteSemanal_();
  ok(p.mmSemana === 30, 'suma los milímetros de la semana', p.mmSemana + ' mm');
  ok(p.totalRegistros === 6, 'cuenta sólo los de los últimos 7 días',
    p.totalRegistros + ' registros');
  ok(Object.keys(p.quienes).some(q => /Nahuel/.test(q)),
    'dice quién cargó y desde qué dispositivo', Object.keys(p.quienes).join(', '));
  ok(p.sinNada.length >= 1, 'marca los días sin nada anotado',
    p.sinNada.length + ' días');
  ok(p.paraRevisar.some(t => /Alta automática/.test(t)),
    'pone el alta automática para revisar', p.paraRevisar.join(' | '));
  ok(p.totalCabezas === 69, 'da el stock total', p.totalCabezas + ' cabezas');

  const html = ctx.parteEnHtml_(p);
  ok(/Parte semanal del campo/.test(html), 'el HTML tiene título');
  ok(/Para revisar/.test(html), 'y la sección para revisar');
  ok(/Sin agua/.test(html), 'incluye la recorrida con problemas');
  ok(!/agua Bien, alambre Bien/.test(html),
    'y deja afuera la recorrida que estaba toda bien');
  ok(/30 mm/.test(html), 'muestra la lluvia de la semana');
  ok(/Total en el campo/.test(html), 'y el total de hacienda');
  ok(!/99/.test(html), 'no se cuela la lluvia vieja');

  // Ojo: ya hay mails de los avisos de cada envío, así que miramos los del parte.
  const partes = () => campo.mails.filter(m => /^Parte semanal/.test(m.asunto));

  const sinMail = ctx.mandarParteSemanal();
  ok(sinMail.mandado === false && partes().length === 0,
    'sin mail_parte no manda nada', sinMail.motivo);

  campo.config('mail_parte', 'dueno@ejemplo.com');
  const conMail = ctx.mandarParteSemanal();
  ok(conMail.mandado === true && partes().length === 1,
    'con mail_parte sí lo manda', partes().length + ' parte(s)');
  ok(partes()[0].html && /Parte semanal/.test(partes()[0].html),
    'y va en HTML', partes()[0].asunto);
  ok(partes()[0].para === 'dueno@ejemplo.com', 'a quien dice la configuración',
    partes()[0].para);
}

console.log('\n' + (fallas === 0 ? '✓ Todas las pruebas pasaron.'
  : '✗ ' + fallas + ' prueba(s) fallaron.'));
process.exit(fallas === 0 ? 0 : 1);
