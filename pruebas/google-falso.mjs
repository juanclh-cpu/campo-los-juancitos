/**
 * Google de mentira: implementa lo justo de SpreadsheetApp, Utilities,
 * PropertiesService, LockService, ContentService y DriveApp para poder correr
 * el Apps Script de verdad acá, en la computadora, y probarlo antes de subirlo.
 */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Imita cómo Sheets interpreta un texto al escribirlo, salvo que la columna
 * tenga formato de texto plano. Es lo que convierte "7: 141" en una hora.
 */
function comoLoGuardariaSheets(valor, formato) {
  if (formato === '@') return valor;
  if (typeof valor !== 'string') return valor;
  const t = valor.trim();
  if (t === '') return valor;
  const hora = t.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
  if (hora) {
    const total = Number(hora[1]) * 60 + Number(hora[2]);
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }
  if (/^-?\d+([.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return valor;
}

class Rango {
  constructor(hoja, fila, col, nFilas, nCols) {
    this.hoja = hoja; this.fila = fila; this.col = col;
    this.nFilas = nFilas; this.nCols = nCols;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.nFilas; r++) {
      const fila = this.hoja.datos[this.fila - 1 + r] || [];
      const linea = [];
      for (let c = 0; c < this.nCols; c++) {
        const v = fila[this.col - 1 + c];
        linea.push(v === undefined || v === null ? '' : v);
      }
      out.push(linea);
    }
    return out;
  }
  setValues(valores) {
    valores.forEach((linea, r) => {
      const fi = this.fila - 1 + r;
      while (this.hoja.datos.length <= fi) this.hoja.datos.push([]);
      linea.forEach((v, c) => {
        const col = this.col - 1 + c;
        this.hoja.datos[fi][col] =
          comoLoGuardariaSheets(v, this.hoja.formatos[col]);
      });
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  clearContent() {
    for (let r = 0; r < this.nFilas; r++) {
      const fila = this.hoja.datos[this.fila - 1 + r];
      if (!fila) continue;
      for (let c = 0; c < this.nCols; c++) fila[this.col - 1 + c] = '';
    }
    return this;
  }
  setFontWeight() { return this; }
  setNumberFormat(formato) {
    for (let c = 0; c < this.nCols; c++) {
      this.hoja.formatos[this.col - 1 + c] = formato;
    }
    return this;
  }
}

class Hoja {
  constructor(nombre) { this.nombre = nombre; this.datos = []; this.formatos = []; }
  getName() { return this.nombre; }
  getLastRow() {
    for (let i = this.datos.length - 1; i >= 0; i--) {
      const f = this.datos[i] || [];
      if (f.some(v => v !== '' && v !== null && v !== undefined)) return i + 1;
    }
    return 0;
  }
  getLastColumn() {
    let max = 0;
    this.datos.forEach(f => {
      for (let i = (f || []).length - 1; i >= 0; i--) {
        if (f[i] !== '' && f[i] !== null && f[i] !== undefined) { max = Math.max(max, i + 1); break; }
      }
    });
    return max;
  }
  getDataRange() { return new Rango(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  getRange(f, c, nf = 1, nc = 1) { return new Rango(this, f, c, nf, nc); }
  appendRow(fila) {
    this.datos[this.getLastRow()] = fila.map((v, c) =>
      comoLoGuardariaSheets(v, this.formatos[c]));
    return this;
  }
  setFrozenRows() { return this; }
  clear() { this.datos = []; return this; }
  getMaxRows() { return Math.max(this.datos.length, 1000); }
}

class Libro {
  constructor() { this.hojas = []; }
  getId() { return 'planilla-de-prueba'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/planilla-de-prueba/edit'; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return h; }
  getSheets() { return this.hojas; }
  deleteSheet(h) { this.hojas = this.hojas.filter(x => x !== h); }
  aJSON() {
    const o = {};
    this.hojas.forEach(h => { o[h.nombre] = h.datos; });
    return o;
  }
}

function formatearFecha(fecha, tz, formato) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(fecha).reduce((a, p) => (a[p.type] = p.value, a), {});
  if (partes.hour === '24') partes.hour = '00';
  return formato
    .replace("'T'", '\u0001')
    .replace(/yyyy/g, partes.year)
    .replace(/MM/g, partes.month)
    .replace(/dd/g, partes.day)
    .replace(/HH/g, partes.hour)
    .replace(/mm/g, partes.minute)
    .replace(/ss/g, partes.second)
    .replace('\u0001', 'T');
}

export function crearEntorno() {
  const libro = new Libro();
  const propiedades = new Map();
  const archivosDrive = [];
  const mails = [];

  const contexto = {
    console,
    Date, Math, JSON, String, Number, Boolean, Array, Object, RegExp, Error,
    isNaN, parseFloat, parseInt, encodeURIComponent, decodeURIComponent,

    SpreadsheetApp: {
      getActiveSpreadsheet: () => libro,
      getUi: () => { throw new Error('sin interfaz en la prueba'); }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (propiedades.has(k) ? propiedades.get(k) : null),
        setProperty: (k, v) => { propiedades.set(k, v); },
        deleteProperty: k => { propiedades.delete(k); }
      })
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: t => ({
        _texto: t,
        setMimeType() { return this; },
        getContent() { return this._texto; }
      })
    },
    Utilities: {
      formatDate: formatearFecha,
      getUuid: () => crypto.randomUUID(),
      base64Encode: s => Buffer.from(s, 'utf8').toString('base64'),
      base64EncodeWebSafe: s => Buffer.from(s, 'utf8').toString('base64url'),
      base64Decode: s => Array.from(Buffer.from(s, 'base64')),
      newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre }),
      DigestAlgorithm: { MD5: 'MD5' },
      computeDigest: (algoritmo, texto) => {
        const h = crypto.createHash('md5').update(texto, 'utf8').digest();
        // Apps Script devuelve bytes con signo, de -128 a 127.
        return Array.from(h).map(b => (b > 127 ? b - 256 : b));
      }
    },
    DriveApp: {
      getFileById: () => ({ getParents: () => ({ hasNext: () => false }) }),
      getRootFolder: () => ({
        getFoldersByName: () => ({ hasNext: () => false }),
        createFolder: nombre => carpetaFalsa(nombre)
      })
    },
    ScriptApp: {
      getService: () => ({ getUrl: () => 'http://localhost:8787/api' }),
      getProjectTriggers: () => [],
      WeekDay: { SATURDAY: 'sábado' },
      newTrigger: () => ({
        timeBased: () => ({
          atHour: () => ({ everyDays: () => ({ create: () => {} }), create: () => {} }),
          onWeekDay: () => ({ atHour: () => ({ create: () => {} }) }),
          everyMinutes: () => ({ create: () => {} })
        })
      }),
      deleteTrigger: () => {}
    },
    HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
    MailApp: {
      sendEmail: (para, asunto, cuerpo) => {
        if (para && typeof para === 'object') {
          mails.push({ para: para.to, asunto: para.subject,
            cuerpo: para.body || '', html: para.htmlBody || '' });
        } else {
          mails.push({ para, asunto, cuerpo, html: '' });
        }
      }
    }
  };

  function carpetaFalsa(nombre) {
    return {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: n => carpetaFalsa(n),
      createFile: blob => {
        archivosDrive.push(blob);
        return { getUrl: () => 'https://drive.de.mentira/' + encodeURIComponent(blob.nombre) };
      }
    };
  }
  contexto.DriveApp.getRootFolder = () => carpetaFalsa('raiz');

  vm.createContext(contexto);
  const dir = path.resolve('apps-script');
  // En CI no está Semilla.js (tiene los datos del campo y no se publica):
  // ahí se usa el de ejemplo, que tiene la misma forma.
  const semilla = fs.existsSync(path.join(dir, 'Semilla.js'))
    ? 'Semilla.js' : 'Semilla.ejemplo.js';
  ['Config.js', 'Stock.js', 'Escritura.js', 'Avisos.js', 'Parte.js',
    'Recalculo.js', 'Api.js', 'Menu.js', 'Instalar.js', semilla]
    .forEach(f => {
      vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), contexto, { filename: f });
    });

  return { contexto, libro, propiedades, archivosDrive, mails };
}
