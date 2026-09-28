# Research source — coloring system

Documento interno de trazabilidad. No es texto de producto.

## Pregunta

¿Qué contratos de OpenToonz y Toon Boom Harmony conviene incorporar a LOW para
colorear varios dibujos con rapidez sin propagar errores silenciosos?

## Fuentes primarias consultadas

1. OpenToonz, Painting Animation Levels
   - https://opentoonz.readthedocs.io/en/latest/painting_animation_levels.html
   - Evidencia: Fill trabaja por áreas/líneas, ofrece Selective, Frame Range,
     Gap Check, Fill Check y Autopaint.
   - Limitación reconocida: la posición del clic se interpola entre extremos y
     puede fallar si el área se desplaza.

2. OpenToonz, Managing Palettes and Styles
   - https://opentoonz.readthedocs.io/en/latest/managing_palettes_and_styles.html
   - Evidencia: el estilo de paleta es una referencia reutilizable y puede ser
     animado; la paleta es parte del nivel.

3. Toon Boom Harmony 25, Paint Tool Properties
   - https://docs.toonboom.com/help/harmony-25/essentials/reference/tool-properties/paint-tool-properties.html
   - Evidencia: Paint, Paint Unpainted, Unpaint, Apply to All Frames/Onion Skin
     Range y Automatic Close Gap.

4. Toon Boom Harmony 25, Painting Several Drawings Simultaneously
   - https://docs.toonboom.com/help/harmony-25/paint/colour/paint-multiple-drawings.html
   - Evidencia: aplica la acción a zonas superpuestas de dibujos expuestos.

5. Toon Boom Harmony 24, Creating Colour Art from Line Art
   - https://docs.toonboom.com/help/harmony-24/premium/paperless-animation/create-colour-art-line-art.html
   - Evidencia: separación Line Art/Colour Art y trazos invisibles de cierre.

6. Toon Boom Harmony 25, Close Gap Tool Properties
   - https://docs.toonboom.com/help/harmony-25/advanced/reference/tool-properties/close-gap-tool-properties.html
   - Evidencia: el cierre se representa mediante un trazo invisible editable.

7. Toon Boom Harmony 25, About Painting and Colours
   - https://docs.toonboom.com/help/harmony-25/paint/colour/colours.html
   - Evidencia: muestras con ID; editar la muestra actualiza las zonas vectoriales.

8. Toon Boom Harmony 25, Recolour Drawings
   - https://docs.toonboom.com/help/harmony-25/advanced/reference/dialog-box/recolour-drawings-dialog-box.html
   - Evidencia: reemplazo de color con alcances dibujo/capas/escena.

## Síntesis aplicada

- Conservar IDs de paleta y separar Line/Colour Art: adoptado.
- Modos Paint/Unpainted/Repaint/Unpaint: adoptado.
- Alcances current/selection/onion/level: adoptado en primera fase.
- Cierre de hueco no destructivo 0–10 px: adoptado en primera fase.
- Copiar sólo por coordenada: rechazado por ser insuficiente con movimiento.
- Identidad de zona + seguimiento geométrico + umbral de ambigüedad: mejora
  propia de LOW para cubrir la limitación documentada.
- Trazo invisible persistente de cierre y reemplazo de escena completa: quedan
  para la siguiente fase.
