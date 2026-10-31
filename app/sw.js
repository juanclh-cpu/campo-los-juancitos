/* Service worker: la app se abre siempre, con o sin señal.
   El armazón se guarda en el celular; a la planilla se habla sólo por red. */
var CACHE = 'campo-v1';
var ARCHIVOS = [
  './', 'index.html', 'estilos.css', 'app.js', 'manifest.webmanifest',
  'iconos/icono-192.png', 'iconos/icono-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(ARCHIVOS);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  // Todo lo que va a Google (la planilla) pasa derecho a la red.
  if (url.hostname.indexOf('google') >= 0) return;
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (r) {
      if (r) return r;
      return fetch(e.request).then(function (resp) {
        if (resp && resp.ok && url.origin === location.origin) {
          var copia = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
        }
        return resp;
      }).catch(function () {
        return caches.match('index.html');
      });
    })
  );
});
