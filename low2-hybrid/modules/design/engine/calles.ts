/* ══ EL PAVIMENTADOR: CALLES DE CIUDAD ═══════════════════════════════════════
   Mauro: «quiero un pavimentador que dibuje calles de ciudades con una lógica
   similar [a la caja]». Se marca el recorrido con clics sobre el piso y la calle
   sale entera: calzada con sus cordones, veredas, la línea del medio y las
   sendas peatonales en los cruces.

   Este módulo es SOLO geometría, en el plano del piso (x, z): de una red de
   calles saca, para cada una, los polígonos a rellenar y las líneas de tinta.
   El motor los convierte en mallas. Las piezas dependen de las OTRAS calles
   (un cruce corta cordones y líneas, y pone sendas), por eso al sumar o quitar
   una calle se rearman todas.

   La regla de los cruces, con d = distancia a la otra calle O:
   - el cordón se corta donde d < calzada(O)/2      (adentro de su calzada);
   - el borde de la vereda, donde d < calzada(O)/2 + vereda(O);
   - la línea del medio, un poco antes (deja lugar a la senda);
   - la senda va en la franja calzada(O)/2 ≤ d < calzada(O)/2 + vereda(O):
     alineada con las veredas de la otra calle, como en una esquina de verdad.
   Las veredas y las calzadas se apilan (vereda abajo, calzada arriba): donde
   se cruzan, manda la calzada. */
import * as THREE from 'three';

export type TipoCalle = 'pasaje' | 'calle' | 'avenida';

/** Medidas en metros (aprox. Argentina). */
export const MEDIDAS: Record<TipoCalle, { calzada: number; vereda: number; raya: 'cortada' | 'doble'; trazo: number; hueco: number }> = {
  pasaje: { calzada: 4, vereda: 1.5, raya: 'cortada', trazo: 1.5, hueco: 1.5 },
  calle: { calzada: 7.5, vereda: 2.5, raya: 'cortada', trazo: 3, hueco: 3 },
  avenida: { calzada: 14, vereda: 3.5, raya: 'doble', trazo: 0, hueco: 0 },
};

export interface CalleRed { id: string; tipo: TipoCalle; pts: THREE.Vector2[] }
export interface PiezasCalle {
  vereda: THREE.Vector2[];
  calzada: THREE.Vector2[];
  /** pintura blanca: la línea del medio y las sendas (polígonos) */
  pintura: THREE.Vector2[][];
  /** tinta: cordones y bordes de vereda (polilíneas) */
  tinta: THREE.Vector2[][];
}

const v2 = (x: number, y: number) => new THREE.Vector2(x, y);

/** Normal izquierda de la dirección d (en el plano x, z). */
const normal = (d: THREE.Vector2) => v2(-d.y, d.x);

/** La polilínea corrida `off` metros a la izquierda, con inglete limitado en
 *  los quiebres (si no, una vuelta cerrada dispara la esquina al infinito). */
export function correr(pts: THREE.Vector2[], off: number): THREE.Vector2[] {
  const n = pts.length, r: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(n - 1, i + 1)];
    const d1 = b.clone().sub(a), d2 = c.clone().sub(b);
    if (i === 0) d1.copy(d2);
    if (i === n - 1) d2.copy(d1);
    d1.normalize(); d2.normalize();
    const n1 = normal(d1), n2 = normal(d2);
    const m = n1.clone().add(n2);
    if (m.lengthSq() < 1e-8) { r.push(b.clone().addScaledVector(n1, off)); continue; }
    m.normalize();
    const k = Math.min(3, 1 / Math.max(0.2, m.dot(n1)));
    r.push(b.clone().addScaledVector(m, off * k));
  }
  return r;
}

/** Franja entre dos corrimientos, como polígono cerrado. */
export function franja(pts: THREE.Vector2[], a: number, b: number): THREE.Vector2[] {
  return [...correr(pts, a), ...correr(pts, b).reverse()];
}

function largo(pts: THREE.Vector2[]): number {
  let s = 0; for (let i = 1; i < pts.length; i++) s += pts[i].distanceTo(pts[i - 1]); return s;
}

