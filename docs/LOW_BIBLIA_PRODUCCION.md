# Biblia de producción de LOW

**Estado:** norma principal de producto e ingeniería
**Propietario y autor del software:** Mauro Gatti / Tropa Circa
**Objetivo:** llevar LOW desde una alfa avanzada hasta un estudio creativo 10/10,
con calidad suficiente para reemplazar herramientas profesionales dentro de un
flujo de producción real.

Esta Biblia es un contrato. Una función no está terminada porque exista un botón,
compile o tenga una prueba aislada. Está terminada cuando el recorrido completo
es comprensible, reversible, persistente, rápido y verificable con mouse, tableta
y archivos reales.

---

## 1. Promesa del producto

LOW es un estudio creativo generalista y modular. Su centro es un documento
artístico capaz de pasar de dibujo a animación, rigging, composición y espacio
3D sin reconstruir el trabajo ni cambiar de lógica en cada módulo.

LOW debe ser:

- simple al comenzar y profundo al avanzar;
- visual antes que textual;
- previsible antes que sorprendente;
- reversible antes que automático;
- rápido para lo frecuente y explícito para lo destructivo;
- independiente de la IA para todas las funciones creativas esenciales;
- ampliable por modelos locales o remotos sin atribuirles autoría del software.

### Regla central

> La complejidad pertenece al motor; el artista recibe una intención clara, una
> respuesta inmediata y una forma segura de deshacerla.

---

## 2. Qué significa 10/10

Una valoración 10/10 no significa tener más botones que la competencia. Significa
que un profesional puede terminar trabajo de producción sin desconfiar del
programa.

| Área | Condición obligatoria para 10/10 |
|---|---|
| Dibujo | Trazo sin latencia perceptible, presión estable, cursores correctos, selección y transformación precisas. |
| Vector | Edición de nodos, curvas, contornos, rellenos, esquinas, grupos y capas sin resultados inesperados. |
| Cuadro a cuadro | Crear, duplicar, insertar, exponer, renumerar y reproducir dibujos sin perder contenido ni timing. |
| X-sheet | Niveles, exposiciones, celdas, cámara, audio y notas legibles y operables como una hoja profesional. |
| Timeline | Claves, interpolación, canales y curvas editables con feedback visual inmediato. |
| Rigging | Preparar, vincular, probar y animar un personaje sin desprender piezas ni confundir geometría con pose. |
| Cámara y composición | Encuadre, multiplano, parallax, profundidad, máscaras y exportación coherentes. |
| 3D | Módulo autónomo, estable, con superficies, guías, cámara y exportación reutilizable en 2D. |
| IA | Tareas acotadas, cancelables, recuperables, con progreso y cambios revisables. |
| Interfaz | Herramienta y modo activos siempre visibles; poco texto permanente; navegación consistente. |
| Rendimiento | Interacción fluida en escenas objetivo, memoria acotada y reproducción sostenida. |
| Confiabilidad | Cero pérdida de documento; guardado atómico, recuperación y compatibilidad verificadas. |
| Distribución | Instalación limpia, inicio correcto y pruebas de humo en cada sistema publicado. |

### Escala de madurez

- **0–2:** demostración o maqueta.
- **3–4:** alfa; la función existe, pero exige conocer sus defectos.
- **5–6:** beta; recorrido completo con problemas y límites visibles.
- **7–8:** producción limitada; confiable en proyectos definidos.
- **9:** producción profesional general.
- **10:** referencia del mercado, medida contra casos reales y competencia.

Ninguna documentación puede declarar 10/10 sin evidencia de pruebas y uso real.

---

## 3. Principios no negociables de interacción

### 3.1 Una herramienta, una intención

- Seleccionar nunca dibuja.
- Dibujar nunca mueve objetos existentes.
- Construir huesos nunca posa el personaje.
- Editar esqueleto nunca crea claves de animación.
- Animar nunca cambia la geometría neutra del rig.
- Reproducir nunca modifica el documento.

### 3.2 Estados explícitos

El módulo 2D tiene cuatro espacios principales:

```text
DIBUJAR → PREPARAR PERSONAJE → RIGGEAR → ANIMAR
```

Cada espacio muestra sólo las herramientas pertinentes. Los submodos de rigging
son mutuamente excluyentes:

