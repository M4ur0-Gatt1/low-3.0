/* ══ EL MANIQUÍ DEL TALLER DE PERSONAJE ══════════════════════════════════════
   Mauro: «un módulo de diseño de personaje con todas las herramientas al mejor
   estilo Grease Pencil… quiero también tener una biblioteca de maniquíes
   distintos que también sirva para el módulo 3D de composición de fondos».
   Sin IA: el personaje se arma sobre un maniquí y se GIRA de verdad.

   Lo que se tomó de cómo se hace (investigado):
   - la hoja de modelo clásica: frente y perfil anclan (ancho y profundidad) y
     unas LÍNEAS HORIZONTALES (coronilla, ojos, mentón, hombros, cintura,
     cadera, rodillas) mantienen las alturas iguales en todas las vistas;
   - los maniquíes de dibujo (Clip Studio y similares): altura y proporción en
     CABEZAS con deslizadores, cuerpos de volúmenes simples;
   - Grease Pencil / Feather: se dibuja EN 3D, sobre los volúmenes.

   El maniquí está hecho de VOLÚMENES comunes del estudio (nubes de puntos que
   el estudio cierra en un cuerpo, como las casas de la escenografía): se
   dibuja encima con la regla de Feather, se guarda en la biblioteca y se
   coloca en la composición de fondos como cualquier elemento. Cada parte
   cuelga de su ARTICULACIÓN (`position`): los puntos son relativos a ella, así
   después se puede girar un brazo desde el hombro.

   Este módulo es sólo DATOS (sin three). Unidades: metros; el piso es y = 0 y
   el personaje mira hacia +Z (hacia la cámara de la vista Frente). */
import type { ItemProyecto } from './webgl-design3d';

/** Las proporciones. Las medidas de ancho van en CABEZAS (alto de la cabeza),
 *  como se mide un personaje en una hoja de modelo. */
export interface Maniqui {
  /** alto total en cabezas: 2,5 chibi · 4 niño · 5 cartoon · 7,5 realista · 8,5 heroico */
  cabezas: number;
  /** alto total en metros (para la escala en la composición de fondos) */
  alto: number;
  /** ancho de hombros, en cabezas */
  hombros: number;
  /** ancho de cadera, en cabezas */
  cadera: number;
  /** largo de los brazos (1 = el de siempre) */
  brazos: number;
  /** largo de las piernas (1 = el de siempre) */
  piernas: number;
  /** de delgado (0,7) a robusto (1,4) */
  grosor: number;
  /** ancho de la cabeza / su alto (0,75 realista, 0,9 chibi) */
  cabezaAncho: number;
  /** color del maniquí */
  color: string;
}

export interface ManiquiDeFabrica { id: string; nombre: string; descripcion: string; m: Maniqui }
const GRIS = '#cdc7bc';
export const MANIQUIES: ManiquiDeFabrica[] = [
  { id: 'chibi', nombre: 'Chibi', descripcion: 'Dos cabezas y media: cabezón y cuerpo chico',
    m: { cabezas: 2.5, alto: 0.95, hombros: 1.15, cadera: 1.05, brazos: 0.9, piernas: 0.8, grosor: 1.15, cabezaAncho: 0.92, color: GRIS } },
  { id: 'nino', nombre: 'Niño', descripcion: 'Cuatro cabezas',
    m: { cabezas: 4, alto: 1.15, hombros: 1.45, cadera: 1.3, brazos: 1, piernas: 0.9, grosor: 1, cabezaAncho: 0.85, color: GRIS } },
  { id: 'cartoon', nombre: 'Cartoon', descripcion: 'Cinco cabezas, el clásico de la animación',
    m: { cabezas: 5, alto: 1.5, hombros: 1.75, cadera: 1.45, brazos: 1, piernas: 0.95, grosor: 1.05, cabezaAncho: 0.82, color: GRIS } },
  { id: 'realista', nombre: 'Realista', descripcion: 'Siete cabezas y media',
    m: { cabezas: 7.5, alto: 1.74, hombros: 2, cadera: 1.55, brazos: 1, piernas: 1, grosor: 1, cabezaAncho: 0.75, color: GRIS } },
  { id: 'mujer', nombre: 'Realista (mujer)', descripcion: 'Siete cabezas y media, hombros más angostos y cadera más ancha',
    m: { cabezas: 7.5, alto: 1.65, hombros: 1.7, cadera: 1.75, brazos: 0.97, piernas: 1.02, grosor: 0.92, cabezaAncho: 0.74, color: GRIS } },
  { id: 'heroico', nombre: 'Heroico', descripcion: 'Ocho cabezas y media, espalda ancha',
    m: { cabezas: 8.5, alto: 1.9, hombros: 2.45, cadera: 1.6, brazos: 1.02, piernas: 1.04, grosor: 1.15, cabezaAncho: 0.74, color: GRIS } },
  { id: 'estilizado', nombre: 'Estilizado', descripcion: 'Nueve cabezas, piernas largas (moda)',
    m: { cabezas: 9, alto: 1.8, hombros: 1.8, cadera: 1.5, brazos: 1.03, piernas: 1.12, grosor: 0.82, cabezaAncho: 0.74, color: GRIS } },
];

