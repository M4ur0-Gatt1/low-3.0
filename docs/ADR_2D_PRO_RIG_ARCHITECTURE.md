# ADR: arquitectura profesional de rigging 2D

- Estado: aceptado para implementación incremental
- Fecha: 2026-08-20
- Alcance: módulo 2D; extensión del `Scene.rig` canónico
- Sustituye: ninguna arquitectura; amplía `ADR_2D_CUTOUT_RIG.md`

## Problema

El rig cut-out actual ya registra piezas, pivotes, parentesco, FK e IK de dos
huesos, pero todavía no constituye un sistema profesional completo. Un rig de
producción necesita separar claramente el arte, la estructura en reposo, la
forma de vincular el arte, la resolución cinemática, los controles que ve el
animador y los canales que se guardan. Si esas responsabilidades quedan
mezcladas, un botón puede mover algo en pantalla sin producir una pose
reproducible, editable o exportable.

La investigación comparó los contratos públicos de OpenToonz, Moho Pro,
Toon Boom Harmony, Spine, Rive, Blender, Live2D Cubism, Adobe Character
Animator y Cartoon Animator, además de los trabajos originales sobre Bounded
Biharmonic Weights y Dual-Quaternion Skinning. La coincidencia importante no
es la apariencia de sus paneles: todos separan, con distintos nombres, setup,
binding, constraints y animación.

## Correcciones al informe técnico recibido

El informe aporta tres direcciones válidas: pesos automáticos acotados,
controladores de alto nivel y cálculo pesado fuera del bucle de reproducción.
Para un motor 2D hay que precisar lo siguiente:

1. BBW calcula pesos de influencia; LBS, DQS u otro deformador usa esos pesos
   para producir la pose. No son alternativas del mismo nivel.
2. BBW da una inicialización suave, local y acotada, pero no garantiza por sí
   solo volumen, ausencia de artefactos ni elimina la edición manual. LOW debe
   permitir pintar, suavizar, normalizar, podar y bloquear pesos.
3. El solve BBW/Mixed FEM ocurre al vincular o recalcular la malla. En playback
   sólo se evalúan matrices y pesos dispersos ya precalculados.
4. DQS fue diseñado para mezclar transformaciones rígidas 3D. En animación 2D
   estilizada, la escala no uniforme, shear y squash/stretch son esenciales;
   por eso matrices afines/LBS son el camino principal. DQS sólo podría ser una
   opción futura 2.5D, nunca el requisito del núcleo.
5. Los tetraedros y la segmentación volumétrica no corresponden al dominio
   base 2D. LOW necesita limpieza de contornos planos, huecos,
   auto-intersecciones y triangulación restringida. Los winding numbers pueden
   ayudar a clasificar interior/exterior, pero no reemplazan ese pipeline.
6. Un rig 360 fiable no gira una única malla hasta el dorso. Usa conjuntos de
   vistas/poses, sustituciones de dibujo y controladores que interpolan o
   conmutan entre representaciones diseñadas por el artista.
7. Un Master Controller mapea un control simple a propiedades, poses o
   acciones. No es el deformador ni debe esconder una dependencia circular.

## Decisión

Se mantiene un único estado en `LowDoc.scene.rig` y se migra de forma versionada
al contrato v4. Timeline, XSheet, Viewer, Schematic, Function Editor, ventanas
separadas, reproducción y exportación serán consumidores del mismo evaluador.

```text
Scene.rig v4
 ├── setup          modo, pose de reposo, unidades y orden de evaluación
 ├── skeletons      agrupación y raíces
 ├── bones          jerarquía, rest local, herencia, límites y metadatos
 ├── slots          orden de dibujo y attachment activo, separados del hueso
 ├── attachments    dibujos/sustituciones disponibles para cada slot
 ├── bindings       rigid | weightedMesh | curve | envelope | warp
 ├── meshes         vértices, triángulos, UV, rest y rigidez
 ├── constraints[]  IK, pin, transform, path y otros, en orden estable
 ├── controllers    sliders, puntos 2D, switches y controles gráficos
 ├── actions        poses, correctivos, clips y conjuntos de vistas
 ├── channels       rutas de propiedad con keys e interpolación
 ├── physics        movimiento secundario opcional
 └── diagnostics    referencias rotas, ciclos, pesos y bindings inválidos
```