```text
Preparar arte
  ├─ detectar/registrar piezas
  ├─ ordenar y nombrar
  └─ corregir pivotes sugeridos

Construir rig
  ├─ colocar plantilla o dibujar huesos
  ├─ editar esqueleto
  ├─ crear jerarquía
  └─ vincular arte

Probar rig
  ├─ posar sin grabar
  ├─ comprobar límites e IK
  └─ mostrar piezas sueltas

Animar
  ├─ posar
  ├─ crear/editar claves
  └─ reproducir
```

### 3.3 Teclas y gestos universales

- `Escape`: cancela el gesto actual y vuelve a selección; nunca cierra el módulo.
- `Supr`: borra la selección válida del modo activo, con Undo.
- `Ctrl+Z / Ctrl+Shift+Z`: Undo/Redo de una intención completa.
- `Alt+arrastrar`: duplica en selección; no cambia de herramienta.
- `Shift`: añade/quita selección o restringe el gesto según convención visible.
- Rueda: desplaza o amplía la vista; nunca transforma contenido sin modificador.
- Botón derecho: menú contextual de la selección y del modo actual.

Mouse, lápiz y touch deben atravesar el mismo controlador de puntero. Sólo la
presión, inclinación y borrador agregan información específica de tableta.

### 3.4 Feedback obligatorio

Antes, durante y después de un gesto deben verse:

- herramienta y modo activos;
- objeto o hueso afectado;
- pivote o articulación efectiva;
- previsualización sin comprometer datos;
- resultado y posibilidad de deshacer;
- razón concreta si la operación no es válida.

---

## 4. Flujo profesional de rigging

### 4.1 Recorrido mínimo aceptado

1. **Importar o dibujar personaje.** Se aceptan SVG por piezas, imágenes y dibujos LOW.
2. **Preparar piezas.** LOW detecta candidatos, conserva grupos y permite corregirlos.
3. **Elegir esqueleto.** Humano, humano simple, cuadrúpedo, perro, gato, caballo o rig facial.
4. **Adaptar.** Escala global inicial y edición directa de articulaciones compartidas.
5. **Vincular.** Asignación automática sugerida y corrección manual visible.
6. **Validar.** Lista de piezas sin hueso, huesos sin arte, ciclos, pivotes y límites dudosos.
7. **Probar.** Pose temporal sin claves ni modificación de la geometría neutra.
8. **Animar.** Autokey explícito, claves visibles en X-sheet/Timeline y reproducción.
9. **Reutilizar.** Guardar arte y rig como personaje de biblioteca; cada apertura crea una copia editable independiente.
10. **Guardar y reabrir.** Mismo arte, jerarquía, bindings, poses, controles y timing.
11. **Exportar.** Resultado visual igual a la previsualización aprobada.

### 4.2 Semántica de los huesos

- La forma cónica indica origen, dirección y longitud.
- La cabeza pertenece al padre; la punta conecta con el hijo cuando comparten unión.
- En **Editar esqueleto**, mover una unión conserva la cadena conectada.
- En **Animar**, una articulación hija rota; no se traslada libremente ni se desprende.
- Sólo raíz, controles y nodos expresamente liberados pueden trasladarse.
- Mover la raíz desplaza el personaje completo.
- El cuerpo del hueso selecciona o rota; no produce una traslación ambigua.
- Los controles de animador se distinguen de huesos internos y deformadores.

### 4.3 Niveles del sistema de deformación

| Nivel | Alcance | Estado objetivo |
|---|---|---|
| Rígido | Una pieza sigue un hueso | **Hecho** |
| Flexi-binding | Influencia por distancia | **Hecho en v4.6.0** — `Pesos automáticos` reparte por distancia al segmento del hueso |
| Pesos | Pesos de vértices editables | **Hecho en v4.6.0** — pincel de pesos con fuerza y radio, normalizado y reversible |
| Malla | Deformación de imagen/vector | **Hecho en v4.6.0** — rejilla por pieza, deformada por los huesos y corregible a mano |
| Smart Bones | Acciones conducidas por ángulo | **Hecho en v4.7.0** — acción grabada desde la pose, dosificada por el ángulo del conductor |
| Controles | Cara, manos, ojos, boca, accesorios | **Hecho en v4.10.0** — diales con nombre, animables, que conducen acciones |

