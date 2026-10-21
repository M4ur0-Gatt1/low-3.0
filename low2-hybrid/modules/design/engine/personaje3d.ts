/* ══ EL PERSONAJE DEL TALLER (cuerpos de Quaternius, CC0) ═══════════════════
   Mauro: «no me gustan nada los personajes que tenés, quiero algo mucho más
   estilizado y realista… seguro hay bibliotecas libres ya hechas» y «si sólo
   voy a poder dibujar sobre la forma del personaje… tengo que poder modelarlo
   también».

   Los cuerpos son de Quaternius (Universal Base Characters y Universal
   Animation Library, CC0: ver ui/estudio3d/personajes/LICENCIA.txt), pasados a
   glb livianos con tools/personajes_quaternius.py. Los tres (hombre, mujer,
   maniquí) tienen el MISMO esqueleto (65 huesos, estilo Unreal), así que una
   pose sirve para cualquiera.

   Sobre ese cuerpo se trabaja de tres maneras, y las tres se combinan:
   - PROPORCIONES con el esqueleto: largo de piernas, brazos, torso, cuello,
     ancho de hombros y caderas, tamaño de la cabeza, alto. Se estira la piel
     entre huesos (la del muslo se alarga si el hueso de la pierna se aleja).
   - POSE: cada hueso gira desde su articulación. El codo y la rodilla son
     BISAGRAS (se doblan para un solo lado, hasta 150°); el resto, rótulas.
     Las poses de fábrica son un cuadro de cada animación de la biblioteca.
   - ESCULTURA: la piel se modela con pinceles (tirar, inflar, desinflar,
     suavizar, aplanar), con simetría izquierda/derecha. Se esculpe sobre el
     cuerpo POSADO: el corrimiento se lleva a la piel en reposo, así que lo
     esculpido acompaña cualquier pose.

   Cómo se guarda una pose: por hueso, el giro respecto del reposo EXPRESADO EN
   LOS EJES DEL MUNDO EN REPOSO (x = izquierda del personaje, y = arriba, z =
   adelante). Así «doblar el codo» es siempre girar alrededor del mismo eje,
   esté donde esté el brazo, y espejar una pose es reflejar los números.

   @module design/engine/personaje3d
   ══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as clonarEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js';

export type BaseCuerpo = 'hombre' | 'mujer' | 'maniqui';
/** Qué hace el mouse sobre el personaje en el taller. */
export type ModoTaller = 'dibujar' | 'posar' | 'esculpir';
export type PincelEscultura = 'tirar' | 'inflar' | 'desinflar' | 'suavizar' | 'aplanar' | 'pellizcar' | 'surco';
export const CUERPOS: { id: BaseCuerpo; nombre: string; descripcion: string }[] = [
  { id: 'hombre', nombre: 'Hombre', descripcion: 'Anatomía realista, estilizada (8 cabezas)' },
  { id: 'mujer', nombre: 'Mujer', descripcion: 'Anatomía realista, estilizada (8 cabezas)' },
  { id: 'maniqui', nombre: 'Maniquí', descripcion: 'El maniquí articulado de dibujo, sin rasgos' },
];

/** Las proporciones: 1 = como viene el cuerpo. */
export interface Proporciones {
  /** el tamaño entero (el alto en metros sale de acá) */
  escala: number;
  cabeza: number; cuello: number; torso: number; hombros: number; caderas: number; brazos: number; piernas: number;
}
export const PROP_NEUTRA: Proporciones = { escala: 1, cabeza: 1, cuello: 1, torso: 1, hombros: 1, caderas: 1, brazos: 1, piernas: 1 };
export const PROP_RANGOS: Record<keyof Proporciones, [number, number]> = {
  escala: [0.2, 5], cabeza: [0.6, 2], cuello: [0.4, 2.2], torso: [0.7, 1.5], hombros: [0.6, 1.7],
  caderas: [0.6, 1.6], brazos: [0.7, 1.5], piernas: [0.55, 1.6],
};

/** Lo que se guarda (en el proyecto y en la biblioteca). */
export interface PersonajeDatos {
  base: BaseCuerpo;
  prop: Proporciones;
  /** por hueso, el giro [x, y, z, w] en los ejes del mundo en reposo */
  pose: Record<string, number[]>;
  /** apoyar lo más bajo del cuerpo en el piso del personaje */
  pies: boolean;
  /** el tono de la arcilla */
  color: string;
  /** la piel esculpida: texto compacto «e1:…» (o la lista [índice, dx, dy, dz, …] de la 3.38) */
  escultura?: number[] | string;
  /** cuánta malla: 0 la que viene (12 mil triángulos), 1 ×4, 2 ×16 */
  definicion?: number;
  /** dónde va la cadera respecto del reposo (posar con la marioneta, animaciones) */
  raiz?: number[];
  /** la actuación: poses clave por cuadro */
  actuacion?: Actuacion;
  /** una pose de fábrica por nombre (los de la biblioteca): se resuelve al crearlo */
  poseFabrica?: string;
}

const lim = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
export const COLOR_ARCILLA = '#dcd5ca';
export function personajeValido(x: unknown): PersonajeDatos {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<PersonajeDatos>;
  const base = CUERPOS.some((c) => c.id === o.base) ? o.base as BaseCuerpo : 'hombre';
  const p = (o.prop && typeof o.prop === 'object' ? o.prop : {}) as Partial<Proporciones>;
  const prop = { ...PROP_NEUTRA };
  for (const k of Object.keys(PROP_RANGOS) as (keyof Proporciones)[]) prop[k] = lim(p[k], 1, PROP_RANGOS[k][0], PROP_RANGOS[k][1]);
  const pose = poseValida(o.pose);
  const e = o.escultura;
  const escultura = typeof e === 'string' ? (/^e1:[A-Za-z0-9+/=]*$/.test(e) && e.length <= 16e6 ? e : undefined)
    : Array.isArray(e) && e.length % 4 === 0 && e.length <= 4 * 400000 && e.every((n) => Number.isFinite(Number(n))) ? e.map(Number) : undefined;
  const definicion = Math.round(lim(o.definicion, 0, 0, 2));
  const raiz = raizValida(o.raiz), actuacion = actuacionValida(o.actuacion);
  return { base, prop, pose, pies: o.pies !== false, color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : COLOR_ARCILLA, ...(escultura?.length ? { escultura } : {}),
    ...(definicion ? { definicion } : {}), ...(raiz ? { raiz } : {}), ...(actuacion ? { actuacion } : {}),
    ...(typeof o.poseFabrica === 'string' && /^[a-z0-9-]{1,30}$/.test(o.poseFabrica) ? { poseFabrica: o.poseFabrica } : {}) };
}
export function personajeNuevo(base: BaseCuerpo = 'hombre'): PersonajeDatos {
  return { base, prop: { ...PROP_NEUTRA }, pose: {}, pies: true, color: COLOR_ARCILLA };
}

/* ── LAS ARTICULACIONES QUE SE AGARRAN ─────────────────────────────────────── */
/** Qué se mueve al tocar un hueso: los dedos mueven la muñeca; el talón, el
 *  tobillo; la clavícula, el hombro; la columna entera es «el tronco». */
export function controlDeHueso(n: string): string {
  if (/^(index|middle|pinky|ring|thumb)_/.test(n)) return 'hand_' + n.slice(-1);
  if (/^ball/.test(n)) return 'foot_' + n.slice(-1);
  if (/^clavicle_/.test(n)) return 'upperarm_' + n.slice(-1);
  if (n === 'root') return 'pelvis';
  if (/^spine_0[123]$/.test(n)) return 'tronco';
  return n;
}
const TRONCO = ['spine_01', 'spine_02', 'spine_03'];
/** Los huesos que mueve un control (el tronco reparte el giro en las tres vértebras). */
export function huesosDeControl(c: string): string[] { return c === 'tronco' ? TRONCO : [c]; }
/** Hacia dónde apunta cada control: la punta que se arrastra. */
const PUNTA: Record<string, string> = {
  upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_02_l',
  upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_02_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l',
  thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
  neck_01: 'Head', tronco: 'neck_01', pelvis: 'spine_03',
};
export const CONTROLES = ['pelvis', 'tronco', 'neck_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
export function nombreControl(c: string): string {
  const lado = c.endsWith('_l') ? 'izquierd' : c.endsWith('_r') ? 'derech' : '';
  const base: Record<string, [string, 'o' | 'a']> = {
    pelvis: ['Cuerpo entero', 'o'], tronco: ['Tronco', 'o'], neck_01: ['Cuello', 'o'], Head: ['Cabeza', 'a'],
    upperarm: ['Hombro', 'o'], lowerarm: ['Codo', 'o'], hand: ['Muñeca', 'a'], thigh: ['Cadera', 'a'], calf: ['Rodilla', 'a'], foot: ['Tobillo', 'o'],
  };
  const b = base[c.replace(/_[lr]$/, '')];
  return b ? b[0] + (lado ? ' ' + lado + b[1] : '') : c;
}
/** El otro lado (codo izquierdo ↔ derecho); el centro queda igual. */
export function ladoOpuesto(n: string): string {
  return /_l$/.test(n) ? n.slice(0, -2) + '_r' : /_r$/.test(n) ? n.slice(0, -2) + '_l' : n;
}
/** Un giro reflejado en el espejo izquierda/derecha (el plano x = 0). */
export function giroEspejado(q: number[]): number[] { return [q[0], -q[1], -q[2], q[3]]; }

/** Las BISAGRAS (ejes en el mundo en reposo, medidos en la biblioteca de
 *  animaciones: el codo gira alrededor de la vertical, la rodilla alrededor de
 *  izquierda-derecha; el positivo es el lado en que se dobla). */
const BISAGRAS: Record<string, { doblar: [number, number, number]; largo: [number, number, number]; max: number; giro: number }> = {
  lowerarm_l: { doblar: [0, -1, 0], largo: [1, 0, 0], max: 150, giro: 90 },
  lowerarm_r: { doblar: [0, 1, 0], largo: [-1, 0, 0], max: 150, giro: 90 },
  calf_l: { doblar: [1, 0, 0], largo: [0, -1, 0], max: 150, giro: 30 },
  calf_r: { doblar: [1, 0, 0], largo: [0, -1, 0], max: 150, giro: 30 },
};
const _v = new THREE.Vector3();
/** Una bisagra no se dobla para el otro lado ni de costado: el giro se separa
 *  en «a lo largo del hueso» (rotar el antebrazo) y «doblar», y cada uno queda
 *  dentro de su límite. */
export function limitarGiro(hueso: string, q: THREE.Quaternion): THREE.Quaternion {
  const b = BISAGRAS[hueso];
  if (!b) return q;
  const largo = _v.fromArray(b.largo);
  const p = q.x * largo.x + q.y * largo.y + q.z * largo.z;
  const tw = new THREE.Quaternion(largo.x * p, largo.y * p, largo.z * p, q.w);
  if (tw.lengthSq() < 1e-9) tw.identity(); else tw.normalize();
  const sw = q.clone().multiply(tw.clone().invert());
  const eje = new THREE.Vector3().fromArray(b.doblar);
  const ang = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  let doblar = ang(2 * Math.atan2(sw.x * eje.x + sw.y * eje.y + sw.z * eje.z, sw.w));
  let giro = ang(2 * Math.atan2(tw.x * largo.x + tw.y * largo.y + tw.z * largo.z, tw.w));
  const R = Math.PI / 180;
  doblar = Math.max(0, Math.min(b.max * R, doblar));
  giro = Math.max(-b.giro * R, Math.min(b.giro * R, giro));
  return new THREE.Quaternion().setFromAxisAngle(eje, doblar).multiply(new THREE.Quaternion().setFromAxisAngle(largo, giro));
}

/* ── LAS POSES DE FÁBRICA ──────────────────────────────────────────────────── */
export interface PoseDeFabrica { id: string; nombre: string; huesos: Record<string, number[]> }
let posesPromesa: Promise<PoseDeFabrica[]> | null = null;
let posesListas: PoseDeFabrica[] = [];
export function posesDeFabrica(): PoseDeFabrica[] { return posesListas; }
export function cargarPoses(): Promise<PoseDeFabrica[]> {
  if (!posesPromesa) posesPromesa = fetch(new URL('personajes/poses.json', document.baseURI).href)
    .then((r) => r.json()).then((j) => { posesListas = Array.isArray(j?.poses) ? j.poses : []; window.dispatchEvent(new CustomEvent('low3d:personajes', { detail: 'poses' })); return posesListas; })
    .catch(() => { posesPromesa = null; return []; });
  return posesPromesa;
}

/* ── LOS CUERPOS (se cargan una vez y se clonan) ───────────────────────────── */
const cuerpos = new Map<BaseCuerpo, GLTF>();
const cargando = new Map<BaseCuerpo, Promise<GLTF>>();
export function cuerpoListo(b: BaseCuerpo): boolean { return cuerpos.has(b); }
export function cargarCuerpo(b: BaseCuerpo): Promise<GLTF> {
  const ya = cuerpos.get(b);
  if (ya) return Promise.resolve(ya);
  let p = cargando.get(b);
  if (!p) {
    p = new GLTFLoader().loadAsync(new URL('personajes/' + b + '.glb', document.baseURI).href).then((g) => {
      cuerpos.set(b, g); cargando.delete(b);
      window.dispatchEvent(new CustomEvent('low3d:personajes', { detail: b }));
      return g;
    }, (e) => { cargando.delete(b); throw e; });
    cargando.set(b, p);
  }
  return p;
}

/** La ARCILLA: la textura del cuerpo pasada a dos tonos (la ropa interior queda
 *  oscura, la piel del color elegido) con su relieve. Sin textura (el maniquí),
 *  el color liso; las articulaciones del maniquí, un poco más oscuras. */
function materialArcilla(m0: THREE.MeshStandardMaterial, color: THREE.Color): THREE.MeshStandardMaterial {
  const pelo = m0.alphaTest > 0 || m0.transparent;
  const m = new THREE.MeshStandardMaterial({ map: m0.map ?? null, normalMap: m0.normalMap ?? null, roughness: 0.82, metalness: 0,
    color: m0.map ? 0xffffff : (m0.name === 'M_Joints' ? color.clone().multiplyScalar(0.55) : color.clone()),
    alphaTest: m0.alphaTest, transparent: false, side: m0.side });
  m.name = m0.name;
  if (m0.map && !pelo) {
    m.userData.claro = color;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.claro = { value: m.userData.claro };
      sh.fragmentShader = 'uniform vec3 claro;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float lumArcilla = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(claro * 0.2, claro, smoothstep(0.02, 0.32, lumArcilla));`);
    };
  }
  return m;
}

