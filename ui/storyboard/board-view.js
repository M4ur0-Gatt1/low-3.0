/* ══════════════════════════════════════════════════════════════════════════
   STORYBOARD — panel de paneles y generador de tomas

   Vista del `Scene.storyboard`: la lista de paneles y, para el que esté
   elegido, el generador de cámara. Pedís «plano medio, contrapicado» y la
   cámara se ubica sola; el encuadre se dibuja encima de la figura para que la
   decisión se vea antes de aceptarla.

   No guarda estado propio: todo lo que se edita va por comandos de LowDoc, así
   que entra en Undo y se guarda con la escena. Lo único que vive acá es qué
   panel está seleccionado, que es cursor de interfaz, no obra.

   @module storyboard/board-view
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const storyboard = LOW.storyboard = LOW.storyboard || {};

  class BoardView {
    constructor(host, doc) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.doc = doc;
      this.selectedId = null;
      this.status = null;
      this._desuscribir = doc ? doc.subscribe((_d, reason) => {
        if (reason === "storyboard" || reason === "frame") this.render();
      }) : null;
    }
    setDoc(doc) {
      if (this._desuscribir) this._desuscribir();
      this.doc = doc;
      this._desuscribir = doc ? doc.subscribe((_d, reason) => {
        if (reason === "storyboard" || reason === "frame") this.render();
      }) : null;
      this.render();
    }
    dispose() { if (this._desuscribir) this._desuscribir(); if (this.host) this.host.innerHTML = ""; }

    _shots() { return storyboard.shots; }

    /** ¿Está corriendo la animática? Se pregunta al reproductor de la escena,
     *  que es el único que sabe: una bandera propia acá se desincronizaría en
     *  cuanto alguien parara la reproducción desde la Timeline. */
    _reproduciendo() { const p = this._reproductor(); return !!(p && p.playing && this._animatica); }

    /** El reproductor de la escena. Se acepta inyectado (`this.playback`) y si
     *  no, se toma el de la aplicación: uno solo, nunca dos.
     *
     *  OJO con `DZ`: en app.js es `const`, así que NO es propiedad de window y
     *  leerlo como `global.DZ` da undefined EN SILENCIO. Se nombra suelto con
     *  guarda `typeof`, que es lo que pide el contrato de interacción 2D. */
    _reproductor() {
      if (this.playback) return this.playback;
      const app = (typeof DZ !== "undefined") ? DZ : null;
      if (app && app.playback) return app.playback;
      if (app && this.doc && LOW.animation && LOW.animation.Playback) {
        app.playback = new LOW.animation.Playback(this.doc);
        return app.playback;
      }
      return null;
    }

    /** Reproduce los paneles con su duración, o para si ya está corriendo.
     *
     *  Reusa el reproductor de la escena en vez de armar otro: ése avanza por
     *  RELOJ REAL —si la máquina no llega saltea cuadros en vez de ir en cámara
     *  lenta, que es lo que arruinaría el juicio de ritmo— y arrastra el audio.
     *  El rango se pone en el del board y se DEVUELVE como estaba al terminar:
     *  la animática no puede dejarte la escena recortada. */
    animatica() {
      const rep = this._reproductor();
      if (!rep || !this.doc) return false;
      if (this._reproduciendo()) { rep.stop(); return true; }
      const total = this.doc.scene.boardDuration();
      if (!total) return false;
      this._rangoPrevio = { ...this.doc.scene.range };
      this._animatica = true;
      const restaurar = () => {
        if (!this._animatica) return;
        this._animatica = false;
        if (this._rangoPrevio) { this.doc.scene.range = this._rangoPrevio; this._rangoPrevio = null; }
        if (this._desPlayback) { this._desPlayback(); this._desPlayback = null; }
        this.render();
      };
      /* El orden importa y me costó una corrida: `setRange` AVISA, y si uno se
         suscribe antes de arrancar, ese primer aviso llega con el reproductor
         todavía parado y el restaurador deshace la animática apenas empieza.
         Primero se arranca; recién después se escucha para saber cuándo
         termina. */
      rep.setRange(1, total);
      this.doc.goTo(1);
      rep.play();
      if (!rep.playing) { restaurar(); return false; }   // no arrancó: nada a medias
      this._desPlayback = rep.subscribe(() => {
        if (!rep.playing) restaurar(); else this.render();
      });
      if (this.status) this.status("Animática: " + this.doc.scene.storyboard.boards.length +
        " panel(es), " + (total / Math.max(1, this.doc.scene.fps || 24)).toFixed(1) + " s");
      this.render();
      return true;
    }
    _selected() {
      const boards = this.doc ? this.doc.scene.storyboard.boards : [];
      if (!boards.length) return null;
      return boards.find((b) => b.id === this.selectedId) || boards[0];
    }
    /** La figura de referencia del panel. Sin una, el generador no tiene con
     *  qué medir el encuadre: se usa la de fábrica y se dice cuál es. */
    _subject(board) {
      // Quien manda es la figura ENFOCADA del escenario: el plano se mide sobre
      // alguien concreto, no sobre una figura abstracta. `subject` queda de
      // respaldo para paneles viejos que todavía no tienen reparto.
      const shot = board && board.shot;
      const cast = (shot && shot.cast) || [];
      const foco = cast.find((f) => f.id === (shot && shot.focus)) || cast[0];
      if (foco) return { x: foco.x, y: 0, z: foco.z, height: foco.height };
      return (shot && shot.subject) || this._shots().DEFAULT_SUBJECT;
    }
    _aspect() {
      const sc = this.doc && this.doc.scene;
      return sc && sc.height > 0 ? sc.width / sc.height : this._shots().DEFAULT_ASPECT;
    }

    /** Regenera la cámara del panel con el tipo y ángulo elegidos, conservando
     *  el lente: cambiar de plano no le cambia la óptica al director. */
    _regenerate(board, patch) {
      const shots = this._shots();
      const shot = { ...board.shot, ...patch };
      const camera = shots.frameShot(shot.type, this._subject(board),
        shot.camera || {}, { angle: shot.angle, aspect: this._aspect() });
      this.doc.updateStoryboardBoard(board.id, { shot: { ...shot, camera } }, "Encuadrar la toma");
      if (this.status) {
        const tipo = shots.SHOT_TYPES.find((t) => t.id === camera.shotType);
        this.status(`Toma: ${tipo ? tipo.name : camera.shotType} · ${tipo ? tipo.framing : ""}`);
      }
    }

    render() {
      if (!this.host || !this.doc) return;
      const shots = this._shots(), sc = this.doc.scene;
      const boards = sc.storyboard.boards, tiempos = sc.boardTiming();
      const elegido = this._selected();
      this.selectedId = elegido ? elegido.id : null;
      this.host.innerHTML = "";

      const raiz = document.createElement("div");
      raiz.className = "sb2";

      // ── barra: agregar y quitar paneles ──
      const barra = document.createElement("div"); barra.className = "sb2-tools";
      const boton = (texto, titulo, accion, extra = "") => {
        const b = document.createElement("button");
        b.type = "button"; b.textContent = texto; b.title = titulo;
        b.setAttribute("aria-label", titulo);
        if (extra) b.className = extra;
        b.onclick = accion; barra.appendChild(b); return b;
      };
      // Un panel nuevo nace con una toma REAL, no vacío: esto es un generador,
      // así que agregar un panel ya tiene que darte una cámara que mirar.
      const nuevoPanel = (at) => {
        const subject = shots.DEFAULT_SUBJECT;
        const camera = shots.frameShot("plano-medio", subject, {}, { aspect: this._aspect() });
        const id = this.doc.addStoryboardBoard({ duration: this.doc.scene.fps || 24,
          shot: { type: "plano-medio", angle: "nivel", camera, subject,
            cast: [{ id: "fig_1", x: 0, z: 0, height: subject.height, pose: "de-pie" }],
            focus: "fig_1" } }, at);
        this.selectedId = id; this.render();
      };
      boton("+ Panel", "Agregar un panel al final", () => nuevoPanel(null), "primary");
      const flujo = storyboard.workflow;
      if (flujo) {
        boton("Duplicar", "Duplicar el plano elegido con imagen y notas", () => {
          const copia = LOW.animation.clone(elegido); delete copia.id;
          this.selectedId = this.doc.addStoryboardBoard(copia, boards.indexOf(elegido) + 1);
          this.render();
        }).disabled = !elegido;
        const capturar = boton("Capturar dibujo", "Usar el cuadro actual como imagen del plano", async () => {
          capturar.disabled = true;
          try { await flujo.capture(this); } catch (error) { if (this.status) this.status(error.message); }
          finally { capturar.disabled = false; }
        });
        capturar.disabled = !elegido; capturar.dataset.sb = "capture";
        const crear = boton("Crear animatic", "Crear otra escena con las imágenes y duraciones de los planos", () => {
          try { flujo.openAnimatic(this); } catch (error) { if (this.status) this.status(error.message); }
        });
        crear.disabled = !boards.length || boards.some((b) => !flujo.imageOf(b));
        crear.dataset.sb = "create";
        if (crear.disabled) crear.title = "Capturá una imagen para cada plano antes de crear el animatic";
      }
      const sbImport = storyboard.storyboarderImport;
      if (sbImport) {
        /* La puesta con monigotes 3D posables se hace en Storyboarder (Shot
           Generator) y se trae acá: no se rehace, se importa su archivo. */
        const importar = boton("Importar Storyboarder", "Traer los paneles de un proyecto .storyboarder", async () => {
          importar.disabled = true;
          try { await sbImport.importInto(this); }
          catch (error) { if (this.status) this.status(error.message); }
          finally { importar.disabled = false; }
        });
        importar.dataset.sb = "import-storyboarder";
      }
      boton("+ Antes", "Insertar un panel antes del elegido", () => {
        const at = boards.findIndex((b) => b.id === this.selectedId);
        nuevoPanel(at < 0 ? 0 : at);
      }).disabled = !elegido;
      boton("↑", "Mover el panel hacia atrás", () => {
        const at = boards.findIndex((b) => b.id === this.selectedId);
        if (at > 0) this.doc.moveStoryboardBoard(this.selectedId, at - 1);
      }).disabled = !elegido || boards[0] === elegido;
      boton("↓", "Mover el panel hacia adelante", () => {
        const at = boards.findIndex((b) => b.id === this.selectedId);
        if (at >= 0 && at < boards.length - 1) this.doc.moveStoryboardBoard(this.selectedId, at + 1);
      }).disabled = !elegido || boards[boards.length - 1] === elegido;
      boton("Quitar", "Quitar el panel elegido", () => {
        if (!this.selectedId) return;
        this.doc.removeStoryboardBoard(this.selectedId);
        this.selectedId = null; this.render();
      }).disabled = !elegido;
      boton("Escenario 3D", "Ver y armar la toma en el escenario", () => {
        if (this.onStage) this.onStage(this.selectedId);
      }).disabled = !elegido;
      /* LA ANIMATICA. Un storyboard existe para juzgar el RITMO antes de
         animar, y para eso hay que poder MIRARLO corriendo: una lista con
         duraciones escritas no dice si la toma dura de mas. Reproduce sobre el
         mismo reproductor de la escena —no uno paralelo—, que avanza por reloj
         real y arrastra el audio si lo hay. */
      const animatica = boton(this._reproduciendo() ? "■ Parar" : "▶ Animática",
        "Reproducir los paneles con su duración, para ver el ritmo",
        () => this.animatica());
      animatica.disabled = !boards.length || !this._reproductor();
      if (!this._reproductor()) animatica.title = "El reproductor de la escena todavía no está listo";
      const total = document.createElement("span");
      total.className = "sb2-total";
      const fps = Math.max(1, sc.fps || 24);
      total.textContent = `${boards.length} panel(es) · ${sc.boardDuration()} cuadros · ${(sc.boardDuration() / fps).toFixed(1)} s`;
      barra.appendChild(total);
      raiz.appendChild(barra);

      if (!boards.length) {
        const vacio = document.createElement("div");
        vacio.className = "sb2-empty";
        vacio.textContent = "1. «+ Panel» agrega un plano: escribí su acción. 2. «Capturar dibujo» toma el cuadro actual. " +
          "3. Ajustá la duración y mirá el ritmo con ▶ Animática. 4. «Crear animatic» abre otra escena para animar y exportar. " +
          "¿Armaste la puesta en Storyboarder? «Importar Storyboarder» trae sus paneles.";
        raiz.appendChild(vacio);
        this.host.appendChild(raiz);
        return;
      }

      /* EL VISOR. Mientras corre la animatica muestra el panel que toca, con
         su referencia y su texto: sin esto la reproduccion seria una fila que
         se ilumina, que no alcanza para leer una toma. */
      const enCurso = this._reproduciendo() ? sc.boardAt(this.doc.frame) : null;
      if (enCurso) {
        const visor = document.createElement("div");
        visor.className = "sb2-visor";
        if (enCurso.board.drawingRef && enCurso.board.drawingRef.png) {
          const img = document.createElement("img");
          img.src = enCurso.board.drawingRef.png;
          img.alt = "Panel " + (enCurso.index + 1);
          visor.appendChild(img);
        } else {
          const sin = document.createElement("span");
          sin.className = "sb2-visor-sin";
          sin.textContent = "Panel " + (enCurso.index + 1) + " · sin referencia dibujada";
          visor.appendChild(sin);
        }
        const pie = document.createElement("div");
        pie.className = "sb2-visor-pie";
        const tipoV = shots.SHOT_TYPES.find((x) => x.id === enCurso.board.shot.type);
        const seg = (n) => (n / fps).toFixed(1);
        pie.textContent = `${enCurso.index + 1}/${boards.length} · ` +
          `${tipoV ? tipoV.name : enCurso.board.shot.type} · ` +
          `${enCurso.board.action || enCurso.board.dialogue || "sin acción"} · ` +
          `${seg(this.doc.frame - enCurso.from + 1)}/${seg(enCurso.duration)} s`;
        visor.appendChild(pie);
        raiz.appendChild(visor);
      }

      // ── lista de paneles ──
      const lista = document.createElement("div"); lista.className = "sb2-list";
      boards.forEach((board, i) => {
        const t = tiempos[i];
        const fila = document.createElement("div");
        fila.className = "sb2-board" + (board.id === this.selectedId ? " sel" : "") +
          (enCurso && enCurso.board.id === board.id ? " enAire" : "");
        fila.tabIndex = 0;
        fila.onclick = () => { this.selectedId = board.id; this.render(); };
        fila.onkeydown = (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.selectedId = board.id; this.render(); }
        };
        const num = document.createElement("b"); num.textContent = String(i + 1);
        let miniatura;
        if (board.drawingRef && board.drawingRef.png) {
          miniatura = document.createElement("img");
          miniatura.className = "sb2-thumb"; miniatura.src = board.drawingRef.png;
          miniatura.alt = "Referencia del panel " + (i + 1);
        } else {
          miniatura = document.createElement("span");
          miniatura.className = "sb2-thumb"; miniatura.title = "Sin referencia todavía";
        }
        const cuerpo = document.createElement("div"); cuerpo.className = "sb2-board-body";
        const tipo = shots.SHOT_TYPES.find((x) => x.id === board.shot.type);
        const cab = document.createElement("span"); cab.className = "sb2-shot";
        cab.textContent = (board.name ? board.name + " · " : "") + (tipo ? tipo.name : board.shot.type) +
          (board.shot.angle && board.shot.angle !== "nivel" ? " · " + board.shot.angle : "");
        const acc = document.createElement("small");
        acc.textContent = board.action || board.dialogue || "sin acción";
        cuerpo.append(cab, acc);
        const tiempo = document.createElement("small"); tiempo.className = "sb2-time";
        tiempo.textContent = `F${t.from}–${t.to}`;
        fila.append(num, miniatura, cuerpo, tiempo);
        lista.appendChild(fila);
      });
      raiz.appendChild(lista);

      // ── generador de la toma elegida ──
      const gen = document.createElement("div"); gen.className = "sb2-gen";
      const titulo = document.createElement("div"); titulo.className = "sb2-gen-title";
      titulo.textContent = "Generador de toma";
      gen.appendChild(titulo);

      const campo = (etiqueta, control) => {
        const l = document.createElement("label"); l.className = "sb2-field";
        const s = document.createElement("span"); s.textContent = etiqueta;
        l.append(s, control); gen.appendChild(l); return control;
      };
      const nombre = document.createElement("input");
      nombre.type = "text"; nombre.value = elegido.name || ""; nombre.placeholder = "ej.: 010 · Entrada al taller";
      nombre.onchange = () => this.doc.updateStoryboardBoard(elegido.id, { name: nombre.value }, "Nombrar el plano");
      campo("Nombre", nombre);
      const tipoSel = document.createElement("select");
      shots.SHOT_TYPES.forEach((t) => {
        const o = document.createElement("option"); o.value = t.id; o.textContent = t.name;
        o.title = t.framing; tipoSel.appendChild(o);
      });
      tipoSel.value = elegido.shot.type;
      tipoSel.onchange = () => this._regenerate(elegido, { type: tipoSel.value });
      campo("Plano", tipoSel);

      const anguloSel = document.createElement("select");
      shots.ANGLES.forEach((a) => {
        const o = document.createElement("option"); o.value = a.id; o.textContent = a.name;
        anguloSel.appendChild(o);
      });
      anguloSel.value = elegido.shot.angle;
      anguloSel.onchange = () => this._regenerate(elegido, { angle: anguloSel.value });
      campo("Ángulo", anguloSel);

      const lente = document.createElement("input");
      lente.type = "number"; lente.min = "8"; lente.max = "300"; lente.step = "1";
      lente.value = String(Math.round((elegido.shot.camera && elegido.shot.camera.focalLength) || 50));
      lente.onchange = () => this._regenerate(elegido,
        { camera: { ...(elegido.shot.camera || {}), focalLength: Math.max(8, +lente.value || 50) } });
      campo("Lente (mm)", lente);

      const dur = document.createElement("input");
      dur.type = "number"; dur.min = "1"; dur.step = "1"; dur.value = String(elegido.duration);
      dur.onchange = () => this.doc.updateStoryboardBoard(elegido.id,
        { duration: Math.max(1, Math.round(+dur.value || 1)) }, "Cambiar la duración del panel");
      campo("Dura (cuadros)", dur);

      const accion = document.createElement("input");
      accion.type = "text"; accion.value = elegido.action; accion.placeholder = "qué pasa en este plano";
      accion.onchange = () => this.doc.updateStoryboardBoard(elegido.id, { action: accion.value }, "Escribir la acción");
      campo("Acción", accion);

      const dialogo = document.createElement("input");
      dialogo.type = "text"; dialogo.value = elegido.dialogue; dialogo.placeholder = "diálogo o voz en off";
      dialogo.onchange = () => this.doc.updateStoryboardBoard(elegido.id, { dialogue: dialogo.value }, "Escribir el diálogo");
      campo("Diálogo", dialogo);

      const notas = document.createElement("textarea");
      notas.rows = 2; notas.value = elegido.notes || ""; notas.placeholder = "continuidad, sonido o indicaciones para animación";
      notas.onchange = () => this.doc.updateStoryboardBoard(elegido.id, { notes: notas.value }, "Anotar el plano");
      campo("Notas", notas);

      // Lectura de la cámara: la decisión se ve en números, no hay que creerle.
      const lectura = document.createElement("div"); lectura.className = "sb2-read";
      const camara = elegido.shot.camera;
      if (camara) {
        const clasificada = shots.classify(camara, this._subject(elegido), this._aspect());
        const distancia = Math.abs(this._subject(elegido).z - camara.z);
        lectura.innerHTML =
          `<span>distancia <b>${Math.round(distancia)}</b></span>` +
          `<span>altura <b>${Math.round(camara.y)}</b></span>` +
          `<span>FOV <b>${shots.verticalFov(camara, this._aspect()).toFixed(1)}°</b></span>` +
          `<span>ocupa <b>${(clasificada.coverage * 100).toFixed(0)}%</b> del cuadro</span>`;
      } else {
        lectura.innerHTML = "<span>Elegí un plano para generar la cámara.</span>";
      }
      gen.appendChild(lectura);
      raiz.appendChild(gen);
      this.host.appendChild(raiz);
    }
  }

  storyboard.BoardView = BoardView;
})(typeof window !== "undefined" ? window : globalThis);
