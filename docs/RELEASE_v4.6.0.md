# LOW v4.6.0 — Que una pieza se doble: malla, flexi-binding y pesos

Cierra los niveles 2 y 3 de la tabla de deformación de la biblia (§4.3) y el
punto 3 de §12 SIGUIENTE. Hasta acá el rig era **rígido**: una pieza seguía a un
hueso entera. Ahora una pieza puede **doblarse**.

## Implementado

### Malla

Una rejilla 4×4 sobre la pieza del hueso seleccionado, creada desde la caja real
de su dibujo. El modelo ya guardaba mallas y las deformaba a mano; lo que no
existía era el recorrido para usarlas.

### Flexi-binding — pesos automáticos por distancia

Un clic reparte la influencia: cada vértice sigue a los huesos que tiene cerca,
midiendo la distancia **al segmento del hueso**, no a su origen —un hueso largo
tiene que influir parejo a lo largo de todo su cuerpo—. Los pesos salen
**dispersos** (tres huesos como mucho por vértice: un muñeco cut-out no necesita
veinte, y guardarlos engorda el archivo sin cambiar el dibujo) y **normalizados**
a 1 (si la suma no da 1, la pieza se encoge o se estira sola al posar, que es el
defecto clásico del skinning hecho a ojo).

### Pesos de vértice editables

Pincel con **fuerza** y **radio**: arrastrar suma influencia del hueso
seleccionado, `Shift` resta. Cada vértice se colorea según cuánto pesa a ese
hueso —negro es nada, naranja pleno es lo sigue entero—, porque un peso que no
se ve no se puede corregir con criterio.

Todo un trazo es **una** operación de historial: pintar es un gesto, no cincuenta
pasos de Undo. Y restar todo de un vértice no lo deja suelto: vuelve a seguir a
su propia pieza, porque un vértice sin huesos se queda clavado mientras el resto
se mueve, que es peor que cualquier peso mal puesto.

### Skinning real

`Σ w · (Mundo(f) · Bind⁻¹) · p` — cada vértice se mueve con la mezcla de las
matrices de sus huesos, comparadas contra la **matriz de reposo** (`rigBindMatrix`),
que es lo que faltaba: sin ella no hay con qué comparar cuánto se movió un hueso.

Encima se suman los retoques manuales de las claves, guardados como diferencia
contra el reposo: **el hueso pone el movimiento y la mano pone la corrección**, y
no se pelean. Una malla sin pesos devuelve exactamente la rejilla de siempre, así
que nada de lo anterior cambia de comportamiento.

## Corregido

- El overlay de la malla no seguía al zoom ni al paneo: la rejilla quedaba
  corrida respecto del dibujo después de mover la vista. Ahora se redibuja en los
  mismos puntos que el overlay del esqueleto.
- `openDesign` borraba cualquier `<svg>` del lienzo que no estuviera en su lista
  blanca, y se llevaba el overlay de pesos al abrir un documento.

## Pruebas

- **34/34** de malla y pesos (19 nuevas): normalización, dispersión, reparto por
  distancia, skinning que mueve más el lado del hueso que gira, pincel en un solo
  paso de historial, vértice que no queda huérfano, persistencia y
  no-regresión de las mallas sin pesos.
- Recorrido nuevo `tools/check_rig_weights_ui.js` en la puerta de CI: el circuito
  entero desde el panel —crear, repartir, ver, pintar, deshacer, posar, guardar,
  reabrir y quitar—, incluida la comprobación de que el panel **no ofrece pesos
  antes de que exista la malla** (regla de §4.3).
- Siete contratos estáticos nuevos.
- Los **12** recorridos E2E de Chromium en verde, y 353 pruebas de modelo.

## Pendiente

- Smoke del ejecutable empaquetado.
- De §12 SIGUIENTE quedan: Smart Bones y acciones (sin empezar), audio y lipsync
  consolidados, y la prueba de mocap con videos reales variados.
- De §12 AHORA queda el punto 7: la extracción progresiva de `app.js`.

## Reversión

Estable previa: `v4.5.0`. Los pesos son un campo nuevo dentro de la malla; una
escena guardada con `v4.6.0` abre en `v4.5.0` y la malla se comporta como antes
(los pesos quedan ignorados, no rompen nada).
