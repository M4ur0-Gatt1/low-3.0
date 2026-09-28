# Avance del plan maestro

## Primera entrega — guía de corte y articulación

Base: v4.31.0 (`c0daa4f`). Plan: `LOW_PLAN_MAESTRO_2026-09.md`.

| Tarea | Estado y evidencia |
|---|---|
| A01 inventario | Iniciado: controles y acciones existentes en document.js; transporte colaborativo presente; jaula de deformación libre incorporada por Claude en v4.31. No se consideran funciones ausentes. Falta la matriz completa de recorridos. |
| A04 3D | Publicado en v4.31 según bus y commit de release; bundle integrado y verificado previamente. Pendiente comprobar el instalador descargado. |
| B02 preparación | Implementada guía visual que sigue el puntero: línea de corte extendida y cadena provisional de articulación. Escape retira la guía sin modificar dibujo/historial. Se conserva la comprobación de cambio de documento/cuadro. |

Prueba: `node tools/check_flexible_limb_ui.js`. Pasan codo, rodilla, deformación visible, pesos, persistencia, corte, Undo/Redo, vista previa sin mutación y cancelación. Añadido recorrido con entrada física CDP para movimiento de puntero y Escape, y viewport explícito 1366×768. La regresión deliberada que elimina el listener de movimiento hace fallar el guard; el código se restaura al finalizar.

No se cierra B02 completo: falta revisión visual por el artista y ampliar la prueba a dibujos complejos. Tampoco se declara terminada la etapa A. Siguiente incremento: hacer más claro el paso de preparar a posar y evaluar correctivos sobre el mismo personaje de prueba, sin duplicar el modelo de rig.

## Segunda entrega — de crear a posar

B01/B02: al crear la articulación aparece **Posar articulación**. Activa FK y la herramienta Posar, seleccionando el hueso inferior recién creado. Usa las funciones existentes del rig y no agrega claves ni entradas de historial. Rechaza la acción si se cambió de documento o se deshizo la creación.

La suite de articulaciones pasa con comprobaciones del modo, herramienta, selección y ausencia de historial adicional. Se verificó que eliminar la activación de Posar hace fallar la prueba. Sigue pendiente la revisión artística del recorrido y el trabajo de correctivos B05.

## Recorrido integrado B — 2026-09-10

Implementado y verificado el recorrido técnico de preparar/cortar → posar con arrastre → pintar/suavizar/bloquear pesos → corregir contorno por ángulo → Undo/Redo → guardar `.low`, reabrir y exportar.

Defectos reproducidos y corregidos:

- Exportación aplicaba matrices pero omitía mallas y curvas. `rig-export.js` usa ahora los mismos evaluadores que el visor.
- La malla ignoraba la pose provisional durante el arrastre: el dibujo se actualizaba al soltar. Ahora propaga `overrides` sin escribir claves durante el gesto.
- Seleccionar el hueso inferior no encontraba la malla portadora. El editor resuelve la malla afectada y pinta la influencia del hueso elegido, sin dar peso accidental al portador.
- La capa de pesos heredaba el centrado de la hoja SVG; su apariencia y su zona de clic no coincidían. La regla CSS y la exclusión de la UI del dibujo quedaron corregidas.
- Cancelar pintura no tenía salida propia. Escape, pointercancel y cambio de documento/cuadro interrumpen el gesto sin guardarlo.

El nuevo editor **Corregir forma…** está en Animar. Muestra primero el borde, permite mostrar puntos interiores y ajustar la zona de influencia. La vista previa no modifica el documento. Guardar crea una acción con canales de desplazamiento locales al hueso conductor; el ajuste acompaña su ángulo, rotación y escala. Se limpian esos canales al quitar la malla. Los bloqueos de pesos persisten y se respetan al pintar, suavizar y recalcular pesos automáticos.

Evidencia: flujo completo en Chromium y WebView2 propio, con ratón y Escape por CDP. En WebView2 se escribieron y reabrieron archivos `.low` reales, y se rasterizó el SVG corregido a PNG. La suite cubre codo, rodilla y grupo de varios trazos con transformaciones internas; compara geometría visible y exportada. Pasaron 365 pruebas del modelo 2D, 50 de mallas y 51 de Smart Bones, además de recorridos de pesos e IK. El contrato estático de skinning se adaptó al parámetro de pose provisional sin dejar de exigir la llamada al evaluador.

Límites explícitos: correctivo directo para malla vectorial con un hueso conductor y portador sin transformación propia; no se añade soporte raster/máscaras. El editor rechaza un hueso que afecte varias mallas para no elegir una silenciosamente. Falta la evaluación artística de Mauro con su personaje y tableta; las pruebas técnicas no la sustituyen. B04 conserva los límites del IK existente; no se afirma cobertura de todas las combinaciones posibles.

Coordinación: Claude cerró C01 y avanzó C02 en `adb0dbc`/`b2bb272`; no se reconstruye ese editor. A02 fue ampliada por Claude en `e791958`; A04 está publicada en v4.31.0. La prueba humana puede realizarla Mauro; medir descubrimiento sin ayuda sigue siendo una evidencia distinta.

### B03 — cierre de regresión de selección, 2026-09-10

La serialización del Drawing excluye `dz-sel` y normaliza atributos class vacíos, conservando las clases del dibujo. Seleccionar ya no genera un cambio de contenido ni un Undo fantasma cuando corre el guardado diferido. Se extrajo `dzCanvasInner` a un módulo propio. El recorrido flexible completo pasó en navegador y en LOW nativo (CDP 9225), incluido archivo real guardado/reabierto, cancelación física, pesos, correctivos y coincidencia de exportación. Contratos 2D y presupuesto de app.js pasan. Sigue pendiente la validación artística con tableta.

### C03 — vínculos de acciones, primera parte

El panel permite elegir un hueso o dial conductor existente y usa el rango del dial. Al eliminar un conductor, muestra la referencia pendiente y deshabilita grabación/rango sin romper el panel. El diagnóstico detecta destinos y conductores inexistentes, referencias malformadas y ciclos entre acciones activas; estos últimos se explican como lectura de canales originales, sin propagación recursiva. Los correctivos de malla conservan su conductor hasta implementar un hueso de espacio independiente. Las funciones del panel se extrajeron de app.js. Validación: Smart Bones 57/57, malla 50/50, modelo 365/365, recorrido Smart Bones con vinculación y borrado de dial, contratos 2D. C03 sigue abierto: falta el asistente de poses de referencia y previsualización de mezcla.

### C03 — poses y mezcla sobre el personaje

Se agregó un bloque desplegable con instrucciones, grabación de inicio/extremo y deslizador de mezcla. La previsualización evalúa una copia aislada del rig y aplica matrices temporales; no escribe claves ni historial. Escape o Volver a la escena restauran la vista; cambios de documento, cuadro, acción o rig cancelan la sesión. El recorrido comprueba estados 0/50/100 distintos y ausencia de cambios en Scene e historial. La grabación excluye el conductor cuando se usan todas las piezas. Los correctivos de malla mantienen su editor dedicado. Validado en navegador junto al recorrido flexible completo; queda pendiente la revisión visual/artística del flujo C03 y su recorrido físico dedicado.
