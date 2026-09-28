import type { BrushSettings } from '../../types/design-types';

/** Presets de pincel: mismos parámetros del motor (size/hardness/presión/
 *  estabilizador), solo con distintos valores por defecto para que cada uno
 *  se sienta distinto — lápiz fino y parejo, tinta con calado marcado y
 *  brillo, pincel grueso y mate ("con volumen"). El color no se toca. */
export const BRUSH_PRESETS: { id: string; label: string; values: Omit<BrushSettings, 'color'> }[] = [
  { id: 'fine', label: 'Fino', values: { size: 3, opacity: 1, hardness: 0.9, pressureSensitivity: 0.3, stabilization: 0.2 } },
  { id: 'pencil', label: 'Lápiz', values: { size: 6, opacity: 1, hardness: 0.3, pressureSensitivity: 0.25, stabilization: 0.2 } },
  { id: 'ink', label: 'Tinta', values: { size: 10, opacity: 1, hardness: 0.95, pressureSensitivity: 0.75, stabilization: 0.45 } },
  { id: 'marker', label: 'Marcador', values: { size: 34, opacity: 0.85, hardness: 0.6, pressureSensitivity: 0.1, stabilization: 0.3 } },
  { id: 'brush', label: 'Pincel', values: { size: 22, opacity: 0.92, hardness: 0.15, pressureSensitivity: 0.55, stabilization: 0.35 } },
  { id: 'charcoal', label: 'Carboncillo', values: { size: 28, opacity: 0.8, hardness: 0.05, pressureSensitivity: 0.8, stabilization: 0.35 } },
];
