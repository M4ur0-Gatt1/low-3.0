# Línea base de rendimiento — v4.15.0

Números medidos por `tools/check_perf_budgets.js` sobre la **escena patrón**
definida en §10 de la biblia: 3 capas × 24 cuadros, 30 trazos de 40 puntos por
dibujo, ≈914 KB de documento.

Sirven para una cosa: que la próxima vez que algo se sienta lento, haya con qué
comparar en vez de discutir impresiones.

## Máquina de referencia

Windows 10 Pro, Chromium headless a 1366×900, servidor estático local.
Es la máquina de trabajo del autor, no un banco de pruebas dedicado.

## Medido — tres corridas seguidas

| Presupuesto §10 | Medido | Presupuesto | Margen de CI (×4) |
|---|---|---|---|
| Trazo: trabajo de la app hasta que existe en la hoja | **2,5 – 4,2 ms** | 16 ms | 64 ms |
| Cuadro más largo arrastrando (60 puntos) | **18,0 – 18,6 ms** | 33 ms (piso de 30 FPS) | 132 ms |
| Guardado: bloqueo máximo del hilo principal | **17,3 – 21,4 ms** | 250 ms | 1000 ms |
| Apertura de la escena patrón: bloqueo máximo | **18,0 – 18,4 ms** | 400 ms | 1600 ms |
| Reproducción a 24 fps: cuadros perdidos | **11,1 – 16,7 %** | sin saltos | falla sobre 50 % |
| Recuperación: punto seguro tras editar | **13 KB, presente** | debe existir | — |

FPS medio arrastrando: **59,9 – 60**.

## Trabajo — no depende de la máquina

| Medida | Valor | Puerta |
|---|---|---|
| Serializaciones del SVG por punto de trazo | **0,02** | ≤ 1 |
| Pico de nodos durante un gesto de 60 puntos | **60** | ≤ 2 por punto |
| Nodos que QUEDAN tras un trazo de 60 puntos | **−1** | ≤ 6 |
| Nodos que QUEDAN tras un trazo de 180 puntos | **1** | ≤ 6, y sin crecer con el largo |

El último par es el que importa de verdad: **un trazo se colapsa en una sola
cinta sin importar su longitud**. Tres veces más puntos dejan los mismos nodos.
Eso es lo que evita que el archivo engorde por trazo y que después de una jornada
el proyecto sea inmanejable.

El pico de 60 nodos durante el gesto es el costo de la previsualización —un
sello por punto— y desaparece al soltar. Es diseño, no fuga.

## Lo que la medición encontró de mi propio arnés

Tres defectos, y los tres habrían dejado el arnés decorativo:

1. **El medidor de bloqueos descartaba la muestra que importaba.** Saltear la
   primera lectura para evitar el arranque en frío tiraba justamente el bloqueo:
   con un freno artificial de 1600 ms devolvía 18 ms. Corregido esperando un
   cuadro antes de medir; con el freno ahora informa 3211 ms y falla.
2. **Los cuadros perdidos se calculaban restando números de cuadro.** Con el
   bucle encendido la escena vuelve al 1, así que 36 avances se leían como 11 y
   estuve a un paso de firmar que la reproducción estaba rota. Se cuentan avisos.
3. **La escena patrón salía 24 veces más chica de lo que decía.** `expose(id, 24, 1)`
   expone el MISMO dibujo 24 veces —es un sostenido, no 24 dibujos—, así que se
   medía un documento de 40 KB creyendo que era de 900.

## Lo que todavía no se mide

- **Apertura con progreso visible y cancelación segura** (§10, último punto): se
  mide el bloqueo, no que haya progreso ni que se pueda cancelar a mitad.
- **Memoria acotada** (§2, área Rendimiento): no hay medición de memoria.
- **Escenas grandes de verdad.** La patrón son 900 KB; un corto son decenas de
  megas. El presupuesto de «proyectos largos» sigue sin banco de pruebas.
- El **ejecutable empaquetado**: todo esto se mide en Chromium, no en la app
  real de pywebview, que usa otro motor.
