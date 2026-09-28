# LOW 3.29.80 — Gestos de rigging coherentes

## Cambios

- Una única política decide los gestos sobre cuerpo, articulación y punta de cada hueso.
- **Alambre** crea huesos y nunca mueve el esqueleto existente.
- **Editar** es la única herramienta que modifica la geometría neutra.
- `Alt` sobre una articulación edita exclusivamente su pivote.
- En **Animar**, las articulaciones hijas permanecen conectadas y no se trasladan libremente.
- La raíz y los controles explícitos conservan la posibilidad de trasladar el personaje.
- La punta rota el hueso al animar y modifica su longitud solamente al construir.

## Verificación

- 209 pruebas del modelo 2D y rigging aprobadas.
- Contratos de Escape, rueda, modos, rig y tableta aprobados.
- Validación sintáctica del controlador y de la aplicación completa.
