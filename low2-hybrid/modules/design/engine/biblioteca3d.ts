/* ══ LA BIBLIOTECA DE PIEZAS DEL ESTUDIO 3D ═══════════════════════════════════
   Mauro: «las cosas se deben construir con bibliotecas que se puedan
   personalizar, o hacer de cero, porque cada paisaje puede tener estilos
   distintos». El 3D es un SimCity para armar escenarios: casas, edificios,
   árboles, faroles, rocas… pero NO de un solo estilo.

   - Una PIEZA es un objeto armado en el estudio (cajas, trazos, rellenos,
     volúmenes) guardado como DATOS, con la base en el origen: el mismo formato
     que el .low3d (ItemProyecto). Colocarla es rearmar esos datos donde se
     hizo clic, con un poco de variación (tamaño y giro) para que veinte
     árboles no sean el mismo árbol.
   - Un KIT es un estilo: un juego de piezas y los colores de lo que se arma
     solo (las calles). Vienen dos de fábrica —«Color plano» y «Boceto en
     línea»— y cada uno se puede DUPLICAR y cambiar, o empezar uno vacío y
     llenarlo con piezas propias («Guardar lo elegido como pieza»). Los kits
     propios viven en el navegador del estudio y se exportan/importan como
     .lowkit para pasarlos entre proyectos y computadoras.
   - Lo colocado queda como objetos comunes del proyecto (agrupados con el
     nombre de la pieza): se editan, se borran y se guardan con el .low3d sin
     depender de que el kit siga existiendo.

   Este módulo es sólo DATOS (sin three): los kits de fábrica se fabrican acá
   como nubes de puntos (volúmenes) y polilíneas (líneas). */
import type { ItemProyecto } from './webgl-design3d';

export type Categoria = 'edificio' | 'casa' | 'arbol' | 'vegetacion' | 'calle' | 'roca' | 'otro';
export const CATEGORIAS: { id: Categoria; nombre: string }[] = [
  { id: 'casa', nombre: 'Casas' }, { id: 'edificio', nombre: 'Edificios' }, { id: 'arbol', nombre: 'Árboles' },
  { id: 'vegetacion', nombre: 'Plantas' }, { id: 'calle', nombre: 'Equipamiento' }, { id: 'roca', nombre: 'Rocas' }, { id: 'otro', nombre: 'Otras' },
];

/** Cómo varía cada copia al colocarla. */
export interface Variacion { escalaMin: number; escalaMax: number; giro: 'libre' | 'recto' | 'no' }
export interface Pieza {
  id: string;
  nombre: string;
  categoria: Categoria;
  /** los objetos, con la base de la pieza en (0, 0, 0) */
  items: ItemProyecto[];
  /** ancho (x), alto (y), fondo (z) en metros */
  tam: [number, number, number];
  variacion: Variacion;
}
export interface EstiloKit { calzada: string; vereda: string; pintura: string; tinta: string;
  /** el paisaje: pasto, tierra (cauces), roca (laderas), nieve (cumbres) y agua */
  pasto?: string; tierra?: string; roca?: string; nieve?: string; agua?: string }
export interface Kit {
  id: string;
  nombre: string;
  descripcion: string;
  /** de fábrica: no se cambia (se duplica para personalizarlo) */
  fabrica?: boolean;
  estilo: EstiloKit;
  piezas: Pieza[];
}

const CLAVE = 'low3d:kits';
export const ESTILO_BASE: EstiloKit = { calzada: '#9a9fa6', vereda: '#ddd6c8', pintura: '#f6f3ea', tinta: '#1d1d1f',
  pasto: '#7fa860', tierra: '#9c8466', roca: '#8b8a86', nieve: '#f4f6f8', agua: '#4f8fc0' };

