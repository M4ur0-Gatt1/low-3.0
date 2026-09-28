# Auditoría y reorganización de la interfaz 2D

**Estado:** Fase 1 completada; Fase 2 diseñada, no terminada  
**Principio:** más lienzo, menos ruido, mismas herramientas.

## Resumen ejecutivo

LOW ya contiene partes importantes de un sistema profesional —Rooms descritas
como datos, paneles flotantes, acoples izquierda/derecha/abajo, splitters,
ventanas nativas y modo dibujo— pero están repartidas entre tres mecanismos de
layout y cubren sólo una parte de la interfaz. El resultado visible sigue siendo
rígido aunque internamente exista una base reutilizable.

**Componentes revisados:** 24 familias  
**Problemas estructurales:** 14  
**Madurez actual del sistema de interfaz:** 58/100

## Inventario actual

| Zona | Función | Estado actual |
|---|---|---|
| Menubar | Comandos completos y Rooms | Correcta, pero repite acciones de barras. |
| `art-bar` | documento, vista, guías, preferencias, guardado | Demasiadas acciones permanentes; 48 px adicionales. |
| Tool Options | opciones de herramienta activa | Ya es contextual y tiene una sola instancia lógica. |
| Toolbar izquierda | creación, selección, vector, IA, cámara, rig | 30+ acciones; algunos grupos ya usan desplegable, otros siguen expuestos. |
| Viewer | SVG, guías, cámara, overlays, cursores | Fuente visual central, pero comprimida por franjas y docks rígidos. |
| Inspector derecho | estilo, paleta, capas, composición, propiedades | Mezcla cuatro responsabilidades y no participa plenamente del docking. |
| Playback bar | transporte, FPS, rango, modos y herramientas | Transporte y comandos de edición/IA están mezclados. |
| Timeline horizontal | exposiciones, rig, cámara y audio | Misma `LowDoc`; ahora tiene zoom/densidad/foco/pliegue. |
| X-Sheet | exposiciones verticales | Misma `LowDoc`; acoplable/separable. |
| Level Strip | material del nivel | Acoplable/separable y con cierre. |
| Onion Skin | referencias temporales | Acoplable/separable. |
| Rig | construcción y pose | Acoplable/separable; panel grande y especializado. |
| Motion Capture | video, silueta y pose | Independiente del rig en datos, pero vive en el mismo sistema lateral. |
| Cámara | encuadre y claves | Mayormente overlay/tool options; catálogo incompleto. |
| Audio | una pista en Timeline | No tiene panel de propiedades propio. |
| Código SVG | edición avanzada | Ocultable, pero fuera del docking general. |
| Status bar | herramienta, coordenadas, zoom, frame, ayuda | Correcta si se mantiene informativa. |
| Prompt IA | comandos y secuencias | Ya es colapsable. |
| Zen/Tab | dibujo sin distracción | Existe y restaura mediante una clase visual. |

## Capacidades existentes que se deben conservar

- Los workspaces son datos en `workspace/workspaces.js` y cambiar de Room no
  reconstruye `LowDoc`.
- Hay presets, guardar, duplicar, restablecer y bloquear disposición.
- Hay acoples laterales e inferior, panel flotante, redimensionado y zonas de
  drop visuales.
- Timeline, X-Sheet, Level Strip, Onion, Rig y Mocap reutilizan sus nodos DOM;
  no se crean copias de estado al moverlos.
- Existe separación en ventana nativa para varios paneles y Viewer.
- El modo Zen ya ofrece una base para Distraction Free.

## Problemas concretos

1. Hay tres persistencias superpuestas: `PanelManager`, `low.2d.panelLayout` y
   `Workspaces`. Pueden recordar posiciones distintas para el mismo panel.
2. El docking real sólo conecta X-Sheet, Level Strip, Onion, Rig y Mocap.
   Tools, Inspector, Palette, Properties, Timeline y Camera no tienen el mismo
   contrato de panel.
3. No existe `DockGroup` ni tabs; soltar al centro no agrupa, sólo deja flotar.
4. No hay zona superior, aunque el pedido y otros DCC profesionales la usan.
5. Los títulos insertan botones textuales “Acoplar” y “Otra pantalla”; ocupan
   espacio y deberían vivir en un menú de panel uniforme.
6. El catálogo no incluye Tool Options, Style Editor, Properties, Audio,
   referencias/video ni status; Window no puede cerrar/reabrir todo.
7. Palette es a la vez subnodo del Inspector y “panel” del catálogo. Moverla
   independientemente exigiría primero convertirla en componente/panel real.
8. El Room Animation llama toggles con efectos secundarios para mostrar la
   Timeline. Un layout debería cambiar visibilidad, no inicializar otra vez el
   dominio.
9. La barra superior mezcla navegación de documento, view controls, modos y
   salida; hay funciones duplicadas en menús y toolbar.
