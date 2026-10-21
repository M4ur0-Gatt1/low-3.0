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
export type PincelEscultura = 'tirar' | 'inflar' | 'desinflar' | 'suavizar' | 'aplanar';
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
  /** la piel esculpida: [índice, dx, dy, dz, …] de los vértices movidos */
  escultura?: number[];
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
  const pose: Record<string, number[]> = {};
  if (o.pose && typeof o.pose === 'object') for (const [k, v] of Object.entries(o.pose)) {
    if (typeof k !== 'string' || k.length > 40 || !Array.isArray(v) || v.length !== 4 || !v.every((n) => Number.isFinite(Number(n)))) continue;
    const q = new THREE.Quaternion(Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3]));
    if (q.lengthSq() < 1e-6) continue;
    // ya normalizado (lo que guarda el taller, redondeado) se deja tal cual: renormalizar
    // movía los últimos decimales y un Ctrl+Z no volvía a la MISMA pose
    pose[k] = Math.abs(q.length() - 1) > 1e-3 ? q.normalize().toArray() : v.map(Number);
  }
  const escultura = Array.isArray(o.escultura) && o.escultura.length % 4 === 0 && o.escultura.length <= 4 * 40000 && o.escultura.every((n) => Number.isFinite(Number(n)))
    ? o.escultura.map(Number) : undefined;
  return { base, prop, pose, pies: o.pies !== false, color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : COLOR_ARCILLA, ...(escultura?.length ? { escultura } : {}),
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
    this.original = new Float32Array(this.cuerpo.geometry.attributes.position.array as Float32Array);
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
  private doblarHacia(n: string, rayo: THREE.Ray): void {
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
      const dist = rayo.distanceSqToPoint(tip);
      if (dist < md - 1e-12) { md = dist; mejor = g; }
    }
    const q = new THREE.Quaternion().setFromAxisAngle(eje, (mejor * Math.PI) / 180).multiply(tw);
    this.datos.pose[n] = q.toArray().map((v) => Math.round(v * 1e5) / 1e5);
    this.aplicar();
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
    const pos = this.posicionesMundo(), out: { i: number; f: number }[] = [], r2 = radio * radio;
    for (let i = 0, n = pos.length / 3; i < n; i++) {
      const d = (pos[i * 3] - centro.x) ** 2 + (pos[i * 3 + 1] - centro.y) ** 2 + (pos[i * 3 + 2] - centro.z) ** 2;
      if (d < r2) { const t = 1 - d / r2; out.push({ i, f: t * t }); }
    }
    return out;
  }
  /** Un toque de pincel: `mover(i, f)` da el corrimiento EN EL MUNDO de cada
   *  vértice; acá se pasa a la piel en reposo (y al par espejado). */
  private correr(afectados: { i: number; f: number }[], mover: (i: number, f: number) => THREE.Vector3 | null, simetria: boolean): void {
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
    attr.needsUpdate = true;
    this.versionPiel++;
    this.recalcularNormales();
    this.actualizar();
  }
  /** Inflar (signo +1) o desinflar (−1): por la normal de cada vértice. */
  inflar(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean): void {
    const nrm = this.cuerpo.geometry.attributes.normal as THREE.BufferAttribute;
    const m3 = new THREE.Matrix3();
    this.correr(this.bajoElPincel(centro, radio), (i, f) => {
      this.piel(i, m3);
      const n = new THREE.Vector3().fromBufferAttribute(nrm, i).applyMatrix3(m3).normalize();
      return n.multiplyScalar(signo * fuerza * f * radio * 0.06);
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
  private ponerEscultura(lista: number[]): void {
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute, arr = attr.array as Float32Array, n = arr.length / 3;
    for (let k = 0; k + 3 < lista.length; k += 4) {
      const i = lista[k]; if (!(i >= 0 && i < n)) continue;
      arr[i * 3] = this.original[i * 3] + lista[k + 1]; arr[i * 3 + 1] = this.original[i * 3 + 1] + lista[k + 2]; arr[i * 3 + 2] = this.original[i * 3 + 2] + lista[k + 3];
    }
    attr.needsUpdate = true;
    this.recalcularNormales();
  }
  /** Los datos para guardar (con la escultura como lista de corrimientos). */
  aDatos(): PersonajeDatos {
    const arr = this.cuerpo.geometry.attributes.position.array as Float32Array, out: number[] = [];
    const r = (v: number) => Math.round(v * 1e5) / 1e5;
    for (let i = 0, n = arr.length / 3; i < n; i++) {
      const dx = arr[i * 3] - this.original[i * 3], dy = arr[i * 3 + 1] - this.original[i * 3 + 1], dz = arr[i * 3 + 2] - this.original[i * 3 + 2];
      if (Math.abs(dx) > 1e-5 || Math.abs(dy) > 1e-5 || Math.abs(dz) > 1e-5) out.push(i, r(dx), r(dy), r(dz));
    }
    const d = this.datos;
    return { base: d.base, prop: { ...d.prop }, pose: JSON.parse(JSON.stringify(d.pose)), pies: d.pies, color: d.color, ...(out.length ? { escultura: out } : {}) };
  }
  /** Vuelve a unos datos (deshacer, abrir) sin cambiar de cuerpo. */
  ponerDatos(x: PersonajeDatos): void {
    const d = personajeValido(x);
    this.datos.prop = d.prop; this.datos.pose = d.pose; this.datos.pies = d.pies;
    this.ponerColor(d.color);
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute;
    (attr.array as Float32Array).set(this.original); this.versionPiel++;
    if (d.escultura) this.ponerEscultura(d.escultura); else { attr.needsUpdate = true; this.recalcularNormales(); }
    this.aplicar();
  }
  liberar(): void {
    for (const m of this.mallas) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  }
}