El panel nunca debe mostrar controles de niveles que aún no tengan recorrido
completo y pruebas de aceptación.

---

## 5. Dibujo y vector profesional

### Selección y transformación

- Marco de izquierda a derecha: selecciona sólo lo contenido.
- Marco de derecha a izquierda: selecciona lo tocado.
- La selección múltiple se transforma como conjunto manteniendo posiciones relativas.
- Rotación alrededor de un pivote estable, sin invertir el movimiento del cursor.
- El cuadro delimitador acompaña la geometría rotada y conserva sus puntos cardinales.
- `Ctrl+G` y menú contextual crean un grupo real y reversible.
- `Alt+arrastrar` duplica una sola vez y permite ubicar la copia.

### Capas y objetos

- Todo objeto nuevo entra en la capa activa.
- Las capas gobiernan visibilidad, bloqueo, orden y alcance de selección.
- Los objetos aparecen agrupados bajo su capa, no en una lista plana interminable.
- Cambiar el orden debe modificar inmediatamente el dibujo y persistir al guardar.
- Línea, color y subcapas de arte deben permitir pintar bajo el contorno.

### Color

- Relleno y contorno se representan superpuestos al estilo profesional.
- Flecha curva visible intercambia ambos colores.
- Cuentagotas toma color real del elemento o píxel bajo el cursor.
- Color transparente y restauración por defecto son acciones diferenciadas.

### Herramientas vectoriales

Inflador, plancha, imán, suavizado y edición de nodos deben compartir selección,
previsualización, Undo y compatibilidad con tableta. Ninguna se declara terminada
sin modificar de forma controlada una curva real y sobrevivir guardado/reapertura.

---

## 6. Animación, X-sheet y Timeline

### X-sheet

- Es la vista principal de exposición y timing.
- Filas son fotogramas; columnas son niveles, cámara, audio y efectos.
- Celdas vacías, exposiciones sostenidas y dibujos nuevos se distinguen visualmente.
- Arrastrar, copiar, extender y renumerar son operaciones transaccionales.

### Timeline

- Resume tiempo, claves y clips; no duplica otra estructura de datos.
- Botones de cuadro vacío y cuadro duplicado son distintos.
- Reproducir, detener, anterior y siguiente usan símbolos universales.
- La reproducción no altera selección, dibujo ni pose.

### Function Editor

Para alcanzar nivel profesional debe haber:

- canales por propiedad;
- curvas Bezier editables;
- tangentes libres, suaves, lineales y escalonadas;
- edición numérica;
- regiones de tiempo;
- copia y pegado de curvas;
- filtros para controles seleccionados;
- sincronización con Timeline y X-sheet.

---

## 7. Arquitectura objetivo

`ui/app.js` deja de ser dueño del producto. Su función final será iniciar la
aplicación y conectar módulos.

```text
ui/
  application/
    app-shell.js
    command-bus.js
    mode-machine.js
    shortcuts.js
  drawing/
    document-controller.js
    pointer-controller.js
    selection-controller.js
    transform-controller.js
    vector-tools/
  animation/
    scene-model.js
    document.js
    exposures.js
    playback.js
    timeline/
    xsheet/
  rigging/
    rig-model.js
    rig-controller.js
    rig-overlay.js
    rig-input.js
    binding.js
    deformers.js
    library.js
  workspace/
    panels.js
    windows.js
    layouts.js
  ai/
    commands.js
    task-runner.js
    recovery.js
```

### Reglas de arquitectura

1. Un solo documento canónico.
2. El DOM representa estado; no es el estado.
3. Toda mutación pasa por comandos transaccionales.
4. Una intención del usuario equivale a una entrada de Undo.
5. Los controladores de interacción no serializan directamente.
6. Las vistas no contienen reglas de jerarquía, IK o exposición.
7. Los módulos 2D y 3D son autónomos y comparten contratos de archivo explícitos.
8. Las migraciones de documentos son versionadas y probadas.
9. Ningún archivo nuevo de producto debe superar 1.000 líneas sin justificación.
10. No se agregan funciones nuevas a `app.js`; sólo se extraen.

---

## 8. Calidad y pruebas obligatorias

### Pirámide de pruebas

