# LOW 3.29.77 — Animar no modifica el esqueleto

## Corrección crítica

- Cambiar de Construir a Animar cancela cualquier gesto pendiente de edición.
- Un `pointerup` tardío ya no puede escribir cabeza, punta o articulación dentro de Animar.
- Los pivotes sólo pueden guardarse mientras el estado sigue siendo Construir.
- Animar modifica exclusivamente la pose y sus claves; la geometría neutra permanece intacta.
- Sin personaje vinculado, el movimiento visible del alambre se identifica como pose y no como edición estructural.

## Verificación

- 200 pruebas del modelo 2D y rigging aprobadas.
- Contrato específico que impide atravesar una edición hacia Animar.
- Contratos de Escape, rueda, modos y tableta aprobados.
- Prueba que compara cabeza, punta, pivote y jerarquía antes y después de crear una clave.
