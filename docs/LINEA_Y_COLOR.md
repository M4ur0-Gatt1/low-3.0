# Planos Línea y Color en LOW 2D

LOW separa el arte de cada nivel en dos planos vectoriales coordinados:

- **Color** se compone primero y queda debajo.
- **Línea** se compone después y conserva el contorno limpio encima.

La barra contextual permite elegir el plano activo con dos símbolos: `╱` para Línea y `●` para Color. Las formas y trazos nuevos entran en el plano activo. Desde **Capa → Mover selección a Línea/Color** también se puede reorganizar arte existente sin alterar sus coordenadas.

## Flujo recomendado

1. Dibujar el contorno en Línea.
2. Cambiar a Color y construir los rellenos debajo.
3. Volver a Línea para retoques del contorno.
4. Usar la selección múltiple para mover piezas entre planos cuando sea necesario.

El balde profesional, la propagación segura entre dibujos y sus modos de
alcance están especificados en [COLORING_SYSTEM.md](COLORING_SYSTEM.md).

Los documentos anteriores siguen siendo compatibles: al activar el sistema, los objetos sueltos se agrupan en Línea y el fondo del lienzo permanece fuera de ambos planos.

## Referencias funcionales

La separación sigue el principio de *Line Art* y *Colour Art* documentado por Toon Boom Harmony: el color puede mantenerse debajo de la línea, y ambos planos pertenecen al mismo nivel de dibujo. LOW implementa esta idea con grupos SVG propios y una interfaz simplificada; no incorpora código de terceros.

- https://docs.toonboom.com/help/harmony-24/premium/morphing/about-colour-art-line-art-rule.html
- https://docs.toonboom.com/help/harmony-24/advanced/getting-started/layers.html
- https://docs.toonboom.com/help/harmony-20/scripting/extended/tutorial-vector-model.html

## Próximos planos compatibles

La estructura admite sumar en el futuro *Overlay* y *Underlay* sin mezclar el color con el contorno ni romper los SVG existentes.