| Nivel | Qué demuestra |
|---|---|
| Unidad | Matemática, interpolación, geometría, conversión y validación. |
| Modelo | Documento, Undo, persistencia, migración, jerarquía, IK y exposiciones. |
| Integración | Controlador + modelo + vista sobre un documento real. |
| Interacción | Gestos reales con puntero, teclado, tableta simulada y menús. |
| Recorrido | Importar → riggear → animar → guardar → reabrir → exportar. |
| Instalación | Equipo limpio, permisos normales, primera apertura y desinstalación. |
| Rendimiento | Escenas patrón, memoria, latencia del trazo y FPS sostenidos. |

### Matriz mínima por release

- Windows: instalador y ejecutable portátil.
- macOS/Linux: sólo si el comportamiento se verifica; compilar no equivale a soportar.
- Mouse y tableta Windows Ink.
- Documento nuevo y documento de versión anterior.
- Pantalla única y dos monitores.
- Guardado, recuperación tras cierre forzado y exportación.
- Dibujo, selección, transformación, Timeline, X-sheet y rigging.

### Política de defectos

- **P0:** pérdida/corrupción de trabajo, instalación inutilizable. Bloquea todo release.
- **P1:** recorrido principal imposible, transformación incorrecta, rig que se rompe. Bloquea release.
- **P2:** función secundaria incorrecta con alternativa disponible. Debe quedar documentada.
- **P3:** problema visual menor. Puede entrar en la versión siguiente.

---

## 9. Puerta de release

Una versión sólo se publica si:

1. La versión fuente coincide con etiqueta, ejecutable e instalador.
2. El repositorio está limpio y el commit está identificado.
3. Todas las pruebas automáticas aprobadas.
4. Recorrido de humo aprobado sobre el ejecutable empaquetado. **Automatizado
   desde v4.15.0** en los tres sistemas: `LOW --smoke` comprueba, dentro del
   binario, que estén los 70 archivos que pide `index.html`, que el sello de
   versión del HTML coincida con `LOW_VERSION`, que el puente `Api` se
   construya y que importen `webview`, `PIL` y `numpy`. No abre ventana: mide
   lo que hace falta para abrirla. Un archivo que no entró al bundle lo nombra
   y devuelve 1. Antes de esto se publicaban tres instaladores de los que sólo
   uno lo había arrancado alguien.
5. No hay P0 ni P1 abiertos.
6. Las migraciones abren proyectos anteriores sin pérdida.
7. Las notas distinguen implementado, experimental y pendiente.
8. Los artefactos tienen hash y tamaño razonable.
9. El release se crea después de validar, nunca antes.
10. Existe un procedimiento de reversión a la versión estable previa.

Queda prohibido usar una sucesión de releases públicos como sustituto de pruebas.
Las builds de desarrollo deben identificarse como tales.

---

## 10. Rendimiento objetivo

Los presupuestos se medirán sobre hardware de referencia definido:

- trazo: respuesta visual inicial menor a 16 ms;
- interacción de herramientas: 60 FPS objetivo, nunca por debajo de 30 FPS sostenidos;
- reproducción: FPS de proyecto sin saltos en escena patrón;
- guardado incremental: sin congelar la interfaz de manera prolongada;
- recuperación: último estado seguro disponible tras cierre inesperado;
- apertura: progreso visible y cancelación segura para proyectos grandes.

No se optimiza por intuición. Cada mejora de rendimiento requiere medición antes
y después.

### Escena patrón — definida y medida desde v4.15.0

La escena patrón que este capítulo nombraba sin definir es parte del contrato:
**3 capas × 24 cuadros, cada dibujo con 30 trazos de 40 puntos** (≈900 KB de
documento). La mide `tools/check_perf_budgets.js`, que está en la puerta de CI.

Dos clases de presupuesto, porque no se pueden exigir igual:

- **Tiempos** (trazo, cuadro más largo, bloqueo al guardar y al abrir): se miden
  y se imprimen siempre, y la puerta usa un margen de ×4 (`LOW_PERF_FACTOR`).
  Un runner cargado tarda tres o cuatro veces más que una máquina de trabajo, y
  un umbral ajustado daría fallas falsas todos los días; una regresión real
  —quintuplicar la latencia— igual la agarra.
