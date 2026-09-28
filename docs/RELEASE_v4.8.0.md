# LOW v4.8.0 — Un espacio de trabajo, no un tablero de luces

Pasada de interfaz sobre lo que se ve todo el tiempo, más dos defectos que
ensuciaban la pantalla.

## Estilo

- **Un solo acento.** El celeste que hacía de segundo acento competía con el
  naranja en cada panel: dos colores fuertes gritando a la vez convierten el
  editor en un tablero de luces. Ahora es **gris neutro**, y el naranja queda
  reservado para lo que de verdad está activo o seleccionado. Cambió el valor de
  las variables, no las 66 reglas que las usan.
- **La solapa activa se reconoce por su superficie y su borde**, como en
  cualquier editor. La barra de acento que la cruzaba de lado a lado era lo
  primero que veía el ojo cada vez que se miraba el dibujo. El acento queda para
  el punto de «sin guardar», que sí es información necesaria.
- **Controles deslizantes finos y planos**, tipo dimmer: pista de 3 px, pulgar de
  11 px, sin relleno de color. El widget redondo y grueso que pone el navegador
  por omisión no pertenece a una mesa de trabajo. Se marcan en naranja sólo
  mientras se arrastran.
- La selección de la mesa multiplano pasa a naranja: gris no alcanza para decir
  «esto es lo que elegiste».

## Corregido

- **La ventana multiplano desde el menú tapaba todo.** No tenía rama propia, así
  que sólo se le quitaba `hidden` sin montarla: quedaba una capa vacía a pantalla
  completa sobre el editor. Ahora se monta como corresponde (y lo mismo el
  Editor de funciones, que tenía el mismo agujero).
- **Líneas de redimensionado sobre paneles que no estaban.** Los muelles y sus
  divisiones contaban paneles **ocultos**: quedaban tiradas por la pantalla
  líneas arrastrables con su cartelito —«Arrastrá para cambiar la altura del
  panel»— sin panel debajo, y muelles vacíos ocupando ancho de lienzo. Ahora
  sólo cuentan los visibles, y un vigía los recalcula cuando un panel se muestra
  o se oculta desde cualquier lado.

## Barra de opciones

Con las opciones de la herramienta y los diecisiete botones de documento en una
sola fila (v4.7.1), en un monitor de 1366 px se desbordaban 225 px: el control
**Suavizado** del lápiz quedaba fuera de pantalla. Se aplica la misma regla que
en el riel de herramientas: lo de uso diario a la vista, lo demás detrás de
`⋯` — variaciones, animación, documento, giro de vista, mesa giratoria, reglas,
cuadrícula, guías, modo dibujo, preferencias, código y abrir afuera. Ahora entra
todo sin desbordar, y la cabecera sigue midiendo 101 px.

## Pruebas

- Seis contratos estáticos nuevos: el multiplano se monta al abrirlo del menú,
  los muelles ignoran los paneles ocultos, no vuelve el segundo acento, la
  solapa no lleva barra, los deslizantes no vuelven al widget del navegador y la
  barra de opciones conserva su desborde.
- Los **13** recorridos E2E y las 7 suites de modelo, en verde.

## Reversión

Estable previa: `v4.7.1`. Todo el cambio es de interfaz y CSS; no toca el
documento ni ningún formato.
