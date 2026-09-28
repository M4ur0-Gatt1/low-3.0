# LOW v4.45.2 — El globo de ayuda deja de taparte el botón

Corrección chica y puntual, de lo reportado probando la v4.45.1: *«el tooltip
sigue siendo incomodísimo, tapa el botón»*.

## Qué pasaba

En la v4.45.1 se arregló el **cartel doble** —el globo propio y el tooltip
nativo del navegador mostraban el mismo texto, uno encima del otro— pero quedó
el problema de dónde se pone el que sobrevivió.

El globo se ubicaba **siempre a la derecha** del botón y, si no entraba en la
ventana, se lo empujaba adentro con un `min`. Para los botones del panel de la
derecha eso significa aterrizar justo **encima del botón y de sus vecinos**, que
es exactamente donde uno está mirando. Los botones del medio siempre entraron
bien, y por eso el defecto sobrevivió tanto tiempo.

## Qué hace ahora

Se prueban los cuatro lados —derecha, izquierda, abajo, arriba— y se elige el
primero que entra en la ventana **sin pisar al botón**. Si ninguno entra limpio
(una ventana muy chica), se usa el que deje menos superposición: siempre es
mejor que taparlo entero.

## Verificación

- ✅ Recorrido nuevo `check_ayuda_no_tapa_ui`: recorre los botones con ayuda
  **más pegados a cada borde** —los que el posicionamiento viejo empujaba encima
  de sí mismos— y exige, para cada uno, que el globo no se superponga con su
  botón, que quede dentro de la ventana y que aparezca **un solo** cartel.
- ✅ Dos mutaciones verificadas: volver al posicionamiento viejo hace caer la
  prueba por superposición, y dejar el `title` puesto la hace caer por cartel
  doble.
- ✅ 59 recorridos y las 14 suites del modelo.

Una nota sobre la prueba, porque casi me engaña: la primera versión identificaba
el botón **por su índice** en la lista, y los paneles se redibujan entre el
hover y la medición, así que acusó un solapamiento que era de otro botón. Ahora
marca el botón y mide ése.

## Sigue abierto

- ⏳ La pieza que no queda asociada a su hueso («uno de los brazos»): hace falta
  el `.low` del personaje para reproducirla.
- ⏳ Colocar un esqueleto **sobre** el dibujo para vincularlo después: función
  nueva, no arreglo.
- ⏳ `check_rig_control_ui`, preexistente de v4.43.1.