- **Trabajo** (serializaciones por punto de trazo, nodos que deja un gesto):
  no depende de la máquina, así que la puerta es estricta y sin margen. Es la
  clase que descubre las regresiones antes de que se sientan.

La latencia del trazo se mide como **trabajo de la aplicación** —cuánto tarda en
que el trazo exista en la hoja— y no hasta el cuadro siguiente: eso último tiene
un piso de 16,7 ms por la cadencia del monitor, y hacía oscilar el número entre
3 y 18 ms sin que nada cambiara. Se medía el monitor, no el programa.

Los cuadros perdidos en reproducción se cuentan por AVISOS de cambio de cuadro,
no restando números de cuadro: con el bucle encendido la escena vuelve al 1 y
restar daba 11 avances donde hubo 36 — a un paso de firmar que la reproducción
estaba rota.

---

## 11. IA dentro de LOW

La IA es colaboradora, no propietaria del documento.

- Toda tarea tiene alcance, progreso, cancelación y límite de reintentos.
- No se repite indefinidamente una acción fallida.
- Tres fallos equivalentes detienen la tarea y ofrecen diagnóstico.
- Cada cambio se presenta como lote revisable y reversible.
- La generación de varios frames crea dibujos/exposiciones válidos en una capa elegida.
- Los modelos nunca se presentan como autores de LOW ni del trabajo del usuario.
- Las funciones básicas siguen disponibles sin conexión ni sesión externa.

---

## 12. Roadmap obligatorio

### AHORA — estabilización

1. Máquina de estados de herramientas y modos.
2. Controlador unificado de puntero para mouse/tableta.
3. Selección y transformaciones profesionales.
4. Flujo de rigging completo, rígido y verificable.
5. Pruebas de interacción y recorrido.
6. Pipeline que pruebe antes de publicar.
7. Extracción progresiva de `app.js`. **Con regla y puerta desde v4.16.0**:
   `app.js` **no puede crecer**. El techo vive en `docs/APP_JS_BUDGET`, lo hace
   cumplir `tools/check_app_js_budget.py` en CI, y cuando baja se ajusta solo —
   así el terreno ganado no se puede volver a perder en silencio. Cada trabajo
   se lleva un pedazo afuera al salir. Primeras extracciones: el panel de equipo
   (`ui/panels/colab-panel.js`, 370 líneas) y los arcos
   (`ui/panels/arcs-view.js`, 230), verificadas por sus propios recorridos E2E.
   De 18.650 a **18.050** líneas; concentra el 32,7 % del frontend.

**Avance verificable:** la política de habilitación, el contrato de binding
rígido y la decisión de gestos del rig ya viven en módulos puros. Vincular,
revincular, soltar, reparar propietarios y decidir qué hacen cuerpo,
articulación y punta se prueban sin DOM. Pesos y mallas permanecen en SIGUIENTE
hasta completar la extracción del controlador que ejecuta esos gestos.

La barrera transaccional de gestos ya cubre creación de huesos, edición de
geometría, pose FK, pivotes y jerarquía: cambiar de herramienta o modo cancela
el gesto activo e invalida eventos de puntero tardíos. IK y deformadores ya
usan la misma barrera; el deformador previsualiza en memoria y registra una
única clave al terminar. El próximo trabajo de AHORA es consolidar el
controlador de puntero compartido con las herramientas generales de dibujo.
La primera integración ya está cerrada: trazo libre y rigging poseen una única
sesión transaccional, se cancelan entre sí al cambiar de contexto y rechazan
eventos tardíos de otro lápiz o puntero. Además, la representación Moho de los
huesos escala proporcionalmente con la hoja; las áreas invisibles de agarre se
mantienen cómodas para tableta. El zoom nunca vuelve a cambiar la silueta del
esqueleto.

La segunda integración extiende esa misma autoridad a Inflador, Manejador de
contorno, Plancha e Imán. Cada gesto conserva un diario exacto de los atributos
SVG que toca; Escape, cambio de herramienta y `pointercancel` restauran el
estado anterior, mientras que sólo un `pointerup` del mismo puntero confirma la
operación. Una herramienta no puede apropiarse de un gesto empezado por otra ni
dejar una deformación a medias por vibración o pérdida de contacto de la tableta.

