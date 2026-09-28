# LOW v3.29.50 — La rotación va para donde uno la lleva

Al demostrar el rig paso a paso quedó a la vista un defecto que ninguna lectura
del código había mostrado: **el brazo giraba para el lado contrario del gesto**.

## Se agarraba la palanca del lado equivocado

Una pieza no tiene cuerpo de hueso. El único asidero que había para rotarla era
la línea que va **del pivote del padre al suyo** — o sea, una línea que sale del
torso, no del brazo. Agarrarla y arrastrarla hacia abajo hacía **subir** el
brazo: exactamente lo que pasa con una palanca tomada del lado opuesto al
pivote.

Y una pieza **sin padre** no tenía ninguna línea, así que directamente no se
podía rotar en la mesa: solo escribiendo grados en el panel.

Ahora cada pieza tiene su **manija de rotación**: una línea punteada que sale
del pivote **hacia su propio dibujo**, terminada en un tirador. Se agarra la
pieza y gira hacia donde uno la lleva. La línea al padre queda solo como
indicador de jerarquía, y el cuerpo de un hueso de verdad sigue rotando como
antes, porque ahí la línea sí es el hueso.

## Medido

El mismo gesto —arrastrar hacia abajo— sobre el mismo brazo:

| | asidero | resultado |
| --- | --- | --- |
| antes | la línea hacia el padre | **−40°** antihorario: el brazo sube |
| ahora | la manija sobre el brazo | **+69.6°** horario: el brazo baja desde el hombro |

## Y una aclaración que faltaba

El **pivote no se edita en FK**: en ese modo, arrastrar la articulación mueve la
pieza. Se cambia en **Armado**, arrastrando el círculo o con el botón Pivote.
Ahora el cartel de ayuda de FK lo dice, y el tutorial también.
