/* ══════════════════════════════════════════════════════════════════════════
   TUTORIAL: MOVER LA CÁMARA, HACIÉNDOLO

   Pedido de Mauro (oct-2026): «no entiendo bien cómo se maneja el movimiento
   de cámara; mejorá esa interfaz y metodología y hacé un tutorial también».

   No es una lámina para leer: es una tarjeta que pide UN paso por vez y
   avanza sola cuando el paso está HECHO en el documento (el modo cámara
   prendido, una clave de inicio con su encuadre, una clave final distinta, el
   play andando). Donde no hay nada que medir («mirá el recorrido») hay
   «Siguiente». En cada paso, «Hacelo por mí» lo hace, para quien sólo quiere
   ver el resultado.

   El método es el del panel Cámara (animation/camara-2d.js):
     1. encuadre de inicio  →  2. encuadre final  →  3. ▶ ver.

   Se abre desde Ayuda → «Tutorial: mover la cámara», con el «?» del panel
   Cámara, o con la oferta que el panel muestra la primera vez.

   @module animation/camara-tutorial
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const C = () => global.LOW?.camara2d;
  const claves = () => (typeof global.dzCamKeys === "function" ? global.dzCamKeys() : {}) || {};
  const numeros = () => Object.keys(claves()).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const igual = (a, b) => !!(a && b) && Math.abs(a.cx - b.cx) < .05 && Math.abs(a.cy - b.cy) < .05 && Math.abs(a.w - b.w) < .05 && Math.abs((a.rot || 0) - (b.rot || 0)) < .05;
  const reproduciendo = () => !!(D()?.playback && D().playback.playing);

  const PASOS = [
    { id: "modo", titulo: "El marco naranja es la cámara",
      texto: () => (D()?.doc ? "" : "Primero abrí o creá un documento de animación. ") +
        "Lo que queda adentro del marco es lo que se ve en la película. Prendé el <b>modo Cámara</b>: el botón 🎬 Cámara o la tecla <kbd>C</kbd>. A la derecha aparece su panel.",
      hecho: () => !!(D()?.doc && D().camMode),
      porMi: () => { if (!D()?.doc) global.dzMenuAction?.("nuevo"); else if (!D().camMode) global.dzCamToggle?.(); } },
    { id: "inicio", titulo: "1 · Encuadre de inicio",
      texto: () => "En el panel Cámara, paso 1: <b>Ir y encuadrar</b>. Te lleva al cuadro donde empieza la toma. Ahí <b>arrastrá el marco</b> para elegir cómo ARRANCA: el cuerpo lo mueve; la esquina de abajo a la derecha, hacia adentro, acerca.",
      hecho: () => { const { desde } = C()?.desdeYHasta?.() || { desde: 1 }; const k = claves()[desde]; return !!k && !igual(k, global.dzCamDefault?.()); },
      siguiente: "Así arranca ▸",
      porMi: () => { const c = C(); if (!c) return; c.encuadreDeInicio(); const b = global.dzCamCur(); c.ponerClave({ ...b, w: b.w / 1.5 }, "Encuadre de inicio (tutorial)", { sinPartida: true }); } },
    { id: "final", titulo: "2 · Encuadre final",
      texto: () => "Paso 2: poné en qué cuadro termina el movimiento (24 es un segundo) y <b>Ir y encuadrar</b>. Mové el marco a donde TERMINA la toma: el cuerpo lo mueve; la esquina hacia adentro ACERCA y hacia afuera ALEJA; el círculo de arriba lo gira. Con dos claves distintas, la cámara se mueve sola entre ellas.",
      hecho: () => { const ks = numeros(), c = claves(); return ks.length >= 2 && !igual(c[ks[0]], c[ks[ks.length - 1]]); },
      porMi: () => { const c = C(); if (!c) return; c.encuadreFinal(); const b = global.dzCamCur(), v = global.dzVB(); c.ponerClave({ ...b, cx: b.cx + v[2] * .25 }, "Encuadre final (tutorial)"); } },
    { id: "recorrido", titulo: "El recorrido y la curva",
      texto: () => "La línea naranja sobre la hoja es el camino de la cámara: un punto por cuadro. <b>Puntos juntos = va lento, separados = va rápido.</b> En el panel, la <b>Curva</b> de cada tramo cambia cómo acelera: <i>Suave</i> arranca y frena despacio, <i>Constante</i> va pareja, <i>Corte</i> salta de golpe en la clave siguiente.",
      manual: true },
    { id: "play", titulo: "3 · Miralo",
      texto: () => "Paso 3: <b>▶ Ver</b> en el panel (o el play de la línea de tiempo). El play sale <b>por la cámara</b>, igual que la exportación: lo de afuera del marco se oscurece.",
      hecho: reproduciendo,
      porMi: () => C()?.verMovimiento() },
    { id: "listo", titulo: "¡Listo!",
      texto: () => "Ya tenés el método: <b>inicio → final → ▶</b>. Además:<br>· <b>Movimientos</b> hace paneos, acercamientos, giros y temblores de un clic, desde el cuadro donde estás.<br>· En la lista de <b>Claves</b>, editá el número de una clave para mudarla de cuadro (más lejos = más lento); <b>◀ Clave ▶</b> salta entre ellas.<br>· <b>Ctrl+Z</b> deshace cualquier cambio de cámara.",
      fin: true },
  ];

  let tarjeta = null, actual = 0, reloj = 0;
  function montar() {
    if (tarjeta && tarjeta.isConnected) return tarjeta;
    tarjeta = doc.createElement("section");
    tarjeta.id = "dzCamTutorial"; tarjeta.className = "cam-tuto"; tarjeta.hidden = true;
    tarjeta.setAttribute("role", "dialog"); tarjeta.setAttribute("aria-label", "Tutorial: mover la cámara");
    tarjeta.addEventListener("click", (e) => {
      const b = e.target.closest("[data-t]"); if (!b) return;
      const a = b.dataset.t;
      if (a === "cerrar") cerrar();
      else if (a === "atras") ir(Math.max(0, actual - 1));
      else if (a === "sig") ir(Math.min(PASOS.length - 1, actual + 1));
      else if (a === "pormi") { try { PASOS[actual].porMi?.(); } catch (err) { console.warn("[tutorial cámara]", err); } global.setTimeout(revisar, 120); }
    });
    // se arrastra por la cabecera: que no tape lo que hay que tocar
    tarjeta.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !e.target.closest("header") || e.target.closest("button")) return;
      e.preventDefault();
      const r = tarjeta.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mover = (ev) => { tarjeta.style.left = Math.max(4, ev.clientX - dx) + "px"; tarjeta.style.top = Math.max(4, ev.clientY - dy) + "px"; tarjeta.style.bottom = "auto"; };
      const soltar = () => { doc.removeEventListener("pointermove", mover); doc.removeEventListener("pointerup", soltar); };
      doc.addEventListener("pointermove", mover); doc.addEventListener("pointerup", soltar);
    });
    doc.body.appendChild(tarjeta);
    return tarjeta;
  }
  function pintar() {
    const p = PASOS[actual], t = montar();
    t.dataset.paso = p.id;
    const sig = p.manual ? "Siguiente ▸" : p.siguiente;
    t.innerHTML = `
      <header><span class="cam-tuto-n">Paso ${actual + 1} de ${PASOS.length}</span><b>${p.titulo}</b>
        <button type="button" data-t="cerrar" class="cam-tuto-x" aria-label="Cerrar el tutorial" title="Cerrar el tutorial">×</button></header>
      <div class="cam-tuto-barra"><i style="width:${Math.round((actual + 1) / PASOS.length * 100)}%"></i></div>
      <p>${p.texto()}</p>
      <footer>
        ${actual > 0 && !p.fin ? '<button type="button" data-t="atras">◂ Atrás</button>' : "<span></span>"}
        <span class="cam-tuto-acciones">
          ${p.porMi ? '<button type="button" data-t="pormi" title="Hace este paso, para ver el resultado">Hacelo por mí</button>' : ""}
          ${sig ? `<button type="button" data-t="sig" class="principal">${sig}</button>` : ""}
          ${p.fin ? '<button type="button" data-t="cerrar" class="principal">Cerrar</button>' : ""}
        </span>
      </footer>`;
  }
  function ir(n) { actual = n; pintar(); }
  /** Avanza solo mientras los pasos estén hechos (nunca retrocede solo). */
  function revisar() {
    if (!tarjeta || tarjeta.hidden) return;
    let n = actual;
    while (n < PASOS.length - 1 && PASOS[n].hecho && PASOS[n].hecho()) n++;
    if (n !== actual) ir(n);
  }
  function abrir() {
    try { global.localStorage.setItem("low.camara.tutorial.visto", "1"); } catch (_) { /* sin almacenamiento */ }
    montar(); actual = 0; pintar(); tarjeta.hidden = false;
    global.clearInterval(reloj); reloj = global.setInterval(revisar, 300);
    revisar();
    C()?.pintarPanel?.();
  }
  function cerrar() {
    if (tarjeta) tarjeta.hidden = true;
    global.clearInterval(reloj); reloj = 0;
    C()?.pintarPanel?.();
  }
  const abierto = () => !!(tarjeta && !tarjeta.hidden);

  // Ayuda → «Tutorial: mover la cámara»
  function enganchar() {
    const orig = global.dzMenuAction;
    if (typeof orig === "function" && !orig.__camTuto) {
      const f = function (act) { if (act === "tutorialcamara") return abrir(); return orig.apply(this, arguments); };
      Object.assign(f, orig); f.__camTuto = true;
      global.dzMenuAction = f;
    }
  }

  global.LOW = global.LOW || {};
  global.LOW.camaraTutorial = { abrir, cerrar, abierto, revisar, PASOS, get paso() { return PASOS[actual].id; } };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
