/**
 * @file canvas3d-enhanced.ts
 * @brief Módulo de lienzo 3D mejorado para LOW 2.0
 * 
 * Este módulo envuelve el lienzo 3D existente de LOW 3.22.7, agregando
 * la capacidad de usar los motores nativos de C++ cuando están disponibles,
 * mientras mantiene compatibilidad total con las herramientas existentes.
 */

import { SurfaceEngine, StrokeEngine, type HitResult, type SurfaceType } from 'low-native-bridge';
import { legacyCanvas3D, LegacyToolType } from './canvas3d-legacy';

export interface Canvas3DConfig {
  useNativeEngine: boolean;
  defaultSurface: SurfaceType;
  enableSnapping: boolean;
  smoothingEnabled: boolean;
}

export class EnhancedCanvas3D {
  private nativeSurfaceEngine?: SurfaceEngine;
  private nativeStrokeEngine?: StrokeEngine;
  private legacyCanvas: any;
  private config: Canvas3DConfig;
  private isDrawing: boolean = false;
  private currentStrokeId?: string;

  constructor(config: Partial<Canvas3DConfig> = {}) {
    this.config = {
      useNativeEngine: true,
      defaultSurface: 'plane',
      enableSnapping: true,
      smoothingEnabled: true,
      ...config,
    };

    // Inicializar lienzo legacy (siempre disponible)
    this.legacyCanvas = legacyCanvas3D;

    // Intentar inicializar motores nativos si están disponibles
    if (this.config.useNativeEngine) {
      try {
        this.nativeSurfaceEngine = new SurfaceEngine();
        this.nativeStrokeEngine = new StrokeEngine();
        console.log('[LOW 2.0] Motores nativos inicializados correctamente');
      } catch (error) {
        console.warn('[LOW 2.0] No se pudieron inicializar los motores nativos, usando fallback legacy:', error);
        this.config.useNativeEngine = false;
      }
    }
  }

  /**
   * Configura una nueva superficie de dibujo
   */
  public addSurface(type: SurfaceType, config: any): string {
    if (this.config.useNativeEngine && this.nativeSurfaceEngine) {
      return this.nativeSurfaceEngine.addSurface(type, config);
    }
    
    // Fallback a implementación legacy
    return this.legacyCanvas.addSurface(type, config);
  }

  /**
   * Elimina una superficie existente
   */
  public removeSurface(surfaceId: string): void {
    if (this.config.useNativeEngine && this.nativeSurfaceEngine) {
      this.nativeSurfaceEngine.removeSurface(surfaceId);
      return;
    }
    
    this.legacyCanvas.removeSurface(surfaceId);
  }

  /**
   * Establece la superficie activa para dibujo
   */
  public setActiveSurface(surfaceId: string): void {
    if (this.config.useNativeEngine && this.nativeSurfaceEngine) {
      this.nativeSurfaceEngine.setActiveSurface(surfaceId);
      return;
    }
    
    this.legacyCanvas.setActiveSurface(surfaceId);
  }

