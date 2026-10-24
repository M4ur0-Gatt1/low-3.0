# LOW 3.48.0 · Ves al agente trabajar en vivo, también con Claude

## Claude responde en vivo

Claude era el único proveedor que no hacía streaming: no se veía nada hasta que terminaba cada vuelta, y parecía que no respondía («no veo tu respuesta»).

- **`AnthropicProvider.chat_stream`** usa el streaming del SDK oficial. El texto y el pensamiento llegan a la UI a medida que se generan, con los mismos eventos que DeepSeek y los demás proveedores compatibles con OpenAI.
- Al terminar, la respuesta trae los mismos bloques (el pensamiento con su firma) y las mismas llamadas a herramientas que la llamada normal, así que la vuelta de herramientas no cambia.
- Si apretás detener, se cierra la conexión.
- Los errores siguen mostrando el motivo que da la API.

## Feed «En vivo» del agente (estilo Devin)

En el panel de trabajo del agente:

- **Cada archivo que escribe o edita aparece como un diff** coloreado (+ agregado, − quitado), con un botón «Abrir».
- **Cada comando y cada git aparecen con su salida y su exit code.** Los que fallan se marcan en rojo.
- La tarjeta más nueva queda abierta y las anteriores se colapsan; se pueden volver a abrir con un clic.
- Se puede filtrar por Todo, Código o Terminal.
- Los tamaños están acotados (400 líneas de diff y 6000 caracteres de salida, conservando el final, que es donde están los errores), así un archivo enorme no congela la ventana.
- El diff y la salida se arman en `code_runner/live_feed.py`. Si el feed falla, la herramienta que lo originó funciona igual.

## El chat no se pierde

- **El panel de trabajo ya no aplasta al chat**: ocupa como máximo el 45% de la columna y scrollea; el chat conserva una altura mínima.
- **Autoscroll inteligente** (`ui/ai/chat-scroll.js`): si estás abajo, el chat te sigue. Si subiste a leer, no te arrastra y aparece «↓ Nuevos mensajes». Tu propio mensaje siempre baja.

## Pruebas

- `tools/run_live_feed_tests.py` (nueva): diff, archivo nuevo, sin cambios, recortes y terminal.
- `tools/check_anthropic_provider.py`: streaming por partes y error de streaming (8/8).
- `tools/check_provider_workbench_ui.js`: feed en vivo, filtros, chat visible con el feed lleno y autoscroll.
- `app.js` queda justo en su techo: el autoscroll vive en un módulo aparte.
