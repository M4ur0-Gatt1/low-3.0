# LOW 3.0.1 — un solo cartel, y el esqueleto es una calavera

Dos cosas que se veían mal en la 3.0.0, las dos reportadas mirando la pantalla.

---

## 1. Los carteles de ayuda salían dobles

Reportado: *«están duplicados los tooltips del sistema, dejá uno solo, lo más
sutil y lo menos invasivo posible»*.

El globo de ayuda de LOW le sacaba el `title` al botón, para que el navegador no
dibujara su cartel nativo encima. Pero en la línea de tiempo seguía saliendo
doble, por dos agujeros:

- **La fila también tiene su `title`**, que es el nombre de la capa. Al pasar
  por el sol de la mesa de luz, el navegador mostraba ese cartel.
- **La línea de tiempo se repinta con el cursor quieto**, y el botón nuevo
  nacía con su `title` puesto.

**Ahora** el `title` se saca de toda la cadena de contenedores que hay bajo el
cursor, se vuelve a sacar si algo se repinta debajo, y todo se devuelve al irse
(los lectores de pantalla lo usan).

**Y el globo es más sutil:**

- muestra sólo el nombre y el atajo, sin el párrafo de detalle;
- letra de 11 px, fondo discreto y sin borde marcado;
- entra suave, con un poco más de demora (320 ms).

MEDIDO con el código de la 3.0.0: con el globo puesto, la fila seguía teniendo
su `title`. Con la 3.0.1 no hay ninguno en la cadena y hay un solo globo, que
dice «Mesa de luz». Se mantiene así aunque la línea de tiempo se repinte.

## 2. Dos botones iguales en la línea de tiempo

Reportado: *«tengo dos botones exactamente iguales, uno es el esqueleto cut-out
y otro el del fotograma clave, son ambos una llave»*.

El esqueleto ahora es una **calavera**, con el mismo trazo que el resto de los
íconos, en tres lugares: la barra de arriba, la línea de tiempo y el encabezado
del panel de rigging. La llave queda sólo para el fotograma clave.

## Guardias

- `check_un_solo_cartel_ui.js` — el cursor real sobre el sol de una fila: un
  solo globo, ningún `title` en la cadena, lo mismo después de repintar la línea
  de tiempo, y los `title` vuelven al irse. Reproduce el cartel doble con el
  código de la 3.0.0.
- Contrato 2D nuevo: el esqueleto y el fotograma clave no pueden compartir
  ícono.

Puerta local: 28 suites y puentes, y 76/76 recorridos.
