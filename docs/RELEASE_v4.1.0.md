# LOW v4.1.0 — Rig cut-out profesional, mesa multiplano y timeline compactable

Esta versión cierra el bloque de **cut-out profesional** del rig 2D, estrena la
**mesa multiplano** como espacio de composición propio y hace la timeline
utilizable en escenas largas. También corrige un defecto de distribución que
hacía que, al actualizar, LOW siguiera usando la hoja de estilos de la versión
anterior.

## Rigging 2D — la cadena deja de mentir

- **Pole animable.** Hacia dónde apunta el codo o la rodilla ya no es un
  interruptor de dos posiciones: es un punto que se arrastra en la mesa, se
  clava por cuadro y se interpola. Si el pole cae justo sobre la recta que va de
  la raíz al objetivo, la articulación **conserva la flexión anterior** en vez de
  oscilar.
- **Pole sugerido.** Una cadena sin pole ofrece uno punteado, del lado por el que
  ya dobla. Aceptarlo no mueve nada.
- **Emparejar IK.** Lleva el objetivo —y el lado de flexión— adonde la cadena ya
  está en FK. Pasar a IK deja de hacer saltar el dibujo.
- **Pasar a FK.** El camino inverso: hornea la pose del cuadro como claves reales
  y apaga la cadena. Funciona también sobre un cuadro interpolado.
- **Apoyo clavado (pins).** Una cadena puede clavar su extremo: mover la cadera
  deja de arrastrar el pie. Es un estado sostenido, no un valor interpolado —un
  pie está apoyado o no lo está—, clavar no mueve nada y soltar también deja su
  cuadro. La corrección entra en la **misma entrada de Undo** que el gesto que la
  provocó.

## Composición — mesa multiplano

- Viewport propio con outliner, vistas Perspectiva/Frente/Arriba, grid y
  órbita/pan/zoom.
- Inspector XYZ y escala, gizmos XY/Z y Auto-key persistente.
- `Scene.composition` guarda planos, transformaciones base, claves y cámara; la
  profundidad deja de vivir duplicada en `data-z`, que queda sólo como adaptador
  para render y export heredados.
- Parallax, lente/FOV y aproximación de profundidad de campo.

## Timeline

- **Compactación horizontal.** La columna de pistas se reduce de 128 a 34 px: se
  conservan pliegue, visibilidad y bloqueo, y el nombre pasa al tooltip. Devuelve
  unos 94 px por fila para tiempo sin tocar la escala. «Encajar» y el zoom ahora
  miden el encabezado real en vez de asumir un ancho fijo.
- Escala de tiempo con Ctrl+rueda y encajado por escena, selección o tramo de
  reproducción.
- Altura de pistas en tres densidades y pistas plegables una por una.
- Ocultar pistas sin exposiciones y aislar la capa seleccionada, sin que la capa
  activa pueda desaparecer.
- Todo esto es estado de vista: persiste entre sesiones, no ensucia el documento
  y no entra en Undo.

## Interfaz

- El menú **Ventana** lista los paneles y permite recuperar uno cerrado. La lista
  se dibuja al abrir el menú, así que la tilde refleja el estado real aunque el
  panel se haya encendido desde su propio botón o desde un workspace.
- Cerrar «Línea de tiempo» ahora retira sus dos superficies —transporte y grilla
  de capas— en vez de dejar la grilla ocupando la mesa.
- Pinceles con dinámica de presión, inclinación, velocidad, spacing y scatter.
- Foco visible, estados y objetivos táctiles revisados.

## Corregido

- **Al actualizar, LOW seguía con el CSS de la versión anterior.** El sellado de
  versión sólo alcanzaba a los scripts: la hoja de estilos conservaba una marca
  fija de desarrollo. Ahora se sella junto con el resto.
- El análisis de las pruebas de interfaz podía certificar código viejo servido
  desde la caché del navegador, y un diálogo del sistema podía dejarlas colgadas
  en vez de fallar.

## Verificación

```text
Modelo 2D                      312/312
Mesa multiplano                  14/14
Colaboración y dibujo              8/8
Contratos de interacción 2D          OK
E2E en Chromium real                5/5
  coloreo · rig · rig IK · workspace · multiplano
```

Las pruebas nuevas se comprobaron **discriminantes**: rompiendo a propósito la
corrección de lado del emparejado, el pole del solver, la aplicación de apoyos y
el ancho variable de la columna de pistas, falla exactamente la prueba que
corresponde y ninguna otra.

## Pendiente declarado

- Sustituciones de dibujo visibles en la Timeline y Schematic básico.
- Atajos modales tipo Blender en la mesa multiplano.
- Presencia visual y transporte de colaboración en vivo.
- Retirar `data-z` como estado persistente duplicado.
