# LOW v4.40.0 — el taller: espacios, inflar por tramo, formas editables y la cámara marcada

Seis pedidos de Mauro sobre la v4.39.0 recién instalada. El primero era una
regresión mía.

## 1. Volvieron los espacios de trabajo

> «no sé en qué versión perdimos los paneles con los diferentes espacios de
> trabajo que teníamos arriba a la derecha, eso es fundamental»

La perdí yo en **v4.36.0**. Al hacer que «Nuevo documento» cree un `.low`, ese
camino dejó de pasar por `openDesign` — y `openDesign` era quien montaba las
pestañas. Abrir un `.low` tenía el mismo agujero.

Ahora los dos caminos las montan: **Dibujo, Animación, Limpieza, Color,
Composición, Cámara y 3D**, con la activa marcada.

## 2. El inflador infla POR TRAMO, y «parejo» es una opción

> «la idea es que infle por tramo entre un punto y el otro, no que infle todo
> parejo; quizá sirve lo de que infle parejo pero como una opción de la
> herramienta, no como comportamiento por defecto»

El obstáculo de fondo: un trazo de lápiz es un trazado con **un solo**
`stroke-width`. Con un número no se puede tener un tramo más gordo que otro, y
por eso inflar sólo podía ser parejo.

Ahora, al inflar por tramo, la línea pasa **una vez** a ancho variable —los
mismos puntos, el mismo color, el mismo grosor de partida, pero con presión por
punto— y desde ahí el tramo engorda solo. Es lo que hace OpenToonz por debajo:
sus trazos siempre tienen ancho variable, por eso el Pump puede modular.

Medido en una línea de 1200 unidades: bajo el cursor la presión sube a **2,05** y
a 650 unidades de distancia queda en **1**. «Toda la línea» quedó como opción en
la barra de la herramienta, y **Alt** sigue desinflando.

## 3. Las formas básicas ya se editan por puntos

> «la herramienta de nodo para agregar también quiero que funcione en las formas,
> para poder dibujar a partir de formas básicas y editarlas»

Un rectángulo no tiene puntos: son `x/y/ancho/alto`. El editor decía «ese
elemento no tiene nodos editables» y ahí se terminaba.

Ahora, al tocar un rectángulo, un círculo o una elipse con la herramienta de
nodos, **pasa a trazado** conservando su contorno, aparecen sus puntos, y el clic
siguiente agrega uno más. Es una edición de verdad: entra en el historial, se
avisa —«El rectángulo pasó a trazado para editarlo por puntos»— y Ctrl+Z lo deja
como estaba.

## 4. La zona de cámara, marcada como en una hoja de layout

> «también quiero que marque en la pantalla la zona de la cámara»
> «aquí hay otros buenos ejemplos de layouts con marcas de cámara» — hojas de
> Ghibli y storyboards con cuadro exterior y zona segura

Antes el encuadre sólo se veía **dentro** del modo cámara, así que mientras
dibujabas no sabías qué entra en el plano: te enterabas al exportar.

Ahora está marcado todo el tiempo: **cuadro de cámara** con línea fina y marcas
de esquina, **zona segura** punteada adentro, centro señalado, y el dibujo de
afuera se sigue viendo —ahí va el sobrante que la cámara puede tomar en un
paneo—. Se apaga desde *Vista → Marcar la zona de cámara*.

Se puede hacer porque desde v4.38.0 el encuadre sólo agarra el puntero en modo
cámara: como guía no se come los trazos, y eso lo comprueba la prueba.

## 5. Proporciones y estética

> «la interfaz, las gráficas, o sea las representaciones del software todavía se
> ve un poco principiante; quiero una estética más profesional en los marcos de
> las formas, en los manejadores de vectores, en los iconos»
> «hay un problema con las proporciones y los tamaños de los botones, muchos
> están demasiado grandes»

Las dos cosas tienen el mismo origen: los controles del estudio heredaron el
tamaño del lado programador —un chat, donde un botón de 32 px está bien— y en
una mesa de dibujo compiten con el dibujo.

- **Marco de selección**: línea de 1 px, sobria, en vez de una caja gruesa.
- **Tiradores**: cuadrados de 8 px, claros, de borde fino. Los nodos del trazado
  son **rombos** y los de escala **cuadrados**: se distinguen por forma, no sólo
  por color, así se sabe qué se va a agarrar antes de agarrarlo.
- **Tiradores de radio de esquina**: eran puntos negros gruesos que gritaban más
  que el dibujo; ahora hablan el mismo idioma que el resto.
- **Sombras**: un contorno de 1 px en vez de un desenfoque, para que el tirador
  se lea sobre un dibujo claro o uno oscuro sin aire de botón de juguete.
- **Botones del estudio**: de 32×32 a **27×27**, iconos de 17 a **15 px**, la
  barra de herramientas de 44 a **38 px** de ancho. En Moho, OpenToonz y
  Photoshop el icono vive entre 14 y 16 px: la barra ocupa poco y entran muchas
  herramientas a la vista, que es lo que hace falta cuando el programa tiene
  tantas. El lado de la IA no se tocó: ahí el tamaño grande está bien.

## Pruebas

- **`check_taller_vector_ui.js`, nueva y en CI**: aprieta «Nuevo documento» como
  una persona y exige las pestañas de espacios; comprueba que la guía de cámara
  se vea, que **no** se coma el puntero y que se pueda apagar; infla una línea de
  lápiz y exige que engorde **el tramo** y no el resto; y convierte un rectángulo
  para editarlo por puntos, exigiendo que conserve el grosor del contorno y que
  avise. Cuatro mutaciones verificadas.
- **Cinco contratos estáticos nuevos** (295 en total).
- Puerta completa: **12 suites, 12 comprobaciones de puente y 44 recorridos. 0
  fallos.**

## Dos pruebas viejas que medían lo que ya no existe

`check_herramientas_vector_ui` comprobaba que el inflador cambiara el grosor de
**toda** la línea — el comportamiento que se pidió cambiar. Ahora prueba eso
mismo a través de **la opción**, y el por defecto lo cuida el recorrido nuevo.

Y su afirmación de «agregar un punto no deforma» comparaba puntos muestreados
con igualdad **exacta**; como al partir se escriben coordenadas con dos
decimales, un punto puede moverse menos de un píxel por redondeo. Ahora compara
con tolerancia de 1,5 unidades: una deformación de verdad mueve decenas, como la
mutación que verifica esa afirmación.

## Reversión

Estable previa: `v4.39.0`. Lo nuevo vive en `ui/vector/inflar-linea.js`,
`ui/vector/node-editor.js`, `ui/animation/camara-guia.js` y
`ui/design/studio-polish.css`; en `app.js` son líneas plegadas.
