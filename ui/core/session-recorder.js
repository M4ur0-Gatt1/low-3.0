/* ══════════════════════════════════════════════════════════════════════════
   EL INSTRUMENTO DE LA PRUEBA MAESTRA (§15)

   La §15 de la biblia no pide solamente que alguien ajeno complete el proyecto.
   Pide, con estas palabras: «El proceso debe quedar grabado como prueba
   repetible y medirse en errores, tiempo, interrupciones y necesidad de ayuda».

   Ese instrumento no existía, y era lo que bloqueaba el único punto que puede
   mover la nota del producto: sin él, una corrida de la prueba maestra deja una
   impresión —«anduvo bien», «se trabó un par de veces»— y no un dato con el que
   comparar la corrida siguiente.

   QUÉ MIDE, y de dónde sale cada cosa:

   · TIEMPO por paso. Del reloj, entre «empecé» y «terminé». Es lo único que el
     instrumento mide solo y sin discusión.
   · ERRORES. NO se preguntan. Se cuentan enganchando los mismos eventos que ya
     usa el informe de fallo (`error` y `unhandledrejection`), y se atribuyen al
     paso que estaba abierto. Un número de errores auto-reportado no vale nada:
     nadie recuerda cuántas veces algo falló mientras trabajaba.
   · NECESIDAD DE AYUDA. Esto sí lo marca la persona, porque es lo único que
     sólo ella sabe: cuándo se quedó trabada. Queda con el paso y con su nota.
   · INTERRUPCIONES. De la bitácora anterior: si la sesión previa quedó sin
     cerrar, el programa se fue abajo o se lo cerró a la fuerza. Eso es una
     interrupción, y no hace falta que nadie se acuerde de anotarla.

   REPETIBLE quiere decir comparable: cada corrida deja un JSON con el mismo
   esqueleto —los doce pasos con su id estable y la versión del protocolo— más
   un resumen legible. Dos corridas se ponen una al lado de la otra.

   LO QUE EL INSTRUMENTO NO HACE, a propósito:

   · No deja marcar un paso terminado que nunca se empezó. Un tiempo inventado
     ensucia la única medición limpia que hay.
   · No sugiere ni ayuda. Es un cronómetro con libreta, no un tutorial: si
     guiara, la prueba dejaría de medir lo que pretende medir.

   Se carga después de app.js y no le agrega ni una línea: la entrada de menú se
   atiende interceptando el clic en fase de captura, porque la tabla de acciones
   de `dzMenuAction` es local a esa función y no se puede extender de afuera.

   @module core/session-recorder
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  const LOW = global.LOW = global.LOW || {};
  const core = LOW.core = LOW.core || {};

  /* Los doce pasos de §15, en el orden y con el texto de la biblia. El id es
     estable para que dos corridas se puedan comparar aunque el texto se
     reformule; hay un contrato en CI que verifica que sigan siendo doce y que
     coincidan con docs/LOW_BIBLIA_PRODUCCION.md. */
  const PASOS = Object.freeze([
    { id: "p01", texto: "Crear un documento 2D." },
    { id: "p02", texto: "Dibujar con tableta un personaje en capas de línea y color." },
    { id: "p03", texto: "Seleccionar, agrupar, rotar, duplicar y editar formas con precisión." },
    { id: "p04", texto: "Crear varios dibujos y organizar exposiciones en X-sheet." },
    { id: "p05", texto: "Importar un segundo personaje por piezas." },
    { id: "p06", texto: "Colocar una plantilla de esqueleto, adaptarla y vincularla." },
    { id: "p07", texto: "Probar FK e IK sin romper las piezas." },
    { id: "p08", texto: "Animar una caminata con claves y curvas." },
    { id: "p09", texto: "Añadir cámara, profundidad, audio y composición." },
    { id: "p10", texto: "Guardar, cerrar, reabrir y continuar sin diferencias." },
    { id: "p11", texto: "Exportar un resultado idéntico a la previsualización." },
    { id: "p12", texto: "Recuperar el proyecto después de un cierre forzado." },
  ]);

  const PROTOCOLO = 1;                 // sube si cambia la FORMA de la bitácora
  const CLAVE = "low.prueba15.v1";

  /* ── El modelo. Sin DOM, para poder probarlo aparte ────────────────────── */

  class Prueba15 {
    constructor(datos = null) {
      this.protocolo = PROTOCOLO;
      this.abierta = null;                     // id del paso en curso
      this.inicio = datos?.inicio || new Date().toISOString();
      this.cerrada = datos?.cerrada || null;
      this.persona = datos?.persona || "";
      this.version = datos?.version || "";
      this.interrupciones = Number(datos?.interrupciones) || 0;
      this.pasos = PASOS.map(p => {
        const previo = datos?.pasos?.find(x => x.id === p.id);
        return { id: p.id, texto: p.texto,
          inicio: previo?.inicio || null, fin: previo?.fin || null,
          segundos: Number(previo?.segundos) || 0,
          errores: Number(previo?.errores) || 0,
          ayudas: Array.isArray(previo?.ayudas) ? previo.ayudas.slice() : [],
          resultado: previo?.resultado || null };
      });
      if (datos?.abierta && this.pasos.some(p => p.id === datos.abierta)) this.abierta = datos.abierta;
    }
    paso(id) { return this.pasos.find(p => p.id === id) || null; }

    empezar(id) {
      const p = this.paso(id); if (!p) return false;
      if (this.abierta && this.abierta !== id) this.pausar();
      p.inicio = p.inicio || new Date().toISOString();
      p.marca = Date.now();
      this.abierta = id;
      return true;
    }
    /** Guarda el tiempo corrido del paso abierto sin cerrarlo. */
    pausar() {
      const p = this.abierta && this.paso(this.abierta); if (!p) return false;
      if (p.marca) { p.segundos += Math.max(0, Math.round((Date.now() - p.marca) / 1000)); p.marca = 0; }
      this.abierta = null;
      return true;
    }
    /** `resultado`: "ok" | "no pude". Un paso que nunca se empezó NO se puede
     *  terminar: el tiempo es la única medición limpia y no se inventa. */
    terminar(id, resultado = "ok") {
      const p = this.paso(id); if (!p || !p.inicio) return false;
      if (this.abierta === id) this.pausar();
      p.fin = new Date().toISOString();
      p.resultado = p.ayudas.length && resultado === "ok" ? "con ayuda" : resultado;
      return true;
    }
    /** La persona marca que se quedó trabada. Va al paso abierto, o al último
     *  empezado si no hay ninguno en curso. */
    ayuda(nota = "") {
      const p = (this.abierta && this.paso(this.abierta))
        || [...this.pasos].reverse().find(x => x.inicio);
      if (!p) return false;
      p.ayudas.push({ cuando: new Date().toISOString(), nota: String(nota || "").slice(0, 400) });
      if (p.resultado === "ok") p.resultado = "con ayuda";
      return true;
    }
    /** Los errores NO se preguntan: se cuentan y se atribuyen al paso abierto.
     *  Los que caen fuera de un paso también cuentan, aparte. */
    error() {
      const p = this.abierta && this.paso(this.abierta);
      if (p) { p.errores++; return p.id; }
      this.erroresFuera = (Number(this.erroresFuera) || 0) + 1;
      return null;
    }
    resumen() {
      const hechos = this.pasos.filter(p => p.resultado === "ok").length;
      const conAyuda = this.pasos.filter(p => p.resultado === "con ayuda").length;
      const noPude = this.pasos.filter(p => p.resultado === "no pude").length;
      return { protocolo: this.protocolo, pasos: this.pasos.length,
        hechosSolo: hechos, conAyuda, noPude,
        sinEmpezar: this.pasos.filter(p => !p.inicio).length,
        segundos: this.pasos.reduce((t, p) => t + p.segundos, 0),
        errores: this.pasos.reduce((t, p) => t + p.errores, 0) + (Number(this.erroresFuera) || 0),
        ayudas: this.pasos.reduce((t, p) => t + p.ayudas.length, 0),
        interrupciones: this.interrupciones,
        // El veredicto de §15 es binario y exigente: los doce pasos, sin ayuda.
        aprobada: hechos === this.pasos.length };
    }
    /** Lo que se guarda. `marca` no va: es del reloj de esta sesión. */
    aJSON() {
      return { protocolo: this.protocolo, inicio: this.inicio, cerrada: this.cerrada,
        persona: this.persona, version: this.version, abierta: this.abierta,
        interrupciones: this.interrupciones, erroresFuera: Number(this.erroresFuera) || 0,
        pasos: this.pasos.map(({ marca, ...resto }) => resto),
        resumen: this.resumen() };
    }
    /** El resumen legible, para poner dos corridas una al lado de la otra. */
    aTexto() {
      const r = this.resumen();
      const mmss = s => Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
      const filas = this.pasos.map((p, i) => "| " + (i + 1) + " | " + p.texto.slice(0, 58) +
        " | " + (p.resultado || "—") + " | " + mmss(p.segundos) + " | " + p.errores +
        " | " + p.ayudas.length + " |").join("\n");
      return `# Prueba maestra §15 — protocolo ${r.protocolo}\n\n` +
        `Persona: ${this.persona || "(sin nombre)"} · LOW ${this.version || "?"}\n` +
        `Inicio: ${this.inicio}${this.cerrada ? " · Fin: " + this.cerrada : " · SIN CERRAR"}\n\n` +
        `**${r.hechosSolo} de ${r.pasos} pasos sin ayuda** · ${r.conAyuda} con ayuda · ` +
        `${r.noPude} no pudo · ${r.sinEmpezar} sin empezar\n` +
        `Tiempo ${mmss(r.segundos)} · ${r.errores} errores · ${r.ayudas} pedidos de ayuda · ` +
        `${r.interrupciones} interrupciones\n\n` +
        `Veredicto: ${r.aprobada ? "APROBADA" : "NO aprobada"}\n\n` +
        `| # | Paso | Resultado | Tiempo | Errores | Ayudas |\n|---|---|---|---|---|---|\n${filas}\n`;
    }
  }

  /* ── Persistencia ──────────────────────────────────────────────────────── */

  function almacen() {
    try { return global.LOW?.safeMode?.preferenceStorage || global.localStorage; }
    catch (_) { return null; }
  }
  function guardarLocal(prueba) {
    try { almacen()?.setItem(CLAVE, JSON.stringify(prueba.aJSON())); } catch (_) { /* sin espacio */ }
  }
  function leerLocal() {
    try { const t = almacen()?.getItem(CLAVE); return t ? JSON.parse(t) : null; } catch (_) { return null; }
  }
  /** La bitácora al disco, por el puente. Devuelve la ruta o null. */
  async function guardarDisco(prueba) {
    if (typeof api === "undefined" || !api || !api.session_log) return null;
    try { return await api.session_log({ json: prueba.aJSON(), texto: prueba.aTexto() }); }
    catch (_) { return null; }
  }

  /* ── El panel ──────────────────────────────────────────────────────────── */

  let PRUEBA = null, PANEL = null;

  function abrir() {
    const previo = leerLocal();
    if (!PRUEBA) {
      PRUEBA = new Prueba15(previo);
      // Una sesión anterior sin cerrar es una interrupción: el programa se fue
      // abajo o se lo cerró a la fuerza. No hace falta que nadie la anote.
      if (previo && !previo.cerrada) PRUEBA.interrupciones = (Number(previo.interrupciones) || 0) + 1;
      PRUEBA.version = (typeof S !== "undefined" && S.version) || PRUEBA.version || "";
      engancharErrores();
      guardarLocal(PRUEBA);
    }
    pintar();
    return PRUEBA;
  }

  let enganchado = false;
  function engancharErrores() {
    if (enganchado) return; enganchado = true;
    const contar = () => { if (PRUEBA) { PRUEBA.error(); guardarLocal(PRUEBA); pintar(true); } };
    global.addEventListener("error", contar);
    global.addEventListener("unhandledrejection", contar);
  }

  function pintar(soloDatos) {
    if (!PRUEBA) return;
    if (!PANEL) {
      PANEL = document.createElement("section");
      PANEL.id = "dzPrueba15";
      PANEL.className = "p15";
      PANEL.innerHTML = `<header class="p15-head">
        <strong>Prueba maestra §15</strong>
        <input class="p15-persona" placeholder="quién la está haciendo" maxlength="60">
        <button data-a="cerrar" title="Cerrar el panel (la prueba sigue guardada)">×</button>
      </header>
      <div class="p15-resumen"></div>
      <ol class="p15-pasos"></ol>
      <footer class="p15-pie">
        <button data-a="ayuda">Necesité ayuda…</button>
        <button data-a="guardar">Guardar bitácora</button>
        <span class="p15-ruta"></span>
      </footer>`;
      document.body.appendChild(PANEL);
      PANEL.querySelector('[data-a="cerrar"]').onclick = () => { PANEL.remove(); PANEL = null; };
      PANEL.querySelector(".p15-persona").oninput = e => {
        PRUEBA.persona = e.target.value.trim(); guardarLocal(PRUEBA);
      };
      PANEL.querySelector('[data-a="ayuda"]').onclick = pedirAyuda;
      PANEL.querySelector('[data-a="guardar"]').onclick = async () => {
        const r = await guardarDisco(PRUEBA);
        const donde = PANEL?.querySelector(".p15-ruta");
        if (donde) donde.textContent = r && r.name ? "Guardada: " + r.name
          : "No pude escribirla en disco (queda guardada acá).";
      };
      arrastrable(PANEL, PANEL.querySelector(".p15-head"));
    }
    const persona = PANEL.querySelector(".p15-persona");
    if (persona && persona.value !== PRUEBA.persona) persona.value = PRUEBA.persona;
    const r = PRUEBA.resumen();
    PANEL.querySelector(".p15-resumen").innerHTML =
      `<b>${r.hechosSolo}/${r.pasos}</b> sin ayuda · ${r.conAyuda} con ayuda · ${r.noPude} no pudo` +
      `<small>${Math.floor(r.segundos / 60)}m ${String(r.segundos % 60).padStart(2, "0")}s · ` +
      `${r.errores} errores · ${r.ayudas} ayudas · ${r.interrupciones} interrupciones</small>`;
    if (soloDatos) return;
    const lista = PANEL.querySelector(".p15-pasos");
    lista.innerHTML = "";
    for (const p of PRUEBA.pasos) {
      const li = document.createElement("li");
      li.className = "p15-paso" + (PRUEBA.abierta === p.id ? " abierto" : "") +
        (p.resultado ? " r-" + p.resultado.replace(/ /g, "-") : "");
      li.dataset.id = p.id;
      li.innerHTML = `<span class="p15-texto">${p.texto}</span>
        <span class="p15-datos">${p.segundos ? Math.round(p.segundos / 60) + "m" : ""}` +
        `${p.errores ? " · " + p.errores + "✕" : ""}${p.ayudas.length ? " · " + p.ayudas.length + "?" : ""}</span>
        <span class="p15-botones">
          <button data-p="empezar" ${p.fin ? "disabled" : ""}>${PRUEBA.abierta === p.id ? "En curso" : "Empezar"}</button>
          <button data-p="ok" ${p.inicio && !p.fin ? "" : "disabled"} title="${p.inicio ? "" : "Primero hay que empezarlo"}">Listo</button>
          <button data-p="no" ${p.inicio && !p.fin ? "" : "disabled"}>No pude</button>
        </span>`;
      li.querySelector('[data-p="empezar"]').onclick = () => { PRUEBA.empezar(p.id); guardarLocal(PRUEBA); pintar(); };
      li.querySelector('[data-p="ok"]').onclick = () => { PRUEBA.terminar(p.id, "ok"); cerrarSiTermino(); };
      li.querySelector('[data-p="no"]').onclick = () => { PRUEBA.terminar(p.id, "no pude"); cerrarSiTermino(); };
      lista.appendChild(li);
    }
  }

  function cerrarSiTermino() {
    if (PRUEBA.pasos.every(p => p.fin)) { PRUEBA.cerrada = new Date().toISOString(); guardarDisco(PRUEBA); }
    guardarLocal(PRUEBA); pintar();
  }

  async function pedirAyuda() {
    let nota = "";
    if (typeof dzPromptModal === "function") {
      nota = await dzPromptModal("¿En qué te quedaste trabado?",
        "lo más concreto posible", "");
      if (nota === null) return;         // canceló: no se registra nada
    }
    PRUEBA.ayuda(nota || "");
    guardarLocal(PRUEBA); pintar();
  }

  /** Arrastre por el encabezado. El panel no puede tapar el trabajo y quedarse
   *  quieto: eso ya fue un reclamo con el panel de Equipo. */
  function arrastrable(panel, asa) {
    asa.addEventListener("pointerdown", e => {
      if (e.target.closest("button, input")) return;
      e.preventDefault();
      const r = panel.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      const mover = ev => {
        panel.style.left = Math.max(0, Math.min(innerWidth - 80, ev.clientX - dx)) + "px";
        panel.style.top = Math.max(0, Math.min(innerHeight - 40, ev.clientY - dy)) + "px";
        panel.style.right = "auto"; panel.style.bottom = "auto";
      };
      const soltar = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); };
      addEventListener("pointermove", mover); addEventListener("pointerup", soltar);
    });
  }

  /* ── La entrada de menú, sin tocar app.js ──────────────────────────────── */

  document.addEventListener("click", event => {
    const item = event.target.closest?.('[data-act="prueba15"]');
    if (!item) return;
    event.stopPropagation();
    abrir();
  }, true);

  core.Prueba15 = Prueba15;
  core.prueba15Pasos = PASOS;
  global.dzPrueba15Abrir = abrir;
  global.dzPrueba15 = () => PRUEBA;
  global.dzPrueba15Panel = () => PANEL;
})(typeof window !== "undefined" ? window : globalThis);
