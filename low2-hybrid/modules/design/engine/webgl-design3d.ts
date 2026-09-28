/**
 * Motor de dibujo 3D estilo Feather para LOW 2.0 (backend WebGL / Three.js).
 *
 * PROFUNDIDAD: el lápiz emite un rayo de cámara y el punto se resuelve sobre una
 * SUPERFICIE (guía extruida, primitiva, o plano frontal por defecto). Nunca se
 * adivina Z.
 *
 * SISTEMA DE GUÍAS (Feather): la herramienta Guía extruye tu trazo a una
 * superficie translúcida perpendicular a la vista. Hay UNA guía activa a la vez
 * (una nueva reemplaza a la anterior; se puede borrar). Los trazos NO se borran
 * con la guía.
 *
 * Este archivo también implementa: vistas ortogonales (frente/lado/arriba) +
 * perspectiva, deshacer/rehacer (Ctrl+Z / Ctrl+Alt+Z / Ctrl+Shift+Z),
 * selección por click y por LAZO, mover y borrar selección, y goma con lazo.
 *
 * @module design/engine/webgl-design3d
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { Joystick3D, type JoyMode } from './joystick3d';
import { NavCubo3D, type NavVista } from './navcubo3d';
import { frameGeometry } from './frame-content';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { lowStore, type LowStore } from '../../../store/low-store';
import { LOW_CYAN } from '../theme';
import type { BrushSettings, GizmoMode, Layer, SurfaceType, ToolType } from '../../../types/design-types';

export type Theme = 'light' | 'dark';
export type ViewName = 'persp' | 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

interface SurfaceObj {
  id: string;
  type: SurfaceType;
  mesh: THREE.Mesh;
}

interface StrokeRecord {
  id: string;
  object: THREE.Object3D; // grupo (trazo) o malla (guía)
  points: THREE.Vector3[];
  /** Presión 0–1 por punto (mismo índice que `points`). Solo relevante para
   *  trazos ('stroke'); las guías no varían de ancho. */
  pressures: number[];
  kind: 'stroke' | 'guide';
  /** true = es un RELLENO (cara sólida de una forma cerrada), no una línea.
   *  Comparte toda la infraestructura de trazo (capas, goma, selección,
   *  historial) pero su malla se reconstruye como polígono, no como tubo. */
  fill?: boolean;
  /** Figura de la que salió el trazo ('rect' | 'circle' | 'poly'), si vino de
   *  las herramientas de figuras. Solo sirve para nombrarla en la lista de
   *  objetos: por dentro es un trazo cerrado más. */
  shape?: 'rect' | 'circle' | 'poly';
  /** La figura lleva una cara sólida además del contorno. Distinto de `fill`,
   *  que marca un relleno SUELTO (el balde): acá el contorno y su cara son una
   *  sola pieza, se mueven juntas y el contorno sigue exportándose a STL. */
  filled?: boolean;
  /** Id del GRUPO al que pertenece (Ctrl+G). No cambia la jerarquía de la
   *  escena: los objetos siguen colgando de `strokesGroup`. Solo dice que
   *  elegir uno elige a todos, para poder moverlos y deformarlos en bloque.
   *  Mantenerlo así evita romper capas, goma, exportación e historial. */
  groupId?: string;
  /** true = es un VOLUMEN generado a partir de otros trazos (Ctrl+E). Como
   *  `fill`, comparte toda la infraestructura de trazo, pero su malla se
   *  reconstruye como cuerpo cerrado y no como tubo ni como cara plana. */
  solid?: boolean;
  /** Capa/grupo al que pertenece el trazo (id del store). Determina
   *  visibilidad y opacidad grupal. */
  layerId: string;
  /** Opacidad propia del trazo (del pincel al crearlo); la opacidad efectiva
   *  es baseOpacity × opacidad de la capa. */
  baseOpacity: number;
  /** Snapshot del pincel con el que se creó el trazo (color, grosor, dureza,
   *  presión…). Es el que se usa al RECONSTRUIR la malla (editar nodos,
   *  cortar, liquify, reabrir el proyecto) — antes se reusaba `this.brush`
   *  actual y un trazo viejo se repintaba con el pincel de ahora. */
  brush: BrushSettings;
}

interface Command {
  undo: () => void;
  redo: () => void;
}

interface HitInfo {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  noSupport?: boolean;
  /** Object3D que debe quedar bloqueado durante el gesto. */
  target?: THREE.Object3D;
  /** Plano matematico de respaldo cuando el target visible no recibe el rayo. */
  plane?: THREE.Plane;
  kind?: 'guide' | 'surface' | 'stroke' | 'fallback' | 'free';
}

export interface Low3DProject {
  format: 'low3d';
  version: 1;
  savedAt: string;
  camera: { view: ViewName; position: number[]; target: number[]; orthoSize: number };
  settings: { brush: BrushSettings; mirror: { x: boolean; y: boolean; z: boolean }; theme: Theme;
    activeSurface: ReturnType<typeof lowStore.getState>['activeSurface'] };
  layers: ReturnType<typeof lowStore.getState>['layers'];
  activeLayerId: string | null;
  strokes: Array<{
    id: string; layerId: string; points: number[][]; pressures: number[]; baseOpacity: number;
    position: number[]; quaternion: number[]; scale: number[]; brush?: BrushSettings;
    /** true = cara sólida (relleno), no una línea: se reconstruye como polígono. */
    fill?: boolean;
    groupId?: string;
    /** true = volumen: se reconstruye con buildSolidMesh a partir de `points`. */
    solid?: boolean;
    shape?: 'rect' | 'circle' | 'poly';
    /** true = la figura lleva cara sólida ADEMÁS del contorno (una sola pieza). */
    filled?: boolean;
  }>;
  /** Nombre de cada grupo (Ctrl+G), por id. Sin esto, al reabrir el proyecto
   *  los objetos perdían su nombre y volvían a ser "Objeto 1, 2, 3…". */
  groupNames?: Record<string, string>;
  /** Guías 3D (las "cortinas" extruidas). Se guardan por su trazo de origen +
   *  el eje de extrusión, que es lo único que hace falta para reconstruirlas. */
  guides?: Array<{ points: number[][]; normal: number[]; position: number[]; quaternion: number[]; scale: number[] }>;
}

const MIN_SAMPLE_DIST = 0.012;
// salto máximo (mundo) entre puntos consecutivos de un trazo a mano alzada. Un
// rayo rasante sobre una superficie profunda (bóveda) puede devolver un punto
// lejísimo → recta larga espuria; se descarta ese salto irreal.
const MAX_DRAW_JUMP = 2.5;
const DRAG_THRESHOLD = 6; // px para distinguir click de arrastre
const ORTHO_SIZE = 4;
const NS = 'http://www.w3.org/2000/svg';

export class WebGLDesign3D {
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private perspCamera!: THREE.PerspectiveCamera;
  private camera!: THREE.Camera & { position: THREE.Vector3 }; // cámara activa
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();

  private surfacesGroup!: THREE.Group;
  private guidesGroup!: THREE.Group;
  private strokesGroup!: THREE.Group;
  private grid!: THREE.GridHelper;

  private surfaces: SurfaceObj[] = [];
  private strokes: StrokeRecord[] = [];
  // varias guías pueden coexistir (crear una nueva ya NO borra las
  // anteriores) — `activeGuide` es la más reciente, usada como fallback de
  // plano infinito en resolveHit; cualquiera se borra individualmente con la
  // goma (click sobre ella) o deleteGuide() borra la última.
  private guides: { id: string; mesh: THREE.Mesh; plane?: THREE.Plane }[] = [];
  private activeGuide: { id: string; mesh: THREE.Mesh; plane?: THREE.Plane } | null = null;
  // guía elegida con la herramienta 'move' (click sobre ella, sin arrastre
  // libre): el gizmo existente (translate/scale) se le adjunta directo, así
  // se puede mover y deformar sin código nuevo de arrastre. Mutuamente
  // excluyente con `selected` (elegir una cosa deselecciona la otra).
  private selectedGuide: { id: string; mesh: THREE.Mesh } | null = null;
  private selected = new Set<StrokeRecord>();
  // ── rig temporal para transformar VARIOS objetos con un solo gizmo ──
  // Three no sabe transformar una selección: el gizmo se adjunta a UN objeto.
  // El truco es un Group vacío en el centro de la selección al que se le
  // `attach()` (preserva la matriz mundial) todo lo elegido mientras dura la
  // transformación, y devolverlo a su padre al terminar. Sirve igual para una
  // selección suelta y para un grupo de Ctrl+G.
  private rig: THREE.Group | null = null;
  private rigMembers: {
    obj: THREE.Object3D; parent: THREE.Object3D;
    pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3;
  }[] = [];

  private fallbackPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  private view: ViewName = 'persp';
  private orthoSize = ORTHO_SIZE;

  // dibujo libre ("en el aire"): en vez de proyectar sobre una guía/
  // superficie, el punto se calcula a una distancia fija de la cámara a lo
  // largo del rayo del cursor — esa distancia (`freeDrawDepth`) es la que se
  // ajusta con el scroll (ver onWheel). El OrbitControls.enableZoom se
  // desactiva mientras esta herramienta está activa para que el scroll no
  // termine haciendo las dos cosas (zoom Y profundidad) a la vez.
  private freeDrawDepth = 0; // 0 = todavía no inicializado, ver ensureFreeDrawDepth()
  private freeDrawPreview?: THREE.Mesh;
  private freeDepthEl!: HTMLDivElement;
  private joyLecturaEl!: HTMLDivElement;
  private static readonly FREE_DEPTH_MIN = 0.15;
  private static readonly FREE_DEPTH_MAX = 80;

  // liquify: arrastra los puntos de control de UN trazo hacia el pincel,
  // dentro de un radio, con caída suave — igual idea que el prototipo viejo
  // de `ui/lienzo3d.js` (`l3dLiquifyStroke`), portada al motor actual
  // (rebuildStrokeMesh + undo/redo). El radio de influencia reusa el slider
  // de tamaño de pincel existente (no hace falta un control nuevo).
  private liquifyStroke: StrokeRecord | null = null;
  private liquifyBefore: THREE.Vector3[] = [];
  private static readonly LIQUIFY_STRENGTH = 0.18;

  // interacción
  private mode: 'idle' | 'draw' | 'move' | 'lasso' | 'point-drag' | 'pivot-drag' | 'liquify-drag' | 'joystick' = 'idle';
  private current: {
    points: THREE.Vector3[];
    pressures: number[];
    kind: 'stroke' | 'guide';
    line?: THREE.Line;
    mirrorLine?: THREE.Line;
    /** normal de la superficie sobre la que se apoyó el primer punto — para
     *  que una guía nueva salga PERPENDICULAR al plano en el que se estaba
     *  dibujando (ver buildGuideSurface), no siempre de cara a la cámara. */
    baseNormal?: THREE.Vector3;
    /** Plano de guía fijado al comenzar el gesto. Evita saltos de profundidad
     *  si la punta sale de los límites visibles de la guía. */
    drawPlane?: THREE.Plane;
    /** Superficie/malla fijada al comenzar el gesto. Evita que el raycast
     *  cambie a otra guía, stroke o primitiva mientras el usuario dibuja. */
    drawTarget?: THREE.Object3D;
    /** Id de la superficie CURVA de apoyo, si el gesto se apoya en una. Se usa
     *  al cerrar el trazo para volver a pegar los puntos a su piel: el
     *  remuestreo interpola en línea recta y el suavizado promedia, y las dos
     *  cosas cortan la cuerda del arco y hunden el trazo bajo la superficie. */
    surfaceId?: string;
    /** true si el primer punto se resolvió contra el plano de fallback
     *  genérico (sin guía ni superficie real de apoyo) — dispara la
     *  auto-creación de guía al cerrar el trazo, ver commitStroke(). */
    noSupport?: boolean;
  } | null = null;
  private downScreen = new THREE.Vector2();
  private lastMoveWorld = new THREE.Vector3();
  private moveStart = new Map<THREE.Object3D, THREE.Vector3>();
  private lassoPts: [number, number][] = [];
  private lassoEl!: SVGSVGElement;
  private lassoPoly!: SVGPolygonElement;

  // ejes globales XYZ + puntos de fuga automáticos (solo guía visual — NUNCA
  // se dibujan ni se exportan, se recalculan en vivo según la cámara)
  private axesHelper!: THREE.AxesHelper;
  private showAxes = false;
  private vpEl!: SVGSVGElement;

  // edición de nodos (herramienta 'select'): un trazo a la vez, sus puntos de
  // control se muestran como esferitas arrastrables en 3D.
  private handlesGroup!: THREE.Group;
  private editingStroke: StrokeRecord | null = null;
  private pointHandles: THREE.Mesh[] = [];
  private dragPointIndex = -1;
  private dragPointStart = new THREE.Vector3();

