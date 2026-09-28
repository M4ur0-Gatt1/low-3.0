# APIs y agente de código: implementación y comprobaciones

Cambios preparados para LOW v4.43.0. Los instaladores se construyen y publican mediante el workflow de GitHub tras superar su control de calidad.

## Implementado

- Higgsfield: autenticación `ID:SECRET`, envío de solicitudes, polling con espera creciente, estados terminales, solicitud de cancelación y descarga sin reenviar credenciales al CDN. Imagen y texto a video. Modelos y parámetros JSON editables.
- Replicate: adaptador de medios conectado a la fábrica, modelos oficiales `owner/model` y versiones `owner/model:version`, polling y descarga. El adaptador antiguo de chat de Replicate no se usa: no implementa correctamente herramientas de agente.
- Varios perfiles LLM compatibles con OpenAI, agregables desde Configuración sin editar Python. No implica compatibilidad con protocolos HTTP distintos.
- Configuración por proveedor: clave, modelo, endpoint, cuenta Cloudflare y modelos/parámetros de medios. Consulta explícita del catálogo guardado, sin fallback estático que se haga pasar por conexión verificada.
- Correcciones: Cloudflare usa `/ai/v1` y recibe `account_id` en chat, listado, comparación y respaldo; Anthropic respeta `base_url`; URLs compatibles normalizadas; Perplexity usa la base oficial y modelos Sonar; los respaldos respetan el modelo configurado.
- Configuraciones independientes, merge de nuevos campos al cargar archivos antiguos y conservación de los perfiles personalizados. Guardar APIs devuelve también el proveedor y modelo activos para evitar vaciar los selectores.
- El indicador dice «claves API guardadas», no «APIs conectadas».
- Código: herramienta `update_plan` para publicar pasos y estados, panel de actividad con inicio/resultado de herramientas, errores y archivos modificados que se pueden abrir. Se conecta al agente existente, editor y terminal. No declara verificaciones que no se ejecutaron.

## Comprobación real de cuentas configuradas

Se enviaron consultas mínimas directamente a cada LLM con clave, sin failover. Después se consultaron sus catálogos. No se guardaron claves ni cuerpos de respuesta en este informe.

| Proveedor | Resultado observado | Acción pendiente |
| --- | --- | --- |
| DeepSeek | Catálogo HTTP 200, modelo presente; chat HTTP 402 | Revisar saldo/facturación de la cuenta |
| SiliconFlow | Catálogo HTTP 200, modelo presente; chat HTTP 402 | Revisar saldo/facturación de la cuenta |
| NVIDIA | Catálogo HTTP 200; modelo guardado ausente; chat rechazado | Elegir un modelo del catálogo actual |
| Groq | Catálogo HTTP 200; modelo guardado ausente; chat HTTP 404 | Elegir un modelo del catálogo actual |
| Qwen | Catálogo y chat HTTP 401 en su endpoint configurado | Revisar clave y endpoint de la cuenta |
| Agnes | Catálogo y chat HTTP 401 | Revisar credenciales |
| fal.ai y LTX | Claves presentes; contratos HTTP comprobados con simulación | Generación real no ejecutada |
| Higgsfield y Replicate | Sin claves locales | Cargar credenciales y validar una generación |
| Otros proveedores | Sin claves locales | No es posible certificar acceso real a sus cuentas |

Un catálogo HTTP 200 no certifica saldo, acceso a inferencia, herramientas o streaming. No se sustituyeron silenciosamente los modelos guardados de NVIDIA/Groq.

## Verificación reproducible

```powershell
python tools/check_provider_contracts.py
python tools/check_safe_mode_backend.py
node --check ui/app.js
node --check ui/ai/provider-settings.js
node --check ui/ai/agent-workbench.js
git diff --check
```

16 pruebas de contrato pasan: claves/modelos/endpoints/herramientas y streaming simulado de todos los adaptadores compatibles, Anthropic nativo, fal/LTX, configuración, respaldo, plan, Higgsfield, Replicate, timeout y destinos de credenciales.

`tools/check_provider_workbench_ui.js` pasa en Chromium con el backend mock. Verifica configuración, perfiles personalizados, validación JSON, plan, actividad y archivos. Por defecto usa el servidor local en 8791 y Chromium con CDP en 9223; acepta endpoint y URL como argumentos. La captura `provider-workbench-preview.png` muestra datos simulados, no una tarea real realizada por el agente.

`python tools/audit_provider_connections.py --catalog` consulta catálogos reales. `--live` envía consultas mínimas que pueden consumir tokens; no genera medios. Los resultados se imprimen sin claves.

## Límites y trabajo pendiente

Esta es una base extensible, no la integración literal de todas las APIs existentes. Gateways como Higgsfield, fal y Replicate cubren los modelos que cada servicio expone y que la cuenta tiene habilitados. APIs nativas de Runway, Stability, BFL, Adobe, Bedrock, Vertex y otras requieren sus propios contratos y credenciales; no se anuncian como conectadas.

Higgsfield/Replicate todavía no reciben automáticamente archivos locales de entrada para imagen a video; esa ruta conserva fal/LTX/SiliconFlow. Sus parámetros de modelo se configuran explícitamente. El ID del trabajo se muestra en actividad, pero todavía no hay reanudación de trabajos remotos tras cerrar LOW. Los nuevos gateways no hacen fallback de pago silencioso tras errores.

El panel de código es una mejora inicial: no equivale a toda la experiencia de Devin. Quedan una revisión dedicada de diffs, persistencia del plan por sesión y más validación de tareas reales con un LLM operativo.

## Contratos oficiales consultados

- [Higgsfield: ciclo de solicitudes](https://docs.higgsfield.ai/docs/concepts/requests)
- [Higgsfield: polling](https://docs.higgsfield.ai/docs/concepts/polling)
- [Replicate: predicciones](https://replicate.com/docs/topics/predictions/create-a-prediction)
- [Cloudflare: compatibilidad OpenAI](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/)
- [Anthropic: catálogo](https://platform.claude.com/docs/en/api/models/list)
- [Perplexity: Sonar](https://docs.perplexity.ai/docs/sonar/quickstart)
