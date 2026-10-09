# LOW 3.13.0 — Un atajo para cada herramienta, y las teclas hacen lo que anuncian

Pedido de Mauro: «buscá si no hay más errores como el de la coma y el punto, y mejorá el menú de atajos para que haya más, y uno para cada herramienta».

## Los errores de la misma familia

Buscando teclas y botones que anunciaban una cosa y hacían otra (o nada), aparecieron estos. **Todos se midieron con el código anterior antes de arreglarlos.**

**Teclas que otra parte del programa se quedaba antes:**

- **L y O** figuraban como Línea y Elipse. Con un documento abierto, los atajos de animación las atrapaban antes para el loop y el papel cebolla: L apagaba el loop y O el papel cebolla, sin avisar. Ahora L y O eligen Línea y Elipse. El loop pasó a **Alt+L** y el papel cebolla a **Alt+O**.
- **En el esqueleto**, B (crear hueso) y P (posar) hacían **dos cosas**: la herramienta del rig y, además, el Pincel o la Pluma. Ahora, si un modo con atajos propios atiende la tecla, el mapa no la vuelve a usar.

**Atajos anunciados que no existían:**

- **La Regla anunciaba «(R)»**, que era el Rectángulo; la Regla no tenía tecla. Ahora la ayuda de cada botón se escribe desde el mapa de atajos y no puede volver a anunciar una tecla que hace otra cosa.

**Cuadros en un `.low` (la familia de «,» y «.»):**

- **«,» «.» y los botones ◀ ▶ ⏮ ⏭** dependían de que hubiera una línea de tiempo montada. El arreglo de la 3.12.2 no alcanzaba en todos los casos, por ejemplo al cambiar de pestaña de documento. Ahora, si hay documento, manda el documento. Teclas, botones y la línea de tiempo separada pasan por la misma función.
- **🔑 Marcar fotograma clave** marcaba **siempre el cuadro 1** («Cuadro 1 marcado» estando en el 3), en una lista que el documento no guarda. Además guardaba el documento entero.
  - Ahora, como en Toon Boom y TVPaint, ser clave es una propiedad **del dibujo**: se guarda en el `.low` y se deshace con Ctrl+Z.
  - El botón 🔑 se ve prendido sobre un dibujo clave, y la celda lleva una raya naranja arriba en la línea de tiempo.
- **«Generar los cuadros» de la actuación del esqueleto** no agregaba nada en un `.low`. Ahora sostiene el dibujo hasta cubrir el lapso, en un solo paso de Ctrl+Z.
- **✨ Secuencia con IA** no podía trabajar sobre un `.low`. Ahora le manda al modelo el dibujo del cuadro actual, y los cuadros nuevos entran en el documento después del actual.
- **Otros arreglos menores con un `.low`:**
  - el Shift+clic en la línea de tiempo separada tomaba un ancla vieja;
  - el hojeo sobre la tira de cuadros quedaba muerto sin animación encendida;
  - parar el titiritero podía tirar un error;
  - la ventana separada no recibía el estado si la animación estaba apagada.

## El menú de atajos

**Preferencias → atajos** (también desde Ayuda → Atajos de teclado):

- **62 atajos agrupados**: Herramientas, Formas, Vista, Color, Animación, Cámara y esqueleto, Espacios de trabajo.
- **Buscador** por nombre o por tecla.
- **Combinaciones**: además de una tecla sola, Shift+tecla, Alt+tecla y teclas con nombre (Enter, Tab, F1–F12).
- **Si la tecla ya era de otra acción**, esa queda libre y te dice cuál era.
- **Los atajos fijos** (Ctrl+Z, Ctrl+S, flechas, Supr, F5…) se ven en la misma lista, aparte.
- Shift+X, Tab, F7, 3 y Z estaban escritas a mano en el programa: ahora están en el mapa y se reasignan.

**Teclas de fábrica nuevas:**

| Herramienta | Tecla |
|---|---|
| Regla | U |
| Esculpir trazos | W |
| Deformar trazo (imán) | Shift+W |
| Inflar forma | Q |
| Bomba de grosor | Shift+Q |
| Plancha | Y |
| Pinza | X |
| Deformador de caja | Shift+D |
| Círculo | Shift+O |
| Polígono | Shift+R |
| Estrella | S |

| Otras acciones | Tecla |
|---|---|
| Enderezar la mesa | Shift+F |
| Loop | Alt+L |
| Papel cebolla | Alt+O |
| Cuadro vacío | Alt+N |
| Duplicar cuadro | Alt+D |
| Insertar copia | Alt+I |
| Dibujo clave | Alt+K |
| Intercalar | Alt+T |
| Exportar | Alt+E |
| Clave de cámara | Shift+C |
| Esqueleto | Shift+K |
| Espacios de trabajo | Alt+1 … Alt+7 |

Lo que ya tenías reasignado se respeta. Si una tecla nueva de fábrica choca con una que elegiste, gana la tuya.

## Pruebas

- **`check_atajos_ui.js`** (nueva) aprieta las 62 teclas de verdad, en Dibujo y en Animación, y mira qué acción les llega. Comprueba también:
  - que cada herramienta (18) tiene tecla y la elige;
  - que la ayuda de cada botón dice la tecla del mapa;
  - que en el esqueleto la tecla no se usa dos veces;
  - que se puede reasignar desde Preferencias con el teclado, con aviso del conflicto, y que «Restaurar» vuelve a las de fábrica;
  - «,» y «.» sin línea de tiempo montada, el 🔑 sobre el dibujo con Ctrl+Z, y «Generar los cuadros» en un `.low`.
- Con el código anterior falla, y cada defecto se midió por separado:
  - L → no elegía Línea;
  - O → apagaba el papel cebolla;
  - B en el esqueleto → también el Pincel;
  - 🔑 → «Cuadro 1» estando en el 3;
  - «Generar los cuadros» → 3 → 3.
- Probado en la app real: U, X, Shift+W, Q, W, O, Alt+O, Alt+L, Alt+1 y Alt+2.
