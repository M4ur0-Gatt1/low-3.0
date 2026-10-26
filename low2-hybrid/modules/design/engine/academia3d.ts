import * as THREE from 'three';
import type { Personaje3D } from './personaje3d';

/* ══════════════════════════════════════════════════════════════════════════
   ESTUDIO DE ANATOMÍA: EL TALLER COMO UNA SALA DE DIBUJO DE ACADEMIA (3.54)

   Pedido de Mauro: «mejorar los modelos humanoides para que sean más
   anatómicos, estilo arte clásico, anatomía humana para artistas, algo más
   profesional». Lo que tiene una sala de dibujo del natural, sobre el cuerpo
   del Taller:

     · YESO: el cuerpo como un vaciado de academia, blanco mate, para estudiar
       luz y forma sin la distracción del color.
     · LUCES DE ACADEMIA: Rembrandt, lateral, contraluz, ventana, cenital.
       Reemplazan a las del estudio mientras están puestas.
     · CANON EN CABEZAS: una regla al costado, medida en el cuerpo (la cabeza
       va del mentón a la coronilla), con las divisiones y las referencias
       clásicas del canon de 8 (mentón, pezones, ombligo, pubis…).
     · ESQUELETO: los huesos del armazón, a la vista a través de la piel.
     · PLANOS DE LA CABEZA: la construcción de Loomis (la esfera del cráneo,
       los cortes laterales, la línea media y las tercias de la cara), pegada al
       hueso de la cabeza: sigue la pose.
     · MAPA DE MÚSCULOS: los grandes grupos musculares en color, como en una
       lámina de anatomía, con su leyenda. Se reparten por zonas del cuerpo
       (hueso, lado y altura): es una guía de dónde está cada grupo, no un
       écorché disecado.
     · POSES CLÁSICAS: recetas legibles (contrapposto, torsión…) escritas con
       las mismas herramientas de Posar, en ejes del mundo.

   En reposo el cuerpo mira hacia +z, su izquierda es +x y arriba es +y.
   ══════════════════════════════════════════════════════════════════════════ */

export type LuzAcademia = 'estudio' | 'rembrandt' | 'lateral' | 'contraluz' | 'ventana' | 'cenital';
export const LUCES_ACADEMIA: { id: LuzAcademia; nombre: string; ayuda: string }[] = [
  { id: 'estudio', nombre: 'Estudio', ayuda: 'Las luces de siempre del estudio' },
  { id: 'rembrandt', nombre: 'Rembrandt', ayuda: 'Luz principal alta a 45°, poco relleno: el triángulo de luz en la mejilla de la sombra' },
  { id: 'lateral', nombre: 'Lateral', ayuda: 'Una sola luz a 90°: la mitad en luz y la mitad en sombra, el terminador bien marcado' },
  { id: 'contraluz', nombre: 'Contraluz', ayuda: 'Luz desde atrás: el contorno se enciende y la forma queda en sombra' },
  { id: 'ventana', nombre: 'Ventana', ayuda: 'Luz amplia y suave de un costado, como el taller con ventanal al norte' },
  { id: 'cenital', nombre: 'Cenital', ayuda: 'Luz desde arriba: marca los planos superiores, las cuencas y la caja torácica' },
];

/** Los grupos musculares del mapa: [id, nombre, color de lámina] */
export const GRUPOS_MUSCULARES: { id: string; nombre: string; color: string }[] = [
  { id: 'trapecio', nombre: 'Trapecio', color: '#b5654a' },
  { id: 'esternocleido', nombre: 'Esternocleidomastoideo', color: '#d98a6c' },
  { id: 'deltoides', nombre: 'Deltoides', color: '#e07a4f' },
  { id: 'pectoral', nombre: 'Pectoral mayor', color: '#a8323a' },
  { id: 'dorsal', nombre: 'Dorsal ancho', color: '#8f4a5c' },
  { id: 'recto', nombre: 'Recto abdominal', color: '#d9a066' },
  { id: 'oblicuo', nombre: 'Oblicuo externo', color: '#c27c4e' },
  { id: 'erector', nombre: 'Erectores de la columna', color: '#9c6a4a' },
  { id: 'gluteo', nombre: 'Glúteos', color: '#7d3c4f' },
  { id: 'biceps', nombre: 'Bíceps', color: '#d4583c' },
  { id: 'triceps', nombre: 'Tríceps', color: '#7e3530' },
  { id: 'flexores', nombre: 'Flexores del antebrazo', color: '#efb08a' },
  { id: 'extensores', nombre: 'Extensores del antebrazo', color: '#a85a44' },
  { id: 'cuadriceps', nombre: 'Cuádriceps', color: '#c8402e' },
  { id: 'isquios', nombre: 'Isquiotibiales', color: '#6f2a36' },
  { id: 'aductores', nombre: 'Aductores', color: '#eab08f' },
  { id: 'gemelos', nombre: 'Gemelos', color: '#9a3f3a' },
  { id: 'tibial', nombre: 'Tibial anterior', color: '#f2c09a' },
];
const PIEL_MAPA = new THREE.Color('#e9dfd3');   // lo que no es músculo (cabeza, manos, pies, tendones)

