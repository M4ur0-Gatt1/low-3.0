# LOW v4.29.0 — la invitación deja de tapar el dibujo, y sus botones responden

Dos reportes de Mauro sobre la primera pantalla que estrenó v4.28.0:

> no anda nada el panel

> estos botones no andan que da ese modal clavado

Los dos son ciertos, son dos defectos distintos, y los dos se reprodujeron en
la app real antes de tocar nada.

## 1. Los botones no hacían nada

La invitación vive **dentro de `#dzCanvas`**, que es la superficie de dibujo. El
lienzo atiende el `pointerdown` antes que nadie, y como la invitación no estaba
en la lista de UI flotante (`DZ_UI_SEL`) la trató como dibujo: `dzPointerDown`
**seleccionaba el `<button>` como si fuera arte** —de ahí el inspector de la
derecha mostrando «`<button>`» y «Comentario sobre `<button>`»— y su
`e.preventDefault()` **se comía el click que el navegador iba a generar**. El
botón no se enteraba nunca.

Medido: `{"dentroDelLienzo": true, "selTrasClic": "BUTTON", "docTrasClic": false}`.

Arreglo: `.bien2d` en `DZ_UI_SEL`. Una línea, **cero líneas nuevas** en `app.js`,
que está en su techo.

## 2. El «modal clavado»: la invitación encima del documento

Lo que Mauro vio en la captura: dos pestañas abiertas, siete cuadros, un nivel
con su dibujo… y la invitación puesta encima, tapando todo, como un modal que no
se va.

`hayTrabajoAbierto()` preguntaba por `DZ.path` y `DZ.doc`. Medido en la app real
con un diseño `.svg` abierto: **los dos estaban en `null`**. La contabilidad real
de «qué hay abierto» son las pestañas —`documentTabs` / `activeDocumentTab`—, que
es con lo que `app.js` decide si muestra la barra de pestañas. Ahora se
consultan, y el reloj que vigila **ya no se rinde a los 30 segundos**: el caso en
que seguía corriendo era exactamente el caso en que la invitación seguía en
pantalla, y rendirse ahí la dejaba pegada para siempre.

## 3. Y un tercero, que apareció al escribir la prueba del segundo

El reloj se armaba **una sola vez, en el arranque**. Una invitación *repintada*
—que es lo que pasa al volver de la IA sin nada abierto— no la vigilaba nadie, y
se volvía a clavar en cuanto se creaba un documento. El reloj pasó a armarse
donde se pinta y a apagarse donde se quita.

## Lo que aprendieron las pruebas, que es la mitad del arreglo

**Mi propio guard no había mordido.** `check_pantalla_inicial_ui` disparaba el
`click` **a mano**, y así el botón respondía en la prueba y no respondía en la
app. Un `preventDefault()` en `pointerdown` cancela el click que el navegador
iba a generar, así que ahora la prueba dispara `pointerdown`, pregunta si
**alguien lo canceló**, y sólo manda el click si nadie lo hizo — como hace el
navegador. Confirmado mordiendo con el código viejo antes de dar el arreglo por
bueno.

**Y el arnés contra la app real necesita mover el mouse.** Un
`Input.dispatchMouseEvent` de `mousePressed` sin un `mouseMoved` previo no
acierta el blanco: una medición mía dio «el clic no hace nada» cuando el arreglo
ya estaba puesto. Un mouse de verdad siempre se mueve primero.

## Pruebas

- **4 contratos estáticos nuevos**, los cuatro verificados a mano contra su
  violación: `.bien2d` en `DZ_UI_SEL`; `documentTabs` en la comprobación de «hay
  algo abierto»; nada de topes en el reloj; y el reloj armado **al pintar**.
- **`check_pantalla_inicial_ui` ampliado** con el caso clavado: se reproduce el
  estado exacto que se midió —pestañas sí, `doc` y `path` no— y se exige que la
  invitación se vaya. Verificado mordiendo con el código viejo:
  `{"repintada": true, "sigueTapandoElDocumento": true}`.

Puerta completa en verde: 12 suites de modelo, 6 puentes, 30 recorridos reales,
contratos, presupuestos de rendimiento y de `app.js`.

## Lo que NO es un defecto nuevo

Al medir apareció el modal **«LOW encontró una escena de animación que no llegó
a guardarse. ¿La recuperás?»**. Ése es el rescate ante caída que ya existía, y
salió porque estas mediciones matan instancias a propósito. Se deja como está.

## Reversión

Estable previa: `v4.28.0`. Los tres arreglos son independientes: se revierte
sacando `.bien2d` de `DZ_UI_SEL` en `app.js` y volviendo
`ui/application/pantalla-inicial.js` a su versión anterior.
