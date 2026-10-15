/* ══ LA CÁMARA DEL LAYOUT ═══════════════════════════════════════════════════
   v3.29.3 — Mauro: «esa vista de calle es de lo más inútil y tiene mucho
   ruido». Se fueron los ESQUEMAS (Calle, Manzana, Habitación, Sólo líneas):
   eran enrejados de líneas de colores que tapaban la vista y no servían para
   apoyar nada. El estudio vuelve a la forma de Feather: el espacio se arma con
   superficies (el piso, guías, cajas) y la cámara en perspectiva hace fugar
   todo sola. De acá queda lo que sí sirve: la cámara (altura de los ojos,
   giro, inclinación, lente), el marco del cuadro del 2D, el horizonte, los
   puntos de fuga marcados y «Mandar al 2D».
   Los tipos `Esquema3D`, `esquema` y `densidad` se conservan sólo para leer
   archivos .low3d viejos sin error.

   La idea que hace que todo sea exacto: las líneas NO se dibujan hacia un
   punto en la pantalla. Son rectas PARALELAS en el espacio (a lo largo de X,
   de Z y de la vertical Y) y la cámara las hace converger. Así, al subir el
   horizonte, inclinar o girar la vista, todas fugan bien sin acomodar nada.
   - 1 punto = la cámara mira a lo largo de Z: X y la vertical quedan
     paralelas en la imagen; fuga sólo Z.
   - 2 puntos = la cámara gira sobre la vertical: fugan X y Z, sobre el
     horizonte; las verticales siguen verticales.
   - 3 puntos = además se inclina: fuga también la vertical.

   «Mandar al 2D» renderiza lo dibujado y modelado del tamaño del cuadro
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

/** Los encuadres de la cámara, por cantidad de puntos de fuga que se ven:
 *  de frente fuga una sola dirección; en esquina, las dos horizontales;
 *  desde arriba o desde abajo, también la vertical. La altura sólo se toca
 *  para mirar desde arriba (hace falta subir para ver los techos). */
export type Encuadre = 'frente' | 'esquina' | 'arriba' | 'abajo';
export function encuadre(e: Encuadre, altura: number): Partial<Perspectiva3DAjustes> {
  if (e === 'frente') return { puntos: 1, giro: 0, inclinacion: 0 };
  if (e === 'esquina') return { puntos: 2, giro: 35, inclinacion: 0 };
  if (e === 'arriba') return { puntos: 3, giro: 35, inclinacion: -35, altura: Math.max(altura, 12) };
  return { puntos: 3, giro: 35, inclinacion: 25 };
}

/* ── la cámara: dónde mira según altura, giro e inclinación ── */
export function direccion(giroGrados: number, inclinacionGrados: number): THREE.Vector3 {
  const g = THREE.MathUtils.degToRad(giroGrados), i = THREE.MathUtils.degToRad(inclinacionGrados);
  return new THREE.Vector3(Math.sin(g) * Math.cos(i), Math.sin(i), -Math.cos(g) * Math.cos(i));
}
/** La cámara parada en (x, z) —donde ya está: ya no hay «estación» por
 *  esquema— a la altura de los ojos, mirando según giro e inclinación. */