const lim = (v: unknown, d: number, a: number, b: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
/** Datos de afuera (un archivo, la biblioteca) a proporciones válidas. */
export function maniquiValido(x: unknown): Maniqui {
  const o = (x && typeof x === 'object' ? x : {}) as Partial<Maniqui>;
  const d = MANIQUIES[3].m;
  return {
    cabezas: lim(o.cabezas, d.cabezas, 1.5, 12), alto: lim(o.alto, d.alto, 0.1, 30),
    hombros: lim(o.hombros, d.hombros, 0.6, 4), cadera: lim(o.cadera, d.cadera, 0.6, 4),
    brazos: lim(o.brazos, 1, 0.5, 1.8), piernas: lim(o.piernas, 1, 0.4, 1.8), grosor: lim(o.grosor, 1, 0.5, 2),
    cabezaAncho: lim(o.cabezaAncho, d.cabezaAncho, 0.5, 1.3),
    color: typeof o.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : GRIS,
  };
}

type V3 = [number, number, number];
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** Puntos sobre un elipsoide (Fibonacci), relativos a su centro. */
function elipsoide(rx: number, ry: number, rz: number, n = 120): V3[] {   // con 120 puntos el cuerpo se lee redondo (las aristas a más de 18° casi no aparecen)
  const out: V3[] = [], oro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * oro;
    out.push([Math.cos(a) * r * rx, y * ry, Math.sin(a) * r * rz]);
  }
  return out;
}
/** Una cápsula de `a` a `b` (relativos a la articulación) con radio r. */
function capsula(a: V3, b: V3, r: number, r2 = r): V3[] {
  const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const largo = Math.hypot(ax[0], ax[1], ax[2]) || 1e-6;
  const e = ax.map((v) => v / largo) as V3;
  // dos vectores perpendiculares al eje
  const ref: V3 = Math.abs(e[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u: V3 = [e[1] * ref[2] - e[2] * ref[1], e[2] * ref[0] - e[0] * ref[2], e[0] * ref[1] - e[1] * ref[0]];
  const nu = Math.hypot(...u); u[0] /= nu; u[1] /= nu; u[2] /= nu;
  const v: V3 = [e[1] * u[2] - e[2] * u[1], e[2] * u[0] - e[0] * u[2], e[0] * u[1] - e[1] * u[0]];
  const out: V3[] = [];
  const LADOS = 16;
  const anillo = (c: V3, rad: number) => {
    for (let k = 0; k < LADOS; k++) {
      const t = (k / LADOS) * Math.PI * 2, cs = Math.cos(t) * rad, sn = Math.sin(t) * rad;
      out.push([c[0] + u[0] * cs + v[0] * sn, c[1] + u[1] * cs + v[1] * sn, c[2] + u[2] * cs + v[2] * sn]);
    }
  };
  // las tapas redondas: anillos que se cierran hacia cada punta
  for (const [c, dir, rad] of [[a, -1, r], [b, 1, r2]] as [V3, number, number][]) {
    for (const f of [0.4, 0.7, 0.92]) {
      const off = Math.sqrt(1 - f * f) * rad * dir;
      anillo([c[0] + e[0] * off, c[1] + e[1] * off, c[2] + e[2] * off], rad * f);
    }
    out.push([c[0] + e[0] * rad * dir, c[1] + e[1] * rad * dir, c[2] + e[2] * rad * dir]);
  }
  // el cuerpo
  for (const t of [0, 0.25, 0.5, 0.75, 1]) anillo([a[0] + ax[0] * t, a[1] + ax[1] * t, a[2] + ax[2] * t], r + (r2 - r) * t);
  return out;
}

/** Una parte del maniquí: su articulación (en el mundo, con el piso en 0) y su
 *  forma (puntos relativos a la articulación). */
export interface ParteManiqui { id: string; nombre: string; articulacion: V3; puntos: V3[] }
/** Las líneas de la hoja de modelo, de arriba abajo. */
export interface LineaModelo { id: string; nombre: string; y: number }

/** Las medidas de un maniquí: dónde cae cada cosa. */
function medidas(m0: Maniqui) {
  const m = maniquiValido(m0);
  const H = m.alto / m.cabezas;                  // el alto de la cabeza
  const menton = m.alto - H;
  const B = Math.max(1e-3, menton);              // el cuerpo, del mentón al piso
  const hombroY = menton - 0.05 * B - H * 0.06;
  const piernasLargo = Math.max(0.3, Math.min(0.66, 0.53 * m.piernas)) * B;
  const entrepierna = piernasLargo;
  const torso = Math.max(0.05, hombroY - entrepierna);
  const cintura = entrepierna + torso * 0.42;
  const tobillo = Math.max(H * 0.1, piernasLargo * 0.06);
  const rodilla = tobillo + (entrepierna - tobillo) * 0.48;
  return { m, H, menton, B, hombroY, entrepierna, torso, cintura, tobillo, rodilla };
}

export function lineasDeModelo(m0: Maniqui): LineaModelo[] {
  const { m, H, menton, hombroY, entrepierna, cintura, rodilla, tobillo } = medidas(m0);
  return [
    { id: 'coronilla', nombre: 'Coronilla', y: m.alto },
    { id: 'ojos', nombre: 'Ojos', y: m.alto - H * 0.5 },
    { id: 'menton', nombre: 'Mentón', y: menton },
    { id: 'hombros', nombre: 'Hombros', y: hombroY },
    { id: 'cintura', nombre: 'Cintura', y: cintura },
    { id: 'cadera', nombre: 'Entrepierna', y: entrepierna },
    { id: 'rodillas', nombre: 'Rodillas', y: rodilla },
    { id: 'tobillos', nombre: 'Tobillos', y: tobillo },
    { id: 'piso', nombre: 'Piso', y: 0 },
  ].map((l) => ({ ...l, y: r3(l.y) }));
}

/** Las partes del maniquí, en pose A (brazos un poco abiertos, como en una hoja de modelo). */
export function partesDeManiqui(m0: Maniqui): ParteManiqui[] {
  const { m, H, menton, B, hombroY, entrepierna, torso, cintura, tobillo, rodilla } = medidas(m0);
  const g = m.grosor;
  const partes: ParteManiqui[] = [];
  const parte = (id: string, nombre: string, art: V3, puntos: V3[]) =>
    partes.push({ id, nombre, articulacion: art.map(r3) as V3, puntos: puntos.map((p) => p.map(r3) as V3) });
  // cabeza (la articulación es la base del cráneo, para girarla después desde ahí)
  const cabezaC = m.alto - H / 2;
  parte('cabeza', 'Cabeza', [0, menton + H * 0.08, 0], elipsoide(H * m.cabezaAncho / 2, H / 2, H * 0.44 * Math.sqrt(m.cabezaAncho / 0.75))
    .map(([x, y, z]) => [x, y + cabezaC - (menton + H * 0.08), z] as V3));
  // cuello
  const cuelloR = H * 0.13 * g * (m.cabezas < 4 ? 1.2 : 1);
  parte('cuello', 'Cuello', [0, hombroY, 0], capsula([0, 0, -H * 0.03], [0, menton + H * 0.12 - hombroY, -H * 0.03], cuelloR));
  // pecho (tórax), cintura y pelvis
  const hombroAncho = m.hombros * H;
  const pechoRx = hombroAncho / 2 * 0.8, pechoRy = torso * 0.33, pechoRz = H * 0.44 * g;
  const pechoY = hombroY - pechoRy * 0.75;
  parte('pecho', 'Pecho', [0, pechoY, 0], elipsoide(pechoRx, pechoRy, pechoRz));
  const pelvisRx = m.cadera * H / 2 * 0.88, pelvisRy = torso * 0.2, pelvisRz = H * 0.4 * g;
  const pelvisY = entrepierna + pelvisRy * 0.8;
  parte('pelvis', 'Pelvis', [0, pelvisY, 0], elipsoide(pelvisRx, pelvisRy, pelvisRz));
  const cinturaR = Math.min(pechoRx, pelvisRx) * 0.78;
  parte('cintura', 'Cintura', [0, cintura, 0], capsula([0, pelvisY - cintura, 0], [0, pechoY - cintura, 0], cinturaR * 0.95, cinturaR));
  // brazos (pose A: 12° hacia afuera)
  const brazoR = H * 0.15 * g, anteR = H * 0.12 * g;
  const sup = 0.23 * B * m.brazos, ante = 0.19 * B * m.brazos, mano = 0.11 * B * m.brazos;
  const ap = 12 * Math.PI / 180;
  for (const [lado, nombre] of [[1, 'izquierdo'], [-1, 'derecho']] as [number, string][]) {
    const d: V3 = [Math.sin(ap) * lado, -Math.cos(ap), 0];
    const hombro: V3 = [lado * (hombroAncho / 2 - brazoR * 0.6), hombroY - brazoR * 0.35, 0];
    const codo: V3 = [hombro[0] + d[0] * sup, hombro[1] + d[1] * sup, 0];
    const muneca: V3 = [codo[0] + d[0] * ante, codo[1] + d[1] * ante, 0];
    const s = lado > 0 ? 'izq' : 'der';
    parte('brazo-' + s, 'Brazo ' + nombre, hombro, capsula([0, 0, 0], [d[0] * sup, d[1] * sup, 0], brazoR, anteR * 1.1));
    parte('antebrazo-' + s, 'Antebrazo ' + nombre, codo, capsula([0, 0, 0], [d[0] * ante, d[1] * ante, 0], anteR, anteR * 0.8));
    parte('mano-' + s, 'Mano ' + nombre, muneca, elipsoide(H * 0.085 * g, mano / 2, H * 0.05 * g)
      .map(([x, y, z]) => [x + d[0] * mano / 2, y + d[1] * mano / 2, z] as V3));
  }
  // piernas
  const musloR = H * 0.2 * g, pantR = H * 0.14 * g;
  for (const [lado, nombre] of [[1, 'izquierda'], [-1, 'derecha']] as [number, string][]) {
    const x = lado * m.cadera * H * 0.22, s = lado > 0 ? 'izq' : 'der';
    const cadera: V3 = [x, entrepierna + musloR * 0.35, 0];
    parte('muslo-' + s, 'Muslo ' + nombre.replace('a', 'o'), cadera, capsula([0, 0, 0], [0, rodilla - cadera[1], 0], musloR, pantR * 1.05));
    parte('pierna-' + s, 'Pierna ' + nombre, [x, rodilla, 0], capsula([0, 0, 0], [0, tobillo - rodilla, 0], pantR, pantR * 0.7));
    const pieLargo = H * 0.95 * Math.min(1.1, Math.max(0.7, m.cabezas / 7.5) ** 0.3);
    parte('pie-' + s, 'Pie ' + nombre.replace('a', 'o'), [x, tobillo, 0], elipsoide(H * 0.15 * g, tobillo * 0.55, pieLargo / 2)
      .map(([px, py, pz]) => [px, py - tobillo * 0.45, pz + pieLargo * 0.3] as V3));
  }
  return partes;
}

/** El maniquí como objetos del estudio (volúmenes), listo para colocar. */
export function itemsDeManiqui(m0: Maniqui): ItemProyecto[] {
  const m = maniquiValido(m0);
  return partesDeManiqui(m).map((p) => ({
    id: '', layerId: '', baseOpacity: 1, position: p.articulacion, quaternion: [0, 0, 0, 1], scale: [1, 1, 1],
    points: p.puntos, pressures: p.puntos.map(() => 1),
    brush: { color: m.color, size: 2, opacity: 1, hardness: 1, pressureSensitivity: 0, stabilization: 0 },
    solid: true, parte: p.id, maniqui: true,
  } as ItemProyecto));
}

/** El tamaño del maniquí (ancho, alto, fondo), para la biblioteca. */
export function tamDeManiqui(m0: Maniqui): [number, number, number] {
  const m = maniquiValido(m0), H = m.alto / m.cabezas;
  return [r3(Math.max(m.hombros, m.cadera) * H * 1.35), r3(m.alto), r3(H * 1.3)];
}
