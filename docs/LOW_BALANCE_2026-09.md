# Balance de LOW — septiembre de 2026

> **Al día en v4.30.0.** Lo que sigue del encabezado es el estado de hoy. El
> cuerpo del documento, más abajo, es el balance tal como se midió en la
> **v4.14.0** y se deja sin retocar: sirve para ver qué se movió y qué no.

## Qué se cerró desde la v4.14.0

De las seis faltas, **tres están cerradas** —la 2, la 3 y los tres P1 de la 6—
y **una va en camino y ya no retrocede** —la 4—:

| falta | estado |
|---|---|
| 2 · Rendimiento sin medir (§10) | **cerrada.** `check_perf_budgets.js` en la puerta de CI, con escena patrón de 3 capas × 24 cuadros × 30 trazos (~914 KB). Los cuatro presupuestos de tiempo pasan sin margen. |
| 3 · Humo del binario en macOS y Linux (§9·4) | **cerrada.** Los tres sistemas arrancan el ejecutable empaquetado en CI. |
| 4 · Partir `app.js` (§12) | **en camino, y ya no va para atrás.** Puerta de CI que falla si `app.js` crece, con techo que baja solo. De 18.564 líneas a **17.596**. |
| 6 · SAFE-01 / SAFE-02 | **cerradas** en v4.18.0: inicio seguro y reset por dominio, automatizados en modelo, puente y Chromium. |
| 6 · BRUSH-02 | **cerrada** en v4.21.0. Ver abajo. |

Quedan **dos**, y son las que de verdad pesan:

1. **La prueba maestra de §15** — una persona ajena, un proyecto completo, sin
   ayuda. Sigue sin correrse ni una vez, y eso **no lo puedo hacer yo**: hace
   falta otra persona. Lo que sí se hizo en v4.25.0 es el **instrumento** que
   §15 pide para poder correrla («el proceso debe quedar grabado como prueba
   repetible y medirse en errores, tiempo, interrupciones y necesidad de
   ayuda»): está en Ayuda → Prueba maestra §15, y el protocolo en
   `LOW_PRUEBA_MAESTRA_15.md`. Antes la prueba no se podía correr *como la
   biblia la define* aunque hubiera alguien disponible. Mientras no se corra,
   **ningún área puede pasar de 8**.
2. **MOCAP-05, el caso difícil** — oclusiones, paneo y dos sujetos. Hace falta
   material de video que hoy no tengo.

## Notas que se movieron

| Área | v4.14.0 | hoy | por qué |
|---|---|---|---|
| **Rendimiento** | 4 | **6** | De cero medición a cuatro presupuestos medidos en cada commit. No sube más porque los presupuestos son de §10 y todavía no hay una escena de producción larga que los estire. |
| **Distribución** | 5 | **6** | Los tres binarios arrancan; la firma está cableada y espera certificado. No sube más porque **sólo el de Windows lo usó alguien de verdad**. |
| **Vector** | 6 | **7** | BRUSH-02 cerrado y con guardia, y la edición de nodos —que era lo que la frenaba— pasó de cero pruebas a un recorrido propio, con un defecto de historial encontrado y arreglado en el camino. No sube a 8 porque falta producción: un dibujo entintado de verdad con estas herramientas. |
| **Cámara y composición** | 6 | **7** | Composición pasó de diorama a herramienta: arrastrar mueve, hay vista de cámara con el cuadro real, y el inspector responde. Frenada por producción: falta una escena larga hecha con eso. |
| **X-sheet** | 6 | **7** | Las columnas que §6 pide —cámara, audio y efectos— existen y salen del modelo; era el hueco de implementación. Frenada ahora por producción: falta una escena larga cuyo timing se haya trabajado leyendo esta hoja. |
| **Primera pantalla / puesta en marcha** | — | **7** | Área que antes no se miraba, y en v4.28.0 pasó a ser lo primero que se ve: LOW abre en el estudio 2D y la IA quedó detrás de un botón, por decisión de Mauro. Se abrió con tres defectos que él reportó y que se cerraron en v4.29.0 y v4.30.0 —botones que no respondían, la invitación clavada tapando el documento, y el estudio apareciendo a los 6.542 ms porque esperaba a que cargara el chat—. No sube a 8 porque los tres se descubrieron **usándola**, no probándola: la puerta tenía un guard que pasaba en verde mientras el panel estaba muerto. |
| Las demás | | **igual** | Nada cambió su evidencia más débil. |

**Nota del producto: 6 — beta avanzada, con el techo puesto por la §15.**

Y una advertencia que dejaron v4.28.0–v4.30.0, porque afecta a cómo leer esta
tabla entera: **un guard verde no es evidencia de que algo funcione si no se
verificó que falle con el código roto.** Los tres defectos de la primera pantalla
convivieron con una prueba propia que pasaba: disparaba el `click` a mano, y un
`preventDefault()` en `pointerdown` se come el click que el navegador iba a
generar. Desde entonces cada aserción nueva se comprueba contra su violación
antes de darla por buena, y eso está en la regla de trabajo, no sólo en el ánimo.

