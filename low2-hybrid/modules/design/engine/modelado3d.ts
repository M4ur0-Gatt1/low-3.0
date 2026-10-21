/* ══════════════════════════════════════════════════════════════════════════
   EL MODELADO DEL TALLER DE PERSONAJE (v3.41)
   Mauro: «copiá los mejores programas de modelado 3D para esta sección», «que
   el sistema sea lo mejor de lo mejor», y la regla de siempre: «sólo se puede
   dibujar sobre la superficie creada».

   Lo que se copió (el funcionamiento y los atajos, no el código):
   - de ZBrush: Extract (sacar una pieza con grosor de lo enmascarado), Lazy
     Mouse, máscara con Ctrl, DamStandard (el surco), ClayBuildup;
   - de Blender (modo Escultura): los pinceles Draw, Clay Strips, Layer,
     Scrape/Fill, Snake Hook, Nudge, Grab; las curvas de caída; «sólo caras de
     frente»; Mask Extract con suavizado; los filtros de malla; F / Shift+F;
   - de Nomad Sculpt: las CAPAS de escultura con un dial de intensidad.

   Este módulo tiene lo que no depende de la clase del personaje: las piezas
   (ropa, pelo, accesorios) como cáscaras sobre la piel, cómo se guardan los
   triángulos, las curvas de caída y la validación de los datos nuevos.
   @module design/engine/modelado3d
   ══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/** Una CAPA de escultura (como en Nomad): lo esculpido en ella, por un dial. */
export interface CapaEscultura {
  id: string;
  nombre: string;
  /** la intensidad: 0 apagada, 1 como se esculpió (de −1 a 2) */
  fuerza: number;
  /** lo esculpido, «e1:…» (corrimientos desde la piel sin la capa) */
  e?: string;
}
/** Una PIEZA: una cáscara con grosor sobre una región de la piel (la ropa, el
 *  pelo, una armadura). Se rehace desde la piel: si se esculpe o se engorda el
 *  cuerpo, la pieza acompaña. Va con los mismos huesos. */
export interface Pieza {
  id: string;
  nombre: string;
  color: string;
  /** el grosor, en metros (de 0,3 mm a 6 cm) */
  grosor: number;
  /** cuánto se suaviza (0 calca la piel, 1 la tela lisa que no marca los músculos) */
  suave: number;
  /** dónde va: la MÁSCARA con la que se levantó, por punto de la piel («m1:…»);
   *  el borde sigue la línea donde la máscara vale la mitad */
  mascara: string;
  visible?: boolean;
}

export const CAPA_FUERZA: [number, number] = [-1, 2];
export const PIEZA_GROSOR: [number, number] = [0.0003, 0.06];

/** Las CURVAS DE CAÍDA del pincel (las de Blender): cuánto pesa a la distancia
 *  x del centro (0 el centro, 1 el borde, después de la dureza). */
export type CaidaPincel = 'suave' | 'esfera' | 'punta' | 'lineal' | 'meseta';
export const CAIDAS: { id: CaidaPincel; nombre: string; ayuda: string }[] = [
  { id: 'suave', nombre: 'Suave', ayuda: 'Se desvanece parejo desde el centro (la de siempre)' },
  { id: 'esfera', nombre: 'Esfera', ayuda: 'Redonda y llena: como apretar con una bola' },
  { id: 'punta', nombre: 'Punta', ayuda: 'Fuerte en el centro y enseguida se apaga: detalles finos' },
  { id: 'lineal', nombre: 'Lineal', ayuda: 'Baja derecho del centro al borde' },
  { id: 'meseta', nombre: 'Meseta', ayuda: 'Pareja casi hasta el borde: planos y bloques' },
];
export function curvaCaida(c: CaidaPincel | undefined, x: number): number {
  if (x <= 0) return 1;
  if (x >= 1) return 0;
  switch (c) {
    case 'esfera': return Math.sqrt(1 - x * x);
    case 'punta': return (1 - x) ** 3;
    case 'lineal': return 1 - x;
    case 'meseta': { const t = Math.max(0, (x - 0.7) / 0.3); return 1 - t * t * (3 - 2 * t); }
    default: { const t = 1 - x * x; return t * t; }
  }
}

