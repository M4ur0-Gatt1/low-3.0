/**
 * @file low_native_bridge.d.ts
 * @brief Definiciones de tipo para el puente nativo de LOW 2.0
 * 
 * Este archivo permite que TypeScript conozca las APIs nativas expuestas
 * por los motores C++ de Surface, Stroke e Input.
 */

declare module 'low-native-bridge' {
  
  // ============================================================================
  // Tipos Básicos
  // ============================================================================
  
  export interface Vec3 {
    x: number;
    y: number;
    z: number;
  }

  export interface Vec2 {
    x: number;
    y: number;
  }

  export interface Ray {
    origin: Vec3;
    direction: Vec3;
  }

  export interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
  }

  // ============================================================================
  // Surface Engine
  // ============================================================================

  export interface HitResult {
    hit: boolean;
    point?: Vec3;
    normal?: Vec3;
    uv?: Vec2;
    distance?: number;
    priority?: number;
    surfaceId?: string;
  }

  export interface SurfaceConfig {
    width?: number;
    height?: number;
    radius?: number;
    segments?: number;
    transform?: number[]; // Matriz 4x4 como array plano
    position?: Vec3;
    rotation?: Vec3;
    scale?: Vec3;
  }

  export type SurfaceType = 'plane' | 'sphere' | 'cylinder' | 'torus' | 'loft' | 'mesh' | 'image';

  export class SurfaceEngine {
    constructor();
    
    /**
     * Intersecta un rayo con todas las superficies activas
     * @param ray - Rayo desde la cámara
     * @param surfaceType - Tipo de superficie prioritaria (opcional)
     * @returns Resultado de la intersección
     */
    intersect(ray: Ray, surfaceType?: SurfaceType): HitResult;

    /**
     * Agrega una nueva superficie a la escena
     * @param type - Tipo de superficie
     * @param config - Configuración de la superficie
     * @returns ID único de la superficie creada
     */
    addSurface(type: SurfaceType, config: SurfaceConfig): string;

    /**
     * Remueve una superficie existente
     * @param surfaceId - ID de la superficie a remover
     */
    removeSurface(surfaceId: string): void;

    /**
     * Establece la superficie activa para dibujo
     * @param surfaceId - ID de la superficie
     */
    setActiveSurface(surfaceId: string): void;

    /**
     * Obtiene las prioridades actuales de snapping
     */
    getPriority(): Record<SurfaceType, number>;

    /**
     * Establece la prioridad de un tipo de superficie
     */
    setPriority(type: SurfaceType, priority: number): void;
  }

  // ============================================================================
  // Stroke Engine
  // ============================================================================

  export interface InputSample {
    position: Vec3;
    pressure: number;
    tiltX?: number;
    tiltY?: number;
    rotation?: number;
    timestamp?: number;
  }

  export interface StrokePoint {
    position: Vec3;
    tangent: Vec3;
    normal: Vec3;
    binormal?: Vec3;
    width: number;
    pressure: number;
  }

  export interface BrushConfig {
    type: string;
    width: number;
    color: Color;
    opacity?: number;
    flow?: number;
    spacing?: number;
    smoothing?: number;
  }

  export interface StrokeData {
    points: StrokePoint[];
    brush: BrushConfig;
    controlPoints: number;
    length: number;
  }

  export class StrokeEngine {
    constructor();

    /**
     * Inicia un nuevo trazo
     * @returns ID del trazo creado
     */
    beginStroke(): string;

    /**
     * Agrega un punto al trazo actual
     * @param sample - Muestra de entrada con posición y presión
     */
    addPoint(sample: InputSample): void;

    /**
     * Finaliza el trazo actual
     */
    endStroke(): void;

    /**
     * Establece la configuración del pincel activo
     * @param config - Configuración del pincel
     */
    setBrush(config: BrushConfig): void;

    /**
     * Obtiene los datos procedurales del trazo
     * @returns Datos del trazo sin geometría triangulada
     */
    getStrokeData(): StrokeData;

    /**
     * Cancela el trazo actual sin guardarlo
     */
    cancelStroke(): void;
  }

  // ============================================================================
  // Input Engine (Opcional - para acceso directo a dispositivos)
  // ============================================================================

  export interface DeviceInfo {
    id: string;
    name: string;
    type: 'mouse' | 'pen' | 'spacemouse' | 'touch';
    capabilities: {
      pressure: boolean;
      tilt: boolean;
      rotation: boolean;
      buttons: number;
    };
  }

  export class InputEngine {
    constructor();

    /**
     * Obtiene información de todos los dispositivos conectados
     */
    getDevices(): DeviceInfo[];

    /**
     * Habilita o deshabilita un dispositivo
     */
    setDeviceEnabled(deviceId: string, enabled: boolean): void;

    /**
     * Configura el filtro One Euro para suavizado
     */
    setSmoothing(beta: number, cutoff: number): void;
  }

  // ============================================================================
  // Constantes Exportadas
  // ============================================================================

  export const SURFACE_PLANE: 'plane';
  export const SURFACE_SPHERE: 'sphere';
  export const SURFACE_CYLINDER: 'cylinder';
  export const SURFACE_TORUS: 'torus';
  export const SURFACE_LOFT: 'loft';
  export const SURFACE_MESH: 'mesh';

  // Prioridades por defecto
  export const PRIORITY_VERTEX: number;
  export const PRIORITY_EDGE: number;
  export const PRIORITY_STROKE: number;
  export const PRIORITY_GUIDE: number;
  export const PRIORITY_MESH: number;
  export const PRIORITY_PLANE: number;
}
