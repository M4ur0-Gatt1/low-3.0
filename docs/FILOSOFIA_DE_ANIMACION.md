# Filosofía de animación de LOW

LOW existe para ayudar a producir movimiento con intención, peso, ritmo y
carácter. La tecnología —incluida la inteligencia artificial— debe ampliar las
decisiones del artista, no sustituirlas ni esconderlas detrás de automatismos.

Los doce principios de la animación formulados por Frank Thomas y Ollie
Johnston son una referencia transversal del sistema 2D, el rigging, la cámara,
la composición y el espacio 3D. LOW los interpreta como criterios de producto:
cada herramienta debe hacer visible la relación entre pose, trayectoria,
espaciado y tiempo.

## Principios de producto

1. **La intención del artista es el dato principal.** Las poses, dibujos,
   cámaras y decisiones de puesta en escena pertenecen al usuario. Una función
   automática transforma material existente de manera previsible; no inventa
   decisiones silenciosamente.
2. **El movimiento debe poder leerse.** Arcos, spacing, claves, exposiciones,
   holds y curvas tienen representaciones visibles y editables.
3. **El cuerpo conserva masa, salvo decisión expresiva.** Squash and stretch
   puede preservar volumen, pero el animador puede exagerarlo o romperlo.
4. **Posar y temporizar son tareas distintas.** Cambiar una curva o una
   exposición no debe alterar las poses; editar una pose no debe destruir su
   timing.
5. **El flujo admite animación directa y pose a pose.** LOW no obliga a elegir
   una escuela: permite dibujar cuadro a cuadro, bloquear con claves escalonadas
   y luego interpolar o combinar ambos métodos.
6. **La jerarquía no debe moverse como un bloque rígido.** Rigging, desfases y
   canales deben facilitar acciones complementarias, superpuestas y
   secundarias sin perder control individual.
7. **La puesta en escena es parte del documento.** Cámara, profundidad,
   iluminación, composición y foco visual deben poder revisarse junto con la
   actuación, no al final del proceso.
8. **La exageración es controlada y reversible.** Amplificar una actuación
   parte de las poses del artista, conserva Undo y nunca hornea de forma
   destructiva el dibujo fuente.
9. **La forma debe conservar solidez.** Guías, simetría, perspectiva,
   superficies 3D y rigs ayudan a mantener volumen y equilibrio sin imponer
   simetrías mecánicas.
10. **La claridad precede al detalle.** El flujo favorece referencia,
    storyboard, animática, layout, poses doradas, blocking y recién después
    interpolación y pulido.
11. **La interfaz enseña sin estorbar.** Los principios aparecen como feedback
    visual y herramientas concretas —no como terminología obligatoria ni
    paneles llenos de texto— y siempre ofrecen control manual.
12. **El atractivo no se automatiza.** Appeal, actuación, staging y dibujo
    sólido son decisiones artísticas. LOW puede mostrar problemas, ofrecer
    referencias o variantes y reducir trabajo mecánico, pero no afirmar que un
    botón crea carisma o una buena actuación.

## Traducción de los doce principios al software

| Principio clásico | Traducción en LOW |
| --- | --- |
| Estirar y encoger | Escala por eje con preservación opcional de volumen y edición no destructiva. |
| Anticipación | Claves previas, curvas y lectura de spacing; nunca una pose inventada sin confirmación. |
| Puesta en escena | Cámaras, multiplano, profundidad, iluminación, encuadre y preview limpio. |
| Directa / pose a pose | Dibujo cuadro a cuadro, claves, modo En bloques e interpolación combinables. |
| Complementaria y superpuesta | Desfase de cadenas, canales separados, jerarquías y constraints. |
| Slow in / slow out | Curvas editables y carta de tiempos independiente de las poses. |
| Arcos | Trayectoria espacial de extremos y distribución temporal cuadro por cuadro. |
| Acción secundaria | Capas, controles y canales independientes que apoyan la acción principal. |
| Timing | Xsheet, Timeline, FPS, exposiciones, holds y trabajo en unos/doses/treses. |
| Exageración | Amplificación reversible respecto de la pose de reposo. |
| Dibujo sólido | Perspectiva, guías, superficies 3D, volumen, pivotes y poses asimétricas. |
| Atractivo | Referencias y espacio para iterar; la decisión final permanece en el artista. |

## Automatización e inteligencia artificial

Una asistencia es correcta cuando es **visible, acotada, editable, reversible y
atribuible a una orden concreta**. Antes de aplicarse debe poder explicar qué
poses, cuadros o propiedades modificará. Después debe integrarse en el mismo
documento, Timeline/Xsheet e historial que una edición manual.

LOW no evalúa la calidad artística como una verdad objetiva. Puede señalar una
trayectoria quebrada, una pérdida involuntaria de volumen, claves redundantes o
un foco visual confuso; la aceptación y el estilo son siempre decisión del
usuario.

## Flujo recomendado

**Referencia → storyboard/animática → layout y cámara → poses principales →
blocking escalonado → timing y spacing → arcos y acciones superpuestas →
interpolación → limpieza, color, composición y exportación.**

Este orden es una guía, no una restricción. Cada módulo puede funcionar por sí
solo y todo proyecto puede volver a una etapa anterior sin perder el trabajo
fuente.
