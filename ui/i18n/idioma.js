/* ══════════════════════════════════════════════════════════════════════════
   EL IDIOMA DE LA INTERFAZ

   Pedido de Mauro (oct-2026, LOW 3.16): «poder poner el programa en cualquier
   idioma desde las preferencias, pero que el idioma por defecto sea español».

   LOW está escrito en español: cada botón, ayuda y mensaje nace en castellano,
   en el HTML y en cientos de módulos. Reescribir todo eso con claves sería
   tocar miles de líneas y romper la puerta. Así que se hace como gettext: el
   texto en español ES la clave, y cada idioma es un diccionario
   «español → traducción» (ui/i18n/<código>.js).

   Cómo traduce:
     · Al arrancar, y cada vez que algo cambia en la interfaz (un observador
       del DOM), se traducen los textos y los atributos `title`, `aria-label`,
       `placeholder` y `data-titulo-ayuda` (el globo de ayuda guarda ahí el
       title mientras se muestra).
     · El español original de cada nodo queda guardado aparte: al volver a
       Español se restituye tal cual, sin recargar.
     · El dibujo (las hojas svg de #dzCanvas) no se toca nunca, ni lo que escribe la persona
       (campos de texto, editores, nombres que ella puso).
     · Un texto que el diccionario no tiene queda en español: nunca se borra
       ni se inventa nada.
     · Los mensajes con números («Drawing 3 expuesto en el frame 5») se
       traducen con patrones: «{}» en la clave es cualquier cosa, y se repite
       en la traducción en el mismo orden.

   En español no hace NADA: ni observador, ni recorrido. Cero costo.

   Cómo se agrega un idioma: un archivo ui/i18n/<código>.js que haga
   `LOW_I18N.registrar("<código>", "<Nombre>", { "texto": "traducción", … })`
   y su <script> en index.html. `tools/i18n_faltantes.js <código>` lista lo
   que falta traducir en la interfaz viva.

   @module i18n/idioma
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const CLAVE = "low.idioma";
  const ATRIBUTOS = ["title", "aria-label", "placeholder", "data-titulo-ayuda"];
  // el DIBUJO son las hojas <svg> del lienzo (y lo que haya adentro: nombres de
  // huesos, textos dibujados). Los carteles de encima —la cámara, el marco de
  // selección, «2 piezas»— son interfaz y sí se traducen.
  const NO_TOCAR = "#dzCanvas > svg, #dzCanvas svg text, script, style, textarea, input, [contenteditable=''], [contenteditable='true'], .cm-editor, .ace_editor, [data-no-traducir]";

  const idiomas = { es: { nombre: "Español", dic: null, patrones: [] } };
  const originales = new WeakMap();          // nodo de texto → { es, puesto }
  const attrOriginales = new WeakMap();      // elemento → { atributo: { es, puesto } }
  let actual = "es", observador = null, pendiente = null;

  const almacen = () => { try { return typeof global.dzPrefsStorage === "function" ? global.dzPrefsStorage() : global.localStorage; } catch (_) { return null; } };
  const normal = (t) => t.replace(/\s+/g, " ").trim();
  const conLetras = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]/;

  /** Registra (o completa) un idioma. Las claves con «{}» son patrones. */
  function registrar(codigo, nombre, entradas) {
    const i = idiomas[codigo] || (idiomas[codigo] = { nombre, dic: new Map(), patrones: [] });
    i.nombre = nombre || i.nombre;
    for (const [es, otro] of Object.entries(entradas || {})) {
      if (!otro) continue;
      const k = normal(es);
      if (k.includes("{}")) {
        const partes = k.split("{}").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        i.patrones.push({ re: new RegExp("^" + partes.join("(.+?)") + "$"), otro });
      } else i.dic.set(k, otro);
    }
  }

  /** La traducción de un texto en español al idioma actual, o null. */
  function traducir(es, codigo = actual) {
    const i = idiomas[codigo];
    if (!i || !i.dic) return null;
    const k = normal(es);
    if (!k || !conLetras.test(k)) return null;
    const d = i.dic.get(k);
    if (d) return d;
    for (const p of i.patrones) {
      const m = k.match(p.re);
      if (m) { let n = 1; return p.otro.replace(/\{\}/g, () => (m[n++] ?? "")); }
    }
    return null;
  }

  /** Un texto puesto con su espacio de alrededor intacto. */
  function vestir(original, traducido) {
    const ini = original.match(/^\s*/)[0], fin = original.match(/\s*$/)[0];
    return ini + traducido + fin;
  }

  function traducirTexto(nodo) {
    const ahora = nodo.nodeValue;
    const reg = originales.get(nodo);
    // si el texto que hay es el que pusimos, ya está; si cambió, es español nuevo
    const es = reg && reg.puesto === ahora ? reg.es : ahora;
    if (actual === "es") { if (reg && reg.puesto === ahora && ahora !== reg.es) nodo.nodeValue = reg.es; originales.delete(nodo); return; }
    const t = traducir(es);
    if (t == null) { if (reg && reg.puesto === ahora) nodo.nodeValue = reg.es; originales.delete(nodo); return; }
    const puesto = vestir(es, t);
    originales.set(nodo, { es, puesto });
    if (ahora !== puesto) nodo.nodeValue = puesto;
  }

  function traducirAtributos(el) {
    let regs = attrOriginales.get(el);
    for (const a of ATRIBUTOS) {
      if (!el.hasAttribute(a)) continue;
      const ahora = el.getAttribute(a), reg = regs && regs[a];
      const es = reg && reg.puesto === ahora ? reg.es : ahora;
      if (actual === "es") { if (reg) { if (reg.puesto === ahora && ahora !== reg.es) el.setAttribute(a, reg.es); delete regs[a]; } continue; }
      const t = traducir(es);
      if (t == null) { if (reg) { if (reg.puesto === ahora) el.setAttribute(a, reg.es); delete regs[a]; } continue; }
      if (!regs) attrOriginales.set(el, (regs = {}));
      regs[a] = { es, puesto: t };
      if (ahora !== t) el.setAttribute(a, t);
    }
  }

  const afuera = (n) => { const el = n.nodeType === 1 ? n : n.parentElement; return !el || !!el.closest(NO_TOCAR); };

  /** Recorre un subárbol y traduce lo que haya. */
  function recorrer(raiz) {
    if (!raiz || afuera(raiz)) return;
    if (raiz.nodeType === 3) { traducirTexto(raiz); return; }
    if (raiz.nodeType !== 1 && raiz.nodeType !== 9 && raiz.nodeType !== 11) return;
    if (raiz.nodeType === 1) traducirAtributos(raiz);
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(NO_TOCAR)) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.nodeType === 3) { if (conLetras.test(n.nodeValue)) traducirTexto(n); }
      else traducirAtributos(n);
    }
  }

  /* Lo que cambia mientras se usa: los mensajes de la barra de estado, los
     menús que se arman al abrirse, las ventanas. Se junta lo tocado en un
     cuadro y se traduce de una vez. */
  const tocados = new Set();
  function anotar(muts) {
    for (const m of muts) {
      if (m.type === "childList") m.addedNodes.forEach((n) => tocados.add(n));
      else tocados.add(m.target);
    }
    if (!pendiente) pendiente = Promise.resolve().then(vaciar);
  }
  /* Un nodo raro no puede dejar sordo al observador: si una traducción falla,
     se sigue con el resto y el observador SIEMPRE se vuelve a conectar (antes
     un error a mitad de camino lo dejaba desconectado y lo nuevo —las pestañas
     de los espacios, los menús— quedaba en español para siempre). */
  /* El observador NO se desconecta mientras traducimos. Antes sí, para no
     anotar lo que escribíamos nosotros, y era un agujero: lo que otro módulo
     dibujaba en ese instante (las pestañas de los espacios de trabajo, medido)
     se perdía y quedaba en español para siempre. Anotar lo nuestro es inocuo:
     en la segunda pasada el texto ya es el que pusimos, no se escribe nada y
     la cadena se corta sola. */
  const cuenta = { pasadas: 0, nodos: 0, ms: 0 };
  function vaciar() {
    pendiente = null;
    const t0 = performance.now();
    cuenta.pasadas++; cuenta.nodos += tocados.size;
    const lote = [...tocados];
    tocados.clear();
    for (const n of lote) {
      try { if (n.isConnected) recorrer(n); }
      catch (e) { if (global.console) console.warn("[idioma] no pude traducir un nodo:", e); }
    }
    cuenta.ms += performance.now() - t0;
  }
  function observar() {
    if (!observador) observador = new MutationObserver(anotar);
    observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS });
  }

  /** Cambia el idioma de la interfaz viva y lo recuerda. */
  function poner(codigo, { guardar = true } = {}) {
    if (!idiomas[codigo]) codigo = "es";
    actual = codigo;
    if (guardar) { try { const s = almacen(); if (s) s.setItem(CLAVE, codigo); } catch (_) { /* sin almacén */ } }
    document.documentElement.lang = codigo;
    if (observador) observador.disconnect();
    recorrer(document.body);
    if (codigo !== "es") observar(); else observador = null;
    try { global.dispatchEvent(new CustomEvent("low:idioma", { detail: { idioma: codigo } })); } catch (_) { /* viejo */ }
    return codigo;
  }

  function guardado() { try { const s = almacen(); return (s && s.getItem(CLAVE)) || "es"; } catch (_) { return "es"; } }

  /* El selector va arriba de todo en Preferencias, en su propio idioma cada
     opción («English», «Português»): quien no entiende el español tiene que
     poder encontrar el suyo. */
  function selector() {
    const fila = document.createElement("div");
    fila.className = "dz-style-row dz-idioma-fila";
    const rotulo = document.createElement("span");
    rotulo.className = "dz-hint";
    rotulo.textContent = "Idioma";
    const sel = document.createElement("select");
    sel.id = "prefIdioma"; sel.className = "langsel";
    sel.setAttribute("data-no-traducir", "");
    for (const [codigo, i] of Object.entries(idiomas)) {
      const o = document.createElement("option");
      o.value = codigo; o.textContent = i.nombre; o.selected = codigo === actual;
      sel.appendChild(o);
    }
    sel.onchange = () => poner(sel.value);
    fila.append(rotulo, sel);
    return fila;
  }
  function envolverPreferencias() {
    const original = global.dzPrefsModal;
    if (typeof original !== "function" || original.__conIdioma) return;
    const env = function (...a) {
      const r = original.apply(this, a);
      const m = document.getElementById("modal"), h = m && m.querySelector("h2");
      if (m && !m.querySelector("#prefIdioma")) {
        const f = selector();
        const sub = m.querySelector(".sub");
        (sub || h) ? (sub || h).after(f) : m.prepend(f);
        recorrer(f);
      }
      return r;
    };
    env.__conIdioma = true;
    global.dzPrefsModal = env;
  }

  function arrancar() {
    envolverPreferencias();
    const g = guardado();
    if (g !== "es") poner(g, { guardar: false });
  }

  global.LOW_I18N = { registrar, traducir, poner, idiomas: () => Object.fromEntries(Object.entries(idiomas).map(([c, i]) => [c, i.nombre])), get actual() { return actual; }, cuenta };
  // apenas está el HTML (no al terminar de cargar imágenes y fuentes): así no
  // se ve un instante en español antes de pasar al idioma elegido
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else setTimeout(arrancar, 0);
})(window);
