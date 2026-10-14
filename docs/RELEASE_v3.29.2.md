# LOW 3.29.2 — El play vuelve a andar, video para WhatsApp y Tomas 3D

Pedidos de Mauro:
- «la versión anterior rompió por completo el play: el lugar de reproducir acumula dibujos»;
- «el gif que exporta … con WhatsApp y Windows» se veía quieto;
- las Tomas 3D que estaban sin terminar en la carpeta principal.

## El play ya no acumula dibujos

En la 3.29.1, la reproducción fluida pintaba cada cuadro encima del anterior sin borrarlo. En una escena real el papel está en el primer dibujo y los dibujos que se crean después son transparentes. Por eso los cuadros se apilaban, y por los huecos se veía la hoja vieja de abajo. Las pruebas no lo vieron porque usaban papel opaco en todos los cuadros.

Ahora, antes de cada cuadro se borra el lienzo y se pone el color de la hoja. Lo comprobé en la app real con la escena de Mauro: se ve un solo dibujo por cuadro.

Se mantiene lo de la 3.29.1: el play no se corta y dibujar no se pone lento.

## Exportar «Para WhatsApp»

El GIF que exporta LOW está bien (cuadros distintos, en bucle). Lo que pasa es que:
- el visor clásico de Windows muestra sólo el primer cuadro;
- WhatsApp convierte los GIF por su cuenta, o los manda como foto fija si pesan.

El botón nuevo «Para WhatsApp», al lado de «Video MP4», saca un MP4 que:
- repite la animación hasta unos 6 segundos, sin pasar de 15 (una animación larga no se repite);
- mide como mucho 720 px de lado y no agranda los dibujos chicos;
- sale en H.264 Main, en `yuv420p` y sin audio;
- tiene el índice al principio, así se reproduce mientras se descarga.

El MP4 común también lleva ahora el índice al principio.

## Tomas 3D

Es el trabajo que estaba en la carpeta principal, ahora unido. En el estudio 3D, una toma es la cámara animada que saca los fondos para el 2D:
- tiene claves de cámara por cuadro;
- entre clave y clave, la cámara pasa por una curva suave.

Al guardar un `.low`, los fondos de las tomas salen como JPG o PNG a la carpeta `<nombre>.fondos/`, al lado del archivo. Al abrir, vuelven a entrar.

## Pruebas

- **`check_reproduccion_fluida_ui.js`**:
  - usa papel sólo en el primer dibujo, como una escena real;
  - muestra el cuadro 30 y después el 10, y exige que no quede la marca del 30 y que la imagen sea opaca.

  Falla con la 3.29.1.
- **`check_export_anim_backend.py`**, con el ffmpeg real, mide del MP4 para WhatsApp:
  - la duración (6,00 s);
  - el perfil (H.264 Main, yuv420p, sin audio);
  - el tamaño (720 px);
  - que el índice vaya antes de los datos.

  Falla sin faststart y si agranda un cuadro chico.
- **`check_export_anim_ui.js`** aprieta el botón real «Para WhatsApp».
- **`check_fondos_archivo_backend.py`** y **`check_toma_3d_ui.js`** cubren las Tomas 3D.
- Puerta completa. Hubo 4 pruebas que fallaron una vez con la máquina cargada (rescate de escena, pincel vivo, mesa de animación y pincel suave). Corridas solas pasaron tres veces seguidas.
