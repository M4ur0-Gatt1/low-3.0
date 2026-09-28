# LOW v3.29.64 — Interfaz moderna y trabajo más seguro

Esta versión reúne el rediseño del módulo 2D, la mejora del estudio 3D y una
primera capa de regresiones nacidas de problemas reales de producción.

## Módulo 2D

- Interfaz más compacta, minimalista y consistente, con menos texto permanente,
  iconos sutiles y tooltips descriptivos.
- Menús de clic derecho en lienzo, capas, Timeline y Xsheet.
- Acciones contextuales para dibujos, exposiciones, frames vacíos, timing,
  agrupación, orden y bloqueo.
- Xsheet y Timeline continúan llamando al mismo sistema de comandos.
- Las capas bloqueadas ya no ejecutan accidentalmente acciones sobre otra capa.
- Herramientas del rig reorganizadas en Elegir, Posar, Alambre, Dibujar, Cortes
  y Pivotes.
- El armado automático conserva vínculos existentes y reparte piezas y huesos
  sin inventar una raíz falsa.

## Paletas e integridad

- Un estilo utilizado ya no puede borrarse dejando referencias huérfanas.
- LOW informa cuántos elementos lo usan y exige reasignarlos antes.
- Paleta, dibujos y relaciones Level/Style participan del guardado integral.

## Guardado y recuperación

- `Ctrl+S` escribe primero un archivo temporal en la misma carpeta y reemplaza
  el destino de forma atómica: un fallo no deja una escena parcialmente escrita.
- El documento sólo queda limpio después de una confirmación real del host.
- Si falla, LOW conserva el estado dirty y explica que la versión anterior sigue
  intacta, con las opciones de reintentar o Guardar como.
- Un guardado correcto elimina el autosave obsoleto para no ofrecer una falsa
  recuperación en el próximo inicio.
- Recovery puede guardar inmediatamente ruta, contenido y metadata de la última
  operación.

## Estudio 3D

- Navegador de orientación convertido en una brújula circular compacta.
- Joystick de transformación inspirado en el flujo de Feather: anillos más
  finos, centro translúcido y áreas de interacción amplias.
- Barra superior y paneles flotantes más modernos, limpios y consistentes con
  el módulo 2D.
- Se conservan movimiento, rotación, escala, precisión y modos 2D/3D.

## Filosofía y calidad

- Los doce principios clásicos de la animación pasan a ser criterios permanentes
  de producto: pose, arco, spacing y timing visibles; automatización reversible;
  actuación y atractivo bajo control del artista.
- Nueva matriz de regresión P0–P3 basada en problemas reales de usuarios de
  software de animación.
- 153 pruebas del modelo 2D y pruebas geométricas del estudio 3D.

## Recuperación

Si esta versión presenta una regresión crítica, se puede volver a `v3.29.63`.
Los archivos `.lowscene` mantienen el mismo formato y no requieren migración.
