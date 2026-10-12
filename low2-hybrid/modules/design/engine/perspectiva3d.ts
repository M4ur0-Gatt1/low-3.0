/* ══ PERSPECTIVA PARA LAYOUTS DE FONDO ══════════════════════════════════════
   Pedido de Mauro: «quiero que tire muchas líneas de punto de fuga ya
   predefinidos, con 1, 2 o 3; que se pueda cambiar el horizonte, girar la
   vista; que tenga esquemas para exteriores e interiores», para dibujar
   fondos en el módulo 2D.

   La idea que hace que todo sea exacto: las líneas NO se dibujan hacia un
   punto en la pantalla. Son rectas PARALELAS en el espacio (a lo largo de X,
   de Z y de la vertical Y) y la cámara las hace converger. Así, al subir el
   horizonte, inclinar o girar la vista, todas fugan bien sin acomodar nada.
   - 1 punto = la cámara mira a lo largo de Z: X y la vertical quedan
     paralelas en la imagen; fuga sólo Z.
   - 2 puntos = la cámara gira sobre la vertical: fugan X y Z, sobre el
     horizonte; las verticales siguen verticales.
   - 3 puntos = además se inclina: fuga también la vertical.

   Esquemas (en metros, el piso es y=0):
   - Calle: calzada, veredas y fachadas a los dos lados, con pisos y columnas.
   - Manzana: cuadras con edificios de distintas alturas y la cuadrícula del
     piso, vista desde una esquina.
   - Habitación: piso, paredes y techo cuadriculados, vista desde adentro.
   - Sólo líneas: un enrejado de rectas en los tres ejes, sin «cosas».

   «Mandar al 2D» renderiza las líneas (y lo modelado) del tamaño del cuadro
   del 2D, con fondo transparente, y calcula los puntos de fuga en esos mismos
   píxeles: el 2D los recibe como su perspectiva y el lápiz se imanta exacto. */
import * as THREE from 'three';

export type Esquema3D = 'calle' | 'manzana' | 'habitacion' | 'fuga';
export type Eje = 'x' | 'y' | 'z';

export interface Perspectiva3DAjustes {
  activa: boolean;
  esquema: Esquema3D;
  puntos: 1 | 2 | 3;
  /** altura de los ojos en metros: es la altura del horizonte */
  altura: number;
  /** giro de la vista sobre la vertical, en grados (+ = a la derecha) */
  giro: number;
  /** inclinación de la vista, en grados (+ = mirar hacia arriba) */
  inclinacion: number;
  /** lente en mm, con un sensor de 36 mm de ancho (el del 2D) */
  lente: number;
  densidad: 'pocas' | 'muchas';
}

export const AJUSTES_INICIALES: Perspectiva3DAjustes = {
  activa: false, esquema: 'calle', puntos: 1, altura: 1.6, giro: 0, inclinacion: 0,
  lente: 28, densidad: 'muchas',
};

export const COLOR_EJE: Record<Eje, string> = { x: '#F0450E', z: '#33B5E8', y: '#2ecc71' };
export const COLOR_HORIZONTE = '#FFB000';
const LARGO = 480;                     // las rectas llegan casi al plano lejano (500)

/** Dónde está parado el que mira, por esquema. */
const ESTACION: Record<Esquema3D, [number, number]> = {
  calle: [0, 10], manzana: [-20, 20], habitacion: [0, 0.6], fuga: [0, 6],
};

export function ajustesValidos(a: Partial<Perspectiva3DAjustes> | null | undefined): Perspectiva3DAjustes {
  const d = { ...AJUSTES_INICIALES, ...(a || {}) };
  const num = (v: unknown, def: number, lo: number, hi: number) => {
    const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  };
  return {
    activa: !!d.activa,
    esquema: (['calle', 'manzana', 'habitacion', 'fuga'] as const).includes(d.esquema) ? d.esquema : 'calle',
    puntos: d.puntos === 2 || d.puntos === 3 ? d.puntos : 1,
    altura: num(d.altura, 1.6, 0.1, 200),
    giro: num(d.giro, 0, -180, 180),
    inclinacion: num(d.inclinacion, 0, -85, 85),
    lente: num(d.lente, 28, 10, 200),
    densidad: d.densidad === 'pocas' ? 'pocas' : 'muchas',
  };
}

