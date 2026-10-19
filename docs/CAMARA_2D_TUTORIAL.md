# Tutorial: mover la cámara en LOW 2D

La cámara es el **marco naranja** sobre la hoja: lo que queda adentro es lo que se ve en la película y lo que sale en la exportación.

Un movimiento de cámara se arma así: **cómo arranca la toma → cómo termina → cuánto tarda**. LOW calcula los cuadros del medio.

> En LOW: **Ayuda → Tutorial: mover la cámara**, o el **?** del panel Cámara. Es el mismo recorrido, pero guiado: cada paso avanza solo cuando lo hacés.

---

## 0. Prender el modo Cámara

- El botón **🎬 Cámara**, o la tecla **C**.
- Aparece el **panel Cámara**, en el inspector o flotando a la derecha del lienzo.
- Mientras el modo está prendido, lo que arrastrás es la cámara, no el dibujo. Otra herramienta o **Esc** lo apagan.

## 1. Encuadre de inicio

1. En el panel, paso **1 · Encuadre de inicio**: elegí el cuadro donde empieza el movimiento. Arranca en el primer cuadro de la escena.
2. **Ir y encuadrar**: te lleva a ese cuadro y deja su **clave** (el rombo).
3. Arrastrá el marco hasta que la toma **arranque** como querés:
   - **el cuerpo del marco** lo mueve (con Shift, sólo horizontal o vertical);
   - **la esquina de abajo a la derecha**, hacia adentro, **acerca**, y hacia afuera **aleja**;
   - **el círculo de arriba** lo gira (con Shift, de a 15°).

Mientras arrastrás, el rótulo del marco muestra el zoom y el giro.

## 2. Encuadre final

1. Paso **2 · Encuadre final**: poné en qué cuadro termina. A 24 cuadros por segundo, 24 es un segundo y 48 son dos. Más cuadros, movimiento más lento.
2. **Ir y encuadrar**: te lleva a ese cuadro y deja su clave, igual a la de inicio.
3. Mové el marco a donde **termina** la toma.

Con dos claves distintas, la cámara se mueve sola entre ellas.

- **Si la escena es un fondo quieto** (un solo cuadro), LOW la alarga hasta el cuadro final: cada capa sostiene su dibujo. Se deshace con Ctrl+Z.
- **Si la escena ya está animada y termina antes que la cámara**, la pista lo avisa y ofrece **Alargar la escena hasta la última clave**.

## 3. Mirar el movimiento

- **▶ Ver** va al encuadre de inicio y reproduce. El play sale **por la cámara**, como la exportación: la toma adentro del marco y lo de afuera oscuro.
- La opción **Play por la cámara**, en el panel, lo apaga si querés ver la hoja entera.
- **El recorrido** es la línea naranja sobre la hoja: un punto por cuadro. **Puntos juntos = va lento; separados = va rápido.** Los rombos son las claves.
- **El rótulo del marco** dice dónde estás:
  - **CLAVE**;
  - **entre F001 y F024**;
  - **quieta hasta / desde…**;
  - **sin claves: la hoja entera**.

---

## Ajustar

| Quiero… | Cómo |
|---|---|
| Que arranque o frene suave | **Curva** del tramo: *Suave* (arranca y frena despacio), *Constante*, *Arranca suave*, *Frena suave*, *Corte* (salta de golpe) |
| Más lento o más rápido | En la lista de **Claves**, editá el número de una clave para mudarla de cuadro: más lejos = más lento |
| Ir de clave en clave | **◀ Clave** / **Clave ▶** |
| Un valor exacto | Los campos **X, Y, Zoom (%), Giro (°)** del panel dejan clave en el cuadro actual |
| Agregar o quitar la clave de este cuadro | **Clave en este cuadro** (o **Shift+C**) |
| Un movimiento de un clic | **Movimientos**: paneos, acercar, alejar, girar, temblor, encuadrar la selección, plano completo. Van desde el cuadro actual y duran los cuadros que digas. Si había claves en el medio, las reemplaza y lo avisa |
| Ver como el espectador | **Ver por la cámara**: la vista sigue al marco y lo de afuera se oscurece |
| Deshacer | **Ctrl+Z** deshace cada cambio de cámara, con su nombre |

## Por qué a veces «no se mueve»

- **Una sola clave**: la cámara se queda fija en toda la toma.
  - Si movés el marco en un cuadro posterior sin ninguna clave, LOW agrega sola la clave de partida en el primer cuadro (la hoja entera) y lo avisa.
  - Si no, falta el paso 2.
- **Dos claves con el mismo encuadre**: mové el marco en una de ellas.
- **La escena termina antes que la cámara**: usá **Alargar la escena hasta la última clave**.

## Varias tomas en una escena

Encadená claves: inicio → final → otro final. Cada tramo tiene su curva. Para un corte seco entre dos encuadres, poné la curva **Corte** en el tramo.

## La multiplano

Si las capas tienen **profundidad** (las que llegan del estudio 3D con «Mandar en planos», o las que tienen `data-z`), el play y la exportación las mueven con paralaje: lo lejano se mueve menos y lo cercano más.