  // gizmo de transformación (herramienta 'move', un solo trazo seleccionado):
  // pensado como base para animación futura (posar y grabar keyframes).
  private gizmo?: TransformControls;
  /** JOYSTICK (estilo Feather): un solo control con mover + rotar + escalar en
   *  lugar de cambiar de modo. Convive con el gizmo clasico: se elige cual se
   *  usa, y nunca estan los dos a la vez porque se pisarian los blancos. */
  private joy?: Joystick3D;
  private joyOn = false;
  navCubo?: NavCubo3D;
  /** El objeto se envuelve en un proxy centrado SOLO mientras dura el gesto.
   *  Rotar o escalar el grupo crudo lo haria alrededor del origen del mundo
   *  (los puntos del trazo son mundiales y el grupo esta en 0,0,0), y dejarlo
   *  envuelto todo el tiempo romperia lo que asume que el trazo cuelga de
   *  strokesGroup: guardar el proyecto, por ejemplo, perderia el movimiento. */
  private joyProxy: THREE.Object3D | null = null;
  private joyOwner: THREE.Object3D | null = null;
  private joyOwnerParent: THREE.Object3D | null = null;
  private joyBefore: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 } | null = null;
  private gizmoTarget: THREE.Object3D | null = null;
  private gizmoDragStart = new THREE.Vector3();
  private gizmoDragStartQuat = new THREE.Quaternion();
  private gizmoDragStartScale = new THREE.Vector3(1, 1, 1); // el modo escala también se deshace
  private currentGizmoMode: GizmoMode = 'translate';

  // eje móvil del gizmo de rotación: una esferita arrastrable que define
  // DÓNDE gira el objeto, en vez de rotar siempre sobre su propio origen.
  // Se implementa reparentando el objeto bajo un Object3D "proxy" ubicado en
  // el pivote elegido — pero SOLO durante el gesto de rotación en sí (nunca
  // mientras se arrastra el marcador): moverlo con el objeto ya adentro lo
  // arrastraría rígidamente. `pivotForObj` recuerda a qué objeto pertenece
  // el pivote actual, para resetearlo si cambia la selección.
  private pivotWorldPos: THREE.Vector3 | null = null;
  private pivotForObj: THREE.Object3D | null = null;
  private pivotMarker?: THREE.Mesh;
  private pivotProxy: THREE.Object3D | null = null;
  private pivotOwnerObj: THREE.Object3D | null = null;
  private pivotOwnerParent: THREE.Object3D | null = null;
  private pivotBeforePos = new THREE.Vector3();
  private pivotBeforeQuat = new THREE.Quaternion();
  private static readonly PIVOT_EPS = 1e-6;

  // portapapeles: copiar/pegar trazos (Ctrl+C / Ctrl+V)
  private clipboard: { points: THREE.Vector3[]; pressures: number[]; brush: BrushSettings }[] = [];

  // estabilizador de pulso ("Stable Strokes"): el punto que se agrega al
  // trazo persigue con retraso al punto crudo del puntero.
  private smoothed: THREE.Vector3 | null = null;
  /** Puntero dueño del trazo; filtra mouse sintético, borrador y contactos
   *  auxiliares que algunas tabletas emiten durante el mismo gesto. */
  private activePointerId: number | null = null;

  // historia
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  private canvas!: HTMLCanvasElement;
  private container!: HTMLElement;
  private cursorEl!: HTMLDivElement;
  private ro?: ResizeObserver;
  private raf = 0;
  private unsub?: () => void;
  private seq = 0;
  private disposed = false;

  private tool: ToolType = 'pencil';
  private brush: BrushSettings = { color: '#22252e', size: 12, opacity: 1, hardness: 0.8, pressureSensitivity: 0.6, stabilization: 0.35 };
  private mirror = { x: false, y: false, z: false };
  private theme: Theme = 'light';
  private lastSurfaceKey = '';
  private selectedSurface: SurfaceObj | null = null; // superficie agarrada con el gizmo

  // ---------------------------------------------------------------- ciclo de vida

  mount(canvas: HTMLCanvasElement, container: HTMLElement): void {
    this.canvas = canvas;
    this.container = container;
    this.makePointerCaptureTolerant(canvas);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();

    this.perspCamera = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    this.perspCamera.position.set(0, 1.2, 6);
    this.camera = this.perspCamera;

    this.makeControls();
    this.controls.target.set(0, 0.6, 0);

    this.buildEnvironment();

    this.surfacesGroup = new THREE.Group();
    this.guidesGroup = new THREE.Group();
    this.strokesGroup = new THREE.Group();
    this.handlesGroup = new THREE.Group();
    this.scene.add(this.surfacesGroup, this.guidesGroup, this.strokesGroup, this.handlesGroup);

    // marcador del eje móvil de rotación: mismo estilo que los handles de
    // edición de puntos, pero en un color distinto para no confundirlo con
    // los nodos de un trazo.
    {
      const geo = new THREE.SphereGeometry(0.05, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff5ac8, depthTest: false });
      this.pivotMarker = new THREE.Mesh(geo, mat);
      this.pivotMarker.renderOrder = 1000;
      this.pivotMarker.visible = false;
      this.handlesGroup.add(this.pivotMarker);
    }

    // mira de puntería del modo "dibujo libre": dónde vas a apoyar el
    // próximo punto, a la distancia de cámara actual (`freeDrawDepth`).
    {
      const geo = new THREE.SphereGeometry(0.045, 16, 12);
      const mat = new THREE.MeshBasicMaterial({ color: 0x4cf0ff, depthTest: false, transparent: true, opacity: 0.85 });
      this.freeDrawPreview = new THREE.Mesh(geo, mat);
      this.freeDrawPreview.renderOrder = 1000;
      this.freeDrawPreview.visible = false;
      this.handlesGroup.add(this.freeDrawPreview);
    }

    this.axesHelper = new THREE.AxesHelper(3);
    this.axesHelper.visible = false;
    this.scene.add(this.axesHelper);

    // gizmo de mover (translate): solo responde al botón izquierdo (lo
    // decide TransformControls internamente), así que nunca pisa el
    // giro con el botón derecho de OrbitControls. Empieza sin objeto — inerte
    // hasta que haya exactamente un trazo seleccionado con la herramienta 'move'.
    this.gizmo = new TransformControls(this.camera, this.canvas);
    this.gizmo.setMode('translate');
    this.gizmo.setSize(0.85);
    this.gizmo.detach();
    this.gizmo.addEventListener('dragging-changed', (ev) => {
      this.controls.enabled = !ev.value;
      if (ev.value) {
        this.gizmoTarget = (this.gizmo!.object as THREE.Object3D | undefined) ?? null;
        if (this.gizmoTarget) {
          this.gizmoDragStart.copy(this.gizmoTarget.position);
          this.gizmoDragStartQuat.copy(this.gizmoTarget.quaternion);
          this.gizmoDragStartScale.copy(this.gizmoTarget.scale);
        }
      } else if (this.gizmoTarget) {
        const obj = this.gizmoTarget;
        const before = this.gizmoDragStart.clone();
        const beforeQuat = this.gizmoDragStartQuat.clone();
        const beforeScale = this.gizmoDragStartScale.clone();
        this.gizmoTarget = null;
        if (this.pivotProxy && obj === this.pivotProxy) {
          // se rotó alrededor del eje móvil: "hornear" la transformación
          // acumulada en el objeto real (unwrapPivot ya arma el undo con el
          // antes/después correctos) y dejar el pivote listo para el
          // próximo gesto sin que el usuario tenga que reposicionarlo.
          this.unwrapPivot();
          if (this.pivotForObj) this.applyPivotAttachment(this.pivotForObj);
        } else if (obj === this.rig) {
          // gesto sobre VARIOS objetos: se "hornea" al terminar el arrastre.
          // detachRig deja a cada objeto con su transformación real y anota UN
          // comando por gesto; después se rearma centrado en la nueva posición.
          this.detachRig();
          this.syncGizmo();
        } else {
          // guía o plano recién soltado: si quedó casi tocando la punta de una
          // línea, se imanta. Va ANTES de tomar el "después" para que el
          // corrimiento entre en el mismo Ctrl+Z que el movimiento.
          if ((this.selectedGuide?.mesh === obj || this.selectedSurface?.mesh === obj)
              && (obj as THREE.Mesh).isMesh) {
            this.snapPlaneToStrokes(obj as THREE.Mesh);
          }
          const after = obj.position.clone();
          const afterQuat = obj.quaternion.clone();
          const afterScale = obj.scale.clone();
          if (before.distanceToSquared(after) > 1e-8 || beforeQuat.angleTo(afterQuat) > 1e-4
              || beforeScale.distanceToSquared(afterScale) > 1e-8) {
            this.pushCmd({
              undo: () => { obj.position.copy(before); obj.quaternion.copy(beforeQuat); obj.scale.copy(beforeScale); },
              redo: () => { obj.position.copy(after); obj.quaternion.copy(afterQuat); obj.scale.copy(afterScale); },
            });
          }
        }
      }
    });
    this.scene.add(this.gizmo);
    this.joy = new Joystick3D();
    this.scene.add(this.joy.root);

    // NAVEGADOR DE CÁMARA: el círculo con el cubo. Orbitar arrastrando encima
    // del dibujo compite con dibujar; acá la vista se gira en un rincón, sin
    // ambigüedad sobre qué hace cada arrastre.
    this.navCubo = new NavCubo3D({
      onOrbitar: (dx, dy) => this.orbitarVista(dx, dy),
      onVista: (v: NavVista) => this.setView(v),
      onPerspectiva: () => this.setView('persp'),
    });
    Object.assign(this.navCubo.canvas.style, {
      position: 'absolute', right: '16px', bottom: '16px', zIndex: '6',
    } as CSSStyleDeclaration);
    this.navCubo.canvas.title =
      'Navegador: arrastrá para girar la vista · tocá una cara para ir a ella · al centro, perspectiva';
    container.appendChild(this.navCubo.canvas);

    // overlay SVG para los puntos de fuga (guía pura, no se dibuja ni exporta)
    this.vpEl = document.createElementNS(NS, 'svg') as SVGSVGElement;
    Object.assign(this.vpEl.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '20', display: 'none',
    } as CSSStyleDeclaration);
    container.appendChild(this.vpEl);

    this.cursorEl = document.createElement('div');
    Object.assign(this.cursorEl.style, {
      position: 'absolute', left: '0', top: '0', borderRadius: '50%',
      border: '1.5px solid #333', transform: 'translate(-50%, -50%)',
      pointerEvents: 'none', display: 'none', zIndex: '50', mixBlendMode: 'difference',
    } as CSSStyleDeclaration);
    container.appendChild(this.cursorEl);

    // lectura numérica de profundidad del modo "dibujo libre" — sin esto el
    // scroll cambia algo invisible; con el número puesto al lado del cursor
    // el ajuste deja de ser "a ciegas".
    this.freeDepthEl = document.createElement('div');
    Object.assign(this.freeDepthEl.style, {
      position: 'absolute', left: '0', top: '0', transform: 'translate(14px, -8px)',
      pointerEvents: 'none', display: 'none', zIndex: '51', fontFamily: 'system-ui, sans-serif',
      fontSize: '11px', color: '#4cf0ff', background: 'rgba(0,0,0,0.55)', padding: '1px 5px',
      borderRadius: '4px', whiteSpace: 'nowrap',
    } as CSSStyleDeclaration);
    container.appendChild(this.freeDepthEl);

    // Lectura del joystick: "X +1.20", "45.0 grados", "ancho 120%". Un gesto sin
    // numero es una adivinanza; con el numero se puede repetir y corregir.
    this.joyLecturaEl = document.createElement('div');
    Object.assign(this.joyLecturaEl.style, {
      position: 'absolute', left: '0', top: '0', transform: 'translate(16px, -22px)',
      pointerEvents: 'none', display: 'none', zIndex: '52', fontFamily: 'system-ui, sans-serif',
      fontSize: '12px', fontWeight: '600', color: '#fff', background: 'rgba(20,22,28,0.82)',
      padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap',
    } as CSSStyleDeclaration);
    container.appendChild(this.joyLecturaEl);

    // overlay SVG para el lazo
    this.lassoEl = document.createElementNS(NS, 'svg') as SVGSVGElement;
    Object.assign(this.lassoEl.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: '40', display: 'none',
    } as CSSStyleDeclaration);
    this.lassoPoly = document.createElementNS(NS, 'polygon') as SVGPolygonElement;
    this.lassoPoly.setAttribute('fill', 'rgba(76,155,255,0.12)');
    this.lassoPoly.setAttribute('stroke', '#4c9bff');
    this.lassoPoly.setAttribute('stroke-width', '1.5');
    this.lassoPoly.setAttribute('stroke-dasharray', '5 4');
    this.lassoEl.appendChild(this.lassoPoly);
    container.appendChild(this.lassoEl);

    this.syncFromStore(lowStore.getState() as unknown as LowStore);
    this.unsub = lowStore.subscribe(() => this.syncFromStore(lowStore.getState() as unknown as LowStore));

    canvas.style.cursor = 'none';
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.setTheme(this.theme);
    this.animate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsub?.();
    this.ro?.disconnect();
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas?.removeEventListener('pointermove', this.onPointerMove);
    this.canvas?.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas?.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.cursorEl?.remove();
    this.freeDepthEl?.remove();
    this.joyLecturaEl?.remove();
    this.lassoEl?.remove();
    this.vpEl?.remove();
    this.gizmo?.dispose();
    this.navCubo?.dispose();
    this.controls?.dispose();
    this.scene?.traverse((o) => this.disposeNode(o));
    this.renderer?.dispose();
  }

  /** Pone el cubo del navegador en la orientación de la cámara y lo dibuja.
   *  Se llama desde el bucle y también en cada cambio de vista: con la ventana
   *  en segundo plano requestAnimationFrame se pausa, y el widget no puede
   *  quedar mostrando desde dónde mirabas hace un rato. */
  private refrescarNavCubo(): void {
    if (!this.navCubo) return;
    this.navCubo.sync(this.camera as THREE.Camera, this.controls.target);
    this.navCubo.render();
  }

  /** Gira la cámara alrededor del punto que mira, como el arrastre derecho de
   *  siempre. Se hace en esféricas para no acumular deriva ni pasar el polo. */
  private orbitarVista(dx: number, dy: number): void {
    // Orbitar abandona la cámara ortográfica, no sólo su etiqueta en la UI.
    if(this.view!=='persp')this.setView('persp');
    const cam = this.camera as THREE.Camera & { position: THREE.Vector3 };
    const t = this.controls.target;
    const off = new THREE.Vector3().subVectors(cam.position, t);
    const esf = new THREE.Spherical().setFromVector3(off);
    esf.theta -= dx;
    // el polo da vuelta la escena y desorienta: se frena justo antes
    esf.phi = Math.max(0.02, Math.min(Math.PI - 0.02, esf.phi + dy));
    cam.position.copy(t).add(new THREE.Vector3().setFromSpherical(esf));
    cam.lookAt(t);
    // girar a mano deja de ser una vista con nombre: pasa a perspectiva libre
    this.controls.update();
    this.refrescarNavCubo();
  }

  private makeControls(): void {
    this.controls?.dispose();
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.mouseButtons = {
      LEFT: -1 as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.controls.enableRotate = this.view === 'persp';
  }

  // ---------------------------------------------------------------- entorno / tema

  private buildEnvironment(): void {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x9099aa, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(3, 6, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xbcd0ff, 0.5);
    rim.position.set(-5, 2, -4);
    this.scene.add(rim);

    this.grid = new THREE.GridHelper(20, 40, 0xc2c8d2, 0xd7dce4);
    const gm = this.grid.material as THREE.Material;
    gm.transparent = true;
    gm.opacity = 0.5;
    this.scene.add(this.grid);
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    const dark = theme === 'dark';
    this.scene.fog = dark ? new THREE.FogExp2(0x34383a, 0.025) : null;
    const gm = this.grid.material as THREE.LineBasicMaterial;
    const colors = this.grid.geometry.getAttribute('color') as THREE.BufferAttribute;
    const c1 = new THREE.Color(dark ? 0x858d92 : 0xc2c8d2);
    const c2 = new THREE.Color(dark ? 0x687177 : 0xd7dce4);
    for (let i = 0; i < colors.count; i++) {
      const c = i < colors.count / 2 ? c1 : c2;
      colors.setXYZ(i, c.r, c.g, c.b);
    }
    colors.needsUpdate = true;
    gm.opacity = dark ? 0.23 : 0.24;
    // el anillo del pincel, con doble borde: uno oscuro y un halo claro por
    // fuera. Así se ve tanto sobre el fondo como sobre un trazo negro, que es
    // donde más se perdía.
    this.cursorEl.style.borderColor = dark ? '#e6ebf5' : '#23272f';
    this.cursorEl.style.boxShadow = dark
      ? '0 0 0 1px rgba(0,0,0,.55)'
      : '0 0 0 1px rgba(255,255,255,.85)';
  }

  // ---------------------------------------------------------------- ejes / puntos de fuga

  /** Prende/apaga los ejes XYZ y, en perspectiva, los puntos de fuga de cada
   *  eje (recalculados en vivo — es guía pura, jamás se dibuja ni exporta). */
  toggleAxes(): boolean {
    this.showAxes = !this.showAxes;
    this.axesHelper.visible = this.showAxes;
    this.updateVPOverlay();
    return this.showAxes;
  }

  axesOn(): boolean { return this.showAxes; }

  private static readonly VP_AXES: [THREE.Vector3, string][] = [
    [new THREE.Vector3(1, 0, 0), '#e74c3c'],
    [new THREE.Vector3(0, 1, 0), '#2ecc71'],
    [new THREE.Vector3(0, 0, 1), '#3b82f6'],
  ];

  /** Punto de fuga = a dónde converge en pantalla una dirección del mundo al
   *  proyectarla al infinito. Solo tiene sentido en perspectiva — en
   *  ortográfica las líneas paralelas a un eje siguen paralelas en pantalla,
   *  no convergen a ningún punto. Se recalcula cada frame según la cámara. */
  private updateVPOverlay(): void {
    if (!this.vpEl) return;
    if (!this.showAxes || this.view !== 'persp') {
      this.vpEl.style.display = 'none';
      return;
    }
    this.vpEl.style.display = 'block';
    while (this.vpEl.lastChild) this.vpEl.removeChild(this.vpEl.lastChild);
    const rect = this.canvasBox();
    const w = rect.width || 1, h = rect.height || 1;
    const cam = this.camera as THREE.Camera;
    const camFwd = new THREE.Vector3();
    cam.getWorldDirection(camFwd);
    const span = Math.max(w, h) * 3;
    for (const [axis, color] of WebGLDesign3D.VP_AXES) {
      // de las dos direcciones (+eje/-eje) usamos la que mira "hacia adelante"
      // — así el punto de fuga aparece del lado que se está mirando, no
      // detrás de la cámara.
      const align = camFwd.dot(axis);
      if (Math.abs(align) > 0.985) continue; // cámara casi alineada con el eje: sin convergencia útil
      const d = align >= 0 ? axis : axis.clone().negate();
      const far = cam.position.clone().add(d.clone().multiplyScalar(500));
      const ndc = far.project(cam);
      if (!isFinite(ndc.x) || !isFinite(ndc.y)) continue;
      const sx = ((ndc.x + 1) / 2) * w, sy = ((1 - ndc.y) / 2) * h;
      if (Math.abs(sx) > w * 4 || Math.abs(sy) > h * 4) continue; // demasiado lejos: no aporta
      const g = document.createElementNS(NS, 'g');
      const N = 8;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', sx.toFixed(1)); line.setAttribute('y1', sy.toFixed(1));
        line.setAttribute('x2', (sx + Math.cos(a) * span).toFixed(1));
        line.setAttribute('y2', (sy + Math.sin(a) * span).toFixed(1));
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1.4');
        line.setAttribute('stroke-opacity', '0.4');
        g.appendChild(line);
      }
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', sx.toFixed(1)); dot.setAttribute('cy', sy.toFixed(1));
      dot.setAttribute('r', '5'); dot.setAttribute('fill', color);
      g.appendChild(dot);
      this.vpEl.appendChild(g);
    }
  }

  // ---------------------------------------------------------------- vistas orto / persp

  /** Vista activa — la UI la consulta tras restaurar un proyecto para dejar
   *  resaltado el botón correcto. */
  currentView(): ViewName {
    return this.view;
  }

  canvasElement(): HTMLCanvasElement { return this.canvas; }
  historyState(): { undo:boolean; redo:boolean } { return {undo:this.canUndo(),redo:this.canRedo()}; }
  toggleGrid():boolean { this.grid.visible=!this.grid.visible;return this.grid.visible; }
  frameContent():boolean {
    const selected=this.transformTargets();
    const objects=selected.length?selected:[...this.strokes.map(r=>r.object),...this.guides.map(g=>g.mesh),...this.surfaces.map(s=>s.mesh)];
    const size=frameGeometry(this.camera,objects,this.controls.target,this.canvas.clientWidth/Math.max(1,this.canvas.clientHeight));
    if(size===null)return false;
    if(this.view!=='persp'){this.orthoSize=size;this.applyOrthoFrustum();}
    this.controls.update();this.refrescarNavCubo();
    window.dispatchEvent(new Event('low3d:view'));return true;
  }

  setView(v: ViewName): void {
    const t = this.controls.target.clone();
    const dist = this.camera.position.distanceTo(t) || 8;
    if (v === 'persp') {
      this.camera = this.perspCamera;
    } else {
      const dir: Record<Exclude<ViewName, 'persp'>, [number, number, number]> = {
        front: [0, 0, 1], back: [0, 0, -1], top: [0, 1, 0],
        bottom: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0],
      };
      const d = dir[v];
      const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
      ortho.position.set(t.x + d[0] * dist, t.y + d[1] * dist, t.z + d[2] * dist);
      if (v === 'top' || v === 'bottom') ortho.up.set(0, 0, v === 'top' ? -1 : 1);
      this.camera = ortho;
    }
    this.view = v;
    this.camera.lookAt(t);
    this.makeControls();
    this.controls.target.copy(t);
    // RE-ORIENTAR DESPUÉS de crear los controles. OrbitControls arranca con su
    // target en (0,0,0) y en su constructor apunta la cámara ahí; al copiar
    // después el target real, la cámara quedaba mirando al origen. En una vista
    // ortogonal eso deja el eje de vista INCLINADO (p. ej. (0,-0.099,-0.995) en
    // Frente), y como el plano de dibujo se arma con esa dirección, cada punto
    // de la pantalla caía en una Z distinta: el trazo salía torcido y "no
    // respetaba el plano". Con esto el eje queda exacto (0,0,-1).
    this.camera.lookAt(t);
    this.camera.updateMatrixWorld(true);
    this.applyOrthoFrustum();
    if (this.gizmo) this.gizmo.camera = this.camera as THREE.Camera;
    this.refrescarNavCubo();   // el cubo tiene que reflejar la vista al instante
    this.lastOnionSig = ''; // fuerza recalcular el onion-skin en la nueva vista
    window.dispatchEvent(new Event('low3d:view'));
    // OJO: acá NO se reorienta el plano activo. Un plano de dibujo es una PARED
    // FIJA en el espacio: se crea encarando la vista en la que nació y se queda
    // ahí para siempre. Antes se re-encaraba en cada cambio de vista (incluida
    // la perspectiva, que le metía ángulos arbitrarios tipo -145/75/146), así
    // que era imposible armar una esquina: el plano hecho de Frente y el hecho
    // de Izquierda nunca quedaban a 90°, era el MISMO plano girando.
  }

  private applyOrthoFrustum(): void {
    if (this.view === 'persp') return;
    const cam = this.camera as THREE.OrthographicCamera;
    const c = this.renderer.domElement;
    const aspect = (c.clientWidth || 1) / (c.clientHeight || 1);
    cam.left = -this.orthoSize * aspect;
    cam.right = this.orthoSize * aspect;
    cam.top = this.orthoSize;
    cam.bottom = -this.orthoSize;
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- superficies-guía (toolbar)

  /** Superficie primitiva activa (plano/cilindro/esfera/toro/loft) — solo UNA
   *  a la vez, como ya sugiere el botón-toggle de la barra. Antes, apagar o
   *  cambiar de tipo nunca borraba la malla anterior: quedaban "fantasmas"
   *  acumulados en `surfaces` interfiriendo con resolveHit (raycasts que
   *  pegaban en un plano viejo en una orientación rarísima e inesperada). */
  private activeSurfaceId: string | null = null;

  private removeActiveSurface(): void {
    if (!this.activeSurfaceId) return;
    const s = this.surfaces.find((x) => x.id === this.activeSurfaceId);
    if (s) {
      this.surfacesGroup.remove(s.mesh);
      s.mesh.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      if (this.selectedSurface?.id === this.activeSurfaceId) { this.selectedSurface = null; this.syncGizmo(); }
      this.surfaces = this.surfaces.filter((x) => x.id !== this.activeSurfaceId);
    }
    this.activeSurfaceId = null;
  }

  /** Ejes del mundo candidatos para el snap de orientación. */
  private static readonly WORLD_AXES: THREE.Vector3[] = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];
  /** Tolerancia del snap al eje del mundo, en grados (solo aplica en Persp). */
  private static readonly AXIS_SNAP_DEG = 12;

  /** Tolerancia de las GUÍAS INTELIGENTES (estilo Illustrator): con Shift, si
   *  la recta queda a menos de estos grados del paralelo perfecto a un eje del
   *  mundo, se imanta a ese eje y aparece la guía de color. Más allá, la recta
   *  queda libre — la asistencia no debe pelearse con el trazo a mano. */
  private static readonly SMART_SNAP_DEG = 7;
  private smartGuide?: THREE.Line;

  /** Imanta `raw` al eje del mundo más parecido a la dirección del gesto, solo
   *  si está dentro de la tolerancia. Devuelve el punto corregido y el eje (o
   *  null si el gesto no está cerca de ningún paralelo). */
  private snapStraightSmart(start: THREE.Vector3, raw: THREE.Vector3):
      { point: THREE.Vector3; axis: THREE.Vector3 | null; color?: string } {
    const drag = raw.clone().sub(start);
    if (drag.lengthSq() < 1e-8) return { point: raw, axis: null };
    const dir = drag.clone().normalize();
    const cosTol = Math.cos(THREE.MathUtils.degToRad(WebGLDesign3D.SMART_SNAP_DEG));
    let best: { axis: THREE.Vector3; color: string; c: number } | null = null;
    for (const [ax, color] of WebGLDesign3D.VP_AXES) {
      const c = Math.abs(dir.dot(ax)); // ±eje: da igual el sentido
      if (c >= cosTol && (!best || c > best.c)) best = { axis: ax, color, c };
    }
    if (!best) return { point: raw, axis: null };
    // proyección sobre el eje → paralelo EXACTO, conservando el largo del gesto
    const proj = drag.dot(best.axis);
    return { point: start.clone().addScaledVector(best.axis, proj), axis: best.axis, color: best.color };
  }

  /** Guía visual del eje al que se imantó la recta (línea larga de color que
   *  pasa por el punto de inicio), como las guías inteligentes de Illustrator. */
  private showSmartGuide(origin: THREE.Vector3, axis: THREE.Vector3, color: string): void {
    if (!this.smartGuide) {
      const mat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9, depthTest: false });
      this.smartGuide = new THREE.Line(new THREE.BufferGeometry(), mat);
      this.smartGuide.renderOrder = 1001;
      this.handlesGroup.add(this.smartGuide);
    }
    const L = 1000; // "infinita" a efectos prácticos
    const a = origin.clone().addScaledVector(axis, -L);
    const b = origin.clone().addScaledVector(axis, L);
    this.smartGuide.geometry.setFromPoints([a, b]);
    (this.smartGuide.material as THREE.LineBasicMaterial).color.set(color);
    this.smartGuide.visible = true;
  }

  private hideSmartGuide(): void {
    if (this.smartGuide) this.smartGuide.visible = false;
  }

  /** Normal que tiene que tener un plano nuevo para quedar de cara a la vista.
   *
   *  En una vista ortogonal con nombre (Frente/Izquierda/Arriba…) es
   *  EXACTAMENTE el eje del mundo, así que dos planos creados desde dos vistas
   *  distintas quedan perfectamente perpendiculares entre sí — que es todo lo
   *  que uno espera al dibujar una planta y un alzado.
   *
   *  En Persp se usa la dirección de cámara, pero con snap al eje más cercano
   *  si está a menos de AXIS_SNAP_DEG: una órbita "casi de frente" no debería
   *  dejar un plano 3° torcido que después arruina todas las relaciones. */
  private viewFacingNormal(): THREE.Vector3 {
    const NAMED: Record<Exclude<ViewName, 'persp'>, [number, number, number]> = {
      front: [0, 0, 1], back: [0, 0, -1], top: [0, 1, 0],
      bottom: [0, -1, 0], left: [-1, 0, 0], right: [1, 0, 0],
    };
    if (this.view !== 'persp') {
      const [x, y, z] = NAMED[this.view];
      return new THREE.Vector3(x, y, z);
    }
    const dir = new THREE.Vector3();
    (this.camera as THREE.Camera).getWorldDirection(dir);
    dir.negate().normalize();
    const cosTol = Math.cos(THREE.MathUtils.degToRad(WebGLDesign3D.AXIS_SNAP_DEG));
    for (const ax of WebGLDesign3D.WORLD_AXES) if (dir.dot(ax) >= cosTol) return ax.clone();
    return dir;
  }

  /** Orienta el objeto para que su +Z local (la normal de PlaneGeometry) caiga
   *  sobre `normal`.
   *
   *  La base se arma a mano en vez de usar `lookAt()` a propósito: lookAt se
   *  DEGENERA cuando la dirección queda paralela al `up` (0,1,0) que usa para
   *  resolver el giro sobre sí misma — justo lo que pasaba en las vistas
   *  Arriba/Abajo, donde el plano salía con una rotación indefinida (three lo
   *  salva con un epsilon, dejando la normal a 0.0001 del eje y un roll
   *  arbitrario). */
  private orientToNormal(mesh: THREE.Object3D, normal: THREE.Vector3): void {
    const n = normal.clone().normalize();
    const seed = Math.abs(n.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(seed, n).normalize();
    const y = new THREE.Vector3().crossVectors(n, x).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
  }

  /** Si el plano-guía activo conserva su orientación automática (nunca se le
   *  escribió una rotación explícita en el panel), lo re-encara a la vista
   *  nueva. Sin esto un plano creado en Izquierda queda DE CANTO al pasar a
   *  Frente: el rayo del lápiz no lo toca y no se puede dibujar. */
  private reorientAutoPlane(): void {
    const s = this.surfaces.find((x) => x.id === this.activeSurfaceId);
    if (!s || s.type !== 'plane' || !s.mesh.userData.autoOriented) return;
    this.orientToNormal(s.mesh, this.viewFacingNormal());
    this.publishAutoRotation(s.mesh);
  }

  /** `replace=true` (editar parámetros de la superficie activa) reemplaza la
   *  malla actual; `replace=false` (botón de superficie en la barra) AGREGA una
   *  pared nueva sin tocar las anteriores — así se pueden tener el plano de
   *  Frente y el de Izquierda a la vez formando una esquina a 90°. */
  private addSurface(type: SurfaceType, params: Record<string, unknown> = {}, replace = true): void {
    if (replace) this.removeActiveSurface();
    const radius = Math.max(0.1, Number(params.radius ?? 1.4));
    const segments = Math.max(3, Math.floor(Number(params.segments ?? 48)));
    const geo = type === 'plane'
      ? new THREE.PlaneGeometry(Number(params.width ?? radius * 3), Number(params.height ?? radius * 3), 1, 1)
      : this.surfaceGeometry(type, radius, segments, Number(params.tubeRadius ?? radius * 0.35));
    const mesh = this.makeSurfaceMesh(geo);
    mesh.position.copy(this.controls.target);
    // `autoOriented`: el plano se encara solo a la vista mientras el usuario no
    // escriba una rotación a mano. En cuanto la escribe, manda ella (y el
    // cambio de vista deja de moverlo — ver reorientAutoPlane).
    if (type === 'plane' && !Array.isArray(params.rotation)) {
      this.orientToNormal(mesh, this.viewFacingNormal());
      mesh.userData.autoOriented = true;
    }
    if (Array.isArray(params.position)) mesh.position.fromArray(params.position as number[]);
    if (Array.isArray(params.rotation)) {
      const r = params.rotation as number[];
      mesh.rotation.set(THREE.MathUtils.degToRad(Number(r[0] || 0)),
        THREE.MathUtils.degToRad(Number(r[1] || 0)), THREE.MathUtils.degToRad(Number(r[2] || 0)));
    }
    if (Array.isArray(params.scale)) mesh.scale.fromArray(params.scale as number[]);
    const s: SurfaceObj = { id: `surf-${this.seq++}`, type, mesh };
    mesh.userData.surfaceId = s.id;
    this.surfacesGroup.add(mesh);
    this.surfaces.push(s);
    this.activeSurfaceId = s.id;
    if (mesh.userData.autoOriented) this.publishAutoRotation(mesh);
  }

  private makeSurfaceMesh(geo: THREE.BufferGeometry): THREE.Mesh {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x4c7bd0, roughness: 0.9, metalness: 0, transparent: true,
        opacity: 0.08, side: THREE.DoubleSide, depthWrite: false,
      })
    );
    mesh.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x4c9bff, transparent: true, opacity: 0.3 })
    ));
    return mesh;
  }

  private surfaceGeometry(type: SurfaceType, r: number, segments = 48, tubeRadius = r * 0.35): THREE.BufferGeometry {
    switch (type) {
      case 'sphere': return new THREE.SphereGeometry(r, segments, Math.max(3, Math.floor(segments * 0.66)));
      case 'cylinder': return new THREE.CylinderGeometry(r, r, r * 2, segments, 1, true);
      case 'torus': return new THREE.TorusGeometry(r, tubeRadius, Math.max(3, Math.floor(segments / 2)), segments);
      default: return new THREE.PlaneGeometry(r * 2, r * 2);
    }
  }

  // ---------------------------------------------------------------- store

  /** Identidad de la superficie activa: SOLO lo que define su geometría y su
   *  transformación. Deja afuera los campos de display (autoRotation), que los
   *  escribe el motor — si entraran, publicarlos cambiaría la clave y la malla
   *  se reconstruiría en bucle. */
  private static surfaceKey(s: LowStore['activeSurface']): string {
    if (!s) return '';
    const p = s.params;
    return JSON.stringify([s.type, p.radius, p.segments, p.width, p.height,
      p.tubeRadius, p.position, p.rotation, p.scale, p.nonce]);
  }

  /** Publica en el store la rotación real que el motor le dio al plano al
   *  encararlo a la vista, para que el panel muestre ESE valor y no 0,0,0.
   *  Diferido (microtask) para no re-entrar en syncFromStore desde adentro. */
  private publishAutoRotation(mesh: THREE.Mesh): void {
    const e = new THREE.Euler().setFromQuaternion(mesh.quaternion, 'XYZ');
    const deg = [e.x, e.y, e.z].map((r) => Math.round(THREE.MathUtils.radToDeg(r) * 10) / 10) as
      [number, number, number];
    const cur = lowStore.getState().activeSurface;
    if (!cur) return;
    const prev = cur.params.autoRotation;
    if (prev && prev.length === 3 && prev.every((v, i) => v === deg[i])) return; // ya está
    queueMicrotask(() => {
      const now = lowStore.getState().activeSurface;
      if (!now) return;
      lowStore.setActiveSurface({ ...now, params: { ...now.params, autoRotation: deg } });
    });
  }

  private syncFromStore(s: LowStore): void {
    if (this.tool === 'select' && s.currentTool !== 'select') this.clearPointEdit();
    const toolChanged = this.tool !== s.currentTool;
    this.tool = s.currentTool;
    this.brush = s.brushSettings;
    this.mirror = s.mirrorMode;
    const key = WebGLDesign3D.surfaceKey(s.activeSurface);
    if (key !== this.lastSurfaceKey) {
      // Una sola superficie de apoyo a la vez: cambiar de tipo la reemplaza,
      // destildarla la borra. (Acumularlas dejaba planos apilados imposibles
      // de sacar en vista ortogonal.)
      if (key) this.addSurface(s.activeSurface!.type, s.activeSurface!.params);
      else this.removeActiveSurface();
    }
    this.lastSurfaceKey = key;
    const newGizmoMode = s.gizmoMode || 'translate';
    const gizmoModeChanged = this.currentGizmoMode !== newGizmoMode;
    this.currentGizmoMode = newGizmoMode;
    this.gizmo?.setMode(newGizmoMode);
    if (toolChanged || gizmoModeChanged) this.syncGizmo();
    // dibujo libre: el scroll controla la profundidad, no el zoom de cámara.
    if (this.controls) this.controls.enableZoom = this.tool !== 'pencil-free';
    if (toolChanged && this.tool !== 'pencil-free') this.hideFreeDrawPreview();
    this.applyLayerStyles(); // visibilidad/opacidad de capas
  }

  // ---------------------------------------------------------------- input

  /** Posición del puntero dentro del canvas.
   *
   *  VERIFICADO — NO cambiar a offsetX/clientWidth "para arreglar el zoom": con
   *  un zoom CSS en el documento (LOW lo aplica con Ctrl +/− sobre
   *  documentElement) el rect Y offsetX/clientX vienen los dos en píxeles
   *  VISUALES y en la MISMA escala, así que esta cuenta ya es invariante al
   *  zoom. Lo que descoloca el trazo es mezclarla con `clientWidth`, que está
   *  en píxeles de LAYOUT (con zoom 1.25: rect 1280 vs clientWidth 1024). */
  /** Caja del canvas. Única fuente para mapear puntero↔mundo: el lazo, el snap
   *  de vértices, la tijera y el relleno proyectan mundo→pantalla con ESTA
   *  misma caja, así nunca quedan en otra escala que el puntero. */
  private canvasBox(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  private pointerInCanvas(e: PointerEvent): [number, number] {
    const rect = this.canvasBox();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  private setPointerFromEvent(e: PointerEvent): void {
    const rect = this.canvasBox();
    const [x, y] = this.pointerInCanvas(e);
    this.pointer.x = (x / rect.width) * 2 - 1;
    this.pointer.y = -(y / rect.height) * 2 + 1;
  }

  /** Igual que pointerInCanvas: el anillo del pincel, el lazo y el umbral de
   *  arrastre viven en el mismo espacio que el canvas (inmune al zoom CSS). */
  private screenOf(e: PointerEvent): [number, number] {
    return this.pointerInCanvas(e);
  }

  private updateCursor(e: PointerEvent): void {
    const [x, y] = this.screenOf(e);
    const size = Math.max(6, this.brush.size);
    this.cursorEl.style.display = 'block';
    this.cursorEl.style.width = `${size}px`;
    this.cursorEl.style.height = `${size}px`;
    this.cursorEl.style.left = `${x}px`;
    this.cursorEl.style.top = `${y}px`;
  }

  /** Rayo → superficie/guía si hay; si no, plano que mira a la cámara.
   *  `noSupport` marca ese último caso — ninguna guía/superficie/trazo real
   *  bajo el cursor, solo el plano genérico — así beginDraw() sabe cuándo
   *  hace falta auto-generar una guía real (ver commitStroke). */
  /** Un plano visto casi DE CANTO no sirve como soporte: el rayo es paralelo a
   *  él, así que o no intersecta o devuelve un punto lejísimo (de ahí los saltos
   *  erráticos y el "no dibuja" al pasar a una vista lateral). */
  /** Plano infinito que contiene a una superficie plana: su normal local +Z
   *  llevada a mundo, pasando por su posición. */
  private surfacePlane(mesh: THREE.Object3D): THREE.Plane {
    mesh.updateMatrixWorld();
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
    return new THREE.Plane().setFromNormalAndCoplanarPoint(n, mesh.getWorldPosition(new THREE.Vector3()));
  }

  private planeIsEdgeOn(plane: THREE.Plane): boolean {
    return Math.abs(this.raycaster.ray.direction.dot(plane.normal)) < 0.08;
  }

  /** Punto de una superficie CURVA (esfera/cilindro/toro) más cercano al rayo,
   *  aunque el rayo no la toque.
   *
   *  Hace falta porque dibujar sobre una esfera se iba de las manos: mientras el
   *  cursor estaba sobre la malla el trazo se apoyaba bien, pero al pasar la
   *  silueta el punto seguía por el plano TANGENTE al primer contacto y salía
   *  disparado. Medido en un solo trazo sobre una esfera de radio 1.5: el radio
   *  de los puntos pasaba de 1.5 a 4.8, o sea el trazo terminaba a tres radios
   *  de la superficie sobre la que se creía estar dibujando.
   *
   *  Proyectando, el trazo se queda pegado a la superficie y al llegar al borde
   *  se DESLIZA por la silueta, que es lo que uno espera al dibujar sobre un
   *  volumen (y lo que hacen Feather o el Grease Pencil de Blender).
   *
   *  Se trabaja en coordenadas LOCALES de la malla: así la posición, rotación y
   *  escala de la superficie salen gratis por la matriz, sin deshacerlas a mano.
   *  `loft` no tiene forma analítica: devuelve null y el llamador se queda con
   *  el comportamiento anterior. */
  private projectOnSurface(s: SurfaceObj): { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    s.mesh.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(s.mesh.matrixWorld).invert();
    const o = this.raycaster.ray.origin.clone().applyMatrix4(inv);
    const dir = this.raycaster.ray.direction.clone().transformDirection(inv).normalize();
    // punto del rayo más cercano al centro local de la superficie
    const t = -o.dot(dir);
    const cerca = o.clone().add(dir.clone().multiplyScalar(Math.max(0, t)));
    return this.pegarASuperficieLocal(s, cerca);
  }

  /** Pega un punto del MUNDO a la piel de la superficie. Se usa para sanear
   *  cada punto del trazo: "dibujar sobre la esfera" significa que los puntos
   *  están EN la esfera, y conviene no depender de qué rama del raycast los
   *  produjo. De paso saca el facetado — el raycast devuelve el punto sobre la
   *  cara plana del mallado, hasta 0.03 por dentro de la esfera ideal, y eso se
   *  notaba como un trazo levemente hundido y ondulado. */
  private pegarASuperficie(s: SurfaceObj, puntoMundo: THREE.Vector3):
      { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    s.mesh.updateMatrixWorld();
    const inv = new THREE.Matrix4().copy(s.mesh.matrixWorld).invert();
    return this.pegarASuperficieLocal(s, puntoMundo.clone().applyMatrix4(inv));
  }

  /** El cálculo en sí, con el punto YA en coordenadas locales de la malla. */
  private pegarASuperficieLocal(s: SurfaceObj, cerca: THREE.Vector3):
      { point: THREE.Vector3; normal: THREE.Vector3 } | null {
    const par = (s.mesh.geometry as unknown as { parameters?: Record<string, number> }).parameters;
    if (!par) return null;
    let punto: THREE.Vector3;
    let normal: THREE.Vector3;
    if (s.type === 'sphere') {
      const r = par.radius ?? 1;
      const n = cerca.lengthSq() > 1e-12 ? cerca.clone().normalize() : new THREE.Vector3(0, 0, 1);
      punto = n.clone().multiplyScalar(r);
      normal = n;
    } else if (s.type === 'cylinder') {
      // eje Y, sin tapas: radial en XZ y limitado a la altura de la malla
      const r = par.radiusTop ?? par.radius ?? 1;
      const h = (par.height ?? r * 2) / 2;
      const radial = new THREE.Vector3(cerca.x, 0, cerca.z);
      if (radial.lengthSq() < 1e-12) radial.set(0, 0, 1);
      radial.normalize();
      punto = new THREE.Vector3(radial.x * r, THREE.MathUtils.clamp(cerca.y, -h, h), radial.z * r);
      normal = radial;
    } else if (s.type === 'torus') {
      // primero al circulo mayor (plano XY), despues al tubo
      const R = par.radius ?? 1;
      const tubo = par.tube ?? R * 0.35;
      const enPlano = new THREE.Vector3(cerca.x, cerca.y, 0);
      // EL AGUJERO NO ES SUPERFICIE. Adentro del agujero el punto mas cercano
      // del toro esta sobre el borde interno, del lado al que apunte `enPlano`
      // — y al cruzar el centro ese lado se DA VUELTA. MEDIDO barriendo el
      // cursor de izquierda a derecha por el medio de un toro (R=1.4,
      // tubo=0.49): el punto se quedaba clavado en x=-0.91 mientras el cursor
      // avanzaba, y al pasar el centro saltaba a x=+0.91. 1.82 de un cuadro al
      // otro, un tercio del largo del trazo, y siempre DE COSTADO: la tinta se
      // iba lejos del cursor. Devolver null deja que el llamador use el plano
      // por el centro, que sigue al cursor y empalma sin escalon (en el borde
      // del agujero la proyeccion ya daba z=0, que es la z de ese plano).
      if (enPlano.length() < R - tubo) return null;
      if (enPlano.lengthSq() < 1e-12) enPlano.set(1, 0, 0);
      const centroTubo = enPlano.clone().normalize().multiplyScalar(R);
      const haciaFuera = cerca.clone().sub(centroTubo);
      if (haciaFuera.lengthSq() < 1e-12) haciaFuera.set(0, 0, 1);
      haciaFuera.normalize();
      punto = centroTubo.add(haciaFuera.clone().multiplyScalar(tubo));
      normal = haciaFuera;
    } else {
      return null;
    }
    return {
      point: punto.applyMatrix4(s.mesh.matrixWorld),
      normal: normal.transformDirection(s.mesh.matrixWorld).normalize(),
    };
  }

  /** La superficie activa, si la hay. */
  private activeSurfaceObj(): SurfaceObj | undefined {
    return this.activeSurfaceId ? this.surfaces.find((x) => x.id === this.activeSurfaceId) : undefined;
  }

  private resolveHit(): HitInfo | null {
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    // PRIORIDAD: la guía ACTIVA gana sobre cualquier otra superficie. Con varias
    // guías, el rayo agarraba la que quedaba más cerca en profundidad (aunque no
    // fuera la que estás usando). Si el cursor está sobre la malla de la guía
    // activa, se usa esa; así "dibujás donde tenés la guía activa".
    if (this.tool !== 'guide' && this.activeGuide && !this.activeGuideIsEdgeOn()) {
      const ah = this.raycaster.intersectObject(this.activeGuide.mesh, false);
      if (ah.length) {
        const h = ah[0];
        const normal = h.face
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
          : new THREE.Vector3(0, 0, 1);
        return { point: h.point.clone(), normal, target: this.activeGuide.mesh, plane: this.activeGuide.plane?.clone(), kind: 'guide' };
      }
      // La guía activa conserva prioridad también fuera de su malla visible.
      // Antes se probaban otras superficies primero y Z podía cambiar a mitad
      // del trazo, produciendo rectas largas como las de la captura.
      if (this.activeGuide.plane && !this.planeIsEdgeOn(this.activeGuide.plane)) {
        const gp = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(this.activeGuide.plane, gp)) {
          return { point: gp, normal: this.activeGuide.plane.normal.clone(), target: this.activeGuide.mesh, plane: this.activeGuide.plane.clone(), kind: 'guide' };
        }
      }
    }
    // PRIORIDAD de la SUPERFICIE ACTIVA (el plano que elegiste en la barra).
    // Igual que la guía activa: si está elegida, es EL soporte del trazo. Antes
    // solo se la intersectaba como una malla más, así que apenas el cursor
    // salía de su cuadrado finito el punto caía en el plano de la vista (otra
    // profundidad) y el dibujo "no respetaba el plano".
    if (this.tool !== 'guide' && this.activeSurfaceId) {
      const act = this.surfaces.find((x) => x.id === this.activeSurfaceId);
      // Un plano visto DE CANTO no se usa ni por su malla: el rayo casi
      // paralelo le pega en puntos arbitrarios a lo largo de su profundidad y
      // devuelve una Z errática (el trazo salía deformado en vez de plano).
      const edgeOn = act && act.type === 'plane' && this.planeIsEdgeOn(this.surfacePlane(act.mesh));
      if (act && !edgeOn) {
        const ah = this.raycaster.intersectObject(act.mesh, false);
        if (ah.length) {
          const h = ah[0];
          const normal = h.face
            ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
            : new THREE.Vector3(0, 0, 1);
          return { point: h.point.clone(), normal, target: act.mesh, kind: 'surface' };
        }
        // Fuera del cuadrado visible: para un PLANO se sigue usando su plano
        // infinito (misma profundidad).
        if (act.type === 'plane') {
          const pl = this.surfacePlane(act.mesh);
          if (!this.planeIsEdgeOn(pl)) {
            const p = new THREE.Vector3();
            if (this.raycaster.ray.intersectPlane(pl, p)) {
              return { point: p, normal: pl.normal.clone(), target: act.mesh, plane: pl.clone(), kind: 'surface' };
            }
          }
        } else {
          // CURVAS (esfera, cilindro, toro): fuera de la malla el punto se
          // PROYECTA sobre la superficie. Antes se usaba el plano que pasa por
          // su centro de frente a la cámara, y eso dejaba el punto DENTRO del
          // volumen: en una esfera de radio 1.5 el primer punto del trazo
          // aparecía a radio 1.4, hundido bajo la piel donde se creía dibujar.
          const proy = this.projectOnSurface(act);
          if (proy) {
            return { point: proy.point, normal: proy.normal, target: act.mesh, kind: 'surface' };
          }
          // loft (y cualquiera sin forma analítica): plano por el centro
          const centro = act.mesh.getWorldPosition(new THREE.Vector3());
          const haciaCam = new THREE.Vector3();
          (this.camera as THREE.Camera).getWorldDirection(haciaCam);
          const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(haciaCam.negate(), centro);
          const p = new THREE.Vector3();
          if (this.raycaster.ray.intersectPlane(pl, p)) {
            return { point: p, normal: pl.normal.clone(), target: act.mesh, plane: pl.clone(), kind: 'surface' };
          }
        }
      }
    }
    const targets: THREE.Object3D[] = this.surfaces.map((s) => s.mesh);
    // Una vez que ya hay forma armada, no hace falta seguir creando guías
    // para todo: se puede dibujar directamente APOYADO en los trazos ya
    // hechos (como el Grease Pencil de Blender sobre una malla), igual que
    // Feather permite dibujar sobre la superficie de un volumen existente.
    // No aplica al crear una guía nueva (tool 'guide'): ahí conviene que la
    // normal de apoyo salga de una superficie plana real, no del borde
    // curvo de un tubo de tinta.
    // Apoyarse en los trazos ya dibujados solo tiene sentido en PERSPECTIVA
    // (dibujar sobre el volumen ya armado, tipo Grease Pencil). En ORTOGONAL
    // arruina el dibujo plano: al cruzar una línea anterior el rayo pega en su
    // TUBO y el punto se corre media caña en profundidad (un rectángulo salía
    // con los lados a distinta Z en vez de coplanar).
    if (this.tool !== 'guide' && this.view === 'persp') {
      this.strokesGroup.traverse((o) => { if ((o as THREE.Mesh).isMesh) targets.push(o); });
    }
    if (targets.length) {
      const hits = this.raycaster.intersectObjects(targets, false);
      if (hits.length) {
        const h = hits[0];
        const normal = h.face
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
          : new THREE.Vector3(0, 0, 1);
        let obj: THREE.Object3D | null = h.object;
        while (obj?.parent && obj.parent !== this.strokesGroup && obj.parent !== this.surfacesGroup && obj.parent !== this.guidesGroup) obj = obj.parent;
        const target = obj ?? h.object;
        const isStroke = !!this.strokes.find((s) => s.object === target || s.object === target.parent);
        const isGuide = !!this.guides.find((g) => g.mesh === target || g.mesh === h.object);
        return { point: h.point.clone(), normal, target, kind: isGuide ? 'guide' : isStroke ? 'stroke' : 'surface' };
      }
    }
    // Guía activa: si el rayo no tocó la malla finita, proyectar sobre el PLANO
    // (infinito) de la guía → los trazos caen EXACTAMENTE donde se hizo la guía,
    // no en el centro del dibujo (como esperaba el usuario en vista de lado).
    // NO al crear una guía nueva (tool 'guide'): esa se dibuja sobre el plano
    // de la cámara, no sobre la guía anterior.
    if (this.tool !== 'guide' && this.activeGuide?.plane && !this.planeIsEdgeOn(this.activeGuide.plane)) {
      const gp = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.activeGuide.plane, gp)) {
        return { point: gp.clone(), normal: this.activeGuide.plane.normal.clone(), target: this.activeGuide.mesh, plane: this.activeGuide.plane.clone(), kind: 'guide' };
      }
    }
    // En PERSPECTIVA un trazo sin soporte es ambiguo (terminaba cayendo en el
    // centro de la escena), así que se sigue exigiendo guía/superficie.
    // En vista ORTOGONAL no hay ambigüedad: la vista define un plano de dibujo
    // único y evidente (es dibujar sobre "papel" en esa vista). Ahí se permite
    // el plano de cámara y, al soltar, `noSupport` auto-genera la guía real
    // desde el propio trazo — el flujo de Feather.
    if (this.tool !== 'guide' && this.view === 'persp') return null;
    const camDir = new THREE.Vector3();
    (this.camera as THREE.Camera).getWorldDirection(camDir);
    this.fallbackPlane.setFromNormalAndCoplanarPoint(camDir.clone().negate(), this.controls.target);
    const p = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.fallbackPlane, p)) {
      // `noSupport` dispara la auto-creación de una guía al soltar (ver
      // commitStroke). En PERSPECTIVA eso está bien (el trazo cayó en un plano
      // implícito y conviene fijarlo). En ORTOGONAL no: la vista YA es un plano
      // de dibujo legítimo, y auto-generar una guía por cada trazo llenaba la
      // escena de paredes que después secuestraban los trazos siguientes.
      return { point: p.clone(), normal: this.fallbackPlane.normal.clone(), noSupport: this.view === 'persp', plane: this.fallbackPlane.clone(), kind: 'fallback' };
    }
    return null;
  }

  // ---------------------------------------------------------------- dibujo libre ("en el aire")

  /** Primera vez que se entra al modo: arrancar la profundidad en la
   *  distancia de órbita actual (donde ya está mirando la cámara), no en un
   *  valor arbitrario — así el primer punto cae cerca de lo que se ve. */
  private ensureFreeDrawDepth(): void {
    if (this.freeDrawDepth > 0) return;
    this.freeDrawDepth = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(this.controls.target),
      WebGLDesign3D.FREE_DEPTH_MIN, WebGLDesign3D.FREE_DEPTH_MAX,
    );
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.tool !== 'pencil-free') return;
    e.preventDefault();
    this.ensureFreeDrawDepth();
    // multiplicativo (no aditivo): el mismo gesto de scroll acerca/aleja el
    // mismo PORCENTAJE ya sea que estés a 0.5m o a 50m de la cámara.
    const factor = Math.exp(-e.deltaY * 0.0012);
    this.freeDrawDepth = THREE.MathUtils.clamp(this.freeDrawDepth * factor, WebGLDesign3D.FREE_DEPTH_MIN, WebGLDesign3D.FREE_DEPTH_MAX);
    this.updateFreeDrawPreview();
  };

  /** Punto sobre el rayo de cámara a `freeDrawDepth` de distancia — nunca
   *  proyecta sobre ninguna guía/superficie/trazo, es la esencia del modo:
   *  dibujar en cualquier dirección del espacio, no solo sobre un plano. */
  private resolveFreeHit(): { point: THREE.Vector3; normal: THREE.Vector3 } {
    this.ensureFreeDrawDepth();
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const point = this.raycaster.ray.origin.clone().addScaledVector(this.raycaster.ray.direction, this.freeDrawDepth);
    const normal = this.raycaster.ray.direction.clone().negate();
    return { point, normal };
  }

  /** Punto del gesto EN CURSO, respetando la superficie donde se apoya.
   *
   *  Existe para que moveDraw, endDraw y pointFromScreen decidan IGUAL. Antes
   *  cada uno llamaba a intersectLockedDrawContext() por su cuenta, que fuera
   *  de la malla cae al plano tangente del primer contacto; el cierre del trazo
   *  reemplaza el último punto con eso, y como el commit remuestrea entre el
   *  último punto bueno y ese, la última mitad del trazo se despegaba de la
   *  esfera aunque cada punto intermedio hubiera estado bien (medido: los
   *  puntos iban de radio 1.40 a 2.62 sobre una esfera de radio 1.4). */
  private lockedHit(): HitInfo | null {
    const hit = this.intersectLockedDrawContext();
    const act = this.activeSurfaceObj();
    if (!act || act.type === 'plane' || this.current?.drawTarget !== act.mesh) return hit;
    const sh = this.raycaster.intersectObject(act.mesh, false);
    if (sh.length) {
      const h = sh[0];
      // se pega a la piel ideal: el raycast devuelve el punto de la CARA plana
      // del mallado, un poco por dentro, y eso deja el trazo ondulado
      const liso = this.pegarASuperficie(act, h.point);
      return {
        point: liso ? liso.point : h.point.clone(),
        normal: liso ? liso.normal : (h.face
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
          : (hit?.normal.clone() ?? new THREE.Vector3(0, 0, 1))),
        target: act.mesh,
      };
    }
    // pasado el borde de la silueta, DESLIZA por la superficie
    const proy = this.projectOnSurface(act);
    return proy ? { point: proy.point, normal: proy.normal, target: act.mesh } : hit;
  }

  private intersectLockedDrawContext(): HitInfo | null {
    if (!this.current?.drawTarget && !this.current?.drawPlane) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    if (this.current.drawTarget) {
      const hits = this.raycaster
        .intersectObject(this.current.drawTarget, true)
        .filter((h) => (h.object as THREE.Mesh).isMesh);
      if (hits.length) {
        const h = hits[0];
        const normal = h.face
          ? h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize()
          : this.current.baseNormal?.clone() ?? new THREE.Vector3(0, 0, 1);
        return { point: h.point.clone(), normal, target: this.current.drawTarget, plane: this.current.drawPlane?.clone() };
      }
    }
    if (this.current.drawPlane) {
      const p = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.current.drawPlane, p)) {
        return { point: p, normal: this.current.drawPlane.normal.clone(), plane: this.current.drawPlane.clone() };
      }
    }
    return null;
  }

  /** Mira de puntería + lectura numérica de profundidad, actualizada en cada
   *  pointermove (aun sin estar dibujando: sirve para "apuntar" antes de
   *  bajar el lápiz) y en cada scroll. */
  private updateFreeDrawPreview(): void {
    if (this.tool !== 'pencil-free' || !this.freeDrawPreview) return;
    const hit = this.resolveFreeHit();
    this.freeDrawPreview.position.copy(hit.point);
    this.freeDrawPreview.visible = true;
    const w = hit.point.clone().project(this.camera as THREE.Camera);
    const rect = this.canvasBox();
    this.freeDepthEl.style.left = `${((w.x + 1) / 2) * rect.width}px`;
    this.freeDepthEl.style.top = `${((1 - w.y) / 2) * rect.height}px`;
    this.freeDepthEl.style.display = 'block';
    this.freeDepthEl.textContent = `${this.freeDrawDepth.toFixed(2)} m`;
  }

  private hideFreeDrawPreview(): void {
    if (this.freeDrawPreview) this.freeDrawPreview.visible = false;
    if (this.freeDepthEl) this.freeDepthEl.style.display = 'none';
  }

  private pickStroke(): StrokeRecord | null {
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const meshes: THREE.Object3D[] = [];
    const collect = (g: THREE.Group) => g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    collect(this.strokesGroup);
    collect(this.guidesGroup);
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.strokeId) obj = obj.parent;
    if (!obj) return null;
    const rec = this.strokes.find((s) => s.id === obj!.userData.strokeId) ?? null;
    // los trazos de una capa bloqueada son inertes: no se seleccionan ni se
    // agarran para mover/liquify/editar.
    return rec && this.isLayerLocked(rec.layerId) ? null : rec;
  }

  // ---------------------------------------------------------------- tijera (cortar trazos)

  /** Trazo + índice del punto de control más cercano al click — ahí se corta.
   *  No hace falta detectar el cruce con OTRA curva: se corta donde el
   *  usuario clickea sobre la línea, igual que la herramienta Tijera de
   *  Illustrator — que suele ser justo donde dos trazos se cruzan visualmente. */
  private pickCutPoint(): { rec: StrokeRecord; index: number } | null {
    // Proximidad EN PANTALLA (no raycast al tubo): el tubo es finísimo y pegarle
    // exacto es casi imposible → antes "no hacía nada". Ahora corta en el punto
    // de control más cercano al click dentro de un radio en px.
    const rect = this.canvasBox();
    const cx = ((this.pointer.x + 1) / 2) * rect.width;
    const cy = ((1 - this.pointer.y) / 2) * rect.height;
    const cam = this.camera as THREE.Camera;
    let best: { rec: StrokeRecord; index: number } | null = null;
    let bestDist = 22; // px
    for (const rec of this.strokes) {
      if (rec.kind !== 'stroke' || rec.points.length < 3) continue;
      if (this.isLayerLocked(rec.layerId)) continue; // no se corta un trazo bloqueado
      rec.object.updateMatrixWorld(true);
      for (let i = 0; i < rec.points.length; i++) {
        const w = rec.object.localToWorld(rec.points[i].clone()).project(cam);
        const sx = ((w.x + 1) / 2) * rect.width;
        const sy = ((1 - w.y) / 2) * rect.height;
        const d = Math.hypot(sx - cx, sy - cy);
        if (d < bestDist) { bestDist = d; best = { rec, index: i }; }
      }
    }
    return best;
  }

  /** Divide un trazo en dos en el índice dado (ambos comparten el punto de
   *  corte, sin hueco visual). Deshacer restaura el trazo original entero. */
  private cutStroke(rec: StrokeRecord, index: number): void {
    if (index <= 0 || index >= rec.points.length - 1) return; // nada que cortar en una punta
    // Dejar un HUECO visible a cada lado del corte (si no, las dos mitades
    // quedan idénticas al trazo original y parece que "no hizo nada").
    const P = rec.points;
    const GAP = 0.06; // luz del corte por lado (mundo)
    let ja = index, accA = 0;
    while (ja > 1 && accA < GAP) { accA += P[ja].distanceTo(P[ja - 1]); ja--; }
    let jb = index, accB = 0;
    while (jb < P.length - 2 && accB < GAP) { accB += P[jb].distanceTo(P[jb + 1]); jb++; }
    const ptsA = P.slice(0, ja + 1).map((p) => p.clone());
    const prsA = rec.pressures.slice(0, ja + 1);
    const ptsB = P.slice(jb).map((p) => p.clone());
    const prsB = rec.pressures.slice(jb);
    if (ptsA.length < 2 || ptsB.length < 2) return;

    const makeHalf = (pts: THREE.Vector3[], prs: number[]): StrokeRecord => {
      const group = new THREE.Group();
      group.position.copy(rec.object.position);
      const a = this.buildTube(pts, prs, rec.brush);
      if (a) group.add(a);
      const half: StrokeRecord = {
        id: `stroke-${this.seq++}`, object: group, points: pts, pressures: prs,
        kind: 'stroke', layerId: rec.layerId, baseOpacity: rec.baseOpacity, brush: { ...rec.brush },
      };
      group.userData.strokeId = half.id;
      return half;
    };

    const halfA = makeHalf(ptsA, prsA);
    const halfB = makeHalf(ptsB, prsB);
    this.removeStrokeRecord(rec);
    this.addStrokeRecord(halfA);
    this.addStrokeRecord(halfB);
    this.pushCmd({
      undo: () => { this.removeStrokeRecord(halfA); this.removeStrokeRecord(halfB); this.addStrokeRecord(rec); },
      redo: () => { this.removeStrokeRecord(rec); this.addStrokeRecord(halfA); this.addStrokeRecord(halfB); },
    });
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button !== 0 || e.pointerType === 'touch' || !e.isPrimary) return;
    if (this.activePointerId !== null) return;
    if (this.panMode) return; // Espacio = mano: OrbitControls panea, no dibujar
    this.setPointerFromEvent(e);
    this.updateCursor(e);
    this.downScreen.set(...this.screenOf(e));

    if (this.tool === 'pencil' || this.tool === 'guide' || this.tool === 'pencil-free') {
      this.activePointerId = e.pointerId;
      this.beginDraw(e);
      if (this.mode !== 'draw') this.activePointerId = null;
    } else if (this.tool === 'move') {
      // el eje móvil del pivote de rotación tiene prioridad sobre los
      // anillos del gizmo: es un blanco más chico y conviene poder
      // agarrarlo aunque quede pegado a ellos en pantalla.
      // el joystick es lo primero que se prueba: sus blancos estan ENCIMA del
      // dibujo, asi que un click ahi nunca deberia seleccionar lo que hay detras
      if (this.joyTryBegin(e)) return;
      if (this.currentGizmoMode === 'rotate' && !this.gizmo?.axis && this.pickPivotMarker()) {
        this.beginPivotDrag(e);
        return;
      }
      // el pointerdown sobre un handle del gizmo lo maneja TransformControls
      // solo (su propio listener, ya enterado por el hover del pointermove
      // anterior) — no arrancar además un lazo/mover libre encima.
      if (this.gizmo?.axis) return;
      const rec = this.pickStroke();
      if (rec) {
        if (e.shiftKey) {
          // Shift = SUMAR/QUITAR de la selección (y volver a clickear uno ya
          // elegido lo saca), como en cualquier editor.
          const next = new Set(this.selected);
          if (next.has(rec)) next.delete(rec); else next.add(rec);
          this.setSelection([...next]);
          if (!this.selected.size) return;
        } else if (!this.selected.has(rec)) this.setSelection([rec]);
        this.beginMove();
      } else {
        const g = this.pickGuide();
        if (g) this.selectGuide(g);
        else {
          // también se pueden agarrar las superficies (plano/cilindro/…) para
          // moverlas, escalarlas y rotarlas con el gizmo.
          const su = this.pickSurface();
          if (su) this.selectSurface(su);
          else { this.selectGuide(null); this.selectSurface(null); this.beginLasso(e); }
        }
      }
    } else if (this.tool === 'select') {
      this.onSelectPointerDown(e);
    } else if (this.tool === 'eraser') {
      this.beginLasso(e); // click corto = borrar bajo cursor; arrastre = lazo
    } else if (this.tool === 'rect' || this.tool === 'circle' || this.tool === 'poly') {
      this.beginShape(e);
    } else if (this.tool === 'fill') {
      this.fillAtPointer();
    } else if (this.tool === 'scissors') {
      const cut = this.pickCutPoint();
      if (cut) this.cutStroke(cut.rec, cut.index);
    } else if (this.tool === 'liquify') {
      this.beginLiquify(e);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    if (this.mode === 'draw' && e.pointerType === 'pen' && e.pressure === 0 && e.buttons === 0) return;
    this.updateCursor(e);
    this.setPointerFromEvent(e);
    if (this.mode === 'draw') { if (this.shape) this.moveShape(e); else this.moveDraw(e); }
    else if (this.mode === 'move') this.moveDrag(e);
    else if (this.mode === 'lasso') this.moveLasso(e);
    else if (this.mode === 'point-drag') this.movePointDrag();
    else if (this.mode === 'pivot-drag') this.movePivotDrag();
    else if (this.mode === 'liquify-drag') this.moveLiquify();
    else if (this.mode === 'joystick') this.joyMoveDrag(e);
    // sin gesto en curso, el joystick resalta la parte que esta bajo el cursor:
    // hay que poder saber QUE vas a agarrar antes de apretar
    if (this.mode === 'idle' && this.joyOn && this.joy && this.tool === 'move') {
      this.joyRefresh();
      this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
      this.joy.hover(this.joy.pick(this.raycaster));
    }
    if (this.tool === 'pencil-free') this.updateFreeDrawPreview();
  };

  private onPointerLeave = (): void => {
    if (this.mode === 'idle') this.cursorEl.style.display = 'none';
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    if (this.mode === 'draw') { if (this.shape) this.endShape(e); else this.endDraw(e); }
    else if (this.mode === 'move') { this.endMove(); }
    else if (this.mode === 'lasso') { this.endLasso(e); }
    else if (this.mode === 'point-drag') { this.endPointDrag(); }
    else if (this.mode === 'pivot-drag') { this.endPivotDrag(); }
    else if (this.mode === 'liquify-drag') { this.endLiquify(); }
    else if (this.mode === 'joystick') { this.joyEndDrag(); }
    this.mode = 'idle';
    this.controls.enabled = true;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    this.activePointerId = null;
  };

  /** Hace tolerantes los métodos de captura de puntero DEL ELEMENTO, no solo
   *  nuestras llamadas. Es el mismo parche que ya usa ui/lienzo3d.js.
   *
   *  `setPointerCapture` tira NotFoundError si el pointer ya no existe — pasa
   *  con un stylus que se levanta muy rápido (el pointer desaparece antes de
   *  que llegue el pointerdown) y con eventos sintéticos. Lo importante es que
   *  las llamadas NO son solo nuestras: three.js las hace adentro de
   *  OrbitControls (`scope.domElement.setPointerCapture`) y de
   *  TransformControls (`this.domElement.setPointerCapture`), sin try/catch. Al
   *  reventar ahí, el handler de la librería se corta a mitad y la órbita o el
   *  gizmo quedan en un estado inconsistente. Parchear el elemento cubre los
   *  tres orígenes de una sola vez. */
  private makePointerCaptureTolerant(el: HTMLElement): void {
    const rawSet = el.setPointerCapture.bind(el);
    const rawRel = el.releasePointerCapture.bind(el);
    el.setPointerCapture = (id: number) => { try { rawSet(id); } catch { /* pointer ido */ } };
    el.releasePointerCapture = (id: number) => { try { rawRel(id); } catch { /* pointer ido */ } };
  }

  /** Captura del puntero TOLERANTE, igual que en ui/lienzo3d.js.
   *
   *  `setPointerCapture` tira NotFoundError si el pointer ya no existe — pasa
   *  con un stylus que se levanta muy rápido, o con eventos sintéticos. Sin el
   *  try/catch la excepción salía DESDE ADENTRO de beginDraw()/beginMove(),
   *  abortando la operación después de haber puesto `mode` y desactivado los
   *  controles: el trazo no arrancaba y la órbita quedaba trabada hasta el
   *  siguiente pointerup. `releasePointerCapture` ya estaba protegido; esto
   *  cierra la otra mitad. */
  private capturePointer(e: PointerEvent): void {
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* pointer ido */ }
  }

  /** ¿La guía activa se ve de canto desde la cámara actual? Es decir: el rayo
   *  del lápiz corre casi paralelo a su plano, así que no la puede tocar por
   *  más que esté ahí. Umbral en 3° sobre el plano. */
  private activeGuideIsEdgeOn(): boolean {
    const pl = this.activeGuide?.plane;
    if (!pl) return false;
    const dir = new THREE.Vector3();
    (this.camera as THREE.Camera).getWorldDirection(dir);
    // |cos| entre la dirección de vista y la NORMAL ~ 0 → vista rasante
    return Math.abs(dir.dot(pl.normal)) < Math.sin(THREE.MathUtils.degToRad(3));
  }

  private static readonly TOOL_KEYS: Record<string, ToolType> = {
    p: 'pencil', g: 'guide', v: 'move', a: 'select', e: 'eraser', l: 'liquify', c: 'scissors', f: 'pencil-free',
    b: 'fill', // balde: rellenar la forma cerrada

  };

  private panMode = false; // barra espaciadora = mano (pan de cámara)

  private onKeyDown = (e: KeyboardEvent): void => {
    const ctrl = e.ctrlKey || e.metaKey;
    const target = document.activeElement;
    const typing = target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
    // Los campos conservan Supr, Backspace, copiar/pegar y su propio Undo.
    if(typing || e.defaultPrevented)return;
    if(e.key==='Home'){e.preventDefault();this.frameContent();return;}
    // Barra espaciadora = MANO: mientras se mantiene, el botón izquierdo panea
    // (mover la vista vertical/horizontal, sobre todo en vistas ortogonales).
    if (e.code === 'Space' && !typing) {
      e.preventDefault();
      if (!this.panMode) {
        this.panMode = true;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        this.controls.enabled = true;
        this.canvas.style.cursor = 'grab';
      }
      return;
    }
    if (!ctrl && !e.altKey && !typing && WebGLDesign3D.TOOL_KEYS[e.key.toLowerCase()]) {
      e.preventDefault();
      lowStore.setCurrentTool(WebGLDesign3D.TOOL_KEYS[e.key.toLowerCase()]);
      return;
    }
    if (ctrl && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey || e.altKey) this.redo();
      else this.undo();
    } else if (ctrl && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.redo();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selected.size) { e.preventDefault(); this.deleteSelection(); }
      // Supr también borra la superficie o la guía que estén agarradas con el
      // gizmo (antes solo borraba trazos).
      else if (this.selectedSurface) {
        e.preventDefault();
        const id = this.selectedSurface.id;
        this.deleteSurfaceById(id);
        if (this.lastSurfaceKey) { this.lastSurfaceKey = ''; lowStore.setActiveSurface(null); }
      } else if (this.selectedGuide) { e.preventDefault(); this.deleteGuideById(this.selectedGuide.id); }
    } else if (ctrl && e.key.toLowerCase() === 'c') {
      if (this.selected.size) { e.preventDefault(); this.copySelection(); }
    } else if (ctrl && e.key.toLowerCase() === 'v') {
      if (this.clipboard.length) { e.preventDefault(); this.pasteClipboard(); }
    } else if (!ctrl && e.key.toLowerCase() === 'j' && !typing) {
      // J: joystick si/no. T: 3D <-> 2D. K: candado (precision).
      e.preventDefault();
      this.setJoystick(!this.joyOn);
    } else if (!ctrl && e.key.toLowerCase() === 't' && !typing && this.joyOn) {
      e.preventDefault();
      this.toggleJoyMode();
    } else if (!ctrl && e.key.toLowerCase() === 'k' && !typing && this.joyOn) {
      e.preventDefault();
      this.setJoyLocked(!this.getJoyLocked());
    } else if (ctrl && e.key.toLowerCase() === 'e') {
      if (this.selected.size) { e.preventDefault(); this.solidifySelection(); }
    } else if (ctrl && e.key.toLowerCase() === 'g') {
      // Ctrl+G agrupa, Ctrl+Shift+G desagrupa (como en cualquier editor).
      e.preventDefault();
      if (e.shiftKey) this.ungroupSelection(); else this.groupSelection();
    } else if (ctrl && e.key.toLowerCase() === 'd') {
      if (this.selectedGuide) { e.preventDefault(); this.duplicateGuide(this.selectedGuide); }
    } else if (e.key.startsWith('Arrow') && !typing) {
      // FLECHAS: ajuste fino de lo que esté seleccionado (trazos, guía o
      // superficie). El desplazamiento va en el plano de la PANTALLA — derecha
      // y arriba de la cámara — así "arriba" es arriba en lo que estás viendo,
      // no un eje del mundo que en esa vista puede ir para cualquier lado.
      const objs = this.transformTargets();
      if (!objs.length) return;
      e.preventDefault();
      const step = (e.shiftKey ? 0.25 : 0.05) * (this.view === 'persp' ? 1 : this.orthoSize / ORTHO_SIZE);
      const cam = this.camera as THREE.Camera;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const delta = new THREE.Vector3();
      if (e.key === 'ArrowRight') delta.copy(right).multiplyScalar(step);
      else if (e.key === 'ArrowLeft') delta.copy(right).multiplyScalar(-step);
      else if (e.key === 'ArrowUp') delta.copy(up).multiplyScalar(step);
      else if (e.key === 'ArrowDown') delta.copy(up).multiplyScalar(-step);
      const move = (d: THREE.Vector3) => objs.forEach((o) => o.position.add(d));
      move(delta);
      this.pushCmd({ undo: () => move(delta.clone().negate()), redo: () => move(delta) });
    }
    // Escape NO se maneja aca: lo pide el componente con escapeConsume(), que
    // decide si cancela algo o si corresponde cerrar el modulo 3D.
  };

  /** Objetos que responden a una transformación (flechas / gizmo): los trazos
   *  seleccionados, o la guía / superficie agarrada. */
  private transformTargets(): THREE.Object3D[] {
    if (this.selected.size) return [...this.selected].map((r) => r.object);
    if (this.selectedGuide) return [this.selectedGuide.mesh];
    if (this.selectedSurface) return [this.selectedSurface.mesh];
    return [];
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'Space' && this.panMode) {
      this.panMode = false;
      this.controls.mouseButtons.LEFT = -1 as unknown as THREE.MOUSE; // vuelve a dibujar
      this.canvas.style.cursor = 'none';
    }
  };

  // ---------------------------------------------------------------- portapapeles

  copySelection(): void {
    const strokesOnly = [...this.selected].filter((r) => r.kind === 'stroke');
    if (!strokesOnly.length) return;
    this.clipboard = strokesOnly.map((r) => ({
      points: r.points.map((p) => r.object.localToWorld(p.clone())),
      pressures: [...r.pressures],
      brush: { ...r.brush },
    }));
  }

  pasteClipboard(): void {
    if (!this.clipboard.length) return;
    const offset = new THREE.Vector3(0.18, 0, 0.18); // corrido para no tapar el original
    const created: StrokeRecord[] = [];
    for (const c of this.clipboard) {
      const pts = c.points.map((p) => p.clone());
      const pressures = [...c.pressures];
      const group = new THREE.Group();
      const a = this.buildTube(pts, pressures, c.brush);
      if (a) group.add(a);
      group.position.copy(offset);
      const rec: StrokeRecord = {
        id: `stroke-${this.seq++}`, object: group, points: pts, pressures, kind: 'stroke',
        layerId: this.activeLayerId(), baseOpacity: c.brush.opacity, brush: { ...c.brush },
      };
      group.userData.strokeId = rec.id;
      created.push(rec);
    }
    for (const rec of created) this.addStrokeRecord(rec);
    this.setSelection(created);
    this.pushCmd({
      undo: () => created.forEach((r) => this.removeStrokeRecord(r)),
      redo: () => created.forEach((r) => this.addStrokeRecord(r)),
    });
  }

  // ---------------------------------------------------------------- dibujo

  /** Presión normalizada 0–1 para esta muestra. El mouse no reporta presión
   *  real (siempre ~0.5 con botón apretado) → se ignora y dibuja a ancho
   *  completo; solo el lápiz/tableta modula el ancho del trazo. */
  private samplePressure(e: PointerEvent): number {
    if (e.pointerType !== 'pen') return 1;
    return THREE.MathUtils.clamp(e.pressure || 0.5, 0, 1);
  }

  private static readonly SNAP_PX = 14;

  /** Colores del imán. Cada tipo de enganche avisa con su propio color, para
   *  saber a QUÉ se está pegando el trazo sin tener que adivinarlo. */
  private static readonly SNAP_COLORS: Record<string, string> = {
    vertex: '#33B5E8',   // punta de otra línea (cian de LOW)
    line: '#33B5E8',     // cuerpo de otra línea
    guide: '#F0450E',    // guía o plano (naranja de LOW)
  };
  private snapMark?: THREE.Mesh;

  /** Alerta de color en el punto donde el imán va a pegar. Es un anillo chico
   *  que siempre mira a la cámara y se dibuja por encima de todo. */
  private showSnapMark(point: THREE.Vector3, kind: string): void {
    if (!this.snapMark) {
      const geo = new THREE.RingGeometry(0.045, 0.075, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.95,
        depthTest: false, side: THREE.DoubleSide,
      });
      this.snapMark = new THREE.Mesh(geo, mat);
      this.snapMark.renderOrder = 1002;
      this.handlesGroup.add(this.snapMark);
    }
    (this.snapMark.material as THREE.MeshBasicMaterial).color.set(
      WebGLDesign3D.SNAP_COLORS[kind] || WebGLDesign3D.SNAP_COLORS.vertex);
    this.snapMark.position.copy(point);
    this.snapMark.quaternion.copy((this.camera as THREE.Camera).quaternion);
    // tamaño constante en pantalla: en ortogonal el zoom cambia la escala del
    // mundo, y un anillo fijo se volvía invisible o gigante
    const k = this.view === 'persp'
      ? this.camera.position.distanceTo(point) * 0.06
      : this.orthoSize / ORTHO_SIZE;
    this.snapMark.scale.setScalar(Math.max(k, 0.25));
    this.snapMark.visible = true;
  }

  private hideSnapMark(): void {
    if (this.snapMark) this.snapMark.visible = false;
  }

  /** Tolerancia (en unidades de mundo) del imán de un PLANO a una línea. */
  private static readonly PLANE_SNAP_WORLD = 0.22;

  /** Al soltar una guía o un plano, si quedó casi tocando la punta de una
   *  línea, se lo corre lo justo para que la toque de verdad y se avisa con el
   *  anillo de color. Es el caso inverso del imán del trazo: acá lo que se
   *  mueve es la superficie, y "casi apoyado" no sirve para dibujar encima.
   *  Devuelve true si lo movió. */
  private snapPlaneToStrokes(mesh: THREE.Mesh): boolean {
    mesh.updateMatrixWorld(true);
    const n = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const origin = mesh.getWorldPosition(new THREE.Vector3());
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(n, origin);
    let best: { point: THREE.Vector3; dist: number } | null = null;
    for (const rec of this.strokes) {
      if (rec.kind !== 'stroke') continue;
      rec.object.updateMatrixWorld(true);
      // solo las PUNTAS: son las que uno apoya contra un plano
      for (const idx of [0, rec.points.length - 1]) {
        const w = rec.object.localToWorld(rec.points[idx].clone());
        const d = Math.abs(plano.distanceToPoint(w));
        if (d <= WebGLDesign3D.PLANE_SNAP_WORLD && (!best || d < best.dist)) best = { point: w, dist: d };
      }
    }
    if (!best || best.dist < 1e-5) return false;
    // correr el plano a lo largo de su normal hasta pasar por el punto
    mesh.position.addScaledVector(n, plano.distanceToPoint(best.point));
    mesh.updateMatrixWorld(true);
    this.showSnapMark(best.point, 'guide');
    window.setTimeout(() => this.hideSnapMark(), 900);
    return true;
  }

  // ---------------------------------------------------------------- guías de alineación

  /** Tolerancia (px de pantalla) para alinear con el extremo de otra línea. */
  private static readonly ALIGN_PX = 7;
  private alignEl?: SVGSVGElement;

  /** Extremos de los trazos ya hechos: son las referencias de alineación. En
   *  un dibujo lo que uno quiere hacer coincidir son las PUNTAS, igual que en
   *  Illustrator se alinean los bordes de los objetos. */
  private alignAnchors(): { world: THREE.Vector3; sx: number; sy: number }[] {
    const rect = this.canvasBox();
    const cam = this.camera as THREE.Camera;
    const out: { world: THREE.Vector3; sx: number; sy: number }[] = [];
    for (const rec of this.strokes) {
      if (rec.kind !== 'stroke' || rec.points.length < 2) continue;
      rec.object.updateMatrixWorld(true);
      for (const idx of [0, rec.points.length - 1]) {
        const w = rec.object.localToWorld(rec.points[idx].clone());
        const v = w.clone().project(cam);
        if (!isFinite(v.x) || !isFinite(v.y)) continue;
        out.push({ world: w, sx: ((v.x + 1) / 2) * rect.width, sy: ((1 - v.y) / 2) * rect.height });
      }
    }
    return out;
  }

  /** Ajusta el punto de pantalla para que quede alineado con la punta de otra
   *  línea (misma vertical u horizontal) y devuelve las guías a dibujar.
   *  Devuelve coordenadas de PANTALLA: el punto se reproyecta después sobre el
   *  plano de dibujo, así en ortogonal nunca aparece una Z que no sea la suya. */
  private alignAdjust(px: number, py: number):
      { px: number; py: number; lines: { x1: number; y1: number; x2: number; y2: number }[] } {
    const tol = WebGLDesign3D.ALIGN_PX;
    const anchors = this.alignAnchors();
    let bx: { a: typeof anchors[0]; d: number } | null = null;
    let by: { a: typeof anchors[0]; d: number } | null = null;
    for (const a of anchors) {
      const dx = Math.abs(a.sx - px), dy = Math.abs(a.sy - py);
      if (dx < tol && (!bx || dx < bx.d)) bx = { a, d: dx };
      if (dy < tol && (!by || dy < by.d)) by = { a, d: dy };
    }
    const nx = bx ? bx.a.sx : px;
    const ny = by ? by.a.sy : py;
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    if (bx) lines.push({ x1: bx.a.sx, y1: bx.a.sy, x2: nx, y2: ny });
    if (by) lines.push({ x1: by.a.sx, y1: by.a.sy, x2: nx, y2: ny });
    return { px: nx, py: ny, lines };
  }

  /** Dibuja las guías de alineación (líneas punteadas en pantalla). */
  private showAlignLines(lines: { x1: number; y1: number; x2: number; y2: number }[]): void {
    if (!this.alignEl) {
      this.alignEl = document.createElementNS(NS, 'svg') as SVGSVGElement;
      Object.assign(this.alignEl.style, {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: '40',
      } as CSSStyleDeclaration);
      this.container?.appendChild(this.alignEl);
    }
    while (this.alignEl.lastChild) this.alignEl.removeChild(this.alignEl.lastChild);
    if (!lines.length) { this.alignEl.style.display = 'none'; return; }
    this.alignEl.style.display = 'block';
    for (const L of lines) {
      const el = document.createElementNS(NS, 'line');
      el.setAttribute('x1', String(L.x1)); el.setAttribute('y1', String(L.y1));
      el.setAttribute('x2', String(L.x2)); el.setAttribute('y2', String(L.y2));
      el.setAttribute('stroke', '#ff36c8');
      el.setAttribute('stroke-width', '1');
      el.setAttribute('stroke-dasharray', '4 3');
      this.alignEl.appendChild(el);
    }
  }

  private hideAlignLines(): void {
    if (this.alignEl) { this.alignEl.style.display = 'none'; }
  }

  /** Punto del plano de dibujo actual bajo unas coordenadas de PANTALLA. */
  private pointFromScreen(px: number, py: number): THREE.Vector3 | null {
    const rect = this.canvasBox();
    const antes = this.pointer.clone();
    this.pointer.x = (px / rect.width) * 2 - 1;
    this.pointer.y = -(py / rect.height) * 2 + 1;
    const hit = (this.current?.drawTarget || this.current?.drawPlane)
      ? this.lockedHit()
      : (this.tool === 'pencil-free' ? this.resolveFreeHit() : this.resolveHit());
    this.pointer.copy(antes);
    return hit ? hit.point.clone() : null;
  }

  /** Punto más cercano en PANTALLA a lo que el trazo puede engancharse:
   *  vértices y cuerpo de las líneas ya hechas, y bordes de guías/planos.
   *  Devuelve también QUÉ enganchó, para poder avisarlo con color. */
  private findSnapTarget(e: PointerEvent, refPoint?: THREE.Vector3, maxWorld = Infinity):
      { point: THREE.Vector3; kind: string } | null {
    const rect = this.canvasBox();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const cam = this.camera as THREE.Camera;
    let best: { point: THREE.Vector3; kind: string } | null = null;
    let bestDist = WebGLDesign3D.SNAP_PX;
    const toScreen = (w: THREE.Vector3) => {
      const v = w.clone().project(cam);
      return new THREE.Vector2(((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height);
    };
    const probar = (world: THREE.Vector3, kind: string) => {
      if (refPoint && world.distanceTo(refPoint) > maxWorld) return;
      const sp = toScreen(world);
      const d = Math.hypot(sp.x - px, sp.y - py);
      if (d < bestDist) { bestDist = d; best = { point: world, kind }; }
    };
    // el vértice gana al cuerpo de la línea aunque esté un poco más lejos: si
    // apuntás cerca de una punta, querés la punta
    const vertexBonus = 4;

    for (const rec of this.strokes) {
      rec.object.updateMatrixWorld(true);
      const world = rec.points.map((q) => rec.object.localToWorld(q.clone()));
      for (const w of world) {
        if (refPoint && w.distanceTo(refPoint) > maxWorld) continue;
        const sp = toScreen(w);
        const d = Math.hypot(sp.x - px, sp.y - py) - vertexBonus;
        if (d < bestDist) { bestDist = d; best = { point: w, kind: 'vertex' }; }
      }
      // CUERPO de la línea: el punto más cercano sobre cada segmento. Antes,
      // llegar al medio de una línea no enganchaba nada — solo sus vértices.
      for (let i = 0; i + 1 < world.length; i++) {
        const a = toScreen(world[i]), b = toScreen(world[i + 1]);
        const ab = b.clone().sub(a);
        const len2 = ab.lengthSq();
        if (len2 < 1e-6) continue;
        const t = THREE.MathUtils.clamp(
          ((px - a.x) * ab.x + (py - a.y) * ab.y) / len2, 0, 1);
        probar(world[i].clone().lerp(world[i + 1], t), 'line');
      }
    }
    // anclajes y BORDES de las guías: llegar con una línea al canto de una
    // guía es el gesto natural para apoyarse en ella
    for (const guide of this.guides) {
      guide.mesh.updateMatrixWorld(true);
      const anchors = guide.mesh.userData.guideAnchors as THREE.Vector3[] | undefined;
      if (Array.isArray(anchors)) {
        for (const local of anchors) {
          const q = local instanceof THREE.Vector3
            ? local.clone()
            : new THREE.Vector3(Number((local as { x?: number }).x || 0),
              Number((local as { y?: number }).y || 0), Number((local as { z?: number }).z || 0));
          probar(q.applyMatrix4(guide.mesh.matrixWorld), 'guide');
        }
      }
      for (const w of this.meshEdgePoints(guide.mesh)) probar(w, 'guide');
    }
    for (const su of this.surfaces) {
      if (this.guides.some((g) => g.id === su.id)) continue;   // ya recorrida arriba
      for (const w of this.meshEdgePoints(su.mesh)) probar(w, 'guide');
    }
    return best;
  }

  /** Puntos sobre el CONTORNO de una malla (esquinas y puntos intermedios de
   *  su caja): alcanza para imantarse al borde de un plano sin recorrer toda
   *  su geometría en cada movimiento del puntero. */
  private meshEdgePoints(mesh: THREE.Mesh): THREE.Vector3[] {
    mesh.updateMatrixWorld(true);
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) return [];
    const out: THREE.Vector3[] = [];
    const N = 8;   // divisiones por arista
    // las 12 aristas de la caja. Recorrer solo 4 esquinas "en diagonal" no
    // servía: una guía extruida no es plana en ningún eje fijo y el contorno
    // quedaba atravesando el volumen en vez de bordearlo.
    const v = (ix: number, iy: number, iz: number) => new THREE.Vector3(
      ix ? bb.max.x : bb.min.x, iy ? bb.max.y : bb.min.y, iz ? bb.max.z : bb.min.z);
    const aristas: [THREE.Vector3, THREE.Vector3][] = [];
    for (let eje = 0; eje < 3; eje++) {
      for (let a = 0; a < 2; a++) {
        for (let b = 0; b < 2; b++) {
          const p0 = [0, 0, 0], p1 = [0, 0, 0];
          const otros = [0, 1, 2].filter((k) => k !== eje);
          p0[otros[0]] = a; p1[otros[0]] = a;
          p0[otros[1]] = b; p1[otros[1]] = b;
          p0[eje] = 0; p1[eje] = 1;
          aristas.push([v(p0[0], p0[1], p0[2]), v(p1[0], p1[1], p1[2])]);
        }
      }
    }
    for (const [a, b] of aristas) {
      for (let k = 0; k <= N; k++) out.push(a.clone().lerp(b, k / N).applyMatrix4(mesh.matrixWorld));
    }
    return out;
  }

  /** Si el puntero está cerca (en pantalla) de un vértice de un trazo ya
   *  dibujado, devuelve ese punto exacto en mundo — para poder arrancar (o
   *  terminar) una línea nueva pegada a una existente sin tener que apuntar
   *  perfecto. Las guías no cuentan: no retienen sus puntos tras dibujarlas. */
  private findSnapVertex(e: PointerEvent, refPoint?: THREE.Vector3, maxWorld = Infinity): THREE.Vector3 | null {
    const t = this.findSnapTarget(e, refPoint, maxWorld);
    if (t) { this.showSnapMark(t.point, t.kind); return t.point; }
    this.hideSnapMark();
    return null;
  }

  /** "Hilo tenso": ajusta el punto final para que el segmento start→raw
   *  quede exactamente paralelo al eje X, Y o Z del mundo (el que más se
   *  parezca a la dirección real que tiró el gesto) — proyecta el vector de
   *  arrastre sobre ese eje. Una recta paralela a un eje SIEMPRE converge a
   *  el punto de fuga de ese eje al verla en perspectiva, sin importar desde
   *  dónde salga — por eso no hace falta apuntar al punto de fuga a mano. */
  private snapToNearestAxis(start: THREE.Vector3, raw: THREE.Vector3): THREE.Vector3 {
    const drag = raw.clone().sub(start);
    if (drag.lengthSq() < 1e-10) return raw;
    const dragN = drag.clone().normalize();
    let bestAxis = WebGLDesign3D.VP_AXES[0][0];
    let bestAbsCos = -1;
    for (const [axis] of WebGLDesign3D.VP_AXES) {
      const c = Math.abs(dragN.dot(axis));
      if (c > bestAbsCos) { bestAbsCos = c; bestAxis = axis; }
    }
    const proj = drag.dot(bestAxis);
    return start.clone().add(bestAxis.clone().multiplyScalar(proj));
  }

  private beginDraw(e: PointerEvent): void {
    // La tinta va a la capa activa: si está bloqueada u oculta, no se dibuja
    // (aviso con el cursor rojo). Las guías no pertenecen a una capa → no se
    // bloquean por esto.
    if (this.tool !== 'guide' && !this.isLayerDrawable(this.activeLayerId())) {
      const locked = this.isLayerLocked(this.activeLayerId());
      this.canvas.title = locked ? 'La capa activa está bloqueada' : 'La capa activa está oculta';
      this.cursorEl.style.borderColor = '#ff4d4d';
      setTimeout(() => { this.canvas.title = ''; this.cursorEl.style.borderColor = '#333'; }, 1400);
      return;
    }
    // dibujo libre: el punto sale del rayo de cámara + profundidad de
    // scroll, nunca de una guía/superficie — es justamente lo que lo hace
    // "libre". El snap a vértices existentes se mantiene igual (ayuda a
    // cerrar formas), pero no cuenta como "sin soporte" ni dispara la
    // auto-guía (ver commitStroke): esta herramienta es intencionalmente
    // sin plano de apoyo, no un accidente que haya que corregir.
    if (this.tool === 'pencil-free') {
      const surf = this.resolveFreeHit();
      const snap = this.findSnapVertex(e, surf.point, 0.8);
      const hit = snap ? { point: snap, normal: surf.normal } : surf;
      this.capturePointer(e);
      this.mode = 'draw';
      this.controls.enabled = false;
      const line = this.makePreviewLine('stroke');
      this.strokesGroup.add(line);
      let mirrorLine: THREE.Line | undefined;
      if (this.mirror.x || this.mirror.y || this.mirror.z) { mirrorLine = this.makePreviewLine('stroke'); this.strokesGroup.add(mirrorLine); }
      this.smoothed = hit.point.clone();
      this.current = {
        points: [hit.point], pressures: [this.samplePressure(e)], kind: 'stroke', line, mirrorLine,
        baseNormal: hit.normal.clone(), noSupport: false,
      };
      this.updatePreview();
      return;
    }
    // arrancar puede engancharse a un vértice existente, pero SOLO si está cerca
    // en 3D de la superficie donde se dibuja (evita agarrar un vértice de otro
    // plano que solo cae cerca en pantalla, p. ej. en vista de lado).
    const surf = this.resolveHit();
    // Al CREAR una guía desde otra vista, la coincidencia en pantalla es la
    // intención de compartir vértice: no se descarta por la profundidad
    // provisional del plano de cámara. El punto devuelto conserva el XYZ real.
    const snap = this.findSnapVertex(e, surf?.point, this.tool === 'guide' ? Infinity : 0.8);
    // `let`: si el gesto se apoya en una superficie curva, más abajo el punto
    // se pega a su piel (ver la INVARIANTE).
    let hit = snap ? { point: snap, normal: surf?.normal ?? new THREE.Vector3(0, 0, 1) } : surf;
    if (!hit) {
      this.canvas.title = this.activeGuideIsEdgeOn()
        // Caso normal, no un error: una guía de PARED está parada sobre la línea
        // que dibujaste, así que desde la misma vista donde la creaste la ves de
        // canto y el rayo del lápiz corre paralelo a ella. Decirlo, en vez del
        // mensaje genérico de "no hay guía" — que confunde, porque sí hay.
        ? 'La guía está de canto desde esta vista: orbitá (arrastrá) para verla de frente y dibujar sobre ella'
        : 'Creá o activá una guía antes de dibujar';
      this.cursorEl.style.borderColor = '#ff4d4d';
      setTimeout(() => { this.canvas.title = ''; this.cursorEl.style.borderColor = '#333'; }, 1400);
      return;
    }
    this.capturePointer(e);
    this.mode = 'draw';
    this.controls.enabled = false;
    const kind = this.tool === 'guide' ? 'guide' : 'stroke';
    const line = this.makePreviewLine(kind);
    this.strokesGroup.add(line);
    let mirrorLine: THREE.Line | undefined;
    if ((this.mirror.x || this.mirror.y || this.mirror.z) && kind === 'stroke') {
      mirrorLine = this.makePreviewLine(kind);
      this.strokesGroup.add(mirrorLine);
    }
    // INVARIANTE: si el gesto se apoya en una superficie curva, sus puntos
    // están EN la superficie — el primero incluido. Medido antes de esto: el
    // arranque caía a radio 1.206 en una esfera de 1.4, o sea 0.2 hundido bajo
    // la piel donde se creía dibujar.
    {
      const act = this.activeSurfaceObj();
      if (act && act.type !== 'plane' && hit.target === act.mesh) {
        const liso = this.pegarASuperficie(act, hit.point);
        if (liso) { hit = { ...hit, point: liso.point, normal: liso.normal }; }
      }
    }
    this.smoothed = hit.point.clone(); // sin retraso en el primer punto
    this.current = {
      points: [hit.point], pressures: [this.samplePressure(e)], kind, line, mirrorLine,
      baseNormal: hit.normal.clone(),
      // No se "engancha" a un trazo ya dibujado: si el gesto arranca encima de
      // una línea existente, seguir su tubo torcía todo el trazo. Solo se
      // sigue la malla de una guía/superficie real (curvas incluidas).
      drawTarget: this.tool === 'pencil' && hit.kind !== 'stroke' ? hit.target : undefined,
      // PLANO BLOQUEADO para todo el trazo. Si el soporte no traía plano
      // propio (una superficie plano/pared), se arma uno infinito con la
      // normal y el punto del primer contacto. Sin esto, al salirse del
      // cuadrado finito el trazo se quedaba sin soporte y saltaba de
      // profundidad a mitad de camino (líneas que "no respetan" la guía).
      drawPlane: hit.plane?.clone()
        ?? new THREE.Plane().setFromNormalAndCoplanarPoint(hit.normal.clone(), hit.point.clone()),
      surfaceId: (() => {
        const act = this.activeSurfaceObj();
        return act && act.type !== 'plane' && hit.target === act.mesh ? act.id : undefined;
      })(),
      // el snap a un vértice existente SÍ cuenta como soporte real (ese
      // vértice pertenece a un trazo/guía ya apoyado), aunque `surf` haya
      // caído en el plano de fallback antes de encontrar el snap.
      noSupport: !snap && !!surf?.noSupport,
    };
    this.updatePreview();
  }

  /** "Stable Strokes": qué tan rápido el punto agregado al trazo alcanza al
   *  punto crudo del puntero. 0 = sin estabilizar (comportamiento de antes,
   *  sigue exacto). Más cerca de 1 = más retraso = pulso más limpio, a costa
   *  de "cortar camino" en curvas muy rápidas — por eso el piso en 0.15, no
   *  0, para que nunca se vuelva inmanejable. */
  private stabilizedPoint(raw: THREE.Vector3): THREE.Vector3 {
    const amt = THREE.MathUtils.clamp(this.brush.stabilization ?? 0, 0, 1);
    if (!this.smoothed) this.smoothed = raw.clone();
    if (amt <= 0) { this.smoothed.copy(raw); return raw; }
    const catchUp = THREE.MathUtils.lerp(1, 0.15, amt);
    this.smoothed.lerp(raw, catchUp);
    return this.smoothed;
  }

  /** Re-muestreo (Resample Curve, como lo describe Feather): si dos puntos
   *  consecutivos quedaron muy separados (arrastre rápido del mouse: pocas
   *  muestras en un tramo largo), inserta puntos intermedios por
   *  interpolación lineal para pareja la densidad. CatmullRomCurve3 hace
   *  overshoot/rulos cuando interpola tramos largos con giros filosos y
   *  pocos puntos de apoyo — subir la densidad ANTES de armar el tubo es la
   *  forma estándar de evitarlo (no es un ajuste de "estilo" como el
   *  estabilizador, por eso corre siempre, sin depender del slider). */
  private static readonly RESAMPLE_GAP = MIN_SAMPLE_DIST * 2.5;

  private resamplePoints(points: THREE.Vector3[], pressures: number[]): { points: THREE.Vector3[]; pressures: number[] } {
    if (points.length < 2) return { points, pressures };
    const gap = WebGLDesign3D.RESAMPLE_GAP;
    const outPts: THREE.Vector3[] = [points[0].clone()];
    const outPrs: number[] = [pressures[0]];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const dist = a.distanceTo(b);
      const steps = Math.min(40, Math.max(1, Math.ceil(dist / gap))); // tope: gaps absurdos no generan miles de puntos
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        outPts.push(a.clone().lerp(b, t));
        outPrs.push(pressures[i - 1] + (pressures[i] - pressures[i - 1]) * t);
      }
    }
    return { points: outPts, pressures: outPrs };
  }

  /** Segunda pasada de "Stable Strokes": al soltar el trazo, además del
   *  retraso en vivo (`stabilizedPoint`), se aplican unas pasadas de media
   *  móvil de 3 puntos (like `dzRefineStroke`/`dzMovingAvg` del editor 2D) —
   *  el temblor de alta frecuencia que el retraso en vivo no llega a limar
   *  del todo queda mejor resuelto post-trazo, sin perder los extremos
   *  (inicio/fin no se tocan, para no mover dónde arrancó/terminó el gesto). */
  private refineStroke(points: THREE.Vector3[], pressures: number[]): { points: THREE.Vector3[]; pressures: number[] } {
    const amt = THREE.MathUtils.clamp(this.brush.stabilization ?? 0, 0, 1);
    if (amt <= 0 || points.length < 4) return { points, pressures };
    const passes = Math.round(THREE.MathUtils.lerp(0, 3, amt));
    let pts = points.map((p) => p.clone());
    let prs = [...pressures];
    for (let pass = 0; pass < passes; pass++) {
      const nextPts = pts.map((p, i) => (i === 0 || i === pts.length - 1)
        ? p.clone()
        : pts[i - 1].clone().add(p).add(pts[i + 1]).divideScalar(3));
      const nextPrs = prs.map((v, i) => (i === 0 || i === prs.length - 1)
        ? v
        : (prs[i - 1] + v + prs[i + 1]) / 3);
      pts = nextPts;
      prs = nextPrs;
    }
    return { points: pts, pressures: prs };
  }

  private moveDraw(e: PointerEvent): void {
    if (!this.current) return;
    // El cuerpo del trazo NO engancha a vértices (eso hacía saltar los puntos a
    // vértices de otros planos en vista de lado). El snap solo aplica al inicio
    // (beginDraw) y al cierre (endDraw).
    let hit: { point: THREE.Vector3; normal: THREE.Vector3 } | null;
    if (this.tool === 'pencil-free') {
      hit = this.resolveFreeHit();
    } else if (this.current.drawTarget || this.current.drawPlane) {
      // lockedHit() aplica la prioridad completa: malla de apoyo → proyección
      // sobre ella si el cursor pasó la silueta → plano bloqueado.
      hit = this.lockedHit();
    } else {
      hit = this.resolveHit();
    }
    if (!hit) return;
    const pts = this.current.points;
    const pressures = this.current.pressures;

    // AVISO del imán en vivo: mientras trazás, si la punta pasa cerca de otra
    // línea, de una guía o de un plano, aparece el anillo de color. El trazo NO
    // se corrige acá (mover el cuerpo del trazo es lo que hacía saltar los
    // puntos entre planos): el enganche se aplica al soltar, en endDraw.
    const cerca = this.findSnapTarget(e, hit.point, 0.8);
    if (cerca) this.showSnapMark(cerca.point, cerca.kind); else this.hideSnapMark();
    // GUÍAS DE ALINEACIÓN: si la punta va quedando a la misma altura (o en la
    // misma vertical) que el extremo de otra línea, se muestra la guía. El
    // enganche manda: si ya hay algo que imantar, no se dibujan las dos cosas.
    if (cerca) this.hideAlignLines();
    else {
      const rectA = this.canvasBox();
      const al = this.alignAdjust(e.clientX - rectA.left, e.clientY - rectA.top);
      this.showAlignLines(al.lines);
    }

    if (e.altKey && pts.length >= 1) {
      // "Hilo tenso": recta pegada al eje X/Y/Z más parecido al gesto —
      // al ser paralela a ese eje del mundo, converge sola hacia SU punto de
      // fuga cuando se ve en perspectiva (ver updateVPOverlay). No hace falta
      // apuntar al punto de fuga a mano, alcanza con tirar en esa dirección.
      const start = pts[0];
      const raw = this.stabilizedPoint(hit.point).clone();
      const end = this.snapToNearestAxis(start, raw);
      // Alt siempre queda paralelo a un eje → mostrar su guía de color.
      const dirA = end.clone().sub(start);
      if (dirA.lengthSq() > 1e-8) {
        dirA.normalize();
        let bestA: [THREE.Vector3, string] | null = null;
        for (const pair of WebGLDesign3D.VP_AXES) {
          if (!bestA || Math.abs(dirA.dot(pair[0])) > Math.abs(dirA.dot(bestA[0]))) bestA = pair;
        }
        if (bestA) this.showSmartGuide(start, bestA[0], bestA[1]);
      }
      pts.length = 1;
      pressures.length = 1;
      if (end.distanceTo(start) >= MIN_SAMPLE_DIST) {
        pts.push(end);
        pressures.push(this.samplePressure(e));
      }
      this.updatePreview();
      return;
    }

    if (e.shiftKey && pts.length >= 1) {
      // Shift: línea recta desde el punto inicial hasta el punto actual — se
      // reemplazan los intermedios en cada movimiento (rubber-band), no se
      // "traba" en modo recto: al soltar Shift sigue a mano libre normal.
      const start = pts[0];
      // GUÍAS INTELIGENTES: la recta se imanta sola al eje del mundo cuando se
      // acerca al paralelo perfecto (y aparece la guía de color), como en
      // Illustrator. Fuera de la tolerancia queda libre.
      const smart = this.snapStraightSmart(start, this.stabilizedPoint(hit.point).clone());
      const end = smart.point;
      if (smart.axis) this.showSmartGuide(start, smart.axis, smart.color!);
      else this.hideSmartGuide();
      pts.length = 1;
      pressures.length = 1;
      if (end.distanceTo(start) >= MIN_SAMPLE_DIST) {
        pts.push(end);
        pressures.push(this.samplePressure(e));
      }
      this.updatePreview();
      return;
    }

    this.hideSmartGuide(); // se soltó Shift/Alt: vuelve el trazo a mano libre
    const point = this.stabilizedPoint(hit.point).clone();
    const jump = point.distanceTo(pts[pts.length - 1]);
    if (jump < MIN_SAMPLE_DIST) return;
    if (pts.length >= 1 && jump > MAX_DRAW_JUMP) return; // salto irreal (rayo rasante) → descartar
    pts.push(point);
    pressures.push(this.samplePressure(e));
    this.updatePreview();
  }

  private endDraw(e: PointerEvent): void {
    // Ctrl al soltar = cerrar y redondear en un círculo limpio (asistente de
    // forma). Al ser con tecla, no se dispara en momentos indeseados.
    if ((e.ctrlKey || e.metaKey) && this.current && this.current.kind === 'stroke'
        && this.current.points.length >= 4) {
      this.beautifyCircle(this.current);
      this.commitStroke();
      return;
    }
    // cierre opcional: enganchar SOLO el último punto a un vértice existente
    // cercano en pantalla Y en 3D → conectar limpio con una línea previa sin
    // afectar el cuerpo del trazo. También para guías ("imán de guía"): si
    // trazás una guía nueva cerca de un trazo ya hecho, se engancha a él
    // igual que un trazo normal — antes solo aplicaba a kind==='stroke'.
    if (this.current && this.current.points.length >= 2) {
      const pts = this.current.points;
      // El ESTABILIZADOR (pulso) deja el último punto ATRÁS del cursor: con
      // 35% el trazo terminaba ~25 px corto, y por eso al soltar sobre otra
      // línea quedaba un hueco y el imán no llegaba a engancharse. Al cerrar,
      // la punta pasa a ser el punto REAL bajo el cursor.
      this.setPointerFromEvent(e);
      const real = (this.current.drawTarget || this.current.drawPlane)
        ? this.lockedHit()
        : (this.tool === 'pencil-free' ? this.resolveFreeHit() : this.resolveHit());
      if (real) pts[pts.length - 1] = real.point.clone();
      // ALINEACIÓN con la punta de otra línea: se corrige en PANTALLA y se
      // reproyecta sobre el mismo plano de dibujo, así en ortogonal la Z sigue
      // siendo la del plano base (nunca una inventada).
      const rectE = this.canvasBox();
      const al = this.alignAdjust(e.clientX - rectE.left, e.clientY - rectE.top);
      if (al.lines.length) {
        const p = this.pointFromScreen(al.px, al.py);
        if (p) pts[pts.length - 1] = p;
      }
      const last = pts[pts.length - 1];
      // el enganche tiene la última palabra: tocar la línea gana a alinearse
      const v = this.findSnapVertex(e, last, 0.6);
      if (v) pts[pts.length - 1] = v.clone();
    }
    this.hideSnapMark();
    this.hideAlignLines();
    this.commitStroke();
  }

  /** Reemplaza el trazo actual por un CÍRCULO limpio y cerrado, ajustado al
   *  gesto: centro = centroide, radio = distancia media, en el plano de mejor
   *  ajuste del trazo (normal de Newell). Une los extremos automáticamente. */
  private beautifyCircle(cur: { points: THREE.Vector3[]; pressures: number[] }): void {
    const pts = cur.points;
    const C = new THREE.Vector3();
    pts.forEach((p) => C.add(p));
    C.multiplyScalar(1 / pts.length);

    // normal del mejor plano (Newell) sobre el lazo del trazo
    const normal = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      normal.x += (a.y - b.y) * (a.z + b.z);
      normal.y += (a.z - b.z) * (a.x + b.x);
      normal.z += (a.x - b.x) * (a.y + b.y);
    }
    if (normal.lengthSq() < 1e-8) return; // degenerado (línea recta): no forzar círculo
    normal.normalize();

    let r = 0;
    pts.forEach((p) => (r += p.distanceTo(C)));
    r /= pts.length;
    if (r < 1e-3) return;

    // base ortonormal del plano
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(normal.dot(u)) > 0.9) u.set(0, 1, 0);
    u.crossVectors(normal, u).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();

    const N = Math.max(48, pts.length);
    const circle: THREE.Vector3[] = [];
    const prs: number[] = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      circle.push(C.clone().addScaledVector(u, r * Math.cos(a)).addScaledVector(v, r * Math.sin(a)));
      prs.push(1);
    }
    cur.points.length = 0; cur.points.push(...circle);
    cur.pressures.length = 0; cur.pressures.push(...prs);
  }

  private makePreviewLine(kind: 'stroke' | 'guide'): THREE.Line {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.LineBasicMaterial({
      color: kind === 'guide' ? 0xffa53a : new THREE.Color(this.brush.color),
      transparent: true, opacity: kind === 'guide' ? 0.95 : Math.max(this.brush.opacity, 0.6),
    });
    return new THREE.Line(geo, mat);
  }

  private updatePreview(): void {
    if (!this.current) return;
    this.current.line?.geometry.setFromPoints(this.current.points);
    if (this.current.mirrorLine) this.current.mirrorLine.geometry.setFromPoints(this.mirroredVariants(this.current.points)[0] || []);
  }

  private strokeRadius(size: number = this.brush.size): number {
    return 0.01 + (size / 100) * 0.12;
  }

  /** Radio en el punto de índice `i` (0..n-1) según su presión: con
   *  `pressureSensitivity` en 0 el ancho es constante (comportamiento de
   *  antes); en 1 llega a angostarse hasta ~15% del ancho con presión mínima.
   *  El piso evita que el trazo desaparezca del todo con presión 0. */
  private radiusAt(pressure: number, brush: BrushSettings = this.brush): number {
    const base = this.strokeRadius(brush.size);
    const sens = THREE.MathUtils.clamp(brush.pressureSensitivity ?? 0, 0, 1);
    const floor = THREE.MathUtils.lerp(1, 0.15, sens);
    return base * THREE.MathUtils.lerp(floor, 1, THREE.MathUtils.clamp(pressure, 0, 1));
  }

  /** Interpola `pressures[]` (indexado 0..n-1, uniforme) al parámetro `t`
   *  crudo de la curva (NO al `u` de arco-longitud de getPointAt). */
  private pressureAtT(pressures: number[], t: number): number {
    const n = pressures.length;
    if (n < 2) return pressures[0] ?? 1;
    const pos = THREE.MathUtils.clamp(t, 0, 1) * (n - 1);
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, n - 1);
    const frac = pos - i0;
    return pressures[i0] * (1 - frac) + pressures[i1] * frac;
  }

  /** Tubo de ancho variable: arma un TubeGeometry de radio unitario (misma
   *  malla/normales que Three.js generaría con radio fijo) y después re-escala
   *  cada anillo según la presión interpolada en ese punto de la curva. Así
   *  se reusa el cálculo de frames (Frenet/parallel-transport) de Three.js —
   *  sin reimplementarlo a mano — y solo se toca el radio. */
  private buildTube(points: THREE.Vector3[], pressures: number[], brush: BrushSettings = this.brush,
                    recto = false): THREE.Mesh | null {
    if (points.length < 2) return null;
    // `recto` = FIGURA geométrica (rectángulo, círculo, polígono): la polilínea
    // se sigue tal cual, con segmentos rectos. NO se usa TubeGeometry acá: en
    // las esquinas de 90° del cuadrado el tubo genera mitres que se
    // auto-intersecan y la malla sale rota/deformada. En su lugar se construye
    // cápsula por cápsula y se unen los vértices con esferas.
    if (recto) return this.buildSegmentedTube(points, pressures, brush);
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const radialSegs = 10;
    const segs = Math.min(Math.max(points.length * (recto ? 3 : 6), 8), 1400);
    const geo = new THREE.TubeGeometry(curve, segs, 1, radialSegs, false);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const vertsPerRing = radialSegs + 1;
    const ringCount = segs + 1;
    for (let i = 0; i < ringCount; i++) {
      const u = i / segs;
      const t = curve.getUtoTmapping(u, 0);
      const center = curve.getPoint(t);
      const radius = this.radiusAt(this.pressureAtT(pressures, t), brush);
      for (let j = 0; j < vertsPerRing; j++) {
        const vi = i * vertsPerRing + j;
        const ox = pos.getX(vi) - center.x;
        const oy = pos.getY(vi) - center.y;
        const oz = pos.getZ(vi) - center.z;
        pos.setXYZ(vi, center.x + ox * radius, center.y + oy * radius, center.z + oz * radius);
      }
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    // TAPAS en las puntas. TubeGeometry es un caño ABIERTO: sin esto se ve el
    // agujero en cada extremo y, sobre todo, la UNIÓN entre dos trazos queda
    // hueca (dos bocas abiertas enfrentadas). Con una media esfera del radio
    // que tiene el trazo en esa punta, la línea se lee maciza y las uniones
    // cierran redondeadas, como una punta de pincel de verdad.
    const cuerpo = this.cappedTube(geo, curve, points, pressures, brush);
    void recto;
    const col = new THREE.Color(brush.color);
    return new THREE.Mesh(cuerpo, new THREE.MeshStandardMaterial({
      color: col, emissive: col.clone().multiplyScalar(0.06),
      roughness: THREE.MathUtils.lerp(0.9, 0.25, brush.hardness ?? 0.8), metalness: 0,
      transparent: brush.opacity < 1, opacity: brush.opacity,
    }));
  }

  /** Contorno de una FIGURA (polilínea cerrada de segmentos rectos) construido
   *  como cápsulas por arista + esferas en cada vértice. Evita los mitres rotos
   *  que producía TubeGeometry en las esquinas de 90° y deja un trazo de ancho
   *  uniforme con puntas/esquinas redondeadas, como un pincel real. */
  private buildSegmentedTube(points: THREE.Vector3[], pressures: number[],
                             brush: BrushSettings): THREE.Mesh | null {
    const n = points.length;
    if (n < 2) return null;
    const radialSegs = 10;
    const partes: THREE.BufferGeometry[] = [];
    const Y = new THREE.Vector3(0, 1, 0);
    const radiusAt = (i: number) => this.radiusAt(pressures[i] ?? 1, brush);
    // una cápsula (cilindro con tapas) por arista
    for (let i = 0; i + 1 < n; i++) {
      const a = points[i], b = points[i + 1];
      const len = a.distanceTo(b);
      if (len < 1e-5) continue;
      const ra = radiusAt(i), rb = radiusAt(i + 1);
      if (ra < 1e-5 && rb < 1e-5) continue;
      const dir = b.clone().sub(a).multiplyScalar(1 / len);
      const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
      const cyl = new THREE.CylinderGeometry(rb, ra, len, radialSegs, 1, false);
      cyl.applyQuaternion(q);
      cyl.translate((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
      partes.push(cyl);
    }
    // esferas en cada vértice: cierran las uniones y redondean puntas/esquinas
    for (let i = 0; i < n; i++) {
      const r = radiusAt(i);
      if (r < 1e-5) continue;
      const s = new THREE.SphereGeometry(r, radialSegs, 8);
      s.translate(points[i].x, points[i].y, points[i].z);
      partes.push(s);
    }
    if (!partes.length) return null;
    let geo: THREE.BufferGeometry;
    if (partes.length === 1) {
      geo = partes[0];
    } else {
      const merged = BufferGeometryUtils.mergeGeometries(partes, false);
      if (merged) { partes.forEach((g) => g.dispose()); geo = merged; }
      else { partes.slice(1).forEach((g) => g.dispose()); geo = partes[0]; }
    }
    geo.computeVertexNormals();
    const col = new THREE.Color(brush.color);
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, emissive: col.clone().multiplyScalar(0.06),
      roughness: THREE.MathUtils.lerp(0.9, 0.25, brush.hardness ?? 0.8), metalness: 0,
      transparent: brush.opacity < 1, opacity: brush.opacity,
    }));
  }

  /** Fusiona el tubo con una esfera en cada punta (una sola geometría: así el
   *  trazo sigue siendo UNA malla y todo lo demás —goma, capas, historial,
   *  descarte de memoria— sigue funcionando igual). */
  private cappedTube(tube: THREE.BufferGeometry, curve: THREE.Curve<THREE.Vector3>,
                     points: THREE.Vector3[], pressures: number[],
                     brush: BrushSettings): THREE.BufferGeometry {
    const partes: THREE.BufferGeometry[] = [tube];
    for (const t of [0, 1]) {
      const r = this.radiusAt(this.pressureAtT(pressures, t), brush);
      if (r < 1e-5) continue;
      const cap = new THREE.SphereGeometry(r, 10, 8);
      const c = curve.getPoint(t);
      cap.translate(c.x, c.y, c.z);
      partes.push(cap);
    }
    if (partes.length === 1) return tube;
    const merged = BufferGeometryUtils.mergeGeometries(partes, false);
    if (!merged) { partes.slice(1).forEach((g) => g.dispose()); return tube; }
    partes.forEach((g) => g.dispose());
    void points;
    return merged;
  }

  /** ¿El trazo es esencialmente RECTO? Desviación perpendicular máxima de los
   *  puntos respecto de la recta extremo-a-extremo, relativa a su largo. Decide
   *  si la guía sale como PARED plana (recto) o como BÓVEDA curva (curvo). */
  private isStrokeStraight(points: THREE.Vector3[]): boolean {
    const a0 = points[0], a1 = points[points.length - 1];
    const dir = a1.clone().sub(a0);
    const len = dir.length();
    if (len < 1e-4) return false; // casi un punto: no hay "recta" clara → bóveda
    const d = dir.multiplyScalar(1 / len);
    let maxDev = 0;
    for (const p of points) {
      const v = p.clone().sub(a0);
      const perp = v.addScaledVector(d, -v.dot(d)).length();
      if (perp > maxDev) maxDev = perp;
    }
    return maxDev <= Math.max(len * 0.06, 0.03);
  }

  /** Normal del plano de respaldo de una guía BARRIDA (bóveda).
   *
   *  La malla se barre a lo largo de `axis`, así que la superficie CONTIENE a
   *  `axis`: su normal es PERPENDICULAR a `axis`, nunca `axis` mismo. Es la
   *  misma idea que la rama de PARED usa como `t × n`, pero acá el trazo es
   *  curvo y no hay una única `t`: se saca la dirección DOMINANTE con un PCA 2D
   *  en el plano ⟂ axis. Para un trazo recto coincide exactamente con `t × n`;
   *  para uno curvo devuelve el plano tangente promedio de la bóveda.
   *
   *  `points` va en espacio mundo. Devuelve solo la dirección (el plano se
   *  arma después pasando por el centroide). */
  static guidePlaneNormalOf(points: THREE.Vector3[], axis: THREE.Vector3,
    fallback: THREE.Vector3): THREE.Vector3 {
    const n = points.length;
    if (n < 2) return fallback.clone().normalize();
    const a = axis.clone().normalize();
    // base ortonormal (u, v) del plano ⟂ a. El seed evita elegir un vector
    // paralelo a `a`, que dejaría el producto vectorial en cero.
    const seed = Math.abs(a.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(seed, a).normalize();
    const v = new THREE.Vector3().crossVectors(a, u).normalize();
    const c = new THREE.Vector3();
    points.forEach((p) => c.add(p));
    c.multiplyScalar(1 / n);
    let suu = 0, svv = 0, suv = 0;
    const d = new THREE.Vector3();
    for (const p of points) {
      d.copy(p).sub(c);
      const su = d.dot(u), sv = d.dot(v);
      suu += su * su; svv += sv * sv; suv += su * sv;
    }
    if (suu + svv < 1e-12) return fallback.clone().normalize(); // puntos encimados
    // ángulo que diagonaliza la covarianza = dirección principal del trazo
    const theta = 0.5 * Math.atan2(2 * suv, suu - svv);
    const dir = u.multiplyScalar(Math.cos(theta)).addScaledVector(v, Math.sin(theta));
    // dir ⟂ a por construcción → el producto vectorial nunca degenera
    return new THREE.Vector3().crossVectors(dir, a).normalize();
  }

  /** Guía 3D estilo Feather. CONVIVEN dos formas según el trazo que la crea:
   *
   *  - Trazo RECTO → PARED PLANA: se extruye recta y perpendicular a la línea,
   *    hacia adentro en profundidad. Una línea vertical dibujada de FRENTE se
   *    ve de canto de frente (solo la línea) y, al girar la vista, aparece el
   *    plano completo con límites arriba/abajo = largo de la línea. El
   *    `guidePlane` usa la normal de la PARED → dibujar sobre la guía cae
   *    siempre sobre ella, sin profundidad espuria, y los vértices coinciden
   *    entre vistas.
   *  - Trazo CURVO → BÓVEDA: se barre la curva REAL del trazo a lo largo de la
   *    profundidad → una superficie curva (techo/arco) que sigue la forma. El
   *    `guidePlane` de respaldo es el plano de dibujo.
   *
   *  El trazo original queda marcado en naranja como referencia. */
  private buildGuideSurface(points: THREE.Vector3[], baseNormal?: THREE.Vector3): THREE.Mesh | null {
    if (points.length < 2) return null;
    const camAxis = new THREE.Vector3();
    (this.camera as THREE.Camera).getWorldDirection(camAxis).normalize();

    const centroid = new THREE.Vector3();
    points.forEach((p) => centroid.add(p));
    centroid.multiplyScalar(1 / points.length);

    // n = normal del PLANO DE DIBUJO = eje de profundidad (hacia dónde se
    // extruye la guía). De frente es el eje de cámara → entra en profundidad.
    const n = (baseNormal ?? camAxis).clone();
    if (n.lengthSq() < 1e-6) n.copy(camAxis);
    n.normalize();

    const box = new THREE.Box3().setFromPoints(points);
    const geo = new THREE.BufferGeometry();
    const edgeMat = new THREE.LineBasicMaterial({ color: 0x4c9bff, transparent: true, opacity: 0.3 });
    const edges: THREE.Object3D[] = [];
    let guidePlaneNormal: THREE.Vector3;

    if (this.isStrokeStraight(points)) {
      // ---- PARED PLANA (trazo recto) ----
      // t = dirección de la LÍNEA dentro del plano de dibujo.
      const t = points[points.length - 1].clone().sub(points[0]);
      t.addScaledVector(n, -t.dot(n));
      if (t.lengthSq() < 1e-8) {
        t.set(1, 0, 0);
        if (Math.abs(n.dot(t)) > 0.9) t.set(0, 1, 0);
        t.addScaledVector(n, -t.dot(n));
      }
      t.normalize();
      // extensión: a lo largo de la línea = su largo real; en profundidad =
      // pared proporcional al trazo (con un mínimo para dibujar cómodo).
      const halfLen = Math.max(box.getSize(new THREE.Vector3()).length() * 0.5, 0.5);
      const depth = THREE.MathUtils.clamp(halfLen * 2, 3, 14);
      const corner = (a: number, b: number) => t.clone().multiplyScalar(a).addScaledVector(n, b);
      const c0 = corner(-halfLen, -depth), c1 = corner(halfLen, -depth);
      const c2 = corner(halfLen, depth), c3 = corner(-halfLen, depth);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(
        [c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, c3.x, c3.y, c3.z], 3));
      geo.setIndex([0, 1, 2, 0, 2, 3]);
      edges.push(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([c0, c1, c2, c3]), edgeMat));
      // plano de la PARED (perpendicular a la línea y al plano de dibujo).
      guidePlaneNormal = new THREE.Vector3().crossVectors(t, n).normalize();
    } else {
      // ---- BÓVEDA (trazo curvo) ----
      // barre la CURVA real a lo largo de n → superficie curva que sigue la
      // forma del trazo (arco/techo), no un plano recto.
      const L = THREE.MathUtils.clamp(box.getSize(new THREE.Vector3()).length() * 2, 5, 14);
      const m = points.length;
      const pos: number[] = [];
      const idx: number[] = [];
      const front: THREE.Vector3[] = [];
      const back: THREE.Vector3[] = [];
      for (let i = 0; i < m; i++) {
        const local = points[i].clone().sub(centroid);
        const f = local.clone().addScaledVector(n, L);
        const b = local.clone().addScaledVector(n, -L);
        front.push(f); back.push(b);
        pos.push(f.x, f.y, f.z, b.x, b.y, b.z);
      }
      for (let i = 0; i < m - 1; i++) {
        const a = 2 * i, b = 2 * i + 1, c = 2 * (i + 1), d = 2 * (i + 1) + 1;
        idx.push(a, b, c, c, b, d);
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      edges.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(front), edgeMat));
      edges.push(new THREE.Line(new THREE.BufferGeometry().setFromPoints(back), edgeMat.clone()));
      const sec: THREE.Vector3[] = [];
      const step = Math.max(1, Math.floor(m / 6));
      for (let i = 0; i < m; i += step) sec.push(front[i], back[i]);
      edges.push(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(sec), edgeMat.clone()));
      // Plano de respaldo TANGENTE a la bóveda. Acá antes iba `n` (el eje de
      // barrido), pero la malla se barre A LO LARGO de `n`, así que su normal es
      // PERPENDICULAR a `n`: el plano de respaldo quedaba girado 90° respecto de
      // la guía que se ve, y los trazos que salían de la malla finita caían en un
      // plano a un cuarto de vuelta. Es el mismo criterio que la rama de PARED
      // (t × n), generalizado a una curva vía PCA. Ver guidePlaneNormalOf().
      guidePlaneNormal = WebGLDesign3D.guidePlaneNormalOf(points, n, camAxis);
    }

    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x4c9bff, roughness: 1, metalness: 0, transparent: true,
      opacity: 0.09, side: THREE.DoubleSide, depthWrite: false,
    }));
    mesh.position.copy(centroid);
    // Puntos locales que originaron la guía: anclajes para arrancar la próxima
    // guía en el mismo vértice 3D.
    mesh.userData.guideAnchors = points.map((p) => p.clone().sub(centroid));
    for (const e of edges) mesh.add(e);
    mesh.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points.map((p) => p.clone().sub(centroid))),
      new THREE.LineBasicMaterial({ color: 0xffa53a }))); // naranja = trazo original
    mesh.userData.guidePlane = new THREE.Plane().setFromNormalAndCoplanarPoint(guidePlaneNormal, centroid);
    // Origen de la guía: con el trazo y el eje de extrusión alcanza para
    // reconstruirla igual al reabrir el proyecto (ver exportProject).
    mesh.userData.guideSource = { points: points.map((p) => p.toArray()), normal: n.toArray() };
    return mesh;
  }

  private mirroredVariants(points: THREE.Vector3[]): THREE.Vector3[][] {
    const axes = ['x', 'y', 'z'].filter((a) => this.mirror[a as 'x' | 'y' | 'z']);
    const variants: THREE.Vector3[][] = [];
    for (let mask = 1; mask < (1 << axes.length); mask++) {
      variants.push(points.map((p) => {
        const q = p.clone();
        axes.forEach((axis, i) => { if (mask & (1 << i)) q[axis as 'x' | 'y' | 'z'] *= -1; });
        return q;
      }));
    }
    return variants;
  }

  // ---------------------------------------------------------------- figuras planas

  /** Lados del polígono regular (herramienta 'poly'). */
  private polySides = 6;
  /** Qué produce la herramienta de figuras: solo el contorno, solo la cara
   *  sólida, o las dos cosas. Antes solo hacía contorno, así que para tener una
   *  forma plana rellena había que dibujarla y después pasarle el balde. */
  private shapeStyle: 'stroke' | 'fill' | 'both' = 'both';
  setShapeStyle(v: 'stroke' | 'fill' | 'both'): void { this.shapeStyle = v; }
  getShapeStyle(): 'stroke' | 'fill' | 'both' { return this.shapeStyle; }
  setPolySides(n: number): void { this.polySides = Math.max(3, Math.min(24, Math.round(n))); }
  getPolySides(): number { return this.polySides; }

  /** Estado del arrastre de una figura: punto de inicio, plano y ejes locales. */
  private shape: {
    start: THREE.Vector3; normal: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3;
    plane: THREE.Plane; preview?: THREE.Line;
  } | null = null;

  /** Perímetro de la figura, EN EL PLANO donde se está dibujando. Se arma con
   *  los ejes locales del plano (u, v), así en una vista ortogonal la figura
   *  queda exactamente sobre el plano base y no toma una Z inventada. */
  private shapeOutline(a: THREE.Vector3, b: THREE.Vector3, kind: 'rect' | 'circle' | 'poly',
                       igual: boolean): THREE.Vector3[] {
    const s = this.shape;
    if (!s) return [];
    const d = b.clone().sub(a);
    let du = d.dot(s.u), dv = d.dot(s.v);
    if (igual) {                       // Shift: cuadrado / círculo perfecto
      const m = Math.max(Math.abs(du), Math.abs(dv));
      du = Math.sign(du || 1) * m; dv = Math.sign(dv || 1) * m;
    }
    const pts: THREE.Vector3[] = [];
    const P = (cu: number, cv: number) =>
      a.clone().addScaledVector(s.u, cu).addScaledVector(s.v, cv);
    if (kind === 'rect') {
      pts.push(P(0, 0), P(du, 0), P(du, dv), P(0, dv), P(0, 0));
      return pts;
    }
    // círculo y polígono: se dibujan desde la ESQUINA, como el rectángulo, para
    // que el gesto sea el mismo en las tres herramientas
    const cu = du / 2, cv = dv / 2;
    const ru = Math.abs(cu), rv = Math.abs(cv);
    const N = kind === 'circle' ? 48 : this.polySides;
    // el polígono arranca con un vértice arriba: es lo que uno espera al ver
    // un hexágono o un triángulo, y no una figura girada a medias
    const off = kind === 'circle' ? 0 : Math.PI / 2;
    for (let i = 0; i <= N; i++) {
      const ang = off + (i / N) * Math.PI * 2;
      pts.push(P(cu + Math.cos(ang) * ru, cv + Math.sin(ang) * rv));
    }
    return pts;
  }

  private beginShape(e: PointerEvent): void {
    // Una figura PLANA no es ambigua como un trazo libre: si no hay guía ni
    // superficie de apoyo, se usa el plano de la vista (perpendicular a la
    // cámara, pasando por el centro de órbita). Antes acá se cortaba con
    // "elegí una vista o una superficie" y no se podía dibujar una forma sin
    // fabricar antes una guía.
    let hit = this.resolveHit();
    if (!hit) {
      const camDir = new THREE.Vector3();
      (this.camera as THREE.Camera).getWorldDirection(camDir);
      const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(
        camDir.clone().negate(), this.controls.target);
      const p = new THREE.Vector3();
      this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
      if (!this.raycaster.ray.intersectPlane(pl, p)) return;
      hit = { point: p, normal: pl.normal.clone(), plane: pl.clone(), kind: 'fallback' };
    }
    const n = hit.normal.clone().normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
    u.crossVectors(n, u).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    this.shape = {
      start: hit.point.clone(), normal: n, u, v,
      plane: new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point),
    };
    this.capturePointer(e);
    this.mode = 'draw';
    this.controls.enabled = false;
    const line = this.makePreviewLine('stroke');
    this.strokesGroup.add(line);
    this.shape.preview = line;
  }

  private moveShape(e: PointerEvent): void {
    if (!this.shape?.preview) return;
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.shape.plane, p)) return;
    const kind = this.tool === 'rect' ? 'rect' : this.tool === 'circle' ? 'circle' : 'poly';
    const pts = this.shapeOutline(this.shape.start, p, kind, e.shiftKey);
    if (pts.length > 1) this.shape.preview.geometry.setFromPoints(pts);
  }

  private endShape(e: PointerEvent): void {
    const s = this.shape;
    this.shape = null;
    if (!s) return;
    if (s.preview) {
      this.strokesGroup.remove(s.preview);
      s.preview.geometry.dispose();
      (s.preview.material as THREE.Material).dispose();
    }
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(s.plane, p)) return;
    this.shape = s;   // shapeOutline necesita los ejes del gesto
    const kind = this.tool === 'rect' ? 'rect' : this.tool === 'circle' ? 'circle' : 'poly';
    const pts = this.shapeOutline(s.start, p, kind, e.shiftKey);
    this.shape = null;
    if (pts.length < 4) return;
    // figura degenerada (un clic sin arrastre): no dejar basura en la escena
    const box = new THREE.Box3().setFromPoints(pts);
    if (box.getSize(new THREE.Vector3()).length() < 0.02) return;

    const pressures = pts.map(() => 1);
    const group = new THREE.Group();
    const conContorno = this.shapeStyle !== 'fill';
    const conRelleno = this.shapeStyle !== 'stroke';
    if (conContorno) {
      const tube = this.buildTube(pts, pressures, this.brush, true);
      if (tube) group.add(tube);
      for (const variant of this.mirroredVariants(pts)) {
        const b = this.buildTube(variant, pressures, this.brush, true); if (b) group.add(b);
      }
    }
    if (conRelleno) {
      const cara = this.buildFillMesh(pts, this.brush);
      if (cara) { cara.userData.esRelleno = true; group.add(cara); }
      for (const variant of this.mirroredVariants(pts)) {
        const c2 = this.buildFillMesh(variant, this.brush);
        if (c2) { c2.userData.esRelleno = true; group.add(c2); }
      }
    }
    if (!group.children.length) return;
    const rec: StrokeRecord = {
      id: `stroke-${this.seq++}`, object: group, points: pts, pressures, kind: 'stroke',
      shape: kind,
      // solo relleno = una cara suelta, igual que la del balde: se marca `fill`
      // para que el STL no la cuente como cuerpo
      fill: conContorno ? undefined : true,
      filled: conRelleno && conContorno ? true : undefined,
      layerId: this.activeLayerId(), baseOpacity: this.brush.opacity, brush: { ...this.brush },
    };
    group.userData.strokeId = rec.id;
    this.addStrokeRecord(rec);
    this.pushCmd({
      undo: () => this.removeStrokeRecord(rec),
      redo: () => this.addStrokeRecord(rec),
    });
    this.setSelection([rec]);
  }

  private commitStroke(): void {
    if (!this.current) return;
    this.smoothed = null;
    this.hideSmartGuide();
    for (const l of [this.current.line, this.current.mirrorLine]) {
      if (!l) continue;
      this.strokesGroup.remove(l);
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
    }
    let { points, pressures } = this.current;
    const { kind, baseNormal, noSupport, surfaceId } = this.current;
    this.current = null;
    if (points.length < 2) return;

    if (kind === 'guide') {
      const mesh = this.buildGuideSurface(points, baseNormal);
      if (mesh) this.setGuide(mesh);
      return;
    }
    // Como Feather: si este trazo se dibujó "en el aire" (sin ninguna guía ni
    // superficie real de apoyo — cayó al plano genérico de cámara) se
    // auto-genera una guía a partir de él mismo, ANTES de resamplear/afinar
    // los puntos (con la curva cruda, igual que la herramienta 'guide'). Le
    // da soporte de profundidad real a los trazos siguientes en vez de que
    // todos sigan cayendo al mismo plano de cámara sin memoria entre sí.
    if (noSupport && !this.activeGuide) {
      const guideMesh = this.buildGuideSurface(points, baseNormal);
      if (guideMesh) this.setGuide(guideMesh);
    }
    ({ points, pressures } = this.resamplePoints(points, pressures));
    ({ points, pressures } = this.refineStroke(points, pressures));
    // Trazo apoyado en una superficie curva: vuelve a la piel. El remuestreo
    // interpola en RECTA entre puntos y el suavizado promedia de a tres, así que
    // los dos cortan la cuerda del arco; medido sobre una esfera de radio 1.4,
    // el trazo quedaba hasta 0.026 hundido. Suavizar está bien, hundirse no.
    if (surfaceId) {
      const sup = this.surfaces.find((x) => x.id === surfaceId);
      if (sup) {
        points = points.map((q) => this.pegarASuperficie(sup, q)?.point ?? q);
      }
    }
    const group = new THREE.Group();
    const a = this.buildTube(points, pressures);
    if (a) group.add(a);
    for (const variant of this.mirroredVariants(points)) { const b = this.buildTube(variant, pressures); if (b) group.add(b); }
    const rec: StrokeRecord = {
      id: `stroke-${this.seq++}`, object: group, points, pressures, kind,
      layerId: this.activeLayerId(), baseOpacity: this.brush.opacity, brush: { ...this.brush },
    };
    group.userData.strokeId = rec.id;
    this.addStrokeRecord(rec);
    this.pushCmd({
      undo: () => this.removeStrokeRecord(rec),
      redo: () => this.addStrokeRecord(rec),
    });
  }

  /** Reconstruye la malla del trazo tras editar sus puntos (herramienta
   *  'select'). Descarta la malla vieja y crea una nueva con los mismos
   *  materiales/presión — más simple y robusto que mutar geometría en vivo. */
  private rebuildStrokeMesh(rec: StrokeRecord): void {
    while (rec.object.children.length) {
      const child = rec.object.children[0] as THREE.Mesh;
      rec.object.remove(child);
      child.geometry?.dispose();
      (child.material as THREE.Material)?.dispose();
    }
    // un VOLUMEN se reconstruye como cuerpo cerrado
    if (rec.solid) {
      const m = this.buildSolidMesh(rec.points, rec.brush);
      if (m) rec.object.add(m);
      return;
    }
    // un RELLENO se reconstruye como polígono sólido, no como tubo
    if (rec.fill) {
      const f = this.buildFillMesh(rec.points, rec.brush);
      if (f) rec.object.add(f);
      return;
    }
    const a = this.buildTube(rec.points, rec.pressures, rec.brush, !!rec.shape);
    if (a) rec.object.add(a);
    for (const variant of this.mirroredVariants(rec.points)) {
      const b = this.buildTube(variant, rec.pressures, rec.brush, !!rec.shape); if (b) rec.object.add(b);
    }
    // figura con cara sólida: la cara se reconstruye junto al contorno, si no
    // al reabrir el proyecto (o al cambiar el color) la forma quedaba hueca
    if (rec.filled) {
      const cara = this.buildFillMesh(rec.points, rec.brush);
      if (cara) { cara.userData.esRelleno = true; rec.object.add(cara); }
      for (const variant of this.mirroredVariants(rec.points)) {
        const c2 = this.buildFillMesh(variant, rec.brush);
        if (c2) { c2.userData.esRelleno = true; rec.object.add(c2); }
      }
    }
  }

  private addStrokeRecord(rec: StrokeRecord): void {
    this.strokesGroup.add(rec.object);
    if (!this.strokes.includes(rec)) this.strokes.push(rec);
    this.applyLayerStyles();
    this.publishObjects();
  }

  private removeStrokeRecord(rec: StrokeRecord): void {
    // si el trazo está envuelto en el proxy del pivote móvil, liberarlo
    // primero — si no, `strokesGroup.remove` no encuentra un hijo directo y
    // el trazo queda fantasma, colgado del proxy.
    if (this.pivotOwnerObj === rec.object) this.unwrapPivot();
    this.strokesGroup.remove(rec.object);
    this.strokes = this.strokes.filter((s) => s !== rec);
    this.selected.delete(rec);
    this.publishObjects();
    if (this.editingStroke === rec) this.clearPointEdit();
    if (this.gizmo?.object === rec.object) this.gizmo.detach();
  }

  // ---------------------------------------------------------------- capas / grupos

  private activeLayerId(): string {
    return lowStore.getState().activeLayerId ?? 'layer-0';
  }

  private layerById(id: string): Layer | undefined {
    return lowStore.getState().layers.find((l) => l.id === id);
  }

  /** Una capa bloqueada no deja seleccionar/mover/borrar/cortar/deformar sus
   *  trazos (el candado del LayerManager antes no hacía nada). */
  private isLayerLocked(id: string): boolean {
    return !!this.layerById(id)?.locked;
  }

  /** Se puede dibujar sobre la capa activa solo si no está bloqueada ni oculta
   *  (dibujar en una capa oculta hacía "desaparecer" el trazo sin aviso). */
  private isLayerDrawable(id: string): boolean {
    const l = this.layerById(id);
    return !l || (!l.locked && l.visible);
  }

  /** Aplica visibilidad y opacidad de cada capa a sus trazos. Se llama en cada
   *  cambio del store (visibilidad, opacidad) y al agregar trazos. */
  /** Onion-skin por profundidad en vistas ortogonales: lo que está más lejos
   *  del plano de referencia (controls.target, a lo largo del eje de la
   *  cámara) se desvanece — como el papel cebolla de animación 2D, pero
   *  usando la profundidad real en vez de cuadros distintos. Nunca se aplica
   *  en perspectiva (ahí ya se percibe la profundidad por escala/paralaje,
   *  desvanecer sería confuso). */
  private static readonly ONION_DEPTH_RANGE = 6;
  private static readonly ONION_MIN_OPACITY = 0.15;

  private strokeWorldCenter(rec: StrokeRecord): THREE.Vector3 {
    const c = new THREE.Vector3();
    for (const p of rec.points) c.add(p);
    rec.object.updateMatrixWorld(true);
    return rec.object.localToWorld(c.divideScalar(Math.max(1, rec.points.length)));
  }

  private applyLayerStyles(): void {
    const layers = lowStore.getState().layers;
    const byId = new Map(layers.map((l) => [l.id, l]));
    const ortho = this.view !== 'persp';
    let camDir: THREE.Vector3 | null = null;
    let refDepth = 0;
    if (ortho) {
      camDir = new THREE.Vector3();
      (this.camera as THREE.Camera).getWorldDirection(camDir);
      refDepth = this.controls.target.dot(camDir);
    }
    for (const rec of this.strokes) {
      const layer = byId.get(rec.layerId);
      const visible = layer ? layer.visible : true;
      const op = layer ? layer.opacity : 1;
      rec.object.visible = visible;
      let depthMult = 1;
      if (ortho && camDir) {
        const depth = this.strokeWorldCenter(rec).dot(camDir) - refDepth;
        const t = THREE.MathUtils.clamp(Math.abs(depth) / WebGLDesign3D.ONION_DEPTH_RANGE, 0, 1);
        depthMult = THREE.MathUtils.lerp(1, WebGLDesign3D.ONION_MIN_OPACITY, t);
      }
      rec.object.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && 'opacity' in m) {
          m.opacity = rec.baseOpacity * op * depthMult;
          m.transparent = m.opacity < 1;
          m.needsUpdate = true;
        }
      });
    }
  }

  private strokesOfLayer(id: string): StrokeRecord[] {
    return this.strokes.filter((r) => r.layerId === id);
  }

  /** Selección masiva: todas las curvas de una capa (para transformar o
   *  recolorear en bloque, como el long-press de grupo en Feather). */
  selectLayer(id: string): void {
    this.setSelection(this.strokesOfLayer(id));
    this.syncGizmo();
  }

  private getStrokeColor(rec: StrokeRecord): string {
    return rec.brush.color;
  }

  private paintStroke(rec: StrokeRecord, hex: string): void {
    // el color también se guarda en el pincel del trazo para que sobreviva a
    // una reconstrucción posterior (editar nodos, cortar, reabrir).
    rec.brush.color = hex;
    const col = new THREE.Color(hex);
    rec.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.color) {
        m.color.copy(col);
        if (m.emissive) m.emissive.copy(col.clone().multiplyScalar(0.06));
        m.needsUpdate = true;
      }
    });
  }

  /** Cambia el color de TODOS los trazos de una capa (undoable). */
  setLayerColor(id: string, hex: string): void {
    const recs = this.strokesOfLayer(id);
    if (!recs.length) return;
    const before = recs.map((r) => this.getStrokeColor(r));
    const apply = () => recs.forEach((r) => this.paintStroke(r, hex));
    apply();
    this.pushCmd({
      undo: () => recs.forEach((r, i) => this.paintStroke(r, before[i])),
      redo: apply,
    });
  }

  /** Borra una capa Y sus trazos (undoable), luego quita la metadata del store. */
  deleteLayer(id: string): void {
    const recs = this.strokesOfLayer(id);
    const remove = () => recs.forEach((r) => this.removeStrokeRecord(r));
    const add = () => recs.forEach((r) => this.addStrokeRecord(r));
    remove();
    if (recs.length) this.pushCmd({ undo: add, redo: remove });
    lowStore.removeLayer(id);
  }

  // ---------------------------------------------------------------- guías

  /** Agrega una guía SIN tocar las que ya existen — se puede tener varias
   *  guías a la vez, cada una se borra individualmente (goma, click sobre
   *  ella) en vez de que la última creada reemplace a la anterior. */
  private setGuide(mesh: THREE.Mesh): void {
    const id = `guide-${this.seq++}`;
    mesh.userData.surfaceId = id;
    mesh.userData.guideId = id;
    const plane = mesh.userData.guidePlane as THREE.Plane | undefined;
    const g = { id, mesh, plane };
    const attach = () => {
      this.guidesGroup.add(mesh);
      this.surfaces.push({ id, type: 'loft', mesh });
      this.guides.push(g);
      this.activeGuide = g;
    };
    attach();
    this.pushCmd({
      undo: () => this.detachGuide(g),
      redo: () => attach(),
    });
  }

  private detachGuide(g: { id: string; mesh: THREE.Mesh }): void {
    if (this.pivotOwnerObj === g.mesh) this.unwrapPivot();
    this.guidesGroup.remove(g.mesh);
    this.surfaces = this.surfaces.filter((s) => s.id !== g.id);
    this.guides = this.guides.filter((x) => x.id !== g.id);
    if (this.activeGuide?.id === g.id) this.activeGuide = this.guides[this.guides.length - 1] ?? null;
    if (this.selectedGuide?.id === g.id) { this.selectedGuide = null; this.gizmo?.detach(); }
  }

  /** Borra la ÚLTIMA guía creada (botón "Borrar guía" de la barra). */
  deleteGuide(): boolean {
    if (!this.activeGuide) return false;
    return this.deleteGuideById(this.activeGuide.id);
  }

  /** Borra una guía específica por id (undoable) — usado por el botón
   *  "Borrar guía" (la última) y por la goma con click sobre cualquiera. */
  private deleteGuideById(id: string): boolean {
    const g = this.guides.find((x) => x.id === id);
    if (!g) return false;
    this.detachGuide(g);
    this.pushCmd({
      undo: () => { this.guidesGroup.add(g.mesh); this.surfaces.push({ id: g.id, type: 'loft', mesh: g.mesh }); this.guides.push(g); this.activeGuide = g; },
      redo: () => this.detachGuide(g),
    });
    return true;
  }

  /** Guía bajo el puntero actual (para borrarla individualmente con la
   *  goma), o null si no hay ninguna ahí. */
  /** Superficie primitiva (plano/cilindro/…) bajo el cursor. La goma la usa
   *  para poder borrar una pared concreta: el botón de la barra ya no borra
   *  (ahora agrega), así que la eliminación vive acá. */
  private pickSurface(): SurfaceObj | null {
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const hits = this.raycaster.intersectObjects(this.surfacesGroup.children, false);
    if (!hits.length) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.surfaceId) obj = obj.parent;
    if (!obj) return null;
    const id = obj.userData.surfaceId as string;
    return this.surfaces.find((s) => s.id === id) ?? null;
  }

  private deleteSurfaceById(id: string): boolean {
    const s = this.surfaces.find((x) => x.id === id);
    if (!s) return false;
    this.surfacesGroup.remove(s.mesh);
    s.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    this.surfaces = this.surfaces.filter((x) => x.id !== id);
    if (this.activeSurfaceId === id) this.activeSurfaceId = null;
    if (this.selectedSurface?.id === id) { this.selectedSurface = null; this.syncGizmo(); }
    return true;
  }

  // ---------------------------------------------------------------- relleno de formas cerradas

  /** Tolerancia para considerar que dos puntas de trazo son el MISMO vértice.
   *  Los trazos se enganchan con snap al dibujar, así que suelen coincidir
   *  bastante; esto tolera el resto. */
  private static readonly WELD_EPS = 0.35;

  /** Punto en world de una punta del trazo (respetando la posición del grupo). */
  private strokeEnd(rec: StrokeRecord, which: 0 | 1): THREE.Vector3 {
    const p = which === 0 ? rec.points[0] : rec.points[rec.points.length - 1];
    return p.clone().add(rec.object.position);
  }

  /** Busca un CICLO de trazos que arranque y termine en `seed`, siguiendo
   *  puntas que coincidan (soldadas por WELD_EPS). Devuelve la lista ordenada
   *  de trazos del contorno, o null si la forma no está cerrada. */
  private findClosedLoop(seed: StrokeRecord): StrokeRecord[] | null {
    const pool = this.strokes.filter((s) => s.kind === 'stroke' && !s.fill && !s.solid && s.points.length >= 2);
    const eps = WebGLDesign3D.WELD_EPS;
    const start = this.strokeEnd(seed, 0);
    const walk = (chain: StrokeRecord[], tip: THREE.Vector3): StrokeRecord[] | null => {
      if (chain.length > 1 && tip.distanceTo(start) <= eps) return chain; // cerró
      if (chain.length > 64) return null; // contorno absurdo: cortar
      for (const cand of pool) {
        if (chain.includes(cand)) continue;
        const a = this.strokeEnd(cand, 0), b = this.strokeEnd(cand, 1);
        let next: THREE.Vector3 | null = null;
        if (tip.distanceTo(a) <= eps) next = b;
        else if (tip.distanceTo(b) <= eps) next = a;
        if (!next) continue;
        const r = walk([...chain, cand], next);
        if (r) return r;
      }
      return null;
    };
    return walk([seed], this.strokeEnd(seed, 1));
  }

  /** Contorno continuo (world) de un ciclo de trazos, orientando cada tramo
   *  para que enganche con el anterior. */
  private loopOutline(loop: StrokeRecord[]): THREE.Vector3[] {
    const eps = WebGLDesign3D.WELD_EPS;
    const pts: THREE.Vector3[] = [];
    let tip: THREE.Vector3 | null = null;
    for (const rec of loop) {
      const world = rec.points.map((p) => p.clone().add(rec.object.position));
      if (tip && world[0].distanceTo(tip) > eps && world[world.length - 1].distanceTo(tip) <= eps) world.reverse();
      for (const p of world) if (!pts.length || p.distanceTo(pts[pts.length - 1]) > 1e-4) pts.push(p);
      tip = pts[pts.length - 1];
    }
    return pts;
  }

  /** Malla sólida a partir de un contorno cerrado, proyectándolo al plano de
   *  mejor ajuste (normal de Newell) y triangulando ahí. */
  private buildFillMesh(outline: THREE.Vector3[], brush: BrushSettings): THREE.Mesh | null {
    if (outline.length < 3) return null;
    const n = new THREE.Vector3();
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      n.x += (a.y - b.y) * (a.z + b.z);
      n.y += (a.z - b.z) * (a.x + b.x);
      n.z += (a.x - b.x) * (a.y + b.y);
    }
    if (n.lengthSq() < 1e-10) return null; // contorno degenerado (todo en una recta)
    n.normalize();
    const centro = new THREE.Vector3();
    outline.forEach((p) => centro.add(p));
    centro.multiplyScalar(1 / outline.length);
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
    u.crossVectors(n, u).normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();

    const shape = new THREE.Shape(outline.map((p) => {
      const d = p.clone().sub(centro);
      return new THREE.Vector2(d.dot(u), d.dot(v));
    }));
    const geo = new THREE.ShapeGeometry(shape);
    const col = new THREE.Color(brush.color);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, roughness: 0.85, metalness: 0, side: THREE.DoubleSide,
      transparent: brush.opacity < 1, opacity: brush.opacity,
    }));
    // llevar el plano 2D de la Shape al plano real del contorno
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
    mesh.position.copy(centro);
    // apenas detrás de las líneas para que el contorno siga leyéndose
    mesh.renderOrder = -1;
    return mesh;
  }

  /** VOLUMEN a partir de una nube de puntos. Dos casos, porque un dibujo
   *  produce dos cosas muy distintas:
   *   - puntos CO­PLANARES (una silueta dibujada en un plano): no hay volumen
   *     que deducir, así que se EXTRUYE la silueta a lo largo de su normal y
   *     queda un cuerpo con espesor — el equivalente 3D de "inflar" el dibujo.
   *   - puntos en el ESPACIO (trazos en varias guías): se cierra el cuerpo con
   *     su casco convexo, que es el volumen mínimo que contiene todo lo hecho.
   *  Devuelve la malla en coordenadas MUNDIALES (el llamador la centra). */
  private buildSolidMesh(cloud: THREE.Vector3[], brush: BrushSettings): THREE.Mesh | null {
    if (cloud.length < 4) return null;
    const box = new THREE.Box3().setFromPoints(cloud);
    const size = box.getSize(new THREE.Vector3());
    const diag = size.length();
    if (diag < 1e-6) return null;

    // plano de mejor ajuste: centroide + normal por covarianza (el autovector
    // de menor varianza). Newell no sirve acá: la nube no está ordenada.
    const c = new THREE.Vector3();
    cloud.forEach((p) => c.add(p));
    c.multiplyScalar(1 / cloud.length);
    let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
    for (const p of cloud) {
      const d = p.clone().sub(c);
      xx += d.x * d.x; xy += d.x * d.y; xz += d.x * d.z;
      yy += d.y * d.y; yz += d.y * d.z; zz += d.z * d.z;
    }
    // el determinante de cada eje dice cuál es el mejor plano (three no trae
    // solver de autovectores; con 3×3 esta forma cerrada alcanza y sobra)
    const dx = yy * zz - yz * yz, dy = xx * zz - xz * xz, dz = xx * yy - xy * xy;
    const n = new THREE.Vector3();
    if (dx >= dy && dx >= dz && dx > 1e-12) n.set(dx, xz * yz - xy * zz, xy * yz - xz * yy);
    else if (dy >= dz && dy > 1e-12) n.set(xz * yz - xy * zz, dy, xy * xz - yz * xx);
    else if (dz > 1e-12) n.set(xy * yz - xz * yy, xy * xz - yz * xx, dz);
    const plano = n.lengthSq() > 1e-12;
    if (plano) n.normalize();
    const desvio = plano ? Math.max(...cloud.map((p) => Math.abs(p.clone().sub(c).dot(n)))) : Infinity;

    const col = new THREE.Color(brush.color);
    // flatShading: cada cara recibe su propia luz y el cuerpo se LEE como
    // volumen. Sin esto, un cuerpo del color del pincel (casi negro, lo
    // habitual al dibujar) sale como una mancha plana y no se entiende nada.
    const mat = new THREE.MeshStandardMaterial({
      color: col, roughness: 0.8, metalness: 0, side: THREE.DoubleSide,
      transparent: brush.opacity < 1, opacity: brush.opacity, flatShading: true,
      // las aristas caen EXACTAMENTE sobre el borde de las caras: sin correr
      // el relleno hacia atrás, el z-fighting se las come y el cuerpo vuelve a
      // leerse como una mancha (verificado: las líneas existían y no se veían).
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });

    // COPLANAR (dentro del 2% del tamaño): extruir la silueta
    if (plano && desvio < diag * 0.02) {
      const u = new THREE.Vector3(1, 0, 0);
      if (Math.abs(n.dot(u)) > 0.9) u.set(0, 1, 0);
      u.crossVectors(n, u).normalize();
      const v = new THREE.Vector3().crossVectors(n, u).normalize();
      const plana = cloud.map((p) => {
        const d = p.clone().sub(c);
        return new THREE.Vector2(d.dot(u), d.dot(v));
      });
      // La silueta se toma del casco convexo 2D: un contorno dibujado a mano
      // se cruza consigo mismo y ExtrudeGeometry con un polígono auto-secante
      // devuelve basura. Con el casco siempre sale un cuerpo válido.
      const hull = WebGLDesign3D.hull2D(plana);
      if (hull.length < 3) return null;
      const espesor = Math.max(diag * 0.12, 0.05);
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(hull), {
        depth: espesor, bevelEnabled: false, curveSegments: 4,
      });
      geo.translate(0, 0, -espesor / 2);   // centrado en la silueta, no colgando de ella
      const mesh = new THREE.Mesh(geo, mat);
      mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
      mesh.position.copy(c);
      WebGLDesign3D.addBodyEdges(mesh, col);
      return mesh;
    }

    // VOLUMEN en el espacio: casco convexo de todo lo elegido
    try {
      const geo = new ConvexGeometry(cloud.map((p) => p.clone()));
      if (!geo.getAttribute('position')?.count) return null;
      const mesh = new THREE.Mesh(geo, mat);
      WebGLDesign3D.addBodyEdges(mesh, col);
      return mesh;
    } catch {
      return null;   // nube degenerada (todo alineado): no hay cuerpo posible
    }
  }

  /** Dibuja las aristas del cuerpo. Es lo que termina de darle forma legible:
   *  claras si el cuerpo es oscuro y viceversa, para que se entienda tanto
   *  sobre fondo claro como oscuro. */
  private static addBodyEdges(mesh: THREE.Mesh, col: THREE.Color): void {
    const lum = 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry, 18),
      new THREE.LineBasicMaterial({
        color: lum < 0.5 ? 0xffffff : 0x000000, transparent: true, opacity: 0.35,
      }));
    edges.renderOrder = 1;
    mesh.add(edges);
  }

  /** Casco convexo 2D (monotone chain). Devuelve el contorno en sentido
   *  antihorario, sin el punto de cierre repetido. */
  private static hull2D(pts: THREE.Vector2[]): THREE.Vector2[] {
    const p = pts.slice().sort((a, b) => (a.x - b.x) || (a.y - b.y));
    if (p.length < 3) return p;
    const cruz = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const media = (src: THREE.Vector2[]): THREE.Vector2[] => {
      const out: THREE.Vector2[] = [];
      for (const q of src) {
        while (out.length >= 2 && cruz(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
        out.push(q);
      }
      out.pop();
      return out;
    };
    return [...media(p), ...media(p.slice().reverse())];
  }

  /** Ctrl+E: convierte lo seleccionado en un VOLUMEN. Los trazos de origen se
   *  conservan (son el "andamio"): borrarlos es una decisión del dibujante. */
  solidifySelection(): boolean {
    const recs = [...this.selected].filter((r) => r.kind === 'stroke' && r.points.length >= 2);
    if (!recs.length) return false;
    const cloud: THREE.Vector3[] = [];
    for (const r of recs) {
      r.object.updateMatrixWorld(true);
      for (const p of r.points) cloud.push(r.object.localToWorld(p.clone()));
    }
    const brush = { ...recs[0].brush };
    const mesh = this.buildSolidMesh(cloud, brush);
    if (!mesh) return false;
    const group = new THREE.Group();
    group.add(mesh);
    const rec: StrokeRecord = {
      id: `solid-${this.seq++}`, object: group, points: cloud,
      pressures: cloud.map(() => 1), kind: 'stroke', solid: true,
      layerId: this.activeLayerId(), baseOpacity: brush.opacity, brush,
    };
    group.userData.strokeId = rec.id;
    this.addStrokeRecord(rec);
    this.setSelection([rec]);
    this.pushCmd({
      undo: () => { this.removeStrokeRecord(rec); this.setSelection([]); },
      redo: () => { this.addStrokeRecord(rec); this.setSelection([rec]); },
    });
    return true;
  }

  /** Rellena la forma cerrada que contiene al trazo bajo el cursor. */
  private fillAtPointer(): boolean {
    // orden: lo que está bajo el cursor, la forma que lo CONTIENE, o la línea
    // más cercana. El caso del medio es el que faltaba (clic dentro de una figura).
    const seed = this.pickStroke() ?? this.pickEnclosingStroke() ?? this.pickNearestStroke();
    if (!seed || seed.fill || seed.solid) return false;
    // Un trazo que YA se cierra sobre sí mismo (una figura, o un círculo hecho
    // con Ctrl) se rellena directo: findClosedLoop busca ciclos ENTRE trazos
    // distintos y nunca encontraba este caso — el balde no hacía nada sobre un
    // rectángulo perfectamente cerrado, que es lo más obvio para rellenar.
    if (seed.points.length >= 3
        && seed.points[0].distanceTo(seed.points[seed.points.length - 1]) <= WebGLDesign3D.WELD_EPS) {
      const propio = seed.points.map((q) => seed.object.localToWorld(q.clone()));
      return this.makeFill(propio);
    }
    const loop = this.findClosedLoop(seed);
    if (!loop) {
      this.canvas.title = 'La forma no está cerrada: uní las puntas de los trazos para poder rellenarla';
      this.cursorEl.style.borderColor = '#ff4d4d';
      setTimeout(() => { this.canvas.title = ''; this.cursorEl.style.borderColor = '#333'; }, 1600);
      return false;
    }
    return this.makeFill(this.loopOutline(loop));
  }

  /** Crea la cara sólida de un contorno cerrado (en coordenadas de mundo). */
  private makeFill(outline: THREE.Vector3[]): boolean {
    const mesh = this.buildFillMesh(outline, this.brush);
    if (!mesh) return false;
    const group = new THREE.Group();
    group.add(mesh);
    const rec: StrokeRecord = {
      id: `fill-${this.seq++}`, object: group, points: outline, pressures: outline.map(() => 1),
      kind: 'stroke', fill: true, layerId: this.activeLayerId(),
      baseOpacity: this.brush.opacity, brush: { ...this.brush },
    };
    group.userData.strokeId = rec.id;
    this.addStrokeRecord(rec);
    this.pushCmd({ undo: () => this.removeStrokeRecord(rec), redo: () => this.addStrokeRecord(rec) });
    return true;
  }

  /** Trazo más cercano al cursor en pantalla (si el click no pegó justo en el
   *  tubo, que es fino). */
  /** Trazo CERRADO que contiene al cursor (en pantalla). Es lo que hace que el
   *  balde funcione clickeando en el MEDIO de una forma, que es como se usa un
   *  balde: `pickNearestStroke` solo llega a 40 px de la línea, así que dentro
   *  de un rectángulo grande no encontraba nada y el balde no hacía nada.
   *  Si hay varias formas encimadas, gana la más chica (la de adentro). */
  private pickEnclosingStroke(): StrokeRecord | null {
    const rect = this.canvasBox();
    const px = ((this.pointer.x + 1) / 2) * rect.width;
    const py = ((1 - this.pointer.y) / 2) * rect.height;
    const cam = this.camera as THREE.Camera;
    let best: StrokeRecord | null = null, bestArea = Infinity;
    for (const rec of this.strokes) {
      if (rec.kind !== 'stroke' || rec.fill || rec.solid || rec.points.length < 3) continue;
      if (rec.points[0].distanceTo(rec.points[rec.points.length - 1]) > WebGLDesign3D.WELD_EPS) continue;
      rec.object.updateMatrixWorld(true);
      const poly = rec.points.map((q) => {
        const w = rec.object.localToWorld(q.clone()).project(cam);
        return [((w.x + 1) / 2) * rect.width, ((1 - w.y) / 2) * rect.height] as [number, number];
      });
      let dentro = false, area = 0;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) dentro = !dentro;
        area += xi * yj - xj * yi;
      }
      area = Math.abs(area) / 2;
      if (dentro && area < bestArea) { bestArea = area; best = rec; }
    }
    return best;
  }

  private pickNearestStroke(): StrokeRecord | null {
    const rect = this.canvasBox();
    const cx = ((this.pointer.x + 1) / 2) * rect.width;
    const cy = ((1 - this.pointer.y) / 2) * rect.height;
    const cam = this.camera as THREE.Camera;
    let best: StrokeRecord | null = null, bestD = 40;
    for (const rec of this.strokes) {
      if (rec.kind !== 'stroke' || rec.fill) continue;
      for (const p of rec.points) {
        const w = p.clone().add(rec.object.position).project(cam);
        const d = Math.hypot(((w.x + 1) / 2) * rect.width - cx, ((1 - w.y) / 2) * rect.height - cy);
        if (d < bestD) { bestD = d; best = rec; }
      }
    }
    return best;
  }

  private pickGuide(): { id: string; mesh: THREE.Mesh } | null {
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const hits = this.raycaster.intersectObjects(this.guidesGroup.children, false);
    if (!hits.length) return null;
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.guideId) obj = obj.parent;
    if (!obj) return null;
    const id = obj.userData.guideId as string;
    return this.guides.find((g) => g.id === id) ?? null;
  }

  hasGuide(): boolean {
    return this.guides.length > 0;
  }

  /** "Guía invisible" (truco de Feather): bajar la opacidad a 0 no la
   *  desactiva — sigue dando soporte matemático a los trazos (resolveHit no
   *  mira la opacidad), solo deja de estorbar visualmente. Afecta a TODAS
   *  las guías activas por igual. */
  setGuideOpacity(v: number): void {
    const op = THREE.MathUtils.clamp(v, 0, 1);
    for (const g of this.guides) {
      (g.mesh.material as THREE.MeshStandardMaterial).opacity = op * 0.08;
      const edges = g.mesh.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments | undefined;
      if (edges) (edges.material as THREE.LineBasicMaterial).opacity = op * 0.25;
    }
  }

  // ---------------------------------------------------------------- selección

  /** Completa la selección con los hermanos de grupo: tocar una parte de un
   *  grupo agarra el grupo entero. Sin esto, Ctrl+G no se notaría al usar. */
  private withGroupMates(recs: StrokeRecord[]): StrokeRecord[] {
    const ids = new Set(recs.map((r) => r.groupId).filter(Boolean) as string[]);
    if (!ids.size) return recs;
    const out = new Set(recs);
    for (const r of this.strokes) if (r.groupId && ids.has(r.groupId)) out.add(r);
    return [...out];
  }

  private setSelection(recs: StrokeRecord[]): void {
    recs = this.withGroupMates(recs);
    this.selectedGuide = null;
    for (const r of this.selected) this.highlight(r, false);
    this.selected = new Set(recs);
    for (const r of this.selected) this.highlight(r, true);
    this.syncGizmo();
    this.showSelectionBox();
    this.publishObjects();
  }

  /** Elige una guía con la herramienta 'move' (no arrastre libre — se mueve
   *  y deforma con el gizmo). `null` deselecciona. */
  private selectGuide(g: { id: string; mesh: THREE.Mesh } | null): void {
    this.selectedGuide = g;
    if (g) this.selectedSurface = null;
    for (const r of this.selected) this.highlight(r, false);
    this.selected = new Set();
    this.syncGizmo();
  }

  /** Selecciona una superficie (plano/cilindro/…) para transformarla con el
   *  gizmo: mover, escalar y rotar, igual que un trazo o una guía. */
  private selectSurface(s: SurfaceObj | null): void {
    this.selectedSurface = s;
    if (s) {
      this.selectedGuide = null;
      this.activeSurfaceId = s.id;
      for (const r of this.selected) this.highlight(r, false);
      this.selected = new Set();
    }
    this.syncGizmo();
  }

  /** Copia la guía elegida (posición, orientación, tamaño) desplazada un
   *  poco para no tapar la original — Ctrl+D con una guía seleccionada. */
  private duplicateGuide(g: { id: string; mesh: THREE.Mesh }): void {
    const offset = new THREE.Vector3(0.4, 0, 0.4);
    const clone = g.mesh.clone(true);
    const anchors = g.mesh.userData.guideAnchors as THREE.Vector3[] | undefined;
    if (Array.isArray(anchors)) clone.userData.guideAnchors = anchors.map((p) =>
      p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(Number((p as { x?: number }).x || 0),
        Number((p as { y?: number }).y || 0), Number((p as { z?: number }).z || 0)));
    clone.position.add(offset);
    clone.traverse((o) => {
      const withMat = o as THREE.Mesh | THREE.Line | THREE.LineSegments;
      if (withMat.material) {
        withMat.material = Array.isArray(withMat.material)
          ? withMat.material.map((m) => m.clone())
          : withMat.material.clone();
      }
    });
    const plane = g.mesh.userData.guidePlane as THREE.Plane | undefined;
    if (plane) clone.userData.guidePlane = plane.clone().translate(offset);
    this.setGuide(clone);
    this.selectGuide({ id: clone.userData.guideId as string, mesh: clone });
  }

  /** El gizmo de mover/escalar se adjunta a lo que esté elegido con la
   *  herramienta 'move': un trazo (si hay exactamente uno — con varios sigue
   *  el arrastre libre de siempre) o una guía. */
  // ---------------------------------------------------------------- joystick

  /** Qué se lleva el Escape, en orden: primero cancela el gesto que este en
   *  curso, después deshace la selección. Devuelve true si hizo algo.
   *
   *  Existe porque Escape también CIERRA el módulo 3D: sin esto, cancelar un
   *  arrastre a medias o soltar la selección se llevaba puesto el módulo
   *  entero, que es lo último que uno quiere mientras trabaja. El componente
   *  pregunta primero y solo cierra si acá no había nada que hacer. */
  escapeConsume(): boolean {
    if (this.joy?.arrastrando) { this.joyEndDrag(true); return true; }
    if (this.mode === 'draw' && this.current) { this.commitStroke(); return true; }
    if (this.selected.size || this.selectedGuide || this.selectedSurface || this.editingStroke) {
      this.setSelection([]);
      this.selectGuide(null);
      this.selectSurface(null);
      this.clearPointEdit();
      return true;
    }
    return false;
  }

  /** Prender/apagar el joystick. Apagado, manda el gizmo clasico de siempre. */
  setJoystick(on: boolean): void {
    this.joyOn = on;
    if (!on) { this.joyEndDrag(true); this.joy?.update(this.camera as THREE.Camera, null); }
    this.syncGizmo();
    if (on) this.joyRefresh();
    this.avisarJoy();
  }
  getJoystick(): boolean { return this.joyOn; }
  /** La barra escucha esto: sin el aviso, prender el joystick con la tecla J
   *  dejaba el boton apagado y no habia forma de saber en que modo estabas. */
  private avisarJoy(): void {
    this.canvas.dispatchEvent(new CustomEvent('low3d:joy', { bubbles: true }));
  }
  setJoyMode(m: JoyMode): void { this.joy?.setMode(m); this.avisarJoy(); }
  getJoyMode(): JoyMode { return this.joy?.mode ?? '3d'; }
  toggleJoyMode(): JoyMode { const m = this.joy?.toggleMode() ?? '3d'; this.avisarJoy(); return m; }
  setJoyLocked(v: boolean): void { this.joy?.setLocked(v); this.avisarJoy(); }
  getJoyLocked(): boolean { return this.joy?.locked ?? false; }
  /** Lectura numerica del gesto en curso ("Y +1.20", "45.0 grados", "120%"). */
  getJoyLectura(): string { return this.joy?.lectura ?? ''; }

  /** Centro del control: el del objeto elegido. Durante el gesto sale del
   *  proxy, no de la caja: la caja de un objeto ROTANDO cambia de tamano en
   *  cada frame y el control se iria saltando solo. */
  private joyCentro(): THREE.Vector3 | null {
    if (!this.joyOn || this.tool !== 'move') return null;
    if (this.joyProxy) return this.joyProxy.getWorldPosition(new THREE.Vector3());
    if (this.rig) return this.rig.getWorldPosition(new THREE.Vector3());
    const objs: THREE.Object3D[] = [];
    if (this.selected.size) objs.push(...[...this.selected].map((r) => r.object));
    else if (this.selectedGuide) objs.push(this.selectedGuide.mesh);
    else if (this.selectedSurface) objs.push(this.selectedSurface.mesh);
    if (!objs.length) return null;
    const box = new THREE.Box3();
    for (const o of objs) box.expandByObject(o);
    return box.isEmpty() ? objs[0].getWorldPosition(new THREE.Vector3()) : box.getCenter(new THREE.Vector3());
  }

  /** Pone el control en su lugar y con su tamano. Se llama desde el loop, pero
   *  TAMBIEN cada vez que cambia la seleccion y justo antes de leer un click:
   *  requestAnimationFrame se pausa cuando la ventana no esta visible, y si el
   *  widget dependiera solo del loop podria estar invisible o en el lugar
   *  equivocado justo cuando el usuario lo va a agarrar. */
  private joyRefresh(): void {
    this.joy?.update(this.camera as THREE.Camera, this.joyCentro());
  }

  /** Puntos originales de los trazos al empezar un gesto de escala: cada paso
   *  del arrastre recalcula desde el ORIGINAL en vez de acumular, si no el
   *  redondeo del factor se va multiplicando y la forma se deforma sola. */
  private joyPuntos: { rec: StrokeRecord; pts: THREE.Vector3[] }[] = [];

  /** Estira los trazos elegidos en los ejes de la PANTALLA, alrededor del
   *  centro del control. Deforma la geometria en vez de la transformacion,
   *  que es la unica forma de que "solo el ancho" siga significando algo
   *  cuando el objeto ya esta rotado. */
  private joyEscalarPuntos(fu: number, fv: number, u: THREE.Vector3, v: THREE.Vector3,
                           n: THREE.Vector3, centro: THREE.Vector3): void {
    for (const item of this.joyPuntos) {
      const rec = item.rec;
      rec.points = item.pts.map((p0) => {
        const d = p0.clone().sub(centro);
        return centro.clone()
          .addScaledVector(u, d.dot(u) * fu)
          .addScaledVector(v, d.dot(v) * fv)
          .addScaledVector(n, d.dot(n));
      });
      this.rebuildStrokeMesh(rec);
    }
    this.publishObjects();
  }

  /** Envuelve el objeto para el gesto (ver el comentario de joyProxy). */
  private joyWrap(target: THREE.Object3D): THREE.Object3D {
    const box = new THREE.Box3().setFromObject(target);
    const centro = box.isEmpty()
      ? target.getWorldPosition(new THREE.Vector3())
      : box.getCenter(new THREE.Vector3());
    const proxy = new THREE.Object3D();
    proxy.position.copy(centro);
    this.scene.add(proxy);
    this.joyOwnerParent = target.parent ?? this.strokesGroup;
    this.joyBefore = {
      pos: target.position.clone(),
      quat: target.quaternion.clone(),
      scale: target.scale.clone(),
    };
    proxy.attach(target);   // conserva la transformacion mundial
    this.joyOwner = target;
    this.joyProxy = proxy;
    return proxy;
  }

  /** Devuelve el objeto a su padre y anota el gesto en el historial. */
  private joyUnwrap(): void {
    if (!this.joyProxy) return;
    const target = this.joyOwner;
    const padre = this.joyOwnerParent;
    const before = this.joyBefore;
    this.scene.remove(this.joyProxy);
    this.joyProxy = null;
    this.joyOwner = null;
    this.joyOwnerParent = null;
    this.joyBefore = null;
    if (!target || !padre) return;
    padre.attach(target);   // aca el objeto se queda con la transformacion real
    if (!before) return;
    const after = {
      pos: target.position.clone(),
      quat: target.quaternion.clone(),
      scale: target.scale.clone(),
    };
    const cambio = before.pos.distanceToSquared(after.pos) > 1e-10
      || before.quat.angleTo(after.quat) > 1e-5
      || before.scale.distanceToSquared(after.scale) > 1e-10;
    if (!cambio) return;
    this.pushCmd({
      undo: () => { target.position.copy(before.pos); target.quaternion.copy(before.quat); target.scale.copy(before.scale); },
      redo: () => { target.position.copy(after.pos); target.quaternion.copy(after.quat); target.scale.copy(after.scale); },
    });
  }

  /** El pointerdown cayo en el joystick? Si si, arranca el gesto. */
  private joyTryBegin(e: PointerEvent): boolean {
    if (!this.joyOn || !this.joy || this.tool !== 'move') return false;
    this.joyRefresh();
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const part = this.joy.pick(this.raycaster);
    if (!part) return false;
    // ESCALA sobre trazos: no se envuelve nada, se deforman los puntos (ver
    // joyEscalarPuntos). El resto de los gestos si usan proxy/rig.
    const centroGesto = this.joyCentro();
    if (Joystick3D.esEscala(part) && this.selected.size && centroGesto) {
      this.joyPuntos = [...this.selected].map((r) => ({ rec: r, pts: r.points.map((q) => q.clone()) }));
      const escalar = (fu: number, fv: number, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3) =>
        this.joyEscalarPuntos(fu, fv, u, v, n, centroGesto);
      const okE = this.joy.begin(part, this.raycaster, this.camera as THREE.Camera,
                                 new THREE.Object3D(), this.pointer.clone(), escalar);
      if (!okE) { this.joyPuntos = []; return false; }
      this.capturePointer(e);
      this.activePointerId = e.pointerId;
      this.mode = 'joystick';
      this.controls.enabled = false;
      return true;
    }
    // VARIOS objetos: se cuelgan de un rig centrado, que ya sabe hornear el
    // gesto en un solo Ctrl+Z (detachRig)
    let target: THREE.Object3D | null = null;
    if (this.selected.size > 1) {
      const objs = [...this.selected].map((r) => r.object);
      if (!this.rigMatches(objs)) { this.detachRig(); this.attachRig(objs); }
      target = this.rig;
    } else {
      const uno = this.selected.size === 1 ? [...this.selected][0].object
        : this.selectedGuide?.mesh ?? this.selectedSurface?.mesh ?? null;
      if (uno) target = this.joyWrap(uno);
    }
    if (!target) return false;
    const ok = this.joy.begin(part, this.raycaster, this.camera as THREE.Camera, target,
                              this.pointer.clone());
    if (!ok) { this.joyUnwrap(); return false; }
    this.capturePointer(e);
    this.activePointerId = e.pointerId;
    this.mode = 'joystick';
    this.controls.enabled = false;
    return true;
  }

  private joyMoveDrag(e: PointerEvent): void {
    if (!this.joy?.arrastrando) return;
    this.setPointerFromEvent(e);
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    this.joy.move(this.raycaster, this.camera as THREE.Camera, this.pointer.clone());
    this.mostrarLecturaJoy(e);
  }

  /** La lectura sigue al cursor mientras dura el gesto. */
  private mostrarLecturaJoy(e: PointerEvent): void {
    const texto = this.joy?.lectura ?? '';
    if (!texto) { this.joyLecturaEl.style.display = 'none'; return; }
    const [x, y] = this.pointerInCanvas(e);
    this.joyLecturaEl.textContent = texto;
    this.joyLecturaEl.style.left = `${x}px`;
    this.joyLecturaEl.style.top = `${y}px`;
    this.joyLecturaEl.style.display = 'block';
  }

  /** Cierra el gesto. `cancelar` deja todo como estaba (Escape). */
  private joyEndDrag(cancelar = false): void {
    if (!this.joy?.arrastrando) return;
    this.joyLecturaEl.style.display = 'none';
    // gesto de escala: el cambio esta en los PUNTOS, asi que el historial guarda
    // puntos, no transformaciones
    if (this.joyPuntos.length) {
      const items = this.joyPuntos;
      this.joyPuntos = [];
      this.joy.end();
      if (cancelar) {
        for (const it of items) { it.rec.points = it.pts; this.rebuildStrokeMesh(it.rec); }
      } else {
        const despues = items.map((it) => ({ rec: it.rec, pts: it.rec.points.map((q) => q.clone()) }));
        const cambio = items.some((it, i) => it.pts.some((q, k) => q.distanceToSquared(despues[i].pts[k]) > 1e-12));
        if (cambio) {
          const aplicar = (lista: { rec: StrokeRecord; pts: THREE.Vector3[] }[]) => {
            for (const it of lista) { it.rec.points = it.pts.map((q) => q.clone()); this.rebuildStrokeMesh(it.rec); }
            this.publishObjects();
          };
          this.pushCmd({ undo: () => aplicar(items), redo: () => aplicar(despues) });
        }
      }
      this.controls.enabled = true;
      this.syncGizmo();
      this.publishObjects();
      return;
    }
    if (cancelar) this.joy.cancelar(); else this.joy.end();
    if (this.rig) this.detachRig();
    this.joyUnwrap();
    this.controls.enabled = true;
    this.syncGizmo();
    this.publishObjects();
  }


  private syncGizmo(): void {
    if (!this.gizmo) return;
    if (this.tool !== 'move') { this.detachRig(); this.resetPivot(); this.gizmo.detach(); return; }
    // con el joystick prendido, el gizmo clasico se queda quieto: los dos
    // juntos se pisan los blancos y no se sabe cual estas agarrando
    if (this.joyOn) { this.resetPivot(); this.gizmo.detach(); this.joyRefresh(); return; }
    // VARIOS objetos elegidos (o un grupo de Ctrl+G): se transforman juntos
    // colgándolos de un rig temporal. Antes, con más de uno, el gizmo
    // simplemente no aparecía y no había forma de moverlos en bloque.
    if (this.selected.size > 1) {
      const objs = [...this.selected].map((r) => r.object);
      if (!this.rigMatches(objs)) { this.detachRig(); this.attachRig(objs); }
      if (this.rig) { this.resetPivot(); this.gizmo.attach(this.rig); return; }
    }
    this.detachRig();
    let target: THREE.Object3D | null = null;
    if (this.selected.size === 1) target = [...this.selected][0].object;
    else if (this.selectedGuide) target = this.selectedGuide.mesh;
    else if (this.selectedSurface) target = this.selectedSurface.mesh;
    if (!target) { this.resetPivot(); this.gizmo.detach(); return; }
    if (this.currentGizmoMode === 'rotate') {
      if (this.pivotForObj !== target) {
        this.unwrapPivot();
        this.pivotForObj = target;
        this.pivotWorldPos = target.getWorldPosition(new THREE.Vector3());
      }
      this.applyPivotAttachment(target);
      this.showPivotMarker();
    } else {
      this.unwrapPivot();
      this.hidePivotMarker();
      this.gizmo.attach(target);
    }
  }

  // ---------------------------------------------------------------- grupos

  /** Caja del objeto seleccionado. Es lo que hace que un grupo se LEA como una
   *  sola pieza: sin ella, agrupar no se notaba en ninguna parte de la pantalla. */
  private selBox?: THREE.Box3Helper;

  private showSelectionBox(): void {
    if (this.selBox) { this.scene.remove(this.selBox); this.selBox.geometry.dispose(); this.selBox = undefined; }
    if (this.selected.size < 2) return;   // con una sola pieza ya está el gizmo
    const box = new THREE.Box3();
    for (const r of this.selected) { r.object.updateMatrixWorld(true); box.expandByObject(r.object); }
    if (box.isEmpty()) return;
    // un poco de aire para que la caja no corte el trazo
    const aire = box.getSize(new THREE.Vector3()).length() * 0.02;
    box.expandByScalar(Math.max(aire, 0.02));
    this.selBox = new THREE.Box3Helper(box, new THREE.Color(LOW_CYAN));
    (this.selBox.material as THREE.LineBasicMaterial).depthTest = false;
    (this.selBox.material as THREE.LineBasicMaterial).transparent = true;
    (this.selBox.material as THREE.LineBasicMaterial).opacity = 0.75;
    this.selBox.renderOrder = 999;
    this.scene.add(this.selBox);
  }

  /** Nombre visible de cada grupo. Un objeto sin nombre no es un objeto: hay
   *  que poder encontrarlo en la lista y renombrarlo. */
  private groupNames = new Map<string, string>();

  /** Publica al store la lista de OBJETOS tal como los ve el usuario: cada
   *  grupo cuenta como uno solo, y los trazos sueltos van aparte. */
  private publishObjects(): void {
    const vistos = new Map<string, { id: string; name: string; kind: 'group' | 'stroke' | 'fill' | 'solid'; count: number; selected: boolean }>();
    const sueltos: typeof vistos extends Map<string, infer V> ? V[] : never[] = [];
    for (const rec of this.strokes) {
      if (rec.kind === 'guide') continue;
      const sel = this.selected.has(rec);
      if (rec.groupId) {
        const g = vistos.get(rec.groupId);
        if (g) { g.count++; g.selected = g.selected || sel; }
        else vistos.set(rec.groupId, {
          id: rec.groupId, name: this.groupNames.get(rec.groupId) || `Objeto ${vistos.size + 1}`,
          kind: 'group', count: 1, selected: sel,
        });
      } else {
        const nombreFigura = { rect: 'Rectángulo', circle: 'Círculo', poly: 'Polígono' };
        sueltos.push({
          id: rec.id,
          // "Rectángulo relleno" vs "Rectángulo": en la lista los dos se veían
          // idénticos y no había forma de saber cuál llevaba cara sólida
          name: rec.solid ? 'Volumen' : rec.fill ? 'Relleno'
            : rec.shape ? nombreFigura[rec.shape] + (rec.filled ? ' relleno' : '') : 'Línea',
          kind: rec.solid ? 'solid' : rec.fill ? 'fill' : 'stroke', count: 1, selected: sel,
        });
      }
    }
    lowStore.setObjects([...vistos.values(), ...sueltos]);
  }

  /** Selecciona un objeto de la lista (un grupo entero o un trazo suelto). */
  selectObjectById(id: string): void {
    const recs = this.strokes.filter((r) => r.groupId === id || r.id === id);
    if (recs.length) this.setSelection(recs);
  }

  /** Renombra un grupo. */
  renameObject(id: string, name: string): void {
    if (!name.trim()) return;
    this.groupNames.set(id, name.trim());
    this.publishObjects();
  }

  /** Desagrupa por id (desde el panel, sin tener que seleccionarlo antes). */
  ungroupById(id: string): void {
    const recs = this.strokes.filter((r) => r.groupId === id);
    if (!recs.length) return;
    this.setSelection(recs);
    this.ungroupSelection();
  }

  /** Ctrl+G: une lo seleccionado en un grupo. A partir de acá se elige,
   *  se mueve, se deforma y se borra como una sola cosa. */
  groupSelection(): boolean {
    const recs = [...this.selected];
    if (recs.length < 2) return false;
    const id = `grp-${this.seq++}`;
    const before = recs.map((r) => r.groupId);
    const apply = (ids: (string | undefined)[]) => {
      recs.forEach((r, i) => { r.groupId = ids[i]; });
      this.setSelection(recs);
    };
    apply(recs.map(() => id));
    this.publishObjects();
    this.pushCmd({
      undo: () => { apply(before); this.publishObjects(); },
      redo: () => { apply(recs.map(() => id)); this.publishObjects(); },
    });
    return true;
  }

  /** Ctrl+Shift+G: desarma el grupo (los objetos quedan donde están). */
  ungroupSelection(): boolean {
    const recs = [...this.selected].filter((r) => r.groupId);
    if (!recs.length) return false;
    const before = recs.map((r) => r.groupId);
    const apply = (ids: (string | undefined)[]) => {
      recs.forEach((r, i) => { r.groupId = ids[i]; });
      this.setSelection(recs);
    };
    this.detachRig();
    apply(recs.map(() => undefined));
    this.publishObjects();
    this.pushCmd({
      undo: () => { apply(before); this.publishObjects(); },
      redo: () => { apply(recs.map(() => undefined)); this.publishObjects(); },
    });
    return true;
  }

  // ---------------------------------------------------------------- rig de selección múltiple

  /** ¿El rig actual es exactamente el de estos objetos? Evita rearmarlo (y
   *  perder la transformación en curso) en cada syncGizmo. */
  private rigMatches(objs: THREE.Object3D[]): boolean {
    if (!this.rig || this.rigMembers.length !== objs.length) return false;
    return objs.every((o) => this.rigMembers.some((m) => m.obj === o));
  }

  /** Cuelga los objetos de un rig centrado en la selección y le da el gizmo.
   *  `attach()` conserva la posición mundial, así que nada se mueve al armarlo. */
  private attachRig(objs: THREE.Object3D[]): void {
    if (objs.length < 2) return;
    const box = new THREE.Box3();
    for (const o of objs) box.expandByObject(o);
    if (box.isEmpty()) return;
    const rig = new THREE.Group();
    rig.position.copy(box.getCenter(new THREE.Vector3()));
    this.scene.add(rig);
    this.rigMembers = objs.map((o) => ({
      obj: o, parent: o.parent ?? this.strokesGroup,
      pos: o.position.clone(), quat: o.quaternion.clone(), scale: o.scale.clone(),
    }));
    for (const o of objs) rig.attach(o);
    this.rig = rig;
  }

  /** Devuelve los objetos a su padre y anota UN solo comando de historial con
   *  el cambio de todos: deshacer un movimiento de grupo tiene que ser un
   *  Ctrl+Z, no uno por objeto. */
  private detachRig(): void {
    if (!this.rig) return;
    const members = this.rigMembers;
    this.rigMembers = [];
    for (const m of members) m.parent.attach(m.obj);
    this.scene.remove(this.rig);
    this.rig = null;
    const after = members.map((m) => ({
      pos: m.obj.position.clone(), quat: m.obj.quaternion.clone(), scale: m.obj.scale.clone(),
    }));
    const changed = members.some((m, i) =>
      m.pos.distanceToSquared(after[i].pos) > 1e-8
      || m.quat.angleTo(after[i].quat) > 1e-4
      || m.scale.distanceToSquared(after[i].scale) > 1e-8);
    if (!changed) return;
    const before = members.map((m) => ({ pos: m.pos, quat: m.quat, scale: m.scale }));
    const objs = members.map((m) => m.obj);
    const apply = (st: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }[]) =>
      objs.forEach((o, i) => {
        o.position.copy(st[i].pos); o.quaternion.copy(st[i].quat); o.scale.copy(st[i].scale);
      });
    this.pushCmd({ undo: () => apply(before), redo: () => apply(after) });
  }

  // ---------------------------------------------------------------- eje móvil de rotación

  private resetPivot(): void {
    this.unwrapPivot();
    this.hidePivotMarker();
    this.pivotWorldPos = null;
    this.pivotForObj = null;
  }

  private showPivotMarker(): void {
    if (!this.pivotMarker || !this.pivotWorldPos) return;
    this.pivotMarker.position.copy(this.pivotWorldPos);
    this.pivotMarker.visible = true;
  }

  private hidePivotMarker(): void {
    if (this.pivotMarker) this.pivotMarker.visible = false;
  }

  /** ¿El pointer actual cayó sobre el marcador de pivote? Proximidad en
   *  pantalla (como pickCutPoint), no raycast exacto: la esfera es chica y
   *  suele quedar pegada a los anillos del gizmo de rotación. */
  private pickPivotMarker(): boolean {
    if (!this.pivotMarker?.visible) return false;
    const rect = this.canvasBox();
    const cx = ((this.pointer.x + 1) / 2) * rect.width;
    const cy = ((1 - this.pointer.y) / 2) * rect.height;
    const w = this.pivotMarker.getWorldPosition(new THREE.Vector3()).project(this.camera as THREE.Camera);
    const sx = ((w.x + 1) / 2) * rect.width;
    const sy = ((1 - w.y) / 2) * rect.height;
    return Math.hypot(sx - cx, sy - cy) < 16;
  }

  /** Decide, según qué tan lejos está el pivote elegido del origen propio
   *  del objeto, si hace falta el truco del proxy (pivote custom) o alcanza
   *  con el attach directo de siempre (pivote = origen del objeto, sin
   *  reparenting). Se llama después de mover el marcador y después de cada
   *  gesto de rotación — nunca en medio de un drag activo del gizmo. */
  private applyPivotAttachment(target: THREE.Object3D): void {
    if (!this.gizmo || this.currentGizmoMode !== 'rotate' || !this.pivotWorldPos) return;
    const wp = target.getWorldPosition(new THREE.Vector3());
    const custom = this.pivotWorldPos.distanceToSquared(wp) > WebGLDesign3D.PIVOT_EPS;
    if (custom) {
      this.wrapPivot(target);
    } else {
      if (this.pivotProxy) this.unwrapPivot();
      this.gizmo.attach(target);
    }
  }

  private wrapPivot(target: THREE.Object3D): void {
    if (!this.pivotWorldPos) return;
    if (this.pivotProxy && this.pivotOwnerObj === target) {
      this.pivotProxy.position.copy(this.pivotWorldPos);
      this.gizmo?.attach(this.pivotProxy);
      return;
    }
    if (this.pivotProxy) this.unwrapPivot();
    this.pivotOwnerObj = target;
    this.pivotOwnerParent = target.parent;
    this.pivotBeforePos.copy(target.position);
    this.pivotBeforeQuat.copy(target.quaternion);
    const proxy = new THREE.Object3D();
    proxy.position.copy(this.pivotWorldPos);
    this.scene.add(proxy);
    proxy.attach(target); // preserva la transformación mundial del objeto
    this.pivotProxy = proxy;
    this.gizmo?.attach(proxy);
  }

  /** Devuelve el objeto a su grupo original con la transformación acumulada
   *  ya "horneada" en su position/quaternion, y empuja el undo/redo del
   *  gesto de rotación (antes/después capturados en wrapPivot). */
  private unwrapPivot(): void {
    if (!this.pivotProxy || !this.pivotOwnerObj) return;
    const obj = this.pivotOwnerObj;
    const parent = this.pivotOwnerParent ?? this.strokesGroup;
    parent.attach(obj);
    this.scene.remove(this.pivotProxy);
    const before = this.pivotBeforePos.clone();
    const beforeQuat = this.pivotBeforeQuat.clone();
    const after = obj.position.clone();
    const afterQuat = obj.quaternion.clone();
    this.pivotProxy = null;
    this.pivotOwnerObj = null;
    this.pivotOwnerParent = null;
    if (before.distanceToSquared(after) > 1e-8 || beforeQuat.angleTo(afterQuat) > 1e-4) {
      this.pushCmd({
        undo: () => { obj.position.copy(before); obj.quaternion.copy(beforeQuat); },
        redo: () => { obj.position.copy(after); obj.quaternion.copy(afterQuat); },
      });
    }
  }

  private beginPivotDrag(e: PointerEvent): void {
    if (this.pivotProxy) this.unwrapPivot(); // soltar el objeto antes de mover el eje
    this.capturePointer(e);
    this.mode = 'pivot-drag';
    this.controls.enabled = false;
  }

  private movePivotDrag(): void {
    if (!this.pivotWorldPos) return;
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const camDir = new THREE.Vector3();
    (this.camera as THREE.Camera).getWorldDirection(camDir);
    this.fallbackPlane.setFromNormalAndCoplanarPoint(camDir.clone().negate(), this.pivotWorldPos);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.fallbackPlane, p)) return;
    this.pivotWorldPos.copy(p);
    this.pivotMarker?.position.copy(p);
  }

  private endPivotDrag(): void {
    if (this.pivotForObj) this.applyPivotAttachment(this.pivotForObj);
  }

  private highlight(rec: StrokeRecord, on: boolean): void {
    rec.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (m && m.emissive) {
        m.emissive.set(on ? 0x2b6fff : 0x000000);
        m.emissiveIntensity = on ? 0.9 : 1;
        m.needsUpdate = true;
      }
    });
  }

  selectedCount(): number {
    return this.selected.size;
  }

  deleteSelection(): void {
    this.detachRig();   // si cuelgan del rig, su parent no es strokesGroup
    const recs = [...this.selected];
    if (!recs.length) return;
    const wasGuide = new Map<string, { id: string; mesh: THREE.Mesh } | null>();
    const remove = () => {
      for (const r of recs) {
        if (this.pivotOwnerObj === r.object) this.unwrapPivot();
        r.object.parent?.remove(r.object);
        this.strokes = this.strokes.filter((s) => s !== r);
        if (r.kind === 'guide') { this.surfaces = this.surfaces.filter((s) => s.id !== r.id); if (this.activeGuide?.id === r.id) this.activeGuide = null; }
      }
    };
    const add = () => {
      for (const r of recs) {
        (r.kind === 'guide' ? this.guidesGroup : this.strokesGroup).add(r.object);
        if (!this.strokes.includes(r)) this.strokes.push(r);
        if (r.kind === 'guide') { this.surfaces.push({ id: r.id, type: 'loft', mesh: r.object as THREE.Mesh }); this.activeGuide = { id: r.id, mesh: r.object as THREE.Mesh }; }
      }
    };
    void wasGuide;
    remove();
    this.setSelection([]);
    this.pushCmd({ undo: add, redo: remove });
  }

  // ---------------------------------------------------------------- mover

  private beginMove(): void {
    this.mode = 'move';
    this.controls.enabled = false;
    const hit = this.resolveHit();
    this.lastMoveWorld.copy(hit ? hit.point : this.controls.target);
    this.moveStart.clear();
    for (const r of this.selected) this.moveStart.set(r.object, r.object.position.clone());
  }

  private moveDrag(_e: PointerEvent): void {
    const hit = this.resolveHit();
    if (!hit) return;
    const delta = hit.point.clone().sub(this.lastMoveWorld);
    for (const r of this.selected) r.object.position.add(delta);
    this.lastMoveWorld.copy(hit.point);
  }

  private endMove(): void {
    const moved = [...this.selected];
    const deltas = moved.map((r) => r.object.position.clone().sub(this.moveStart.get(r.object) ?? r.object.position));
    if (deltas.every((d) => d.lengthSq() < 1e-8)) return;
    this.pushCmd({
      undo: () => moved.forEach((r, i) => r.object.position.sub(deltas[i])),
      redo: () => moved.forEach((r, i) => r.object.position.add(deltas[i])),
    });
  }

  // ---------------------------------------------------------------- edición de nodos (herramienta 'select')
  //
  // Distinta de 'move': ahí se arrastra el TRAZO entero (su object.position).
  // Acá se edita un PUNTO DE CONTROL individual del vector — como la flecha
  // blanca de Illustrator frente a la negra. Solo aplica a trazos ('stroke'),
  // no a guías.

  private static readonly HANDLE_RADIUS = 0.028;

  private makeHandleMesh(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(WebGLDesign3D.HANDLE_RADIUS, 16, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2b6fff, depthTest: false });
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 999;
    return m;
  }

  /** Puntos de control en espacio MUNDO (el trazo puede estar desplazado por
   *  la herramienta 'move', que solo toca `object.position`). */
  private showPointHandles(rec: StrokeRecord): void {
    this.clearPointEdit();
    this.editingStroke = rec;
    rec.object.updateMatrixWorld(true);
    this.pointHandles = rec.points.map((p, i) => {
      const h = this.makeHandleMesh();
      h.position.copy(rec.object.localToWorld(p.clone()));
      h.userData.pointIndex = i;
      this.handlesGroup.add(h);
      return h;
    });
  }

  private clearPointEdit(): void {
    for (const h of this.pointHandles) {
      this.handlesGroup.remove(h);
      h.geometry.dispose();
      (h.material as THREE.Material).dispose();
    }
    this.pointHandles = [];
    this.editingStroke = null;
    this.dragPointIndex = -1;
  }

  private pickHandle(): number {
    this.raycaster.setFromCamera(this.pointer, this.camera as THREE.Camera);
    const hits = this.raycaster.intersectObjects(this.pointHandles, false);
    if (!hits.length) return -1;
    return (hits[0].object.userData.pointIndex as number) ?? -1;
  }

  private onSelectPointerDown(e: PointerEvent): void {
    const idx = this.editingStroke ? this.pickHandle() : -1;
    if (idx >= 0 && this.editingStroke) {
      this.capturePointer(e);
      this.mode = 'point-drag';
      this.controls.enabled = false;
      this.dragPointIndex = idx;
      this.dragPointStart.copy(this.editingStroke.points[idx]);
      return;
    }
    // click fuera de un handle: elegir otro trazo (o deseleccionar)
    const rec = this.pickStroke();
    // un VOLUMEN no se edita por nodos: sus "puntos" son la nube de trazos que
    // le dio origen, no un contorno. Mostrar cien handles y dejar arrastrarlos
    // solo produce un cuerpo roto — se transforma con el gizmo (Mover).
    if (rec?.solid) { this.clearPointEdit(); this.setSelection([rec]); return; }
    if (rec && rec.kind === 'stroke') this.showPointHandles(rec);
    else this.clearPointEdit();
  }

  private movePointDrag(): void {
    if (!this.editingStroke || this.dragPointIndex < 0) return;
    const hit = this.resolveHit();
    if (!hit) return;
    const local = this.editingStroke.object.worldToLocal(hit.point.clone());
    this.editingStroke.points[this.dragPointIndex].copy(local);
    this.rebuildStrokeMesh(this.editingStroke);
    const h = this.pointHandles[this.dragPointIndex];
    if (h) h.position.copy(this.editingStroke.object.localToWorld(local.clone()));
  }

  private endPointDrag(): void {
    if (!this.editingStroke || this.dragPointIndex < 0) return;
    const rec = this.editingStroke;
    const idx = this.dragPointIndex;
    const before = this.dragPointStart.clone();
    const after = rec.points[idx].clone();
    this.dragPointIndex = -1;
    if (before.distanceToSquared(after) < 1e-8) return;
    this.pushCmd({
      undo: () => { rec.points[idx].copy(before); this.rebuildStrokeMesh(rec); if (this.editingStroke === rec) this.pointHandles[idx]?.position.copy(rec.object.localToWorld(before.clone())); },
      redo: () => { rec.points[idx].copy(after); this.rebuildStrokeMesh(rec); if (this.editingStroke === rec) this.pointHandles[idx]?.position.copy(rec.object.localToWorld(after.clone())); },
    });
  }

  // ---------------------------------------------------------------- liquify

  /** Radio de influencia en unidades de mundo — reusa el slider de tamaño de
   *  pincel existente (más pincel = más área de arrastre), sin agregar un
   *  control nuevo a la UI. */
  private liquifyRadius(): number {
    return THREE.MathUtils.clamp(0.15 + (this.brush.size / 100) * 1.2, 0.15, 1.4);
  }

  private beginLiquify(e: PointerEvent): void {
    const rec = this.pickStroke();
    if (!rec || rec.kind !== 'stroke') return;
    this.capturePointer(e);
    this.mode = 'liquify-drag';
    this.controls.enabled = false;
    this.liquifyStroke = rec;
    this.liquifyBefore = rec.points.map((p) => p.clone());
    this.applyLiquifyAt();
  }

  private moveLiquify(): void {
    this.applyLiquifyAt();
  }

  /** Empuja cada punto de control DENTRO del radio hacia la posición actual
   *  del pincel, con caída lineal (más cerca del centro = más arrastre) —
   *  mismo criterio que `l3dLiquifyStroke` del prototipo anterior, ahora
   *  regenerando la malla real del trazo en vez de tocar triángulos sueltos. */
  private applyLiquifyAt(): void {
    const rec = this.liquifyStroke;
    if (!rec) return;
    const hit = this.resolveHit();
    if (!hit) return;
    const localBrush = rec.object.worldToLocal(hit.point.clone());
    const radius = this.liquifyRadius();
    let touched = false;
    for (const p of rec.points) {
      const dist = p.distanceTo(localBrush);
      if (dist < radius && dist > 1e-6) {
        const falloff = 1 - dist / radius;
        p.addScaledVector(localBrush.clone().sub(p), WebGLDesign3D.LIQUIFY_STRENGTH * falloff);
        touched = true;
      }
    }
    if (touched) this.rebuildStrokeMesh(rec);
  }

  private endLiquify(): void {
    const rec = this.liquifyStroke;
    const before = this.liquifyBefore;
    this.liquifyStroke = null;
    this.liquifyBefore = [];
    if (!rec) return;
    const after = rec.points.map((p) => p.clone());
    const changed = before.some((p, i) => p.distanceToSquared(after[i]) > 1e-10);
    if (!changed) return;
    this.pushCmd({
      undo: () => { before.forEach((p, i) => rec.points[i]?.copy(p)); this.rebuildStrokeMesh(rec); },
      redo: () => { after.forEach((p, i) => rec.points[i]?.copy(p)); this.rebuildStrokeMesh(rec); },
    });
  }

  // ---------------------------------------------------------------- lazo (selección / goma)

  private beginLasso(e: PointerEvent): void {
    this.mode = 'lasso';
    this.controls.enabled = false;
    this.capturePointer(e);
    this.lassoPts = [this.screenOf(e)];
    this.lassoEl.style.display = 'block';
    this.lassoPoly.setAttribute('points', '');
  }

  private moveLasso(e: PointerEvent): void {
    this.lassoPts.push(this.screenOf(e));
    this.lassoPoly.setAttribute('points', this.lassoPts.map((p) => p.join(',')).join(' '));
  }

  private endLasso(e: PointerEvent): void {
    this.lassoEl.style.display = 'none';
    const moved = Math.hypot(...this.screenOf(e).map((v, i) => v - [this.downScreen.x, this.downScreen.y][i]));
    if (moved < DRAG_THRESHOLD) {
      // click corto: seleccionar/borrar el trazo bajo el cursor
      const rec = this.pickStroke();
      if (this.tool === 'eraser') {
        if (rec) { this.setSelection([rec]); this.deleteSelection(); }
        else {
          // click en una guía: borra solo esa. Si no hay guía, prueba con una
          // superficie (pared/primitiva) — es la única forma de borrarlas.
          const g = this.pickGuide();
          if (g) this.deleteGuideById(g.id);
          else { const su = this.pickSurface(); if (su) this.deleteSurfaceById(su.id); }
        }
      } else {
        this.setSelection(rec ? [rec] : []);
      }
      return;
    }
    const inside = this.strokesInLasso();
    if (this.tool === 'eraser') {
      this.setSelection(inside);
      this.deleteSelection();
    } else {
      // Shift = el lazo SUMA a lo que ya estaba seleccionado.
      this.setSelection(e.shiftKey ? [...new Set([...this.selected, ...inside])] : inside);
    }
  }

  private strokesInLasso(): StrokeRecord[] {
    if (this.lassoPts.length < 3) return [];
    const rect = this.canvasBox();
    const cam = this.camera as THREE.Camera;
    const res: StrokeRecord[] = [];
    for (const rec of this.strokes) {
      if (this.isLayerLocked(rec.layerId)) continue; // el lazo no toca capas bloqueadas
      const pts = rec.points;
      let hitCount = 0;
      rec.object.updateMatrixWorld(true);
      for (const p of pts) {
        const v = rec.object.localToWorld(p.clone()).project(cam);
        const sx = ((v.x + 1) / 2) * rect.width;
        const sy = ((-v.y + 1) / 2) * rect.height;
        if (this.pointInPoly(sx, sy)) { hitCount++; if (hitCount >= Math.max(1, pts.length * 0.3)) break; }
      }
      if (hitCount >= Math.max(1, pts.length * 0.3)) res.push(rec);
    }
    return res;
  }

  private pointInPoly(x: number, y: number): boolean {
    const poly = this.lassoPts;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ---------------------------------------------------------------- historia

  private static readonly MAX_UNDO = 200;

  // ---------------------------------------------------------------- autoguardado

  /** Clave del último proyecto en el almacenamiento local. Es la red que hace
   *  que cerrar y reabrir el estudio no pierda el trabajo, sin depender de que
   *  el usuario se acuerde de Guardar. */
  private static readonly AUTOSAVE_KEY = 'low3d:autosave';
  private autosaveTimer?: number;

  /** Guarda el proyecto (con retraso, para no serializar en cada trazo). */
  private scheduleAutosave(): void {
    if (this.disposed) return;
    if (this.autosaveTimer) window.clearTimeout(this.autosaveTimer);
    this.autosaveTimer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(WebGLDesign3D.AUTOSAVE_KEY, JSON.stringify(this.exportProject()));
      } catch {
        // sin espacio o storage bloqueado: no romper el dibujo por esto
      }
    }, 900);
  }

  /** Restaura el último proyecto autoguardado. Devuelve true si había algo. */
  restoreAutosave(): boolean {
    try {
      const raw = window.localStorage.getItem(WebGLDesign3D.AUTOSAVE_KEY);
      if (!raw) return false;
      this.importProject(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  }

  /** Descarta el autoguardado (proyecto nuevo). */
  private clearAutosave(): void {
    try { window.localStorage.removeItem(WebGLDesign3D.AUTOSAVE_KEY); } catch { /* noop */ }
  }

  private pushCmd(cmd: Command): void {
    this.scheduleAutosave(); // toda acción que entra al historial se autoguarda
    this.undoStack.push(cmd);
    // tope de historia: en sesiones largas el stack crecía sin límite. Se
    // descarta el comando más viejo al pasar el tope.
    if (this.undoStack.length > WebGLDesign3D.MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    window.dispatchEvent(new Event('low3d:history'));
  }

  undo(): void {
    this.detachRig();   // ver detachRig: registra su propio comando si movió algo
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.setSelection([]);
    this.scheduleAutosave();
    window.dispatchEvent(new Event('low3d:history'));
  }

  redo(): void {
    this.detachRig();
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    this.setSelection([]);
    this.scheduleAutosave();
    window.dispatchEvent(new Event('low3d:history'));
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  // ---------------------------------------------------------------- utilidades

  private disposeNode(o: THREE.Object3D): void {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }

  clear(): void {
    this.detachRig();
    this.groupNames.clear();
    for (const rec of this.strokes) { rec.object.parent?.remove(rec.object); }
    this.strokes = [];
    for (const g of [...this.guides]) this.detachGuide(g);
    // borra TODAS las superficies, no solo la activa (si quedaba alguna suelta
    // se veía un plano fantasma en el proyecto nuevo).
    for (const s of [...this.surfaces]) this.deleteSurfaceById(s.id);
    this.removeActiveSurface();
    this.selected.clear();
    this.selectedSurface = null;
    this.selectedGuide = null;
    this.clearPointEdit();
    this.gizmo?.detach();
    this.undoStack = [];
    this.redoStack = [];
    // la lista de objetos vive en el store: sin esto la escena quedaba vacía
    // pero el panel seguía mostrando todo lo borrado
    this.publishObjects();
    window.dispatchEvent(new Event('low3d:history'));
  }

  /** "Nuevo proyecto": vacía la escena y deja el store coherente (si no, el
   *  botón de superficie quedaba tildado con un plano que ya no existe). */
  newProject(): void {
    this.clearAutosave(); // si no, al reabrir volvía el proyecto que descartaste
    this.clear();
    this.lastSurfaceKey = '';
    lowStore.setActiveSurface(null);
    this.setView('persp');
  }

  // ---------------------------------------------------------------- exportar STL

  /** Qué se puede exportar y qué no, mirado de antemano. Un STL solo contiene
   *  triángulos: sirve para los TRAZOS (que son tubos cerrados) y para los
   *  VOLÚMENES. Las guías son andamio y los rellenos son caras SIN espesor —
   *  un plano de espesor cero no se puede imprimir, y callarlo es peor que
   *  avisarlo. */
  stlReport(soloSeleccion = false): {
    solidos: number; trazos: number; rellenos: number; guias: number; caras: number;
    triangulos: number; exportables: number; aristasAbiertas: number; cerrada: boolean;
  } {
    const recs = soloSeleccion && this.selected.size ? [...this.selected] : this.strokes;
    let solidos = 0, trazos = 0, rellenos = 0, caras = 0, triangulos = 0;
    for (const rec of recs) {
      if (rec.kind === 'guide') continue;
      if (rec.fill) { rellenos++; continue; }
      // la figura sí se exporta (su contorno es un tubo), pero su cara no: es
      // una superficie sin espesor y hay que decirlo
      if (rec.filled) caras++;
      if (rec.solid) solidos++; else trazos++;
      rec.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        // la cara de una figura rellena no se escribe en el STL: contarla acá
        // hacía que el informe anunciara 2 triángulos más de los que salían en
        // el archivo (medido: informe 582, archivo 580)
        if (m.userData.esRelleno) return;
        const g = m.geometry;
        const idx = g.getIndex();
        const pos = g.getAttribute('position');
        if (idx) triangulos += idx.count / 3;
        else if (pos) triangulos += pos.count / 3;
      });
    }
    const abiertas = this.stlOpenEdges(recs);
    return {
      solidos, trazos, rellenos, guias: this.guides.length,
      caras,
      triangulos: Math.round(triangulos), exportables: solidos + trazos,
      aristasAbiertas: abiertas, cerrada: abiertas === 0,
    };
  }

  /** Cuántas aristas quedan SIN cerrar. Para imprimir es el dato que importa:
   *  una malla abierta puede fallar o salir rara en el slicer.
   *
   *  Los VOLÚMENES (Ctrl+E) cierran solos. Los TRAZOS no: el tubo y sus tapas
   *  esféricas se fusionan en una sola malla pero sin soldar vértices — se ven
   *  macizos y andan perfecto para mirar, pero como sólido quedan abiertos.
   *  Se mide de verdad en vez de suponerlo, y se avisa antes de exportar. */
  private stlOpenEdges(recs: StrokeRecord[]): number {
    // Se mide OBJETO POR OBJETO. Contarlos todos en una sola bolsa daba
    // resultados falsos: dos sólidos idénticos y superpuestos hacían que cada
    // arista apareciera 4 veces (≠ 2) y el informe decía "abierta" una malla
    // que cerraba perfecto. Cada sólido tiene que cerrar por sí mismo.
    const k = (pos: THREE.BufferAttribute, i: number, m: THREE.Matrix4) => {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(m);
      return `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
    };
    let abiertas = 0;
    for (const rec of recs) {
      if (rec.kind === 'guide' || rec.fill) continue;
      rec.object.updateMatrixWorld(true);
      const aristas = new Map<string, number>();
      rec.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        if (m.userData.esRelleno) return;   // cara sin espesor: no es cuerpo
        const g = m.geometry.getIndex() ? m.geometry.toNonIndexed() : m.geometry;
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        if (!pos) return;
        for (let i = 0; i + 2 < pos.count; i += 3) {
          const v = [k(pos, i, m.matrixWorld), k(pos, i + 1, m.matrixWorld), k(pos, i + 2, m.matrixWorld)];
          for (let j = 0; j < 3; j++) {
            const a = v[j], b = v[(j + 1) % 3];
            const c = a < b ? `${a}|${b}` : `${b}|${a}`;
            aristas.set(c, (aristas.get(c) || 0) + 1);
          }
        }
        if (g !== m.geometry) g.dispose();
      });
      for (const n of aristas.values()) if (n !== 2) abiertas++;
    }
    return abiertas;
  }

  /** Genera el STL. Devuelve el texto (ASCII) o el DataView (binario), listo
   *  para escribir a un archivo.
   *
   *  @param opts.binary   binario (mucho más chico) o ASCII legible
   *  @param opts.scale    factor de escala; los slicers leen el STL en
   *                       milímetros, y la escena está en unidades propias
   *  @param opts.onlySelection  exportar solo lo seleccionado
   */
  exportSTL(opts: { binary?: boolean; scale?: number; onlySelection?: boolean } = {}):
      { data: string | DataView; report: ReturnType<WebGLDesign3D['stlReport']> } | null {
    const escala = opts.scale && opts.scale > 0 ? opts.scale : 1;
    const recs = (opts.onlySelection && this.selected.size ? [...this.selected] : this.strokes)
      .filter((r) => r.kind !== 'guide' && !r.fill);
    if (!recs.length) return null;

    // Se arma un grupo con COPIAS de las mallas, ya en coordenadas de mundo:
    // así el exportador no arrastra la escala del grupo padre ni exporta la
    // grilla, los ejes, las guías o los fantasmas del papel cebolla.
    const lote = new THREE.Group();
    const geos: THREE.BufferGeometry[] = [];
    for (const rec of recs) {
      rec.object.updateMatrixWorld(true);
      rec.object.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        if (m.userData.esRelleno) return;   // cara sin espesor: no se imprime
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        if (escala !== 1) g.scale(escala, escala, escala);
        // sin índice y con normales, que es lo que espera un STL
        let plana = g.getIndex() ? g.toNonIndexed() : g;
        if (plana !== g) g.dispose();
        // soldar los vértices que coinciden: la teselación repite muchos, y un
        // STL con vértices sueltos pesa más y deja aristas abiertas de gusto
        try {
          const soldada = BufferGeometryUtils.mergeVertices(plana, 1e-4);
          if (soldada && soldada !== plana) { plana.dispose(); plana = soldada.toNonIndexed(); soldada.dispose(); }
        } catch (_) { /* si no se puede soldar, se exporta igual */ }
        plana.computeVertexNormals();
        geos.push(plana);
        lote.add(new THREE.Mesh(plana, new THREE.MeshBasicMaterial()));
      });
    }
    if (!lote.children.length) return null;

    const exp = new STLExporter();
    const data = opts.binary
      ? (exp.parse(lote, { binary: true }) as unknown as DataView)
      : exp.parse(lote);
    geos.forEach((g) => g.dispose());
    return { data, report: this.stlReport(!!opts.onlySelection) };
  }

  /** Serializa puntos de control en lugar de la malla derivada, para conservar
   *  la capacidad de editar los trazos al volver a abrir el proyecto. */
  exportProject(): Low3DProject {
    // Con varias piezas elegidas, sus objetos cuelgan del RIG temporal y su
    // `position` es relativa a ese rig, no al mundo: guardar así hacía que el
    // dibujo reapareciera corrido al abrirlo. Se desarma antes de serializar.
    this.detachRig();
    const state = lowStore.getState();
    return {
      format: 'low3d', version: 1, savedAt: new Date().toISOString(),
      camera: { view: this.view, position: this.camera.position.toArray(),
        target: this.controls.target.toArray(), orthoSize: this.orthoSize },
      settings: { brush: { ...this.brush }, mirror: { ...this.mirror }, theme: this.theme,
        activeSurface: state.activeSurface ? { type: state.activeSurface.type, params: { ...state.activeSurface.params } } : null },
      layers: state.layers.map((l) => ({ ...l })), activeLayerId: state.activeLayerId,
      strokes: this.strokes.map((rec) => ({
        id: rec.id, layerId: rec.layerId,
        points: rec.points.map((p) => p.toArray()), pressures: [...rec.pressures],
        baseOpacity: rec.baseOpacity, position: rec.object.position.toArray(),
        quaternion: rec.object.quaternion.toArray(), scale: rec.object.scale.toArray(),
        brush: { ...rec.brush }, fill: rec.fill || undefined, filled: rec.filled || undefined,
        groupId: rec.groupId || undefined, solid: rec.solid || undefined,
        shape: rec.shape || undefined,
      })),
      // las guías también son parte del proyecto: sin ellas, al reabrir se
      // perdía el andamiaje sobre el que estabas dibujando.
      guides: this.guides.map((g) => {
        const src = g.mesh.userData.guideSource as { points: number[][]; normal: number[] } | undefined;
        return src ? {
          points: src.points, normal: src.normal,
          position: g.mesh.position.toArray(), quaternion: g.mesh.quaternion.toArray(),
          scale: g.mesh.scale.toArray(),
        } : null;
      }).filter(Boolean) as Low3DProject['guides'],
      groupNames: Object.fromEntries(this.groupNames),
    };
  }

  importProject(data: unknown): void {
    const doc = data as Partial<Low3DProject>;
    if (!doc || doc.format !== 'low3d' || doc.version !== 1 || !Array.isArray(doc.strokes))
      throw new Error('El archivo no es un proyecto LOW 3D compatible');
    this.clear();
    lowStore.restoreLayers(doc.layers || [], doc.activeLayerId);
    if (doc.settings?.brush) lowStore.setBrushSettings({ ...doc.settings.brush });
    if (doc.settings?.mirror) lowStore.setMirrorMode({ ...doc.settings.mirror });
    lowStore.setActiveSurface(doc.settings?.activeSurface || null);
    this.groupNames.clear();
    for (const [k, v] of Object.entries(doc.groupNames || {})) {
      if (typeof v === 'string') this.groupNames.set(k, v);
    }
    for (const item of doc.strokes) {
      if (!Array.isArray(item.points) || item.points.length < 2) continue;
      const points = item.points.map((p) => new THREE.Vector3(Number(p[0]), Number(p[1]), Number(p[2])));
      const pressures = points.map((_, i) => Number(item.pressures?.[i] ?? 1));
      // proyectos viejos (sin `brush` por trazo) caen al pincel por defecto,
      // conservando la opacidad guardada — así siguen abriendo sin romper.
      const brush: BrushSettings = item.brush
        ? { ...item.brush }
        : { ...this.brush, opacity: Number(item.baseOpacity ?? 1) };
      const group = new THREE.Group();
      if (item.solid) {
        // volumen: se regenera con la misma lógica que al crearlo (los puntos
        // guardados son la nube de origen), no como tubo ni como cara plana.
        const body = this.buildSolidMesh(points, brush);
        if (body) group.add(body);
      } else if (item.fill) {
        // relleno: se reconstruye como cara sólida, no como tubo (si no, una
        // forma pintada volvía como un contorno grueso y deformado).
        // Los puntos guardados son LOCALES al objeto, igual que los de un trazo:
        // restarles la posición del grupo (como se hacía antes) corría el relleno
        // justo esa distancia en cuanto la forma se había movido o agrupado, y
        // quedaba separado de su propio contorno.
        const face = this.buildFillMesh(points, brush);
        if (face) group.add(face);
      } else {
        const tube = this.buildTube(points, pressures, brush, !!item.shape);
        if (tube) group.add(tube);
      }
      group.position.fromArray(item.position || [0, 0, 0]);
      group.quaternion.fromArray(item.quaternion || [0, 0, 0, 1]);
      group.scale.fromArray(item.scale || [1, 1, 1]);
      const rec: StrokeRecord = {
        id: item.id || `stroke-${this.seq++}`, object: group, points, pressures,
        kind: 'stroke', layerId: item.layerId || this.activeLayerId(),
        baseOpacity: Number(item.baseOpacity ?? brush.opacity), brush,
      };
      group.userData.strokeId = rec.id;
      rec.fill = item.fill || undefined;
      rec.filled = item.filled || undefined;
      rec.solid = item.solid || undefined;
      rec.shape = item.shape || undefined;
      rec.groupId = item.groupId || undefined;
      this.addStrokeRecord(rec);
    }
    // guías: se reconstruyen desde su trazo de origen + eje de extrusión
    for (const g of doc.guides || []) {
      if (!Array.isArray(g?.points) || g.points.length < 2) continue;
      const pts = g.points.map((p) => new THREE.Vector3(Number(p[0]), Number(p[1]), Number(p[2])));
      const normal = new THREE.Vector3().fromArray(g.normal || [0, 0, 1]);
      const mesh = this.buildGuideSurface(pts, normal);
      if (!mesh) continue;
      mesh.position.fromArray(g.position || [0, 0, 0]);
      mesh.quaternion.fromArray(g.quaternion || [0, 0, 0, 1]);
      mesh.scale.fromArray(g.scale || [1, 1, 1]);
      this.setGuide(mesh);
    }
    const cam = doc.camera;
    if (cam) {
      this.orthoSize = Number(cam.orthoSize || ORTHO_SIZE);
      this.setView(cam.view || 'persp');
      this.camera.position.fromArray(cam.position || [0, 1.2, 6]);
      this.controls.target.fromArray(cam.target || [0, 0.6, 0]);
      this.camera.lookAt(this.controls.target);
      this.controls.update();
    }
    this.applyLayerStyles();
    this.undoStack = [];
    this.redoStack = [];
  }

  // ---------------------------------------------------------------- loop / resize

  private resize(): void {
    const c = this.renderer.domElement;
    const pr = Math.min(window.devicePixelRatio, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (w === 0 || h === 0) return;
    const needW = Math.floor(w * pr), needH = Math.floor(h * pr);
    if (c.width === needW && c.height === needH) return;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.view === 'persp') {
      this.perspCamera.aspect = w / h;
      this.perspCamera.updateProjectionMatrix();
    } else {
      this.applyOrthoFrustum();
    }
  }

  // firma de la última cámara con la que se recalculó el onion-skin ortogonal,
  // para no rehacer ese barrido O(trazos × materiales) en cada frame si la
  // cámara no se movió (los cambios de capa/trazo llaman applyLayerStyles
  // aparte, así que no se pierden).
  private lastOnionSig = '';

  private animate = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.animate);
    // Al volver al módulo 2D el iframe queda oculto: no renderizar una escena
    // invisible. La órbita y el dibujo se retoman al recuperar el viewport.
    if(document.hidden || !this.canvas.clientWidth || !this.canvas.clientHeight)return;
    this.resize();
    this.controls.update();
    this.joyRefresh();
    this.renderer.render(this.scene, this.camera as THREE.Camera);
    // el cubo copia la orientación de la cámara y se dibuja aparte: su canvas
    // no entra en el picking del dibujo ni en el export
    this.refrescarNavCubo();
    if (this.showAxes) this.updateVPOverlay();
    // onion-skin por profundidad (depende de la cámara): solo si la vista es
    // ortogonal Y la cámara/target/cantidad de trazos cambió desde el frame
    // anterior.
    if (this.view !== 'persp') {
      const cam = this.camera as THREE.Camera;
      const t = this.controls.target;
      const f = (n: number) => n.toFixed(3);
      const sig = `${f(cam.position.x)},${f(cam.position.y)},${f(cam.position.z)}|${f(t.x)},${f(t.y)},${f(t.z)}|${this.strokes.length}`;
      if (sig !== this.lastOnionSig) {
        this.lastOnionSig = sig;
        this.applyLayerStyles();
      }
    }
  };

  // ---------------------------------------------------------------- debug
  debugDemo(): void {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.2, 0.6 + Math.sin(a) * 1.2, 0));
    }
    const pressures = pts.map(() => 1);
    const g = new THREE.Group();
    const t = this.buildTube(pts, pressures);
    if (t) g.add(t);
    const rec: StrokeRecord = {
      id: `stroke-${this.seq++}`, object: g, points: pts, pressures, kind: 'stroke',
      layerId: this.activeLayerId(), baseOpacity: 1, brush: { ...this.brush },
    };
    g.userData.strokeId = rec.id;
    this.addStrokeRecord(rec);
  }
}

export default WebGLDesign3D;
