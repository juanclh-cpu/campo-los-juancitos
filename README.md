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
  cuenta de Google ni clave en el celular: el código de activación se abre una
  sola vez y queda guardado. Si se pierde el teléfono, se genera un código
  nuevo desde el menú de la planilla y el viejo deja de servir en el acto.
- **Se sabe quién cargó qué.** Cada celular guarda el nombre de quien lo usa y
  lo manda en cada registro, así el dueño puede cargar desde su propio teléfono
  sin mezclarse con el encargado.
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

### El menú de la planilla

| Opción | Qué hace |
|---|---|
| Instalar (una sola vez) | Carga los catálogos, mueve la planilla a su carpeta y arma los horarios. |
| Poner las hojas al día | Agrega las columnas nuevas sin perder lo cargado. Se usa al actualizar el código. |
| Recalcular stock y libretas | Rápido, sin el diario de ocupación. |
| Recalcular todo | Incluye el diario de ocupación. |
| Probar los avisos por mail | Manda un mail de prueba a los destinatarios configurados. |
| Mandar parte semanal ahora | Manda el parte de los últimos 7 días sin esperar al sábado. |
| Ver / Generar el código de activación | El enlace que se abre en el celular. |
| Vaciar todos los registros | Borra todo lo cargado. Pide escribir BORRAR. No toca catálogos ni configuración. |

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
| **Lluvias** | `id`, `fecha`, `persona`, `mm`, `lugar`, `nota`, + control |
| **Movimientos** | `id`, `fecha`, `persona`, `potrero_origen`, `potrero_destino`, `categoria`, `dueno`, `cabezas`, `motivo`, `nota`, + control |
| **Recuentos** | `id`, `fecha`, `persona`, `potrero`, `categoria`, `dueno`, `cabezas`, `nota`, + control |
| **Pesadas** | `id`, `fecha`, `persona`, `potrero`, `categoria`, `dueno`, `cabezas_pesadas`, `kg_modo`, `kg_cargados`, `kg_totales`, `kg_promedio`, `momento`, `foto_url`, `nota`, + control |
| **Sanidad** | `id`, `fecha`, `persona`, `potrero`, `tipo`, `categoria`, `categoria_destino`, `dueno`, `cabezas`, `causa_producto`, `foto_url`, `nota`, + control |
| **Recorridas** | `id`, `fecha`, `persona`, `potrero`, `agua`, `alambre`, `pasto`, `foto_url`, `nota`, + control |

`persona` es quién cargó el registro: cada celular guarda un nombre al
activarse y lo manda en todo lo que carga. `dueno` es otra cosa: de quién es la
hacienda.

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
| **Configuración** | `clave`, `valor`, `qué es` |
| **Avisos** | `fecha`, `mensaje`, `activo` |

`activo` en `no` saca esa fila de la app sin borrar el historial.

Claves de **Configuración**:

| Clave | Qué hace |
|---|---|
| `mail_avisos` | A quién le llegan los avisos. Varios mails separados por coma. |
| `mail_encargado` | Mail del encargado, sólo para el aviso de inactividad. |
| `avisar_cada_registro` | `sí` o `no`: mail cada vez que llegan registros del celular. |
| `dias_sin_registrar` | A los cuántos días sin registros avisar. Por defecto 5. |
| `mail_parte` | A quién le llega el parte semanal de los sábados. Vacío: no se manda. |
| `dias_descanso_max` | En el parte, avisar los potreros con más días de descanso. Por defecto 45. |
| `dias_ocupado_max` | En el parte, avisar los potreros ocupados hace más días. Por defecto 7. |

### Hojas que calcula el script (no editar a mano: se reescriben enteras)

| Hoja | Columnas |
|---|---|
| **Stock** | `potrero`, `lote`, `hectareas`, `categoria`, `dueno`, `cabezas`, `desde`, `dias`, `recalculado_en` |
| **Descanso** | `potrero`, `lote`, `hectareas`, `uso`, `ocupado`, `cabezas_hoy`, `ultima_salida`, `dias_descanso`, `dias_ocupado` |
| **Resumen stock** | `dueno`, `categoria`, `cabezas`, `potreros`, `ultimo_evento`, `recalculado_en` |
| **Diario de ocupación** | `fecha`, `potrero`, `lote`, `hectareas`, `categoria`, `dueno`, `cabezas` |
| **Libreta &lt;Dueño&gt;** | `Fecha`, `Categoría`, `Ingreso`, `Egreso`, `Muertes`, `Stock`, `Potrero`, `Comentarios / sanidad`, `id_registro` |
| **Log** | `cargado_en`, `accion`, `persona`, `dispositivo`, `recibidos`, `guardados`, `repetidos`, `detalle` |

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

