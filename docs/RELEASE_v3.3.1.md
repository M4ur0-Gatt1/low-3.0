# LOW 3.3.1 — el papel cebolla vuelve a andar en las escenas abiertas

## Arreglado: el papel cebolla no andaba al abrir una escena

Al abrir una escena guardada, desde **Recientes**, **Abrir** o al volver a una que ya existía, el papel cebolla no funcionaba en absoluto:

- no se veían los fantasmas anteriores ni los posteriores;
- los puntitos de **Referencias** sobre la línea de tiempo (los fijos, estilo OpenToonz) no traían nada;
- los faders del panel no tenían efecto.

Eran tres defectos que se sumaban:

1. **Quedaba apagado.** Cerrar un documento o cambiar de solapa apaga el papel cebolla, y solo se volvía a prender al **crear** una escena nueva. Ahora toda escena que se abre arranca con el papel cebolla prendido, igual que una nueva.
2. **El papel cebolla viejo borraba al nuevo.** Una rutina de antes del documento de escena seguía corriendo justo después de abrir: borraba todos los fantasmas y no pintaba ninguno. Ahora, con una escena abierta, le deja el trabajo al papel cebolla de la escena.
3. **El botón «Papel cebolla» de la barra** tenía su marca en «abierto» aunque el panel estuviera oculto, así que el primer clic no hacía nada visible. Ahora va según lo que se ve: un clic lo abre.

Probado en la app real abriendo desde Recientes y con clics reales:

- el botón de la línea de tiempo lo apaga y lo prende;
- el panel se abre con un clic;
- los faders suben y bajan cada fantasma;
- «+ acá» fija el cuadro actual;
- el punto de un cuadro en **Referencias** lo fija y lo suelta;
- «Solo línea» sigue mostrando los trazos.

## Pruebas

- **`check_cebolla_al_abrir_ui.js`** (nueva) guarda una escena de tres dibujos, cierra el documento y la abre con `dzSceneOpen`, que es lo que usa Recientes. Después, con el mouse real, verifica que:
  - los fantasmas se ven apenas se abre;
  - el botón de la línea de tiempo apaga y prende;
  - el panel se abre con un clic;
  - el fader −2 saca el dibujo de dos atrás;
  - el punto de F1 en Referencias lo fija y lo suelta;
  - «+ acá» fija el cuadro actual.

  Contra 3.3.0 falla en lo primero: «al abrir una escena el papel cebolla queda apagado».
