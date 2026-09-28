# LOW 3.29.81 — Gestos transaccionales de rigging

## Cambios

- Inicio, cancelación y finalización de gestos pasan por un controlador único.
- Cambiar de modo cancela de inmediato el gesto de rigging activo.
- Un evento tardío de mouse o tableta ya no puede confirmar una edición anterior.
- La barrera cubre creación de huesos, geometría, FK, pivotes y jerarquía.
- Escape utiliza la misma cancelación segura y sigue sin cerrar el módulo 2D.

## Verificación

- 212 pruebas del modelo 2D y rigging aprobadas.
- Casos específicos para sustitución de gestos, eventos obsoletos y cambio de modo.
- Contratos de Escape, rueda, modos, rig y tableta aprobados.
