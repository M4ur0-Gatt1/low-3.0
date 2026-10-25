
# LOW 3.49.0 · Un chat en el que se puede conversar

El chat se llenaba de texto sin formato, los errores se apilaban y si mandabas algo mientras LOW trabajaba se pisaban los turnos. Esta versión ordena la conversación.

## Respuestas legibles

- **Formato seguro** (`ui/ai/chat-flow.js`): código en bloques con botón «Copiar», listas, títulos, negrita y `código en línea`. El HTML que mande el modelo se muestra como texto y nunca se ejecuta.
- Mientras llega el streaming se ve texto plano, y al cerrar la respuesta se formatea de una vez, sin parpadeos.
- Cada respuesta tiene un botón para copiarla entera.

## Errores y cortes que no traban

- Si la llamada falla o la conexión se corta, aparece una fila con **Reintentar** (reenvía el mismo mensaje) y **Editar** (lo devuelve al cuadro).
- Una respuesta cortada se marca como «cortada» y conserva el texto que ya había llegado.
- Un fallo de red ya no suma un «Error interno» ni genera un informe de crash. Queda solo en `low.log` y el chat muestra un único aviso.

## Un turno por vez

- Si apretás Enter mientras LOW trabaja no se envía nada y tu texto queda en el cuadro (el estado dice que está trabajando).
- En el backend hay un candado por turno: un segundo envío vuelve `busy`, un error libera el candado y detener corta la lectura del stream. El texto parcial de una charla no se mezcla con otra.

## Cuadro de entrada

- **↑ / ↓** recorren tus mensajes anteriores.
- El cuadro crece con el texto hasta un tope y después scrollea.
- El borrador se guarda aunque cierres la app.

## Pruebas

- `tools/check_chat_flow_backend.py` (nueva): streaming, corte, corte antes del primer texto, detener, aislamiento entre charlas, un turno por vez y liberación del candado (7/7).
- `tools/check_chat_flow_ui.js` (nueva): formato seguro, copiar, streaming, un turno por vez, reintentar, corte, historial y crecimiento del cuadro. Desactiva la caché del navegador para no probar archivos viejos.
- `tools/check_provider_workbench_ui.js`: sigue en verde.
- `app.js` queda justo en su techo: el flujo nuevo vive en `ui/ai/chat-flow.js` y `ui/ai/chat-flow.css`.
