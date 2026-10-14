/* TOMAS DEL ESTUDIO 3D: la cámara animada que saca los fondos para el 2D.

   Pedido de Mauro (v3.30): «armar en el 3D los escenarios, los fondos, los
   espacios, y traerlos a la composición… si animo una bici doblando en una
   esquina de un edificio, poder capturar toda la curva para los distintos
   fondos». El 3D queda editable; al 2D llegan imágenes livianas (JPG o PNG).

   Una toma son claves de cámara por cuadro: dónde está (pos), adónde mira
   (mira) y con qué lente. Entre claves, la cámara pasa por una curva suave
   (Catmull-Rom centrípeta, la que no hace rulos ni se pasa de largo), así
   una esquina con tres claves ya da un giro redondo. Puro: sin three. */

export type V3 = [number, number, number];
export interface ClaveToma { cuadro: number; pos: V3; mira: V3; lente: number }
export interface Toma3D {
  nombre: string;
  /** largo de la toma en cuadros (el de la escena del 2D) */
  cuadros: number;
  claves: ClaveToma[];
}
export interface CamaraToma { pos: V3; mira: V3; lente: number }

export const TOMA_INICIAL: Toma3D = { nombre: 'Toma 1', cuadros: 24, claves: [] };

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const v3 = (v: unknown): V3 | null => (Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x)) ? [v[0], v[1], v[2]] : null);

/** Lo que vino de un archivo, sano: claves ordenadas, sin repetidas, dentro de la toma. */
export function tomaValida(d: unknown): Toma3D {
  const o = (d && typeof d === 'object' ? d : {}) as Partial<Toma3D>;
  const cuadros = Math.max(1, Math.min(100000, Math.round(num(o.cuadros, TOMA_INICIAL.cuadros))));
  const porCuadro = new Map<number, ClaveToma>();
  for (const c of Array.isArray(o.claves) ? o.claves : []) {
    const pos = v3(c?.pos), mira = v3(c?.mira);
    if (!pos || !mira) continue;
    const cuadro = Math.max(1, Math.round(num(c.cuadro, 1)));
    porCuadro.set(cuadro, { cuadro, pos, mira, lente: Math.max(10, Math.min(200, num(c.lente, 28))) });
  }
  return { nombre: typeof o.nombre === 'string' && o.nombre.trim() ? o.nombre.trim().slice(0, 60) : TOMA_INICIAL.nombre,
    cuadros, claves: [...porCuadro.values()].sort((a, b) => a.cuadro - b.cuadro) };
}

/** Pone (o reemplaza) la clave de ese cuadro. Devuelve una toma nueva. */
export function ponerClave(t: Toma3D, c: ClaveToma): Toma3D {
  return tomaValida({ ...t, claves: [...t.claves.filter((k) => k.cuadro !== c.cuadro), c] });
}
export function quitarClave(t: Toma3D, cuadro: number): Toma3D {
  return { ...t, claves: t.claves.filter((k) => k.cuadro !== cuadro) };
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const largo = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** Un tramo de Catmull-Rom centrípeta (alfa = 0.5) entre p1 y p2, en t ∈ [0,1]. */
function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const tj = (ti: number, a: V3, b: V3) => ti + Math.max(1e-4, Math.sqrt(largo(sub(b, a))));
  const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mezcla = (a: V3, b: V3, ta: number, tb: number): V3 => {
    const k = (tb - u) / (tb - ta), l = (u - ta) / (tb - ta);
    return [a[0] * k + b[0] * l, a[1] * k + b[1] * l, a[2] * k + b[2] * l];
  };
  const A1 = mezcla(p0, p1, t0, t1), A2 = mezcla(p1, p2, t1, t2), A3 = mezcla(p2, p3, t2, t3);
  const B1 = mezcla(A1, A2, t0, t2), B2 = mezcla(A2, A3, t1, t3);
  return mezcla(B1, B2, t1, t2);
}
/** El punto «fantasma» antes del primero / después del último: la curva arranca recta. */
const fantasma = (a: V3, b: V3): V3 => [2 * a[0] - b[0], 2 * a[1] - b[1], 2 * a[2] - b[2]];
const igual = (a: V3, b: V3) => largo(sub(a, b)) < 1e-6;

/** Dónde está la cámara en ese cuadro. Antes de la primera clave y después
 *  de la última, quieta. Sin claves: null. */
export function camaraEn(t: Toma3D, cuadro: number): CamaraToma | null {
  const k = t.claves;
  if (!k.length) return null;
  if (cuadro <= k[0].cuadro) return { pos: [...k[0].pos], mira: [...k[0].mira], lente: k[0].lente };
  const ult = k[k.length - 1];
  if (cuadro >= ult.cuadro) return { pos: [...ult.pos], mira: [...ult.mira], lente: ult.lente };
  let i = 0;
  while (i < k.length - 2 && cuadro >= k[i + 1].cuadro) i++;
  const a = k[i], b = k[i + 1];
  const s = (cuadro - a.cuadro) / (b.cuadro - a.cuadro);
  const curva = (campo: 'pos' | 'mira'): V3 => {
    const p1 = a[campo], p2 = b[campo];
    if (igual(p1, p2)) return [...p1];
    const p0 = i > 0 ? k[i - 1][campo] : fantasma(p1, p2);
    const p3 = i + 2 < k.length ? k[i + 2][campo] : fantasma(p2, p1);
    return catmull(igual(p0, p1) ? fantasma(p1, p2) : p0, p1, p2, igual(p3, p2) ? fantasma(p2, p1) : p3, s);
  };
  return { pos: curva('pos'), mira: curva('mira'), lente: a.lente + (b.lente - a.lente) * s };
}

/** Qué cuadros se renderizan: cada `cada` cuadros (en unos, en dos, en tres…). */
export function cuadrosARender(t: Toma3D, cada: number): number[] {
  const paso = Math.max(1, Math.min(12, Math.round(cada) || 1));
  const out: number[] = [];
  for (let f = 1; f <= t.cuadros; f += paso) out.push(f);
  return out;
}
