# LOW v4.18.0 — Arranque seguro y restablecimiento sin perder trabajo

Esta versión agrega una salida de recuperación cuando una disposición, un
atajo o un pincel personalizado deja la interfaz 2D inutilizable. El modo
seguro aísla esas preferencias, pero no borra trabajo ni crea otro modelo de
escena.

## Arranque seguro real

- `LOW --safe-mode` no vuelve a abrir el último proyecto automáticamente.
- Arranca con el espacio Dibujo de fábrica y sin posiciones de paneles,
  atajos ni pinceles personalizados.
- Las preferencias originales quedan intactas: al abrir LOW normalmente vuelven
  a estar disponibles.
- Escenas, dibujos y recuperación automática siguen accesibles.
- También se puede entrar desde **Ayuda → Reiniciar interfaz en modo seguro…**.
- Si hay cambios sin guardar, el reinicio se detiene y los pide guardar primero.

## Restablecimiento por área

**Edición → Restablecer configuración 2D…** permite elegir, sin opciones
marcadas de antemano:

- espacios y paneles;
- atajos;
- pinceles y favoritos;
- preferencias de dibujo, color y papel cebolla.

Cancelar no cambia ninguna clave. El restablecimiento nunca incluye escenas,
dibujos, recuperación automática, personajes ni archivos del proyecto.

## Arquitectura e integración

La política vive en `ui/core/safe-mode.js` y la presentación en
`ui/panels/safe-mode-view.js`. Los módulos existentes leen el mismo almacén de
preferencias aislado; no se agregó un documento, Timeline o XSheet paralelo.

Este release está basado en `v4.17.1` e incluye el trabajo coordinado de Claude:
la extracción de paneles, la puerta de tamaño para `app.js`, la herramienta de
formas por arrastre y los recorridos que esperan al puente real en vez de usar
demoras fijas. El presupuesto se mantiene exactamente en 18.008 líneas.

## Pruebas

- 604 casos de modelo y lógica, incluidos 4 nuevos del modo seguro.
- Comprobaciones de backend, guardado/importación, relay, contratos 2D,
  presupuesto de `app.js` y sintaxis Python.
- 19 recorridos E2E reales en Chromium, incluido el nuevo recorrido de modo
  seguro, más los presupuestos de rendimiento.
- Humo del empaquetado y coherencia de versión.

## Reversión

Estable previa: `v4.17.1`. El modo seguro no migra ni reescribe documentos, por
lo que volver atrás no requiere convertir escenas.
