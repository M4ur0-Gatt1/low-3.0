# ADR-006 — Color Studio y gramática visual única

**Estado:** aceptado · **Fecha:** 2026-09-05

## Contexto

LOW tenía un modelo de paleta correcto —estilos numerados referenciados por los dibujos— presentado como una lista compacta con selectores nativos. Dibujo, Color, Composición, Timeline y Brush Studio también usaban nombres de tokens, densidades y jerarquías diferentes. El resultado se percibía como varios programas ensamblados.

Las referencias de producto se interpretan por fortaleza, no como copias: Harmony aporta estilos vinculados y pipeline integrado; TVPaint, respuesta artística inmediata; Procreate, baja fricción; OpenToonz, información de producción e integridad; Moho queda como referencia específica para rigging. El módulo 3D de fondos continúa independiente de Composición 2D.

## Decisión

1. La identidad del color sigue siendo el número de estilo, nunca un color literal aislado. Cambiar un estilo recolorea todas sus referencias sin reescribir cada dibujo.
2. El workspace **Color** reserva el inspector derecho al Color Studio. Capas y propiedades dejan de competir visualmente con la tarea principal.
3. El editor combina un campo Saturación/Valor, tono continuo, HEX, RGB y HSV. Todas las representaciones se sincronizan y un gesto continuo produce una sola entrada de Undo.
4. **Línea** y **Pintura** son destinos explícitos. Elegir un estilo actualiza el destino correspondiente y conserva el estilo activo para los trazos nuevos.
5. Las armonías se calculan desde HSV y son una ayuda editable, no colores globales implícitos.
6. Los estilos muestran nombre, índice estable, color y cantidad de usos. No se puede borrar un estilo usado sin reasignarlo.
7. `#designView` define aliases semánticos compartidos: superficies, texto, bordes, acento, altura de control y radios. Los módulos históricos pueden migrar gradualmente sin romper sus selectores.
8. El intercambio de paletas acepta Adobe ASE/ACO, GIMP/Krita GPL y JSON/LOW Palette. La importación evita colores duplicados, conserva nombres y se agrupa en una única transacción de Undo. GPL es el formato abierto de salida inicial.

## Consecuencias

- La edición de color se vuelve una operación de escena, apta para producción y no una colección local de muestras.
- La interfaz gana una jerarquía consistente sin reescribir de una vez todos los paneles.
- El modelo continúa serializando archivos anteriores y mantiene colores literales como respaldo portable.
- La futura gestión CMYK/Lab, perfiles ICC y bibliotecas compartidas debe extender el servicio de color; no debe volver a incrustar lógica en cada panel.
- Los colores recientes son preferencia local de interfaz; los estilos importados sí pertenecen al documento.

## Verificación mínima

- Conversión HEX/RGB/HSV y armonías mediante pruebas de modelo.
- Cambio de color y Undo reales en Chromium.
- Destino Línea/Pintura, seis canales, seis armonías y estilos vinculados presentes.
- Inspector de 332 px sin solaparse con el lienzo a resolución de escritorio.
- Parseo discriminante de ASE, ACO y round-trip GPL; importación de dos colores y Undo conjunto mediante interacción real.
