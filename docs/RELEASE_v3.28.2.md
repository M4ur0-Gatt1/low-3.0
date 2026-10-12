# LOW 3.28.2 — El estudio 3D vuelve a dejar dibujar sobre la perspectiva

Reportado por Mauro: «el sistema 3D lo dejaste todo roto, no se puede dibujar en las perspectivas».

## Qué pasaba (dos defectos de la 3.26)

1. **Con el panel Perspectiva abierto te devolvía a la vista perspectiva.** Al soltar cada trazo, el panel releía la cámara para actualizar sus controles, y eso volvía a la vista perspectiva. Si estabas dibujando en Frente, Izquierda o Arriba, cada trazo te sacaba de esa vista.
2. **Sobre el esquema no se podía dibujar.** En perspectiva, el estudio sólo dibuja apoyado en una superficie (guía, plano o trazo). Las líneas de la calle, la manzana o la habitación son dibujo, no superficie, así que al dibujar sobre el esquema no pasaba nada.

## Qué cambió

- **El esquema da dónde apoyar el trazo:**
  - **Calle:** el piso y las dos fachadas.
  - **Manzana:** el piso y las paredes y techos de cada edificio.
  - **Habitación:** el piso, el techo y las paredes.
  - **Sólo líneas:** el piso.

  El trazo se apoya en la cara que está bajo el cursor y queda en ese plano mientras dibujás, igual que con una guía. Si prendés un plano o una guía, mandan ellos, como siempre.
- **El panel ya no te cambia de vista.** Relee la cámara sólo después de orbitar o desplazar en perspectiva, nunca al terminar un trazo. Sólo pasa a la vista perspectiva si tocás un control de la perspectiva: esquema, puntos, horizonte, giro, inclinación o lente.
- **Abrir un proyecto** con la perspectiva prendida respeta la vista con la que se guardó.

Sin la perspectiva de layout todo sigue como antes: en perspectiva se dibuja sobre una guía, un plano o un trazo.

## Pruebas

- **`check_perspectiva_3d_dibujo_ui.js`** (nueva), con el mouse de verdad. Comprueba:
  - que sin soporte en perspectiva no se dibuje, como siempre;
  - con la Calle sin plano ni guía, que un trazo sobre el piso quede en el piso (y = 0) y uno sobre la fachada, en la fachada (x = 8);
  - con el panel abierto, que dibujar en Frente deje la vista en Frente;
  - en la Habitación, que un trazo al fondo quede en la pared del fondo (z = −8).

  Falla con el estudio de la 3.28.1.
- Siguen pasando las del estudio 3D: `check_3d_studio_ui`, `check_3d_superficie_curva_ui`, `check_perspectiva_3d_ui` y `npm test`.