Una regresión real reveló que las pruebas puras no alcanzan para certificar el
recorrido del artista. Desde v3.29.84 existe una prueba E2E en Chromium que abre
un lienzo, coloca el humano completo de biblioteca sin personaje y exige que el
botón Animar entre efectivamente en FK con Posar activo. La puerta lógica, el
botón y el cambio de modo se verifican juntos.

No entran nuevas familias de funciones durante esta etapa.

### SIGUIENTE — producción 2D

1. **Video mocap y rotoscopía asistida**: importar actuación, sincronizarla,
   extraer silueta y pose, corregir resultados y retargetearlos sin destruir el rig.
   **Aceptado en parte (v4.14.0)**: probado con un video real de un sujeto —67
   siluetas y nivel de calco creado— y validado por el artista. Queda por probar
   el caso difícil de MOCAP-05: oclusiones, paneo y dos sujetos. Límite medido y
   escrito en la matriz: la silueta se analiza a **192 px de ancho como máximo**,
   por lo que el calco se ve a manchones en una escena de 1920.
2. ~~Editor de curvas.~~ **Hecho en v4.5.0**: canales por propiedad, curvas
   Bezier editables con manijas, tangentes Suave/Lineal/Escalón, edición
   numérica, regiones de tiempo, copiar y pegar sólo el timing, filtro por lo
   seleccionado y una única cabeza lectora con Timeline y X-sheet. Verificado
   por `tools/check_function_editor_ui.js`.
3. ~~Pesos, flexi-binding y mallas.~~ **Hecho en v4.6.0**: rejilla por pieza,
   pesos automáticos por distancia, pincel de pesos y skinning real
   (`Σ w · Mundo(f) · Bind⁻¹`). Verificado por `tools/check_rig_weights_ui.js`
   y 34 pruebas de modelo.
4. ~~Smart Bones y acciones.~~ **Hecho en v4.7.0**: acciones con su propio
   tiempo, conducidas por el valor de un canal (el ángulo de un hueso), que
   aportan DIFERENCIAS a la pose. Verificado por `tools/run_smart_bones_tests.js`
   (28) y `tools/check_smart_bones_ui.js`.
5. ~~Audio, lipsync y sustituciones consolidadas.~~ **Hecho en v4.11.0 y
   v4.12.0**: XML de FCP7 para Premiere/Resolve/Final Cut con la animación y su
   audio calzados, y lipsync por amplitud que reparte las bocas de la pieza
   según el volumen —silencio explícito, sostén mínimo y sólo el cambio, no una
   clave por cuadro—. Deja claves de sustitución normales: se corrigen a mano
   desde la X-sheet y entran en Undo como un único paso. **No lee fonemas**: es
   la primera pasada, que es como se trabaja en producción 2D. Verificado por
   `tools/run_lipsync_tests.js` (23), `tools/run_premiere_xml_tests.js` (29),
   `tools/check_lipsync_ui.js` y 8 contratos estáticos.
6. Cámara y composición verificadas.
7. Espacios de trabajo desmontables y multimonitor.
8. ~~Trabajo remoto en equipo.~~ **Hecho en v4.13.0**: relé propio
   (`server/low_relay.py`, stdlib pura, para poner en un droplet) con presencia
   —quién está y en qué cuadro—, **bloqueos arbitrados por el servidor**,
   edición repartida por instantánea de nivel y comentarios sobre el cuadro.
   Lo remoto NO entra en el historial propio. **No incluye pantalla
   compartida**: eso es WebRTC, otra pieza. Verificado por
   `tools/check_relay_server.py` (protocolo, con clientes WebSocket reales),
   `tools/run_collab_transport_tests.js` (34) y `tools/check_colab_ui.js`
   (LOW contra el servidor de verdad), más 13 contratos estáticos.
9. ~~Arcos y espaciado.~~ **Hecho en v4.14.0**: la trayectoria de cualquier
   cosa que se mueva —pieza de rig o elemento dibujado— con un punto por cuadro
   (juntos lento, separados rápido), la lectura en palabras de si **acelera** o
   **desacelera** y dónde cambia, y varios arcos fijados a la vez para medir el
   **overlapping** entre dos partes. El desfase se calla cuando los dos
   movimientos no se parecen, en vez de inventar un número. Verificado por
   `tools/run_arcs_tests.js` (26), `tools/check_arcs_ui.js` y 6 contratos.