  /**
   * Inicia un nuevo trazo
   */
  public beginStroke(x: number, y: number): void {
    this.isDrawing = true;

    if (this.config.useNativeEngine && this.nativeStrokeEngine) {
      this.currentStrokeId = this.nativeStrokeEngine.beginStroke();
      
      // Obtener punto 3D desde la posición 2D del mouse
      const point3D = this.getPointOnSurface(x, y);
      if (point3D) {
        this.nativeStrokeEngine.addPoint({
          position: point3D,
          pressure: 0.5, // Valor por defecto, se actualizará con presión real
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Fallback legacy
    this.legacyCanvas.beginStroke(x, y);
  }

  /**
   * Agrega un punto al trazo actual
   */
  public continueStroke(x: number, y: number, pressure: number = 0.5, tiltX?: number, tiltY?: number): void {
    if (!this.isDrawing) return;

    if (this.config.useNativeEngine && this.nativeStrokeEngine && this.currentStrokeId) {
      const point3D = this.getPointOnSurface(x, y);
      if (point3D) {
        this.nativeStrokeEngine.addPoint({
          position: point3D,
          pressure: pressure,
          tiltX: tiltX,
          tiltY: tiltY,
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Fallback legacy
    this.legacyCanvas.continueStroke(x, y, pressure);
  }

  /**
   * Finaliza el trazo actual
   */
  public endStroke(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.config.useNativeEngine && this.nativeStrokeEngine) {
      this.nativeStrokeEngine.endStroke();
      this.currentStrokeId = undefined;
      return;
    }

    // Fallback legacy
    this.legacyCanvas.endStroke();
  }

  /**
   * Obtiene un punto 3D en la superficie activa desde coordenadas 2D del mouse
   */
  private getPointOnSurface(mouseX: number, mouseY: number): { x: number; y: number; z: number } | null {
    if (this.config.useNativeEngine && this.nativeSurfaceEngine) {
      // Crear rayo desde la cámara
      const ray = this.createCameraRay(mouseX, mouseY);
      
      // Intersectar con superficies
      const hit: HitResult = this.nativeSurfaceEngine.intersect(ray, this.config.defaultSurface);
      
      if (hit.hit && hit.point) {
        return hit.point;
      }
      
      return null;
    }

    // Fallback: usar sistema legacy con Z fijo
    return this.legacyCanvas.getPointOnSurface(mouseX, mouseY);
  }

  /**
   * Crea un rayo desde la cámara hacia la posición del mouse
   */
  private createCameraRay(mouseX: number, mouseY: number): any {
    // Implementación simplificada - en producción usaría la cámara real
    return {
      origin: { x: 0, y: 0, z: -10 },
      direction: { 
        x: (mouseX - window.innerWidth / 2) / window.innerWidth,
        y: -(mouseY - window.innerHeight / 2) / window.innerHeight,
        z: -1,
      },
    };
  }

  /**
   * Cambia entre modo nativo y legacy en tiempo real
   */
  public setUseNativeEngine(enabled: boolean): void {
    if (enabled && !this.nativeSurfaceEngine) {
      try {
        this.nativeSurfaceEngine = new SurfaceEngine();
        this.nativeStrokeEngine = new StrokeEngine();
        console.log('[LOW 2.0] Motores nativos activados');
      } catch (error) {
        console.error('[LOW 2.0] Error al activar motores nativos:', error);
        enabled = false;
      }
    }
    
    this.config.useNativeEngine = enabled;
    console.log(`[LOW 2.0] Motor ${enabled ? 'NATIVO' : 'LEGACY'} activo`);
  }

  /**
   * Obtiene estadísticas de rendimiento
   */
  public getStats(): any {
    return {
      usingNativeEngine: this.config.useNativeEngine,
      surfaceCount: this.nativeSurfaceEngine ? 'N/A' : this.legacyCanvas.getSurfaceCount(),
      strokeCount: this.nativeStrokeEngine ? 'N/A' : this.legacyCanvas.getStrokeCount(),
      // Aquí se podrían agregar métricas específicas de los motores nativos
    };
  }

  // ===========================================================================
  // Métodos de Compatibilidad con Herramientas Existentes
  // ===========================================================================

  /**
   * Envoltorio para herramientas legacy que necesitan acceso directo al canvas
   */
  public getLegacyCanvas(): any {
    return this.legacyCanvas;
  }

  /**
   * Ejecuta una herramienta legacy específica
   */
  public runLegacyTool(toolType: LegacyToolType, params: any): any {
    return this.legacyCanvas.runTool(toolType, params);
  }

  /**
   * Exporta la escena actual (compatible con ambos motores)
   */
  public exportScene(format: 'glb' | 'obj' | 'low'): Blob {
    if (this.config.useNativeEngine) {
      // Usar exportador nativo si está disponible
      // TODO: Implementar exportadores nativos
    }
    
    return this.legacyCanvas.exportScene(format);
  }

  /**
   * Importa una escena o malla
   */
  public importScene(file: File): Promise<void> {
    return this.legacyCanvas.importScene(file);
  }
}

// =============================================================================
// Factory Function para facilitar la migración
// =============================================================================

export function createCanvas3D(config?: Partial<Canvas3DConfig>): EnhancedCanvas3D {
  return new EnhancedCanvas3D(config);
}

// =============================================================================
// Exportar tipos legacy para compatibilidad
// =============================================================================

export type { LegacyToolType } from './canvas3d-legacy';
export { legacyCanvas3D } from './canvas3d-legacy';