/** Los encuadres listos de 1, 2 y 3 puntos para cada esquema. */
export function preset(esquema: Esquema3D, puntos: 1 | 2 | 3): Partial<Perspectiva3DAjustes> {
  const interior = esquema === 'habitacion';
  if (puntos === 1) return { puntos, giro: 0, inclinacion: 0, altura: interior ? 1.5 : 1.6 };
  if (puntos === 2) return { puntos, giro: interior ? -30 : esquema === 'manzana' ? 45 : 35, inclinacion: 0, altura: interior ? 1.5 : 1.6 };
  // 3 puntos: afuera, desde arriba (vista de pájaro); adentro, desde abajo
  return interior
    ? { puntos, giro: -30, inclinacion: 22, altura: 1.0 }
    : { puntos, giro: 35, inclinacion: -38, altura: esquema === 'fuga' ? 14 : 34 };
}

/* ── la geometría de los esquemas: segmentos agrupados por eje ── */
type Familias = Record<Eje, number[]>;
function nuevas(): Familias { return { x: [], y: [], z: [] }; }
function seg(f: Familias, eje: Eje, a: number[], b: number[]) { f[eje].push(a[0], a[1], a[2], b[0], b[1], b[2]); }
function rango(a: number, b: number, paso: number): number[] {
  const out: number[] = [];
  const n = Math.floor((b - a) / paso + 1e-6);
  for (let i = 0; i <= n; i++) out.push(a + i * paso);
  return out;
}
/** Cuadrícula en un piso (y fijo): rectas en X y en Z. */
function piso(f: Familias, x0: number, x1: number, z0: number, z1: number, y: number, px: number, pz = px) {
  for (const z of rango(z0, z1, pz)) seg(f, 'x', [x0, y, z], [x1, y, z]);
  for (const x of rango(x0, x1, px)) seg(f, 'z', [x, y, z0], [x, y, z1]);
}
/** Pared a lo largo de Z (x fijo): rectas en Z (pisos) y verticales. */
function paredZ(f: Familias, x: number, z0: number, z1: number, y0: number, y1: number, py: number, pz: number) {
  for (const y of rango(y0, y1, py)) seg(f, 'z', [x, y, z0], [x, y, z1]);
  for (const z of rango(z0, z1, pz)) seg(f, 'y', [x, y0, z], [x, y1, z]);
}
/** Pared a lo largo de X (z fijo): rectas en X y verticales. */
function paredX(f: Familias, z: number, x0: number, x1: number, y0: number, y1: number, py: number, px: number) {
  for (const y of rango(y0, y1, py)) seg(f, 'x', [x0, y, z], [x1, y, z]);
  for (const x of rango(x0, x1, px)) seg(f, 'y', [x, y0, z], [x, y1, z]);
}

