# LOW 3.36.1 — El botón de la lapicera abre el pincel (de verdad)

Reporte de Mauro: «la corrección del clic derecho no anda… si hago clic derecho con la lapicera no hace nada». Después: «el que tiene asignada la B sí anda… asignale una letra mejor… pero explicalo en algún lado para que los usuarios lo puedan aplicar».

## Lo que se midió

Para saber qué pasaba, se puso un registrador de eventos en la app real y Mauro probó con su lapicera, una **Huion Inspiroy H1060P** con Windows Ink.

- **El botón con «botón derecho del ratón»** nunca llega como botón: todos los eventos son de un toque normal.
- **Con la punta en el aire,** ese botón no manda nada.
- **Lo único que llega** es un clic derecho que Windows arma al **levantar** la punta, después de apoyarla quieta unos 700 ms, y no siempre.
- **La 3.36.0 descartaba ese clic,** porque lo tomaba por la pulsación larga mientras se dibuja.
- **El botón con una tecla asignada (la B)** llega siempre.

## Lo que cambió

- **Shift+B abre las opciones del pincel** donde está la lapicera o, si no la detecta, donde está el cursor. Otra vez Shift+B lo cierra. Es la forma recomendada: se le asigna Shift+B a un botón de la lapicera en el programa de la tableta.
- **Ayuda → «Configurar el botón de la lapicera…»** explica los pasos para Huion, Wacom y XP-Pen. Tiene una **prueba en vivo**: apretás el botón y dice qué llegó («¡Anda! El botón manda Shift+B» o «Llegó «K»…»). El panel del pincel lo recuerda al pie: «Atajo: Shift+B · Ponérselo al botón de la lapicera…». También está en `docs/LAPICERA_BOTONES.md`.
- **«Botón derecho del ratón» también funciona.** Un toque con la punta **quieta** (menos de 10 px) seguido del clic derecho de Windows abre el panel y borra el puntito que haya dejado el toque. Además se reconoce el botón cuando llega como bit en `buttons` o como movimiento con el botón apretado (otros controladores). La pulsación larga mientras se dibuja sigue descartándose, porque la punta se mueve.

## Pruebas

- **`check_pincel_rapido_ui.js`** suma estos casos:
  - el de la lapicera de Mauro (punta quieta unos 700 ms y el clic derecho al levantar: abre el panel sin dejar punto);
  - botón + toque corto;
  - botón con la punta apoyada (`buttons` 3);
  - botón en el aire;
  - un trazo de verdad seguido de pulsación larga, que no abre nada;
  - Shift+B abre y cierra;
  - la ayuda y su prueba en vivo.

  En la 3.36.0 falla igual que en la lapicera de Mauro: ni panel ni menú.
- **`check_atajos_ui.js`:** 70 teclas, Shift+B incluida.
