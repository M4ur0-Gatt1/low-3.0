# Plan de trabajo de LOW — septiembre de 2026

Fecha: 2026-09-09. Base revisada: `a6643b8`. Alcance: consolidación del producto completo y capacidades avanzadas de animación inspiradas en Harmony. Este es el orden de trabajo propuesto; no declara una equivalencia con Harmony ni una auditoría exhaustiva de todos los módulos.

## 1. Estado y reglas

Estados: **completar** (existe implementación), **crear** (capacidad nueva propuesta), **validar** (falta evidencia de uso), **investigar** (no afirmar ausencia antes de revisar el recorrido completo).

La Biblia de producción sigue definiendo calidad y aceptación. Este plan ordena el trabajo futuro; los balances anteriores conservan su valor histórico. No repetir tareas cerradas por leer sus secciones antiguas.

Ya existen Timeline/X-sheet, paletas vinculadas, audio/lip-sync, curvas, huesos/IK, deformadores, mallas, controles animables, acciones correctivas, composición multiplano, transporte colaborativo y estudio 3D. Tener código no equivale a tener cada recorrido completo y probado.

Corrección respecto de la comparación inicial con Harmony: `document.js` contiene `createRigControl`, `setRigControlValue` y `createRigAction`. El trabajo de controles maestros debe ampliar esa base, no crear otro sistema paralelo.

## 2. Orden de ejecución

| Etapa | Resultado | Dependencia | Entrega visible |
|---|---|---|---|
| A | Base confiable y estado actualizado | Ninguna | Arrancar, trabajar, guardar y recuperar sin sorpresas |
| B | Personaje flexible utilizable | A | Brazo/pierna que se prepara y anima con pocos pasos |
| C | Controles de actuación | B | Cabeza, rostro y manos manejados con controles claros |
| D | Animación y biblioteca de producción | C; parte puede avanzar desde A | Reutilizar personajes, poses y timing |
| E | Composición avanzada | A y modelo de efectos revisado | Máscaras y efectos reutilizables; luego nodos |
| F | Dibujo, 3D e intercambio consolidados | A; desarrollo incremental | Flujo artístico consistente de dibujo a exportación |
| G | Producción larga y distribución | Se mide desde A | Proyecto real terminado, reabierto y exportado |

La validación humana y el rendimiento acompañan todas las etapas: no se posponen hasta G. No se asignan fechas ficticias; estimar cada entrega después de medir su primer recorrido.

## 3. Backlog ordenado y verificable

> **Estado sincronizado con el repositorio el 2026-09-12 (v4.37.0).** Antes este
> backlog tenía TODO sin tildar, incluidos items publicados hace días: un plan
> que se contradice con el código es justo lo que A01 vino a arreglar. `[x]`
> cerrado con versión y prueba; `[~]` parcial, con lo que falta dicho; `[ ]`
> abierto. Las pruebas que respaldan cada cierre están en
> `docs/LOW_INVENTARIO_CAPACIDADES.md` y en la matriz de regresiones.


### A — Confianza e inventario (primero)

- [x] **A01 · Validar:** crear matriz por capacidad: entrada en UI, modelo, persistencia, Undo, exportación, pruebas y evidencia humana. Marcar cada punto como funcional, parcial o no verificado. Resolver contradicciones de documentos antiguos, incluido el estado histórico del 3D. — **cerrado** (`efee97a`): `docs/LOW_INVENTARIO_CAPACIDADES.md`, armado midiendo el repo. Encontró cinco agujeros y los cinco se cerraron.
- [x] **A02 · Validar:** arranque 2D, Nuevo/Abrir, viaje a IA y vuelta, cambio de documento y vuelta desde 3D con entrada física. Ningún documento debe quedar tapado o perder identidad. — **cerrado** en v4.32.0 (`check_arranque_recorrido_ui`). Encontró que desde el 2D no había puerta al 3D.
- [x] **A03 · Validar:** guardado, Guardar como, recuperación tras cierre forzado y apertura de proyectos anteriores en una copia de prueba. Corregir primero cualquier pérdida de datos. — **cerrado** en v4.32.0. Encontró pérdida de datos: `localStorage` nacía vacío en cada arranque y el rescate ante caída no se ofrecía.
- [x] **A04 · Completar:** integrar/publicar el rediseño 3D y su ajuste oscuro cuando corresponda a la release compartida; comprobar que el ejecutable contiene el bundle correcto. — **cerrado**: publicado en v4.31.0 y cada release compila los cuatro instaladores en CI.
- [ ] **A05 · Validar:** iniciar la Prueba maestra §15 con una persona ajena al desarrollo. Registrar interrupciones y ayuda solicitada; convertir cada bloqueo en una tarea reproducible. Depende de disponibilidad humana, no bloquea el resto del trabajo técnico. — **abierto y NO bloqueado por agenda ajena**: el probador humano de LOW es Mauro. Falta correr la prueba §15 de punta a punta y registrar los bloqueos.

