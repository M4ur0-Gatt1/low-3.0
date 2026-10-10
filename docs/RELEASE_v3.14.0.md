# LOW 3.14.0 — Las flechas mueven lo seleccionado, y un círculo a mano + Shift queda perfecto

## Las flechas mueven lo seleccionado, como en Illustrator

Pedido de Mauro: «el atajo para mover los frames debe ser únicamente el punto y la coma, no las flechas. Las flechas deben mover los vectores en la pantalla, como en Illustrator: tengo un círculo que quiero desplazar lo mínimo posible, de a un pasito, y en lugar de eso se mueve la línea de tiempo».

**Qué pasaba.** Los atajos de animación tomaban las flechas antes que nadie: ← → cambiaban de cuadro y ↑ ↓ de dibujo, aunque hubiera algo seleccionado.

**Ahora:**

| Tecla | Hace |
|---|---|
| ← → ↑ ↓ | Corre lo seleccionado **1 unidad** del documento (el mismo paso a cualquier zoom) |
| Shift+flecha | Corre lo seleccionado 10 unidades |
| «,» y «.» | Cambian de cuadro (ya no las flechas) |
| **Alt+,** y **Alt+.** | Van de dibujo en dibujo, saltando los sostenidos (lo que antes hacían ↑ ↓) |
| Alt+← → | Mueve los cuadros elegidos en la línea de tiempo, si no hay nada elegido en la mesa |

- Varias flechas seguidas se deshacen con **un solo Ctrl+Z**, como un arrastre.
- Sin nada seleccionado, las flechas no hacen nada y la barra de estado recuerda cuáles son las teclas de los cuadros.

## Forma rápida: un círculo a mano + Shift al soltar = un círculo perfecto

Pedido de Mauro: «tenía un atajo para dibujar un círculo manteniendo Alt o Shift al cerrar un pseudo círculo con la tableta; esa función no me está andando».

Con el **lápiz** o el **pincel**, se dibuja un círculo a mano, más o menos cerrado, y **al levantar el lápiz** se tiene apretada una tecla:

| Tecla al soltar | Queda |
|---|---|
| **Shift** | Un círculo perfecto, con el centro y el tamaño del que dibujaste |
| **Alt** | La elipse que mejor ajusta, con su inclinación y su proporción |
| **Shift** en un trazo **abierto** | Una recta |

- Sin tecla no se toca nada: lo dibujado es del que dibuja.
- La forma sale con la herramienta y el grosor en uso, y empieza donde empezó el trazo, en el mismo sentido.
- Ctrl+Z la saca entera.

**Arreglado mientras se probaba en la app real.** A 29 % de zoom, la elipse salía con los bultos del trazo a mano. El suavizado del trazo le dejaba 18 de sus 89 puntos, y la curva rehecha con tan pocos quedaba con bultos. Ahora una forma rápida no pasa por ese suavizado.

## Pruebas

- **`check_flechas_ui.js`** (nueva) usa el teclado y el ratón de verdad, en el espacio de Animación. Comprueba que:
  - → corre el círculo 1 unidad, Shift+→ 10, y ← ↑ hacia su lado, sin cambiar de cuadro;
  - tres flechas se deshacen con un Ctrl+Z;
  - sin selección no cambia el cuadro;
  - «,» «.» cambian de cuadro y Alt+, Alt+. de dibujo.

  Con el código anterior falla: → cambiaba de cuadro.
- **`check_forma_rapida_ui.js`** (nueva) dibuja con el ratón a 29 % de zoom. Comprueba:
  - con Shift, un círculo: redondez 0,004;
  - con Alt, una elipse que cumple su ecuación con la proporción dibujada (2:1);
  - sin tecla, el trazo queda como se dibujó;
  - trazo abierto + Shift, una recta;
  - con el pincel, un círculo;
  - Ctrl+Z lo saca.

  Falla con el código anterior, y falla también sin el arreglo del suavizado (la elipse con bultos).
- **`check_atajos_ui.js`** ahora aprieta 64 teclas: se suman Alt+, y Alt+.
- **Probado en la app real** con eventos de lápiz (`pointerType: pen`, como la tableta):
  - círculo con Shift (redondez 0,002 contra 0,087 a mano) y elipse con Alt;
  - las flechas: 3 → más un Shift+→ dan 13 unidades, y el cuadro sigue en el 1.
