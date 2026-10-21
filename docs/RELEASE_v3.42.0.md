# LOW 3.42.0 — Paralelas: dos líneas a la vez

Pedido de Mauro: «una herramienta de dibujo de paralelas con el pincel para el módulo 2D: por ejemplo, si quiero hacer ambos lados de un brazo establezco una distancia, por ejemplo de 6 mm, y dibujo el brazo, las dos líneas al mismo tiempo… para brazos, piernas, torso… empecemos con sólo dos paralelas… debe ser algo desmarcable, como el dibujo de simetría».

## Cómo se usa

- **Prender y apagar**, como el espejo:
  - el botón **‖** junto al espejo (en «Más herramientas» ⋯);
  - **Shift+M** (M es el espejo).
- **Prendida, una insignia sobre la hoja** («‖ Paralelas [6] mm ✕») lo avisa, deja cambiar la separación ahí mismo y se apaga con la ✕.
  - Primero iba en la barra del Lápiz y del Pincel, pero la barra ya estaba llena: a media pantalla (1000 px) tenía 557 px de contenido en 558, y lo agregado sacaba de la vista el suavizado.
- **La separación** va en milímetros: 6 mm de entrada, de 0,5 a 100. Se recuerda.
  - Son milímetros del dibujo (1 mm = 3,78 px, la cuenta de Illustrator y de SVG): la separación es la misma a cualquier zoom.
- **Lo que se dibuja es el centro** (el eje del brazo o de la pierna). Las dos líneas salen a la mitad de la separación de cada lado.
- **Se ven mientras se dibuja**, con el pincel de verdad (la textura, la presión), no recién al soltar.
- **Al soltar quedan dos trazos comunes**: se editan, se borran y se pintan como cualquiera. Un solo Ctrl+Z los saca a los dos.
- **Con el espejo prendido**, se espejan las dos: quedan cuatro.

## Cómo se arma cada línea

- Cada punto sale por la normal del eje medida en un tramo, no punto a punto. Con el temblor de la mano, punto a punto las paralelas salían en zigzag.
- En el lado de adentro de una curva cerrada (un codo doblado), la línea desplazada retrocedería y haría un rulo: esos puntos se sacan y la esquina de adentro queda limpia.
- Cada línea conserva la presión del trazo: con el pincel, cada una engorda y adelgaza como lo que se dibujó.
- **Con «Unir puntas»**, cada paralela puede continuar líneas que ya estaban, pero **nunca se suelda con su compañera**. Con la vista muy alejada, sus puntas quedan a menos de 8 px de pantalla y se unían en una.

## Pruebas

- Nueva: `tools/check_paralelas_ui.js`, con el mouse y el teclado de verdad:
  - viene apagada; el botón y Shift+M la prenden y la apagan;
  - prendida se ve la insignia sobre la hoja; la separación se escribe ahí y se recuerda; la ✕ la apaga y tocar la insignia no dibuja;
  - mientras se dibuja se ven las dos líneas;
  - al soltar quedan dos, a 10 mm (37,8 px) en todo el largo de una curva, sin el eje escondido;
  - un Ctrl+Z las saca;
  - la misma separación con zoom ×2;
  - cuatro líneas con el espejo;
  - dos cintas con el Pincel;
  - con «Unir puntas» y la vista alejada no se sueldan;
  - apagada, un trazo deja una línea.
- Medido: la separación queda en 37,78–37,80 px con el lápiz y con el pincel.
- En la puerta local, `check_reproduccion_fluida_ui` falla en esta máquina (37 de 48 cuadros en 2 s). Falla igual con la 3.41.0 publicada (medido en una copia aparte): es del entorno, no de este cambio.
