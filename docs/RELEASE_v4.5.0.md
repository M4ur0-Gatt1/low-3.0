# LOW v4.5.0 — Function Editor: las curvas del movimiento, editables

Esta versión cierra el hueco más grande que quedaba del bloque 2D en la biblia
(§6 y §12 SIGUIENTE·2) y el último P0 abierto de la matriz de regresión.

## Implementado

### Function Editor

El modelo ya guardaba canales por propiedad con claves, curvas por clave y modo
de interpolación; lo que no existía era la ventana para verlos y tocarlos. Sin
eso, el timing sólo se podía corregir a ciegas moviendo poses.

Se abre desde la barra de la Timeline o desde **Ventana → Editor de funciones**,
y cubre las ocho condiciones que la biblia le exige:

| §6 pide | Cómo está |
|---|---|
| Canales por propiedad | Lista a la izquierda, una fila por curva, con su conteo de claves |
| Curvas Bezier editables | Manijas de entrada y salida de la clave seleccionada, arrastrables |
| Tangentes | **Suave**, **Lineal** y **Escalón**; *Libre* es lo que queda al mover una manija a mano |
| Edición numérica | Cuadro y valor de la clave, en la barra |
| Regiones de tiempo | **In**/**Out** acotan lo que se dibuja y se edita |
| Copiar y pegar curvas | Copia **sólo el timing**: los valores de las poses no se tocan |
| Filtros | «Selección» muestra únicamente los canales del hueso activo |
| Sincronía con Timeline y X-sheet | Una sola cabeza lectora: hacer clic en el editor mueve el cuadro del documento |

Además: doble clic crea una clave, `Supr` borra la seleccionada, y arrastrar una
clave cambia su valor y su cuadro **en una sola transacción** —la vista previa
durante el arrastre no ensucia el historial—.

La vista **no guarda estado propio del documento**: lee del modelo y escribe con
los comandos del documento, así que Undo/Redo, guardado y reapertura salen
gratis y no hay dos verdades sobre la misma curva.

### `HIST-02` — el último P0 de la matriz

Copiar, cortar y pegar celdas vivía **tres veces**: en la X-sheet, en la barra de
la Timeline y en el teclado. Bastaba tocar una para que las tres dejaran de
producir el mismo estado. Ahora es un solo comando (`shortcuts.cells`) con el
mismo rango, las mismas etiquetas de Undo y el mismo mensaje, venga de donde
venga. **Con esto la matriz no tiene ningún P0 pendiente.**

## Corregido

- El recorrido E2E del esqueleto arrancaba con el workspace que hubiera dejado
  guardado una corrida anterior. Con la X-sheet abierta, `Supr` lo maneja ella,
  así que la prueba medía el estado de OTRA prueba en vez de una regresión.
  Ahora arranca en limpio.

## Modelo

Tres comandos nuevos, con Undo: `removeRigChannelKey` (borrar una clave sin
dejar la pose del hueso contando otra historia), `setRigChannelEase` (la curva de
una clave de cualquier canal) y `setRigChannelInterpolation`.

## Pruebas

- Modelo 2D **353/353** (6 nuevas de `HIST-02`, más las 14 de `v4.4.2`).
- Recorrido nuevo `tools/check_function_editor_ui.js` en la puerta de CI:
  verifica las ocho condiciones de §6 sobre un documento real, incluida la
  prueba de que una curva Bezier editada **cambia el movimiento** (el valor
  interpolado en el cuadro 18 pasa de 17,5 lineal a 26,7 suave y a 45 en
  escalón).
- Siete contratos estáticos nuevos.
- Los **11** recorridos E2E de Chromium en verde.

## Pendiente

- Smoke del ejecutable empaquetado.
- De §12 SIGUIENTE quedan: pesos/flexi-binding y mallas (parcial), Smart Bones y
  acciones (sin empezar), audio y lipsync consolidados, y la prueba de mocap con
  videos reales variados.
- `check_color_studio_ui.js` pasa localmente pero sigue fuera de CI.

## Reversión

Estable previa: `v4.4.2`. El editor sólo lee y escribe canales que el formato ya
guardaba, así que una escena tocada con `v4.5.0` abre en `v4.4.2` sin pérdida.
