# LOW 3.29.84 — Animar desbloqueado y protegido

## Corrección urgente

- Se eliminó una excepción del panel de capas que interrumpía la interfaz del rig.
- Un esqueleto válido vuelve a habilitar Animar aunque todavía no tenga personaje.
- Los errores de arte, slots o vínculos ya no bloquean el movimiento del esqueleto.
- Los ciclos óseos y padres inexistentes siguen bloqueándose por seguridad.

## Protección contra regresiones

- Nueva prueba E2E en Chromium: lienzo → humano de biblioteca → Animar → FK → Posar.
- La prueba usa los 16 huesos reales de la plantilla, no un modelo artificial mínimo.
- 219 pruebas del modelo 2D y rigging aprobadas.
- Contratos críticos de interacción aprobados.
