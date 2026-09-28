# LOW v4.49.0 — dibujar sobre el esqueleto, y el tiempo siempre a mano

Dos cosas: una regresión propia que impedía uno de los dos flujos del rig, y
la línea de tiempo colgada de todas las vistas.

---

## 1. Dibujar sobre el esqueleto (regresión de la v4.45.1)

Reportado: «no me deja dibujar sobre el esqueleto; tienen que andar los dos
flujos» — tanto poner el esqueleto sobre un dibujo hecho, como dibujar con el
esqueleto ya puesto.

**MEDIDO antes:**

| | |
|---|---|
| con el esqueleto puesto | 43 elementos dibujados en el overlay |
| al elegir el lápiz | **0** · `rigMode` apagado |
| el aviso decía | «Salí del esqueleto para usar «pencil»…» |
| dibujar | funcionaba |

O sea: dibujar andaba, pero **el esqueleto desaparecía**. Y dibujar *encima*
del esqueleto, usándolo de referencia, es justamente para lo que sirve.

La v4.45.1 había arreglado el defecto opuesto —«aparece como un pincel en
lugar de hacer lo que debería»: el gesto de mover una articulación pintaba— y
se pasó de largo: para que el pincel no peleara con los huesos, apagaba el rig
entero.

**Y la app ya tenía el caso resuelto.** `dzRigSetTool("draw")` pone el overlay
en `rig-pass-through` —el puntero lo atraviesa hasta la mesa— y anuncia «el
alambre queda visible como guía pero no captura la tableta». El envoltorio
interceptaba el `dzSetTool` interno de esa misma función y apagaba el rig, así
que **el mensaje prometía algo que ya no pasaba**. No hacía falta inventar
nada: hacía falta dejar de estorbar.

**Ahora**, con el esqueleto puesto y eligiendo el pincel: `rigMode` sigue
encendido, los 43 huesos siguen a la vista, el puntero pasa, se aplica **la
herramienta que elegiste** (no `pencil` a la fuerza) y el arrastre deja trazo.

Además se respeta `DZ.rigToolSync`, la bandera que el propio rig levanta
cuando le pide una herramienta a la mesa. Sin eso, elegir «Cortes» —que pide
la pinza— terminaba en modo Dibujar sin que nadie lo pidiera. app.js ya
respetaba esa bandera en otro lugar; acá faltaba.

## 2. La pestaña de la línea de tiempo

Pedido: «quiero poder minimizar la línea de tiempo, como pegarla en todas las
vistas como un dropdown».

**Qué había.** Plegar existía, pero el único modo era hacer DOBLE CLIC sobre
`#dzTlgResize`, un separador de 4 px cuya ayuda lo menciona al final de la
frase. Y la línea de tiempo aparecía o no según el espacio de trabajo: en
Dibujo, Limpieza o Color no estaba. El tiempo —lo único que se necesita en
todos los espacios— era lo que menos a mano estaba.

**Ahora** hay una tira de 24 px presente en los siete espacios. Un clic la
despliega, otro la pliega: medido, el cuerpo pasa de 176 px a 0 y la pestaña
queda para volver.

Tres decisiones, las tres a partir de defectos que ya costaron caro acá:

- **No es un botón muerto.** Con la animación apagada —lo normal en Dibujo—
  la pestaña la **enciende** y se despliega.
- **No miente.** Plegada muestra el cuadro actual y el total; si no hay
  cuadros dice «sin cuadros» y si está apagada, «apagada». Nunca un «0 / 0»
  que parece un dato y no lo es.
- **Sobrevive al cambio de espacio.** Cambiar de espacio redibuja los
  paneles; sin volver a aplicar, la pestaña diría «plegada» con la línea de
  tiempo desplegada.

El estado se recuerda entre sesiones.

---

## Guardias

- `tools/check_rig_herramienta_ui.js` — **reescrito**. El de la v4.45.1
  exigía justo lo contrario (que el pincel saliera del rig), así que se
  cambió para que cuide lo correcto, no para que pase. Ahora verifica seis
  cosas: que los huesos dejen de capturar el gesto, que **sigan visibles**,
  que se aplique la herramienta elegida y no otra, que el arrastre deje un
  trazo, que flecha/mano/pivote no cambien el modo, y que «Cortes» no se
  convierta solo en «Dibujar».
- `tools/check_tl_pestania_ui.js` — nuevo. Cinco cosas: la pestaña en los
  siete espacios, plegar y desplegar de verdad, que no sea un botón muerto,
  que diga algo cierto, y que lo que dice **coincida con lo que se ve**
  después de cambiar de espacio.

Ambos probados al revés; entre los dos se detectan cinco mutaciones.

Puerta local: **65 de 65**. `app.js` sin tocar, en el techo (17.075 líneas).

## Dos cosas que quedan abiertas

1. **`check_export_anim_ui` es intermitente**: falla ~1 de cada 3 corridas
   completas y nunca en aislamiento (4 de 4 verdes). Revienta en la
   recuperación de documento de `dzDocInit`, que lee `localStorage` — o sea,
   donde un recorrido puede dejarle estado al siguiente. Si aparece rojo en
   el CI, repetir la corrida antes de culpar al cambio que se estaba
   haciendo.
2. **El dibujo que desaparece al colocar el esqueleto** se reportó y no se
   pudo reproducir, ni contando los píxeles oscuros del lienzo antes y
   después (18.261 → 18.235).
