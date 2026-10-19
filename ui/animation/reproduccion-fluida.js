/* ══════════════════════════════════════════════════════════════════════════
   REPRODUCCIÓN FLUIDA: cada cuadro se renderiza una vez y el play muestra
   imágenes

   Reportado: «en la visión de play se ve feo, como cortada la reproducción;
   hay que agregar algún renderizado». MEDIDO con la escena real de Mauro
   (4 capas, dibujos de hasta 75 KB, 48 trazos con filtro de grafito): pintar
   un cuadro tarda 46 ms de mediana (p90 53) y a 24 fps hay 41,7 ms. El
   reproductor va por reloj real, así que SALTEA: en 2 s mostró 31 de 48
   cuadros, uno de cada tres afuera (3, 4, 6, 8, 9…).

   Lo que hacen After Effects (RAM preview) o Harmony (render de la vista):
   cada cuadro se rasteriza UNA vez —todas las capas visibles y el rig, el
   mismo cuadro que sale en la exportación (dzExportCuadroSvg)— y mientras se
   reproduce se muestra esa imagen en un lienzo encima de la hoja, sin rearmar
   el dibujo. Mostrar una imagen ya decodificada es casi gratis.

   - La primera vuelta puede saltear: los cuadros que no están listos se
     pintan como siempre mientras se preparan los que siguen al cabezal.
   - Cualquier cambio en la escena (revision) o en el tamaño de la vista tira
     las imágenes: nunca se reproduce algo viejo.
   - Al parar desaparece y queda la hoja real, editable.
   - Memoria con tope: en escenas largas se guardan los cuadros más cerca del
     cabezal.

   Va aparte de app.js por el presupuesto, envolviendo dzCanvasSet /
   dzOnionRender / dzRigApplyLive y el Playback.

   @module animation/reproduccion-fluida
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const app = () => (typeof DZ !== "undefined") ? DZ : null;
  const TOPE_BYTES = 700 * 1024 * 1024;          // ~700 MB de imágenes como mucho

  const estado = { clave: "", cache: new Map(), preparando: false, mostrado: null, lienzo: null, activo: true };

  const hojaSvg = () => document.querySelector("#dzCanvas > svg");
  function tamano() {
    const svg = hojaSvg(); if (!svg) return null;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    return { r, w: Math.max(1, Math.round(r.width * dpr)), h: Math.max(1, Math.round(r.height * dpr)) };
  }
  /** La vista rotada no se cubre con un rectángulo: ahí se reproduce como siempre. */
  function vistaRotada() {
    const s = hojaSvg()?.getAttribute("style") || "";
    const m = s.match(/rotate\(\s*(-?[\d.]+)deg\)/);
    return !!(m && Math.abs(+m[1]) > 0.01);
  }
  /* POR LA CÁMARA (v3.36). El play mostraba la hoja entera y la exportación
     salía por la cámara: lo que se veía no era lo que salía (Mauro: «no
     entiendo cómo se maneja el movimiento de cámara»). Con claves de cámara,
     cada cuadro se renderiza por la cámara —igual que la exportación, con la
     profundidad de la multiplano— y se muestra DENTRO del marco, girado como
     él; lo de afuera se oscurece. Se apaga en el panel Cámara («Play por la
     cámara») y con «Ver por la cámara», donde la vista ya sigue a la cámara. */
  const porCamara = () => !!global.LOW?.camara2d?.playPorCamara?.();
  function claveActual(t) {
    const a = app(); const sc = a && a.doc && a.doc.scene;
    if (!sc || !t) return "";
    const capas = sc.layers.map((l) => [l.id, l.visible !== false, l.opacity, l.blend].join(":")).join(",");
    const cam = porCamara() ? JSON.stringify(sc.camera && sc.camera.keys || {}) : "hoja";
    return [sc.id, sc.revision, t.w, t.h, capas, cam].join("|");
  }
  /** El rectángulo del marco de la cámara en el cuadro f, en la pantalla. */
  function marcoEn(f) {
    const cam = global.LOW?.camara2d?.camaraEn?.(f), vb = global.dzVB?.(), a = app();
    if (!cam || !vb || typeof global.dzToScreen !== "function") return null;
    const h = cam.w * (vb[3] / vb[2]), c = global.dzToScreen(cam.cx, cam.cy);
    const e1 = global.dzToScreen(cam.cx - cam.w / 2, cam.cy), e2 = global.dzToScreen(cam.cx + cam.w / 2, cam.cy);
    const t1 = global.dzToScreen(cam.cx, cam.cy - h / 2), t2 = global.dzToScreen(cam.cx, cam.cy + h / 2);
    return { x: c.x, y: c.y, w: Math.hypot(e2.x - e1.x, e2.y - e1.y), h: Math.hypot(t2.x - t1.x, t2.y - t1.y),
      rot: (cam.rot || 0) + ((a && a.viewRot) || 0) };
  }
  function vaciar() {
    for (const b of estado.cache.values()) try { b.close && b.close(); } catch (_) { /* nada */ }
    estado.cache.clear();
  }
  function lienzo() {
    if (estado.lienzo && estado.lienzo.isConnected) return estado.lienzo;
    const host = document.querySelector("#dzCanvas"); if (!host) return null;
    const c = document.createElement("canvas");
    c.id = "dzReproFluida"; c.hidden = true;
    c.setAttribute("aria-hidden", "true");
    c.style.cssText = "position:absolute;pointer-events:none;z-index:4;left:0;top:0;";
    host.appendChild(c);
    estado.lienzo = c;
    return c;
  }
  /** El color de la hoja: el del papel del documento, o el fondo del svg, o blanco. */
  function fondoDeHoja() {
    const svg = hojaSvg();
    const papel = svg && svg.querySelector("rect[data-low-page]");
    const f = papel && papel.getAttribute("fill");
    if (f && f !== "none" && !/^transparent$/i.test(f)) return f;
    const bg = svg && getComputedStyle(svg).backgroundColor;
    return bg && !/rgba\([^)]*,\s*0\)|transparent/i.test(bg) ? bg : "#ffffff";
  }
  function ocultar() {
    if (estado.lienzo) { estado.lienzo.hidden = true; estado.lienzo.classList.remove("por-camara"); estado.lienzo.style.transform = ""; }
    estado.mostrado = null;
  }

  /** Muestra el cuadro f si está listo. Devuelve si lo mostró. */
  function mostrar(f) {
    const bmp = estado.cache.get(f); if (!bmp) return false;
    const t = tamano(); const c = lienzo(); if (!t || !c) return false;
    const host = c.parentElement.getBoundingClientRect();
    const m = bmp.__porCamara ? marcoEn(f) : null;
    if (m) {
      // la toma, adentro del marco (dzToScreen ya da coordenadas del lienzo)
      c.style.left = (m.x - m.w / 2) + "px"; c.style.top = (m.y - m.h / 2) + "px";
      c.style.width = m.w + "px"; c.style.height = m.h + "px";
      c.style.transform = `rotate(${m.rot}deg)`; c.classList.add("por-camara");
      global.dzCamOverlay?.();      // el marco naranja acompaña a la toma (el play fluido no rearma la hoja y lo dejaba quieto)
    } else {
      c.style.left = (t.r.left - host.left) + "px"; c.style.top = (t.r.top - host.top) + "px";
      c.style.width = t.r.width + "px"; c.style.height = t.r.height + "px";
      c.style.transform = ""; c.classList.remove("por-camara");
    }
    if (c.width !== t.w) c.width = t.w;
    if (c.height !== t.h) c.height = t.h;
    const g = c.getContext("2d");
    // BORRAR y poner la hoja ANTES de cada imagen. En v3.29.1 sólo se pintaba
    // encima: con los dibujos de una escena real —el papel está en el dibujo 1 y
    // los que se crean después son transparentes— la reproducción ACUMULABA todos
    // los cuadros, y por los huecos se veía la hoja vieja de abajo.
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = fondoDeHoja();
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(bmp, 0, 0, c.width, c.height);
    c.hidden = false; estado.mostrado = f;
    return true;
  }

  async function rasterizar(f, t) {
    if (typeof global.dzExportCuadroSvg !== "function") return null;
    const conCamara = porCamara();
    const txt = global.dzExportCuadroSvg(f, conCamara);
    const url = URL.createObjectURL(new Blob([txt], { type: "image/svg+xml" }));
    try {
      const img = new Image(); img.src = url; await img.decode();
      const bmp = await createImageBitmap(img, { resizeWidth: t.w, resizeHeight: t.h, resizeQuality: "high" });
      bmp.__porCamara = conCamara;
      return bmp;
    } catch (_) { return null; } finally { URL.revokeObjectURL(url); }
  }

  /** Prepara los cuadros del tramo, empezando por los que vienen después del
   *  cabezal. Cede entre cuadro y cuadro para no frenar la reproducción. */
  async function preparar() {
    const a = app(); if (!a || !a.doc || estado.preparando) return;
    const t = tamano(); if (!t || vistaRotada()) return;
    const clave = claveActual(t);
    if (clave !== estado.clave) { vaciar(); estado.clave = clave; }
    const { in: ini, out } = a.doc.scene.playRange();
    const porCuadro = t.w * t.h * 4, cabe = Math.max(8, Math.floor(TOPE_BYTES / porCuadro));
    const desde = Math.min(Math.max(a.doc.frame, ini), out);
    const orden = [];
    for (let f = desde; f <= out; f++) orden.push(f);
    for (let f = ini; f < desde; f++) orden.push(f);
    const faltan = orden.slice(0, cabe).filter((f) => !estado.cache.has(f));
    if (!faltan.length) return;
    estado.preparando = true;
    try {
      let hechos = 0;
      for (const f of faltan) {
        if (estado.clave !== claveActual(tamano())) break;            // cambió algo: lo que viene sería viejo
        const bmp = await rasterizar(f, t);
        if (!bmp || estado.clave !== claveActual(tamano())) { if (bmp && bmp.close) bmp.close(); break; }
        estado.cache.set(f, bmp); hechos++;
        // tope de memoria: afuera el más viejo que no sea de los próximos
        while (estado.cache.size > cabe) {
          const viejo = estado.cache.keys().next().value; const b = estado.cache.get(viejo);
          estado.cache.delete(viejo); try { b.close && b.close(); } catch (_) { /* nada */ }
        }
        if (typeof global.dzSetStatus === "function" && (hechos % 6 === 0 || hechos === faltan.length))
          global.dzSetStatus(hechos === faltan.length ? "Reproducción fluida lista: " + estado.cache.size + " cuadros renderizados"
            : "Preparando la reproducción fluida… " + hechos + "/" + faltan.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    } finally { estado.preparando = false; }
  }

  const reproduciendo = () => { const a = app(); return !!(a && a.playback && a.playback.playing); };
  /** ¿Este cuadro se muestra como imagen? (sólo reproduciendo y si está listo y vigente) */
  function usarImagen() {
    const a = app();
    if (!estado.activo || !reproduciendo() || !a || !a.doc || vistaRotada()) return false;
    if (estado.clave !== claveActual(tamano())) { vaciar(); estado.clave = claveActual(tamano()); preparar(); return false; }
    return mostrar(a.doc.frame);
  }

  function envolver(nombre, fabrica) {
    const original = global[nombre];
    if (typeof original !== "function" || original.__fluida) return false;
    const w = fabrica(original); w.__fluida = true; global[nombre] = w; return true;
  }
  function enganchar() {
    envolver("dzCanvasSet", (orig) => function () {
      if (usarImagen()) return true;                 // la hoja no se rearma: se ve la imagen
      ocultar();
      return orig.apply(this, arguments);
    });
    envolver("dzOnionRender", (orig) => function () {
      if (estado.mostrado != null && reproduciendo()) return;
      return orig.apply(this, arguments);
    });
    envolver("dzRigApplyLive", (orig) => function () {
      if (estado.mostrado != null && reproduciendo()) return;
      return orig.apply(this, arguments);
    });
    // La lista de elementos del panel se rearmaba DOS veces por cuadro
    // (dzCanvasSet la pide directo y otra vez por dzDeselect): MEDIDO, 27 ms
    // de los 42 que tiene un cuadro a 24 fps con una escena de ~1000 trazos.
    // Reproduciendo nadie la mira: se rearma una sola vez al parar.
    envolver("dzBuildLayers", (orig) => function () {
      if (reproduciendo()) { estado.listaPendiente = true; return; }
      estado.listaPendiente = false;
      return orig.apply(this, arguments);
    });
    const P = animation.Playback && animation.Playback.prototype;
    if (P && !P.play.__fluida) {
      const play = P.play, stop = P.stop;
      P.play = function () { const r = play.apply(this, arguments); if (this.playing) preparar(); return r; };
      P.play.__fluida = true;
      P.stop = function () {
        const estaba = this.playing, r = stop.apply(this, arguments);
        // al parar: fuera la imagen y la hoja REAL del cuadro donde quedó
        if (estaba && estado.mostrado != null) { ocultar(); if (this.doc) this.doc.emit("frame"); }
        if (estaba && estado.listaPendiente && typeof global.dzBuildLayers === "function") global.dzBuildLayers();
        return r;
      };
      P.stop.__fluida = true;
    }
  }

  animation.reproduccionFluida = { preparar, mostrar, ocultar, vaciar, estado,
    set activa(v) { estado.activo = !!v; if (!v) { ocultar(); vaciar(); } }, get activa() { return estado.activo; } };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(window);
