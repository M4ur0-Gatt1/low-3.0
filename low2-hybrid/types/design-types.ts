/**
 * Tipos compartidos del módulo de Diseño / Animación 3D de LOW 2.0.
 *
 * Punto único de verdad para las herramientas, superficies, pincel, capas y
 * muestras de input que consumen el store, la UI (Toolbar/Properties/Layers) y
 * el puente nativo. Mantener sincronizado con los enums del motor C++.
 *
 * @module types/design-types
 */

/** Herramientas de dibujo/edición expuestas en la Toolbar.
 *  'guide' = traza líneas punteadas de referencia espacial (no tinta).
 *  'select' = selección directa de nodos: edita los puntos de control de un
 *  trazo ya hecho (arrastrar un nodo individual), no el trazo entero.
 *  'scissors' = corta un trazo en dos en el punto donde se clickea sobre él.
 *  'pencil-free' = dibujo libre en el aire: ignora guías/superficies, la
 *  profundidad (distancia a la cámara) se controla con el scroll en vez de
 *  proyectarse sobre un plano de apoyo. */
export type ToolType = 'pencil' | 'guide' | 'move' | 'select' | 'eraser' | 'liquify'
  | 'scissors' | 'pencil-free' | 'fill'
  // figuras planas: nacen sobre el plano de dibujo activo y quedan como
  // un trazo CERRADO (su perímetro), así se pueden rellenar, agrupar,
  // convertir en volumen y editar igual que una línea a mano
  | 'rect' | 'circle' | 'poly';

/** Modo del gizmo de transformación de la herramienta 'move' (con un solo
 *  trazo seleccionado): mover libremente por ejes, redimensionar, o rotar. */
export type GizmoMode = 'translate' | 'scale' | 'rotate';

/** Superficies guía sobre las que se proyecta el trazo. */
export type SurfaceType = 'plane' | 'cylinder' | 'sphere' | 'torus' | 'loft';

/** Configuración del pincel activo. */
export interface BrushSettings {
  color: string;
  /** Grosor en px (1–100). */
  size: number;
  /** Opacidad 0–1. */
  opacity: number;
  /** Dureza del borde 0–1: menos dureza = más transparencia/blur en el borde. */
  hardness: number;
  /** Cuánto afecta la presión del lápiz al ancho del trazo, 0–1.
   *  0 = ancho constante (como antes). 1 = rango completo (casi a la mitad
   *  del grosor con presión mínima, grosor completo a fondo). Solo aplica a
   *  dispositivos 'pen' — el mouse siempre dibuja a ancho completo. */
  pressureSensitivity: number;
  /** "Stable Strokes": 0–1, cuánto retraso hay entre el puntero real y el
   *  punto que se agrega al trazo. 0 = sin estabilizar (crudo, como antes).
   *  Suaviza el pulso a costa de "cortar camino" en curvas muy rápidas. */
  stabilization: number;
}

/** Parámetros geométricos de una superficie guía. Abierto para que el motor
 *  nativo agregue campos sin romper el tipo. */
export interface SurfaceParams {
  width?: number;
  height?: number;
  radius?: number;
  /** Radio del tubo (toro). */
  tubeRadius?: number;
  segments?: number;
  position?: [number, number, number];
  /** Rotación EXPLÍCITA en grados. Si está definida, manda ella y el plano deja
   *  de re-encararse solo al cambiar de vista. */
  rotation?: [number, number, number];
  scale?: [number, number, number];
  /** Solo lectura: rotación en grados que el motor le dio al plano al encararlo
   *  a la vista. La escribe el motor para que el panel muestre el valor REAL en
   *  vez de 0,0,0 (si mostrara 0,0,0, tocar un campo teletransportaba el plano).
   *  No define geometría: cambiarla no reconstruye la malla. */
  autoRotation?: [number, number, number];
  [key: string]: unknown;
}

/** Superficie guía activa en la escena. */
export interface ActiveSurface {
  type: SurfaceType;
  params: SurfaceParams;
}

/** Capa del proyecto (LayerManager3D). */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Opacidad de la capa 0–1. */
  opacity: number;
}

/** Objeto seleccionado en el viewport (para el panel de propiedades). */
export interface SelectedObject {
  id: string;
  type: 'stroke' | 'surface' | 'mesh';
  name?: string;
}

/** Muestra de input normalizada que se envía al motor nativo.
 *  x/y vienen en espacio OpenGL normalizado [-1, 1]. */
export interface PointerInput {
  x: number;
  y: number;
  /** Presión 0–1 (0.5 por defecto en dispositivos sin presión). */
  pressure: number;
  tiltX: number;
  tiltY: number;
  /** Rotación del lápiz (0 si el dispositivo no la reporta). */
  twist: number;
  timestamp: number;
  pointerType: 'mouse' | 'pen' | 'touch';
  /** Solo en move: si el trazo está en curso. */
  isDrawing?: boolean;
}
