# LOW · El tiempo como instrumento

> Por qué existe: la investigación del 29-sep-2026 (dolores de animadores,
> herramientas vecinas y el mercado 2023–2026) mostró que la producción musical
> trata el timing como un material que se **toca, se captura y se reusa**, y que
> ningún programa 2D lo hace a nivel de la hoja de exposición (búsqueda propia:
> no se encontró; ausencia de evidencia no es prueba). Procreate Dreams tiene
> «Performing», pero hay que grabar antes y mueve transformaciones, no la
> exposición cuadro a cuadro.

Principio: **sin IA generativa**. Todo es timing del propio animador, editable y
con un Deshacer.

## Hecho (v3.1.0)

- **Toma retroactiva** (como «Capture MIDI»): en Interpretar no hay botón de
  grabar. Cada pasada completa de golpes de Espacio —uno por cambio de pose y
  otro al final— queda sola como toma. Las pasadas cortadas por una pausa larga
  (2,5 s) se descartan y se avisan.
- **Carriles de tomas y comping** (como el comping de un DAW): cada toma es un
  carril; clic en la pose de un carril y B toma esa duración de esa toma.
  «Usar» pone la toma entera. Hasta 8 tomas, que se recuerdan mientras la app
  está abierta (clave: capa + firma de sus celdas y dibujos).
- Modelo puro en `ui/animation/rhythm-lab.js` (`passes`, `comp`); pruebas en
  `run_rhythm_tests` y `check_tomas_ui` (teclas reales).

## Siguiente

1. **Groove**: guardar el timing de un plano como plantilla y aplicarlo a otro
   con intensidad (0–130 %), sobre exposiciones.
2. **Cuantizar con fuerza**: acercar una toma a unos/doses/treses con un
   porcentaje, conservando lo orgánico.
3. **Controladores**: MIDI y gamepad (Web MIDI / Gamepad API) para marcar,
   recorrer y exponer; pads para disparar ciclos.
4. Llevar las tomas del ensayo a la escena (persistirlas con el documento) y a
   varias capas a la vez.
