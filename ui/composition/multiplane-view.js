(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const composition = LOW.composition = LOW.composition || {};

  class MultiplaneView {
    constructor(root, options = {}) {
      this.root = root; this.options = options; this.rx = -18; this.ry = 28; this.zoom = .72;
      this.panX = 0; this.panY = 25; this.selected = null; this.planes = []; this.autoKey = !!options.autoKey; this.pendingTool = null; this.snap = true;
      this.mount();
    }
    mount() {
      this.root.innerHTML = `<div class="cmp3-toolbar">
        <button data-a="2d" title="Volver al dibujo 2D">2D</button><i></i>
        <button data-v="perspective" class="active">Perspectiva</button><button data-v="front">Frente</button><button data-v="top">Arriba</button>
        <button data-a="grid" class="active" title="Mostrar u ocultar cuadrícula">Grid</button><button data-a="snap" class="active" title="Ajuste: XY/Z 10 · rotación 5° · escala 5% (Ctrl desactiva durante el gesto)">Snap</button><button data-a="home" title="Centrar vista">Centrar</button><i></i>
        <button data-a="autokey" title="Crear claves de composición en el cuadro actual">Auto-key</button><i></i>
        <button data-a="stagger" title="Repartir los planos en profundidad, del fondo al frente (una sola acción, se deshace con Ctrl+Z)">Escalonar Z</button><strong class="cmp3-mode">Arrastrá un plano para moverlo · Z profundidad · R rotar · S escalar</strong>
      </div><div class="cmp3-stage"><div class="cmp3-world"><div class="cmp3-grid"></div><div class="cmp3-cards"></div></div>
        <div class="cmp3-empty" hidden><h3>La mesa multiplano está vacía</h3>
          <p>Cada elemento del dibujo abierto es un plano de esta mesa. Abrí o dibujá un diseño con
             varios elementos —fondo, personaje, primer plano— y aparecerán acá para separarlos en profundidad.</p></div>
        <div class="cmp3-flat" hidden><span>Todos los planos están en Z 0: la mesa se ve plana.</span><button data-a="stagger2">Escalonar Z</button></div></div>
      <aside class="cmp3-outliner"><header>Planos</header><div class="cmp3-list"></div></aside>
      <aside class="cmp3-inspector"><header>Transformar</header>
        <label><span>X</span><input data-p="x" type="number" step="10"></label>
        <label><span>Y</span><input data-p="y" type="number" step="10"></label>
        <label><span>Z</span><input data-p="z" type="number" step="10"></label>
        <label><span>Rotación</span><input data-p="rotationZ" type="number" step="1"></label>
        <label><span>Escala</span><input data-p="scaleX" type="number" step="0.05"></label>
        <header>Efectos del plano</header>
        <label class="cmp3-fx"><span>Desenfoque</span><input data-fx="blur" type="range" min="0" max="40" step="0.5" value="0"></label>
        <label class="cmp3-fx"><span>Brillo</span><input data-fx="bright" type="range" min="0" max="200" value="100"></label>
        <label class="cmp3-fx"><span>Contraste</span><input data-fx="contrast" type="range" min="0" max="200" value="100"></label>
        <label class="cmp3-fx"><span>Saturación</span><input data-fx="saturate" type="range" min="0" max="200" value="100"></label>
        <label class="cmp3-fx cmp3-fx-flag"><span>Sombra</span><input data-fx="shadow" type="checkbox"></label>
        <button class="cmp3-fx-reset" data-a="fxreset">Quitar efectos del plano</button>
        <p class="cmp3-fx-nota">Los efectos viajan con el dibujo del plano; la profundidad y la
           transformación sí aceptan claves por cuadro con Auto-key.</p>
      </aside><div class="cmp3-axis" aria-hidden="true"><b>X</b><b>Y</b><b>Z</b></div>`;
      this.stage = this.root.querySelector(".cmp3-stage"); this.world = this.root.querySelector(".cmp3-world");
      this.root.tabIndex = 0; this.root.onkeydown = event => this.key(event);
      this.cards = this.root.querySelector(".cmp3-cards"); this.list = this.root.querySelector(".cmp3-list");
      this.root.querySelector('[data-a="2d"]').onclick = () => this.options.onExit?.();
      this.root.querySelector('[data-a="grid"]').onclick = e => { e.currentTarget.classList.toggle("active"); this.root.classList.toggle("no-grid"); };
      this.root.querySelector('[data-a="snap"]').onclick = e => { this.snap = !this.snap; e.currentTarget.classList.toggle("active", this.snap); };
      this.root.querySelector('[data-a="home"]').onclick = () => { this.rx = -18; this.ry = 28; this.zoom = .72; this.panX = 0; this.panY = 25; this.applyView(); };
      this.root.querySelector('[data-a="autokey"]').onclick = e => { this.autoKey = !this.autoKey; e.currentTarget.classList.toggle("active", this.autoKey); this.options.onAutoKey?.(this.autoKey); };
      this.root.querySelector('[data-a="autokey"]').classList.toggle("active", this.autoKey);
      this.setTool(null);   // deja el rotulo explicando el gesto desde el arranque
      this.root.querySelectorAll("[data-v]").forEach(button => button.onclick = () => this.setView(button.dataset.v));
      // Se escucha «input» y no solo «change». `change` llega recien al salir
      // del campo o al apretar Enter: uno tipeaba un valor, no pasaba NADA, y
      // la conclusion razonable era «los campos no funcionan». Ahora la mesa
      // acompaña lo que se escribe y la CONFIRMACION —la que deja paso de
      // historial— sigue siendo el change, asi que tipear 250 no deja tres
      // pasos de deshacer (2, 25, 250).
      this.root.querySelectorAll(".cmp3-inspector input[data-p]").forEach(input => {
        input.oninput = () => this.input(input, true);
        input.onchange = () => this.input(input);
      });
      this.root.querySelectorAll(".cmp3-inspector input[data-fx]").forEach(input => input.onchange = () => {
        if (!this.selected) return;
        const value = input.type === "checkbox" ? input.checked : Number(input.value);
        this.options.onEffect?.(this.selected, { [input.dataset.fx]: value });
      });
      this.root.querySelector('[data-a="fxreset"]').onclick = () => { if (this.selected) this.options.onEffectReset?.(this.selected); };
      this.root.querySelectorAll('[data-a="stagger"],[data-a="stagger2"]').forEach(button =>
        button.onclick = () => this.options.onStagger?.());
      this.stage.onpointerdown = event => { this.root.focus({ preventScroll: true }); this.navigate(event); };
      this.stage.onwheel = event => { event.preventDefault(); this.zoom = Math.max(.18, Math.min(2.5, this.zoom * (event.deltaY < 0 ? 1.1 : .9))); this.applyView(); };
      this.applyView();
    }
    setView(name) {
      // La vista CÁMARA no es otro ángulo del diorama: es mirar por la cámara
      // de la escena, y lo que pinta es el cuadro que se exporta. Se marca en
      // la raíz para que el CSS tape el escenario 3D y muestre el recuadro.
      this.view = name;
      const camara = name === "camera";
      this.root.classList.toggle("cmp3-en-camara", camara);
      const views = { perspective: [-18, 28], front: [0, 0], top: [-89.9, 0] };
      this.root.querySelectorAll("[data-v]").forEach(b => b.classList.toggle("active", b.dataset.v === name));
      if (camara) {
        if (typeof window.dzCmpCamRender === "function") window.dzCmpCamRender();
        return;
      }
      [this.rx, this.ry] = views[name] || views.perspective;
      this.applyView();
    }
    applyView() { this.world.style.transform = `translate3d(${this.panX}px,${this.panY}px,0) scale(${this.zoom}) rotateX(${this.rx}deg) rotateY(${this.ry}deg)`; }
    navigate(event) {
      if (event.target.closest(".cmp3-card")) return;
      const sx = event.clientX, sy = event.clientY, start = { rx: this.rx, ry: this.ry, x: this.panX, y: this.panY }, pan = event.shiftKey || event.button === 1;
      const move = e => { if (pan) { this.panX = start.x + e.clientX - sx; this.panY = start.y + e.clientY - sy; }
        else { this.ry = start.ry + (e.clientX - sx) * .35; this.rx = Math.max(-90, Math.min(90, start.rx - (e.clientY - sy) * .35)); } this.applyView(); };
      const up = () => { global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", up); };
      global.addEventListener("pointermove", move); global.addEventListener("pointerup", up);
    }
    /* Una lista VACIA no borra la seleccion. Un repintado transitorio del lienzo
       puede dejar el arte sin hijos por un instante, y perder la seleccion ahi
       significa que el proximo valor que uno escriba caiga en el `if (!active)
       return` de input() y no haga NADA. Es lo que se medio en la app real:
       movias X y despues la Z ya no respondia. */
    setPlanes(planes) {
      const lista = planes || [];
      if (lista.length) {
        this.planes = lista;
        if (!lista.some(p => p.id === this.selected)) this.selected = lista[0].id;
      } else {
        this.planes = lista;   // se muestra la mesa vacia, pero el elegido se recuerda
      }
      this.render();
    }
    select(id) { this.selected = id; this.render(); this.options.onSelect?.(id); }
    render() {
      this.cards.innerHTML = ""; this.list.innerHTML = "";
      for (const plane of this.planes) {
        const t = plane.transform || {}, card = document.createElement("div");
        card.className = "cmp3-card" + (plane.id === this.selected ? " selected" : ""); card.dataset.id = plane.id;
        card.style.transform = `translate3d(${t.x || 0}px,${t.y || 0}px,${-(t.z || 0)}px) rotateX(${t.rotationX || 0}deg) rotateY(${t.rotationY || 0}deg) rotateZ(${t.rotationZ || 0}deg) scale(${t.scaleX ?? 1},${t.scaleY ?? 1})`;
        const surface = document.createElement("div"); surface.className = "cmp3-surface";
        if (plane.node) surface.appendChild(plane.node.cloneNode(true));
        const tag = document.createElement("span"); tag.textContent = `${plane.name} · Z ${Math.round(t.z || 0)}`;
        card.append(surface, tag);
        if (plane.id === this.selected) {
          const gizmo = document.createElement("div"); gizmo.className = "cmp3-gizmo";
          gizmo.innerHTML = '<button data-axis="xy" title="Mover en X/Y">XY</button><button data-axis="z" title="Mover en profundidad">Z</button><button data-axis="r" title="Rotar en el plano">R</button><button data-axis="s" title="Escala uniforme">S</button>';
          gizmo.querySelectorAll("button").forEach(handle => handle.onpointerdown = e => this.manipulate(e, plane, handle.dataset.axis));
          card.appendChild(gizmo);
        }
        // Agarrar el plano LO MUEVE. Antes esto solo hacia algo si antes habias
        // apretado G, R o S —interfaz modal estilo Blender— y por omision
        // `pendingTool` es null: uno agarraba un plano y no pasaba NADA. Fue el
        // reporte «las herramientas no hacen nada, no puedo cambiar las
        // posiciones de los planos», y era exacto. Las teclas siguen mandando
        // cuando estan puestas; sin ellas, arrastrar mueve en X/Y, que es lo que
        // hace cualquier programa.
        card.onpointerdown = e => {
          this.root.focus({ preventScroll: true });
          if (e.button !== 0) return;
          // Seleccionar en el POINTERDOWN y no en el click: el click llega
          // despues del arrastre, asi que agarrar un plano no elegido movia el
          // anterior. Ahora el mismo gesto elige y mueve, como se espera.
          if (plane.id !== this.selected) this.select(plane.id);
          this.manipulate(e, plane, this.pendingTool || "xy");
        };
        card.onclick = e => { e.stopPropagation(); this.select(plane.id); }; this.cards.appendChild(card);
        const row = document.createElement("button"); row.className = plane.id === this.selected ? "active" : "";
        row.innerHTML = `<i></i><span></span><small>Z ${Math.round(t.z || 0)}</small>`; row.querySelector("span").textContent = plane.name; row.onclick = () => this.select(plane.id); this.list.appendChild(row);
      }
      const active = this.planes.find(p => p.id === this.selected), inspector = this.root.querySelector(".cmp3-inspector");
      inspector.classList.toggle("disabled", !active);
      inspector.querySelectorAll("input[data-p]").forEach(input => input.value = active ? (active.transform?.[input.dataset.p] ?? (input.dataset.p === "scaleX" ? 1 : 0)) : "");
      this.setEffects(active ? active.effects : null);
      // Estados explícitos: una mesa sin planos explica qué es un plano, y una
      // mesa con todo en Z 0 avisa por qué se ve chata en vez de parecer rota.
      const empty = !this.planes.length;
      this.root.querySelector(".cmp3-empty").hidden = !empty;
      this.root.querySelector(".cmp3-flat").hidden = empty || this.planes.length < 2
        || !this.planes.every(plane => !Math.round(plane.transform?.z || 0));
    }
    setEffects(values) {
      const v = { blur: 0, bright: 100, contrast: 100, saturate: 100, shadow: false, ...(values || {}) };
      this.root.querySelectorAll(".cmp3-inspector input[data-fx]").forEach(input => {
        if (input.type === "checkbox") input.checked = !!v[input.dataset.fx];
        else input.value = v[input.dataset.fx];
      });
    }
    /** @param {boolean} previa  true mientras se escribe: mueve la mesa pero no
     *  confirma. El campo vacio o a medio escribir («-», «1.») no se aplica: si
     *  no, borrar para retipear tiraba el plano a cero de un salto. */
    input(input, previa) {
      // Sin plano elegido el campo no puede hacer nada, y callarse es lo que
      // hacia parecer que el inspector estaba muerto: se escribia un numero y
      // no pasaba NADA, sin una palabra. Ahora lo dice.
      const active = this.planes.find(p => p.id === this.selected);
      if (!active) {
        if (!previa) this.root.querySelector(".cmp3-mode").textContent =
          this.planes.length ? "Elegí un plano en la lista para cambiarle los valores"
            : "No hay planos en la mesa: abrí o dibujá algo con varios elementos";
        return;
      }
      const texto = String(input.value).trim();
      if (previa && (texto === "" || texto === "-" || texto === "." || texto.endsWith("."))) return;
      const valor = Number(texto);
      if (!Number.isFinite(valor)) return;
      const patch = { [input.dataset.p]: valor };
      if (input.dataset.p === "scaleX") patch.scaleY = patch.scaleX;
      if (previa) {
        // Solo la mesa: se ve el efecto sin tocar el documento ni el historial
        active.transform = { ...(active.transform || {}), ...patch };
        this.pintarTarjeta(active);
        return;
      }
      this.options.onTransform?.(active.id, patch);
    }
    /** Aplica la transformacion de UN plano sobre su tarjeta ya existente.
     *  Es la version barata de render() para usar durante un arrastre. */
    pintarTarjeta(plane) {
      const t = plane.transform || {};
      const card = this.cards.querySelector('[data-id="' + (window.CSS && CSS.escape ? CSS.escape(plane.id) : plane.id) + '"]');
      if (!card) return this.render();
      card.style.transform = `translate3d(${t.x || 0}px,${t.y || 0}px,${-(t.z || 0)}px)` +
        ` rotateX(${t.rotationX || 0}deg) rotateY(${t.rotationY || 0}deg)` +
        ` rotateZ(${t.rotationZ || 0}deg) scale(${t.scaleX ?? 1},${t.scaleY ?? 1})`;
      const tag = card.querySelector("span");
      if (tag) tag.textContent = `${plane.name} · Z ${Math.round(t.z || 0)}`;
      const fila = [...this.list.children].find((b) => b.querySelector("span")?.textContent === plane.name);
      const small = fila && fila.querySelector("small");
      if (small) small.textContent = `Z ${Math.round(t.z || 0)}`;
    }
    setTool(tool) {
      this.pendingTool = tool;
      const names = { xy: "Mover XY", z: "Mover Z", r: "Rotar", s: "Escalar" };
      // Sin herramienta puesta el rotulo explica el gesto, en vez de decir
      // «Seleccionar» y dejar que uno adivine que hay teclas.
      this.root.querySelector(".cmp3-mode").textContent = names[tool] ||
        "Arrastrá un plano para moverlo · Z profundidad · R rotar · S escalar";
    }
    key(event) {
      if (event.target.matches?.("input")) return;
      if (event.code === "Numpad1") { event.preventDefault(); return this.setView("front"); }
      if (event.code === "Numpad7") { event.preventDefault(); return this.setView("top"); }
      if (event.code === "Numpad5") { event.preventDefault(); return this.setView("perspective"); }
      const key = event.key.toLowerCase();
      if (key === "escape") { event.preventDefault(); return this.setTool(null); }
      if (key === "g") { event.preventDefault(); return this.setTool("xy"); }
      if (key === "z" && this.pendingTool === "xy") { event.preventDefault(); return this.setTool("z"); }
      if (key === "r") { event.preventDefault(); return this.setTool("r"); }
      if (key === "s") { event.preventDefault(); return this.setTool("s"); }
    }
    manipulate(event, plane, axis) {
      event.preventDefault(); event.stopPropagation();
      const startX = event.clientX, startY = event.clientY, start = { ...(plane.transform || {}) };
      const move = e => {
        const dx = (e.clientX - startX) / Math.max(.18, this.zoom);
        const useSnap = this.snap && !e.ctrlKey, q = (value, step) => useSnap ? Math.round(value / step) * step : value;
        const patch = axis === "z" ? { z: q((start.z || 0) + dx, 10) }
          : axis === "r" ? { rotationZ: q((start.rotationZ || 0) + dx * .4, 5) }
          : axis === "s" ? { scaleX: Math.max(.05, q((start.scaleX ?? 1) + dx / 300, .05)), scaleY: Math.max(.05, q((start.scaleY ?? 1) + dx / 300, .05)) }
          : { x: q((start.x || 0) + dx, 10), y: q((start.y || 0) + (e.clientY - startY) / Math.max(.18, this.zoom), 10) };
        plane.transform = { ...start, ...patch };
        // Mover la tarjeta arrastrada, no reconstruir el escenario entero:
        // render() vacia .cmp3-cards y CLONA el dibujo de cada plano, y esto
        // corre en cada pointermove. Con una escena real eso es clonar el
        // dibujo completo sesenta veces por segundo, y ademas destruia y
        // recreaba la tarjeta que uno tiene agarrada.
        this.pintarTarjeta(plane);
      };
      const up = e => {
        global.removeEventListener("pointermove", move); global.removeEventListener("pointerup", up);
        const patch = axis === "z" ? { z: plane.transform.z || 0 }
          : axis === "r" ? { rotationZ: plane.transform.rotationZ || 0 }
          : axis === "s" ? { scaleX: plane.transform.scaleX ?? 1, scaleY: plane.transform.scaleY ?? 1 }
          : { x: plane.transform.x || 0, y: plane.transform.y || 0 };
        this.options.onTransform?.(plane.id, patch);
        this.setTool(null);
        this.render();
        // Si se está mirando por la cámara, lo que se acaba de mover tiene que
        // verse ahí mismo: es el sentido de tener la cámara en esta pantalla.
        if (this.view === "camera" && typeof window.dzCmpCamRender === "function")
          window.dzCmpCamRender();
      };
      global.addEventListener("pointermove", move); global.addEventListener("pointerup", up);
    }
  }
  composition.MultiplaneView = MultiplaneView;
})(typeof window !== "undefined" ? window : globalThis);
