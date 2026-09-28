# Memoria persistente del proyecto LOW

Última actualización: 2026-09-07.

## Reglas de trabajo acordadas

- Los doce principios clásicos de la animación son criterios permanentes de
  producto. LOW hace visibles pose, arco, spacing y timing; automatiza sólo
  transformaciones previsibles, editables y reversibles. Actuación, staging,
  dibujo sólido y atractivo permanecen bajo decisión del artista. Referencia:
  `docs/FILOSOFIA_DE_ANIMACION.md`.
- Los problemas reales de usuarios de software de animación se convierten en
  regresiones, no sólo en ideas de UX. La matriz vigente está en
  `docs/LOW_2D_REGRESSION_MATRIX.md`; sus P0 obligatorios son guardado integral,
  Undo explicable, recuperación, separación documento/workspace e integridad
  Level/Palette/Style.

- Base histórica obligatoria del bloque 2D: `v3.29.37`, commit `9c00773`.
- Trabajar sobre la arquitectura existente. No crear variantes paralelas como
  `timeline-new.js`, `xsheet-new.js`, `animation-v2.js`, `opentoonz-mode.js` o
  `new-scene-model.js`.
- `LowDoc` y su `Scene` son el estado canónico: Level contiene Drawings y las
  Layers/Columns contienen Cells/Exposures. Timeline, XSheet y Level Strip son
  vistas del mismo documento.
- OpenToonz es referencia de comportamiento y profundidad profesional, no una
  fuente de código para copiar literalmente.
- No presentar controles decorativos, previews o paneles desconectados como
  funciones terminadas. Cada función debe modificar estado real, guardar,
  participar de Undo y tener una prueba de aceptación.
- Conservar los cambios concurrentes realizados por Claude. Al preparar el
  siguiente commit, revisar e incluir también su trabajo terminado; no
  sobrescribirlo ni dejar artefactos de compilación a medias. El mensaje y el
  informe del commit deben distinguir los cambios 2D de los de Claude.
- No tocar 3D desde el trabajo 2D salvo dependencia estricta. La instrucción de
  incluir el trabajo de Claude autoriza integrarlo en el commit después de
  validarlo, pero no autoriza modificarlo arbitrariamente.
- Antes de declarar un bloque terminado: pruebas automáticas, prueba manual del
  flujo, commit lógico y reporte `HECHO / CAMBIADO / PROBADO / PROBLEMAS /
  SIGUIENTE`.

## Prioridad activa

El contrato rig v4 ya cubre armado gráfico, FK/IK, pole, apoyos, sustituciones,
Schematic, malla/pesos, Smart Bones y controles. La prioridad abierta deja de
ser “agregar rig” y pasa a validar producción difícil: MOCAP-05 (oclusiones,
paneo y dos sujetos), BRUSH-02 (cada parámetro con diferencia medible), prueba
maestra humana de `docs/LOW_BIBLIA_PRODUCCION.md` §15 y división gradual de
`ui/app.js`. No llamar completa una función sólo porque tenga panel.

Desde v4.16.0 el arranque seguro se invoca con `LOW --safe-mode` o Ayuda →
Reiniciar interfaz en modo seguro. Aísla proyecto anterior, layouts, atajos y
pinceles personalizados sin borrarlos. Edición → Restablecer configuración 2D
limpia por dominio; nunca incluye escenas, recuperación ni archivos del
proyecto. Los cambios coordinados se anuncian antes en `tools/bus.js`.

## Últimos bloques 2D confirmados

- v4.4.0 (5-sep-2026, commit `e7353c6`): diálogos propios en toda la interfaz
  (no queda `confirm/alert/prompt` nativo fuera de `vendor/`), guía del eje en el
  modo espejo, riel de herramientas con las primarias primero —el reordenado las
  mandaba al final con `appendChild` y quedaban fuera de la vista— y en columnas
  cuando no entra, panel separado de Herramientas con iconos y acople al muelle
  previo, y Composición con efectos por plano dentro de la mesa, `Escalonar Z`
  reversible y estados vacío/plano. CI verde; falta el smoke del ejecutable.

- Rangos rectangulares multi-columna, copy/cut/paste y Undo en XSheet.
- Selección múltiple y drag Level Strip → XSheet.
- Papel cebolla visible y conectado al documento.
- Docks y paneles apilados redimensionables con persistencia.
- Herramientas vectoriales Pump/Pinch/Plancha configurables.
- Mesa de dibujo editable en una ventana nativa para segundo monitor.
- Paneles desacoplados con foto inicial validada: Dibujos del nivel conserva previews SVG,
  selección y exposición; la mesa separada no hereda el zoom/paneo CSS de la ventana principal.
- Rig cut-out rígido canónico: piezas y pivotes, jerarquía matricial real, FK,
  IK de dos huesos, raíz fijada, límites, claves globales, Undo/Redo,
  guardado/reapertura, pista en Timeline y panel/mesa separables con controles
  de esqueleto para dos monitores.
- Corrección de armado: `Registrar piezas` ya no inventa el torso por área ni
  cuelga todo de una raíz falsa. Las piezas nacen sin padre; en la mesa el
  círculo mueve el pivote y el cuadrado crea o rompe el vínculo hijo→padre.
  El overlay ocupa el viewer completo y acepta puntero realmente. Esquema rig
  v3 con binding rígido explícito y migración desde escenas anteriores.
- Validación automática actual: 98/98, más prueba E2E de registro sin jerarquía,
  arrastre de pivote, vinculación gráfica y Undo.
- Investigación comparativa de rigging documentada. BBW queda como generador
  opcional de pesos en bind-time; el runtime 2D usa matrices afines y pesos
  dispersos. DQS y mallas volumétricas 3D no son requisitos del núcleo 2D.
- El borrador `docs/RELEASE_v3.29.41.md` incluye explícitamente los commits
  concurrentes de Claude `767f07e`, `bcb8f08` y `b474a19`; las pruebas
  automáticas pasaron y faltan la prueba manual final 3D, subir, etiquetar y
  publicar, en ese orden.
- Fundamento `Scene.rig` v4 implementado sin arquitectura paralela. El JSON
  canónico guarda bones, slots, attachments, bindings, channels y constraints;
  `rig.nodes` queda sólo como adaptador en memoria para la interfaz v3. Undo,
  migración y diagnóstico se prueban en 118/118 casos del modelo. Un esqueleto
  puede existir sin arte y recibir slots/bindings después.
- Armado gráfico v4 operativo: `Crear hueso` permite trazar cabeza→punta sobre
  la mesa, continuar una cadena desde una punta existente, seleccionar huesos
  aún sin arte y editar cabeza/longitud. Cada gesto es una sola operación de
  historial; Undo/Redo fue comprobado en la interfaz. Al abrir otro SVG se debe
  preservar siempre `#dzRigOverlay`: es infraestructura del editor, no arte.
- El informe técnico de rigging queda incorporado como dirección de evolución,
  no como promesa ya implementada: primero mallas 2D trianguladas + LBS y pesos
  dispersos; BBW se evalúa en bind-time dentro de un Worker con benchmark y
  fallback. Master Controllers y rigs 360° se apoyan en channels/actions. DQS
  y winding numbers sólo entran si resuelven un caso 2D medido; no se arrastra
  complejidad volumétrica 3D al núcleo 2D por marketing.
