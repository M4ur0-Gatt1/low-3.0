# LOW v3.29.54 — Dos estados: Construir y Animar

Había tres modos hermanos —Armado, FK, IK— más tres herramientas —Seleccionar,
Posar, Crear hueso—. Seis cosas para combinar, y ninguna decía lo único que
importa saber: **si estás armando el muñeco o animándolo**. Con el panel entero
visible todo el tiempo, tampoco quedaba claro con qué se mueve el personaje.

Ahora hay **dos estados**, como en Harmony o en Moho, y cada uno muestra sólo lo
suyo.

## Construir

Registrar las piezas, mover los pivotes, decir de quién cuelga cada una, poner
los topes de giro, dar curva para doblar, cargar los dibujos de una pieza.

**Acá no se crean claves.** Nada de lo que toques queda grabado en la animación,
y la manija de posar ni siquiera aparece en la mesa: no se puede animar sin
querer mientras se arma.

## Animar

Posar. La herramienta de posar queda puesta sola —no hay que elegirla— y cada
gesto deja una clave en el cuadro donde estés parado. Los controles de armado
desaparecen, así no se rompe el rig por accidente.

Dentro de Animar se elige **cómo** posar, que es una decisión más chica y por eso
va en un renglón secundario: **Directa** rota cada pieza por su pivote y los
hijos siguen; **Inversa** deja arrastrar la punta y acomoda la cadena sola.

## El panel dice qué gesto hace qué

Bajo los botones hay un renglón fijo que cambia con el estado:

- Construir: *«Acá se arma. Nada de lo que toques queda como clave.»*
- Animar · Directa: *«Arrastrá la MANIJA (el punto al final de la línea punteada)
  para rotar, o la ARTICULACIÓN para mover. Cada gesto deja una clave en este
  cuadro.»*
- Animar · Inversa: *«Arrastrá el ROMBO verde: la cadena entera se acomoda sola.»*

El tope de giro se mudó de la sección de pose a la de armado, que es donde
corresponde: un codo que no dobla para atrás es parte del muñeco, no de la
animación.

## Qué se midió

El mismo gesto —agarrar la manija del brazo y rotarla— en los dos estados:

| | Construir | Animar |
| --- | --- | --- |
| herramienta activa | `Seleccionar` | `Posar`, puesta sola |
| manija en la mesa | no aparece | aparece |
| resultado del gesto | **ninguna clave** | clave en F1, brazo a −49.3° |

Y lo que muestra cada panel:

| estado | secciones visibles |
| --- | --- |
| Construir | piezas · pivotes · jerarquía · topes · doblar · dibujos |
| Animar | transformación · claves · curva · doblar · dibujos |
| Animar · Inversa | las de Animar, más la cadena IK |
