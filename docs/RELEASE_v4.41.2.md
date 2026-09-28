# LOW v4.41.2 — el espacio de Animación no mostraba nada

> «probablemente lo más importante no lo corregiste: el panel de animación no
> muestra nada»

Tenía razón, y el falso positivo fue mío: en la v4.41.1 midió **el riel de
herramientas** —que también estaba mal— y di el tema por cerrado sin medir nunca
lo que el espacio de Animación tiene que mostrar.

## Un `.low` no tiene `DZ.path`

Entrar al espacio de Animación llama a `dzAnimToggle()`, que arrancaba así:

```js
if (!DZ.path) return sysMsg("Abrí un diseño primero (🖋 o un .svg del árbol).");
```

`DZ.path` es la ruta del **.svg suelto**: el camino viejo. Un documento `.low`
guarda sus cuadros **adentro del documento** y deja `DZ.path` en `null`. O sea
que cualquiera que arranca LOW, aprieta «Nuevo documento» y va a Animación se
iba por esa puerta y la Timeline **no se encendía nunca**.

Medido con un documento nuevo, antes del arreglo:

| | |
|---|---|
| `DZ.anim` | **false** |
| grilla de la Timeline | **oculta** |
| X-sheet | **oculta** |
| tira de niveles | **oculta** |
| capas | **ocultas** |
| barra de transporte | visible |

Lo único que quedaba era la barra de transporte, que es exactamente lo que se
veía en pantalla.

Ahora el arranque del camino viejo —persistir, `make_frame`, releer el árbol,
`scene_get`— corre **sólo si hay `DZ.path`**. Con una escena abierta se saltea,
porque todo eso ya vive en el documento. Los dos caminos quedan probados: el
`.svg` suelto y el documento nuevo.

## Y de paso, los otros seis espacios

En vez de arreglar el que se reportó y volver a cantar victoria, se recorrieron
**los siete** con un documento nuevo, comprobando que cada espacio muestre todos
los paneles que promete su definición:

- **Dibujo, Animación, Limpieza, Color, Cámara y 3D**: completos.
- **Composición**: no muestra `layers` ni `code`. Es deliberado —el compositor
  3D los apaga por CSS— pero su definición los pide igual. Queda anotado: es una
  inconsistencia de la definición, no algo que se vea roto en pantalla.

## Pruebas

- **`check_espacio_animacion_ui.js`, nueva y en CI**: crea un documento con
  «Nuevo documento» como una persona, entra a Animación y exige que la Timeline
  esté **encendida** y que se vean la grilla, las filas y la tira de niveles. Y
  después prueba el camino viejo con un `.svg` suelto, porque era el que tapaba
  el agujero y romperlo al arreglar el otro sería cambiar un defecto por otro.
  **El recorrido se escribió antes del arreglo y falló** con el mensaje exacto
  del defecto.
- **Dos contratos estáticos nuevos** (307 en total), verificados por mutación.

## Reversión

Estable previa: `v4.41.1`. El cambio son tres líneas plegadas en `dzAnimToggle`
(`ui/app.js`).