type V3 = [number, number, number];
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const pincel = (color: string, size = 4) => ({ color, size, opacity: 1, hardness: 1, pressureSensitivity: 0, stabilization: 0 });
const base = { id: '', layerId: '', baseOpacity: 1, position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

/* ── fabricar items ── */
/** Un VOLUMEN: el casco convexo de la nube (el estudio lo arma con buildSolidMesh). */
function volumen(nube: V3[], color: string): ItemProyecto {
  return { ...base, points: nube.map((p) => p.map(r3)), pressures: nube.map(() => 1), brush: pincel(color), solid: true };
}
/** Una LÍNEA recta por tramos (shape: el estudio no la suaviza). */
function linea(pts: V3[], color: string, size = 3): ItemProyecto {
  return { ...base, points: pts.map((p) => p.map(r3)), pressures: pts.map(() => 1), brush: pincel(color, size), shape: 'poly' };
}
/** Una línea curva (sin shape: el estudio la suaviza). */
function curva(pts: V3[], color: string, size = 3): ItemProyecto {
  return { ...base, points: pts.map((p) => p.map(r3)), pressures: pts.map(() => 1), brush: pincel(color, size) };
}

/* ── geometría de las formas (nubes y recorridos) ── */
function caja(cx: number, y0: number, cz: number, w: number, h: number, d: number): V3[] {
  const out: V3[] = [];
  for (const x of [cx - w / 2, cx + w / 2]) for (const y of [y0, y0 + h]) for (const z of [cz - d / 2, cz + d / 2]) out.push([x, y, z]);
  return out;
}
/** Techo a dos aguas sobre una planta w × d a la altura y0. */
function techo(w: number, d: number, y0: number, alto: number, alero = 0.4): V3[] {
  const x = w / 2 + alero, z = d / 2 + alero;
  return [[-x, y0, -z], [x, y0, -z], [-x, y0, z], [x, y0, z], [-x, y0 + alto, 0], [x, y0 + alto, 0]];
}
function esfera(cx: number, cy: number, cz: number, rx: number, ry = rx, rz = rx, n = 26, semilla = 1): V3[] {
  // puntos de Fibonacci con un pelín de irregularidad: una copa no es una bola perfecta
  const out: V3[] = [];
  const oro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * oro;
    const k = 1 + 0.08 * Math.sin(i * 12.9898 * semilla);
    out.push([cx + Math.cos(a) * r * rx * k, cy + y * ry * k, cz + Math.sin(a) * r * rz * k]);
  }
  return out;
}
function cono(cx: number, y0: number, cz: number, r: number, alto: number, lados = 10): V3[] {
  const out: V3[] = [[cx, y0 + alto, cz]];
  for (let i = 0; i < lados; i++) { const a = (i / lados) * Math.PI * 2; out.push([cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r]); }
  return out;
}
function anillo(cx: number, cy: number, cz: number, r: number, eje: 'y' | 'x' | 'z', lados = 16): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= lados; i++) {
    const a = (i / lados) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    out.push(eje === 'y' ? [cx + c, cy, cz + s] : eje === 'x' ? [cx, cy + c, cz + s] : [cx + c, cy + s, cz]);
  }
  return out;
}
/** Las 12 aristas de una caja en UN recorrido (repite tres para no cortar). */
function aristasCaja(cx: number, y0: number, cz: number, w: number, h: number, d: number): V3[] {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  const b: V3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  const t: V3[] = b.map(([x, , z]) => [x, y1, z]);
  return [b[0], b[1], b[2], b[3], b[0], t[0], t[1], b[1], t[1], t[2], b[2], t[2], t[3], b[3], t[3], t[0]];
}
/** Una fila de ventanas en la cara del frente (z = +d/2), como líneas. */
function ventanas(w: number, d: number, pisos: number, altoPiso: number, porPiso: number): V3[][] {
  const out: V3[][] = [];
  const z = d / 2 + 0.02, paso = w / porPiso, vw = paso * 0.5, vh = altoPiso * 0.45;
  for (let p = 0; p < pisos; p++) for (let i = 0; i < porPiso; i++) {
    const x = -w / 2 + paso * (i + 0.5), y = p * altoPiso + altoPiso * 0.35;
    out.push([[x - vw / 2, y, z], [x + vw / 2, y, z], [x + vw / 2, y + vh, z], [x - vw / 2, y + vh, z], [x - vw / 2, y, z]]);
  }
  return out;
}