No sube a 7 por una sola razón, y no es técnica: 7 es «confiable en proyectos
definidos», y todo lo que sabemos de uso real viene de **una persona, que además
es quien pide las funciones**. Las cuatro faltas que se cerraron eran de
automatización y de producción; la que queda es de validación humana, y esa no
se cierra escribiendo código.

## Lo que yo haría ahora

1. **La prueba maestra de §15.** Es lo único que puede mover la nota del
   producto. Las tres cosas que la bloqueaban ya están hechas, así que la
   persona ajena ya no va a chocar contra defectos que conocíamos.
2. ~~Pruebas propias de la edición vectorial~~ — **hecho en v4.22.0**, y de
   paso apareció y se arregló un defecto del historial: mover un punto dejaba
   dos pasos y el primer Ctrl+Z no se veía.
3. ~~Las columnas que le faltan al X-sheet~~ — **hecho en v4.26.0**. Y acá me
   corrijo: antes escribí «la columna de notas», y eso era invento mío, no un
   requisito. §6 pide literal «filas son fotogramas; columnas son niveles,
   cámara, audio y efectos»; ésas son las que se agregaron.
4. **MOCAP-05** cuando haya material.

La respuesta honesta a «¿cuánto falta?» sigue siendo la misma de la v4.14.0,
pero por un motivo distinto y más chico: antes faltaban cosas del programa;
ahora falta **que lo use alguien que no sea su autor**.

---

# El balance de la v4.14.0, sin retocar

## Balance de LOW — septiembre de 2026 (v4.14.0)

Medido contra la biblia (`LOW_BIBLIA_PRODUCCION.md`), no contra la impresión de
que «anda bien». La regla de §13 es la que manda: **la nota de un área es la
menor de sus cuatro evidencias** —implementación, automatización, validación
humana y producción—. Una interfaz bonita no compensa un motor roto.

La escala es la de §2: 5–6 beta, 7–8 producción limitada, 9 producción
profesional, 10 referencia del mercado.

---

## Dónde estamos: nota por área

| Área | Nota | Cuál de las cuatro evidencias la frena |
|---|---|---|
| **Rigging** | **8** | Producción: sobrevive el proyecto de ejemplo; no hay todavía un corto real terminado con un personaje rigueado. |
| Dibujo | 7 | Automatización de rendimiento: el presupuesto de 16 ms por trazo nunca se midió. |
| Cuadro a cuadro | 7 | Validación humana: copiar y pegar **borraba trabajo** hasta v4.13.3, y lo encontró el artista, no la prueba. |
| Timeline | 7 | Producción: curvas y arcos existen y se prueban; falta una escena larga que los use en serio. |
| Confiabilidad | 7 | Validación humana: guardado atómico y recuperación están automatizados, pero en esta misma tanda apareció una pérdida de datos real. |
| Vector | 6 | Automatización: la edición de nodos y contornos casi no tiene pruebas propias. BRUSH-02 sigue abierto. |
| X-sheet | 6 | Implementación: falta la columna de notas de una hoja profesional. |
| Cámara y composición | 6 | Validación humana: la pantalla de composición se rehízo porque «no se entendía el flujo». |
| IA | 6 | Producción: mocap acotado y cancelable, probado con un video; falta el caso difícil (oclusiones, paneo, dos sujetos). |
| Interfaz | 6 | Validación humana: **dos «no lo pude encontrar» en una sola sesión** (el XML para Premiere y las herramientas de movimiento). |
| Distribución | 5 | Producción: se compilan tres instaladores por release y **sólo el de Windows lo arrancó alguien**. |
| Rendimiento | 4 | Automatización: **cero medición** contra los presupuestos de §10. |
| 3D | 4 | Implementación: hay escenario multiplano, no un módulo 3D autónomo con superficies, guías, cámara y exportación. |

**Nota del producto: 6 — beta avanzada.** Recorrido completo de punta a punta,
con límites visibles y dos áreas (rendimiento y 3D) en alfa.

No es 7 por una razón concreta: 7 es «confiable en proyectos definidos», y en
esta tanda aparecieron **dos defectos que le comen trabajo al artista** —copiar
y pegar, y el guardado que borraba el punto de recuperación—. Los dos están
arreglados y con guardia, pero la nota mide la confianza que el programa se
ganó, no la que quisiéramos.

---

## Qué se ganó (cifras, no adjetivos)

*Cifras de la v4.14.0. Hoy, en v4.26.0: 12 suites de modelo, **28** recorridos
E2E en Chromium, 6 comprobaciones del puente Python y **212** contratos
estáticos.*

| | |
|---|---|
| Suites de modelo en la puerta de CI | 11 |
| Casos de modelo | 600 |
| Recorridos E2E en Chromium | 16 de 17 |
| Comprobaciones del puente Python | 4 |
| Contratos estáticos | 128 |
| Filas de la matriz de regresión | 44 (P0 y P1: todas cerradas) |
| Instaladores por release | 4 (Windows exe + instalador, macOS, Linux) |