**Salida:** recorrido de arranque a reapertura sin bloqueos conocidos ni pérdida de datos; defectos restantes registrados con reproducción.

### B — Rigging flexible práctico

- [~] **B01 · Completar:** unificar preparar/animar, selección, rest pose y feedback del rig. Hacer evidente qué dibujo y hueso se modifican. — **parcial** (Codex): «Posar articulación» aparece al crear. Falta la revisión artística.
- [~] **B02 · Completar:** afinar corte y articulaciones de tres puntos: vista previa, cancelación, selección clara de las piezas y límites visibles para raster/máscaras. — **parcial** (Codex): guía de corte y cadena provisional, con `check_flexible_limb_ui`. Falta revisión artística y dibujos complejos.
- [x] **B03 · Investigar/completar:** recorrer edición de malla y pesos existente; cerrar huecos en normalizar, suavizar, bloquear pesos y corregir zonas rígidas. No duplicar operaciones ya funcionales. — **cerrado** en v4.32.0 (Codex, `b152127`): malla fuera de `app.js`, bloqueos de pesos por vértice y suavizado vecinal.
- [ ] **B04 · Validar/completar:** FK/IK, pole, límites, cambios de espacio y sustituciones con deformación. Medir saltos al cambiar de modo y corregir los casos reproducibles.
- [ ] **B05 · Completar:** hacer accesible la creación y edición de correctivos existentes para codos/rodillas; comprobar que no se apliquen dos veces.

**Salida:** personaje de prueba con dos brazos y dos piernas; poses extendida, doblada y extrema; Undo/Redo, reapertura y exportación con resultado equivalente. No prometer conservación de volumen hasta medirla.

### C — Controles de actuación (mayor salto de utilidad)

