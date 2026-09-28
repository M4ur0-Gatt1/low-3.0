# Video mocap y rotoscopía en LOW

## Objetivo

Convertir un video importado en material útil para animación 2D: referencia
sincronizada, siluetas, articulaciones y movimiento aplicable a un rig. El
artista conserva el control de cada corrección y de las claves generadas.

## Flujo de producción

1. **Importar** un MP4, WebM, MOV o AVI y definir entrada/salida.
2. Si existe, buscar un cuadro sin el actor y pulsar **Fondo**. Si no se fija,
   LOW estima automáticamente el fondo estático con varias muestras temporales;
   nunca toma silenciosamente el primer cuadro con el actor como fondo limpio.
3. **Marcar sujeto** cuando hay varias personas u oclusiones.
4. **Analizar** por etapas: **Detectar cuerpo** obtiene articulaciones reales y
   **Extraer siluetas** separa fondo, componentes y seguimiento temporal.
5. Revisar los cuadros señalados con **⚠→**; corregir la máscara o confirmarla con **✓**.
6. **Corregir** articulaciones perdidas, escala y piso.
7. Mantener **Pies firmes** activado para estabilizar automáticamente cada apoyo
   detectado, o desactivarlo cuando el plano exige deslizamiento.
8. **Aplicar** como siluetas, guía de dibujo, esqueleto nuevo o movimiento de un rig.

## Contrato técnico

`MotionCaptureTrack` es parte del documento y persiste metadatos, rango,
muestras de pose y siluetas. El archivo pesado se mantiene externo y puede
revincularse. Los motores se registran mediante `mocapEngines.register(id,
engine)` y deben implementar `analyze(track, video)`; así LOW puede usar un
motor local, una GPU remota o una API sin contaminar el modelo de animación.

## Reglas de calidad

- El zoom o la resolución del visor no alteran coordenadas normalizadas.
- La silueta y la pose tienen confianza por cuadro y se pueden corregir.
- El seguimiento no genera saltos de identidad entre personas.
- El retargeting crea una capa de movimiento reversible.
- Reducir claves respeta contactos de pies, manos y extremos de movimiento.
- Guardar, cerrar y reabrir conserva resultados aunque el video necesite revincularse.
- **Crear nivel de calco** omite máscaras vacías y no genera hojas blancas. Si
  ninguna contiene sujeto, detiene la operación y pide revisar/detectar antes.

## Estado

Base implementada: importación local, visor sincronizado, fondo de referencia
elegible o estimado por mediana temporal, región de sujeto editable, extracción local de siluetas de movimiento,
limpieza por componentes conectados con continuidad temporal, corrector por cuadro para
agregar o borrar máscara con tableta, guía superpuesta en el lienzo y conversión
reversible a un nivel de calco con exposiciones SVG autónomas —sin PNGs
transparentes embebidos—, persistencia del modelo y
registro de motores, detección corporal local y retargeting humano. **Detectar
cuerpo** usa Pose Landmarker Lite empaquetado dentro de LOW: procesa el video en
el equipo, produce 33 hitos corporales, una máscara semántica del actor y traduce
13 articulaciones al contrato del rig. La máscara respeta la región marcada y
reemplaza la separación por fondo sólo cuando el modelo entrega un resultado
válido. No requiere internet ni envía imágenes. Las marcas corregidas a mano se
conservan al repetir el análisis y sustituyen a la detección automática de ese
cuadro. Cada resultado conserva
confianza, oclusión y límites del sujeto; **⚠→** recorre solamente los cuadros
problemáticos y **✓** guarda la validación como una acción reversible. La extracción
local compara contra el fondo elegido y está pensada para cámara fija; no se presenta como
detección corporal. El sistema completa puntos sólo entre dos observaciones de
la misma articulación, informa la cobertura antes de aplicar y reduce claves
redundantes con una tolerancia elegida por el artista. Pendiente para producción:
pruebas de aceptación con videos diversos. La segmentación semántica y los
contactos de pie ya se integran al recorrido; los apoyos estabilizan el retargeting sin
alterar la pose relativa. La inferencia corporal corre en un worker local para que el
modelo no congele la mesa; conserva un fallback compatible para equipos donde
esa capacidad no esté disponible.

El análisis muestra progreso y se puede cancelar. Una cancelación restaura el
conjunto anterior de siluetas y devuelve el video a su tiempo y reproducción
previos; cancelar nunca deja un análisis parcial presentado como completo.
La sensibilidad y la limpieza pertenecen a la pista y se conservan al reabrir;
el artista puede adaptarlas al ruido, compresión e iluminación de cada toma.
Las articulaciones también pueden colocarse o quitarse manualmente por cuadro.
Estos puntos son datos de pose persistentes y corregibles, no una detección
automática simulada; son la entrada verificable del retargeting.

El retargeting humano inicial transfiere únicamente cadenas cuyos dos extremos
fueron confirmados: cadera/columna, cuello/cabeza, clavículas, brazos y piernas.
Convierte toda la toma en un solo lote reversible con `Ctrl+Z`; nunca cambia la
geometría, los pivotes ni la jerarquía del esqueleto. Si faltan puntos, esa
cadena se omite en vez de inventar movimiento.

`Completar` nunca extrapola antes de la primera marca ni después de la última.
`Reducción` conserva siempre extremos y cualquier desviación que supere la
tolerancia visual; el cuadro de confirmación informa cuántas claves originales
se descartarán. Ambas preferencias pertenecen al documento y sobreviven al
guardado.

La limpieza descarta manchas aisladas y prioriza la región que continúa al sujeto
del cuadro anterior. No sustituye una segmentación semántica: ropa del mismo color
que el fondo, cámara móvil u oclusiones largas todavía requieren corrección humana.
