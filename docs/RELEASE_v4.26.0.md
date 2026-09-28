# LOW v4.26.0 — Codos y rodillas que doblan, y el X-sheet completo

Dos mitades, hechas en paralelo con reparto por el bus y sin pisarnos ningún
archivo. Una es de Codex y la otra mía, y conviene que se sepa cuál es cuál.

---

# Articulaciones flexibles — **trabajo de Codex**

**Esto no lo hice yo.** Lo publico porque Mauro lo pidió y porque Codex no llegó
a commitear: su último mensaje en el bus (03:13) decía «último QA y
documentación/CI antes de mi commit», y no volvió a escribir ni dejó tag. Los
archivos estaban en el árbol sin publicar.

De tres puntos —inicio, articulación y extremo— arma un hueso superior y uno
inferior con una malla de 12 × 12 y pesos suavizados alrededor de cada segmento,
así el **codo** o la **rodilla** doblan sin romper el dibujo. Y un **corte
dibujado a mano** que parte los contornos: los trazos abiertos quedan abiertos y
los rellenos se cierran a lo largo del corte.

Detalle en `docs/LOW_ARTICULACIONES_FLEXIBLES.md`, que también es suyo.

## Lo verifiqué antes de publicarlo

No subo código que no mire ni que no mida. Su recorrido
`tools/check_flexible_limb_ui.js` pasa: **144 vértices** de malla, hombro
estable, doblez visible, **un** paso de undo, persistencia, la variante de
rodilla, cancelación, y el corte devolviendo **2 piezas**. La puerta completa
pasa con las dos mitades en el árbol.

Una sola cosa preferiría distinta, y la dejo dicha en vez de cambiársela: el
comentario de `split` está en inglés y el resto del proyecto comenta en
castellano. Es su archivo; reescribirle la prosa sin preguntarle es peor que la
inconsistencia.

---

# El X-sheet completo (§6) — mío

§6 dice, literal:

> Filas son fotogramas; columnas son niveles, cámara, audio y efectos.

La hoja tenía el número de cuadro y una columna por capa. **La mitad de lo que
la biblia define no estaba.**

Ahora están las tres, y salen del modelo, sin una segunda fuente que pueda
discrepar:

| columna | de dónde sale |
|---|---|
| **CÁM** | un rombo por clave, de `scene.camera.keys` — lo que la cámara usa para interpolar |
| **AUDIO** | el nivel de cada cuadro como barra, pedido por `pista.peakAt(f)` |
| **EFEC** | cuántos planos tienen clave de composición en ese cuadro |

El rombo de la cámara es el mismo signo que ya usa la marca de papel cebolla en
el número de cuadro: en una hoja de exposición el rombo **ya** significa clave,
y no hacía falta inventar otro.

**El audio se lee con `peakAt`, que aplica el desplazamiento de la pista.** Leer
`peaks` crudo mostraría la onda **corrida** respecto de lo que se escucha: es el
error más fácil de cometer acá y el más difícil de ver, porque la columna se
vería perfectamente bien. La aserción está verificada contra su violación —
cambiando `peakAt(f)` por `peaks[f-1]` el guard falla con «el nivel del cuadro 3
no es el de peakAt».

## Lo que estas columnas NO hacen

Son de **lectura y navegación**: muestran qué pasa en cada cuadro y llevan ahí
al hacer clic. La edición de claves de cámara sigue donde ya estaba, en el panel
de cámara: `dzCamKeyToggle` exige el modo cámara y opera sobre el cuadro actual,
y meter una segunda forma de crear claves desde la hoja sería inventar una
operación que nadie pidió.

Van a la derecha del botón de agregar capa, con ancho fijo y angosto: el espacio
de la hoja es de los niveles, que es donde se trabaja.

## Y una corrección mía en el balance

Yo había escrito que al X-sheet «le falta la columna de notas». **Eso era
invento mío, no un requisito.** §6 no pide notas: pide cámara, audio y efectos.
Corregido en `LOW_BALANCE_2026-09.md` y anotado como tal.

---

## Pruebas

`tools/check_xsheet_columnas_ui.js`, nueva y en la puerta de CI, más la de Codex.
Con las dos, la puerta pasó completa: 12 suites de modelo, 6 comprobaciones del
puente Python, **28** recorridos E2E, **212** contratos estáticos, los
presupuestos de §10 y el techo de `app.js`.

Fila nueva en la matriz: **XS-COL**, automatizada.

## Balance

**X-sheet pasa de 6 a 7**: las columnas de §6 existen y era su hueco de
implementación. No sube a 8 porque le falta producción — una escena larga cuyo
timing se haya trabajado leyendo esta hoja.

Las dos faltas que quedan siguen igual, y ninguna se cierra escribiendo código:
la **prueba maestra de §15** —que ya tiene su instrumento desde la v4.25.0, pero
necesita una persona ajena— y **MOCAP-05**, que necesita material de video.

## Convivencia, que esta vez funcionó

Tres cosas que evitaron el enredo de la v4.15.0:

- **reserva por el bus antes de tocar un archivo**, y ninguno editó el archivo
  del otro;
- **`git add` por archivo, nunca `-A`**;
- y cuando un archivo compartido tenía trabajo de los dos sin publicar
  —`ui/index.html` y `.github/workflows/build.yml`—, se preparó en el índice una
  versión con lo de uno solo, dejando lo del otro intacto en el disco. Publicar
  referencias a archivos que no van en el commit rompe el arranque y la puerta.

Se agregó `ui/.limb-*` y `ui/.*-before.html` a `.gitignore`: quedó un respaldo
de `index.html` de 1218 líneas suelto en el árbol y no tiene que poder colarse.

## Reversión

Estable previa: `v4.25.0`. Las dos mitades son independientes: las
articulaciones flexibles se desactivan sacando los dos `<script>` de
`rigging/flexible-limb*.js` del `index.html`, y las columnas del X-sheet
quitando las tres llamadas `_celdaCamara` / `_celdaAudio` / `_celdaEfectos` de
`ui/animation/xsheet-view.js`.
