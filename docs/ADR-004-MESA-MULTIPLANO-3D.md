# ADR-004: mesa multiplano 3D en Composición

**Estado:** Implementación inicial validada · **Fecha:** 2026-09-04 · **Decisor:** Mauro Gatti / Tropa Circa

## Resultado

**Composición** abre un escenario de cámara sobre el documento 2D canónico. Cada Level/capa es una tarjeta transformable en X, Y y Z. Las vistas 2D y multiplano no duplican ni convierten arte: proyectan el mismo contenido y conservan frame, selección e historial.

El módulo 3D estilo Feather queda deliberadamente independiente: sirve para dibujar/modelar fondos y escenarios. No se incrusta, reactiva ni reutiliza como compositor 2D. Sus resultados entran a Composición como assets de fondo importados, mediante el contrato de archivos, y desde ese momento se comportan como un plano 2D.

## 1. Layout y widgets

```text
┌ Composición ──────────────────────────────────────────────────────────┐
│ [2D] [Escenario 3D]  Cámara ▾  ⊞ Grid  ◉ Snap  [Salida de cámara]    │
├──────────────┬──────────────────────────────────────┬─────────────────┤
│ Planos       │                                      │ Transformar     │
│ ▸ Primer p.  │       ESCENARIO / VIEWPORT 3D        │ X  0   Y  0     │
│ ▸ Acción     │     grid tenue, gizmo X · Y · Z      │ Z -120          │
│ ▸ Fondo      │     marco sólo en plano activo       │ Rotación XYZ    │
│ + Plano      │                                      │ Escala 100%     │
├──────────────┴──────────────────────────────────────┴─────────────────┤
│ Timeline · cámara · profundidad       001 ─────────────── 120        │
└──────────────────────────────────────────────────────────────────────┘
```

- **Barra:** selector 2D/3D; cámara activa; Salida de cámara; grid `oculto/10%/30%/completo`; popover Snap para espacio, Z, ángulo y escala.
- **Planos:** grupos Primer plano, Acción y Fondo; miniatura, visibilidad, lock y avatar del editor remoto.
- **Viewport:** centro dominante. Sólo el plano activo muestra marco, nombre y gizmo. Ejes discretos: X rojo, Y verde, Z cyan.
- **Inspector:** posición XYZ, rotación XYZ, escala, opacidad, foco/apertura, `Restablecer` y `Clave`. Números tabulares y edición con teclado.
- **Timeline:** pista de cámara y claves de transformación/profundidad; no crea una segunda estructura temporal.

Estados: hover tenue; selección con acento; lock con avatar y gizmo deshabilitado; arrastre con lectura numérica; confirmación como una entrada de Undo; conflicto como versión recuperable.

Teclado: `G` mover, `R` rotar, `S` escalar, `G Z` restringe a profundidad, `Ctrl` desactiva snap durante el gesto, numpad `1/3/7` vistas ortogonales, `5` perspectiva, `0` salida de cámara y Escape cancela/restaura.

## 2. Lógica y arquitectura

### Estado canónico

```json
{
  "composition": {
    "planes": {
      "level-A": {
        "source": { "levelId": "A" },
        "transform": { "x": 0, "y": 0, "z": 300, "rotationX": 0, "rotationY": 0, "rotationZ": 0, "scaleX": 1, "scaleY": 1 },
        "keys": { "1": { "z": 300 }, "48": { "z": 260 } }
      }
    },
    "camera": { "x": 0, "y": 0, "z": -1000, "focalLength": 50, "focusDistance": 1000, "aperture": 0 }
  }
}
```

`source` referencia arte existente. Los atributos legacy `data-z`, `data-off3d` y `data-rot3d` se leen con un adaptador y se migran al guardar; no son otra fuente de verdad.

### Proyección

```text
distancia = max(1, planoZ - cámaraZ)
escala = distanciaReferencia / distancia
pantallaX = (planoX - cámaraX) × escala
pantallaY = (planoY - cámaraY) × escala
```

Así, un travelling mueve visualmente más el primer plano que el fondo. [multiplane-model.js](../ui/composition/multiplane-model.js) implementa normalización, snapping, lente/FOV, proyección, delta de parallax, foco y contrato colaborativo sin DOM.

