/**
 * Antes de publicar: revisa que en el repo no haya quedado ningún token,
 * id de planilla, mail ni dato del campo.
 *
 *   node pruebas/revisar-repo.mjs
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Lo que no puede aparecer en ningún archivo publicado.
const SOSPECHAS = [
  ['token o clave', /AKfycb[\w-]{20,}|AIza[\w-]{30,}|ya29\.[\w-]+/g],
  ['id de planilla o de script', /\b1[A-Za-z0-9_-]{42,}\b/g],
  // ejemplo.com y example.com son dominios reservados para ejemplos.
  ['dirección de mail', /\b[\w.+-]+@(?!ejemplo\.com|example\.com)[\w-]+\.[\w.]{2,}\b/g],
  ['listado de potreros con hectáreas', /\['\w{1,4}',\s*\d+\.\d\s*,\s*'(Pastura|Verdeo|Agrícola)/g]
];

// Archivos que no se revisan: los genera npm y no los escribimos nosotros.
const SALTEAR = [/^package-lock\.json$/, /\.(png|jpe?g|svg|pdf|ico)$/];

// El ejemplo tiene potreros inventados a propósito.
const PERMITIDO = [/^apps-script\/Semilla\.ejemplo\.js$/];

const archivos = execSync('git ls-files', { encoding: 'utf8' }).trim().split('\n');
let problemas = 0;

for (const archivo of archivos) {
  if (SALTEAR.some(r => r.test(archivo))) continue;
  let texto;
  try { texto = fs.readFileSync(archivo, 'utf8'); } catch { continue; }
  for (const [etiqueta, patron] of SOSPECHAS) {
    if (PERMITIDO.some(r => r.test(archivo)) && /potreros/.test(etiqueta)) continue;
    const encontrados = [...new Set(texto.match(patron) || [])];
    for (const e of encontrados) {
      console.log(`  ⚠ ${archivo}: ${etiqueta} → ${e.slice(0, 60)}`);
      problemas++;
    }
  }
}

// Los archivos que nunca tienen que estar versionados.
for (const prohibido of ['apps-script/Semilla.js', '.clasp.json', '.clasprc.json']) {
  if (archivos.includes(prohibido)) {
    console.log(`  ⚠ ${prohibido} está versionado y no debería`);
    problemas++;
  }
}

console.log(problemas === 0
  ? '  ✓ el repo está limpio: se puede publicar'
  : `  ✗ ${problemas} cosa(s) para sacar antes de publicar`);
process.exit(problemas === 0 ? 0 : 1);
