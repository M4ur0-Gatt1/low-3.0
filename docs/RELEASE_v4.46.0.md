# LOW v4.46.0 — Ahora se ve qué está seleccionado

*«La selección en grupo es muy poco satisfactoria, no se sabe si uno seleccionó
todo o sólo una pieza; debe ser clara la gráfica al respecto, como en
Illustrator.»*

## Lo que estaba pasando, medido

Con cinco piezas en la hoja:

| Qué seleccionabas | Qué se veía |
|---|---|
| Una pieza | una marca, sin recuadro, sin texto |
| **Tres piezas** | **nada: ni marca, ni recuadro, ni texto** |
| Un grupo entero | una marca, sin recuadro, sin texto |

O sea: con tres piezas seleccionadas **la pantalla se veía igual que sin nada
seleccionado**, y una pieza se veía **igual que un grupo entero**. No era que la
gráfica fuera poco clara — en el caso de varias, no había gráfica.

## Lo que hace ahora

Un **marco** alrededor de todo lo seleccionado, con una etiqueta que dice de qué
se trata. Los tres estados se ven distintos, porque no son lo mismo: en uno
movés una pieza, en otro tres sueltas, en otro el conjunto entero.

| Estado | Marco | Etiqueta |
|---|---|---|
| Una pieza | línea sólida | `1 pieza` |
| Varias | línea de guiones **y cada pieza marcada aparte** | `3 piezas` |
| Un grupo | guiones con halo, como el marco de grupo de Illustrator | `grupo · 4 piezas` |

Marcar cada pieza por separado no es decoración: el número solo dice **cuántas**,
no **cuáles**, y con piezas superpuestas esa es justo la duda.

El marco es una capa sobre el lienzo, **no un elemento adentro del SVG**: lo que
se dibuja adentro termina en el archivo guardado, y eso se comprueba en la
prueba.

## Verificación

- ✅ Recorrido nuevo `check_marco_seleccion_ui` con los cuatro casos: una pieza,
  varias, un grupo, y nada seleccionado (que no deje un marco colgado). Además
  comprueba que el marco no se guarde dentro del dibujo.
- ✅ **Cuatro mutaciones verificadas**: sin el enganche no hay marco; que varias
  se vean como una; que un grupo se vea como varias; y que no se marquen las
  piezas una por una. Las cuatro hacen caer la prueba.
- ✅ 60 recorridos y las 14 suites del modelo. `app.js` no cambió: el marco vive
  en `ui/panels/marco-seleccion.js` y envuelve las funciones de selección que ya
  existían.

## Sigue abierto

- ⏳ La pieza que no queda asociada a su hueso («uno de los brazos»): hace falta
  el `.low` del personaje.
- ⏳ Colocar un esqueleto **sobre** el dibujo para vincularlo después.
- ⏳ `check_rig_control_ui`, preexistente de v4.43.1.
