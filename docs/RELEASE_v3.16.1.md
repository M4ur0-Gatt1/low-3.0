# LOW 3.16.1 — La interpolación de movimiento y el pose a pose vuelven a andar

Reporte de Mauro: «no me acuerdo cómo se usa el flujo de interpolación de movimiento, o no anda… el de los fotogramas clave».

No andaba. Seguí los dos flujos con el ratón y las teclas, y los dos estaban rotos en un `.low`.

## Interpolación de movimiento (🏃)

Cómo se usa:

1. Elegí el objeto con la flecha (V).
2. Tocá 🏃 en la línea de tiempo: fija el **inicio**.
3. Arrastrá el objeto a donde termina.
4. Tocá 🏃 otra vez, elegí cuántos cuadros y la curva, y apretá «Generar».

**Lo que fallaba:** los cuadros se generaban, pero el objeto **desaparecía** de todos. La cuenta entre el inicio y el final daba un número inválido (NaN), porque la lectura de la posición había cambiado de formato y esa resta no se había actualizado. Ahora el objeto viaja del inicio al final con la curva elegida.

## Pose a pose con fotogramas clave

Cómo se usa:

1. Dibujá la primera pose y marcala como clave con **Alt+K**.
2. **Alt+D** duplica el cuadro al final, y quedás parado en la copia.
3. Mové o redibujá la segunda pose, y marcala con **Alt+K**.
4. Volvé a la primera con **«,»**.
5. **Alt+T** abre «Intercalar»: elegí cuántos intermedios y la curva.

**Lo que fallaba (dos cosas):**

- **Alt+D creaba el cuadro nuevo vacío.** Sólo se veía el fantasma de papel cebolla del anterior: no había nada que elegir ni mover para hacer la segunda pose. Ahora el cuadro nuevo nace con una copia del anterior, como dice el botón: «dibujar sobre la copia».
- **Los intermedios quedaban en la primera pose.** Mover con la flecha deja el desplazamiento guardado aparte, y la pose anterior no lo tiene. El intercalado sólo mezclaba lo que estaba en las dos poses, así que ignoraba el movimiento. Ahora lo intercala, separando posición, giro y escala: a mitad de un giro el objeto no se achica.

## Pruebas

- **`check_interpolacion_movimiento_ui.js`** (nueva) hace el flujo de 🏃 con el ratón de verdad. Comprueba que el círculo va de 0 a 800 en 7 cuadros, siempre hacia adelante y con la curva natural. Con la 3.16.0 falla: el círculo queda en NaN en todos los cuadros.
- **`check_intercalar_claves_ui.js`** (nueva) hace el pose a pose con las teclas: Alt+K, Alt+D, arrastrar, Alt+K, «,», Alt+T con 3 intermedios. Comprueba:
  - que el cuadro 2 nace con la copia y se la puede elegir;
  - que los intermedios van de una pose a la otra;
  - que un giro a mitad de camino conserva el tamaño.

  Con la 3.16.0 falla: Alt+D creaba el cuadro vacío.
