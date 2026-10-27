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
import { capasValidas, piezasValidas, levantarPieza, mascaraATexto, mascaraDeTexto, curvaCaida, idNuevo, CAPA_FUERZA, PIEZA_GROSOR,
  type CapaEscultura, type Pieza, type CaidaPincel } from './modelado3d';

export type BaseCuerpo = 'hombre' | 'mujer' | 'maniqui' | 'hombre-realista' | 'mujer-realista';
/** Qué hace el mouse sobre el personaje en el taller. */
export type ModoTaller = 'dibujar' | 'posar' | 'animar' | 'esculpir';
export type PincelEscultura = 'dibujar' | 'arcilla' | 'capa' | 'inflar' | 'desinflar' | 'surco' | 'pellizcar' | 'suavizar' | 'aplanar' | 'raspar'
  | 'tirar' | 'gancho' | 'empujar' | 'mascara';
/** Las partes del cuerpo para enmascarar de un clic (los «polygroups» que ya trae el esqueleto). */
export const PARTES_MASCARA: { id: string; nombre: string; huesos: RegExp }[] = [
  { id: 'cabeza', nombre: 'Cabeza', huesos: /^Head$/ },
  { id: 'cuello', nombre: 'Cuello', huesos: /^neck_01$/ },
  { id: 'torso', nombre: 'Torso', huesos: /^(spine_0[123]|clavicle_[lr])$/ },
  { id: 'cadera', nombre: 'Cadera', huesos: /^pelvis$/ },
  { id: 'brazos', nombre: 'Brazos', huesos: /^upperarm_[lr]$/ },
  { id: 'antebrazos', nombre: 'Antebrazos', huesos: /^lowerarm_[lr]$/ },
  { id: 'manos', nombre: 'Manos', huesos: /^(hand_[lr]|(index|middle|ring|pinky|thumb)_0[123]_[lr])$/ },
  { id: 'muslos', nombre: 'Muslos', huesos: /^thigh_[lr]$/ },
  { id: 'piernas', nombre: 'Piernas', huesos: /^calf_[lr]$/ },
  { id: 'pies', nombre: 'Pies', huesos: /^(foot_[lr]|ball_[lr])$/ },
];
export type FiltroEscultura = 'suavizar' | 'inflar' | 'desinflar' | 'afilar';
export const CUERPOS: { id: BaseCuerpo; nombre: string; descripcion: string }[] = [
  { id: 'hombre', nombre: 'Hombre', descripcion: 'Anatomía realista, estilizada (8 cabezas)' },
  { id: 'mujer', nombre: 'Mujer', descripcion: 'Anatomía realista, estilizada (8 cabezas)' },
  { id: 'maniqui', nombre: 'Maniquí', descripcion: 'El maniquí articulado de dibujo, sin rasgos' },
  // los Human Base Meshes de Blender Studio (CC0), con el esqueleto del Taller: ver herramientas/scripts/rig.py
  { id: 'hombre-realista', nombre: 'Hombre (estudio)', descripcion: 'Anatomía de estudio, proporción real (8 cabezas), sin gestos de cara todavía' },
  { id: 'mujer-realista', nombre: 'Mujer (estudio)', descripcion: 'Anatomía de estudio, proporción real (7,5 cabezas), sin gestos de cara todavía' },
];
/** Los cuerpos de los Human Base Meshes: su boca no es la de los otros (no se parte). */
const SIN_BOCA = new Set<BaseCuerpo>(['hombre-realista', 'mujer-realista']);

/** Las proporciones: 1 = como viene el cuerpo. */
export interface Proporciones {
  /** el tamaño entero (el alto en metros sale de acá) */
  escala: number;
  cabeza: number; cuello: number; torso: number; hombros: number; caderas: number; brazos: number; piernas: number;
  /** el tamaño de las manos y de los pies */
  manos: number; pies: number;
}
export const PROP_NEUTRA: Proporciones = { escala: 1, cabeza: 1, cuello: 1, torso: 1, hombros: 1, caderas: 1, brazos: 1, piernas: 1, manos: 1, pies: 1 };
export const PROP_RANGOS: Record<keyof Proporciones, [number, number]> = {
  escala: [0.2, 5], cabeza: [0.6, 2], cuello: [0.4, 2.2], torso: [0.7, 1.5], hombros: [0.6, 1.7],
  caderas: [0.6, 1.6], brazos: [0.7, 1.5], piernas: [0.55, 1.6], manos: [0.6, 1.7], pies: [0.6, 1.7],
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
  /** la contextura: peso y músculo (flaco, gordo, atlético…) */
  forma?: Forma;
  /** los gestos de la cara (ojos, boca, cejas) */
  cara?: Cara;
  /** una pose de fábrica por nombre (los de la biblioteca): se resuelve al crearlo */
  poseFabrica?: string;
  /** las capas de escultura, cada una con su dial (v3.41) */
  capas?: CapaEscultura[];
  /** las piezas: ropa, pelo, accesorios levantados de la piel (v3.41) */
  piezas?: Pieza[];
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
  const raiz = raizValida(o.raiz), actuacion = actuacionValida(o.actuacion), forma = formaValida(o.forma), cara = caraValida(o.cara);
  const capas = capasValidas(o.capas), piezas = piezasValidas(o.piezas);
  return { base, prop, pose, pies: o.pies !== false, color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : COLOR_ARCILLA, ...(escultura?.length ? { escultura } : {}),
    ...(definicion ? { definicion } : {}), ...(raiz ? { raiz } : {}), ...(actuacion ? { actuacion } : {}), ...(forma ? { forma } : {}), ...(cara ? { cara } : {}),
    ...(capas ? { capas } : {}), ...(piezas ? { piezas } : {}),
    ...(typeof o.poseFabrica === 'string' && /^[a-z0-9-]{1,30}$/.test(o.poseFabrica) ? { poseFabrica: o.poseFabrica } : {}) };
}
export function personajeNuevo(base: BaseCuerpo = 'hombre'): PersonajeDatos {
  // con definición Alta de entrada: la piel de fábrica (12 mil triángulos) se veía tosca
  return { base, prop: { ...PROP_NEUTRA }, pose: {}, pies: true, color: COLOR_ARCILLA, definicion: 1 };
}

/* ── LAS ARTICULACIONES QUE SE AGARRAN ─────────────────────────────────────── */
/** Qué se mueve al tocar un hueso: los dedos mueven la muñeca; el talón, el
 *  tobillo; la clavícula, el hombro; la columna entera es «el tronco». */
/** Los huesos de giro del antebrazo («giro_lowerarm_l») son parte de su hueso. */
export const nombreReal = (n: string): string => n.replace(/^giro_/, '');
export function controlDeHueso(n: string): string {
  n = nombreReal(n);
  if (/^(index|middle|pinky|ring|thumb)_/.test(n)) return 'hand_' + n.slice(-1);
  if (/^ball/.test(n)) return 'foot_' + n.slice(-1);
  if (n === 'root') return 'pelvis';
  if (/^spine_0[123]$/.test(n)) return 'tronco';
  return n;
}
const TRONCO = ['spine_01', 'spine_02', 'spine_03'];
/** Los huesos que mueve un control y cuánto del giro se lleva cada uno: el
 *  tronco lo reparte en las tres vértebras; la CABEZA, entre el cuello y ella
 *  (girar la cabeza sola, desde la base del cráneo, la quebraba). */
export function huesosDeControl(c: string): string[] { return c === 'tronco' ? TRONCO : c === 'Head' ? ['neck_01', 'Head'] : [c]; }
function pesosDeControl(c: string): number[] { return c === 'tronco' ? [1 / 3, 1 / 3, 1 / 3] : c === 'Head' ? [0.45, 0.55] : [1]; }
/** LÍMITES ANATÓMICOS POR EJE (grados, en los ejes del mundo en reposo: x
 *  adelante/atrás, y girar, z inclinar al costado). Sumados cuello + cabeza,
 *  los de un cuello de verdad: agachar 50° (el mentón al pecho), levantar la
 *  cara 55°, inclinar 34°, girar 76°; cada vértebra un poco. Medido: con sólo
 *  un tope del ángulo total, o con 75° adelante, la cabeza quedaba quebrada
 *  contra el hombro. */
const EJES: Record<string, [[number, number], [number, number], [number, number]]> = {
  neck_01: [[-30, 26], [-36, 36], [-18, 18]],
  Head: [[-25, 24], [-40, 40], [-16, 16]],
  spine_01: [[-12, 30], [-15, 15], [-12, 12]],
  spine_02: [[-12, 30], [-15, 15], [-12, 12]],
  spine_03: [[-12, 25], [-15, 15], [-12, 12]],
  // EL HOMBRO (desde la T: el brazo izquierdo apunta a +x; el derecho, espejado).
  // z: subir (hasta vertical; la clavícula suma el resto) o bajar al costado;
  // y: adelante cruzando el pecho / un poco atrás; x: rotar sobre su largo.
  // Medido: sin topes, el brazo pasaba por encima de la cabeza al otro lado. Sólo al
  // GIRARLO (arrastre, flechas, diales): la IK del anillo de la mano rota el húmero
  // sobre su largo para orientar el codo y una caja de ejes la dejaba sin llegar.
  upperarm_l: [[-85, 85], [-135, 45], [-100, 92]],
  // LA CADERA (medido: x+ lleva la pierna atrás; z+ la abre, en la izquierda):
  // adelante 125°, atrás 30°, abrir 50°, cruzar 30°, rotar 40°
  thigh_l: [[-125, 30], [-40, 45], [-30, 50]],
  // LA MUÑECA (z+ levanta los dedos con la palma abajo; y+ los lleva al meñique):
  // doblar 80°, levantar 70°, hacia el meñique 35°, hacia el pulgar 20°; girar
  // casi nada (la mano gira con el antebrazo: radio y cúbito)
  hand_l: [[-25, 25], [-20, 35], [-80, 70]],
  // EL TOBILLO (x+ levanta la punta): abajo 50°, arriba 25°, de costado y torcer 25°
  foot_l: [[-50, 25], [-25, 25], [-25, 25]],
  // LA CLAVÍCULA: subir 40°, bajar 15°, adelantar 30°, atrasar 25°
  clavicle_l: [[-15, 15], [-30, 25], [-15, 40]],
};
// el lado derecho: el espejo del izquierdo (x queda; y y z cambian de signo)
for (const n of ['upperarm', 'thigh', 'hand', 'foot', 'clavicle']) {
  const L = EJES[n + '_l'];
  EJES[n + '_r'] = [[L[0][0], L[0][1]], [-L[1][1], -L[1][0]], [-L[2][1], -L[2][0]]];
}
// los que la IK de anillos y la cadera con los pies quietos necesitan libres (el
// tope va al girarlos a mano: arrastre, flechas, diales)
const SOLO_AL_GIRAR = new Set(['upperarm_l', 'upperarm_r', 'thigh_l', 'thigh_r', 'hand_l', 'hand_r', 'foot_l', 'foot_r']);
/** los que se topan en elipse (agachar + inclinar): la columna y el cuello */
const ELIPSE = new Set(['neck_01', 'Head', 'spine_01', 'spine_02', 'spine_03']);
function limitarEjes(n: string, q: THREE.Quaternion, girando = false): THREE.Quaternion {
  const L = EJES[n]; if (!L || (!girando && SOLO_AL_GIRAR.has(n))) return q;
  const e = new THREE.Euler().setFromQuaternion(q, 'YXZ'), R = Math.PI / 180;
  e.y = Math.max(L[1][0] * R, Math.min(L[1][1] * R, e.y));
  // agachar e inclinar juntos: un tope ELÍPTICO (con dos topes sueltos, en la
  // diagonal se sumaban y la cabeza caía sobre el hombro)
  if (ELIPSE.has(n)) {
    const mx = (e.x >= 0 ? L[0][1] : -L[0][0]) * R, mz = (e.z >= 0 ? L[2][1] : -L[2][0]) * R;
    const k = Math.hypot(e.x / Math.max(1e-6, mx), e.z / Math.max(1e-6, mz));
    if (k > 1) { e.x /= k; e.z /= k; }
  } else {
    e.x = Math.max(L[0][0] * R, Math.min(L[0][1] * R, e.x));
    e.z = Math.max(L[2][0] * R, Math.min(L[2][1] * R, e.z));
  }
  return new THREE.Quaternion().setFromEuler(e);
}
/** Los diales del AJUSTE FINO de cada control: qué hace cada eje y su tope. */
export interface Dial { eje: 'x' | 'y' | 'z' | 'doblar' | 'rotar'; nombre: string; min: number; max: number }
/** Los diales del lado derecho valen ESPEJADOS (y y z cambian de signo): así
 *  «abrir» abre las dos piernas hacia su lado. Medido: con el mismo signo, abrir
 *  la pierna derecha la cruzaba. */
const espejado = (c: string) => /_r$/.test(c);
export function dialesDe(c: string): Dial[] {
  const b = c.replace(/_[lr]$/, '');
  const D = (eje: Dial['eje'], nombre: string, min: number, max: number): Dial => ({ eje, nombre, min, max });
  switch (b) {
    case 'pelvis': return [D('x', 'Inclinar adelante', -60, 90), D('y', 'Girar', -180, 180), D('z', 'Inclinar al costado', -45, 45)];
    case 'tronco': return [D('x', 'Agacharse / arquearse', -36, 85), D('y', 'Girar', -45, 45), D('z', 'Inclinar al costado', -36, 36)];
    case 'neck_01': return [D('x', 'Agachar / levantar', -30, 26), D('y', 'Girar', -36, 36), D('z', 'Ladear', -18, 18)];
    case 'Head': return [D('x', 'Asentir', -55, 50), D('y', 'Mirar al costado', -76, 76), D('z', 'Ladear', -34, 34)];
    case 'clavicle': return [D('z', 'Bajar / subir el hombro', -15, 40), D('y', 'Adelantar / atrasar', -30, 25)];
    case 'upperarm': return [D('z', 'Subir / bajar el brazo', -100, 100), D('y', 'Adelante / atrás', -120, 120), D('x', 'Rotar el brazo', -90, 90)];
    case 'lowerarm': case 'calf': return [D('doblar', 'Doblar', 0, 150), D('rotar', 'Rotar', -90, 90)];
    case 'hand': return [D('z', 'Doblar / levantar la muñeca', -80, 70), D('y', 'Al pulgar / al meñique', -20, 35), D('x', 'Girar (poco: gira el antebrazo)', -25, 25)];
    case 'thigh': return [D('x', 'Adelante / atrás', -125, 30), D('z', 'Cruzar / abrir', -30, 50), D('y', 'Rotar la pierna', -40, 45)];
    case 'foot': return [D('x', 'Punta abajo / arriba', -50, 25), D('y', 'Punta adentro / afuera', -25, 25), D('z', 'Torcer', -25, 25)];
    default: return [];
  }
}
/** Hacia dónde apunta cada control: la punta que se arrastra. */
const PUNTA: Record<string, string> = {
  clavicle_l: 'upperarm_l', clavicle_r: 'upperarm_r',
  upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', hand_l: 'middle_02_l',
  upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r', hand_r: 'middle_02_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', foot_l: 'ball_l',
  thigh_r: 'calf_r', calf_r: 'foot_r', foot_r: 'ball_r',
  neck_01: 'Head', tronco: 'neck_01', pelvis: 'spine_03',
};
export const CONTROLES = ['pelvis', 'tronco', 'neck_01', 'Head', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r',
  'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'];
