# LOW v4.25.0 — El instrumento de la prueba maestra

Se retoma la biblia, y se empieza por lo que la bloqueaba.

## Por qué esto y no otra cosa

De las seis faltas del balance quedaban dos, y una es **la prueba maestra de
§15**: una persona ajena al desarrollo haciendo un proyecto completo sin ayuda.
Es el único punto que puede mover la nota del producto, porque §13 dice que
**ningún área puede pasar de 8** mientras no exista la evidencia de validación
humana.

Pero §15 no pide sólo la corrida. Pide, con estas palabras:

> El proceso debe quedar grabado como prueba repetible y medirse en errores,
> tiempo, interrupciones y necesidad de ayuda.

**Ese instrumento no existía.** Sin él, una corrida deja una impresión —«anduvo
bien», «se trabó un par de veces»— y no un dato con el que comparar la corrida
siguiente. Así que la prueba no se podía correr *como la biblia la define*,
aunque hubiera una persona disponible.

Ahora está: **Ayuda → Prueba maestra §15…**

## Qué mide, y de dónde sale cada cosa

| | de dónde |
|---|---|
| **tiempo** por paso | del reloj, entre «empecé» y «terminé» |
| **errores** por paso | **contados solos**, enganchando los mismos eventos del informe de fallo, atribuidos al paso abierto |
| **necesidad de ayuda** | la marca la persona, con su nota: es lo único que sólo ella sabe |
| **interrupciones** | de la bitácora anterior: si quedó sin cerrar, se cayó o se lo mató |

Los doce pasos son **los de la biblia, palabra por palabra**, y hay un contrato
en CI que compara el módulo contra `LOW_BIBLIA_PRODUCCION.md`: si alguna vez se
separan, la puerta falla. Sin eso, el instrumento podría terminar midiendo otra
cosa que la que §15 pide.

## Lo que el instrumento NO hace, a propósito

**No deja marcar un paso terminado que nunca se empezó.** Ni por el botón —que
está apagado— ni por el modelo, que lo rechaza. El tiempo es la única medición
limpia que hay y un tiempo rellenado después la ensucia.

**No cuenta «con ayuda» como logrado.** Los distingue, y el veredicto exige los
**doce pasos sin ayuda**: once y uno con ayuda es NO aprobada. Si un paso con
ayuda sumara, el instrumento mentiría a favor del programa.

**No pregunta cuántos errores hubo.** Nadie lo recuerda. Se cuentan.

**No sugiere ni ayuda.** Es un cronómetro con libreta, no un tutorial: si guiara,
la prueba dejaría de medir lo que pretende medir.

## Lo que queda grabado

Dos archivos por corrida en `%APPDATA%\LOW\sesiones\`: el **JSON** con el
esqueleto estable de los doce pasos (id fijo `p01`…`p12`, tiempos, errores,
ayudas con su nota, versión y plataforma) para comparar, y el **`.md`** con la
misma tabla legible y el veredicto arriba.

El panel guarda mientras se avanza, así que una corrida interrumpida continúa
donde estaba al reabrir LOW — y anota la interrupción.

El protocolo completo, con las reglas incómodas y cómo se lee el resultado, está
en **`docs/LOW_PRUEBA_MAESTRA_15.md`**.

## `app.js` no creció ni una línea

La entrada de menú se atiende **interceptando el clic en fase de captura**,
porque la tabla de acciones de `dzMenuAction` es local a esa función y no se
puede extender desde afuera. Es la misma técnica del guardia del papel cebolla.
Hay un contrato que verifica que `"prueba15"` **no** aparezca en `app.js`.

Todo lo nuevo va en archivos propios: `ui/core/session-recorder.js`,
`ui/design/session-recorder.css` y el método `session_log` del puente.

## Pruebas

`tools/check_prueba15_ui.js`, en la puerta de CI. Comprueba que el instrumento
**mida**, no que se vea: que los errores se cuenten solos (0 → 2 con dos fallas
lanzadas), que un paso sin empezar no se pueda terminar ni por el modelo, que el
cronómetro dé un tiempo real, que «con ayuda» no sume al conteo sin ayuda, que
el veredicto no apruebe con tres pasos tocados, y que la bitácora se escriba con
los dos archivos, ids estables y sin el reloj interno de la sesión.

11 contratos estáticos nuevos, dos de ellos verificados a mano contra su
violación: cambiar el texto de un paso falla («el paso 7 de §15 no está en el
instrumento tal como lo pide la biblia»), y aflojar el veredicto también.

**Verificado en la app real** (WebView2), no sólo en el navegador: los dos
archivos quedan escritos en `%APPDATA%\LOW\sesiones\` con la versión, la
plataforma y los ids estables. Es la parte que el mock no puede probar, y es la
regla que quedó escrita ayer.

## Trabajo con Codex

Se retoma en paralelo, con reparto por el bus y **sin archivos compartidos**:

- **yo**: este instrumento (§15).
- **Codex**: el X-sheet incompleto de §6. La biblia dice literal «filas son
  fotogramas; columnas son niveles, cámara, audio y efectos», y hoy la hoja
  tiene sólo `#` más una columna por capa. Faltan **cámara, audio y efectos**.

Reservado suyo: `ui/animation/xsheet-view.js` y las reglas `.xs2-*` de
`ui/app.css` — que por eso no toqué, y por eso mi CSS va en archivo nuevo.

## Reversión

Estable previa: `v4.24.0`. Nada de esto toca el motor: son dos archivos nuevos,
un método del puente y tres líneas en `index.html`.