/* ── LAS ANIMACIONES DE LA BIBLIOTECA (para las actuaciones) ───────────────── */
/** Una animación de Quaternius: 15 cuadros por segundo, el giro local de los
 *  65 huesos y dónde va la pelvis (tools/personajes_quaternius.py). */
export interface ClipAnimacion { id: string; nombre: string; cuadros: number; segundos: number; bucle: boolean; desde: number }
interface Animaciones { fps: number; huesos: string[]; pelvis: number[]; clips: ClipAnimacion[]; buf: ArrayBuffer }
let animPromesa: Promise<Animaciones | null> | null = null;
let animListas: Animaciones | null = null;
export function animacionesDeFabrica(): ClipAnimacion[] { return animListas?.clips ?? []; }
export function cargarAnimaciones(): Promise<Animaciones | null> {
  if (!animPromesa) animPromesa = Promise.all([
    fetch(new URL('personajes/animaciones.json', document.baseURI).href).then((r) => r.json()),
    fetch(new URL('personajes/animaciones.bin', document.baseURI).href).then((r) => r.arrayBuffer()),
  ]).then(([j, buf]) => {
    animListas = { fps: Number(j.fps) || 15, huesos: j.huesos, pelvis: j.pelvis, clips: j.clips, buf };
    window.dispatchEvent(new CustomEvent('low3d:personajes', { detail: 'animaciones' }));
    return animListas;
  }).catch(() => { animPromesa = null; return null; });
  return animPromesa;
}
/** Una muestra (fraccionaria) de una animación: giros locales y la pelvis. */
function muestraDeClip(a: Animaciones, c: ClipAnimacion, k: number): { giros: Map<string, THREE.Quaternion>; pelvis: THREE.Vector3 } {
  const nh = a.huesos.length, n = c.cuadros;
  const i0 = Math.max(0, Math.min(n - 1, Math.floor(k))), i1 = Math.min(n - 1, i0 + 1), t = Math.max(0, Math.min(1, k - i0));
  const pos = new Float32Array(a.buf, c.desde, n * 3);
  const gir = new Int16Array(a.buf, c.desde + n * 12, n * nh * 4);
  const pelvis = new THREE.Vector3(pos[i0 * 3], pos[i0 * 3 + 1], pos[i0 * 3 + 2])
    .lerp(new THREE.Vector3(pos[i1 * 3], pos[i1 * 3 + 1], pos[i1 * 3 + 2]), t);
  const giros = new Map<string, THREE.Quaternion>();
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  for (let h = 0; h < nh; h++) {
    const o0 = (i0 * nh + h) * 4, o1 = (i1 * nh + h) * 4;
    q0.set(gir[o0] / 32767, gir[o0 + 1] / 32767, gir[o0 + 2] / 32767, gir[o0 + 3] / 32767).normalize();
    q1.set(gir[o1] / 32767, gir[o1 + 1] / 32767, gir[o1 + 2] / 32767, gir[o1 + 3] / 32767).normalize();
    giros.set(a.huesos[h], q0.clone().slerp(q1, t));
  }
  return { giros, pelvis };
}

/* ── LA ACTUACIÓN: poses clave por cuadro ──────────────────────────────────── */
/** Una clave: la pose (y dónde va la cadera) en un cuadro. */
export interface ClaveActuacion { f: number; pose: Record<string, number[]>; raiz?: number[] }
export interface Actuacion { cuadros: number; claves: ClaveActuacion[] }
function poseValida(o: unknown): Record<string, number[]> {
  const pose: Record<string, number[]> = {};
  if (!o || typeof o !== 'object') return pose;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof k !== 'string' || k.length > 40 || !Array.isArray(v) || v.length !== 4 || !v.every((n) => Number.isFinite(Number(n)))) continue;
    const q = new THREE.Quaternion(Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3]));
    if (q.lengthSq() < 1e-6) continue;
    // ya normalizado (lo que guarda el taller, redondeado) se deja tal cual: renormalizar
    // movía los últimos decimales y un Ctrl+Z no volvía a la MISMA pose
    pose[k] = Math.abs(q.length() - 1) > 1e-3 ? q.normalize().toArray() : v.map(Number);
  }
  return pose;
}
const raizValida = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n)) && Math.abs(Number(n)) < 50) && v.some((n) => Number(n) !== 0) ? v.map(Number) : undefined;
function actuacionValida(x: unknown): Actuacion | undefined {
  const o = (x && typeof x === 'object' ? x : null) as Partial<Actuacion> | null;
  if (!o || !Array.isArray(o.claves)) return undefined;
  const cuadros = Math.round(lim(o.cuadros, 24, 1, 10000));
  const vistas = new Set<number>();
  const claves = o.claves.slice(0, 5000).map((c) => {
    const f = Math.round(Number(c?.f));
    if (!(f >= 1 && f <= cuadros) || vistas.has(f)) return null;
    vistas.add(f);
    const r = raizValida(c.raiz);
    return { f, pose: poseValida(c.pose), ...(r ? { raiz: r } : {}) } as ClaveActuacion;
  }).filter((c): c is ClaveActuacion => !!c).sort((a, b) => a.f - b.f);
  return { cuadros, claves };
}
/** La pose entre dos claves: cada hueso gira de una a la otra (slerp). */
export function poseEnCuadro(a: Actuacion | undefined, f: number): { pose: Record<string, number[]>; raiz?: number[] } | null {
  if (!a || !a.claves.length) return null;
  let k0: ClaveActuacion | null = null, k1: ClaveActuacion | null = null;
  for (const c of a.claves) { if (c.f <= f) k0 = c; else { k1 = c; break; } }
  const copia = (c: ClaveActuacion) => ({ pose: JSON.parse(JSON.stringify(c.pose)), ...(c.raiz ? { raiz: c.raiz.slice() } : {}) });
  if (!k0) return copia(k1!);
  if (!k1 || k0.f === f) return copia(k0);
  const t = (f - k0.f) / (k1.f - k0.f);
  const pose: Record<string, number[]> = {};
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  for (const n of new Set([...Object.keys(k0.pose), ...Object.keys(k1.pose)])) {
    q0.fromArray(k0.pose[n] ?? [0, 0, 0, 1]); q1.fromArray(k1.pose[n] ?? [0, 0, 0, 1]);
    const q = q0.clone().slerp(q1, t);
    if (1 - Math.abs(q.w) > 1e-7) pose[n] = q.toArray().map((v) => Math.round(v * 1e5) / 1e5);
  }
  const r0 = k0.raiz ?? [0, 0, 0], r1 = k1.raiz ?? [0, 0, 0];
  const raiz = r0.map((v, i) => Math.round((v + (r1[i] - v) * t) * 1e5) / 1e5);
  return { pose, ...(raiz.some((v) => v !== 0) ? { raiz } : {}) };
}

/* ── LA DEFINICIÓN: más malla para esculpir ────────────────────────────────── */
/** Subdivide la piel (cada triángulo en cuatro) SIN PERDER LA FORMA: el punto
 *  nuevo de cada arista va sobre la curva que marcan las normales de sus
 *  extremos (teselado de Phong), no en el medio recto; así los músculos no se
 *  ablandan ni el cuerpo se facetea. Los vértices de antes conservan su
 *  número (los nuevos van al final): la escultura de un nivel sirve en el
 *  siguiente. Los pesos de la piel (qué hueso mueve cada punto) se promedian. */