/** Las referencias del canon de 8 cabezas, contando desde la coronilla. */
const CANON_8 = ['mentón', 'pezones', 'ombligo', 'pubis', 'medio muslo', 'bajo la rodilla', 'media pierna', 'planta'];

/** Los cuerpos clásicos: el cuerpo del taller llevado a un canon con las mismas
 *  herramientas del panel (el dial «Cabeza» hasta medir esas cabezas, y la
 *  contextura). Los de fábrica (Quaternius) miden 10,7 cabezas: una cabeza chica,
 *  de cómic de superhéroes, y un físico de culturista; medido en el banco de poses. */
export const CUERPOS_CLASICOS: { id: string; nombre: string; ayuda: string; cabezas: number; peso: number; musculo: number }[] = [
  { id: 'heroico', nombre: 'Heroico · 8 cabezas', ayuda: 'El canon de Lisipo y de la academia para la figura ideal: 8 cabezas, atlético', cabezas: 8, peso: 0, musculo: -0.2 },
  { id: 'academico', nombre: 'Académico · 7½', ayuda: 'El promedio que se dibuja del natural en la academia: 7½ cabezas, musculatura moderada', cabezas: 7.5, peso: 0.05, musculo: -0.35 },
  { id: 'policleto', nombre: 'Policleto · 7', ayuda: 'El canon del Doríforo: 7 cabezas, sólido y compacto', cabezas: 7, peso: 0.15, musculo: -0.4 },
];

export const POSES_CLASICAS: { id: string; nombre: string; ayuda: string }[] = [
  { id: 'anatomica', nombre: 'Posición anatómica', ayuda: 'De pie, brazos al costado: la referencia de las láminas' },
  { id: 'contrapposto', nombre: 'Contrapposto', ayuda: 'El peso en una pierna: la cadera sube de ese lado y los hombros bajan (el Doríforo)' },
  { id: 'mano-cadera', nombre: 'Apoyo, mano en la cadera', ayuda: 'Contrapposto con la mano en la cadera: el triángulo del brazo' },
  { id: 'torsion', nombre: 'Torsión (alcanzar)', ayuda: 'Cadera, torso y cabeza giran en sentidos opuestos mientras un brazo alcanza (figura serpentinata)' },
  { id: 'brazos-arriba', nombre: 'Brazos arriba', ayuda: 'Para estudiar el hombro, el dorsal y la caja torácica estirados' },
];

const ss = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Texto como sprite (para la regla del canon y los rótulos). */
function rotulo(texto: string, alto: number, color = '#f0450e'): THREE.Sprite {
  const c = document.createElement('canvas'), g = c.getContext('2d')!, fuente = 44;
  g.font = `600 ${fuente}px system-ui, sans-serif`;
  c.width = Math.ceil(g.measureText(texto).width) + 16; c.height = fuente + 16;
  g.font = `600 ${fuente}px system-ui, sans-serif`;
  g.fillStyle = 'rgba(20,21,24,0.72)'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(texto, 8, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(alto * c.width / c.height, alto, 1); s.renderOrder = 1001;
  return s;
}
function lineas(puntos: THREE.Vector3[], color: number, opts: { opac?: number; frente?: boolean; rayas?: boolean } = {}): THREE.LineSegments {
  const g = new THREE.BufferGeometry().setFromPoints(puntos);
  const mat = opts.rayas ? new THREE.LineDashedMaterial({ color, dashSize: 0.02, gapSize: 0.014, transparent: true, opacity: opts.opac ?? 1, depthTest: !!opts.frente })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: opts.opac ?? 1, depthTest: !!opts.frente });
  const l = new THREE.LineSegments(g, mat);
  if (opts.rayas) l.computeLineDistances();
  l.renderOrder = opts.frente ? 2 : 1000;
  return l;
}
function soltar(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mt of mats) { (mt as THREE.SpriteMaterial).map?.dispose(); mt.dispose(); }
  });
}

interface MatGuardado { color: THREE.Color; map: THREE.Texture | null; roughness: number; metalness: number; vertexColors: boolean }

