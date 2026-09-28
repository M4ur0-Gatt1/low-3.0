# ADR-002: controles profesionales sobre el rig canónico

**Estado:** Aceptado  
**Fecha:** 2026-08-28  
**Autor:** Mauro Gatti / Tropa Circa

## Contexto

LOW ya dispone de huesos, jerarquías, IK, bindings, canales, sustituciones y
deformadores, pero la experiencia todavía se percibía como un alambre técnico.
Un flujo profesional necesita separar claramente el esqueleto interno de los
controles que manipula el animador.

## Decisión

El modelo canónico mantiene una sola estructura de nodos, agregando `role` y
`control` como metadatos persistentes. Un control usa los mismos canales,
límites, claves y matrices que un hueso; la vista decide cómo representarlo.
Así se evitan dos motores de animación incompatibles.

La superposición usa controles turquesa nombrados y atenúa los huesos internos
en modo Animar. Las plantillas se insertan mediante la misma operación que el
alambre manual y conservan Undo, serialización y diagnóstico.

## Consecuencias

- Los rigs faciales y corporales pueden compartir Timeline, X-sheet e IK.
- Los controles sobreviven al guardado y pueden recibir arte por `Repartir`.
- Un PNG sigue siendo una sola pieza; para articulación independiente se usa
  SVG por piezas o, en una etapa posterior, una malla ponderada.
- Próximos componentes: pesos de vértices, Smart Bones/acciones conducidas,
  controles 2D con límites y herramientas de autoría de mallas.
