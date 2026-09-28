# LOW v4.43.0

## APIs de IA

- Higgsfield y Replicate integrados para generación de imágenes y texto a video, con modelos y parámetros configurables.
- Posibilidad de agregar varios endpoints LLM compatibles con OpenAI desde Configuración.
- Comprobación del catálogo del proveedor y selección de modelos disponibles, sin confundir una clave guardada con una conexión verificada.
- Correcciones de conexión para Cloudflare, Anthropic y Perplexity; el respaldo del agente respeta el modelo configurado.
- Se conservan los campos nuevos al cargar configuraciones anteriores y los selectores activos al guardar APIs.

## Agente de código

- Plan de trabajo visible y actualizable por el agente.
- Actividad de herramientas, errores y acceso a los archivos modificados durante el turno.

## Validación y alcance

Se incorporan 16 pruebas de contratos de proveedores y un recorrido de interfaz al control de calidad del release, además de las pruebas existentes. Los instaladores se publican después de superar los controles de calidad y el arranque de los ejecutables empaquetados.

Los servicios externos requieren credenciales, saldo y acceso al modelo. Higgsfield/Replicate están verificados con contratos simulados; no se certifica una generación real con cada cuenta. La entrada de archivos locales para imagen a video conserva las rutas existentes de fal/LTX/SiliconFlow. Este release amplía la compatibilidad, no incorpora todos los protocolos de IA ni toda la funcionalidad de Devin.
