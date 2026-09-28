# 🗺️ MAPEO DE MIGRACIÓN: LOW JavaScript → LOW 2.0 C++

Este documento mapea TODAS las funciones existentes en la versión actual (JavaScript/Web) hacia la nueva arquitectura C++ 2.0, asegurando paridad funcional completa.

---

## 📊 ESTADO ACTUAL (JavaScript/Web)

### Archivos Principales
| Archivo | Líneas | Responsabilidad |
|---------|--------|-----------------|
| `ui/lienzo3d.js` | 1132 | Motor 3D WebGL (Three.js) |
| `ui/app.js` | ~2000+ | UI principal, editor de código, chat AI |
| `ui/index.html` | ~650 | Layout completo de la interfaz |
| `main.py` | ? | Backend Python, API de sistema |

---

## 🎨 FUNCIONES DEL LIENZO 3D (lienzo3d.js)

### 1. Motor de Contexto (Feather-style) ✅ YA IMPLEMENTADO EN C++
```javascript
L3D.surfaces[]      // → SurfaceEngine::surfaces_
L3D.activeSurface   // → SurfaceEngine::activeSurface_
L3D.capturePriority // → SnapEngine::priorityOrder_
```

### 2. Superficies de Dibujo ✅ YA IMPLEMENTADO EN C++
| Clase JS | Equivalente C++ | Estado |
|----------|-----------------|--------|
| `DrawingSurface` (base) | `ISurface` | ✅ Migrado |
| `PlaneSurface` | `PlaneSurface` | ✅ Migrado |
| `CylinderSurface` | `CylinderSurface` | ✅ Migrado |
| `SphereSurface` | `SphereSurface` | ✅ Migrado |
| `TorusSurface` | `TorusSurface` | ✅ Migrado |
| `LoftSurface` | `LoftSurface` | ✅ Migrado |

### 3. Funciones de Guías
```javascript
l3dCreateGuide(type, params)  // → CommandCreateGuide
l3dClearGuides()              // → CommandClearGuides
l3dToggleGuide(type)          // → CommandToggleGuide
```

### 4. Sistema de Dibujo ⚠️ PENDIENTE MIGRACIÓN
```javascript
l3dStartDrawing(x, y)    // → StrokeEngine::beginStroke()
l3dContinueDrawing(x, y) // → StrokeEngine::addSample()
l3dStopDrawing()         // → StrokeEngine::endStroke()
l3dUpdateStrokeMesh()    // → RibbonBuilder::generate()
```

**Características a migrar:**
- [ ] Muestreo adaptativo (no guardar todos los puntos)
- [ ] Suavizado con lerp
- [ ] Generación de malla tubular con presión
- [ ] Modo espejo X (`L3D.brush.mirror`)

### 5. Herramientas
| Herramienta | Función JS | Equivalente C++ |
|-------------|-----------|-----------------|
| Pincel | `data-l3dtool="brush"` | `ToolBrush` |
| Mover | `data-l3dtool="move"` | `GizmoTransform` (Fase 3 pendiente) |
| Borrar | `data-l3dtool="erase"` | `ToolEraser` |

### 6. Funciones Avanzadas ⚠️ PENDIENTE
```javascript
l3dExportGLB()           // → ExporterGLTF::exportScene()
l3dImportMesh(fileData)  // → ImporterOBJ::import() + MeshSurface
l3dLiquifyStroke()       // → DeformerLiquify (campo vectorial)
l3dEraseAt()             // → SelectionEngine::raycast + delete
```

### 7. Configuración del Pincel
```javascript
L3D.brush = {
  color: 0x2c3e50,       // → MaterialComponent::color
  width: 4,              // → BrushComponent::width
  pressure: 1.0,         // → InputSample::pressure
  material: "standard",  // → MaterialComponent::shaderType
  mirror: false          // → BrushComponent::mirrorX
}
```

---

## 🖥️ FUNCIONES DE LA UI PRINCIPAL (app.js + index.html)

### 1. Sistema de Pestañas y Editor
```javascript
S.tabs[]        // → DocumentManager::documents
S.cur           // → DocumentManager::activeDocument
cm (CodeMirror) // → CodeEditor Widget (Dear ImGui + Scintilla?)
```