### Reglas del modelo

- Los IDs son estables. Ninguna relación depende del orden DOM, del nombre de
  una capa ni de la posición de una fila.
- El arte fuente queda en pose de reposo y no se hornea al posar.
- Un hueso no determina el orden de dibujo. `slot` y `attachment` permiten
  manos, bocas, perfiles y sustituciones sin reconstruir la jerarquía.
- Cada binding declara su algoritmo y datos. Rígido, malla pesada, curva y
  envelope pueden convivir en un personaje.
- Las constraints tienen orden, espacio de entrada/salida y `mix` animable. El
  grafo se valida y rechaza ciclos antes de evaluar.
- Los controladores escriben canales o parámetros públicos; nunca mutan el DOM
  directamente. Las dependencias son visibles y depurables.
- Setup y Animate son modos distintos. Editar rest, parenting o binding no crea
  una clave; posar no altera la estructura.
- Cada gesto del usuario es una transacción de Undo. Arrastrar un target genera
  una operación, no cientos.
- Todo panel separado recibe snapshot inicial, comandos validados y el mismo
  resultado del evaluador que la ventana principal.

## Evaluación determinista

```text
arte en reposo
 → attachment/sustitución activa
 → transformaciones locales de huesos
 → propagación FK mundial
 → constraints ordenadas (IK, pin, transform, path...)
 → matrices de deformadores
 → skin/curva/envelope/warp
 → correctivos de forma según etapa declarada
 → orden de slots y composición
 → Viewer / playback / export
```

Los drivers de un controlador se resuelven antes de la etapa que modifican. Un
correctivo puede declarar `preDeform` o `postDeform`; la etapa no se infiere.
El evaluador usa un grafo de dependencias, orden topológico estable y marcas de
suciedad para recalcular sólo subárboles afectados.

## Flujo de trabajo que debe recibir el animador

1. **Preparar arte:** asignar piezas o dibujos alternativos a slots.
2. **Armar:** crear huesos gráficamente, ubicar pivotes y parentesco, definir
   profundidad y pose de reposo.
3. **Vincular:** elegir rigid, envelope o malla; calcular pesos iniciales y
   corregirlos visualmente.
4. **Controlar:** añadir IK, targets, pins, límites, espacios y controles de
   actuación; alternar IK/FK sin salto.
5. **Animar:** insertar claves por propiedad, usar sustituciones, editar curvas
   y copiar poses/acciones.
6. **Validar:** mostrar ciclos, vértices sin peso, referencias rotas, límites y
   diferencias entre Viewer y export antes de publicar.

## Rigs 360 y actuación reutilizable

LOW adoptará una combinación de ideas probadas:

- conjuntos de vistas/estructuras alternativas, equivalentes conceptualmente
  a Vitruvian Bones o sustituciones de dibujo;
- parámetros 1D/2D y controladores gráficos que mezclan canales y correctivos;
- acciones reutilizables para giro de cabeza, manos, bocas y poses;
- cambios discretos cuando no exista una interpolación visualmente válida;
- validación de continuidad para evitar saltos en los límites de una vista.

Esto permite rigs front/3⁄4/profile/back creados por artistas y evita prometer
una rotación geométrica falsa de 360 grados.

## Deformación y pesos

La primera implementación flexible será planar:

- contorno limpio y triangulación restringida con soporte de huecos;
- pesos dispersos, normalizados y con un máximo configurable de influencias;
- generación inicial manual, por envelope o BBW en un Worker;
- edición visual de peso, smooth, prune, normalize, weld y lock;
- rigidez por región y previsualización de calidad progresiva;
- matrices afines para escala no uniforme, shear y squash/stretch.

