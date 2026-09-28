# LOW v4.52.0 — capas como en Harmony, y el rescate deja de perderse solo

Versión pensada para la prueba con chicos: una función grande que ya estaba
terminada y esperando, y un defecto silencioso que les habría costado trabajo.

## 1. Capas como en Harmony / Photoshop

Antes el lienzo mostraba **sólo la capa activa**: para calcar había que adivinar.
Ahora:

- **Se ven todas las capas mientras dibujás.** La de adelante es la fila de
  arriba, como en Harmony y Photoshop.
- **Mesa de luz por capa** (el foquito): la capa se ve lavada para calcar
  encima, y **el export no cambia** — lo que se ve lavado es la mesa, no la
  película.
- **Opacidad y modos de fusión** desde el panel de propiedades. El PNG exportado
  los compone con el **mismo motor** que el editor, así que lo que ves es lo que
  sale. Medido en píxeles: azul en Multiplicar sobre el círculo rojo da negro;
  en Normal, azul.
- **Adelante / Atrás**, duplicar y eliminar, con el modal propio.
- Cada cambio es **un** Deshacer.

Y dos arreglos que venían con esto: «+ Capa» a la vista, Deshacer sin quedar en
bucle al crear una capa, y cambiar de capa ya no pisa el dibujo de otra.

## 2. El almacén de rescate tenía fondo infinito

Esto no lo buscaba: salió de investigar por qué una prueba fallaba en un
servidor y pasaba en otro.

Cada escena que se abre deja su punto de recuperación y **nada los borraba**.
Medido en la máquina de pruebas: **64 escenas viejas**, de 2,5 a 12 KB cada una.
El navegador da unos 5 MB por origen; cuando se llena, `setItem` tira, el `catch`
se lo tragaba y `saveNow` devolvía `false`. Es decir: **LOW dejaba de guardar el
punto de recuperación en silencio**. El día que se cierra mal no hay nada que
recuperar, y nada explica por qué.

Ahora se conservan los **12 más recientes**, y si aun así no entra, hace lugar
tirando lo más viejo y reintenta: perder un rescate viejo es barato, perder el
de ahora no.

## Pruebas

- **`check_capas_harmony_ui.js`**, nueva y en CI: apilado, mesa de luz sin tocar
  el export, fusión y opacidad **medidas en píxeles del PNG**, adelante/atrás,
  duplicar/eliminar y un Deshacer por cambio.
- **`check_rescate_tope_ui.js`**, nueva y en CI: guardar 30 escenas no deja un
  historial infinito y lo que sobrevive es lo más nuevo; con el almacenamiento
  lleno, el rescate de ahora **se guarda igual**. Mutación verificada.
- **Tres pruebas que mentían**, arregladas:
  - `check_capas_harmony_ui` medía el píxel en (700,600), **fuera** del círculo
    naranja (que llega a x=660): medía el fondo blanco y fallaba sola.
  - `check_cambiar_capa_ui` exigía que la Capa 2 **no mostrara** el dibujo de la
    Capa 1 — justo lo que el modelo de capas cambió a propósito. Ahora exige lo
    que de verdad protege el dibujo: que el arte ajeno **no entre en el grupo
    activo**, que es de donde sale lo que se guarda. Mutación verificada.
  - `check_rig_control_ui` no limpiaba el `localStorage` y fallaba con 25 claves
    de corridas anteriores; con el almacén limpio pasa. Medido las dos veces.

Puerta completa: **103 comprobaciones**, y la puerta local ahora **lee la lista
del propio CI** en vez de ser una copia a mano que se desincronizaba.

## Reversión

Estable previa: `v4.51.0`. Lo nuevo vive en `ui/animation/capas-en-mesa.js`,
`ui/animation/capas-propiedades.js` y el tope en `ui/workspace/recovery.js`.
