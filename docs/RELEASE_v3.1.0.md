# LOW 3.1.0 — el tiempo como instrumento

La pregunta era qué justifica LOW frente a Harmony, TVPaint, Moho, Blender o
Procreate Dreams. Se investigaron tres cosas:

- qué les duele de verdad a los animadores (foros oficiales, la encuesta de la
  Animation Guild, Cartoon Brew);
- qué hay de moderno en herramientas vecinas (música, juegos, diseño);
- qué sacaron los otros programas entre 2023 y 2026.

La conclusión principal: la producción musical trata el ritmo como algo que se
**toca, se captura y se reutiliza**, y ningún programa 2D hace eso en la hoja
de exposición. No lo encontramos; eso no prueba que no exista. Esta versión es
el primer paso, y **no usa IA generativa**.

---

## 1. Interpretar: tomas retroactivas y comping

*Interpretar* es el laboratorio de ritmo. Se abre desde la pantalla inicial o
desde el ícono de barras, arriba a la derecha.

- **No hay que grabar.** Reproducís la comparación A/B y marcás el ritmo con
  **Espacio** cuando quieras, como si tocaras música. Cada pasada completa (un
  golpe por cambio de pose y otro al final) queda sola como **toma**. Es la
  misma idea que el «Capture MIDI» de un programa de música.
- **Una pasada cortada se descarta.** Si hacés una pausa de más de 2,5 s, esa
  pasada no se guarda y LOW te lo avisa.
- **Carriles y comping.** Cada toma se ve como un carril. Hacés clic en una pose
  de un carril y tu interpretación toma esa duración de esa pasada; así armás la
  versión final con lo mejor de cada intento. «Usar» pone la toma entera.
- **Las tomas no se pierden** si cerrás y volvés a abrir Interpretar, mientras
  la app siga abierta. Guarda hasta 8.
- **Aplicar a mi capa** sigue siendo un solo Deshacer, y se niega si la capa
  cambió mientras ensayabas.

## 2. Lo que ChatGPT dejó listo y entró acá

- **Inspector.** Alinear, distribuir y voltear se deshacen con un solo Ctrl+Z.
  Repetir una alineación que ya está hecha no suma otra entrada al historial.
- **Línea de tiempo tradigital.**
  - Botones nuevos: **Vacío** (un dibujo nuevo propio), **Duplicar** (una copia
    independiente en la celda) y **Reexponer**.
  - Los tiempos se aplican a una selección que abarque varias capas.
  - El rango **In/Out** se deshace, y arrastrarlo se cancela con Escape.
  - Cambiar los **FPS** también se deshace.
  - Si le das Play parado antes del In, arranca desde el In.

## 3. Arreglos de la interfaz

Los tres esconden cosas en pantalla, que es justo lo que se había reportado.

- **El botón de Interpretar tapaba al del 3D.** Tenía texto dentro de un botón
  de 28 px. Ahora es un ícono propio y su nombre aparece en el cartel de ayuda.
- **La barra de la línea de tiempo ocupaba dos renglones** y a 1366×768 dejaba
  **una sola capa visible**. Ahora es de un renglón. Los rótulos de cada grupo
  aparecen solo cuando la línea de tiempo tiene espacio de sobra.
- **Interpretar se cortaba a media pantalla** (1000×560): no se veían las poses
  ni el botón «Aplicar». Ahora entra entero, con carriles incluidos.

## Guardias

- `check_tomas_ui.js` usa teclas reales de Espacio y verifica:
  - dos pasadas dan dos carriles;
  - la pasada cortada no se guarda como toma;
  - el comping cambia solo la pose elegida;
  - «Usar» pone la toma entera;
  - las tomas siguen ahí al volver a abrir;
  - a media pantalla «Aplicar» sigue a la vista.

  Falla con la versión anterior de Interpretar.
- `run_rhythm_tests`: 16 pruebas de modelo, 8 de ellas nuevas (pasadas y
  comping).
- `check_rhythm_ui` exige que Interpretar entre a 1000×560.
- `check_tradigital_ui` y el inspector ampliado, de ChatGPT.

Puerta local: 29 suites y 79/79 recorridos.

## Lo que sigue en esta línea

Está en `docs/LOW_TIEMPO_INSTRUMENTO.md`:

- **groove**: usar el timing de un plano en otro, con intensidad;
- **cuantizar con fuerza**: acercar el ritmo a la grilla sin volverlo mecánico;
- **controladores MIDI y gamepad**;
- **guardar las tomas con la escena**.