export function construirEsquema(esquema: Esquema3D, densidad: 'pocas' | 'muchas'): Familias {
  const f = nuevas();
  const k = densidad === 'muchas' ? 1 : 2;
  if (esquema === 'calle') {
    // calzada de 10 m, veredas de 3 m, fachadas a x=±8 de 18 m de alto
    piso(f, -8, 8, -LARGO, 14, 0, 2 * k, 4 * k);
    for (const x of [-5, 5]) seg(f, 'z', [x, 0.15, -LARGO], [x, 0.15, 14]);   // cordones
    for (const s of [-1, 1]) {
      paredZ(f, 8 * s, -LARGO, 14, 0, 18, 3 * k, 4 * k);
      seg(f, 'y', [8 * s, 0, 14], [8 * s, 60, 14]);
    }
  } else if (esquema === 'manzana') {
    // cuadras de 24 m con calles de 12 m alrededor de una PLAZA (las cuatro del
    // medio no están): la cámara, en la plaza, ve en diagonal la esquina de una cuadra
    const alturas = [15, 27, 12, 33, 21, 9, 24, 18, 30, 12, 21, 15, 36, 18, 24, 12];
    let n = 0;
    for (const i of [-2, -1, 0, 1]) for (const j of [-2, -1, 0, 1]) {
      if ((i === -1 || i === 0) && (j === -1 || j === 0)) continue;
      const x0 = i * 36 + 6, z0 = j * 36 + 6, x1 = x0 + 24, z1 = z0 + 24, h = alturas[n++ % alturas.length];
      paredX(f, z0, x0, x1, 0, h, 3 * k, 6 * k); paredX(f, z1, x0, x1, 0, h, 3 * k, 6 * k);
      paredZ(f, x0, z0, z1, 0, h, 3 * k, 6 * k); paredZ(f, x1, z0, z1, 0, h, 3 * k, 6 * k);
      piso(f, x0, x1, z0, z1, h, 24, 24);   // el borde del techo
    }
    piso(f, -LARGO / 2, LARGO / 2, -LARGO / 2, LARGO / 2, 0, 6 * k);
  } else if (esquema === 'habitacion') {
    // 6 m de ancho, 8 de fondo, 2,8 de alto; la cámara junto a la pared de adelante
    const x0 = -3, x1 = 3, z0 = -8, z1 = 1, h = 2.8, p = 0.5 * k;
    piso(f, x0, x1, z0, z1, 0, p);
    piso(f, x0, x1, z0, z1, h, 2 * p);
    paredX(f, z0, x0, x1, 0, h, p, p);
    paredZ(f, x0, z0, z1, 0, h, p, p);
    paredZ(f, x1, z0, z1, 0, h, p, p);
    // una puerta y una ventana, para tener escala
    paredX(f, z0 + 0.01, -2.4, -1.5, 0, 2.05, 2.05, 0.9);
    paredZ(f, x1 - 0.01, -5.5, -3.5, 0.9, 2.1, 1.2, 2);
  } else {
    // sólo líneas: un enrejado en los tres ejes
    const p = 4 * k;
    for (const y of rango(0, 24, 3 * k)) for (const z of rango(-60, 0, p)) seg(f, 'x', [-LARGO, y, z], [LARGO, y, z]);
    for (const y of rango(0, 24, 3 * k)) for (const x of rango(-24, 24, p)) seg(f, 'z', [x, y, -LARGO], [x, y, 20]);
    for (const x of rango(-24, 24, p)) for (const z of rango(-60, 0, p)) seg(f, 'y', [x, -LARGO / 4, z], [x, LARGO / 2, z]);
  }
  return f;
}

/* ── la cámara: dónde mira según altura, giro e inclinación ── */
export function direccion(giroGrados: number, inclinacionGrados: number): THREE.Vector3 {
  const g = THREE.MathUtils.degToRad(giroGrados), i = THREE.MathUtils.degToRad(inclinacionGrados);
  return new THREE.Vector3(Math.sin(g) * Math.cos(i), Math.sin(i), -Math.cos(g) * Math.cos(i));
}
export function posicionCamara(a: Perspectiva3DAjustes): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const [sx, sz] = ESTACION[a.esquema];
  const pos = new THREE.Vector3(sx, a.altura, sz);
  return { pos, target: pos.clone().add(direccion(a.giro, a.inclinacion).multiplyScalar(10)) };
}
/** Lo inverso: altura, giro e inclinación de una cámara (tras orbitar con el mouse). */
export function leerCamara(cam: THREE.Camera): { altura: number; giro: number; inclinacion: number } {
  const d = new THREE.Vector3(); cam.getWorldDirection(d);
  const giro = THREE.MathUtils.radToDeg(Math.atan2(d.x, -d.z));
  const inclinacion = THREE.MathUtils.radToDeg(Math.asin(Math.max(-1, Math.min(1, d.y))));
  return { altura: Math.round(cam.position.y * 100) / 100, giro: Math.round(giro), inclinacion: Math.round(inclinacion) };
}
/** Campo de visión HORIZONTAL del lente (sensor de 36 mm). */
export const fovHorizontal = (lente: number) => 2 * Math.atan(36 / (2 * lente));

