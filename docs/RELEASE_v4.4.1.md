# LOW v4.4.1 — Un guardado que falla ya no se lleva el trabajo

Patch de integridad. Cierra tres P0 de `docs/LOW_2D_REGRESSION_MATRIX.md` que
estaban abiertos desde que existe la matriz: `SAVE-03`, `SAVE-04` y `RECV-02`.

## El defecto

El puente devuelve un **objeto** también cuando la escritura falla
(`{error, path, recoverable}`), y en JavaScript todo objeto es verdadero. Los
cuatro caminos de guardado preguntaban `if (r)` o `if (r && r.path)`, así que
daban por escrito lo que nunca se escribió:

- marcaban el documento como **limpio**,
- **borraban el punto de recuperación**,
- y anunciaban «guardado».

Verificado sobre `v4.4.0`: con el disco fallando, `dzSave` y `dzPersist`
dejaban `dirty:false` y el punto de recuperación en `null`. Un disco lleno, una
carpeta sin permisos o una unidad de red caída se llevaban el trabajo en
silencio, y el auto-guardado —que nadie mira— lo hacía solo.

## Corregido

- **`SAVE-03` / `SAVE-04`.** Un guardado cuenta como exitoso sólo si trae `path`
  y no trae `error`. Si falla: el documento queda sucio, la pestaña marcada, el
  punto de recuperación **se conserva**, y el aviso dice qué pasó y que la
  versión anterior en disco sigue intacta. El mensaje de éxito y el borrado del
  punto ocurren únicamente después de que el disco confirmó.
- Alcanza a los cuatro caminos: `Ctrl+S` del diseño, auto-guardado, guardado de
  escena `.lowscene`, editor de código y LOW Estudio 3D.
- **El auto-guardado fallido escribe además un punto de recuperación** con ruta,
  contenido, hora y última operación, en vez de perder lo que no pudo grabar.
- **`RECV-02`.** El trabajo recuperable ya no se ofrece con un sí/no: el diálogo
  tiene las tres salidas de la matriz —**Recuperar, Comparar y Descartar**— y
  muestra la hora del punto, la última operación, el cuadro y la herramienta.
  **Comparar dibuja las dos versiones**, la del disco y la recuperada, que es la
  única forma honesta de elegir. Cerrar el diálogo sin elegir **conserva** el
  punto: cancelar no puede ser una manera silenciosa de perder trabajo.
- Cerrar un modal con Escape o clic afuera ya resuelve su promesa. Antes quedaba
  pendiente para siempre y colgaba en silencio al flujo que la esperaba.

## Pruebas

- Nuevo recorrido `tools/check_save_recovery_ui.js`, en la puerta de CI: simula
  el puente fallando como falla de verdad —objeto con `error`, sin excepción— y
  exige documento sucio, punto conservado con sus cuatro datos, limpieza sólo
  tras confirmar, las tres salidas del diálogo, la comparación dibujada y que
  cancelar conserve. Se verificó que **falla** contra `v4.4.0`.
- Nueve contratos estáticos nuevos sobre los caminos de guardado y el diálogo.
- Batería completa en verde: modelo 333/333, multiplano 14/14, colaboración 8/8,
  storyboard, malla 15/15, schematic 16/16, puentes, contratos y los **10**
  recorridos E2E de Chromium.

## Pendiente

- Smoke del ejecutable empaquetado sobre Windows.
- Siguen abiertos los otros P0 de la matriz: `CRASH-01` (reporte de fallo),
  `LEVEL-01` (nombre y ID estable al crear un Level) y la transacción de
  `STYLE-02`.

## Reversión

Estable previa: `v4.4.0`. Ningún cambio toca el formato de `.lowscene` ni el de
los `.svg`, así que se puede volver sin pérdida.