export function nombreControl(c: string): string {
  const lado = c.endsWith('_l') ? 'izquierd' : c.endsWith('_r') ? 'derech' : '';
  const base: Record<string, [string, 'o' | 'a']> = {
    pelvis: ['Cuerpo entero', 'o'], tronco: ['Tronco', 'o'], neck_01: ['Cuello', 'o'], Head: ['Cabeza', 'a'],
    clavicle: ['Clavícula', 'a'], upperarm: ['Hombro', 'o'], lowerarm: ['Codo', 'o'], hand: ['Muñeca', 'a'], thigh: ['Cadera', 'a'], calf: ['Rodilla', 'a'], foot: ['Tobillo', 'o'],
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

/** El material de la PIEL que se esculpe: además de la arcilla, oscurece el
 *  interior de la boca (atributo `adentro`: se ve al abrirla) y muestra la
 *  MÁSCARA (atributo `mascara`) en gris oscuro, como Blender y ZBrush. */
function materialDelCuerpo(m: THREE.MeshStandardMaterial): void {
  const previo = m.onBeforeCompile;
  m.customProgramCacheKey = () => 'arcilla-cuerpo' + (m.map ? '-tex' : '');
  m.onBeforeCompile = (sh, r) => {
    if (m.map) previo.call(m, sh, r);
    skinningConVolumen(sh);
    sh.vertexShader = 'attribute float adentro;\nattribute float mascara;\nvarying float vAdentro;\nvarying float vMascara;\n'
      + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAdentro = adentro; vMascara = mascara;');
    sh.fragmentShader = 'varying float vAdentro;\nvarying float vMascara;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(1.0, 0.16, vAdentro);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.3 + vec3(0.03, 0.045, 0.08), clamp(vMascara, 0.0, 1.0) * 0.85);`);
  };
  m.needsUpdate = true;
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
export interface ClaveActuacion { f: number; pose: Record<string, number[]>; raiz?: number[]; cara?: Cara }
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
    const r = raizValida(c.raiz), ca = caraValida(c.cara);
    return { f, pose: poseValida(c.pose), ...(r ? { raiz: r } : {}), ...(ca ? { cara: ca } : {}) } as ClaveActuacion;
  }).filter((c): c is ClaveActuacion => !!c).sort((a, b) => a.f - b.f);
  return { cuadros, claves };
}
/** La pose entre dos claves: cada hueso gira de una a la otra (slerp). */
export function poseEnCuadro(a: Actuacion | undefined, f: number): { pose: Record<string, number[]>; raiz?: number[]; cara?: Cara } | null {
  if (!a || !a.claves.length) return null;
  let k0: ClaveActuacion | null = null, k1: ClaveActuacion | null = null;
  for (const c of a.claves) { if (c.f <= f) k0 = c; else { k1 = c; break; } }
  const copia = (c: ClaveActuacion) => ({ pose: JSON.parse(JSON.stringify(c.pose)), ...(c.raiz ? { raiz: c.raiz.slice() } : {}), ...(c.cara ? { cara: { ...c.cara } } : {}) });
  if (!k0) return copia(k1!);
  if (!k1 || k0.f === f) return copia(k0);
  // de una pose a la otra ARRANCA Y FRENA SUAVE (ease in/out), no a velocidad pareja;
  // las claves de una animación de la biblioteca (una por cuadro) no lo notan
  const u = (f - k0.f) / (k1.f - k0.f), t = k1.f - k0.f > 1 ? u * u * (3 - 2 * u) : u;
  const pose: Record<string, number[]> = {};
  const q0 = new THREE.Quaternion(), q1 = new THREE.Quaternion();
  for (const n of new Set([...Object.keys(k0.pose), ...Object.keys(k1.pose)])) {
    q0.fromArray(k0.pose[n] ?? [0, 0, 0, 1]); q1.fromArray(k1.pose[n] ?? [0, 0, 0, 1]);
    const q = q0.clone().slerp(q1, t);
    if (1 - Math.abs(q.w) > 1e-7) pose[n] = q.toArray().map((v) => Math.round(v * 1e5) / 1e5);
  }
  const r0 = k0.raiz ?? [0, 0, 0], r1 = k1.raiz ?? [0, 0, 0];
  const raiz = r0.map((v, i) => Math.round((v + (r1[i] - v) * t) * 1e5) / 1e5);
  // la cara pasa de un gesto al otro (para hablar: una clave por sílaba)
  let cara: Cara | undefined;
  if (k0.cara || k1.cara) {
    const c0 = { ...CARA_NEUTRA, ...k0.cara }, c1 = { ...CARA_NEUTRA, ...k1.cara }, c = { ...CARA_NEUTRA };
    for (const k of Object.keys(c) as (keyof Cara)[]) c[k] = c0[k] + (c1[k] - c0[k]) * t;
    cara = caraValida(c);
  }
  return { pose, ...(raiz.some((v) => v !== 0) ? { raiz } : {}), ...(cara ? { cara } : {}) };
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
  for (const nombre of ['labio', 'adentro', 'mascara']) {
    const LB = g.attributes[nombre] as THREE.BufferAttribute | undefined;
    if (!LB) continue;
    const la = new Float32Array(m); la.set(LB.array as Float32Array);
    for (let e = 0; e < ea.length; e++) la[n + e] = (LB.getX(ea[e]) + LB.getX(eb[e])) / 2;
    out.setAttribute(nombre, new THREE.BufferAttribute(la, 1));
  }
  out.userData = { ...g.userData };
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

/* ── LA CARA: abrir la boca, cerrar los ojos, mirar, cejas, sonrisa ───────── */
/** Los gestos de la cara (0 = como viene el cuerpo). Van en las claves de la actuación. */
export interface Cara {
  /** párpados: 0 abiertos, 1 cerrados (negativo: muy abiertos, sorpresa) */
  ojoI: number; ojoD: number;
  /** hacia dónde miran los ojos: −1…1 (izquierda/derecha del personaje, abajo/arriba) */
  miraX: number; miraY: number;
  /** la mandíbula: 0 cerrada, 1 abierta del todo */
  boca: number;
  /** las comisuras: −1 triste, 1 sonrisa */
  sonrisa: number;
  /** el ancho de la boca: −1 fruncida (O, U), 1 estirada (E, I) */
  ancho: number;
  /** las cejas: −1 abajo, 1 arriba; fruncir (enojo): 0…1 */
  cejas: number; fruncir: number;
}
export const CARA_NEUTRA: Cara = { ojoI: 0, ojoD: 0, miraX: 0, miraY: 0, boca: 0, sonrisa: 0, ancho: 0, cejas: 0, fruncir: 0 };
const CARA_RANGOS: Record<keyof Cara, [number, number]> = {
  ojoI: [-0.4, 1], ojoD: [-0.4, 1], miraX: [-1, 1], miraY: [-1, 1], boca: [0, 1], sonrisa: [-1, 1], ancho: [-1, 1], cejas: [-1, 1], fruncir: [0, 1],
};
function caraValida(x: unknown): Cara | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<Cara>, c = { ...CARA_NEUTRA };
  for (const k of Object.keys(CARA_RANGOS) as (keyof Cara)[]) c[k] = Math.round(lim(o[k], 0, CARA_RANGOS[k][0], CARA_RANGOS[k][1]) * 1000) / 1000;
  return Object.values(c).some((v) => v !== 0) ? c : undefined;
}
/** Expresiones y posiciones de la boca para hablar (los visemas), listas para usar. */
export const EXPRESIONES: { id: string; nombre: string; cara: Partial<Cara> }[] = [
  { id: 'neutral', nombre: 'Neutral', cara: {} },
  { id: 'sonrisa', nombre: 'Sonrisa', cara: { sonrisa: 0.8, ancho: 0.3, ojoI: 0.12, ojoD: 0.12 } },
  { id: 'risa', nombre: 'Risa', cara: { sonrisa: 1, boca: 0.55, ancho: 0.4, ojoI: 0.35, ojoD: 0.35, cejas: 0.2 } },
  { id: 'sorpresa', nombre: 'Sorpresa', cara: { boca: 0.6, ancho: -0.4, ojoI: -0.35, ojoD: -0.35, cejas: 1 } },
  { id: 'enojo', nombre: 'Enojo', cara: { cejas: -0.6, fruncir: 1, sonrisa: -0.4, ojoI: 0.2, ojoD: 0.2 } },
  { id: 'tristeza', nombre: 'Tristeza', cara: { sonrisa: -0.9, cejas: 0.4, fruncir: 0.5, ojoI: 0.25, ojoD: 0.25, miraY: -0.4 } },
  { id: 'miedo', nombre: 'Miedo', cara: { boca: 0.3, ancho: 0.5, ojoI: -0.3, ojoD: -0.3, cejas: 0.9, fruncir: 0.5 } },
  { id: 'dormido', nombre: 'Dormido', cara: { ojoI: 1, ojoD: 1, boca: 0.08 } },
  { id: 'guino', nombre: 'Guiño', cara: { ojoI: 1, sonrisa: 0.6, cejas: -0.1 } },
];
export const VISEMAS: { id: string; nombre: string; cara: Partial<Cara> }[] = [
  { id: 'A', nombre: 'A', cara: { boca: 0.75, ancho: 0.1 } },
  { id: 'E', nombre: 'E', cara: { boca: 0.35, ancho: 0.7 } },
  { id: 'I', nombre: 'I', cara: { boca: 0.18, ancho: 0.9 } },
  { id: 'O', nombre: 'O', cara: { boca: 0.5, ancho: -0.8 } },
  { id: 'U', nombre: 'U', cara: { boca: 0.18, ancho: -1 } },
  { id: 'M', nombre: 'M B P', cara: { boca: 0, ancho: -0.1 } },
  { id: 'F', nombre: 'F V', cara: { boca: 0.1, ancho: 0.2 } },
];

/* ── LA CONTEXTURA: flaco, gordo, con más o menos músculo ──────────────────── */
/** El peso y el músculo (0 = el cuerpo como viene: culturista). */
export interface Forma { peso: number; musculo: number; grosor?: Partial<Record<ParteGrosor, number>> }
/** El DIÁMETRO de cada parte (1 = como viene): crece o se afina alrededor de su hueso, sin cambiar el largo. */
export type ParteGrosor = 'cabeza' | 'cuello' | 'torso' | 'brazo' | 'antebrazo' | 'muslo' | 'pierna';
export const PARTES_GROSOR: { id: ParteGrosor; nombre: string }[] = [
  { id: 'cabeza', nombre: 'Cabeza (ancho)' }, { id: 'cuello', nombre: 'Cuello' }, { id: 'torso', nombre: 'Torso' },
  { id: 'brazo', nombre: 'Brazos' }, { id: 'antebrazo', nombre: 'Antebrazos' }, { id: 'muslo', nombre: 'Muslos' }, { id: 'pierna', nombre: 'Pantorrillas' },
];
/** Qué hueso es de qué parte, y de qué hueso a qué hueso va su eje. */
const PARTE_DE_HUESO: Record<string, ParteGrosor> = { Head: 'cabeza', neck_01: 'cuello', pelvis: 'torso', spine_01: 'torso', spine_02: 'torso', spine_03: 'torso',
  upperarm: 'brazo', lowerarm: 'antebrazo', thigh: 'muslo', calf: 'pierna' };
export const FORMA_RANGOS: Record<'peso' | 'musculo', [number, number]> = { peso: [-1, 1.5], musculo: [-1, 1] };
function formaValida(x: unknown): Forma | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const o = x as Partial<Forma>;
  const f: Forma = { peso: Math.round(lim(o.peso, 0, -1, 1.5) * 1000) / 1000, musculo: Math.round(lim(o.musculo, 0, -1, 1) * 1000) / 1000 };
  const gr: Partial<Record<ParteGrosor, number>> = {};
  if (o.grosor && typeof o.grosor === 'object') for (const { id } of PARTES_GROSOR) {
    const v = Math.round(lim((o.grosor as Record<string, unknown>)[id], 1, 0.5, 1.8) * 1000) / 1000;
    if (v !== 1) gr[id] = v;
  }
  if (Object.keys(gr).length) f.grosor = gr;
  return f.peso || f.musculo || f.grosor ? f : undefined;
}
export const CONTEXTURAS: { id: string; nombre: string; forma: Forma }[] = [
  { id: 'musculoso', nombre: 'Musculoso', forma: { peso: 0, musculo: 0 } },
  { id: 'atletico', nombre: 'Atlético', forma: { peso: 0, musculo: -0.45 } },
  { id: 'normal', nombre: 'Normal', forma: { peso: 0.15, musculo: -0.85 } },
  { id: 'flaco', nombre: 'Flaco', forma: { peso: -0.85, musculo: -0.75 } },
  { id: 'rellenito', nombre: 'Rellenito', forma: { peso: 0.45, musculo: -0.85 } },
  { id: 'gordo', nombre: 'Gordo', forma: { peso: 0.85, musculo: -1 } },
  { id: 'muygordo', nombre: 'Muy gordo', forma: { peso: 1.4, musculo: -1 } },
];
/** Cuánto engorda, adelgaza o pierde músculo la piel que mueve cada hueso (metros, por la normal). */
const ENGORDAR: Record<string, number> = { pelvis: 0.055, spine_01: 0.085, spine_02: 0.06, spine_03: 0.035, neck_01: 0.03, Head: 0.006, clavicle: 0.02,
  upperarm: 0.028, lowerarm: 0.013, hand: 0.003, thigh: 0.05, calf: 0.02, foot: 0.003 };
const ADELGAZAR: Record<string, number> = { pelvis: -0.015, spine_01: -0.02, spine_02: -0.014, spine_03: -0.012, neck_01: -0.006, Head: -0.002, clavicle: -0.008,
  upperarm: -0.012, lowerarm: -0.006, thigh: -0.018, calf: -0.01 };
const DESMUSCULAR: Record<string, number> = { spine_01: -0.004, spine_02: -0.006, spine_03: -0.012, neck_01: -0.01, clavicle: -0.012,
  upperarm: -0.01, lowerarm: -0.005, thigh: -0.008, calf: -0.005 };
const regionDeHueso = (n0: string) => { const n = nombreReal(n0); return /^(index|middle|pinky|ring|thumb)_/.test(n) ? 'hand' : /^ball/.test(n) ? 'foot' : n.replace(/_[lr]$/, ''); };

/* ── la boca: partir los labios ── */
/** Los labios de estos cuerpos están unidos en una fila de puntos, y detrás hay
 *  una bolsa (el interior de la boca, con su propia isla de textura). Se le da al
 *  labio de abajo su PROPIA copia de esa fila: al bajar la mandíbula la boca se
 *  abre y se ve el interior. Los puntos nuevos van al final (la numeración de los
 *  de antes no cambia). Atributo `labio`: 1 lo de abajo (va con la mandíbula). */
