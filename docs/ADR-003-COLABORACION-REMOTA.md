# ADR-003: colaboración remota sobre operaciones del documento canónico

**Estado:** Propuesto  
**Fecha:** 2026-09-04  
**Decisor:** Mauro Gatti / Tropa Circa

## Contexto

LOW necesita edición compartida sin convertir la red ni el DOM en estado canónico. El dibujo debe continuar sin conexión, cada gesto debe seguir siendo una intención de Undo y dos artistas no deben sobrescribir silenciosamente el mismo dibujo o rig.

## Decisión

La colaboración se construye como un registro ordenado de operaciones sobre el documento canónico. Cada cliente aplica primero en local, conserva una cola pendiente y sincroniza por WebSocket cuando hay conexión. El servidor autentica, autoriza, asigna una revisión y persiste; no interpreta gestos de puntero.

- Operaciones pequeñas para cambios discretos (exposición, nombre, color, clave).
- Operación única al terminar un trazo o transformación; nunca un mensaje por muestra de tableta.
- La mesa multiplano usa `composition.plane.transform`; el módulo 3D estilo Feather permanece independiente y comparte fondos sólo mediante assets guardados.
- Bloqueo temporal por recurso para contenido difícil de fusionar: dibujo, rig, audio y cámara.
- Presencia efímera y cursores fuera del historial del documento.
- Roles `owner`, `editor`, `reviewer` y `viewer` validados tanto en cliente como en servidor.
- Conflictos estructurales resueltos por orden Lamport estable; conflictos visuales se muestran como versiones recuperables.

## Flujo colectivo

1. Al abrir, el cliente descarga snapshot + revisión y reproduce operaciones posteriores.
2. El artista entra a un dibujo/capa; LOW solicita un bloqueo renovable y muestra quién está allí.
3. El gesto se previsualiza sólo localmente. Al confirmar, genera una operación con `groupId` de Undo.
4. Offline, la operación queda pendiente y el trabajo continúa. Al reconectar, se envía en orden.
5. Si la revisión base quedó atrás, se reordenan operaciones con reglas deterministas. Un conflicto no fusionable crea una versión, nunca descarta trabajo.
6. Reviewers añaden comentarios anclados a frame/capa/objeto; no modifican arte.

## Contrato de transporte

```json
{
  "id": "actor-7:42",
  "projectId": "short-film",
  "actorId": "actor-7",
  "lamport": 108,
  "type": "drawing.replace",
  "target": "drawing:A:12",
  "payload": { "content": "<g>...</g>" },
  "baseRevision": 991,
  "groupId": "stroke-884"
}
```

El servidor responde `accepted`, `rejected` o `conflict`, siempre con revisión y motivo. TLS, tokens cortos, cuotas de tamaño, auditoría y snapshots periódicos son obligatorios antes de producción.

## Alternativas consideradas

| Opción | Evaluación |
|---|---|
| Archivo compartido | Simple, pero causa sobrescrituras y no ofrece presencia ni historial granular. |
| CRDT completo por punto | Fusiona todo, pero aumenta mucho el tráfico y complejidad de trazos/rig. |
| Operaciones + bloqueos blandos | Mantiene Undo, permite offline y concentra complejidad donde aporta valor. Elegida. |

## Consecuencias

- El documento local sigue funcionando sin cuenta ni conexión.
- Undo local debe emitir una operación compensatoria cuando el cambio ya fue aceptado.
- El servidor, almacenamiento de blobs y UI de presencia son fases posteriores; `ui/collaboration/session.js` establece desde ahora el contrato cliente testeable.
- Los assets pesados viajan por almacenamiento de objetos con hash; el registro sólo referencia blobs.

## Fases de entrega

1. Núcleo local, roles, presencia, locks y cola offline.
2. Adaptador WebSocket y servicio de sesiones con SQLite/PostgreSQL.
3. Avatares/cursores, comentarios y panel de actividad.
4. Versiones visuales, recuperación de conflictos y pruebas de carga/fallo.

## Criterios de aceptación

- Dos clientes ordenan el mismo lote por Lamport de forma idéntica antes de aplicarlo.
- Un viewer no puede editar y un reviewer sólo comenta.
- Un trazo completo produce una operación y una entrada de Undo.
- Desconectar, editar y reconectar no pierde operaciones.
- Un bloqueo vencido puede recuperarse; uno activo de otro usuario no se pisa.
