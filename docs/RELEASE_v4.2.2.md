# LOW v4.2.2 — Matriz visual reproducible

Este patch completa la preparación del release de pinceles y storyboard sin
cambiar su alcance funcional.

## Corregido

- GitHub Actions inicia Chromium con una ventana explícita de 1366×768, el
  mínimo de escritorio usado por las verificaciones visuales de LOW.
- El E2E del Estudio de pinceles declara además su métrica CDP por pestaña. Las
  pestañas nuevas de Chromium headless ya no vuelven silenciosamente a 800×600.
- Se mantienen los umbrales de calidad del panel: debe estar realmente visible,
  acoplado, tener más de 300 px de ancho y alto y no tapar el lienzo.

Los intentos `v4.2.0` y `v4.2.1` fueron detenidos por CI antes de crear binarios.
La versión estable previa continúa siendo `v4.1.0` hasta que este pipeline
complete todas las plataformas.
