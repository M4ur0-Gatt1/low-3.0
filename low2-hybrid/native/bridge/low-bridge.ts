/**
 * Puente nativo de alto nivel para el módulo 3D de LOW 2.0.
 *
 * Los componentes de React NO hablan directamente con las clases del addon C++
 * (`SurfaceEngine`/`StrokeEngine` de `low-native-bridge`); hablan con este
 * adaptador `nativeBridge.design3D`, que traduce eventos de UI a llamadas del
 * motor y degrada de forma segura cuando el addon nativo todavía no está
 * compilado/cargado (métodos no-op + aviso una sola vez).
 *
 * Estado actual: el addon .node aún NO se compila (ver package.json →
 * build:native). Mientras tanto el viewport monta y la UI funciona; el dibujo
 * real se activa cuando `loadNativeAddon()` devuelva el módulo. Ese es el ÚNICO
 * punto a cablear cuando el .node exista.
 *
 * @module native/bridge/low-bridge
 */

import type {
  SurfaceEngine as NativeSurfaceEngine,
  StrokeEngine as NativeStrokeEngine,
} from 'low-native-bridge';
import type {
  BrushSettings,
  PointerInput,
  SurfaceParams,
  SurfaceType,
  ToolType,
} from '../../types/design-types';

interface InitOptions {
  canvas: HTMLCanvasElement;
  projectId: string;
  width: number;
  height: number;
  dpr: number;
}

/** API de diseño 3D que consume la UI de React. */
export interface Design3DAPI {
  initialize(opts: InitOptions): Promise<void>;
  dispose(projectId: string): void;
  setActiveTool(tool: ToolType): void;
  setMirrorMode(enabled: boolean): void;
  updateBrushSettings(brush: BrushSettings): void;
  createSurface(type: SurfaceType, params: SurfaceParams): void;
  onPointerDown(input: PointerInput): void;
  onPointerMove(input: PointerInput): void;
  onPointerHover(input: PointerInput): void;
  onPointerUp(input: PointerInput): void;
}

let warnedMissing = false;
function warnOnce(method: string): void {
  if (warnedMissing) return;
  warnedMissing = true;
  console.warn(
    `[LOW 2.0] Motor nativo 3D no cargado; "${method}" y las llamadas ` +
      'siguientes son no-op. Compilá el addon (npm run build:native) para ' +
      'activar el dibujo real.'
  );
}

/**
 * Intenta cargar el addon nativo. Hoy devuelve null a propósito (el .node no se
 * compila todavía). Cuando exista, reemplazar por la carga real, p. ej.:
 *   return require('low-native-bridge');
 * envuelto en try/catch. Se aísla acá para no tocar el resto del bridge.
 */
function loadNativeAddon(): typeof import('low-native-bridge') | null {
  // TODO(nativo): cablear cuando native/build/*.node exista.
  return null;
}

class Design3DBridge implements Design3DAPI {
  private surfaceEngine?: NativeSurfaceEngine;
  private strokeEngine?: NativeStrokeEngine;
  private ready = false;
  private currentTool: ToolType = 'pencil';
  private mirror = false;
  private activeStrokeId?: string;

  get isNative(): boolean {
    return this.ready && !!this.strokeEngine;
  }

  async initialize(opts: InitOptions): Promise<void> {
    const mod = loadNativeAddon();
    if (mod) {
      this.surfaceEngine = new mod.SurfaceEngine();
      this.strokeEngine = new mod.StrokeEngine();
      // TODO(nativo): pasar opts.canvas/width/height/dpr al contexto GL nativo.
      console.log(
        `[LOW 2.0] Motor nativo 3D listo para "${opts.projectId}" ` +
          `(${opts.width}×${opts.height} @${opts.dpr}x)`
      );
    } else {
      warnOnce('initialize');
    }
    // Resolvemos siempre: sin addon el viewport igual monta (dibujo no-op).
    this.ready = true;
  }

  dispose(projectId: string): void {
    this.surfaceEngine = undefined;
    this.strokeEngine = undefined;
    this.ready = false;
    this.activeStrokeId = undefined;
    console.log(`[LOW 2.0] Motor 3D liberado para "${projectId}"`);
  }

  setActiveTool(tool: ToolType): void {
    this.currentTool = tool;
  }

  setMirrorMode(enabled: boolean): void {
    this.mirror = enabled;
  }

  updateBrushSettings(brush: BrushSettings): void {
    if (!this.strokeEngine) {
      warnOnce('updateBrushSettings');
      return;
    }
    this.strokeEngine.setBrush({
      type: 'default',
      width: brush.size,
      color: hexToColor(brush.color, brush.opacity),
      opacity: brush.opacity,
      smoothing: brush.hardness,
    });
  }

  createSurface(type: SurfaceType, params: SurfaceParams): void {
    if (!this.surfaceEngine) {
      warnOnce('createSurface');
      return;
    }
    this.surfaceEngine.addSurface(type, {
      radius: params.radius,
      width: params.width,
      height: params.height,
      segments: params.segments,
    });
  }

  onPointerDown(input: PointerInput): void {
    if (!this.strokeEngine || this.currentTool !== 'pencil') {
      if (!this.strokeEngine) warnOnce('onPointerDown');
      return;
    }
    this.activeStrokeId = this.strokeEngine.beginStroke();
    this.addSample(input);
  }

  onPointerMove(input: PointerInput): void {
    if (!this.strokeEngine || !this.activeStrokeId) return;
    this.addSample(input);
  }

  onPointerHover(_input: PointerInput): void {
    // TODO(nativo): preview de cursor/snapping. No-op por ahora.
  }

  onPointerUp(_input: PointerInput): void {
    if (!this.strokeEngine || !this.activeStrokeId) return;
    this.strokeEngine.endStroke();
    this.activeStrokeId = undefined;
  }

  private addSample(input: PointerInput): void {
    // z=0: el motor nativo proyecta x/y (espacio [-1,1]) sobre la superficie
    // activa vía raycast. Mantenemos la muestra completa (presión/tilt).
    this.strokeEngine?.addPoint({
      position: { x: input.x, y: input.y, z: 0 },
      pressure: input.pressure,
      tiltX: input.tiltX,
      tiltY: input.tiltY,
      rotation: input.twist,
      timestamp: input.timestamp,
    });
    if (this.mirror) {
      this.strokeEngine?.addPoint({
        position: { x: -input.x, y: input.y, z: 0 },
        pressure: input.pressure,
        timestamp: input.timestamp,
      });
    }
  }
}

/** Convierte "#rrggbb" + alpha 0–1 al Color {r,g,b,a} 0–1 del motor. */
function hexToColor(hex: string, alpha: number): { r: number; g: number; b: number; a: number } {
  const clean = hex.replace('#', '');
  const int = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
    a: alpha,
  };
}

/** Puente nativo global. `design3D` puede ampliarse con más subsistemas. */
export const nativeBridge: { design3D: Design3DAPI } = {
  design3D: new Design3DBridge(),
};

export default nativeBridge;
