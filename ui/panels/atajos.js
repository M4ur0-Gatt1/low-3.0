/* ══════════════════════════════════════════════════════════════════════════
   ATAJOS DE TECLADO: UN SOLO MAPA, UNA TECLA PARA CADA HERRAMIENTA

   Pedido de Mauro (oct-2026, LOW 3.12): «buscá si no hay más errores como el
   de la coma y el punto, y mejorá el menú de atajos para que haya más, y uno
   para cada herramienta».

   LOS ERRORES «COMO ESE» que aparecieron al buscar —la tecla anunciada hacía
   otra cosa, o nada—:
   · L y O figuraban como Línea y Elipse, pero los atajos de animación
     (animation/shortcuts.js) las atrapaban antes, en captura, para el loop y
     el papel cebolla. Con un documento abierto nunca elegían la herramienta.
   · En modo esqueleto, P, B y S hacían DOS cosas: la herramienta del rig y,
     además, la Pluma o el Pincel del mapa.
   · La Regla anunciaba «(R)» en su ayuda; R era el Rectángulo y la Regla no
     tenía atajo.
   · Shift+X, Tab, F7, 3 y Z estaban escritas a mano en app.js ANTES del mapa:
     no figuraban en la lista y no se podían reasignar.
   · La mitad de las herramientas (Inflar, Bomba, Plancha, Pinza, Esculpir,
     Imán, Deformador) no tenía tecla.

   LAS REGLAS desde ahora:
   1. El mapa es la ÚNICA autoridad para las teclas de una sola acción. Lo
      que estaba escrito a mano pasó al mapa: se ve y se reasigna.
   2. Combinaciones: además de una tecla suelta, Shift+tecla, Alt+tecla y
      teclas con nombre (Enter, Tab, F1–F12). Ctrl queda para los comandos
      fijos (guardar, deshacer, copiar…), que la lista muestra aparte.
   3. Si un modo con atajos propios (esqueleto, 3D) ya atendió la tecla
      —`preventDefault`—, el mapa no la vuelve a usar.
   4. La ayuda de cada botón se ESCRIBE desde el mapa: no puede volver a
      anunciar una tecla que hace otra cosa.

   Va en un módulo porque app.js está en el techo de su presupuesto: allá
   quedan las constantes y el despacho; acá el catálogo, las combinaciones,
   las acciones nuevas y la ventana de preferencias.
   tools/check_atajos_ui.js aprieta cada tecla de verdad y mira qué pasó.

   @module panels/atajos
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s) => document.querySelector(s);
  const clic = (sel) => () => { const b = $q(sel); if (b && !b.disabled) b.click(); return !!b; };

  /* ── EL CATÁLOGO ─────────────────────────────────────────────────────────
     [acción, nombre, grupo, tecla de fábrica, botón cuya ayuda la anuncia] */
  const GRUPOS = ["Herramientas", "Formas", "Vista", "Color", "Animación", "Cámara y esqueleto", "Espacios de trabajo"];
  const CATALOGO = [
    ["select", "Seleccionar / mover", "Herramientas", "v", '[data-tool="select"]'],
    ["direct", "Selección directa (flecha blanca)", "Herramientas", "d", '[data-tool="direct"]'],
    ["nodes", "Nodos", "Herramientas", "a", '[data-tool="nodes"]'],
    ["hand", "Mano (navegar)", "Herramientas", "h", '[data-tool="hand"]'],
    ["pencil", "Lápiz", "Herramientas", "n", '[data-tool="pencil"]'],
    ["brush", "Pincel", "Herramientas", "b", '[data-tool="brush"]'],
    ["pen", "Pluma vectorial", "Herramientas", "p", '[data-tool="pen"]'],
    ["eraser", "Borrador", "Herramientas", "e", '[data-tool="eraser"]'],
    ["bucket", "Balde de pintura", "Herramientas", "g", '[data-tool="bucket"]'],
    ["dropper", "Cuentagotas", "Herramientas", "i", '[data-tool="dropper"]'],
    ["ruler", "Regla / hilo tensado", "Herramientas", "u", '[data-tool="ruler"]'],
    ["sculpt", "Esculpir trazos", "Herramientas", "w", '[data-tool="sculpt"]'],
    ["magnet", "Deformar trazo (imán)", "Herramientas", "shift+w", '[data-tool="magnet"]'],
    ["inflator", "Inflar forma", "Herramientas", "q", '[data-tool="inflator"]'],
    ["handler", "Bomba de grosor", "Herramientas", "shift+q", '[data-tool="handler"]'],
    ["iron", "Plancha (suavizar trazos)", "Herramientas", "y", '[data-tool="iron"]'],
    ["pliers", "Pinza (cortar un trazado)", "Herramientas", "x", '[data-tool="pliers"]'],
    ["warp", "Deformador de caja", "Herramientas", "shift+d", null],
    ["pivot", "Pivote de rig", "Herramientas", "j", '[data-tool="pivot"]'],
    ["rect", "Rectángulo", "Formas", "r", "#dzAddRect"],
    ["ellipse", "Elipse", "Formas", "o", "#dzAddEllipse"],
    ["circle", "Círculo", "Formas", "shift+o", "#dzAddCircle"],
    ["poly", "Polígono", "Formas", "shift+r", "#dzAddPoly"],
    ["star", "Estrella", "Formas", "s", "#dzAddStar"],
    ["line", "Línea", "Formas", "l", "#dzAddLine"],
    ["text", "Texto", "Formas", "t", "#dzAddText"],
    ["zoomin", "Acercar", "Vista", "+", null],
    ["zoomout", "Alejar", "Vista", "-", null],
    ["zoomcentro", "Acercar al centro de la mesa", "Vista", "z", null],
    ["alejarcentro", "Alejar desde el centro de la mesa", "Vista", "alt+z", null],
    ["zoom100", "Zoom 100 %", "Vista", "0", null],
    ["zoomfit", "Ajustar a la pantalla", "Vista", "f", null],
    ["rotl", "Girar la mesa a la izquierda", "Vista", "[", null],
    ["rotr", "Girar la mesa a la derecha", "Vista", "]", null],
    ["enderezar", "Enderezar la mesa", "Vista", "shift+f", null],
    ["mirror", "Modo espejo", "Vista", "m", "#dzMirror"],
    ["zen", "Modo dibujo (esconder paneles)", "Vista", "tab", null],
    ["capas", "Mostrar u ocultar capas", "Vista", "f7", null],
    ["vista3d", "Espacio 3D", "Vista", "3", null],
    ["swap", "Intercambiar relleno y trazo", "Color", "shift+x", null],
    ["play", "Reproducir / parar", "Animación", "enter", "#tlPlay"],
    ["prevframe", "Cuadro anterior", "Animación", ",", "#tlPrev"],
    ["nextframe", "Cuadro siguiente", "Animación", ".", "#tlNext"],
    ["prevdrawing", "Dibujo anterior (saltea los sostenidos)", "Animación", "alt+,", null],
    ["nextdrawing", "Dibujo siguiente (saltea los sostenidos)", "Animación", "alt+.", null],
    ["loop", "Repetir en bucle (loop)", "Animación", "alt+l", "#tlLoop"],
    ["onion", "Papel cebolla", "Animación", "alt+o", "#tlOnion"],
    ["nuevodibujo", "Cuadro vacío después del actual", "Animación", "alt+n", "#tlBlank"],
    ["duplicarcuadro", "Duplicar el cuadro al final", "Animación", "alt+d", "#tlAdd"],
    ["insertarcuadro", "Insertar una copia después del actual", "Animación", "alt+i", "#tlIns"],
    ["clavedibujo", "Marcar fotograma clave", "Animación", "alt+k", "#tlKey"],
    ["intercalar", "Intercalar", "Animación", "alt+t", "#tlTween"],
    ["exportar", "Exportar la animación", "Animación", "alt+e", "#tlExport"],
    ["camera", "Cámara", "Cámara y esqueleto", "c", "#dzCamBtn"],
    ["camkey", "Clave de cámara en este cuadro", "Cámara y esqueleto", "shift+c", "#tlCamKey"],
    ["rig", "Esqueleto (cut-out)", "Cámara y esqueleto", "shift+k", "#dzRigBtn"],
    ["rigkey", "Crear clave de rig", "Cámara y esqueleto", "k", null],
    ["ws-drawing", "Espacio Dibujo", "Espacios de trabajo", "alt+1", null],
    ["ws-animation", "Espacio Animación", "Espacios de trabajo", "alt+2", null],
    ["ws-cleanup", "Espacio Limpieza", "Espacios de trabajo", "alt+3", null],
    ["ws-color", "Espacio Color", "Espacios de trabajo", "alt+4", null],
    ["ws-composite", "Espacio Composición", "Espacios de trabajo", "alt+5", null],
    ["ws-camera", "Espacio Cámara", "Espacios de trabajo", "alt+6", null],
    ["ws-3d", "Espacio 3D", "Espacios de trabajo", "alt+7", null],
  ];
  /* Lo que NO se reasigna, a la vista igual: si no figura, nadie lo encuentra. */
  const FIJOS = [
    ["Ctrl+Z / Ctrl+Y", "Deshacer / rehacer"], ["Ctrl+S · Ctrl+Shift+S", "Guardar / guardar como"],
    ["Ctrl+N · Ctrl+O · Ctrl+W", "Nuevo · abrir · cerrar"], ["Ctrl+C · Ctrl+V · Ctrl+X", "Copiar · pegar · cortar"],
    ["Ctrl+Shift+V", "Pegar celdas como reuso del mismo dibujo"], ["Ctrl+D", "Duplicar lo seleccionado"],
    ["Ctrl+G · Ctrl+Shift+G", "Agrupar / desagrupar"], ["Ctrl+R", "Reglas"],
    ["Espacio (mantener)", "Mano: arrastrá para navegar"],
    ["← → ↑ ↓", "Mover lo seleccionado de a 1 (como en Illustrator)"], ["Shift+flecha", "Mover lo seleccionado de a 10"],
    ["Inicio · Fin", "Primer / último cuadro"],
    ["Alt+← →", "Mover los cuadros elegidos en la línea de tiempo (sin nada elegido en la mesa)"], ["Insert", "Insertar un cuadro vacío"],
    ["Shift al soltar un trazo", "Círculo perfecto (o recta, si el trazo es abierto)"], ["Alt al soltar un trazo", "La elipse que mejor ajusta"],
    ["Supr", "Borrar lo seleccionado / vaciar la celda"], ["F5", "Sostener el dibujo (como Harmony)"],
    ["Esc", "Cancelar lo que está en curso"],
  ];
  const NOMBRES = { enter: "Enter", tab: "Tab", " ": "Espacio" };

  /* ── LA TECLA DE UN EVENTO, como la guarda el mapa ───────────────────────
     «r», «shift+r», «alt+o», «enter», «tab», «f7». Shift sólo se anota con
     letras y números: con un símbolo ya viene adentro (Shift+= es «+») y
     cambia según el teclado. Ctrl y Cmd no van al mapa. */
  function teclaDe(e) {
    if (!e || e.ctrlKey || e.metaKey || !e.key) return null;
    let base;
    if (e.key.length === 1) {
      base = e.key === "=" ? "+" : e.key.toLowerCase();
      // con Alt, Windows puede mandar otro carácter: la letra sale del código físico
      if (e.altKey && e.code && /^Key[A-Z]$/.test(e.code)) base = e.code.slice(3).toLowerCase();
      if (e.altKey && e.code && /^Digit\d$/.test(e.code)) base = e.code.slice(5);
    } else if (e.key === "Enter") base = "enter";
    else if (e.key === "Tab") base = "tab";
    else if (/^F\d{1,2}$/.test(e.key)) base = e.key.toLowerCase();
    else return null;
    const letra = /^[a-z0-9]$/.test(base) || base.length > 1;
    return (e.altKey ? "alt+" : "") + (e.shiftKey && letra ? "shift+" : "") + base;
  }
  /** «shift+w» → «Shift+W» para mostrar. */
  function etiqueta(k) {
    if (!k) return "";
    if (k === "+") return "+";
    const partes = k.split("+"), base = partes.pop();
    return partes.map((p) => (p === "shift" ? "Shift" : p === "alt" ? "Alt" : p))
      .concat(NOMBRES[base] || base.toUpperCase()).join("+");
  }

  /* ── EL MAPA: catálogo nuevo + lo que la persona ya reasignó ─────────── */
  function sembrar() {
    if (typeof DZ_KEY_DEFAULTS === "undefined" || typeof DZ_KEY_LABELS === "undefined") return false;
    for (const [act, nombre, , tecla] of CATALOGO) { DZ_KEY_DEFAULTS[act] = tecla; DZ_KEY_LABELS[act] = nombre; }
    return true;
  }
  function envolverCarga() {
    const orig = global.dzKeysLoad;
    if (typeof orig !== "function" || orig.__atajos) return;
    const env = function () {
      let guardado = {};
      try { guardado = JSON.parse(dzPrefsStorage().getItem("low.dzkeys") || "{}") || {}; } catch (_) { /* sin memoria */ }
      const d = dz();
      const mapa = { ...DZ_KEY_DEFAULTS };
      // lo guardado manda; una tecla de fábrica NUEVA que choca con una que la
      // persona eligió queda libre (no se le pisa su elección)
      const elegidas = new Set(Object.entries(guardado).filter(([a, k]) => k && DZ_KEY_DEFAULTS[a] !== k).map(([, k]) => k));
      for (const [act, k] of Object.entries(mapa)) if (!(act in guardado) && elegidas.has(k)) mapa[act] = "";
      Object.assign(mapa, guardado);
      d.keymap = mapa;
      d.keyrev = {};
      for (const [act, k] of Object.entries(mapa)) if (k && !(k in d.keyrev)) d.keyrev[k] = act;
    };
    env.__atajos = true;
    global.dzKeysLoad = env;
  }

  /* ── LAS ACCIONES que el despacho de app.js no conocía ────────────────── */
  function cambiarEspacio(id) {
    const W = LOW.workspace && LOW.workspace.workspaces;
    if (!W || !W.get || !W.get(id)) return false;
    W.activate(id, global.dzWsAplicar);
    return true;
  }
  const ACCIONES = {
    sculpt: () => global.dzSetTool("sculpt"),
    prevdrawing: () => global.dzNavegar("prevdrawing"),
    nextdrawing: () => global.dzNavegar("nextdrawing"),
    warp: () => typeof global.dzWarpAlternar === "function" && global.dzWarpAlternar(),
    circle: () => global.dzFormaElegir("circle"),
    poly: () => global.dzFormaElegir("poly"),
    star: () => global.dzFormaElegir("star"),
    zoomcentro: () => { const c = $q("#dzCanvas").getBoundingClientRect(); global.dzZoomAt(1.2, c.left + c.width / 2, c.top + c.height / 2); },
    alejarcentro: () => { const c = $q("#dzCanvas").getBoundingClientRect(); global.dzZoomAt(1 / 1.2, c.left + c.width / 2, c.top + c.height / 2); },
    enderezar: () => { const d = dz(); d.viewRot = 0; global.dzApplyZoom(); },
    zen: () => global.dzZenToggle(),
    capas: () => global.dzLayersToggle(),
    vista3d: () => global.dz3dToggle(),
    swap: () => global.dzSwapPaint(),
    loop: () => { const pb = dz().playback; if (pb) pb.setLoop(!pb.loop); else clic("#tlLoop")(); },
    onion: () => { const d = dz(); d.onionOn = !d.onionOn; global.dzOnion2Render?.(); global.dzOnionRender?.(); },
    nuevodibujo: clic("#tlBlank"),
    duplicarcuadro: clic("#tlAdd"),
    insertarcuadro: clic("#tlIns"),
    clavedibujo: clic("#tlKey"),
    intercalar: clic("#tlTween"),
    exportar: clic("#tlExport"),
    camkey: () => (typeof global.dzCamKeyToggle === "function" ? global.dzCamKeyToggle() : clic("#tlCamKey")()),
    rig: clic("#dzRigBtn"),
  };
  for (const id of ["drawing", "animation", "cleanup", "color", "composite", "camera", "3d"])
    ACCIONES["ws-" + id] = () => cambiarEspacio(id);

  function envolverDespacho() {
    const orig = global.dzRunAction;
    if (typeof orig !== "function" || orig.__atajos) return;
    const env = function (act) {
      if (ACCIONES[act]) return ACCIONES[act]();
      return orig.apply(this, arguments);
    };
    Object.assign(env, orig);
    env.__atajos = true;
    global.dzRunAction = env;
  }

  /* ── LA AYUDA DE LOS BOTONES se escribe desde el mapa ─────────────────── */
  const VIEJA = /\s\((?:Shift\+|Alt\+)?(?:[A-Z0-9]|[,.\[\]+\-]|Enter|Tab|F\d{1,2})\)/;
  function conTecla(texto, k) {
    let t = (texto || "").replace(VIEJA, "");
    if (!k) return t;
    const marca = " (" + etiqueta(k) + ")";
    const m = t.match(/\s?[:·—]/);
    return m ? t.slice(0, m.index) + marca + t.slice(m.index) : t + marca;
  }
  function refrescarAyudas() {
    const d = dz();
    if (!d || !d.keymap) return;
    for (const [act, , , , sel] of CATALOGO) {
      if (!sel) continue;
      document.querySelectorAll(sel).forEach((b) => {
        const k = d.keymap[act] || "";
        // el globo de ayuda guarda el título aparte mientras se ve
        if (b.dataset.tituloAyuda != null) b.dataset.tituloAyuda = conTecla(b.dataset.tituloAyuda, k);
        else if (b.title) b.title = conTecla(b.title, k);
        if (b.getAttribute("aria-label")) b.setAttribute("aria-label", conTecla(b.getAttribute("aria-label"), k));
      });
    }
  }
  function envolverGuardado() {
    const orig = global.dzKeysSave;
    if (typeof orig !== "function" || orig.__atajos) return;
    const env = function () { const r = orig.apply(this, arguments); refrescarAyudas(); return r; };
    env.__atajos = true;
    global.dzKeysSave = env;
  }

  /* ── LA VENTANA DE PREFERENCIAS ──────────────────────────────────────── */
  function lista() {
    const d = dz();
    const quien = (k) => Object.keys(d.keymap).find((a) => d.keymap[a] === k);
    const caja = document.createElement("div");
    caja.className = "atajos";
    caja.innerHTML =
      '<div class="atajos-cabeza"><input type="search" class="atajos-buscar" placeholder="Buscar un atajo o una acción…" aria-label="Buscar atajo">' +
      '<span class="atajos-aviso" role="status"></span></div><div class="atajos-cuerpo"></div>';
    const cuerpo = caja.querySelector(".atajos-cuerpo"), aviso = caja.querySelector(".atajos-aviso");
    for (const g of GRUPOS) {
      const sec = document.createElement("section"); sec.className = "atajos-grupo";
      sec.innerHTML = "<h3></h3>"; sec.querySelector("h3").textContent = g;
      for (const [act, nombre, grupo] of CATALOGO) {
        if (grupo !== g) continue;
        const fila = document.createElement("div"); fila.className = "krow"; fila.dataset.buscar = (nombre + " " + act).toLowerCase();
        const l = document.createElement("label"); l.textContent = nombre;
        const inp = document.createElement("input");
        inp.className = "dz-keycap"; inp.dataset.act = act; inp.readOnly = true;
        inp.placeholder = "(sin atajo)"; inp.title = "Clic y apretá la tecla nueva (sola, con Shift o con Alt) · Supr la borra";
        inp.value = etiqueta(d.keymap[act]);
        inp.onfocus = () => inp.select();
        inp.onkeydown = (e) => {
          if (["Shift", "Alt", "Control", "Meta", "AltGraph", "CapsLock"].includes(e.key)) return;
          e.preventDefault(); e.stopPropagation();
          if (e.key === "Escape") { inp.blur(); return; }
          if (e.key === "Delete" || e.key === "Backspace") {
            d.keymap[act] = ""; inp.value = ""; aviso.textContent = nombre + ": sin atajo"; global.dzKeysSave(); return;
          }
          if (e.ctrlKey || e.metaKey) { aviso.textContent = "Ctrl queda para los comandos fijos (guardar, deshacer, copiar…)"; return; }
          const k = teclaDe(e);
          if (!k) { aviso.textContent = "Esa tecla no se puede usar como atajo"; return; }
          const antes = quien(k);
          if (antes && antes !== act) {
            d.keymap[antes] = "";
            const otro = caja.querySelector('.dz-keycap[data-act="' + antes + '"]'); if (otro) otro.value = "";
            aviso.textContent = etiqueta(k) + " era de «" + (DZ_KEY_LABELS[antes] || antes) + "», que quedó sin atajo";
          } else aviso.textContent = nombre + ": " + etiqueta(k);
          d.keymap[act] = k; inp.value = etiqueta(k);
          global.dzKeysSave();
        };
        fila.append(l, inp); sec.appendChild(fila);
      }
      cuerpo.appendChild(sec);
    }
    const fijos = document.createElement("section"); fijos.className = "atajos-grupo atajos-fijos";
    fijos.innerHTML = "<h3>Fijos (no se reasignan)</h3>";
    for (const [tecla, que] of FIJOS) {
      const fila = document.createElement("div"); fila.className = "krow"; fila.dataset.buscar = (tecla + " " + que).toLowerCase();
      const l = document.createElement("label"); l.textContent = que;
      const k = document.createElement("kbd"); k.textContent = tecla;
      fila.append(l, k); fijos.appendChild(fila);
    }
    cuerpo.appendChild(fijos);
    caja.querySelector(".atajos-buscar").oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      caja.querySelectorAll(".krow").forEach((f) => {
        const k = f.querySelector(".dz-keycap, kbd");
        const txt = f.dataset.buscar + " " + ((k && (k.value || k.textContent)) || "").toLowerCase();
        f.hidden = !!q && !txt.includes(q);
      });
      caja.querySelectorAll(".atajos-grupo").forEach((s) => { s.hidden = ![...s.querySelectorAll(".krow")].some((f) => !f.hidden); });
    };
    return caja;
  }
  function envolverPreferencias() {
    const orig = global.dzPrefsModal;
    if (typeof orig !== "function" || orig.__atajos) return;
    const env = function () {
      const r = orig.apply(this, arguments);
      const filas = [...document.querySelectorAll(".krow")];
      if (filas.length) {
        const caja = lista();
        filas[0].parentNode.insertBefore(caja, filas[0]);
        filas.forEach((f) => f.remove());
        const sub = caja.previousElementSibling;
        if (sub && sub.classList.contains("sub"))
          sub.textContent = "Clic en un campo y apretá la tecla nueva: sola, con Shift o con Alt. Supr la deja sin atajo. " +
            "Si la tecla ya era de otra acción, esa queda libre y te avisa. Los atajos no actúan mientras escribís texto.";
      }
      const reset = $q("#prefReset");
      if (reset) reset.onclick = () => {
        const d = dz();
        d.keymap = { ...DZ_KEY_DEFAULTS };
        global.dzKeysSave();
        document.querySelectorAll(".atajos .dz-keycap").forEach((i) => { i.value = etiqueta(d.keymap[i.dataset.act]); });
        const av = $q(".atajos-aviso"); if (av) av.textContent = "Atajos de fábrica";
      };
      return r;
    };
    env.__atajos = true;
    global.dzPrefsModal = env;
  }

  function arrancar() {
    sembrar();
    envolverCarga(); envolverDespacho(); envolverGuardado(); envolverPreferencias();
    try { global.dzKeysLoad(); } catch (_) { /* el DZ todavía no está */ }
    refrescarAyudas();
    // el riel y la línea de tiempo se arman tarde y reescriben sus ayudas
    global.addEventListener("load", () => setTimeout(refrescarAyudas, 300));
    setTimeout(refrescarAyudas, 1500);
  }

  global.dzAtajoDe = teclaDe;
  global.dzAtajoEtiqueta = etiqueta;
  LOW.atajos = { CATALOGO, GRUPOS, FIJOS, teclaDe, etiqueta, conTecla, refrescarAyudas, ACCIONES };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})(window);
