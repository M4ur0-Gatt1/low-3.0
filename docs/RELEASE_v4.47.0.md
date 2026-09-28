# LOW v4.47.0 — lo que está apagado no se ve, y la línea sigue al cursor

Dos correcciones que salieron de buscar defectos **de uso**: no cosas que se
rompen, sino cosas que se ven mal, no responden, o no hacen lo que uno espera.

---

## 1. `hidden` no escondía: había botones muertos en pantalla

Auditando la interfaz apareció `#tlCamKey` —«dejar clave de cámara»—: el
código lo apaga con `hidden = !DZ.camMode`, pero **seguía ocupando 29×29 y se
podía apretar**. Apretarlo no hacía nada, porque el modo cámara estaba
apagado. Un botón que se ve, se aprieta y no hace nada es el peor defecto de
uso que puede tener una herramienta.

La causa no era del botón sino de la hoja de estilos. El navegador esconde lo
que lleva `hidden` con una regla propia, pero **cualquier regla nuestra que
fije `display` con una clase le gana por especificidad**: `.ibtn { display:
inline-flex }` alcanza.

Medido recorriendo los siete espacios de trabajo:

| elemento | tamaño en pantalla | |
|---|---|---|
| `#tlCamKey` | 29 × 29 | botón, **apretable**, no hacía nada |
| encabezado de la grilla de tiempo | 1366 × 21 | |
| panel de paleta (espacio Limpieza) | 220 × 794 | el panel entero |
| columna de herramientas (espacio 3D) | 74 × 618 | |

`app.css` ya traía **cuarenta** reglas sueltas `.loquesea[hidden] {
display:none }`: cada una es este mismo defecto parchado *después* de que
apareciera. Ahora hay **una sola regla al final del archivo** —el final gana
los empates de especificidad— que los cubre a todos, incluidos los que
todavía no habían molestado. Después del cambio: cero fugas.

## 2. Estudio 3D: la línea saltaba al otro lado del agujero del toro

Reportado: «todavía hay líneas que no respetan las guías o las superficies de
base». Medido, dibujando una recta horizontal por el centro de cada
superficie y mirando la distancia entre cada par de puntos seguidos:

| superficie | salto máximo |
|---|---|
| plano, esfera, cilindro, loft | 0.03 |
| **toro** | **1.82** — un tercio del largo total del trazo |

Y el trazo del toro además se cortaba antes: el cursor llegaba a `x=+2.7` y la
línea terminaba en `x=+0.765`.

**La causa.** Cuando el rayo no le pega a la malla, el motor toma el punto del
rayo más cercano al centro de la superficie y lo pega a la piel. Barriendo el
cursor por el medio de un toro (R=1.4, tubo=0.49) se ve el mecanismo: sobre el
agujero el punto se **clava** en el borde interno (`x=-0.91`) mientras el
cursor avanza, y al cruzar el centro **salta al borde opuesto** (`x=+0.91`).
El salto es de costado: la tinta se va lejos de donde está el cursor.

**El arreglo.** El agujero no es superficie. Adentro del agujero la proyección
devuelve «no hay dónde apoyarse» y el trazo usa el plano por el centro, que
sigue al cursor y empalma sin escalón —en el borde del agujero la proyección
ya daba `z=0`, que es la `z` de ese plano—.

Resultado: salto de **1.82 → 0.176** (dentro del ruido del muestreo) y la
línea cubre el toro entero, de `-1.89` a `+1.89`.

No se cambió el comportamiento de la esfera: al salir del volumen el trazo
**desliza por la silueta** a propósito, que es lo que hacen Feather y el
Grease Pencil de Blender. Guía, plano, esfera y cilindro se midieron también:
desvío 0 contra el plano de apoyo.

---

## Cómo se encontraron

`tools/auditoria_uso_ui.js` es un barrido, no una puerta: aprieta cada botón
visible de los siete espacios (144 en total), saca una foto del estado antes y
después, y anota los que no producen **ningún** efecto observable.

Hubo que corregirlo tres veces antes de poder creerle, y las tres correcciones
son la parte reutilizable:

1. **La foto tiene que ser fina.** La primera versión no miraba zoom, foco ni
   los paneles flotantes fuera del contenedor principal: acusó de mudos a 21
   botones sanos.
2. **La foto tiene que ser estable.** Si algo se mueve solo, «cambió» no
   prueba nada. Se mide el reposo antes de empezar.
3. **Los botones se buscan de nuevo antes de cada clic.** Los paneles se
   redibujan enteros y un marcador puesto al principio se va con el DOM viejo.
   Y los botones que se llevan la vista entera (abrir el 3D, salir del módulo)
   dejaban sin medir los 37 restantes: ahora remonta y reintenta una vez.

Un botón mudo puede tener razón: ir al «primer cuadro» estando en el primero
no tiene por qué hacer nada. El transporte de la línea de tiempo apareció como
sospechoso y era que el montaje tenía cero cuadros — no es defecto.

## Guardias nuevos en la puerta

- `tools/check_hidden_esconde_ui.js` — recorre los siete espacios y falla si
  algo con `hidden` mide en pantalla; distingue lo que además es apretable.
  Probado al revés: sin la regla del CSS se pone rojo y nombra `#tlCamKey`.
- `tools/check_3d_superficie_curva_ui.js` — dibuja con eventos de puntero
  reales sobre plano, esfera, cilindro, toro y loft, y exige que el trazo sea
  continuo (ningún salto mayor al 15% del largo). Estaba **rojo antes** del
  arreglo, con el 37%.

Puerta local: **62 de 62 recorridos en verde**. `app.js` sin tocar, en el
techo del presupuesto (17.075 líneas).

## Alcance, dicho con todas las letras

El barrido mira **botones**: no mira gestos con el lápiz, arrastres, atajos de
teclado ni el orden en que se hacen las cosas. Cuatro hallazgos no significa
que no haya más defectos de uso, significa que no hay más *de esa forma*.
