# LOW 3.29.78 — Animación de esqueleto reutilizable

## Cambios

- **Animar** se habilita con cualquier esqueleto válido, aunque todavía no tenga personaje.
- Las poses y claves creadas sin arte se conservan al importar y vincular el personaje posteriormente.
- La interfaz muestra el estado **Esqueleto animable** para distinguirlo de un personaje completamente vinculado.
- Los mensajes de la mesa explican cuándo se está animando solamente el alambre.
- La política del flujo de rigging fue extraída de `app.js` a un módulo independiente y comprobable.
- Se mantienen las barreras que impiden modificar la geometría neutra dentro de Animar.

## Verificación

- 201 pruebas del modelo 2D y rigging aprobadas.
- Contratos de Escape, rueda, modos, rig y tableta aprobados.
- Validación sintáctica y compilación limpia del ejecutable Windows.
