/* ══════════════════════════════════════════════════════════════════════════
   JOYSTICK — un solo control para mover, rotar y escalar

   Como el de Feather: en vez de cambiar de herramienta para cada operación, el
   objeto elegido queda rodeado por UN control con todas las funciones a la vez.
   Se agarra la parte que corresponde a lo que se quiere hacer.

   Tiene dos caras, y se alterna entre ellas:

   · JOYSTICK 3D — trabaja sobre los ejes GLOBALES del mundo, sin importar
     desde dónde estés mirando:
       - los tres CONOS (rojo X, verde Y, azul Z) mueven en su eje;
       - los tres ANILLOS (mismos colores) rotan alrededor de su eje;
       - la ESFERA del centro rota libre, como un trackball.
     En una vista ortogonal perfecta (frente, lado, arriba) el eje que apunta a
     la cámara no se puede usar — el gesto sería contra la pantalla —, así que
     ese cono se esconde en vez de quedar ahí engañando.

   · JOYSTICK 2D — trabaja sobre la VISTA, que es lo natural cuando estás
     dibujando de frente a algo:
       - el CÍRCULO del centro mueve en el plano de la pantalla;
       - los dos TIRADORES de escala (ancho y alto) y el de escala LIBRE;
       - el TIRADOR de rotación gira en el eje de la cámara.
     Con el CANDADO puesto, todo se vuelve preciso: mover queda limitado a las
     cuatro direcciones cardinales, la escala pasa a ser uniforme y la rotación
     salta de 15 en 15 grados.

   Esta clase NO toca el historial ni sabe de trazos: recibe un objeto, lo
   transforma y avisa cuándo empieza y termina el gesto. Quién es ese objeto
   (un trazo, un rig con varios, una guía) y cómo se deshace es problema del
   motor, que ya tiene esa maquinaria.

   @module design/engine/joystick3d
   ══════════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

export type JoyPart =
  | 'move-x' | 'move-y' | 'move-z'
  | 'rot-x' | 'rot-y' | 'rot-z'
  | 'trackball'
  | 'move-screen' | 'rot-screen'
  | 'scale-free' | 'scale-w' | 'scale-h';

export type JoyMode = '2d' | '3d';

const COL = {
  x: 0xf05a5f,
  y: 0x45b97c,
  z: 0x5596f6,
  ball: 0xe6e7e9,
  screen: 0xf2be52,
  activo: 0xffffff,
};

/** Radios del widget, en unidades del propio widget (después se escala para que
 *  se vea siempre del mismo tamaño en pantalla). */
const R = {
  ball: 0.265,
  vastago: 0.9,      // largo del eje hasta la base del cono
  cono: 0.22,        // alto del cono
  conoAncho: 0.085,
  anillo: 0.7,       // radio de los anillos de rotación
  tubo: 0.022,       // anillo visual fino; el blanco invisible sigue siendo amplio
  tirador: 0.13,     // radio de los tiradores del joystick 2D
  brazo: 0.95,       // a qué distancia del centro van los tiradores 2D
};

export class Joystick3D {
  readonly root = new THREE.Group();
  mode: JoyMode = '3d';
  locked = false;

  /** Cuánto rotó/movió/escaló el gesto en curso — el motor lo muestra como
   *  lectura numérica, que es la diferencia entre "moví un poco" y "moví 3
   *  unidades". */
  lectura = '';

  private grupo3d = new THREE.Group();
  private grupo2d = new THREE.Group();
  private partes = new Map<THREE.Object3D, JoyPart>();
  private material = new Map<JoyPart, THREE.MeshBasicMaterial>();
  private colorBase = new Map<JoyPart, number>();
  private resaltada: JoyPart | null = null;
  /** Piezas que se ven pero no se agarran (los vastagos de los ejes). Se
   *  esconden junto con la parte a la que pertenecen. */
  private decorativos: { obj: THREE.Object3D; part: JoyPart }[] = [];

  /** Quien sabe deformar la geometria en los ejes de la pantalla. Lo provee el
   *  motor para los trazos: escalar la TRANSFORMACION de un objeto que ya esta
   *  rotado mete cizalla (una escala no uniforme combinada con una rotacion no
   *  se puede escribir como posicion+rotacion+escala), y three la reparte entre
   *  los tres ejes al descomponer la matriz. Medido: estirar solo el ancho
   *  cambiaba X, Y y Z a la vez. Deformando los PUNTOS eso no pasa. */
  private escalarPuntos: ((fu: number, fv: number, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3) => void) | null = null;

