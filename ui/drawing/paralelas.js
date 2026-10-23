/* ══════════════════════════════════════════════════════════════════════════
   PARALELAS: el lápiz y el pincel dibujan DOS líneas a la vez

   Pedido de Mauro (oct-2026): «una herramienta de dibujo de paralelas con el
   pincel: si quiero hacer ambos lados de un brazo establezco una distancia,
   por ejemplo de 6 mm, y dibujo el brazo: las dos líneas al mismo tiempo…
   empecemos con sólo dos paralelas; debe ser algo desmarcable, como el dibujo
   de simetría».

   Cómo es:
   - Se prende y se apaga como el espejo: el botón ‖ junto al espejo o Shift+M.
     Prendida, una insignia sobre la hoja lo avisa, deja cambiar la separación
     y la apaga (✕).
   - Lo que se dibuja es el EJE (el centro del brazo): las dos líneas salen a
     la mitad de la separación de cada lado. Se ven mientras se dibuja, con el
     pincel de verdad.
   - La separación es en milímetros del dibujo (1 mm = 3,78 px, la cuenta de
     Illustrator y de SVG): la misma a cualquier zoom.
   - Al soltar quedan dos trazos comunes (se editan, se borran, se pintan como
     cualquiera); un solo paso de Ctrl+Z. Con el espejo prendido, se espejan
     las dos.
   - En el lado de adentro de una curva cerrada, la línea desplazada haría un
     rulo (retrocede): esos puntos se sacan.

   Se engancha a los pasos del trazo de app.js (_drawBeginTrack, _drawAddPoint,
   _drawFinish, _drawCancel): app.js está en el techo de su presupuesto.

   @module drawing/paralelas
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const NS = "http://www.w3.org/2000/svg";
  const D = () => (typeof DZ !== "undefined" ? DZ : null);   // DZ es una variable global de app.js, no una propiedad de window
  const almacen = () => { try { return typeof dzPrefsStorage === "function" ? dzPrefsStorage() : global.localStorage; } catch (_) { return null; } };
  const CLAVE_MM = "low.paralelas.mm";
  const PX_POR_MM = 96 / 25.4;
  const MM = [0.5, 100];

  /* ── el estado ── */
  function activo() { return !!D()?.paralelas; }
  function milimetros() {
    const d = D(), v = d && Number(d.paralelasMm);
    return Number.isFinite(v) && v > 0 ? v : 6;
  }
  function refrescar() {
    const on = activo();
    for (const b of doc.querySelectorAll("#dzParalelas")) { b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); }
    insignia();
  }

  /* ── LA INSIGNIA sobre la hoja: se ve sólo con las paralelas prendidas ──
     Primero iba en la barra del Lápiz y del Pincel, pero la barra ya estaba
     llena (medido a media pantalla, 1000 px: 557 px de contenido en 558): lo
     agregado sacaba de la vista el suavizado. Acá, además, avisa que el modo
     está prendido (como la línea del eje avisa el espejo), deja cambiar la
     separación al lado del dibujo y se apaga con la ✕. Va fuera de #dzCanvas:
     tocarla no dibuja. */
  let caja = null, vigia = null;
  function insignia() {
    const lienzo = doc.querySelector("#dzCanvas"), on = activo() && !!lienzo && !!lienzo.querySelector(":scope > svg");
    if (!on) { if (caja) caja.hidden = true; return; }
    if (!caja) {
      if (!doc.querySelector("#dzParalelasEstilo")) {
        const st = doc.createElement("style"); st.id = "dzParalelasEstilo";
        st.textContent = `.dz-paralelas-insignia{position:fixed;z-index:66;display:flex;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:999px;
          background:rgba(28,28,30,.9);color:#f4f1ec;font-family:inherit;font-size:12px;line-height:1.2;box-shadow:0 2px 10px rgba(0,0,0,.25);user-select:none}
          .dz-paralelas-insignia[hidden]{display:none!important}
          .dz-paralelas-insignia b{font-weight:600;letter-spacing:.01em}
          .dz-paralelas-insignia input{width:52px;padding:2px 4px;border-radius:6px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:inherit;font:inherit;text-align:right}
          .dz-paralelas-insignia button{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:2px 6px;border-radius:999px;opacity:.75}
          .dz-paralelas-insignia button:hover{opacity:1;background:rgba(255,255,255,.12)}`;
        doc.head.appendChild(st);
      }
      caja = doc.createElement("div");
      caja.className = "dz-paralelas-insignia"; caja.id = "dzParalelasInsignia";
      caja.title = "La distancia entre las dos líneas, en milímetros del dibujo (la misma a cualquier zoom)";
      caja.innerHTML = `<b>‖ Paralelas</b><input type="number" min="${MM[0]}" max="${MM[1]}" step="0.5" data-paralelas-mm aria-label="Separación de las paralelas en milímetros"><span>mm</span>`
        + `<button type="button" data-paralelas-cerrar aria-label="Apagar las paralelas (Shift+M)" title="Apagar las paralelas (Shift+M)">✕</button>`;
      for (const tipo of ["pointerdown", "mousedown", "click", "dblclick", "wheel"]) caja.addEventListener(tipo, (e) => e.stopPropagation());
      const inp = caja.querySelector("input");
      inp.addEventListener("change", () => separacion(inp.value));
      inp.addEventListener("input", () => { const v = Number(inp.value); if (v >= MM[0] && v <= MM[1]) separacion(v); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { inp.blur(); e.preventDefault(); } });
      caja.querySelector("[data-paralelas-cerrar]").addEventListener("click", () => poner(false));
      doc.body.appendChild(caja);
      global.addEventListener("resize", ubicar);
      if (global.ResizeObserver) { vigia = new ResizeObserver(ubicar); vigia.observe(lienzo); }
    }
    caja.hidden = false;
    const inp = caja.querySelector("input");
    if (doc.activeElement !== inp) inp.value = String(milimetros());
    ubicar();
  }
  /** Arriba a la izquierda de la mesa, debajo de la regla. */
  function ubicar() {
    if (!caja || caja.hidden) return;
    const r = doc.querySelector("#dzCanvas")?.getBoundingClientRect();
    if (!r || !r.width) { caja.style.visibility = "hidden"; return; }
    caja.style.visibility = "";
    caja.style.left = Math.round(r.left + 28) + "px";
    caja.style.top = Math.round(r.top + 28) + "px";
  }
  function poner(on) {
    const d = D(); if (!d) return;
    d.paralelas = !!on;
    refrescar();
    global.dzSetStatus?.(on ? `‖ Paralelas: cada trazo deja dos líneas a ${fmt(milimetros())} mm (lo que dibujás es el centro)` : "‖ Paralelas apagadas: cada trazo deja una línea");
  }
  function alternar() { poner(!activo()); return activo(); }
  function separacion(mm) {
    const d = D(); if (!d) return;
    const v = Math.max(MM[0], Math.min(MM[1], Number(mm)));
    if (!Number.isFinite(v)) return;
    d.paralelasMm = Math.round(v * 10) / 10;
    try { almacen()?.setItem(CLAVE_MM, String(d.paralelasMm)); } catch (_) { /* sin almacenamiento */ }
    refrescar();
  }
  const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");

  /* ── la geometría: el eje → dos líneas desplazadas ── */
  /** Las dos líneas a ±media separación del eje. Cada punto sale por la normal
   *  del eje medida en una ventana de largo (no punto a punto: con el temblor
   *  de la mano las normales bailaban y las paralelas salían en zigzag). */
  function desplazar(pts, sep) {
    const n = pts.length;
    if (n < 2) return null;
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s[n - 1] < 1e-6) return null;
    const h = sep / 2, ventana = Math.max(1.5, Math.min(sep * 0.6, s[n - 1] / 4));
    const A = [], B = [], T = [];
    let j0 = 0, j1 = 0;
    for (let i = 0; i < n; i++) {
      while (j0 < i && s[i] - s[j0] > ventana) j0++;
      if (j1 < i) j1 = i;
      while (j1 < n - 1 && s[j1] - s[i] < ventana) j1++;
      let tx = pts[j1][0] - pts[j0][0], ty = pts[j1][1] - pts[j0][1], l = Math.hypot(tx, ty);
      if (l < 1e-9) { tx = (T[i - 1] || [1, 0])[0]; ty = (T[i - 1] || [1, 0])[1]; l = 1; }
      tx /= l; ty /= l; T.push([tx, ty]);
      const p = pts[i], resto = p.slice(2);
      A.push([p[0] - ty * h, p[1] + tx * h, ...resto]);
      B.push([p[0] + ty * h, p[1] - tx * h, ...resto]);
    }
    // sin rulos: en el lado de adentro de una curva cerrada el desplazado retrocede
    const limpiar = (L) => {
      const out = [L[0]];
      for (let i = 1; i < L.length; i++) {
        const q = out[out.length - 1], dx = L[i][0] - q[0], dy = L[i][1] - q[1];
        if (dx * T[i][0] + dy * T[i][1] <= 0 && i < L.length - 1) continue;
        out.push(L[i]);
      }
      return out.length >= 2 ? out : L;
    };
    return [limpiar(A), limpiar(B)];
  }
  const sepEnDibujo = () => milimetros() * PX_POR_MM;

  /* ── el trazo: el eje no se ve; las dos líneas, sí ── */
  function lado(track) {
    const el = track.el.cloneNode(false);
    el.removeAttribute("visibility");
    if (track.mode !== "pencil") {
      // sin vista en vivo del pincel: una línea simple del grosor del pincel
      el.setAttribute("stroke-width", String(D()?.drawW || 6));
    }
    track.el.parentNode.insertBefore(el, track.el);
    return { pts: [], mode: track.mode, el, pid: track.pid, devType: track.devType, _paralela: true };
  }
  function pintarLados(track) {
    const p = track._paralelas; if (!p) return;
    p.cuadro = 0;
    const L = desplazar(track.pts, sepEnDibujo());
    if (!L) return;
    p.lados.forEach((t, k) => {
      t.pts = L[k];
      if (t.mode === "pencil") { if (t.pts.length >= 2) t.el.setAttribute("d", global.dzSmoothPath(t.pts)); return; }
      const vivo = global.dzPincelVivo && t.pts.length >= 2 && vivoOriginal && vivoOriginal(t);
      if (!vivo && t.pts.length >= 2) {
        if (t.el.tagName.toLowerCase() !== "path") {
          const pth = doc.createElementNS(NS, "path");
          for (const a of ["stroke", "stroke-width", "stroke-linecap", "opacity"]) if (t.el.hasAttribute(a)) pth.setAttribute(a, t.el.getAttribute(a));
          pth.setAttribute("fill", "none"); pth.setAttribute("stroke-linejoin", "round");
          t.el.replaceWith(pth); t.el = pth;
        }
        t.el.setAttribute("d", global.dzSmoothPath(t.pts));
      }
    });
  }

  let vivoOriginal = null;
  function enganchar() {
    const d = D();
    if (d) { try { const v = Number(almacen()?.getItem(CLAVE_MM)); if (v > 0) d.paralelasMm = v; } catch (_) { /* sin almacenamiento */ } }
    // la vista en vivo del pincel: el eje no se pinta (sus lados sí)
    const vo = global.dzPincelVivo;
    if (typeof vo === "function" && !vo.__paralelas) {
      vivoOriginal = vo;
      const f = function (track) { if (track && track._paralelas) return true; return vo.apply(this, arguments); };
      f.__paralelas = true; global.dzPincelVivo = f;
    }
    const empezar = global._drawBeginTrack;
    if (typeof empezar === "function" && !empezar.__paralelas) {
      const f = function (e, svg) {
        const track = empezar.apply(this, arguments);
        try {
          if (track && activo() && (track.mode === "pencil" || track.mode === "brush") && track.el?.parentNode) {
            track.el.setAttribute("visibility", "hidden");
            track._paralelas = { lados: [lado(track), lado(track)], cuadro: 0 };
          }
        } catch (err) { console.warn("[paralelas]", err); }
        return track;
      };
      f.__paralelas = true; global._drawBeginTrack = f;
    }
    const agregar = global._drawAddPoint;
    if (typeof agregar === "function" && !agregar.__paralelas) {
      const f = function (track) {
        const r = agregar.apply(this, arguments);
        const p = track && track._paralelas;
        // un repintado por cuadro de pantalla, no uno por muestra
        if (p && !p.cuadro) p.cuadro = requestAnimationFrame(() => pintarLados(track));
        return r;
      };
      f.__paralelas = true; global._drawAddPoint = f;
    }
    const cancelar = global._drawCancel;
    if (typeof cancelar === "function" && !cancelar.__paralelas) {
      const f = function () {
        const t = typeof DRAW_TRACK !== "undefined" ? DRAW_TRACK : null;
        if (t && t._paralelas) quitarLados(t);
        return cancelar.apply(this, arguments);
      };
      f.__paralelas = true; global._drawCancel = f;
    }
    const terminar = global._drawFinish;
    if (typeof terminar === "function" && !terminar.__paralelas) {
      const f = function () {
        const t = typeof DRAW_TRACK !== "undefined" ? DRAW_TRACK : null;
        if (!t || !t._paralelas) return terminar.apply(this, arguments);
        try { terminarParalelas(t); } catch (err) { console.warn("[paralelas]", err); quitarLados(t); t.el?.remove(); }
      };
      f.__paralelas = true; global._drawFinish = f;
    }
    // el botón junto al espejo
    const b = doc.querySelector("#dzParalelas");
    if (b && !b.__paralelas) { b.__paralelas = true; b.addEventListener("click", () => alternar()); }
    // la insignia sigue a la mesa (abrir o cerrar un documento la cambia)
    const orig = global.dzBuildLayers;
    if (typeof orig === "function" && !orig.__paralelas) {
      const f2 = function () { const r = orig.apply(this, arguments); if (activo()) insignia(); return r; };
      Object.assign(f2, orig); f2.__paralelas = true;
      global.dzBuildLayers = f2;
    }
    refrescar();
  }
  function quitarLados(t) {
    const p = t._paralelas; if (!p) return;
    if (p.cuadro) cancelAnimationFrame(p.cuadro);
    for (const l of p.lados) { global.dzPincelVivoFin?.(l); l.el?.remove(); }
    t._paralelas = null;
  }

  /** Al soltar: las dos líneas finales, como las haría el trazo de siempre. */
  function terminarParalelas(t) {
    DRAW_TRACK = null;   // eslint-disable-line no-global-assign -- el track de app.js
    global.dzPincelVivoFin?.(t);
    if (typeof DZPointerController !== "undefined" && DZPointerController && t.gestureToken != null && !DZPointerController.finish(t.gestureToken, t.pid)) {
      quitarLados(t); t.el?.remove(); global._hideGuideLine?.(); return;
    }
    if (t.pts.length < 2) { quitarLados(t); t.el?.remove(); return; }
    const L = desplazar(global.dzRefineStroke(t.pts), sepEnDibujo());
    quitarLados(t);
    if (!L) { t.el?.remove(); return; }
    const d = D(), color = d.drawColor || "#F0450E", hechos = [];
    for (const pts of L) {
      if (pts.length < 2) continue;
      let el;
      if (t.mode === "pencil") {
        el = t.el.cloneNode(false); el.removeAttribute("visibility");
        el.setAttribute("d", global.dzSmoothPath(pts));
      } else {
        el = global.dzBrushFinalElement(pts, color);
        if (!el) continue;
        if (t.el.hasAttribute("opacity")) el.setAttribute("opacity", t.el.getAttribute("opacity"));
        global.dzStyleTagInkAsFill?.(el);   // cinta RELLENA, pero color de LÍNEA
      }
      t.el.parentNode.insertBefore(el, t.el);
      hechos.push([el, pts]);
    }
    t.el.remove();
    // unir puntas: cada línea puede continuar otras, pero NO a su paralela (de lejos,
    // las dos puntas quedan a menos de 8 px de pantalla y se soldaban entre sí):
    // mientras se une una, la otra queda trabada (unir-puntas saltea [data-locked])
    for (const [el] of hechos) global.dzMirrorClone?.(el);
    const unidas = [];
    hechos.forEach(([el, pts], k) => {
      if (!el.isConnected) return;
      const trabar = [...unidas, ...hechos.slice(k + 1).map((h) => h[0])].filter((x) => x && x.isConnected && !x.hasAttribute("data-locked"));
      for (const x of trabar) x.setAttribute("data-locked", "paralela");
      let r = null;
      try { r = global.dzUnirPuntas?.(el, t.mode, pts) || null; } finally { for (const x of trabar) x.removeAttribute("data-locked"); }
      unidas.push(r && r.isConnected ? r : el);
    });
    global._hideGuideLine?.();
    global.dzMarkDirty?.(); global.dzBuildLayers?.();
  }

  global.dzParalelasToggle = alternar;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.paralelas = { activo, poner, alternar, separacion, milimetros, desplazar, PX_POR_MM };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
