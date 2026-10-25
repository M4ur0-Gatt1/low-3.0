
# LOW 3.53.0 · El ancho de la cabeza ensancha la cabeza

Reporte de Mauro, con captura: «el modificador del ancho de la cabeza deforma el cuello y la pera».

## Qué pasaba

Medido en la malla, con «Cabeza (ancho)» al máximo (1,80): **el cráneo no se ensanchaba nada y el cuello se corría 24 mm.** Eran dos errores juntos:

- El dial alejaba la piel de un eje que arranca en la articulación del cuello, y lo hacía en las tres direcciones. La pera, que queda debajo y adelante de esa articulación, se estiraba hacia abajo y hacia adelante.
- La protección de la cara (que la piel no tape los ojos ni las cejas al engordar) también apagaba el ancho en el cráneo. Así que el dial sólo movía la transición: el cuello y el borde de la mandíbula.

## Cómo es ahora

El ancho es **sólo hacia los costados**, alrededor del centro de la cabeza, como el «ancho de cabeza» de un creador de personajes:

- **Entero en el cráneo**, y algo menos en la mandíbula, que acompaña. Si no acompañara, quedaba un cráneo ancho sobre una mandíbula angosta, como un hongo.
- **El cuello no se mueve**: el dial sólo actúa donde la piel depende casi entera de la cabeza.
- **La pera no se estira**: está en el medio, y el corrimiento es proporcional a la distancia a ese medio.
- **El frente de la cara queda en su lugar** (ojos, nariz, boca, cejas). Los ojos y las cejas son mallas aparte, y si la piel de alrededor se corriera quedarían desencajados.

El resto de los diales de grosor y la contextura no cambian.

## Pruebas

- `tools/check_3d_cabeza_ancho_ui.js` (nueva, en el build): con el dial de verdad en 1,80, el cráneo se ensancha ×1,80 sólo hacia los costados, y la pera y el cuello no se mueven. Al volver a 1,00 queda la piel de fábrica. Con el código anterior, la prueba falla.
- El Estudio 3D (`ui/estudio3d`) se recompiló desde `low2-hybrid` y pasan las 21 pruebas 3D.
