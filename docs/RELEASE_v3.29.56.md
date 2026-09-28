# LOW v3.29.56 — Ctrl+C y Ctrl+V sobre los cuadros

El gesto más usado de la animación tradicional: copiar el dibujo y hacer el
siguiente encima de la copia. No estaba: **Ctrl+C** y **Ctrl+V** no hacían nada
sobre la escena.

## Cómo funciona

**Ctrl+C** copia el cuadro donde estás parado. **Ctrl+V** lo pega en el cuadro
siguiente y te lleva ahí. Repetir Ctrl+V va **encadenando**: F2, F3, F4… así se
arma la tira para ir modificando cada dibujo.

Si te movés vos a otro cuadro y pegás, pega **donde estás** — la regla es simple:
si seguís parado donde te dejó el último pegado, avanza; si te moviste, obedece.

No hace falta seleccionar nada antes: Ctrl+C copia el cuadro entero. Funciona
igual con el foco en la línea de tiempo o en la mesa.

## Pegar crea una copia aparte, no una segunda exposición

Esta es la decisión importante. Pegar la **misma celda** haría que los dos
cuadros compartan el dibujo: retocar uno cambiaría el otro, y no se podría
animar. Por eso pegar crea un **dibujo nuevo con el mismo contenido**,
independiente del original.

Para lo otro —que dos cuadros muestren el mismo dibujo— está el sostener, la
manija de la hoja de tiempos, que es una cosa distinta y sigue igual.

Si hay texto seleccionado, Ctrl+C copia el texto como siempre.

## Qué se midió

Sobre el personaje de ejemplo, con los cuadros sosteniendo el dibujo 1:

| caso | resultado |
| --- | --- |
| Ctrl+C en F1 y Ctrl+V | pega en **F2** y te deja ahí, con el dibujo 2 |
| Ctrl+V tres veces seguidas | F2 · F3 · F4, **tres dibujos distintos** (2, 3, 4) |
| retocar la copia de F2 | el dibujo de F1 queda intacto — son independientes |
| irse a F8 y pegar | pega en **F8**, no avanza |
| con el foco en la línea de tiempo | funciona igual |
| con una pieza seleccionada en la mesa | funciona igual, copia el cuadro entero |