function partirLabios(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const P = g.attributes.position as THREE.BufferAttribute, UV = g.attributes.uv as THREE.BufferAttribute | undefined;
  if (!UV || !g.index) return g;
  const n = P.count, bolsa: number[] = [];
  let alto = -Infinity; for (let i = 0; i < n; i++) alto = Math.max(alto, P.getY(i));
  // la bolsa: esa isla de textura, pero SÓLO en la cara (arriba del 85% del alto, en el
  // medio): medido, sin esto la isla se mezclaba con otras partes y la boca quedaba a 1,50 m
  for (let i = 0; i < n; i++) {
    const u = UV.getX(i), v = UV.getY(i);
    if (u > 0.08 && u < 0.2 && v > 0.58 && v < 0.76 && P.getZ(i) > 0.03 && P.getY(i) > alto * 0.85 && Math.abs(P.getX(i)) < 0.045) bolsa.push(i);
  }
  if (bolsa.length < 20) return g;   // sin boca (el maniquí)
  let bx = 0, y0 = Infinity, y1 = -Infinity, zMax = -Infinity;
  for (const i of bolsa) { bx = Math.max(bx, Math.abs(P.getX(i))); y0 = Math.min(y0, P.getY(i)); y1 = Math.max(y1, P.getY(i)); zMax = Math.max(zMax, P.getZ(i)); }
  const labioY = (y0 + y1) / 2;
  // la LÍNEA donde se tocan los labios no es recta (sube y baja hacia las comisuras):
  // es el borde de adelante de la bolsa. Con una altura fija quedaban triángulos sin
  // cortar que, al abrir, se estiraban como colmillos.
  const frente = bolsa.filter((i) => P.getZ(i) > zMax - 0.0015).map((i) => [P.getX(i), P.getY(i), P.getZ(i)]).sort((a, b) => a[0] - b[0]);
  const yLinea = (x: number) => {
    if (!frente.length) return labioY;
    if (x <= frente[0][0]) return frente[0][1];
    for (let k = 1; k < frente.length; k++) if (x <= frente[k][0]) {
      const a = frente[k - 1], b = frente[k], u = b[0] - a[0] > 1e-9 ? (x - a[0]) / (b[0] - a[0]) : 0;
      return a[1] + (b[1] - a[1]) * u;
    }
    return frente[frente.length - 1][1];
  };
  // la fila: todos los puntos (de la piel y de la bolsa) que están SOBRE esa línea
  const fila = new Set<number>();
  for (let i = 0; i < n; i++) {
    if (Math.abs(P.getX(i)) > bx * 0.92 || P.getZ(i) < zMax - 0.0025) continue;
    for (const f of frente) if (Math.abs(P.getX(i) - f[0]) < 0.0008 && Math.abs(P.getY(i) - f[1]) < 0.0008 && Math.abs(P.getZ(i) - f[2]) < 0.0008) { fila.add(i); break; }
  }
  const idx = g.index.array, nuevoIdx = new Uint32Array(idx.length), copia = new Map<number, number>();
  const enArriba = new Uint16Array(n), enAbajo = new Uint16Array(n);
  for (let t = 0; t < idx.length; t += 3) {
    const cx = (P.getX(idx[t]) + P.getX(idx[t + 1]) + P.getX(idx[t + 2])) / 3;
    const cy = (P.getY(idx[t]) + P.getY(idx[t + 1]) + P.getY(idx[t + 2])) / 3;
    const abajo = cy < yLinea(cx) - 1e-5;
    for (let c = 0; c < 3; c++) {
      let v = idx[t + c];
      if (abajo && fila.has(v)) { let d = copia.get(v); if (d === undefined) { d = n + copia.size; copia.set(v, d); } v = d; }
      else if (abajo) enAbajo[v]++; else enArriba[v]++;
      nuevoIdx[t + c] = v;
    }
  }
  const m = n + copia.size, out = new THREE.BufferGeometry();
  for (const [nombre, a0] of Object.entries(g.attributes)) {
    const a = a0 as THREE.BufferAttribute, k = a.itemSize, arr = new (a.array.constructor as { new (n: number): Float32Array })(m * k);
    arr.set(a.array as Float32Array);
    for (const [v, d] of copia) for (let c = 0; c < k; c++) arr[d * k + c] = (a.array as Float32Array)[v * k + c];
    out.setAttribute(nombre, new THREE.BufferAttribute(arr, k, a.normalized));
  }
  const labio = new Float32Array(m);
  // de qué lado está cada punto: el de los triángulos que lo usan (por la altura sola,
  // el labio de arriba que se curva por debajo de la línea quedaba atado a la mandíbula)
  for (let i = 0; i < n; i++) {
    const k = enArriba[i] + enAbajo[i];
    labio[i] = k ? enAbajo[i] / k : P.getY(i) < yLinea(P.getX(i)) - 1e-5 ? 1 : 0;
  }
  // el FONDO de la bolsa une lo de arriba con lo de abajo: con 0/1 esos triángulos se
  // estiraban 3 cm de golpe y asomaban por la boca abierta como colmillos (medido).
  // Cuanto más adentro, más pareja la transición: el fondo se estira como una pared.
  for (const i of bolsa) {
    if (fila.has(i)) continue;
    // (sólo el fondo: el techo y el piso, cerca de los labios, van enteros con su lado;
    // graduados, colgaban de adentro del labio de arriba como paneles)
    const hondo = zMax - P.getZ(i) - 0.008;
    if (hondo <= 0) continue;
    const banda = hondo * 1.2, u = (yLinea(P.getX(i)) - P.getY(i)) / (2 * banda) + 0.5;
    labio[i] = Math.max(0, Math.min(1, u));
  }
  // lo mismo en la mejilla, pasando las comisuras (ahí la piel no está cortada): la
  // transición se abre a medida que se aleja de la comisura, sin pliegue
  const esBolsa = new Set(bolsa);
  for (let i = 0; i < n; i++) {
    const lejos = Math.abs(P.getX(i)) - bx * 0.92;
    if (lejos <= 0 || esBolsa.has(i) || fila.has(i)) continue;
    const banda = 0.0025 + lejos * 1.5, u = (yLinea(P.getX(i)) - P.getY(i)) / (2 * banda) + 0.5;
    labio[i] = Math.max(0, Math.min(1, u));
  }
  for (const d of copia.values()) labio[d] = 1;
  out.setAttribute('labio', new THREE.BufferAttribute(labio, 1));
  // cuánto adentro de la boca está cada punto (el interior se pinta oscuro; también
  // las comisuras por dentro, que al abrir se estiran y quedaban como paneles claros)
  const adentro = new Float32Array(m);
  for (const i of bolsa) { const h = zMax - P.getZ(i); adentro[i] = Math.max(0, Math.min(1, Math.max((h - 0.0005) / 0.003, (Math.abs(P.getX(i)) / bx - 0.7) / 0.2))); }
  for (const [v, d] of copia) adentro[d] = adentro[v];
  out.setAttribute('adentro', new THREE.BufferAttribute(adentro, 1));
  out.setIndex(new THREE.BufferAttribute(nuevoIdx, 1));
  for (const gr of g.groups) out.addGroup(gr.start, gr.count, gr.materialIndex);
  out.userData = { ...g.userData, boca: { labioY, ancho: bx, zFrente: zMax } };
  return out;
}
const pielesPartidas = new Map<BaseCuerpo, THREE.BufferGeometry>();
function pielPartida(base: BaseCuerpo, g0: THREE.BufferGeometry, malla?: THREE.SkinnedMesh): THREE.BufferGeometry {
  let p = pielesPartidas.get(base);
  if (!p) { p = SIN_BOCA.has(base) ? g0.clone() : partirLabios(g0); if (malla) retorcerAntebrazos(p, malla); pielesPartidas.set(base, p); }
  return p;
}

/** LOS HUESOS DE GIRO DEL ANTEBRAZO (los «twist bones» de un rig profesional).
 *  En el cuerpo, al girar la mano (pronación), el radio rueda sobre el cúbito:
 *  el giro se reparte a lo largo del antebrazo y el codo casi no gira. Estos
 *  cuerpos no los traen: con el antebrazo entero girando desde el codo, la piel
 *  se estrangulaba ahí como un caramelo (medido: girado 85°, el codo quedaba en
 *  la mitad de su grosor). Cada antebrazo suma un hueso de giro EN EL CODO que
 *  des-gira el GIRO_ANTEBRAZO del giro; la piel pasa de ese hueso (en el codo)
 *  al antebrazo (en la muñeca, con el giro entero, como la mano). Los dos van al
 *  final del esqueleto: izquierdo y derecho. */
export const GIRO_ANTEBRAZO = 0.85;
function retorcerAntebrazos(g: THREE.BufferGeometry, malla: THREE.SkinnedMesh): void {
  const esq = malla.skeleton, nB = esq.bones.length, si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
  const P = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  ['l', 'r'].forEach((lado, k) => {
    const ia = esq.bones.findIndex((b) => b.name === 'lowerarm_' + lado), ih = esq.bones.findIndex((b) => b.name === 'hand_' + lado);
    if (ia < 0 || ih < 0) return;
    const codo = new THREE.Vector3().setFromMatrixPosition(esq.boneInverses[ia].clone().invert());
    const muneca = new THREE.Vector3().setFromMatrixPosition(esq.boneInverses[ih].clone().invert()), ab = muneca.clone().sub(codo);
    for (let i = 0; i < P.count; i++) {
      let c = -1; for (let s = 0; s < 4; s++) if (si.getComponent(i, s) === ia && sw.getComponent(i, s) > 0) c = s;
      if (c < 0) continue;
      v.fromBufferAttribute(P, i).applyMatrix4(malla.bindMatrix);
      const tt = Math.max(0, Math.min(1, v.sub(codo).dot(ab) / ab.lengthSq())), u = Math.min(1, tt / 0.9), lejos = u * u * (3 - 2 * u);
      const w = sw.getComponent(i, c), wGiro = w * (1 - lejos);
      if (wGiro < 1e-3) continue;
      sw.setComponent(i, c, w - wGiro);
      // un lugar para el hueso de giro: uno vacío, o el del peso más chico (y se renormaliza)
      let libre = -1, menor = Infinity;
      for (let s = 0; s < 4; s++) { const x = sw.getComponent(i, s); if (s !== c && x < menor) { menor = x; libre = s; } }
      if (menor > wGiro) { sw.setComponent(i, c, w); continue; }
      si.setComponent(i, libre, nB + k); sw.setComponent(i, libre, wGiro);
      let tot = 0; for (let s = 0; s < 4; s++) tot += sw.getComponent(i, s);
      for (let s = 0; s < 4; s++) sw.setComponent(i, s, sw.getComponent(i, s) / tot);
    }
  });
}

/* ── LA PIEL CON VOLUMEN: skinning de cuaterniones duales ───────────────────
   Three mezcla las matrices de los huesos (skinning lineal): en una flexión
   fuerte la mezcla de dos giros achica la piel (el codo y la rodilla se
   desinflaban, la cadera se volvía una masa) y en un giro se estrangula (el
   «caramelo»). Mezclando los giros como cuaterniones duales (Kavan et al.), la
   piel gira alrededor de la articulación y CONSERVA SU GROSOR: se porta como
   carne sobre un hueso. El tamaño de cada hueso (cabeza, manos, pies) se mezcla
   aparte. La GPU dibuja así y la CPU calcula igual (el pincel y el rayo tocan
   donde se ve). */
const DQ_GLSL = `
vec4 dqQuat(mat3 m) {
  float tr = m[0][0] + m[1][1] + m[2][2]; vec4 q;
  if (tr > 0.0) { float s = sqrt(tr + 1.0) * 2.0; q = vec4((m[1][2] - m[2][1]) / s, (m[2][0] - m[0][2]) / s, (m[0][1] - m[1][0]) / s, 0.25 * s); }
  else if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) { float s = sqrt(1.0 + m[0][0] - m[1][1] - m[2][2]) * 2.0; q = vec4(0.25 * s, (m[1][0] + m[0][1]) / s, (m[2][0] + m[0][2]) / s, (m[1][2] - m[2][1]) / s); }
  else if (m[1][1] > m[2][2]) { float s = sqrt(1.0 + m[1][1] - m[0][0] - m[2][2]) * 2.0; q = vec4((m[1][0] + m[0][1]) / s, 0.25 * s, (m[2][1] + m[1][2]) / s, (m[2][0] - m[0][2]) / s); }
  else { float s = sqrt(1.0 + m[2][2] - m[0][0] - m[1][1]) * 2.0; q = vec4((m[2][0] + m[0][2]) / s, (m[2][1] + m[1][2]) / s, 0.25 * s, (m[0][1] - m[1][0]) / s); }
  return q;
}
vec4 dqMul(vec4 a, vec4 b) { return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz)); }
void dqHueso(mat4 M, out vec4 r, out vec4 d, out float s) {
  s = length(M[0].xyz);
  r = dqQuat(mat3(M[0].xyz / s, M[1].xyz / s, M[2].xyz / s));
  d = 0.5 * dqMul(vec4(M[3].xyz, 0.0), r);
}
vec3 dqRotar(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 dqMover(vec4 r, vec4 d) { return 2.0 * (r.w * d.xyz - d.w * r.xyz + cross(r.xyz, d.xyz)); }
`;
const DQ_MEZCLA = `
  vec4 dqR, dqD; float dqS;
  {
    vec4 r0, d0, r1, d1, r2, d2, r3, d3; float s0, s1, s2, s3;
    dqHueso(boneMatX, r0, d0, s0); dqHueso(boneMatY, r1, d1, s1); dqHueso(boneMatZ, r2, d2, s2); dqHueso(boneMatW, r3, d3, s3);
    float w1 = dot(r0, r1) < 0.0 ? -skinWeight.y : skinWeight.y, w2 = dot(r0, r2) < 0.0 ? -skinWeight.z : skinWeight.z, w3 = dot(r0, r3) < 0.0 ? -skinWeight.w : skinWeight.w;
    dqR = r0 * skinWeight.x + r1 * w1 + r2 * w2 + r3 * w3;
    dqD = d0 * skinWeight.x + d1 * w1 + d2 * w2 + d3 * w3;
    dqS = s0 * skinWeight.x + s1 * skinWeight.y + s2 * skinWeight.z + s3 * skinWeight.w;
    float l = max(length(dqR), 1e-6); dqR /= l; dqD /= l;
  }
`;
/** Pone el skinning de cuaterniones duales en un material de la piel (o de una pieza). */
function skinningConVolumen(sh: Parameters<THREE.Material['onBeforeCompile']>[0]): void {
  sh.vertexShader = sh.vertexShader
    .replace('#include <skinning_pars_vertex>', '#include <skinning_pars_vertex>\n#ifdef USE_SKINNING\n' + DQ_GLSL + '\n#endif')
    .replace('#include <skinbase_vertex>', '#include <skinbase_vertex>\n#ifdef USE_SKINNING\n' + DQ_MEZCLA + '\n#endif')
    .replace('#include <skinnormal_vertex>', `#ifdef USE_SKINNING
  objectNormal = mat3(bindMatrixInverse) * dqRotar(dqR, mat3(bindMatrix) * objectNormal);
#endif`)
    .replace('#include <skinning_vertex>', `#ifdef USE_SKINNING
  transformed = (bindMatrixInverse * vec4(dqRotar(dqR, (bindMatrix * vec4(transformed, 1.0)).xyz * dqS) + dqMover(dqR, dqD), 1.0)).xyz;
#endif`);
}
/** Lo mismo en la CPU, con los cuaterniones duales de cada hueso ya calculados. */
export class PielDQ {
  r = new Float32Array(0); d = new Float32Array(0); s = new Float32Array(0);
  private version = -1;
  preparar(esq: THREE.Skeleton, version: number): void {
    if (this.version === version && this.s.length === esq.bones.length) return;
    this.version = version;
    const n = esq.bones.length, M = esq.boneMatrices, m3 = new THREE.Matrix4(), q = new THREE.Quaternion();
    if (this.s.length !== n) { this.r = new Float32Array(n * 4); this.d = new Float32Array(n * 4); this.s = new Float32Array(n); }
    for (let b = 0; b < n; b++) {
      const o = b * 16, s = Math.hypot(M[o], M[o + 1], M[o + 2]) || 1;
      m3.set(M[o] / s, M[o + 4] / s, M[o + 8] / s, 0, M[o + 1] / s, M[o + 5] / s, M[o + 9] / s, 0, M[o + 2] / s, M[o + 6] / s, M[o + 10] / s, 0, 0, 0, 0, 1);
      q.setFromRotationMatrix(m3);
      const tx = M[o + 12], ty = M[o + 13], tz = M[o + 14];
      this.r.set([q.x, q.y, q.z, q.w], b * 4); this.s[b] = s;
      // d = ½ (t, 0) · q
      this.d.set([0.5 * (q.w * tx + ty * q.z - tz * q.y), 0.5 * (q.w * ty + tz * q.x - tx * q.z), 0.5 * (q.w * tz + tx * q.y - ty * q.x), -0.5 * (tx * q.x + ty * q.y + tz * q.z)], b * 4);
    }
  }
  /** La posición posada (como applyBoneTransform de three, pero con volumen). */
  aplicar(malla: THREE.SkinnedMesh, i: number, v: THREE.Vector3): THREE.Vector3 {
    const si = malla.geometry.attributes.skinIndex as THREE.BufferAttribute, sw = malla.geometry.attributes.skinWeight as THREE.BufferAttribute;
    v.applyMatrix4(malla.bindMatrix);
    const b0 = si.getComponent(i, 0) * 4, R = this.r, D = this.d;
    let rx = 0, ry = 0, rz = 0, rw = 0, dx = 0, dy = 0, dz = 0, dw = 0, S = 0;
    for (let k = 0; k < 4; k++) {
      let w = sw.getComponent(i, k); if (!w) continue;
      const b = si.getComponent(i, k), o = b * 4;
      S += w * this.s[b];
      if (R[o] * R[b0] + R[o + 1] * R[b0 + 1] + R[o + 2] * R[b0 + 2] + R[o + 3] * R[b0 + 3] < 0) w = -w;
      rx += R[o] * w; ry += R[o + 1] * w; rz += R[o + 2] * w; rw += R[o + 3] * w;
      dx += D[o] * w; dy += D[o + 1] * w; dz += D[o + 2] * w; dw += D[o + 3] * w;
    }
    const l = Math.hypot(rx, ry, rz, rw) || 1;
    rx /= l; ry /= l; rz /= l; rw /= l; dx /= l; dy /= l; dz /= l; dw /= l;
    const px = v.x * S, py = v.y * S, pz = v.z * S;
    // rotar: v + 2 q×(q×v + w v)
    const cx = ry * pz - rz * py + rw * px, cy = rz * px - rx * pz + rw * py, cz = rx * py - ry * px + rw * pz;
    const ox = px + 2 * (ry * cz - rz * cy), oy = py + 2 * (rz * cx - rx * cz), oz = pz + 2 * (rx * cy - ry * cx);
    // mover: 2 (w·d − dw·q + q×d)
    const tx = 2 * (rw * dx - dw * rx + (ry * dz - rz * dy)), ty = 2 * (rw * dy - dw * ry + (rz * dx - rx * dz)), tz = 2 * (rw * dz - dw * rz + (rx * dy - ry * dx));
    return v.set(ox + tx, oy + ty, oz + tz).applyMatrix4(malla.bindMatrixInverse);
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
    { const g0 = this.cuerpo.geometry; this.cuerpo.geometry = pielEnNivel(this.datos.base, pielPartida(this.datos.base, g0, this.cuerpo), this.datos.definicion ?? 0); g0.dispose(); }
    this.agregarHuesosDeGiro();
    this.conVolumen(this.cuerpo);
    // la piel siempre trae `adentro` (la boca) y `mascara` (lo protegido), aunque sea en cero
    for (const a of ['adentro', 'mascara']) if (!this.cuerpo.geometry.attributes[a]) this.cuerpo.geometry.setAttribute(a, new THREE.BufferAttribute(new Float32Array(this.cuerpo.geometry.attributes.position.count), 1));
    materialDelCuerpo(this.cuerpo.material as THREE.MeshStandardMaterial);
    this.original = new Float32Array(this.cuerpo.geometry.attributes.position.array as Float32Array);
    this.normalesOriginales = new Float32Array(this.cuerpo.geometry.attributes.normal.array as Float32Array);
    // los ojos (dos globos en una malla) y las cejas (otra malla), para los gestos
    const ojos = this.mallas.find((m) => (m.material as THREE.Material).name === 'MI_Eyes');
    if (ojos) {
      const pos = new Float32Array(ojos.geometry.attributes.position.array as Float32Array);
      const centros = [1, -1].map((s) => {
        const c = new THREE.Vector3(); let k = 0, r = 0;
        for (let i = 0; i < pos.length; i += 3) if (Math.sign(pos[i]) === s) { c.x += pos[i]; c.y += pos[i + 1]; c.z += pos[i + 2]; k++; }
        c.divideScalar(Math.max(1, k));
        for (let i = 0; i < pos.length; i += 3) if (Math.sign(pos[i]) === s) r = Math.max(r, Math.hypot(pos[i] - c.x, pos[i + 1] - c.y, pos[i + 2] - c.z));
        return { c, r };
      });
      this.ojos = { malla: ojos, pos, nrm: new Float32Array(ojos.geometry.attributes.normal.array as Float32Array), centros };
    }
    const cejas = this.mallas.find((m) => /^MI_Hair/.test((m.material as THREE.Material).name));
    if (cejas) this.cejasMalla = { malla: cejas, pos: new Float32Array(cejas.geometry.attributes.position.array as Float32Array) };
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
    if (this.datos.forma) this.ponerForma(this.datos.forma);
    if (this.datos.cara) this.ponerCara(this.datos.cara);
    if (this.datos.capas) this.ponerCapas(this.datos.capas);
    if (this.datos.escultura) this.ponerEscultura(this.datos.escultura);
    const fab = this.datos.poseFabrica && !Object.keys(this.datos.pose).length ? posesListas.find((x) => x.id === this.datos.poseFabrica) : null;
    delete this.datos.poseFabrica;
    if (fab) this.ponerPoseDeFabrica(fab); else this.aplicar();
    this.rehacerPiezas();
  }

