# LOW v4.2.1 — Release verificado de pinceles y storyboard

`v4.2.1` contiene el mismo salto funcional documentado en
[`RELEASE_v4.2.0.md`](RELEASE_v4.2.0.md) y corrige la configuración del control
de calidad multiplano en GitHub Actions.

## Corregido

- El E2E del escenario multiplano fija ahora una superficie de escritorio de
  1366×768. Chromium headless utilizaba 800×600 y terminaba midiendo el
  escenario dentro de un área de 523×109 px, fuera de la matriz de pantallas
  soportada por LOW.
- El recorrido de rigging abre explícitamente la Timeline antes de comprobar la
  pista de sustituciones, evitando depender del workspace persistido por una
  prueba anterior.

No se rebajaron umbrales visuales ni se omitieron pruebas. El pipeline mantiene
los recorridos de rigging, coloreo, workspace, multiplano, pinceles y storyboard
como condición previa a generar los artefactos.

## Reversión

La versión estable anterior es `v4.1.0`. El tag `v4.2.0` quedó como intento de
release detenido por la puerta de CI y no generó binarios publicados.
