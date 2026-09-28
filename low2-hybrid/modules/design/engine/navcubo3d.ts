/**
 * NAVEGADOR DE CÁMARA — el círculo con el cubo, arriba de la mesa
 *
 * Orbitar con el dedo sobre el dibujo pelea con dibujar: cada arrastre es una
 * decisión de "¿esto era un trazo o era mover la vista?". El navegador saca esa
 * pelea del lienzo y la manda a un rincón: un cubo chico que SIEMPRE muestra
 * desde dónde estás mirando, y que se puede agarrar para girar la vista o tocar
 * en una cara para saltar a ella.
 *
 * Vive en su propio canvas, no en la escena principal. Así no aparece en el
 * picking del dibujo, no lo tapa el joystick de transformación y no entra en el
 * export: es interfaz, no parte de la obra.
 *
 * @module design/engine/navcubo3d
 */
import * as THREE from 'three';

/** Cada cara del cubo lleva la vista a la que salta al tocarla. */
export type NavVista = 'front' | 'back' | 'top' | 'bottom' | 'left' | 'right';

/** El orden de materiales de un BoxGeometry: +X, -X, +Y, -Y, +Z, -Z. */
const CARAS: NavVista[] = ['right', 'left', 'top', 'bottom', 'front', 'back'];

const ROTULOS: Record<NavVista, string> = {
  front: 'FRENTE', back: 'ATRÁS', top: 'ARRIBA',
  bottom: 'ABAJO', left: 'IZQ', right: 'DER',
};

export interface NavCuboOpciones {
  /** Arrastrar el cubo: cuánto girar la vista, en radianes. */
  onOrbitar: (dx: number, dy: number) => void;
  /** Tocar una cara: saltar a esa vista. */
  onVista: (v: NavVista) => void;
  /** Tocar el centro sin arrastrar: volver a perspectiva. */
  onPerspectiva: () => void;
}