#### Prioridad inmediata — video mocap y rotoscopía

El recorrido obligatorio es: **Importar → elegir fondo limpio → marcar sujeto →
analizar → revisar problemas → corregir/validar → aplicar**. Produce cuatro
resultados separados y combinables: video de referencia,
siluetas para calco, pose/esqueleto y curvas de movimiento retargeteables. El
video nunca modifica directamente el personaje ni reemplaza sus claves sin una
confirmación visible.

La base funcional guarda una pista de video con duración, tamaño, rango,
estado, muestras de pose y siluetas; sincroniza la referencia con el fotograma
actual y permite que motores intercambiables realicen el análisis. La aplicación
incluye un motor local honesto de silueta por diferencia contra un fondo elegido,
filtra componentes aislados, conserva continuidad espacial y permite marcar una
región de sujeto antes de analizar. La confianza y las oclusiones guían una cola
de revisión cuadro por cuadro; validar o corregir es reversible. No confunde esa máscara con una
detección corporal. El mapeo humano manual, la interpolación acotada entre
observaciones y la reducción reversible de claves ya forman un recorrido único
con diagnóstico de cobertura. Pose Landmarker Lite se distribuye dentro de LOW y
detecta el cuerpo localmente sin API; las correcciones humanas prevalecen al
reanalizar. La inferencia se ejecuta en un worker local para no bloquear la mesa
de dibujo y cae de forma segura al hilo principal sólo cuando el entorno no
admite workers. Los apoyos de ambos pies se detectan como intervalos; **Pies
firmes** compensa el deslizamiento antes de retargetear sin cambiar la pose
relativa del cuerpo. Pose Landmarker aporta además una máscara semántica del
actor, ajustada a la región marcada y sin borrar resultados anteriores cuando
no encuentra sujeto. Cuando no se marca un fondo limpio, la extracción local
estima uno con varias muestras temporales en vez de usar el primer cuadro. El
nivel de calco se construye como geometría SVG visible y omite máscaras vacías;
nunca convierte un análisis fallido en una secuencia de hojas blancas. La
siguiente puerta es la prueba con videos reales variados.

### DESPUÉS — integración avanzada

1. Intercambio 2D/3D formal.
2. Fondos y cámaras compartidas.
3. Automatizaciones de IA por lotes.
4. Optimización para proyectos largos.
5. Estudio de una aplicación iPad nativa; no prometer compatibilidad antes de existir.

---

## 13. Marcador de progreso 10/10

Cada área mantiene cuatro evidencias:

| Evidencia | Pregunta |
|---|---|
| Implementación | ¿Existe el recorrido completo en el producto? |
| Automatización | ¿Hay pruebas que fallen cuando se rompe? |
| Validación humana | ¿Un artista puede usarlo sin explicación del desarrollador? |
| Producción | ¿Sobrevive un proyecto real, guardado y exportación? |

La nota de un área es la menor de sus cuatro evidencias. Una interfaz bonita no
compensa un motor roto; un modelo correcto no compensa una herramienta imposible
de usar.

### Marcador vigente — v4.14.0

Medido en `docs/LOW_BALANCE_2026-09.md`. Cada nota es la MENOR de las cuatro
evidencias del área, y al lado va la que la frena.

| Área | Nota | La evidencia que frena |
|---|---|---|
| Rigging | 8 | Producción: falta un corto real terminado con personaje rigueado. |
| Dibujo | 7 | Automatización: el presupuesto de 16 ms por trazo nunca se midió. |
| Cuadro a cuadro | 7 | Validación humana: copiar y pegar borraba trabajo hasta v4.13.3. |
| Timeline | 7 | Producción: falta una escena larga que use curvas y arcos en serio. |
| Confiabilidad | 7 | Validación humana: apareció una pérdida de datos real en producción. |
| Vector | 6 | Automatización: nodos y contornos casi sin pruebas propias. |
| X-sheet | 6 | Implementación: falta la columna de notas. |
| Cámara y composición | 6 | Validación humana: el flujo de composición hubo que rehacerlo. |
| IA | 6 | Producción: falta el caso difícil de mocap (MOCAP-05). |
| Interfaz | 6 | Validación humana: dos funciones que el artista no pudo encontrar. |
| Distribución | 5 | Producción: los binarios de macOS y Linux nunca se abrieron. |
| Rendimiento | 4 | Automatización: cero medición contra los presupuestos de §10. |
| 3D | 4 | Implementación: hay multiplano, no un módulo 3D autónomo. |