/** Muestras cada `paso` metros (y en cada vértice), con su distancia recorrida. */
function muestrear(pts: THREE.Vector2[], paso: number): { p: THREE.Vector2; s: number }[] {
  const r: { p: THREE.Vector2; s: number }[] = [{ p: pts[0].clone(), s: 0 }];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = a.distanceTo(b);
    const k = Math.max(1, Math.ceil(L / paso));
    for (let j = 1; j <= k; j++) r.push({ p: a.clone().lerp(b, j / k), s: s + L * j / k });
    s += L;
  }
  return r;
}

/** El tramo de la polilínea entre las distancias s0 y s1. */
function tramo(pts: THREE.Vector2[], s0: number, s1: number): THREE.Vector2[] {
  const r: THREE.Vector2[] = [];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], L = a.distanceTo(b);
    if (L < 1e-9) continue;
    const t0 = (s0 - s) / L, t1 = (s1 - s) / L;
    if (t1 >= 0 && t0 <= 1) {
      if (!r.length) r.push(a.clone().lerp(b, Math.max(0, t0)));
      r.push(a.clone().lerp(b, Math.min(1, t1)));
    }
    s += L;
  }
  return r;
}

/** Distancia del punto a la calle, SIN las puntas: más allá de donde termina
 *  una calle no hay calle (si no, cada punta cortaría un semicírculo ajeno). */
export function distanciaACalle(p: THREE.Vector2, pts: THREE.Vector2[]): number {
  let d = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], ab = pts[i].clone().sub(a), L2 = ab.lengthSq();
    if (L2 < 1e-12) continue;
    const t = p.clone().sub(a).dot(ab) / L2;
    if (t < 0 || t > 1) continue;
    d = Math.min(d, p.distanceTo(a.clone().addScaledVector(ab, t)));
  }
  // los quiebres de adentro también son calle (el lado de afuera de la vuelta)
  for (let i = 1; i < pts.length - 1; i++) d = Math.min(d, p.distanceTo(pts[i]));
  return d;
}

/** El temblor de la mano: chico, suave y siempre igual en el mismo lugar (así
 *  rearmar la red no hace «hervir» las líneas). */
function pulso(p: THREE.Vector2): THREE.Vector2 {
  const a = 0.035 * Math.sin(p.x * 0.9 + p.y * 1.3) + 0.02 * Math.sin(p.x * 2.7 - p.y * 1.9);
  const b = 0.035 * Math.sin(p.x * 1.1 - p.y * 0.8 + 1.7) + 0.02 * Math.sin(p.y * 2.9 + p.x * 1.6);
  return v2(p.x + a, p.y + b);
}

/** Los pedazos de una línea que quedan afuera de lo que `tapa` (por muestra). */
function cortar(linea: THREE.Vector2[], tapa: (p: THREE.Vector2) => boolean): THREE.Vector2[][] {
  const r: THREE.Vector2[][] = [];
  let actual: THREE.Vector2[] = [];
  for (const { p } of muestrear(linea, 0.25)) {
    if (tapa(p)) { if (actual.length > 1) r.push(actual); actual = []; }
    else actual.push(p);
  }
  if (actual.length > 1) r.push(actual);
  return r.filter((l) => largo(l) > 0.2).map((l) => l.map(pulso));
}

/** Tramos [s0, s1] del eje de la calle donde se cumple `en` (muestreado). */
function intervalos(eje: THREE.Vector2[], en: (p: THREE.Vector2) => boolean): [number, number][] {
  const r: [number, number][] = [];
  let ini = -1, ult = 0;
  for (const { p, s } of muestrear(eje, 0.1)) {
    if (en(p)) { if (ini < 0) ini = s; ult = s; }
    else if (ini >= 0) { r.push([ini, ult]); ini = -1; }
  }
  if (ini >= 0) r.push([ini, ult]);
  return r;
}