/** El rectángulo del cuadro del 2D dentro de la vista (con margen). */
export function marcoEnVista(w: number, h: number, aspecto: number) {
  let rw = w * 0.9, rh = rw / aspecto;
  if (rh > h * 0.86) { rh = h * 0.86; rw = rh * aspecto; }
  return { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
}
/** FOV vertical de la vista para que el MARCO muestre exactamente el lente. */
export function fovVista(lente: number, h: number, marcoW: number): number {
  const k = (marcoW / 2) / Math.tan(fovHorizontal(lente) / 2);
  return THREE.MathUtils.radToDeg(2 * Math.atan((h / 2) / k));
}
/** FOV vertical de la cámara de render (del tamaño del cuadro del 2D). */
export const fovRender = (lente: number, aspecto: number) =>
  THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(fovHorizontal(lente) / 2) / aspecto));

export interface PuntoDeFuga { x: number; y: number; eje: Eje; color: string }
/** Los puntos de fuga de los tres ejes en píxeles de un rectángulo w×h de la
 *  cámara. Un eje casi paralelo a la imagen no converge: va en `paralelas`
 *  con su dirección en pantalla (en 1 punto, las horizontales y verticales). */
export function puntosDeFuga(cam: THREE.PerspectiveCamera, w: number, h: number) {
  cam.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const vps: PuntoDeFuga[] = [];
  const paralelas: { ux: number; uy: number; eje: Eje }[] = [];
  const aPix = (v: THREE.Vector3) => { const n = v.clone().project(cam); return { x: (n.x + 1) / 2 * w, y: (1 - n.y) / 2 * h }; };
  for (const eje of ['x', 'z', 'y'] as Eje[]) {
    const a = new THREE.Vector3(eje === 'x' ? 1 : 0, eje === 'y' ? 1 : 0, eje === 'z' ? 1 : 0);
    const al = fwd.dot(a);
    // en pantalla, ¿cuánto se aleja el punto de fuga? tan(ángulo) en unidades
    // del medio campo: más de ~40 veces el cuadro es «paralelo» a efectos prácticos
    const lejos = Math.abs(al) < 1e-9 ? Infinity : Math.sqrt(Math.max(0, 1 - al * al)) / Math.abs(al);
    const tanMedio = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    if (lejos / tanMedio > 40) {
      const p0 = aPix(cam.position.clone().add(fwd.clone().multiplyScalar(10)));
      const p1 = aPix(cam.position.clone().add(fwd.clone().multiplyScalar(10)).add(a));
      const n = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
      paralelas.push({ ux: (p1.x - p0.x) / n, uy: (p1.y - p0.y) / n, eje });
      continue;
    }
    const d = al >= 0 ? a : a.clone().negate();   // la dirección que va hacia adelante
    const p = aPix(cam.position.clone().add(d.multiplyScalar(1e5)));
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    vps.push({ x: p.x, y: p.y, eje, color: COLOR_EJE[eje] });
  }
  return { vps, paralelas };
}

/** El horizonte en pantalla: la recta por donde fugan TODAS las horizontales.
 *  Se arma con dos direcciones horizontales que van hacia adelante. Null si se
 *  mira derecho hacia arriba o hacia abajo. */
export function horizonte(cam: THREE.PerspectiveCamera, w: number, h: number) {
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const plano = new THREE.Vector3(fwd.x, 0, fwd.z);
  if (plano.lengthSq() < 1e-6) return null;
  plano.normalize();
  const lado = new THREE.Vector3(-plano.z, 0, plano.x);
  const aPix = (v: THREE.Vector3) => { const n = v.clone().project(cam); return { x: (n.x + 1) / 2 * w, y: (1 - n.y) / 2 * h }; };
  const a = aPix(cam.position.clone().add(plano.clone().add(lado.clone().multiplyScalar(0.3)).multiplyScalar(1e5)));
  const b = aPix(cam.position.clone().add(plano.clone().sub(lado.clone().multiplyScalar(0.3)).multiplyScalar(1e5)));
  if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) return null;
  return { a, b };
}

/* ── las líneas en la escena ── */
export class Perspectiva3D {
  readonly group = new THREE.Group();
  private ultima = '';

  constructor() {
    this.group.name = 'perspectiva-3d';
    this.group.visible = false;
    this.group.userData.noPick = true;
  }

