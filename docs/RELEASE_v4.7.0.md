# LOW v4.7.0 — Smart Bones: la corrección se dispara sola

Cierra el nivel «Acciones conducidas por ángulo» de la tabla de deformación
(§4.3) y el punto 4 de §12 SIGUIENTE.

## Implementado

### Acciones

Una **acción** es una mini línea de tiempo con nombre: guarda claves de canales
igual que la escena, pero su tiempo no es el de la escena. Un **Smart Bone** es
esa acción **conducida** por el valor de otro canal —casi siempre el ángulo de un
hueso—: el conductor dice «de tal ángulo a tal otro» y la acción se recorre en
ese trayecto.

Para qué: un codo que al doblarse deforma el brazo, un hombro que al subir
corrige la clavícula. Sin esto hay que arreglar a mano, cuadro por cuadro, la
misma corrección cada vez que el personaje dobla el brazo.

El recorrido desde el panel de Rigging → Construir:

1. Elegir el hueso que va a conducir y tocar **Nueva acción** (arranca de 0° a 90°).
2. Doblar ese hueso, acomodar la pieza que hay que corregir.
3. **Grabar pose** — queda guardado como el estado del extremo del rango.
4. Listo: a partir de ahí la corrección entra sola, dosificada por el ángulo real.

El rango se corrige desde el panel, y una acción se puede apagar sin borrarla.

### Cómo compone

La acción aporta **diferencias** contra su propio cuadro 1, no valores absolutos.
Así una acción en reposo no cambia nada y varias acciones se suman sin pelearse
por quién manda. El conductor se lee del canal **crudo**, que no consulta
acciones, así que no hay realimentación posible: una acción no puede conducirse a
sí misma.

Fuera del rango no dispara de más: por debajo del mínimo no aporta, por encima
del máximo aporta el tope.

### El detalle que hace que funcione de verdad

Escribir una clave captura «la pose actual», y la pose actual **incluye** el
aporte de las acciones. Guardarla tal cual horneaba la corrección dentro de la
clave, y después la acción volvía a sumarla encima: el brazo se iba al doble en
cuanto el codo se doblaba. Ahora toda escritura de pose descuenta el aporte antes
de guardar — la clave es siempre pose **base**, y la acción sigue siendo lo único
que pone la corrección. Está cubierto por prueba, en el modelo y en el recorrido.

## Pruebas

- Suite nueva `tools/run_smart_bones_tests.js` — **28/28**: creación y validación
  del conductor, dosificación por ángulo, saturación fuera de rango, suma de
  varias acciones, grabar desde la pose, historial, persistencia y la
  no-regresión de un rig sin acciones.
- Recorrido nuevo `tools/check_smart_bones_ui.js` — el circuito entero desde el
  panel, incluida la comprobación de que escribir una clave **no** hornea el
  aporte.
- Seis contratos estáticos nuevos.
- Ambas suites en la puerta de CI: **13** recorridos E2E y 7 suites de modelo.

## Pendiente

- Smoke del ejecutable empaquetado.
- De §12 SIGUIENTE quedan: audio y lipsync consolidados, y la prueba de mocap con
  videos reales variados.
- De §12 AHORA queda el punto 7: la extracción progresiva de `app.js`.
- De §4.3 queda el último nivel: **Controles** (cara, manos, ojos, boca).

## Reversión

Estable previa: `v4.6.0`. Las acciones son una rama nueva del rig; una escena
guardada con `v4.7.0` abre en `v4.6.0` y las acciones quedan ignoradas, sin
romper nada. Las claves siguen siendo pose base en las dos versiones.