export function posicionCamara(a: Perspectiva3DAjustes, x = 0, z = 6): { pos: THREE.Vector3; target: THREE.Vector3 } {
  const pos = new THREE.Vector3(x, a.altura, z);
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

  /** Ya no hay enrejado de líneas (v3.29.3): el grupo queda vacío y oculto.
   *  Se conserva la clase para no tocar a quien la usa. */
  actualizar(_a: Perspectiva3DAjustes, _oscuro: boolean): void {
    this.group.visible = false;
    if (this.group.children.length) this.liberar();
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

/** Lo que se ve encima de la vista en Perspectiva: el horizonte y los puntos
 *  de fuga SIEMPRE (Mauro, v3.30.0: «no entiendo cómo uso el punto de fuga
 *  acá» — sin tildar el cuadro del 2D no se veía ni el horizonte, y los puntos
 *  casi siempre caen fuera de la pantalla). Un punto fuera de la vista lleva
 *  una FLECHA en el borde que lo señala, con su letra, como en el 2D. El marco
 *  del cuadro del 2D (afuera más oscuro), sólo si se pide. */
export function pintarSuperposicion(svg: SVGSVGElement, cam: THREE.PerspectiveCamera, w: number, h: number, aspecto: number,
    op: { marco?: boolean } = { marco: true }): void {
  while (svg.lastChild) svg.removeChild(svg.lastChild);
  if (op.marco !== false) {
    const m = marcoEnVista(w, h, aspecto);
    el('path', { d: `M0 0H${w}V${h}H0Z M${m.x} ${m.y}V${m.y + m.h}H${m.x + m.w}V${m.y}Z`, fill: 'rgba(0,0,0,0.28)', 'fill-rule': 'evenodd' }, svg);
    el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, fill: 'none', stroke: '#F0450E', 'stroke-width': 1.5, 'data-p': 'marco' }, svg);
  }
  const hz = horizonte(cam, w, h);
  if (hz) {
    const dx = hz.b.x - hz.a.x, dy = hz.b.y - hz.a.y, n = Math.hypot(dx, dy) || 1, L = (w + h) * 4;
    el('line', { x1: hz.a.x - dx / n * L, y1: hz.a.y - dy / n * L, x2: hz.a.x + dx / n * L, y2: hz.a.y + dy / n * L,
      stroke: COLOR_HORIZONTE, 'stroke-width': 1.6, opacity: 0.9, 'data-p': 'horizonte' }, svg);
  }
  const { vps } = puntosDeFuga(cam, w, h);
  // margen: a la izquierda va la barra de herramientas (≈ 90 px), que tapaba un punto
  // que caía «adentro»: ahí también se lo señala con la flecha
  const M = 24, MI = 96, cx = w / 2, cy = h / 2;
  for (const v of vps) {
    const g = el('g', { stroke: v.color, 'data-p': 'vp-' + v.eje }, svg);
    const adentro = v.x >= MI && v.x <= w - M && v.y >= M && v.y <= h - M;
    if (adentro) {
      // sólo el punto: el abanico de 36 rayos por punto era ruido (v3.29.3)
      el('circle', { cx: v.x, cy: v.y, r: 6, fill: '#fff', 'stroke-width': 2.5 }, g);
      const t = el('text', { x: v.x + 10, y: v.y - 8, fill: v.color, stroke: 'none', 'font-size': 12, 'font-weight': 700, 'font-family': 'Figtree, sans-serif' }, g);
      t.textContent = v.eje.toUpperCase();
      continue;
    }
    // afuera: flecha en el borde, en la dirección del punto
    const dx = v.x - cx, dy = v.y - cy;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) continue;
    const tx = dx ? ((dx > 0 ? w - M : MI) - cx) / dx : Infinity, ty = dy ? ((dy > 0 ? h - M : M) - cy) / dy : Infinity;
    const k = Math.min(tx, ty), x = cx + dx * k, y = cy + dy * k, a = Math.atan2(dy, dx);
    g.setAttribute('data-afuera', '1');
    const punta = (r: number, da: number) => `${(x + Math.cos(a + da) * r).toFixed(1)},${(y + Math.sin(a + da) * r).toFixed(1)}`;
    el('circle', { cx: x, cy: y, r: 13, fill: '#fff', 'stroke-width': 1.8, opacity: 0.95 }, g);
    el('polygon', { points: [punta(9, 0), punta(6, 2.4), punta(6, -2.4)].join(' '), fill: v.color, stroke: 'none' }, g);
    const t = el('text', { x: x - Math.cos(a) * 22, y: y - Math.sin(a) * 22 + 4, fill: v.color, stroke: 'none', 'text-anchor': 'middle',
      'font-size': 12, 'font-weight': 700, 'font-family': 'Figtree, sans-serif' }, g);
    t.textContent = v.eje.toUpperCase();
  }
}