/* ── las piezas de fábrica, en los dos estilos ── */
type Estilo = 'plano' | 'linea';
function piezasDeFabrica(e: Estilo): Pieza[] {
  const T = '#1d1d1f';
  const P = (id: string, nombre: string, categoria: Categoria, items: ItemProyecto[], tam: [number, number, number], variacion: Variacion): Pieza =>
    ({ id: e + '-' + id, nombre, categoria, items, tam, variacion });
  const recto: Variacion = { escalaMin: 0.92, escalaMax: 1.1, giro: 'recto' };
  const libre: Variacion = { escalaMin: 0.75, escalaMax: 1.25, giro: 'libre' };
  if (e === 'plano') return [
    P('casa', 'Casa', 'casa', [volumen(caja(0, 0, 0, 8, 3.2, 7), '#e9d9bd'), volumen(techo(8, 7, 3.2, 2.4), '#b5523b')], [8.8, 5.6, 7.8], recto),
    P('casa-alta', 'Casa de dos plantas', 'casa', [volumen(caja(0, 0, 0, 7, 6, 8), '#d8cfc4'), volumen(techo(7, 8, 6, 2.2, 0.3), '#6d4c41')], [7.6, 8.2, 8.6], recto),
    P('edificio', 'Edificio', 'edificio', [volumen(caja(0, 0, 0, 12, 18, 12), '#b9c3cc'), volumen(caja(0, 18, 0, 4, 2.5, 4), '#8d99a6')], [12, 20.5, 12], recto),
    P('torre', 'Torre', 'edificio', [volumen(caja(0, 0, 0, 10, 45, 10), '#8fa9bf')], [10, 45, 10], recto),
    P('galpon', 'Galpón', 'edificio', [volumen(caja(0, 0, 0, 16, 5, 10), '#c9b79c'), volumen(techo(16, 10, 5, 1.6, 0.2), '#7d8a8f')], [16.4, 6.6, 10.4], recto),
    P('arbol', 'Árbol', 'arbol', [volumen(caja(0, 0, 0, 0.45, 2.6, 0.45), '#6b4f3a'), volumen(esfera(0, 4.2, 0, 2.3, 2.0, 2.3), '#5f9e55')], [4.6, 6.2, 4.6], libre),
    P('pino', 'Pino', 'arbol', [volumen(caja(0, 0, 0, 0.4, 1.4, 0.4), '#6b4f3a'), volumen(cono(0, 1.2, 0, 2.1, 6.5), '#3f7a52')], [4.2, 7.7, 4.2], libre),
    P('arbusto', 'Arbusto', 'vegetacion', [volumen(esfera(0, 0.7, 0, 1.1, 0.75, 1.1, 18, 2), '#6aa65a')], [2.2, 1.45, 2.2], libre),
    P('farol', 'Farol', 'calle', [volumen(caja(0, 0, 0, 0.18, 4.2, 0.18), '#4a4f55'), volumen(caja(0, 4.2, 0, 0.5, 0.35, 0.5), '#f2d27a')], [0.5, 4.55, 0.5], { escalaMin: 1, escalaMax: 1, giro: 'no' }),
    P('roca', 'Roca', 'roca', [volumen(esfera(0, 0.5, 0, 1.4, 0.8, 1.1, 14, 3), '#9b968c')], [2.8, 1.3, 2.2], { escalaMin: 0.5, escalaMax: 1.6, giro: 'libre' }),
  ];
  // BOCETO EN LÍNEA: las mismas formas dibujadas con aristas, para layouts a lápiz
  return [
    P('casa', 'Casa', 'casa', [linea(aristasCaja(0, 0, 0, 8, 3.2, 7), T), linea([[-4.4, 3.2, -3.9], [-4.4, 5.6, 0], [-4.4, 3.2, 3.9], [4.4, 3.2, 3.9], [4.4, 5.6, 0], [4.4, 3.2, -3.9], [-4.4, 3.2, -3.9], [-4.4, 3.2, 3.9]], T),
      linea([[-4.4, 5.6, 0], [4.4, 5.6, 0]], T), linea([[-0.6, 0, 3.52], [-0.6, 2.1, 3.52], [0.6, 2.1, 3.52], [0.6, 0, 3.52]], T, 2)], [8.8, 5.6, 7.8], recto),
    P('edificio', 'Edificio', 'edificio', [linea(aristasCaja(0, 0, 0, 12, 18, 12), T), ...ventanas(12, 12, 6, 3, 4).map((v) => linea(v, T, 2))], [12, 18, 12], recto),
    P('torre', 'Torre', 'edificio', [linea(aristasCaja(0, 0, 0, 10, 45, 10), T), ...ventanas(10, 10, 12, 3.75, 3).map((v) => linea(v, T, 2))], [10, 45, 10], recto),
    P('arbol', 'Árbol', 'arbol', [linea([[-0.2, 0, 0], [-0.15, 2.4, 0]], T), linea([[0.2, 0, 0], [0.15, 2.4, 0]], T),
      curva(anillo(0, 4.2, 0, 2.2, 'z', 14), T), curva(anillo(0, 4.2, 0, 2.2, 'x', 14), T)], [4.4, 6.4, 4.4], libre),
    P('pino', 'Pino', 'arbol', [linea([[0, 0, 0], [0, 1.4, 0]], T), linea([[-2, 1.2, 0], [0, 7.7, 0], [2, 1.2, 0], [-2, 1.2, 0]], T),
      linea([[0, 1.2, -2], [0, 7.7, 0], [0, 1.2, 2], [0, 1.2, -2]], T)], [4, 7.7, 4], libre),
    P('arbusto', 'Arbusto', 'vegetacion', [curva(anillo(0, 0.7, 0, 1.1, 'z', 12), T), curva(anillo(0, 0.7, 0, 1.1, 'x', 12), T)], [2.2, 1.8, 2.2], libre),
    P('farol', 'Farol', 'calle', [linea([[0, 0, 0], [0, 4.2, 0], [0.6, 4.2, 0], [0.6, 3.9, 0]], T)], [0.6, 4.2, 0.1], { escalaMin: 1, escalaMax: 1, giro: 'recto' }),
  ];
}

