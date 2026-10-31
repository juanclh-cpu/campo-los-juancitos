/* Service worker: la app se abre siempre, con o sin señal.
   El armazón se guarda en el celular; a la planilla se habla sólo por red.

   Estrategia: se muestra lo guardado (rápido, y anda sin señal) y en paralelo
   se baja la versión nueva para la próxima vez que abra. Así una mejora llega
   sola al teléfono sin que nadie tenga que borrar nada.

   VERSION hay que subirla en cada cambio: eso es lo que hace que el navegador
   se dé cuenta de que este archivo cambió y tire la copia vieja. */
var VERSION = 'v4';
var CACHE = 'campo-' + VERSION;
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
  if (url.origin !== location.origin) return;

  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(e.request).then(function (guardado) {
        var deLaRed = fetch(e.request).then(function (resp) {
          if (resp && resp.ok) cache.put(e.request, resp.clone());
          return resp;
        }).catch(function () {
          return guardado || cache.match('index.html');
        });
        // Lo guardado sale al toque; la versión nueva queda para la próxima.
        return guardado || deLaRed;
      });
    })
  );
});
