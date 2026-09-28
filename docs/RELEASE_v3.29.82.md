# LOW 3.29.82 — IK y deformadores seguros

## Cambios

- Los gestos IK participan de la misma cancelación transaccional del rig.
- Cambiar de modo o pulsar Escape descarta el objetivo IK provisional.
- Los puntos de deformación se previsualizan sin escribir el documento durante el arrastre.
- El deformador crea una única clave al soltar, evitando historial saturado y estados parciales.
- Cancelar restaura inmediatamente la forma anterior.
- La puerta de releases comprueba estas reglas de manera automática.

## Verificación

- 212 pruebas del modelo 2D y rigging aprobadas.
- Contratos de IK, deformadores, Escape, rueda, modos, rig y tableta aprobados.
- Validación sintáctica de la aplicación completa.
