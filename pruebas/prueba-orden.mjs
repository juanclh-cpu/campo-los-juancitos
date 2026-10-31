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
  ok(campo.entorno.contexto.leerHoja_('Potreros').length === 33,
    'pero los potreros siguen estando',
    campo.entorno.contexto.leerHoja_('Potreros').length + ' potreros');
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

console.log('\n' + (fallas === 0 ? '✓ Todas las pruebas pasaron.'
  : '✗ ' + fallas + ' prueba(s) fallaron.'));
process.exit(fallas === 0 ? 0 : 1);