  /* ── LOS HUESOS DE GIRO y LA PIEL CON VOLUMEN ── */
  private giros: { lado: string; hueso: THREE.Bone; eje: THREE.Vector3 }[] = [];
  private agregarHuesosDeGiro(): void {
    const sk = this.cuerpo.skeleton, bones = sk.bones.slice(), inv = sk.boneInverses.map((m) => m.clone());
    for (const lado of ['l', 'r']) {
      const la = this.huesos.get('lowerarm_' + lado), mano = this.huesos.get('hand_' + lado), k = la ? bones.indexOf(la) : -1;
      if (!la || !mano || k < 0) continue;
      // en el codo: su reposo es el del antebrazo
      const b = new THREE.Bone(); b.name = 'giro_lowerarm_' + lado; la.add(b);
      bones.push(b); inv.push(inv[k].clone());
      this.giros.push({ lado, hueso: b, eje: mano.position.clone().normalize() });
    }
    if (this.giros.length) this.cuerpo.bind(new THREE.Skeleton(bones, inv), this.cuerpo.bindMatrix);
  }
  /** El des-giro del codo: lo que el antebrazo gira sobre su largo, el codo lo deja de girar. */
  private ponerGiros(): void {
    for (const g of this.giros) {
      const n = 'lowerarm_' + g.lado, d = this.datos.pose[n], b = BISAGRAS[n], w = this.enReposo.get(n);
      let th = 0;
      if (d && b && w) {
        const largo = new THREE.Vector3().fromArray(b.largo), pp = d[0] * largo.x + d[1] * largo.y + d[2] * largo.z;
        th = 2 * Math.atan2(pp, d[3]) * Math.sign(g.eje.clone().applyQuaternion(w).dot(largo) || 1);
      }
      g.hueso.quaternion.setFromAxisAngle(g.eje, -GIRO_ANTEBRAZO * th);
    }
  }
  private dq = new PielDQ();
  private versionHuesos = 0;
  /** El rayo, el pincel y el piso calculan la piel posada igual que la GPU (con volumen). */
  private conVolumen(m: THREE.SkinnedMesh): void {
    m.applyBoneTransform = (i: number, v: THREE.Vector3) => { this.dq.preparar(m.skeleton, this.versionHuesos); return this.dq.aplicar(m, i, v); };
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
      else if (n === 'hand_l' || n === 'hand_r') b.scale.multiplyScalar(d.prop.manos ?? 1);
      else if (n === 'foot_l' || n === 'foot_r') b.scale.multiplyScalar(d.prop.pies ?? 1);
      if (n === 'pelvis' && d.raiz) b.position.add(_v.fromArray(d.raiz));
    }
    this.ponerGiros();
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
      if (m.userData.pieza) m.userData.toque = null;
      else m.skeleton.update();
      this.versionHuesos++;
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
    // las piezas también apoyan (una suela, una bota)
    const aRaiz = new THREE.Matrix4();
    for (const m of this.piezasM.values()) {
      if (!m.visible || !m.geometry.attributes.position) continue;
      aRaiz.copy(this.raiz.matrixWorld).invert().multiply(m.matrixWorld);
      for (let i = 0, n = m.geometry.attributes.position.count; i < n; i++) { m.getVertexPosition(i, _v); _v.applyMatrix4(aRaiz); if (_v.y < min) min = _v.y; }
    }
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
    const n = mejor >= 0 ? m.skeleton.bones[mejor]?.name : undefined;
    return n ? nombreReal(n) : null;
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
  /** POSAR COMO UN ARMAZÓN DE STOP MOTION: el control gira `grados` alrededor
   *  de `eje` (en el mundo), repartido en sus huesos y dentro de sus límites. El
   *  motor da el eje y los grados según lo que se arrastró: el giro es
   *  PROPORCIONAL al arrastre (como girar una rótula con la mano), no «apuntar al
   *  cursor», que con palancas cortas (la cabeza) daba saltos enormes. */
  girarPor(c: string, eje: THREE.Vector3, grados: number): void {
    const huesos = huesosDeControl(c), pesos = pesosDeControl(c);
    if (eje.lengthSq() < 1e-12 || !grados) return;
    const u = eje.clone().normalize();
    // de a 10° como mucho, topando en cada paso: de un saque, un arrastre largo (más de
    // 180°) daba la vuelta y el tope lo convertía en otro giro (medido: arrastrar la
    // cabeza hacia abajo la terminaba girando al costado)
    const pasos = Math.max(1, Math.ceil(Math.abs(grados) / 10));
    for (let s = 0; s < pasos; s++) huesos.forEach((n, k) => this.girarEnMundo(n, new THREE.Quaternion().setFromAxisAngle(u, (grados / pasos * pesos[k] * Math.PI) / 180), true));
    if (this.hombrosAuto && /^upperarm_/.test(c)) {
      const ua = this.huesos.get(c)!, q = ua.getWorldQuaternion(new THREE.Quaternion());
      if (this.acomodarClavicula(c.slice(-1))) this.girarEnMundo(c, q.multiply(ua.getWorldQuaternion(new THREE.Quaternion()).invert()), true);
    }
    this.aplicar();
  }
  /** Girar sobre su largo (Alt al arrastrar): la cabeza mira al costado, el brazo rota. */
  girarSobreSi(c: string, grados: number): void {
    const piv = this.articulacion(c), tip = this.punta(c);
    if (piv && tip) this.girarPor(c, tip.sub(piv), grados);
  }
  /** Una bisagra: más o menos doblez (el giro a lo largo se conserva). */
  doblarPor(c: string, grados: number): void {
    const b = BISAGRAS[c]; if (!b) return;
    this.ponerDial(c, 'doblar', this.doblez(c) + grados);
  }
  /** Los diales del ajuste fino: cuánto vale cada uno ahora (grados). */
  dialesValores(c: string): Record<string, number> {
    const out: Record<string, number> = {};
    if (BISAGRAS[c]) {
      const b = BISAGRAS[c], q = new THREE.Quaternion().fromArray(this.datos.pose[c] ?? [0, 0, 0, 1]), largo = new THREE.Vector3().fromArray(b.largo);
      const p = q.x * largo.x + q.y * largo.y + q.z * largo.z;
      out.doblar = Math.round(this.doblez(c) * 10) / 10;
      out.rotar = Math.round((2 * Math.atan2(p, q.w) * 180) / Math.PI * 10) / 10;
      return out;
    }
    const huesos = huesosDeControl(c), R = 180 / Math.PI, s = espejado(c) ? -1 : 1;
    let x = 0, y = 0, z = 0;
    for (const n of huesos) {
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(this.datos.pose[n] ?? [0, 0, 0, 1]), 'YXZ');
      x += e.x * R; y += e.y * R; z += e.z * R;
    }
    return { x: Math.round(x * 10) / 10, y: Math.round(y * s * 10) / 10, z: Math.round(z * s * 10) / 10 };
  }
  /** Poner un dial del ajuste fino (grados): se reparte en los huesos del control. */
  ponerDial(c: string, eje: string, grados: number): void {
    const b = BISAGRAS[c];
    if (b) {
      const v = this.dialesValores(c), R = Math.PI / 180;
      const doblar = Math.max(0, Math.min(b.max, eje === 'doblar' ? grados : v.doblar)), rotar = Math.max(-b.giro, Math.min(b.giro, eje === 'rotar' ? grados : v.rotar));
      this.ponerGiro(c, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(b.doblar), doblar * R)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3().fromArray(b.largo), rotar * R)));
      this.aplicar();
      return;
    }
    const huesos = huesosDeControl(c), pesos = pesosDeControl(c), R = Math.PI / 180;
    const v = { ...this.dialesValores(c), [eje]: grados };
    if (espejado(c)) { v.y = -v.y; v.z = -v.z; }
    huesos.forEach((n, k) => {
      let q = new THREE.Quaternion().setFromEuler(new THREE.Euler(v.x * pesos[k] * R, v.y * pesos[k] * R, v.z * pesos[k] * R, 'YXZ'));
      q = limitarEjes(n, q, true);
      const max = Personaje3D.LIMITES[n];
      if (max) { const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))), tope = max * R; if (ang > tope) q = new THREE.Quaternion().slerp(q, tope / ang); }
      this.ponerGiro(n, q);
    });
    this.aplicar();
  }
  /** El eje de una bisagra en el mundo (para que el motor sepa hacia dónde se dobla en pantalla). */
  ejeDeBisagra(c: string): THREE.Vector3 | null { return BISAGRAS[c] ? this.ejeBisagra(c) : null; }
  esBisagra(c: string): boolean { return !!BISAGRAS[c]; }
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
    if (this.hombrosAuto && /^upperarm_/.test(c)) {
      // la clavícula acompaña y el brazo conserva su dirección
      const ua = this.huesos.get(c)!, q = ua.getWorldQuaternion(new THREE.Quaternion());
      if (this.acomodarClavicula(c.slice(-1))) this.girarEnMundo(c, q.multiply(ua.getWorldQuaternion(new THREE.Quaternion()).invert()));
    }
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
  private girarEnMundo(n: string, giro: THREE.Quaternion, girando = false): void {
    const b = this.huesos.get(n); if (!b) return;
    this.raiz.updateMatrixWorld(true);
    const qw = b.getWorldQuaternion(new THREE.Quaternion());
    const qp = b.parent ? b.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const local = qp.invert().multiply(giro).multiply(qw);
    const r = this.reposo.get(n)!, w = this.enReposo.get(n)!;
    const dl = r.q.clone().invert().multiply(local);
    let enMundo = limitarEjes(n, limitarGiro(n, w.clone().multiply(dl).multiply(w.clone().invert()).normalize()), girando);
    const max = Personaje3D.LIMITES[n];
    if (max) {
      const ang = 2 * Math.acos(Math.min(1, Math.abs(enMundo.w))), tope = (max * Math.PI) / 180;
      if (ang > tope) enMundo = new THREE.Quaternion().slerp(enMundo, tope / ang);
    }
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
      if (mat.userData.pieza) continue;
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
    const pos = this.original, n = pos.length / 3, lab = this.cuerpo.geometry.attributes.labio?.array as Float32Array | undefined;
    const clave = (i: number) => Math.round(pos[i * 3] * 2000) + ',' + Math.round(pos[i * 3 + 1] * 2000) + ',' + Math.round(pos[i * 3 + 2] * 2000) + (lab && lab[i] > 0.5 ? 'b' : '');
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
    const nrm = this.cuerpo.geometry.attributes.normal as THREE.BufferAttribute, m3 = new THREE.Matrix3(), nw = new THREE.Vector3();
    for (let i = 0, n = pos.length / 3; i < n; i++) {
      const d = (pos[i * 3] - centro.x) ** 2 + (pos[i * 3 + 1] - centro.y) ** 2 + (pos[i * 3 + 2] - centro.z) ** 2;
      if (d >= r2) continue;
      // la CURVA de caída (la de Blender); con dureza, pareja hasta `h` del radio
      const u = Math.sqrt(d / r2), x = u <= h ? 0 : (u - h) / (1 - h);
      let f = curvaCaida(this.caida, x);
      // SÓLO LAS CARAS DE FRENTE (Blender «Front Faces Only», el BackfaceMask de
      // ZBrush): en lo fino (una oreja, los dedos, un labio) el pincel no
      // atraviesa al otro lado
      if (this.frente && f > 0) {
        nw.fromBufferAttribute(nrm, i).applyMatrix3(this.piel(i, m3)).normalize();
        const k = Math.max(0, Math.min(1, (nw.dot(this.frente) + 0.05) / 0.3));
        f *= k * k * (3 - 2 * k);
      }
      if (f > 1e-4) out.push({ i, f });
    }
    return out;
  }
  /** la curva de caída del pincel (la pone el motor) */
  caida: CaidaPincel = 'suave';
  /** hacia la cámara, para pintar sólo lo que la mira (null: todo lo que toca) */
  frente: THREE.Vector3 | null = null;
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
    // LA MÁSCARA protege (como Ctrl en ZBrush): lo enmascarado no se mueve
    if (this.hayMascara) { const M = this.mascaraAttr().array as Float32Array; for (const [i, v] of final) v.multiplyScalar(1 - Math.min(1, M[i])); }
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
      const Mr = this.hayMascara ? this.mascaraAttr().array as Float32Array : null;
      for (const { i, f: f0 } of afectados) {
        const f = Mr ? f0 * (1 - Math.min(1, Mr[i])) : f0;
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

  /* ── LOS PINCELES DE LOS GRANDES (v3.41) ── */
  /** La normal de un punto de la piel, posada, en el mundo. */
  private normalMundo(i: number, m3 = new THREE.Matrix3()): THREE.Vector3 {
    return new THREE.Vector3().fromBufferAttribute(this.cuerpo.geometry.attributes.normal as THREE.BufferAttribute, i).applyMatrix3(this.piel(i, m3)).normalize();
  }
  /** EL PLANO DEL PINCEL (el «area plane» de Blender): el centro y la normal
   *  promedio de lo que toca. Empujar por ESA normal y no por la de cada punto
   *  deja trazos limpios, sin abrir la piel en abanico. */
  private planoDelPincel(af: { i: number; f: number }[]): { c: THREE.Vector3; n: THREE.Vector3 } | null {
    const pos = this.posicionesMundo(), m3 = new THREE.Matrix3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    let s = 0;
    for (const { i, f } of af) { c.x += pos[i * 3] * f; c.y += pos[i * 3 + 1] * f; c.z += pos[i * 3 + 2] * f; n.addScaledVector(this.normalMundo(i, m3), f); s += f; }
    if (s < 1e-9 || n.lengthSq() < 1e-12) return null;
    return { c: c.multiplyScalar(1 / s), n: n.normalize() };
  }
  /** DIBUJAR (el Draw de Blender, el Standard de ZBrush): levanta (Ctrl: hunde) por el plano del pincel. */
  dibujar(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean): void {
    const af = this.bajoElPincel(centro, radio), pl = this.planoDelPincel(af); if (!pl) return;
    this.correr(af, (_i, f) => pl.n.clone().multiplyScalar(signo * fuerza * f * radio * 0.03), simetria);
  }
  /** ARCILLA (el Clay Strips de Blender, el ClayBuildup de ZBrush): rellena hasta
   *  un plano un poco por encima de la piel, con la punta cuadrada a lo largo del
   *  trazo: va dejando tiras planas, como poner arcilla con la espátula. Ctrl: saca. */
  direccion: THREE.Vector3 | null = null;
  arcilla(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean): void {
    const af = this.bajoElPincel(centro, radio), pl = this.planoDelPincel(af); if (!pl) return;
    const pos = this.posicionesMundo(), alto = radio * 0.16 * signo;
    const meta = pl.c.clone().addScaledVector(pl.n, alto);
    // la punta cuadrada: un eje a lo largo del trazo y otro de costado
    let ua: THREE.Vector3 | null = null, wa: THREE.Vector3 | null = null;
    if (this.direccion) { ua = this.direccion.clone().addScaledVector(pl.n, -this.direccion.dot(pl.n)); if (ua.lengthSq() > 1e-10) { ua.normalize(); wa = pl.n.clone().cross(ua); } else ua = null; }
    const p = new THREE.Vector3();
    this.correr(af, (i, f) => {
      p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      if (ua && wa) { const q = p.clone().sub(pl.c), s = Math.max(Math.abs(q.dot(ua)), Math.abs(q.dot(wa))) / radio; const k = Math.max(0, Math.min(1, (s - 0.62) / 0.33)); f *= 1 - k * k * (3 - 2 * k); }
      const d = p.clone().sub(meta).dot(pl.n);
      if (signo > 0 ? d >= 0 : d <= 0) return null;
      return pl.n.clone().multiplyScalar(-d * fuerza * f * 0.35);
    }, simetria);
  }
  /** CAPA (el Layer de Blender): levanta la piel hasta una altura fija en todo el
   *  trazo: pasar dos veces por el mismo lugar no acumula (un escalón parejo, un
   *  parche, una placa). Ctrl: hunde. */
  private capaTrazo = new Map<number, number>();
  capa(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean): void {
    this.preparar();
    const af = this.bajoElPincel(centro, radio), H = radio * 0.12 * Math.max(0.1, fuerza) * signo, m3 = new THREE.Matrix3();
    this.correr(af, (i, f) => {
      const g = this.soldado![i], a = this.capaTrazo.get(g) ?? 0, meta = H * f;
      if (Math.abs(a) >= Math.abs(meta) - 1e-7) return null;
      const paso = Math.sign(meta) * Math.min(Math.abs(meta - a), Math.abs(H) * 0.35);
      this.capaTrazo.set(g, a + paso);
      return this.normalMundo(i, m3).multiplyScalar(paso);
    }, simetria);
  }
  /** RASPAR (el Scrape de Blender, el TrimDynamic de ZBrush): baja lo que sobresale
   *  del plano del pincel. Ctrl: RELLENAR (el Fill), sube lo que está hundido. */
  raspar(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean): void {
    const af = this.bajoElPincel(centro, radio), pl = this.planoDelPincel(af); if (!pl) return;
    const pos = this.posicionesMundo(), p = new THREE.Vector3();
    this.correr(af, (i, f) => {
      const d = p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).sub(pl.c).dot(pl.n);
      if (signo > 0 ? d <= 0 : d >= 0) return null;
      return pl.n.clone().multiplyScalar(-d * fuerza * f * 0.5);
    }, simetria);
  }
  /** GANCHO (el Snake Hook): agarra lo que está bajo el pincel AHORA y lo lleva
   *  con el cursor: cuernos, mechones, orejas en punta, dedos. Se suaviza un poco
   *  al pasar para que lo estirado no se arrugue. */
  gancho(centro: THREE.Vector3, radio: number, delta: THREE.Vector3, fuerza: number, simetria: boolean): void {
    const af = this.bajoElPincel(centro, radio), k = Math.min(1, 0.45 + fuerza * 0.55);
    this.correr(af, (_i, f) => delta.clone().multiplyScalar(f * k), simetria, 0.2);
  }
  /** EMPUJAR (el Nudge): corre la piel por la superficie hacia donde va el trazo. */
  empujar(centro: THREE.Vector3, radio: number, fuerza: number, simetria: boolean): void {
    if (!this.direccion) return;
    const dir = this.direccion.clone().normalize(), af = this.bajoElPincel(centro, radio), m3 = new THREE.Matrix3();
    this.correr(af, (i, f) => {
      const n = this.normalMundo(i, m3);
      return dir.clone().addScaledVector(n, -dir.dot(n)).multiplyScalar(fuerza * f * radio * 0.08);
    }, simetria, 0.15);
  }

  /* ── LA MÁSCARA (lo protegido de los pinceles) ── */
  hayMascara = false;
  private mascaraAttr(): THREE.BufferAttribute { return this.cuerpo.geometry.attributes.mascara as THREE.BufferAttribute; }
  private mascaraCambiada(): void {
    const a = this.mascaraAttr(), M = a.array as Float32Array;
    let hay = false; for (let i = 0; i < M.length; i++) if (M[i] > 1e-3) { hay = true; break; }
    this.hayMascara = hay; a.needsUpdate = true;
  }
  /** Un valor por punto soldado (las costuras parejas) y su espejo. */
  private ponerEnGrupo(M: Float32Array, i: number, v: number, simetria: boolean): void {
    const g = this.soldado![i];
    for (const j of this.grupos[g]) M[j] = v;
    if (simetria) { const e = this.espejo![i]; if (e >= 0) for (const j of this.grupos[this.soldado![e]]) M[j] = v; }
  }
  /** Pintar la máscara (Ctrl: borrarla; Shift: suavizar su borde). */
  pintarMascara(centro: THREE.Vector3, radio: number, fuerza: number, signo: number, simetria: boolean, suavizar = false): void {
    this.preparar();
    const M = this.mascaraAttr().array as Float32Array, af = this.bajoElPincel(centro, radio);
    if (suavizar) {
      const nuevo = new Map<number, number>();
      for (const { i, f } of af) {
        const vs = this.vecinos[this.soldado![i]]; if (!vs.length) continue;
        let s = 0; for (const h of vs) s += M[this.grupos[h][0]];
        nuevo.set(i, M[i] + (s / vs.length - M[i]) * Math.min(1, fuerza * f * 1.5));
      }
      for (const [i, v] of nuevo) this.ponerEnGrupo(M, i, v, simetria);
    } else for (const { i, f } of af) this.ponerEnGrupo(M, i, Math.max(0, Math.min(1, M[i] + signo * Math.min(1, fuerza * f * 1.6))), simetria);
    this.mascaraCambiada();
  }
  /** Enmascarar una parte del cuerpo de un clic (por sus huesos: el borde queda
   *  suave en las articulaciones). `modo`: poner (sólo esa), sumar o quitar. */
  mascaraDeParte(parte: string, modo: 'poner' | 'sumar' | 'quitar'): boolean {
    const P = PARTES_MASCARA.find((x) => x.id === parte); if (!P) return false;
    const g = this.cuerpo.geometry, si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const bones = this.cuerpo.skeleton.bones, es = bones.map((b) => P.huesos.test(nombreReal(b.name))), M = this.mascaraAttr().array as Float32Array;
    for (let i = 0; i < M.length; i++) {
      let v = 0; for (let k = 0; k < 4; k++) if (es[si.getComponent(i, k)]) v += sw.getComponent(i, k);
      v = Math.min(1, v);
      // los pesos de los huesos suman 1: la unión de dos partes es la SUMA (con el
      // máximo, un punto mitad torso y mitad cadera quedaba en 0,5 y la pieza se agujereaba)
      M[i] = modo === 'poner' ? v : modo === 'sumar' ? Math.min(1, M[i] + v) : Math.max(0, M[i] - v);
    }
    this.mascaraCambiada();
    return true;
  }
  invertirMascara(): void { const M = this.mascaraAttr().array as Float32Array; for (let i = 0; i < M.length; i++) M[i] = 1 - Math.min(1, M[i]); this.mascaraCambiada(); }
  limpiarMascara(): void { (this.mascaraAttr().array as Float32Array).fill(0); this.mascaraCambiada(); }
  /** Crecer (+1) o achicar (−1) la máscara un anillo de puntos (el Grow/Shrink de Blender). */
  crecerMascara(paso: number): void {
    this.preparar();
    const M = this.mascaraAttr().array as Float32Array, G = this.grupos, v = G.map((l) => M[l[0]]);
    const out = v.map((x, g) => { let r = x; for (const h of this.vecinos[g]) r = paso > 0 ? Math.max(r, v[h]) : Math.min(r, v[h]); return r; });
    G.forEach((l, g) => { for (const i of l) M[i] = out[g]; });
    this.mascaraCambiada();
  }
  /** Suavizar (borde difuso) o afilar (borde nítido) la máscara entera. */
  suavizarMascara(afilar = false): void {
    const M = this.mascaraAttr().array as Float32Array;
    if (afilar) for (let i = 0; i < M.length; i++) { const k = Math.max(0, Math.min(1, (M[i] - 0.3) / 0.4)); M[i] = k * k * (3 - 2 * k); }
    else this.suavizarCampo(M, 1, 2);
    this.mascaraCambiada();
  }
  copiaMascara(): Float32Array { return (this.mascaraAttr().array as Float32Array).slice(); }
  ponerMascara(m: Float32Array): void { const M = this.mascaraAttr().array as Float32Array; if (m.length === M.length) M.set(m); this.mascaraCambiada(); }
  /** Cuánto de la piel está enmascarado (0 a 1). */
  cuantaMascara(): number { const M = this.mascaraAttr().array as Float32Array; let s = 0; for (let i = 0; i < M.length; i++) s += Math.min(1, M[i]); return s / Math.max(1, M.length); }

  /* ── EL TRAZO: lo que se arma al empezar y se cierra al soltar ── */
  /** la capa de escultura donde va lo esculpido (null: la principal) */
  capaActiva: string | null = null;
  private pielAntes: Float32Array | null = null;
  empezarTrazo(): void {
    this.capaTrazo.clear();
    const c = this.capaActiva ? this.datos.capas?.find((x) => x.id === this.capaActiva) : null;
    if (c && Math.abs(c.fuerza) < 0.05) this.fuerzaCapa(c.id, 1);   // esculpir en una capa apagada: se prende
    this.pielAntes = c ? (this.cuerpo.geometry.attributes.position.array as Float32Array).slice() : null;
  }
  /** Al soltar: lo del trazo pasa a la capa activa, y las piezas se rehacen. */
  terminarTrazo(): void {
    const c = this.capaActiva ? this.datos.capas?.find((x) => x.id === this.capaActiva) : null, D = c ? this.capasD.get(c.id) : null;
    if (c && D && this.pielAntes) {
      const arr = this.cuerpo.geometry.attributes.position.array as Float32Array, S = this.sumaCapas();
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - this.pielAntes[i]; if (!d) continue;
        D.d[i] += d / c.fuerza; S[i] += d;
      }
      D.e = undefined;
    }
    this.pielAntes = null; this.capaTrazo.clear();
    this.rehacerPiezas();
  }

  /* ── LAS CAPAS DE ESCULTURA (como Nomad: cada una con su dial) ── */
  private capasD = new Map<string, { d: Float32Array; e: string | undefined }>();
  private capasSuma: Float32Array | null = null;
  private sumaCapas(): Float32Array { return this.capasSuma ?? (this.capasSuma = new Float32Array(this.original.length)); }
  /** La piel sin lo esculpido en la principal: la de fábrica + contextura + cara + capas. */
  private fondo(): Float32Array {
    const b = this.base(); if (!this.capasSuma) return b;
    const o = b.slice(), S = this.capasSuma; for (let i = 0; i < o.length; i++) o[i] += S[i];
    return o;
  }
  private decodificar(e: string | undefined): Float32Array {
    const d = new Float32Array(this.original.length), n = d.length / 3;
    for (const { i, d: v } of esculturaDeDatos(e)) if (i >= 0 && i < n) { d[i * 3] = v[0]; d[i * 3 + 1] = v[1]; d[i * 3 + 2] = v[2]; }
    return d;
  }
  /** Pone las capas (sacando lo de las de antes): la piel se corre por la diferencia. */
  private ponerCapas(lista: CapaEscultura[] | undefined): void {
    const arr = this.cuerpo.geometry.attributes.position.array as Float32Array;
    if (this.capasSuma) for (let i = 0; i < arr.length; i++) arr[i] -= this.capasSuma[i];
    const nuevas = new Map<string, { d: Float32Array; e: string | undefined }>();
    for (const c of lista ?? []) {
      const ya = this.capasD.get(c.id);
      nuevas.set(c.id, ya && (ya.e === c.e || (ya.e === undefined && !c.e && !ya.d.some((v) => v !== 0))) ? ya : { d: this.decodificar(c.e), e: c.e });
    }
    this.capasD = nuevas;
    this.capasSuma = null;
    if (lista?.length) {
      const S = this.sumaCapas();
      for (const c of lista) { const D = nuevas.get(c.id)!.d; if (c.fuerza) for (let i = 0; i < S.length; i++) S[i] += D[i] * c.fuerza; }
      for (let i = 0; i < arr.length; i++) arr[i] += S[i];
    }
    this.datos.capas = lista?.length ? lista.map((c) => ({ ...c })) : undefined;
    if (this.capaActiva && !this.capasD.has(this.capaActiva)) this.capaActiva = null;
  }
  private capasConTexto(): CapaEscultura[] | undefined {
    const l = this.datos.capas; if (!l?.length) return undefined;
    const ceros = new Float32Array(this.original.length);
    return l.map((c) => {
      const D = this.capasD.get(c.id);
      if (D && D.e === undefined) D.e = esculturaATexto(ceros, D.d) ?? '';
      const e = D?.e || undefined;
      return { id: c.id, nombre: c.nombre, fuerza: c.fuerza, ...(e ? { e } : {}) };
    });
  }
  /** Después de correr la piel entera: normales, cachés y piezas. */
  private pielCambiada(): void {
    (this.cuerpo.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.versionPiel++; this.recalcularNormales(); this.actualizar(); this.rehacerPiezas();
  }
  nuevaCapa(nombre?: string): string {
    const id = idNuevo('capa'), l = this.datos.capas ?? [];
    this.datos.capas = [...l, { id, nombre: (nombre || '').trim().slice(0, 60) || 'Capa ' + (l.length + 1), fuerza: 1 }];
    this.capasD.set(id, { d: new Float32Array(this.original.length), e: undefined });
    this.capaActiva = id;
    return id;
  }
  fuerzaCapa(id: string, f: number): void {
    const c = this.datos.capas?.find((x) => x.id === id), D = this.capasD.get(id); if (!c || !D) return;
    f = Math.max(CAPA_FUERZA[0], Math.min(CAPA_FUERZA[1], Number.isFinite(f) ? f : 1));
    const k = f - c.fuerza; if (!k) return;
    const arr = this.cuerpo.geometry.attributes.position.array as Float32Array, S = this.sumaCapas();
    for (let i = 0; i < arr.length; i++) { const v = D.d[i] * k; if (v) { arr[i] += v; S[i] += v; } }
    c.fuerza = f;
    this.pielCambiada();
  }
  renombrarCapa(id: string, nombre: string): void { const c = this.datos.capas?.find((x) => x.id === id); if (c && nombre.trim()) c.nombre = nombre.trim().slice(0, 60); }
  /** Borrar la capa (lo esculpido en ella se va) o FUSIONARLA (queda en la principal, como «aplicar» en Blender). */
  quitarCapa(id: string, fusionar = false): void {
    const c = this.datos.capas?.find((x) => x.id === id), D = this.capasD.get(id); if (!c || !D) return;
    const arr = this.cuerpo.geometry.attributes.position.array as Float32Array, S = this.sumaCapas();
    for (let i = 0; i < arr.length; i++) { const v = D.d[i] * c.fuerza; if (v) { S[i] -= v; if (!fusionar) arr[i] -= v; } }
    this.capasD.delete(id);
    this.datos.capas = this.datos.capas!.filter((x) => x.id !== id);
    if (!this.datos.capas.length) this.datos.capas = undefined;
    if (this.capaActiva === id) this.capaActiva = null;
    this.pielCambiada();
  }

  /* ── LOS FILTROS (el Mesh Filter de Blender): toda la piel de una, menos lo enmascarado ── */
  filtro(tipo: FiltroEscultura, intensidad: number): void {
    this.preparar();
    const arr = this.cuerpo.geometry.attributes.position.array as Float32Array, N = this.cuerpo.geometry.attributes.normal.array as Float32Array;
    const M = this.mascaraAttr().array as Float32Array, G = this.grupos, k = Math.max(0.05, Math.min(1, intensidad));
    const P = new Float32Array(G.length * 3);
    G.forEach((l, g) => { const i = l[0]; P[g * 3] = arr[i * 3]; P[g * 3 + 1] = arr[i * 3 + 1]; P[g * 3 + 2] = arr[i * 3 + 2]; });
    const mov = new Float32Array(G.length * 3);
    for (let g = 0; g < G.length; g++) {
      const i = G[g][0], libre = 1 - Math.min(1, M[i]); if (libre <= 0) continue;
      if (tipo === 'inflar' || tipo === 'desinflar') {
        const s = (tipo === 'inflar' ? 1 : -1) * 0.0015 * k * libre;
        for (let c = 0; c < 3; c++) mov[g * 3 + c] = N[i * 3 + c] * s;
        continue;
      }
      const vs = this.vecinos[g]; if (!vs.length) continue;
      for (let c = 0; c < 3; c++) {
        let s = 0; for (const h of vs) s += P[h * 3 + c];
        const lap = s / vs.length - P[g * 3 + c];
        mov[g * 3 + c] = (tipo === 'suavizar' ? lap * 0.5 : -lap * 0.35) * k * libre;
      }
    }
    G.forEach((l, g) => { for (const i of l) for (let c = 0; c < 3; c++) arr[i * 3 + c] += mov[g * 3 + c]; });
    this.pielCambiada();
  }

  /* ── LAS PIEZAS: ropa, pelo, accesorios levantados de la piel ── */
  private piezasM = new Map<string, THREE.SkinnedMesh>();
  private mascarasCache = new Map<string, Float32Array>();
  private mascaraDePieza(s: string): Float32Array {
    const n = this.original.length / 3;
    let m = this.mascarasCache.get(s);
    if (!m || m.length !== n) { m = mascaraDeTexto(s, n); this.mascarasCache.set(s, m); }
    return m;
  }
  /** Rehace las piezas desde la piel de ahora (si se esculpe o se engorda, la ropa acompaña). */
  rehacerPiezas(soloId?: string): void {
    const lista = this.datos.piezas ?? [];
    for (const [id, m] of this.piezasM) if (!lista.some((p) => p.id === id)) {
      m.removeFromParent(); m.geometry.dispose(); (m.material as THREE.Material).dispose();
      this.piezasM.delete(id); this.mallas.splice(this.mallas.indexOf(m), 1);
    }
    if (!lista.length) return;
    this.preparar();
    const g = this.cuerpo.geometry, idx = g.index!.array as ArrayLike<number>;
    const piel = { pos: g.attributes.position.array as Float32Array, nrm: g.attributes.normal.array as Float32Array, idx, soldado: this.soldado!, grupos: this.grupos,
      skinIndex: g.attributes.skinIndex as THREE.BufferAttribute, skinWeight: g.attributes.skinWeight as THREE.BufferAttribute };
    for (const p of lista) {
      if (soloId && p.id !== soloId && this.piezasM.has(p.id)) continue;
      const geo = levantarPieza(piel, this.mascaraDePieza(p.mascara), p.grosor, p.suave) ?? new THREE.BufferGeometry();
      let m = this.piezasM.get(p.id);
      if (!m) {
        const mat = new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.86, metalness: 0, side: THREE.DoubleSide });
        mat.userData.pieza = true;
        mat.customProgramCacheKey = () => 'pieza-dq';
        mat.onBeforeCompile = (sh) => skinningConVolumen(sh);
        const fant = (this.cuerpo.material as THREE.Material).userData.opBase;
        if (fant !== undefined) { mat.userData.opBase = fant; mat.depthWrite = false; }
        m = new THREE.SkinnedMesh(geo, mat);
        m.name = 'pieza:' + p.id; m.userData.pieza = p.id; m.frustumCulled = false; m.castShadow = true;
        this.cuerpo.parent!.add(m);
        m.position.copy(this.cuerpo.position); m.quaternion.copy(this.cuerpo.quaternion); m.scale.copy(this.cuerpo.scale);
        m.updateMatrixWorld(true);
        m.bind(this.cuerpo.skeleton, this.cuerpo.bindMatrix);
        const malla = m;
        malla.raycast = (rc: THREE.Raycaster, out: THREE.Intersection[]) => this.tocarPieza(malla, rc, out);
        this.conVolumen(malla);
        this.piezasM.set(p.id, m); this.mallas.push(m);
      } else { m.geometry.dispose(); m.geometry = geo; }
      (m.material as THREE.MeshStandardMaterial).color.set(p.color);
      m.visible = p.visible !== false && !!geo.attributes.position;
      m.userData.toque = null;
      (m as unknown as { boundingSphere: THREE.Sphere | null }).boundingSphere = null;
    }
  }
  /** El rayo contra una pieza (por una rejilla, como la piel). */
  private tocarPieza(m: THREE.SkinnedMesh, rc: THREE.Raycaster, out: THREE.Intersection[]): void {
    if (!m.visible || !m.geometry.index) return;
    let t = m.userData.toque as { pos: Float32Array; rej: RejillaPiel } | null;
    if (!t) {
      const n = m.geometry.attributes.position.count, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { m.getVertexPosition(i, _v); _v.applyMatrix4(m.matrixWorld); pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z; }
      t = { pos, rej: new RejillaPiel(pos, m.geometry.index.array as ArrayLike<number>) };
      m.userData.toque = t;
    }
    const h = t.rej.tocar(rc.ray);
    if (!h || h.t < rc.near || h.t > rc.far) return;
    const I = m.geometry.index.array as ArrayLike<number>, a = I[h.tri * 3], b = I[h.tri * 3 + 1], c = I[h.tri * 3 + 2];
    const A = new THREE.Vector3().fromArray(t.pos, a * 3), B = new THREE.Vector3().fromArray(t.pos, b * 3), C = new THREE.Vector3().fromArray(t.pos, c * 3);
    const nw = B.sub(A).cross(C.sub(A)).normalize();
    if (nw.dot(rc.ray.direction) > 0) nw.negate();
    const normal = nw.transformDirection(new THREE.Matrix4().copy(m.matrixWorld).invert());
    out.push({ distance: h.t, point: rc.ray.origin.clone().addScaledVector(rc.ray.direction, h.t), object: m, faceIndex: h.tri, face: { a, b, c, normal, materialIndex: 0 } } as THREE.Intersection);
  }
  /** Para esculpir tocando una pieza: el punto de la piel de donde sale. */
  puntoDePiel(h: THREE.Intersection): THREE.Vector3 | null {
    const f = (h.object as THREE.Mesh).geometry?.userData?.fuente as Int32Array | undefined;
    if (!f || !h.face) return null;
    const pos = this.posicionesMundo(), i = f[h.face.a];
    return new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  }
  /** LEVANTAR UNA PIEZA de lo enmascarado (Extract): devuelve su id, o null si no hay máscara. */
  extraerPieza(o: { nombre?: string; grosor: number; suave: number; color: string }): string | null {
    const M = this.mascaraAttr().array as Float32Array;
    if (!M.some((v) => v >= 0.5)) return null;
    const id = idNuevo('pieza'), l = this.datos.piezas ?? [];
    this.datos.piezas = [...l, { id, nombre: (o.nombre || '').trim().slice(0, 60) || 'Pieza ' + (l.length + 1),
      color: /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : '#6f7d8c', grosor: Math.max(PIEZA_GROSOR[0], Math.min(PIEZA_GROSOR[1], o.grosor)),
      suave: Math.max(0, Math.min(1, o.suave)), mascara: mascaraATexto(M) }];
    this.limpiarMascara();
    this.rehacerPiezas(id);
    return id;
  }
  cambiarPieza(id: string, c: Partial<Omit<Pieza, 'id' | 'mascara'>>): void {
    const p = this.datos.piezas?.find((x) => x.id === id); if (!p) return;
    if (typeof c.nombre === 'string' && c.nombre.trim()) p.nombre = c.nombre.trim().slice(0, 60);
    if (typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color)) p.color = c.color;
    if (typeof c.grosor === 'number' && Number.isFinite(c.grosor)) p.grosor = Math.max(PIEZA_GROSOR[0], Math.min(PIEZA_GROSOR[1], c.grosor));
    if (typeof c.suave === 'number' && Number.isFinite(c.suave)) p.suave = Math.max(0, Math.min(1, c.suave));
    if (typeof c.visible === 'boolean') { if (c.visible) delete p.visible; else p.visible = false; }
    this.rehacerPiezas(id);
  }
  borrarPieza(id: string): void {
    if (!this.datos.piezas?.some((x) => x.id === id)) return;
    this.datos.piezas = this.datos.piezas.filter((x) => x.id !== id);
    if (!this.datos.piezas.length) this.datos.piezas = undefined;
    this.rehacerPiezas();
  }
  /** Las mallas de las piezas (para las pruebas y el motor). */
  mallaDePieza(id: string): THREE.SkinnedMesh | null { return this.piezasM.get(id) ?? null; }
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
  sinEscultura(): void { this.ponerCapas(undefined); this.capaActiva = null; this.ponerPiel(this.base()); this.rehacerPiezas(); }
  esculpido(): boolean {
    const a = this.cuerpo.geometry.attributes.position.array as Float32Array, b = this.base();
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return true;
    return false;
  }
  private ponerEscultura(e: number[] | string): void {
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute, arr = attr.array as Float32Array, n = arr.length / 3;
    const b = this.fondo();
    for (const { i, d } of esculturaDeDatos(e)) {
      if (!(i >= 0 && i < n)) continue;
      arr[i * 3] = b[i * 3] + d[0]; arr[i * 3 + 1] = b[i * 3 + 1] + d[1]; arr[i * 3 + 2] = b[i * 3 + 2] + d[2];
    }
    attr.needsUpdate = true; this.versionPiel++;
    this.recalcularNormales();
  }
  /** Los datos para guardar (con la escultura como lista de corrimientos). */
  aDatos(): PersonajeDatos {
    const escultura = esculturaATexto(this.fondo(), this.cuerpo.geometry.attributes.position.array as Float32Array);
    const d = this.datos, capas = this.capasConTexto();
    return { base: d.base, prop: { ...d.prop }, pose: JSON.parse(JSON.stringify(d.pose)), pies: d.pies, color: d.color,
      ...(escultura ? { escultura } : {}), ...(d.definicion !== undefined ? { definicion: d.definicion } : {}),
      ...(d.forma ? { forma: { ...d.forma } } : {}), ...(d.cara ? { cara: { ...d.cara } } : {}),
      ...(d.raiz ? { raiz: d.raiz.slice() } : {}), ...(d.actuacion ? { actuacion: JSON.parse(JSON.stringify(d.actuacion)) } : {}),
      ...(capas ? { capas } : {}), ...(d.piezas ? { piezas: d.piezas.map((p) => ({ ...p })) } : {}) };
  }
  /** Vuelve a unos datos (deshacer, abrir) sin cambiar de cuerpo. */
  ponerDatos(x: PersonajeDatos): void {
    const d = personajeValido(x);
    this.datos.prop = d.prop; this.datos.pose = d.pose; this.datos.pies = d.pies; this.datos.raiz = d.raiz; this.datos.actuacion = d.actuacion;
    this.ponerColor(d.color);
    if (JSON.stringify(d.forma) !== JSON.stringify(this.datos.forma)) this.ponerForma(d.forma);
    if (JSON.stringify(d.cara) !== JSON.stringify(this.datos.cara)) this.ponerCara(d.cara);
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute;
    (attr.array as Float32Array).set(this.base()); this.versionPiel++;
    this.capasSuma = null; this.ponerCapas(d.capas);
    if (d.escultura) this.ponerEscultura(d.escultura); else { attr.needsUpdate = true; this.recalcularNormales(); }
    this.datos.piezas = d.piezas;
    this.aplicar();
    this.rehacerPiezas();
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
    if (this.hombrosAuto && /^hand_/.test(c) && this.acomodarClavicula(c.slice(-1))) this.resolverIK(cad[0], cad[1], cad[2], destino);
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
    if (this.tieneCara() && JSON.stringify(p.cara) !== JSON.stringify(this.datos.cara)) this.ponerCara(p.cara);
    this.aplicar();
    return true;
  }
  /** La pose de ahora como clave en ese cuadro (reemplaza la que hubiera). */
  claveAqui(f: number): void {
    const a = this.datos.actuacion ?? (this.datos.actuacion = { cuadros: Math.max(24, f), claves: [] });
    a.cuadros = Math.max(a.cuadros, f);
    const c: ClaveActuacion = { f, pose: JSON.parse(JSON.stringify(this.datos.pose)), ...(this.datos.raiz ? { raiz: this.datos.raiz.slice() } : {}),
      ...(this.datos.cara ? { cara: { ...this.datos.cara } } : {}) };
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
    // un corrimiento (lo esculpido en la principal o en una capa) llevado al otro nivel
    let pasar: (corr: Float32Array) => string | undefined, nAbajoDe = () => this.original.length / 3;
    if (nivel > actual) {
      // lo esculpido sin la contextura ni la cara (la otra piel las recalcula)
      pasar = (corr) => {
        const esculpida = this.original.slice();
        for (let i = 0; i < esculpida.length; i++) esculpida[i] += corr[i];
        let g = this.cuerpo.geometry, original = pielEnNivel(this.datos.base, this.cuerpo.geometry, 0);
        original.setAttribute('position', new THREE.BufferAttribute(this.original.slice(), 3));
        for (let k = actual; k < nivel; k++) { g = subdividir(g, g === this.cuerpo.geometry ? esculpida : g.attributes.position.array as Float32Array); original = subdividir(original); }
        const e = esculturaATexto(original.attributes.position.array as Float32Array, g.attributes.position.array as Float32Array);
        g.dispose(); original.dispose();
        return e;
      };
    } else {
      const base = cuerpos.get(this.datos.base)!;
      let g0: THREE.BufferGeometry | null = null;
      base.scene.traverse((o) => { const m = o as THREE.SkinnedMesh; if (m.isSkinnedMesh && (!g0 || m.geometry.attributes.position.count > g0.attributes.position.count)) g0 = m.geometry; });
      const nAbajo = pielEnNivel(this.datos.base, pielPartida(this.datos.base, g0!), nivel).attributes.position.count;
      nAbajoDe = () => nAbajo;
      pasar = (corr) => esculturaATexto(new Float32Array(nAbajo * 3), corr.subarray(0, nAbajo * 3));
    }
    const f = this.fondo(), principal = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) principal[i] = arr[i] - f[i];
    escultura = esculturaATexto(new Float32Array(arr.length), principal) ? pasar(principal) : undefined;
    const capas = d.capas?.map((c) => { const D = this.capasD.get(c.id); const e = D ? pasar(D.d) : undefined; return { id: c.id, nombre: c.nombre, fuerza: c.fuerza, ...(e ? { e } : {}) }; });
    const piezas = d.piezas?.map((p) => {
      const m = this.mascaraDePieza(p.mascara);
      if (nivel < actual) return { ...p, mascara: mascaraATexto(m.subarray(0, nAbajoDe())) };
      // subir: la máscara va como un atributo más de la piel subdividida
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.original.slice(), 3));
      g.setAttribute('normal', this.cuerpo.geometry.attributes.normal.clone());
      g.setAttribute('skinIndex', this.cuerpo.geometry.attributes.skinIndex.clone());
      g.setAttribute('skinWeight', this.cuerpo.geometry.attributes.skinWeight.clone());
      g.setAttribute('mascara', new THREE.BufferAttribute(m.slice(), 1));
      g.setIndex(this.cuerpo.geometry.index!.clone());
      for (let k = actual; k < nivel; k++) { const s = subdividir(g); g.dispose(); g = s; }
      const out = mascaraATexto(g.attributes.mascara.array as Float32Array);
      g.dispose();
      return { ...p, mascara: out };
    });
    return { ...d, definicion: nivel, escultura, ...(capas ? { capas } : {}), ...(piezas ? { piezas } : {}) };
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
  /* ── LOS HOMBROS: la clavícula ── */
  /** Cuánto se puede girar cada hueso sin bisagra (grados): la clavícula sube y
   *  se adelanta poco; sin esto, arrastrarla daba hombros imposibles. */
  static readonly LIMITES: Record<string, number> = { clavicle_l: 35, clavicle_r: 35, hand_l: 85, hand_r: 85, foot_l: 50, foot_r: 50 };
  /** HOMBROS AUTOMÁTICOS: al levantar el brazo por encima del hombro, la
   *  clavícula sube con él (como un hombro de verdad: el brazo solo no pasa de
   *  la horizontal sin que acompañe el omóplato). */
  hombrosAuto = true;
  private ponerGiro(n: string, q: THREE.Quaternion): void {
    const b = this.huesos.get(n); if (!b) return;
    const r = this.reposo.get(n)!, w = this.enReposo.get(n)!;
    if (1 - Math.abs(q.w) < 1e-7) delete this.datos.pose[n];
    else this.datos.pose[n] = q.toArray().map((v) => Math.round(v * 1e5) / 1e5);
    b.quaternion.copy(r.q).multiply(w.clone().invert().multiply(q).multiply(w));
    b.updateMatrixWorld(true);
  }
  /** La clavícula según cuánto está levantado el brazo (0 colgando, 180 arriba). */
  private acomodarClavicula(lado: string): boolean {
    const cl = 'clavicle_' + lado, S = this.articulacion('upperarm_' + lado), E = this.articulacion('lowerarm_' + lado), t = this.huesos.get('spine_03');
    if (!S || !E || !t || !this.huesos.has(cl)) return false;
    const arriba = new THREE.Vector3(0, 1, 0).applyQuaternion(t.getWorldQuaternion(new THREE.Quaternion()).multiply(this.enReposo.get('spine_03')!.clone().invert()));
    const elev = (Math.acos(Math.max(-1, Math.min(1, -E.sub(S).normalize().dot(arriba)))) * 180) / Math.PI;
    const ang = Math.max(0, Math.min(1, (elev - 75) / 105)) * 28;
    this.ponerGiro(cl, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, lado === 'l' ? 1 : -1), (ang * Math.PI) / 180));
    this.raiz.updateMatrixWorld(true);
    return true;
  }

  /* ── LAS MANOS: abrir, cerrar, señalar ──
     El puño de verdad sale de la biblioteca de animaciones (la pose «golpe»: las
     dos manos cerradas); cada dedo va del reposo (mano abierta) a ese puño. */
  static readonly MANOS: { id: string; nombre: string; m: { cerrar: number; indice: number; pulgar: number } }[] = [
    { id: 'abierta', nombre: 'Abierta', m: { cerrar: 0, indice: 0, pulgar: 0 } },
    { id: 'relajada', nombre: 'Relajada', m: { cerrar: 0.35, indice: 0.3, pulgar: 0.25 } },
    { id: 'agarrar', nombre: 'Agarrar', m: { cerrar: 0.65, indice: 0.6, pulgar: 0.75 } },
    { id: 'puno', nombre: 'Puño', m: { cerrar: 1, indice: 1, pulgar: 1 } },
    { id: 'senalar', nombre: 'Señalar', m: { cerrar: 1, indice: 0, pulgar: 0.9 } },
  ];
  private puno: Record<string, number[]> | null = null;
  private punoDeReferencia(): Record<string, number[]> | null {
    if (this.puno) return this.puno;
    const g = posesListas.find((x) => x.id === 'golpe');
    if (!g) return null;
    const pose = this.poseDeLocales(g.huesos), out: Record<string, number[]> = {};
    for (const [n, q] of Object.entries(pose)) if (/^(index|middle|ring|pinky|thumb)_0[123]_[lr]$/.test(n)) out[n] = q;
    return (this.puno = out);
  }
  /** Cuánto está cerrada cada parte de la mano (0 abierta, 1 puño), leído de la pose. */
  mano(lado: string): { cerrar: number; indice: number; pulgar: number } {
    const P = this.punoDeReferencia(), ang = (q?: number[]) => (q ? 2 * Math.acos(Math.min(1, Math.abs(q[3]))) : 0);
    const r = (n: string) => { const ref = P?.[n]; return ref && ang(ref) > 1e-3 ? Math.round((ang(this.datos.pose[n]) / ang(ref)) * 100) / 100 : 0; };
    return { cerrar: r('middle_02_' + lado), indice: r('index_02_' + lado), pulgar: r('thumb_02_' + lado) };
  }
  /** Abre o cierra la mano: cada falange va del reposo al puño de referencia. */
  ponerMano(lado: string, m: Partial<{ cerrar: number; indice: number; pulgar: number }>): void {
    const P = this.punoDeReferencia(); if (!P) return;
    const v = { ...this.mano(lado), ...m };
    const id = new THREE.Quaternion();
    for (const [n, ref] of Object.entries(P)) {
      if (!n.endsWith('_' + lado)) continue;
      const k = /^thumb/.test(n) ? v.pulgar : /^index/.test(n) ? v.indice : v.cerrar;
      const q = id.clone().slerp(new THREE.Quaternion().fromArray(ref), Math.max(0, Math.min(1.1, k)));
      if (1 - Math.abs(q.w) < 1e-6) delete this.datos.pose[n]; else this.datos.pose[n] = q.toArray().map((x) => Math.round(x * 1e5) / 1e5);
    }
    this.aplicar();
  }

  /* ── LA CONTEXTURA y LA CARA: capas sobre la piel en reposo ──
     La piel = la de fábrica + la contextura + la cara + la escultura. Cambiar la
     contextura o la cara corre la piel por la diferencia: lo esculpido queda. */
  private formaCapa: Float32Array | null = null;
  private caraCapa = new Map<number, [number, number, number]>();
  private baseCache: Float32Array | null = null;
  private normalesOriginales: Float32Array | null = null;
  /** La piel sin esculpir (la de fábrica + la contextura + la cara). */
  private base(): Float32Array {
    if (this.baseCache) return this.baseCache;
    const b = this.original.slice();
    if (this.formaCapa) for (let i = 0; i < b.length; i++) b[i] += this.formaCapa[i];
    for (const [i, d] of this.caraCapa) { b[i * 3] += d[0]; b[i * 3 + 1] += d[1]; b[i * 3 + 2] += d[2]; }
    return (this.baseCache = b);
  }
  /** Normales por grupo soldado (las costuras no se abren al inflar). */
  private normalesSoldadas(): Float32Array {
    this.preparar();
    const N = this.normalesOriginales!, out = new Float32Array(N.length);
    for (const l of this.grupos) {
      let x = 0, y = 0, z = 0;
      for (const i of l) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
      const m = Math.hypot(x, y, z) || 1;
      for (const i of l) { out[i * 3] = x / m; out[i * 3 + 1] = y / m; out[i * 3 + 2] = z / m; }
    }
    return out;
  }
  /** Promedio con los vecinos, `veces` veces (por grupo soldado). */
  private suavizarCampo(v: Float32Array, k: number, veces: number): void {
    this.preparar();
    const G = this.grupos, porG = new Float32Array(G.length * k), aux = new Float32Array(G.length * k);
    G.forEach((l, g) => { for (let c = 0; c < k; c++) porG[g * k + c] = v[l[0] * k + c]; });
    for (let it = 0; it < veces; it++) {
      for (let g = 0; g < G.length; g++) {
        const vs = this.vecinos[g];
        for (let c = 0; c < k; c++) {
          let s = 0; for (const h of vs) s += porG[h * k + c];
          aux[g * k + c] = vs.length ? porG[g * k + c] * 0.5 + (s / vs.length) * 0.5 : porG[g * k + c];
        }
      }
      porG.set(aux);
    }
    G.forEach((l, g) => { for (const i of l) for (let c = 0; c < k; c++) v[i * k + c] = porG[g * k + c]; });
  }
  /** El corrimiento de la piel para una contextura (en reposo). */
  private campoForma(f: Forma): Float32Array {
    const g = this.cuerpo.geometry, n = g.attributes.position.count, bones = this.cuerpo.skeleton.bones;
    const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    // se infla por las normales de la piel SUAVIZADA: con las del cuerpo musculoso, cada
    // surco de los abdominales torcía la dirección y la panza salía en escalones
    const N = this.normalesSoldadas(), esc = new Float32Array(n * 3);   // [engordar, adelgazar, desmuscular]
    this.suavizarCampo(N, 3, 12);
    for (let i = 0; i < n; i++) { const m = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1; N[i * 3] /= m; N[i * 3 + 1] /= m; N[i * 3 + 2] /= m; }
    for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k); if (!w) continue;
      const r = regionDeHueso(bones[si.getComponent(i, k)]?.name ?? '');
      // la panza sale para adelante
      const panza = (r === 'spine_01' || r === 'pelvis' || r === 'spine_02') && N[i * 3 + 2] > 0 ? 1 + 1.2 * N[i * 3 + 2] : 1;
      esc[i * 3] += w * (ENGORDAR[r] || 0) * panza; esc[i * 3 + 1] += w * (ADELGAZAR[r] || 0); esc[i * 3 + 2] += w * (DESMUSCULAR[r] || 0);
    }
    // sin escalones donde cambia el hueso: con más malla, más pasadas (cubren la misma distancia)
    this.suavizarCampo(esc, 3, 25 * (1 + (this.datos.definicion ?? 0)));
    // lo «blando»: la piel suavizada, sin el detalle de los músculos
    const liso = this.original.slice();
    this.suavizarCampo(liso, 3, 6);
    const out = new Float32Array(n * 3), p = f.peso, m = f.musculo;
    // el DIÁMETRO de cada parte: la piel se aleja o se acerca al eje de su hueso
    // (el segmento en reposo, de la articulación a la siguiente)
    const gr = f.grosor ?? {};
    if (Object.keys(gr).length) {
      const enReposo = (nombre: string) => { const k = bones.findIndex((b) => b.name === nombre); return k < 0 ? null : new THREE.Vector3().setFromMatrixPosition(this.cuerpo.skeleton.boneInverses[k].clone().invert()); };
      const sig: Record<string, string> = { Head: 'Head', neck_01: 'Head', pelvis: 'neck_01', spine_01: 'neck_01', spine_02: 'neck_01', spine_03: 'neck_01',
        upperarm: 'lowerarm', lowerarm: 'hand', thigh: 'calf', calf: 'foot' };
      const segmentos = new Map<number, { a: THREE.Vector3; b: THREE.Vector3; k: number }>();
      bones.forEach((b, k) => {
        const nombre = nombreReal(b.name);
        const lado = /_[lr]$/.test(nombre) ? nombre.slice(-2) : '', r = nombre.replace(/_[lr]$/, ''), parte = PARTE_DE_HUESO[r], f2 = parte ? gr[parte] : undefined;
        // la cabeza va aparte (anchoCabeza): un radio desde la articulación del cuello
        // estiraba la pera y ensanchaba el cuello
        if (!parte || f2 === undefined || parte === 'cabeza') return;
        const a = enReposo(r === 'pelvis' || /^spine/.test(r) ? 'pelvis' : nombre);
        let fin = enReposo(sig[r] + (sig[r] === 'Head' || sig[r] === 'neck_01' ? '' : lado));
        if (!a || !fin) return;
        if (r === 'Head') fin = a.clone().add(new THREE.Vector3(0, 0.22, 0));   // la cabeza: hacia la coronilla
        segmentos.set(k, { a, b: fin, k: f2 });
      });
      const P = new THREE.Vector3(), q = new THREE.Vector3(), ab = new THREE.Vector3();
      for (let i = 0; i < n; i++) for (let j = 0; j < 4; j++) {
        const w = sw.getComponent(i, j), s = w ? segmentos.get(si.getComponent(i, j)) : undefined;
        if (!s) continue;
        P.fromArray(this.original, i * 3); ab.subVectors(s.b, s.a);
        const tt = Math.max(0, Math.min(1, P.clone().sub(s.a).dot(ab) / Math.max(1e-9, ab.lengthSq())));
        q.copy(s.a).addScaledVector(ab, tt);
        const radial = P.sub(q).multiplyScalar((s.k - 1) * w);
        out[i * 3] += radial.x; out[i * 3 + 1] += radial.y; out[i * 3 + 2] += radial.z;
      }
    }
    for (let i = 0; i < n; i++) {
      const s = (p > 0 ? p * esc[i * 3] : -p * esc[i * 3 + 1]) + (m < 0 ? -m * esc[i * 3 + 2] : 0);
      const blando = Math.min(1.2, (m < 0 ? -m * 0.8 : -m * 0.5) + Math.max(0, p) * 0.7);
      for (let c = 0; c < 3; c++) out[i * 3 + c] += N[i * 3 + c] * s + blando * (liso[i * 3 + c] - this.original[i * 3 + c]);
    }
    // los dos labios comparten la fila donde se tocan (cada uno con su copia): la
    // contextura los tiene que mover JUNTOS. Suavizados por separado, cada copia iba
    // a otro lado y la boca cerrada quedaba en serrucho (medido en «Muy gordo»)
    // la CARA no se infla: los ojos, las cejas y las pestañas son mallas aparte que no
    // engordan, y la piel los tapaba (medido: «Muy gordo» quedaba sin cejas y con los
    // ojos hundidos). Sólo donde la cabeza pesa poco (papada, cuello) sigue engordando.
    const kHead = bones.findIndex((b) => b.name === 'Head');
    if (kHead >= 0) for (let i = 0; i < n; i++) {
      let wh = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === kHead) wh += sw.getComponent(i, k);
      if (wh <= 0.3) continue;
      const u = Math.min(1, (wh - 0.3) / 0.6), f = 1 - u * u * (3 - 2 * u);
      out[i * 3] *= f; out[i * 3 + 1] *= f; out[i * 3 + 2] *= f;
    }
    // el ancho de la cabeza, DESPUÉS de proteger la cara: si no, esa protección lo
    // anulaba en el cráneo y sólo quedaba moviendo la transición (cuello y mandíbula)
    if (kHead >= 0 && gr.cabeza !== undefined && gr.cabeza !== 1) this.anchoCabeza(out, gr.cabeza, kHead);
    const O = this.original, juntos = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const k = Math.round(O[i * 3] * 20000) + ',' + Math.round(O[i * 3 + 1] * 20000) + ',' + Math.round(O[i * 3 + 2] * 20000);
      const l = juntos.get(k); if (l) l.push(i); else juntos.set(k, [i]);
    }
    for (const l of juntos.values()) {
      if (l.length < 2) continue;
      for (let c = 0; c < 3; c++) { let s = 0; for (const i of l) s += out[i * 3 + c]; s /= l.length; for (const i of l) out[i * 3 + c] = s; }
    }
    return out;
  }
  /** «Cabeza (ancho)»: ensancha el CRÁNEO para los costados (sólo en x, alrededor
   *  del centro de la cabeza), como el ancho de cabeza de un creador de personajes.
   *  Reporte de Mauro (3.52): el dial «deforma el cuello y la pera». Medido con
   *  1,80: el cráneo no crecía nada y el cuello se corría 24 mm. Ahora:
   *  · sólo donde la piel es casi toda de la cabeza: el cuello no se mueve;
   *  · entero en el cráneo y algo menos en la mandíbula; sólo para los costados,
   *    así la pera (en el medio) no se estira ni para abajo ni para adelante;
   *  · el frente de la cara (ojos, nariz, boca, cejas) no se corre: los ojos y las
   *    cejas son mallas aparte que no acompañarían, y quedarían desencajados. */
  private anchoCabeza(out: Float32Array, k: number, kHead: number): void {
    const O = this.original, g = this.cuerpo.geometry, n = O.length / 3;
    const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const wh = new Float32Array(n);
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === kHead) wh[i] += sw.getComponent(i, c);
    // la cabeza medida en la piel de fábrica: alto (pera a coronilla), centro y profundidad
    let y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0, m = 0;
    for (let i = 0; i < n; i++) {
      if (wh[i] <= 0.9) continue;
      const x = O[i * 3], y = O[i * 3 + 1], z = O[i * 3 + 2];
      y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; m++;
    }
    if (!m) return;
    cx /= m; cz /= m;
    const alto = y1 - y0, frente = z1 - cz;
    for (let i = 0; i < n; i++) {
      if (wh[i] <= 0.5) continue;
      const x = O[i * 3], y = O[i * 3 + 1], z = O[i * 3 + 2];
      const deCabeza = ss(0.5, 0.95, wh[i]);                                     // el cuello: nada
      // la mandíbula acompaña (si no, cráneo ancho sobre mandíbula angosta: un hongo);
      // la pera, que está en el medio, casi no se mueve porque el corrimiento es (x − centro)
      const altura = 0.55 + 0.45 * ss(y0, y0 + 0.35 * alto, y);
      const cara = ss(cz, cz + 0.6 * frente, z) * (1 - ss(y0 + 0.82 * alto, y0 + 0.92 * alto, y));   // el frente, debajo de la frente
      out[i * 3] += (x - cx) * (k - 1) * deCabeza * altura * (1 - cara);
    }
  }
  /** La piel como vino de fábrica, en reposo (sólo lectura: la usa el Estudio de anatomía). */
  pielDeFabrica(): Float32Array { return this.original; }
  /** La contextura (un paso de Ctrl+Z lo arma el motor). */
  ponerForma(f: Forma | undefined): void {
    const fv = formaValida(f && !this.aceptaContextura() ? { peso: 0, musculo: 0, grosor: f.grosor } : f);
    const nueva = fv ? this.campoForma(fv) : null;
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute, arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] += (nueva ? nueva[i] : 0) - (this.formaCapa ? this.formaCapa[i] : 0);
    this.formaCapa = nueva; this.baseCache = null; this.datos.forma = fv;
    attr.needsUpdate = true; this.versionPiel++;
    this.recalcularNormales();
    this.rehacerPiezas();
    // el relieve de los músculos (la textura de normales) acompaña: menos músculo, menos relieve
    const k = Math.max(0.12, Math.min(1.8, 1 + (fv?.musculo ?? 0) * 0.85 - 0.5 * Math.max(0, fv?.peso ?? 0)));
    for (const m of this.mallas) { const mat = m.material as THREE.MeshStandardMaterial; if (mat.normalMap && mat === (this.cuerpo.material as THREE.Material)) mat.normalScale.set(k, k); }
    this.aplicar();
  }

  /* la cara */
  private ojos: { malla: THREE.SkinnedMesh; pos: Float32Array; nrm: Float32Array; centros: { c: THREE.Vector3; r: number }[] } | null = null;
  private cejasMalla: { malla: THREE.SkinnedMesh; pos: Float32Array } | null = null;
  private rasgos: {
    parpados: { c: THREE.Vector3; r: number; i: Int32Array; w: Float32Array }[];
    mandibula: { piv: THREE.Vector3; i: Int32Array; w: Float32Array };
    comisuras: { s: number; i: Int32Array; w: Float32Array }[];
    labios: { i: Int32Array; w: Float32Array };
    cejas: { i: Int32Array; w: Float32Array; adentro: Float32Array }[];
    cejasMalla: { w: Float32Array; adentro: Float32Array; lado: Int8Array; cerca: Int32Array } | null;
  } | null = null;
  /** ¿Tiene cara este cuerpo? (el maniquí no: no tiene boca ni ojos). */
  tieneCara(): boolean { return !!this.cuerpo.geometry.userData.boca && !!this.ojos; }
  /** El maniquí es de piezas rígidas: engordarlo las desarmaba; sólo cambia el grosor de cada pieza. */
  aceptaContextura(): boolean { return this.datos.base !== 'maniqui'; }
  private prepararRasgos(): NonNullable<Personaje3D['rasgos']> {
    if (this.rasgos) return this.rasgos;
    const O = this.original, n = O.length / 3, g = this.cuerpo.geometry, L = g.attributes.labio?.array as Float32Array | undefined;
    const boca = g.userData.boca as { labioY: number; ancho: number; zFrente: number };
    const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const lista = (f: (i: number, x: number, y: number, z: number) => number) => {
      const ii: number[] = [], ww: number[] = [];
      for (let i = 0; i < n; i++) { const w = f(i, O[i * 3], O[i * 3 + 1], O[i * 3 + 2]); if (w > 1e-4) { ii.push(i); ww.push(w); } }
      return { i: Int32Array.from(ii), w: Float32Array.from(ww) };
    };
    const ojos = this.ojos!.centros;
    // la malla de «pelo» trae las cejas Y LAS PESTAÑAS, en piezas sueltas: las piezas
    // a la altura del ojo son pestañas (siguen al párpado), las de arriba, cejas.
    // Medido: tomadas todas como ceja, la ceja «bajaba» al ojo y el párpado la arrastraba.
    const pestana = new Uint8Array(this.cejasMalla ? this.cejasMalla.pos.length / 3 : 0);
    if (this.cejasMalla) {
      const Pm = this.cejasMalla.pos, I = this.cejasMalla.malla.geometry.index?.array, m = Pm.length / 3;
      const pa = Int32Array.from({ length: m }, (_, i) => i), raiz = (i: number): number => { while (pa[i] !== i) { pa[i] = pa[pa[i]]; i = pa[i]; } return i; };
      const unir = (a: number, b: number) => { pa[raiz(a)] = raiz(b); };
      const lugar = new Map<string, number>();
      for (let i = 0; i < m; i++) { const k = Math.round(Pm[i * 3] * 5000) + ',' + Math.round(Pm[i * 3 + 1] * 5000) + ',' + Math.round(Pm[i * 3 + 2] * 5000); const j = lugar.get(k); if (j === undefined) lugar.set(k, i); else unir(i, j); }
      if (I) for (let q = 0; q < I.length; q += 3) { unir(I[q], I[q + 1]); unir(I[q], I[q + 2]); }
      const suma = new Map<number, [number, number]>();
      for (let i = 0; i < m; i++) { const r = raiz(i), s = suma.get(r) ?? [0, 0]; s[0] += Pm[i * 3 + 1]; s[1]++; suma.set(r, s); }
      for (let i = 0; i < m; i++) {
        const s = suma.get(raiz(i))!, o = ojos[Pm[i * 3] >= 0 ? 0 : 1];
        pestana[i] = s[0] / s[1] - o.c.y < o.r * 0.4 ? 1 : 0;
      }
    }
    // la altura de las cejas: la de su malla (estaban más cerca del ojo de lo supuesto)
    let cejaY = (o: { c: THREE.Vector3; r: number }) => o.c.y + o.r * 0.8;
    if (this.cejasMalla) {
      const Pm = this.cejasMalla.pos, ys: number[][] = [[], []];
      for (let i = 0; i < Pm.length; i += 3) if (!pestana[i / 3]) ys[Pm[i] >= 0 ? 0 : 1].push(Pm[i + 1]);
      const med = ys.map((l) => (l.length ? l.reduce((s, v) => s + v, 0) / l.length : NaN));
      cejaY = (o) => { const k = o.c.x >= 0 ? 0 : 1; return Number.isFinite(med[k]) ? med[k] : o.c.y + o.r * 0.8; };
    }
    // el borde de abajo de la ceja en cada x (las puntas bajan: con la altura media,
    // la punta de afuera quedaba dentro del párpado y se arrastraba 7 mm)
    const bajoCeja = (o: { c: THREE.Vector3; r: number }, x: number) => {
      let y = Infinity;
      if (this.cejasMalla) { const Pm = this.cejasMalla.pos; for (let i = 0; i < Pm.length; i += 3) if (!pestana[i / 3] && Math.sign(Pm[i]) === Math.sign(o.c.x) && Math.abs(Pm[i] - x) < 0.004) y = Math.min(y, Pm[i + 1]); }
      return Number.isFinite(y) ? y : cejaY(o);
    };
    // (el párpado se apaga antes de la ceja: si no, al cerrar el ojo la arrastraba y se arrugaba)
    const parpados = ojos.map((o) => { const { c, r } = o; return { c, r, ...lista((_i, x, y, z) => {
      const d = Math.hypot(x - c.x, y - c.y, z - c.z);
      if (d < r * 0.2 || d > r * 2.3 || z < c.z - r * 0.1 || Math.abs(x - c.x) > r * 2.2) return 0;
      const cy = bajoCeja(o, x);
      return (1 - ss(r * 1.3, r * 2.2, d)) * (1 - ss(c.y + (cy - c.y) * 0.4, c.y + (cy - c.y) * 0.85, y));
    }) }; });
    const ey = (ojos[0].c.y + ojos[1].c.y) / 2, ez = (ojos[0].c.z + ojos[1].c.z) / 2;
    const piv = new THREE.Vector3(0, (ey + boca.labioY) / 2 - 0.01, ez - 0.065);
    const mandibula = { piv, ...lista((i, x, y, z) => {
      const lab = L ? L[i] : (y < boca.labioY ? 1 : 0);
      // (sin corte por altura: el atributo ya es gradual en el fondo y en las mejillas)
      if (!lab || y < boca.labioY - 0.12) return 0;
      return lab * ss(piv.z, piv.z + 0.04, z) * (1 - ss(boca.labioY - 0.075, boca.labioY - 0.11, y)) * (1 - ss(0.055, 0.075, Math.abs(x)));
    }) };
    const comisuras = [1, -1].map((s) => {
      let kz = -Infinity;
      for (let i = 0; i < n; i++) if (Math.hypot(O[i * 3] - s * boca.ancho, O[i * 3 + 1] - boca.labioY) < 0.006) kz = Math.max(kz, O[i * 3 + 2]);
      const K = new THREE.Vector3(s * boca.ancho, boca.labioY, kz);
      return { s, ...lista((_i, x, y, z) => { const d = Math.hypot(x - K.x, y - K.y, z - K.z); return d < 0.022 ? (1 - d / 0.022) ** 2 : 0; }) };
    });
    const labios = lista((_i, x, y, z) => (Math.abs(x) < boca.ancho * 1.4 && Math.abs(y - boca.labioY) < 0.014 && z > boca.zFrente - 0.012
      ? (1 - ss(boca.ancho * 0.9, boca.ancho * 1.4, Math.abs(x))) * (1 - ss(0.008, 0.014, Math.abs(y - boca.labioY))) : 0));
    const cejaDe = (o: { c: THREE.Vector3; r: number }, x: number, y: number, z: number) => {
      const { c, r } = o;
      if (z < c.z - r * 0.2) return 0;
      const e = ((x - c.x) / (r * 2.2)) ** 2 + ((y - cejaY(o)) / (r * 1.1)) ** 2;
      return e < 1 ? (1 - e) ** 0.7 : 0;
    };
    const adentroDe = (c: THREE.Vector3, r: number, x: number) => 1 - ss(Math.abs(c.x) - r * 1.2, Math.abs(c.x) + r * 0.8, Math.abs(x));
    const cejas = ojos.map((o) => {
      const l = lista((_i, x, y, z) => cejaDe(o, x, y, z));
      return { ...l, adentro: Float32Array.from(l.i, (i) => adentroDe(o.c, o.r, O[i * 3])) };
    });
    let cejasMalla = null;
    if (this.cejasMalla) {
      const P = this.cejasMalla.pos, m = P.length / 3, w = new Float32Array(m), adentro = new Float32Array(m), lado = new Int8Array(m);
      for (let i = 0; i < m; i++) {
        const k = P[i * 3] >= 0 ? 0 : 1, o = ojos[k];
        // la ceja entera, pareja (con pesos distintos los pelos se despegaban a pedazos)
        lado[i] = k; w[i] = 1; adentro[i] = adentroDe(o.c, o.r, P[i * 3]);
      }
      // cada pelo sigue a los 4 puntos de piel más cercanos (con pesos propios los pelos
      // quedaban flotando como granos): la ceja, a la piel de la ceja (el párpado no
      // llega); las pestañas, a la del párpado (al cerrar el ojo bajan con él)
      const candCeja = [...new Set(cejas.flatMap((x) => [...x.i]))];
      const candPestana = parpados.map((x) => [...x.i]);
      const cerca = new Int32Array(m * 4).fill(-1);
      for (let i = 0; i < m; i++) {
        const mej: [number, number][] = [];
        for (const j of pestana[i] ? candPestana[lado[i]] : candCeja) {
          const d = (O[j * 3] - P[i * 3]) ** 2 + (O[j * 3 + 1] - P[i * 3 + 1]) ** 2 + (O[j * 3 + 2] - P[i * 3 + 2]) ** 2;
          if (mej.length < 4 || d < mej[3][0]) { mej.push([d, j]); mej.sort((a, b) => a[0] - b[0]); if (mej.length > 4) mej.pop(); }
        }
        mej.forEach(([, j], q) => { cerca[i * 4 + q] = j; });
      }
      cejasMalla = { w, adentro, lado, cerca };
    }
    return (this.rasgos = { parpados, mandibula, comisuras, labios, cejas, cejasMalla });
  }
  /** Los gestos de la cara: corre la piel (párpados, mandíbula, comisuras, cejas)
   *  y gira los ojos. Todo en reposo: sirve en cualquier pose y definición. */
  ponerCara(c0: Cara | undefined): void {
    if (!this.tieneCara()) { this.datos.cara = undefined; return; }
    const c = { ...CARA_NEUTRA, ...(caraValida(c0) ?? {}) }, R = this.prepararRasgos(), O = this.original;
    const nuevo = new Map<number, [number, number, number]>();
    const sumar = (i: number, x: number, y: number, z: number) => { const d = nuevo.get(i); if (d) { d[0] += x; d[1] += y; d[2] += z; } else nuevo.set(i, [x, y, z]); };
    // PÁRPADOS: la piel alrededor del ojo gira sobre el centro del globo (como un
    // párpado de verdad, que se desliza sobre el ojo); el de arriba baja hasta un
    // poco debajo del medio, el de abajo sube un cuarto
    const ALFA_CIERRE = -0.12;
    R.parpados.forEach((P, k) => {
      const cierre = k === 0 ? c.ojoI : c.ojoD;
      if (!cierre) return;
      for (let q = 0; q < P.i.length; q++) {
        const i = P.i[q], vy = O[i * 3 + 1] - P.c.y, vz = O[i * 3 + 2] - P.c.z, a = Math.atan2(vy, vz);
        const arribaW = 1 - Math.max(0, Math.min(1, (a - 0.9) / 0.5));
        let th: number;
        // (la rotación de abajo resta el ángulo: th positivo baja el párpado de arriba)
        if (cierre >= 0) th = a > ALFA_CIERRE ? (a - ALFA_CIERRE) * cierre * P.w[q] * arribaW : -(ALFA_CIERRE - a) * cierre * P.w[q] * 0.25;
        else th = a > ALFA_CIERRE ? cierre * 0.3 * P.w[q] * arribaW : -cierre * 0.1 * P.w[q];
        // por AFUERA del globo: hay piel del párpado a menos que el radio del ojo y,
        // girada adentro, el globo la tapaba (medido: «dormido» no cerraba nada)
        const d = Math.hypot(vy, vz, O[i * 3] - P.c.x), afuera = Math.max(1, (P.r * 1.12) / Math.max(1e-6, d));
        const s = 1 + (afuera - 1 + 0.03) * Math.max(0, cierre) * P.w[q] * (a > ALFA_CIERRE ? 1 : 0.5), co = Math.cos(th), si = Math.sin(th);
        sumar(i, 0, (vy * co - vz * si) * s - vy, (vy * si + vz * co) * s - vz);
      }
    });
    // MANDÍBULA: lo de abajo de la boca gira hacia abajo desde cerca de las orejas
    if (c.boca) {
      const M = R.mandibula, th = c.boca * 0.38;
      for (let q = 0; q < M.i.length; q++) {
        const i = M.i[q], t = th * M.w[q], vy = O[i * 3 + 1] - M.piv.y, vz = O[i * 3 + 2] - M.piv.z, co = Math.cos(t), si = Math.sin(t);
        sumar(i, 0, vy * co - vz * si - vy, vy * si + vz * co - vz);
      }
    }
    // COMISURAS: sonrisa (arriba y afuera) o tristeza (abajo); el ancho las estira o las junta
    for (const K of R.comisuras) for (let q = 0; q < K.i.length; q++) {
      const w = K.w[q];
      sumar(K.i[q], K.s * (0.0015 * Math.abs(c.sonrisa) + 0.004 * Math.max(0, c.ancho)) * w, 0.0045 * c.sonrisa * w, -0.0015 * Math.abs(c.sonrisa) * w);
    }
    if (c.ancho < 0) for (let q = 0; q < R.labios.i.length; q++) {
      const i = R.labios.i[q], w = R.labios.w[q] * -c.ancho;
      sumar(i, -O[i * 3] * 0.35 * w, 0, 0.004 * w);
    }
    // CEJAS: suben o bajan; fruncir baja y junta la parte de adentro
    for (const C of R.cejas) for (let q = 0; q < C.i.length; q++) {
      const i = C.i[q], w = C.w[q], ad = C.adentro[q];
      sumar(i, -Math.sign(O[i * 3]) * 0.003 * c.fruncir * w * ad, (0.0075 * c.cejas - 0.005 * c.fruncir * ad) * w, 0);
    }
    // aplicar la diferencia con lo que había
    const attr = this.cuerpo.geometry.attributes.position as THREE.BufferAttribute, arr = attr.array as Float32Array;
    const tocados = new Set<number>([...this.caraCapa.keys(), ...nuevo.keys()]);
    for (const i of tocados) {
      const a = this.caraCapa.get(i) ?? [0, 0, 0], b = nuevo.get(i) ?? [0, 0, 0];
      arr[i * 3] += b[0] - a[0]; arr[i * 3 + 1] += b[1] - a[1]; arr[i * 3 + 2] += b[2] - a[2];
    }
    this.caraCapa = nuevo; this.baseCache = null;
    attr.needsUpdate = true; this.versionPiel++;
    this.preparar();
    this.normalesLocales(new Set([...tocados].map((i) => this.soldado![i])));
    // los OJOS miran (giran sobre su centro) y las CEJAS (su malla) siguen a la piel
    const ojos = this.ojos!, P = ojos.malla.geometry.attributes.position as THREE.BufferAttribute, Nn = ojos.malla.geometry.attributes.normal as THREE.BufferAttribute;
    const giro = new THREE.Quaternion().setFromEuler(new THREE.Euler(-c.miraY * 0.35, c.miraX * 0.45, 0, 'YXZ'));
    const v = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      const o = ojos.centros[ojos.pos[i * 3] >= 0 ? 0 : 1];
      v.set(ojos.pos[i * 3], ojos.pos[i * 3 + 1], ojos.pos[i * 3 + 2]).sub(o.c).applyQuaternion(giro).add(o.c);
      P.setXYZ(i, v.x, v.y, v.z);
      v.set(ojos.nrm[i * 3], ojos.nrm[i * 3 + 1], ojos.nrm[i * 3 + 2]).applyQuaternion(giro);
      Nn.setXYZ(i, v.x, v.y, v.z);
    }
    P.needsUpdate = true; Nn.needsUpdate = true;
    if (this.cejasMalla && R.cejasMalla) {
      const B = this.cejasMalla.malla.geometry.attributes.position as THREE.BufferAttribute, b0 = this.cejasMalla.pos, cm = R.cejasMalla;
      for (let i = 0; i < B.count; i++) {
        let dx = 0, dy = 0, dz = 0, k = 0;
        for (let q = 0; q < 4; q++) { const j = cm.cerca[i * 4 + q]; if (j < 0) continue; const d = nuevo.get(j); k++; if (d) { dx += d[0]; dy += d[1]; dz += d[2]; } }
        k = Math.max(1, k);
        B.setXYZ(i, b0[i * 3] + dx / k, b0[i * 3 + 1] + dy / k, b0[i * 3 + 2] + dz / k);
      }
      B.needsUpdate = true;
    }
    for (const m of this.mallas) {
      (m as unknown as { boundingBox: THREE.Box3 | null }).boundingBox = null;
      (m as unknown as { boundingSphere: THREE.Sphere | null }).boundingSphere = null;
    }
    this.mundoCache = null; this.rejilla = null;
    this.datos.cara = caraValida(c);
    if (this.datos.piezas) this.rehacerPiezas();
  }
  liberar(): void {
    for (const m of this.mallas) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  }
}
