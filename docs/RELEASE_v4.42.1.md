# LOW v4.42.1 — los generadores de movimiento, en el documento

Cuarta función de la misma familia. «Recorrido», «caminata» y «rebote» —los que
generan N cuadros de un movimiento— insertaban cada cuadro así:

```js
api.insert_frame(DZ.path, svg2.outerHTML)
```

…que escribe archivos `nombre_fNNN.svg` al lado del diseño y renumera. Sin
`DZ.path` no hay nada que renumerar: con un documento nuevo, esos botones **no
generaban nada**.

Ahora los cuadros entran **al documento**, y entran donde corresponde: después
del cuadro actual, **corriendo** los que seguían. Es el insertar de OpenToonz —la
columna se estira, no se pisa—, hecho con un `splice` sobre las celdas de la
capa. Cada cuadro nuevo es un dibujo con número propio: reusar un número
cambiaría el dibujo en **todos** los cuadros donde ya estaba expuesto.

Medido en el recorrido: parado en el cuadro 2 de una escena de 52, generar tres
cuadros deja 55, el cuadro 2 intacto y lo que estaba en el 3 ahora en el 6.

## Pruebas

- **`check_titiritero_documento_ui.js`** suma el bloque de los generadores:
  exige que generen, que **no pisen** el cuadro donde estás parado y que corran
  los siguientes. Dos mutaciones verificadas —una de ellas cambia el `splice` de
  insertar a pisar, y la prueba la caza.
- **Un contrato estático nuevo** (316 en total), verificado por mutación.
- Puerta completa: **12 suites, 12 puentes y 47 recorridos. 0 fallos.**

## Reversión

Estable previa: `v4.42.0`. El cambio son dos líneas plegadas en `ui/app.js` y
una función nueva en `ui/animation/toma-al-documento.js`.