10. Playback mezcla transporte con onion, cambio Timeline/X-Sheet, rig,
    tweening, grabación, IA, caminata y exportación.
11. `app.css` redefine varias veces Tools, Inspector, Timeline y Tool Options.
    La cascada final decide tamaños más que un sistema de tokens documentado.
12. Hay anchos duros (44, 252, 258 px) y límites en JS (190–520 px), lo que
    reduce adaptabilidad a 1366×768 y DPI alto.
13. El sistema actual no elimina grupos vacíos porque todavía no hay grupos.
14. Mover o cambiar preferencias de Timeline provoca render completo de todas
    las celdas; escenas largas necesitan virtualización.

## Decisión de sistema de diseño

```text
WorkspaceLayout (estado de interfaz, nunca Scene)
├─ DockArea: top | left | center | right | bottom
│  └─ DockGroup
│     ├─ activePanelId
│     ├─ tabs[]
│     ├─ size / collapsed / autoHide
│     └─ PanelRef[]             una instancia DOM por panel
└─ floatingWindows[]
```

Reglas:

- Un panel tiene un id y una única instancia lógica/DOM.
- Un Room sólo describe dónde se muestra esa instancia.
- Un grupo sin panel desaparece; un grupo con uno no dibuja tabs redundantes.
- Scene, frame, selección, Viewer, playback e historial sobreviven al cambio.
- El layout se persiste por workspace en una sola versión migrable.
- El acento sólo indica selección, herramienta/frame activos o alerta.
- Densidad usa variantes `compact`, `normal`, `comfortable`; no reglas sueltas.

## Arquitectura de panel propuesta

Cada registro de panel necesita:

| Propiedad | Uso |
|---|---|
| `id`, `label`, `element` | identidad y única instancia |
| `allowedDocks` | top/left/right/bottom/float/tab |
| `minSize`, `preferredSize` | límites responsivos |
| `closable`, `externalizable` | capacidades del encabezado |
| `context` | Rooms o modos donde se sugiere, no donde se obliga |
| `onShow`, `onHide` | sólo ciclo de vista; nunca reemplaza Scene |

El encabezado común será compacto: título, estado, menú `⋮`, cerrar. El menú
contendrá acoplar, flotar, otra pantalla, maximizar y auto-ocultar.

## Presets objetivo

- **Dibujo:** Viewer dominante, Tools, Tool Options, Palette/Style, Level Strip;
  Timeline plegada.
- **Animación:** Viewer + Level Strip/Palette; Timeline/X-Sheet dominante abajo.
- **X-Sheet:** X-Sheet dominante, Viewer auxiliar y Properties.
- **Timeline:** Timeline audiovisual dominante, Viewer, Audio/Properties.
- **Limpieza:** Viewer, herramientas de cleanup, referencia, Palette y Level Strip.
- **Tinta y color:** Viewer, Palette/Style, Fill/Tool Options y Level Strip.

Son presets de la misma aplicación, no módulos duplicados.

## Plan de implementación sin regresiones

1. Unificar persistencia y ampliar `PANEL_CATALOG` sin mover todavía paneles.
2. Crear `DockGroup`/tabs y zona center/top; migrar paneles actuales uno a uno.
3. Convertir Inspector en Properties + grupos Palette/Style/Layers sin duplicar
   sus modelos.
4. Separar transporte de comandos avanzados; estos pasan a menús/contexto.
5. Añadir Window > Panels, cerrar/reabrir, maximizar bajo cursor y colapsar
   bottom/right/left.
6. Actualizar presets y command search; agregar auto-hide después de que tabs y
   restauración sean fiables.
7. Consolidar tokens/estados CSS y probar densidad/DPI/resoluciones.

## Matriz de verificación

| Cambio | No puede alterar |
|---|---|
| Room | `LowDoc`, frame, selección, Viewer zoom, History, Playback |
| Dock/float/tab | instancia y estado interno del panel |
| Close/reopen | datos del panel o de la escena |
| Densidad | geometría del documento |
| Maximize/Zen | layout guardado previo |
| Timeline/X-Sheet | referencias de exposición compartidas |

Pruebas mínimas: 1366×768, 1920×1080, 2560×1440 y 4K; escalado 100%,
125%, 150% y 200%; mouse y pointer/tableta; guardar/reabrir; undo/redo; cambio
de Room durante reproducción; panel externo en segundo monitor.

## Referencias verificadas

- [OpenToonz: Rooms, panes, floating, docking y maximizado](https://opentoonz.readthedocs.io/en/latest/interface_overview.html)
- [Blender: workspaces como layouts de Areas/Editors](https://docs.blender.org/manual/en/latest/interface/window_system/workspaces.html)
- [After Effects: docking zones y grouping zones](https://helpx.adobe.com/content/dam/help/en/pdf/after_effects_reference.pdf)
- [Harmony: Layer Properties acoplable o flotante](https://docs.toonboom.com/help/harmony-24/advanced/reference/view/layer-properties-view.html)

