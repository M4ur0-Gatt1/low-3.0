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

/** El deslizador del GROSOR va en escala logarítmica, de 0,5 a 100 px: en uno
 *  lineal de 1 a 100, los grosores finos (de 1 a 10, los de entintar) ocupaban
 *  apenas la décima parte de abajo y no se podían elegir. */
export const GROSOR_MIN = 0.5, GROSOR_MAX = 100;
export function grosorDeDeslizador(s: number): number {
  const v = GROSOR_MIN * Math.pow(GROSOR_MAX / GROSOR_MIN, Math.max(0, Math.min(1000, s)) / 1000);
  return v < 10 ? Math.round(v * 2) / 2 : Math.round(v);
}
export function deslizadorDeGrosor(g: number): number {
  const v = Math.max(GROSOR_MIN, Math.min(GROSOR_MAX, Number(g) || 1));
  return Math.round((1000 * Math.log(v / GROSOR_MIN)) / Math.log(GROSOR_MAX / GROSOR_MIN));
}
export const grosorTexto = (g: number): string => (g < 10 ? String(Math.round(g * 2) / 2).replace('.', ',') : String(Math.round(g)));
