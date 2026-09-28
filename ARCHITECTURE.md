# LOW 2.0 - Architecture Decision Record (ADR)

## Visión General
LOW 2.0 es un motor de dibujo 3D procedural para Windows, diseñado para artistas técnicos. No es un clon de Feather, sino una reinterpretación optimizada para flujo de trabajo con Mouse, Wacom y SpaceMouse.

**Principio Rector:** "Programar Motores, no Herramientas".

---

## ADR-001: Lenguaje y Stack Tecnológico

### Contexto
Necesitamos rendimiento extremo (10M+ puntos), control total de memoria y compatibilidad a 20 años en Windows.

### Opciones Consideradas
1.  **C# / .NET + DirectX**: Fácil desarrollo, GC puede causar stutters en tiempo real.
2.  **Rust + Vulkan**: Seguridad de memoria excelente, curva de aprendizaje muy alta, ecosistema de gráficos maduro pero fragmentado.
3.  **C++20 + OpenGL 4.6**: Estándar industrial, control manual de memoria, ampliamente soportado en Windows sin dependencias externas pesadas.

### Decisión
**C++20 + OpenGL 4.6**.
*Justificación:* C++20 ofrece `concepts`, `modules` (futuro), `std::span`, `std::expected` para seguridad sin overhead. OpenGL 4.6 es estable, maduro en drivers de Windows y suficiente para nuestro pipeline de Ribbon Geometry. Evita la complejidad prematura de Vulkan.

---

## ADR-002: Gestión de Memoria y Objetos

### Contexto
El sistema debe manejar millones de puntos de control sin fragmentación de memoria ni pausas de GC.

### Opciones Consideradas
1.  **`new`/`delete` dispersos**: Flexible pero propenso a fugas y fragmentación.
2.  **Smart Pointers (`std::shared_ptr`) everywhere**: Seguro pero overhead atómico innecesario y caché misses.
3.  **Arenas / Object Pools + `std::unique_ptr`**: Alto rendimiento, localidad de caché, vida útil determinista.

### Decisión
**Híbrido: Object Pools para datos densos (Samples, Vertices) + `std::unique_ptr` para dueños de recursos.**
*   Los `StrokeSamples` vivirán en `std::vector` contiguos dentro de un Pool.
*   Los `SceneObject` serán dueños de sus componentes vía `unique_ptr`.
*   **Prohibido** el uso de `new` directo fuera de los allocators del Core.

---

## ADR-003: Representación de Trazos (Stroke Representation)

### Contexto
¿Cómo almacenamos una línea dibujada en 3D?

### Opciones Consideradas
1.  **Mesh Inmediata**: Guardar triángulos al dibujar. (Descartado: imposible de editar, consume mucha memoria).
2.  **NURBS Puras**: Matemáticamente elegantes, pero costosas de evaluar en tiempo real para intersecciones complejas.
3.  **Spline Paramétrica + Muestreo Adaptativo**: Guardar puntos de control (Control Points) y generar geometría solo al renderizar.

### Decisión
**Spline Paramétrica (Catmull-Rom Centripeta) + Parallel Transport Frames.**
*   Almacenamos solo `ControlPoints` (Pos, Pressure, Time).
*   La geometría (Ribbon) se genera en el GPU o en un buffer dinámico cada frame.
*   Esto permite edición infinita sin degradación.

---

## ADR-004: Sistema de Superficies (Surface Engine)

### Contexto
El usuario nunca dibuja en "Z=50". Dibuja sobre un contexto.

### Opciones Consideradas
1.  **Plano Global Único**: Simple, pero limita la creatividad 3D.
2.  **Voxels**: Bueno para escultura, malo para dibujo de líneas precisas.
3.  **Interfaz Polimórfica `ISurface`**: Cada objeto define cómo intersectar un rayo.

### Decisión
**Patrón Strategy vía `ISurface`**.
*   `PlaneSurface`, `MeshSurface`, `LoftSurface` implementan `Intersect(Ray)`.
*   El `SurfaceEngine` mantiene una lista de superficies activas y resuelve la prioridad (Vertex > Edge > Surface).

---

## ADR-005: Comunicación entre Motores

### Contexto
Evitar acoplamiento fuerte (Spaghetti code).

### Opciones Consideradas
1.  **Referencias Directas**: `RenderEngine` conoce a `StrokeEngine`. (Frágil).
2.  **Event Bus Global**: Flexible, pero difícil de depurar y rastrear flujo de datos.
3.  **Interfaces Abstractas + Inyección de Dependencias**: Cada Engine recibe interfaces de los otros que necesita.

### Decisión
**Interfaces Abstractas (`IContext`, `ISceneProvider`)**.
*   El `Application` actúa como orquestador (Composition Root).
*   Los Engines no se conocen entre sí directamente, solo a través de interfaces definidas en `/include/Core/Interfaces.h`.

---

## Estructura de Directorios Propuesta

```text
LOW/
├── CMakeLists.txt          # Configuración de build
├── ARCHITECTURE.md         # Este documento
├── README.md
├── /src
│   ├── Core/               # Tipos base, Math, Logger, Memory
│   ├── Scene/              # SceneGraph, SceneObject, Components
│   ├── Stroke/             # StrokeEngine, Spline, Samples
│   ├── Surface/            # SurfaceEngine, ISurface implementations
│   ├── Render/             # OpenGL wrappers, Shaders, Ribbons
│   ├── Input/              # Mouse, Wacom, SpaceMouse handling
│   ├── UI/                 # ImGui integration (Solo vista)
│   └── App/                # Main loop, Wiring
├── /include
│   └── Low/                # Public headers (si hubiera librería)
├── /shaders                # GLSL sources
├── /tests                  # Unit tests (GoogleTest)
└── /assets                 # Texturas, iconos
```

## Próximos Pasos (Fase 1)
1.  Configurar CMake y estructura de carpetas.
2.  Implementar `Low::Math` (Vec3, Mat4, Ray, AABB).
3.  Implementar `Low::Core` (Logger, Types, UUID).
4.  Validar compilación en entorno limpio.
