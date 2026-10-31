/**
 * Los 120 registros de la prueba (20 de cada tipo) y el stock esperado,
 * calculado acá aparte y de la forma más boba posible: si coincide con lo que
 * da el Apps Script, el motor de la planilla está bien.
 *
 * Ojo con los nombres: "hoja" es a qué hoja va el registro; "tipo" es la
 * columna de Sanidad (Nacimiento, Muerte, Cambio de categoría...).
 */

const F_RECUENTO = '2026-10-15';
const F_MOVIMIENTO = '2026-10-20';
const F_SANIDAD = '2026-10-22';

/**
 * Los potreros, dueños y categorías salen de la planilla, no van escritos acá:
 * así la prueba corre igual con los datos de prueba o con los del campo.
 */
export function armarRegistros(catalogos) {
  const P = catalogos.potreros
    .filter(p => p.id !== 'Corral/manga').map(p => p.id);
  if (P.length < 30) throw new Error('hacen falta al menos 30 potreros');
  if (catalogos.duenos.length < 4) throw new Error('hacen falta al menos 4 dueños');
  if (catalogos.categorias.length < 6) throw new Error('hacen falta al menos 6 categorías');
  const CATEGORIAS = catalogos.categorias.slice(0, 4);
  const DUENOS = catalogos.duenos.slice(0, 4);
  const CAT_CRIA = catalogos.categorias[4];      // para los nacimientos
  const CAT_DESTINO = catalogos.categorias[5];   // para el cambio de categoría
  const reg = [];
  let n = 0;
  const sello = () => {
    n++;
    return '2026-10-22T' + String(8 + Math.floor(n / 60)).padStart(2, '0') + ':' +
      String(n % 60).padStart(2, '0') + ':00';
  };
  const base = (hoja, fecha, extra) => Object.assign({
    id: 'prueba-' + hoja + '-' + String(reg.length).padStart(3, '0'),
    hoja, fecha, cargado_en: sello(), nota: ''
  }, extra);

  // 20 recuentos: el stock inicial
  for (let i = 0; i < 20; i++) {
    reg.push(base('Recuentos', F_RECUENTO, {
      potrero: P[i], categoria: CATEGORIAS[i % 4], dueno: DUENOS[i % 4],
      cabezas: 50 + i
    }));
  }

  // 20 movimientos: 10 traslados, 5 entradas al campo, 5 salidas
  for (let i = 0; i < 20; i++) {
    const cat = CATEGORIAS[i % 4], due = DUENOS[i % 4];
    if (i < 10) {
      reg.push(base('Movimientos', F_MOVIMIENTO, {
        potrero_origen: P[i], potrero_destino: P[i + 20], categoria: cat,
        dueno: due, cabezas: 10, motivo: 'Rotación'
      }));
    } else if (i < 15) {
      reg.push(base('Movimientos', F_MOVIMIENTO, {
        potrero_origen: 'Entrada al campo', potrero_destino: P[i],
        categoria: cat, dueno: due, cabezas: 5, motivo: 'Entrada'
      }));
    } else {
      reg.push(base('Movimientos', F_MOVIMIENTO, {
        potrero_origen: P[i], potrero_destino: 'Salida del campo',
        categoria: cat, dueno: due, cabezas: 3, motivo: 'Venta'
      }));
    }
  }

  // 20 de sanidad: 7 nacimientos, 7 muertes, 6 cambios de categoría
  for (let i = 0; i < 20; i++) {
    const cat = CATEGORIAS[i % 4], due = DUENOS[i % 4];
    if (i < 7) {
      reg.push(base('Sanidad', F_SANIDAD, {
        potrero: P[i], tipo: 'Nacimiento', categoria: CAT_CRIA, dueno: due,
        cabezas: 2, causa_producto: ''
      }));
    } else if (i < 14) {
      reg.push(base('Sanidad', F_SANIDAD, {
        potrero: P[i], tipo: 'Muerte', categoria: cat, dueno: due,
        cabezas: 1, causa_producto: 'empaste'
      }));
    } else {
      reg.push(base('Sanidad', F_SANIDAD, {
        potrero: P[i], tipo: 'Cambio de categoría', categoria: cat,
        categoria_destino: CAT_DESTINO, dueno: due, cabezas: 2,
        causa_producto: 'tacto'
      }));
    }
  }

  const lugares = ['Casa', 'Manga', 'Otro'];
  for (let i = 0; i < 20; i++) {
    reg.push(base('Lluvias', '2026-10-' + String(1 + i).padStart(2, '0'), {
      mm: 5 + i * 1.5, lugar: lugares[i % 3]
    }));
  }

  for (let i = 0; i < 20; i++) {
    const porPromedio = i % 2 === 1;
    reg.push(base('Pesadas', F_SANIDAD, {
      potrero: P[i], categoria: CATEGORIAS[i % 4], dueno: DUENOS[i % 4],
      cabezas_pesadas: 10, kg_modo: porPromedio ? 'promedio' : 'total',
      kg_cargados: porPromedio ? 380 + i : 3800 + i * 10,
      momento: ['Entrada', 'Salida', 'Control'][i % 3]
    }));
  }

  const aguas = ['Bien', 'Poca', 'Sin agua'];
  const alambres = ['Bien', 'Roto'];
  const pastos = ['1 Poco', '2 Normal', '3 Mucho'];
  for (let i = 0; i < 20; i++) {
    reg.push(base('Recorridas', F_SANIDAD, {
      potrero: P[i], agua: aguas[i % 3], alambre: alambres[i % 2],
      pasto: pastos[i % 3]
    }));
  }

  return reg;
}

const ES_POTRERO = p => p && p !== 'Entrada al campo' && p !== 'Salida del campo';

/** Stock esperado: recuentos, después movimientos, después sanidad. */
export function stockEsperado(registros) {
  const stock = new Map();
  const k = (p, c, d) => p + '|' + c + '|' + d;
  const mover = (p, c, d, delta) => {
    if (!ES_POTRERO(p)) return;
    stock.set(k(p, c, d), (stock.get(k(p, c, d)) || 0) + delta);
  };

  registros.filter(r => r.hoja === 'Recuentos')
    .forEach(r => stock.set(k(r.potrero, r.categoria, r.dueno), r.cabezas));

  registros.filter(r => r.hoja === 'Movimientos').forEach(r => {
    mover(r.potrero_origen, r.categoria, r.dueno, -r.cabezas);
    mover(r.potrero_destino, r.categoria, r.dueno, r.cabezas);
  });

  registros.filter(r => r.hoja === 'Sanidad').forEach(r => {
    if (r.tipo === 'Nacimiento') mover(r.potrero, r.categoria, r.dueno, r.cabezas);
    else if (r.tipo === 'Muerte') mover(r.potrero, r.categoria, r.dueno, -r.cabezas);
    else if (r.tipo === 'Cambio de categoría') {
      mover(r.potrero, r.categoria, r.dueno, -r.cabezas);
      mover(r.potrero, r.categoria_destino, r.dueno, r.cabezas);
    }
  });

  for (const [clave, v] of [...stock]) if (v <= 0) stock.delete(clave);
  return stock;
}

/** Stock esperado por dueño y categoría (para cruzar con las libretas). */
export function stockPorDuenoYCategoria(registros) {
  const porCliente = new Map();
  for (const [clave, cabezas] of stockEsperado(registros)) {
    const [, categoria, dueno] = clave.split('|');
    const k = dueno + '|' + categoria;
    porCliente.set(k, (porCliente.get(k) || 0) + cabezas);
  }
  return porCliente;
}