- [x] **C01 · Investigar:** mapear `rig.controls`, `rig.controllers`, acciones y canales; definir un contrato único, migración y referencias estables. — **cerrado** (Codex): `docs/LOW_CONTRATO_CONTROLES_C01.md`.
- [x] **C02 · Completar/crear:** editor visual de controles sobre el personaje: deslizador, punto 2D y selector. Vincularlos a canales y acciones existentes, con rangos y valor neutro. — **cerrado** en v4.32.0: el punto 2D dejó de ser un control de una dimensión; `check_rig_control_ui` en CI.
- [~] **C03 · Crear:** flujo guiado para grabar poses de referencia, previsualizar mezcla y corregir extremos; detectar dependencias circulares y referencias rotas. — **parcial** (Codex, v4.33.0): acciones vinculadas, mezcla reversible, referencias rotas y ciclos. Él mismo no lo declaró cerrado: falta revisión visual y un gesto físico dedicado.
- [~] **C04 · Completar:** giro de cabeza mediante vistas dibujadas frontal/¾/perfil; coordinar sustituciones, orden y correctivos. No presentar un giro 360 automático si faltan vistas. — **parcial** en v4.44.0+: juego de vistas en el modelo (`rigViewSet`: elección discreta por valor de control, orden de slots por vista, `rigViewSetCoverage` que dice qué está dibujado y qué falta) y panel «Giro por vistas» que muestra la cobertura en vez de prometer la vuelta. 28 pruebas (`run_view_sets_tests`) y `check_giro_vistas_ui`, ocho mutaciones verificadas. **Correctivos por vista cerrados** también: cada vista lleva su ajuste por pieza (de tres cuartos el ojo se corre y la oreja se achica) y se suma en el MISMO lugar que las acciones, así que componen; vale entero mientras esa vista manda y desaparece al cambiar, porque el dibujo tampoco se interpola. 36 pruebas y 11 mutaciones verificadas en total. **Falta sólo la revisión artística** con un personaje dibujado de verdad, que es lo único que dice si el giro se lee — y un «grabar corrección» automático, que se dejó afuera a propósito: el gesto natural escribe en la pose propia de la pieza, que vale para todas las vistas, y pasar eso al correctivo sin sacarlo de la pose lo aplicaría dos veces. Esa cuenta se mide con el personaje real, no antes.
- [~] **C05 · Crear:** conjuntos reutilizables de controles para ojos, cejas, boca y manos; vinculación explícita a cada personaje. — **parcial**: catálogo de fábrica (ojos, cejas, boca, manos) como datos puros en `ui/rigging/control-sets.js`; aplicarlo crea los controles y, para cada pieza, el juego de vistas de C04 esperando los dibujos. La vinculación es explícita de verdad: el mapa rol→pieza está a la vista, «Sugerir» propone por nombre pero se corrige, y aplicar queda APAGADO mientras falte vincular alguno — aplicar a medias deja controles colgados de ninguna pieza, que se mueven sin que pase nada. Lo aplicado queda escrito en la escena y, si después se borra una pieza, el vínculo se SEÑALA en vez de limpiarse. 29 pruebas (`run_control_sets_tests`) + `check_conjuntos_ui`, nueve mutaciones verificadas. **Falta:** guardar conjuntos PROPIOS —hoy sólo están los de fábrica— y la prueba con una cara dibujada, que es lo que dice si los recorridos elegidos (0–100, -100..100) son los que se usan al animar.

**Salida:** una persona configura un control de cabeza y otro de expresión, anima ambos, guarda/reabre y exporta sin tener que editar código.

### D — Animación y reutilización

- [ ] **D01 · Validar/completar:** rangos de Timeline/X-sheet, curvas, interpolación, retiming y copiado entre exposiciones en escenas extensas. Mantener un único Scene/LowDoc.
- [ ] **D02 · Investigar/completar:** biblioteca de personajes y poses: miniaturas, importación con referencias reasignadas, actualización sin romper animación y compatibilidad de versiones.
- [ ] **D03 · Validar/completar:** sustituciones de dibujos coordinadas con rig y controles; boca y manos animadas sin perder vínculos.
- [ ] **D04 · Validar:** audio, lip-sync y corrección manual con diálogo real; comprobar sincronía en reproducción y archivo exportado.

**Salida:** reutilizar un personaje en otra escena, ajustar un diálogo y retocar su timing sin reconstruir el rig.

### E — Composición avanzada

- [ ] **E01 · Investigar:** inventariar efectos/máscaras actuales, orden de evaluación y paridad visor/exportación.
- [ ] **E02 · Completar:** resolver primero una cadena clara de máscaras, mezcla, color, desenfoque y sombra; presets editables y reversibles.
- [ ] **E03 · Crear:** modelo de grafo mínimo con entradas tipadas, IDs estables, validación de ciclos, serialización y evaluación determinista. Reutilizar operaciones de E02.
- [ ] **E04 · Crear:** editor de nodos con conectar/desconectar, grupos, bypass y previsualización. Mantener una vía sencilla para quien no necesita nodos.

**Salida:** personaje recortado por máscara y con efectos reutilizables; mismo fotograma en vista previa y exportación tras reapertura. Un esquemático decorativo no cierra E04.

### F — Calidad artística, 3D e intercambio