export function kitsDeFabrica(): Kit[] {
  return [
    { id: 'fabrica-plano', nombre: 'Color plano', fabrica: true, descripcion: 'Volúmenes de colores lisos con aristas: ciudad y paisaje listos para el fondo',
      estilo: { ...ESTILO_BASE }, piezas: piezasDeFabrica('plano') },
    { id: 'fabrica-linea', nombre: 'Boceto en línea', fabrica: true, descripcion: 'Las mismas formas como líneas, para layouts a lápiz que después se pasan en limpio',
      estilo: { calzada: '#f4f2ee', vereda: '#fbfaf7', pintura: '#1d1d1f', tinta: '#1d1d1f', pasto: '#f3f1ec', tierra: '#e2ddd3', roca: '#cfcac0', nieve: '#ffffff', agua: '#cfe0ea' }, piezas: piezasDeFabrica('linea') },
  ];
}

/* ── kits propios: validar, guardar, cargar ── */
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const num = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
const texto = (v: unknown, d: string, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d);

export function piezaValida(x: unknown): Pieza | null {
  const o = (x && typeof x === 'object' ? x : null) as Partial<Pieza> | null;
  if (!o || !Array.isArray(o.items) || !o.items.length) return null;
  const items = o.items.filter((it) => it && typeof it === 'object' && (it.caja || (Array.isArray(it.points) && it.points.length >= 2)));
  if (!items.length) return null;
  const v = (o.variacion || {}) as Partial<Variacion>;
  const min = num(v.escalaMin, 1, 0.1, 10), max = num(v.escalaMax, 1, 0.1, 10);
  return {
    id: texto(o.id, 'pieza-' + Math.random().toString(36).slice(2, 8), 80), nombre: texto(o.nombre, 'Pieza'),
    categoria: CATEGORIAS.some((c) => c.id === o.categoria) ? o.categoria as Categoria : 'otro',
    items: JSON.parse(JSON.stringify(items)),
    tam: Array.isArray(o.tam) && o.tam.length === 3 ? o.tam.map((n) => num(n, 1, 0.01, 10000)) as [number, number, number] : [1, 1, 1],
    variacion: { escalaMin: Math.min(min, max), escalaMax: Math.max(min, max), giro: v.giro === 'libre' || v.giro === 'no' ? v.giro : 'recto' },
  };
}
export function kitValido(x: unknown): Kit | null {
  const o = (x && typeof x === 'object' ? x : null) as Partial<Kit> | null;
  if (!o) return null;
  const e = (o.estilo || {}) as Partial<EstiloKit>;
  return {
    id: texto(o.id, 'kit-' + Math.random().toString(36).slice(2, 8), 80), nombre: texto(o.nombre, 'Mi kit'), descripcion: texto(o.descripcion, '', 200),
    estilo: { calzada: color(e.calzada, ESTILO_BASE.calzada), vereda: color(e.vereda, ESTILO_BASE.vereda), pintura: color(e.pintura, ESTILO_BASE.pintura), tinta: color(e.tinta, ESTILO_BASE.tinta),
      pasto: color(e.pasto, ESTILO_BASE.pasto!), tierra: color(e.tierra, ESTILO_BASE.tierra!), roca: color(e.roca, ESTILO_BASE.roca!), nieve: color(e.nieve, ESTILO_BASE.nieve!), agua: color(e.agua, ESTILO_BASE.agua!) },
    piezas: (Array.isArray(o.piezas) ? o.piezas : []).map(piezaValida).filter((p): p is Pieza => !!p),
  };
}
export function cargarKitsPropios(): Kit[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(CLAVE) || '[]');
    return (Array.isArray(raw) ? raw : []).map(kitValido).filter((k): k is Kit => !!k);
  } catch { return []; }
}
/** false si no entró (el navegador da ~5 MB): el kit se puede exportar igual. */
export function guardarKitsPropios(kits: Kit[]): boolean {
  try { window.localStorage.setItem(CLAVE, JSON.stringify(kits.filter((k) => !k.fabrica))); return true; } catch { return false; }
}
/** Un .lowkit: el kit con una marca de formato. */
export function kitAArchivo(k: Kit): string {
  return JSON.stringify({ format: 'lowkit', version: 1, kit: { ...k, fabrica: undefined } }, null, 1);
}
export function kitDeArchivo(texto: string): Kit | null {
  try {
    const d = JSON.parse(texto);
    if (!d || d.format !== 'lowkit' || d.version !== 1) return null;
    const k = kitValido(d.kit);
    return k ? { ...k, id: 'kit-' + Math.random().toString(36).slice(2, 8) } : null;
  } catch { return null; }
}