  /** Reconstruye las líneas sólo si cambió el esquema o la densidad. */
  actualizar(a: Perspectiva3DAjustes, oscuro: boolean): void {
    this.group.visible = a.activa;
    const firma = `${a.esquema}|${a.densidad}|${oscuro}`;
    if (!a.activa || firma === this.ultima) return;
    this.ultima = firma;
    this.liberar();
    const familias = construirEsquema(a.esquema, a.densidad);
    for (const eje of ['x', 'z', 'y'] as Eje[]) {
      if (!familias[eje].length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(familias[eje], 3));
      const mat = new THREE.LineBasicMaterial({
        color: COLOR_EJE[eje], transparent: true, opacity: oscuro ? 0.62 : 0.55,
        depthWrite: false, fog: false,
      });
      const lineas = new THREE.LineSegments(geo, mat);
      lineas.name = 'perspectiva-' + eje;
      lineas.userData.eje = eje;
      lineas.frustumCulled = false;
      this.group.add(lineas);
    }
  }

  cantidadDeLineas(): number {
    let n = 0;
    this.group.children.forEach((c) => {
      const g = (c as THREE.LineSegments).geometry; n += (g?.getAttribute('position')?.count || 0) / 2;
    });
    return n;
  }

  private liberar(): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      const l = c as THREE.LineSegments;
      l.geometry?.dispose();
      (l.material as THREE.Material)?.dispose();
    }
  }

  dispose(): void { this.liberar(); this.ultima = ''; }
}

const NS = 'http://www.w3.org/2000/svg';
function el(tag: string, attrs: Record<string, string | number>, padre?: Element): SVGElement {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  if (padre) padre.appendChild(n);
  return n as SVGElement;
}

/** Lo que se ve encima de la vista: el marco del cuadro del 2D (afuera, más
 *  oscuro), el horizonte, y los puntos de fuga con su abanico de rectas. */
export function pintarSuperposicion(svg: SVGSVGElement, cam: THREE.PerspectiveCamera, w: number, h: number, aspecto: number): void {
  while (svg.lastChild) svg.removeChild(svg.lastChild);
  const m = marcoEnVista(w, h, aspecto);
  el('path', { d: `M0 0H${w}V${h}H0Z M${m.x} ${m.y}V${m.y + m.h}H${m.x + m.w}V${m.y}Z`, fill: 'rgba(0,0,0,0.28)', 'fill-rule': 'evenodd' }, svg);
  el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, fill: 'none', stroke: '#F0450E', 'stroke-width': 1.5, 'data-p': 'marco' }, svg);
  const hz = horizonte(cam, w, h);
  if (hz) {
    const dx = hz.b.x - hz.a.x, dy = hz.b.y - hz.a.y, n = Math.hypot(dx, dy) || 1, L = (w + h) * 4;
    el('line', { x1: hz.a.x - dx / n * L, y1: hz.a.y - dy / n * L, x2: hz.a.x + dx / n * L, y2: hz.a.y + dy / n * L,
      stroke: COLOR_HORIZONTE, 'stroke-width': 1.6, opacity: 0.9, 'data-p': 'horizonte' }, svg);
  }
  const { vps } = puntosDeFuga(cam, w, h);
  for (const v of vps) {
    if (Math.abs(v.x) > w * 30 || Math.abs(v.y) > h * 30) continue;
    const g = el('g', { stroke: v.color, 'data-p': 'vp-' + v.eje }, svg);
    const span = (w + h) * 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      el('line', { x1: v.x, y1: v.y, x2: v.x + Math.cos(a) * span, y2: v.y + Math.sin(a) * span, 'stroke-width': 1, 'stroke-opacity': 0.16 }, g);
    }
    el('circle', { cx: v.x, cy: v.y, r: 6, fill: '#fff', 'stroke-width': 2.5 }, g);
    const t = el('text', { x: v.x + 10, y: v.y - 8, fill: v.color, stroke: 'none', 'font-size': 12, 'font-weight': 700, 'font-family': 'Figtree, sans-serif' }, g);
    t.textContent = v.eje.toUpperCase();
  }
}
