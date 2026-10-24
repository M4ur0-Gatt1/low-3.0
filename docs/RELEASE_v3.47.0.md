# LOW 3.47.0 · Claude funciona en LOW, y el timing que grabás es el que hiciste

## Claude (la API de Anthropic) en LOW

Con cualquier Claude actual (Opus 5.5, Sonnet 5.5, Fable), LOW mostraba «Este modelo no acepta herramientas» y después `400 Client Error: Bad Request`. La causa:

- **LOW mandaba `temperature: 0.7`.** Los Claude desde la versión 4.7 sólo aceptan el valor de fábrica, y desde la versión de API del 21 de octubre de 2026 ningún modelo lo acepta. Cada pedido daba 400. LOW suponía que el problema eran las herramientas, reintentaba sin ellas y volvía a dar 400.

Lo que cambia:

- **El proveedor de Claude usa el SDK oficial de Anthropic** y ya no manda `temperature`.
- **Los modelos actuales piensan siempre**, y sus bloques de pensamiento vuelven intactos en cada vuelta de herramientas, como ya se hacía con el razonamiento de DeepSeek.
- **LOW agrega avisos y cambia el historial**, y eso daría 400 en las cuentas nuevas. En los modelos con pensamiento preservado (Opus 5.5, Sonnet 5.5, Fable 5.1), la API descarta el bloque que ya no vale (`drop_block`) en lugar de fallar.
- **`max_tokens` deja lugar para pensar**: 16000 como mínimo en los modelos que piensan, porque si no las respuestas se cortaban.
- **Los errores muestran el motivo que da la API.** Ante un 400, LOW ya no afirma que «el modelo no acepta herramientas» salvo que el error hable de herramientas.
- **Si Claude rechaza un pedido por seguridad, se dice**, en lugar de volver una respuesta vacía.
- **Al cambiar de proveedor a mitad de una conversación**, los campos internos de LOW ya no salen hacia las APIs compatibles con OpenAI, que los rechazan.
- **El modelo de Claude por defecto pasa a ser `claude-opus-5-5`**, y LOW calcula el costo con los precios de los Claude actuales.

## El timing que grabás es el que hiciste

Tres herramientas medían el tiempo con la hora en que LOW **atendía** cada evento, no con la del gesto. Con LOW ocupado, se grababa otra cosa:

- **El ritmo tocado con Espacio** («Interpretar el ritmo»): golpes parejos quedaban grabados como `[1,1,1,14,1,1,1]`.
- **La grabación de actuación** («⏹ armada»): un gesto parejo quedaba con un salto de 605 ms. Aun sin carga, las muestras salían cada 5 a 17 ms aunque el gesto iba cada 50, o sea que la actuación grababa a otra velocidad.
- **La marioneta de huesos (🎥)**: la misma causa.

Ahora se usa la hora del evento (`event.timeStamp`).

## Pruebas

- `tools/check_anthropic_provider.py` (nueva, sin red: un servidor local que imita la API).
- `tools/check_grabacion_gesto_ui.js` (nueva).
- `check_tomas_ui` reproduce siempre el ritmo con LOW ocupado.
- `check_provider_contracts` actualizada al SDK.
