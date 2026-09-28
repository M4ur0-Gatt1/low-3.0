# LOW v4.44.0 — El encuadre deja de mentir y el storyboard se puede mirar

Las dos cosas de esta versión salieron de Mauro usando la aplicación, no de una
prueba: el recuadro de cámara desfasado y el storyboard que «no sirve para nada
aún». Las dos resultaron ser defectos concretos, medibles.

## El encuadre de cámara ya no se desfasa de la mesa

El encuadre, el alambre del rig y la malla no viven adentro del SVG: son capas
en **píxeles de pantalla** calculadas desde dónde está la hoja en ese momento.
Cualquier cosa que mueva la hoja las deja viejas. Medido antes del arreglo, con
el encuadre puesto:

| Qué se hace | Cuánto quedaba corrido |
|---|---|
| Achicar la ventana a 1100×620 | 156 px |
| Agrandarla a 1500×900 | 223 px |
| Subir la timeline a 320 px | 160 px |
| Bajarla a 90 px | 115 px |

Un encuadre corrido 223 px **miente** sobre qué entra en cámara, que es para lo
único que sirve encuadrar.

Eran dos agujeros en el mismo lugar: sólo se escuchaba el `resize` de la
**ventana**, y sólo para el rig y la malla —la cámara no se recalculaba nunca—;
y cambiar el alto de la timeline, acoplar un panel o mover un divisor cambian el
tamaño de **la mesa** sin que la ventana cambie, así que no hay `resize` que
escuchar. Ahora se mira la mesa: un `ResizeObserver` sobre el lienzo cubre a las
tres capas y a todas las causas de una vez. Los cuatro casos quedaron en 0 px.

Va en `ui/panels/superposiciones-mesa.js` y no en `app.js`: el presupuesto de
§12 estaba justo en el techo.

## El storyboard ya se puede mirar: la animática

El generador tenía paneles con acción, diálogo, duración, cámara generada,
reparto y referencia del escenario 3D. Lo que no tenía era manera de **verlo**
corriendo: era una lista con duraciones escritas al lado. Un storyboard existe
para juzgar el **ritmo** antes de animar, así que eso era exactamente lo que no
se podía hacer.

- `boardAt(frame)` en el modelo dice qué panel se ve en cada cuadro, resuelto
  desde `boardTiming()` y no con una segunda cuenta que pueda discrepar.
- Botón **▶ Animática**: reproduce los paneles con su duración sobre *el*
  reproductor de la escena, no uno paralelo. Ése avanza por reloj real —si la
  máquina no llega saltea cuadros en vez de ir en cámara lenta, que es lo que
  arruinaría el juicio de ritmo— y arrastra el audio.
- Mientras corre hay un **visor** con el panel en el aire, su referencia y su
  texto, y la fila se marca en la lista.
- Al terminar devuelve el rango de la escena como estaba: la animática no puede
  dejar la escena recortada.

## Verificación

- ✅ 371 pruebas del modelo 2D; storyboard, multiplano, rig (malla, esquemático,
  smart bones), Premiere, lipsync, arcos, transporte y modo seguro: todas verdes.
- ✅ 13 puentes y contratos de Python, incluido el presupuesto de `app.js`.
- ✅ 53 recorridos de interfaz en Chromium, con dos nuevos:
  `check_encuadre_alineado_ui` y la extensión de `check_storyboard_ui`.
- ✅ **Seis mutaciones verificadas**, cada una con navegador nuevo: sin el
  alineador, el alineador atado sólo a la ventana, la cámara fuera del
  alineador, el board sin botón de animática, el visor que no se dibuja y el
  rango que no se devuelve. Las seis hacen caer una prueba.
- ✅ El recorrido del encuadre mide sin números escritos a mano: lee el
  rectángulo que se ve, fuerza el recálculo y lo vuelve a leer; si movió, lo que
  se veía estaba viejo. Así no envejece con el CSS.

## Límites de esta versión

- ⏳ `check_rig_control_ui` falla **localmente** cuando corre después de los
  otros 52 recorridos, y pasa aislado y en CI. Verificado también sobre el árbol
  limpio de v4.43.1: es **preexistente**, no de estos cambios. No se pudo
  atribuir al producto —el mismo gesto instrumentado da 0,91— así que se dejó
  como estaba en vez de dejarlo peor. Queda anotado, no arreglado.
- ⏳ El storyboard todavía no deja **dibujar** el panel a mano (la referencia
  sale del escenario 3D) ni **exportarlo**. Con esta versión ya se puede ver y
  cronometrar, que era lo que faltaba para que sirviera.
- ⏳ Validación humana con tableta, pendiente como en las versiones anteriores.