BBW queda como mejora opcional del binding y no bloquea el primer editor de
malla. La malla y sus pesos se calculan al editar; playback usa buffers tipados
y cachés de matrices.

## Plan incremental

### P1 — Fundamento v4

- migración v3→v4 sin perder rigs existentes;
- bones separados de piezas de arte;
- slots/attachments y sustituciones;
- channels por ruta de propiedad;
- constraints ordenadas, espacios, `mix`, ciclos y diagnósticos;
- evaluador único y pruebas de paridad Viewer/playback/export.

### P2 — Cut-out profesional

- herramienta gráfica de huesos y parenting;
- FK/IK con match sin salto, pole, pin temporal y pin animado;
- límites, stretch/squash, herencia y orden de dibujo;
- copy/paste de pose y rig, hooks por Drawing y sustituciones;
- Schematic y curvas básicas conectados al estado canónico.

### P3 — Deformación flexible

- editor de malla planar, envelope/curva y pesos visuales;
- auto-weight, smooth/prune/normalize/lock y BBW opcional;
- correctivos y mezcla rígido/deformable por parte.

### P4 — Controles y 360

- sliders, controles 2D, switches y widgets sobre la mesa;
- acciones y correctivos tipo driver;
- vistas alternativas y control 360 por poses diseñadas;
- biblioteca de controles sin dependencias ocultas.

### P5 — Rendimiento y movimiento secundario

- dirty graph, Workers, buffers tipados y perfiles de calidad;
- física secundaria y bake editable;
- presupuestos medibles de rig y diagnóstico de cuellos de botella.

## Criterio de aceptación del primer rig profesional

Importar torso/brazo/antebrazo/mano y perfiles alternativos → crear slots y
huesos → vincular rígido y por malla → pintar/corregir pesos → crear IK con pole
y match FK/IK → añadir un control de giro de cabeza con tres vistas → animar
frames 1/13/25 → editar easing → cambiar una sustitución → Undo/Redo → guardar,
cerrar y reabrir → reproducir y exportar con la misma pose. Ningún control se
considera terminado si sólo modifica la representación visual.

## Fuentes primarias y oficiales consultadas

- [OpenToonz: Creating Cutout Animation](https://opentoonz.readthedocs.io/en/latest/creating_cutout_animation.html)
- [OpenToonz: Plastic Tool](https://opentoonz.readthedocs.io/en/latest/create_animations_using_plastic_tool.html)
- [Moho Pro 14: rigging, Smart Bones y Vitruvian Bones](https://moho.lostmarble.com/products/moho-pro-14)
- [Moho: Bone Binding](https://www.lostmarble.com/moho/manual/tut03/01/index.html)
- [Toon Boom Harmony: Deformations](https://docs.toonboom.com/help/harmony-24/premium/deformation/about-deformation.html)
- [Toon Boom Harmony: Master Controller rig structure](https://docs.toonboom.com/help/harmony-24/premium/master-controller/about-rig-structure.html)
- [Spine: Basic Concepts](https://esotericsoftware.com/spine-basic-concepts)
- [Spine: Weights](https://us.esotericsoftware.com/spine-weights)
- [Rive: Bones](https://rive.app/docs/editor/manipulating-shapes/bones)
- [Rive: IK Constraint](https://rive.app/docs/editor/constraints/ik-constraint)
- [Blender: Armature Modifier](https://docs.blender.org/manual/en/latest/modeling/modifiers/deform/armature.html)
- [Live2D Cubism: Deformers](https://docs.live2d.com/en/cubism-editor-manual/deformer/)
- [Adobe Character Animator: Handles and attachments](https://helpx.adobe.com/in/adobe-character-animator/using/attachment-and-handles.html)
- [Bounded Biharmonic Weights, Jacobson et al.](https://homes.cs.washington.edu/~jovan/papers/jacobson-2011-bbw.pdf)
- [Dual Quaternion Skinning, Kavan et al.](https://users.cs.utah.edu/~ladislav/dq/index.html)
- [Skinning: Real-time Shape Deformation, SIGGRAPH course](https://skinning.org/direct-methods.pdf)
