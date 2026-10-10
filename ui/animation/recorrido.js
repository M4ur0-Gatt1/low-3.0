/* ══════════════════════════════════════════════════════════════════════════
   SEGUIR UN RECORRIDO: EL OBJETO VA POR EL ARCO DIBUJADO, MARCA POR MARCA

   Pedido de Mauro (oct-2026, LOW 3.14): «¿se podría hacer que al dibujar un
   arco —en la referencia es un infinito, tipo Moebius— con las marcas para
   los intermedios, el programa haga recorrer el objeto por el recorrido
   marcado? Lo ideal es dibujarlo en una capa de referencia y que el objeto a
   animar esté en la siguiente y respete ese flujo. Así ahorraría bastante
   tiempo de intercalado».

   Es la «carta de espaciado» del dibujo animado clásico, hecha herramienta
   (como el recorrido de Toon Boom o el «seguir trazado» de Moho):

     · en una capa de REFERENCIA se dibuja el recorrido —un trazo largo, abierto
       o cerrado— y se lo cruza con rayitas cortas: cada rayita es un cuadro;
       juntas = lento, separadas = rápido;
     · en la capa del objeto, parado en el cuadro donde empieza, se elige el
       objeto y se aprieta «Seguir un recorrido» (botón de la línea de tiempo,
       menú Animación o Alt+R);
     · LOW pone el objeto sobre cada marca, en orden, un cuadro por marca,
       empezando por la marca más cercana al objeto. Sin marcas, pide cuántos
       cuadros y con qué curva.

   Lo que se decide en la ventana: el sentido, si el objeto GIRA siguiendo el
   recorrido, y si los cuadros REEMPLAZAN a los que siguen o se INSERTAN.
   Todo entra en un solo paso de Ctrl+Z. La capa de referencia no se toca.

   CÓMO SE LEE LA REFERENCIA. El dibujo de la otra capa se arma en una hoja
   oculta del mismo tamaño y se mide con la geometría de SVG
   (getTotalLength/getPointAtLength), con sus transformaciones. El trazo más
   largo es el recorrido; los cortos que lo cruzan, las marcas: cada marca
   vale el punto del recorrido más cercano a su centro. Un trazo de pincel es
   una cinta rellena: se mide por uno de sus bordes (queda a medio grosor de
   la línea del centro, unas pocas unidades).

   @module animation/recorrido
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s) => document.querySelector(s);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  /* ── leer la referencia ─────────────────────────────────────────────────── */
  let hojaOculta = null;
  function hoja(vb) {
    if (!hojaOculta || !hojaOculta.isConnected) {
      hojaOculta = document.createElementNS(NS, "svg");
      hojaOculta.setAttribute("aria-hidden", "true");
      hojaOculta.style.cssText = "position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none";
      document.body.appendChild(hojaOculta);
    }
    hojaOculta.setAttribute("viewBox", vb.join(" "));
    hojaOculta.setAttribute("width", vb[2]); hojaOculta.setAttribute("height", vb[3]);
    hojaOculta.innerHTML = "";
    return hojaOculta;
  }
  /** Los puntos de un trazo, en unidades del documento, cada `paso`. */
  function muestrear(el, raiz, paso) {
    let L = 0;
    try { L = el.getTotalLength(); } catch (_) { return null; }
    if (!(L > 0)) return null;
    // una cinta de pincel (relleno sin trazo): su contorno va por un borde y
    // vuelve por el otro; se usa la primera mitad
    const fill = (el.getAttribute("fill") || "").toLowerCase(), stroke = (el.getAttribute("stroke") || "").toLowerCase();
    const esCinta = el.getAttribute("data-low") === "brush" || (fill && fill !== "none" && (!stroke || stroke === "none"));
    const largoUtil = esCinta ? L / 2 : L;
    let m = null;
    try { m = raiz.getScreenCTM().inverse().multiply(el.getScreenCTM()); } catch (_) { m = null; }
    const pts = [];
    for (let s = 0; s <= largoUtil + 1e-6; s += paso) {
      const p = el.getPointAtLength(Math.min(s, largoUtil));
      pts.push(m ? [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f] : [p.x, p.y]);
    }
    return pts;
  }
  const largo = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  function caja(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, cx: (x + Math.max(...xs)) / 2, cy: (y + Math.max(...ys)) / 2 };
  }

  /** Lee el dibujo de una capa en el cuadro: el recorrido y sus marcas. */
  function leerReferencia(doc, layerId, frame) {
    const sc = doc.scene, dw = sc.drawingAt(layerId, frame);
    if (!dw || !dw.content) return { error: "esa capa no tiene dibujo en este cuadro" };
    const vb = [0, 0, sc.width || 1920, sc.height || 1080];
    const raiz = hoja(vb);
    raiz.innerHTML = dw.content;
    raiz.querySelectorAll("[data-low-page]").forEach((n) => n.remove());
    const trazos = [...raiz.querySelectorAll("path, line, polyline, polygon, circle, ellipse, rect")]
      .map((el) => ({ el, pts: muestrear(el, raiz, 2) })).filter((t) => t.pts && t.pts.length > 1);
    if (!trazos.length) return { error: "no encontré trazos en esa capa" };
    trazos.forEach((t) => { t.L = largo(t.pts); t.caja = caja(t.pts); });
    trazos.sort((a, b) => b.L - a.L);
    const camino = trazos[0];
    if (camino.L < 40) return { error: "el trazo más largo de esa capa es muy corto para ser un recorrido" };
    const P = camino.pts;
    // largo acumulado de cada muestra
    const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = s[s.length - 1];
    const cerrado = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < Math.max(12, total * .03);
    // las marcas: trazos cortos que tocan el recorrido
    const umbral = Math.max(8, total * .004);
    const marcas = [];
    for (const t of trazos.slice(1)) {
      const tam = Math.max(t.caja.w, t.caja.h);
      if (tam > total * .2) continue;                       // otro trazo largo: no es una marca
      const c = [t.caja.cx, t.caja.cy], alcance = tam / 2 + umbral;
      // EN UN CRUCE (el centro del infinito) el recorrido pasa DOS veces por
      // el mismo punto, y «el punto más cercano» es cualquiera de las dos
      // pasadas: la pelota saltaba al cruce fuera de orden. Una marca se
      // dibuja CRUZANDO su tramo: de los tramos cercanos, el que la marca
      // atraviesa más de frente.
      const tp = t.pts, tx = tp[tp.length - 1][0] - tp[0][0], ty = tp[tp.length - 1][1] - tp[0][1], tl = Math.hypot(tx, ty) || 1;
      let mejor = null;
      for (let i = 0; i < P.length; i++) {
        const d = Math.hypot(P[i][0] - c[0], P[i][1] - c[1]);
        if (d > alcance) continue;
        // un mínimo local de distancia por tramo
        const dPrev = i > 0 ? Math.hypot(P[i - 1][0] - c[0], P[i - 1][1] - c[1]) : Infinity;
        const dNext = i < P.length - 1 ? Math.hypot(P[i + 1][0] - c[0], P[i + 1][1] - c[1]) : Infinity;
        if (d > dPrev || d > dNext) continue;
        const j = Math.min(P.length - 1, i + 1), k = Math.max(0, i - 1);
        const gx = P[j][0] - P[k][0], gy = P[j][1] - P[k][1], gl = Math.hypot(gx, gy) || 1;
        const deFrente = Math.abs((gx * tx + gy * ty) / (gl * tl));   // 0 = perpendicular
        const nota = deFrente + d / (alcance * 4);
        if (!mejor || nota < mejor.nota) mejor = { nota, i };
      }
      if (!mejor) continue;                                 // no lo cruza
      marcas.push(s[mejor.i]);
    }
    marcas.sort((a, b) => a - b);
    // dos rayitas casi en el mismo lugar son la misma marca
    const unicas = marcas.filter((m, i) => !i || m - marcas[i - 1] > 3);
    return { P, s, total, cerrado, marcas: unicas };
  }

  /** El punto y la tangente a una distancia `d` del inicio del recorrido. */
  function enElCamino(ref, d) {
    const { P, s, total, cerrado } = ref;
    d = cerrado ? ((d % total) + total) % total : Math.max(0, Math.min(total, d));
    let i = 1; while (i < s.length - 1 && s[i] < d) i++;
    const f = s[i] > s[i - 1] ? (d - s[i - 1]) / (s[i] - s[i - 1]) : 0;
    const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f;
    const a = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
    return { x, y, a };
  }
  /** La distancia sobre el recorrido del punto más cercano a (x, y). */
  function proyectar(ref, x, y) {
    let mejor = Infinity, i0 = 0;
    ref.P.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < mejor) { mejor = d; i0 = i; } });
    return { d: ref.s[i0], lejos: mejor };
  }

  /** Las distancias, en orden, donde va el objeto en cada cuadro. */
  function paradas(ref, inicio, opciones) {
    const { total, cerrado } = ref;
    const sentido = opciones.invertir ? -1 : 1;
    const rel = (d) => { const r = (d - inicio) * sentido; return cerrado ? ((r % total) + total) % total : r; };
    if (ref.marcas.length >= 2) {
      let lista = ref.marcas.map((d) => ({ d, r: rel(d) }));
      if (!cerrado) lista = lista.filter((m) => m.r >= -12);  // abierto: lo que queda por delante (y la marca de recién, si está a un paso)
      // el objeto rara vez está EXACTO sobre una marca: si está cerca de una
      // (menos de media distancia a la siguiente), arranca en ella. Medido en
      // la app real: a 5 unidades de la primera marca, sumaba un cuadro extra
      // casi en el mismo lugar y el movimiento tropezaba al empezar.
      if (cerrado) {
        const ant = lista.reduce((m, x) => (x.r > m.r ? x : m), lista[0]);   // la marca de «atrás» (r cercano a total)
        if (total - ant.r < Math.abs(lista.reduce((m, x) => (x.r < m.r ? x : m), lista[0]).r)) ant.r -= total;
      }
      lista.sort((a, b) => a.r - b.r);
      const out = lista.map((m) => m.d);
      const hueco = lista.length > 1 ? Math.abs(lista[1].r - lista[0].r) : total;
      if (!out.length || Math.abs(lista[0].r) > Math.max(12, hueco / 2)) out.unshift(inicio);   // lejos de toda marca: su lugar es el primer cuadro
      return out;
    }
    // sin marcas: N cuadros con una curva
    const n = Math.max(2, Math.round(opciones.cuadros || 12));
    const ease = (global.DZ_EASES && global.DZ_EASES[opciones.curva]) || ((t) => t);
    const fin = cerrado ? total : (sentido > 0 ? total - inicio : inicio);
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = cerrado ? k / n : k / (n - 1);
      out.push(inicio + sentido * fin * ease(t));
    }
    return out;
  }

  /* ── escribir los cuadros ──────────────────────────────────────────────── */
  function centroEnDocumento(el) {
    const r = el.getBoundingClientRect();
    const p = global.dzToUser(r.left + r.width / 2, r.top + r.height / 2);
    return [p.x, p.y];
  }

  function generar(ref, el, opciones) {
    const d = dz(), doc = d.doc, F = doc.frame, capa = doc.layer;
    if (!capa) return { error: "no hay capa activa" };
    if (capa.locked) return { error: "la capa del objeto está bloqueada" };
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const [ox, oy] = centroEnDocumento(el);
    const inicio = proyectar(ref, ox, oy).d;
    const lista = paradas(ref, inicio, opciones);
    if (lista.length < 2) return { error: "con esas marcas no hay más de un cuadro" };
    const a0 = enElCamino(ref, lista[0]).a;
    let local = [0, 0];
    try { const b = el.getBBox(); local = [b.x + b.width / 2, b.y + b.height / 2]; } catch (_) { /* sin caja */ }
    // el objeto marcado, para encontrarlo en cada copia
    el.setAttribute("data-recorrido", "1");
    let base;
    try { base = global.dzCanvasInner(); } finally { el.removeAttribute("data-recorrido"); }
    const vb = global.dzVB ? global.dzVB() : [0, 0, doc.scene.width || 1920, doc.scene.height || 1080];
    const contenidos = lista.map((dist) => {
      const q = enElCamino(ref, dist);
      const tmp = document.createElementNS(NS, "svg");
      tmp.setAttribute("viewBox", vb.join(" "));
      tmp.innerHTML = base;
      const e2 = tmp.querySelector('[data-recorrido="1"]');
      if (!e2) return null;
      e2.removeAttribute("data-recorrido");
      global.dzWritePos(e2, global.dzReadPos(e2), q.x - ox, q.y - oy);
      if (opciones.girar) {
        // gira alrededor de su PROPIO centro (coordenadas locales), después del
        // corrimiento: matrix(corrimiento) rotate(giro cx cy)
        const giro = (q.a - a0) * 180 / Math.PI;
        const tr = e2.getAttribute("transform") || "";
        e2.setAttribute("transform", (tr ? tr + " " : "") + "rotate(" + giro.toFixed(2) + " " + local[0].toFixed(2) + " " + local[1].toFixed(2) + ")");
      }
      return tmp.innerHTML;
    });
    if (contenidos.some((c) => c == null)) return { error: "no encontré el objeto en la copia del dibujo" };

    const h = doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Seguir un recorrido");
    try {
      if (opciones.insertar && contenidos.length > 1) doc.apply("insert", F + 1, contenidos.length - 1);
      const nivel = doc.level;
      const usados = nivel && typeof nivel.numbers === "function" ? nivel.numbers() : [];
      let numero = (usados.length ? Math.max.apply(null, usados) : 0) + 1;
      contenidos.forEach((c, k) => {
        const f = F + k;
        doc.setCell(f, numero++, capa.id);
        doc.goTo(f);
        doc.writeDrawing(c, { label: "Seguir un recorrido" });
      });
    } finally { if (tx) h.commit(); }
    if (typeof global.dzDocGoTo === "function") { doc.goTo(F); const dw = doc.drawing; global.dzCanvasSet?.(dw ? dw.content : ""); }
    else doc.goTo(F);
    doc.emit("cells"); doc.emit("frame");
    return { cuadros: contenidos.length, desde: F, hasta: F + contenidos.length - 1 };
  }

  /* ── la ventana ────────────────────────────────────────────────────────── */
  function capasCandidatas(doc, frame, propia) {
    const out = [];
    for (const ly of doc.scene.layers || []) {
      if (ly.id === propia) continue;
      const r = leerReferencia(doc, ly.id, frame);
      if (!r.error) out.push({ ly, r });
    }
    // primero la que se llama «referencia», «recorrido» o «guía»; después la de recorrido más largo
    out.sort((a, b) => (/ref|recorr|gu[ií]a|arco/i.test(b.ly.name) - /ref|recorr|gu[ií]a|arco/i.test(a.ly.name)) || (b.r.total - a.r.total));
    return out;
  }

  function abrir() {
    const d = dz();
    if (!d || !d.doc) return avisar("🛤 Seguir un recorrido trabaja sobre una escena (.low)");
    const el = d.multi && d.multi.length > 1 ? null : d.sel;
    if (!el || !el.isConnected) return avisar("🛤 Elegí el objeto a animar (con la flecha) en el cuadro donde empieza, y después «Seguir un recorrido»");
    const doc = d.doc, F = doc.frame;
    const candidatas = capasCandidatas(doc, F, doc.layerId);
    if (!candidatas.length) return avisar("🛤 No encontré un recorrido: dibujalo en OTRA capa (la de referencia), visible en este cuadro, con rayitas cortas que lo crucen para cada cuadro");
    const opciones = (sel) => candidatas.map((c, i) => `<option value="${i}"${i === sel ? " selected" : ""}>${c.ly.name.replace(/[<&>"]/g, "")}</option>`).join("");
    global.openModal(`<h2>🛤 Seguir un recorrido</h2>
      <div class="sub" id="recDesc"></div>
      <div class="dz-style-row"><span class="dz-hint">Recorrido en la capa</span><select id="recCapa" class="langsel">${opciones(0)}</select></div>
      <div class="dz-style-row" id="recSinMarcas"><span class="dz-hint">Cuadros</span><input type="number" id="recN" class="dz-win" value="12" min="2" max="240">
        <span class="dz-hint">Curva</span><select id="recEase" class="langsel"><option value="linear">Lineal</option><option value="in">Acelera</option><option value="out">Frena</option><option value="inout" selected>Acelera y frena</option></select></div>
      <div class="dz-style-row"><label class="dz-hint"><input type="checkbox" id="recInv"> invertir el sentido</label>
        <label class="dz-hint"><input type="checkbox" id="recGirar"> que gire siguiendo el recorrido</label></div>
      <div class="dz-style-row"><label class="dz-hint"><input type="radio" name="recModo" id="recReemplazar" checked> reemplazar los cuadros que siguen</label>
        <label class="dz-hint"><input type="radio" name="recModo" id="recInsertar"> insertarlos (corre lo que sigue)</label></div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="recGo">🛤 Generar</button></div>`);
    const pintar = () => {
      const c = candidatas[+$q("#recCapa").value || 0], r = c.r;
      const n = r.marcas.length;
      $q("#recDesc").textContent = (r.cerrado ? "Recorrido cerrado" : "Recorrido abierto") + " de " + Math.round(r.total) + " unidades · " +
        (n >= 2 ? n + " marcas → un cuadro por marca, desde el cuadro " + F + " (juntas = lento, separadas = rápido)"
          : "sin marcas: elegí cuántos cuadros y la curva");
      $q("#recSinMarcas").hidden = n >= 2;
    };
    $q("#recCapa").onchange = pintar; pintar();
    $q("#mCancel").onclick = global.closeModal;
    $q("#recGo").onclick = () => {
      const c = candidatas[+$q("#recCapa").value || 0];
      const r = generar(c.r, el, { invertir: $q("#recInv").checked, girar: $q("#recGirar").checked, insertar: $q("#recInsertar").checked,
        cuadros: +$q("#recN").value || 12, curva: $q("#recEase").value });
      global.closeModal();
      if (r.error) return avisar("🛤 " + r.error);
      avisar("🛤 " + r.cuadros + " cuadros por el recorrido (" + r.desde + "–" + r.hasta + ") · Ctrl+Z los saca todos");
    };
  }

  function enganchar() {
    const b = document.getElementById("tlRecorrido");
    if (b) b.onclick = () => abrir();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();

  global.dzRecorrido = abrir;
  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.recorrido = { leerReferencia, paradas, enElCamino, proyectar, generar, abrir };
})(window);
