# Sistema profesional de coloreo de LOW 2D

## Objetivo

LOW debe permitir pintar una zona una sola vez y trasladar ese color al resto
del nivel sin convertir una equivocación automática en decenas de correcciones
manuales. La regla de diseño es simple: **el programa propaga cuando puede
demostrar la correspondencia y se detiene cuando hay ambigüedad**.

El color no se copia a la misma coordenada de cada cuadro. En animación, una
mano, un ojo o una manga cambian de posición y tamaño. LOW registra una
identidad de zona (`data-low-zone`), compara forma, superficie, proporción y
trayectoria, y produce un informe de los dibujos que no pudo resolver con
confianza.

## Qué toma de los sistemas de referencia

OpenToonz aporta una base muy clara para el balde: modos de áreas/líneas,
relleno selectivo, rango de fotogramas, cierre y comprobación de huecos, y
*autopaint* para integrar líneas de cierre con el área. Su documentación también
advierte que el relleno por rango puede equivocarse cuando la zona se desplaza;
esa limitación es el motivo por el que LOW agrega seguimiento e informe en vez
de depender sólo de la coordenada. Véase la documentación oficial de
[Painting Animation Levels](https://opentoonz.readthedocs.io/en/latest/painting_animation_levels.html).

Harmony aporta cuatro decisiones centrales:

- `Paint`, `Paint Unpainted` y `Unpaint` como comportamientos distintos del
  mismo instrumento ([Paint Tool Properties](https://docs.toonboom.com/help/harmony-25/essentials/reference/tool-properties/paint-tool-properties.html)).
- Aplicación simultánea sobre varios dibujos visibles o seleccionados
  ([Painting Several Drawings Simultaneously](https://docs.toonboom.com/help/harmony-25/paint/colour/paint-multiple-drawings.html)).
- Separación coordinada de *Line Art* y *Colour Art*, con trazos invisibles de
  cierre cuando hagan falta
  ([Creating Colour Art from Line Art](https://docs.toonboom.com/help/harmony-24/premium/paperless-animation/create-colour-art-line-art.html)).
- Colores identificados por muestras reutilizables: cambiar una muestra debe
  actualizar sus usos, no hornear un color aislado en cada dibujo
  ([About Painting and Colours](https://docs.toonboom.com/help/harmony-25/paint/colour/colours.html)).

LOW adopta esos principios de trabajo con código propio y archivos SVG
compatibles. No copia código ni interfaz de terceros.

## Flujo de uso

1. Dibujar o limpiar el contorno en el plano **Línea**.
2. Elegir el balde y el color de una muestra de la paleta.
3. Elegir el modo:
   - **Pintar:** crea la zona o actualiza una ya identificada.
   - **Sólo vacío:** protege zonas que ya tienen color.
   - **Recolorear:** exige que el clic esté sobre un relleno existente.
   - **Borrar color:** elimina esa identidad en todo el alcance elegido.
4. Elegir el alcance:
   - **Cuadro:** sólo el dibujo actual.
   - **Rango X-sheet:** los dibujos únicos expuestos en la selección.
   - **Mesa de luz:** el actual y los dibujos visibles en onion skin.
   - **Nivel completo:** todos los dibujos del nivel, incluso los no expuestos.
5. Ajustar **Hueco** entre 0 y 10 píxeles. Es una ayuda de análisis: no altera
   ni suelda el contorno original.
6. Hacer clic dentro de la zona. `Shift+clic` usa el color de trazo.
7. Si aparece **Informe**, abrirlo. Cada omisión incluye un botón que lleva al
   fotograma afectado. Esos dibujos requieren una corrección del contorno o un
   clic manual; LOW no los pinta a ciegas.

Todo el rango entra al historial como una sola operación. Un `Ctrl+Z` revierte
el coloreo completo, no únicamente el último dibujo procesado.

## Modelo y contratos

```text
Palette Style ID ───────────────┐
                               ▼
Drawing / Line Art ── detecta región ── Zone ID
                               │          │
                               ▼          ▼
                     descriptor geométrico
                     forma · área · centro
                               │
                               ▼
                  seguimiento bidireccional
                  pasado ◀ actual ▶ futuro
                               │
              ┌────────────────┴──────────────┐
              ▼                               ▼
       coincidencia segura             ambiguo/débil
       escribe Colour Art              omite + informa
```

- `animation/coloring.js` contiene reglas puras, comprobables sin interfaz.
- `data-fil` referencia el número estable de una muestra de la paleta.
- `data-low-zone` conserva la identidad de la región entre dibujos.
- `g[data-low-art="colour"]` contiene el relleno debajo de
  `g[data-low-art="line"]`.
- `LowDoc.applyDrawingContents()` aplica el cambio multicuadro de forma
  atómica y crea una sola entrada de historial.

## Política contra errores

Una coincidencia se puntúa con cuatro señales: firma de la forma, distancia a
la posición prevista, cambio de superficie y cambio de proporción. Se rechaza
si la confianza mínima no se alcanza o si el segundo candidato queda demasiado
cerca del primero. El seguimiento se ejecuta por separado hacia el pasado y
hacia el futuro para que una pose anterior no contamine la predicción siguiente.

La identidad exacta tiene prioridad sobre la inferencia. Después de la primera
propagación, recolorear o borrar una zona ya identificada no vuelve a adivinar.

## Verificación mínima antes de publicar

- Pintar una zona cerrada en **Cuadro** y comprobar que vive debajo de Línea.
- Pintar en **Nivel completo** una zona que se desplaza gradualmente.
- Presentar dos zonas visualmente equivalentes y comprobar que LOW omite el
  dibujo ambiguo.
- Probar contorno con un hueco de 1–3 px y verificar que el ajuste no modifica
  el Line Art.
- Recolorear desde la paleta y verificar todos los usos del estilo.
- Borrar color en rango y deshacer/rehacer con una sola acción.
- Guardar, cerrar y reabrir; verificar `data-fil` y `data-low-zone`.

## Próximas etapas

La base ya admite añadir, sin romper el formato:

- trazos invisibles editables de cierre;
- cola de revisión que navegue directamente a cada cuadro omitido;
- propagación entre varias capas seleccionadas;
- reemplazo global de una muestra en dibujo, nivel o escena;
- asistencia opcional de flujo óptico, siempre subordinada al umbral de
  confianza y nunca como escritura silenciosa.
