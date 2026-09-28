# ADR: rig cut-out dentro del documento 2D canónico

- Estado: aceptado
- Fecha: 2026-08-20
- Alcance: módulo 2D exclusivamente

## Contexto

LOW tenía transformaciones de piezas aplicadas directamente al DOM, separadas
del documento que gobierna niveles, dibujos, exposiciones, Timeline y XSheet.
Eso permitía una demostración visual, pero no un flujo confiable de producción:
la jerarquía no propagaba correctamente, una pose podía hornearse por accidente
en el dibujo y las operaciones complejas no eran atómicas en Undo.

## Decisión

El rig vive en `LowDoc.scene.rig`, no en una escena ni archivo paralelo. Su
contrato versión 3 contiene:

- nodos de pieza con ID estable, padre, pivote, pose neutra, límites y claves;
- un vínculo explícito `rigid` entre cada nodo y su elemento de dibujo;
- constraints IK de dos huesos con objetivo animable y dirección de flexión;
- evaluación por matrices afines, desde pose local hasta pose mundial;
- métodos de `LowDoc` para todas las mutaciones, con una transacción de Undo por
  intención del usuario;
- Timeline, mesa, panel separado, reproducción, exportación y guardado como
consumidores del mismo estado.

El armado nunca infiere anatomía a partir del tamaño o la posición del arte.
`Registrar piezas` crea piezas sin padre; el usuario define la raíz, mueve los
pivotes y crea los vínculos hijo→padre directamente en la mesa. Esto corresponde
al cut-out rígido por secciones/pegs. No se presenta como deformación flexible:
una malla con pesos, regiones de influencia o curvas es otro tipo de binding y
debe implementarse explícitamente sobre este mismo documento.

El contenido del `Drawing` permanece en pose neutra. La evaluación del rig se
aplica sólo para visualizar o exportar y se elimina antes de serializar el SVG
del dibujo. Una pieza hija no necesita anidarse físicamente en el SVG: su matriz
mundial se obtiene del grafo canónico.

## Alternativas consideradas

1. Mantener transformaciones DOM independientes: descartado porque no expresa
   una jerarquía ni soporta Undo/persistencia coherentes.
2. Reestructurar cada dibujo como grupos SVG anidados: descartado porque mezcla
   estructura de animación con contenido gráfico y rompe dibujos existentes.
3. Crear otro modelo de escena para rigging: descartado porque duplicaría el
   estado que ya leen Timeline y XSheet.

## Consecuencias

- FK, IK, reproducción, exportación y reapertura evalúan la misma pose.
- El panel de rig y la mesa pueden separarse a otro monitor sin duplicar el
  modelo; intercambian snapshots y comandos validados.
- Los rigs antiguos se migran al contrato canónico.
- El modo Armado modifica pivotes y vínculos persistentes; FK/IK modifican
  canales de pose. Construcción y animación no se confunden.
- La deformación flexible tipo malla/curva, el Function Editor y Schematic se
  agregan después sobre este grafo; no requieren reemplazarlo.

## Pruebas de aceptación

Registrar torso/brazo/antebrazo/mano, ubicar pivotes, vincular la cadena, fijar
la raíz, posar en FK, crear IK, arrastrar el objetivo en dos frames, reproducir,
deshacer/rehacer, guardar, cerrar, reabrir y exportar. La jerarquía y objetivos
deben conservarse y el SVG base no debe contener la pose evaluada.