  /** Estado del gesto en curso. */
  private drag: {
    part: JoyPart;
    obj: THREE.Object3D;
    /** centro del control en MUNDO al empezar (no se mueve durante el gesto) */
    centro: THREE.Vector3;
    pos0: THREE.Vector3;
    quat0: THREE.Quaternion;
    scale0: THREE.Vector3;
    /** para mover en eje: punto de referencia proyectado sobre el eje */
    ref0: THREE.Vector3;
    /** para rotar: ángulo inicial en el plano del anillo */
    ang0: number;
    /** para trackball y gestos de pantalla: puntero en NDC al empezar */
    ndc0: THREE.Vector2;
    /** base del plano de la pantalla al empezar (derecha y arriba de cámara) */
    camRight: THREE.Vector3;
    camUp: THREE.Vector3;
  } | null = null;

  constructor() {
    this.root.visible = false;
    this.root.renderOrder = 9999;
    this.root.add(this.grupo3d, this.grupo2d);
    this.armar3d();
    this.armar2d();
    this.setMode('3d');
  }

  // ─────────────────────────────────────────────────────────── construcción

  /** Material que se dibuja SIEMPRE encima: el control tiene que poder
   *  agarrarse aunque el objeto lo tape, si no en cuanto el dibujo crece el
   *  joystick queda enterrado y no hay forma de usarlo. */
  private mat(part: JoyPart, color: number, opacity = 1): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.material.set(part, m);
    this.colorBase.set(part, color);
    return m;
  }

  private registrar(o: THREE.Object3D, part: JoyPart): void {
    this.partes.set(o, part);
  }

  private armar3d(): void {
    const ejes: { part: JoyPart; rot: JoyPart; dir: THREE.Vector3; color: number }[] = [
      { part: 'move-x', rot: 'rot-x', dir: new THREE.Vector3(1, 0, 0), color: COL.x },
      { part: 'move-y', rot: 'rot-y', dir: new THREE.Vector3(0, 1, 0), color: COL.y },
      { part: 'move-z', rot: 'rot-z', dir: new THREE.Vector3(0, 0, 1), color: COL.z },
    ];
    for (const e of ejes) {
      const mMover = this.mat(e.part, e.color);
      // vástago + cono: el cono es el blanco real, el vástago dice a qué eje
      // pertenece (un cono suelto en el aire no se lee)
      const vastago = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, R.vastago, 8), mMover);
      const cono = new THREE.Mesh(
        new THREE.ConeGeometry(R.conoAncho, R.cono, 16), mMover);
      // un cono de 0.22 es un blanco chico para el dedo o el mouse: se le pone
      // encima una esfera INVISIBLE más grande solo para el picking
      const agarre = new THREE.Mesh(
        new THREE.SphereGeometry(R.conoAncho * 2.1, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      const orientar = (o: THREE.Object3D, dist: number) => {
        o.position.copy(e.dir).multiplyScalar(dist);
        // el cilindro y el cono de three nacen mirando +Y
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.dir);
      };
      orientar(vastago, R.vastago / 2);
      orientar(cono, R.vastago + R.cono / 2);
      orientar(agarre, R.vastago + R.cono / 2);
      // El VASTAGO no es blanco de picking, solo dibujo: va del centro al cono y
      // cruza los anillos de rotacion, asi que si pickeara se robaria el click
      // del anillo (medido: apuntar al anillo Z agarraba el eje X).
      this.grupo3d.add(vastago);
      for (const o of [cono, agarre]) { this.registrar(o, e.part); this.grupo3d.add(o); }
      // el vastago igual tiene que apagarse con su cono
      this.decorativos.push({ obj: vastago, part: e.part });

      // anillo de rotación: el toro nace en el plano XY, hay que pararlo
      // perpendicular al eje
      const mRot = this.mat(e.rot, e.color, 0.9);
      const anillo = new THREE.Mesh(
        new THREE.TorusGeometry(R.anillo, R.tubo, 8, 64), mRot);
      const agarreAnillo = new THREE.Mesh(
        new THREE.TorusGeometry(R.anillo, R.tubo * 3.2, 6, 48),
        new THREE.MeshBasicMaterial({ visible: false }));
      for (const o of [anillo, agarreAnillo]) {
        o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), e.dir);
        this.registrar(o, e.rot);
        this.grupo3d.add(o);
      }
    }
    // esfera central: trackball
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(R.ball, 28, 18), this.mat('trackball', COL.ball, 0.28));
    this.registrar(ball, 'trackball');
    this.grupo3d.add(ball);
  }

  private armar2d(): void {
    // centro: mover en el plano de la pantalla
    const centro = new THREE.Mesh(
      new THREE.SphereGeometry(R.ball * 1.15, 28, 18), this.mat('move-screen', COL.screen, 0.38));
    this.registrar(centro, 'move-screen');
    this.grupo2d.add(centro);

    // tiradores: arriba = alto, izquierda = ancho, esquina = libre,
    // derecha = rotación. Es la disposición del joystick 2D de Feather.
    const tiradores: { part: JoyPart; x: number; y: number; color: number }[] = [
      { part: 'scale-h', x: 0, y: R.brazo, color: COL.screen },
      { part: 'scale-w', x: -R.brazo, y: 0, color: COL.screen },
      { part: 'scale-free', x: -R.brazo * 0.72, y: R.brazo * 0.72, color: COL.screen },
      { part: 'rot-screen', x: R.brazo, y: 0, color: COL.ball },
    ];
    for (const t of tiradores) {
      const m = this.mat(t.part, t.color, 0.95);
      const cuerpo = t.part === 'rot-screen'
        ? new THREE.Mesh(new THREE.TorusGeometry(R.tirador, R.tubo * 1.4, 8, 24), m)
        : new THREE.Mesh(new THREE.BoxGeometry(R.tirador * 1.5, R.tirador * 1.5, R.tirador * 0.35), m);
      const agarre = new THREE.Mesh(
        new THREE.SphereGeometry(R.tirador * 2, 10, 8),
        new THREE.MeshBasicMaterial({ visible: false }));
      const brazo = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, Math.hypot(t.x, t.y), 6), m);
      brazo.position.set(t.x / 2, t.y / 2, 0);
      brazo.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0), new THREE.Vector3(t.x, t.y, 0).normalize());
      for (const o of [cuerpo, agarre]) o.position.set(t.x, t.y, 0);
      for (const o of [cuerpo, agarre]) { this.registrar(o, t.part); this.grupo2d.add(o); }
      this.grupo2d.add(brazo);
      this.decorativos.push({ obj: brazo, part: t.part });
    }
  }

  // ─────────────────────────────────────────────────────────── estado

  setMode(m: JoyMode): void {
    this.mode = m;
    this.grupo3d.visible = m === '3d';
    this.grupo2d.visible = m === '2d';
  }
  toggleMode(): JoyMode { this.setMode(this.mode === '3d' ? '2d' : '3d'); return this.mode; }
  setLocked(v: boolean): void { this.locked = v; }

  get visible(): boolean { return this.root.visible; }
  get arrastrando(): boolean { return !!this.drag; }
  get parteActiva(): JoyPart | null { return this.drag?.part ?? null; }
  static esEscala(part: JoyPart): boolean {
    return part === 'scale-w' || part === 'scale-h' || part === 'scale-free';
  }

  /** Se planta en el centro del objeto y se pone del mismo tamaño en pantalla
   *  siempre. Sin esto, de lejos el control queda inagarrable y de cerca tapa
   *  todo el dibujo. */
  update(camera: THREE.Camera, centro: THREE.Vector3 | null): void {
    if (!centro) { this.root.visible = false; return; }
    this.root.visible = true;
    this.root.position.copy(centro);
    let factor: number;
    if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const cam = camera as THREE.PerspectiveCamera;
      const d = cam.position.distanceTo(centro);
      factor = d * Math.tan((cam.fov * Math.PI) / 360) * 0.42;
    } else {
      const cam = camera as THREE.OrthographicCamera;
      factor = ((cam.top - cam.bottom) / cam.zoom) * 0.2;
    }
    this.root.scale.setScalar(Math.max(factor, 1e-4));

    if (this.mode === '2d') {
      // el joystick 2D vive en el plano de la pantalla: se encara a la cámara
      this.grupo2d.quaternion.copy(camera.quaternion);
      this.root.updateMatrixWorld(true);
      return;
    }
    // 3D: el eje que apunta a la cámara no sirve para mover (el gesto iría
    // contra la pantalla). En vistas ortogonales perfectas se esconde, como en
    // Feather, en vez de dejar un cono que no responde.
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const ejes: [JoyPart, JoyPart, THREE.Vector3][] = [
      ['move-x', 'rot-x', new THREE.Vector3(1, 0, 0)],
      ['move-y', 'rot-y', new THREE.Vector3(0, 1, 0)],
      ['move-z', 'rot-z', new THREE.Vector3(0, 0, 1)],
    ];
    for (const [mover, rotar, v] of ejes) {
      const alineado = Math.abs(dir.dot(v));
      // el cono cuyo eje apunta a la cámara no sirve: el gesto iría contra la
      // pantalla
      const conoInutil = alineado > 0.985;
      // el anillo perpendicular a la cámara se ve DE CANTO: es una raya que se
      // superpone a todo lo demás y roba el click (medido: apuntar al anillo Z
      // en vista frontal rotaba sobre X). Se esconde, que es la versión sana de
      // lo que hace Feather recortando los arcos según la vista.
      const anilloDeCanto = alineado < 0.2;
      for (const [obj, part] of this.partes) {
        if (part === mover) obj.visible = !conoInutil;
        else if (part === rotar) obj.visible = !anilloDeCanto;
      }
      for (const dec of this.decorativos) if (dec.part === mover) dec.obj.visible = !conoInutil;
    }
    // Las matrices se recalculan ACÁ y no en el render: el picking del joystick
    // usa raycast, y el raycast trabaja con la matriz MUNDIAL de cada pieza. Si
    // solo el loop la actualizara, un click hecho justo después de mover el
    // control (o de cambiar la selección) pegaría en la posición vieja — y con
    // el render pausado no pegaría en ninguna parte.
    this.root.updateMatrixWorld(true);
  }

  /** Qué parte del control está bajo el cursor.
   *
   *  Los blancos se resuelven por PRIORIDAD, no por cercanía a la cámara: los
   *  conos y el trackball son chicos y quedan dentro de los anillos, así que
   *  por distancia los anillos se los comen. */
  pick(raycaster: THREE.Raycaster): JoyPart | null {
    if (!this.root.visible) return null;
    const grupo = this.mode === '3d' ? this.grupo3d : this.grupo2d;
    const hits = raycaster.intersectObjects(grupo.children, false);
    const encontradas = new Set<JoyPart>();
    for (const h of hits) {
      if (!h.object.visible) continue;
      const p = this.partes.get(h.object);
      if (p) encontradas.add(p);
    }
    if (!encontradas.size) return null;
    const prioridad: JoyPart[] = [
      'move-x', 'move-y', 'move-z',                      // los conos, primero
      'scale-free', 'scale-w', 'scale-h', 'rot-screen',   // tiradores del 2D
      'rot-x', 'rot-y', 'rot-z',                          // después los anillos
      'trackball', 'move-screen',                         // el centro, al final
    ];
    for (const q of prioridad) if (encontradas.has(q)) return q;
    return null;
  }

  /** Resalta lo que está bajo el cursor: sin esto no hay forma de saber qué vas
   *  a agarrar antes de apretar. */
  hover(part: JoyPart | null): void {
    if (this.resaltada === part) return;
    this.resaltada = part;
    for (const [p, m] of this.material) {
      const base = this.colorBase.get(p) ?? 0xffffff;
      m.color.setHex(p === part ? COL.activo : base);
    }
  }

  // ─────────────────────────────────────────────────────────── gestos

  private ejeDe(part: JoyPart): THREE.Vector3 {
    if (part === 'move-x' || part === 'rot-x') return new THREE.Vector3(1, 0, 0);
    if (part === 'move-y' || part === 'rot-y') return new THREE.Vector3(0, 1, 0);
    return new THREE.Vector3(0, 0, 1);
  }

  /** Punto del rayo proyectado sobre el eje que pasa por el centro: es la
   *  forma sana de mover en un eje, porque no depende de cuánto se mueva el
   *  mouse en pantalla sino de dónde cae el rayo. */
  private puntoEnEje(raycaster: THREE.Raycaster, centro: THREE.Vector3,
                     eje: THREE.Vector3, camera: THREE.Camera): THREE.Vector3 | null {
    const dirCam = new THREE.Vector3();
    camera.getWorldDirection(dirCam);
    // plano que contiene al eje y mira lo más de frente posible a la cámara
    const normal = new THREE.Vector3().crossVectors(eje, new THREE.Vector3().crossVectors(dirCam, eje));
    if (normal.lengthSq() < 1e-9) return null;   // eje mirando a la cámara
    normal.normalize();
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, centro);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plano, p)) return null;
    const d = p.clone().sub(centro).dot(eje);
    return centro.clone().addScaledVector(eje, d);
  }

  private anguloEnAnillo(raycaster: THREE.Raycaster, centro: THREE.Vector3,
                         eje: THREE.Vector3): number | null {
    const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(eje, centro);
    const p = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plano, p)) return null;
    const d = p.sub(centro);
    // base estable del plano perpendicular al eje
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(eje.dot(u)) > 0.9) u.set(0, 1, 0);
    const uu = new THREE.Vector3().crossVectors(eje, u).normalize();
    const vv = new THREE.Vector3().crossVectors(eje, uu).normalize();
    return Math.atan2(d.dot(vv), d.dot(uu));
  }

  /** Arranca el gesto. `obj` ya tiene que estar centrado en el punto correcto
   *  (el motor lo envuelve en un proxy): rotar y escalar se hacen alrededor del
   *  ORIGEN del objeto, así que si su origen no está en su centro, gira torcido. */
  begin(part: JoyPart, raycaster: THREE.Raycaster, camera: THREE.Camera,
        obj: THREE.Object3D, ndc: THREE.Vector2,
        escalarPuntos?: (fu: number, fv: number, u: THREE.Vector3, v: THREE.Vector3, n: THREE.Vector3) => void): boolean {
    const centro = this.root.position.clone();
    const eje = this.ejeDe(part);
    let ref0 = centro.clone();
    let ang0 = 0;
    if (part.startsWith('move-') && part !== 'move-screen') {
      const p = this.puntoEnEje(raycaster, centro, eje, camera);
      if (!p) return false;
      ref0 = p;
    } else if (part.startsWith('rot-') && part !== 'rot-screen') {
      const a = this.anguloEnAnillo(raycaster, centro, eje);
      if (a === null) return false;
      ang0 = a;
    } else if (part === 'rot-screen') {
      const dirCam = new THREE.Vector3();
      camera.getWorldDirection(dirCam);
      const a = this.anguloEnAnillo(raycaster, centro, dirCam.negate());
      if (a === null) return false;
      ang0 = a;
    }
    const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    this.drag = {
      part, obj, centro, ref0, ang0,
      pos0: obj.position.clone(),
      quat0: obj.quaternion.clone(),
      scale0: obj.scale.clone(),
      ndc0: ndc.clone(),
      camRight, camUp,
    };
    this.escalarPuntos = escalarPuntos ?? null;
    this.lectura = '';
    return true;
  }

  /** Aplica el gesto. Devuelve true si transformó algo. */
  move(raycaster: THREE.Raycaster, camera: THREE.Camera, ndc: THREE.Vector2): boolean {
    const d = this.drag;
    if (!d) return false;
    const { part, obj } = d;

    // ── mover en un eje global ──
    if (part === 'move-x' || part === 'move-y' || part === 'move-z') {
      const eje = this.ejeDe(part);
      const p = this.puntoEnEje(raycaster, d.centro, eje, camera);
      if (!p) return false;
      let delta = p.clone().sub(d.ref0).dot(eje);
      if (this.locked) delta = Math.round(delta * 10) / 10;  // pasos de 0.1
      obj.position.copy(d.pos0).addScaledVector(eje, delta);
      this.lectura = `${part.slice(-1).toUpperCase()} ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`;
      return true;
    }

    // ── rotar alrededor de un eje global ──
    if (part === 'rot-x' || part === 'rot-y' || part === 'rot-z' || part === 'rot-screen') {
      let eje = this.ejeDe(part);
      if (part === 'rot-screen') {
        const dirCam = new THREE.Vector3();
        camera.getWorldDirection(dirCam);
        eje = dirCam.negate();
      }
      const a = this.anguloEnAnillo(raycaster, d.centro, eje);
      if (a === null) return false;
      let delta = a - d.ang0;
      // con candado, de 15 en 15 grados: es como se llega a 90 o 180 exactos
      if (this.locked) {
        const paso = Math.PI / 12;
        delta = Math.round(delta / paso) * paso;
      }
      const q = new THREE.Quaternion().setFromAxisAngle(eje, delta);
      obj.quaternion.copy(d.quat0).premultiply(q);
      const g = (delta * 180) / Math.PI;
      this.lectura = `${part === 'rot-screen' ? 'vista' : part.slice(-1).toUpperCase()} ${g >= 0 ? '+' : ''}${g.toFixed(1)}°`;
      return true;
    }

    // ── trackball: rota libre según el arrastre en pantalla ──
    if (part === 'trackball') {
      const dx = ndc.x - d.ndc0.x;
      const dy = ndc.y - d.ndc0.y;
      const vuelta = Math.PI;    // media pantalla ≈ media vuelta
      const q = new THREE.Quaternion()
        .setFromAxisAngle(d.camUp, dx * vuelta)
        .multiply(new THREE.Quaternion().setFromAxisAngle(d.camRight, -dy * vuelta));
      obj.quaternion.copy(d.quat0).premultiply(q);
      this.lectura = 'libre';
      return true;
    }

    // ── mover en el plano de la pantalla ──
    if (part === 'move-screen') {
      // se usa el plano que pasa por el centro y mira a la cámara: el objeto
      // sigue al cursor exactamente, sin deriva
      const dirCam = new THREE.Vector3();
      camera.getWorldDirection(dirCam);
      const plano = new THREE.Plane().setFromNormalAndCoplanarPoint(dirCam.clone().negate(), d.centro);
      const p = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plano, p)) return false;
      let mov = p.sub(d.centro);
      if (this.locked) {
        // candado: solo las cuatro direcciones de la pantalla
        const h = mov.dot(d.camRight), v = mov.dot(d.camUp);
        mov = Math.abs(h) >= Math.abs(v)
          ? d.camRight.clone().multiplyScalar(h)
          : d.camUp.clone().multiplyScalar(v);
      }
      obj.position.copy(d.pos0).add(mov);
      this.lectura = `${mov.length().toFixed(2)}`;
      return true;
    }

    // ── escalar (ancho, alto o libre), tomando el centro como referencia ──
    if (part === 'scale-w' || part === 'scale-h' || part === 'scale-free') {
      const dx = ndc.x - d.ndc0.x;
      const dy = ndc.y - d.ndc0.y;
      // el tirador de ancho está a la IZQUIERDA: alejarse del centro agranda
      const bruto = part === 'scale-w' ? -dx : part === 'scale-h' ? dy : (dy - dx) / 2;
      let f = 1 + bruto * 2.4;
      f = Math.max(0.05, f);
      if (this.locked) f = Math.round(f * 20) / 20;   // pasos de 0.05
      // con candado, escala uniforme (y en pasos de 0.05)
      const uniforme = this.locked || part === 'scale-free';
      const fu = uniforme || part === 'scale-w' ? f : 1;
      const fv = uniforme || part === 'scale-h' ? f : 1;
      if (this.escalarPuntos) {
        const n = new THREE.Vector3();
        camera.getWorldDirection(n);
        this.escalarPuntos(fu, fv, d.camRight.clone(), d.camUp.clone(), n);
      } else {
        // guias y superficies: no tienen puntos, se escala la transformacion
        const s = d.scale0.clone();
        if (uniforme) s.multiplyScalar(f);
        else if (part === 'scale-w') s.x *= f;
        else s.y *= f;
        obj.scale.copy(s);
      }
      this.lectura = uniforme
        ? `${(f * 100).toFixed(0)}%`
        : `${part === 'scale-w' ? 'ancho' : 'alto'} ${(f * 100).toFixed(0)}%`;
      return true;
    }
    return false;
  }

  /** Cierra el gesto. Devuelve el antes/después para que el motor lo anote en
   *  el historial (y null si nada cambió, para no llenar el Ctrl+Z de nada). */
  end(): {
    obj: THREE.Object3D;
    before: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 };
    after: { pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 };
  } | null {
    const d = this.drag;
    this.drag = null;
    this.escalarPuntos = null;
    this.lectura = '';
    if (!d) return null;
    const after = {
      pos: d.obj.position.clone(),
      quat: d.obj.quaternion.clone(),
      scale: d.obj.scale.clone(),
    };
    const cambio = d.pos0.distanceToSquared(after.pos) > 1e-10
      || d.quat0.angleTo(after.quat) > 1e-5
      || d.scale0.distanceToSquared(after.scale) > 1e-10;
    if (!cambio) return null;
    return {
      obj: d.obj,
      before: { pos: d.pos0, quat: d.quat0, scale: d.scale0 },
      after,
    };
  }

  cancelar(): void {
    const d = this.drag;
    if (!d) return;
    d.obj.position.copy(d.pos0);
    d.obj.quaternion.copy(d.quat0);
    d.obj.scale.copy(d.scale0);
    this.drag = null;
    this.lectura = '';
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | undefined;
      mat?.dispose();
    });
    this.root.parent?.remove(this.root);
    this.partes.clear();
    this.material.clear();
  }
}
