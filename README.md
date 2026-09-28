# LOW 3.0

> Continuación de [low-2.0](https://github.com/M4ur0-Gatt1/low-2.0) (archivado): el mismo programa,
> al día de su v4.52.0, con un historial nuevo. La numeración vuelve a empezar en 3.0.0.

LOW es un estudio creativo generalista y modular para Windows. Reúne dibujo,
ilustración, animación 2D, construcción de entornos 3D, composición y asistencia
mediante modelos de lenguaje dentro de un flujo de trabajo común.

La aplicación combina en una interfaz directa ideas de herramientas profesionales
de dibujo, animación, rigging, composición y creación tridimensional.

## Filosofía creativa

LOW toma los doce principios clásicos de la animación como criterios de diseño
del software. Pose, trayectoria, spacing y timing deben ser visibles y
editables; la automatización debe ser reversible y responder a la intención del
artista. El programa puede ayudar con arcos, interpolación, volumen, desfases y
consistencia, pero no pretende reemplazar actuación, puesta en escena, dibujo
sólido ni atractivo con un botón.

La filosofía completa y su traducción a funciones concretas se documentan en
[`docs/FILOSOFIA_DE_ANIMACION.md`](docs/FILOSOFIA_DE_ANIMACION.md).

La definición vinculante de calidad, interacción, arquitectura, pruebas y orden
de desarrollo está en
[`docs/LOW_BIBLIA_PRODUCCION.md`](docs/LOW_BIBLIA_PRODUCCION.md). Ninguna función
se considera terminada si no cumple esa definición de terminado.

## Autoría

LOW es una obra de **[Mauro Gatti](https://maurogatti.art) y Tropa Circa**.

Los modelos y servicios externos compatibles con LOW son integraciones técnicas
opcionales. No son autores, coautores ni propietarios del software.

## Módulos

### Dibujo y diseño

- Herramientas vectoriales y dibujo con tableta.
- Capas, grupos, selección, color y edición de nodos.
- Papel cebolla y flujo cuadro a cuadro.

### Animación

- X-sheet vertical por niveles y exposiciones.
- Timeline, claves de dibujo y cámara.
- Rigging, interpolación, cámara multiplano y exportación audiovisual.

### Estudio 3D

- Dibujo tridimensional apoyado sobre guías y superficies.
- Superficies editables y guías construidas a partir de trazos.
- Presión, estabilización, edición de puntos, capas y simetría X/Y/Z.
- Cámaras perspectiva y ortográficas.
- Proyectos editables en formato `.low3d`.
- Uso autónomo para crear fondos, escenarios, referencias y entornos.

### Asistencia por modelos

- Proveedores locales o remotos configurables por el usuario.
- Memoria asociada al proyecto.
- Acciones revisables y reversibles.
- Funciones creativas utilizables sin modelos externos.

## Arquitectura actual

- La aplicación generalista usa Python, pywebview y una interfaz web para dibujo,
  animación, asistencia y administración de proyectos.
- El estudio 3D usa Electron, React, TypeScript y Three.js.

Los módulos pueden funcionar de manera independiente y compartir archivos y
recursos. El editor 3D no depende de la animación para producir escenarios.

## Desarrollo

Aplicación generalista:

```powershell
python main.py
```

Estudio 3D:

```powershell
cd low2-hybrid
npm install
npm run dev:app
```

Comprobación y build:

```powershell
npx tsc --noEmit
npm run build:renderer
```

## Estado

LOW está en desarrollo activo. Algunas carpetas históricas son prototipos o rutas
de migración. La implementación 3D usada actualmente está en
`low2-hybrid/modules/design/engine/webgl-design3d.ts`.

## Licencia

MIT. Consultar `LICENSE`.

Copyright © 2026 Mauro Gatti y Tropa Circa.
