# LOW 3.21.0 — Lipsync desde el texto

Pedido de Mauro: escribir un diálogo y que LOW arme la animación de la boca del personaje en la línea de tiempo, con su biblioteca de bocas, editable y reproducible.

## Cómo se usa

En el panel del esqueleto, sección **Lipsync → Desde el texto**:

1. **Elegí la pieza de la boca** del personaje. Es la misma que usa el lipsync por volumen; sus dibujos son las bocas.
2. **Escribí o pegá el diálogo.**
3. Ajustá el **inicio** (con «aquí», el cuadro actual) y la **velocidad** de lectura (50–200 %).
4. Mirá la **vista previa**: los visemas con sus cuadros, la duración y cuántos cambios de boca hay. Avisa si el diálogo pasa el final de la escena.
5. **Crear las claves**: van a la pista *Sustituciones* de la línea de tiempo y a la X-sheet, como cualquier clave de boca.
6. **▶** reproduce desde el inicio del diálogo. Se corrige a mano en la X-sheet, o se vuelve a generar desde la lista de diálogos guardados.

**Bocas de cada visema:** LOW asigna los dibujos solo.

- Si se llaman como el visema («O», «M_B_P», «S_Z», «Reposo»…), por su nombre.
- Si no, por su orden de cerrada a abierta, la misma convención del lipsync por volumen.
- Cada visema se puede cambiar a mano, y queda guardado con el personaje.

## Visemas

Son los siete pedidos y uno más, **`V7_M_B_P`**:

- **`V7_M_B_P` (labios cerrados):** una boca que no cierra en M, B y P es el error de lipsync que más se nota. En español la **V suena como B**: va acá, no a `V4_F_V`.
- **`V4_F_V`:** queda para la F.
- **Las velares (K, G, J) y la H** no tienen posición de labios propia: toman la boca de la vocal que sigue (coarticulación), en vez de sumar visemas.
- **Si un personaje no tiene dibujo para un visema,** usa el más parecido: F → M_B_P, U → O, S → L_N…

## Fonética: reglas propias para el español

Se evaluaron **eSpeak NG** y las bibliotecas G2P de Python (phonemizer, epitran). Piden un binario nativo por sistema, o un WASM de varios MB, y pasar por el puente de Python en cada vista previa.

La ortografía del español es casi fonémica, así que el módulo usa reglas propias, sin dependencias. Corre al instante en el editor, sin red, y se prueba en node. Cubre:

- **dígrafos:** CH, LL, RR, QU, GU, GÜ;
- **letras que cambian según el contexto:**
  - C y G delante de E/I;
  - R inicial o después de N, L o S;
  - X: KS; S al principio; J en México;
  - Y: vocal al final de palabra y sola;
  - H muda;
  - seseo;
- **tildes y acento:** la sílaba tónica, por la tilde o por las reglas de aguda y llana;
- **diptongos;**
- **números:** se dicen con palabras;
- **puntuación:** coma, punto y coma, dos puntos, punto, ¿? ¡!, puntos suspensivos, guiones y saltos de línea, cada uno con su pausa.

Otros idiomas se registran en la misma tabla (`g2p`).

## Tiempo

- Cada sonido dura según su tipo: la vocal tónica más que la átona, y así con la nasal, la oclusiva y la vibrante simple. Las pausas dependen de la puntuación.
- Todo se escala por la velocidad elegida.
- Se pasa a cuadros con los **FPS de la reproducción**, acumulando el tiempo para que no haya deriva.
- Se juntan los visemas iguales seguidos. Lo que dura menos que el sostén mínimo (2 cuadros a 24 fps) se absorbe, **salvo el cierre de labios**.
- La boca termina en reposo.
- Es una **estimación**: todavía no se analiza la voz. Se ajusta con el inicio y la velocidad.

## Integración

No es un sistema paralelo. Usa lo que LOW ya tenía:

- las claves de sustitución del slot de la boca (`rig.switches`);
- `LowDoc.applyLipsync` y `clearRigSwitchRange`;
- el historial y la X-sheet;
- la reproducción (`rigSwitchAt`).

Los diálogos y el mapa de visemas se guardan en el slot de la boca (`rig.slots[…].lipsyncTexto`), dentro del `.low`.

- **Un paso de Ctrl+Z** por diálogo.
- **No duplica claves:** sólo escribe los cambios de boca, y no repite la boca que ya estaba antes del inicio.
- **Conserva la animación existente:** sólo toca el tramo de ese diálogo.
- **Regenerar un diálogo** primero borra sus claves anteriores; aunque se haya movido el inicio, no deja restos.
- **Respeta el final de la escena** y lo avisa.

## Pruebas

- **`run_lipsync_texto_tests.js`** (nueva): 56 pruebas del módulo puro. Cubren:
  - fonética: dígrafos, C/G/R/X/Y/H, U muda, tildes, acento, diptongos, números y pausas;
  - visemas;
  - duraciones que varían;
  - el mismo diálogo a 12, 24 y 30 fps dura lo mismo en segundos;
  - inicio, velocidad, sostén mínimo y sin solapes;
  - mapa por nombre, por orden, elegido y parecido;
  - claves sólo de los cambios;
  - límite de la escena;
  - texto sin palabras.
- **`check_lipsync_texto_ui.js`** (nueva) usa el teclado y el ratón de verdad, con una escena de 120 cuadros, una boca de ocho dibujos y una clave a mano en F100. Recorre:
  1. el mapa automático por nombre;
  2. la vista previa;
  3. las claves desde F10, sin dos iguales seguidas, con la M cerrando, la clave de F100 intacta y un solo paso de historial; la reproducción ve la boca correcta;
  4. regenerar desde F30 sin restos;
  5. Ctrl+Z y Ctrl+Y;
  6. el guardado y la reapertura de la escena;
  7. a 12 fps, la mitad de cuadros;
  8. el final de la escena;
  9. un visema asignado a mano;
  10. un segundo personaje con tres bocas.

  Encontró y se arreglaron, antes de publicar:
  - al regenerar, la boca vieja del mismo diálogo tapaba la primera clave nueva;
  - después de Ctrl+Z y Ctrl+Y, regenerar duplicaba el diálogo y dejaba claves de más.
- El lipsync por volumen sigue igual: 23/23 y su recorrido en el editor.
