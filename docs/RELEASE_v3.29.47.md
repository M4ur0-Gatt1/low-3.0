# LOW v3.29.47 — Joystick 3D: un solo control para mover, rotar y escalar

Hasta ahora, para transformar algo en el módulo 3D había que elegir antes el
modo del gizmo: mover, rotar o escalar, uno por vez. Esta versión trae el
**joystick** que usa Feather: el objeto elegido queda rodeado por **un** control
con todas las funciones a la vez, y se agarra la parte que corresponde a lo que
se quiere hacer.

Se prende con el botón **Joystick** (sección Selección, con la herramienta
Mover) o con la tecla **J**.

## Joystick 3D — sobre los ejes globales

Los ejes son los del mundo, sin importar desde dónde estés mirando:

- los tres **conos** (rojo X, verde Y, azul Z) mueven en su eje;
- los tres **anillos** rotan alrededor de su eje;
- la **esfera del centro** rota libre, como un trackball.

En una vista ortogonal perfecta se esconden el cono cuyo eje apunta a la cámara
—ese gesto iría contra la pantalla— y los anillos que se ven de canto. No es
cosmética: la raya de un anillo visto de perfil se superpone a todo lo demás y
se robaba el click; apuntar al anillo Z terminaba rotando en X.

## Joystick 2D — sobre la vista (tecla T)

Es lo natural cuando estás dibujando de frente a algo:

- el **círculo del centro** mueve en el plano de la pantalla;
- **tiradores** de ancho, de alto y de escala libre;
- **tirador de rotación** en el eje de la cámara.

La escala de ancho/alto deforma los **puntos de la curva**, no la transformación
del objeto. Escalar sin uniformidad algo que ya está rotado produce cizalla, y
eso no se puede escribir como posición + rotación + escala: three la reparte
entre los tres ejes, así que "solo el ancho" terminaba cambiando X, Y y Z a la
vez. Deformando la geometría eso no pasa, y la escala del objeto queda en 1.

## Candado (tecla K)

Para trabajo preciso: mover queda limitado a las cuatro direcciones cardinales
(o a pasos de 0.1 sobre un eje), la escala pasa a ser uniforme y la rotación
salta de 15 en 15 grados, que es como se llega a 90 o 180 exactos.

## Lo demás del joystick

- Cada gesto muestra su **lectura** junto al cursor: `X +1.00`, `Z +90.0°`,
  `ancho 120%`. Un gesto sin número es una adivinanza.
- Cada gesto entra como **un solo Ctrl+Z**, también cuando mueve varios objetos
  a la vez.
- **Escape** cancela el gesto en curso y deja todo como estaba.

## Dos arreglos que salieron en el camino

- **Escape ya no cierra el módulo 3D de un saque.** Primero cancela el gesto en
  curso, después suelta la selección, y solo cierra el módulo cuando no quedaba
  nada que cancelar. Antes, soltar la selección se llevaba puesto el módulo
  entero.
- **El botón de la barra se sincroniza con los atajos** J / T / K. Antes la
  tecla cambiaba el motor y el botón quedaba mintiendo sobre el estado real.
  Además la sección Selección viene abierta, para que el control se encuentre.

## Qué se midió

Con eventos de puntero reales sobre el bundle compilado, leyendo el resultado
del proyecto guardado:

| gesto | resultado |
| --- | --- |
| cono X / cono Y | +1.000 exacto en X (nada en Y/Z) / +0.500 en Y |
| anillo Z | 90.0° exactos sobre Z |
| candado | arrastre de 52° → 45°; en eje, múltiplos de 0.1 |
| trackball | rota sin tocar la escala |
| 2D mover | (1, 0.5, 0) exacto |
| 2D ancho / alto | 2.667 → 3.167 solo en X / 1.2 → 1.6 solo en Y, escala del objeto en 1,1,1 |
| 2D rotar vista | 60.2° para un arrastre de 60° |
| dos objetos | los dos se mueven igual y un solo Ctrl+Z los devuelve |

## Ya venía de las versiones anteriores

Esta versión se arma sobre la v3.29.46 y se lleva todo lo que entró desde la
v3.29.42, que es lo que estaba en camino en el módulo 2D y en el 3D:

- **Rig 2D** (v3.29.43 a v3.29.46): posar el esqueleto en FK arrastrando los
  huesos, herramientas Seleccionar / Posar / Crear con cursor propio y atajos
  S/P/B, crear hueso por clic al estilo Harmony/OpenToonz, vincular un dibujo al
  hueso (con auto-vínculo al crear), área de agarre ampliada en pivotes y
  puntas, y auto-clave opcional.
- **Modelo canónico del 2D**: navegación, vistas, operaciones de frame, barra de
  chips, transporte, intercalado (inbetween) y fps/rango In-Out pasan por el
  modelo `LowDoc`; el rig y la cámara funcionan con una escena `.lowscene`
  abierta.
- **3D**: el contorno de las figuras (cuadrado, rectángulo) ya no se deforma en
  las esquinas — el tubo generaba mitres que se auto-intersecaban en los 90°, y
  ahora el contorno se arma cápsula por cápsula.
