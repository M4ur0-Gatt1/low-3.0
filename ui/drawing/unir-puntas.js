/* ══════════════════════════════════════════════════════════════════════════
   UNIR PUNTAS: dos líneas que se tocan en la punta pasan a ser una

   Pedido de Mauro (oct-2026): «quiero que se pueda configurar el pincel de tal
   manera que al tocar dos puntas, dos extremos de línea, las líneas se
   unifiquen; es algo que se puede activar o desactivar en la herramienta».

   Con «Unir puntas» prendido (barra del Lápiz y del Pincel, y el panel del
   clic derecho del lápiz), al SOLTAR un trazo:
   - si su comienzo cae sobre la punta de otra línea, la continúa;
   - si su final cae sobre la punta de otra, se pega a ella;
   - si hace las dos cosas, las tres quedan en una sola línea.
   Sólo entre líneas del MISMO tipo (lápiz con lápiz, pincel con pincel), del
   mismo color y, en el pincel, del mismo pincel, y en la misma capa: unir una
   tinta con un lápiz rojo cambiaría cómo se ve lo que ya estaba. La línea que
   ya estaba pone el estilo. Es un solo paso de Ctrl+Z junto con el trazo.

   «Toca» = la punta del trazo nuevo a menos de 8 píxeles de pantalla de la
   otra punta, o a menos de 0,6 grosores si la línea es gruesa.

   Para unir hacen falta los PUNTOS de cada línea: el pincel ya los guardaba
   (data-low-brush-points); el lápiz desde ahora guarda los suyos
   (data-low-pencil-points), redondeados a la centésima.

   Gancho: _drawFinish (app.js) llama a window.dzUnirPuntas(el, modo, puntos).

   @module drawing/unir-puntas
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const CLAVE = "low.unirPuntas";
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const almacen = () => { try { return typeof dzPrefsStorage === "function" ? dzPrefsStorage() : global.localStorage; } catch (_) { return null; } };
  const r2 = (v) => Math.round(v * 100) / 100;

  function activo() { return !!D()?.unirPuntas; }
  function poner(on) {
    const dz = D(); if (!dz) return;
    dz.unirPuntas = !!on;
    try { almacen()?.setItem(CLAVE, on ? "1" : "0"); } catch (_) { /* sin almacenamiento */ }
    for (const b of doc.querySelectorAll("[data-unir-puntas]")) { b.classList.toggle("on", !!on); b.setAttribute("aria-pressed", String(!!on)); }
    global.dzSetStatus?.(on ? "Unir puntas: un trazo que empieza o termina en la punta de otra línea la continúa"
      : "Unir puntas apagado: cada trazo queda como una línea aparte");
  }

  /** Los puntos de una línea en el espacio de su capa (aplica su transform:
   *  una línea movida con la Flecha guarda los puntos de antes de moverla). */
  function datosDe(el) {
    if (!el || !el.getAttribute || el.closest?.("[data-locked]")) return null;
    let tipo, pts, estilo;
    try {
      if (el.hasAttribute("data-low-brush-points")) {
        const config = JSON.parse(el.getAttribute("data-low-brush-config") || "null");
        if (!config || config.eraser) return null;
        tipo = "brush"; pts = JSON.parse(el.getAttribute("data-low-brush-points"));
        estilo = { color: String(el.getAttribute("data-low-brush-color") || "").toLowerCase(), pincel: config.id || "",
          config, ancho: +el.getAttribute("data-low-brush-size") || 6, fijo: el.getAttribute("data-low-brush-fixed") === "1" };
      } else if (el.hasAttribute("data-low-pencil-points")) {
        tipo = "pencil"; pts = JSON.parse(el.getAttribute("data-low-pencil-points"));
        estilo = { color: String(el.getAttribute("stroke") || "").toLowerCase(), pincel: "",
          ancho: +el.getAttribute("stroke-width") || 1 };
      } else return null;
    } catch (_) { return null; }
    if (!Array.isArray(pts) || pts.length < 2) return null;
    const m = el.transform?.baseVal?.consolidate?.()?.matrix;
    if (m && !(m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0)) {
      pts = pts.map((p) => { const q = p.slice(); q[0] = m.a * p[0] + m.c * p[1] + m.e; q[1] = m.b * p[0] + m.d * p[1] + m.f; return q; });
    }
    return { el, tipo, pts, estilo, opacidad: el.getAttribute("opacity") || "" };
  }
  const compatibles = (a, b) => a.tipo === b.tipo && a.estilo.color === b.estilo.color && a.estilo.pincel === b.estilo.pincel
    && a.opacidad === b.opacidad && (a.tipo === "brush" || Math.abs(a.estilo.ancho - b.estilo.ancho) <= Math.max(.5, a.estilo.ancho * .1));
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  /** La punta más cercana a `p` entre las líneas compatibles: { d, cand, cual: "ini"|"fin" } */
  function puntaCercana(p, cands, tol, salvo) {
    let mejor = null;
    for (const c of cands) {
      if (c === salvo) continue;
      for (const cual of ["ini", "fin"]) {
        const d = dist(p, cual === "ini" ? c.pts[0] : c.pts[c.pts.length - 1]);
        if (d <= tol && (!mejor || d < mejor.d)) mejor = { d, cand: c, cual };
      }
    }
    return mejor;
  }

  /** La línea nueva, unida a las que toca. Devuelve el elemento que quedó, o
   *  null si no se unió nada. */
  function unir(el, modo, puntos) {
    if (!el || !el.parentNode) return null;
    if (modo === "pencil" && Array.isArray(puntos) && puntos.length >= 2 && el.tagName.toLowerCase() === "path") {
      el.setAttribute("data-low-pencil-points", JSON.stringify(puntos.map((p) => [r2(p[0]), r2(p[1])])));
    }
    if (!activo()) return null;
    const nuevo = datosDe(el);
    if (!nuevo) return null;
    const svg = el.ownerSVGElement || doc.querySelector("#dzCanvas > svg");
    const escala = Math.abs(svg?.getScreenCTM?.()?.a || 1) || 1;
    const tol = Math.max(8 / escala, nuevo.estilo.ancho * .6);
    const cands = [...el.parentNode.children].filter((x) => x !== el).map(datosDe).filter((c) => c && compatibles(c, nuevo));
    if (!cands.length) return null;
    const ini = nuevo.pts[0], fin = nuevo.pts[nuevo.pts.length - 1];
    const A = puntaCercana(ini, cands, tol, null);
    // la misma línea en las dos puntas (cerrar un lazo): vale; si no, otra
    const B = puntaCercana(fin, cands, tol, null);
    if (!A && !B) return null;
    const rev = (a) => a.slice().reverse();
    let pts = nuevo.pts.slice();
    if (A) pts = (A.cual === "fin" ? A.cand.pts : rev(A.cand.pts)).concat(pts.slice(1));
    if (B && !(A && B.cand === A.cand)) pts = pts.slice(0, -1).concat(B.cual === "ini" ? B.cand.pts : rev(B.cand.pts));
    else if (B && A && B.cand === A.cand) pts.push(pts[0].slice());   // lazo: cierra exacto
    const queda = (A || B).cand, sobran = [nuevo.el, ...(A && B && B.cand !== A.cand ? [B.cand.el] : [])].filter((x) => x !== queda.el);
    let final;
    if (queda.tipo === "pencil") {
      final = queda.el;
      final.removeAttribute("transform");
      final.setAttribute("d", global.dzSmoothPath ? global.dzSmoothPath(pts) : global.LOW.drawing.caminoSuave(pts));
      final.setAttribute("data-low-pencil-points", JSON.stringify(pts.map((p) => [r2(p[0]), r2(p[1])])));
    } else {
      const e = queda.estilo;
      final = global.dzBrushRenderElement?.(pts, queda.el.getAttribute("data-low-brush-color") || e.color, { brush: e.config, size: e.ancho, fixedWidth: e.fijo });
      if (!final) return null;
      final.setAttribute("data-low-brush-points", JSON.stringify(pts));
      final.setAttribute("data-low-brush-config", JSON.stringify(e.config));
      final.setAttribute("data-low-brush-size", String(e.ancho));
      final.setAttribute("data-low-brush-color", queda.el.getAttribute("data-low-brush-color") || e.color);
      final.setAttribute("data-low-brush-fixed", e.fijo ? "1" : "0");
      for (const a of ["opacity", "id", "data-name", "data-low-art"]) { const v = queda.el.getAttribute(a); if (v != null) final.setAttribute(a, v); }
      if (queda.el.style.mixBlendMode && !final.style.mixBlendMode) final.style.mixBlendMode = queda.el.style.mixBlendMode;
      global.dzStyleTagInkAsFill?.(final);
      queda.el.replaceWith(final);
    }
    for (const x of sobran) x.remove();
    global.dzSetStatus?.(A && B && B.cand !== A.cand ? "Unir puntas: el trazo juntó dos líneas en una" : "Unir puntas: el trazo continuó la línea");
    return final;
  }

  /** «Unir puntas» en la barra del Lápiz y del Pincel. */
  function opciones() {
    const box = doc.querySelector("#dzToolOpts"), dz = D();
    if (!box || !dz || !["pencil", "brush"].includes(dz.tool) || box.querySelector("[data-unir-puntas]")) return;
    const b = doc.createElement("button");
    b.type = "button"; b.className = "ghost dz-unir-puntas" + (activo() ? " on" : "");
    b.setAttribute("data-unir-puntas", ""); b.setAttribute("aria-pressed", String(activo()));
    b.title = "Unir puntas: un trazo que empieza o termina en la punta de otra línea (mismo color y pincel) se une con ella en una sola línea";
    b.textContent = "Unir puntas";
    b.onclick = () => poner(!activo());
    box.appendChild(b);
  }

  function enganchar() {
    const dz = D();
    if (dz) { try { dz.unirPuntas = almacen()?.getItem(CLAVE) === "1"; } catch (_) { dz.unirPuntas = false; } }
    const orig = global.dzToolOptsRender;
    if (typeof orig === "function" && !orig.__unirPuntas) {
      const f = function () { const r = orig.apply(this, arguments); try { opciones(); } catch (err) { console.warn("[unir puntas]", err); } return r; };
      Object.assign(f, orig); f.__unirPuntas = true;
      global.dzToolOptsRender = f;
    }
  }

  global.dzUnirPuntas = unir;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.unirPuntas = { activo, poner, unir, datosDe };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
