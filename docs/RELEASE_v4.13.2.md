# LOW v4.13.2 — El panel de Equipo deja de estorbar

Dos problemas del panel nuevo, reportados usándolo. Los dos eran míos y los dos
son de los que no se ven escribiendo código.

## Tapaba los otros paneles

El panel de Equipo era un flotante clavado con `position:fixed` sobre el muelle
derecho, con `z-index` por encima de todo. Se plantaba encima de los paneles
acoplados ahí y **no había forma de moverlo**: ni arrastrarlo, ni acoplarlo, ni
mandarlo a otro lado. Sólo cerrarlo.

Todos los demás paneles de LOW son acoplables desde hace versiones, y este
tendría que haber nacido igual. Ahora lo es: tiene la misma cabecera arrastrable
que la X-sheet o el papel cebolla, botón **Acoplar**, se lo puede llevar a
izquierda, derecha o abajo, recuerda dónde quedó, y figura como **Equipo** en la
lista de paneles del menú Ventana.

## Trababa el programa al estar conectado

Esto era más serio y no se notaba mirando el código: **el panel hacía trabajo
por cada cambio de cuadro**.

Medido, sobre 60 cambios de cuadro con un nivel de 178 KB y cuarenta
comentarios cargados:

| | desconectado | conectado |
|---|---|---|
| antes | 206 ms | **553 ms** |
| ahora | 218 ms | **209 ms** |

Dos causas, las dos por cuadro:

**Un mensaje de presencia por cuadro.** En reproducción a 24 fps eso son 24
mensajes por segundo **y por persona** atravesando el relé para avisar algo que
a nadie le urge saber 24 veces por segundo. Ahora va limitada a una por segundo,
y el latido de fondo —el que evita que el relé te dé por ido— sigue saliendo
igual cada 8 segundos.

**La lista de comentarios se repintaba entera en cada cuadro.** 7 ms con apenas
cuarenta comentarios, y crece con cada uno nuevo. Esa lista sólo depende del
cuadro cuando está puesto el filtro «solo este cuadro»: ahora se repinta
únicamente en ese caso, y nunca mientras se reproduce.

De paso, mientras se reproduce no sale ninguna instantánea: reproducir no edita
nada.

## Y una fuga de memoria

Para no reenviar lo que ya está del otro lado, se guardaba el JSON **entero** de
cada nivel —178 KB en la prueba— y quedaba vivo para siempre, uno por nivel. Un
proyecto con veinte niveles se comía varios megas en copias que sólo servían
para responder «¿cambió algo?». Ahora se guarda una huella corta.

## Pruebas

- `check_colab_ui.js` cuenta el trabajo real, no el tiempo —que en CI es
  ruidoso—: tras 60 cambios de cuadro exige **0 repintados** de comentarios y
  como mucho 5 mensajes de presencia. Se comprobó que el guard **falla** con el
  código viejo: reporta 60 y 60.
- 5 contratos estáticos nuevos: que el panel siga siendo acoplable, que figure
  en el catálogo, que no vuelva a ser un flotante con z-index, y que no se
  caigan ni el límite de presencia ni la condición del repintado.
- Batería completa: 10 suites de modelo, 4 comprobaciones Python y 14
  recorridos E2E, en verde.

## Reversión

Estable previa: `v4.13.1`. Nada de esto toca el documento ni el protocolo del
relé: un LOW 4.13.1 y uno 4.13.2 trabajan juntos sin problema.
