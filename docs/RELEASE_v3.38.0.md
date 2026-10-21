# LOW 3.38.0 — Personajes de verdad: posar y modelar · Guías desde la regla · Espejar en el 2D · Más aire en la interfaz

Pedidos de Mauro:
- «no me gustan nada los personajes que tenés, quiero algo mucho más estilizado y realista… seguro hay bibliotecas libres ya hechas»
- «seguí con posar al personaje»
- «si sólo voy a poder dibujar sobre la forma del personaje… tengo que poder modelarlo también»
- «una función que falta en LOW 2D es la de espejar una imagen y/o objetos»
- «al diseño en general le faltan márgenes y paddings, y el tamaño de la tipografía en muchos casos está grande»
- «quiero que agregues la posibilidad de poner guías como en Illustrator a partir de la regla»

## Taller de personaje: cuerpos libres de Quaternius

El maniquí de cápsulas de la 3.37 se va. El taller usa tres cuerpos de **Quaternius**, con licencia **CC0** (dominio público, uso comercial libre): **Hombre**, **Mujer** y el **Maniquí** articulado de dibujo.
- Tienen anatomía realista estilizada y llevan un esqueleto de verdad (65 huesos, el mismo en los tres).
- Se ven en arcilla gris, con la ropa interior oscura y el relieve de los músculos. El color se cambia.
- Pesan 2,7 MB en total; vienen de 25 MB en los paquetes originales. Los convierte `tools/personajes_quaternius.py`.
- La licencia de origen queda en `ui/estudio3d/personajes/LICENCIA.txt`.

El taller tiene tres modos.

### Dibujar
Se dibuja con todas las herramientas del estudio.
- Cada trazo se pega al **hueso** que toca: el pelo a la cabeza, la manga al antebrazo. Lo sigue al posar y al cambiar las proporciones.
- **Con espejo**, el trazo espejado es otro trazo, pegado a la parte del otro lado del cuerpo. Cae bien aunque los brazos estén en distinta pose. Esto arregla la limitación de la 3.37.

### Posar
Se agarra una parte del cuerpo y se arrastra: gira desde su articulación y lleva lo que cuelga de ella.
- El **codo y la rodilla son bisagras**: se doblan para un solo lado, hasta 150°. De frente, «subir la mano» dobla el codo hacia adelante.
- Se ve el esqueleto encima, con la articulación elegida en naranja.
- **21 poses de fábrica**, tomadas de la biblioteca de animaciones de Quaternius (CC0): parado, hablando, caminando, trotando, corriendo, saltando, sentado, agachado, arrodillado, levantando algo, empujando, bailando, golpe, con espada, hechizo, apuntando, manejando, nadando, tendido, pose T y caminando formal.
- Botones: **Enderezar**, **Copiar al otro lado** y **Espejar la pose**.
- **Pies en el piso**: lo más bajo del cuerpo se apoya solo. Al sentarlo, los pies quedan en el piso.

### Esculpir
Pinceles para modelar la piel: **Tirar**, **Inflar**, **Desinflar**, **Suavizar** y **Aplanar**.
- Tienen tamaño, fuerza y **simetría** izquierda/derecha.
- Se esculpe sobre el cuerpo posado, y lo esculpido acompaña cualquier pose.
- «Volver a la piel original» deshace toda la escultura.

### Proporciones
Se ajustan con el esqueleto: cabeza, cuello, torso, hombros, caderas, brazos, piernas y alto en metros. También se puede cambiar de cuerpo (hombre, mujer, maniquí) conservando la pose y las proporciones.

### Lo demás del taller
- Las **líneas de modelo** arrancan apagadas y se miden sobre el cuerpo.
- La hoja de modelo y el giro en cuadros salen con el personaje posado.
- Cada cambio es un paso de Ctrl+Z.
- Se guarda en «Mis personajes» con su cuerpo, pose, proporciones, escultura y trazos.

### Personajes en los fondos
- La colección de fábrica **«Personajes»** trae Hombre, Mujer, Maniquí, Hombre corriendo, Mujer hablando, Maniquí caminando y Maniquí sentado.
- Se colocan en los fondos a escala humana.
- El proyecto 3D guarda cada personaje con su pose.

## Espejar en el 2D

«Voltear» ya existía, escondido en el inspector, y fallaba en varios casos. Ahora:
- **Shift+H** espeja en horizontal y **Shift+V** en vertical. También está en el menú **Edición** y en el **clic derecho** sobre la mesa.
- Funciona con trazos, formas, **imágenes importadas**, textos, grupos y «Toda la capa».
- Espeja alrededor del centro de la selección y en los ejes de la hoja. Con varios objetos, el conjunto cambia de lado.
- Se deshace en un paso de Ctrl+Z.
- El recuadro de transformación queda sobre el objeto espejado y cada tirador estira el lado que se ve. Antes quedaba corrido un alto entero.

## Guías desde la regla, como en Illustrator

Pedido de Mauro: «quiero que agregues la posibilidad de poner guías como en Illustrator a partir de la regla».

