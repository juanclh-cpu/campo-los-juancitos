# Campo — registro de lo que pasa en el campo

App de celular para que el encargado del campo registre lluvias, movimientos de
hacienda, recuentos, pesadas, sanidad y recorridas. Todo se guarda primero en el
celular y se manda a una planilla de Google cuando hay señal.

Pensada para alguien que no usa aplicaciones: botones grandes, una decisión por
pantalla, nada de texto obligatorio y una pantalla verde cuando quedó guardado.

## Cómo está armado

```
celular (PWA en GitHub Pages)          Google (privado)
┌──────────────────────────┐           ┌─────────────────────────────┐
│ app/      HTML + CSS + JS│  HTTPS    │ Apps Script (Web App)       │
│ IndexedDB: cola de envío │ ────────> │  doGet  catálogos y stock   │
│ localStorage: PIN y token│ <──────── │  doPost guardar / borrar    │
│ service worker: anda sin │           ├─────────────────────────────┤
│ señal                    │           │ Planilla: una hoja por tipo │
└──────────────────────────┘           │ + Stock + Libretas + Diario │
                                       └─────────────────────────────┘
```

- **Sin señal no se pierde nada.** Cada registro lleva un `id` propio (uuid) y
  espera en el celular. Cuando vuelve la señal se manda solo y reintenta cada
  minuto. El script descarta los `id` que ya tiene, así que reenviar nunca
  duplica.
- **Nadie entra a la planilla.** El encargado sólo usa la app. No hace falta
  cuenta de Google en el celular.
- **El cálculo no usa fórmulas.** El stock, las libretas y el diario de
  ocupación los arma el Apps Script en JavaScript y los escribe en las hojas.
  Las hojas de cálculo son el espejo legible, no la fuente.

## Qué hay en cada carpeta

| Carpeta | Qué es |
|---|---|
| `app/` | La PWA. HTML, CSS y JavaScript sin frameworks. Es lo que se publica en GitHub Pages. |
| `apps-script/` | El código que corre en Google, se sube con clasp. |
| `pruebas/` | Un Google de mentira para correr el Apps Script acá, más las pruebas. |
| `docs/` | Guía para el encargado (no se publica: tiene datos del campo). |

Lo que **no** está en el repo, a propósito: el listado de potreros, los nombres
de los clientes y el token. Todo eso vive en la planilla, que es privada. Hay un
`apps-script/Semilla.ejemplo.js` con datos inventados para que se entienda el
formato.

## Poner en marcha un campo nuevo

```bash
npm i -g @google/clasp && clasp login
```

1. Creá la planilla y el script:
   ```bash
   clasp create --type sheets --title "Registro Campo" --rootDir apps-script
   clasp push
   ```
2. Movelá a la carpeta de Drive que corresponda.
3. Copiá `apps-script/Semilla.ejemplo.js` a `apps-script/Semilla.js`, poné los
   potreros, los dueños y las categorías de tu campo, `clasp push` y corré
   `sembrarCatalogos()` una vez desde el editor.
4. Publicá el Web App:
   ```bash
   clasp deploy --description "produccion"
   ```
   Autorizá los permisos la primera vez (pide Drive para guardar las fotos).
5. Publicá `app/` en GitHub Pages y, en la planilla, usá
   **Campo Los Juancitos → Cambiar la dirección de la app** para pegar esa URL.
6. **Campo Los Juancitos → Ver el código de activación**: abrí ese enlace una
   sola vez en el celular del encargado. Queda activado y el código no se ve
   nunca más.

### Si se pierde el celular

En la planilla: **Campo Los Juancitos → Generar un código nuevo**. El celular
viejo deja de poder guardar en el acto y hay que activar el nuevo con el enlace
que aparece.

## Las pruebas

```bash
npm test
```

Corre las tres de una. Por separado:

```bash
node pruebas/prueba-offline.mjs     # 120 registros sin señal, reconexión y stock
node pruebas/prueba-pantallas.mjs   # un registro de cada tipo tocando los botones
node pruebas/prueba-orden.mjs       # orden de eventos del mismo día y carga histórica
```

Las dos primeras manejan un Chrome de verdad, así que necesitan Google Chrome
instalado. Ninguna toca la planilla real: todas corren contra el Google de
mentira de `pruebas/google-falso.mjs`, que ejecuta el mismo Apps Script que se
sube a Google.

Para mirar la app a mano:

```bash
node pruebas/servidor.mjs
# después abrir la dirección que imprime /_activacion
```

## Estructura de las hojas

Las columnas salen de `apps-script/Config.js`; si cambian ahí, cambian acá.
Todas las hojas de registro terminan con las mismas cuatro columnas de control:

| Columna | Qué es |
|---|---|
| `cargado_en` | Fecha y hora reales en que se cargó, `aaaa-mm-ddThh:mm:ss`. Define el orden dentro de un mismo día. |
| `dispositivo` | Qué celular lo mandó. |
| `origen_carga` | `App` o `Carga histórica`. |
| `estado` | `activo` o `borrado`. El cálculo ignora las borradas. |

### Hojas de registro