**Funciones a migrar:**
- [ ] Apertura/cierre de archivos
- [ ] Resaltado sintáctico (Python, JS, Bash, PowerShell, HTML, CSS, XML)
- [ ] Auto-complete
- [ ] Guardado automático

### 2. Chat con AI ✅ YA EXISTE EN PYTHON
```javascript
S.chats[]       // → ConversationHistory (ya en Python)
S.agent         // → AgentSystem (ya en Python)
```

### 3. Barra de Herramientas de Dibujo 2D (Design Zone)
| Botón | ID | Función | Estado Migración |
|-------|----|---------|------------------|
| Pincel | `data-tool="brush"` | Dibujo con presión | ⚠️ Pendiente |
| Mano | `data-tool="hand"` | Navegación | ⚠️ Pendiente |
| Espejo | `#dzMirror` | Simetría vertical | ⚠️ Pendiente |
| Cuadrícula | `#dzGridBtn` | Grid de referencia | ⚠️ Pendiente |
| Espacio 3D | `#dz3DBtn` | Orbita 3D SVG | ❌ No migrar (obsoleto por L3D) |
| **Lienzo 3D** | `#abL3d` | WebGL real | ✅ Ya migrado |
| Fondo IA | `#dzBg` | Generar background | ⚠️ Pendiente (API Python) |

### 4. Sistema de Capas ⚠️ CRÍTICO
```javascript
// En index.html: lista de capas flotantes
// En app.js: gestión de visibilidad, orden Z, bloqueo
```

**A migrar:**
- [ ] Lista de capas en UI
- [ ] Visibilidad toggle
- [ ] Orden Z (arrastrar y soltar)
- [ ] Bloqueo de capas
- [ ] Opacidad por capa
- [ ] Modos de fusión (normal, multiply, screen, etc.)

### 5. Diagnóstico de Tableta
```javascript
dzPenDebugToggle()  // → Panel de eventos pointer en vivo
```

**A migrar:**
- [ ] Panel de debugging de input
- [ ] Visualización de presión, tilt, rotation en tiempo real

### 6. Paleta de Colores
```javascript
#dzPalette  // → ColorPicker Widget
```

**A migrar:**
- [ ] Selector de color RGB/HSV
- [ ] Colores recientes
- [ ] Gradientes

### 7. Propiedades de Documento
```javascript
#dzDoc  // → Document settings: tamaño, presets, color fondo
```

**A migrar:**
- [ ] Tamaño del lienzo (width, height)
- [ ] Presets (A4, A3, 1920x1080, etc.)
- [ ] Color de fondo
- [ ] DPI/PPI

---

## 🐍 BACKEND PYTHON (main.py y relacionados)

### 1. API del Sistema
```python
# Funciones que deben migrarse a C++ o mantenerse como puente
api.log_js()
api.file_open()
api.file_save()
api.exec_cmd()
api.run_code()
```

### 2. Proveedores de AI
```
/providers/
  agnes_provider.py
  anthropic_provider.py
  openai_provider.py
  qwen_provider.py
  ... (15+ proveedores)
```

**Decisión:** ✅ MANTENER EN PYTHON
- Los proveedores de AI siguen en Python
- C++ se comunica vía IPC o bindings

### 3. Módulo Social
```
/social/
  canva_client.py
  oauth.py
  db.py
  service.py
```

**Decisión:** ✅ MANTENER EN PYTHON
- Integración con redes sociales
- Base de datos local
- OAuth clients

### 4. Animación
```
/animation_engine/
  nodes.py
  renderer.py
  rigging.py
  storyboard.py
```

**Decisión:** ⚠️ EVALUAR
- Si es crítico para LOW 2.0 → migrar a C++
- Si es secundario → mantener en Python

---

## 📋 LISTA DE TAREAS DE MIGRACIÓN