function subdividir(g: THREE.BufferGeometry, pos: ArrayLike<number> = g.attributes.position.array as Float32Array): THREE.BufferGeometry {
  const N = g.attributes.normal as THREE.BufferAttribute, UV = g.attributes.uv as THREE.BufferAttribute | undefined;
  const SI = g.attributes.skinIndex as THREE.BufferAttribute, SW = g.attributes.skinWeight as THREE.BufferAttribute;
  const n = g.attributes.position.count;
  const idx = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  // normales soldadas: las costuras dan el MISMO punto nuevo de los dos lados
  const porPos = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const k = Math.round(pos[i * 3] * 2e4) + ',' + Math.round(pos[i * 3 + 1] * 2e4) + ',' + Math.round(pos[i * 3 + 2] * 2e4);
    let l = porPos.get(k); if (!l) porPos.set(k, (l = [])); l.push(i);
  }
  const ns = new Float32Array(n * 3);
  for (const l of porPos.values()) {
    let x = 0, y = 0, z = 0;
    for (const i of l) { x += N.getX(i); y += N.getY(i); z += N.getZ(i); }
    const m = Math.hypot(x, y, z) || 1;
    for (const i of l) { ns[i * 3] = x / m; ns[i * 3 + 1] = y / m; ns[i * 3 + 2] = z / m; }
  }
  const aristas = new Map<number, number>(), ea: number[] = [], eb: number[] = [];
  const arista = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b), k = lo * n + hi;
    let j = aristas.get(k);
    if (j === undefined) { j = n + ea.length; aristas.set(k, j); ea.push(lo); eb.push(hi); }
    return j;
  };
  const nt = idx.length, nuevoIdx = new Uint32Array(nt * 4);
  for (let t = 0, o = 0; t < nt; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ab = arista(a, b), bc = arista(b, c), ca = arista(c, a);
    nuevoIdx.set([a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca], o); o += 12;
  }
  const m = n + ea.length;
  const P = new Float32Array(m * 3), NN = new Float32Array(m * 3), U = UV ? new Float32Array(m * 2) : null;
  const SIa = new (SI.array.constructor as { new (n: number): Uint16Array })(m * 4), SWa = new Float32Array(m * 4);
  for (let i = 0; i < n * 3; i++) { P[i] = pos[i]; NN[i] = N.array[i]; }
  if (U && UV) for (let i = 0; i < n * 2; i++) U[i] = UV.array[i];
  for (let i = 0; i < n * 4; i++) { SIa[i] = SI.array[i]; SWa[i] = SW.array[i]; }
  const ALFA = 0.75, peso = new Map<number, number>();
  for (let e = 0; e < ea.length; e++) {
    const a = ea[e], b = eb[e], j = n + e;
    const mx = (pos[a * 3] + pos[b * 3]) / 2, my = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2, mz = (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2;
    let qx = 0, qy = 0, qz = 0;
    for (const v of [a, b]) {   // el medio proyectado sobre el plano tangente de cada extremo
      const nx = ns[v * 3], ny = ns[v * 3 + 1], nz = ns[v * 3 + 2];
      const d = (mx - pos[v * 3]) * nx + (my - pos[v * 3 + 1]) * ny + (mz - pos[v * 3 + 2]) * nz;
      qx += (mx - d * nx) / 2; qy += (my - d * ny) / 2; qz += (mz - d * nz) / 2;
    }
    P[j * 3] = mx * (1 - ALFA) + qx * ALFA; P[j * 3 + 1] = my * (1 - ALFA) + qy * ALFA; P[j * 3 + 2] = mz * (1 - ALFA) + qz * ALFA;
    const nx = N.getX(a) + N.getX(b), ny = N.getY(a) + N.getY(b), nz = N.getZ(a) + N.getZ(b), nl = Math.hypot(nx, ny, nz) || 1;
    NN[j * 3] = nx / nl; NN[j * 3 + 1] = ny / nl; NN[j * 3 + 2] = nz / nl;
    if (U && UV) { U[j * 2] = (UV.getX(a) + UV.getX(b)) / 2; U[j * 2 + 1] = (UV.getY(a) + UV.getY(b)) / 2; }
    peso.clear();
    for (const v of [a, b]) for (let k = 0; k < 4; k++) {
      const w = SW.array[v * 4 + k]; if (w > 0) { const h = SI.array[v * 4 + k]; peso.set(h, (peso.get(h) || 0) + w / 2); }
    }
    const top = [...peso.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4), tot = top.reduce((s, x) => s + x[1], 0) || 1;
    top.forEach(([h, w], k) => { SIa[j * 4 + k] = h; SWa[j * 4 + k] = w / tot; });
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(NN, 3));
  if (U) out.setAttribute('uv', new THREE.BufferAttribute(U, 2));
  out.setAttribute('skinIndex', new THREE.BufferAttribute(SIa, 4));
  out.setAttribute('skinWeight', new THREE.BufferAttribute(SWa, 4));
  out.setIndex(new THREE.BufferAttribute(nuevoIdx, 1));
  for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
  return out;
}
/** La piel de cada cuerpo en cada nivel, calculada una vez (después se clona). */
const pielesSubdivididas = new Map<string, THREE.BufferGeometry>();
function pielEnNivel(base: BaseCuerpo, g0: THREE.BufferGeometry, nivel: number): THREE.BufferGeometry {
  let g = g0;
  for (let k = 1; k <= nivel; k++) {
    const clave = base + ':' + k;
    let s = pielesSubdivididas.get(clave);
    if (!s) { s = subdividir(g); pielesSubdivididas.set(clave, s); }
    g = s;
  }
  return g.clone();
}

/* ── LA ESCULTURA GUARDADA, COMPACTA ───────────────────────────────────────── */
// [índice Uint32][dx dy dz Int16 en 1/20000 m] por vértice movido, en base64:
// con la malla de alta definición una lista de números no entraba en el almacenamiento
const UNIDAD = 20000;
function esculturaATexto(original: Float32Array, actual: Float32Array): string | undefined {
  const movidos: number[] = [];
  for (let i = 0, n = actual.length / 3; i < n; i++) {
    if (Math.abs(actual[i * 3] - original[i * 3]) * UNIDAD >= 0.5 || Math.abs(actual[i * 3 + 1] - original[i * 3 + 1]) * UNIDAD >= 0.5
      || Math.abs(actual[i * 3 + 2] - original[i * 3 + 2]) * UNIDAD >= 0.5) movidos.push(i);
  }
  if (!movidos.length) return undefined;
  const buf = new ArrayBuffer(movidos.length * 10), dv = new DataView(buf);
  const q = (v: number) => Math.max(-32767, Math.min(32767, Math.round(v * UNIDAD)));
  movidos.forEach((i, k) => {
    dv.setUint32(k * 10, i, true);
    for (let c = 0; c < 3; c++) dv.setInt16(k * 10 + 4 + c * 2, q(actual[i * 3 + c] - original[i * 3 + c]), true);
  });
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return 'e1:' + btoa(s);
}
/** De lo guardado (texto nuevo o la lista de la 3.38) a corrimientos por vértice. */
function esculturaDeDatos(e: string | number[] | undefined): { i: number; d: [number, number, number] }[] {
  if (!e) return [];
  if (Array.isArray(e)) {
    const out: { i: number; d: [number, number, number] }[] = [];
    for (let k = 0; k + 3 < e.length; k += 4) out.push({ i: e[k], d: [e[k + 1], e[k + 2], e[k + 3]] });
    return out;
  }
  try {
    const s = atob(e.slice(3)), bytes = new Uint8Array(s.length);
    for (let k = 0; k < s.length; k++) bytes[k] = s.charCodeAt(k);
    const dv = new DataView(bytes.buffer), out: { i: number; d: [number, number, number] }[] = [];
    for (let k = 0; k + 10 <= bytes.length; k += 10)
      out.push({ i: dv.getUint32(k, true), d: [dv.getInt16(k + 4, true) / UNIDAD, dv.getInt16(k + 6, true) / UNIDAD, dv.getInt16(k + 8, true) / UNIDAD] });
    return out;
  } catch { return []; }
}

/* ── TOCAR LA PIEL RÁPIDO: una rejilla de triángulos ───────────────────────── */
/** Con la piel de alta definición (200 mil triángulos) el rayo de three.js,
 *  que recorre todos los triángulos y calcula la piel de cada vértice, tardaba
 *  décimas de segundo por toque. Acá los triángulos se guardan en una rejilla
 *  (con la piel posada) y el rayo sólo prueba las celdas que atraviesa. */
class RejillaPiel {
  private min = new THREE.Vector3(); private lado = 1; private dim: [number, number, number] = [1, 1, 1];
  private celdas = new Map<number, number[]>();
  constructor(private pos: Float32Array, private idx: ArrayLike<number>) {
    const caja = new THREE.Box3();
    for (let i = 0; i < pos.length; i += 3) caja.expandByPoint(_v.set(pos[i], pos[i + 1], pos[i + 2]));
    caja.expandByScalar(1e-3);
    this.min.copy(caja.min);
    const t = caja.getSize(new THREE.Vector3());
    this.lado = Math.max(t.x, t.y, t.z) / 64;
    this.dim = [Math.ceil(t.x / this.lado) + 1, Math.ceil(t.y / this.lado) + 1, Math.ceil(t.z / this.lado) + 1];
    for (let k = 0; k < idx.length; k += 3) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let c = 0; c < 3; c++) {
        const v = idx[k + c] * 3;
        x0 = Math.min(x0, pos[v]); x1 = Math.max(x1, pos[v]); y0 = Math.min(y0, pos[v + 1]); y1 = Math.max(y1, pos[v + 1]); z0 = Math.min(z0, pos[v + 2]); z1 = Math.max(z1, pos[v + 2]);
      }
      const [a0, b0, c0] = this.celda(x0, y0, z0), [a1, b1, c1] = this.celda(x1, y1, z1);
      for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) for (let c = c0; c <= c1; c++) {
        const key = (a * this.dim[1] + b) * this.dim[2] + c;
        let l = this.celdas.get(key); if (!l) this.celdas.set(key, (l = [])); l.push(k / 3);
      }
    }
  }
  private celda(x: number, y: number, z: number): [number, number, number] {
    const f = (v: number, m: number, d: number) => Math.max(0, Math.min(d - 1, Math.floor((v - m) / this.lado)));
    return [f(x, this.min.x, this.dim[0]), f(y, this.min.y, this.dim[1]), f(z, this.min.z, this.dim[2])];
  }
  /** El triángulo más cercano que toca el rayo (Möller-Trumbore, de los dos lados). */
  tocar(rayo: THREE.Ray): { t: number; tri: number } | null {
    const o = rayo.origin, d = rayo.direction, max = new THREE.Vector3(this.min.x + this.dim[0] * this.lado, this.min.y + this.dim[1] * this.lado, this.min.z + this.dim[2] * this.lado);
    const caja = new THREE.Box3(this.min, max), entrada = new THREE.Vector3();
    let t = 0;
    if (!caja.containsPoint(o)) { if (!rayo.intersectBox(caja, entrada)) return null; t = entrada.distanceTo(o); }
    const p = o.clone().addScaledVector(d, t + 1e-6);
    let [cx, cy, cz] = this.celda(p.x, p.y, p.z);
    const paso = [Math.sign(d.x) || 1, Math.sign(d.y) || 1, Math.sign(d.z) || 1];
    const borde = (c: number, m: number, s: number) => m + (c + (s > 0 ? 1 : 0)) * this.lado;
    const tMax = [d.x ? (borde(cx, this.min.x, paso[0]) - o.x) / d.x : Infinity, d.y ? (borde(cy, this.min.y, paso[1]) - o.y) / d.y : Infinity, d.z ? (borde(cz, this.min.z, paso[2]) - o.z) / d.z : Infinity];
    const tDelta = [d.x ? this.lado / Math.abs(d.x) : Infinity, d.y ? this.lado / Math.abs(d.y) : Infinity, d.z ? this.lado / Math.abs(d.z) : Infinity];
    let mejor: { t: number; tri: number } | null = null;
    const probados = new Set<number>();
    for (let iter = 0; iter < 1000; iter++) {
      const l = this.celdas.get((cx * this.dim[1] + cy) * this.dim[2] + cz);
      if (l) for (const tri of l) {
        if (probados.has(tri)) continue; probados.add(tri);
        const h = this.triangulo(o, d, tri);
        if (h !== null && (!mejor || h < mejor.t)) mejor = { t: h, tri };
      }
      const salida = Math.min(tMax[0], tMax[1], tMax[2]);
      if (mejor && mejor.t <= salida) return mejor;
      if (tMax[0] <= tMax[1] && tMax[0] <= tMax[2]) { cx += paso[0]; tMax[0] += tDelta[0]; if (cx < 0 || cx >= this.dim[0]) break; }
      else if (tMax[1] <= tMax[2]) { cy += paso[1]; tMax[1] += tDelta[1]; if (cy < 0 || cy >= this.dim[1]) break; }
      else { cz += paso[2]; tMax[2] += tDelta[2]; if (cz < 0 || cz >= this.dim[2]) break; }
    }
    return mejor;
  }
  private triangulo(o: THREE.Vector3, d: THREE.Vector3, tri: number): number | null {
    const p = this.pos, a = this.idx[tri * 3] * 3, b = this.idx[tri * 3 + 1] * 3, c = this.idx[tri * 3 + 2] * 3;
    const e1x = p[b] - p[a], e1y = p[b + 1] - p[a + 1], e1z = p[b + 2] - p[a + 2];
    const e2x = p[c] - p[a], e2y = p[c + 1] - p[a + 1], e2z = p[c + 2] - p[a + 2];
    const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
    const det = e1x * hx + e1y * hy + e1z * hz;
    if (Math.abs(det) < 1e-12) return null;
    const f = 1 / det, sx = o.x - p[a], sy = o.y - p[a + 1], sz = o.z - p[a + 2];
    const u = f * (sx * hx + sy * hy + sz * hz);
    if (u < 0 || u > 1) return null;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = f * (d.x * qx + d.y * qy + d.z * qz);
    if (v < 0 || u + v > 1) return null;
    const t = f * (e2x * qx + e2y * qy + e2z * qz);
    return t > 1e-6 ? t : null;
  }
}

