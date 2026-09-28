/* ══════════════════════════════════════════════════════════════════════════
   UN VENDOR QUE NO CARGÓ NO PUEDE LLEVARSE PUESTA LA APLICACIÓN

   Medido en la máquina de Mauro, v4.45.0, 2026-09-19 21:05. El log dijo:

       ── arranque ── LOW v4.45.0 · python 3.13.15 · win32 · CONGELADO
       [js] init: CodeMirror is not defined
       [fallo] fallo-20260919-210512.json

   y lo que él vio fue otra cosa: «el sistema de selección se rompió, no
   selecciona bien, arrastrando no selecciona nada, y la pantalla de inicio se
   queda clavada». Tres síntomas, una causa.

   Por qué tres: `init()` es UNA función, y `cm = CodeMirror(...)` está en su
   TERCERA línea. Al tirar ahí, NADA de lo que viene después llega a correr —el
   cableado de selección, los paneles, el «init ok»—. Un archivo que no cargó se
   ve, desde afuera, como una aplicación a medio armar que además no avisa.

   Al relanzar arrancó bien (21:06 «init ok»), así que la carga del vendor falla
   de a ratos, no siempre. Eso descarta un archivo faltante y apunta a la
   lectura: primer arranque después de instalar, con el antivirus mirando los
   archivos recién extraídos.

   Entonces dos cosas, en este orden:

   1. REINTENTAR el vendor. Arregla el caso intermitente, que es el que pasó.
   2. Si aun así no está, poner un editor INERTE con la misma forma que la
      aplicación usa —trece métodos, medidos sobre el código, no inventados— y
      dejar que `init()` siga de largo. El editor de código es UNA parte; perderla
      no puede costar el lienzo.

   Se envuelve `init` desde afuera en vez de tocar `app.js`: el presupuesto de
   §12 está justo en el techo, y además esto es una preocupación separada.

   @module core/editor-resiliente
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const core = LOW.core = LOW.core || {};

  /** `api` es `const` en app.js: leerlo como `global.api` da undefined EN
   *  SILENCIO y el aviso no llegaría nunca al log, que es justo donde hay que
   *  poder leerlo después. Se nombra suelto, con guarda. */
  const avisarAlPuente = (msg) => {
    try {
      const puente = (typeof api !== "undefined") ? api : null;
      if (puente) puente.log_js(msg);
    } catch (_) { /* sin puente todavía */ }
  };

  /** Reintenta cargar el vendor del editor. Devuelve si quedó disponible. */
  async function asegurar() {
    if (typeof global.CodeMirror !== "undefined") return true;
    const tag = document.querySelector('script[src*="codemirror.min.js"]');
    const src = tag ? tag.getAttribute("src") : "vendor/codemirror.min.js";
    try {
      await new Promise((listo, falla) => {
        const s = document.createElement("script");
        // consulta distinta a propósito: si lo que falló fue una respuesta
        // cacheada a medias, pedir la misma URL devolvería lo mismo
        s.src = src.split("?")[0] + "?reintento=" + Date.now();
        s.onload = listo;
        s.onerror = () => falla(Error("no cargó " + s.src));
        document.head.appendChild(s);
      });
    } catch (_) { /* se informa abajo; el arranque sigue igual */ }
    const hay = typeof global.CodeMirror !== "undefined";
    // Los MODOS se cargan después de la base y cada uno llama a
    // `CodeMirror.defineMode`: si la base no estaba, fallaron todos en
    // cascada. Recuperada la base hay que recuperarlos, o el editor vuelve
    // pero sin coloreado y sin decir por qué.
    if (hay) await recargarModos();
    avisarAlPuente(hay ? "CodeMirror cargó en el reintento"
                       : "CodeMirror NO cargó ni reintentando: sigo sin editor de código");
    return hay;
  }

  /** Vuelve a pedir los modos de coloreado que fallaron con la base. */
  async function recargarModos() {
    const modos = [...document.querySelectorAll('script[src*="vendor/mode-"]')];
    await Promise.all(modos.map((tag) => new Promise((listo) => {
      const s = document.createElement("script");
      s.src = tag.getAttribute("src").split("?")[0] + "?reintento=" + Date.now();
      s.onload = listo; s.onerror = listo;      // un modo que falta no frena al resto
      document.head.appendChild(s);
    })));
  }

  /** El editor inerte. No finge funcionar: el área lo dice y el resto anda. */
  function inerte() {
    const hacerDoc = (texto = "") => ({ __texto: String(texto == null ? "" : texto) });
    const editor = (texto) => {
      let doc = hacerDoc(texto);
      return {
        getValue: () => doc.__texto,
        setValue: (v) => { doc.__texto = String(v == null ? "" : v); },
        lineCount: () => doc.__texto.split(String.fromCharCode(10)).length,
        swapDoc: (nuevo) => { const previo = doc; doc = nuevo || hacerDoc(); return previo; },
        getCursor: () => ({ line: 0, ch: 0 }),
        operation: (fn) => (typeof fn === "function" ? fn() : undefined),
        refresh() {}, focus() {}, setCursor() {}, scrollIntoView() {},
        addLineClass() {}, removeLineClass() {}, setOption() {}, on() {},
      };
    };
    const falso = (host, opciones) => editor(opciones && opciones.value);
    falso.Doc = (contenido) => hacerDoc(contenido);
    global.CodeMirror = falso;
    global.__sinCodeMirror = true;
    const caja = document.querySelector("#cmwrap");
    if (caja && !caja.dataset.sinEditor) {
      caja.dataset.sinEditor = "1";
      caja.textContent = "El editor de código no cargó en este arranque. " +
        "El resto de LOW funciona; reiniciá para recuperarlo.";
    }
    try { global.sysMsg("El editor de código no cargó (vendor/codemirror.min.js). " +
      "El resto de LOW funciona; reiniciá para recuperarlo."); } catch (_) { /* UI no lista */ }
    avisarAlPuente("editor de código inerte: la aplicación sigue sin él");
  }

  /** Envuelve `init` para asegurarse del vendor ANTES de que lo use.
   *
   *  `init` es una declaración de función en un script clásico, así que vive en
   *  el objeto global y el listener de `pywebviewready` la resuelve por nombre:
   *  reemplazarla acá alcanza, y `app.js` no cambia ni una línea. */
  function envolver() {
    const original = global.init;
    if (typeof original !== "function" || original.__resiliente) return false;
    const envuelto = async function (...args) {
      if (!(await asegurar())) inerte();
      return original.apply(this, args);
    };
    envuelto.__resiliente = true;
    global.init = envuelto;
    return true;
  }

  core.editorResiliente = { asegurar, inerte, envolver };
  // este módulo carga DESPUÉS de app.js, así que `init` ya existe
  envolver();
})(window);