### FASE 11A: Core del Dibujo 3D (PRIORITARIO)
- [ ] `StrokeEngine::beginStroke()` - equivalente a `l3dStartDrawing`
- [ ] `StrokeEngine::addSample()` - equivalente a `l3dContinueDrawing`
- [ ] `StrokeEngine::endStroke()` - equivalente a `l3dStopDrawing`
- [ ] `RibbonBuilder::generate()` - equivalente a `l3dUpdateStrokeMesh`
- [ ] Soporte para presión en ancho del tubo
- [ ] Modo espejo X

### FASE 11B: Herramientas de Edición
- [ ] `ToolEraser` - equivalente a `l3dEraseAt`
- [ ] `GizmoTransform` - mover/rotar/escalar trazos (Fase 3 original)
- [ ] Sistema de selección por raycast
- [ ] Snapping a vértices/curvas durante edición

### FASE 11C: Import/Export
- [ ] `ExporterGLTF::exportScene()` - equivalente a `l3dExportGLB`
- [ ] `ImporterOBJ::import()` - equivalente a `l3dImportMesh`
- [ ] `ImporterGLTF::import()` - soporte adicional
- [ ] Conversión automática a `MeshSurface` al importar

### FASE 11D: Efectos Avanzados
- [ ] `DeformerLiquify` - campo vectorial para deformar strokes
- [ ] `FieldVector` - representación matemática del campo
- [ ] UI para pincel de liquify (radio, fuerza)

### FASE 11E: UI Dear ImGui (Integración completa)
- [ ] Panel de capas (LayerList Widget)
- [ ] Inspector de propiedades (PropertyGrid)
- [ ] Toolbar de herramientas (ToolPalette)
- [ ] Viewport 3D con ImGui (integrar OpenGL context)
- [ ] Color Picker avanzado
- [ ] Panel de diagnóstico de tableta

### FASE 11F: Sistema de Archivos
- [ ] `FileEngine::open()` - abrir .low y formatos externos
- [ ] `FileEngine::save()` - guardar escena completa
- [ ] `FileEngine::exportAs()` - exportar a GLB/OBJ/FBX
- [ ] Historial de archivos recientes
- [ ] Auto-guardado configurable

### FASE 11G: Integración Python-C++
- [ ] Puente para proveedores de AI (std::pipe o pybind11)
- [ ] Puente para módulo social
- [ ] Puente para animación (si corresponde)
- [ ] Sistema de plugins Python desde C++

---

## 🎯 CRITERIOS DE PARIDAD

Una función se considera "migrada" cuando cumple:

1. ✅ **Funcionalidad idéntica**: Hace exactamente lo mismo que la versión JS
2. ✅ **Rendimiento superior**: Al menos 2x más rápido o usa menos memoria
3. ✅ **UI integrada**: Accesible desde la interfaz Dear ImGui
4. ✅ **Persistencia**: Se guarda/carga correctamente en formato .low
5. ✅ **Undo/Redo**: Soporta deshacer/rehacer mediante Command pattern
6. ✅ **Documentación**: Tiene comentarios Doxygen y ejemplo de uso

---

## 📊 PROGRESO DE MIGRACIÓN

| Módulo | Funciones Totales | Migradas | Porcentaje |
|--------|------------------|----------|------------|
| Surface Engine | 6 superficies | 6 | 100% ✅ |
| Stroke Engine | 5 operaciones | 0 | 0% ⏳ |
| Render Engine | Pipeline completo | 100% | 100% ✅ |
| Input Engine | Multi-dispositivo | 100% | 100% ✅ |
| UI Widgets | 15+ paneles | 8 | 53% ⏳ |
| Import/Export | 4 formatos | 0 | 0% ⏳ |
| Efectos | 2 (liquify, erase) | 0 | 0% ⏳ |
| **TOTAL** | **~50 funciones** | **~20** | **40%** |

---

## 🚀 PRÓXIMOS PASOS INMEDIATOS

1. **Implementar StrokeEngine completo** (FASE 11A)
2. **Crear widgets Dear ImGui faltantes** (FASE 11E)
3. **Sistema de capas** (CRÍTICO - no existe en C++ aún)
4. **Import/Export GLB** (FASE 11C)

---

*Documento generado: $(date)*
*Versión LOW: 2.0-alpha*
*Última actualización: Fase 10 completada*
