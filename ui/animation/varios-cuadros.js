/* ══════════════════════════════════════════════════════════════════════════
   EDITAR VARIOS CUADROS A LA VEZ, Y CUADROS DE BARRIDO (SMEAR)

   Pedido de Mauro (nov-2026): lo que Blender trae para 2D.

   1. MOVER VARIOS CUADROS (el «multiframe editing» de Grease Pencil, con su
      curva de atenuación). Animación → «Mover varios cuadros…»: corre, gira
      o escala el dibujo de la capa en un TRAMO de cuadros a la vez —corregir
      la proporción de la cabeza en 40 cuadros, bajar todo un personaje que
      quedó alto—. Con ATENUACIÓN, el cuadro actual se mueve entero y los de
      las puntas cada vez menos (lineal o suave), como en Blender. Cada dibujo
      del tramo se mueve una sola vez aunque esté expuesto en varios cuadros.

   2. CUADRO DE BARRIDO (smear frames). Animación → «Cuadro de barrido…»: en
      el cuadro actual, deja detrás del dibujo varias copias cada vez más
      transparentes, en la dirección en que vino desde la clave anterior —los
      «múltiplos» del dibujo animado clásico para un movimiento muy rápido—.
      La dirección se mide sola (el centro del dibujo anterior al actual) y se
      puede corregir.

   Las dos tocan los dibujos de verdad (no son modificadores): son UN paso de
   Ctrl+Z cada una. Lo que no es DOM (pesos, matrices) se prueba sin la app.

   @module animation/varios-cuadros
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  /* ── lo puro ────────────────────────────────────────────────────────────── */
  /** Cuánto se mueve el cuadro `f` (0 a 1) con el cuadro actual `centro` y la
   *  atenuación elegida, dentro de [desde, hasta]. */
  function peso(f, centro, desde, hasta, curva) {
    if (f < desde || f > hasta) return 0;
    if (curva !== "lineal" && curva !== "suave") return 1;
    const radio = Math.max(centro - desde, hasta - centro) + 1;
    const t = Math.max(0, 1 - Math.abs(f - centro) / radio);
    return curva === "suave" ? t * t * (3 - 2 * t) : t;
  }
  /** Matriz [a,b,c,d,e,f] de mover (dx, dy), girar (grados) y escalar
   *  alrededor de (cx, cy), escalada por el peso (peso 0 = no se mueve). */
  function matriz(op, w) {
    const r = ((op.rot || 0) * w * Math.PI) / 180, e = 1 + ((op.esc == null ? 1 : op.esc) - 1) * w;
    const c = Math.cos(r) * e, s = Math.sin(r) * e, cx = op.cx || 0, cy = op.cy || 0;
    return [c, s, -s, c, (op.dx || 0) * w + cx - (c * cx - s * cy), (op.dy || 0) * w + cy - (s * cx + c * cy)];
  }
  const esNula = (m) => Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1]) < 1e-9 && Math.abs(m[2]) < 1e-9 && Math.abs(m[3] - 1) < 1e-9 && Math.abs(m[4]) < 1e-9 && Math.abs(m[5]) < 1e-9;
  const aTexto = (m) => "matrix(" + m.map((x) => +x.toFixed(5)).join(" ") + ")";
  /** Qué dibujos tocar: el primer cuadro del tramo en que aparece cada uno, y su peso. */
  function plan(cells, centro, desde, hasta, curva) {
    const vistos = new Map();
    for (let f = Math.max(1, desde); f <= hasta; f++) {
      const n = cells[f - 1];
      if (n == null) continue;
      const w = peso(f, centro, desde, hasta, curva);
      // un dibujo expuesto en varios cuadros se mueve con el peso MÁS ALTO de los suyos
      if (!vistos.has(n) || vistos.get(n) < w) vistos.set(n, w);
    }
    return [...vistos.entries()].map(([numero, w]) => ({ numero, peso: w })).filter((x) => x.peso > 0);
  }

  /* ── el DOM: los elementos del dibujo ───────────────────────────────────── */
  const SVGNS = "http://www.w3.org/2000/svg";
  function conDibujo(content, fn) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.innerHTML = content;
    fn(svg);
    return svg.innerHTML;
  }
  /** Los elementos que se mueven: los hijos de los grupos de línea y color
   *  (o los de primer nivel si el dibujo no tiene esos grupos), sin el papel. */
  function piezas(svg) {
    const grupos = [...svg.querySelectorAll(":scope > g[data-low-art]")];
    const lista = grupos.length ? grupos.flatMap((g) => [...g.children]) : [...svg.children];
    return lista.filter((n) => !n.matches("rect[data-low-page], defs, style"));
  }
  function transformar(content, m) {
    return conDibujo(content, (svg) => {
      for (const el of piezas(svg)) {
        const t = el.getAttribute("transform");
        el.setAttribute("transform", aTexto(m) + (t ? " " + t : ""));
      }
    });
  }

  /* ── hacerlo, con un paso de Ctrl+Z ─────────────────────────────────────── */
  function cambiarDibujos(doc, lv, cambios, label) {
    if (!cambios.length) return 0;
    const antes = cambios.map((c) => ({ numero: c.numero, content: lv.byNumber(c.numero).content }));
    const lvId = lv.id;
    const poner = (lista) => { const l = doc.scene.level(lvId); if (!l) return; for (const c of lista) { const d = l.byNumber(c.numero); if (d) d.content = c.content; } doc.touch(); doc.emit("level"); doc.emit("frame"); };
    poner(cambios);
    if (doc.history) doc.history.push({ label, domain: "anim", before: antes, after: cambios, apply: (_dir, v) => { poner(v); if (typeof global.dzCanvasSet === "function" && doc.drawing) global.dzCanvasSet(doc.drawing.content); } });
    if (typeof global.dzCanvasSet === "function" && doc.drawing) global.dzCanvasSet(doc.drawing.content);
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    if (typeof global.dzOnionRender === "function") global.dzOnionRender();
    return cambios.length;
  }

  /** Mueve los dibujos de la capa activa en [desde, hasta]. op: { dx, dy,
   *  rot, esc, curva }. El pivote es el centro de la hoja. */
  function moverVarios(op) {
    const D = dz(), doc = D && D.doc;
    if (!doc || !doc.layer || doc.layer.locked) { avisar("Capa bloqueada o sin capa activa"); return 0; }
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const lv = doc.level, sc = doc.scene;
    const cx = (sc.width || 1920) / 2, cy = (sc.height || 1080) / 2;
    const p = plan(doc.layer.cells, doc.frame, op.desde, op.hasta, op.curva);
    const cambios = [];
    for (const x of p) {
      const d = lv.byNumber(x.numero);
      if (!d || !d.content) continue;
      const m = matriz({ ...op, cx, cy }, x.peso);
      if (esNula(m)) continue;
      cambios.push({ numero: x.numero, content: transformar(d.content, m) });
    }
    const n = cambiarDibujos(doc, lv, cambios, "Mover varios cuadros");
    avisar(n ? "Movidos " + n + " dibujo" + (n === 1 ? "" : "s") + " de los cuadros " + op.desde + " a " + op.hasta + " · Ctrl+Z lo deshace" : "No había nada que mover en ese tramo");
    return n;
  }

  /** El centro de un contenido, en la hoja (para la dirección del barrido). */
  function centroDe(content) {
    const tmp = document.createElementNS(SVGNS, "svg");
    tmp.setAttribute("style", "position:absolute;left:-99999px;top:0;width:10px;height:10px;visibility:hidden");
    tmp.innerHTML = content;
    document.body.appendChild(tmp);
    try { const b = tmp.getBBox(); return b.width || b.height ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; }
    catch (_) { return null; } finally { tmp.remove(); }
  }
  /** La dirección del barrido: del centro del dibujo anterior (la última vez
   *  que la capa mostró OTRO dibujo) al del actual. */
  function direccion(doc) {
    const ly = doc.layer, actual = doc.drawing;
    if (!ly || !actual) return null;
    for (let f = doc.frame - 1; f >= 1; f--) {
      const n = ly.cellAt(f);
      if (n == null || n === ly.cellAt(doc.frame)) continue;
      const prev = doc.level.byNumber(n);
      const a = prev && centroDe(prev.content), b = centroDe(actual.content);
      return a && b ? { dx: b.x - a.x, dy: b.y - a.y } : null;
    }
    return null;
  }
  /** CUADRO DE BARRIDO: copias detrás, hacia atrás en la dirección del movimiento. */
  function barrido(op) {
    const D = dz(), doc = D && D.doc;
    if (!doc || !doc.layer || doc.layer.locked || !doc.drawing) { avisar("Capa bloqueada o sin dibujo en este cuadro"); return 0; }
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const copias = Math.max(1, Math.min(12, Math.round(op.copias || 3))), dx = Number(op.dx) || 0, dy = Number(op.dy) || 0;
    if (!dx && !dy) { avisar("El barrido necesita una dirección: no hay un dibujo distinto antes de éste (o escribila a mano)"); return 0; }
    const d = doc.drawing;
    const content = conDibujo(d.content, (svg) => {
      const grupos = [...svg.querySelectorAll(":scope > g[data-low-art]")];
      for (const g of grupos.length ? grupos : [svg]) {
        const originales = [...g.children].filter((n) => !n.matches("rect[data-low-page], defs, style") && !n.hasAttribute("data-barrido"));
        if (!originales.length) continue;
        for (let k = copias; k >= 1; k--) {
          const t = k / (copias + 1);
          const cont = document.createElementNS(SVGNS, "g");
          cont.setAttribute("data-barrido", String(k));
          cont.setAttribute("transform", "translate(" + +(-dx * t).toFixed(2) + " " + +(-dy * t).toFixed(2) + ")");
          cont.setAttribute("opacity", String(+(Math.max(0.08, (1 - t) * (op.opacidad == null ? 0.6 : op.opacidad))).toFixed(3)));
          for (const n of originales) { const c = n.cloneNode(true); c.removeAttribute("id"); c.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); cont.appendChild(c); }
          g.insertBefore(cont, originales[0]);           // detrás del dibujo
        }
      }
    });
    const n = cambiarDibujos(doc, doc.level, [{ numero: d.number, content }], "Cuadro de barrido");
    avisar(n ? "Cuadro de barrido: " + copias + " copias detrás del dibujo · Ctrl+Z lo deshace" : "");
    return copias;
  }

  /* ── los diálogos ───────────────────────────────────────────────────────── */
  function dialogoMover() {
    const D = dz(), doc = D && D.doc;
    if (!doc || !doc.layer) return avisar("Abrí o creá un documento de animación");
    if (typeof global.openModal !== "function") return;
    const fin = Math.max(1, doc.layer.lastFrame()), f = doc.frame;
    global.openModal(`<h2>Mover varios cuadros</h2>
      <div class="sub">Corre, gira o escala el dibujo de la capa en un tramo de cuadros a la vez. Con atenuación, el cuadro actual (${f}) se mueve entero y los de las puntas cada vez menos.</div>
      <div class="dz-style-row"><span class="dz-hint">Cuadros</span><input type="number" id="vcDesde" class="dz-win" value="1" min="1"><input type="number" id="vcHasta" class="dz-win" value="${fin}" min="1"></div>
      <div class="dz-style-row"><span class="dz-hint">Mover X</span><input type="number" id="vcDx" class="dz-win" value="0"><span class="dz-hint">Y</span><input type="number" id="vcDy" class="dz-win" value="0"></div>
      <div class="dz-style-row"><span class="dz-hint">Girar °</span><input type="number" id="vcRot" class="dz-win" value="0"><span class="dz-hint">Escala</span><input type="number" id="vcEsc" class="dz-win" value="1" step="0.05" min="0.05"></div>
      <div class="dz-style-row"><span class="dz-hint">Atenuación</span><select id="vcCurva" class="langsel"><option value="ninguna">Ninguna (todos igual)</option><option value="lineal">Lineal hacia las puntas</option><option value="suave">Suave hacia las puntas</option></select></div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="vcOk">Mover</button></div>`);
    const $m = (s) => document.querySelector(s);
    $m("#mCancel").onclick = () => global.closeModal();
    $m("#vcOk").onclick = () => {
      const op = { desde: +$m("#vcDesde").value || 1, hasta: +$m("#vcHasta").value || fin, dx: +$m("#vcDx").value || 0, dy: +$m("#vcDy").value || 0,
        rot: +$m("#vcRot").value || 0, esc: Math.max(0.05, +$m("#vcEsc").value || 1), curva: $m("#vcCurva").value };
      global.closeModal();
      moverVarios(op);
    };
  }
  function dialogoBarrido() {
    const D = dz(), doc = D && D.doc;
    if (!doc || !doc.drawing) return avisar("No hay dibujo en este cuadro");
    if (typeof global.openModal !== "function") return;
    const dir = direccion(doc) || { dx: 0, dy: 0 };
    global.openModal(`<h2>Cuadro de barrido (smear)</h2>
      <div class="sub">Deja detrás del dibujo copias cada vez más transparentes, en la dirección en que vino: los «múltiplos» de un movimiento muy rápido.
      La dirección se midió del dibujo anterior a éste; se puede corregir.</div>
      <div class="dz-style-row"><span class="dz-hint">Dirección X</span><input type="number" id="smDx" class="dz-win" value="${Math.round(dir.dx)}"><span class="dz-hint">Y</span><input type="number" id="smDy" class="dz-win" value="${Math.round(dir.dy)}"></div>
      <div class="dz-style-row"><span class="dz-hint">Copias</span><input type="number" id="smN" class="dz-win" value="3" min="1" max="12"><span class="dz-hint">Opacidad</span><input type="number" id="smOp" class="dz-win" value="0.6" step="0.05" min="0.05" max="1"></div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="smOk">Hacer el barrido</button></div>`);
    const $m = (s) => document.querySelector(s);
    $m("#mCancel").onclick = () => global.closeModal();
    $m("#smOk").onclick = () => {
      const op = { dx: +$m("#smDx").value || 0, dy: +$m("#smDy").value || 0, copias: +$m("#smN").value || 3, opacidad: +$m("#smOp").value || 0.6 };
      global.closeModal();
      barrido(op);
    };
  }

  // las entradas del menú Animación (se disparan al apretar; ver produccion.js)
  let ultimo = 0;
  if (typeof document !== "undefined") for (const tipo of ["mousedown", "click"]) document.addEventListener(tipo, (ev) => {
    const item = ev.target && ev.target.closest && ev.target.closest('[data-act="mover-varios"], [data-act="barrido"]');
    if (!item || Date.now() - ultimo < 600) return;
    ultimo = Date.now();
    if (item.getAttribute("data-act") === "mover-varios") dialogoMover(); else dialogoBarrido();
  }, true);

  const a = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  a.variosCuadros = { peso, matriz, plan, moverVarios, barrido, direccion, dialogoMover, dialogoBarrido };
})(typeof window !== "undefined" ? window : globalThis);