export class Academia3D {
  readonly opciones = { yeso: false, luz: 'estudio' as LuzAcademia, canon: false, esqueleto: false, planos: false, musculos: false };
  private inst: Personaje3D | null = null;
  private guardados = new Map<THREE.MeshStandardMaterial, MatGuardado>();
  private lucesEstudio: { luz: THREE.Light; intensidad: number }[] = [];
  private readonly lucesPropias = new THREE.Group();
  private readonly regla = new THREE.Group();
  private esqueleto: THREE.SkeletonHelper | null = null;
  private planos: THREE.Group | null = null;
  private colores: { geo: THREE.BufferGeometry; n: number } | null = null;
  private pendiente = 0;
  /** cabezas que mide el cuerpo de pie (para el panel y las pruebas) */
  cabezas: number | null = null;
  medida: { alto: number; cabeza: number } | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly personaje: () => Personaje3D | null) {
    this.lucesPropias.name = 'academia:luces'; this.regla.name = 'academia:canon';
    scene.add(this.lucesPropias, this.regla);
    window.addEventListener('low3d:taller', () => this.seguir());
  }

  /** Cambia una opción y la aplica. */
  poner(o: Partial<Academia3D['opciones']>): void {
    Object.assign(this.opciones, o);
    this.seguir(true);
    window.dispatchEvent(new Event('low3d:academia'));
  }

  /** El taller cambió (pose, cuerpo, deshacer, salir): todo vuelve a quedar en su lugar. */
  seguir(forzar = false): void {
    const inst = this.personaje();
    if (inst !== this.inst) { this.quitarDelCuerpo(); this.inst = inst; forzar = true; }
    if (!inst) { this.ponerLuces('estudio'); this.limpiarRegla(); return; }
    if (forzar) {
      this.ponerMateriales();
      this.ponerLuces(this.opciones.luz);
      this.ponerEsqueleto();
      this.ponerPlanos();
    } else if (this.opciones.musculos && this.colores && this.colores.n !== inst.cuerpo.geometry.attributes.position.count) this.ponerMateriales();
    // la regla se mide con el cuerpo posado: una vez por cuadro como mucho
    if (!this.pendiente) this.pendiente = requestAnimationFrame(() => { this.pendiente = 0; this.medirCanon(); });
  }

  /* ── YESO Y MAPA DE MÚSCULOS: los materiales del cuerpo ─────────────────── */
  private materiales(inst: Personaje3D): THREE.MeshStandardMaterial[] {
    return [...new Set(inst.mallas.map((m) => m.material as THREE.MeshStandardMaterial).filter((m) => m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial))];
  }
  private ponerMateriales(): void {
    const inst = this.inst; if (!inst) return;
    const { yeso, musculos } = this.opciones;
    const piel = inst.cuerpo.material as THREE.MeshStandardMaterial;
    for (const mat of this.materiales(inst)) {
      const g = this.guardados.get(mat);
      const cambia = yeso || (musculos && mat === piel);
      if (!cambia) { if (g) this.restaurar(mat); continue; }
      if (!g) this.guardados.set(mat, { color: mat.color.clone(), map: mat.map, roughness: mat.roughness, metalness: mat.metalness, vertexColors: mat.vertexColors });
      mat.map = null; mat.metalness = 0;
      mat.roughness = 0.9;
      mat.color.set(yeso && !(musculos && mat === piel) ? '#ece6dc' : '#ffffff');
      mat.vertexColors = musculos && mat === piel;
      mat.needsUpdate = true;
    }
    const geo = inst.cuerpo.geometry;
    if (musculos) {
      if (!this.colores || this.colores.geo !== geo || this.colores.n !== geo.attributes.position.count) {
        geo.setAttribute('color', new THREE.BufferAttribute(this.colorDeMusculos(inst), 3));
        this.colores = { geo, n: geo.attributes.position.count };
      }
    } else if (geo.getAttribute('color')) { geo.deleteAttribute('color'); this.colores = null; }
  }
  private restaurar(mat: THREE.MeshStandardMaterial): void {
    const g = this.guardados.get(mat); if (!g) return;
    mat.color.copy(g.color); mat.map = g.map; mat.roughness = g.roughness; mat.metalness = g.metalness; mat.vertexColors = g.vertexColors;
    mat.needsUpdate = true; this.guardados.delete(mat);
  }
  private quitarDelCuerpo(): void {
    for (const mat of [...this.guardados.keys()]) this.restaurar(mat);
    if (this.colores) { if (this.colores.geo.getAttribute('color')) this.colores.geo.deleteAttribute('color'); this.colores = null; }
    if (this.esqueleto) { this.scene.remove(this.esqueleto); this.esqueleto.dispose(); this.esqueleto = null; }
    if (this.planos) { this.planos.parent?.remove(this.planos); soltar(this.planos); this.planos = null; }
  }

  /** Dónde está cada articulación en la piel en reposo (espacio de la piel). */
  private juntas(inst: Personaje3D): Map<string, THREE.Vector3> {
    const sk = inst.cuerpo.skeleton, out = new Map<string, THREE.Vector3>();
    sk.bones.forEach((b, k) => out.set(b.name, new THREE.Vector3().setFromMatrixPosition(sk.boneInverses[k].clone().invert())));
    return out;
  }
  /** El color de cada punto de la piel según su grupo muscular. Por zonas: el
   *  hueso que más la mueve, de qué lado mira (adelante, atrás, adentro, afuera)
   *  y a qué altura de su segmento está. */
  colorDeMusculos(inst: Personaje3D): Float32Array {
    const g = inst.cuerpo.geometry, n = g.attributes.position.count;
    const O = g.attributes.position.array as ArrayLike<number>, N = g.attributes.normal.array as ArrayLike<number>;
    const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const bones = inst.cuerpo.skeleton.bones, J = this.juntas(inst);
    const col = new Map(GRUPOS_MUSCULARES.map((m) => [m.id, new THREE.Color(m.color)]));
    const out = new Float32Array(n * 3), c = new THREE.Color();
    const t = (a?: THREE.Vector3, b?: THREE.Vector3, y?: number, x?: number, z?: number) => {
      if (!a || !b) return 0.5;
      const ab = b.clone().sub(a), p = new THREE.Vector3(x, y, z).sub(a);
      return Math.max(0, Math.min(1, p.dot(ab) / Math.max(1e-9, ab.lengthSq())));
    };
    const cuello = J.get('neck_01'), cabeza = J.get('Head'), pelvis = J.get('pelvis'), sp3 = J.get('spine_03');
    for (let i = 0; i < n; i++) {
      let mejor = -1, wm = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > wm) { wm = w; mejor = si.getComponent(i, k); } }
      const hueso = (bones[mejor]?.name ?? '').replace(/^giro_/, ''), lado = hueso.slice(-2), r = hueso.replace(/_[lr]$/, '');
      const x = O[i * 3], y = O[i * 3 + 1], z = O[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      const ax = Math.abs(x), afuera = (lado === '_r' ? -nx : nx);   // normal hacia afuera del cuerpo (en el miembro)
      let grupo: string | null = null;
      if (r === 'clavicle') grupo = nz < -0.2 ? 'trapecio' : 'deltoides';
      else if (r === 'upperarm') {
        const tt = t(J.get('upperarm' + lado), J.get('lowerarm' + lado), y, x, z);
        grupo = tt < 0.32 ? 'deltoides' : nz > 0.15 || ny > 0.55 ? 'biceps' : 'triceps';
      } else if (r === 'lowerarm') grupo = ny < -0.1 ? 'flexores' : 'extensores';
      else if (r === 'thigh') {
        const tt = t(J.get('thigh' + lado), J.get('calf' + lado), y, x, z);
        grupo = nz < -0.35 ? (tt < 0.18 ? 'gluteo' : 'isquios') : afuera < -0.3 ? 'aductores' : 'cuadriceps';
      } else if (r === 'calf') grupo = nz < -0.2 ? 'gemelos' : nz > 0.3 && afuera > -0.3 ? 'tibial' : 'gemelos';
      else if (r === 'pelvis') grupo = nz < -0.25 ? 'gluteo' : ax > 0.09 ? 'oblicuo' : y > (pelvis?.y ?? 0) - 0.03 ? 'recto' : null;
      else if (/^spine_0[12]$/.test(r)) grupo = nz > 0.25 ? (ax < 0.075 ? 'recto' : 'oblicuo') : nz < -0.25 ? (ax < 0.06 ? 'erector' : 'dorsal') : (nz >= 0 ? 'oblicuo' : 'dorsal');
      else if (r === 'spine_03') {
        if (nz > 0.2) grupo = y > (sp3?.y ?? 0) - 0.02 && ax < 0.17 ? 'pectoral' : ax > 0.09 ? 'oblicuo' : 'recto';
        else if (nz < -0.2) grupo = y > (sp3?.y ?? 0) + 0.06 ? 'trapecio' : ax < 0.055 ? 'erector' : 'dorsal';
        else grupo = y > (sp3?.y ?? 0) + 0.05 ? 'deltoides' : 'dorsal';
      } else if (r === 'neck_01') grupo = nz < -0.1 ? 'trapecio' : nz > 0.1 && ax > 0.012 && y < (cabeza?.y ?? Infinity) ? 'esternocleido' : null;
      if (grupo === 'recto' && cuello && y > (sp3?.y ?? 0) + 0.04) grupo = 'pectoral';
      c.copy(grupo ? col.get(grupo)! : PIEL_MAPA);
      out[i * 3] = c.r; out[i * 3 + 1] = c.g; out[i * 3 + 2] = c.b;
    }
    return out;
  }

  /* ── LUCES DE ACADEMIA ─────────────────────────────────────────────────── */
  private ponerLuces(luz: LuzAcademia): void {
    this.lucesPropias.clear();
    if (luz === 'estudio') {
      for (const l of this.lucesEstudio) l.luz.intensity = l.intensidad;
      this.lucesEstudio = [];
      return;
    }
    if (!this.lucesEstudio.length) {
      this.scene.children.forEach((o) => { const l = o as THREE.Light; if (l.isLight && o.parent === this.scene) this.lucesEstudio.push({ luz: l, intensidad: l.intensity }); });
    }
    for (const l of this.lucesEstudio) l.luz.intensity = 0;
    const inst = this.inst, centro = new THREE.Vector3(0, 1, 0);
    if (inst) new THREE.Box3().setFromObject(inst.raiz).getCenter(centro);
    const dir = (color: number, intensidad: number, desde: [number, number, number]) => {
      const d = new THREE.DirectionalLight(color, intensidad);
      d.position.copy(centro).add(new THREE.Vector3(...desde).normalize().multiplyScalar(6));
      d.target.position.copy(centro);
      this.lucesPropias.add(d, d.target);
    };
    const amb = (cielo: number, suelo: number, i: number) => this.lucesPropias.add(new THREE.HemisphereLight(cielo, suelo, i));
    if (luz === 'rembrandt') { dir(0xfff1de, 2.6, [0.75, 0.9, 0.75]); amb(0xc8d0e0, 0x2a2622, 0.32); }
    else if (luz === 'lateral') { dir(0xfff4e8, 2.8, [1, 0.15, 0]); amb(0x9aa2b0, 0x1d1b19, 0.12); }
    else if (luz === 'contraluz') { dir(0xffffff, 3.2, [0.25, 0.45, -1]); dir(0xbfd4ff, 1.4, [-0.7, 0.3, -0.8]); amb(0x8d96a8, 0x1a1816, 0.22); }
    else if (luz === 'ventana') { dir(0xe9f1ff, 1.5, [-1, 0.35, 0.35]); amb(0xdfe6f2, 0x6d655c, 0.85); }
    else if (luz === 'cenital') { dir(0xfff8ee, 2.7, [0.08, 1, 0.12]); amb(0x9aa2b0, 0x201d1a, 0.18); }
  }

  /* ── EL ESQUELETO ──────────────────────────────────────────────────────── */
  private ponerEsqueleto(): void {
    const inst = this.inst;
    if (this.esqueleto) { this.scene.remove(this.esqueleto); this.esqueleto.dispose(); this.esqueleto = null; }
    if (!inst || !this.opciones.esqueleto) return;
    const h = new THREE.SkeletonHelper(inst.raiz);
    const m = h.material as THREE.LineBasicMaterial;
    m.depthTest = false; m.transparent = true; m.opacity = 0.95; m.linewidth = 2;
    // de un solo color, que se lea sobre el cuerpo: el hueso, del lado del tendón
    const c = new THREE.Color('#f0450e'), arr = (h.geometry.getAttribute('color') as THREE.BufferAttribute);
    for (let i = 0; i < arr.count; i++) arr.setXYZ(i, c.r, c.g, c.b);
    h.renderOrder = 999;
    this.esqueleto = h; this.scene.add(h);
  }

  /* ── LOS PLANOS DE LA CABEZA (Loomis), pegados al hueso de la cabeza ───── */
  private ponerPlanos(): void {
    const inst = this.inst;
    if (this.planos) { this.planos.parent?.remove(this.planos); soltar(this.planos); this.planos = null; }
    if (!inst || !this.opciones.planos) return;
    const sk = inst.cuerpo.skeleton, kH = sk.bones.findIndex((b) => b.name === 'Head'), cabeza = sk.bones[kH];
    if (kH < 0 || !cabeza) return;
    const g = inst.cuerpo.geometry, O = inst.pielDeFabrica(), n = O.length / 3;
    const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) { let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === kH) w += sw.getComponent(i, k); if (w > 0.9) idx.push(i); }
    if (idx.length < 50) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const i of idx) { const x = O[i * 3], y = O[i * 3 + 1], z = O[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const cx = (x0 + x1) / 2, alto = y1 - y0;
    // la línea de los ojos: el centro de los globos (malla aparte); si no hay, la mitad de la cabeza
    const ojos = inst.mallas.find((m) => (m.material as THREE.Material).name === 'MI_Eyes');
    let yo = y0 + 0.5 * alto;
    if (ojos) { ojos.geometry.computeBoundingBox(); yo = ojos.geometry.boundingBox!.getCenter(new THREE.Vector3()).y; }
    const yCejas = yo + 0.06 * alto, tercio = (yCejas - y0) / 2, yNariz = y0 + tercio, yPelo = yCejas + tercio;
    // el contorno de la cabeza a una altura: el punto más lejano de la piel en cada dirección
    const contorno = (yl: number, desde: number, hasta: number, pasos = 24): THREE.Vector3[] => {
      const r = new Float32Array(pasos + 1).fill(0), banda = 0.006 * Math.max(1, alto / 0.25), cz = (z0 + z1) / 2 - 0.05 * (z1 - z0);
      for (const i of idx) {
        const y = O[i * 3 + 1]; if (Math.abs(y - yl) > banda) continue;
        const dx = O[i * 3] - cx, dz = O[i * 3 + 2] - cz, a = Math.atan2(dx, dz);
        if (a < desde || a > hasta) continue;
        const k = Math.round((a - desde) / (hasta - desde) * pasos); r[k] = Math.max(r[k], Math.hypot(dx, dz));
      }
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k <= pasos; k++) if (r[k] > 0) { const a = desde + (hasta - desde) * k / pasos, rr = r[k] + 0.003; pts.push(new THREE.Vector3(cx + Math.sin(a) * rr, yl, cz + Math.cos(a) * rr)); }
      return pts;
    };
    const tramos = (p: THREE.Vector3[]) => { const s: THREE.Vector3[] = []; for (let k = 1; k < p.length; k++) s.push(p[k - 1], p[k]); return s; };
    const circulo = (c: THREE.Vector3, r: number, u: THREE.Vector3, v: THREE.Vector3, pasos = 48) => {
      const s: THREE.Vector3[] = [];
      for (let k = 0; k < pasos; k++) {
        const a = (k / pasos) * Math.PI * 2, b = ((k + 1) / pasos) * Math.PI * 2;
        s.push(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r), c.clone().addScaledVector(u, Math.cos(b) * r).addScaledVector(v, Math.sin(b) * r));
      }
      return s;
    };
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    // la esfera del cráneo: toca la coronilla y la nuca
    const rEsf = Math.min((x1 - x0) / 2, (yPelo - y0) * 0.62) * 1.02, cEsf = new THREE.Vector3(cx, y1 - rEsf, z0 + rEsf);
    const corte = 0.62 * rEsf, rCorte = Math.sqrt(rEsf * rEsf - corte * corte);
    // la línea media, por el perfil de verdad
    const perfil: THREE.Vector3[] = [];
    const pasosP = 26;
    for (let k = 0; k <= pasosP; k++) {
      const yl = y0 + (y1 - y0) * k / pasosP; let zf = -Infinity;
      for (const i of idx) if (Math.abs(O[i * 3] - cx) < 0.006 && Math.abs(O[i * 3 + 1] - yl) < (y1 - y0) / pasosP) zf = Math.max(zf, O[i * 3 + 2]);
      if (zf > -Infinity) perfil.push(new THREE.Vector3(cx, yl, zf + 0.003));
    }
    const planos = new THREE.Group(); planos.name = 'academia:planos';
    const azul = 0x2b9dff, naranja = 0xf0450e;
    planos.add(lineas([...circulo(cEsf, rEsf, Y, Z), ...circulo(cEsf, rEsf, X, Y), ...circulo(cEsf, rEsf, X, Z)], azul, { opac: 0.75 }));
    planos.add(lineas([...circulo(cEsf.clone().addScaledVector(X, corte), rCorte, Y, Z), ...circulo(cEsf.clone().addScaledVector(X, -corte), rCorte, Y, Z)], azul, { opac: 0.9 }));
    planos.add(lineas(tramos(perfil), naranja, { frente: true }));
    for (const [yl, color] of [[yPelo, azul], [yCejas, naranja], [yo, 0x35c46a], [yNariz, naranja], [y0 + 0.004, naranja]] as [number, number][]) {
      planos.add(lineas(tramos(contorno(yl, -1.45, 1.45)), color, { frente: true }));
    }
    // sigue la pose con la MISMA cuenta que la piel para lo que es todo de la cabeza
    // (bindMatrixInverse · hueso · boneInverse · bindMatrix). Colgado del hueso se
    // despegaba al girar el cuerpo: medido en 3/4, la construcción flotaba al costado
    const cuerpo = inst.cuerpo, inv = sk.boneInverses[kH];
    planos.matrixAutoUpdate = false;
    planos.updateMatrixWorld = function (this: THREE.Group, force?: boolean) {
      this.matrix.copy(cuerpo.bindMatrixInverse).multiply(cabeza.matrixWorld).multiply(inv).multiply(cuerpo.bindMatrix);
      this.matrixWorldNeedsUpdate = true;
      THREE.Group.prototype.updateMatrixWorld.call(this, force);
    };
    cuerpo.add(planos);
    this.planos = planos;
  }

  /* ── EL CANON EN CABEZAS ───────────────────────────────────────────────── */
  private limpiarRegla(): void { soltar(this.regla); this.regla.clear(); this.cabezas = null; this.medida = null; }
  /** Mide el cuerpo como está (posado): alto total y alto de la cabeza (mentón a coronilla). */
  medir(): { alto: number; cabeza: number; piso: number; tope: number; xMax: number; xMin: number; z: number } | null {
    const inst = this.inst ?? this.personaje(); if (!inst) return null;
    const m = inst.cuerpo, g = m.geometry, n = g.attributes.position.count;
    m.updateMatrixWorld(true); m.skeleton.update();
    const si = g.attributes.skinIndex as THREE.BufferAttribute, sw = g.attributes.skinWeight as THREE.BufferAttribute;
    const kH = m.skeleton.bones.findIndex((b) => b.name === 'Head'); if (kH < 0) return null;
    // la cabeza se mide A LO LARGO DE SU EJE (mentón a coronilla), así una cabeza
    // inclinada o girada mide lo mismo; medida en vertical, la pose de arranque del
    // taller (cabeza gacha) daba 9,4 cabezas y la de pie 10,8 con el mismo cuerpo
    const S = m.skeleton.bones[kH].matrixWorld.clone().multiply(m.skeleton.boneInverses[kH]);
    const arriba = new THREE.Vector3(0, 1, 0).transformDirection(m.bindMatrix).transformDirection(S).transformDirection(m.bindMatrixInverse).transformDirection(m.matrixWorld);
    const v = new THREE.Vector3(); let piso = Infinity, xMax = -Infinity, xMin = Infinity, zs = 0, cuenta = 0;
    let bajo = Infinity, alto = -Infinity, coronilla = -Infinity;
    for (let i = 0; i < n; i += 2) {
      m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld);
      piso = Math.min(piso, v.y); xMax = Math.max(xMax, v.x); xMin = Math.min(xMin, v.x); zs += v.z; cuenta++;
      let w = 0; for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === kH) w += sw.getComponent(i, k);
      if (w > 0.9) { const d = v.dot(arriba); bajo = Math.min(bajo, d); alto = Math.max(alto, d); coronilla = Math.max(coronilla, v.y); }
    }
    if (!cuenta || bajo === Infinity) return null;
    // el alto: del piso a la coronilla (con los brazos arriba, las manos no cuentan)
    return { alto: coronilla - piso, cabeza: alto - bajo, piso, tope: coronilla, xMax, xMin, z: zs / cuenta };
  }
  private medirCanon(): void {
    const antes = this.cabezas;
    this.dibujarCanon();
    if (this.cabezas !== antes) window.dispatchEvent(new Event('low3d:academia'));   // el panel muestra la medida
  }
  private dibujarCanon(): void {
    this.limpiarRegla();
    if (!this.opciones.canon || !this.inst) return;
    const md = this.medir(); if (!md || md.cabeza <= 0) return;
    const H = md.cabeza, cab = md.alto / H, x = md.xMax + 0.12 * md.alto, z = md.z, txt = 0.032 * md.alto;
    this.cabezas = Math.round(cab * 100) / 100; this.medida = { alto: md.alto, cabeza: H };
    const p: THREE.Vector3[] = [new THREE.Vector3(x, md.piso, z), new THREE.Vector3(x, md.tope, z)];
    const guias: THREE.Vector3[] = [];
    for (let k = 0; k <= Math.floor(cab + 1e-6); k++) {
      const y = md.tope - k * H;
      p.push(new THREE.Vector3(x - 0.03 * md.alto, y, z), new THREE.Vector3(x + 0.03 * md.alto, y, z));
      if (k >= 1) guias.push(new THREE.Vector3(md.xMin - 0.02 * md.alto, y, z), new THREE.Vector3(x, y, z));
      if (k >= 1) {
        const r = rotulo(k + (CANON_8[k - 1] ? ' · ' + CANON_8[k - 1] : ''), txt, '#ffffff');
        r.center.set(0, 0.5); r.position.set(x + 0.045 * md.alto, y, z); this.regla.add(r);
      }
    }
    // la mitad de cada cabeza, más corta
    for (let k = 0; k < cab; k++) { const y = md.tope - (k + 0.5) * H; if (y > md.piso) p.push(new THREE.Vector3(x - 0.015 * md.alto, y, z), new THREE.Vector3(x + 0.015 * md.alto, y, z)); }
    this.regla.add(lineas(p, 0xf0450e));
    this.regla.add(lineas(guias, 0xf0450e, { opac: 0.55, rayas: true }));
    const t = rotulo((Math.round(cab * 10) / 10).toString().replace('.', ',') + ' cabezas', txt * 1.25);
    t.center.set(0.5, 0); t.position.set(x, md.tope + 0.03 * md.alto, z); this.regla.add(t);
  }
}

