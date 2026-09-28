/* ══════════════════════════════════════════════════════════════════════════
   STORYBOARD — escenario 3D de la toma

   Acá se ve la toma antes de dibujarla: figuras paradas en un piso, la cámara
   con su cono de visión, y la posibilidad de mirar POR la cámara para saber
   qué entra en el cuadro. Es la mitad que le faltaba al generador: el número
   («ocupa 200% del cuadro») recién significa algo cuando se ve.

   Reglas que se respetan acá:
   - El escenario NO guarda estado: lee el panel del `Scene.storyboard` y todo
     lo que se mueve vuelve por un comando de LowDoc, así que entra en Undo.
   - three.js se carga en DIFERIDO, sólo al abrir el escenario: son 600 KB que
     no tienen por qué pesar en el arranque de quien nunca lo usa.
   - Un puente explícito de coordenadas, porque son dos convenciones distintas:
     el modelo de tomas mide `y` HACIA ABAJO desde la coronilla (como el lienzo
     SVG) y three.js mide Y hacia arriba desde el piso.

   @module storyboard/stage-view
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const storyboard = LOW.storyboard = LOW.storyboard || {};

  const THREE_SRC = "vendor/three.min.js";
  let cargando = null;
  function cargarThree() {
    if (global.THREE) return Promise.resolve(global.THREE);
    if (cargando) return cargando;
    cargando = new Promise((ok, fail) => {
      const script = document.createElement("script");
      script.src = THREE_SRC;
      script.onload = () => global.THREE ? ok(global.THREE) : fail(Error("three.js cargó sin exponer THREE"));
      script.onerror = () => { cargando = null; fail(Error("no se pudo cargar " + THREE_SRC)); };
      document.head.appendChild(script);
    });
    return cargando;
  }

  const COLOR_PISO = 0x1b1d24, COLOR_GRID = 0x2f333d;
  const COLOR_FIG = 0x8a93a6, COLOR_FOCO = 0xF0450E, COLOR_CAM = 0x33B5E8;

  /** Muñeco de proporciones humanas (7,5 cabezas) armado con primitivas. No es
   *  el personaje final: es la referencia de tamaño y posición que necesita el
   *  encuadre para decir la verdad. */
  function construirFigura(THREE, figura, enfocada) {
    const h = figura.height, grupo = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: enfocada ? COLOR_FOCO : COLOR_FIG, roughness: .9, metalness: 0 });
    const pieza = (geo, x, y, z, rot) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
      grupo.add(m); return m;
    };
    const capsula = (radio, largo) => new THREE.CapsuleGeometry(radio, largo, 4, 10);
    // La pose sólo inclina extremidades: no deforma el cuerpo ni cambia la altura,
    // porque la altura es lo que el encuadre está midiendo.
    const p = figura.pose;
    const zancada = p === "caminando" ? .5 : 0;
    const brazoAdelante = p === "senalando" ? -1.15 : 0;
    const sentado = p === "sentado";

    pieza(new THREE.SphereGeometry(h * .066, 18, 12), 0, h - h * .066, 0);        // cabeza
    pieza(capsula(h * .026, h * .04), 0, h - h * .155, 0);                        // cuello
    pieza(new THREE.BoxGeometry(h * .20, h * .25, h * .105), 0, h * (sentado ? .62 : .70), 0); // torso
    pieza(new THREE.BoxGeometry(h * .17, h * .085, h * .10), 0, h * (sentado ? .50 : .55), 0); // cadera

    const largoBrazo = h * .30, largoPierna = h * .47;
    for (const lado of [-1, 1]) {
      pieza(capsula(h * .026, largoBrazo), lado * h * .12, h * .66, 0,
        [brazoAdelante, 0, lado * .08]);
      if (sentado) {
        pieza(capsula(h * .034, largoPierna * .55), lado * h * .05, h * .47, h * .13, [-Math.PI / 2, 0, 0]);
        pieza(capsula(h * .032, largoPierna * .5), lado * h * .05, h * .26, h * .26);
      } else {
        pieza(capsula(h * .034, largoPierna), lado * h * .05, h * .26, 0,
          [lado * zancada * .5, 0, 0]);
      }
    }
    grupo.position.set(figura.x, 0, figura.z);
    grupo.rotation.y = (figura.rotation || 0) * Math.PI / 180;
    grupo.userData.figuraId = figura.id;
    return grupo;
  }

  class StageView {
    constructor(host, doc) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.doc = doc;
      this.board = null;
      this.mode = "escenario";            // «escenario» o «camara»
      this.status = null;
      this.onCast = null;                 // (cast) => void, para persistir por comando
      this.THREE = null;
      this._orbita = { theta: 0.62, phi: 1.15, radio: 620 };
      this._arrastre = null;
      this._vivo = false;
    }

    async mount() {
      if (!this.host) return false;
      const THREE = this.THREE = await cargarThree();
      if (this.renderer) { this._resize(); this.render(); return true; }

      this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      this.renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));
      this.host.appendChild(this.renderer.domElement);
      this.renderer.domElement.className = "sb3-canvas";

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(COLOR_PISO);
      this.scene.add(new THREE.HemisphereLight(0xdfe6f2, 0x14161c, 1.15));
      const sol = new THREE.DirectionalLight(0xffffff, .75);
      sol.position.set(220, 420, 260);
      this.scene.add(sol);

      const grid = new THREE.GridHelper(1600, 32, COLOR_GRID, COLOR_GRID);
      grid.material.opacity = .55; grid.material.transparent = true;
      this.scene.add(grid);

      this.figuras = new THREE.Group(); this.scene.add(this.figuras);
      this.gizmo = new THREE.Group(); this.scene.add(this.gizmo);

      this.directorCamera = new THREE.PerspectiveCamera(38, 16 / 9, 1, 12000);
      this.shotCamera = new THREE.PerspectiveCamera(23, 16 / 9, 1, 12000);

      this._plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      this._raycaster = new THREE.Raycaster();
      this._wire();
      this._vivo = true;
      this._resize();
      this.sync();
      return true;
    }

    dispose() {
      this._vivo = false;
      if (this.renderer) { this.renderer.dispose(); this.renderer.domElement.remove(); }
      this.renderer = null;
    }

    setBoard(board) { this.board = board; this.sync(); }
    setMode(mode) {
      this.mode = mode === "camara" ? "camara" : "escenario";
      this.sync();
    }

    _shots() { return storyboard.shots; }
    _aspect() {
      const sc = this.doc && this.doc.scene;
      return sc && sc.height > 0 ? sc.width / sc.height : 16 / 9;
    }
    _cast() { return (this.board && this.board.shot && this.board.shot.cast) || []; }
    _focused() {
      const cast = this._cast();
      if (!cast.length) return null;
      return cast.find((f) => f.id === this.board.shot.focus) || cast[0];
    }

    /* ── el puente de coordenadas, en un solo lugar ──────────────────────────
       El modelo mide `y` hacia ABAJO desde la coronilla; three.js hacia ARRIBA
       desde el piso. Si esto vive desparramado, la cámara termina bajo tierra. */
    _camaraDelModelo() {
      const foco = this._focused();
      if (!foco || !this.board.shot.camera) return null;
      const cam = this.board.shot.camera;
      const distancia = Math.abs(cam.z - 0) || 1;
      const alturaY = foco.height - cam.y;
      const pitch = (cam.rotationX || 0) * Math.PI / 180;
      // La cámara se para a `distancia` del sujeto, sobre su eje Z, y apunta
      // según la inclinación: a nivel mira horizontal, en picado hacia abajo.
      const pos = { x: foco.x, y: alturaY, z: foco.z + distancia };
      const mira = { x: foco.x, y: alturaY - Math.tan(pitch) * distancia, z: foco.z };
      const fov = this._shots().verticalFov(cam, this._aspect());
      return { pos, mira, fov, distancia, foco };
    }

    /** Reconstruye lo que se ve a partir del panel. Barato: son pocas mallas y
     *  evita todo un sistema de diffs que podría desincronizarse. */
    sync() {
      if (!this._vivo || !this.THREE) return;
      const THREE = this.THREE;
      while (this.figuras.children.length) {
        const hijo = this.figuras.children.pop();
        hijo.traverse((n) => { if (n.geometry) n.geometry.dispose(); if (n.material) n.material.dispose(); });
      }
      const foco = this._focused();
      for (const figura of this._cast())
        this.figuras.add(construirFigura(THREE, figura, foco && figura.id === foco.id));

      while (this.gizmo.children.length) {
        const hijo = this.gizmo.children.pop();
        if (hijo.geometry) hijo.geometry.dispose();
        if (hijo.material) hijo.material.dispose();
      }
      const vista = this._camaraDelModelo();
      if (vista) {
        this.shotCamera.fov = vista.fov;
        this.shotCamera.aspect = this._aspect();
        this.shotCamera.position.set(vista.pos.x, vista.pos.y, vista.pos.z);
        this.shotCamera.lookAt(vista.mira.x, vista.mira.y, vista.mira.z);
        this.shotCamera.updateProjectionMatrix();
        if (this.mode === "escenario") this._dibujarGizmoDeCamara(vista);
      }
      this.render();
    }

    /** El cono de visión, dibujado hasta el sujeto. Es lo que convierte «FOV
     *  22.9°» en algo que se entiende de un vistazo. */
    _dibujarGizmoDeCamara(vista) {
      const THREE = this.THREE;
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 20),
        new THREE.MeshStandardMaterial({ color: COLOR_CAM, roughness: .5 }));
      cuerpo.position.copy(this.shotCamera.position);
      cuerpo.quaternion.copy(this.shotCamera.quaternion);
      this.gizmo.add(cuerpo);

      const alto = 2 * vista.distancia * Math.tan(vista.fov * Math.PI / 360);
      const ancho = alto * this._aspect();
      const esquinas = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([sx, sy]) => {
        const v = new THREE.Vector3(sx * ancho / 2, sy * alto / 2, -vista.distancia);
        return v.applyMatrix4(this.shotCamera.matrixWorld);
      });
      const material = new THREE.LineBasicMaterial({ color: COLOR_CAM, transparent: true, opacity: .75 });
      const puntos = [];
      for (const esquina of esquinas) { puntos.push(this.shotCamera.position.clone(), esquina.clone()); }
      for (let i = 0; i < 4; i++) puntos.push(esquinas[i].clone(), esquinas[(i + 1) % 4].clone());
      this.gizmo.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(puntos), material));
    }

    _resize() {
      if (!this.renderer || !this.host) return;
      const w = Math.max(1, this.host.clientWidth), h = Math.max(1, this.host.clientHeight);
      this.renderer.setSize(w, h, false);
      this.directorCamera.aspect = w / h;
      this.directorCamera.updateProjectionMatrix();
    }

    render() {
      if (!this._vivo || !this.renderer) return;
      this._resize();
      // OJO: setViewport trabaja en píxeles LÓGICOS y `domElement.width` está en
      // píxeles del búfer (ya multiplicado por devicePixelRatio). Mezclarlos
      // hacía que el recuadro fuera el doble y la cámara mostrara MÁS de lo que
      // realmente entra: el encuadre mentía justo donde hay que confiar en él.
      const tamano = this.renderer.getSize(new this.THREE.Vector2());
      const w = tamano.x, h = tamano.y;
      if (this.mode === "camara") {
        this.gizmo.visible = false;
        // El cuadro respeta la relación de aspecto del proyecto y lo que sobra
        // queda en negro, como en una moviola: nunca se estira la imagen.
        const objetivo = this._aspect();
        let vw = w, vh = w / objetivo;
        if (vh > h) { vh = h; vw = h * objetivo; }
        const vx = (w - vw) / 2, vy = (h - vh) / 2;
        this.shotCamera.aspect = objetivo;
        this.shotCamera.updateProjectionMatrix();
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, w, h);
        this.renderer.setClearColor(0x0b0c10, 1);
        this.renderer.clear();
        this.renderer.setViewport(vx, vy, vw, vh);
        this.renderer.setScissor(vx, vy, vw, vh);
        this.renderer.setScissorTest(true);
        this.renderer.render(this.scene, this.shotCamera);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, w, h);
        return;
      }
      this.gizmo.visible = true;
      const { theta, phi, radio } = this._orbita;
      const centro = this._focused() || { x: 0, z: 0, height: 170 };
      this.directorCamera.position.set(
        centro.x + radio * Math.sin(phi) * Math.sin(theta),
        Math.max(20, radio * Math.cos(phi)),
        centro.z + radio * Math.sin(phi) * Math.cos(theta));
      this.directorCamera.lookAt(centro.x, centro.height * .5, centro.z);
      this.renderer.render(this.scene, this.directorCamera);
    }

    /** Foto de lo que ve la cámara. Va al panel como referencia: el storyboard
     *  se dibuja ENCIMA de esto, no lo reemplaza. */
    capture(ancho = 320) {
      if (!this.renderer || !this.THREE) return null;
      const alto = Math.round(ancho / this._aspect());
      const previo = this.renderer.getSize(new this.THREE.Vector2());
      this.renderer.setScissorTest(false);
      this.renderer.setSize(ancho, alto, false);
      this.shotCamera.aspect = this._aspect();
      this.shotCamera.updateProjectionMatrix();
      const gizmoVisible = this.gizmo.visible;
      this.gizmo.visible = false;
      this.renderer.setViewport(0, 0, ancho, alto);
      this.renderer.render(this.scene, this.shotCamera);
      const png = this.renderer.domElement.toDataURL("image/png");
      this.gizmo.visible = gizmoVisible;
      this.renderer.setSize(previo.x, previo.y, false);
      this.render();
      return png;
    }

    /* ── puntero: orbitar el escenario o arrastrar una figura ──────────────── */
    _wire() {
      const lienzo = this.renderer.domElement;
      lienzo.style.touchAction = "none";
      lienzo.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0) return;
        lienzo.setPointerCapture(ev.pointerId);
        const figura = this.mode === "escenario" ? this._figuraEn(ev) : null;
        this._arrastre = figura
          ? { tipo: "figura", id: figura, pointerId: ev.pointerId }
          : { tipo: "orbita", pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY };
        if (figura && this.board) {
          // Tocar una figura la enfoca: es a quién se le mide el plano.
          const cast = this._cast().map((f) => ({ ...f }));
          if (this.onCast) this.onCast(cast, figura);
        }
      });
      lienzo.addEventListener("pointermove", (ev) => {
        const a = this._arrastre;
        if (!a || ev.pointerId !== a.pointerId) return;
        if (a.tipo === "orbita") {
          this._orbita.theta -= (ev.clientX - a.x) * .008;
          this._orbita.phi = Math.max(.15, Math.min(1.5, this._orbita.phi - (ev.clientY - a.y) * .006));
          a.x = ev.clientX; a.y = ev.clientY;
          this.render();
          return;
        }
        const punto = this._puntoEnElPiso(ev);
        if (!punto) return;
        const grupo = this.figuras.children.find((g) => g.userData.figuraId === a.id);
        if (grupo) { grupo.position.x = punto.x; grupo.position.z = punto.z; }
        a.destino = punto;
        this.sync === undefined ? null : this.render();
      });
      const soltar = (ev) => {
        const a = this._arrastre;
        if (!a || (ev.pointerId != null && ev.pointerId !== a.pointerId)) return;
        this._arrastre = null;
        // Recién al soltar se escribe: arrastrar es previsualizar, soltar es
        // decidir. Una entrada de historial por gesto, no una por píxel.
        if (a.tipo === "figura" && a.destino && this.onCast) {
          const cast = this._cast().map((f) => f.id === a.id
            ? { ...f, x: Math.round(a.destino.x), z: Math.round(a.destino.z) } : { ...f });
          this.onCast(cast, a.id, true);
        }
      };
      lienzo.addEventListener("pointerup", soltar);
      lienzo.addEventListener("pointercancel", soltar);
      lienzo.addEventListener("wheel", (ev) => {
        if (this.mode !== "escenario") return;
        ev.preventDefault();
        this._orbita.radio = Math.max(120, Math.min(4000, this._orbita.radio * (ev.deltaY > 0 ? 1.12 : .89)));
        this.render();
      }, { passive: false });
    }

    _normalizado(ev) {
      const r = this.renderer.domElement.getBoundingClientRect();
      return new this.THREE.Vector2(
        ((ev.clientX - r.left) / r.width) * 2 - 1,
        -((ev.clientY - r.top) / r.height) * 2 + 1);
    }
    _figuraEn(ev) {
      this._raycaster.setFromCamera(this._normalizado(ev), this.directorCamera);
      const golpes = this._raycaster.intersectObjects(this.figuras.children, true);
      for (const golpe of golpes) {
        let nodo = golpe.object;
        while (nodo && !nodo.userData.figuraId) nodo = nodo.parent;
        if (nodo) return nodo.userData.figuraId;
      }
      return null;
    }
    _puntoEnElPiso(ev) {
      this._raycaster.setFromCamera(this._normalizado(ev), this.directorCamera);
      const destino = new this.THREE.Vector3();
      return this._raycaster.ray.intersectPlane(this._plano, destino) ? destino : null;
    }
  }

  storyboard.StageView = StageView;
  storyboard.cargarThree = cargarThree;
})(typeof window !== "undefined" ? window : globalThis);
