# LOW 3.29.76 — Vínculos de rig seguros

Esta versión corrige una causa estructural de piezas que saltaban o parecían desprenderse durante la pose: un mismo dibujo podía quedar controlado por más de un hueso.

## Cambios

- Cada pieza de arte tiene ahora un único hueso propietario.
- Revincular transfiere la pieza al nuevo hueso mediante una sola operación reversible.
- Nueva acción **Soltar**, que elimina el vínculo sin borrar el hueso, el dibujo, el slot ni sus variantes.
- El flujo Hueso → seleccionar dibujo → Vincular conserva correctamente el hueso de destino.
- Los proyectos antiguos con propietarios duplicados se reparan al abrirse y quedan marcados para guardar la corrección.
- El diagnóstico del rig detecta vínculos duplicados y bloquea la animación de un estado ambiguo.

## Verificación

- 199 pruebas del modelo 2D y rigging aprobadas.
- Contratos de Escape, rueda, modos y tableta aprobados.
- Validación sintáctica de los módulos modificados.
- Compilación limpia y prueba de arranque del ejecutable Windows.
