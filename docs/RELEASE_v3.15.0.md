# LOW 3.15.0 — Seguir un recorrido: el objeto va por el arco dibujado, marca por marca

Pedido de Mauro: «¿se podría hacer que al dibujar un arco —en la referencia es un infinito, tipo Moebius— con las marcas para los intermedios, el programa haga recorrer el objeto por el recorrido marcado? Lo ideal es dibujarlo en una capa de referencia y que el objeto a animar esté en la siguiente y respete ese flujo. Así ahorraría bastante tiempo de intercalado».

## Cómo se usa

Es la carta de espaciado del dibujo animado clásico, hecha herramienta, como el recorrido de Toon Boom o el «seguir trazado» de Moho.

1. En una **capa de referencia**, dibujá el **recorrido**: un trazo largo, abierto o cerrado (un arco, un infinito…). Hacelo con el lápiz o con el pincel.
2. **Cruzalo con rayitas cortas**: cada rayita es un cuadro. Juntas es lento, separadas es rápido.
3. **Sostené** la capa de referencia en los cuadros que vaya a durar el movimiento.
4. En la capa del objeto, parado en el cuadro donde empieza, **elegí el objeto** con la flecha.
5. Apretá **«Seguir un recorrido»**: el botón 🛤 de la línea de tiempo, el menú Animación o **Alt+R**.

LOW pone el objeto **sobre cada marca, en orden, un cuadro por marca**, empezando por la marca más cercana al objeto y en el sentido en que dibujaste el trazo.

**En la ventana se puede elegir:**

- la capa del recorrido: propone la que se llama «Referencia», «Recorrido» o «Guía», o si no la del trazo más largo;
- **invertir el sentido**;
- **que gire siguiendo el recorrido**: el objeto se inclina con la curva;
- **reemplazar** los cuadros que siguen, o **insertarlos** corriendo lo que sigue;
- si el recorrido **no tiene marcas**: cuántos cuadros y con qué curva (lineal, acelera, frena, acelera y frena).

Además:

- Un recorrido **cerrado** (como el infinito) se entiende como una vuelta.
- Cada cuadro es un dibujo propio, la capa de referencia no se toca, y **un solo Ctrl+Z** saca todo.

## Dos detalles que salieron probándolo en la app real

- **El objeto rara vez está exacto sobre una marca.** Al principio, si estaba a unas unidades de la primera marca, se sumaba un cuadro extra casi en el mismo lugar y el movimiento tropezaba al empezar. Ahora, si está cerca de una marca, arranca en ella.
- **En el cruce del infinito** el recorrido pasa dos veces por el mismo punto. Una marca puesta ahí podía asignarse a la pasada equivocada, y la pelota saltaba al cruce fuera de orden. Ahora cada marca va al tramo que atraviesa de frente, porque una marca se dibuja cruzando su tramo.

## Pruebas

- **`check_recorrido_ui.js`** (nueva) arma la escena de la captura con el ratón de verdad:
  - un infinito con 15 marcas desparejas, una de ellas en el cruce, en la capa «Referencia»;
  - una pelota en otra capa, corrida unas unidades de la primera marca.

  Comprueba:
  - que la ventana encuentra las 15 marcas y el recorrido cerrado;
  - que la pelota queda sobre cada marca, en orden (±4 unidades);
  - que cada cuadro es un dibujo propio y la referencia queda intacta;
  - que un Ctrl+Z lo saca todo;
  - que con «que gire» la pelota gira con la tangente sin salirse de su marca.

  Falla con el código anterior (no había botón). También falla sin cada uno de los dos arreglos: cuadro extra al empezar, y marca del cruce fuera de orden.
- **Probado en la app real** con eventos de lápiz: el infinito y 20 marcas hechos con el **pincel** (el caso difícil, porque es una cinta rellena) y la pelota con el lápiz. Salieron 20 cuadros y la pelota recorre el infinito siguiendo el espaciado.
- `check_atajos_ui.js` ahora aprieta 65 teclas (se suma Alt+R).