Las reglas (Ctrl+R) y el arrastre desde la regla ya existían, pero al medirlos con el mouse aparecieron dos fallas:
- **Las guías no se veían.** Se creaban en los datos, pero su capa nacía oculta y nunca se mostraba.
- **La regla estaba corrida 18 px.** El «0» caía a 18 px del borde de la hoja.

Ahora funcionan como en Illustrator:
- **Crear:** se arrastra desde la regla de arriba (guía horizontal) o de la izquierda (vertical); con **Alt**, sale la otra orientación.
  - Mientras se arrastra se lee la posición.
  - Cerca del borde o del centro de la hoja, la guía se pega ahí; con **Shift** avanza de a 10.
- **Editar:**
  - Una guía se mueve arrastrándola con las flechas de selección.
  - Soltarla sobre la regla, o elegirla y apretar **Supr**, la borra.
  - **Doble clic** abre un campo para escribir la posición exacta.
- **Dibujar encima:** con el lápiz o las formas, la guía no se agarra.
- **Imán:** lo que movés (bordes y centro) y las formas que dibujás se pegan a las guías.
- **Menú Vista:**
  - Reglas (Ctrl+R)
  - Mostrar guías (Ctrl+Ñ)
  - Bloquear guías (Ctrl+Alt+Ñ)
  - Imantar a las guías (Ctrl+Shift+Ñ)
  - Borrar las guías
  
  Ñ es la tecla del «;» de Illustrator en los teclados en castellano.
- **Se guardan con la escena,** y cada cambio es un paso de Ctrl+Z.

## Más aire en la interfaz

En el estudio 3D:
- Los paneles tienen márgenes; los rótulos iban pegados al borde.
- Los botones de los paneles se ven como botones. La regla general de los botones del estudio les borraba el borde y el fondo.
- **Ctrl+Z funciona después de usar una lista, un deslizador o una casilla.** Antes, elegir una pose de la lista y apretar Ctrl+Z no deshacía nada: el estudio trataba esos controles como un campo de texto.

En el 2D, una escala única en `ui/design/espaciado-tipografia.css`:
- **Tipografía:** 10 / 11 / 12 / 13 / 15 px según la función (rótulo, control, texto, título).
- **Espaciado:** 4 / 8 / 12 / 16 px.

Antes había 17 tamaños de letra distintos (de 8,5 a 19 px). Lo que se veía grande era:
- los botones y campos sin tamaño propio, que caían en el 13,33 px del navegador;
- los botones de la línea de tiempo, en monoespaciada;
- los modales, con títulos de 17 px y texto de 13,5 px;
- el panel del pincel.

Las cabeceras de la X-sheet y de otros paneles, que se partían en dos renglones, ahora entran en uno. Además:
- el inspector tiene 12 px de margen;
- el campo de zoom de la cámara ya no muestra «10(»;
- el «Listo» de la ayuda de la lapicera tiene estilo de botón.

## Pruebas

- **`check_3d_taller_personaje_ui.js`** (reescrita). Con el mouse de verdad comprueba:
  - el cuerpo de la mujer en pose «Parado» y sin líneas de modelo;
  - el trazo con espejo en los dos antebrazos;
  - que subir el antebrazo de frente dobla el codo, el trazo lo sigue y el del otro brazo no se mueve;
  - que de perfil la rodilla no se dobla para adelante y sí para atrás;
  - «Sentado» con los pies en el piso, y un Ctrl+Z desde la lista;
  - las piernas más largas (el personaje crece y los trazos siguen pegados);
  - inflar con simetría (41 vértices de cada lado), Ctrl+Z y tirar;
  - la hoja de modelo posado;
  - guardar, reabrir y cancelar;
  - la colección «Personajes» en un fondo, y el proyecto guardado y abierto.
- **`check_taller_hoja_2d_ui.js`**: actualizada al cuerpo nuevo.
- **`check_guias_regla_ui.js`** (nueva). Con el mouse y el teclado de verdad comprueba:
  - el 0 de las reglas sobre el borde de la hoja;
  - la guía en el pixel donde se suelta, en pantalla y en los datos, y la de Alt;
  - que con zoom la guía sigue a la hoja;
  - el imán: mover un rectángulo y dibujar otro se pegan exacto a la guía;
  - borrar sobre la regla, con Ctrl+Z y Ctrl+Y;
  - el doble clic con 540;
  - que Supr borra la guía y no el dibujo elegido;
  - el menú Vista, Ctrl+Ñ y el bloqueo;
  - que las guías viajan con la escena.

  En la 3.37 falla en el primer paso: la regla estaba corrida 18 px.
- **`check_espejar_2d_ui.js`** (nueva). Prueba el trazo con Shift+H y Ctrl+Z/Ctrl+Y, el tirador del objeto espejado, varios objetos, la pieza girada desde el menú, el clic derecho, la imagen con Shift+V, el mapa de atajos y «Toda la capa» con un solo Ctrl+Z.
