# LOW 3.17.0 — El marco de selección como Illustrator, y LOW en inglés y portugués

## El marco de selección, como Illustrator

Pedido de Mauro: «pasá el marco a como Illustrator: lo que ya funciona en otros programas lo copiamos. Tiene que ser intuitivo, práctico y familiar para quien usa Toon Boom, Moho, Illustrator o After Effects».

- **En cualquier dirección, el marco elige lo que toca.** Antes, de izquierda a derecha exigía que el objeto quedara entero adentro (la convención de AutoCAD). Con la tableta eso casi nunca pasa, así que el marco «no elegía nada».
- **Tocar es tocar el trazo, no su caja.** Un arco grande cuya caja cruza el marco, pero cuya línea pasa lejos, ya no se elige. Es lo que hace Illustrator.
- **Shift** suma a lo elegido, como siempre.
- **Alt** elige sólo lo que queda entero adentro: un extra, que no cambia lo de fábrica.

## LOW en otros idiomas

Pedido de Mauro: «poder poner el programa en cualquier idioma desde las preferencias, pero que el idioma por defecto sea español».

- **Preferencias → Idioma**, arriba de todo. Cada idioma aparece en su propio nombre (Español, English, Português), para que quien no lee español encuentre el suyo.
- **Cambia al momento**, sin reiniciar, y queda guardado para la próxima vez.
- **Español sigue siendo el de fábrica.** En español el traductor no hace nada y no cuesta nada.
- **Primera etapa: toda la interfaz visible** en inglés y portugués. Incluye menús, herramientas, ayudas, paneles, la línea de tiempo, la X-sheet, Composición, la cámara y los mensajes más comunes.
  - Medido recorriendo los siete espacios de trabajo, lo que queda igual que en español son nombres propios y palabras que se escriben igual en los dos idiomas («Zoom», «Snap», «Curva»).
  - **Falta la segunda etapa:** unos 400 mensajes de la barra de estado y las ventanas que se abren con un botón.
- **El dibujo nunca se toca:** un texto dibujado en la hoja, el nombre de un hueso o lo que escribas en un campo quedan como están.
- **Para agregar un idioma** alcanza con un archivo `ui/i18n/<código>.js`. `tools/i18n_faltantes.js <código>` lista lo que falta traducir en la interfaz viva.

## Arreglos que aparecieron en el camino

- **La tuerca de Preferencias abría la ventana vieja.** Le faltaba la lista de atajos por grupos con buscador de la 3.13, y ahora el idioma. El menú Edición → Preferencias sí abría la nueva.
- **Dos bucles que repintaban la interfaz unas 57 veces por segundo, aun en reposo y en español:**
  - las divisiones entre paneles se rehacían solas: rehacerlas avisaba a su propio vigía, y el guardia que tenía que cortar el bucle se reiniciaba antes del aviso;
  - el muelle de animación reescribía su `hidden` sin que cambiara, y cada escritura repintaba todas las pestañas plegables.

  Ahora, con nada moviéndose, la interfaz no cambia ni una vez por segundo. Con la animación en reproducción y el inglés puesto, el traductor usa alrededor del 1 % del procesador.

## Pruebas

- **`check_marco_illustrator_ui.js`** (nueva) usa el ratón de verdad, con un círculo adentro, una raya que cruza el borde y un arco cuya caja cruza el marco pero su línea no. Comprueba que en las dos direcciones se eligen el círculo y la raya, y nunca el arco; que Alt elige sólo el círculo, y que Shift suma. Con la 3.16.1 falla: de izquierda a derecha no elegía la raya.
- **`check_idioma_ui.js`** (nueva) va por el menú Edición → Preferencias. Comprueba:
  - que el español es el de fábrica;
  - que están los tres idiomas;
  - que English traduce al momento el menú, las ayudas y un mensaje con números;
  - que el texto dibujado no se toca;
  - que queda guardado al recargar;
  - que volver a Español deja todo exactamente como era.
- Las pruebas del modelo (408) se actualizaron a la regla nueva del marco.
