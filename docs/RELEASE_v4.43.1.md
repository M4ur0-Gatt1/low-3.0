# LOW v4.43.1

- Panel de dibujo más compacto y botón Ancho fijo proporcionado al resto de los controles, con estado activo visible.
- El inspector guarda sus cambios en el documento y agrupa la edición de un campo en un solo Undo. Recibir foco ya no crea una operación vacía.
- Las esquinas pueden cancelarse con Escape, pointercancel o cambio de herramienta/cuadro sin confirmar la previsualización. Radio exacto, Undo/Redo y reapertura verificados.
- La comprobación de APIs usa los valores actuales del formulario y deja de esperar tras 20 segundos si el puente no responde.
- Higgsfield informa sobre el formato ID:SECRET y distingue la revisión local de una autenticación o generación real.

Validación local: 371 pruebas del modelo 2D, 18 contratos de proveedores y recorridos de interfaz de inspector/esquinas, proveedores, pinceles, nodos, contornos, herramientas vectoriales y recuperación. La prueba de inspector/esquinas se incorpora al control de calidad de publicación.

El bloqueo original de Higgsfield no se ha reproducido con la cuenta del usuario; falta precisar si ocurre al guardar, comprobar o generar. Esta versión corrige la espera de la comprobación, pero no certifica generación real ni saldo. La validación humana con tableta sigue pendiente.