## Avisos por mail

Se configuran en la hoja **Configuración** y los manda el propio Apps Script,
sin servicios de por medio.

- **Cada envío del celular** dispara un mail con lo que se cargó, contado en
  castellano. Es uno por envío, no uno por registro: si el celular estuvo sin
  señal y manda diez juntos, llega un solo mail con los diez. Un reenvío de
  algo ya guardado no vuelve a avisar.
- **A los días sin registros** (5 por defecto) sale un recordatorio al dueño y
  al encargado. Lo dispara un horario diario a las 9 y no insiste: espera tres
  días antes de repetirlo. La app además muestra un cartel en la pantalla
  principal cuando pasa ese tiempo sin cargar nada.
- **Los sábados a las 8** sale el **parte semanal** en HTML a `mail_parte`: qué
  pasó día por día con quién lo cargó, los días sin nada anotado, lo que hay
  para revisar, el stock por cliente y los potreros pasados de descanso o de
  ocupación. Para probarlo: *Mandar parte semanal ahora*.

Para probarlos: **Campo Los Juancitos → Probar los avisos por mail**.

## Cargar las libretas de papel (carga histórica)

Se pegan filas a mano en `Movimientos`, `Recuentos` y `Sanidad` con la columna
`origen_carga` en `Carga histórica` y la columna `estado` en `activo`. No hace
falta poner `cargado_en`. Después, **Campo Los Juancitos → Recalcular todo**.

Dentro de un mismo día, las filas históricas se aplican antes que lo cargado con
la app, y entre ellas primero los recuentos y después los movimientos. Lo que
carga la app en el día se ordena por la hora real de carga, así que si el
encargado mueve y después cuenta, manda el recuento.

## Decisiones que conviene saber

- **Si se mueve más hacienda de la que había cargada**, la diferencia se da de
  alta sola a nombre de ese dueño, en vez de dejar el potrero en negativo. En
  la libreta del cliente queda una fila de ingreso con el comentario "Alta
  automática... Confirmar con un recuento". Pasa cuando se mueve hacienda de un
  potrero que nunca se contó.
- **Un potrero en negativo** todavía puede aparecer si se cargan más muertes
  que cabezas anotadas. La app lo avisa en *Stock* y se arregla contando ese
  potrero.
- **Los avisos para el encargado** se escriben a mano en la hoja Avisos y
  aparecen arriba de todo en la pantalla principal de la app hasta que se
  ponen en `no`.
- **La pestaña se llama "Manejo" en la app, pero la hoja sigue siendo
  "Sanidad".** Es sólo la etiqueta: el nombre de la hoja no cambia para no
  romper lo que ya lee la planilla.
- **Después de guardar algo que mueve hacienda**, la app muestra cómo quedó el
  potrero con los números que devuelve la planilla, no con una cuenta hecha en
  el teléfono. Si algo quedó en negativo o hubo un alta automática, lo marca en
  rojo y espera a que lo lean; si está todo bien, vuelve sola a los 8 segundos.
- **Un potrero con `activo` en `no` no aparece en la grilla** de la app, pero
  sigue saliendo en Stock y en Descanso si tiene hacienda, para que no se
  pierda de vista.
- **Corregir = borrar y volver a cargar.** Más simple de explicar y deja el
  historial completo.
- **Nada se borra de verdad.** Las filas borradas quedan con `estado` en
  `borrado` y el cálculo las ignora.
- **El PIN es sólo para que no abra cualquiera el celular.** Se pide una vez
  cada 12 horas. Lo que protege la planilla es el token.
- **Las fotos quedan privadas.** Se guardan en la subcarpeta *Registro Campo -
  Fotos* de Drive y en la planilla queda el link; sólo lo abre quien tenga
  acceso a esa carpeta.