/** Las piezas de la calle `c` dentro de la red (con sus cruces). */
export function piezasDeCalle(c: CalleRed, red: CalleRed[]): PiezasCalle {
  const m = MEDIDAS[c.tipo], medio = m.calzada / 2, afuera = medio + m.vereda;
  const otras = red.filter((o) => o.id !== c.id && o.pts.length > 1);
  const dentro = (p: THREE.Vector2, extra: (o: CalleRed) => number) =>
    otras.some((o) => distanciaACalle(p, o.pts) < extra(o));
  const calzadaDe = (o: CalleRed) => MEDIDAS[o.tipo].calzada / 2;
  const bandaDe = (o: CalleRed) => MEDIDAS[o.tipo].calzada / 2 + MEDIDAS[o.tipo].vereda;

  const tinta: THREE.Vector2[][] = [];
  for (const lado of [1, -1]) {
    tinta.push(...cortar(correr(c.pts, lado * medio), (p) => dentro(p, calzadaDe)));
    tinta.push(...cortar(correr(c.pts, lado * afuera), (p) => dentro(p, bandaDe)));
  }

  const pintura: THREE.Vector2[][] = [];
  // la línea del medio: se corta antes del cruce (ahí va la senda)
  const libre = (p: THREE.Vector2) => !dentro(p, (o) => bandaDe(o) + 0.6);
  for (const [s0, s1] of intervalos(c.pts, libre)) {
    const tr = tramo(c.pts, s0, s1);
    if (tr.length < 2) continue;
    if (m.raya === 'doble') {
      pintura.push(franja(tr, 0.12, 0.27), franja(tr, -0.27, -0.12));
    } else {
      for (let s = s0 + m.hueco / 2; s + 0.3 < s1; s += m.trazo + m.hueco) {
        const d = tramo(c.pts, s, Math.min(s1, s + m.trazo));
        if (d.length > 1) pintura.push(franja(d, -0.07, 0.07));
      }
    }
  }
  // sendas peatonales: rayas a lo largo de la calle, alineadas con las veredas
  // de la que cruza
  for (const o of otras) {
    const mo = MEDIDAS[o.tipo], a = mo.calzada / 2, b = a + mo.vereda;
    const enSenda = (p: THREE.Vector2) => { const d = distanciaACalle(p, o.pts); return d >= a && d < b; };
    for (const [s0, s1] of intervalos(c.pts, enSenda)) {
      if (s1 - s0 < 0.6) continue;
      const tr = tramo(c.pts, s0 + 0.2, s1 - 0.2);
      if (tr.length < 2) continue;
      for (let k = -medio + 0.5; k + 0.45 <= medio - 0.3; k += 0.9) pintura.push(franja(tr, k, k + 0.45));
    }
  }

  return { vereda: franja(c.pts, afuera, -afuera), calzada: franja(c.pts, medio, -medio), pintura, tinta };
}

/** Un clic cerca de otra calle se pega a ella: a una punta o al eje. */
export function pegarARed(p: THREE.Vector2, red: CalleRed[]): { p: THREE.Vector2; eje?: CalleRed } {
  for (const o of red) for (const q of [o.pts[0], o.pts[o.pts.length - 1]]) if (q.distanceTo(p) < 1.2) return { p: q.clone() };
  let mejor: { p: THREE.Vector2; eje: CalleRed; d: number } | null = null;
  for (const o of red) {
    for (let i = 1; i < o.pts.length; i++) {
      const a = o.pts[i - 1], ab = o.pts[i].clone().sub(a), L2 = ab.lengthSq();
      if (L2 < 1e-12) continue;
      const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / L2, 0, 1);
      const f = a.clone().addScaledVector(ab, t), d = f.distanceTo(p);
      if (d < MEDIDAS[o.tipo].calzada / 2 && (!mejor || d < mejor.d)) mejor = { p: f, eje: o, d };
    }
  }
  return mejor ? { p: mejor.p, eje: mejor.eje } : { p };
}

/** Una calle que TERMINA sobre el eje de otra (una T) se estira hasta casi el
 *  cordón de enfrente: así la calzada de las dos se junta, la que llega corta el
 *  cordón de su lado y la otra lleva sendas a los dos lados del cruce. */
export function estirarPuntas(pts: THREE.Vector2[], ejeIni?: CalleRed, ejeFin?: CalleRed): THREE.Vector2[] {
  const r = pts.map((p) => p.clone());
  const n = r.length;
  if (n < 2) return r;
  if (ejeIni) r[0].addScaledVector(r[0].clone().sub(r[1]).normalize(), MEDIDAS[ejeIni.tipo].calzada / 2 * 0.9);
  if (ejeFin) r[n - 1].addScaledVector(r[n - 1].clone().sub(r[n - 2]).normalize(), MEDIDAS[ejeFin.tipo].calzada / 2 * 0.9);
  return r;
}
