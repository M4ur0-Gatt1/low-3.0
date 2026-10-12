# LOW 3.22.0 — El lipsync desde el texto se sincroniza con el audio real

Pedido de Mauro: «sumá la sincronización con el audio real».

## Cómo se usa

En **Lipsync → Desde el texto**, con el audio de la toma cargado (Animación → Cargar audio):

1. Tildá **Sincronizar con el audio de la toma**.
2. Escribí el diálogo. **Inicio** y **Hasta** marcan qué parte del audio mirar; por omisión, todo, respetando el corrimiento de la pista.
3. La vista previa dice **dónde encontró la voz**, por ejemplo: «Sincronizado con «voz.wav» · la voz va de F30 a F78».
4. **Crear las claves**: igual que antes, pero cada boca cae **cuando suena** en la grabación, no en una estimación.

El diálogo queda guardado como sincronizado. El `.low` guarda la onda del audio, no el sonido: al reabrir una escena hay que volver a cargar el audio para sincronizar, y el tilde lo avisa.

## Cómo funciona

Es una **alineación forzada**. El texto ya dice qué sonidos hay y en qué orden, así que no hace falta reconocer el habla: sólo ubicar cada sonido en la grabación (`ui/animation/lipsync-audio.js`, en JS y sin dependencias):

- **Rasgos cada 10 ms:** la energía, entre el piso de ruido y el pico de la toma, y los agudos. Los agudos son altos en una S o una F y bajos en una vocal o una M.
- **Cada clase de sonido tiene un aspecto esperado:**
  - la vocal es fuerte y grave;
  - la S, media y aguda;
  - la M, suave;
  - la P, un silencio con un golpe;
  - la pausa, silencio.
- **Viterbi segmental:** cada sonido ocupa un tramo, con un costo por apartarse de la duración esperada (la del texto, escalada al largo real de la voz).
  - Las pausas de la puntuación son opcionales y se estiran barato.
  - Un silencio largo entre palabras es posible (el actor frena donde quiere), pero cuesta: si hay una coma cerca, el silencio va a la coma.
  - Se busca cerca de donde lo pone la estimación (banda de ±2 s o el 8 % de la toma).
- **Con la voz real, un silencio de más de 120 ms entre palabras cierra la boca.**

Se evaluó **Rhubarb Lip Sync** (MIT, hecho para esto). Pide un binario de unos 30 MB por sistema, llamarlo por el puente de Python, y su reconocedor es inglés. Acá no hace falta reconocer nada: el texto ya está.

## Medido con voz real

Con la voz española de Windows (Microsoft Helena), cuyo sintetizador informa el momento exacto de cada visema, se midió qué parte del tiempo la boca de LOW es la verdadera. No cuentan los sonidos sin posición de labios propia (K, G, H) ni ±40 ms alrededor de cada cambio.

| Caso | Sólo texto (3.21) | Sincronizado (3.22) |
|---|---|---|
| 4 frases de prueba | 49 % | **88 %** |
| Habla lenta | 64 % | **84 %** |
| Habla rápida | 37 % | **98 %** |
| Pausa donde el texto no tiene puntuación | 44 % | **92 %** |
| Con ruido de fondo a 20 dB | 51 % | **92 %** |
| Con ruido de fondo a 10 dB | 51 % | **90 %** |
| Toma larga de 68 s | — | **92 %**, en 2,2 s |

En el camino aparecieron y se arreglaron cuatro cosas:

- **Una vocal se tragaba palabras enteras.** Con un estado por sonido, una vocal podía quedarse medio segundo barato. Se pasó a un modelo con duraciones.
- **La pausa de una coma se la quedaba el espacio entre dos palabras.**
- **En una pausa sin puntuación la boca quedaba abierta.**
- **Una toma de 68 s tardaba 12 s.** Ahora tarda 2,2 s: se busca dentro de una banda y se guarda sólo lo que se usa.

## Pruebas

- **`run_lipsync_audio_tests.js`** (nueva): 22 pruebas con una voz sintética de verdad conocida (`tools/voz_sintetica.js`). Las grabaciones de Helena no se incluyen, porque su licencia de redistribución no está clara. Comprueban:
  - hablantes lentos, rápidos y con pausas largas, siempre mejor que la estimación y ≥ 75 %;
  - la primera boca donde empieza la voz, a ±2 cuadros;
  - una pausa sin puntuación que deja la boca en reposo;
  - los cierres de labios a ±2 cuadros de los verdaderos;
  - inicio, FPS y ventana del audio;
  - que sin voz o sin palabras no hace nada;
  - que una toma de unos 40 s tarda menos de 3 s.

  Con la estimación por texto en lugar de la alineación fallan 15 de las 22: miden sincronización de verdad.
- **`check_lipsync_audio_ui.js`** (nueva) carga en el editor la voz sintética como audio de la escena: un AudioBuffer de verdad, corrido 10 cuadros. Comprueba:
  - el tilde y el nombre de la pista;
  - la vista previa con la voz desde el cuadro exacto;
  - las claves: 100 % con la boca verdadera, contra 76 % de la estimación;
  - el diálogo guardado como sincronizado;
  - una ventana sin voz;
  - el caso sin el sonido, como al reabrir.

  Falla sin el módulo nuevo.
- Siguen igual el lipsync por volumen (23/23) y el desde el texto (56/56 y su recorrido en el editor).