```text
Scene / LowDoc
  └─ CompositionModel (planos, cámara, claves)
       ├─ CompositionController (comandos, Undo, auto-key, locks)
       ├─ MultiplaneProjector (matemática pura)
       ├─ CSS3DRenderer / futuro WebGLRenderer
       └─ CompositionView (outliner, viewport, inspector, timeline)
```

La primera fase incorpora un viewport espacial propio (`#dzComposition3D` / `MultiplaneView`) y deja el antiguo diorama `dzZPanel` como compatibilidad, no como interfaz principal. Incluye outliner, inspector, vistas Perspectiva/Frente/Arriba, órbita, paneo, zoom, grid, auto-key y gizmos directos XY/Z. No usa `dz3dToggle`, dibujo en el aire, superficies ni controles del módulo Feather. Sólo renderiza cuando cambian cámara, frame, transform o viewport. El preview del gesto es local; `pointerup` confirma una transacción. WebGL sólo sustituye al renderer si benchmarks reales lo exigen, sin cambiar documento/controlador.

Objetivo: respuesta <16 ms, 60 FPS, nunca menos de 30 FPS sostenidos en escena patrón. El desenfoque se aproxima durante el gesto y se evalúa completo al soltar/reproducir. La órbita editorial y el grid son preferencias locales; no modifican la cámara de producción.

## 3. Colaboración remota

Durante el gesto se emite presencia efímera a 10–20 Hz:

```json
{ "actorId": "ana", "frame": 24, "planeId": "level-A", "tool": "move-z", "preview": { "z": 180 } }
```

Al soltar se envía una única operación canónica:

```json
{
  "type": "composition.plane.transform",
  "target": "plane:level-A",
  "payload": { "before": { "z": 200 }, "after": { "z": 180 } },
  "groupId": "transform:level-A"
}
```

- Lock blando por plano o cámara durante el gesto, TTL 30 s renovable.
- Los demás ven un preview tintado con avatar, sin incorporarlo aún al historial.
- Al confirmar, la operación entra al registro Lamport y Undo como intención completa.
- Planos distintos se fusionan; cambios concurrentes sobre el mismo plano y revisión crean versiones.
- Offline se conserva la cola y, si hay conflicto al reconectar, se comparan versiones sin descartar trabajo.
- Órbita, grid, paneles y selección local no generan tráfico.

## 4. Flujo del animador

1. Abre **Composición**; LOW muestra el escenario y conserva el frame actual.
2. Usa Levels existentes o **+ Plano** y los ordena como Primer plano, Acción o Fondo.
3. Selecciona el fondo, arrastra Z hacia atrás y escribe `400` para precisión.
4. Coloca medios en `120` y acción en `0`; activa snap Z cada 10 unidades.
5. Ajusta X/Y, rotación y escala mediante gizmo o inspector; Escape cancela.
6. En **Salida de cámara**, encuadra y crea dos claves de cámara. Reproduce para evaluar parallax.
7. Activa Auto-key sólo si desea animar profundidad y mueve Z en otro frame.
8. Ajusta distancia focal, foco y apertura; la vista final aparece al soltar.
9. Un colaborador ve el preview remoto, pero no puede pisar el plano bloqueado.
10. Cambia a 2D para retocar y vuelve a 3D sin importar ni reconstruir nada.

## Decisiones, fases y aceptación

| Alternativa | Decisión |
|---|---|
| Duplicar arte en escena 3D | Rechazada: rompe sincronía y guardado. |
| Reutilizar el estudio 3D Feather | Rechazada: es independiente y produce fondos, no compone el documento 2D. |
| Extender el diorama multiplano 2D | Rechazada como UX principal: queda sólo como compatibilidad. |
| Viewport espacial dedicado en Composición | Elegido: interacción tipo Blender sin mezclar Feather ni duplicar el documento. |
| WebGL inmediato | Pospuesto hasta medir el límite. |

Fases: (1) viewport dedicado y matemática; (2) transforms en Scene canónico; (3) inspector/outliner/gizmos/auto-key; (4) pistas de claves, presencia y locks de servidor; (5) DOF acelerado/WebGL si el perfil lo pide.

Aceptación: 2D/3D conserva arte/frame/selección; un gesto Z equivale a una transacción; guardar/reabrir conserva transforms/cámara/claves; preview y export coinciden; grid/overlays se atenúan; dos usuarios ven preview y confirmación sin pérdida silenciosa.
