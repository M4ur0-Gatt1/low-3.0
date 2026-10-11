# LOW 3.16.0 — El recorrido es un flujo: se suman objetos y recorridos; el marco elige lo movido; ocultar capa anda; revisión general

## Seguir un recorrido, como un flujo

Pedido de Mauro: «la animación de base es un flujo: le tengo que poder ir agregando objetos que sigan el recorrido, y sumar recorridos de cada objeto por separado; por ejemplo, si es un personaje con brazos, puedo querer dibujar el recorrido de los brazos».

- **Sumar a lo que ya hay** es ahora lo de fábrica. Cada vez que pasás un objeto por un recorrido se mueve sólo lo elegido, y lo demás de esos cuadros queda como estaba. Así se agregan objetos de a uno al mismo flujo, o se le da a cada brazo su propio recorrido. También se puede «reemplazar por copias de este» o «insertar cuadros nuevos».
- **Varios recorridos en la misma capa.** Cada trazo largo es un recorrido, y cada marca va al recorrido que cruza. La ventana propone **el recorrido más cercano a lo elegido**, y se puede cambiar.
- **El recorrido lleva al objeto, como un peg de Toon Boom.** El objeto conserva su distancia al trazo:
  - uno dibujado sobre el recorrido va por las marcas;
  - uno al costado viaja paralelo;
  - con «que gire», esa distancia gira con la curva.
- **Volver a pasar un objeto no lo duplica:** se reemplaza su versión anterior en cada cuadro.
- **Varios objetos a la vez:** elegidos juntos (Shift+clic), viajan juntos.

## Lo que fallaba

Reporte de Mauro: «con otro recorrido ni se me abre la opción al apretar el botón, o demora mucho en aparecer; si el proceso es largo debe avisar, porque si no parece que no hace nada; y falló al intentar animar un grupo de objetos juntos».

- **Tardaba.** Antes de abrir la ventana se medía cada trazo de cada capa cada 2 unidades. Medido con una capa de 400 trazos: **3,4 segundos** sin aviso. Ahora las capas se eligen por el largo de su trazo mayor y sólo se lee entera la elegida: **25 ms**. Con una referencia pesada, la ventana aparece en menos de medio segundo.
- **No avisaba.** Ahora dice «Buscando el recorrido…» y «Generando cuadro k de N…». Si algo falla, o no hay recorrido, lo explica en una ventana y no sólo en la barra de estado.
- **Con varios objetos elegidos no hacía nada:** sólo aceptaba uno. Ahora viajan juntos.
- **El recorrido en la misma capa del objeto** no se encontraba. Ahora se usa lo que no está elegido.

## Elegir varios con el marco

Reporte de Mauro: «el seleccionador para seleccionar muchos objetos juntos no anda».

Medido con el ratón de verdad en la app: en un dibujo recién hecho el marco andaba. Fallaba en cuanto algo estaba **movido**. Había dos defectos:

- **Lo movido se tocaba donde estuvo, no donde se ve.** La puntería de la selección no tenía en cuenta el desplazamiento propio de cada objeto. Afectaba a:
  - lo movido con la flecha blanca;
  - lo que está dentro de un grupo movido;
  - lo rotado o escalado.

  Entonces, apretar en el hueco donde *estaba* algo lo agarraba y lo arrastraba hasta donde soltabas, en vez de empezar el marco. Y apretar encima del objeto no lo encontraba. Ahora cada objeto se toca donde se ve.
- **Un clic dentro de un grupo elegía una pieza suelta, no el grupo.** En un `.low` los grupos viven dentro del plano Línea, y ese código sólo buscaba grupos en el nivel de arriba (el modelo viejo). Pasaba lo mismo al poner el pivote de una parte del esqueleto.

Recordatorio de cómo funciona el marco, que no cambió:

- **de izquierda a derecha** elige sólo lo que queda **entero adentro**;
- **de derecha a izquierda** elige **todo lo que toca**;
- **Alt** invierte la regla;
- **Shift** suma a la selección.

