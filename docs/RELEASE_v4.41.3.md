# LOW v4.41.3 — el sidebar de Animación, verificado en la app real

> «me estás tomando el pelo, sigue igual: el panel de animación no tiene el
> sidebar con las herramientas, igual que en las anteriores»

Tenía razón. La v4.41.2 arregló **una** de las dos causas, la probé en el mock,
dio verde y publiqué. Faltaban dos cosas más, y el mock no las mostraba.

## Lo que faltaba (1): otra puerta con `DZ.path`

`dzEnsureAnimationWorkspace()` —la función que existe justamente para dejar un
documento nuevo listo para animar— arrancaba así:

```js
if (!DZ.path) return false;
```

Un `.low` no tiene `DZ.path`. O sea: la función que tenía que montar la Timeline
al crear un documento se iba sin hacer nada, **en el único caso para el que
existe**.

## Lo que faltaba (2): preguntar si se ve, en vez de si está encendida

El espacio de trabajo decide si prender la Timeline así:

```js
const abierta = !el.hidden;      // ← el div, no el estado
```

La **barra de transporte** puede estar a la vista con la Timeline **apagada**.
Entonces el espacio concluía «ya está abierta» y no la prendía nunca: ni grilla,
ni X-sheet, ni tira de niveles. Ahora la verdad es `DZ.anim`.

## Por qué el mock decía que estaba arreglado

Dos diferencias, y las dos importaban:

- En el mock la barra de transporte arrancaba **oculta**; en la app real estaba
  **visible**, que es lo que disparaba el falso «ya está abierta».
- En el mock el espacio recordado era **Dibujo** —la prueba limpia el
  `localStorage`—; en la app real era **Animación**, porque LOW recuerda dónde
  trabajaste.

Medido en la app instalada v4.41.2, con el perfil real: `DZ.anim` en `false`,
barra de transporte de 1366×38 a la vista, y grilla, X-sheet, niveles, dock y
capas **todos ocultos**.

## Verificado donde se usa

Esta vez el arreglo se comprobó **en la app real** (WebView2, CDP :9224), no en
el mock: tras «Nuevo documento», sin tocar nada, grilla 1366×212, filas
1366×104, X-sheet 242×280, tira de niveles 242×270 y dock 252×306. Con captura
de pantalla mirada, no sólo con números.

## Pruebas

- **`check_espacio_animacion_ui.js`** suma el caso que el mock tapaba: entrar a
  LOW con **Animación como espacio recordado** y crear un documento. Se escribió
  antes del arreglo y falló con el mensaje exacto del defecto.
- **Dos contratos estáticos nuevos** (309 en total), verificados por mutación —
  uno de ellos acotado a la función, porque el texto suelto aparecía en dos
  lugares y el contrato no mordía.
- Puerta completa: **12 suites, 12 puentes y 45 recorridos. 0 fallos.**

## Reversión

Estable previa: `v4.41.2` (donde el panel seguía vacío). Son dos líneas en
`ui/app.js`.