**Producto: 6 — beta avanzada.** No sube a 7 mientras la confianza del artista
siga siendo lo último que descubre los defectos: en la tanda v4.13 aparecieron
dos que le comían trabajo.

Ningún área puede pasar de 8 hasta que se corra la prueba maestra de §15: sin
una persona ajena al desarrollo, la evidencia «validación humana» no existe en
el sentido que pide esta biblia.

---

## 14. Definición de terminado

Avance del 2026-09-18 — inspector y esquinas (§3/§5/§12): se reprodujeron y
corrigieron el Undo creado sólo por enfocar una propiedad, los campos que no
notificaban el guardado y el arrastre de esquina que se confirmaba al cancelar.
Los cambios ahora entran por `LowDoc.writeDrawing`, agrupados por intención;
la previsualización se descarta antes de cambiar de cuadro o guardar la escena.
`check_inspector_corners_ui` verifica interacción, cancelación, Undo/Redo,
radio exacto y reapertura con puente simulado. `dzWire` salió de `app.js` hacia
el módulo del inspector: el archivo principal baja de 17.117 a 17.075 líneas.
Esto no cierra §14: falta probar tableta, ejecutable empaquetado y el recorrido
completo de alineación/distribución del inspector.

Una tarea está terminada solamente cuando:

- cumple una necesidad concreta del artista;
- respeta los modos y atajos globales;
- funciona con mouse y tableta;
- tiene Undo/Redo;
- persiste al guardar y reabrir;
- no rompe documentos anteriores;
- tiene pruebas apropiadas;
- tiene estados vacío, error, carga y cancelación;
- usa componentes visuales consistentes;
- está documentada con sus límites reales;
- fue comprobada en el ejecutable empaquetado.

Si falta una condición, la tarea sigue en progreso.

---

## 15. Prueba maestra de aceptación

LOW alcanza madurez profesional cuando una persona que no participó del desarrollo
puede realizar, sin ayuda externa, este proyecto:

1. Crear un documento 2D.
2. Dibujar con tableta un personaje en capas de línea y color.
3. Seleccionar, agrupar, rotar, duplicar y editar formas con precisión.
4. Crear varios dibujos y organizar exposiciones en X-sheet.
5. Importar un segundo personaje por piezas.
6. Colocar una plantilla de esqueleto, adaptarla y vincularla.
7. Probar FK e IK sin romper las piezas.
8. Animar una caminata con claves y curvas.
9. Añadir cámara, profundidad, audio y composición.
10. Guardar, cerrar, reabrir y continuar sin diferencias.
11. Exportar un resultado idéntico a la previsualización.
12. Recuperar el proyecto después de un cierre forzado.

La plantilla humana de aceptación incluye una cintura escapular explícita:
pelvis → columna lumbar → columna media → pecho superior → hombro/clavícula →
brazo → antebrazo → mano en ambos lados. Los brazos
nunca nacen directamente del cuello o del centro del torso. El personaje de
Ayuda reproduce esa jerarquía con piezas visibles y vinculadas; el humano
completo ofrece dos articulaciones internas de columna para inclinar y arquear
el torso sin arrastrarlo como un bloque rígido.

Desde v3.29.86, la aceptación de transformaciones exige además rotar y luego
escalar una misma pieza sin modificar sus atributos geométricos, invertir el
sentido del arrastre ni deformar el contenido. Una cancelación del puntero debe
restaurar exactamente la matriz anterior.

Desde v3.29.88, el reparto automático debe medir arte y huesos en el mismo
sistema de coordenadas aunque las piezas estén dentro de grupos transformados.
La prueba maestra guarda, reabre y exporta una pose con todos los vínculos del
personaje de ejemplo; una pose visible que no persiste no cuenta como función.

El proceso debe quedar grabado como prueba repetible y medirse en errores,
tiempo, interrupciones y necesidad de ayuda. Ésta es la prueba que decide cuándo
LOW está a la altura de su promesa.