## Ocultar capa

Reporte de Mauro: «el botón ocultar capa no anda». Había dos ojos rotos:

- **El ojo de la línea de tiempo, sobre la capa activa,** la marcaba oculta pero su dibujo seguía en la mesa. Ahora se esconde, y la barra de estado avisa que lo que dibujes en una capa oculta no se ve.
- **El ojo del panel de Capas** era un elemento vacío de 18×0 píxeles mientras la capa estaba visible: no se veía ni se podía tocar. Ahora tiene el icono del ojo.

## Revisión general

- **Puerta completa:** 0 fallas.
- **Barrido de uso:** se aprieta cada botón visible de los siete espacios de trabajo y se mide si cambió algo. El barrido mismo tenía dos defectos que lo invalidaban en parte, ya arreglados:
  - usaba el modelo viejo (`.svg` suelto) en vez de un `.low`;
  - un «Otra pantalla» dejaba la línea de tiempo afuera y 48 botones sin medir;
  - la pestaña de la línea de tiempo la plegaba y 78 botones de Animación quedaban sin medir. Ahora el barrido la vuelve a desplegar.
- **Lo que encontró y se arregló:**
  - las ayudas de la X-sheet anunciaban teclas viejas: «(↑)» y «(↓)», que hoy mueven lo seleccionado, y «(Espacio)», que es la mano. Ahora leen el mapa de atajos;
  - Duplicar y Borrar sin nada elegido no decían nada; ahora lo dicen;
  - «Dibujo anterior» / «Dibujo siguiente» en el primer o el último dibujo callaban; ahora avisan que no hay otro;
  - Invertir y Ida y vuelta de la X-sheet, sin rango elegido, no hacían nada y callaban; ahora explican que hace falta elegir un rango;
  - en Composición, las manijas Z, R y S se **arrastran**; ahora la ayuda lo dice.
- **Sin escenas basura.** Las 51 escenas vacías que habían dejado las pruebas en Documentos\LOW Proyectos\disenos están en la papelera de reciclaje. Las pruebas en la app real ahora usan una carpeta aparte.

## Pruebas

- **`check_recorrido_flujo_ui.js`** (nueva) arma dos recorridos y tres objetos. Comprueba que:
  - cada objeto toma el recorrido más cercano;
  - sumar la caja no rompe el movimiento de la pelota;
  - un objeto agregado después sigue el recorrido sin perder lo anterior;
  - volver a pasar la pelota no la duplica.

  Falla con la versión anterior.
- **`check_recorrido_ui.js`** suma dos casos, que fallan con la versión anterior:
  - dos objetos juntos;
  - una referencia pesada (un recorrido de pincel de miles de puntos y una capa de 400 trazos) que tiene que abrir en menos de 2,5 s; abre en 0,4 s.
- **`check_ocultar_capa_ui.js`** (nueva) prueba los dos ojos con clics de verdad. Falla con el código anterior.
- **`check_punteria_transformada_ui.js`** (nueva) usa una raya movida y un grupo trasladado y escalado, con el ratón de verdad. Comprueba:
  - el clic donde se ve la raya la elige;
  - el clic sobre el grupo elige el grupo;
  - un marco que empieza donde estaba la raya no la arrastra y elige las dos cosas.

  Falla con el código anterior: el marco arrastraba la raya 675 píxeles.
- **Probado en la app real:**
  - el recorrido con 20 marcas hechas con el pincel, sumando;
  - un grupo de dos objetos: la ventana abre en 0,4 s y conservan su distancia;
  - el ojo de la capa activa oculta y muestra;
  - el marco con trazos de pincel: desde la hoja, desde afuera del papel, con papel cebolla en el cuadro 2, y después mover lo elegido;
  - un trazo movido con la flecha blanca: el marco que empieza donde estaba ya no lo arrastra.