/** Rótulo de una cara, dibujado en un canvas y usado como textura. */
function texturaCara(texto: string, resaltada: boolean): THREE.CanvasTexture {
  const lado = 128;
  const c = document.createElement('canvas');
  c.width = lado; c.height = lado;
  const g = c.getContext('2d')!;
  g.fillStyle = resaltada ? '#f5ded1' : '#f4f3ee';
  g.fillRect(0, 0, lado, lado);
  g.strokeStyle = resaltada ? '#d74a24' : '#c4c7bf';
  g.lineWidth = 6;
  g.strokeRect(3, 3, lado - 6, lado - 6);
  g.fillStyle = resaltada ? '#a4391b' : '#53594f';
  g.font = '600 21px system-ui, -apple-system, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(texto, lado / 2, lado / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class NavCubo3D {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private escena = new THREE.Scene();
  private camara: THREE.PerspectiveCamera;
  readonly cubo: THREE.Mesh;
  private materiales: THREE.MeshBasicMaterial[] = [];
  private raycaster = new THREE.Raycaster();
  private opciones: NavCuboOpciones;

  private caraResaltada: NavVista | null = null;
  private arrastrando = false;
  private hubo = false;              // ¿se movió, o fue un toque limpio?
  private ultimo = { x: 0, y: 0 };
  private pointerId: number | null = null;
  private disposed = false;

  /** Lado del widget en píxeles de CSS. */
  static readonly LADO = 96;

  constructor(opciones: NavCuboOpciones) {
    this.opciones = opciones;
    const lado = NavCubo3D.LADO;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nav-cubo';
    this.canvas.width = lado * (window.devicePixelRatio || 1);
    this.canvas.height = lado * (window.devicePixelRatio || 1);
    Object.assign(this.canvas.style, {
      width: `${lado}px`, height: `${lado}px`,
      borderRadius: '50%', cursor: 'grab', touchAction: 'none',
      // el círculo claro translúcido: se apoya sobre el dibujo sin taparlo
      background: 'rgba(226, 238, 255, 0.55)',
      backdropFilter: 'blur(6px)',
      boxShadow: '0 2px 14px rgba(15, 40, 90, .18)',
    } as CSSStyleDeclaration);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(lado, lado, false);

    // Ortográfica sería más "plana"; con perspectiva corta el cubo se lee mejor
    // de qué lado está girado, que es justamente para lo que sirve.
    this.camara = new THREE.PerspectiveCamera(38, 1, 0.1, 50);
    this.camara.position.set(0, 0, 4.6);

    this.materiales = CARAS.map((v) => new THREE.MeshBasicMaterial({
      map: texturaCara(ROTULOS[v], false), transparent: true,
    }));
    this.cubo = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), this.materiales);
    this.escena.add(this.cubo);

    // aristas: sin ellas el cubo se lee como manchas sueltas cuando dos caras
    // quedan casi de perfil
    const aristas = new THREE.LineSegments(
      new THREE.EdgesGeometry(this.cubo.geometry),
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.9 }),
    );
    this.cubo.add(aristas);

    this.canvas.addEventListener('pointerdown', this.onDown);
    this.canvas.addEventListener('pointermove', this.onMove);
    this.canvas.addEventListener('pointerleave', this.onLeave);
    // que el arrastre no se lleve el lienzo de abajo
    this.canvas.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
  }

  /** El cubo copia la orientación de la cámara principal: gira con ella. */
  sync(camara: THREE.Camera, target: THREE.Vector3): void {
    const dir = new THREE.Vector3().subVectors(camara.position, target).normalize();
    // el cubo mira a la cámara: se le aplica la rotación inversa
    const m = new THREE.Matrix4().lookAt(dir, new THREE.Vector3(), camara.up);
    this.cubo.quaternion.setFromRotationMatrix(m).invert();
  }

  render(): void {
    if (this.disposed) return;
    this.renderer.render(this.escena, this.camara);
  }

  /** La cara que cae bajo el puntero, o null si el toque fue al aire. */
  private caraEn(e: PointerEvent): NavVista | null {
    const caja = this.canvas.getBoundingClientRect();
    const p = new THREE.Vector2(
      ((e.clientX - caja.left) / caja.width) * 2 - 1,
      -((e.clientY - caja.top) / caja.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(p, this.camara);
    const hit = this.raycaster.intersectObject(this.cubo, false)[0];
    if (!hit || hit.face == null) return null;
    // materialIndex dice qué cara del box se tocó
    const idx = typeof hit.face.materialIndex === 'number' ? hit.face.materialIndex : -1;
    return CARAS[idx] ?? null;
  }

  private resaltar(v: NavVista | null): void {
    if (v === this.caraResaltada) return;
    this.caraResaltada = v;
    CARAS.forEach((cara, i) => {
      const mat = this.materiales[i];
      mat.map?.dispose();
      mat.map = texturaCara(ROTULOS[cara], cara === v);
      mat.needsUpdate = true;
    });
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.arrastrando = true;
    this.hubo = false;
    this.pointerId = e.pointerId;
    this.ultimo = { x: e.clientX, y: e.clientY };
    this.canvas.style.cursor = 'grabbing';
    try { this.canvas.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    document.addEventListener('pointermove', this.onDragMove);
    document.addEventListener('pointerup', this.onUp);
    document.addEventListener('pointercancel', this.onUp);
  };

  private onDragMove = (e: PointerEvent): void => {
    if (!this.arrastrando || e.pointerId !== this.pointerId) return;
    const dx = e.clientX - this.ultimo.x;
    const dy = e.clientY - this.ultimo.y;
    // un umbral chico: sin esto, el temblor del dedo convierte cada toque en
    // arrastre y nunca se llega a saltar de vista
    if (!this.hubo && Math.hypot(dx, dy) < 3) return;
    this.hubo = true;
    this.ultimo = { x: e.clientX, y: e.clientY };
    this.opciones.onOrbitar(dx * 0.011, dy * 0.011);
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId != null && e.pointerId !== this.pointerId) return;
    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);
    try { this.canvas.releasePointerCapture(this.pointerId!); } catch { /* ya libre */ }
    this.canvas.style.cursor = 'grab';
    this.arrastrando = false;
    this.pointerId = null;
    if (this.hubo) return;                      // fue un giro, no un toque
    const cara = this.caraEn(e);
    if (cara) this.opciones.onVista(cara);
    else this.opciones.onPerspectiva();         // al aire, dentro del círculo
  };

  private onMove = (e: PointerEvent): void => {
    if (this.arrastrando) return;
    this.resaltar(this.caraEn(e));
  };

  private onLeave = (): void => { if (!this.arrastrando) this.resaltar(null); };

  dispose(): void {
    this.disposed = true;
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    document.removeEventListener('pointermove', this.onDragMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);
    this.materiales.forEach((m) => { m.map?.dispose(); m.dispose(); });
    this.cubo.geometry.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
