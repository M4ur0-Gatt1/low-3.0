# LOW v3.29.58 — Los principios que sí se pueden calcular

De los doce principios, seis se pueden automatizar sobre las claves que ya
pusiste. Ninguno inventa poses: todos transforman las tuyas.

Cuatro **no** tienen botón y no lo van a tener — puesta en escena, dibujo
sólido, atractivo y, en buena medida, la acción secundaria. Son criterio del
animador, y un botón que dijera hacerlos estaría mintiendo.

## Arcos — el del espacio

Botón **Arco**. Dibuja por dónde pasa la pieza en cada cuadro del tramo activo,
con las claves marcadas en naranja y el cuadro actual en rojo.

Y dice dos cosas a la vez: la **forma** del recorrido, y el **espaciado** — los
puntos juntos son cuadros lentos, los separados, rápidos.

Sigue el **extremo** de la pieza, no su pivote. El pivote de un brazo es el
hombro y no se mueve cuando el brazo rota: el arco lo describe la punta.

## Arcos — el del timing

Debajo del editor de curvas hay ahora una **carta de tiempos**: la reglita de
toda la vida, con una marca por cuadro ubicada donde cae dentro del recorrido.
Amontonadas es lento, separadas es rápido.

Con la curva **recta**, las siete marcas de un tramo caen parejas: 0 · 16.7 ·
33.3 · 50 · 66.7 · 83.3 · 100. Con **suave**: 0 · 2.7 · 14.9 · 50 · 85.1 · 97.3 ·
100 — se apiñan en los extremos y el hueco del medio se agranda de 16.7 a 35.1,
que es donde el movimiento corre.

## Acción complementaria y superpuesta

Botón **Desfasar cadena**. Lo que cuelga llega tarde: cada nivel de la jerarquía
se corre los cuadros que le digas, y la cadena deja de moverse en bloque.

Con desfase 2 sobre el brazo: el brazo queda en 1·7·13, el antebrazo pasa a
3·9·15 y la mano a 5·11·17. Ese retraso escalonado es el latigazo.

## Pose a pose — bloques

**En bloques** pasa todas las claves de la pieza a escalón, para mirar sólo el
posado sin que la interpolación lo disimule. **Interpolar** las devuelve.

## Exageración

Amplifica lo que ya animaste: cada clave se aleja de la pose de reposo por el
factor que pongas. Con ×1.5, una rotación de −68° pasa a −102°. Con un factor
menor a 1 hace lo contrario y suaviza la actuación.

## Estirar y encoger con volumen

Botón **Volumen**. Al escalar un eje, el otro compensa solo para que la masa no
cambie — estirar deforma en vez de inflar. Con `sy` en 1.4, `sx` queda en 0.714:
el producto da exactamente 1.

## Lo que ya estaba

*Slow in / slow out* son las curvas de interpolación (v3.29.51), y el *timing*
son los fps y la exposición de la hoja de tiempos. *Pose a pose* es el modelo de
claves de siempre.

## Qué se midió

| principio | medición |
| --- | --- |
| arco espacial | 13 puntos, uno por cuadro, con las 3 claves marcadas |
| arco del timing | hueco central: 16.7 con recta, **35.1** con suave |
| desfase 2 | brazo 1·7·13 · antebrazo 3·9·15 · mano 5·11·17 |
| exagerar ×1.5 | −68° → **−102°**, −12° → −18° |
| en bloques | 0 · 0 · 0 · −102 contra 0 · −34 · −68 · −102 interpolado |
| volumen | `sy` 1.4 → `sx` **0.714**, producto **1.000** |