Cerrado en las últimas versiones: los seis niveles de deformación de §4.3, el
editor de curvas, pesos y mallas, Smart Bones, controles, lipsync, XML para
Premiere, trabajo remoto en servidor propio y arcos con espaciado.

---

## Cuánto falta para «terminado»

«Terminado» no lo define una lista de funciones: lo definen §14 y §15. Contra
eso, faltan **seis cosas**, y están ordenadas por lo que más mueve la aguja.

### 1. La prueba maestra de §15 — nunca se corrió

Es *la* que decide. Pide que **una persona que no participó del desarrollo**
haga un proyecto completo sin ayuda: dibujar con tableta, X-sheet, importar un
segundo personaje, riguear, FK e IK, animar una caminata, cámara y audio,
guardar, reabrir, exportar y recuperar tras un cierre forzado.

Nunca se hizo, ni una vez, ni completa. Todo lo que sabemos de validación humana
viene de una sola persona —que además es quien pide las funciones—. Mientras
esto no se haga, **ningún área puede pasar de 8**, porque la evidencia
«validación humana» no existe en el sentido que pide la biblia.

Esfuerzo: una jornada de una persona ajena, más el instrumento para medir
errores, tiempo, interrupciones y pedidos de ayuda.

### 2. Rendimiento: medir antes de opinar (§10)

Hay seis presupuestos escritos —16 ms de respuesta al trazo, 60 FPS de
interacción con piso de 30, reproducción sin saltos, guardado que no congela,
recuperación, apertura con progreso— y **ninguno se ha medido nunca**. La única
medición sistemática de la sesión fue por un problema reportado (el panel de
Equipo, 206 ms contra 553 ms), y sirvió: había un defecto real.

La biblia dice «no se optimiza por intuición». Hoy tampoco se verifica por
medición. Falta un arnés de rendimiento en la puerta de CI, con escena patrón.

### 3. Humo sobre el ejecutable empaquetado, en los tres sistemas (§9·4)

Se publican cuatro artefactos por release. El de Windows lo arranca el artista
todos los días. **A los de macOS y Linux nunca los abrió nadie.** Son binarios
que compilan, no binarios que funcionan: la diferencia es exactamente lo que
§9·4 exige comprobar.

### 4. Partir `app.js` (§12 AHORA·7) — y va para atrás

| | líneas |
|---|---|
| `app.js` | **18.564** |
| los otros 73 módulos, juntos | 36.477 |

Un solo archivo con un tercio del frontend. Y esta sesión **le sumó unas 850
líneas** (equipo y arcos), así que el punto no sólo está abierto: está
empeorando.

Hay que decir la otra mitad: §12 AHORA cierra con «no entran nuevas familias de
funciones durante esta etapa», y en las últimas versiones entraron cuatro
—lipsync, XML, trabajo remoto, arcos—. Fueron pedidas y se entregaron probadas,
así que la decisión es del que manda; pero la deuda que eso genera es real y
tiene un nombre y un número.

### 5. MOCAP-05: el caso difícil

Mocap quedó **aceptado en parte**: un video real, 67 siluetas, nivel de calco
creado, validado por el artista. Falta lo que la fila pide de verdad:
oclusiones, paneo y dos sujetos, con diagnóstico comprensible y corrección
manual.

Límite medido y ya escrito en la matriz: la silueta se analiza a **192 px de
ancho como máximo**, y por eso el calco se ve a manchones en una escena de 1920.
Es un techo elegido para no congelar la interfaz, no un defecto — pero si se
quiere calco fino, hay que subirlo y pagar el costo.

### 6. Los P1 que quedan abiertos

- **BRUSH-02** — que cada parámetro visible del pincel produzca una diferencia
  medible en el trazo. Hoy hay parámetros que no se puede afirmar que hagan algo.
- **SAFE-01 / SAFE-02** — inicio seguro y reset por dominio. Cuando algo se
  rompe, no hay forma de arrancar limpio.

---

## Lo que yo haría, en este orden

1. **El arnés de rendimiento** (falta 2). Es lo único que puede estar
   empeorando sin que nadie se entere, y ya tenemos la prueba de que medir
   encuentra defectos reales.
2. **Humo en macOS y Linux** (falta 3). Es publicar binarios sin saber si
   arrancan; se resuelve en una tarde y saca a Distribución de 5.
3. **Partir `app.js`** (falta 4), con una regla simple: nada nuevo entra en
   `app.js`, y cada función nueva se lleva un pedazo afuera al salir.
4. **La prueba maestra de §15** (falta 1) cuando las tres anteriores estén, para
   que la persona ajena no choque contra cosas que ya sabemos.

Los dos primeros son días. El tercero es semanas. El cuarto es el que decide si
LOW está a la altura de su promesa, y hasta que se haga, la respuesta honesta a
«¿cuánto falta?» es: **el programa está listo para que lo use su autor, y todavía
no probado para que lo use otro**.
