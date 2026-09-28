/**
 * Store global del módulo de diseño de LOW 2.0.
 *
 * Implementación sin dependencias (no Redux/Zustand): un store externo mínimo
 * consumido con `useSyncExternalStore` (React 18). Todos los componentes del
 * módulo 3D (Toolbar3D, PropertiesPanel3D, LayerManager3D y Animation3DNative)
 * comparten este estado y se re-renderizan al mutarlo.
 *
 * El snapshot combinado (estado + acciones) se reconstruye SOLO al mutar, para
 * que `getSnapshot` devuelva una referencia estable y no dispare renders en
 * bucle (requisito de useSyncExternalStore).
 *
 * @module store/low-store
 */

import { useSyncExternalStore } from 'react';
import type {
  ToolType,
  ActiveSurface,
  BrushSettings,
  GizmoMode,
  Layer,
  SelectedObject,
} from '../types/design-types';

interface LowState {
  currentTool: ToolType;
  activeSurface: ActiveSurface | null;
  mirrorMode: { x: boolean; y: boolean; z: boolean };
  brushSettings: BrushSettings;
  selectedObject: SelectedObject | null;
  layers: Layer[];
  activeLayerId: string | null;
  gizmoMode: GizmoMode;
  /** Objetos del dibujo tal como los ve el usuario: cada grupo de Ctrl+G y
   *  cada trazo suelto. El motor lo publica al cambiar; el panel lo lista.
   *  Sin esto, agrupar no se notaba en ningún lado. */
  objects: SceneObject[];
}

export interface SceneObject {
  /** id del grupo (`grp-N`) o del trazo suelto. */
  id: string;
  name: string;
  kind: 'group' | 'stroke' | 'fill' | 'solid';
  /** cuántas piezas tiene (1 si es suelto). */
  count: number;
  selected: boolean;
}

const INITIAL: LowState = {
  currentTool: 'pencil',
  activeSurface: null,
  mirrorMode: { x: false, y: false, z: false },
  brushSettings: { color: '#22252e', size: 12, opacity: 1, hardness: 0.8, pressureSensitivity: 0.6, stabilization: 0.35 },
  selectedObject: null,
  layers: [{ id: 'layer-0', name: 'Capa 1', visible: true, locked: false, opacity: 1 }],
  activeLayerId: 'layer-0',
  gizmoMode: 'translate',
  objects: [],
};

let state: LowState = INITIAL;
const listeners = new Set<() => void>();

// contador para IDs de capa deterministas (evita depender de Date.now/Math.random)
let layerSeq = 1;

const actions = {
  setCurrentTool: (currentTool: ToolType) => patch({ currentTool }),
  setActiveSurface: (activeSurface: ActiveSurface | null) => patch({ activeSurface }),
  setMirrorMode: (mirrorMode: { x: boolean; y: boolean; z: boolean }) => patch({ mirrorMode }),
  setBrushSettings: (brushSettings: BrushSettings) => patch({ brushSettings }),
  setSelectedObject: (selectedObject: SelectedObject | null) => patch({ selectedObject }),
  setGizmoMode: (gizmoMode: GizmoMode) => patch({ gizmoMode }),
  setObjects: (objects: SceneObject[]) => patch({ objects }),

  addLayer: () => {
    const id = `layer-${layerSeq++}`;
    const layer: Layer = {
      id,
      name: `Capa ${state.layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 1,
    };
    patch({ layers: [...state.layers, layer], activeLayerId: id });
  },

  removeLayer: (id: string) => {
    if (state.layers.length <= 1) return; // siempre queda al menos una capa
    const layers = state.layers.filter((l) => l.id !== id);
    const activeLayerId =
      state.activeLayerId === id ? layers[layers.length - 1].id : state.activeLayerId;
    patch({ layers, activeLayerId });
  },

  setActiveLayer: (id: string) => patch({ activeLayerId: id }),

  toggleLayerVisibility: (id: string) =>
    patch({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    }),

  toggleLayerLock: (id: string) =>
    patch({
      layers: state.layers.map((l) => (l.id === id ? { ...l, locked: !l.locked } : l)),
    }),

  renameLayer: (id: string, name: string) =>
    patch({
      layers: state.layers.map((l) => (l.id === id ? { ...l, name } : l)),
    }),

  setLayerOpacity: (id: string, opacity: number) =>
    patch({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
      ),
    }),

  restoreLayers: (layers: Layer[], activeLayerId?: string | null) => {
    const clean = (layers || []).filter((l) => l && typeof l.id === 'string').map((l) => ({
      id: l.id, name: l.name || 'Capa', visible: l.visible !== false,
      locked: l.locked === true, opacity: Math.max(0, Math.min(1, Number(l.opacity ?? 1))),
    }));
    const next = clean.length ? clean : [{ id: 'layer-0', name: 'Capa 1', visible: true, locked: false, opacity: 1 }];
    const active = next.some((l) => l.id === activeLayerId) ? activeLayerId! : next[0].id;
    const maxSeq = next.reduce((m, l) => Math.max(m, Number(l.id.match(/layer-(\d+)/)?.[1] || 0)), 0);
    layerSeq = Math.max(layerSeq, maxSeq + 1);
    patch({ layers: next, activeLayerId: active });
  },
};

/** Snapshot combinado (estado + acciones). Referencia estable entre mutaciones. */
export type LowStore = LowState & typeof actions;

let snapshot: LowStore = { ...state, ...actions };

function patch(next: Partial<LowState>) {
  state = { ...state, ...next };
  snapshot = { ...state, ...actions };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): LowStore {
  return snapshot;
}

/** Hook de React: devuelve el estado del módulo de diseño + las acciones. */
export function useLowStore(): LowStore {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Acceso imperativo fuera de React (efectos, puente nativo, tests). */
export const lowStore = {
  getState: (): LowState => state,
  subscribe,
  ...actions,
};