const idValido = (v: unknown) => typeof v === 'string' && /^[a-z0-9-]{1,40}$/i.test(v);
const nombreValido = (v: unknown, d: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : d);
export function capasValidas(x: unknown): CapaEscultura[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: CapaEscultura[] = [];
  for (const c of x.slice(0, 32)) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Partial<CapaEscultura>;
    if (!idValido(o.id) || out.some((y) => y.id === o.id)) continue;
    const f = typeof o.fuerza === 'number' && Number.isFinite(o.fuerza) ? Math.max(CAPA_FUERZA[0], Math.min(CAPA_FUERZA[1], o.fuerza)) : 1;
    const e = typeof o.e === 'string' && /^e1:[A-Za-z0-9+/=]*$/.test(o.e) && o.e.length <= 16e6 ? o.e : undefined;
    out.push({ id: o.id as string, nombre: nombreValido(o.nombre, 'Capa'), fuerza: f, ...(e ? { e } : {}) });
  }
  return out.length ? out : undefined;
}
export function piezasValidas(x: unknown): Pieza[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const out: Pieza[] = [];
  for (const c of x.slice(0, 64)) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Partial<Pieza>;
    if (!idValido(o.id) || out.some((y) => y.id === o.id)) continue;
    if (typeof o.mascara !== 'string' || !/^m1:[A-Za-z0-9+/=]*$/.test(o.mascara) || o.mascara.length > 12e6) continue;
    const g = typeof o.grosor === 'number' && Number.isFinite(o.grosor) ? Math.max(PIEZA_GROSOR[0], Math.min(PIEZA_GROSOR[1], o.grosor)) : 0.004;
    const s = typeof o.suave === 'number' && Number.isFinite(o.suave) ? Math.max(0, Math.min(1, o.suave)) : 0.3;
    out.push({ id: o.id as string, nombre: nombreValido(o.nombre, 'Pieza'), color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#6f7d8c',
      grosor: g, suave: s, mascara: o.mascara, ...(o.visible === false ? { visible: false } : {}) });
  }
  return out.length ? out : undefined;
}
let cuentaIds = 0;
export function idNuevo(prefijo: string): string { return prefijo + '-' + Date.now().toString(36) + '-' + (cuentaIds++).toString(36); }

/* ── la máscara de una pieza: los puntos con algo de máscara (índice por
   diferencias en varint) y su valor en un byte ── */
