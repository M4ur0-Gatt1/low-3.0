/* ══════════════════════════════════════════════════════════════════════════
   LA CÁMARA 2D QUE SE ENTIENDE

   Reporte de Mauro (oct-2026, LOW 3.6.0), con captura en el espacio Cámara,
   cuadro 35 «interpolada»: «creo que me faltan opciones de movimientos de
   cámara; acá se me movió la cámara pero no tengo idea de cómo se movió».

   MEDIDO en el código, eran dos problemas:

   NO SE VEÍA NI SE PODÍA DESHACER
   - Ninguna clave de cámara entraba al historial: Ctrl+Z deshacía OTRA cosa.
   - No había lista de claves, ni recorrido, ni forma de mirar el plano: sólo
     un rombo por clave en la planilla (y su leyenda leía campos que no
     existen, así que nunca decía nada).
   - Los campos X, Y, Zoom y Rotación de la barra NUNCA tuvieron oyentes: se
     cableaban una vez al arrancar, cuando todavía no existían.

   SE MOVÍA SIN QUERER
   - Cerrar la línea de tiempo apagaba el modo cámara pero dejaba la
     herramienta en «camera»: el encuadre seguía agarrable y un arrastre
     dejaba una clave sin avisar.
   - Elegir otra herramienta (o Escape) no apagaba el modo: botón prendido,
     encuadre muerto.
   - Ventana → Cámara estaba invertido (comparaba con la guía, no con el modo).
   - El espacio «Cámara» mostraba el encuadre sin entrar en modo cámara.
   - En Composición, CADA muesca de la rueda con auto-key era una clave y un
     paso de deshacer.

   ACÁ
   1. Toda edición de cámara pasa por `cambiar()`: UN paso de historial por
      gesto, con nombre («Paneo a la derecha», «Temblor»…).
   2. El panel Cámara (inspector, con el modo cámara): X, Y, Zoom y Giro que
      andan; la CURVA de cada tramo (suave, constante, arranca suave, frena
      suave, corte); MOVIMIENTOS de un clic desde el cuadro actual (paneos,
      acercar, alejar, girar, temblor, encuadrar la selección, plano
      completo) con su duración; y la LISTA de claves: clic va al cuadro, ✕ la
      borra.
   3. El RECORRIDO sobre el lienzo: el centro de la cámara cuadro a cuadro.
      Los puntos juntos son lento y los separados rápido, como en una carta de
      spacing; rombos en las claves.
   4. «Ver por la cámara»: la vista sigue al encuadre en cada cuadro (con el
      play se ve el plano), y lo de afuera se oscurece.
   5. El zoom entre claves se interpola en escala logarítmica: un acercamiento
      de 100 % a 400 % pasa por 200 % a la mitad, no por 250 %.

   El recorrido es un <canvas>, no un <svg>: dentro de #dzCanvas un <svg>
   pasa por parte del dibujo (ver ui/drawing/mesa-de-luz.js).

   @module animation/camara-2d
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s, r) => (r || doc).querySelector(s);
  const r1 = (n) => Math.round(n * 10) / 10;
  const hayDocumento = () => { const dz = D(); return !!(dz && (dz.doc || dz.path)); };

  /* Las curvas de un TRAMO: la clave de la izquierda manda hasta la siguiente. */
  const CURVAS = [
    ["inout", "Suave", "arranca y frena suave"],
    ["linear", "Constante", "la misma velocidad todo el tramo"],
    ["in", "Arranca suave", "sale despacio y llega rápido"],
    ["out", "Frena suave", "sale rápido y llega despacio"],
    ["hold", "Corte", "se queda quieta y salta en la clave siguiente"],
  ];
  const nombreCurva = (c) => (CURVAS.find((x) => x[0] === c) || CURVAS[0])[1];

  /* ── EL MODELO ──────────────────────────────────────────────────────────── */
  const claves = () => global.dzCamKeys();
  const cuadro = () => global.dzCamFrame();
  const numeros = () => Object.keys(claves()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const copiar = (o) => JSON.parse(JSON.stringify(o || {}));

  /* Las claves estilo After Effects (`ae`, ui/composition/ae-camera.js) traen
     posición, punto de interés y lente en 3D. Si se edita su cx/cy/w/rot desde
     acá, la edición se traslada a la cámara 3D en vez de convertirla en 2D. */
  const ae = () => global.LOW && global.LOW.composition && global.LOW.composition.aeCamera;
  const vbAhora = () => (typeof global.dzVB === "function" ? global.dzVB() : [0, 0, 1080, 1080]);
  function copiaClave(a) {
    if (a && a.ae && ae()) { const c = { ...a }; delete c.ease; return c; }
    return { cx: a.cx, cy: a.cy, w: a.w, rot: a.rot || 0 };
  }
  function redondear(cam, curva) {
    if (cam && cam.ae && ae()) {
      const k = ae().redondear(ae().aplicarLegacy(cam, vbAhora()));
      delete k.ease;
      if (curva && curva !== "inout") k.ease = curva;
      return k;
    }
    const k = { cx: r1(cam.cx), cy: r1(cam.cy), w: r1(Math.max(1, cam.w)), rot: r1(cam.rot || 0) };
    if (curva && curva !== "inout") k.ease = curva;
    return k;
  }

  /** La cámara en el cuadro `num`: la curva del tramo es la de su clave izquierda. */
  function camaraEn(num) {
    const cams = claves(), ks = numeros();
    if (!ks.length) return global.dzCamDefault();
    const exacta = cams[num];
    if (exacta) return copiaClave(exacta);
    if (num <= ks[0]) return copiaClave(cams[ks[0]]);
    const ult = ks[ks.length - 1];
    if (num >= ult) return copiaClave(cams[ult]);
    let k1 = ks[0], k2 = ult;
    for (const k of ks) { if (k <= num) k1 = k; else { k2 = k; break; } }
    const a = cams[k1], b = cams[k2], curva = a.ease || "inout";
    if (curva === "hold") return copiaClave(a);
    const eases = typeof DZ_EASES !== "undefined" ? DZ_EASES : null;
    const f = (eases && eases[curva]) || ((t) => t);
    const t = f((num - k1) / (k2 - k1));
    if ((a.ae || b.ae) && ae()) return ae().interpolar(a, b, t, vbAhora());
    const w = a.w > 0 && b.w > 0 ? a.w * Math.pow(b.w / a.w, t) : a.w + (b.w - a.w) * t;
    return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, w,
      rot: (a.rot || 0) + ((b.rot || 0) - (a.rot || 0)) * t };
  }

  /* ── CAMBIAR: un paso de historial por gesto ────────────────────────────── */
  function reemplazar(valor) {
    const c = claves();
    for (const k of Object.keys(c)) delete c[k];
    Object.assign(c, copiar(valor));
  }
  function avisar() {
    const dz = D();
    if (dz && dz.doc) { dz.doc.touch(); dz.doc.emit("camera"); global.dzMarkDirty?.(); }
    else global.dzSceneSave?.();
    global.dzCamOverlay?.(); global.dzTimelineBadges?.();
    pintarPanel(); pintarRecorrido();
  }
  function cambiar(etiqueta, mutar) {
    if (!hayDocumento()) return false;
    const antes = copiar(claves());
    mutar(claves());
    const despues = copiar(claves());
    if (JSON.stringify(antes) === JSON.stringify(despues)) return false;
    const dz = D();
    if (dz.history) dz.history.push({ label: etiqueta, domain: "camera", before: antes, after: despues,
      apply: (_dir, valor) => { reemplazar(valor); avisar(); } });
    avisar();
    global.dzSetStatus?.("🎬 " + etiqueta + " · " + numeros().length + " clave(s) de cámara");
    return true;
  }

  /** La clave del cuadro actual (la de los arrastres y los campos). Conserva la curva.
   *
   *  LA CLAVE DE PARTIDA (v3.36). Con UNA sola clave la cámara no se mueve:
   *  queda fija en toda la toma. Medido con Mauro («no entiendo cómo se maneja
   *  el movimiento de cámara»): ir al cuadro 24 y mover el encuadre —lo natural—
   *  dejaba una clave sola y una toma quieta, sin aviso. Ahora, si no había
   *  ninguna clave y se edita un cuadro posterior al comienzo, también queda la
   *  clave del comienzo con la hoja entera: el movimiento existe y se ve. */
  const primerCuadro = () => Math.max(1, Math.round(Number(D()?.doc?.scene?.range?.in) || 1));
  function ponerClave(cam, etiqueta, op = {}) {
    const f = cuadro(), ini = primerCuadro();
    const partida = !op.sinPartida && !numeros().length && f > ini;
    const ok = cambiar(etiqueta || "Clave de cámara en el cuadro " + f, (c) => {
      if (partida) c[ini] = redondear(global.dzCamDefault());
      c[f] = redondear(cam, (c[f] && c[f].ease) || cam.ease);
    });
    if (ok && partida) global.dzSetStatus?.("🎬 Movimiento del cuadro " + ini + " al " + f + ": la clave del " + ini +
      " guarda la hoja entera como punto de partida (con una sola clave la cámara no se mueve) · Ctrl+Z la saca");
    return ok;
  }
  function alternarClave() {
    if (!hayDocumento()) return false;
    const f = cuadro();
    if (claves()[f]) return cambiar("Clave de cámara del cuadro " + f + " borrada", (c) => { delete c[f]; });
    return cambiar("Clave de cámara en el cuadro " + f, (c) => { c[f] = redondear(global.dzCamCur()); });
  }

  /* La clave que manda en este cuadro: la suya o la de la izquierda. */
  function claveDelTramo(f) {
    const ks = numeros();
    let k = null;
    for (const n of ks) if (n <= f) k = n;
    return k;
  }
  function ponerCurva(curva) {
    const f = cuadro(), k = claveDelTramo(f);
    if (k == null) { global.dzSetStatus?.("🎬 No hay una clave en este cuadro ni antes: la curva es del tramo que empieza en una clave"); return false; }
    return cambiar("Curva " + nombreCurva(curva).toLowerCase() + " desde el cuadro " + k, (c) => {
      if (curva === "inout") delete c[k].ease; else c[k].ease = curva;
    });
  }

  /* ── MOVIMIENTOS de un clic ─────────────────────────────────────────────── */
  let duracion = 24;
  /* gira un vector por el giro de la cámara: «a la derecha» es la derecha
     del encuadre, no la de la hoja */
  const girar = (x, y, g) => { const a = (g || 0) * Math.PI / 180; return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]; };

  function tramo(etiqueta, hacia) {
    const f0 = cuadro(), f1 = f0 + Math.max(1, duracion);
    const base = camaraEn(f0), fin = hacia(base);
    const medio = numeros().filter((n) => n > f0 && n < f1).length;
    if (medio) global.setTimeout(() => global.dzSetStatus?.("🎬 " + etiqueta + " · cuadros " + f0 + "–" + f1 +
      " · reemplazó " + medio + " clave(s) que había en el medio (Ctrl+Z las vuelve)"), 0);
    return cambiar(etiqueta + " · cuadros " + f0 + "–" + f1, (c) => {
      for (const k of Object.keys(c)) { const n = +k; if (n > f0 && n < f1) delete c[k]; }
      c[f0] = redondear(base, c[f0] && c[f0].ease);
      c[f1] = redondear(fin, c[f1] && c[f1].ease);
    });
  }

  const vb = () => global.dzVB();
  const MOVIMIENTOS = {
    "paneo-der": ["Paneo a la derecha", (b) => { const [x, y] = girar(b.w * 0.5, 0, b.rot); return { ...b, cx: b.cx + x, cy: b.cy + y }; }],
    "paneo-izq": ["Paneo a la izquierda", (b) => { const [x, y] = girar(-b.w * 0.5, 0, b.rot); return { ...b, cx: b.cx + x, cy: b.cy + y }; }],
    "paneo-arr": ["Paneo hacia arriba", (b) => { const [x, y] = girar(0, -b.w * 0.3, b.rot); return { ...b, cx: b.cx + x, cy: b.cy + y }; }],
    "paneo-aba": ["Paneo hacia abajo", (b) => { const [x, y] = girar(0, b.w * 0.3, b.rot); return { ...b, cx: b.cx + x, cy: b.cy + y }; }],
    "acercar": ["Acercamiento", (b) => ({ ...b, w: Math.max(vb()[2] * 0.05, b.w / 1.6) })],
    "alejar": ["Alejamiento", (b) => ({ ...b, w: Math.min(vb()[2] * 3, b.w * 1.6) })],
    "girar-der": ["Giro a la derecha", (b) => ({ ...b, rot: (b.rot || 0) + 15 })],
    "girar-izq": ["Giro a la izquierda", (b) => ({ ...b, rot: (b.rot || 0) - 15 })],
  };
  function mover(id) {
    const m = MOVIMIENTOS[id];
    return m ? tramo(m[0], m[1]) : false;
  }

  /* TEMBLOR: claves cada 2 cuadros con un desplazamiento que se apaga, y la
     cámara vuelve exacta al final. Pseudoazar con semilla: el mismo temblor
     se repite igual, así que se puede ajustar sin que cambie solo. */
  function temblor(fuerza = 1) {
    const f0 = cuadro(), n = Math.max(4, duracion), f1 = f0 + n, base = camaraEn(f0);
    let s = 7;
    const azar = () => { s = (s * 16807) % 2147483647; return s / 2147483647 * 2 - 1; };
    const amp = base.w * 0.012 * fuerza;
    return cambiar("Temblor · cuadros " + f0 + "–" + f1, (c) => {
      for (const k of Object.keys(c)) { const q = +k; if (q >= f0 && q <= f1) delete c[k]; }
      for (let f = f0; f < f1; f += 2) {
        const apaga = 1 - (f - f0) / n;
        const k = f === f0 ? redondear(base, "linear") :
          redondear({ cx: base.cx + azar() * amp * apaga, cy: base.cy + azar() * amp * apaga, w: base.w,
            rot: (base.rot || 0) + azar() * 0.6 * fuerza * apaga }, "linear");
        c[f] = k;
      }
      c[f1] = redondear(base);
    });
  }

  /* ENCUADRAR LA SELECCIÓN: una clave que la contiene, con aire alrededor. */
  function encuadrarSeleccion() {
    const dz = D();
    const sel = [dz.sel, ...(dz.multi || [])].filter((e) => e && e.isConnected && e.getBoundingClientRect);
    if (!sel.length) { global.dzSetStatus?.("🎬 Seleccioná algo primero: la cámara se ajusta a la selección"); return false; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of sel) {
      const r = e.getBoundingClientRect();
      for (const [sx, sy] of [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]) {
        const p = global.dzToUser(sx, sy);
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    const v = vb(), aspecto = v[3] / v[2];
    const w = Math.max(v[2] * 0.05, Math.max(x1 - x0, (y1 - y0) / aspecto) * 1.25);
    return ponerClave({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w, rot: 0 }, "Encuadrar la selección en el cuadro " + cuadro());
  }
  function planoCompleto() { return ponerClave(global.dzCamDefault(), "Plano completo en el cuadro " + cuadro()); }
  function borrarTodas() { return cambiar("Borrar todas las claves de cámara", (c) => { for (const k of Object.keys(c)) delete c[k]; }); }
  function borrarClave(f) { return cambiar("Clave de cámara del cuadro " + f + " borrada", (c) => { delete c[f]; }); }

  /* ── EL MÉTODO: ENCUADRE DE INICIO → ENCUADRE FINAL (v3.36) ──────────────
     Un movimiento de cámara se piensa así: cómo arranca la toma, cómo
     termina y cuánto tarda. El panel lo pide en ese orden (paso 1, paso 2,
     ▶) y cada paso lleva al cuadro y deja su clave: sólo queda arrastrar. */
  let desdeElegido = null, hastaElegido = null;
  function desdeYHasta() {
    const ks = numeros();
    const desde = desdeElegido ?? (ks.length ? ks[0] : primerCuadro());
    let hasta = hastaElegido ?? (ks.length > 1 ? ks[ks.length - 1] : desde + 23);
    if (hasta <= desde) hasta = desde + 1;
    return { desde, hasta };
  }
  function encuadreDeInicio() {
    const { desde } = desdeYHasta();
    irA(desde);
    if (!claves()[desde]) ponerClave(camaraEn(desde), "Encuadre de inicio en el cuadro " + desde, { sinPartida: true });
    global.dzSetStatus?.("🎬 Paso 1 · cuadro " + desde + ": arrastrá el marco naranja para elegir cómo ARRANCA la toma");
  }
  /* LA ESCENA TIENE QUE DURAR LO QUE DURA EL MOVIMIENTO. Una escena nueva (o
     un fondo quieto) dura UN cuadro: la cámara podía ir del 1 al 24 y el play
     no tenía nada que reproducir. Alargar = sostener el último dibujo de cada
     capa hasta el cuadro final, en un solo paso de Ctrl+Z. Con una escena
     sola de un cuadro se hace al pedir el encuadre final; con una escena ya
     animada, sólo si se pide (la pista lo ofrece). */
  const finDeEscena = () => { const sc = D()?.doc?.scene; return sc ? sc.playRange().out : 1; };
  function alargarEscena(hasta) {
    const d = D()?.doc, sc = d && d.scene;
    if (!sc || typeof d._snapshot !== "function") return false;
    const capas = sc.layers.filter((l) => { const u = l.lastFrame(); return u > 0 && u < hasta; });
    const ids = capas.map((l) => l.id), antes = d._snapshot(ids, []);
    for (const ly of capas) { const u = ly.lastFrame(), n = ly.cellAt(u); for (let f = u + 1; f <= hasta; f++) ly.setCell(f, n); }
    if (sc.range.out > 0 && sc.range.out < hasta) { sc.range.out = hasta; const o = $q("#tlOut"); if (o) o.value = hasta; }
    d._histRange("Alargar la escena hasta el cuadro " + hasta + " (para la cámara)", antes, d._snapshot(ids, []));
    d.touch(); d.emit("cells"); d.emit("frame");
    global.dzSetStatus?.("🎬 La escena ahora dura " + hasta + " cuadros: cada capa sostiene su último dibujo hasta el final del movimiento · Ctrl+Z lo deshace");
    return true;
  }
  function encuadreFinal() {
    const { desde, hasta } = desdeYHasta();
    const ini = camaraEn(desde), fin = camaraEn(hasta);
    if (finDeEscena() < hasta && (D()?.doc?.scene?.lastFrame?.() || 0) <= 1) alargarEscena(hasta);
    irA(hasta);
    cambiar("Encuadre final en el cuadro " + hasta, (c) => {
      if (!c[desde]) c[desde] = redondear(ini);
      if (!c[hasta]) c[hasta] = redondear(fin);
    });
    global.dzSetStatus?.("🎬 Paso 2 · cuadro " + hasta + ": mové el marco a donde TERMINA la toma (el cuerpo lo mueve, la esquina acerca o aleja, el círculo lo gira)");
  }
  function verMovimiento() {
    const { desde } = desdeYHasta(), dz = D();
    irA(desde);
    if (dz && !(dz.playback && dz.playback.playing)) global.dzPlayToggle?.();
  }
  function saltarClave(dir) {
    const f = cuadro(), ks = numeros();
    const k = dir < 0 ? [...ks].reverse().find((n) => n < f) : ks.find((n) => n > f);
    if (k == null) { global.dzSetStatus?.("🎬 No hay otra clave " + (dir < 0 ? "antes" : "después") + " del cuadro " + f); return false; }
    irA(k); return true;
  }
  /** Muda una clave a otro cuadro (retiming): el número de la lista se edita. */
  function mudarClave(de, a) {
    a = Math.round(Number(a));
    if (!Number.isFinite(a) || a < 1 || a === de || !claves()[de]) { pintarPanel(); return false; }
    if (claves()[a]) { global.dzSetStatus?.("🎬 El cuadro " + a + " ya tiene una clave de cámara"); pintarPanel(); return false; }
    return cambiar("Clave de cámara del cuadro " + de + " al " + a, (c) => { c[a] = c[de]; delete c[de]; });
  }
  const VISTO = "low.camara.tutorial.visto";
  function tutorialVisto() { try { global.localStorage.setItem(VISTO, "1"); } catch (_) { /* sin almacenamiento */ } }
  const yaVioTutorial = () => { try { return global.localStorage.getItem(VISTO) === "1"; } catch (_) { return true; } };
  /** Lo que falta para que haya movimiento, en palabras. */
  function pista() {
    const ks = numeros(), cams = claves();
    if (!ks.length) return "Empezá por el paso 1: el encuadre con que ARRANCA la toma.";
    const distintas = ks.some((k) => JSON.stringify({ ...cams[k], ease: 0 }) !== JSON.stringify({ ...cams[ks[0]], ease: 0 }));
    if (ks.length === 1) return "Falta el encuadre final (paso 2): con una sola clave la cámara no se mueve.";
    if (!distintas) return "Las claves tienen el mismo encuadre: mové el marco en una de ellas para que la cámara se mueva.";
    if (ks[ks.length - 1] > finDeEscena()) return "La escena dura " + finDeEscena() + " cuadros y la cámara sigue hasta el " + ks[ks.length - 1] + ": el play corta antes.";
    return "La cámara se mueve del cuadro " + ks[0] + " al " + ks[ks.length - 1] + ". ▶ para verla; la línea naranja es su recorrido (puntos juntos = lento).";
  }

  /* ── EL PANEL ───────────────────────────────────────────────────────────── */
  let panel = null;
  function montarPanel() {
    if (panel && panel.isConnected) return panel;
    const insp = $q("#dzInspector");
    if (!insp) return null;
    panel = doc.createElement("section");
    panel.id = "dzCamPanel"; panel.className = "cam2d"; panel.hidden = true;
    panel.innerHTML = `
      <header class="cam2d-cab"><b>🎬 Cámara</b><span class="cam2d-estado"></span>
        <button type="button" data-a="tutorial" class="cam2d-chico cam2d-ayudame" title="Tutorial: mover la cámara, paso a paso">?</button></header>
      <p class="cam2d-oferta" hidden>¿Primera vez con la cámara? <button type="button" data-a="tutorial">Hacé el tutorial (2 min)</button>
        <button type="button" data-a="no-tutorial" class="cam2d-chico" title="No mostrar más">✕</button></p>
      <ol class="cam2d-pasos" aria-label="Un movimiento de cámara, paso a paso">
        <li data-paso="1"><span class="cam2d-n">1</span><div><b>Encuadre de inicio</b><small>en el cuadro <input type="number" data-a="desde" min="1" value="1"></small></div>
          <button type="button" data-a="ir-desde" title="Va a ese cuadro y deja su clave: arrastrá el marco naranja para elegir cómo ARRANCA la toma">Ir y encuadrar</button></li>
        <li data-paso="2"><span class="cam2d-n">2</span><div><b>Encuadre final</b><small>en el cuadro <input type="number" data-a="hasta" min="2" value="24"></small></div>
          <button type="button" data-a="ir-hasta" title="Va a ese cuadro y deja su clave: mové el marco a donde TERMINA la toma">Ir y encuadrar</button></li>
        <li data-paso="3"><span class="cam2d-n">3</span><div><b>Mirá el movimiento</b><small>la curva de cada tramo, abajo</small></div>
          <button type="button" data-a="ver" title="Va al encuadre de inicio y reproduce por la cámara">▶ Ver</button></li>
      </ol>
      <p class="cam2d-pista" aria-live="polite"></p>
      <button type="button" data-a="alargar" class="cam2d-alargar" hidden title="Cada capa sostiene su último dibujo hasta el final del movimiento">Alargar la escena hasta la última clave</button>
      <div class="cam2d-campos">
        <label>X <input type="number" data-c="cx" step="1"></label>
        <label>Y <input type="number" data-c="cy" step="1"></label>
        <label>Zoom <input type="number" data-c="zoom" min="5" max="2000" step="5"><i>%</i></label>
        <label>Giro <input type="number" data-c="rot" step="1"><i>°</i></label>
      </div>
      <div class="cam2d-fila">
        <button type="button" data-a="clave" class="cam2d-clave"></button>
        <label class="cam2d-curva" title="Cómo va la cámara desde la clave de este tramo hasta la siguiente">Curva
          <select data-a="curva">${CURVAS.map(([v, n, d]) => `<option value="${v}" title="${d}">${n}</option>`).join("")}</select></label>
      </div>
      <h4>Movimientos <small>desde este cuadro, en <input type="number" data-a="duracion" min="2" max="600" value="24"> cuadros</small></h4>
      <div class="cam2d-movs">
        <button type="button" data-m="paneo-izq" title="Paneo a la izquierda">← Paneo</button>
        <button type="button" data-m="paneo-der" title="Paneo a la derecha">Paneo →</button>
        <button type="button" data-m="paneo-arr" title="Paneo hacia arriba">↑ Paneo</button>
        <button type="button" data-m="paneo-aba" title="Paneo hacia abajo">Paneo ↓</button>
        <button type="button" data-m="acercar" title="Acercamiento (push in): el encuadre se achica">Acercar</button>
        <button type="button" data-m="alejar" title="Alejamiento (pull out): el encuadre se agranda">Alejar</button>
        <button type="button" data-m="girar-izq" title="Gira 15° a la izquierda">↺ Girar</button>
        <button type="button" data-m="girar-der" title="Gira 15° a la derecha">Girar ↻</button>
        <button type="button" data-a="temblor" title="Temblor que se apaga y vuelve al encuadre">Temblor</button>
        <button type="button" data-a="encuadrar" title="Una clave que encuadra lo seleccionado">Encuadrar selección</button>
        <button type="button" data-a="completo" title="Una clave con la hoja entera">Plano completo</button>
      </div>
      <div class="cam2d-ver">
        <label><input type="checkbox" data-a="recorrido"> Ver el recorrido</label>
        <label><input type="checkbox" data-a="porcamara"> Ver por la cámara</label>
        <label title="El play muestra la toma dentro del marco, igual que la exportación"><input type="checkbox" data-a="playcam"> Play por la cámara</label>
      </div>
      <h4>Claves <span class="cam2d-saltos"><button type="button" data-a="clave-ant" class="cam2d-chico" title="Ir a la clave anterior">◀ Clave</button><button type="button" data-a="clave-sig" class="cam2d-chico" title="Ir a la clave siguiente">Clave ▶</button></span>
        <button type="button" data-a="borrar-todas" class="cam2d-chico">Borrar todas</button></h4>
      <ol class="cam2d-lista"></ol>
      <p class="cam2d-ayuda">Arrastrá el marco para moverla; la esquina de abajo a la derecha: hacia adentro ACERCA, hacia afuera ALEJA; el círculo de arriba la gira. Cada cambio deja una clave en este cuadro y se deshace con Ctrl+Z. El número de una clave se edita para mudarla de cuadro.</p>`;
    insp.insertBefore(panel, insp.firstChild);
    arrastrable(panel);
    panel.addEventListener("change", (e) => {
      const el = e.target;
      if (el.dataset.c) {
        const cam = { ...global.dzCamCur() }, v = vb(), n = Number(el.value);
        if (!Number.isFinite(n)) return pintarPanel();
        if (el.dataset.c === "zoom") cam.w = v[2] / Math.max(0.05, n / 100);
        else cam[el.dataset.c] = n;
        ponerClave(cam, ({ cx: "Cámara en X", cy: "Cámara en Y", zoom: "Zoom de cámara", rot: "Giro de cámara" })[el.dataset.c] + " · cuadro " + cuadro());
      } else if (el.dataset.a === "curva") ponerCurva(el.value);
      else if (el.dataset.a === "duracion") duracion = Math.max(2, Math.min(600, Math.round(Number(el.value) || 24)));
      else if (el.dataset.a === "recorrido") { verRecorrido = el.checked; guardar(); pintarRecorrido(); }
      else if (el.dataset.a === "porcamara") verPorCamara(el.checked);
      else if (el.dataset.a === "playcam") { playCam = el.checked; guardar(); }
      else if (el.dataset.a === "desde") { desdeElegido = Math.max(1, Math.round(Number(el.value) || 1)); pintarPanel(); }
      else if (el.dataset.a === "hasta") { hastaElegido = Math.max(2, Math.round(Number(el.value) || 24)); pintarPanel(); }
      else if (el.classList.contains("cam2d-f")) mudarClave(Number(el.closest("li").dataset.f), Number(el.value));
    });
    panel.addEventListener("click", (e) => {
      // el número de una clave: el clic lleva a esa clave Y deja el número listo
      // para editarlo (mudar la clave). El panel se repinta al cambiar de
      // cuadro, así que se vuelve a enfocar el campo nuevo.
      const num = e.target.closest("input.cam2d-f");
      if (num) {
        const k = Number(num.closest("li").dataset.f);
        if (k !== cuadro()) { irA(k); const n = panel.querySelector(`.cam2d-lista li[data-f="${k}"] input.cam2d-f`); if (n) { n.focus(); n.select(); } }
        return;
      }
      if (e.target.closest("input")) return;
      const b = e.target.closest("button, li[data-f]");
      if (!b) return;
      if (b.dataset.m) mover(b.dataset.m);
      else if (b.dataset.a === "clave") alternarClave();
      else if (b.dataset.a === "temblor") temblor();
      else if (b.dataset.a === "encuadrar") encuadrarSeleccion();
      else if (b.dataset.a === "completo") planoCompleto();
      else if (b.dataset.a === "borrar-todas") borrarTodas();
      else if (b.dataset.a === "ir-desde") encuadreDeInicio();
      else if (b.dataset.a === "ir-hasta") encuadreFinal();
      else if (b.dataset.a === "ver") verMovimiento();
      else if (b.dataset.a === "alargar") { const ks = numeros(); if (ks.length) alargarEscena(ks[ks.length - 1]); pintarPanel(); }
      else if (b.dataset.a === "clave-ant") saltarClave(-1);
      else if (b.dataset.a === "clave-sig") saltarClave(1);
      else if (b.dataset.a === "tutorial") { tutorialVisto(); global.LOW?.camaraTutorial?.abrir(); }
      else if (b.dataset.a === "no-tutorial") { tutorialVisto(); pintarPanel(); }
      else if (b.dataset.a === "borrar") { e.stopPropagation(); borrarClave(Number(b.closest("li").dataset.f)); }
      else if (b.dataset.f) irA(Number(b.dataset.f));
    });
    return panel;
  }
  /** EL PANEL SIEMPRE A LA VISTA (v3.36). Vivía sólo en el inspector, y en los
   *  espacios de trabajo donde el inspector no se muestra (Animación, Dibujo…)
   *  el modo cámara se prendía SIN panel: ni pasos, ni claves, ni curva. Ahí
   *  flota a la derecha del lienzo; si el inspector está, vuelve adentro. */
  function ubicarPanel(p) {
    const insp = $q("#dzInspector");
    const inspVisible = !!(insp && insp.getClientRects().length && insp.getBoundingClientRect().width > 120);
    if (inspVisible) {
      if (p.parentElement !== insp) insp.insertBefore(p, insp.firstChild);
      p.classList.remove("cam2d-flotante");
    } else {
      const cv = $q("#dzCanvas"), host = $q("#designView") || doc.body;
      if (p.parentElement !== host) host.appendChild(p);
      p.classList.add("cam2d-flotante");
      // contra el borde derecho de la ventana (sobre los paneles de al lado, no
      // sobre la hoja ni el marco); si se lo arrastró, donde quedó
      const r = cv && cv.getBoundingClientRect();
      const top = flotante ? flotante.top : Math.max(8, (r && r.width ? r.top : 100) + 10);
      const left = flotante ? flotante.left : global.innerWidth - 276 - 10;
      p.style.top = Math.max(8, Math.min(top, global.innerHeight - 120)) + "px";
      p.style.left = Math.max(8, Math.min(left, global.innerWidth - 120)) + "px";
      p.style.maxHeight = Math.max(200, global.innerHeight - Math.max(8, top) - 60) + "px";
    }
  }
  /* el panel flotante se arrastra por su cabecera */
  let flotante = null;
  function arrastrable(p) {
    const cab = p.querySelector(".cam2d-cab");
    if (!cab || cab.__arrastre) return;
    cab.__arrastre = true;
    cab.addEventListener("pointerdown", (e) => {
      if (!p.classList.contains("cam2d-flotante") || e.button !== 0 || e.target.closest("button, input, select")) return;
      e.preventDefault();
      const r = p.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mover = (ev) => { flotante = { left: ev.clientX - dx, top: ev.clientY - dy }; ubicarPanel(p); };
      const soltar = () => { doc.removeEventListener("pointermove", mover); doc.removeEventListener("pointerup", soltar); };
      doc.addEventListener("pointermove", mover); doc.addEventListener("pointerup", soltar);
    });
  }
  function irA(f) {
    const dz = D();
    if (dz && dz.doc && typeof global.dzDocGoTo === "function") global.dzDocGoTo(f);
    else if (dz && dz.doc) dz.doc.goTo(f);
    pintarPanel(); pintarRecorrido();
  }

  function pintarPanel() {
    const dz = D();
    const p = montarPanel();
    if (!p) return;
    const visible = !!(dz && dz.camMode && hayDocumento());
    p.hidden = !visible;
    if (!visible) return;
    ubicarPanel(p);
    const f = cuadro(), cam = global.dzCamCur(), v = vb(), cams = claves(), ks = numeros();
    const tramoK = claveDelTramo(f);
    // lo mismo que el rótulo del marco: «interpolada» no decía entre qué claves
    const F = (n) => "F" + String(n).padStart(3, "0");
    let lugar = " · sin claves";
    if (cams[f]) lugar = " · clave";
    else if (ks.length && f < ks[0]) lugar = " · quieta hasta " + F(ks[0]);
    else if (ks.length && f > ks[ks.length - 1]) lugar = " · quieta desde " + F(ks[ks.length - 1]);
    else if (ks.length) { let a = ks[0], b = ks[ks.length - 1]; for (const k of ks) { if (k < f) a = k; else if (k > f) { b = k; break; } } lugar = " · entre " + F(a) + " y " + F(b); }
    p.querySelector(".cam2d-estado").textContent = "cuadro " + f + lugar;
    const campo = (c, val) => { const el = p.querySelector(`[data-c="${c}"]`); if (el && doc.activeElement !== el) el.value = val; };
    campo("cx", Math.round(cam.cx)); campo("cy", Math.round(cam.cy));
    campo("zoom", Math.round(v[2] / cam.w * 100)); campo("rot", r1(cam.rot || 0));
    // la barra de opciones de la herramienta muestra lo mismo: quedaba con los
    // valores del cuadro en que se eligió la herramienta
    const barra = (id, val) => { const el = $q("#" + id); if (el && doc.activeElement !== el) el.value = val; };
    barra("toCamX", r1(cam.cx)); barra("toCamY", r1(cam.cy));
    barra("toCamZoom", Math.round(v[2] / cam.w * 100)); barra("toCamRot", r1(cam.rot || 0));
    const bk = $q("#toCamKey"); if (bk) bk.textContent = cams[f] ? "Quitar clave" : "Crear clave";
    p.querySelector('[data-a="clave"]').textContent = cams[f] ? "Quitar clave de este cuadro" : "Clave en este cuadro";
    const sel = p.querySelector('[data-a="curva"]');
    sel.disabled = tramoK == null;
    sel.value = tramoK != null ? (cams[tramoK].ease || "inout") : "inout";
    sel.parentElement.title = tramoK != null ? "Tramo desde la clave del cuadro " + tramoK + ": " +
      (CURVAS.find((x) => x[0] === sel.value) || CURVAS[0])[2] : "Sin clave en este cuadro ni antes";
    p.querySelector('[data-a="recorrido"]').checked = verRecorrido;
    p.querySelector('[data-a="porcamara"]').checked = !!porCamara;
    p.querySelector('[data-a="playcam"]').checked = playCam;
    // el paso a paso: los cuadros de inicio y fin, qué está hecho, qué falta
    const { desde, hasta } = desdeYHasta();
    const num = (a, v) => { const el = p.querySelector(`[data-a="${a}"]`); if (el && doc.activeElement !== el) el.value = v; };
    num("desde", desde); num("hasta", hasta);
    const igual = (a, b) => a && b && Math.abs(a.cx - b.cx) < .05 && Math.abs(a.cy - b.cy) < .05 && Math.abs(a.w - b.w) < .05 && Math.abs((a.rot || 0) - (b.rot || 0)) < .05;
    p.querySelector('[data-paso="1"]').classList.toggle("hecho", !!cams[desde]);
    p.querySelector('[data-paso="2"]').classList.toggle("hecho", !!cams[hasta] && !igual(cams[desde], cams[hasta]));
    p.querySelector('[data-paso="1"]').classList.toggle("aca", f === desde);
    p.querySelector('[data-paso="2"]').classList.toggle("aca", f === hasta);
    p.querySelector(".cam2d-pista").textContent = pista();
    p.querySelector(".cam2d-alargar").hidden = !(ks.length && ks[ks.length - 1] > finDeEscena());
    p.querySelector(".cam2d-oferta").hidden = yaVioTutorial() || !!global.LOW?.camaraTutorial?.abierto?.();
    const ol = p.querySelector(".cam2d-lista");
    ol.textContent = "";
    if (!ks.length) {
      const li = doc.createElement("li"); li.className = "cam2d-vacia";
      li.textContent = "Sin claves: la cámara muestra la hoja entera.";
      ol.appendChild(li);
    }
    for (const k of ks) {
      const c = cams[k], li = doc.createElement("li");
      li.dataset.f = k; li.className = k === f ? "actual" : "";
      li.title = "Ir al cuadro " + k;
      // el número se edita: mudar la clave a otro cuadro (antes no había forma de retemporizar)
      li.innerHTML = `<b>F<input type="number" class="cam2d-f" min="1" value="${k}" title="Escribí otro cuadro para mudar esta clave" aria-label="Cuadro de la clave"></b><span></span><em></em><button type="button" data-a="borrar" title="Borrar esta clave">✕</button>`;
      li.querySelector("span").textContent = "x " + Math.round(c.cx) + " · y " + Math.round(c.cy) +
        " · " + Math.round(v[2] / c.w * 100) + " %" + (c.rot ? " · " + r1(c.rot) + "°" : "");
      li.querySelector("em").textContent = k === ks[ks.length - 1] ? "" : nombreCurva(c.ease || "inout");
      ol.appendChild(li);
    }
  }

  /* ── EL RECORRIDO ───────────────────────────────────────────────────────── */
  const CLAVE_PREF = "low.camara2d.v1";
  let verRecorrido = true, playCam = true;
  try { const g = JSON.parse(global.localStorage.getItem(CLAVE_PREF) || "{}"); if (g.recorrido === false) verRecorrido = false; if (g.playCam === false) playCam = false; } catch (_) { /* sin almacenamiento */ }
  function guardar() { try { global.localStorage.setItem(CLAVE_PREF, JSON.stringify({ recorrido: verRecorrido, playCam })); } catch (_) { /* */ } }
  /** ¿El play sale por la cámara? Con claves y la opción prendida, como la
   *  exportación. Con «Ver por la cámara» no: la VISTA ya sigue a la cámara. */
  function playPorCamara() { return playCam && hayDocumento() && numeros().length > 0 && !porCamara; }

  let lienzoRec = null;
  function pintarRecorrido() {
    const dz = D(), cv = $q("#dzCanvas");
    if (!cv) return;
    const ks = hayDocumento() ? numeros() : [];
    const mostrar = !!(dz && dz.camMode && verRecorrido && ks.length && cv.querySelector(":scope > svg"));
    if (!mostrar) { if (lienzoRec) lienzoRec.hidden = true; return; }
    if (!lienzoRec || !lienzoRec.isConnected) {
      lienzoRec = doc.createElement("canvas");
      lienzoRec.id = "dzCamRecorrido"; lienzoRec.className = "cam2d-recorrido";
      lienzoRec.setAttribute("aria-hidden", "true");
      cv.appendChild(lienzoRec);
    }
    lienzoRec.hidden = false;
    const dpr = global.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (lienzoRec.width !== Math.round(W * dpr) || lienzoRec.height !== Math.round(H * dpr)) {
      lienzoRec.width = Math.round(W * dpr); lienzoRec.height = Math.round(H * dpr);
      lienzoRec.style.width = W + "px"; lienzoRec.style.height = H + "px";
    }
    const g = lienzoRec.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const ult = Math.max(ks[ks.length - 1], (dz.doc && dz.doc.scene && dz.doc.scene.lastFrame && dz.doc.scene.lastFrame()) || 0);
    const desde = Math.max(1, Math.min(ks[0], cuadro())), hasta = Math.max(ult, cuadro());
    const puntos = [];
    for (let f = desde; f <= hasta && f - desde < 2000; f++) {
      const c = camaraEn(f), p = global.dzToScreen(c.cx, c.cy);
      puntos.push({ f, x: p.x, y: p.y });
    }
    // la línea
    g.lineWidth = 1.5; g.strokeStyle = "rgba(240,69,14,.75)"; g.setLineDash([]);
    g.beginPath();
    puntos.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.stroke();
    // un punto por cuadro: juntos = lento, separados = rápido
    g.fillStyle = "rgba(240,69,14,.9)";
    for (const p of puntos) { g.beginPath(); g.arc(p.x, p.y, 1.8, 0, Math.PI * 2); g.fill(); }
    // las claves: rombo con su número, y el contorno del encuadre en esa clave
    const cams = claves(), v = vb();
    g.font = "600 10px 'JetBrains Mono', Consolas, monospace"; g.textAlign = "left"; g.textBaseline = "middle";
    // claves con el mismo centro (un acercamiento sin moverse) comparten
    // rótulo: «F25 · F49». Antes el último tapaba al otro.
    const rotulos = new Map();
    for (const k of ks) {
      const c = cams[k], p = global.dzToScreen(c.cx, c.cy), id = Math.round(p.x / 4) + ":" + Math.round(p.y / 4);
      rotulos.set(id, [...(rotulos.get(id) || []), k]);
    }
    for (const k of ks) {
      const c = cams[k], p = global.dzToScreen(c.cx, c.cy), h = c.w * (v[3] / v[2]);
      const esq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const [x, y] = girar(sx * c.w / 2, sy * h / 2, c.rot);
        return global.dzToScreen(c.cx + x, c.cy + y);
      });
      g.setLineDash([4, 4]); g.lineWidth = 1; g.strokeStyle = "rgba(240,69,14,.45)";
      g.beginPath(); esq.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#F0450E"; g.strokeStyle = "rgba(0,0,0,.6)";
      g.beginPath(); g.moveTo(p.x, p.y - 6); g.lineTo(p.x + 6, p.y); g.lineTo(p.x, p.y + 6); g.lineTo(p.x - 6, p.y); g.closePath(); g.fill(); g.stroke();
      const grupo = rotulos.get(Math.round(p.x / 4) + ":" + Math.round(p.y / 4)) || [k];
      if (grupo[0] !== k) continue;          // el rótulo lo escribe la primera del grupo
      const texto = grupo.map((n) => "F" + n).join(" · ");
      g.fillStyle = "#fff"; g.strokeStyle = "rgba(0,0,0,.75)"; g.lineWidth = 3;
      g.strokeText(texto, p.x + 9, p.y - 9); g.fillText(texto, p.x + 9, p.y - 9);
    }
    // el cuadro actual, en celeste
    const ahora = puntos.find((p) => p.f === cuadro());
    if (ahora) { g.fillStyle = "#33B5E8"; g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.beginPath(); g.arc(ahora.x, ahora.y, 5, 0, Math.PI * 2); g.fill(); g.stroke(); }
  }

  /* ── VER POR LA CÁMARA ──────────────────────────────────────────────────── */
  let porCamara = null;     // la vista de antes, para volver
  function encuadrarVista() {
    const dz = D(), cv = $q("#dzCanvas"), svg = cv && cv.querySelector(":scope > svg");
    if (!porCamara || !dz || !svg) return;
    const v = vb(), cam = camaraEn(cuadro());
    const k = svg.clientWidth / v[2];                       // px de la hoja (a zoom 1) por unidad
    const camH = cam.w * (v[3] / v[2]);
    const z = Math.max(0.02, Math.min((cv.clientWidth - 40) / (cam.w * k), (cv.clientHeight - 40) / (camH * k)));
    const rot = -(cam.rot || 0);
    const px = (cam.cx - (v[0] + v[2] / 2)) * k * z, py = (cam.cy - (v[1] + v[3] / 2)) * k * z;
    const [gx, gy] = girar(px, py, rot);
    dz.zoom = z; dz.viewRot = rot; dz.panX = -gx; dz.panY = -gy;
    global.dzApplyZoom?.();
  }
  function verPorCamara(si) {
    const dz = D(), cv = $q("#dzCanvas");
    if (!dz || !cv) return;
    if (si && !porCamara) {
      porCamara = { zoom: dz.zoom, panX: dz.panX || 0, panY: dz.panY || 0, viewRot: dz.viewRot || 0 };
      cv.classList.add("ver-por-camara");
      encuadrarVista();
      global.dzSetStatus?.("🎬 Viendo por la cámara: con el play se ve el plano. Lo de afuera queda oscuro.");
    } else if (!si && porCamara) {
      const v = porCamara; porCamara = null;
      cv.classList.remove("ver-por-camara");
      Object.assign(dz, v); global.dzApplyZoom?.();
    }
    pintarPanel();
  }

  /* ── ENGANCHES con app.js, por nombre ───────────────────────────────────── */
  const suscritos = new WeakSet();
  function suscribir() {
    const dz = D(), d = dz && dz.doc;
    if (!d || suscritos.has(d) || typeof d.subscribe !== "function") return;
    suscritos.add(d);
    d.subscribe((docu, motivo) => {
      const a = D();
      if (!a || a.doc !== docu) return;
      if (motivo === "frame") { if (porCamara) encuadrarVista(); pintarPanel(); pintarRecorrido(); }
      else if (motivo === "camera" || motivo === "cells") { pintarPanel(); pintarRecorrido(); }
    });
  }

  /** El rótulo del encuadre decía «interpolada» aunque no hubiera ninguna clave.
   *  Ahora dice dónde está el cuadro respecto de las claves y, arrastrando, el
   *  zoom y el giro que van quedando. */
  function rotular() {
    const tag = $q("#dzCamTag"), box = $q("#dzCam");
    if (!tag || !box || box.hidden) return;
    const dz = D(), f = cuadro(), ks = numeros(), cams = claves(), F = (n) => "F" + String(n).padStart(3, "0");
    let estado;
    if (dz.camDrag) {
      const c = dz.camDrag;
      estado = "zoom " + Math.round(vb()[2] / Math.max(1e-6, c.w) * 100) + " %" + (Math.abs(c.rot || 0) > .05 ? " · giro " + r1(c.rot) + "°" : "");
    } else if (cams[f]) estado = "CLAVE";
    else if (!ks.length) estado = "sin claves: la hoja entera";
    else if (f < ks[0]) estado = "quieta hasta " + F(ks[0]);
    else if (f > ks[ks.length - 1]) estado = "quieta desde " + F(ks[ks.length - 1]);
    else { let a = ks[0], b = ks[ks.length - 1]; for (const k of ks) { if (k < f) a = k; else if (k > f) { b = k; break; } } estado = "entre " + F(a) + " y " + F(b); }
    tag.textContent = "Cámara 2D · " + F(f) + " · " + estado;
  }

  function apagarModo() {
    const dz = D();
    if (!dz || !dz.camMode) return;
    dz.camMode = false;
    $q("#dzCamBtn")?.classList.remove("active");
    const k = $q("#tlCamKey"); if (k) k.hidden = true;
    if (porCamara) verPorCamara(false);
    global.dzCamOverlay?.();
    pintarPanel(); pintarRecorrido();
  }

  function envolver(nombre, despues, antes) {
    const orig = global[nombre];
    if (typeof orig !== "function" || orig.__cam2d) return;
    const f = function () {
      if (antes) antes.apply(this, arguments);
      const r = orig.apply(this, arguments);
      try { despues && despues.apply(this, [r, ...arguments]); } catch (e) { console.warn("[cámara 2D]", nombre, e); }
      return r;
    };
    // las marcas de otros envoltorios viajan con la función (el guard del rig
    // se reconoce por `dzSetTool.__conModo`; perderla lo daba por desenganchado)
    Object.assign(f, orig);
    f.__cam2d = true;
    global[nombre] = f;
  }

  function enganchar() {
    global.dzCamAt = camaraEn;
    global.dzCamSetKey = (cam) => ponerClave(cam, "Mover la cámara · cuadro " + cuadro());
    global.dzCamKeyToggle = alternarClave;
    // el modo cámara prende y apaga el panel y el recorrido
    envolver("dzCamToggle", () => { suscribir(); if (!D().camMode && porCamara) verPorCamara(false); pintarPanel(); pintarRecorrido(); });
    // otra herramienta (o Escape) apaga el modo cámara: antes quedaba el botón
    // prendido con el encuadre muerto
    envolver("dzSetTool", null, (t) => { if (t !== "camera") apagarModo(); });
    // el recorrido sigue al zoom, al paneo y a la mesa giratoria
    envolver("dzApplyZoom", () => pintarRecorrido());
    envolver("dzCamOverlay", () => { rotular(); if (D().camDrag) pintarRecorrido(); });
    // los campos de la barra de opciones de la herramienta: nunca tuvieron oyentes
    envolver("dzToolOptsRender", () => {
      if ((D().tool || "") !== "camera") return;
      const v = vb();
      const leer = (id) => Number($q("#" + id)?.value);
      const aplicar = () => {
        const base = global.dzCamCur();
        ponerClave({ ...base, cx: leer("toCamX"), cy: leer("toCamY"), w: v[2] / Math.max(0.05, leer("toCamZoom") / 100), rot: leer("toCamRot") },
          "Cámara desde la barra · cuadro " + cuadro());
      };
      ["toCamX", "toCamY", "toCamZoom", "toCamRot"].forEach((id) => { const el = $q("#" + id); if (el) el.onchange = aplicar; });
      const k = $q("#toCamKey"); if (k) k.onclick = () => { alternarClave(); global.dzToolOptsRender(); };
      const r = $q("#toCamReset"); if (r) r.onclick = () => { planoCompleto(); global.dzToolOptsRender(); };
    });
    // el espacio Cámara ES el modo cámara; los otros espacios lo apagan
    envolver("dzWsAplicar", (_r, ws) => {
      const dz = D();
      if (!ws || !dz) return;
      if (ws.id === "camera" && !dz.camMode && hayDocumento()) global.dzCamToggle();
      else if (ws.id !== "camera" && dz.camMode) {
        const box = $q("#dzCam"), oculto = box && box.hidden;
        global.dzCamToggle();
        if (box && oculto) box.hidden = true;     // ese espacio no muestra el encuadre
      }
    });
    // dzDocInit es async: el documento nuevo recién está al terminar
    envolver("dzDocInit", (r) => Promise.resolve(r).then(() => {
      suscribir(); pintarPanel(); pintarRecorrido();
      const W = global.LOW?.workspace?.workspaces;
      if (W?.activeId === "camera" && !D().camMode) global.dzCamToggle();
    }));
    suscribir();
    pintarPanel();
  }

  global.LOW = global.LOW || {};
  global.LOW.camara2d = { camaraEn, cambiar, ponerClave, alternarClave, ponerCurva, mover, temblor,
    encuadrarSeleccion, planoCompleto, borrarTodas, borrarClave, verPorCamara, pintarPanel, pintarRecorrido,
    CURVAS, MOVIMIENTOS, get duracion() { return duracion; }, set duracion(n) { duracion = Math.max(2, Math.round(n) || 24); },
    // v3.36: el método inicio → fin
    desdeYHasta, encuadreDeInicio, encuadreFinal, verMovimiento, alargarEscena, saltarClave, mudarClave, playPorCamara, pista, rotular,
    viendoPorCamara: () => !!porCamara };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
