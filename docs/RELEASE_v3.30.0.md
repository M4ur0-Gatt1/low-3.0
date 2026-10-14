# LOW 3.30.0 — Los fondos se arman en el 3D, y la perspectiva funciona

Pedidos de Mauro:
- «el sistema de perspectivas con punto de fuga no funciona: el trazo no sigue la fuga y es confuso de usar»;
- «el grueso de los fondos, espacios, layouts, perspectivas y paisajes la idea es hacerlos en el módulo 3D, que tiene que ser el mejor y más desarrollado para eso»;
- «esa vista de calle es de lo más inútil y tiene mucho ruido».

## Estudio 3D: el lugar para armar fondos

Vuelve a la forma de Feather: primero armás las superficies y después dibujás encima. La cámara en perspectiva hace fugar todo sola.

- **Se fueron los esquemas de líneas** (Calle, Manzana, Habitación, Sólo líneas) y los abanicos de rayos. Eran ruido que tapaba la vista y no servía para apoyar nada.
- **Panel «Cámara»** (antes «Perspectiva»):
  - el marco del cuadro del 2D;
  - la altura de los ojos, que es el horizonte;
  - los encuadres de frente (1 punto), en esquina (2 puntos), desde arriba y desde abajo (3 puntos);
  - el giro, la inclinación y el lente.

  Elegir un encuadre ya no hace saltar la cámara a otro lugar.
- **El piso sirve para dibujar** en Perspectiva. Antes, arrastrar sobre la cuadrícula no hacía nada. Si no hay dónde apoyar el trazo (mirando al cielo, o con el piso muy de canto), ahora se avisa en pantalla.
- **Cajas (tecla X)** para edificios y habitaciones:
  - se arrastra la base sobre el piso (o sobre la tapa de otra caja), se mueve el mouse para la altura y se confirma con un clic; Esc cancela;
  - se dibuja sobre sus caras en cualquier vista, y la línea sigue derecha al cruzar una arista;
  - con la cámara adentro se dibujan las paredes de una habitación;
  - se eligen con Mover y se cambian de tamaño con el control de escalar.

  Son andamio: no salen al 2D, salvo con la casilla «Con las cajas (gris)».
- **Rectas a los ejes:** una línea casi recta, al soltarla, se acomoda exacta sobre la arista o el eje de su superficie, y por eso fuga sola al punto de fuga. Las curvas no se tocan, y con Shift tampoco se corrige. Se apaga con el botón de la barra del pincel.
- **Toma:** «Mandar este encuadre al 2D» y «Con las cajas» quedaron arriba de todo. «Repetir hacia la fuga» se mudó a Escena.

### Arreglos del 3D
- Un trazo que empezaba en la punta de otro se despegaba del piso hasta 1 m. Ahora cada trazo guarda el plano sobre el que se dibujó.
- En la vista Arriba la planta quedaba flotando 60 cm sobre el piso.
- Al reabrir el estudio:
  - se repetían los ids de los trazos, y Ctrl+Z podía llevarse el que no era;
  - las figuras rellenas volvían sin relleno.
- Un clic de goma que erraba la línea por un píxel borraba la caja entera.
- Un trazo que se veía a través de una caja no se podía elegir.
- Una guía movida seguía apoyando en su lugar viejo, también al reabrir el proyecto.
- Alt y Shift podían sacar una recta del plano en que se dibujaba.

## La regla de perspectiva del 2D (para cosas chicas)

- La **Línea** y las **figuras** siguen la fuga. Antes sólo lo hacían el lápiz y el pincel.
- Rectángulo, Elipse, Círculo, Polígono y Estrella se dibujan sobre un plano de la perspectiva, como en Clip Studio.
- Los puntos de fuga que quedan fuera de la hoja tienen su **agarradera**, y los que quedan fuera de la mesa, una **flecha en el borde**.
- Cada punto tiene un **interruptor** para apagar su imán, y **Tab**, en medio del trazo, cambia de fuga.
- **«Fuga con 2 líneas»:** dos rectas dibujadas sobre una foto o un fondo crean el punto donde se cruzan.
- La barra no tapa la altura de los ojos y se achica cuando la mesa es baja.

## Verificado

- Pruebas nuevas, con el mouse real:
  - `check_perspectiva_herramientas_ui`
  - `check_3d_proyecto_ui`
  - `check_3d_cajas_ui`
  - `check_3d_rectas_fuga_ui`
  - `check_3d_cierre_ui`

  Se reescribieron las del 3D que esperaban los esquemas. Cada arreglo se comprobó haciendo fallar su prueba con el arreglo apagado.
- Recorrido completo en la app real (WebView2):
  1. caja en el piso;
  2. dibujo en la fachada;
  3. encuadre en esquina;
  4. mandar al 2D;
  5. el lápiz del 2D sigue exacto la fuga X (0°);
  6. guardar, cerrar y reabrir: vuelven el layout, la perspectiva y el trazo.
- Puerta completa en verde (193 comandos).
