# C01 · Contrato de controles del rig

Fecha: 2026-09-09. Base: `14cc4f1`. Autor: Claude. Etapa C del plan maestro.
Estado de la tarea C01: **investigación cerrada**. Incluye un defecto encontrado,
reproducido y corregido. No abre C02 ni C03.

## 1. Qué se mapeó

Cuatro almacenes, no dos. La confusión de nombres venía de que sólo tres son reales.

| Almacén | Qué guarda | Forma |
|---|---|---|
| `rig.controls[id]` | La **definición** del dial | `{ id, name, min, max, default, group }` |
| `rig.channels["controls/<id>"]` | La **animación** del dial (claves y curvas) | canal estándar |
| `rig.actions[id].driver.path` | Quién **conduce** una acción de Smart Bone | string de ruta de canal |
| `rig.controllers` | **Nada.** Clave heredada | `{}` siempre |

## 2. El contrato, en una frase

**Un control es un canal con nombre.** Su definición vive en `rig.controls[id]`
y su animación en el canal `controls/<id>`, vía `animation.rigControlPath(id)`
(que hace `encodeURIComponent` del id).

Esa decisión es la que hace todo lo demás barato: al ser un canal común, el dial
hereda claves por cuadro, interpolación, curvas y tangentes en el Function Editor,
y puede conducir un Smart Bone igual que el ángulo de un hueso. No hay un motor
de controles aparte, y **no hay que construirlo** — es la corrección que Codex ya
anotó en el plan respecto de su comparación inicial con Harmony.

### La referencia única

Todo apunta a un control por **ruta de canal**, nunca por objeto. `createRigAction`
acepta tres formas de conductor y las tres colapsan en un string:

- `driverPath` → se usa tal cual
- `driverControl` → `controls/<id>`
- `driverBone` (+ `driverProperty`, por defecto `"r"`) → `rigChannelPath(hueso, prop)`

Consecuencia útil: **un dial y el ángulo de un hueso son intercambiables** como
conductores. Cualquier cosa que acepte uno acepta el otro.

### `id` vs `name`

- `id` es la referencia: es la clave del mapa, el campo `control.id` y el segmento
  de la ruta del canal. Cambiarlo rompe el canal y todo driver que lo apunte.
- `name` es sólo rótulo para el artista. Cambiarlo es libre y no arrastra nada.

## 3. La clave fantasma y su migración

`rig.controllers` **no es el store de controles**. Medido en `tools/repro_c01_controles.js`:

- **1 escritura:** `clearRig` la resetea.
- **1 lectura:** `replaceRig` hace `clone(source.controllers || {})`, es decir la
  copia hacia adelante sin mirar su contenido.
- **0 consultas:** nadie decide nada en base a ella.

Es una clave de paso. **Migración propuesta:** dejar de emitirla en la forma
canónica de `replaceRig` y borrar su reset en `clearRig`, en un commit aparte que
sólo haga eso. Es seguro porque nadie la lee, pero conviene aislarlo para que si
un personaje guardado viejo la trae, el diff muestre exactamente qué se dejó de
propagar. **No hacerlo dentro de C02**, para no mezclarlo con el editor visual.

## 4. Defecto encontrado y corregido

`clearRig()` reseteaba `controllers` (la fantasma) y **no** `controls` (el store
real). Después de «Eliminar esqueleto completo» quedaban las definiciones de
control vivas, sin huesos y sin canal.

Lo que se ve desde el producto: como `createRigControl` rechaza un id ya existente,
**el artista no podía volver a crear un control con un nombre que ya había usado**.
El id quedaba tomado por un fantasma invisible en la UI.

Corrección: una línea en `clearRig`, `rig.controls = {}`.

Verificación: `node tools/repro_c01_controles.js` — sin el arreglo falla en dos
assertions (control huérfano y nombre no reutilizable); con el arreglo pasa entero.
Comprobado quitando la línea y restaurándola, no sólo corriendo la suite.
`node tools/run_smart_bones_tests.js` sigue en 51/51.

Nota: `removeRigControl` **sí** hacía la cascada correcta (borra definición, borra
el canal y deja en `null` el driver de las acciones que lo conducían). El hueco
estaba sólo en el borrado masivo. Y corrijo un análisis propio previo: `replaceRig`
**sí** maneja `controls` vía `rigControlsData`; ahí no había pérdida.

## 5. Huecos que hereda C02

- ~~**No existe renombrar un control.**~~ **Resuelto, y mi diagnóstico inicial
  estaba exagerado.** Dije que renombrar era un prerrequisito riesgoso de C02 que
  exigía migrar el canal y reapuntar los drivers. Es falso, y la razón está en
  `app.js:9489`: el `id` es un **slug derivado del nombre al crear**
  (`limpio.toLowerCase().replace(/\s+/g,"_")…`) y el panel muestra `c.name || id`.
  El artista **nunca ve el id**. Cuando escribe mal un nombre, lo que necesita es
  corregir el **rótulo**, y eso no arrastra ninguna referencia.

  Agregado en su lugar: `setRigControlName(id, name)`, de una línea de efecto y
  cero migración. La prueba (sección 4 del repro) verifica lo que importa: tras
  renombrar, el dial **conserva sus claves de animación y el conductor de la
  acción**. Borrar y recrear —la única salida anterior— perdía las dos cosas,
  y eso sí está medido.

  La migración de `id` queda como **no necesaria**: sólo haría falta si algún día
  el id se expone al artista o si se quiere que los ids sigan siendo legibles para
  intercambio de biblioteca. No bloquea C02.
- **`group` no tiene consumidor.** La definición ya guarda `group: ""`, pero nada
  lo usa todavía. Es el gancho natural para los conjuntos reutilizables de C05
  (ojos, cejas, boca, manos).
- **`clearRig` no resetea `diagnostics`.** No lo toqué: no tengo evidencia de que
  cause un problema y no quiero mezclarlo con este arreglo. Queda como pregunta
  para A01, que es el inventario.

## 6. Qué NO afirma este documento

No revisé la UI de controles de `app.js` (líneas ~9506-9578) más allá de constatar
que llama a estas cuatro operaciones. La descubribilidad y el recorrido visual son
C02. Tampoco medí persistencia en disco de un personaje con controles a través de
guardar/reabrir: eso es A03 y D02, y hay que hacerlo con un archivo real.