export function mascaraATexto(m: ArrayLike<number>): string {
  const bytes: number[] = [];
  let prev = -1;
  for (let i = 0; i < m.length; i++) {
    const v = Math.round(Math.max(0, Math.min(1, m[i])) * 255);
    if (v < 1) continue;
    let d = i - prev; prev = i;
    while (d >= 0x80) { bytes.push((d & 0x7f) | 0x80); d >>>= 7; }
    bytes.push(d, v);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return 'm1:' + btoa(s);
}
export function mascaraDeTexto(t: string, n: number): Float32Array {
  const out = new Float32Array(n);
  try {
    const s = atob(t.slice(3));
    let prev = -1, v = 0, sh = 0;
    for (let k = 0; k < s.length; k++) {
      const b = s.charCodeAt(k);
      v |= (b & 0x7f) << sh; sh += 7;
      if (!(b & 0x80)) { prev += v; v = 0; sh = 0; k++; if (prev < n && k < s.length) out[prev] = s.charCodeAt(k) / 255; }
    }
  } catch { /* texto roto: sin pieza */ }
  return out;
}

/** Lo que hace falta de la piel para levantar una pieza. */
export interface PielParaPieza {
  pos: Float32Array;          // la piel en reposo (como está: esculpida, con contextura)
  nrm: Float32Array;          // sus normales (soldadas)
  idx: ArrayLike<number>;
  soldado: Int32Array;        // vértice → grupo (las costuras)
  grupos: number[][];
  skinIndex: THREE.BufferAttribute;
  skinWeight: THREE.BufferAttribute;
}

/** LEVANTAR UNA PIEZA (el Extract de ZBrush, el Mask Extract de Blender): la
 *  región de la piel donde la máscara pasa de la mitad, corrida por su normal el
 *  grosor pedido, con un canto que baja hasta la piel (el borde de la tela).
 *  - El borde CORTA los triángulos justo donde la máscara vale la mitad (como
 *    unas curvas de nivel): sale una línea limpia, no la escalera de triángulos
 *    enteros que se ve en otros programas (medido: el escote y las sisas salían
 *    en serrucho).
 *  - Un vértice por punto soldado (la pieza no tiene textura: sin costuras).
 *  - La tela se alisa según `suave` (Taubin: alisar sin encoger) y nunca se mete
 *    en la piel. */
export function levantarPieza(piel: PielParaPieza, mascara: Float32Array, grosor: number, suave: number): THREE.BufferGeometry | null {
  const { pos, nrm, idx, soldado, grupos } = piel;
  const nG = grupos.length, mg = new Float32Array(nG);
  grupos.forEach((l, g) => { mg[g] = mascara[l[0]] ?? 0; });
  // los vértices de la pieza: los de un punto soldado o los de un corte en una arista
  const local = new Map<number, number>(), fuentes: { a: number; b: number; t: number }[] = [];
  const dePunto = (g: number) => { let k = local.get(g); if (k === undefined) { k = fuentes.length; local.set(g, k); fuentes.push({ a: g, b: g, t: 0 }); } return k; };
  const corte = new Map<number, number>();
  const deCorte = (g1: number, g2: number) => {
    const a = Math.min(g1, g2), b = Math.max(g1, g2), key = a * nG + b;
    let k = corte.get(key);
    if (k === undefined) {
      const tt = Math.max(0.02, Math.min(0.98, (0.5 - mg[a]) / ((mg[b] - mg[a]) || 1e-9)));
      k = fuentes.length; corte.set(key, k); fuentes.push({ a, b, t: tt });
    }
    return k;
  };
  const caras: number[] = [];
  for (let f = 0; f < idx.length; f += 3) {
    const g = [soldado[idx[f]], soldado[idx[f + 1]], soldado[idx[f + 2]]];
    if (g[0] === g[1] || g[1] === g[2] || g[0] === g[2]) continue;
    const den = g.map((x) => mg[x] >= 0.5);
    if (!den[0] && !den[1] && !den[2]) continue;
    if (den[0] && den[1] && den[2]) { caras.push(dePunto(g[0]), dePunto(g[1]), dePunto(g[2])); continue; }
    // el polígono de lo de adentro (3 o 4 puntos), en el orden del triángulo
    const poli: number[] = [];
    for (let c = 0; c < 3; c++) {
      const a = g[c], b = g[(c + 1) % 3];
      if (den[c]) poli.push(dePunto(a));
      if (den[c] !== den[(c + 1) % 3]) poli.push(deCorte(a, b));
    }
    for (let k = 1; k + 1 < poli.length; k++) caras.push(poli[0], poli[k], poli[k + 1]);
  }
  const n = fuentes.length;
  if (!n || !caras.length) return null;
  // vecinos y aristas (una arista usada por una sola cara es borde)
  const vec: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const aristas = new Map<number, { a: number; b: number; k: number }>();
  for (let f = 0; f < caras.length; f += 3) for (let c = 0; c < 3; c++) {
    const a = caras[f + c], b = caras[f + ((c + 1) % 3)];
    vec[a].add(b); vec[b].add(a);
    const key = Math.min(a, b) * n + Math.max(a, b), e = aristas.get(key);
    if (e) e.k++; else aristas.set(key, { a, b, k: 1 });
  }
  const borde = new Uint8Array(n), vecBorde: number[][] = Array.from({ length: n }, () => []);
  const bordes: [number, number][] = [];
  for (const e of aristas.values()) if (e.k === 1) {
    borde[e.a] = 1; borde[e.b] = 1; vecBorde[e.a].push(e.b); vecBorde[e.b].push(e.a); bordes.push([e.a, e.b]);
  }
  const V = vec.map((s) => [...s]);
  // la piel y la normal de cada punto (de su primer vértice: están soldadas); en un
  // corte, lo de los dos extremos de la arista
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const { a, b, t: tt } = fuentes[k], ia = grupos[a][0], ib = grupos[b][0];
    for (let c = 0; c < 3; c++) {
      P[k * 3 + c] = pos[ia * 3 + c] * (1 - tt) + pos[ib * 3 + c] * tt;
      N[k * 3 + c] = nrm[ia * 3 + c] * (1 - tt) + nrm[ib * 3 + c] * tt;
    }
  }
  // normales alisadas: con mucho grosor, las de una piel con detalle se cruzaban
  const pasar = (A: Float32Array, veces: number, vs: number[][], fijo?: Uint8Array, factor = 0.5) => {
    const aux = new Float32Array(A.length);
    for (let it = 0; it < veces; it++) {
      for (let k = 0; k < n; k++) {
        const l = vs[k];
        if (!l.length || (fijo && fijo[k])) { aux[k * 3] = A[k * 3]; aux[k * 3 + 1] = A[k * 3 + 1]; aux[k * 3 + 2] = A[k * 3 + 2]; continue; }
        let x = 0, y = 0, z = 0;
        for (const h of l) { x += A[h * 3]; y += A[h * 3 + 1]; z += A[h * 3 + 2]; }
        aux[k * 3] = A[k * 3] + (x / l.length - A[k * 3]) * factor;
        aux[k * 3 + 1] = A[k * 3 + 1] + (y / l.length - A[k * 3 + 1]) * factor;
        aux[k * 3 + 2] = A[k * 3 + 2] + (z / l.length - A[k * 3 + 2]) * factor;
      }
      A.set(aux);
    }
  };
  pasar(N, 2 + Math.round(suave * 6 + grosor / 0.004), V);
  for (let k = 0; k < n; k++) { const m = Math.hypot(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]) || 1; N[k * 3] /= m; N[k * 3 + 1] /= m; N[k * 3 + 2] /= m; }
  // el borde, apenas alisado a lo largo de sí mismo (el corte ya lo deja limpio); en
  // cada pasada vuelve a apoyarse sobre la piel (alisado, cortaba camino y se
  // hundía: la piel asomaba por el canto)
  const B = P.slice(), soloBorde = vecBorde.map((l, k) => (borde[k] ? l : []));
  for (let it = 0, veces = 2 + Math.round(suave * 6); it < veces; it++) {
    pasar(B, 1, soloBorde);
    for (let k = 0; k < n; k++) {
      if (!borde[k]) continue;
      const d = (B[k * 3] - P[k * 3]) * N[k * 3] + (B[k * 3 + 1] - P[k * 3 + 1]) * N[k * 3 + 1] + (B[k * 3 + 2] - P[k * 3 + 2]) * N[k * 3 + 2];
      if (d < 0) for (let c = 0; c < 3; c++) B[k * 3 + c] -= N[k * 3 + c] * d;
    }
  }
  // la cara de afuera: la piel + el grosor; la tela se alisa sin encoger (Taubin)
  const despegue = Math.min(0.0006, grosor * 0.3);
  const O = new Float32Array(n * 3);
  for (let k = 0; k < n * 3; k++) O[k] = B[k] + N[k] * grosor;
  const veces = Math.round(suave * 30);
  for (let it = 0; it < veces; it++) { pasar(O, 1, V, borde, 0.5); pasar(O, 1, V, borde, -0.53); }
  // nunca adentro de la piel: lo que el alisado hundió vuelve a quedar arriba
  for (let k = 0; k < n; k++) {
    const d = (O[k * 3] - P[k * 3]) * N[k * 3] + (O[k * 3 + 1] - P[k * 3 + 1]) * N[k * 3 + 1] + (O[k * 3 + 2] - P[k * 3 + 2]) * N[k * 3 + 2];
    const min = Math.min(grosor, despegue * 2);
    if (d < min) for (let c = 0; c < 3; c++) O[k * 3 + c] += N[k * 3 + c] * (min - d);
  }
  // la malla: afuera (un punto por grupo) + el canto (puntos propios, para que
  // la luz del canto no ensucie la de afuera)
  const nb = bordes.length;
  const total = n + nb * 4;
  const posA = new Float32Array(total * 3);
  posA.set(O);
  const index: number[] = caras.slice();
  const fuente = new Int32Array(total);
  const deFuente = (k: number) => { const f = fuentes[k]; return grupos[f.t < 0.5 ? f.a : f.b][0]; };
  for (let k = 0; k < n; k++) fuente[k] = deFuente(k);
  bordes.forEach(([a, b], e) => {
    const o = n + e * 4;
    const pone = (k: number, v: number, adentro: boolean) => {
      for (let c = 0; c < 3; c++) posA[k * 3 + c] = adentro ? B[v * 3 + c] + N[v * 3 + c] * despegue : O[v * 3 + c];
      fuente[k] = deFuente(v);
    };
    pone(o, a, false); pone(o + 1, b, false); pone(o + 2, b, true); pone(o + 3, a, true);
    index.push(o, o + 3, o + 2, o, o + 2, o + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(posA, 3));
  // los huesos: los del punto de la piel de donde sale cada uno (en un corte, la
  // mezcla de los dos extremos: los cuatro que más pesan)
  const SI = new (piel.skinIndex.array.constructor as { new (n: number): Uint16Array })(total * 4), SW = new Float32Array(total * 4);
  const huesosDe = new Map<number, number>();
  const ponerHuesos = (k: number, v: number) => {
    const { a, b, t: tt } = fuentes[v], ia = grupos[a][0], ib = grupos[b][0];
    huesosDe.clear();
    for (let c = 0; c < 4; c++) {
      const wa = piel.skinWeight.getComponent(ia, c) * (1 - tt), wb = piel.skinWeight.getComponent(ib, c) * tt;
      if (wa > 0) { const h = piel.skinIndex.getComponent(ia, c); huesosDe.set(h, (huesosDe.get(h) ?? 0) + wa); }
      if (wb > 0) { const h = piel.skinIndex.getComponent(ib, c); huesosDe.set(h, (huesosDe.get(h) ?? 0) + wb); }
    }
    const top = [...huesosDe].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = top.reduce((s, x) => s + x[1], 0) || 1;
    top.forEach(([h, w], c) => { SI[k * 4 + c] = h; SW[k * 4 + c] = w / tot; });
  };
  for (let k = 0; k < n; k++) ponerHuesos(k, k);
  bordes.forEach(([a, b], e) => { const o = n + e * 4; ponerHuesos(o, a); ponerHuesos(o + 1, b); ponerHuesos(o + 2, b); ponerHuesos(o + 3, a); });
  g.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  g.setIndex(index);
  g.computeVertexNormals();
  g.userData.fuente = fuente;
  return g;
}
