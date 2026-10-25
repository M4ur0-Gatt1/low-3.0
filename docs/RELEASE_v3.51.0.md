
# LOW 3.51.0 · La toma en 3D de verdad y la vista dividida

Pedido de Mauro, con el reel de Yuzu Studio de referencia: capas de animación 2D separadas en profundidad y una cámara 3D. Arriba, la vista de trabajo con la cámara y las capas en el espacio; abajo, la toma terminada.

## La toma, con perspectiva real

En 3.50 la vista Cámara pintaba en SVG, y SVG no tiene perspectiva. Cada capa se aproximaba con una transformación plana, así que al orbitar fuerte una capa no se veía en escorzo (el lado lejano más chico), y una capa que la cámara atravesaba desaparecía entera en vez de cortarse.

- Ahora la toma se dibuja con three.js (`ui/composition/ae-render3d.js`), con **la misma cámara** y **las capas en el mismo lugar del mundo** que la vista SVG. La prueba compara las dos cuentas punto por punto.
- Escorzo real, recorte en el plano cercano y orden de pintado por distancia, como en After Effects.
- La profundidad de campo desenfoca cada capa según su distancia al foco, con la misma fórmula de antes.
- Cada capa se rasteriza **una vez** a una textura: mover la cámara sólo vuelve a dibujar, no recalcula los dibujos.
- Con la cámara de frente, la toma 3D es la misma imagen que la de 3.50 (la prueba lo mide en píxeles: difieren sólo los bordes suavizados).
- Una clave de cámara 2D (de las de antes) se sigue viendo con el SVG, que es exactamente lo que se exporta.

## La vista dividida

- **Arriba, la vista de trabajo:** la escena desde afuera, con un piso de referencia, el contorno de cada capa con su color, el cuerpo de la cámara, su pirámide de visión y el punto de interés.
- Se gira arrastrando, la rueda acerca y doble clic vuelve al ángulo de partida. **No mueve la cámara de la escena ni deja claves.**
- **Abajo, la toma:** lo que ve la cámara de la escena, con las herramientas de siempre (Unificada, Órbita, Track XY, Track Z, rueda y Ctrl+rueda).
- El botón **Dividida**, en la barra de la cámara, saca o vuelve a poner la vista de trabajo, y se acuerda de cómo la dejaste.

## Lo que se ve es lo que sale

- La exportación (MP4, GIF, PNG, spritesheet, Premiere), la vista previa y el play fluido piden el cuadro por `dzExportCuadroSvgListo`. Con una clave de cámara AE, el cuadro sale **del mismo render 3D** que la toma.
- Medido: con una órbita, la exportación SVG de 3.50 difería de la toma en un 4% de los píxeles. Ahora difiere en un 0,1%.
- Sin WebGL, o con una clave 2D, todo sale como antes.

## Pruebas

- `tools/check_ae_camera_model.js`: la cámara de three.js proyecta cada punto donde lo pone el proyector AE (de frente, orbitada y con otra lente), su base es ortonormal, las esquinas de cada capa coinciden con la vista SVG y vale el mismo límite de profundidad.
- `tools/check_ae_render3d_ui.js` (nueva, en el build), midiendo píxeles: vista de trabajo con contenido y botón Dividida; toma 3D igual al SVG de frente; la toma cambia al orbitar; girar la vista de trabajo no toca la cámara; la exportación sale del render 3D y es la toma que se ve. Con la exportación vieja, falla.
- `tools/check_2d_interaction_contracts.py`: el contrato del cuadro vacío vale también para el camino nuevo.
