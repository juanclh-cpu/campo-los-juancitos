/**
 * Google de mentira: implementa lo justo de SpreadsheetApp, Utilities,
 * PropertiesService, LockService, ContentService y DriveApp para poder correr
 * el Apps Script de verdad acá, en la computadora, y probarlo antes de subirlo.
 */

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';

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
      linea.forEach((v, c) => { this.hoja.datos[fi][this.col - 1 + c] = v; });
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
  setNumberFormat() { return this; }
}

class Hoja {
  constructor(nombre) { this.nombre = nombre; this.datos = []; }
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
    this.datos[this.getLastRow()] = fila.slice();
    return this;
  }
  setFrozenRows() { return this; }
  clear() { this.datos = []; return this; }
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
      newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre })
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
      newTrigger: () => ({
        timeBased: () => ({ atHour: () => ({ everyDays: () => ({ create: () => {} }) }) })
      }),
      deleteTrigger: () => {}
    },
    HtmlService: { createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => ({}) }) }) },
    MailApp: {
      sendEmail: (para, asunto, cuerpo) => { mails.push({ para, asunto, cuerpo }); }
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
  ['Config.js', 'Stock.js', 'Escritura.js', 'Avisos.js', 'Api.js', 'Menu.js',
    'Instalar.js', 'Semilla.js']
    .forEach(f => {
      vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), contexto, { filename: f });
    });

  return { contexto, libro, propiedades, archivosDrive, mails };
}
