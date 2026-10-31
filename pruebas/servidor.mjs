/**
 * Servidor de prueba: corre el Apps Script de verdad sobre el Google de mentira
 * y sirve la PWA, para poder probar todo sin tocar la planilla real.
 *
 *   node pruebas/servidor.mjs [puerto]
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { crearEntorno } from './google-falso.mjs';

const PUERTO = Number(process.argv[2] || 8787);
const entorno = crearEntorno();
const { contexto, libro, mails } = entorno;

// Catálogos cargados, igual que en la planilla de verdad.
contexto.sembrarCatalogos();
// Y un mail de mentira, para poder probar los avisos.
contexto.completarConfig_('mail_avisos', 'prueba@ejemplo.com');
const TOKEN = contexto.enlaceActivacion_().token;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  if (url.pathname === '/api') {
    try {
      let salida;
      if (req.method === 'POST') {
        const cuerpo = await new Promise(ok => {
          let d = '';
          req.on('data', c => { d += c; });
          req.on('end', () => ok(d));
        });
        salida = contexto.doPost({ postData: { contents: cuerpo } });
      } else {
        const parametros = Object.fromEntries(url.searchParams.entries());
        salida = contexto.doGet({ parameter: parametros });
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(salida.getContent());
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: false, error: String(e && e.stack || e) }));
    }
  }

  // Para las pruebas: volcado completo de la planilla y datos de activación.
  if (url.pathname === '/_planilla') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(libro.aJSON()));
  }
  if (url.pathname === '/_activacion') {
    const codigo = Buffer.from(JSON.stringify({
      u: 'http://localhost:' + PUERTO + '/api', t: TOKEN
    }), 'utf8').toString('base64url');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ token: TOKEN, codigo }));
  }
  if (url.pathname === '/_mails') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(mails));
  }
  if (url.pathname === '/_recalcular') {
    contexto.escribirCalculos_(true);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true }));
  }

  // PWA estática
  let rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const archivo = path.join(path.resolve('app'), rel);
  if (!archivo.startsWith(path.resolve('app')) || !fs.existsSync(archivo)) {
    res.writeHead(404); return res.end('no está');
  }
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'text/plain' });
  res.end(fs.readFileSync(archivo));
});

servidor.listen(PUERTO, () => {
  console.log('servidor de prueba en http://localhost:' + PUERTO);
  console.log('token: ' + TOKEN);
});