- [ ] **F01 · Validar/completar:** sesión real de entintado con tableta: presión, latencia, estabilización, zoom, nodos y color. BRUSH-02 ya está registrado como cerrado; abrir defectos nuevos con evidencia.
- [ ] **F02 · Completar:** consistencia de iconos, lenguaje, foco, jerarquía de paneles, escalado DPI y temas en todos los módulos. Mantener herramientas avanzadas accesibles.
- [ ] **F03 · Validar/completar:** estudio 3D con proyecto real: selección, guías, superficies, transformaciones, tableta, archivos y exportación. El rediseño ya existe; falta cobertura artística más amplia.
- [ ] **F04 · Investigar/completar:** contrato de assets entre 3D y Composición: escala, orientación, transparencia, actualización y referencia de origen. Respetar la separación establecida por ADR-004.
- [~] **F05 · Validar/completar:** formatos de exportación e intercambio existentes con aplicaciones destino reales; registrar lo que se pierde y lo que se conserva. — **parcial**: Premiere cerrado en v4.37.0 (XML, recorrido y puente) y la exportación de animación en v4.35.0. Faltan las otras aplicaciones destino.

**Salida:** crear un fondo, incorporarlo a una toma 2D y entregar un archivo utilizable fuera de LOW.

### G — Producción y crecimiento

- [ ] **G01 · Validar/optimizar:** proyecto largo con escenas representativas; medir dibujo, scrub, playback, memoria, guardado y exportación. Los presupuestos básicos ya existen; ampliarlos con datos reales.
- [ ] **G02 · Completar:** extraer módulos de `app.js` al tocar cada dominio, respetando el presupuesto decreciente y conservando comportamiento.
- [ ] **G03 · Validar/completar:** colaboración con dos clientes, desconexión, reconexión, conflicto y recuperación. El transporte ya existe; no planificarlo como ausente.
- [ ] **G04 · Validar/completar:** MOCAP-05 con oclusiones, paneo y dos sujetos; diagnóstico y corrección manual. Requiere material representativo.
- [ ] **G05 · Validar:** uso real en macOS/Linux, firma con certificado disponible, actualización y recuperación del instalador. El smoke de binarios ya está registrado como cerrado.
- [ ] **G06 · Validar:** terminar una pieza corta de principio a fin con un usuario externo y registrar tiempos, fallos y resultado exportado.

**Salida:** evidencia de producción repetible. iPad nativo, física secundaria y automatización IA por lotes quedan como exploraciones posteriores, no bloquean este plan.

## 4. Primera tanda concreta

1. A01–A04: inventario y consolidación de lo entregado.
2. B01, B02 y B05: completar el recorrido de una articulación, con un personaje de prueba reutilizable.
3. C01–C03: entregar el primer control visual de actuación sobre el modelo existente.
4. C04: giro de cabeza con tres vistas y correcciones.
5. D02: guardar y reutilizar ese personaje en otra escena.

En paralelo al trabajo técnico, organizar A05. El resto se desglosa en tickets pequeños al iniciar cada etapa; no expandir todas las áreas a la vez.

## 5. Coordinación y publicación

Codex/Claude acuerdan por `docs/agent-bus.jsonl` dominio, archivos reservados, base y criterio de aceptación antes de editar archivos compartidos. La asignación se confirma según el trabajo activo; este documento no asigna tareas silenciosamente a Claude.

Cada entrega debe dejar problema reproducible, cambio revisable, prueba adecuada al riesgo, comprobación visual cuando corresponda, commit acotado y nota de límites. Los guards de interacción críticos deben fallar ante la regresión que protegen; un click programático no sustituye toda entrada física.

Publicar por incrementos funcionales pequeños, con una única persona/agente preparando versión y artefactos. No llamar publicado a un commit local. No cerrar validación humana con una suite automática.

## Fuentes de estado revisadas

- `LOW_BALANCE_2026-09.md`: encabezado actualizado a v4.30.0, separado del cuerpo histórico.
- `LOW_BIBLIA_PRODUCCION.md`: calidad, arquitectura y prueba maestra.
- `ADR_2D_PRO_RIG_ARCHITECTURE.md`: contrato y etapas del rig.
- `ui/animation/document.js`, `ui/rigging/binding.js`: controles, acciones y vinculación.
- `ui/collaboration/transport.js`: transporte existente.
- `LOW_ESTUDIO_3D_UX.md` y commits `db6f7ed`/`a6643b8`: rediseño integrado y ajuste oscuro.

Este inventario debe actualizarse con evidencia al completar A01. Las tareas marcadas investigar no son afirmaciones de carencia.
