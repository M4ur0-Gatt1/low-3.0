/* ══════════════════════════════════════════════════════════════════════════
   INTERCALAR TODA LA SECUENCIA (como «Interpolate Sequence» de Blender)

   Pedido de Mauro (nov-2026, LOW 3.57): tener en LOW lo que Blender trae para
   animación 2D, con sus plugins. El «Intercalar…» de siempre crea intermedios
   entre ESTE dibujo y el siguiente, y los INSERTA: corre el resto de la escena
   y cambia el timing. Blender hace otra cosa, y es la que se usa en pose a pose:

     · respeta el timing que ya armaste: cada clave sigue en su cuadro;
     · rellena los SOSTENIDOS entre clave y clave con dibujos intermedios;
     · lo hace en toda la secuencia (o en un rango) de una vez;
     · con la curva que elijas —lineal, seno, cúbica, exponencial, rebote,
       elástica, «back»—, de entrada, de salida o las dos;
     · en unos, en dos o en tres (en dos: un intermedio cada dos cuadros).

   Lo que NUNCA pisa: un cuadro que ya tiene otro dibujo. Sólo se reemplazan
   cuadros que repiten la clave anterior (el sostenido). Un hueco vacío entre
   dos claves corta el par: no se inventa movimiento a través de un vacío.

   El morph es el mismo de «Intercalar…» (dzTweenBuild en app.js: empareja por
   id y por orden, re-muestrea contornos). Todo es UN paso de Ctrl+Z.

   @module animation/intercalar-secuencia
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  /* ── las curvas de Blender ──────────────────────────────────────────────── */
  const B1 = 1.70158;
  const rebote = (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  };
  /** Cada curva, «de entrada» (arranca lento): la de salida y la de las dos
   *  salen de ésta, como en Blender. */
  const ENTRADA = {
    seno: (t) => 1 - Math.cos((t * Math.PI) / 2),
    cuadratica: (t) => t * t,
    cubica: (t) => t * t * t,
    exponencial: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
    circular: (t) => 1 - Math.sqrt(1 - t * t),
    back: (t) => (B1 + 1) * t * t * t - B1 * t * t,
    rebote: (t) => 1 - rebote(1 - t),
    elastica: (t) => (t === 0 || t === 1 ? t : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3))),
  };
  const CURVAS = { lineal: () => (t) => t };
  for (const [nombre, f] of Object.entries(ENTRADA)) {
    CURVAS[nombre] = (modo) => modo === "entrada" ? f
      : modo === "salida" ? (t) => 1 - f(1 - t)
      : (t) => (t < 0.5 ? f(2 * t) / 2 : 1 - f(2 - 2 * t) / 2);
  }
  const NOMBRES = { lineal: "Lineal", seno: "Seno (suave)", cuadratica: "Cuadrática", cubica: "Cúbica", exponencial: "Exponencial",
    circular: "Circular", back: "Back (se pasa y vuelve)", rebote: "Rebote", elastica: "Elástica" };
  function curva(nombre, modo) {
    const c = CURVAS[nombre] || CURVAS.lineal;
    return c(modo === "entrada" || modo === "salida" ? modo : "ambas");
  }

  /** QUÉ SE RELLENA: los sostenidos entre claves, en [desde, hasta]. Pura,
   *  para poder probarla sin la app. `cells` son las celdas de la capa (índice
   *  0 = cuadro 1). Devuelve pares [{ fa, fb, a, b, cuadros: [{ f, t, nuevo }] }]:
   *  `nuevo` dice si en ese cuadro nace un intermedio (en dos, el siguiente
   *  repite el anterior). `t` va de 0 a 1 entre la clave A y la B. */
  function planSecuencia(cells, { desde = 1, hasta = Infinity, paso = 1 } = {}) {
    const celda = (f) => { const c = cells[f - 1]; return c == null ? null : c; };
    const ultimo = Math.min(hasta, cells.length);
    paso = Math.max(1, Math.min(4, Math.round(paso) || 1));
    // claves: el primer cuadro de cada exposición dentro del rango
    const claves = [];
    for (let f = Math.max(1, desde); f <= ultimo; f++) {
      const c = celda(f);
      if (c == null) { claves.push({ f, c: null }); continue; }
      if (f === desde || c !== celda(f - 1)) claves.push({ f, c });
    }
    const pares = [];
    for (let i = 0; i + 1 < claves.length; i++) {
      const A = claves[i], B = claves[i + 1];
      if (A.c == null || B.c == null || A.c === B.c || B.f - A.f < 2) continue;
      const cuadros = [];
      for (let f = A.f + 1; f < B.f; f++) {
        if (celda(f) !== A.c) { cuadros.length = 0; break; }   // no es un sostenido limpio: no se toca
        const nuevo = (f - A.f) % paso === 0;
        cuadros.push({ f, t: (f - A.f) / (B.f - A.f), nuevo });
      }
      // en dos o en tres: el que nace manda hasta el siguiente que nace; el
      // primero que no nace después de la clave sigue mostrando la clave
      if (cuadros.some((x) => x.nuevo)) pares.push({ fa: A.f, fb: B.f, a: A.c, b: B.c, cuadros });
    }
    return pares;
  }
  const cuantos = (pares) => pares.reduce((n, p) => n + p.cuadros.filter((x) => x.nuevo).length, 0);

  /* ── hacerlo ───────────────────────────────────────────────────────────── */

  /** Rellena la secuencia de la capa activa. opts: { desde, hasta, paso,
   *  curva, modo }. Devuelve { pares, dibujos } o null si no había nada. */
  function intercalar(opts = {}) {
    const D = dz(), doc = D && D.doc;
    if (!doc) { avisar("Abrí o creá un documento de animación"); return null; }
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const sc = doc.scene, ly = doc.layer, lv = doc.level;
    if (!ly || !lv || ly.locked) { avisar("Capa bloqueada o sin capa activa"); return null; }
    if (typeof global.dzTweenBuild !== "function" || typeof global.dzVB !== "function") { avisar("Esta versión de LOW no tiene el motor de intercalado"); return null; }
    const pares = planSecuencia(ly.cells, opts);
    if (!pares.length) { avisar("No hay sostenidos entre dos claves distintas para rellenar en ese rango"); return null; }
    const fn = curva(opts.curva || "seno", opts.modo || "ambas");
    const vb = global.dzVB();
    const svgDe = (content) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}">${content}</svg>`;
      return tmp.querySelector("svg");
    };
    // primero se generan TODOS los dibujos, sin tocar la capa: si algo falla,
    // no queda una secuencia a medias
    const plan = [];
    for (const p of pares) {
      const A = lv.byNumber(p.a), B = lv.byNumber(p.b);
      if (!A || !B) continue;
      const svgA = svgDe(A.content), svgB = svgDe(B.content);
      let actual = p.a;
      for (const q of p.cuadros) {
        if (q.nuevo) {
          const r = global.dzTweenBuild(svgA, svgB, fn(q.t));
          if (!r) return avisar("No pude generar un intermedio entre los cuadros " + p.fa + " y " + p.fb), null;
          const tmp = document.createElement("div"); tmp.innerHTML = r.svg;
          const s = tmp.querySelector("svg");
          actual = { content: s ? s.innerHTML : "" };
        }
        plan.push({ f: q.f, dibujo: actual });
      }
    }
    if (!plan.length) return null;
    const h = doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Intercalar la secuencia");
    const creados = [];
    try {
      for (const x of plan) {
        if (typeof x.dibujo === "object" && x.dibujo.num == null) {
          x.dibujo.num = lv.nextNumber();
          lv.addDrawing(x.dibujo.num, x.dibujo.content);
          creados.push({ num: x.dibujo.num, content: x.dibujo.content });
        }
        const num = typeof x.dibujo === "object" ? x.dibujo.num : x.dibujo;
        if (ly.cellAt(x.f) !== num) doc.setCell(x.f, num, ly.id);   // el sostenido que sigue igual no se reescribe
      }
      // los dibujos nuevos también entran al historial: Ctrl+Z no deja huérfanos
      if (h && creados.length) {
        const lvId = lv.id;
        h.push({ label: "Crear los intermedios de la secuencia", domain: "anim", before: null, after: creados,
          apply: (dir) => {
            const l = doc.scene.level(lvId);
            if (!l) return;
            if (dir === "undo") creados.forEach((c) => l.removeDrawing(c.num));
            else creados.forEach((c) => l.addDrawing(c.num, c.content));
            doc.emit("level");
          } });
      }
    } finally { if (tx) h.commit(); }
    doc.emit("level"); doc.emit("cells"); doc.emit("frame");
    if (typeof global.dzTlFramesRender === "function") global.dzTlFramesRender();
    if (typeof global.dzOnionRender === "function") global.dzOnionRender();
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    avisar("Secuencia intercalada: " + creados.length + " dibujos entre " + pares.length + (pares.length === 1 ? " par" : " pares") +
      " de claves, curva " + (NOMBRES[opts.curva] || "Seno") + " · el timing no cambió · Ctrl+Z lo deshace");
    return { pares: pares.length, dibujos: creados.length };
  }

  /* ── el diálogo ────────────────────────────────────────────────────────── */
  function abrir() {
    const D = dz(), doc = D && D.doc;
    if (!doc || !doc.layer) return avisar("Abrí o creá un documento de animación");
    if (typeof global.openModal !== "function") return intercalar({});
    const fin = Math.max(1, doc.layer.lastFrame());
    const opciones = Object.entries(NOMBRES).map(([k, v]) => `<option value="${k}"${k === "seno" ? " selected" : ""}>${v}</option>`).join("");
    global.openModal(`<h2>Intercalar toda la secuencia</h2>
      <div class="sub">Rellena los <b>sostenidos</b> entre cada clave y la siguiente de la capa «<span id="isCapa"></span>»,
      sin mover ninguna clave: el timing que armaste queda igual. Nunca pisa un cuadro que ya tiene otro dibujo.</div>
      <div class="dz-style-row">
        <span class="dz-hint">Desde</span><input type="number" id="isDesde" class="dz-win" value="1" min="1" max="${fin}">
        <span class="dz-hint">hasta</span><input type="number" id="isHasta" class="dz-win" value="${fin}" min="1" max="${fin}">
      </div>
      <div class="dz-style-row">
        <span class="dz-hint">Curva</span><select id="isCurva" class="langsel">${opciones}</select>
        <select id="isModo" class="langsel"><option value="ambas">de entrada y salida</option><option value="entrada">de entrada (arranca lento)</option><option value="salida">de salida (frena suave)</option></select>
      </div>
      <div class="dz-style-row">
        <span class="dz-hint">Intermedios</span>
        <select id="isPaso" class="langsel"><option value="1">en unos (uno por cuadro)</option><option value="2" selected>en dos</option><option value="3">en tres</option></select>
      </div>
      <div class="sub" id="isCuenta"></div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="isGo">Intercalar</button></div>`);
    const $m = (s) => document.querySelector(s);
    $m("#isCapa").textContent = doc.layer.name;
    const leer = () => ({ desde: +$m("#isDesde").value || 1, hasta: +$m("#isHasta").value || fin, paso: +$m("#isPaso").value || 1,
      curva: $m("#isCurva").value, modo: $m("#isModo").value });
    const contar = () => {
      const pares = planSecuencia(doc.layer.cells, leer()), n = cuantos(pares);
      $m("#isCuenta").textContent = n ? `Va a crear ${n} dibujo${n === 1 ? "" : "s"} entre ${pares.length} par${pares.length === 1 ? "" : "es"} de claves.`
        : "En ese rango no hay sostenidos entre dos claves distintas.";
      $m("#isGo").disabled = !n;
    };
    for (const s of ["#isDesde", "#isHasta", "#isPaso"]) $m(s).oninput = contar;
    contar();
    $m("#mCancel").onclick = () => global.closeModal();
    $m("#isGo").onclick = () => { const o = leer(); global.closeModal(); intercalar(o); };
  }

  // la entrada del menú Animación, sin tocar app.js (se dispara al apretar, ver
  // produccion.js). El clic que sigue al mismo gesto no lo vuelve a abrir.
  let abierto = 0;
  if (typeof document !== "undefined") for (const tipo of ["mousedown", "click"]) document.addEventListener(tipo, (ev) => {
    if (!(ev.target && ev.target.closest && ev.target.closest('[data-act="intercalar-secuencia"]'))) return;
    if (Date.now() - abierto < 600) return;
    abierto = Date.now();
    abrir();
  }, true);

  const animation = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  animation.intercalarSecuencia = { planSecuencia, cuantos, curva, CURVAS, NOMBRES, intercalar, abrir };
})(typeof window !== "undefined" ? window : globalThis);