/* ── LAS POSES CLÁSICAS: recetas con las herramientas de Posar ─────────────── */
/** Pone una pose clásica desde el reposo. Ejes del mundo con el cuerpo de frente
 *  (sin girar en el giradiscos): +x su izquierda, +y arriba, +z adelante. */
export function ponerPoseClasica(p: Personaje3D, id: string): boolean {
  if (!POSES_CLASICAS.some((x) => x.id === id)) return false;
  p.ponerPoseDeFabrica(null);
  // los ejes del CUERPO (el giradiscos lo puede tener girado): su izquierda, arriba, adelante
  p.raiz.updateMatrixWorld(true);
  const q = p.raiz.getWorldQuaternion(new THREE.Quaternion());
  const X = new THREE.Vector3(1, 0, 0).applyQuaternion(q), Y = new THREE.Vector3(0, 1, 0).applyQuaternion(q), Z = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const apuntar = (c: string, dir: [number, number, number]) => {
    const a = p.articulacion(c); if (!a) return;
    p.girarHacia(c, a.clone().add(new THREE.Vector3(...dir).normalize().applyQuaternion(q)));
  };
  /** un brazo colgando: hacia `dir`, el codo apenas doblado y la palma girada
   *  (`rotar` +70: la palma mira adelante, como en las láminas) */
  const brazo = (lado: 'l' | 'r', dir: [number, number, number], doblar: number, rotar: number) => {
    apuntar('upperarm_' + lado, dir);
    p.ponerDial('lowerarm_' + lado, 'rotar', rotar); p.ponerDial('lowerarm_' + lado, 'doblar', doblar);
  };
  /** el peso en la pierna derecha: la cadera derecha sube, los hombros bajan de ese
   *  lado y la cabeza mira hacia el apoyo (medido en el banco de poses, de frente y de perfil) */
  const contrapposto = () => {
    p.girarPor('pelvis', Z, -9);                                  // el cuerpo entero se inclina con la cadera…
    p.girarPor('thigh_r', Z, 9); p.girarPor('thigh_l', Z, 9);    // …y las piernas vuelven a plomo
    p.girarPor('thigh_l', X, 6); p.girarPor('thigh_l', Z, 5);    // la pierna libre, apenas atrás y afuera
    p.ponerDial('calf_l', 'doblar', 18);
    p.girarPor('tronco', Z, 16);                                  // los hombros, al revés que la cadera
    p.girarPor('tronco', Y, 10);
    p.girarPor('Head', Y, -22); p.girarPor('Head', Z, -7);
  };
  if (id === 'anatomica') { brazo('l', [0.14, -1, 0.03], 10, 70); brazo('r', [-0.14, -1, 0.03], 10, 70); }
  else if (id === 'contrapposto') { contrapposto(); brazo('l', [0.16, -1, 0.08], 20, 60); brazo('r', [-0.12, -1, -0.03], 8, 40); }
  else if (id === 'mano-cadera') {
    contrapposto(); brazo('r', [-0.12, -1, -0.03], 8, 40);
    // la mano en la cadera: el brazo sale para afuera, ROTA sobre su largo (si no, el
    // codo se dobla hacia arriba y la mano va al hombro) y el codo se dobla
    apuntar('upperarm_l', [0.6, -0.8, 0]); p.girarSobreSi('upperarm_l', 90); p.ponerDial('lowerarm_l', 'doblar', 100);
  } else if (id === 'torsion') {
    p.girarPor('pelvis', Y, 18); p.girarPor('tronco', Y, -38); p.girarPor('Head', Y, 34); p.girarPor('Head', Z, 8); p.girarPor('tronco', Z, 8);
    brazo('l', [0.55, 0.2, 0.75], 35, 30); brazo('r', [-0.25, -1, -0.3], 12, 40);
    p.ponerDial('calf_l', 'doblar', 14); p.girarPor('thigh_l', X, -8);
  } else if (id === 'brazos-arriba') {
    apuntar('upperarm_l', [0.18, 1, 0.06]); apuntar('upperarm_r', [-0.18, 1, 0.06]);
    p.ponerDial('lowerarm_l', 'doblar', 28); p.ponerDial('lowerarm_r', 'doblar', 28);
  }
  p.aplicar();
  return true;
}