| Hoja | Columnas (en orden) |
|---|---|
| **Lluvias** | `id`, `fecha`, `mm`, `lugar`, `nota`, + control |
| **Movimientos** | `id`, `fecha`, `potrero_origen`, `potrero_destino`, `categoria`, `dueno`, `cabezas`, `motivo`, `nota`, + control |
| **Recuentos** | `id`, `fecha`, `potrero`, `categoria`, `dueno`, `cabezas`, `nota`, + control |
| **Pesadas** | `id`, `fecha`, `potrero`, `categoria`, `dueno`, `cabezas_pesadas`, `kg_modo`, `kg_cargados`, `kg_totales`, `kg_promedio`, `momento`, `foto_url`, `nota`, + control |
| **Sanidad** | `id`, `fecha`, `potrero`, `tipo`, `categoria`, `categoria_destino`, `dueno`, `cabezas`, `causa_producto`, `foto_url`, `nota`, + control |
| **Recorridas** | `id`, `fecha`, `potrero`, `agua`, `alambre`, `pasto`, `foto_url`, `nota`, + control |

- `potrero_origen` puede ser `Entrada al campo`; `potrero_destino` puede ser `Salida del campo`.
- `kg_modo` es `total` o `promedio`: es lo que cargó el encargado. `kg_totales` y
  `kg_promedio` los calcula el script, siempre están los dos.
- `momento` es `Entrada`, `Salida` o `Control`.
- `tipo` (Sanidad) es `Nacimiento`, `Muerte`, `Enfermo`, `Tratamiento`,
  `Vacunación` o `Cambio de categoría`. `categoria_destino` sólo se usa en el
  cambio de categoría.
- `pasto` es `1 Poco`, `2 Normal` o `3 Mucho`.

### Hojas de referencia (se editan a mano, la app las lee)

| Hoja | Columnas |
|---|---|
| **Potreros** | `id`, `lote`, `hectareas`, `uso`, `activo` |
| **Dueños** | `dueno`, `orden`, `activo` |
| **Categorías** | `categoria`, `orden`, `activo` |

`activo` en `no` saca esa fila de la app sin borrar el historial.

### Hojas que calcula el script (no editar a mano: se reescriben enteras)

| Hoja | Columnas |
|---|---|
| **Stock** | `potrero`, `lote`, `hectareas`, `categoria`, `dueno`, `cabezas`, `desde`, `dias`, `recalculado_en` |
| **Resumen stock** | `dueno`, `categoria`, `cabezas`, `ultimo_evento`, `recalculado_en` |
| **Diario de ocupación** | `fecha`, `potrero`, `lote`, `hectareas`, `categoria`, `dueno`, `cabezas` |
| **Libreta &lt;Dueño&gt;** | `Fecha`, `Categoría`, `Ingreso`, `Egreso`, `Muertes`, `Stock`, `Potrero`, `Comentarios / sanidad`, `id_registro` |
| **Log** | `cargado_en`, `accion`, `dispositivo`, `recibidos`, `guardados`, `repetidos`, `detalle` |

- `desde` es desde cuándo ese grupo está en ese potrero, y `dias` los días de
  pastoreo hasta hoy. Sirve para estimar kilos producidos por potrero:
  cabezas × días × ganancia diaria, cruzado con las pesadas.
- Hay una hoja **Libreta** por cliente y se crea sola cuando aparece un dueño
  nuevo. `Stock` es el saldo corrido de ese dueño en esa categoría, sumando
  todos los potreros. Los traslados entre potreros del mismo dueño no aparecen,
  porque no le cambian el stock al cliente. Un recuento aparece como fila de
  ajuste con la diferencia.
- En **Stock**, un número negativo quiere decir que se sacó hacienda de un
  potrero que nunca se contó.

## Cargar las libretas de papel (carga histórica)

Se pegan filas a mano en `Movimientos`, `Recuentos` y `Sanidad` con la columna
`origen_carga` en `Carga histórica` y la columna `estado` en `activo`. No hace
falta poner `cargado_en`. Después, **Campo Los Juancitos → Recalcular todo**.

Dentro de un mismo día, las filas históricas se aplican antes que lo cargado con
la app, y entre ellas primero los recuentos y después los movimientos. Lo que
carga la app en el día se ordena por la hora real de carga, así que si el
encargado mueve y después cuenta, manda el recuento.

## Decisiones que conviene saber

- **Un potrero en negativo no es un error del programa**: quiere decir que se
  sacó hacienda de un potrero que nunca se contó. La app lo avisa en *Hacienda
  hoy* y se arregla contando ese potrero.
- **Corregir = borrar y volver a cargar.** Más simple de explicar y deja el
  historial completo.
- **Nada se borra de verdad.** Las filas borradas quedan con `estado` en
  `borrado` y el cálculo las ignora.
- **El PIN es sólo para que no abra cualquiera el celular.** Se pide una vez
  cada 12 horas. Lo que protege la planilla es el token.
- **Las fotos quedan privadas.** Se guardan en la subcarpeta *Registro Campo -
  Fotos* de Drive y en la planilla queda el link; sólo lo abre quien tenga
  acceso a esa carpeta.
