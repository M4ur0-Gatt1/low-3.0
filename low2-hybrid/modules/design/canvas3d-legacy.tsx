/**
 * Capa de compatibilidad "legacy" del lienzo 3D.
 *
 * Unifica los DOS contratos que el resto del módulo espera de
 * `./canvas3d-legacy`, que antes vivían separados y en conflicto:
 *
 *  1. `LegacyCanvasFallback` — componente React que muestra
 *     `animation-3d-native.tsx` cuando el motor nativo falla.
 *  2. `legacyCanvas3D` + `LegacyToolType` — singleton IMPERATIVO (no React)
 *     que envuelve `canvas3d-enhanced.ts` cuando el motor nativo no está.
 *
 * Ambos son stubs seguros del canvas3d.tsx original de LOW 3.22.x: no rompen y
 * dejan el punto exacto donde enchufar la implementación JS pura si hiciera
 * falta un fallback real.
 *
 * @module design/canvas3d-legacy
 */

import React from 'react';

// ============================================================================
// 1. Fallback React (para animation-3d-native.tsx)
// ============================================================================

interface LegacyCanvasFallbackProps {
  projectId: string;
  readOnly?: boolean;
}

export const LegacyCanvasFallback: React.FC<LegacyCanvasFallbackProps> = ({
  projectId,
  readOnly = false,
}) => {
  React.useEffect(() => {
    console.warn('[LOW 2.0] Usando canvas legacy en modo fallback');
    // TODO(legacy): montar acá el canvas3d.tsx JS puro original si se porta.
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        backgroundColor: '#1e1e1e',
        color: '#fff',
        textAlign: 'center',
        padding: '20px',
      }}
    >
      <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>
        Motor 3D Nativo No Disponible
      </h2>
      <p style={{ fontSize: '14px', opacity: 0.8, maxWidth: '400px' }}>
        Se ha activado el modo de compatibilidad con el motor JavaScript legacy.
        El rendimiento puede ser menor con escenas complejas.
      </p>
      <p style={{ fontSize: '12px', opacity: 0.6, marginTop: '20px' }}>
        Proyecto: {projectId} | Modo: {readOnly ? 'Solo Lectura' : 'Edición'}
      </p>
      <div
        style={{
          marginTop: '30px',
          padding: '20px',
          border: '1px dashed #666',
          borderRadius: '8px',
          backgroundColor: 'rgba(255,255,255,0.05)',
        }}
      >
        Cargando lienzo 3D legacy...
      </div>
    </div>
  );
};

// ============================================================================
// 2. Singleton imperativo (para canvas3d-enhanced.ts)
// ============================================================================

/** Herramientas del canvas legacy (superset de ToolType, incluye 'select'). */
export type LegacyToolType = 'pencil' | 'move' | 'eraser' | 'liquify' | 'select';

interface Point3D {
  x: number;
  y: number;
  z: number;
}

/**
 * Fachada imperativa del canvas legacy. Todos los métodos son no-op seguros
 * hasta que se porte el motor JS original; así `EnhancedCanvas3D` compila y
 * funciona con el motor nativo, cayendo a estos stubs si el nativo no está.
 */
export interface LegacyCanvas3D {
  addSurface(type: string, config: unknown): string;
  removeSurface(surfaceId: string): void;
  setActiveSurface(surfaceId: string): void;
  beginStroke(x: number, y: number): void;
  continueStroke(x: number, y: number, pressure?: number): void;
  endStroke(): void;
  getPointOnSurface(x: number, y: number): Point3D | null;
  getSurfaceCount(): number;
  getStrokeCount(): number;
  runTool(toolType: LegacyToolType, params: unknown): unknown;
  exportScene(format: 'glb' | 'obj' | 'low'): Blob;
  importScene(file: File): Promise<void>;
}

let surfaceSeq = 0;

export const legacyCanvas3D: LegacyCanvas3D = {
  addSurface(type) {
    warn('addSurface');
    return `legacy-surface-${surfaceSeq++}-${type}`;
  },
  removeSurface() {
    warn('removeSurface');
  },
  setActiveSurface() {
    warn('setActiveSurface');
  },
  beginStroke() {
    warn('beginStroke');
  },
  continueStroke() {
    /* no-op silencioso: se llama en cada pointermove */
  },
  endStroke() {
    warn('endStroke');
  },
  getPointOnSurface(x, y) {
    // Proyección trivial: plano Z=0. Suficiente para no romper el fallback.
    return { x, y, z: 0 };
  },
  getSurfaceCount() {
    return 0;
  },
  getStrokeCount() {
    return 0;
  },
  runTool(toolType) {
    warn(`runTool(${toolType})`);
    return null;
  },
  exportScene(format) {
    warn(`exportScene(${format})`);
    return new Blob([], { type: 'application/octet-stream' });
  },
  importScene() {
    warn('importScene');
    return Promise.resolve();
  },
};

let warned = false;
function warn(method: string): void {
  if (warned) return;
  warned = true;
  console.warn(
    `[LOW 2.0] canvas3d legacy en modo stub ("${method}"). ` +
      'Portá el canvas3d.tsx original para un fallback JS funcional.'
  );
}

export default LegacyCanvasFallback;
