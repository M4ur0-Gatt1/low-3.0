# LOW 3.29.79 — Núcleo de vinculación estable

## Cambios

- El contrato de vinculación del rig fue separado del documento y de la interfaz.
- Vincular y revincular una pieza garantiza un único hueso propietario.
- Soltar una pieza conserva el hueso, el slot y los dibujos alternativos.
- La reparación de proyectos antiguos usa la misma regla que los proyectos nuevos.
- El nuevo módulo prepara una transición segura hacia flexi-binding, pesos y mallas.

## Verificación

- 203 pruebas del modelo 2D y rigging aprobadas.
- Pruebas directas del motor de binding sin interfaz.
- Validación sintáctica y contratos de interacción obligatorios.