/* ── UN PERSONAJE ──────────────────────────────────────────────────────────── */
export class Personaje3D {
  /** lo que se pone en la escena */
  readonly raiz = new THREE.Group();
  private modelo: THREE.Object3D;
  readonly mallas: THREE.SkinnedMesh[] = [];
  /** la piel que se esculpe (la malla más grande) */
  readonly cuerpo: THREE.SkinnedMesh;
  readonly huesos = new Map<string, THREE.Bone>();
  private reposo = new Map<string, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>();
  /** el giro de cada hueso en reposo, en el mundo del personaje */
  private enReposo = new Map<string, THREE.Quaternion>();
  private original: Float32Array;
  /** el alto natural (en reposo, sin escalar) */
  readonly altoNatural: number;
  datos: PersonajeDatos;

  /** Sólo con el cuerpo ya cargado (ver cargarCuerpo / crearPersonaje). */
  constructor(datos: PersonajeDatos) {
    this.datos = personajeValido(datos);
    const g = cuerpos.get(this.datos.base);
    if (!g) throw new Error('el cuerpo no está cargado');
    this.modelo = clonarEsqueleto(g.scene);
    this.raiz.add(this.modelo);
    this.raiz.userData.personaje = this;
    const color = new THREE.Color(this.datos.color);
    this.modelo.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.huesos.set(o.name, o as THREE.Bone);
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.geometry = sm.geometry.clone();          // cada personaje esculpe su piel
        sm.material = materialArcilla(sm.material as THREE.MeshStandardMaterial, color);
        sm.frustumCulled = false; sm.castShadow = true;
        this.mallas.push(sm);
      }
    });
    this.cuerpo = this.mallas.reduce((a, b) => (b.geometry.attributes.position.count > a.geometry.attributes.position.count ? b : a));
    if (this.datos.definicion) { const g0 = this.cuerpo.geometry; this.cuerpo.geometry = pielEnNivel(this.datos.base, g0, this.datos.definicion); g0.dispose(); }
    this.original = new Float32Array(this.cuerpo.geometry.attributes.position.array as Float32Array);
    // tocar la piel (dibujar, esculpir, posar) va por la rejilla: con mucha malla el rayo de three tardaba décimas
    const cuerpo = this.cuerpo;
    cuerpo.raycast = (raycaster: THREE.Raycaster, intersects: THREE.Intersection[]) => {
      const h = this.tocarPiel(raycaster.ray);
      if (!h || h.distancia < raycaster.near || h.distancia > raycaster.far) return;
      const normal = h.normal.clone().transformDirection(new THREE.Matrix4().copy(cuerpo.matrixWorld).invert());
      intersects.push({ distance: h.distancia, point: h.punto, object: cuerpo, faceIndex: h.tri, face: { a: h.a, b: h.b, c: h.c, normal, materialIndex: 0 } } as THREE.Intersection);
    };
    this.modelo.updateMatrixWorld(true);
    const inv = new THREE.Quaternion();
    this.modelo.getWorldQuaternion(inv).invert();
    for (const [n, b] of this.huesos) {
      this.reposo.set(n, { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() });
      this.enReposo.set(n, inv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    }
    const caja = new THREE.Box3();
    for (const m of this.mallas) { m.skeleton.update(); caja.expandByObject(m, true); }
    this.altoNatural = Math.max(0.1, caja.max.y - caja.min.y);
    if (this.datos.escultura) this.ponerEscultura(this.datos.escultura);
    const fab = this.datos.poseFabrica && !Object.keys(this.datos.pose).length ? posesListas.find((x) => x.id === this.datos.poseFabrica) : null;
    delete this.datos.poseFabrica;
    if (fab) this.ponerPoseDeFabrica(fab); else this.aplicar();
  }

  /** El alto en metros, parado y con las proporciones (sin la pose): se mide
   *  en reposo y se guarda hasta que cambien las proporciones o la piel. */
  private altoCache: { clave: string; alto: number } | null = null;
  alto(): number {
    const clave = JSON.stringify(this.datos.prop) + ':' + this.versionPiel;
    if (this.altoCache?.clave === clave) return this.altoCache.alto;
    const pose = this.datos.pose, pies = this.datos.pies;
    this.datos.pose = {}; this.datos.pies = false; this.aplicar();
    const p = this.posicionesEnRaiz();
    let mn = Infinity, mx = -Infinity;
    for (let i = 1; i < p.length; i += 3) { if (p[i] < mn) mn = p[i]; if (p[i] > mx) mx = p[i]; }
    this.datos.pose = pose; this.datos.pies = pies; this.aplicar();
    this.altoCache = { clave, alto: mx - mn };
    return mx - mn;
  }
  private versionPiel = 0;

  /* ── huesos, proporciones y pose ── */
  private largo(n: string): number {
    const p = this.datos.prop;
    if (n === 'spine_02' || n === 'spine_03' || n === 'neck_01') return p.torso;
    if (n === 'Head') return p.cuello;
    if (/^upperarm_/.test(n)) return p.hombros;
    if (/^(lowerarm|hand)_/.test(n)) return p.brazos;
    if (/^(calf|foot)_/.test(n)) return p.piernas;
    if (/^thigh_/.test(n)) return p.caderas;
    return 1;
  }
  /** Pone cada hueso según las proporciones y la pose, y apoya los pies. */
  aplicar(): void {
    const d = this.datos;
    for (const [n, b] of this.huesos) {
      const r = this.reposo.get(n)!;
      b.position.copy(r.p).multiplyScalar(this.largo(n));
      b.quaternion.copy(r.q);
      const g = d.pose[n];
      if (g) {
        const w = this.enReposo.get(n)!;
        b.quaternion.multiply(w.clone().invert().multiply(new THREE.Quaternion().fromArray(g)).multiply(w));
      }
      b.scale.copy(r.s);
      if (n === 'Head') b.scale.multiplyScalar(d.prop.cabeza);
      if (n === 'pelvis' && d.raiz) b.position.add(_v.fromArray(d.raiz));
    }
    this.modelo.position.set(0, 0, 0);
    this.raiz.updateMatrixWorld(true);
    this.modelo.scale.setScalar(d.prop.escala);
    this.actualizar();
    if (d.pies) {
      // lo más bajo del cuerpo, al piso del personaje
      const min = this.minimoY();
      if (Number.isFinite(min)) { this.modelo.position.y = -min; this.actualizar(); }
    }
  }
  private actualizar(): void {
    this.raiz.updateMatrixWorld(true);
    for (const m of this.mallas) {
      m.skeleton.update();
      (m as unknown as { boundingBox: THREE.Box3 | null }).boundingBox = null;
      (m as unknown as { boundingSphere: THREE.Sphere | null }).boundingSphere = null;
    }
    this.mundoCache = null;
    this.rejilla = null;
  }
  /** Lo más bajo de la piel, en el espacio de la raíz. */
  private minimoY(): number {
    const pos = this.posicionesEnRaiz();
    let min = Infinity;
    for (let i = 1; i < pos.length; i += 3) if (pos[i] < min) min = pos[i];
    return min;
  }
  private posicionesEnRaiz(): Float32Array {
    const m = this.cuerpo, n = m.geometry.attributes.position.count, out = new Float32Array(n * 3);
    const aRaiz = new THREE.Matrix4().copy(this.raiz.matrixWorld).invert().multiply(m.matrixWorld);
    for (let i = 0; i < n; i++) { m.getVertexPosition(i, _v); _v.applyMatrix4(aRaiz); out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z; }
    return out;
  }
  private mundoCache: Float32Array | null = null;
  /** La piel posada, en el mundo (para el pincel). */
  posicionesMundo(): Float32Array {
    if (this.mundoCache) return this.mundoCache;
    const m = this.cuerpo, n = m.geometry.attributes.position.count, out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { m.getVertexPosition(i, _v); _v.applyMatrix4(m.matrixWorld); out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z; }
    return (this.mundoCache = out);
  }

  /** El hueso que más mueve esa cara de la piel (para pegar trazos y posar). */
  huesoDeCara(malla: THREE.Object3D, cara: THREE.Face | null | undefined): string | null {
    const m = malla as THREE.SkinnedMesh;
    if (!cara || !m.isSkinnedMesh || !this.mallas.includes(m)) return null;
    const si = m.geometry.attributes.skinIndex as THREE.BufferAttribute, sw = m.geometry.attributes.skinWeight as THREE.BufferAttribute;
    const peso = new Map<number, number>();
    for (const i of [cara.a, cara.b, cara.c]) for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (w > 0) { const b = si.getComponent(i, k); peso.set(b, (peso.get(b) || 0) + w); }
    }
    let mejor = -1, max = 0;
    for (const [b, w] of peso) if (w > max) { max = w; mejor = b; }
    return mejor >= 0 ? m.skeleton.bones[mejor]?.name ?? null : null;
  }
  /** Dónde está una articulación (en el mundo). */
  articulacion(n: string): THREE.Vector3 | null {
    const b = this.huesos.get(n === 'tronco' ? 'spine_01' : n);
    return b ? b.getWorldPosition(new THREE.Vector3()) : null;
  }
  /** La punta que se arrastra al posar ese control. */
  punta(c: string): THREE.Vector3 | null {
    const t = PUNTA[c];
    if (t) return this.articulacion(t);
    if (c === 'Head') {
      const h = this.huesos.get('Head'), cu = this.huesos.get('neck_01');
      if (!h || !cu) return null;
      const a = h.getWorldPosition(new THREE.Vector3()), b = cu.getWorldPosition(new THREE.Vector3());
      return a.clone().add(a.clone().sub(b).normalize().multiplyScalar(0.2 * this.datos.prop.escala * this.datos.prop.cabeza));
    }
    return null;
  }
  /** Gira un control para que su punta vaya hacia `destino` (en el mundo).
   *  Con el tronco el giro se reparte en las tres vértebras. El codo y la
   *  rodilla (bisagras) buscan el doblez que deja la punta más cerca del rayo
   *  del cursor: de frente, «subir la mano» dobla el codo hacia adelante. */
  girarHacia(c: string, destino: THREE.Vector3, rayo?: THREE.Ray): void {
    if (BISAGRAS[c] && rayo) { this.doblarHacia(c, rayo); return; }
    const huesos = huesosDeControl(c), piv = this.articulacion(c), tip = this.punta(c);
    if (!piv || !tip) return;
    const a = tip.clone().sub(piv), b = destino.clone().sub(piv);
    if (a.lengthSq() < 1e-10 || b.lengthSq() < 1e-10) return;
    const total = new THREE.Quaternion().setFromUnitVectors(a.normalize(), b.normalize());
    const paso = new THREE.Quaternion().slerp(total, 1 / huesos.length);
    for (const n of huesos) this.girarEnMundo(n, paso);
    this.aplicar();
  }
  /** Una bisagra: de 0 al máximo, el doblez cuya punta queda más cerca del rayo
   *  (el giro a lo largo del hueso —rotar el antebrazo— se conserva). */
  private doblarHacia(n: string, objetivo: THREE.Ray | THREE.Vector3 | { desde: THREE.Vector3; largo: number }, aplicar = true): void {
    const medir = (tip: THREE.Vector3) => objetivo instanceof THREE.Ray ? objetivo.distanceSqToPoint(tip)
      : objetivo instanceof THREE.Vector3 ? objetivo.distanceToSquared(tip) : (tip.distanceTo(objetivo.desde) - objetivo.largo) ** 2;
    const b = BISAGRAS[n], hueso = this.huesos.get(n), hijo = this.huesos.get(PUNTA[n]);
    if (!b || !hueso || !hijo || !hueso.parent) return;
    this.raiz.updateMatrixWorld(true);
    const r = this.reposo.get(n)!, w = this.enReposo.get(n)!, wi = w.clone().invert();
    const actual = new THREE.Quaternion().fromArray(this.datos.pose[n] ?? [0, 0, 0, 1]);
    const largo = new THREE.Vector3().fromArray(b.largo), eje = new THREE.Vector3().fromArray(b.doblar);
    const p = actual.x * largo.x + actual.y * largo.y + actual.z * largo.z;
    const tw = new THREE.Quaternion(largo.x * p, largo.y * p, largo.z * p, actual.w);
    if (tw.lengthSq() < 1e-9) tw.identity(); else tw.normalize();
    const M = new THREE.Matrix4(), local = new THREE.Quaternion(), tip = new THREE.Vector3(), d = new THREE.Quaternion();
    let mejor = 0, md = Infinity;
    for (let g = 0; g <= b.max; g += 1.5) {
      d.setFromAxisAngle(eje, (g * Math.PI) / 180).multiply(tw);
      local.copy(r.q).multiply(wi.clone().multiply(d).multiply(w));
      M.compose(hueso.position, local, hueso.scale).premultiply(hueso.parent.matrixWorld);
      tip.copy(hijo.position).applyMatrix4(M);
      const dist = medir(tip);
      if (dist < md - 1e-12) { md = dist; mejor = g; }
    }
    // afinar alrededor del mejor (de a 0,1°): la mano queda donde se la lleva
    for (let g = Math.max(0, mejor - 1.5); g <= Math.min(b.max, mejor + 1.5); g += 0.1) {
      d.setFromAxisAngle(eje, (g * Math.PI) / 180).multiply(tw);
      local.copy(r.q).multiply(wi.clone().multiply(d).multiply(w));
      M.compose(hueso.position, local, hueso.scale).premultiply(hueso.parent.matrixWorld);
      tip.copy(hijo.position).applyMatrix4(M);
      const dist = medir(tip);
      if (dist < md - 1e-12) { md = dist; mejor = g; }
    }
    const q = new THREE.Quaternion().setFromAxisAngle(eje, (mejor * Math.PI) / 180).multiply(tw);
    this.datos.pose[n] = q.toArray().map((v) => Math.round(v * 1e5) / 1e5);
    if (aplicar) this.aplicar();
    else { hueso.quaternion.copy(r.q).multiply(wi.clone().multiply(q).multiply(w)); hueso.updateMatrixWorld(true); }
  }
  /** Cuánto está doblada una bisagra (grados; para las pruebas y el panel). */
  doblez(n: string): number {
    const b = BISAGRAS[n], g = this.datos.pose[n];
    if (!b || !g) return 0;
    const q = new THREE.Quaternion().fromArray(g), largo = new THREE.Vector3().fromArray(b.largo), eje = new THREE.Vector3().fromArray(b.doblar);
    const p = q.x * largo.x + q.y * largo.y + q.z * largo.z;
    const tw = new THREE.Quaternion(largo.x * p, largo.y * p, largo.z * p, q.w);
    if (tw.lengthSq() < 1e-9) tw.identity(); else tw.normalize();
    const sw = q.clone().multiply(tw.invert());
    return (2 * Math.atan2(sw.x * eje.x + sw.y * eje.y + sw.z * eje.z, sw.w) * 180) / Math.PI;
  }
  /** Suma un giro (en el mundo) a un hueso, respetando sus límites. */
  private girarEnMundo(n: string, giro: THREE.Quaternion): void {
    const b = this.huesos.get(n); if (!b) return;
    this.raiz.updateMatrixWorld(true);
    const qw = b.getWorldQuaternion(new THREE.Quaternion());
    const qp = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const local = qp.invert().multiply(giro).multiply(qw);
    const r = this.reposo.get(n)!, w = this.enReposo.get(n)!;
    const dl = r.q.clone().invert().multiply(local);
    const enMundo = limitarGiro(n, w.clone().multiply(dl).multiply(w.clone().invert()).normalize());
    this.datos.pose[n] = enMundo.toArray().map((v) => Math.round(v * 1e5) / 1e5);
    b.quaternion.copy(r.q).multiply(w.clone().invert().multiply(enMundo).multiply(w));
    b.updateMatrixWorld(true);
  }
  /** Una pose de fábrica (de la biblioteca de animaciones): los giros locales de
   *  la animación, pasados a «giro desde el reposo en los ejes del mundo». */
  ponerPoseDeFabrica(p: PoseDeFabrica | null): void {
    const pose: Record<string, number[]> = {};
    if (p) for (const [n, q] of Object.entries(p.huesos)) {
      if (n === 'root' || !this.huesos.has(n)) continue;
      const r = this.reposo.get(n)!, w = this.enReposo.get(n)!;
      const dl = r.q.clone().invert().multiply(new THREE.Quaternion().fromArray(q));
      const g = w.clone().multiply(dl).multiply(w.clone().invert()).normalize();
      if (1 - Math.abs(g.w) > 1e-6) pose[n] = g.toArray().map((v) => Math.round(v * 1e5) / 1e5);
    }
    this.datos.pose = pose;
    this.aplicar();
  }
  /** Endereza un control (vuelve al reposo). */
  enderezar(c: string): void { for (const n of huesosDeControl(c)) delete this.datos.pose[n]; this.aplicar(); }
  /** Copia el control al otro lado, espejado (sólo los de un lado). */
  copiarAlOtroLado(c: string): void {
    const otro = ladoOpuesto(c); if (otro === c) return;
    const desde = (n: string) => this.datos.pose[n];
    const hijos = (n: string): string[] => { const b = this.huesos.get(n); const out: string[] = []; b?.traverse((o) => { if ((o as THREE.Bone).isBone) out.push(o.name); }); return out; };
    for (const n of hijos(c)) { const g = desde(n), o = ladoOpuesto(n); if (g) this.datos.pose[o] = giroEspejado(g); else delete this.datos.pose[o]; }
    this.aplicar();
  }
  /** La pose entera en el espejo (lo de la izquierda a la derecha y al revés). */
  espejarPose(): void {
    const nueva: Record<string, number[]> = {};
    for (const [n, g] of Object.entries(this.datos.pose)) nueva[ladoOpuesto(n)] = giroEspejado(g);
    this.datos.pose = nueva; this.aplicar();
  }
  /** Lleva un punto pegado al hueso `n` a su lugar espejado, pegado al hueso
   *  del otro lado: se refleja EN REPOSO (izquierda ↔ derecha del cuerpo) y se
   *  vuelve a posar. Un trazo espejado sobre el brazo izquierdo cae así sobre
   *  el derecho aunque los brazos estén en distinta pose. */
  matrizEspejo(n: string): THREE.Matrix4 | null {
    const a = this.huesos.get(n), b = this.huesos.get(ladoOpuesto(n));
    if (!a || !b) return null;
    this.raiz.updateMatrixWorld(true);
    const ahoraA = a.matrixWorld.clone(), ahoraB = b.matrixWorld.clone();
    const pose = this.datos.pose;
    this.datos.pose = {}; this.aplicar();
    const repA = a.matrixWorld.clone(), repB = b.matrixWorld.clone();
    const R = this.raiz.matrixWorld.clone();
    this.datos.pose = pose; this.aplicar();
    const S = R.clone().multiply(new THREE.Matrix4().makeScale(-1, 1, 1)).multiply(R.clone().invert());
    return ahoraB.multiply(repB.invert()).multiply(S).multiply(repA).multiply(ahoraA.invert());
  }
  ponerProp(p: Partial<Proporciones>): void {
    for (const k of Object.keys(p) as (keyof Proporciones)[]) this.datos.prop[k] = lim(p[k], this.datos.prop[k], PROP_RANGOS[k][0], PROP_RANGOS[k][1]);
    this.aplicar();
  }
  ponerColor(c: string): void {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
    this.datos.color = c;
    const col = new THREE.Color(c);
    for (const m of this.mallas) {
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.userData.claro) (mat.userData.claro as THREE.Color).copy(col);
      else if (!mat.map) mat.color.copy(mat.name === 'M_Joints' ? col.clone().multiplyScalar(0.55) : col);
    }
  }
  ponerPies(on: boolean): void { this.datos.pies = on; this.aplicar(); }
  /** Las alturas de la hoja de modelo, medidas en el cuerpo (en el mundo). */
  alturas(): { id: string; nombre: string; y: number }[] {
    const y = (n: string) => this.articulacion(n)?.y ?? 0;
    const pos = this.posicionesMundo();
    let tope = -Infinity; for (let i = 1; i < pos.length; i += 3) if (pos[i] > tope) tope = pos[i];
    const cabeza = y('Head'), piso = this.raiz.getWorldPosition(new THREE.Vector3()).y;
    return [
      { id: 'coronilla', nombre: 'Coronilla', y: tope },
      { id: 'ojos', nombre: 'Ojos', y: cabeza + (tope - cabeza) * 0.45 },
      { id: 'menton', nombre: 'Mentón', y: cabeza - (tope - cabeza) * 0.12 },
      { id: 'hombros', nombre: 'Hombros', y: (y('upperarm_l') + y('upperarm_r')) / 2 },
      { id: 'cintura', nombre: 'Cintura', y: y('spine_02') },
      { id: 'cadera', nombre: 'Entrepierna', y: (y('thigh_l') + y('thigh_r')) / 2 - (tope - cabeza) * 0.25 },
      { id: 'rodillas', nombre: 'Rodillas', y: (y('calf_l') + y('calf_r')) / 2 },
      { id: 'tobillos', nombre: 'Tobillos', y: (y('foot_l') + y('foot_r')) / 2 },
      { id: 'piso', nombre: 'Piso', y: piso },
    ];
  }

  /* ── la escultura ── */
  private soldado: Int32Array | null = null;        // vértice → grupo (los duplicados de las costuras)
  private grupos: number[][] = [];
  private vecinos: number[][] = [];                 // por grupo
  private espejo: Int32Array | null = null;          // vértice → su par del otro lado (o −1)
  private carasIni: Int32Array | null = null;        // grupo → sus caras (para rehacer sólo las normales tocadas)
  private carasLista: Int32Array | null = null;
  /** el borde del pincel: 0 suave (se desvanece desde el centro), 1 firme (pareja hasta el borde) */
  dureza = 0;
  private preparar(): void {
    if (this.soldado) return;
    const pos = this.original, n = pos.length / 3;
    const clave = (i: number) => Math.round(pos[i * 3] * 2000) + ',' + Math.round(pos[i * 3 + 1] * 2000) + ',' + Math.round(pos[i * 3 + 2] * 2000);
    const porClave = new Map<string, number>();
    this.soldado = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = clave(i); let g = porClave.get(k);
      if (g === undefined) { g = this.grupos.length; porClave.set(k, g); this.grupos.push([]); }
      this.grupos[g].push(i); this.soldado[i] = g;
    }
    const sets = this.grupos.map(() => new Set<number>());
    const idx = this.cuerpo.geometry.index;
    const tri = (k: number) => (idx ? idx.getX(k) : k);
    const nt = idx ? idx.count : n;
    for (let k = 0; k < nt; k += 3) {
      const a = this.soldado[tri(k)], b = this.soldado[tri(k + 1)], c = this.soldado[tri(k + 2)];
      sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
    }
    this.vecinos = sets.map((s) => [...s]);
    const cuenta = new Int32Array(this.grupos.length + 1);
    for (let k = 0; k < nt; k += 3) for (let c = 0; c < 3; c++) cuenta[this.soldado[tri(k + c)] + 1]++;
    for (let g = 0; g < this.grupos.length; g++) cuenta[g + 1] += cuenta[g];
    this.carasIni = cuenta.slice();
    this.carasLista = new Int32Array(nt);
    const pos0 = cuenta.slice();
    for (let k = 0; k < nt; k += 3) for (let c = 0; c < 3; c++) this.carasLista[pos0[this.soldado[tri(k + c)]]++] = k / 3;
    // el par espejado: el vértice en (−x, y, z), buscado en una grilla
    this.espejo = new Int32Array(n).fill(-1);
    const celda = 0.01, grilla = new Map<string, number[]>();
    const kc = (x: number, y: number, z: number) => Math.floor(x / celda) + ',' + Math.floor(y / celda) + ',' + Math.floor(z / celda);
    for (let i = 0; i < n; i++) { const k = kc(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); let l = grilla.get(k); if (!l) grilla.set(k, (l = [])); l.push(i); }
    for (let i = 0; i < n; i++) {
      const x = -pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      let mejor = -1, md = 0.003 * 0.003;
      const cx = Math.floor(x / celda), cy = Math.floor(y / celda), cz = Math.floor(z / celda);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
        for (const j of grilla.get((cx + a) + ',' + (cy + b) + ',' + (cz + c)) || []) {
          const d = (pos[j * 3] - x) ** 2 + (pos[j * 3 + 1] - y) ** 2 + (pos[j * 3 + 2] - z) ** 2;
          if (d < md) { md = d; mejor = j; }
        }
      }
      this.espejo[i] = mejor;
    }
  }
  /** Cuántos vértices tienen su par espejado (la simetría anda si son casi todos). */
  simetriaCubierta(): number { this.preparar(); let k = 0; for (const j of this.espejo!) if (j >= 0) k++; return k / this.espejo!.length; }

  /** La transformación de la piel en reposo a la posada de un vértice (3×3, para corrimientos). */
  private piel(i: number, out: THREE.Matrix3): THREE.Matrix3 {
    const m = this.cuerpo, g = m.geometry, si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const acc = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0), bm = new THREE.Matrix4();
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (!w) continue;
      bm.fromArray(m.skeleton.boneMatrices, si.getComponent(i, k) * 16);
      for (let e = 0; e < 16; e++) acc.elements[e] += w * bm.elements[e];
    }
    const M = new THREE.Matrix4().copy(m.matrixWorld).multiply(m.bindMatrixInverse).multiply(acc).multiply(m.bindMatrix);
    return out.setFromMatrix4(M);
  }
  /** Los vértices bajo el pincel, con su peso (suave en el borde). */
  bajoElPincel(centro: THREE.Vector3, radio: number): { i: number; f: number }[] {
    const pos = this.posicionesMundo(), out: { i: number; f: number }[] = [], r2 = radio * radio, h = Math.max(0, Math.min(0.95, this.dureza));
    for (let i = 0, n = pos.length / 3; i < n; i++) {
      const d = (pos[i * 3] - centro.x) ** 2 + (pos[i * 3 + 1] - centro.y) ** 2 + (pos[i * 3 + 2] - centro.z) ** 2;
      if (d >= r2) continue;
      // suave: (1 − u²)²; con dureza, pareja hasta `h` del radio y después se desvanece
      const u = Math.sqrt(d / r2), x = u <= h ? 0 : (u - h) / (1 - h), t = 1 - x * x;
      out.push({ i, f: t * t });
    }
    return out;
  }
  /** Un toque de pincel: `mover(i, f)` da el corrimiento EN EL MUNDO de cada
   *  vértice; acá se pasa a la piel en reposo (y al par espejado). */
  private correr(afectados: { i: number; f: number }[], mover: (i: number, f: number) => THREE.Vector3 | null, simetria: boolean, relajar = 0): void {
    this.preparar();
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute, arr = attr.array as Float32Array;
    const m3 = new THREE.Matrix3(), d = new Map<number, THREE.Vector3>();
    for (const { i, f } of afectados) {
      const w = mover(i, f); if (!w || w.lengthSq() < 1e-16) continue;
      this.piel(i, m3);
      if (Math.abs(m3.determinant()) < 1e-12) continue;
      d.set(i, w.applyMatrix3(m3.invert()));
    }
    const final = new Map<number, THREE.Vector3>();
    if (simetria) {
      const esp = this.espejo!, refl = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
      const todos = new Set<number>();
      for (const i of d.keys()) { todos.add(i); if (esp[i] >= 0) todos.add(esp[i]); }
      for (const u of todos) {
        const a = d.get(u), p = esp[u], b = p >= 0 ? d.get(p) : undefined;
        if (a && b) final.set(u, a.clone().add(refl(b)).multiplyScalar(0.5));
        else if (a) final.set(u, p === u ? new THREE.Vector3(0, a.y, a.z) : a.clone());
        else if (b) final.set(u, refl(b));
      }
    } else for (const [i, v] of d) final.set(i, v);
    // los duplicados de las costuras se mueven juntos (si no, la piel se abre)
    const porGrupo = new Map<number, THREE.Vector3>();
    for (const [i, v] of final) { const g = this.soldado![i]; if (!porGrupo.has(g)) porGrupo.set(g, v); }
    for (const [g, v] of porGrupo) for (const j of this.grupos[g]) { arr[j * 3] += v.x; arr[j * 3 + 1] += v.y; arr[j * 3 + 2] += v.z; }
    if (relajar > 0) {
      // AUTOSUAVIZADO (como ZBrush o Blender): cada punto tocado se acomoda hacia
      // el promedio de sus vecinos SOBRE la piel (sin el componente de la normal):
      // reparte los puntos que el pellizco amontona sin rellenar el surco.
      // Medido sin esto: los surcos salían arrugados, como papel estrujado.
      const peso = new Map<number, number>();
      for (const { i, f } of afectados) {
        const g = this.soldado![i]; peso.set(g, Math.max(peso.get(g) || 0, f));
        if (simetria && this.espejo![i] >= 0) { const g2 = this.soldado![this.espejo![i]]; peso.set(g2, Math.max(peso.get(g2) || 0, f)); }
      }
      const nrm = this.cuerpo.geometry.attributes.normal as THREE.BufferAttribute, nuevo = new Map<number, THREE.Vector3>();
      for (const [g, f] of peso) {
        const vs = this.vecinos[g]; if (!vs.length) continue;
        const j0 = this.grupos[g][0], prom = new THREE.Vector3();
        for (const h of vs) prom.add(_v.fromArray(arr, this.grupos[h][0] * 3));
        prom.multiplyScalar(1 / vs.length).sub(_v.fromArray(arr, j0 * 3));
        const n = new THREE.Vector3().fromBufferAttribute(nrm, j0);
        prom.sub(n.multiplyScalar(prom.dot(n)));
        nuevo.set(g, prom.multiplyScalar(relajar * f));
      }
      for (const [g, v] of nuevo) {
        for (const j of this.grupos[g]) { arr[j * 3] += v.x; arr[j * 3 + 1] += v.y; arr[j * 3 + 2] += v.z; }
        if (!porGrupo.has(g)) porGrupo.set(g, v);
      }
    }
    attr.needsUpdate = true;
    this.versionPiel++;
    this.normalesLocales(porGrupo.keys());
  }
  /** Rehace las normales SÓLO alrededor de lo tocado, y la piel posada de esos
   *  puntos (con mucha malla, rehacer todo en cada pasada del pincel trababa). */
  private normalesLocales(tocados: Iterable<number>): void {
    const g = this.cuerpo.geometry, pos = g.attributes.position.array as Float32Array, nrm = g.attributes.normal as THREE.BufferAttribute;
    const idx = g.index ? g.index.array : null, ini = this.carasIni!, lista = this.carasLista!;
    const vert = (k: number) => (idx ? idx[k] : k);
    const movidos = new Set<number>(tocados), rehacer = new Set<number>();
    for (const gr of movidos) for (let p = ini[gr]; p < ini[gr + 1]; p++) {
      const f = lista[p] * 3;
      for (let c = 0; c < 3; c++) rehacer.add(this.soldado![vert(f + c)]);
    }
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), s = new THREE.Vector3();
    for (const gr of rehacer) {
      s.set(0, 0, 0);
      for (let p = ini[gr]; p < ini[gr + 1]; p++) {
        const f = lista[p] * 3;
        a.fromArray(pos, vert(f) * 3); b.fromArray(pos, vert(f + 1) * 3); c.fromArray(pos, vert(f + 2) * 3);
        s.add(b.sub(a).cross(c.sub(a)));
      }
      s.normalize();
      for (const j of this.grupos[gr]) nrm.setXYZ(j, s.x, s.y, s.z);
    }
    nrm.needsUpdate = true;
    const m = this.cuerpo, mundo = this.mundoCache;
    if (mundo) for (const gr of movidos) for (const j of this.grupos[gr]) {
      m.getVertexPosition(j, _v); _v.applyMatrix4(m.matrixWorld);
      mundo[j * 3] = _v.x; mundo[j * 3 + 1] = _v.y; mundo[j * 3 + 2] = _v.z;
    }
    for (const x of this.mallas) {
      (x as unknown as { boundingBox: THREE.Box3 | null }).boundingBox = null;
      (x as unknown as { boundingSphere: THREE.Sphere | null }).boundingSphere = null;
    }
  }
  /** Inflar (signo +1) o desinflar (−1): por la normal de cada vértice. */
  inflar(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean): void {
    const nrm = this.cuerpo.geometry.attributes.normal as THREE.BufferAttribute;
    const m3 = new THREE.Matrix3();
    this.correr(this.bajoElPincel(centro, radio), (i, f) => {
      this.piel(i, m3);
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i).applyMatrix3(m3).normalize();
      return n.multiplyScalar(signo * fuerza * f * radio * 0.03);
    }, simetria);
  }
  /** Aplanar: hacia el plano del pincel (por el centro, con la normal del toque). */
  aplanar(centro: THREE.Vector3, normal: THREE.Vector3, radio: number, fuerza: number, simetria: boolean): void {
    const pos = this.posicionesMundo(), n = normal.clone().normalize();
    this.correr(this.bajoElPincel(centro, radio), (i, f) => {
      const p = new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      return n.clone().multiplyScalar(-p.sub(centro).dot(n) * fuerza * f * 0.5);
    }, simetria);
  }
  /** Suavizar: cada vértice hacia el promedio de sus vecinos. */
  suavizar(centro: THREE.Vector3, radio: number, fuerza: number, simetria: boolean): void {
    this.preparar();
    const pos = this.posicionesMundo();
    this.correr(this.bajoElPincel(centro, radio), (i, f) => {
      const vs = this.vecinos[this.soldado![i]]; if (!vs.length) return null;
      const prom = new THREE.Vector3();
      for (const g of vs) { const j = this.grupos[g][0]; prom.x += pos[j * 3]; prom.y += pos[j * 3 + 1]; prom.z += pos[j * 3 + 2]; }
      prom.multiplyScalar(1 / vs.length);
      return prom.sub(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])).multiplyScalar(fuerza * f * 0.6);
    }, simetria);
  }
  /** Pellizcar: la piel se junta hacia el centro del pincel (sobre la superficie):
   *  afina bordes y marca pliegues. Con `hundir`, además se hunde: un SURCO
   *  (arrugas, pliegues de la ropa, la línea de los labios). Signo −1: cresta. */
  pellizcar(centro: THREE.Vector3, radio: number, fuerza: number, simetria: boolean, hundir = 0): void {
    const pos = this.posicionesMundo(), nrm = this.cuerpo.geometry.attributes.normal as THREE.BufferAttribute, m3 = new THREE.Matrix3();
    this.correr(this.bajoElPincel(centro, radio), (i, f) => {
      this.piel(i, m3);
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i).applyMatrix3(m3).normalize();
      const hacia = centro.clone().sub(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
      hacia.sub(n.clone().multiplyScalar(hacia.dot(n)));   // sobre la piel, no hacia adentro
      // calibrado para el arrastre de verdad: cada punto recibe ~20 toques (uno cada
      // 1/5 del pincel); con más por toque el surco salía un tajo de 2 cm con escalón
      const v = hacia.multiplyScalar(fuerza * f * 0.04);
      if (hundir) v.addScaledVector(n, -hundir * fuerza * f * radio * 0.025);
      return v;
    }, simetria, 0.5);
  }
  /** Tirar: lo agarrado al empezar se corre con el cursor. */
  private agarre: { i: number; f: number }[] | null = null;
  empezarTirar(centro: THREE.Vector3, radio: number): void { this.agarre = this.bajoElPincel(centro, radio); }
  tirar(delta: THREE.Vector3, simetria: boolean): void {
    if (!this.agarre) return;
    this.correr(this.agarre, (_i, f) => delta.clone().multiplyScalar(f), simetria);
  }
  terminarTirar(): void { this.agarre = null; }
  private recalcularNormales(): void {
    this.preparar();
    const g = this.cuerpo.geometry, pos = g.attributes.position.array as Float32Array, nrm = g.attributes.normal as THREE.BufferAttribute;
    const acc = new Float32Array(this.grupos.length * 3);
    const idx = g.index, nt = idx ? idx.count : pos.length / 3;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let k = 0; k < nt; k += 3) {
      const i0 = idx ? idx.getX(k) : k, i1 = idx ? idx.getX(k + 1) : k + 1, i2 = idx ? idx.getX(k + 2) : k + 2;
      a.fromArray(pos, i0 * 3); b.fromArray(pos, i1 * 3); c.fromArray(pos, i2 * 3);
      const n = b.sub(a).cross(c.sub(a));
      for (const i of [i0, i1, i2]) { const s = this.soldado![i] * 3; acc[s] += n.x; acc[s + 1] += n.y; acc[s + 2] += n.z; }
    }
    for (let i = 0, n = pos.length / 3; i < n; i++) {
      const s = this.soldado![i] * 3; a.set(acc[s], acc[s + 1], acc[s + 2]).normalize();
      nrm.setXYZ(i, a.x, a.y, a.z);
    }
    nrm.needsUpdate = true;
  }
  /** La piel como está ahora (para deshacer un trazo de pincel). */
  copiaDePiel(): Float32Array { return new Float32Array(this.cuerpo.geometry.attributes.position.array as Float32Array); }
  ponerPiel(p: Float32Array): void {
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute;
    (attr.array as Float32Array).set(p); attr.needsUpdate = true; this.versionPiel++;
    this.recalcularNormales(); this.actualizar();
  }
  /** Vuelve la piel a como vino. */
  sinEscultura(): void { this.ponerPiel(this.original); }
  esculpido(): boolean {
    const a = this.cuerpo.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - this.original[i]) > 1e-6) return true;
    return false;
  }
  private ponerEscultura(e: number[] | string): void {
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute, arr = attr.array as Float32Array, n = arr.length / 3;
    for (const { i, d } of esculturaDeDatos(e)) {
      if (!(i >= 0 && i < n)) continue;
      arr[i * 3] = this.original[i * 3] + d[0]; arr[i * 3 + 1] = this.original[i * 3 + 1] + d[1]; arr[i * 3 + 2] = this.original[i * 3 + 2] + d[2];
    }
    attr.needsUpdate = true; this.versionPiel++;
    this.recalcularNormales();
  }
  /** Los datos para guardar (con la escultura como lista de corrimientos). */
  aDatos(): PersonajeDatos {
    const escultura = esculturaATexto(this.original, this.cuerpo.geometry.attributes.position.array as Float32Array);
    const d = this.datos;
    return { base: d.base, prop: { ...d.prop }, pose: JSON.parse(JSON.stringify(d.pose)), pies: d.pies, color: d.color,
      ...(escultura ? { escultura } : {}), ...(d.definicion ? { definicion: d.definicion } : {}),
      ...(d.raiz ? { raiz: d.raiz.slice() } : {}), ...(d.actuacion ? { actuacion: JSON.parse(JSON.stringify(d.actuacion)) } : {}) };
  }
  /** Vuelve a unos datos (deshacer, abrir) sin cambiar de cuerpo. */
  ponerDatos(x: PersonajeDatos): void {
    const d = personajeValido(x);
    this.datos.prop = d.prop; this.datos.pose = d.pose; this.datos.pies = d.pies; this.datos.raiz = d.raiz; this.datos.actuacion = d.actuacion;
    this.ponerColor(d.color);
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute;
    (attr.array as Float32Array).set(this.original); this.versionPiel++;
    if (d.escultura) this.ponerEscultura(d.escultura); else { attr.needsUpdate = true; this.recalcularNormales(); }
    this.aplicar();
  }
  /* ── LA MARIONETA: manos, pies y cadera ── */
  /** Los extremos que se agarran: la mano mueve el brazo entero; el pie, la pierna. */
  static readonly EXTREMOS: Record<string, [string, string, string]> = {
    hand_l: ['upperarm_l', 'lowerarm_l', 'hand_l'], hand_r: ['upperarm_r', 'lowerarm_r', 'hand_r'],
    foot_l: ['thigh_l', 'calf_l', 'foot_l'], foot_r: ['thigh_r', 'calf_r', 'foot_r'],
  };
  /** Hacia dónde mira el cuerpo (en el mundo): lo que en reposo es +z, girado con la pelvis. */
  private adelante(): THREE.Vector3 {
    const p = this.huesos.get('pelvis');
    if (!p) return new THREE.Vector3(0, 0, 1);
    const q = p.getWorldQuaternion(new THREE.Quaternion()).multiply(this.enReposo.get('pelvis')!.clone().invert());
    return new THREE.Vector3(0, 0, 1).applyQuaternion(q).normalize();
  }
  /** IK de dos huesos: el codo (o la rodilla) se acomoda solo para que la mano
   *  (o el pie) llegue al destino; se dobla para el lado que ya estaba doblado
   *  (derecho: la rodilla adelante, el codo atrás). El extremo conserva su
   *  orientación: el pie queda plano, la mano no se tuerce. */
  moverExtremo(c: string, destino: THREE.Vector3): void {
    const cad = Personaje3D.EXTREMOS[c]; if (!cad) return;
    const fin = this.huesos.get(cad[2]); if (!fin) return;
    this.raiz.updateMatrixWorld(true);
    const qFin = fin.getWorldQuaternion(new THREE.Quaternion());
    this.resolverIK(cad[0], cad[1], cad[2], destino);
    const qAhora = fin.getWorldQuaternion(new THREE.Quaternion());
    this.girarEnMundo(cad[2], qFin.multiply(qAhora.invert()));
    this.aplicar();
  }
  private resolverIK(a: string, b: string, e: string, destino: THREE.Vector3): void {
    this.raiz.updateMatrixWorld(true);
    const A = this.articulacion(a), B = this.articulacion(b), C = this.articulacion(e);
    if (!A || !B || !C) return;
    const la = A.distanceTo(B), lb = B.distanceTo(C);
    const AT = destino.clone().sub(A), dist0 = AT.length();
    if (dist0 < 1e-6 || la < 1e-6 || lb < 1e-6) return;
    const dir = AT.divideScalar(dist0);
    const d = Math.max(Math.abs(la - lb) + 1e-4, Math.min(la + lb - 1e-4, dist0));
    let polo = B.clone().sub(A); polo.sub(dir.clone().multiplyScalar(polo.dot(dir)));
    if (polo.lengthSq() < 1e-6 * la * la) {
      polo = this.adelante().multiplyScalar(/^calf/.test(b) ? 1 : -1);
      polo.sub(dir.clone().multiplyScalar(polo.dot(dir)));
    }
    polo.normalize();
    const cos = (la * la + d * d - lb * lb) / (2 * la * d), sin = Math.sqrt(Math.max(0, 1 - cos * cos));
    const nuevoB = A.clone().addScaledVector(dir, la * cos).addScaledVector(polo, la * sin);
    this.girarEnMundo(a, new THREE.Quaternion().setFromUnitVectors(B.clone().sub(A).normalize(), nuevoB.clone().sub(A).normalize()));
    this.raiz.updateMatrixWorld(true);
    const T = A.clone().addScaledVector(dir, d);
    if (!BISAGRAS[b]) {
      const B2 = this.articulacion(b)!, C2 = this.articulacion(e)!;
      this.girarEnMundo(b, new THREE.Quaternion().setFromUnitVectors(C2.sub(B2).normalize(), T.sub(B2).normalize()));
      this.raiz.updateMatrixWorld(true);
      return;
    }
    // el codo y la rodilla son BISAGRAS: su eje va con el giro del hueso de arriba.
    // Se rota el húmero (o el fémur) sobre su largo hasta que la bisagra quede
    // perpendicular al plano hombro-codo-mano, y recién ahí se dobla; si no, el
    // límite anatómico aplastaba el doblez y la mano no llegaba (medido: 24 cm).
    const u = nuevoB.clone().sub(A).normalize();
    const normal = u.clone().cross(T.clone().sub(nuevoB));
    const huA = this.huesos.get(a)!, huB = this.huesos.get(b)!;
    const guardar = () => ({ qa: huA.quaternion.clone(), qb: huB.quaternion.clone(), pa: this.datos.pose[a], pb: this.datos.pose[b] });
    const volver = (s: ReturnType<typeof guardar>) => {
      huA.quaternion.copy(s.qa); huB.quaternion.copy(s.qb);
      if (s.pa) this.datos.pose[a] = s.pa; else delete this.datos.pose[a];
      if (s.pb) this.datos.pose[b] = s.pb; else delete this.datos.pose[b];
      this.raiz.updateMatrixWorld(true);
    };
    const inicio = guardar();
    let mejor: { err: number; s: ReturnType<typeof guardar> } | null = null;
    const candidatos = normal.lengthSq() > 1e-10 ? [1, -1] : [0];
    for (const signo of candidatos) {
      volver(inicio);
      if (signo) {
        const h = this.ejeBisagra(b), np = normal.clone().normalize().multiplyScalar(signo);
        h.sub(u.clone().multiplyScalar(h.dot(u))); np.sub(u.clone().multiplyScalar(np.dot(u)));
        if (h.lengthSq() > 1e-10 && np.lengthSq() > 1e-10) {
          h.normalize(); np.normalize();
          const ang = Math.atan2(h.clone().cross(np).dot(u), h.dot(np));
          this.girarEnMundo(a, new THREE.Quaternion().setFromAxisAngle(u, ang));
          this.raiz.updateMatrixWorld(true);
        }
      }
      // el doblez da la DISTANCIA hombro–mano (cadera–tobillo) y un giro del hueso
      // de arriba la DIRECCIÓN: el eje de la bisagra no siempre es perpendicular a
      // la canilla (las poses traen la pierna girada) y doblar solo no llegaba
      this.doblarHacia(b, { desde: A, largo: d }, false);
      const punta = this.articulacion(e)!;
      if (punta.distanceTo(A) > 1e-6) {
        this.girarEnMundo(a, new THREE.Quaternion().setFromUnitVectors(punta.sub(A).normalize(), T.clone().sub(A).normalize()));
        this.raiz.updateMatrixWorld(true);
      }
      // de las dos, la que deja el codo/la rodilla del lado de antes
      const err = this.articulacion(e)!.distanceTo(T) + this.articulacion(b)!.distanceTo(nuevoB) * 0.01;
      if (!mejor || err < mejor.err) mejor = { err, s: guardar() };
    }
    if (mejor) volver(mejor.s);
  }
  /** El eje de una bisagra en el mundo, como está ahora (va con el hueso de arriba). */
  private ejeBisagra(n: string): THREE.Vector3 {
    const hb = this.huesos.get(n)!, r = this.reposo.get(n)!, w = this.enReposo.get(n)!;
    const q = (hb.parent ? hb.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()).multiply(r.q);
    return new THREE.Vector3().fromArray(BISAGRAS[n].doblar).applyQuaternion(w.clone().invert()).applyQuaternion(q).normalize();
  }
  /** Dónde está la cadera (el agarre que mueve el cuerpo entero). */
  cadera(): THREE.Vector3 | null { return this.articulacion('pelvis'); }
  /** Mueve la cadera (en el mundo) con los PIES QUIETOS: las piernas se doblan
   *  solas para que cada pie siga donde estaba (agacharse, inclinarse, sentarse). */
  moverCadera(hasta: THREE.Vector3, pies: { l: THREE.Vector3; r: THREE.Vector3 } | null): void {
    const p = this.huesos.get('pelvis'); if (!p || !p.parent) return;
    this.raiz.updateMatrixWorld(true);
    const local = p.parent.worldToLocal(hasta.clone()), r = this.reposo.get('pelvis')!;
    const off = local.sub(r.p);
    const conPies = this.datos.pies;
    this.datos.raiz = off.lengthSq() > 1e-12 ? off.toArray().map((v) => Math.round(v * 1e5) / 1e5) : undefined;
    this.datos.pies = false; this.aplicar();
    if (pies) {
      for (const [lado, t] of [['l', pies.l], ['r', pies.r]] as [string, THREE.Vector3][]) {
        const fin = this.huesos.get('foot_' + lado)!, q = fin.getWorldQuaternion(new THREE.Quaternion());
        this.resolverIK('thigh_' + lado, 'calf_' + lado, 'foot_' + lado, t);
        this.girarEnMundo('foot_' + lado, q.multiply(fin.getWorldQuaternion(new THREE.Quaternion()).invert()));
      }
    }
    // sin volver a apoyar en el piso: los pies quedaron clavados donde estaban
    // (apoyar de nuevo corría el cuerpo 1–3 cm y los pies resbalaban)
    this.datos.pies = conPies;
    this.actualizar();
  }

  /* ── LA ACTUACIÓN ── */
  /** Pone el cuerpo como está en ese cuadro de su actuación (si tiene claves). */
  irACuadro(f: number): boolean {
    const p = poseEnCuadro(this.datos.actuacion, f);
    if (!p) return false;
    this.datos.pose = p.pose; this.datos.raiz = p.raiz;
    this.aplicar();
    return true;
  }
  /** La pose de ahora como clave en ese cuadro (reemplaza la que hubiera). */
  claveAqui(f: number): void {
    const a = this.datos.actuacion ?? (this.datos.actuacion = { cuadros: Math.max(24, f), claves: [] });
    a.cuadros = Math.max(a.cuadros, f);
    const c: ClaveActuacion = { f, pose: JSON.parse(JSON.stringify(this.datos.pose)), ...(this.datos.raiz ? { raiz: this.datos.raiz.slice() } : {}) };
    a.claves = [...a.claves.filter((k) => k.f !== f), c].sort((x, y) => x.f - y.f);
  }
  quitarClave(f: number): void {
    const a = this.datos.actuacion; if (!a) return;
    a.claves = a.claves.filter((k) => k.f !== f);
    if (!this.irACuadro(f)) this.aplicar();
  }
  ponerCuadros(n: number): void {
    const a = this.datos.actuacion ?? (this.datos.actuacion = { cuadros: 24, claves: [] });
    a.cuadros = Math.round(Math.max(1, Math.min(10000, n)));
    a.claves = a.claves.filter((k) => k.f <= a.cuadros);
  }
  /** Los giros locales de una animación → «giro desde el reposo en los ejes del mundo». */
  private poseDeLocales(giros: Map<string, THREE.Quaternion> | Record<string, number[]>): Record<string, number[]> {
    const pose: Record<string, number[]> = {};
    const entradas = giros instanceof Map ? [...giros.entries()] : Object.entries(giros).map(([n, q]) => [n, new THREE.Quaternion().fromArray(q)] as [string, THREE.Quaternion]);
    for (const [n, q] of entradas) {
      if (n === 'root' || !this.huesos.has(n)) continue;
      const r = this.reposo.get(n)!, w = this.enReposo.get(n)!;
      const g = w.clone().multiply(r.q.clone().invert().multiply(q)).multiply(w.clone().invert()).normalize();
      if (1 - Math.abs(g.w) > 1e-6) pose[n] = g.toArray().map((v) => Math.round(v * 1e5) / 1e5);
    }
    return pose;
  }
  /** Una animación de la biblioteca hecha CLAVES desde el cuadro `desde`, una
   *  por cuadro de la escena (a `fps`), `vel` veces más rápida o lenta. Las
   *  claves que había en ese tramo se reemplazan; después se pueden retocar.
   *  Si la animación salta o se tira al piso, los pies dejan de apoyarse solos. */
  ponerAnimacion(id: string, desde: number, fps: number, vel = 1): number {
    const a = animListas, c = a?.clips.find((x) => x.id === id);
    if (!a || !c) return 0;
    const n = Math.max(1, Math.round((c.segundos * fps) / Math.max(0.05, vel)) + 1);
    const act = this.datos.actuacion ?? (this.datos.actuacion = { cuadros: 24, claves: [] });
    const hasta = desde + n - 1;
    act.cuadros = Math.max(act.cuadros, hasta);
    const p0 = new THREE.Vector3().fromArray(a.pelvis), rp = this.reposo.get('pelvis')!.p;
    const k = p0.length() > 1e-6 ? rp.length() / p0.length() : 1;
    let subeBaja = 0;
    const nuevas: ClaveActuacion[] = [];
    for (let i = 0; i < n; i++) {
      const s = muestraDeClip(a, c, Math.min(c.cuadros - 1, ((i / fps) * vel) * a.fps));
      const off = s.pelvis.clone().sub(p0).multiplyScalar(k);
      subeBaja = Math.max(subeBaja, Math.abs(off.z), Math.abs(off.y));
      nuevas.push({ f: desde + i, pose: this.poseDeLocales(s.giros), ...(off.lengthSq() > 1e-10 ? { raiz: off.toArray().map((v) => Math.round(v * 1e5) / 1e5) } : {}) });
    }
    act.claves = [...act.claves.filter((x) => x.f < desde || x.f > hasta), ...nuevas].sort((x, y) => x.f - y.f);
    if (subeBaja > 0.12 * this.altoNatural) this.datos.pies = false;
    this.irACuadro(desde);
    return n;
  }

  /* ── LA DEFINICIÓN ── */
  /** Los datos del mismo personaje con otra definición: la escultura pasa
   *  (al subir, la piel esculpida se subdivide; al bajar, quedan los puntos
   *  que existían en ese nivel). */
  conDefinicion(nivel: number): PersonajeDatos {
    const d = this.aDatos(), actual = this.datos.definicion ?? 0;
    nivel = Math.max(0, Math.min(2, Math.round(nivel)));
    if (nivel === actual) return d;
    const arr = this.cuerpo.geometry.attributes.position.array as Float32Array;
    let escultura: string | undefined;
    if (nivel > actual) {
      let g = this.cuerpo.geometry, original = pielEnNivel(this.datos.base, this.cuerpo.geometry, 0);
      original.setAttribute('position', new THREE.BufferAttribute(this.original.slice(), 3));
      for (let k = actual; k < nivel; k++) { g = subdividir(g, g === this.cuerpo.geometry ? arr : g.attributes.position.array as Float32Array); original = subdividir(original); }
      escultura = esculturaATexto(original.attributes.position.array as Float32Array, g.attributes.position.array as Float32Array);
      g.dispose(); original.dispose();
    } else {
      const base = cuerpos.get(this.datos.base)!;
      let g0: THREE.BufferGeometry | null = null;
      base.scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && (!g0 || m.geometry.attributes.position.count > g0.attributes.position.count)) g0 = m.geometry; });
      const nAbajo = pielEnNivel(this.datos.base, g0!, nivel).attributes.position.count;
      escultura = esculturaATexto(this.original.subarray(0, nAbajo * 3), arr.subarray(0, nAbajo * 3));
    }
    return { ...d, definicion: nivel, escultura };
  }
  /** Cuántos triángulos tiene la piel (para mostrarlo). */
  triangulos(): number { const g = this.cuerpo.geometry; return (g.index ? g.index.count : g.attributes.position.count) / 3; }

  /* ── tocar la piel (rápido) ── */
  private rejilla: RejillaPiel | null = null;
  tocarPiel(rayo: THREE.Ray): { punto: THREE.Vector3; distancia: number; tri: number; a: number; b: number; c: number; normal: THREE.Vector3 } | null {
    const pos = this.posicionesMundo(), g = this.cuerpo.geometry;
    const idx = g.index ? (g.index.array as ArrayLike<number>) : Array.from({ length: pos.length / 3 }, (_, i) => i);
    if (!this.rejilla) this.rejilla = new RejillaPiel(pos, idx);
    const h = this.rejilla.tocar(rayo);
    if (!h) return null;
    const a = idx[h.tri * 3], b = idx[h.tri * 3 + 1], c = idx[h.tri * 3 + 2];
    const A = new THREE.Vector3().fromArray(pos, a * 3), B = new THREE.Vector3().fromArray(pos, b * 3), C = new THREE.Vector3().fromArray(pos, c * 3);
    const normal = B.sub(A).cross(C.sub(A)).normalize();
    if (normal.dot(rayo.direction) > 0) normal.negate();
    return { punto: rayo.origin.clone().addScaledVector(rayo.direction, h.t), distancia: h.t, tri: h.tri, a, b, c, normal };
  }
  liberar(): void {
    for (const m of this.mallas) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  }
}
