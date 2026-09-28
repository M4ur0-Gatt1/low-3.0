/* LOW — frontend. Toda la lógica pesada vive en Python (main.py, js_api). */
"use strict";

const $ = s => document.querySelector(s);
const CM_MODE = { python: "python", javascript: "javascript", bash: "shell", powershell: "powershell" };
// modo de resaltado por extensión (independiente del lenguaje del runner)
const MODE_BY_EXT = {
  ".py": "python", ".js": "javascript", ".ts": "javascript", ".jsx": "javascript",
  ".tsx": "javascript", ".json": "javascript", ".sh": "shell", ".ps1": "powershell",
  ".html": "htmlmixed", ".htm": "htmlmixed", ".css": "css", ".xml": "xml",
};
const extOf = p => { const m = /\.[^.\\/]+$/.exec(p || ""); return m ? m[0].toLowerCase() : ""; };
const esHtml = t => (t && t.path && /\.html?$/i.test(t.path)) ||
                    /^\s*(<!doctype html|<html)/i.test(cm ? cm.getValue() : "");
// lenguaje del RUNNER por extensión (para  Ejecutar en modo "auto")
const RUN_LANG_BY_EXT = {
  ".py": "python", ".js": "javascript", ".mjs": "javascript", ".ts": "typescript",
  ".sh": "bash", ".bash": "bash", ".ps1": "powershell", ".go": "go", ".rb": "ruby",
  ".php": "php", ".pl": "perl", ".lua": "lua", ".r": "r",
};
// idioma efectivo: si el usuario forzó uno lo respeta; si está en "auto",
// lo deduce de la extensión del archivo abierto (default python)
function effectiveLang() {
  const sel = $("#selLang") ? $("#selLang").value : "auto";
  if (sel && sel !== "auto") return sel;
  const t = curTab();
  return RUN_LANG_BY_EXT[extOf(t && t.path)] || "python";
}
// modo de resaltado del editor según selección/archivo
function applyEditorMode() {
  const sel = $("#selLang") ? $("#selLang").value : "auto";
  const t = curTab();
  const mode = (sel && sel !== "auto")
    ? (CM_MODE[sel] || "python")
    : (MODE_BY_EXT[extOf(t && t.path)] || "python");
  cm && cm.setOption("mode", mode);
}

let api = null;
let dzAbrirAlInicio = null;   // .low con el que Windows abrio LOW
let cm = null;
const S = {
  theme: "dark", tabs: [], cur: null, untitled: 0,
  ws: null, providers: [], pending: null, plan: null, loading: false,
  expanded: new Set(), zoom: 1.0,
  chats: [], chatId: null, agent: {},
  attachedImage: null,   // {data, mime, name} pendiente de enviar (visión)
};
const icoUse = name => `<svg class="ico"><use href="#${name}"/></svg>`;

/* ── errores SIEMPRE visibles: en el chat y en %APPDATA%/LOW/low.log ── */
window.__errs = [];
function reportErr(msg) {
  window.__errs.push(msg);
  try { if (api) api.log_js(msg); } catch (e) { /* sin puente */ }
  try { sysMsg(" Error interno: " + msg); } catch (e) { /* UI no lista */ }
  try { dzCrashReport("error no atrapado", msg); } catch (e) { /* informe best effort */ }
}

/* ── CRASH-01 de la matriz ──────────────────────────────────────────────────
   Un error tirado al log no alcanza para entender un fallo ajeno: hace falta
   saber con qué versión, en qué sistema, con qué GPU, cuánto pesaba la escena
   y qué se estaba haciendo. Lo que NO hace falta es el dibujo, la conversación
   ni la ruta completa del disco de nadie, así que el informe arma sus campos a
   mano —nunca vuelca objetos enteros— y del archivo guarda sólo el nombre.
   El backend vuelve a filtrar por lista blanca antes de escribir. */
let DZ_CRASH_ULTIMO = 0;
function dzCrashDatos() {
  const doc = DZ && DZ.doc;
  const escena = doc ? {
    // sólo el NOMBRE del archivo: la ruta completa dice dónde vive y cómo se
    // llama quien lo usa, y para diagnosticar un fallo no hace ninguna falta
    archivo: (doc.path || DZ.path) ? String(doc.path || DZ.path).split(/[\\/]/).pop() : null,
    niveles: doc.scene.levels.length, capas: doc.scene.layers.length,
    dibujos: doc.scene.levels.reduce((n, lv) => n + lv.drawings.length, 0),
    cuadro: doc.frame, fps: doc.scene.fps, sinGuardar: !!doc.dirty,
  } : null;
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const info = gl && gl.getExtension("WEBGL_debug_renderer_info");
    gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : (gl ? "webgl sin detalle" : "sin webgl");
  } catch (e) { gpu = "no disponible"; }
  return {
    version: S.version || "", sistema: navigator.userAgent, gpu, escena,
    ultimoComando: (DZ.history && DZ.history.undoStack.at(-1) || {}).label || DZ.ultimoComando || "",
    herramienta: DZ.tool || "select", cuandoUI: new Date().toISOString(),
  };
}
/** Informe pedido a mano desde Ayuda: sirve para adjuntar a un reporte aunque
    la aplicación no se haya caído, y hace visible QUÉ se manda. */
async function dzCrashReportManual() {
  DZ_CRASH_ULTIMO = 0;                       // un pedido explícito nunca se saltea
  const r = await dzCrashReport("informe pedido por la persona", "", "ayuda");
  if (!r || !r.path) return dzNotice("No pude escribir el informe de fallo.", "Informe de fallo");
  const datos = dzCrashDatos();
  return dzNotice("Informe guardado en " + r.name + ". Incluye versión, sistema, GPU (" +
    (datos.gpu || "?") + "), tamaño de la escena y el último comando. No incluye el dibujo, " +
    "la conversación ni rutas completas. Está en " + r.path, "Informe de fallo");
}
async function dzCrashReport(motivo, error, origen) {
  const ahora = Date.now();
  if (ahora - DZ_CRASH_ULTIMO < 4000) return null;   // un fallo en cadena no escribe cien informes
  DZ_CRASH_ULTIMO = ahora;
  if (!api || !api.crash_report) return null;
  const payload = { motivo, error: String(error == null ? "" : error).slice(0, 800),
    origen: origen || "ui", ...dzCrashDatos() };
  try { return await api.crash_report(payload); } catch (e) { return null; }
}
window.addEventListener("error", e =>
  reportErr(`${e.message} @${(e.filename || "").split("/").pop()}:${e.lineno}`));
window.addEventListener("unhandledrejection", e => {
  const reason = e.reason && e.reason.message || e.reason;
  if (reason && reason.includes("No hay workspace abierto")) {
    showNoWorkspace();
  } else {
    reportErr("promesa rechazada: " + reason);
  }
});

/* ── eventos que empuja Python ── */
/* OJO: los módulos (core/, animation/, drawing/, workspace/, ai/) se cargan
   ANTES que app.js y registran sus namespaces en window.LOW. Acá hay que
   FUSIONAR, no asignar: un `window.LOW = {...}` los borraba a todos y dejaba
   LOW.core.HistoryManager en undefined, así que openDesign() explotaba y el
   estudio 2D no abría ni dibujaba. */
Object.assign((window.LOW = window.LOW || {}), {
  onPy(m) {
    try {
      window.LOW.Workbench?.event(m);
      if (m.event === "propose") propose(m.data.code);
      if (m.event === "status") setStatus(m.data);
      if (m.event === "sys") { sysMsg(m.data); persist("system", m.data); }
      if (m.event === "ws") setWs(m.data);
      if (m.event === "wrote") onWrote(m.data.path, m.data.range);
      if (m.event === "think_start") { stopThinking(); setStatus(" Razonando…"); planDone(); S.thinkEl = thinkMsg(); }
      if (m.event === "think_delta" && S.thinkEl) { S.thinkEl.querySelector(".think-body").textContent += m.data; scrollMsgs(); }
      if (m.event === "think_end" && S.thinkEl) {
        S.thinkEl.classList.add("done", "collapsed");
        S.thinkEl.querySelector(".think-toggle").textContent = "mostrar";
        S.thinkEl.querySelector(".think-head").firstChild.textContent = " Pensó unos instantes ";
        S.thinkEl = null;
      }
      if (m.event === "agent_start") { stopThinking(); setStatus("✍ Escribiendo…"); planDone(); S.streamEl = agentMsg("").querySelector(".m-txt"); }
      if (m.event === "agent_delta" && S.streamEl) { S.streamEl.textContent += m.data; scrollMsgs(); }
      if (m.event === "agent_end") S.streamEl = null;
      if (m.event === "tool") {
        stopThinking();
        // Mostrar detalles de la herramienta que se está usando
        const toolName = m.data.name;
        const toolRes = m.data.res;
        const fileName = m.data.file || "";
        let toolDesc = "";
        if (toolName === "read_file") toolDesc = ` Leyendo ${fileName}`;
        else if (toolName === "write_file") toolDesc = ` Escribiendo ${fileName}`;
        else if (toolName === "edit_file") toolDesc = ` Editando ${fileName}`;
        else if (toolName === "exec_cmd") toolDesc = " Ejecutando comando";
        else if (toolName === "run_code") toolDesc = " Ejecutando código";
        else if (toolName === "list_files") toolDesc = " Listando archivos";
        else if (toolName === "search_code") toolDesc = " Buscando código";
        else if (toolName === "generate_image") toolDesc = " Generando imagen";
        else if (toolName === "ask_model") toolDesc = " Consultando otro modelo";
        else if (toolName === "web_search") toolDesc = " Buscando en la web";
        else if (toolName === "git") toolDesc = " git";
        else toolDesc = ` ${toolName}`;
        setStatus(toolDesc);
        // indicador persistente (heartbeat) + paso en la tarjeta de actividad
        // (persistente, ya no un mensaje que desaparece a los 3s)
        setWorkingOn(fileName ? `${toolDesc} ${fileName}` : toolDesc);
        toolStep(toolDesc, toolRes);
      }
    } catch (e) { reportErr("onPy(" + m.event + "): " + e.message); }
  },
});

/* ── rasterizar SVG  PNG dataURL (para que el modelo "vea" lo que dibujó) ──
   Lo llama Python por evaluate_js y sondea window.__raster hasta que esté listo.
   Sentinela: "PENDING" mientras carga, "data:..." si salió, "ERR:..." si falló.
   Es async (decodificar la imagen), por eso el patrón de polling. */
window.__raster = "IDLE";
window.rasterizeSVG = function (svg, maxPx) {
  window.__raster = "PENDING";
  try {
    // asegurar width/height (si solo hay viewBox, naturalWidth puede ser 0)
    let s = svg;
    if (!/<svg[^>]*\bwidth=/.test(s)) {
      const vb = /viewBox\s*=\s*["']([\d.\-\s]+)["']/.exec(s);
      if (vb) {
        const p = vb[1].trim().split(/\s+/);
        if (p.length === 4) s = s.replace(/<svg/, `<svg width="${p[2]}" height="${p[3]}"`);
      }
    }
    const blob = new Blob([s], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = function () {
      try {
        const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
        const cap = maxPx || 1024;
        const scale = Math.min(1, cap / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        const c = document.createElement("canvas"); c.width = cw; c.height = ch;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch);   // fondo blanco
        ctx.drawImage(img, 0, 0, cw, ch);
        window.__raster = c.toDataURL("image/png");
      } catch (e) { window.__raster = "ERR:" + e.message; }
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { window.__raster = "ERR:no pude cargar el SVG"; URL.revokeObjectURL(url); };
    img.src = url;
  } catch (e) { window.__raster = "ERR:" + e.message; }
};

/* ── redimensionar/recortar imagen a un tamaño exacto (redes sociales) ──
   'cover': escala para llenar w×h y recorta centrado (lo estándar para feeds).
   Mismo patrón async+polling que rasterizeSVG. Convierte el dataURL a Blob
   para no ensuciar (taint) el canvas y poder exportarlo. */
window.__fit = "IDLE";
window.fitImage = function (dataUrl, w, h) {
  window.__fit = "PENDING";
  try {
    const comma = dataUrl.indexOf(",");
    const meta = dataUrl.slice(0, comma), b64 = dataUrl.slice(comma + 1);
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || "image/png";
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([arr], { type: mime }));
    const img = new Image();
    img.onload = function () {
      try {
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
        const iw = img.naturalWidth || w, ih = img.naturalHeight || h;
        const scale = Math.max(w / iw, h / ih);          // cover
        const dw = iw * scale, dh = ih * scale;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
        window.__fit = c.toDataURL("image/png");
      } catch (e) { window.__fit = "ERR:" + e.message; }
      URL.revokeObjectURL(url);
    };
    img.onerror = function () { window.__fit = "ERR:no pude cargar la imagen"; URL.revokeObjectURL(url); };
    img.src = url;
  } catch (e) { window.__fit = "ERR:" + e.message; }
};

/* ── menú contextual del chat (copiar) ──
   pywebview apaga el menú nativo del navegador salvo --debug (para no exponer
   "Inspeccionar" a usuarios finales), y con eso también se llevó puesto el
   "Copiar" de toda la vida. Este es chiquito y solo vive dentro de #msgs. */
let ctxMenu = null;
function closeCtxMenu() {
  if (ctxMenu) { ctxMenu.remove(); ctxMenu = null; }
}
function showCtxMenu(e, items) {
  e.preventDefault(); e.stopPropagation(); closeCtxMenu();
  ctxMenu = document.createElement("div");
  ctxMenu.className = "ctx-menu ctx-command-menu";
  ctxMenu.setAttribute("role", "menu");
  for (const entry of items) {
    if (entry === "separator") {
      const sep = document.createElement("div"); sep.className = "ctx-separator"; ctxMenu.appendChild(sep); continue;
    }
    const item = document.createElement("button"); item.className = "ctx-item"; item.type = "button";
    item.disabled = !!entry.disabled; item.setAttribute("role", "menuitem");
    item.innerHTML = `<span class="ctx-symbol" aria-hidden="true">${entry.icon || ""}</span>` +
      `<span class="ctx-label"></span>${entry.shortcut ? `<kbd>${entry.shortcut}</kbd>` : ""}`;
    item.querySelector(".ctx-label").textContent = entry.label;
    item.onclick = () => { closeCtxMenu(); if (!entry.disabled) entry.action?.(); };
    ctxMenu.appendChild(item);
  }
  document.body.appendChild(ctxMenu);
  const box = ctxMenu.getBoundingClientRect(), gap = 8;
  ctxMenu.style.left = Math.max(gap, Math.min(e.clientX, innerWidth - box.width - gap)) + "px";
  ctxMenu.style.top = Math.max(gap, Math.min(e.clientY, innerHeight - box.height - gap)) + "px";
  const menu = ctxMenu; requestAnimationFrame(() => menu.querySelector("button:not(:disabled)")?.focus({ preventScroll:true }));   // el menu se cierra SOLO (autoscroll del chat, blur, clic) y ctxMenu queda en null antes del cuadro siguiente
  return ctxMenu;
}
document.addEventListener("contextmenu", (e) => {
  if (!e.target.closest("#msgs")) return;
  e.preventDefault();
  const sel = window.getSelection().toString();
  const bubble = e.target.closest(".m-user, .m-txt, .m-sys, .step, .card-b, .think-body");
  const text = sel || (bubble ? bubble.textContent : "");
  if (!text) return;
  showCtxMenu(e, [{ icon:"⧉", label:"Copiar", shortcut:"Ctrl+C",
    action:() => navigator.clipboard.writeText(text).catch(() => {}) }]);
});
document.addEventListener("click", closeCtxMenu);
document.addEventListener("scroll", closeCtxMenu, true);
window.addEventListener("blur", closeCtxMenu);

window.addEventListener("pywebviewready", () =>
  init().catch(e => reportErr("init: " + (e.message || e))));

async function init() {
  api = window.pywebview.api;
  cm = CodeMirror($("#cmwrap"), {
    lineNumbers: true, mode: "python", indentUnit: 4, tabSize: 4,
    autoCloseBrackets: true, styleActiveLine: true, scrollbarStyle: "native",
  });
  cm.on("cursorActivity", updateLnCol);
  cm.on("change", () => {
    if (S.loading) return;
    const t = curTab();
    if (t && !t.modified) { t.modified = true; renderTabs(); renderTree(); }
  });

  const st = await api.get_state();
  applyState(st);
  newTab();
  // Doble clic en un .low: Windows abre LOW con el archivo como argumento y el
  // puente lo entrega UNA vez en el estado inicial. Se abre despues de armar la
  // interfaz para que la escena caiga sobre un editor ya listo.
  if (st && st.open_file) {
    dzAbrirAlInicio = st.open_file;
  }
  if (!S.safeMode) await loadChatTabs().catch(() => {});
  // retomar SOLA la última conversación: al reabrir LOW seguís donde quedaste,
  // con el agente recordando el hilo (antes arrancaba con memoria vacía y decía
  // "no tengo contexto de una sesión previa")
  try {
    const last = !S.safeMode && (S.chats || []).find(c => c.n > 0);
    if (last) await resume(last.id);
  } catch (e) { /* sin historial: charla nueva */ }
  bind();
  restorePanelSizes();
  if (dzAbrirAlInicio) {
    const ruta = dzAbrirAlInicio; dzAbrirAlInicio = null;
    dzSceneOpen(ruta).then((ok) => {
      if (ok) dzSetStatus("Abierto desde el archivo: " + ruta);
    }).catch(() => sysMsg(" No pude abrir " + ruta));
  }
  initSplitters(); window.dzPantallaInicial?.();   // el 2D es la primera pantalla; por window: un identificador suelto tiraria init()
  sysMsg((S.safeMode ? "Modo seguro activo: proyecto anterior, disposiciones, atajos y pinceles personalizados no se cargaron. Tus datos siguen guardados.\n" : "") + "LOW v" + (S.version || "?") + " — listo.\n" +
         " API keys ·  proyecto · 🔍 junto al modelo: buscador entre todos los modelos de la API.\n" +
         "barra izquierda: 🖋 Diseño (editor de vectores SVG), 🧊 Artefactos (vista previa en vivo), " +
         " Rutinas,  Herramientas, 🕸 Servidores SSH,  Historial, ▦ Ranking.\n" +
         "El agente sabe git, ssh y scp: pedile «subí esto a github» o «entrá al server X y…».\n" +
         "Aprende solo: /habilidades y /lecciones (global) y /memoria (de este proyecto).\n" +
         "Comandos: /commit /push /git /ssh /compare /ranking /undo /history /resume /run /files /search /preview /habilidades /lecciones /memoria · Zoom Ctrl +/−/0");
  api.log_js("init ok · zoom=" + S.zoom + " · figtree=" +
             document.fonts.check("12px Figtree") + " · jbmono=" +
             document.fonts.check("12px 'JetBrains Mono'"));
  // Ollama: si corre localmente, ofrecer sus modelos en el proveedor 'custom'
  api.ollama_models().then(ms => {
    if (ms && ms.length) {
      S.ollama = ms;
      sysMsg("🤖 Ollama detectado (" + ms.length + " modelos locales, sin límites ni filtros): " +
             "elegí el proveedor «custom» para usarlos — " + ms.slice(0, 4).join(", "));
    }
  }).catch(() => {});
}

function setWs(d) {
  S.ws = d.ws; S.tree = d.tree; S.expanded = new Set();
  $("#projName").textContent = d.ws.split(/[\\/]/).pop().toUpperCase();
  $("#branch").textContent = d.branch ? "⑂ " + d.branch : "";
  renderTree();
  sysMsg(" Workspace: " + d.ws);
  persist("system", " Workspace: " + d.ws);
}

function showNoWorkspace() {
  sysMsg(" No hay workspace abierto. Abre una carpeta de proyecto para comenzar.");
  $("#projName").textContent = "SIN PROYECTO";
  $("#branch").textContent = "";
  S.ws = null;
  S.tree = [];
  renderTree();
}

const SVG_RE = /\.svg$/i;
const IMG_RE = /\.(png|jpe?g|gif|webp|bmp)$/i;
const DOC_RE = /\.(docx|pdf|mp4|webm)$/i;   // se abren con su app (Word, PDF, reproductor)

async function onWrote(path, range) {
  const r = await api.refresh_tree();
  S.tree = r.tree;
  renderTree();
  if (SVG_RE.test(path)) {          // vectores  entorno de diseño interactivo
    await openDesign(path);
    return;
  }
  if (IMG_RE.test(path)) {          // raster  visor + miniatura en el chat
    await openImage(path, true);
    return;
  }
  if (DOC_RE.test(path)) return;    // .docx/.pdf: quedan en el árbol, clic los abre
  await openFile(path, range);   // mostrar lo que editó, resaltando el cambio en vivo
  // si el agente generó una página web, registrarla como artefacto y mostrarla en vivo
  if (/\.html?$/i.test(path)) {
    const a = await api.artifact_content(path);
    if (a && a.content) { addArtifact(a.name, a.content, path); showArtifacts(); }
  }
}

function applyZoom(z, quiet) {
  S.zoom = Math.min(2, Math.max(0.7, Math.round(z * 100) / 100));
  document.documentElement.style.zoom = S.zoom;
  // el zoom escala los px pero no el viewport: compensar la altura del layout
  // para que el pie y la caja del chat sigan entrando en pantalla
  $("#app").style.height = S.zoom === 1 ? "100vh" : `calc(100vh / ${S.zoom})`;
  if (!quiet) {
    api.set_zoom(S.zoom);
    setStatus("Zoom " + Math.round(S.zoom * 100) + "%");
  }
  cm && cm.refresh();
}

/* helper: limpia el sufijo " (media)" del nombre visible del provider */
function providerName(visible) {
  return (visible || "").replace(/ \(media\)$/, "");
}

function applyState(st) {
  S.theme = st.theme; S.ws = st.ws; S.providers = st.providers;
  S.sysPrompt = st.system_prompt || "";
  S.defaultSp = st.default_sp || "";
  S.agentTools = st.tools || [];
  S.routines = st.routines || [];
  S.agent = st.agent || {};
  S.sshHosts = st.ssh_hosts || [];
  if (st.session_id) S.chatId = st.session_id;
  S.version = st.version || ""; S.safeMode = !!st.safe_mode || !!window.LOW?.safeMode?.active; document.body.classList.toggle("low-safe-mode", S.safeMode);
  S.chain = st.chain || [];
  if (st.version) { $("#ver").textContent = "LOW v" + st.version + (S.safeMode ? " · MODO SEGURO" : ""); dzVersionSync?.(st); }
  applyZoom(st.zoom || 1.0, true);
  document.body.classList.toggle("light", st.theme === "light");
  $("#btnTheme").innerHTML = icoUse(st.theme === "dark" ? "i-sun" : "i-moon");
  // mostrar TODOS los providers; los media-only llevan etiqueta "(media)" para distinguirlos
  const allNames = st.providers.map(p => p.media_only ? p.name + " (media)" : p.name);
  const curProv = (st.providers.find(p => p.name === st.provider) || {}).media_only
    ? st.provider + " (media)" : st.provider;
  fillSelect($("#selProv"), allNames, curProv);
  fillSelect($("#selModel"), st.models, st.model);
  fillSelect($("#selLang"), ["auto", ...(st.langs || [])], "auto");
  S.tree = st.tree || [];
  $("#projName").textContent = st.ws ? st.ws.split(/[\\/]/).pop().toUpperCase() : "SIN PROYECTO";
  $("#branch").textContent = st.branch ? "⑂ " + st.branch : "";
  updApis(st);
  updChainBadge();
  renderTree();
}

function updApis(st) {
  const n = st.apis;
  $("#apiTxt").textContent = `${n} clave${n === 1 ? "" : "s"} API guardada${n === 1 ? "" : "s"}`;
  $("#apiDot").classList.toggle("off", !n);
  const p = S.providers.find(x => x.name === providerName($("#selProv").value));
  const ok = p && (p.has_key || p.name === "custom");
  $("#agBadge").textContent = ok ? "activo" : "sin key";
  $("#agBadge").classList.toggle("off", !ok);
  $("#provDot").classList.toggle("off", !ok);
}

function updChainBadge() {
  const chain = S.chain || [];
  if (chain.length <= 1) {
    $("#provDot").title = "Sin failover — solo hay un proveedor con key";
    return;
  }
  const parts = chain.map((c, i) => 
    (i === 0 ? " " : " ") + c.provider + " · " + (c.model || "default"));
  $("#provDot").title = "Cadena de failover:\n" + parts.join("\n");
  // el dot parpadea en naranja si el activo NO es el primero de la cadena (failover ya ocurrió)
  const activeOk = chain.length > 0 && chain[0].provider === providerName($("#selProv").value);
  $("#provDot").classList.toggle("warn", !activeOk && chain.length > 0);
}

function updateChatHeader() {
  // Actualiza el encabezado de quién responde en la UI (barra superior)
  const prov = $("#selProv").value || "";
  const model = $("#selModel").value || "";
  $("#agBadge").textContent = prov && model ? prov + " · " + model : "sin key";
}

function fillSelect(sel, values, cur) {
  sel.innerHTML = "";
  if (!values || !Array.isArray(values)) {
    values = [];
  }
  for (const v of values) {
    const o = document.createElement("option");
    o.value = o.textContent = v;
    sel.appendChild(o);
  }
  if (cur) sel.value = cur;
}

/* ── bindings ── */
function bind() {
  $("#btnTheme").onclick = async () => {
    S.theme = S.theme === "dark" ? "light" : "dark";
    document.body.classList.toggle("light", S.theme === "light");
    $("#btnTheme").innerHTML = icoUse(S.theme === "dark" ? "i-sun" : "i-moon");
    await api.set_theme(S.theme);
  };
  $("#selProv").onchange = async () => {
    const name = providerName($("#selProv").value);
    const st = await api.set_provider(name);
    if (st) {
      fillSelect($("#selModel"), st.models || [], st.model);
      S.providers = st.providers || [];
      S.chain = st.chain || [];
      updApis(st);
      updChainBadge();
      // Reflejar el cambio en el encabezado del chat
      updateChatHeader();
    }
  };
  $("#selModel").onchange = () => {
    api.set_model($("#selModel").value);
    updateChatHeader();
  };
  $("#btnModelSearch").onclick = modalModelSearch;
  $("#abDesign").onclick = designEntry;
  $("#abL3d").onclick = () => ($("#l3dView").hidden ? openL3d() : closeL3d());
  $("#btnKeys").onclick = modalKeys;
  $("#btnCmp").onclick = modalCompare;
  $("#btnWs").onclick = pickWs;
  $("#btnOpen").onclick = openDialog;
  $("#btnSave").onclick = save;
  $("#btnRun").onclick = run;
  $("#btnSend").onclick = () => { if (S.busy) cancelRequest(); else send(); };
  $("#btnAttach").onclick = attachImageDialog;
  $("#imgPreviewClear").onclick = clearAttachedImage;
  $("#inp").addEventListener("paste", onPasteImage);
  $("#btnHist").onclick = history_;
  $("#btnNew").onclick = newChat;
  $("#termTog").onclick = () => {
    const t = $("#term");
    t.classList.toggle("closed");
    $("#splitTerm").hidden = t.classList.contains("closed");
    $("#termTog").innerHTML = icoUse(t.classList.contains("closed") ? "i-chev-r" : "i-chev-d");
  };
  $("#abExplorer").onclick = () => {
    const w = $("#treewrap");
    w.style.display = w.style.display === "none" ? "" : "none";
    $("#splitTree").hidden = w.style.display === "none";
    $("#abExplorer").classList.toggle("active", w.style.display !== "none");
  };
  $("#ctabLeft").onclick = () => { $("#chatTabs").scrollBy({ left: -160, behavior: "smooth" }); setTimeout(updateChatNav, 260); };
  $("#ctabRight").onclick = () => { $("#chatTabs").scrollBy({ left: 160, behavior: "smooth" }); setTimeout(updateChatNav, 260); };
  $("#chatTabs").addEventListener("scroll", updateChatNav);
  window.addEventListener("resize", updateChatNav);
  dzAlinearSuperposicionesWire();
  $("#abSearch").onclick = () => $("#q").focus();
  $("#abGit").onclick = () => {
    const b = $("#branch").textContent;
    sysMsg(b ? "rama: " + b : "⑂ El workspace no es un repo git");
  };
  $("#abAgent").onclick = () => {
    const a = $("#agentPanel");
    a.style.display = a.style.display === "none" ? "" : "none";
    $("#splitAgent").hidden = a.style.display === "none";
    $("#abAgent").classList.toggle("active", a.style.display !== "none");
  };
  $("#abArtifacts").onclick = showArtifacts;
  $("#abSocial").onclick = modalSocial;
  $("#abRoutines").onclick = modalRoutines;
  $("#abTools").onclick = modalTools;
  $("#abServers").onclick = modalServers;
  $("#abHistory").onclick = modalHistory;
  $("#abRanking").onclick = () => { showLeaderboard(); };
  // visor de artefactos
  $("#artClose").onclick = closeArtifacts;
  $("#artReload").onclick = paintArtifact;
  $("#artPrev").onclick = () => galleryNav(-1);
  $("#artNext").onclick = () => galleryNav(1);
  $("#imgSend").onclick = imgEdit;
  $("#imgPromptIn").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); imgEdit(); }
  });
  document.addEventListener("keydown", e => {
    if ($("#artView").hidden || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || ""))) return;
    if (e.key === "ArrowLeft") galleryNav(-1);
    if (e.key === "ArrowRight") galleryNav(1);
  });
  $("#artSel").onchange = () => { S.artIdx = +$("#artSel").value; paintArtifact(); };
  $("#artExt").onclick = async () => {
    const a = (S.artifacts || [])[S.artIdx];
    if (a) await api.preview_html(a.path || "", a.html);
  };
  // entorno de diseño
  dzStudioHierarchyInit();
  $("#dzClose").onclick = closeDesign;
  $("#dzSave").onclick = dzSave;
  // Pointer Events sirven tanto para mouse como para lápiz/tableta. Usar
  // mousedown acá dejaba selección, resize y rotación sin responder al stylus.
  $("#dzCanvas").addEventListener("pointerdown", dzPointerDown);
  $("#dzHandle").addEventListener("pointerdown", dzHandleDown);
  document.querySelectorAll("#dzSelBox .dz-sh").forEach(sh =>
    sh.addEventListener("pointerdown", e =>
      dzBoxHandleDown(e, +sh.dataset.hx, +sh.dataset.hy)));
  document.querySelectorAll("#dzSelBox .dz-corner-widget").forEach(widget => {
    widget.addEventListener("pointerdown", dzCornerDown);
    widget.addEventListener("dblclick", dzCornerExact);
  });
  $("#dzExt").onclick = () => api.preview_html(DZ.path || null, $("#dzCanvas").innerHTML);   // sin .svg, el puente usa un temporal. OJO: preview_html ESCRIBE en la ruta que recibe, asi que pasarle la del .low le encajaria el HTML encima y se perderia el documento.
  $("#dzZoomIn").onclick = () => dzZoom(0.15);
  $("#dzZoomOut").onclick = () => dzZoom(-0.15);
  $("#dzZoomFit").onclick = dzFitView;
  $("#dzDoc").onclick = dzDocModal;
  $("#dzRotL").onclick = () => dzRotView(-15);
$("#dzRotR").onclick = () => dzRotView(15);
$("#dzRotLbl").ondblclick = () => { DZ.viewRot = 0; dzApplyZoom(); };
$("#dzDiscBtn").onclick = () => dzDiscToggle();
  $("#dzMirror").onclick = dzMirrorToggle;
  $("#tlMove").onclick = dzMoveTween;
  $("#tlRec").onclick = dzRecToggle;
  $("#tlPuppet").onclick = dzPuppetToggle;
  $("#tlWalk").onclick = dzWalkCycleModal;
  // scrub del X-sheet: arrastrá sobre los cuadros para hojearlos (flipping)
  $("#tlFrames").addEventListener("pointerdown", (e) => {
    if (!DZ.anim) return;
    const pointerId = e.pointerId;
    let busy = false;
    const go = async (x, y) => {
      const chip = document.elementFromPoint(x, y);
      const c = chip && chip.closest && chip.closest(".tl-frame");
      if (!c || busy || !DZ.anim) return;
      const idx = [...$("#tlFrames").children].indexOf(c);
      if (idx >= 0 && idx !== DZ.anim.idx) { busy = true; try { await dzGoFrame(idx); } finally { busy = false; } }
    };
    const mm = (ev) => { if (ev.pointerId === pointerId) go(ev.clientX, ev.clientY); };
    const mu = (ev) => {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", mm);
      document.removeEventListener("pointerup", mu);
      document.removeEventListener("pointercancel", mu);
    };
    document.addEventListener("pointermove", mm);
    document.addEventListener("pointerup", mu);
    document.addEventListener("pointercancel", mu);
  });
  // herramientas de dibujo (lápiz/pincel/pluma) — pointer events para presión
  document.querySelectorAll(".dz-toolbtn").forEach(b =>
    b.onclick = () => dzSetTool(b.dataset.tool));
  // panel de estilo: color de relleno/trazo, grosor, opacidad, paleta
  $("#dzPFill").oninput = e => { DZ.fillColor = e.target.value; dzStyleApply("fill", e.target.value); };
  $("#dzPStroke").oninput = e => { DZ.drawColor = e.target.value; dzStyleApply("stroke", e.target.value); };
  $("#dzSwapPaint").onclick = dzSwapPaint;
  $("#dzFillNone").onclick = () => dzStyleApply("fill", "none") || dzSetStatus("∅ Seleccioná un elemento para sacarle el relleno");
  $("#dzStrokeNone").onclick = () => dzStyleApply("stroke", "none") || dzSetStatus("∅ Seleccioná un elemento para sacarle el trazo");
  $("#dzDrawW").oninput = e => { DZ.drawW = +e.target.value || 6; dzStyleApply("stroke-width", DZ.drawW); };
  $("#dzOpacity").oninput = e => {
    $("#dzOpacityLbl").textContent = e.target.value + "%";
    DZ.drawOpacity = Math.max(.05, +e.target.value / 100);
    dzStyleApply("opacity", (+e.target.value / 100).toFixed(2));
  };
  DZ.fillColor = $("#dzPFill").value; DZ.drawColor = $("#dzPStroke").value; DZ.drawOpacity = 1;
  dzPaletteRender();
  // preferencias del estudio: atajos configurables + suavizado persistente
  dzKeysLoad();
  DZ.smooth = +(dzPrefsStorage().getItem("low.dzsmooth") || 40);
  $("#dzSmooth").value = DZ.smooth; $("#dzSmoothLbl").textContent = DZ.smooth;
  $("#dzSmooth").oninput = e => {
    DZ.smooth = +e.target.value;
    $("#dzSmoothLbl").textContent = e.target.value;
    try { dzPrefsStorage().setItem("low.dzsmooth", String(DZ.smooth)); } catch (err) { /* */ }
  };
  // gamma de presión (OpenToonz V_BrushPressureSensitivity): <1 más sensible al inicio
  DZ.pressureGamma = +(dzPrefsStorage().getItem("low.dzgamma") || 0.85);
  DZ.pressureMin = +(dzPrefsStorage().getItem("low.dzpressuremin") || 0);
  DZ.pressureMax = +(dzPrefsStorage().getItem("low.dzpressuremax") || 1);
  $("#dzPrefs").onclick = dzPrefsModal;
  $("#dzRotate").addEventListener("pointerdown", dzRotateDown);
  $("#dzGroup").onclick = (e) => dzGroupSel(e.shiftKey);
  $("#dzImg").onclick = dzImportImage;
  $("#dzColor").onclick = dzColorize;
  $("#dzBg").onclick = dzGenBg;
  $("#dzVec").onclick = dzVectorize;
  $("#dzCanvas").addEventListener("pointerdown", dzDrawDown);
  $("#dzCanvas").addEventListener("pointermove", dzDrawMove);
  $("#dzCanvas").addEventListener("pointerup", dzDrawUp);
  $("#dzCanvas").addEventListener("pointermove", dzToolCursorMove);
  $("#dzCanvas").addEventListener("pointerenter", dzToolCursorMove);
  $("#dzCanvas").addEventListener("pointerleave", dzToolCursorHide);
  // pointerrawupdate: eventos de alta frecuencia no coalescidos (como WinTab en OpenToonz).
  // Chrome 77+, Edge 79+. Si no existe, simplemente no se registra.
  try { $("#dzCanvas").addEventListener("pointerrawupdate", dzDrawRaw); } catch (e) { /* no soportado */ }
  // el lápiz saliendo de rango / pointer cancelado no debe dejar el trazo colgado
  $("#dzCanvas").addEventListener("pointercancel", dzDrawUp);

  $("#dzCanvas").addEventListener("dblclick", (e) => {
    if (PEN) { dzPenFinish(false); return; }
    // flecha negra: doble clic ENTRA al grupo (selección profunda, como Animate)
    const t = e.target;
    if ((DZ.tool || "select") === "select" && t && t !== $("#dzCanvas")
        && t.tagName && t.tagName.toLowerCase() !== "svg"
        && !(t.closest && t.closest("[data-locked]"))) {
      dzSelect(t);
      dzSetStatus("⤵ pieza dentro del grupo — la flecha blanca (D) siempre selecciona así");
    }
  });
  // zoom con la rueda del mouse (Alt+scroll = zoom hacia el cursor, pro).
  // Sin Alt la rueda no hace nada raro: dejamos el gesto para el zoom explícito.
  $("#dzCanvas").addEventListener("wheel", (e) => {
    const policy = DZModeMachine?.wheelPolicy({ altKey: e.altKey })
      || (e.altKey ? "zoom" : (DZ.rigMode ? "block" : "scroll"));
    // La máquina de modos garantiza que una rueda común jamás atraviese el
    // overlay de rig ni se convierta accidentalmente en transformación.
    if (policy === "block") { e.preventDefault(); return; }
    if (policy !== "zoom") return;
    e.preventDefault();
    dzZoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
  }, { passive: false });
  // regla: clic derecho fija punto de fuga  prevenir menú contextual
  $("#dzCanvas").addEventListener("contextmenu", (e) => {
    if (DZ.tool === "ruler") { e.preventDefault(); return; }
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    if (!svg) return;
    const hit = document.elementsFromPoint(e.clientX, e.clientY).find(el =>
      el !== svg && svg.contains(el) && el.tagName &&
      !DZ_SKIP_TAGS.includes(el.tagName.toLowerCase()) && !el.closest?.("g.dz-onion"));
    if (hit && !hit.closest?.("[data-locked]")) dzSelect(hit);
    const selected = !!DZ.sel;
    const isGroup = selected && DZ.sel.tagName?.toLowerCase() === "g";
    showCtxMenu(e, [
      { icon:"↶", label:"Deshacer", shortcut:"Ctrl+Z", action:dzUndo },
      { icon:"↷", label:"Rehacer", shortcut:"Ctrl+Y", action:dzRedo },
      "separator",
      { icon:"⧉", label:"Duplicar", shortcut:"Ctrl+D", disabled:!selected, action:dzDuplicate },
      { icon:isGroup ? "⌁" : "▣", label:isGroup ? "Desagrupar" : "Agrupar selección", shortcut:isGroup ? "Ctrl+Shift+G" : "Ctrl+G",
        disabled:!selected, action:() => dzGroupSel(isGroup) },
      { icon:"↑", label:"Traer al frente", disabled:!selected, action:() => dzMenuAction("alfrente") },
      { icon:"↓", label:"Enviar atrás", disabled:!selected, action:() => dzMenuAction("atras") },
      { icon:"╱", label:"Mover a Línea", disabled:!selected, action:() => dzArtMoveSelection("line") },
      { icon:"●", label:"Mover a Color", disabled:!selected, action:() => dzArtMoveSelection("colour") },
      { icon:"◇", label:"Renombrar…", disabled:!selected, action:() => dzMenuAction("renombrar") },
      { icon:"▣", label:"Bloquear", disabled:!selected, action:() => dzMenuAction("bloquear") },
      "separator",
      { icon:"▤", label:"Copiar cuadro", shortcut:"Ctrl+C", disabled:!DZ.doc, action:dzCuadroCopiar },
      { icon:"▥", label:"Pegar como cuadro nuevo", shortcut:"Ctrl+V", disabled:!DZ.doc || !DZ.clipCuadro, action:dzCuadroPegar },
      { icon:"＋", label:"Cuadro vacío", disabled:!DZ.doc, action:() => dzFrameInsert(true) },
      "separator",
      { icon:"⌫", label:"Eliminar", shortcut:"Supr", disabled:!selected, action:dzDeleteSelected }
    ]);
  });
  // animación
  $("#dzAnim").onclick = dzAnimToggle;
  $("#tlPlay").onclick = dzPlayToggle;
  $("#tlLoop").onclick = () => {
    if (!DZ.anim && !DZ.playback) return;
    const loop = DZ.playback ? !DZ.playback.loop : !(DZ.anim.loop !== false);
    if (DZ.anim) DZ.anim.loop = loop;
    if (DZ.playback) DZ.playback.setLoop(loop);
    $("#tlLoop").classList.toggle("active", loop);
    dzSetStatus(loop ? " Loop activado" : " Reproducción única (sin loop)");
  };
  $("#tlFps").onchange = (e) => { if (DZ.playback) DZ.playback.setFps(+e.target.value); };
  const syncPlayRange = () => {
    if (DZ.playback) DZ.playback.setRange(+$("#tlIn").value || 1, +$("#tlOut").value || 0);
    // y que la regla lo muestre: los casilleros y las manijas son la misma cosa
    const sc = DZ.doc && DZ.doc.scene;
    if (sc) {
      sc.range.in = Math.max(1, +$("#tlIn").value || 1);
      sc.range.out = Math.max(0, +$("#tlOut").value || 0);
      DZ.doc.touch(); DZ.doc.emit("frame");
      if (typeof dzTlGridRender === "function") dzTlGridRender();
    }
  };
  $("#tlIn").onchange = syncPlayRange;
  $("#tlOut").onchange = syncPlayRange;
  // modo dibujo (zen): pantalla limpia, solo lienzo + herramientas
  $("#dzZen").onclick = dzZenToggle;
  $("#tlAdd").onclick = dzFrameAdd;
  $("#tlBlank").onclick = () => dzFrameInsert(true);
  $("#tlFirst").onclick = () => { if (DZ.playback) DZ.playback.first(); else { dzAnimStopIf(); dzGoFrame(0); } };
  $("#tlPrev").onclick = () => { if (DZ.playback) DZ.playback.step(-1); else { dzAnimStopIf(); dzGoFrame(Math.max(0, (DZ.anim ? DZ.anim.idx : 0) - 1)); } };
  $("#tlNext").onclick = () => { if (DZ.playback) DZ.playback.step(1); else { dzAnimStopIf(); dzGoFrame(Math.min((DZ.anim ? DZ.anim.frames.length : 1) - 1, (DZ.anim ? DZ.anim.idx : 0) + 1)); } };
  $("#tlLast").onclick = () => { if (DZ.playback) DZ.playback.last(); else { dzAnimStopIf(); dzGoFrame((DZ.anim ? DZ.anim.frames.length : 1) - 1); } };
  $("#tlDel").onclick = dzDeleteFrameSelection;
  $("#tlOnion").onclick = () => {
    if (!DZ.anim) return;
    DZ.anim.onion = !DZ.anim.onion;
    $("#tlOnion").classList.toggle("active", DZ.anim.onion);
    dzOnionPanelSet(DZ.anim.onion);
    dzOnionUpdate();
  };
  dzOnion2Wire();     // panel de papel cebolla (sobre el modelo de dibujos)
  $("#dzOpClose").onclick = () => dzOnionPanelSet(false);
  // chrome de estudio: menubar, splitter, opciones de herramienta, statusbar
  dzMenubarWire();
  dzSplitWire();
  dzToolOptsRender();
  dzSbTool();
  $("#dzCanvas").addEventListener("pointermove", (e) => {
    // coordenadas del cursor en unidades del documento (statusbar)
    if (DZ.sbTick) return;
    DZ.sbTick = true;
    requestAnimationFrame(() => {
      DZ.sbTick = false;
      const sb = $("#sbPos");
      if (!sb || !$("#dzCanvas").querySelector(":scope > svg")) return;
      try {
        const p = dzToUser(e.clientX, e.clientY);
        sb.textContent = Math.round(p.x) + ", " + Math.round(p.y);
      } catch (err) { /* sin svg todavía */ }
    });
  });
  // X-sheet: vista principal de animación (tiempo vertical estilo OpenToonz)
  $("#tlXs").onclick = dzXsToggle;
  $("#tlLayers").onclick = dzTlGridToggle;
  const tlGrid = $("#dzTlGrid"), tlResize = $("#dzTlgResize");
  const timelineLimits = () => ({
    min: window.innerHeight <= 820 ? 64 : 72,
    max: window.innerHeight <= 820 ? window.innerHeight * .30 : window.innerHeight * .42
  });
  const defaultTlHeight = Math.round(Math.min(180, window.innerHeight * .18));
  const savedTlHeight = +(dzPrefsStorage().getItem("low.timeline.height") || defaultTlHeight);
  const syncTimelineSeparator = () => {
    if (!tlGrid || !tlResize) return;
    const limits = timelineLimits();
    tlResize.setAttribute("aria-valuemin", String(Math.round(limits.min)));
    tlResize.setAttribute("aria-valuemax", String(Math.round(limits.max)));
    tlResize.setAttribute("aria-valuenow", String(Math.round(tlGrid.getBoundingClientRect().height)));
  };
  if (tlGrid) {
    const limits = timelineLimits();
    tlGrid.style.height = Math.max(limits.min, Math.min(limits.max, savedTlHeight)) + "px";
    requestAnimationFrame(syncTimelineSeparator);
  }
  if (tlResize) tlResize.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const pointerId = e.pointerId, startY = e.clientY;
    const startHeight = tlGrid.getBoundingClientRect().height;
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const limits = timelineLimits();
      const height = Math.max(limits.min, Math.min(limits.max, startHeight + startY - ev.clientY));
      tlGrid.style.height = height + "px";
      syncTimelineSeparator();
    };
    const up = (ev) => {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      try { dzPrefsStorage().setItem("low.timeline.height", String(Math.round(tlGrid.getBoundingClientRect().height))); } catch (err) { /* */ }
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  });
  if (tlResize) tlResize.addEventListener("dblclick", () => {
    const limits = timelineLimits();
    const current = tlGrid.getBoundingClientRect().height;
    const previous = +(tlGrid.dataset.expandedHeight || defaultTlHeight);
    if (current > limits.min + 8) {
      tlGrid.dataset.expandedHeight = String(Math.round(current));
      tlGrid.style.height = limits.min + "px";
    } else {
      tlGrid.style.height = Math.max(limits.min, Math.min(limits.max, previous)) + "px";
    }
    syncTimelineSeparator();
    try { dzPrefsStorage().setItem("low.timeline.height", String(Math.round(tlGrid.getBoundingClientRect().height))); } catch (err) { /* */ }
  });
  if (tlResize) tlResize.addEventListener("keydown", (e) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const limits = timelineLimits(), current = tlGrid.getBoundingClientRect().height;
    const next = e.key === "Home" ? limits.min : e.key === "End" ? limits.max
      : current + (e.key === "ArrowUp" ? 12 : -12);
    tlGrid.style.height = Math.max(limits.min, Math.min(limits.max, next)) + "px";
    syncTimelineSeparator();
    try { dzPrefsStorage().setItem("low.timeline.height", String(Math.round(tlGrid.getBoundingClientRect().height))); } catch (err) { /* */ }
  });
  $("#dzXsClose").onclick = () => dzAnimSetView("timeline");
  $("#dzXsHead").addEventListener("mousedown", (e) => {
    if (window.LOW_PANEL_DOCKING) return;
    if ($("#dzXsheet").classList.contains("docked") || $("#dzCanvas").classList.contains("xsheet-open")) return;
    if (e.target.id === "dzXsClose") return;
    e.preventDefault();
    const pnl = $("#dzXsheet");
    const r = pnl.getBoundingClientRect(), host = $("#designView").getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      pnl.style.left = Math.max(0, ev.clientX - host.left - dx) + "px";
      pnl.style.top = Math.max(0, ev.clientY - host.top - dy) + "px";
      pnl.style.right = "auto";
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
  // 🎭 diorama: toggle, cerrar y arrastre del panel
  $("#dzZBtn").onclick = dzZPanelToggle;
  const zAutoKey = $("#dzZAutoKey"), zExact = $("#dzZExact");
  DZ.compositionAutoKey = localStorage.getItem("low.composition.autokey") === "1";
  if (zAutoKey) {
    zAutoKey.checked = DZ.compositionAutoKey;
    zAutoKey.onchange = () => {
      DZ.compositionAutoKey = zAutoKey.checked;
      localStorage.setItem("low.composition.autokey", DZ.compositionAutoKey ? "1" : "0");
      dzSetStatus(DZ.compositionAutoKey ? "Auto-key de profundidad activo" : "Auto-key de profundidad desactivado");
    };
  }
  if (zExact) zExact.onchange = () => dzCompositionSetExactZ(zExact.value);
  // "Espacio 3D" (dz3d*, ~1100 líneas más abajo) quedó retirado del toolbar:
  // el dibujo/orbit 3D real ahora vive en LOW Estudio (ui/estudio3d/). El
  // código dz3d* sigue en este archivo sin usar — no borrado por si hace
  // falta rescatar algo (matrices de plano orientado, anchor snapping).
  $("#dzRulersBtn").onclick = dzRulersToggle;
  $("#dzGridBtn").onclick = dzGridToggle;
  $("#dzGuidesBtn").onclick = dzGuidesToggle;
  // panel de capas estilo Photoshop (fusión + acciones)
  $("#dzLayNew").onclick = dzLayerNew;
  $("#dzLayDup").onclick = () => { if (DZ.sel) dzDuplicate(); };
  $("#dzLayGroup").onclick = e => dzGroupSel(e.shiftKey);
  $("#dzLayMerge").onclick = dzLayerMergeDown;
  $("#dzLayUp").onclick = () => dzLayerMove(1);
  $("#dzLayDown").onclick = () => dzLayerMove(-1);
  $("#dzLayDel").onclick = () => {
    const layer = DZ.activeLayer?.isConnected && DZ.activeLayer.hasAttribute?.("data-low-layer")
      ? DZ.activeLayer : DZ.sel;
    if (!layer || layer.hasAttribute?.("data-low-art")) return dzSetStatus("Los planos Línea y Color no se pueden borrar");
    dzSelect(layer); dzDeleteSelected(); DZ.activeLayer = null;
  };
  $("#dzBlend").onchange = e => dzLayerBlend(e.target.value);
  $("#dzLayOpacity").oninput = e => dzLayerOpacity(e.target.value, false);
  $("#dzLayOpacity").onchange = e => dzLayerOpacity(e.target.value, true);
  const fnBtn = $("#tlFnOpen");
  if (fnBtn) fnBtn.onclick = () => { dzFnToggle(); fnBtn.classList.toggle("active", !$("#dzFnEditor").hidden); };
  dzCompositorWire();
  $("#dzRlTop").addEventListener("pointerdown", e => dzRulerPull(e, "h"));
  $("#dzRlBottom").addEventListener("pointerdown", e => dzRulerPull(e, "h"));
  $("#dzRlLeft").addEventListener("pointerdown", e => dzRulerPull(e, "v"));
  $("#dzRlRight").addEventListener("pointerdown", e => dzRulerPull(e, "v"));
  $("#dzZpClose").onclick = () => { $("#dzZPanel").hidden = true; $("#dzZBtn").classList.remove("active"); };
  $("#dzZpHead").addEventListener("mousedown", (e) => {
    if (e.target.id === "dzZpClose") return;
    e.preventDefault();
    const pnl = $("#dzZPanel");
    const r = pnl.getBoundingClientRect(), host = $("#designView").getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      pnl.style.left = Math.max(0, ev.clientX - host.left - dx) + "px";
      pnl.style.top = Math.max(0, ev.clientY - host.top - dy) + "px";
      pnl.style.right = "auto";
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
  $("#dzOpHead").addEventListener("mousedown", (e) => {
    if (window.LOW_PANEL_DOCKING) return;
    if ($("#dzOnionPanel").closest("#dzAnimationDock")) return;
    if (e.target.id === "dzOpClose") return;
    e.preventDefault();
    const pnl = $("#dzOnionPanel");
    const r = pnl.getBoundingClientRect(), host = $("#designView").getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      pnl.style.left = Math.max(0, ev.clientX - host.left - dx) + "px";
      pnl.style.top = Math.max(0, ev.clientY - host.top - dy) + "px";
      pnl.style.right = "auto";
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
  // ── panel de rig ──
  $("#dzRigBtn").onclick = dzRigToggle;
  $("#tlRigOpen").onclick = dzRigOpen;
  $("#dzRigClose").onclick = dzRigToggle;
  $("#dzRigHead").addEventListener("mousedown", (e) => {
    if (window.LOW_PANEL_DOCKING || $("#dzRigPanel").closest("#dzAnimationDock")) return;
    if (e.target.id === "dzRigClose") return;
    e.preventDefault();
    const pnl = $("#dzRigPanel");
    const r = pnl.getBoundingClientRect(), host = $("#designView").getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    const move = (ev) => {
      pnl.style.left = Math.max(0, ev.clientX - host.left - dx) + "px";
      pnl.style.top = Math.max(0, ev.clientY - host.top - dy) + "px";
      pnl.style.right = "auto";
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
  });
  $("#rigLipGen") && ($("#rigLipGen").onclick = () => dzLipGenerar());
  $("#rigLipClear") && ($("#rigLipClear").onclick = () => dzLipBorrar());
  ["Umbral", "Sosten"].forEach((k) => {
    const input = $("#rigLip" + k), out = $("#rigLip" + k + "Val");
    if (input && out) input.oninput = () => {
      out.textContent = k === "Umbral" ? (input.value / 100).toFixed(2) : input.value + " cuadros";
    };
  });
  $("#rigDialNew") && ($("#rigDialNew").onclick = () => dzDialNuevo());
  $("#rigDialRemove") && ($("#rigDialRemove").onclick = () => dzDialQuitar());
  $("#rigSmartNew") && ($("#rigSmartNew").onclick = () => dzSmartNueva());
  $("#rigSmartRecord") && ($("#rigSmartRecord").onclick = () => dzSmartGrabar());
  $("#rigSmartRemove") && ($("#rigSmartRemove").onclick = () => dzSmartQuitar());
  $("#rigSmartList") && ($("#rigSmartList").onchange = () => dzSmartPanelSync());
  ["rigSmartMin", "rigSmartMax"].forEach((k) => {
    const el = $("#" + k); if (el) el.onchange = () => dzSmartRango();
  });
  $("#rigMeshCreate") && ($("#rigMeshCreate").onclick = () => dzMeshCrear());
  $("#rigMeshAuto") && ($("#rigMeshAuto").onclick = () => dzMeshAuto());
  $("#rigMeshPaint") && ($("#rigMeshPaint").onclick = () => dzMeshPaintToggle());
  $("#rigMeshRemove") && ($("#rigMeshRemove").onclick = () => dzMeshQuitar());
  ["Force", "Radius"].forEach((k) => {
    const input = $("#rigMesh" + k), out = $("#rigMesh" + k + "Val");
    if (input && out) input.oninput = () => { out.textContent = input.value + (k === "Force" ? "%" : " px"); };
  });
  $("#rigModeBuild").onclick = () => dzRigSetMode("build");
  $("#rigModeTest").onclick = dzRigEnterTest;
  $("#rigModeFk").onclick = () => dzRigSetMode("fk");
  $("#rigModeIk").onclick = () => dzRigSetMode("ik");
  $("#rigModeAnim").onclick = () => dzRigSetMode(DZ.rigSubmode === "ik" ? "ik" : "fk");
  $("#rigToolSelect").onclick = () => dzRigSetTool("select");
  $("#rigToolPose").onclick = () => dzRigSetTool("pose");
  $("#rigToolCreate").onclick = () => dzRigSetTool("create");
  $("#rigToolEdit").onclick = () => dzRigSetTool("edit");
  $("#rigToolDraw").onclick = () => dzRigSetTool("draw");
  $("#rigToolCut").onclick = () => dzRigSetTool("cut");
  $("#rigToolPivot").onclick = () => dzRigSetTool("pivot");
  $("#rigAutoKey").onchange = e => {
    DZ.rigAutoKey = !!e.target.checked;
    dzSetStatus(DZ.rigAutoKey
      ? "Auto-clave activada — al soltar se clava la pose"
      : "Auto-clave desactivada — posá libre y confirmá con Enter (Esc descarta)");
  };
  $("#rigId").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault(); dzRigRegisterSelected();
  });
  $("#rigAuto").onclick = dzRigPrepareDrawing;
  $("#rigRepartir").onclick = dzRigRepartirDibujo;
  // onclick entrega un MouseEvent. Pasarlo directo hacía que la biblioteca
  // buscara una plantilla cuyo nombre era "[object MouseEvent]".
  $("#rigLibraryAdd").onclick = () => dzRigLibraryAdd();
  $("#rigImportCharacter").onclick = () => dzRigImportCharacter();
  $("#rigCharacterSave").onclick = dzCharacterSave;
  $("#rigCharacterLoad").onclick = dzCharacterLoad;
  $("#rigCharacterDelete").onclick = dzCharacterDelete;
  $("#rigClearAll").onclick = dzRigClearAll;
  dzCharacterLibraryRender();
  $("#rigAdd").onclick = dzRigRegisterSelected;
  $("#rigRemove").onclick = dzRigRemoveSelected;
  $("#rigPivotTool").onclick = () => dzRigSetTool("pivot");
  $("#rigPin").onclick = dzRigTogglePin;
  $("#rigBind").onclick = dzRigBindSelection;
  $("#rigUnbind").onclick = dzRigUnbindSelection;
  // En HTML un input numérico cambia su valor con la rueda aunque el usuario
  // sólo intente recorrer el panel. En el rig eso escribía X/Y/rotación y
  // movía al personaje. La rueda ahora desplaza el panel sin editar valores.
  $("#dzRigPanel").addEventListener("wheel", e => {
    if (!e.target.closest?.('input[type="number"]')) return;
    e.preventDefault(); e.stopPropagation();
    const panel = $("#dzRigPanel");
    panel.scrollTop += e.deltaY;
    panel.scrollLeft += e.deltaX;
  }, { passive: false, capture: true });
  ["rigX", "rigY", "rigR", "rigSX", "rigSY"].forEach(id => {
    $("#" + id).addEventListener("input", () => {
      if (!dzRigSelectedNode()) return dzSetStatus("Esta capa todavía no es una pieza · usá Preparar dibujo o Añadir");
      const k = dzRigReadPanel();
      dzRigApplyLive(dzRigCur(), { [dzRigSelectedNode().id]: k });
    });
    $("#" + id).addEventListener("change", () => {
      if (!dzRigSelectedNode()) return dzSetStatus("Esta capa todavía no es una pieza · usá Preparar dibujo o Añadir");
      dzRigSetKey(dzRigSelectedNode().id, dzRigCur(), dzRigReadPanel());   // auto-clave AE-style
      dzSetStatus(" clave en el cuadro " + dzRigCur());
    });
  });
  ["rigMin", "rigMax"].forEach(id => $("#" + id).addEventListener("change", () => {
    const node = dzRigSelectedNode(); if (!DZ.doc || !node) return;
    DZ.doc.setRigLimits(node.id, +$("#rigMin").value, +$("#rigMax").value);
    dzRigPanelSync(); dzRigOverlayRender();
  }));
  // "Sin topes": libera el giro de TODOS los huesos del personaje actual (360°).
  $("#rigNoTope")?.addEventListener("click", () => {
    if (!DZ.doc) return;
    const nodes = Object.values(DZ.doc.scene.rig?.nodes || {});
    nodes.forEach(n => DZ.doc.setRigLimits(n.id, -180, 180));
    dzRigPanelSync(); dzRigOverlayRender();
  });
  $("#rigKey").onclick = () => {
    if (!dzRigSelectedNode()) return dzSetStatus("Seleccioná una pieza registrada o usá Preparar dibujo");
    dzRigSetKey(dzRigSelectedNode().id, dzRigCur(), dzRigReadPanel());
    dzSetStatus(" pose clavada en el cuadro " + dzRigCur());
  };
  $("#rigKeyAll").onclick = dzRigKeyAll;
  $("#rigDel").onclick = () => {
    const node = dzRigSelectedNode(); if (node) dzRigDelKey(node.id, dzRigCur());
  };
  $("#rigReset").onclick = dzRigResetPose;
  $("#rigParent").onchange = e => {
    const node = dzRigSelectedNode(); if (!DZ.doc || !node) return;
    if (!DZ.doc.setRigParent(node.id, e.target.value || null)) dzSetStatus(" No se puede crear un ciclo en la jerarquía");
    else { dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); }
  };
  $("#rigIkCreate").onclick = dzRigCreateIK;
  $("#rigIkDelete").onclick = dzRigDeleteIK;
  $("#rigIkFlip").onclick = dzRigFlipIK;
  $("#rigIkMatch").onclick = dzRigMatchIK;
  $("#rigIkToFk").onclick = dzRigMatchFK;
  $("#rigIkPin").onclick = dzRigTogglePin;
  $("#rigConstraint").onchange = e => { DZ.rigConstraintId = e.target.value || null; dzRigPanelSync(); dzRigOverlayRender(); };
  document.querySelectorAll(".rig2-ease button").forEach(b => b.onclick = () => dzRigEasePreset(b.dataset.ease));
  $("#dzAnchoFijo").onclick = dzAnchoFijoToggle;
  $("#rigArco").onclick = dzRigArcoToggle;
  $("#rigVolumen").onclick = dzPrincipioVolumen;
  $("#rigDesfasar").onclick = () => dzPrincipioDesfase(+$("#rigDesfase").value || 2);
  $("#rigExagerar").onclick = () => dzPrincipioExagerar(+$("#rigExagFactor").value || 1.25);
  $("#rigBlocking").onclick = () => dzPrincipioBlocking(true);
  $("#rigBlockingOff").onclick = () => dzPrincipioBlocking(false);
  $("#rigDefAdd").onclick = dzRigDoblarCrear;
  $("#rigDefDel").onclick = dzRigDoblarQuitar;
  $("#rigDefClear").onclick = dzRigDoblarLimpiar;
  $("#rigVarAdd").onclick = dzRigVarAdd;
  $("#rigVarDel").onclick = dzRigVarDel;
  $("#rigVarClear").onclick = dzRigVarClear;
  $("#perfRec").onclick = dzPerfRec;
  $("#perfPlay").onclick = dzPerfPlay;
  $("#perfSmooth").onclick = dzPerfSmooth;
  $("#perfBake").onclick = dzPerfBake;
  let dzShapeKind = "rect";
  const dzShapeMenu = $("#dzShapeMenu"), dzShapeMainIcon = $("#dzShapeMainIcon");
  const dzShapeMenuAbrir = (boton) => {
    const r=boton.getBoundingClientRect();
    dzShapeMenu.style.left=(r.right+6)+"px";
    dzShapeMenu.style.top=Math.max(6,Math.min(innerHeight-82,r.top-5))+"px";
    dzShapeMenu.hidden=false;
  };
  // El clic ARMA la herramienta con la forma en uso: es lo que uno espera de un
  // botón de herramienta, y lo que hace falta para después arrastrar en la mesa.
  // El menú se abre con la flecha o manteniendo pulsado, como dice el tooltip.
  $("#dzShapeMain").onclick = (e) => {
    if (e.target.closest(".dz-shape-caret")) return dzShapeMenuAbrir(e.currentTarget);
    dzShapeMenu.hidden=true; dzFormaElegir(dzFormaKind());
  };
  $("#dzShapeMain").onpointerdown = (e) => {
    const boton=e.currentTarget;
    clearTimeout(DZ._shapeHold);
    DZ._shapeHold=setTimeout(()=>dzShapeMenuAbrir(boton), 320);
  };
  ["pointerup","pointerleave","pointercancel"].forEach(ev=>
    $("#dzShapeMain").addEventListener(ev, ()=>clearTimeout(DZ._shapeHold)));
  [["dzAddRect","rect"],["dzAddCircle","circle"],["dzAddEllipse","ellipse"],
   ["dzAddPoly","poly"],["dzAddStar","star"]].forEach(([id,kind])=>{
    $("#"+id).onclick=()=>{ dzShapeKind=kind; dzFormaElegir(kind); };
  });
  document.addEventListener("pointerdown", e=>{
    if(!$("#dzShapePicker")?.contains(e.target)) dzShapeMenu.hidden=true;
  });
  $("#dzAddText").onclick = () => dzAddShape("text");
  $("#dzAddLine").onclick = () => dzFormaElegir("line");
  $("#tlIns").onclick = (e) => dzFrameInsert(e.shiftKey);
  $("#tlTween").onclick = dzTweenModal;
  const bArco = $("#tlArco");
  if (bArco) bArco.onclick = (e) => (e.shiftKey ? dzArcoFijar() : dzArcoToggle());
  $("#tlExport").onclick = dzExportModal;
  $("#tlKey").onclick = dzKeyToggle;
  $("#tlAI").onclick = dzAIKeyModal;
  $("#tlCamKey").onclick = dzCamKeyToggle;
  // cámara: botón de la barra lateral + tiradores del encuadre
  $("#dzCamBtn").onclick = dzCamToggle;
  $("#dzCam").addEventListener("pointerdown", dzCamDrag);
  $("#dzCamSize").addEventListener("pointerdown", dzCamResize);
  $("#dzCamRot").addEventListener("pointerdown", dzCamRotate);
  // espacio mantenido = mano (panear con arrastre)
  document.addEventListener("keydown", e => {
    if (e.code === "Space" && !$("#designView").hidden &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) {
      if (!DZ.spaceDown) { DZ.spaceDown = true; $("#dzCanvas").style.cursor = "grab"; }
      e.preventDefault();
    }
  });
  document.addEventListener("keyup", e => {
    if (e.code === "Space" && DZ.spaceDown) {
      DZ.spaceDown = false;
      $("#dzCanvas").style.cursor = (DZ.tool || "select") in DZ_CURSORS ? DZ_CURSORS[DZ.tool || "select"] : "crosshair";
    }
  });
  // confirmar/descartar una pose de prueba + atajos de herramienta (rig)
  document.addEventListener("keydown", e => {
    if (!DZ.rigMode || $("#designView").hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (DZ.rigTesting) {
        dzSetStatus("Probar nunca crea claves · pasá a Animar para grabar esta pose");
        return;
      }
      if (dzRigCommitPreview()) dzSetStatus("Pose clavada en F" + dzRigCur());
      else dzSetStatus("Nada que clavar — posá un hueso primero");
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault(); e.stopImmediatePropagation(); dzEscapeActive(); return;
    }
    const k = (e.key || "").toLowerCase();
    if (k === "s") { e.preventDefault(); dzRigSetTool("select"); }
    else if (k === "p" && DZ.rigSubmode !== "build") { e.preventDefault(); dzRigSetTool("pose"); }
    else if (k === "b" && DZ.rigSubmode === "build") { e.preventDefault(); dzRigSetTool("create"); }
  });
  $("#dzDup").onclick = dzDuplicate;
  $("#dzDel").onclick = dzDeleteSelected;
  $("#dzVar").onclick = dzVariations;
  $("#dzCodeBtn").onclick = dzToggleCode;
  $("#dzCodeApply").onclick = dzApplyCode;
  $("#dzSend").onclick = designPrompt;
  $("#dzAiSequence").onclick = dzAIKeyModal;
  $("#dzPrompt").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); designPrompt(); }
  });
  // atajos del editor de diseño (si no estás escribiendo en un campo)
  document.addEventListener("keydown", e => {
    if ($("#designView").hidden) return;
    // DESHACER / REHACER van ANTES del guard de campos: son lo último que uno
    // quiere que falle. Solo se ceden dentro de un campo de TEXTO, donde
    // Ctrl+Z tiene que deshacer lo que estás escribiendo.
    const t = (e.target.tagName || "").toUpperCase();
    const escribiendoTexto = t === "TEXTAREA"
      || (t === "INPUT" && /^(text|search|email|url|password|)$/i.test(e.target.type || ""));
    if ((e.ctrlKey || e.metaKey) && !escribiendoTexto) {
      const k = e.key.toLowerCase();
      if (k === "n") { e.preventDefault(); dzDocumentNew(); return; }
      if (k === "o") { e.preventDefault(); dzSceneOpen(); return; }
      if (k === "s") { e.preventDefault(); DZ.doc ? dzSceneSave(!!e.shiftKey) : dzSave(); return; }
      if (k === "w") { e.preventDefault(); closeDesign(); return; }
      if (k === "tab" && DZ.documentTabs.length > 1) {
        e.preventDefault();
        const at = DZ.documentTabs.findIndex(tab => tab.id === DZ.activeDocumentTab);
        const step = e.shiftKey ? -1 : 1;
        const next = (at + step + DZ.documentTabs.length) % DZ.documentTabs.length;
        dzDocumentTabActivate(DZ.documentTabs[next].id); return;
      }
      if (k === "z" && !e.shiftKey) { e.preventDefault(); dzUndo(); return; }
      if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); dzRedo(); return; }
    }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t)) return;
    if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "x") {
      e.preventDefault(); dzSwapPaint(); return;
    }
    if (e.key === "Tab") { e.preventDefault(); dzZenToggle(); return; }   // modo dibujo
    if (e.key === "F7") { e.preventDefault(); dzLayersToggle(); return; } // capas
    if (e.ctrlKey && e.key.toLowerCase() === "r") { e.preventDefault(); dzRulersToggle(); return; } // reglas 2D
    // ── espacio 3D: 3 entra · adentro 1/3/7/5 = vistas (estilo Blender),
    //    F = centrar cámara, Shift+A = plano nuevo, Esc = salir ──
    if (DZ.d3) {
      if (e.key === "Escape" && !PEN && !RULER) {
        e.preventDefault(); e.stopImmediatePropagation(); dz3dExit(); return;
      }
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        const V = { "1": "front", "3": "side", "7": "top", "5": "persp" };
        if (V[e.key]) { e.preventDefault(); dz3dView(V[e.key]); return; }
        if (e.key.toLowerCase() === "f") { e.preventDefault(); dz3dHome(); return; }
        if (e.shiftKey && e.key.toLowerCase() === "a") { e.preventDefault(); dz3dAddPlane(); return; }
      }
    } else if (e.key === "3" && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault(); dz3dToggle(); return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (dzDeleteContext()) { e.preventDefault(); return; }
    }
    if (e.ctrlKey && e.key.toLowerCase() === "d" && DZ.sel) {
      e.preventDefault(); dzDuplicate();
    }
    // Ctrl+C / Ctrl+V sobre la escena: copiar un cuadro y hacer el siguiente
    // encima de la copia. Si hay texto seleccionado manda el copiar de siempre.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey &&
        DZ.doc && !$("#designView").hidden) {
      const tecla = e.key.toLowerCase();
      const hayTextoElegido = (window.getSelection() || "").toString().trim().length > 0;
      if (tecla === "c" && !hayTextoElegido) { e.preventDefault(); dzCuadroCopiar(); return; }
      if (tecla === "v" && DZ.clipCuadro) { e.preventDefault(); dzCuadroPegar(); return; }
    }
    if (e.ctrlKey && e.key.toLowerCase() === "g") {
      e.preventDefault(); dzGroupSel(e.shiftKey); return;
    }
    // Z = acercar · Alt+Z = alejar (zoom estilo OpenToonz, centrado en la mesa)
    if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "z") {
      e.preventDefault();
      const c = $("#dzCanvas").getBoundingClientRect();
      dzZoomAt(e.altKey ? 1 / 1.2 : 1.2, c.left + c.width / 2, c.top + c.height / 2);
      return;
    }
    // atajos configurables ( Preferencias): una tecla  una acción
    if (!e.ctrlKey && !e.altKey && !e.metaKey) {
      if (!DZ.keyrev) dzKeysLoad();
      // Además de las teclas sueltas, el mapa admite Enter: hacía falta un
      // atajo para reproducir que no fuera la barra espaciadora.
      const k = e.key.length === 1 ? (e.key === "=" ? "+" : e.key.toLowerCase())
        : (e.key === "Enter" ? "enter" : null);
      const act = k && DZ.keyrev[k];
      // con la pluma abierta, Enter cierra el trazado: eso manda
      if (act && !(k === "enter" && PEN)) { e.preventDefault(); dzRunAction(act); if (DZ_KEY_LABELS[act]) dzSetStatus(DZ_KEY_LABELS[act] + " · lo pidio la tecla «" + k.toUpperCase() + "» (cambiala en Preferencias → atajos)"); }   /* DE DONDE VINO: «se activa sola una herramienta pincel sin que nadie la elija». Una tecla suelta cambia de herramienta, y las ExpressKeys de una tableta mandan teclas: si vino del teclado, que lo diga. */
    }
    if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); dzUndo(); }
    if (e.ctrlKey && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { e.preventDefault(); dzRedo(); }
    if (e.key === "Enter" && PEN) { e.preventDefault(); dzPenFinish(false); }
    if (e.key === "Backspace" && PEN) { e.preventDefault(); dzPenBackspace(); }
    if (e.key === "Escape" && PEN) {
      // cancela la pluma SIN cerrar el editor (frena el Escape global)
      e.preventDefault(); e.stopImmediatePropagation(); dzPenFinish(true);
    }
    if (e.key === "Escape" && RULER) {
      e.preventDefault(); e.stopImmediatePropagation(); dzRulerClear();
    }
    if (e.key === "Escape" && DZ.pup) {
      // Esc corta/cancela la grabación de titiritero sin cerrar el editor
      e.preventDefault(); e.stopImmediatePropagation(); dzPuppetStop();
    }
  });
  document.querySelectorAll(".chip").forEach(c => {
    c.onclick = () => {
      const cmd = c.dataset.chip;
      if (cmd === "/compare") modalCompare();
      else if (cmd === "/run") run();
      else command(cmd);
    };
  });
  $("#inp").addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
  $("#q").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const v = $("#q").value.trim();
      $("#q").value = "";
      if (v) { $("#inp").value = v; send(); }
    }
    if (e.key === "Escape") cm.focus();
  });
  $("#selLang").onchange = applyEditorMode;
  document.addEventListener("keydown", e => {
    // El módulo 2D administra sus propios documentos y atajos. No crear una
    // solapa de código ni guardar el editor que quedó detrás del lienzo.
    if (!$("#designView").hidden && (e.ctrlKey || e.metaKey)) return;
    if (e.ctrlKey && e.key.toLowerCase() === "k") { e.preventDefault(); $("#q").focus(); }
    if (e.ctrlKey && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    if (e.ctrlKey && e.key.toLowerCase() === "n") { e.preventDefault(); newTab(); }
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); run(); }
    if (e.ctrlKey && (e.key === "+" || e.key === "=")) { e.preventDefault(); applyZoom(S.zoom + 0.1); }
    if (e.ctrlKey && e.key === "-") { e.preventDefault(); applyZoom(S.zoom - 0.1); }
    if (e.ctrlKey && e.key === "0") { e.preventDefault(); applyZoom(1.0); }
    if (e.key === "Escape") {
      if (!$("#overlay").hidden) closeModal();         // 1º cierra modal abierto
      else if (!$("#designView").hidden) dzEscapeActive(); // en 2D cancela/suelta; nunca cierra el módulo
      else if (!$("#artView").hidden) closeArtifacts(); // 3º cierra el visor de artefactos
      else if (!$("#l3dView").hidden) closeL3d();       // 4º cierra LOW Estudio (3D)
      else if (S.busy) cancelRequest();                // 5º detiene consulta en curso
    }
  });
  $("#overlay").onclick = e => { if (e.target === $("#overlay")) closeModal(); };
}

/* ── tabs ── */
function curTab() { return S.tabs.find(t => t.id === S.cur); }

function newTab() {
  S.untitled++;
  const name = S.untitled === 1 ? "sin título" : `sin título ${S.untitled}`;
  addTab("*untitled" + S.untitled, name, "// Nuevo archivo\n", "python");
}

function addTab(id, name, content, lang) {
  const ex = S.tabs.find(t => t.id === id);
  if (ex) return switchTab(id);
  const doc = CodeMirror.Doc(content, CM_MODE[lang] || "python");
  S.tabs.push({ id, name, doc, modified: false, path: id.startsWith("*") ? null : id, lang });
  switchTab(id);
}

function switchTab(id) {
  S.cur = id;
  const t = curTab();
  S.loading = true;
  cm.swapDoc(t.doc);
  S.loading = false;
  applyEditorMode();   // respeta el idioma forzado; en "auto" detecta por extensión
  document.title = "LOW — " + t.name;
  renderTabs(); renderTree(); updateLnCol();
  cm.focus();
}

async function closeTab(id) {
  const t = S.tabs.find(x => x.id === id);
  if (!t) return;
  if (t.modified && !(await dzConfirmModal(`${t.name} tiene cambios sin guardar. ¿Cerrar igual?`, { ok: "Cerrar igual", danger: true }))) return;
  S.tabs = S.tabs.filter(x => x.id !== id);
  if (S.cur === id) {
    if (S.tabs.length) switchTab(S.tabs[S.tabs.length - 1].id);
    else { S.cur = null; newTab(); }
  } else renderTabs();
}

function renderTabs() {
  const bar = $("#tabs");
  bar.innerHTML = "";
  for (const t of S.tabs) {
    const el = document.createElement("div");
    el.className = "tab" + (t.id === S.cur ? " active" : "");
    const nm = document.createElement("span");
    nm.textContent = t.name;
    el.appendChild(nm);
    if (t.modified) { const d = document.createElement("span"); d.className = "mdot"; el.appendChild(d); }
    const x = document.createElement("span");
    x.className = "x"; x.textContent = "✕"; x.title = "Cerrar";
    x.onclick = e => { e.stopPropagation(); closeTab(t.id); };
    el.appendChild(x);
    el.onclick = () => switchTab(t.id);
    el.onauxclick = e => { if (e.button === 1) closeTab(t.id); };
    bar.appendChild(el);
  }
  //  archivo nuevo, siempre al final de las solapas
  const plus = document.createElement("div");
  plus.className = "tab tab-plus"; plus.title = "Archivo nuevo (Ctrl+N)";
  plus.textContent = "+";
  plus.onclick = () => newTab();
  bar.appendChild(plus);
}

/* ── árbol ── */
function renderTree() {
  const box = $("#tree");
  box.innerHTML = "";
  if (!S.tree || !S.tree.length) {
    box.innerHTML = '<div class="tree-empty">Abrí una carpeta con el ícono de carpeta del menú superior</div>';
    return;
  }
  const walk = (items, depth) => {
    for (const it of items) {
      const el = document.createElement("div");
      el.className = "titem";
      el.style.paddingLeft = (8 + depth * 14) + "px";
      if (it.dir) {
        const open = S.expanded.has(it.path);
        el.textContent = (open ? " " : " ") + it.name;
        el.onclick = () => {
          open ? S.expanded.delete(it.path) : S.expanded.add(it.path);
          renderTree();
        };
        box.appendChild(el);
        if (open && it.children) walk(it.children, depth + 1);
      } else {
        el.textContent = it.name;
        const tab = S.tabs.find(t => t.path === it.path);
        if (tab && t_active(tab)) el.classList.add("active");
        if (tab && tab.modified) { const d = document.createElement("span"); d.className = "mdot"; el.appendChild(d); }
        el.onclick = () => openFile(it.path);
        box.appendChild(el);
      }
    }
  };
  walk(S.tree, 0);
}
const t_active = t => t.id === S.cur;

async function pickWs() {
  const r = await api.pick_ws();
  if (!r) return;
  S.ws = r.ws; S.tree = r.tree;
  S.expanded = new Set();
  $("#projName").textContent = r.ws.split(/[\\/]/).pop().toUpperCase();
  $("#branch").textContent = r.branch ? "⑂ " + r.branch : "";
  renderTree();
  sysMsg(" Workspace: " + r.ws); persist("system", " Workspace: " + r.ws);
}

async function openFile(path, range) {
  if (SVG_RE.test(path)) return openDesign(path);  // vectores  entorno de diseño
  if (IMG_RE.test(path)) return openImage(path);   // imágenes  visor, no al editor
  if (DOC_RE.test(path)) {                          // .docx/.pdf  su app (Word…)
    const r = await api.open_external(path);
    if (r && r.error) sysMsg(" No pude abrirlo: " + r.error);
    return;
  }
  const r = await api.open_file(path);
  if (r.error) return sysMsg(" " + r.error);
  const existed = S.tabs.find(t => t.id === r.path);
  addTab(r.path, r.name, r.content, r.lang);
  // si el tab ya existía, su doc quedó desactualizado: refrescar con lo nuevo
  if (existed && existed.doc.getValue() !== r.content) {
    S.loading = true; existed.doc.setValue(r.content); S.loading = false;
  }
  if (range) highlightRange(range[0], range[1]);
}

/* resalta en vivo el rango de líneas que acaba de tocar el agente y hace scroll */
function highlightRange(start, end) {
  try {
    cm.operation(() => {
      for (let ln = start; ln <= end && ln < cm.lineCount(); ln++)
        cm.addLineClass(ln, "background", "cm-edited");
    });
    cm.scrollIntoView({ line: start, ch: 0 }, 120);
    cm.setCursor({ line: start, ch: 0 });
    setTimeout(() => cm.operation(() => {
      for (let ln = start; ln <= end && ln < cm.lineCount(); ln++)
        cm.removeLineClass(ln, "background", "cm-edited");
    }), 2200);
  } catch (e) { /* fuera de rango: sin drama */ }
}

/* ── visor de imágenes / SVG dentro de LOW (reusa el panel de artefactos) ── */
async function openImage(path, alsoChat) {
  const r = await api.image_data(path);
  if (!r || r.error) return sysMsg(" No pude abrir la imagen: " + ((r && r.error) || path));
  const name = r.name || path.split(/[\\/]/).pop();
  // renderizar centrada sobre fondo tipo lienzo, con la imagen escalada al panel
  const html = '<body style="margin:0;height:100vh;display:flex;align-items:center;' +
    'justify-content:center;background:#141416;background-image:' +
    'linear-gradient(45deg,#1c1c1f 25%,transparent 25%),linear-gradient(-45deg,#1c1c1f 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#1c1c1f 75%),linear-gradient(-45deg,transparent 75%,#1c1c1f 75%);' +
    'background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0">' +
    '<img src="' + r.data_url + '" style="max-width:100%;max-height:100vh;object-fit:contain;' +
    'box-shadow:0 4px 30px rgba(0,0,0,.5)"></body>';
  addArtifact(name, html, path);
  showArtifacts();
  if (alsoChat) chatImage(r.data_url, name);
}

/* ── galería: navegar con ‹ › entre todas las imágenes del proyecto ── */
function treeImages() {
  const out = [];
  const walk = (items) => (items || []).forEach(it => {
    if (it.dir) walk(it.children);
    else if (IMG_RE.test(it.name) || SVG_RE.test(it.name)) out.push(it.path);
  });
  walk(S.tree);
  return out;
}
async function galleryNav(dir) {
  const imgs = treeImages();
  if (!imgs.length) return setStatus("(no hay imágenes en el proyecto)");
  const cur = (S.artifacts || [])[S.artIdx];
  let i = cur ? imgs.indexOf(cur.path) : -1;
  i = i === -1 ? 0 : (i + dir + imgs.length) % imgs.length;
  const p = imgs[i];
  setStatus(` ${i + 1}/${imgs.length}`);
  if (SVG_RE.test(p)) { closeArtifacts(); await openDesign(p); }
  else await openImage(p);
}

async function openDialog() {
  const r = await api.open_dialog();
  if (r && !r.error) addTab(r.path, r.name, r.content, r.lang);
}

async function save() {
  const t = curTab();
  if (!t) return;
  const r = await api.save_file(t.path, cm.getValue());
  if (!r) return;
  if (!dzSaveOk(r)) {
    t.modified = true; renderTabs();
    setStatus("⚠ sin guardar: " + dzSaveError(r));
    return sysMsg("⚠ No se guardó «" + (t.name || t.path) + "»: " + dzSaveError(r) +
      ". El archivo anterior en disco sigue intacto.");
  }
  t.path = r.path; t.name = r.name; t.id = t.id.startsWith("*") ? r.path : t.id;
  if (S.cur.startsWith("*")) S.cur = t.id;
  t.modified = false;
  document.title = "LOW — " + t.name;
  renderTabs(); renderTree();
  setStatus(" " + r.name);
}

/* ── ejecutar ── */
async function run() {
  const code = cm.getValue().trim();
  $("#term").classList.remove("closed");
  $("#termTog").innerHTML = icoUse("i-chev-d");
  if (!code || code === "// Nuevo archivo") {
    termLine("(no hay código para ejecutar en el editor)");
    return;
  }
  const t = curTab();
  try {
    if (esHtml(t)) {
      // HTML no se "ejecuta": se renderiza EN VIVO adentro de LOW (artefacto)
      const name = t && t.name ? t.name : "vista previa.html";
      addArtifact(name, cm.getValue(), t && t.path ? t.path : "");
      showArtifacts();
      termLine(" Artefacto renderizado dentro de LOW (botón  para el navegador)", "t-ok");
      setStatus(" Vista previa en vivo");
      return;
    }
    const lang = effectiveLang();
    termLine("➜ run " + lang, "t-ok");
    setStatus(" Ejecutando…");
    const t0 = performance.now();
    const r = await api.run_code(code, lang);
    const seg = ((performance.now() - t0) / 1000).toFixed(1);
    if (r.error) termLine(" " + r.error, "t-err");
    else {
      if (r.stdout) termLine(r.stdout.replace(/\n$/, ""));
      if (r.stderr) termLine(r.stderr.replace(/\n$/, ""), "t-err");
      if (!r.stdout && !r.stderr) termLine("(sin salida)");
      termLine(`── exit ${r.returncode ?? "?"} · ${seg}s ──`,
               r.returncode === 0 ? "t-ok" : "t-err");
    }
    setStatus("Listo");
  } catch (e) {
    termLine(" Ejecutar falló: " + (e.message || e), "t-err");
    reportErr("run: " + (e.message || e));
    setStatus("Error");
  }
}

function termLine(txt, cls) {
  const out = $("#termOut");
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = txt;
  out.appendChild(d);
  out.scrollTop = out.scrollHeight;
}

/* ── chat ── */
function scrollMsgs() { const m = $("#msgs"); m.scrollTop = m.scrollHeight; }
function setStatus(t) { $("#status").textContent = t; }

/* contador en vivo mientras el modelo trabaja — así no parece congelado
   (los razonadores como glm-5.2 pueden pensar 30-60s antes del primer token) */
function startThinking() {
  S.thinkT0 = Date.now();
  clearInterval(S.thinkTimer);
  const tick = () => {
    const s = Math.round((Date.now() - S.thinkT0) / 1000);
    setStatus(` Pensando… ${s}s` + (s > 20 ? " (los modelos que razonan tardan más)" : ""));
  };
  tick();
  S.thinkTimer = setInterval(tick, 1000);
}
function stopThinking() { clearInterval(S.thinkTimer); S.thinkTimer = null; }
function persist(role, content, sid) { api && api.persist(role, content, sid || null); }

function userMsg(text, imgDataUrl) {
  const d = document.createElement("div");
  d.className = "m-user";
  if (imgDataUrl) {
    const img = document.createElement("img");
    img.className = "m-user-img"; img.src = imgDataUrl;
    d.appendChild(img);
  }
  if (text) {
    const t = document.createElement("div");
    t.textContent = text;
    d.appendChild(t);
  }
  $("#msgs").appendChild(d); scrollMsgs();
}

/* ── imagen adjunta (visión): diálogo, pegado desde portapapeles, preview ── */
async function attachImageDialog() {
  const img = await api.pick_image();
  if (!img) return;
  if (img.error) { sysMsg(" " + img.error); return; }
  setAttachedImage(img);
}

function onPasteImage(e) {
  const items = (e.clipboardData && e.clipboardData.items) || [];
  for (const it of items) {
    if (it.type && it.type.startsWith("image/")) {
      e.preventDefault();
      const file = it.getAsFile();
      const reader = new FileReader();
      reader.onload = () => {
        const [, mime, data] = /^data:(.+?);base64,(.+)$/.exec(reader.result) || [];
        if (data) setAttachedImage({ data, mime: mime || "image/png", name: "pegada.png" });
      };
      reader.readAsDataURL(file);
      return;
    }
  }
}

function setAttachedImage(img) {
  S.attachedImage = img;
  $("#imgPreviewThumb").src = `data:${img.mime};base64,${img.data}`;
  $("#imgPreviewName").textContent = img.name || "imagen";
  $("#imgPreview").hidden = false;
}

function clearAttachedImage() {
  S.attachedImage = null;
  $("#imgPreview").hidden = true;
  $("#imgPreviewThumb").src = "";
}

/* miniatura clickeable en el chat de una imagen que generó/abrió el agente */
function chatImage(dataUrl, name) {
  const d = document.createElement("div");
  d.className = "m-img";
  const img = document.createElement("img");
  img.src = dataUrl; img.title = name + " — clic para verla en grande";
  img.onclick = () => { addArtifact(name, imgHtml(dataUrl), name); showArtifacts(); };
  const cap = document.createElement("div");
  cap.className = "m-img-cap"; cap.textContent = " " + name;
  d.appendChild(img); d.appendChild(cap);
  $("#msgs").appendChild(d); scrollMsgs();
}
function imgHtml(dataUrl) {
  return '<body style="margin:0;height:100vh;display:flex;align-items:center;' +
    'justify-content:center;background:#141416"><img src="' + dataUrl +
    '" style="max-width:100%;max-height:100vh;object-fit:contain"></body>';
}

function agentMsg(text) {
  const w = document.createElement("div");
  w.className = "m-agent";
  const h = document.createElement("div");
  h.className = "m-head";
  h.innerHTML = '<div class="m-ava"></div>';
  const who = document.createElement("span");
  who.className = "m-who";
  who.textContent = "LOW · " + ($("#selProv").value || "?") + " · " + ($("#selModel").value || "?");
  h.appendChild(who);
  const b = document.createElement("div");
  b.className = "m-txt"; b.textContent = text;
  w.appendChild(h); w.appendChild(b);
  $("#msgs").appendChild(w); scrollMsgs();
  return w;
}

function sysMsg(text) {
  const d = document.createElement("div");
  // sin prefijo fijo: los mensajes ya traen su propio marcador (…) cuando
  // corresponde — duplicarlo con un icono genérico solo sumaba ruido visual
  d.className = "m-sys"; d.textContent = text;
  $("#msgs").appendChild(d); scrollMsgs();
  return d;
}

/* burbuja de "pensamiento" del modelo (reasoning_content en vivo, colapsable) */
function thinkMsg() {
  const w = document.createElement("div");
  w.className = "m-think";
  w.innerHTML = '<div class="think-head"> Pensando… <span class="think-toggle">ocultar</span></div>' +
                '<div class="think-body"></div>';
  const tog = w.querySelector(".think-toggle");
  tog.onclick = () => {
    w.classList.toggle("collapsed");
    tog.textContent = w.classList.contains("collapsed") ? "mostrar" : "ocultar";
  };
  $("#msgs").appendChild(w); scrollMsgs();
  return w;
}

/* tarjeta Plan: se crea con el primer tool call del turno */
function toolStep(desc, res) {
  if (!S.plan) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = '<div class="card-h">Actividad <span class="n">…</span>' +
      '<div class="prog"><div></div></div></div><div class="card-b"></div>';
    $("#msgs").appendChild(card);
    S.plan = { card, steps: 0 };
  }
  const body = S.plan.card.querySelector(".card-b");
  const d = document.createElement("div");
  d.className = "step";
  const short = (res || "").split("\n")[0].slice(0, 70);
  const ok = !/^\s*/.test(res || "");
  d.innerHTML = `<span class="ck"></span> <span class="fn"></span> <span></span>`;
  const ck = d.querySelector(".ck");
  ck.textContent = ok ? "✓" : "✗";
  if (!ok) ck.style.color = "var(--red)";
  d.children[1].textContent = desc;        // texto amigable ( Leyendo X,  …)
  d.children[2].textContent = short;
  body.appendChild(d);
  S.plan.steps++;
  S.plan.card.querySelector(".prog > div").style.width = Math.min(100, S.plan.steps * 12) + "%";
  scrollMsgs();
}

function planDone() {
  clearWorkingOn();
  if (!S.plan) return;
  S.plan.card.querySelector(".card-h .n").textContent = `✓ ${S.plan.steps} paso${S.plan.steps === 1 ? "" : "s"}`;
  S.plan.card.querySelector(".prog > div").style.width = "100%";
  S.plan = null;
}

/* indicador en vivo de en qué archivo/acción está el agente ahora mismo.
   El texto lo pinta el heartbeat (elapsed + esta acción); acá solo lo guardamos. */
function setWorkingOn(text) {
  S.lastAction = text;
  const el = $("#workingOn");
  if (el && S.busy) el.hidden = false;
}
function clearWorkingOn() {
  S.lastAction = "";
  const el = $("#workingOn");
  el.hidden = true;
  el.textContent = "";
}

async function send() {
  const inp = $("#inp");
  const msg = inp.value.trim();
  const img = S.attachedImage;
  if (!msg && !img) return;
  inp.value = "";
  if (msg.startsWith("/")) return command(msg);
  const sid = S.chatId;   // charla de ESTE turno: si cambiás de solapa mientras
                          // el agente trabaja, la respuesta se guarda en la suya
  userMsg(msg, img ? `data:${img.mime};base64,${img.data}` : null);
  persist("user", msg || "(imagen adjunta)", sid);
  clearAttachedImage();
  const p = S.providers.find(x => x.name === $("#selProv").value);
  if (!p || (!p.has_key && p.name !== "custom" && !p.name.startsWith("custom_"))) {
    agentMsg("Configura la API key () para empezar");
    return;
  }
  startThinking();
  setBusy(true);
  window.LOW.Workbench?.start();
  S.plan = null;
  try {
    const r = await api.send_chat(msg, cm.getValue(), effectiveLang(), img);
    window.LOW.Workbench?.finish(!!r?.error);
    stopThinking();
    planDone();
    // si vino por streaming, la burbuja ya se armó con los eventos agent_*
    if (r && r.streamed) { persist("LOW", r.full || "", sid); }
    else if (r && r.text) { agentMsg(r.text); persist("LOW", r.text, sid); }
    if (r && r.status) setStatus(r.status);
  } catch (e) {
    stopThinking();
    planDone();
    S.streamEl = null; S.thinkEl = null;
    agentMsg(" Falló la llamada: " + (e.message || e));
    reportErr("send_chat: " + (e.message || e));
    window.LOW.Workbench?.finish(true);
    setStatus("Error");
  } finally {
    setBusy(false);
    loadChatTabs().catch(() => {});
  }
}

/* botón enviar ⇄ detener mientras el agente trabaja */
function setBusy(b) {
  S.busy = b;
  const btn = $("#btnSend");
  btn.innerHTML = icoUse(b ? "i-stop" : "i-arrow");
  btn.title = b ? "Detener" : "Enviar";
  if (b) startHeartbeat(); else stopHeartbeat();
}

/* ── heartbeat: latido en vivo durante TODO el turno, para que nunca parezca
   colgado (aunque el modelo esté pensando en silencio entre tool-calls) ── */
function startHeartbeat() {
  S.turnStart = Date.now(); S.lastAction = "";
  clearInterval(S.hbTimer);
  const tick = () => {
    const s = Math.round((Date.now() - S.turnStart) / 1000);
    const el = $("#workingOn");
    if (el) {
      el.hidden = false;
      el.textContent = `⏳ Trabajando ${s}s` + (S.lastAction ? " · " + S.lastAction : "…");
    }
    if (S.plan) {
      const n = S.plan.card.querySelector(".card-h .n");
      if (n) n.textContent = `${S.plan.steps} paso${S.plan.steps === 1 ? "" : "s"} · ${s}s`;
    }
  };
  tick();
  S.hbTimer = setInterval(tick, 1000);
}
function stopHeartbeat() {
  clearInterval(S.hbTimer); S.hbTimer = null;
  const el = $("#workingOn"); if (el) { el.hidden = true; el.textContent = ""; }
}
function cancelRequest() {
  api.cancel();
  stopThinking();
  setStatus(" Deteniendo…");
}

/* ── comandos slash ── */
async function command(msg) {
  const c = msg.slice(1).trim();
  const [cmd, ...rest] = c.split(/\s+/);
  const arg = rest.join(" ");
  if (cmd === "run") return run();
  if (cmd === "compare" && !arg) return modalCompare();
  if (cmd === "compare") return compare(arg.split(/\s+/), "", "");
  if (cmd === "history") return history_();
  if (cmd === "resume" && arg) return resume(arg);
  if (cmd === "undo") {
    const r = await api.undo_turn();
    sysMsg(r.msg);
    if (r.tree) { S.tree = r.tree; renderTree(); }
    return;
  }
  if (cmd === "ranking" || cmd === "leaderboard") return showLeaderboard();
  const r = await api.command(cmd, arg, c);
  if (!r) return;
  if (r.open) addTab(r.open.path, r.open.name, r.open.content, r.open.lang);
  if (r.msgs) for (const m of r.msgs) { sysMsg(m.content); persist("system", m.content); }
}

async function history_() {
  const files = await api.history();
  if (!files.length) return sysMsg("Sin historial");
  for (const f of files) sysMsg(` ${f.id}: ${f.first}`);
  sysMsg(" /resume <id> para restaurar");
}

async function resume(sid) {
  const msgs = await api.resume(sid);
  if (msgs.error) return sysMsg(" " + msgs.error);
  S.chatId = sid;
  $("#msgs").innerHTML = "";
  for (const m of msgs) {
    if (m.role === "user") userMsg(m.content);
    else if (m.role === "LOW") agentMsg(m.content);
    else sysMsg(m.content);
  }
  sysMsg(` Restaurada (${msgs.length} msgs)`);
  renderChatTabs();
}

async function newChat() {
  const id = await api.new_session();
  if (id) S.chatId = id;
  $("#msgs").innerHTML = "";
  sysMsg("Nueva conversación");
  await loadChatTabs();
}

/* ── solapas de conversaciones: navegar entre chats como pestañas ── */
async function loadChatTabs() {
  try { S.chats = await api.history(); } catch (e) { S.chats = []; }
  renderChatTabs();
}

function renderChatTabs() {
  const bar = $("#chatTabs");
  if (!bar) return;
  // asegurar que la conversación activa aparezca aunque todavía no esté guardada
  const items = (S.chats || []).slice();
  if (S.chatId && !items.some(c => c.id === S.chatId))
    items.unshift({ id: S.chatId, first: "Nueva conversación", n: 0 });
  const wrap = $("#chatTabsWrap");
  if (wrap) wrap.hidden = items.length === 0;
  bar.innerHTML = "";
  let activeEl = null;
  for (const c of items) {
    const el = document.createElement("div");
    el.className = "ctab" + (c.id === S.chatId ? " active" : "");
    const label = (c.first && c.first !== "(vacía)") ? c.first : "Nueva conversación";
    el.title = label + (c.n ? `  ·  ${c.n} msgs` : "");
    const t = document.createElement("span");
    t.className = "ctab-t";
    t.textContent = label;   // el ancho lo maneja el CSS (se encoge + ellipsis)
    el.appendChild(t);
    el.onclick = () => switchChat(c.id);
    // botón cerrar (✕) — no dispara el switchChat del contenedor
    const cx = document.createElement("span");
    cx.className = "cx"; cx.textContent = "✕"; cx.title = "Cerrar conversación";
    cx.onclick = (e) => { e.stopPropagation(); closeChat(c.id, label); };
    el.appendChild(cx);
    bar.appendChild(el);
    if (c.id === S.chatId) activeEl = el;
  }
  if (activeEl) activeEl.scrollIntoView({ inline: "nearest", block: "nearest" });
  updateChatNav();
}

/* flechas ‹ ›: solo cuando las solapas no entran ni encogidas */
function updateChatNav() {
  const strip = $("#chatTabs"), l = $("#ctabLeft"), r = $("#ctabRight");
  if (!strip || !l || !r) return;
  const overflow = strip.scrollWidth > strip.clientWidth + 2;
  l.hidden = r.hidden = !overflow;
  if (overflow) {
    l.disabled = strip.scrollLeft <= 1;
    r.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }
}

async function switchChat(id) {
  if (!id || id === S.chatId) return;
  await resume(id);
}

async function closeChat(id, label) {
  if (!id) return;
  const r = await api.delete_session(id);
  if (r && r.error) return sysMsg(" No pude cerrar la conversación: " + r.error);
  S.chats = (r && r.chats) || [];
  // si cerré la que estaba abierta, el backend arrancó una nueva  limpiar chat
  if (r && r.was_active) {
    S.chatId = r.session_id;
    $("#msgs").innerHTML = "";
    sysMsg(`Cerré «${label || id}». Conversación nueva.`);
  }
  renderChatTabs();
}

/* ── manejadores de tamaño: arrastrar para agrandar/achicar paneles ── */
function makeColSplitter(el, target, side, key) {
  if (!el || !target) return;
  el.addEventListener("mousedown", e => {
    e.preventDefault();
    const x0 = e.clientX, w0 = target.getBoundingClientRect().width;
    el.classList.add("dragging"); document.body.style.cursor = "col-resize";
    const move = ev => {
      const w = side === "left" ? w0 + (ev.clientX - x0) : w0 - (ev.clientX - x0);
      target.style.width = Math.max(140, Math.min(760, w)) + "px";
      cm && cm.refresh();
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      el.classList.remove("dragging"); document.body.style.cursor = "";
      try { localStorage.setItem(key, target.style.width); } catch (e) { /* */ }
      updateChatNav();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}
function makeRowSplitter(el, target, key) {
  if (!el || !target) return;
  el.addEventListener("mousedown", e => {
    e.preventDefault();
    const y0 = e.clientY, h0 = target.getBoundingClientRect().height;
    el.classList.add("dragging"); document.body.style.cursor = "row-resize";
    const move = ev => {
      const h = h0 - (ev.clientY - y0);   // el terminal está abajo: arrastrar arriba agranda
      target.style.height = Math.max(40, Math.min(560, h)) + "px";
      cm && cm.refresh();
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      el.classList.remove("dragging"); document.body.style.cursor = "";
      try { localStorage.setItem(key, target.style.height); } catch (e) { /* */ }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}
function restorePanelSizes() {
  try {
    const tw = localStorage.getItem("low.tree.w"); if (tw) $("#treewrap").style.width = tw;
    const aw = localStorage.getItem("low.agent.w"); if (aw) $("#agentPanel").style.width = aw;
    const th = localStorage.getItem("low.term.h"); if (th) $("#termOut").style.height = th;
  } catch (e) { /* */ }
}
function initSplitters() {
  makeColSplitter($("#splitTree"), $("#treewrap"), "left", "low.tree.w");
  makeColSplitter($("#splitAgent"), $("#agentPanel"), "right", "low.agent.w");
  makeRowSplitter($("#splitTerm"), $("#termOut"), "low.term.h");
}

/* ── tabla de posiciones histórica de los desafíos ── */
async function showLeaderboard() {
  const r = await api.leaderboard();
  if (!r.n_desafios) return sysMsg("Todavía no hay desafíos guardados — corré uno con ⚖");
  let txt = `🏆 Tabla de posiciones (${r.n_desafios} desafíos)\n`;
  r.tabla.slice(0, 10).forEach((d, i) => {
    txt += `${i + 1}. ${d.model} — ${d.wins} victorias · ${d.tasa}% funciona · ${d.lat_prom}ms prom\n`;
  });
  sysMsg(txt.trimEnd());
}

/* ── propuesta de cambios ── */
async function propose(code) {
  const old = cm.getValue();
  if (code.trim() === old.trim()) return;
  const st = await api.diff_stats(old, code);
  S.loading = true;
  cm.setValue(code);
  S.loading = false;
  for (const [a, b] of st.ranges)
    for (let i = a; i < b && i < cm.lineCount(); i++)
      cm.addLineClass(i, "background", "agent-line");
  S.pending = { old, tid: S.cur };
  const t = curTab();
  if (t) { t.modified = true; renderTabs(); renderTree(); }

  const card = document.createElement("div");
  card.className = "card";
  const row = document.createElement("div");
  row.className = "chg-row";
  row.innerHTML = '<span class="pen"></span><span class="file"></span>' +
    `<span class="plus">+${st.adds}</span><span class="minus">−${st.dels}</span>` +
    '<span class="flex1"></span><span class="verdiff">Ver diff</span>';
  row.querySelector(".file").textContent = t ? t.name : "editor";
  row.querySelector(".verdiff").onclick = () => showDiff(old, code, t ? t.name : "editor");
  const btns = document.createElement("div");
  btns.className = "chg-btns";
  const ok = document.createElement("button");
  ok.className = "ok"; ok.textContent = "Aceptar";
  const no = document.createElement("button");
  no.className = "no"; no.textContent = "Rechazar";
  const done = msg => { ok.disabled = no.disabled = true; setStatus(msg); };
  ok.onclick = () => { clearAgentLines(); S.pending = null; done(" Cambios aceptados"); };
  no.onclick = () => {
    if (S.pending) {
      if (S.cur === S.pending.tid) { S.loading = true; cm.setValue(S.pending.old); S.loading = false; }
      else {
        const tt = S.tabs.find(x => x.id === S.pending.tid);
        if (tt) tt.doc.setValue(S.pending.old);
      }
      S.pending = null;
    }
    clearAgentLines(); done("↩ Cambios rechazados");
  };
  btns.appendChild(ok); btns.appendChild(no);
  card.appendChild(row); card.appendChild(btns);
  $("#msgs").appendChild(card); scrollMsgs();
}

function clearAgentLines() {
  for (let i = 0; i < cm.lineCount(); i++) cm.removeLineClass(i, "background", "agent-line");
}

/* ── diff lado a lado (antes / después) ── */
function esc(s) {
  // escapa también comillas: esc() se usa dentro de atributos title="…"
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function showDiff(oldTxt, newTxt, name) {
  // LCS por líneas para marcar agregados/borrados/iguales
  const a = oldTxt.split("\n"), b = newTxt.split("\n");
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { rows.push(["=", a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push(["-", a[i]]); i++; }
    else { rows.push(["+", b[j]]); j++; }
  }
  while (i < m) rows.push(["-", a[i++]]);
  while (j < n) rows.push(["+", b[j++]]);
  const body = rows.map(([k, ln]) =>
    `<div class="dl ${k === '+' ? 'dl-add' : k === '-' ? 'dl-del' : ''}">` +
    `<span class="dg">${k === '=' ? ' ' : k}</span>${esc(ln) || "&nbsp;"}</div>`).join("");
  openModal(`<h2>Diff · ${esc(name)}</h2>
    <div class="diffbox">${body}</div>
    <div class="m-actions"><button class="primary" id="mCancel">Cerrar</button></div>`);
  $("#mCancel").onclick = closeModal;
}

/* ── comparar modelos: desafío de código verificado ── */
const DEF_TASK = "Escribe un programa Python que imprima los primeros 10 numeros primos en una sola linea separados por coma.";
const DEF_EXP = "2, 3, 5, 7, 11, 13, 17, 19, 23, 29";

function modalCompare() {

  openModal(`
    <h2>Desafío de código</h2>
    <div class="sub">La misma consigna a cada modelo. LOW compila, ejecuta y verifica
    la salida: gana el código que funciona, no el más rápido.</div>
    <textarea id="cmpTask" class="cmp-field" rows="3" spellcheck="false"></textarea>
    <input id="cmpExp" class="cmp-field" spellcheck="false"
           placeholder="Salida esperada (opcional — si la dejás vacía solo se verifica que corra)">
    ${rows}
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="mGo">Competir</button>
    </div>`);
  $("#cmpTask").value = DEF_TASK;
  $("#cmpExp").value = DEF_EXP;
  $("#mCancel").onclick = closeModal;
  $("#mGo").onclick = () => {
    const sel = [...document.querySelectorAll('#modal input[type="checkbox"]:checked')].map(i => i.dataset.p);
    const task = $("#cmpTask").value.trim();
    const exp = $("#cmpExp").value.trim();
    closeModal();
    if (sel.length) compare(sel, task, exp);
  };
}

async function compare(models, task, expected) {
  await api.compare(task || "", expected || "", models);  // resultados via eventos 'sys'
}

/* ── config de APIs ── */
function modalKeys() {
  const rows = window.LOW.ProviderSettings.render(S.providers);
  openModal(`
    <h2>API Keys</h2>
    <div class="sub" id="cfgPath"></div>
    ${rows}
    <h2 style="margin-top:16px">Instrucciones del agente</h2>
    <div class="sub">El system prompt completo que recibe el modelo — LOW no
    agrega nada más, ni filtros ni instrucciones ocultas. Vacío = usar el de fábrica.</div>
    <textarea id="sysP" class="cmp-field" rows="4" spellcheck="false"></textarea>
    <h2 style="margin-top:16px">Límites del agente</h2>
    <div class="sub">LOW no le pone techo al trabajo salvo lo que elijas acá (y el
    de la API). Subilos para tareas grandes; el único freno duro es que el agente
    deje de avanzar.</div>
    <div class="agrow"><label>Pasos por tramo</label>
      <input id="agSteps" type="number" min="1" spellcheck="false"></div>
    <div class="agrow"><label>Tramos automáticos</label>
      <input id="agConts" type="number" min="1" spellcheck="false"></div>
    <div class="agrow"><label>Turnos que recuerda</label>
      <input id="agMem" type="number" min="1" spellcheck="false"></div>
    <div class="agrow"><label>Verificar ejecución</label>
      <label class="agchk"><input id="agVerify" type="checkbox"> corre el código y, si falla en runtime, pide corrección (no solo que compile)</label></div>
    <div class="agrow"><label>Revisar diseño (SVG)</label>
      <label class="agchk"><input id="agDesign" type="checkbox"> rasteriza el SVG y lo revisa con visión para que no dibuje a ciegas</label></div>
    <h2 style="margin-top:16px">Redes Sociales</h2>
    <div class="sub">Conectá tus cuentas DESDE ACÁ: al tocar Conectar se abre tu
    navegador, autorizás en la plataforma y el permiso vuelve solo a LOW por un
    callback local — los tokens quedan cifrados en tu máquina. Necesitás una app
    propia en cada plataforma (Canva Developers, Meta for Developers, LinkedIn
    Developers, X Developer Portal, TikTok Developers) con esta Redirect URI
    registrada: <b id="socRedir">…</b></div>
    <div id="socRows" class="sub">Cargando…</div>
    <h2 style="margin-top:16px">Identidad de marca</h2>
    <div class="sub">Brand Profile compacto (JSON): tono, palabras prohibidas
    (banned), hashtags (tags), paleta, fuentes, CTAs. El agente valida TODO lo
    que publica contra esto — se guarda con el botón Guardar de abajo.</div>
    <textarea id="brandJson" class="cmp-field" rows="6" spellcheck="false"></textarea>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="mSave">Guardar</button>
    </div>`);
  api.config_path().then(p => { $("#cfgPath").textContent = "Se guardan en " + p; });
  window.LOW.ProviderSettings.bind((name, settings) => api.check_provider(name, settings));
  renderSocialCfg(true);
  $("#sysP").value = S.sysPrompt || "";
  $("#sysP").placeholder = S.defaultSp || "";
  $("#agSteps").value = S.agent.max_steps ?? 40;
  $("#agConts").value = S.agent.max_continuations ?? 25;
  $("#agMem").value = S.agent.memory_turns ?? 24;
  $("#agVerify").checked = S.agent.verify_runtime !== false;   // default: activado
  $("#agDesign").checked = S.agent.verify_design === true;     // default: apagado (opt-in)
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    let keys;
    try { keys = window.LOW.ProviderSettings.collect(); }
    catch (error) { alert(error.message); return; }
    S.sysPrompt = $("#sysP").value.trim();
    await api.save_system_prompt(S.sysPrompt);
    const bj = $("#brandJson").value.trim();
    if (bj) {
      try {
        JSON.parse(bj);           // valida antes de mandar
        const rb = await api.social_save_brand(bj);
        if (rb && rb.error) sysMsg(" Marca: " + rb.error);
      } catch (e) {
        sysMsg(" El Brand Profile no es JSON válido — no se guardó (" + e.message + ")");
      }
    }
    S.agent = await api.save_agent_config($("#agSteps").value, $("#agConts").value, $("#agMem").value, $("#agVerify").checked, $("#agDesign").checked);
    const st = await api.save_keys(keys);
    S.providers = st.providers;
    // refrescar el dropdown con los nombres visibles (incluyendo media)
    const allNames = st.providers.map(p => p.media_only ? p.name + " (media)" : p.name);
    const curProv = (st.providers.find(p => p.name === st.provider) || {}).media_only
      ? st.provider + " (media)" : st.provider;
    fillSelect($("#selProv"), allNames, curProv);
    fillSelect($("#selModel"), st.models, st.model);
    updApis(st);
    closeModal();
    sysMsg(" Configuración guardada");
  };
}

/* ──   Redes Sociales: conexiones OAuth desde LOW ── */
async function renderSocialCfg(firstLoad) {
  const st = await api.social_state();
  if (!$("#socRows")) return;                       // el modal ya se cerró
  if (st && st.error) { $("#socRows").textContent = " " + st.error; return; }
  $("#socRedir").textContent = st.redirect_uri || "";
  $("#socRows").innerHTML = (st.platforms || []).map(p => p.connected
    ? `<div class="krow soc-row" data-k="${p.key}"><label>${p.label}</label>
         <span class="soc-st" title="${esc(p.handle || "")}"> ${esc(p.handle || "conectado")}</span>
         <button class="ghost soc-off" data-k="${p.key}">Desconectar</button></div>`
    : `<div class="krow soc-row" data-k="${p.key}"><label>${p.label}</label>
         <input class="soc-id" placeholder="Client ID${p.has_app ? " (ya guardado)" : ""}" spellcheck="false">
         <input class="soc-sec" type="password" placeholder="Client Secret (si tu app usa)" spellcheck="false">
         <button class="primary soc-on" data-k="${p.key}">Conectar</button></div>`
  ).join("") || "Módulo social no disponible.";
  document.querySelectorAll("#socRows .soc-on").forEach(b => b.onclick = async () => {
    const row = b.closest(".soc-row");
    b.disabled = true; b.textContent = "Autorizá en el navegador…";
    const r = await api.social_connect(b.dataset.k,
      row.querySelector(".soc-id").value.trim(),
      row.querySelector(".soc-sec").value.trim());
    if (r && r.error) {
      sysMsg(" " + b.dataset.k + ": " + r.error);
      b.disabled = false; b.textContent = "Conectar";
    } else {
      sysMsg(" Cuenta conectada" + (r.handle ? ": " + r.handle : "") +
             (r.warning ? " ·  " + r.warning : ""));
      renderSocialCfg(false);
    }
  });
  document.querySelectorAll("#socRows .soc-off").forEach(b => b.onclick = async () => {
    await api.social_disconnect(b.dataset.k);
    sysMsg("Cuenta de " + b.dataset.k + " desconectada (token eliminado)");
    renderSocialCfg(false);
  });
  // el brand solo se carga al abrir, para no pisar lo que el usuario esté editando
  if (firstLoad && $("#brandJson"))
    $("#brandJson").value = JSON.stringify(st.brand || {}, null, 2);
}

/* ── Redes sociales: panel del módulo (nuevo post, cola, templates) ── */
async function modalSocial() {
  openModal(`<h2>Redes sociales</h2><div class="sub">Cargando…</div>`);
  const st = await api.social_state();
  if ($("#overlay").hidden) return;                 // lo cerraron mientras cargaba
  if (st && st.error) {
    openModal(`<h2>Redes sociales</h2><div class="sub">${esc(st.error)}</div>
      <div class="m-actions"><button class="primary" id="mCancel">Cerrar</button></div>`);
    $("#mCancel").onclick = closeModal;
    return;
  }
  const nets = (st.platforms || []).filter(p => p.key !== "canva");
  const conn = nets.filter(p => p.connected);
  const canva = (st.platforms || []).find(p => p.key === "canva");
  const chips = (st.platforms || []).map(p =>
    `<span class="soc-chip${p.connected ? " on" : ""}" title="${esc(p.handle || (p.connected ? "conectada" : "sin conectar — Cuentas y marca"))}">${esc(p.label)}</span>`).join("");
  const tplOpts = ['<option value="">Sin template (solo texto)</option>']
    .concat((st.templates || []).map(t =>
      `<option value="${t.id}">${esc(t.name || t.canva_template_id)}${t.format ? " · " + esc(t.format) : ""}</option>`)).join("");
  const netOpts = conn.length
    ? conn.map(p => `<option value="${p.key}">${esc(p.label)}</option>`).join("")
    : '<option value="">Sin cuentas conectadas</option>';
  // estado  [ícono del set, etiqueta]
  const ST = { draft: ["i-pencil", "borrador"], validated: ["i-check", "validado"],
               rendering: ["i-image", "render"], ready: ["i-artifact", "listo"],
               scheduled: ["i-clock", "programado"], publishing: ["i-send", "publicando"],
               published: ["i-check", "publicado"], failed: ["i-x", "falló"] };
  const rows = (st.queue || []).map(q => {
    const [ico, lbl] = ST[q.status] || ["i-file", q.status];
    return `<div class="q-row st-${q.status}">
      <span class="q-st" title="${esc(q.error || lbl)}">${icoUse(ico)} ${lbl}</span>
      <span class="q-net">${esc(q.network)}</span>
      <span class="q-cap" title="${esc(q.caption)}">${esc(q.caption) || "(sin texto)"}</span>
      <span class="q-when">${esc((q.published_at || q.scheduled_at || "").replace("T", " ").slice(0, 16))}</span>
      ${q.status === "published" || q.status === "publishing" ? ""
        : `<button class="ibtn q-go" data-id="${q.id}" title="Validar contra la marca, renderizar y publicar ya">${icoUse("i-play")}</button>`}
      ${q.status === "publishing" ? ""
        : `<button class="ibtn q-del" data-id="${q.id}" title="Quitar de la cola">${icoUse("i-x")}</button>`}
    </div>`;
  }).join("") || '<div class="sub">La cola está vacía — creá tu primer post arriba.</div>';
  openModal(`
    <h2>Redes sociales</h2>
    <div class="sub">El autopiloto de LOW: encolás el post, el agente lo valida
    contra tu marca, lo renderiza con Canva (si elegís template) y lo publica
    solo — ya o a la hora programada.</div>
    <div class="soc-chips">${chips}
      <div class="flex1"></div>
      <button class="ghost soc-btn" id="socCfg" title="Conectar cuentas (OAuth) y editar la identidad de marca">${icoUse("i-gear")} Cuentas y marca</button>
      ${canva && canva.connected ? `<button class="ghost soc-btn" id="socSync" title="Traer los Brand Templates de tu Canva">${icoUse("i-routine")} Templates</button>` : ""}
    </div>
    <h2 style="margin-top:14px">Nuevo post</h2>
    <div class="krow"><label>Red</label><select id="socNet" class="langsel">${netOpts}</select>
      <label class="soc-l2">Template</label><select id="socTpl" class="langsel">${tplOpts}</select></div>
    <textarea id="socCopy" class="cmp-field" rows="3" spellcheck="false"
      placeholder="¿Qué querés publicar? El agente lo adapta al tono de tu marca y a los límites de la red."></textarea>
    <div class="krow"><label>Programar</label><input type="datetime-local" id="socWhen">
      <button class="ghost soc-btn" id="socQueue" title="Queda en la cola y sale solo a la hora elegida">${icoUse("i-clock")} Programar</button>
      <div class="flex1"></div>
      <button class="primary soc-btn" id="socNow" title="Validar, renderizar y publicar ahora mismo">${icoUse("i-send")} Publicar ya</button></div>
    <h2 style="margin-top:14px">Cola de contenido</h2>
    <div id="socQ">${rows}</div>
    <div class="m-actions">
      <button class="ghost soc-btn" id="socRefresh">${icoUse("i-routine")} Actualizar</button>
      <button class="primary" id="mCancel">Cerrar</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  $("#socRefresh").onclick = modalSocial;
  $("#socCfg").onclick = () => { closeModal(); modalKeys(); };
  const sync = $("#socSync");
  if (sync) sync.onclick = async () => {
    sync.disabled = true; sync.textContent = "Sincronizando…";
    const r = await api.social_sync_templates();
    if (r && r.error) sysMsg("Templates: " + r.error);
    else sysMsg(`${(r.templates || []).length} template(s) de Canva sincronizados`);
    modalSocial();
  };
  const newPost = async (publishNow) => {
    const net = $("#socNet").value;
    const copy = $("#socCopy").value.trim();
    const tpl = $("#socTpl").value;
    const when = $("#socWhen").value;
    if (!net) return sysMsg("Conectá una cuenta primero (Cuentas y marca)");
    if (!copy) return sysMsg("Escribí el contenido del post");
    if (!publishNow && !when) return sysMsg("Elegí fecha y hora para programarlo");
    const btn = $(publishNow ? "#socNow" : "#socQueue");
    const prev = btn.innerHTML;
    btn.disabled = true; btn.textContent = publishNow ? "Publicando…" : "Encolando…";
    const r = await api.social_enqueue(net, copy, tpl,
      publishNow ? "" : new Date(when).toISOString());
    if (r && r.error) {
      sysMsg(r.error);
      btn.disabled = false; btn.innerHTML = prev;
      return;
    }
    if (publishNow) {
      const p = await api.social_publish_now(r.qid);
      if (p && p.error) sysMsg(p.error);
    } else {
      sysMsg(`Post #${r.qid} programado para ${when.replace("T", " ")} — sale solo`);
    }
    modalSocial();
  };
  $("#socNow").onclick = () => newPost(true);
  $("#socQueue").onclick = () => newPost(false);
  document.querySelectorAll("#socQ .q-go").forEach(b => b.onclick = async () => {
    b.disabled = true;
    const p = await api.social_publish_now(b.dataset.id);
    if (p && p.error) sysMsg(p.error);
    modalSocial();
  });
  document.querySelectorAll("#socQ .q-del").forEach(b => b.onclick = async () => {
    const r = await api.social_queue_delete(b.dataset.id);
    if (r && r.error) sysMsg(r.error);
    modalSocial();
  });
}

function openModal(html) { $("#modal").innerHTML = html; $("#overlay").hidden = false; }
function closeModal() { $("#overlay").hidden = true; }

/* ── buscador de modelos: filtra en vivo entre TODOS los del proveedor ── */
function modalModelSearch() {
  const opts = [...$("#selModel").options].map(o => o.value)
    .filter(v => v && v !== "(configura la key)");
  if (!opts.length) return sysMsg("No hay modelos para buscar — configurá la API key del proveedor ().");
  const cur = $("#selModel").value;
  openModal(`<h2>Buscar modelo</h2>
    <div class="sub">Proveedor: <b>${$("#selProv").value}</b> · ${opts.length} modelos disponibles</div>
    <input id="mq" class="cmp-field" placeholder="Escribí para filtrar (ej: qwen, vl, deepseek, 32b)…" autocomplete="off" spellcheck="false">
    <div id="mlist" class="mlist"></div>
    <div class="m-actions"><button class="ghost" id="mCancel">Cerrar</button></div>`);
  const render = (q) => {
    q = (q || "").toLowerCase().trim();
    const terms = q.split(/\s+/).filter(Boolean);
    const list = $("#mlist"); list.innerHTML = "";
    const filtered = opts.filter(v => terms.every(t => v.toLowerCase().includes(t)));
    if (!filtered.length) { list.innerHTML = '<div class="sub">Sin coincidencias.</div>'; return; }
    for (const v of filtered.slice(0, 300)) {
      const el = document.createElement("div");
      el.className = "mrow" + (v === cur ? " cur" : "");
      el.textContent = v;
      el.title = v;
      el.onclick = () => {
        $("#selModel").value = v; api.set_model(v); closeModal();
        sysMsg("Modelo  " + v);
      };
      list.appendChild(el);
    }
    if (filtered.length > 300)
      list.insertAdjacentHTML("beforeend", `<div class="sub">…y ${filtered.length - 300} más — afiná el filtro.</div>`);
  };
  render("");
  const q = $("#mq"); q.oninput = () => render(q.value); q.focus();
  $("#mCancel").onclick = closeModal;
}

/* ══ Artefactos: vista previa en vivo del HTML/web generado, DENTRO de LOW ══ */
function addArtifact(name, html, path) {
  S.artifacts = S.artifacts || [];
  const ex = S.artifacts.find(a => a.path === path && path);
  if (ex) { ex.html = html; ex.name = name; S.artIdx = S.artifacts.indexOf(ex); }
  else { S.artifacts.push({ name, html, path: path || "" }); S.artIdx = S.artifacts.length - 1; }
}
function renderArtSelect() {
  const sel = $("#artSel");
  sel.innerHTML = "";
  (S.artifacts || []).forEach((a, i) => {
    const o = document.createElement("option");
    o.value = i; o.textContent = a.name || ("artefacto " + (i + 1));
    sel.appendChild(o);
  });
  sel.value = S.artIdx;
}
function paintArtifact() {
  const a = (S.artifacts || [])[S.artIdx];
  if (!a) return;
  $("#artTitle").textContent = a.name || "Artefacto";
  $("#artFrame").srcdoc = a.html;
  // el dock de edición con IA solo aparece sobre imágenes reales del disco
  $("#imgDock").hidden = !(a.path && IMG_RE.test(a.path));
  renderArtSelect();
}

/* ── editar la imagen abierta con IA (img2img): versión nueva al lado ── */
function imgDockStatus(txt) {
  const el = $("#imgDockStatus");
  if (!txt) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false; el.textContent = txt;
}
async function imgEdit() {
  const a = (S.artifacts || [])[S.artIdx];
  const ta = $("#imgPromptIn");
  const prompt = ta.value.trim();
  if (!a || !a.path || !prompt || S.imgBusy) return;
  ta.value = "";
  S.imgBusy = true;
  imgDockStatus(" Editando la imagen con IA (puede tardar ~medio minuto)…");
  try {
    const r = await api.edit_image(a.path, prompt);
    if (r && r.error) { imgDockStatus(" " + r.error); return; }
    imgDockStatus(" Versión nueva: " + (r.name || "") + " — la original queda intacta. ‹ › para comparar.");
    try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
    await openImage(r.path);
  } catch (e) {
    imgDockStatus(" " + (e.message || e));
  } finally {
    S.imgBusy = false;
  }
}
function showArtifacts() {
  if (!(S.artifacts || []).length) { sysMsg("Todavía no hay artefactos — pedile al agente una página o app web, o abrí un .html y tocá "); return; }
  $("#artView").hidden = false;
  paintArtifact();
}
function closeArtifacts() { $("#artView").hidden = true; }

/* ══ LOW Estudio: dibujo 3D con guías estilo Feather (bundle propio, ui/estudio3d/) ══ */
function openL3d() {
  const frame = $("#l3dFrame");
  if (!frame.getAttribute("src")) frame.src = "estudio3d/index.html";
  $("#l3dView").hidden = false;
  $("#abL3d").classList.add("active");
  frame.focus();
}
function closeL3d() {
  $("#l3dView").hidden = true;
  $("#abL3d").classList.remove("active");
}

window.addEventListener("message", async (event) => {
  const frame = $("#l3dFrame");
  if (!frame || event.source !== frame.contentWindow) return;
  const msg = event.data || {};
  if (msg.type === "low:close-3d") closeL3d();
  // Guardar proyecto del estudio 3D: dentro de pywebview la descarga del
  // navegador (blob + <a download>) no hace nada, así que el estudio nos pasa
  // el JSON y lo escribimos con el diálogo nativo de guardar.
  if (msg.type === "low:save-project" && typeof msg.json === "string") {
    try {
      // msg.path = archivo ya conocido del proyecto: se SOBRESCRIBE sin diálogo
      // y sin mensaje en el chat. El diálogo queda para "Guardar como…" y para
      // el primer guardado (path vacío).
      const known = typeof msg.path === "string" && msg.path ? msg.path : "";
      const r = await api.save_file(known, msg.json, msg.name || "proyecto.low3d");
      if (dzSaveOk(r)) {
        // avisarle al estudio con qué archivo quedó, para que el próximo
        // Ctrl+S no vuelva a preguntar
        frame.contentWindow && frame.contentWindow.postMessage(
          { type: "low:saved", path: r.path }, "*");
        setStatus(" " + (r.name || "proyecto 3D guardado"));
      } else if (r && r.error) {
        setStatus("⚠ sin guardar: " + dzSaveError(r));
        sysMsg("⚠ El proyecto 3D NO se guardó: " + dzSaveError(r) +
          ". El archivo anterior en disco sigue intacto.");
      } else if (!known) setStatus("Guardado cancelado");
    } catch (err) {
      setStatus("No se pudo guardar el proyecto 3D");
      api.log_js && api.log_js("save-3d error: " + err);
    }
  }
  // STL y otros binarios del estudio 3D: no pueden ir por save_file, que
  // escribe texto UTF-8 y corrompería el archivo.
  if (msg.type === "low:save-binary" && typeof msg.base64 === "string") {
    // Siempre se le CONTESTA al estudio: está en un iframe sin puente con
    // Python, así que sin respuesta no puede distinguir "cancelaste" de
    // "falló" ni mostrar dónde quedó el archivo. Sin esto, el botón Exportar
    // parecía no hacer nada.
    const responder = (d) => frame.contentWindow &&
      frame.contentWindow.postMessage(Object.assign({ type: "low:saved-binary" }, d), "*");
    try {
      if (typeof api.save_binary !== "function") {
        // el main.py que está corriendo es anterior a save_binary
        api.log_js && api.log_js("save-binary: la app no expone save_binary");
        responder({ error: "esta versión de LOW no puede guardar binarios — reiniciá la app" });
        return;
      }
      const r = await api.save_binary(msg.base64, msg.name || "modelo.stl");
      if (r && r.path) {
        setStatus(" " + (r.name || "archivo") + " guardado (" +
                  Math.round((r.bytes || 0) / 1024) + " KB)");
        responder({ path: r.path, name: r.name, bytes: r.bytes });
      } else if (r && r.cancelado) {
        setStatus("Exportación cancelada");
        responder({ cancelado: true });
      } else {
        // sin path, sin error y sin cancelado: la app contestó cualquier cosa.
        // Pasa si el main.py que está corriendo es viejo, así que hay que
        // decir eso y no un "algo falló" que no lleva a ninguna parte.
        const e = (r && r.error) ||
          "la app no devolvió el archivo — si LOW quedó abierto de antes, cerralo y volvé a abrirlo";
        setStatus(" No pude guardar: " + e);
        responder({ error: e });
      }
    } catch (err) {
      setStatus("No pude guardar el archivo");
      api.log_js && api.log_js("save-binary error: " + err);
      responder({ error: String((err && err.message) || err) });
    }
  }
  // el estudio 3D no tiene puente con Python: sus errores llegan por acá
  if (msg.type === "low:log" && typeof msg.text === "string") {
    api.log_js && api.log_js("[estudio3d] " + msg.text);
  }
  if (msg.type === "low:open-project") {
    try {
      const r = await api.open_dialog();
      if (r && typeof r.content === "string") {
        frame.contentWindow && frame.contentWindow.postMessage(
          { type: "low:opened", path: r.path || "", json: r.content }, "*");
      }
    } catch (err) {
      setStatus("No se pudo abrir el proyecto 3D");
      api.log_js && api.log_js("open-3d error: " + err);
    }
  }
});

/* ══ Entorno de diseño: SVG vivo + inspector por elemento ══ */
const DZ = { path: null, sel: null, zoom: 1, rigTool: "select", rigAutoKey: true,
  documentTabs: [], activeDocumentTab: null };

/* La aplicación, las opciones y los documentos son niveles distintos. Photoshop
   acierta en esta jerarquía: el archivo no es un rótulo de la app, sino una
   superficie de trabajo con pestaña propia. Se construye acá para no acoplar el
   modelo de documentos al HTML histórico. */
/* ══ BARRA DE HERRAMIENTAS MOVIBLE, AL MODO PHOTOSHOP ═════════════════════
   Dos decisiones prestadas de Photoshop, por la misma razón que allá:

   1) La barra se puede mover. Se arrastra del grip y flota; soltarla contra un
      borde la acopla de ese lado. En dos monitores o zurdo, el lugar de la
      barra es una decisión del artista, no del programa.
   2) Lo que casi no se usa vive detrás de "⋯". Ensanchar el riel para que
      entrara todo costaba lienzo en TODAS las ventanas; el cajón cuesta un
      clic y sólo cuando hace falta.

   Las herramientas del cajón siguen existiendo en el DOM: atajos, el panel
   separado y la sincronización de herramienta activa las siguen encontrando.
   ═══════════════════════════════════════════════════════════════════════ */
/* La barra de opciones tiene el mismo problema que el riel: en un monitor
   normal no entran las opciones de la herramienta MÁS los diecisiete botones de
   documento y vista. Se aplica la misma regla —lo de uso diario a la vista, lo
   demás detrás de "⋯"— para que un control de la herramienta nunca quede fuera
   de pantalla por culpa de un botón que se usa una vez por sesión. */
const DZ_BARRA_SECUNDARIOS = ["dzVar", "dzAnim", "dzDoc", "dzRotL", "dzRotLbl", "dzRotR",
  "dzDiscBtn", "dzRulersBtn", "dzGridBtn", "dzGuidesBtn", "dzZen", "dzPrefs",
  "dzCodeBtn", "dzExt"];
function dzBarraOverflowInit() {
  const barra = $(".art-bar-inline");
  if (!barra || barra.dataset.overflow) return;
  barra.dataset.overflow = "1";
  const cajon = document.createElement("div");
  cajon.className = "dz-tools-drawer dz-barra-drawer"; cajon.id = "dzBarraDrawer"; cajon.hidden = true;
  document.body.appendChild(cajon);
  const mas = document.createElement("button");
  mas.className = "ibtn dz-tools-more"; mas.id = "dzBarraMore"; mas.textContent = "⋯";
  mas.title = "Más: variaciones, animación, documento, giro de vista, reglas, guías, preferencias, código y ventana";
  DZ_BARRA_SECUNDARIOS.forEach((id) => { const el = $("#" + id); if (el) cajon.appendChild(el); });
  // los separadores que quedaron sueltos ya no separan nada
  [...barra.children].forEach((n) => {
    const previo = n.previousElementSibling;
    if (n.classList.contains("vsep") && (!previo || previo.classList.contains("vsep"))) n.remove();
  });
  while (barra.lastElementChild && barra.lastElementChild.classList.contains("vsep"))
    barra.lastElementChild.remove();
  barra.insertBefore(mas, $("#dzSave") || null);
  const cerrar = () => { cajon.hidden = true; mas.classList.remove("active"); };
  mas.onclick = (e) => {
    e.stopPropagation();
    if (!cajon.hidden) return cerrar();
    cajon.hidden = false;
    const r = mas.getBoundingClientRect(), caja = cajon.getBoundingClientRect();
    cajon.style.left = Math.max(6, Math.min(innerWidth - caja.width - 6, r.right - caja.width)) + "px";
    cajon.style.top = Math.min(innerHeight - caja.height - 8, r.bottom + 6) + "px";
    mas.classList.add("active");
  };
  cajon.addEventListener("click", (e) => { if (e.target.closest("button")) cerrar(); });
  document.addEventListener("pointerdown", (e) => {
    if (cajon.hidden || e.target.closest("#dzBarraDrawer,#dzBarraMore")) return;
    cerrar();
  });
}

const DZ_TOOLBAR_KEY = "low.toolbar.v1";
let DZ_TOOLS_DRAWER = null;
let DZ_TOOLS_FIT = () => {};

function dzToolsBarState() {
  try {
    const guardado = JSON.parse(dzPrefsStorage().getItem(DZ_TOOLBAR_KEY) || "null") || {};
    return { modo: "dock", lado: "left", fijadas: [], ...guardado };
  } catch (_) { return { modo: "dock", lado: "left", fijadas: [] }; }
}
function dzToolsBarSave(state) {
  try { dzPrefsStorage().setItem(DZ_TOOLBAR_KEY, JSON.stringify(state)); } catch (_) { /* sin storage */ }
}
/** Devuelve la barra a la fila: a la izquierda del lienzo o a su derecha. */
function dzToolsDock(rail, lado) {
  const body = $(".dz-body"), canvas = $(".dz-canvas");
  if (!body || !canvas) return;
  rail.classList.remove("dz-tools-float");
  rail.style.left = rail.style.top = "";
  if (lado === "right") body.insertBefore(rail, canvas.nextSibling);
  else body.insertBefore(rail, body.firstChild);
  dzToolsDrawerHide();
  dzToolsBarSave({ ...dzToolsBarState(), modo: "dock", lado: lado === "right" ? "right" : "left" });
  DZ_TOOLS_FIT();
}
function dzToolsFloat(rail, x, y) {
  const ancho = 44, alto = Math.min(rail.scrollHeight || 400, innerHeight - 120);
  const left = Math.max(6, Math.min(innerWidth - ancho - 6, x));
  const top = Math.max(48, Math.min(innerHeight - Math.max(120, alto) - 6, y));
  rail.classList.add("dz-tools-float");
  rail.style.left = left + "px"; rail.style.top = top + "px";
  dzToolsDrawerHide();
  dzToolsBarSave({ ...dzToolsBarState(), modo: "float", x: left, y: top });
}
function dzToolsDrawerHide() {
  if (DZ_TOOLS_DRAWER) DZ_TOOLS_DRAWER.hidden = true;
  $("#dzToolsMore")?.classList.remove("active");
}
function dzToolsBarInit(rail, primarias) {
  if (!rail || rail.dataset.bar) return;
  rail.dataset.bar = "photoshop";

  const grip = document.createElement("div");
  grip.className = "dz-tools-grip";
  grip.textContent = "⠿";
  grip.title = "Arrastrá para mover la barra · doble clic para acoplarla al borde";
  rail.insertBefore(grip, rail.firstChild);

  // Cajón: todo lo que no está en el orden funcional de uso diario.
  const drawer = document.createElement("div");
  drawer.className = "dz-tools-drawer"; drawer.id = "dzToolsDrawer"; drawer.hidden = true;
  document.body.appendChild(drawer);
  DZ_TOOLS_DRAWER = drawer;
  [...rail.children].forEach(node => {
    if (node === grip || primarias.includes(node)) return;
    drawer.appendChild(node);
  });
  while (drawer.firstElementChild && drawer.firstElementChild.classList.contains("hsep"))
    drawer.firstElementChild.remove();

  const secundarias = [...drawer.children];
  const more = document.createElement("button");
  more.className = "ibtn dz-tools-more"; more.id = "dzToolsMore";
  more.textContent = "⋯";
  more.title = "Más herramientas: vectores, pivote, espejo, imagen, cámara, esqueleto y escenario";
  more.setAttribute("aria-haspopup", "true");
  rail.appendChild(more);
  more.onclick = (event) => {
    event.stopPropagation();
    if (!drawer.hidden) return dzToolsDrawerHide();
    drawer.hidden = false;
    const r = more.getBoundingClientRect(), caja = drawer.getBoundingClientRect();
    const aLaDerecha = r.left < innerWidth / 2;
    drawer.style.left = Math.max(6, Math.min(innerWidth - caja.width - 6,
      aLaDerecha ? r.right + 6 : r.left - caja.width - 6)) + "px";
    drawer.style.top = Math.max(48, Math.min(innerHeight - caja.height - 8, r.top - caja.height / 2)) + "px";
    more.classList.add("active");
  };
  // elegir una herramienta del cajón lo cierra: es un menú, no un panel
  drawer.addEventListener("click", (event) => { if (event.target.closest("button")) dzToolsDrawerHide(); });
  document.addEventListener("pointerdown", (event) => {
    if (drawer.hidden || event.target.closest("#dzToolsDrawer,#dzToolsMore")) return;
    dzToolsDrawerHide();
  });

  // Arrastre del grip: flota mientras se mueve, y se acopla si se suelta
  // contra un borde. El umbral es generoso porque acoplar es lo que uno
  // quiere el 90% de las veces.
  grip.addEventListener("pointerdown", (event) => {
    if (event.button) return;
    event.preventDefault();
    const r = rail.getBoundingClientRect();
    const dx = event.clientX - r.left, dy = event.clientY - r.top;
    const mover = (e) => dzToolsFloat(rail, e.clientX - dx, e.clientY - dy);
    const soltar = (e) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      const vista = ($(".dz-body") || document.body).getBoundingClientRect();
      if (e.clientX < vista.left + 90) dzToolsDock(rail, "left");
      else if (e.clientX > vista.right - 90) dzToolsDock(rail, "right");
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  });
  grip.addEventListener("dblclick", () => dzToolsDock(rail, dzToolsBarState().lado || "left"));

  // Cuántas entran lo decide el alto disponible, no una lista fija: en una
  // ventana baja las últimas primarias bajan al cajón en vez de quedar debajo
  // del borde, que es exactamente el defecto que tenía el riel viejo.
  // El reparto se recalcula cuando el layout YA se acomodó: leer el alto en el
  // mismo evento de resize devuelve el alto viejo y la barra se queda con más
  // herramientas de las que entran.
  let pendiente = 0;
  // FIJAR: clic derecho sobre una herramienta la ancla al riel o la manda al
  // cajón. No todos usan lo mismo —hay quien vive con la mano y quien no la
  // toca nunca— y una lista decidida por el programa siempre le va a quedar mal
  // a alguien. Lo fijado se respeta antes que cualquier cálculo de espacio.
  const anclar = (node, alRiel) => {
    const id = node.dataset.tool || node.id;
    if (!id) return;
    const estado = dzToolsBarState();
    const fijadas = new Set(estado.fijadas || []), ocultas = new Set(estado.ocultas || []);
    if (alRiel) { fijadas.add(id); ocultas.delete(id); }
    else { ocultas.add(id); fijadas.delete(id); }
    dzToolsBarSave({ ...estado, fijadas: [...fijadas], ocultas: [...ocultas] });
    DZ_TOOLS_FIT();
    dzSetStatus(alRiel ? "Herramienta fijada en la barra" : "Herramienta movida al cajón «⋯»");
  };
  const menuAnclar = (event) => {
    const node = event.target.closest("[data-tool],#dzShapePicker,#dzAddText,#dzAddLine,.ibtn");
    if (!node || node.id === "dzToolsMore") return;
    event.preventDefault();
    // lo que está en el cajón entra a la barra; lo que está en la barra sale
    anclar(node, node.parentElement === drawer);
  };
  rail.addEventListener("contextmenu", menuAnclar);
  drawer.addEventListener("contextmenu", menuAnclar);
  grip.title += " · clic derecho en una herramienta para fijarla o mandarla al cajón";

  DZ_TOOLS_FIT = () => {
    clearTimeout(pendiente);
    pendiente = setTimeout(() => requestAnimationFrame(
      () => dzToolsBarFit(rail, primarias, secundarias, more, drawer)), 60);
  };
  DZ_TOOLS_FIT();
  addEventListener("resize", () => DZ_TOOLS_FIT());
  // Al arrancar, el riel todavía mide 0: el editor no se mostró. Esperar al
  // resize de la ventana no alcanza —abrir un diseño o cambiar de workspace le
  // cambia el alto sin que la ventana se mueva—, así que se observa el riel.
  if (typeof ResizeObserver === "function") new ResizeObserver(() => DZ_TOOLS_FIT()).observe(rail);

  const guardado = dzToolsBarState();
  if (guardado.modo === "float") dzToolsFloat(rail, guardado.x || 60, guardado.y || 120);
  else if (guardado.lado === "right") dzToolsDock(rail, "right");
  DZ_TOOLS_FIT();
}
/** Reparte las herramientas entre el riel y el cajón según el alto real. */
let DZ_TOOLS_FITTING = false;
function dzToolsBarFit(rail, primarias, secundarias, more, drawer) {
  if (!rail || rail.hidden || DZ_TOOLS_FITTING) return;
  const grip = rail.querySelector(".dz-tools-grip");
  const paso = Math.max(18, (rail.querySelector(".ibtn")?.offsetHeight || 27) + 3);   // se MIDE: al achicar los botones a 27 px un 33 fijo mandaba al cajon herramientas que entraban
  const alto = rail.classList.contains("dz-tools-float")
    ? Math.min(innerHeight - 120, paso * (primarias.length + 1) + 24)
    : rail.clientHeight;
  if (!alto) return;
  const util = alto - (grip ? grip.offsetHeight + 3 : 0) - paso - 10;   // grip + "⋯" + padding
  const porColumna = Math.max(3, Math.floor(util / paso)), columnas = rail.classList.contains("dz-tools-float") ? 1 : Math.min(3, Math.max(1, Math.ceil(primarias.length / porColumna)));   // ANTES DE ESCONDER, PARTIR EN COLUMNAS: con la ventana baja —o la timeline abierta, que come la mitad del alto— quedaban SEIS herramientas a la vista. Photoshop, Moho y OpenToonz parten el riel; esconder es el ultimo recurso.
  rail.classList.toggle("dz-cols-2", columnas === 2); rail.classList.toggle("dz-cols-3", columnas >= 3); const entran = Math.min(primarias.length, porColumna * columnas);
  DZ_TOOLS_FITTING = true;
  // Lo que el usuario fijó va primero y no lo saca ningún cálculo; lo que
  // mandó al cajón no vuelve solo aunque sobre lugar.
  const estado = dzToolsBarState();
  const fijadas = new Set(estado.fijadas || []);
  const idDe = (n) => n.dataset.tool || n.id || "";
  const ocultas = new Set(estado.ocultas || []);
  const todas = [...primarias, ...secundarias];
  const ancladas = todas.filter((n) => fijadas.has(idDe(n)));
  const candidatas = primarias.filter((n) => !fijadas.has(idDe(n)) && !ocultas.has(idDe(n)));
  const cupo = Math.max(0, entran - ancladas.length);
  const enRiel = [...ancladas, ...candidatas.slice(0, cupo)];
  const alCajon = todas.filter((n) => !enRiel.includes(n));
  enRiel.forEach(node => rail.insertBefore(node, more));
  alCajon.forEach(node => drawer.appendChild(node));
  more.hidden = !drawer.children.length;
  DZ_TOOLS_FITTING = false;
}

function dzStudioHierarchyInit() {
  const view = $("#designView"), menu = $("#dzMenubar"), options = $("#dzToolOpts");
  if (!view || !menu || !options) return;
  menu.setAttribute("role", "menubar");
  const menuOrder = ["archivo", "edicion", "capa", "animacion", "vista", "ventana", "ayuda"];
  const spacer = menu.querySelector(":scope > .flex1");
  menuOrder.forEach(id => {
    const item = menu.querySelector(`:scope > .dz-menu[data-menu="${id}"]`);
    if (item) { item.setAttribute("role", "menuitem"); menu.insertBefore(item, spacer); }
  });
  const title = $("#dzTitle");
  if (title) { title.hidden = true; title.setAttribute("aria-hidden", "true"); }

  let tabs = $("#dzDocumentTabs");
  if (!tabs) {
    tabs = document.createElement("div");
    tabs.id = "dzDocumentTabs"; tabs.className = "dz-document-tabs";
    tabs.setAttribute("role", "tablist"); tabs.setAttribute("aria-label", "Documentos abiertos");
    // las pestañas cuelgan DEBAJO de toda la barra de opciones; insertarlas
    // junto a #dzToolOpts las metía adentro de la fila desde que las opciones
    // y los botones de documento comparten una sola línea.
    (options.closest(".dz-optionsbar") || options).insertAdjacentElement("afterend", tabs);
  }

  // Orden funcional de uso: seleccionar, pintar, construir, navegar. La mano
  // deja de interrumpir las herramientas de edición primaria.
  const tools = view.querySelector(".dz-tools");
  if (tools && !tools.dataset.hierarchy) {
    tools.dataset.hierarchy = "photoshop";
    const ordered = [
      '[data-tool="select"]','[data-tool="direct"]','[data-tool="nodes"]',
      '[data-tool="brush"]','[data-tool="pencil"]','[data-tool="eraser"]',
      '[data-tool="bucket"]','[data-tool="dropper"]','[data-tool="pen"]',
      '#dzShapePicker','#dzAddText','#dzAddLine','[data-tool="ruler"]',
      '[data-tool="hand"]'
    ];
    // appendChild movia cada herramienta primaria al FINAL del riel: quedaba
    // arrancando con dos separadores y las herramientas vectoriales, y las
    // flechas de seleccion terminaban al fondo — fuera de la vista en cuanto la
    // ventana no era alta. Se arma la secuencia completa: primero el orden
    // funcional, despues el resto con su agrupacion original.
    const primarias = ordered.map(selector => tools.querySelector(selector)).filter(Boolean);
    const resto = [...tools.children].filter(node => !primarias.includes(node));
    [...primarias, ...resto].forEach(node => tools.appendChild(node));
    // al mover los bloques quedan separadores pegados que no separan nada
    [...tools.children].forEach(node => {
      const previo = node.previousElementSibling;
      if (node.classList.contains("hsep") && (!previo || previo.classList.contains("hsep"))) node.remove();
    });
    dzToolsBarInit(tools, primarias);
    dzBarraOverflowInit();
  }
  dzDocumentTabsRender();
}

function dzDocumentTabName(path, fallback) {
  return String(fallback || path || "Sin título").split(/[\\/]/).pop() || "Sin título";
}
function dzDocumentTabCurrent() {
  return DZ.documentTabs.find(tab => tab.id === DZ.activeDocumentTab) || null;
}
function dzDocumentTabFind(path) {
  const key = String(path || "").toLowerCase();
  return DZ.documentTabs.find(tab => String(tab.path || "").toLowerCase() === key) || null;
}
function dzDocumentTabCapture() {
  const tab = dzDocumentTabCurrent();
  if (!tab) return;
  if (DZ.doc && (DZ.dirty || DZ.doc.dirty)) dzDocCommit();
  const svg = $("#dzCanvas")?.querySelector(":scope > svg:not(#dzRigOverlay):not(#dzMocapSheet)");
  if (svg) tab.content = dzSerialize(svg);
  tab.dirty = !!(DZ.dirty || DZ.doc?.dirty);
  tab.runtime = {
    path: DZ.path || null,
    doc: DZ.doc || null, anim: DZ.anim || null, scene: DZ.scene || null,
    history: DZ.history || null,
    onionOn: !!DZ.onionOn, zoom: DZ.zoom || 1, panX: DZ.panX || 0,
    panY: DZ.panY || 0, viewRot: DZ.viewRot || 0
  };
  if (tab.dirty && DZ.path && tab.content) {
    window.LOW?.workspace?.recovery?.saveNow(DZ.path, tab.content, {
      frame: DZ.doc?.frame || DZ.anim?.idx + 1 || null,
      tool: DZ.tool || "select", reason: "document-switch"
    });
  }
  if (DZ.doc?.dirty) dzSceneAutosave(DZ.doc, tab);
  dzDocumentTabsRender();
}
function dzDocumentTabParkRuntime() {
  clearTimeout(DZ_DOC_TIMER); clearTimeout(DZ_RECOVERY_TIMER);
  if (DZ.anim?.playing) dzAnimStop();
  if (DZ.playback?.stop) DZ.playback.stop();
  if (DZ.playbackUiUnsub) { DZ.playbackUiUnsub(); DZ.playbackUiUnsub = null; }
  ["xsView", "tlView", "lsView", "palView"].forEach(key => {
    try { DZ[key]?.dispose?.(); } catch (_) { /* separar nunca debe bloquear */ }
  });
  Object.assign(DZ, { path: null, doc: null, anim: null, scene: {}, history: null, playback: null,
    xsView: null, tlView: null, lsView: null, palView: null });
  DZ.sel = null; DZ.multi = []; DZ.dirty = false; DZ.onionOn = false;
  DZ.rigMode = false; DZ.rigSubmode = "build"; DZ.rigNodeId = null;
  DZ.rigSelectedId = null; DZ.rigSelectionSource = null; DZ.rigConstraintId = null;
  DZ.rigLivePose = null; DZ.rigIKPreview = null; DZ.rigBoneTool = false;
  $("#dzRigPanel")?.setAttribute("hidden", "");
  $("#dzRigOverlay")?.setAttribute("hidden", "");
  if ($("#dzRigOverlay")) $("#dzRigOverlay").innerHTML = "";
  $("#dzRigBtn")?.classList.remove("active"); $("#tlRigOpen")?.classList.remove("active");
  dzDeselect();
}
function dzDocumentTabPrepareNew() {
  const previous = DZ.activeDocumentTab;
  dzDocumentTabCapture(); dzDocumentTabParkRuntime();
  DZ.activeDocumentTab = null; dzDocumentTabsRender();
  dzMocapResetSession({ closePanel: true });
  return previous;
}
function dzDocumentTabRegister(path, name) {
  let tab = dzDocumentTabFind(path);
  if (!tab) {
    tab = { id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      path, name: dzDocumentTabName(path, name), content: null, dirty: false, runtime: null };
    DZ.documentTabs.push(tab);
  } else if (name) tab.name = dzDocumentTabName(path, name);
  DZ.activeDocumentTab = tab.id;
  dzDocumentTabsRender();
  return tab;
}
function dzDocumentTabsRender() {
  const host = $("#dzDocumentTabs"); if (!host) return;
  host.hidden = !DZ.documentTabs.length;
  host.innerHTML = "";
  DZ.documentTabs.forEach(tab => {
    const button = document.createElement("button");
    button.type = "button"; button.className = "dz-document-tab";
    button.dataset.tabId = tab.id; button.draggable = true; button.setAttribute("role", "tab");
    const active = tab.id === DZ.activeDocumentTab;
    button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active));
    button.title = tab.path || tab.name;
    const dirty = document.createElement("span"); dirty.className = "dz-document-dirty";
    dirty.textContent = tab.dirty ? "●" : ""; dirty.setAttribute("aria-label", tab.dirty ? "Cambios sin guardar" : "");
    const label = document.createElement("span"); label.className = "dz-document-name"; label.textContent = tab.name;
    const close = document.createElement("span"); close.className = "dz-document-close"; close.textContent = "×";
    close.setAttribute("role", "button"); close.setAttribute("aria-label", `Cerrar ${tab.name}`);
    button.append(dirty, label, close);
    button.onclick = event => event.target === close ? dzDocumentTabClose(tab.id) : dzDocumentTabActivate(tab.id);
    button.ondragstart = event => event.dataTransfer?.setData("text/low-document-tab", tab.id);
    button.ondragover = event => event.preventDefault();
    button.ondrop = event => {
      event.preventDefault(); const from = event.dataTransfer?.getData("text/low-document-tab");
      const a = DZ.documentTabs.findIndex(item => item.id === from), b = DZ.documentTabs.findIndex(item => item.id === tab.id);
      if (a < 0 || b < 0 || a === b) return;
      const [moved] = DZ.documentTabs.splice(a, 1); DZ.documentTabs.splice(b, 0, moved); dzDocumentTabsRender();
    };
    host.appendChild(button);
  });
}
async function dzDocumentTabActivate(id) {
  if (!id || id === DZ.activeDocumentTab) return true;
  const target = DZ.documentTabs.find(tab => tab.id === id); if (!target) return false;
  const previous = dzDocumentTabCurrent();
  dzDocumentTabCapture(); dzDocumentTabParkRuntime(); DZ.activeDocumentTab = id;
  const state = target.runtime;
  const isScene = /\.(low|lowscene)$/i.test(target.path || state?.doc?.path || "");
  // Una .lowscene no es una imagen suelta. Su LowDoc vivo ya contiene capas,
  // dibujos y exposiciones; pedir image_data() aca lo degradaba a un SVG
  // generico y, al volver, podia terminar guardando el lienzo de otra solapa.
  if (!isScene) {
    const opened = await openDesign(target.path, { fromTab: true, sourceSvg: target.content });
    if (!opened) {
      DZ.activeDocumentTab = null;
      if (previous?.id && previous.id !== id) await dzDocumentTabActivate(previous.id);
      return false;
    }
  }
  if (state) {
    Object.assign(DZ, state);
    DZ.path = state.path || (state.doc ? null : target.path);
    DZ.playback = null; DZ.xsView = null; DZ.tlView = null; DZ.lsView = null; DZ.palView = null;
    DZ.dirty = !!target.dirty; DZ.sel = null; DZ.multi = [];
    if (DZ.history) { DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack; }
    if (DZ.doc && DZ.history) DZ.doc.setHistory(DZ.history);
    if (DZ.doc) {
      dzSyncCanvasDocument(true); dzSyncTransportFromDoc(); dzOnionRender(); dzOnion2Render();
      if (!$("#dzTimeline")?.hidden) await dzTlMount();
      if (!$("#dzXs")?.hidden) await dzXsMount();
      dzPalMount();
      if (DZ.colab) dzColabVigilar();
    }
    dzApplyZoom(); dzBuildLayers(); dzPaletteRender();
    // Montar Timeline/X-sheet y reconstruir capas puede sincronizar su frame
    // inicial. La escena manda: al final se proyecta exactamente su Drawing.
    if (isScene && DZ.doc) { dzCanvasSet(DZ.doc.drawing ? DZ.doc.drawing.content : target.content || ""); dzOnionRender(); }
  }
  DZ.activeDocumentTab = id; dzDocumentTabsRender();
  return true;
}
async function dzDocumentTabClose(id) {
  const tab = DZ.documentTabs.find(item => item.id === id); if (!tab) return false;
  if (tab.id === DZ.activeDocumentTab) dzDocumentTabCapture();
  if (tab.dirty && !(await dzConfirmModal(`«${tab.name}» tiene cambios sin guardar. ¿Cerrar igualmente?`, { ok: "Cerrar igualmente", danger: true }))) return false;
  // La confirmacion anterior autoriza descartar ESTA solapa solamente. Sus
  // checkpoints no deben reaparecer luego, ni borrarse los de otra escena.
  dzSceneRecoveryClear(tab.runtime?.doc || (tab.id === DZ.activeDocumentTab ? DZ.doc : null), tab);
  const recoveryPath = tab.runtime?.path || tab.path;
  if (recoveryPath) window.LOW?.workspace?.recovery?.clear?.(recoveryPath);
  const index = DZ.documentTabs.indexOf(tab); DZ.documentTabs.splice(index, 1);
  if (tab.id !== DZ.activeDocumentTab) { dzDocumentTabsRender(); return true; }
  DZ.activeDocumentTab = null;
  const next = DZ.documentTabs[Math.min(index, DZ.documentTabs.length - 1)];
  if (next) return dzDocumentTabActivate(next.id);
  dzDocumentTabParkRuntime();
  if (DZ.d3) dz3dExit(true);
  $("#designView").hidden = true; DZ.sel = null; if (RULER) dzRulerClear();
  dzDocumentTabsRender(); return true;
}
const DZModeMachine = window.LOW?.application?.createModeMachine?.() || null;
const DZRigGestures = window.LOW?.input?.pointerController
  || window.LOW?.rigging?.input?.createGestureController?.() || null;
function dzRigTrackGesture(cancel) {
  if (!DZRigGestures) { DZ.rigGestureCancel = cancel; return null; }
  const token = DZRigGestures === window.LOW?.input?.pointerController
    ? DZRigGestures.begin({ owner: "rig", cancel }) : DZRigGestures.begin(cancel);
  DZ.rigGestureCancel = () => DZRigGestures.cancel("external");
  return token;
}
function dzRigFinishGesture(token) {
  const accepted = DZRigGestures ? DZRigGestures.finish(token) : true;
  if (accepted) DZ.rigGestureCancel = null;
  return accepted;
}
// Registro central de paneles: base para guardar espacios de trabajo, acoplar
// cualquier panel y restaurarlo en configuraciones de dos monitores.
if (window.LOW && LOW.workspace && LOW.workspace.panels) {
  const panels = LOW.workspace.panels;
  const initiallyHidden = new Set(["timeline", "xsheet", "camera", "onion", "levelstrip", "rig", "mocap", "code"]);
  Object.entries(LOW.workspace.PANEL_CATALOG || {}).forEach(([id, meta]) => panels.register(id, {
    ...meta, dock: meta.allowedDocks?.[0] || "right", visible: !initiallyHidden.has(id),
  }));
  panels.subscribe(panel => {
    const node = panel?.element && document.querySelector(panel.element); if (!node) return;
    if (!panel.detached) node.hidden = !panel.visible;
    if (panel.size?.width) node.style.width = panel.size.width + "px";
    if (panel.size?.height) node.style.height = panel.size.height + "px";
  });
}
if (window.LOW?.ai?.commands) {
  const commands = LOW.ai.commands;
  commands.define("insert_frames", { required: ["at", "count"] }, async ({ count, blank = true }) => {
    for (let i = 0; i < Math.max(1, Math.min(120, +count || 1)); i++) await dzFrameInsert(!!blank);
    return { frames: +count || 1 };
  });
  commands.define("duplicate_exposure", { required: ["level", "frame"] }, async () => dzFrameAdd());
  commands.define("create_layer", { required: ["name"] }, async ({ name }) => {
    dzLayerNew(); const selected = DZ.sel; if (selected && name) selected.id = String(name).replace(/[^\w-]+/g, "_");
    dzBuildLayers(); dzMarkDirty(); return { id: selected && selected.id };
  });
  commands.define("apply_brush_preset", { required: ["preset"] }, async ({ preset }) => {
    const brush = LOW.drawing.brushes.get(preset); if (!brush) throw Error("Pincel inexistente");
    DZ.brushPreset = brush.id; DZ.drawW = brush.size || DZ.drawW; DZ.smooth = Math.round((brush.smoothing || 0) * 100);
    if (brush.color) DZ.drawColor = brush.color; dzToolOptsRender(); return brush;
  });
  commands.define("modify_camera", { required: ["frame", "properties"] }, async ({ frame, properties }) => {
    DZ.scene = DZ.scene || {}; DZ.scene.cam = DZ.scene.cam || {}; DZ.scene.cam[frame] = { ...properties };
    dzSceneSave(); dzCamOverlay(); return DZ.scene.cam[frame];
  });
}
const DZ_FONTS = ["Figtree", "Arial", "Helvetica", "Verdana", "Trebuchet MS",
  "Georgia", "Times New Roman", "Courier New", "JetBrains Mono", "Impact",
  "Comic Sans MS", "serif", "sans-serif", "monospace"];
// pares tipográficos sugeridos (título / cuerpo) — clic para aplicar al texto
const DZ_PAIRS = [
  ["Impact", "Helvetica"], ["Georgia", "Verdana"],
  ["Trebuchet MS", "Georgia"], ["Figtree", "JetBrains Mono"],
];

async function openDesign(path, options = {}) {
  const frameOfCurrentScene = !!(DZ.doc && DZ.anim?.frames?.includes(path));
  if (!options.fromTab && !frameOfCurrentScene) {
    const existing = dzDocumentTabFind(path);
    if (existing && existing.id !== DZ.activeDocumentTab) return dzDocumentTabActivate(existing.id);
    const current = dzDocumentTabCurrent();
    if ((current && current.path !== path) || (!current && (DZ.path || DZ.doc))) {
      dzDocumentTabCapture(); dzDocumentTabParkRuntime();
    }
  } else if (frameOfCurrentScene && DZ.path && DZ.path !== path) await dzPersist();
  dzWsInit();          // el editor abre en el workspace donde se dejó
  const r = options.sourceSvg
    ? { svg: options.sourceSvg, name: dzDocumentTabName(path) }
    : await api.image_data(path);
  if (!r || r.error || !r.svg) { sysMsg(" No pude abrir el diseño: " + ((r && r.error) || path)); return false; }
  DZ.path = path; DZ.sel = null;
  $("#dzTitle").textContent = r.name || path.split(/[\\/]/).pop();
  const cv = $("#dzCanvas");
  // NO usar innerHTML: adentro del lienzo viven #dzHandle y #dzPin — pisarlos
  // rompía todo el editor ("Cannot set properties of null"). Solo cambiar el svg.
  // Solo el svg del DISEÑO, que es hijo directo; los overlays del editor se conservan.
  [...cv.children]
    .filter(n => n.tagName.toLowerCase() === "svg" && !["dzRigOverlay","dzMocapSheet","dzMeshOverlay"].includes(n.id))
    .forEach(n => n.remove());
  let sourceSvg = options.sourceSvg || r.svg;
  if (!options.fromTab) {
    const recovery = window.LOW?.workspace?.recovery?.get(path);
    if (recovery && recovery.content !== r.svg) {
      // en mock no hay nadie para contestar: se conserva el punto y se abre el
      // archivo del disco, que es la salida segura (nunca descartar sin elegir)
      const decision = /[?&]mock=1/.test(location.search) ? "keep"
        : await dzRecoveryDecide(path, r.svg, recovery);
      if (decision === "recover") sourceSvg = recovery.content;
      else if (decision === "discard") LOW.workspace.recovery.clear(path);
    } else if (recovery) LOW.workspace.recovery.clear(path);
  }
  const tmp = document.createElement("div"); tmp.innerHTML = sourceSvg;
  const svg = tmp.querySelector("svg");
  if (!svg) { sysMsg(" El archivo no tiene un <svg> válido: " + path); return false; }
  cv.insertBefore(svg, $("#dzHandle"));
  // La resolución vive en el archivo. El panel puede cambiar de tamaño, pero
  // eso sólo afecta al zoom: nunca se vuelve a inferir otro ancho/alto visual.
  dzNormalizeSvgDocument(svg, frameOfCurrentScene ? {
    width: DZ.doc.scene.width, height: DZ.doc.scene.height
  } : null);
  DZ.zoom = 1; DZ.panX = 0; DZ.panY = 0; dzApplyZoom();
  // Abrir un diseño LIMPIA el historial, pero conserva el MISMO objeto: el
  // documento de animación guarda una referencia, y si acá se creaba uno nuevo
  // el doc seguía escribiendo en el viejo — sus cambios de timing no se
  // deshacían nunca porque Ctrl+Z miraba otra pila.
  if (!DZ.history) DZ.history = new LOW.core.HistoryManager({ limit: 180 });
  else DZ.history.clear();
  if (DZ.doc) DZ.doc.setHistory(DZ.history);
  DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack;
  DZ.dirty = false;             // recién cargado = limpio (no arrastrar el flag)
  DZ.multi = []; dzNodesClear();
  dzPalCssRender();             // el svg es nuevo: la paleta tiene que gobernarlo
  dzMirrorGuideRender();        // ...y el eje de simetria se redibuja sobre el svg nuevo
  dzPaletteRender();
  $("#dzProps").hidden = true; $("#dzEmpty").hidden = false;
  $("#dzHandle").hidden = true;
  $("#dzCode").hidden = true;
  dzBuildLayers();
  if (!frameOfCurrentScene) dzDocumentTabRegister(path, r.name || dzDocumentTabName(path));
  if (DZ.d3) dz3dBuild();       // en espacio 3D: reconstruir los planos del cuadro nuevo
  $("#designView").hidden = false;
  requestAnimationFrame(() => { if (!$("#designView").hidden) dzFitView(); });
  return true;
}
function closeDesign() {
  const current = dzDocumentTabCurrent();
  return current ? dzDocumentTabClose(current.id) : dzDocumentClose();
}

/* Escape en el estudio 2D es una orden de CANCELAR, no de abandonar el
   espacio de trabajo. La salida queda reservada al botón X y al menú Archivo. */
function dzEscapeActive() {
  if (!$("#overlay")?.hidden) { closeModal(); return true; }
  closeCtxMenu();
  document.querySelectorAll("#dzMenubar .dz-menu.open").forEach(n => n.classList.remove("open"));
  if (typeof dzFormaCancelar === "function" && dzFormaCancelar("escape")) return true;
  if (dzVectorGestureCancel("escape")) {
    dzSetStatus("Edición vectorial cancelada"); return true;
  }
  if (DZ.rigGestureCancel) {
    const cancel = DZ.rigGestureCancel; DZ.rigGestureCancel = null; cancel();
    dzSetStatus("Gesto de esqueleto cancelado"); return true;
  }
  if (DZ.pup) { dzPuppetStop(); return true; }
  if (PEN) { dzPenFinish(true); dzSetStatus("Trazo de pluma cancelado"); return true; }
  if (RULER) { dzRulerClear(); dzSetStatus("Regla cancelada"); return true; }
  if (DZ.rigMode) {
    if (dzRigDiscardPreview()) { dzSetStatus("Pose de prueba descartada"); return true; }
    if (DZ.rigTool !== "select") {
      dzRigSetTool("select"); dzSetStatus("Herramienta de rig soltada · modo Elegir"); return true;
    }
    if (DZ.rigSelectedId) {
      DZ.rigSelectedId = null; DZ.rigSelectionSource = null; dzRigOverlayRender(); dzRigPanelSync();
      dzSetStatus("Hueso soltado"); return true;
    }
  }
  if ((DZ.tool || "select") !== "select") {
    dzSetTool("select"); dzSetStatus("Herramienta soltada · modo Seleccionar"); return true;
  }
  if (DZ.sel || (DZ.multi || []).length) {
    dzDeselect(); dzSetStatus("Selección soltada"); return true;
  }
  dzSetStatus("Escape: no hay ninguna herramienta o selección activa");
  return false;
}

/* zoom del lienzo (no altera el SVG, solo la vista) */
function dzApplyZoom() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (svg) svg.style.transform =
    `translate(-50%, -50%) translate(${DZ.panX || 0}px, ${DZ.panY || 0}px) rotate(${DZ.viewRot || 0}deg) scale(${DZ.zoom})`;
  const lbl = $("#dzZoomLbl"); if (lbl) lbl.textContent = Math.round(DZ.zoom * 100) + "%";
  const rl = $("#dzRotLbl"); if (rl) rl.textContent = Math.round(DZ.viewRot || 0) + "°";
  const sb = $("#sbZoom"); if (sb) sb.textContent = Math.round(DZ.zoom * 100) + "%" +
    (DZ.viewRot ? " · " + Math.round(DZ.viewRot) + "°" : "");
  dzPositionHandle();
  if (DZ.nodeEl && DZ.nodeEl.isConnected) dzNodesShow(DZ.nodeEl);   // reubicar nodos
  if (DZ.camMode || dzCamGuiaActiva()) dzCamOverlay();               // el encuadre y la guia siguen al zoom
  if (DZ.rulers || DZ.grid || (DZ.guides && DZ.guides.length)) dzRulersRender();
  dzPivotMark();
  if (DZ.rigMode) dzRigOverlayRender();
  if (DZ.meshPaint) dzMeshOverlayRender();   // la rejilla de pesos sigue al zoom y al paneo
  dzMocapRenderCanvasGuide();
}
/* modo dibujo (Tab): oculta menús, paneles, timeline y dock — solo lienzo +
   herramientas, para dibujar sin distracción (como el Tab de Photoshop). */
function dzZenToggle() {
  const dv = $("#designView");
  const on = dv.classList.toggle("dz-zen");
  $("#dzZen").classList.toggle("active", on);
  let exit = $("#dzZenExit");
  if (on && !exit) {
    exit = document.createElement("button");
    exit.id = "dzZenExit"; exit.className = "dz-zen-exit";
    exit.textContent = "✕ salir del modo dibujo (Tab)";
    exit.onclick = dzZenToggle;
    dv.appendChild(exit);
  }
  if (exit) exit.style.display = on ? "block" : "none";
  setTimeout(() => { try { dzFitView(); } catch (e) { /* */ } }, 60);
}
/* girar la VISTA (como girar la hoja para dibujar cómodo — Krita/OpenToonz):
   solo cambia cómo se ve; el dibujo y las coordenadas no se tocan */
function dzRotView(delta) {
  DZ.viewRot = ((DZ.viewRot || 0) + delta) % 360;
  dzApplyZoom();
}
/* ajustar a pantalla DE VERDAD: calcula el zoom para que el lienzo entre
   completo en la mesa de trabajo (antes solo reseteaba a 100%) */
function dzFitView() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const cont = $("#dzCanvas");
  if (!svg || !cont) return;
  DZ.viewRot = 0; DZ.panX = 0; DZ.panY = 0;
  svg.style.transform = "translate(-50%, -50%) scale(1)";
  const r = svg.getBoundingClientRect(), c = cont.getBoundingClientRect();
  if (r.width > 2 && r.height > 2)
    DZ.zoom = Math.max(0.05, Math.min(4,
      Math.min((c.width - 48) / r.width, (c.height - 48) / r.height)));
  dzApplyZoom();
}
/* ──  Documento: tamaño del lienzo, presets y color de fondo ── */
const DZ_DEFAULT_DOCUMENT = Object.freeze({ width: 1920, height: 1080 });
const DZ_DOC_PRESETS = [
  ["Full HD horizontal 1920×1080", 1920, 1080],
  ["LOW vertical 1020×1080", 1020, 1080],
  ["Full HD vertical 1080×1920", 1080, 1920],
  ["HD horizontal 1280×720", 1280, 720],
  ["4K UHD 3840×2160", 3840, 2160],
  ["Cuadrado 1080×1080 (Instagram)", 1080, 1080],
  ["Cine 2048×858 (2K scope)", 2048, 858],
  ["A4 impresión 2480×3508 (300dpi)", 2480, 3508],
  ["Carta 2550×3300", 2550, 3300],
];

function dzSvgDocumentSize(svg) {
  const raw = String(svg?.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
  const aw = parseFloat(svg?.getAttribute("width")), ah = parseFloat(svg?.getAttribute("height"));
  const width = Number.isFinite(raw[2]) && raw[2] > 0 ? raw[2] :
    (Number.isFinite(aw) && aw > 0 ? aw : DZ_DEFAULT_DOCUMENT.width);
  const height = Number.isFinite(raw[3]) && raw[3] > 0 ? raw[3] :
    (Number.isFinite(ah) && ah > 0 ? ah : DZ_DEFAULT_DOCUMENT.height);
  return { x: Number.isFinite(raw[0]) ? raw[0] : 0, y: Number.isFinite(raw[1]) ? raw[1] : 0,
    width: Math.max(16, Math.min(16384, Math.round(width))),
    height: Math.max(16, Math.min(16384, Math.round(height))) };
}

/** Normaliza el SVG sin escalar su contenido. `width/height/viewBox` expresan
 *  una sola resolución lógica y el CSS se limita a mostrarla con zoom. */
function dzNormalizeSvgDocument(svg, requested) {
  if (!svg) return null;
  const own = dzSvgDocumentSize(svg), size = requested || own;
  const width = Math.max(16, Math.min(16384, Math.round(Number(size.width) || own.width)));
  const height = Math.max(16, Math.min(16384, Math.round(Number(size.height) || own.height)));
  const x = Number.isFinite(Number(size.x)) ? Number(size.x) : own.x;
  const y = Number.isFinite(Number(size.y)) ? Number(size.y) : own.y;
  svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  svg.setAttribute("width", width); svg.setAttribute("height", height);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  ["width", "height", "max-width", "max-height", "aspect-ratio"].forEach((p) => svg.style.removeProperty(p));
  return { x, y, width, height };
}

function dzCurrentDocumentSize() {
  const own = dzSvgDocumentSize($("#dzCanvas")?.querySelector(":scope > svg"));
  if (DZ.doc?.scene) return { x: own.x, y: own.y,
    width: DZ.doc.scene.width, height: DZ.doc.scene.height };
  return own;
}

function dzSyncCanvasDocument(fit = false) {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  if (!svg) return null;
  const size = dzNormalizeSvgDocument(svg, dzCurrentDocumentSize());
  if (fit) requestAnimationFrame(dzFitView);
  if (typeof dzCamOverlay === "function") dzCamOverlay();   // la zona de camara, marcada desde que se abre el documento
  return size;
}

function dzDocumentBackground(svg, size) {
  return [...svg.querySelectorAll("rect")].find((rc) => {
    const w = Math.abs(parseFloat(rc.getAttribute("width")) || 0);
    const h = Math.abs(parseFloat(rc.getAttribute("height")) || 0);
    return w * h >= size.width * size.height * .9;
  });
}

function dzDocModal() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const size = dzCurrentDocumentSize();
  // el fondo es el rect que cubre (casi) todo el lienzo, si existe
  const bg = dzDocumentBackground(svg, size);
  const bgColor = bg ? dzHex(bg.getAttribute("fill")) || "#ffffff" : "#ffffff";
  openModal(`<h2>Configuración del archivo</h2>
    <div class="sub">Resolución fija del archivo. Cambiar panel, monitor o zoom no modifica estos píxeles.
    Si achicás el documento, el contenido conserva sus coordenadas y puede quedar fuera del encuadre.</div>
    <div class="dz-style-row">
      <span class="dz-hint">Preset</span>
      <select id="docPreset" class="langsel" style="flex:1">
        <option value="">— personalizado —</option>
        ${DZ_DOC_PRESETS.map((p, i) => `<option value="${i}">${p[0]}</option>`).join("")}
      </select>
    </div>
    <div class="dz-style-row">
      <label class="dz-hint" for="docW">Ancho</label><input type="number" id="docW" class="dz-win" style="width:82px" value="${size.width}" min="16" max="16384">
      <button class="ghost" id="docSwap" title="Intercambiar ancho y alto" aria-label="Intercambiar ancho y alto">↔</button>
      <label class="dz-hint" for="docH">Alto</label><input type="number" id="docH" class="dz-win" style="width:82px" value="${size.height}" min="16" max="16384">
      <output id="docRatio" class="dz-hint" aria-live="polite"></output>
    </div>
    <div class="dz-style-row">
      <span class="dz-hint">Fondo</span><input type="color" id="docBg" value="${bgColor}">
      <label class="dz-hint" style="display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="docNoBg" ${bg ? "" : "checked"}> sin fondo (transparente)</label>
    </div>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="docGo">Aplicar</button>
    </div>`);
  const ratio = () => {
    const w = Math.max(1, +$("#docW").value || 1), h = Math.max(1, +$("#docH").value || 1);
    $("#docRatio").textContent = `${(w / h).toFixed(3)}:1`;
    const i = DZ_DOC_PRESETS.findIndex((p) => p[1] === w && p[2] === h);
    $("#docPreset").value = i >= 0 ? String(i) : "";
  };
  $("#docPreset").onchange = (e) => {
    const p = DZ_DOC_PRESETS[+e.target.value];
    if (p) { $("#docW").value = p[1]; $("#docH").value = p[2]; ratio(); }
  };
  $("#docW").oninput = ratio; $("#docH").oninput = ratio;
  $("#docSwap").onclick = () => {
    const w = $("#docW").value; $("#docW").value = $("#docH").value; $("#docH").value = w; ratio();
  };
  ratio();
  $("#mCancel").onclick = closeModal;
  $("#docGo").onclick = () => {
    const W = Math.max(16, Math.min(16384, Math.round(+$("#docW").value || size.width)));
    const H = Math.max(16, Math.min(16384, Math.round(+$("#docH").value || size.height)));
    const color = $("#docBg").value, noBg = $("#docNoBg").checked;
    closeModal();
    const before = { width: size.width, height: size.height, svg: dzSerialize(svg) };
    if (DZ.doc) DZ.doc.setSize(W, H, { history: false });
    dzNormalizeSvgDocument(svg, { x: size.x, y: size.y, width: W, height: H });
    if (noBg) {
      if (bg) bg.remove();
    } else if (bg) {
      bg.setAttribute("x", size.x); bg.setAttribute("y", size.y);
      bg.setAttribute("width", W); bg.setAttribute("height", H);
      bg.setAttribute("fill", color);
    } else {
      const rc = document.createElementNS(SVGNS, "rect");
      rc.setAttribute("x", size.x); rc.setAttribute("y", size.y);
      rc.setAttribute("width", W); rc.setAttribute("height", H);
      rc.setAttribute("fill", color);
      svg.insertBefore(rc, svg.firstChild);
    }
    const after = { width: W, height: H, svg: dzSerialize(svg) };
    if (!DZ.history) DZ.history = new LOW.core.HistoryManager({ limit: 180 });
    DZ.history.push({ label: "Cambiar tamaño del documento", domain: "document", before, after,
      apply: (_direction, value) => {
        if (DZ.doc) DZ.doc.setSize(value.width, value.height, { history: false });
        dzApplySvgText(value.svg, { documentSize: value });
        dzFitView();
      } });
    dzMarkDirty(); dzBuildLayers(); dzFitView();
    dzSetStatus(` Documento fijo: ${W}×${H} px` + (noBg ? " · fondo transparente" : ""));
  };
}
/* paneo del lienzo: espacio+arrastrar o botón del medio (mano de Toon Boom).
   Devuelve true si el evento era un paneo (los demás handlers lo ignoran). */
function dzPanMaybe(e, force) {
  if (!force && !DZ.spaceDown && e.button !== 1 && (DZ.tool || "select") !== "hand") return false;
  e.preventDefault(); e.stopPropagation();
  const x0 = e.clientX - (DZ.panX || 0), y0 = e.clientY - (DZ.panY || 0);
  const cv = $("#dzCanvas");
  const pid = e.pointerId != null ? e.pointerId : 1;
  cv.style.cursor = "grabbing";
  // El arrastre se sigue con eventos de PUNTERO, no de mouse. Aca se entra por
  // un pointerdown y se hace preventDefault, y eso suprime los eventos de mouse
  // compatibles: con lapiz de tableta el `mouseup` no llegaba NUNCA, el listener
  // quedaba vivo y el lienzo se quedaba pegado al cursor para siempre.
  const move = (ev) => {
    if (ev.pointerId != null && ev.pointerId !== pid) return;
    DZ.panX = ev.clientX - x0; DZ.panY = ev.clientY - y0; dzApplyZoom();
  };
  const soltar = (ev) => {
    if (ev && ev.pointerId != null && ev.pointerId !== pid) return;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", soltar);
    document.removeEventListener("pointercancel", soltar);
    window.removeEventListener("blur", soltar);
    try { cv.releasePointerCapture(pid); } catch (_) { /* ya estaba libre */ }
    cv.style.cursor = DZ.spaceDown ? "grab" : ((DZ.tool || "select") in DZ_CURSORS ? DZ_CURSORS[DZ.tool || "select"] : "crosshair");
  };
  // con captura, soltar fuera del lienzo tambien termina el paneo
  try { cv.setPointerCapture(pid); } catch (_) { /* WebView sin captura */ }
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
  window.addEventListener("blur", soltar);   // alt-tab a mitad del arrastre
  return true;
}
function dzZoom(delta) { DZ.zoom = Math.min(4, Math.max(0.2, Math.round((DZ.zoom + delta) * 100) / 100)); dzApplyZoom(); }
/* zoom HACIA UN PUNTO de pantalla (cursor): el punto bajo el mouse queda fijo
   mientras el lienzo crece/achica — comportamiento pro (OpenToonz/Blender).
   Compensa el pan para que el ancla no se corra. factor >1 acerca, <1 aleja. */
function dzZoomAt(factor, clientX, clientY) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) { dzZoom(factor > 1 ? 0.15 : -0.15); return; }
  const z0 = DZ.zoom;
  const z1 = Math.min(6, Math.max(0.1, Math.round(z0 * factor * 100) / 100));
  const k = z1 / z0;
  if (k === 1) return;
  // centro visual actual del lienzo en pantalla (incluye el pan ya aplicado)
  const r = svg.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  // el offset cursorcentro se escala por k; ajusto el pan para cancelar la deriva
  DZ.panX = (DZ.panX || 0) + (clientX - cx) * (1 - k);
  DZ.panY = (DZ.panY || 0) + (clientY - cy) * (1 - k);
  DZ.zoom = z1;
  dzApplyZoom();
}

function dzSelect(el) { el = dzAtomicArtwork(el);
  if (DZ.sel) DZ.sel.classList.remove("dz-sel");
  DZ.sel = el;
  // La multiselección tiene una sola representación: DZ.sel conserva el
  // elemento activo para el inspector, pero ningún hijo dibuja caja propia.
  const multiple = (DZ.multi || []).filter(n => n?.isConnected).length > 1;
  if (!multiple) el.classList.add("dz-sel");
  (DZ.multi || []).forEach(n => n.classList?.remove("dz-msel"));
  // La capa activa persiste aunque después se seleccione una forma: lo próximo
  // que se dibuje debe entrar en la misma capa, no volver al plano general.
  const layer = dzLayerOf(el);
  if (layer) DZ.activeLayer = layer;
  if (DZ.rigMode && !DZ.rigSelectingNode) {
    // Un clic sobre el dibujo elige ARTE, aunque esté vinculado. Sólo el overlay
    // o el árbol eligen un HUESO. Esta distinción evita que Supr borre lo opuesto
    // a lo que el usuario acaba de tocar.
    DZ.rigSelectedId = DZ.doc?.scene.rigNode(el.id) ? el.id : null;
    DZ.rigSelectionSource = "art";
  }
  dzBuildInspector(el);
  dzPositionHandle();
  dzBuildLayers();
  if (DZ.rigMode) dzRigPanelSync();
  dzStyleSync(el);
  dzLayerToolsSync(el);
  dzPivotMark();
  // modo comentario: el dock ahora apunta SOLO a este elemento
  $("#dzPrompt").placeholder = `💬 Comentario sobre <${el.tagName.toLowerCase()}> — LOW edita SOLO ese elemento`;
}
function dzDeselect() {
  if (DZ.sel) { DZ.sel.classList.remove("dz-sel"); DZ.sel = null; }
  dzClearMulti();
  $("#dzProps").hidden = true; $("#dzEmpty").hidden = false;
  $("#dzHandle").hidden = true; $("#dzPin").hidden = true;
  const box = $("#dzSelBox"); if (box) box.hidden = true;
  const rot = $("#dzRotate"); if (rot) rot.hidden = true;
  const pv = $("#dzPivot"); if (pv) pv.hidden = true;
  dzBuildLayers();
  $("#dzPrompt").placeholder = "Pedile un cambio a LOW… ej: «hacé el título más grande y centralo»";
}
/* ubica el tirador de resize (esquina inferior-derecha) y el pin de comentario
   (esquina superior-izquierda) sobre el elemento seleccionado */
function dzPositionHandle() {
  const h = $("#dzHandle"), pin = $("#dzPin"), rot = $("#dzRotate"), box = $("#dzSelBox");
  h.hidden = true;                             // la caja PS reemplaza al tirador único
  if (!DZ.sel) { pin.hidden = true; if (rot) rot.hidden = true; if (box) box.hidden = true; return; }
  try {
    const cvRect = $("#dzCanvas").getBoundingClientRect();
    const pack = (DZ.multi || []).length > 1 ? DZ.multi.filter(n => n?.isConnected) : [DZ.sel];
    let left, top, width, height, angle = 0, topCenter, up = { x: 0, y: -1 };
    if (pack.length === 1) {
      const el = pack[0], lb = el.getBBox(), m = el.getScreenCTM();
      const point = (x, y) => {
        const p = el.ownerSVGElement.createSVGPoint(); p.x = x; p.y = y;
        return p.matrixTransform(m);
      };
      const p0 = point(lb.x, lb.y), px = point(lb.x + lb.width, lb.y), py = point(lb.x, lb.y + lb.height);
      const vx = { x: px.x - p0.x, y: px.y - p0.y }, vy = { x: py.x - p0.x, y: py.y - p0.y };
      left = p0.x - cvRect.left; top = p0.y - cvRect.top;
      width = Math.max(1, Math.hypot(vx.x, vx.y)); height = Math.max(1, Math.hypot(vy.x, vy.y));
      angle = Math.atan2(vx.y, vx.x) * 180 / Math.PI;
      topCenter = { x: p0.x + vx.x / 2, y: p0.y + vx.y / 2 };
      const vl = Math.max(1, Math.hypot(vy.x, vy.y)); up = { x: -vy.x / vl, y: -vy.y / vl };
    } else {
      const rects = pack.map(n => n.getBoundingClientRect());
      const l = Math.min(...rects.map(r => r.left)), t = Math.min(...rects.map(r => r.top));
      const r = Math.max(...rects.map(r => r.right)), b = Math.max(...rects.map(r => r.bottom));
      left = l - cvRect.left; top = t - cvRect.top; width = Math.max(1, r - l); height = Math.max(1, b - t);
      topCenter = { x: (l + r) / 2, y: t };
    }
    if (box) {
      box.style.left = left + "px"; box.style.top = top + "px";
      box.style.width = width + "px"; box.style.height = height + "px";
      box.style.transformOrigin = "0 0";
      box.style.transform = angle ? `rotate(${angle}deg)` : "none"; dzCursoresDeCaja(box, angle);   // la flecha gira con la forma
      box.hidden = false;
      const info = pack.length === 1 ? dzCornerInfo(pack[0]) : null;
      const widgets = [...document.querySelectorAll("#dzSelBox .dz-corner-widget")];
      if (info) {
        const pos = {
          tl:[info.r[0] / info.w * width, info.r[0] / info.h * height],
          tr:[width - info.r[1] / info.w * width, info.r[1] / info.h * height],
          br:[width - info.r[2] / info.w * width, height - info.r[2] / info.h * height],
          bl:[info.r[3] / info.w * width, height - info.r[3] / info.h * height]
        };
        widgets.forEach(w => { const p = pos[w.dataset.corner]; w.style.left = Math.max(12,Math.min(width-12,p[0])) + "px"; w.style.top = Math.max(12,Math.min(height-12,p[1])) + "px"; w.hidden = false; });
      } else widgets.forEach(w => { w.hidden = true; });
    }
    // El globo de comentario permanente era el botón de «tres puntos» que
    // ensuciaba cada selección. Los comentarios siguen en el panel contextual.
    pin.hidden = true;
    if (rot) {
      rot.style.left = (topCenter.x + up.x * 22 - cvRect.left) + "px";
      rot.style.top = (topCenter.y + up.y * 22 - cvRect.top) + "px";
      rot.hidden = false;
    }
  } catch (e) { pin.hidden = true; if (rot) rot.hidden = true; if (box) box.hidden = true; }
}

/* resize desde cualquiera de los 8 tiradores, anclado al tirador OPUESTO
   (transformación libre de Photoshop). hx,hy ∈ {-1,0,1}. */
function dzBoxHandleDown(e, hx, hy) {
  if (!DZ.sel) return;
  const selectedPack = (DZ.multi || []).filter(n => n?.isConnected);
  if (selectedPack.length > 1) return dzMultiScaleDown(e, hx, hy, selectedPack);
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  dzSnapshot();
  const el = DZ.sel;
  let lb = null; try { lb = el.getBBox(); } catch (err) { /* sin bbox */ }
  if (!lb) return;
  const inv = el.getScreenCTM().inverse();
  const local = ev => {
    const p = el.ownerSVGElement.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    return p.matrixTransform(inv);
  };
  const start = local(e), geo = dzEscalaCapturar(el);   // se escala la GEOMETRIA, no el elemento: una transform escala tambien el trazo
  const w0 = Math.max(1, lb.width), h0 = Math.max(1, lb.height);
  const T = LOW.drawing.transforms;
  const consolidated = el.transform?.baseVal?.consolidate();
  const base = consolidated ? T.multiply(T.identity(), consolidated.matrix) : T.identity();
  // ancla LOCAL = tirador opuesto (si agarro la derecha, fijo la izquierda)
  const axL = hx > 0 ? lb.x : hx < 0 ? lb.x + lb.width : lb.x + lb.width / 2;
  const ayL = hy > 0 ? lb.y : hy < 0 ? lb.y + lb.height : lb.y + lb.height / 2;
  const anchorParent = T.point(base, { x:axL, y:ayL });
  const corner = hx !== 0 && hy !== 0;
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const p = local(ev);
    const dx = (p.x - start.x) * hx, dy = (p.y - start.y) * hy;
    let kx = hx ? Math.max(0.05, (w0 + dx) / w0) : 1;
    let ky = hy ? Math.max(0.05, (h0 + dy) / h0) : 1;
    // esquina: proporcional por defecto; Shift = deformar libre
    if (corner && !ev.shiftKey) { const k = Math.max(kx, ky); kx = ky = k; }
    if (!dzEscalaGeometrica(el, geo, kx, ky, axL, ayL)) el.setAttribute("transform", T.attr(T.rigidScale(base, kx, ky, anchorParent)));
    dzPositionHandle();
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    dzBuildInspector(el); dzMarkDirty();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

/* ══ rigging (pivotes ): fija el eje de rotación de un elemento/parte del
   cuerpo — el posado cutout de Toon Boom (peg pivots). El pivote se guarda
   en data-pivot y la rotación gira alrededor de él. ══ */
function dzPivotClick(e) {
  // A QUIÉN se le pone el pivote. Manda lo que está ELEGIDO —el hueso del panel
  // o la pieza de la mesa—, no lo que haya bajo el dedo: el pivote de un brazo
  // va en el hombro, y ahí abajo lo que hay es el torso. Antes se lo llevaba el
  // torso, y el brazo seguía girando por el medio como si el clic no hubiera
  // pasado. Con nada elegido se mantiene el comportamiento de siempre: la pieza
  // que está debajo.
  const elegido = (DZ.rigMode && dzRigSelectedNode()) || null;
  const p = dzToUser(e.clientX, e.clientY);
  if (elegido) {
    dzSnapshot();
    if (e.altKey) {
      DZ.doc.setRigPivot(elegido.id, null);
      dzRigNodeElement(elegido)?.removeAttribute("data-pivot");
      dzMarkDirty(); dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender();
      return dzSetStatus(`Pivote de «${elegido.id}» quitado — vuelve al centro`);
    }
    DZ.doc.setRigPivot(elegido.id, p);
    dzRigNodeElement(elegido)?.setAttribute("data-pivot", `${Math.round(p.x)} ${Math.round(p.y)}`);
    dzMarkDirty(); dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender();
    return dzSetStatus(`Pivote de «${elegido.id}» puesto acá · ahora gira desde este punto · Alt+clic lo quita`);
  }
  // Dentro del armado, un pivote pertenece al HUESO, no a la pieza SVG que
  // casualmente quedó debajo del lápiz. Crear nodos desde acá era la causa de
  // los pivotes duplicados y hacía imposible entender qué se estaba editando.
  if (DZ.rigMode) {
    return dzSetStatus("Elegí primero un hueso del alambre · después hacé clic donde debe articular");
  }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const dentro = el && el.closest && el.closest("#dzCanvas svg:not(#dzRigOverlay)") && !el.closest("g.dz-onion");
  if (!dentro) {
    // Antes esto era un return mudo: el clic no hacía nada y no había forma de
    // saber por qué.
    return dzSetStatus("Ahí no hay ninguna pieza · elegí primero la pieza o el hueso, o hacé clic encima del dibujo");
  }
  let target = el;
  const grp = el.closest && el.closest('#dzCanvas svg > g:not(.dz-onion):not([data-low-art])');
  if (grp && !e.altKey) target = grp;            // en un rig, la parte suele ser un grupo
  if (target.tagName.toLowerCase() === "svg") return;
  dzSnapshot();
  if (e.altKey && target.hasAttribute("data-pivot")) {
    const targetId = target.id;
    target.removeAttribute("data-pivot");
    if (DZ.doc && targetId && DZ.doc.scene.rigNode(targetId)) DZ.doc.setRigPivot(targetId, null);
    const live = targetId && $("#dzCanvas").querySelector(":scope > svg")?.querySelector("#" + CSS.escape(targetId));
    dzSelect(live || target); dzMarkDirty();
    dzSetStatus(" Pivote quitado — la rotación vuelve al centro");
    return;
  }
  const targetId = target.id;
  target.setAttribute("data-pivot", `${Math.round(p.x)} ${Math.round(p.y)}`);
  if (DZ.doc && targetId) { DZ.doc.ensureRigNode(targetId); DZ.doc.setRigPivot(targetId, p); }
  const live = targetId && $("#dzCanvas").querySelector(":scope > svg")?.querySelector("#" + CSS.escape(targetId));
  dzSelect(live || target); dzMarkDirty();
  if (DZ.rigMode) { dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); dzMeshOverlayRender(); }
  dzSetStatus(" Pivote fijado — rotá con la manija  y gira desde acá (hombro, codo, cadera…). Alt+clic lo quita.");
}
function dzPivotMark() {
  const m = $("#dzPivot");
  if (!m) return;
  const nodePivot = DZ.doc && DZ.sel?.id && DZ.doc.scene.rigNode(DZ.sel.id)?.pivot;
  const pv = DZ.sel && DZ.sel.getAttribute && DZ.sel.getAttribute("data-pivot");
  if ((!pv && !nodePivot) || !$("#dzCanvas").querySelector(":scope > svg")) { m.hidden = true; return; }
  const [px, py] = nodePivot ? [nodePivot.x, nodePivot.y] : pv.split(/[\s,]+/).map(Number);
  const sp = dzToScreen(px, py);
  m.style.left = sp.x + "px"; m.style.top = sp.y + "px";
  m.hidden = false;
}

/* rotación (manija  arriba de la selección): gira alrededor del PIVOTE si
   el elemento tiene uno (rig cutout) o del centro si no; Shift ajusta de a
   15°. Reemplaza SOLO el rotate() agregado por este mismo arrastre. */
function dzRotateDown(e) {
  if (!DZ.sel) return;
  const selectedPack = (DZ.multi || []).filter(n => n?.isConnected);
  if (selectedPack.length > 1) return dzMultiRotateDown(e, selectedPack);
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  dzSnapshot();
  const el = DZ.sel;
  let lb; try { lb = el.getBBox(); } catch (_) { return; }
  const c = { x: lb.x + lb.width / 2, y: lb.y + lb.height / 2 };
  let pivotUser = null;
  const pv = el.getAttribute("data-pivot");
  if (pv) {
    const [px, py] = pv.split(/[\s,]+/).map(Number);
    // data-pivot pertenece al lienzo/escena, no al sistema local del elemento.
    if (!isNaN(px) && !isNaN(py)) pivotUser = { x:px, y:py };
  }
  const T = LOW.drawing.transforms;
  const consolidated = el.transform?.baseVal?.consolidate();
  const base = consolidated ? T.multiply(T.identity(), consolidated.matrix) : T.identity();
  const originalTransform = el.getAttribute("transform");
  // El centro y el puntero se llevan al PADRE de la forma. Antes el ángulo se
  // medía en pantalla y se agregaba un rotate() en coordenadas locales: con
  // escala/rotación previa eso deformaba la pieza y hasta invertía el gesto.
  const parentCTM = el.parentElement?.getScreenCTM?.();
  if (!parentCTM) return;
  const invParent = parentCTM.inverse();
  let centerParent = T.point(base, c);
  if (pivotUser) {
    const rootPoint = el.ownerSVGElement.createSVGPoint();
    rootPoint.x = pivotUser.x; rootPoint.y = pivotUser.y;
    const rootScreen = rootPoint.matrixTransform(el.ownerSVGElement.getScreenCTM());
    centerParent = rootScreen.matrixTransform(invParent);
  }
  const centerScreenPoint = el.ownerSVGElement.createSVGPoint();
  centerScreenPoint.x = centerParent.x; centerScreenPoint.y = centerParent.y;
  const centerScreen = centerScreenPoint.matrixTransform(parentCTM);
  const startScreen = { x:e.clientX, y:e.clientY };
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    let deg = T.screenRotationDelta(startScreen, {x:ev.clientX,y:ev.clientY}, centerScreen, parentCTM);
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
    deg = Math.round(deg * 10) / 10;
    el.setAttribute("transform", T.attr(T.rigidRotate(base, deg, centerParent)));
    dzPositionHandle();
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    if (ev.type === "pointercancel") {
      if (originalTransform == null) el.removeAttribute("transform");
      else el.setAttribute("transform", originalTransform);
      dzPositionHandle();
      return;
    }
    dzMarkDirty(); dzBuildInspector(el);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

/* botón "Diseño" de la barra: reabre el diseño actual, o crea un lienzo nuevo
   para que se vean las herramientas aunque no haya un SVG abierto todavía */
async function designEntry() {
  if (DZ.path) { $("#designView").hidden = false; return; }
  const r = await api.new_design();
  if (r && r.error) return sysMsg(" " + r.error);
  if (r && r.path) {
    try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
    await openDesign(r.path);
    await dzDocInit();
    await dzEnsureAnimationWorkspace();
    try { dzFitView(); } catch (e) { /* */ }
    dzSetStatus(" Página en blanco lista — dibujá con las herramientas de la izquierda o pedile un diseño a LOW abajo.  cambia el tamaño del lienzo.");
  }
}

/* convierte coordenadas de pantalla a unidades de usuario del SVG (respeta
   viewBox y el zoom CSS, porque usa la matriz real de pantalla) */
function dzToUser(clientX, clientY) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

/* la inversa: de coordenadas del dibujo a píxeles de pantalla. Usa la misma
   matriz del SVG, así respeta zoom, paneo y rotación de la vista sin repetir
   esas cuentas a mano (que es donde siempre se descalibra). */
function dzFromUser(x, y) {
  const svg = $("#dzCanvas") && $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return null;
  const m = svg.getScreenCTM();
  if (!m) return null;
  const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
  return pt.matrixTransform(m);
}

/* mousedown en el lienzo: selecciona el elemento y prepara arrastre para mover */
/* paneles/UI flotante DENTRO de #dzCanvas: sus clics NO deben iniciar dibujo ni
   selección (antes el lienzo hacía preventDefault y se comía los inputs  "los
   valores del papel cebolla no cambian" + trazos fantasma) */
const DZ_UI_SEL = ".dz-onionpanel,.dz-zpanel,.dz-xsheet,.dz-tlgrid,.dz-disc," +
  ".dz-pendbg,.dz3d-gizmo,.dz3d-zbar,.dz3d-zhandle,.dz3d-rothandle,.dz-rulers," +
  ".dz-selbox,.dz-cam,.dz-rig-overlay,.dz-mesh-overlay,#dzCam,.bien2d,.dz-warp";   // overlays de edición, bienvenida y jaula
function dzOnUiPanel(e) {
  return e.target && e.target.closest && e.target.closest(DZ_UI_SEL);
}
function dzCapturePointer(e) {
  try { $("#dzCanvas")?.setPointerCapture?.(e.pointerId); } catch (_) { /* WebView sin captura */ }
}
function dzPointerDown(e) {
  if (dzOnUiPanel(e)) return;   // clic en un panel flotante: no seleccionar
  dzReleaseFocus();
  if (dzPanMaybe(e)) return;                           // espacio/botón medio: panear
  if (e.target.id === "dzHandle" || e.target.id === "dzRotate") return;   // tiradores propios
  if (e.target.closest && e.target.closest("#dzCam")) return;             // la cámara maneja lo suyo
  if (!["select", "direct"].includes(DZ.tool || "select")) return;   // otras: pointer events
  if (e.isPrimary === false) return;
  // PUNTERÍA: el navegador acierta sólo donde hay PINTURA, así que una forma
  // sin relleno no existe para el puntero en su interior y el clic caía en lo
  // de atrás. dzHitTest prueba la GEOMETRÍA de adelante hacia atrás. Ver
  // ui/drawing/hit-test.js.
  let el = (typeof dzHitTest === "function" && dzHitTest(e.clientX, e.clientY)) || e.target;
  if (!el || el === $("#dzCanvas") || el.tagName.toLowerCase() === "svg" || dzIsCanvasBackground(el)) { dzMarqueeStart(e); return; }
  if (el.closest && el.closest("g.dz-onion")) { dzDeselect(); return; }
  if (el.closest && el.closest("[data-locked]")) { dzDeselect(); return; }   // capa bloqueada 🔒
  // clic dentro de un grupo real (<g> guardado): seleccionar el GRUPO (como
  // Illustrator); doble clic entraría al hijo — acá con Shift+clic alcanza
  const grp = el.closest && el.closest('#dzCanvas svg > g:not(.dz-onion):not([data-low-art])');
  if (grp && DZ.tool !== "direct") el = grp; el = dzAtomicArtwork(el); // generated brush marks stay together
  e.preventDefault();
  dzCapturePointer(e);
  const pointerId = e.pointerId;
  // Shift+clic: sumar/sacar de la selección múltiple (para agrupar/alinear/mover juntos)
  DZ.multi = DZ.multi || [];
  // En FK Shift+arrastrar pertenece al rig: rota la pieza sobre su pivote.
  const rigShiftRotate = !!(DZ.rigMode && DZ.rigSubmode === "fk" && el.id
    && DZ.doc?.scene.rigNode(el.id));
  if (e.shiftKey && !rigShiftRotate) {
    let pack = DZ.multi.length > 1 ? DZ.multi.slice() : (DZ.sel ? [DZ.sel] : []);
    const i = pack.indexOf(el);
    if (i >= 0) pack.splice(i, 1); else pack.push(el);
    pack = [...new Set(pack)].filter(n => n?.isConnected);
    DZ.multi = pack.length > 1 ? pack : [];
    if (pack.length) dzSelect(pack.includes(el) ? el : pack[pack.length - 1]); else dzDeselect();
    dzSetStatus(pack.length > 1 ? " " + pack.length + " elementos seleccionados — Ctrl+G agrupa, arrastrá para moverlos juntos" : "");
    return;
  }
  // clic normal sobre algo fuera de la multi  limpiarla
  if (DZ.multi.length && !DZ.multi.includes(el)) dzClearMulti();
  if (el !== DZ.sel) dzSelect(el);
  const start = dzToUser(e.clientX, e.clientY);
  let pack = (DZ.multi.length > 1 && DZ.multi.includes(el)) ? DZ.multi.slice() : [el];
  let bases = pack.map(n => ({ n, base: dzReadPos(n) }));
  let moved = false;
  // referencias de alineación: se calculan UNA vez al empezar el gesto (leer
  // getBoundingClientRect de todo el dibujo en cada pointermove arrastraría)
  const alignRefs = dzAlignRefs(pack);
  const alignBase = (() => {
    const bs = dzSelBounds(pack);
    return { x1: Math.min(...bs.map(b => b.x1)), y1: Math.min(...bs.map(b => b.y1)),
             x2: Math.max(...bs.map(b => b.x2)), y2: Math.max(...bs.map(b => b.y2)) };
  })();
  //  modo rig + pieza con nombre: el arrastre POSA (clave), no toca el dibujo.
  // Grabando (🎥): el arrastre ES la actuación — se muestrea con su tiempo real.
  let rigDrag = null;
  let rigFrame = dzRigCur();
  // En FK, arrastrar la pieza en la mesa POSA solo con la herramienta «Posar»
  // (o durante la grabación del titiritero); con «Seleccionar» el arrastre es
  // el normal (mover el arte, no crear clave).
  const rigRecNow = DZ.perf && DZ.perf.rec;
  if (DZ.rigMode && DZ.rigSubmode === "fk" && (DZ.rigTool === "pose" || rigRecNow) && pack.length === 1 && el.id) {
    const recNow = rigRecNow;
    rigFrame = recNow ? 1 + (performance.now() - recNow.t0) / 1000 * recNow.fps : dzRigCur();
    // La pieza de arte puede tener un id distinto del hueso (bindRigElement):
    // resolvemos el HUESO por elementId para posar la cadena correcta, no crear
    // un nodo fantasma con el id del <path>/<g>.
    const boneId = dzRigNodeIdOfElement(el.id) || el.id;
    const rigNode = DZ.doc && DZ.doc.scene.rigNode(boneId);
    const pv = rigNode?.pivot ? DZ.doc.scene.rigWorldPoint(rigNode.id, rigFrame, rigNode.pivot) : dzRigPivotOf(el);
    rigDrag = { id: boneId, pv,
                k0: dzRigLocalAt(boneId, rigFrame) || { x: 0, y: 0, r: 0, s: 1 },
                a0: Math.atan2(start.y - pv.y, start.x - pv.x) };
    if (recNow) { recNow.active = boneId; recNow.take[boneId] = recNow.take[boneId] || []; }
  }
  // ⏹ grabación armada: este arrastre ES la actuación — muestrear el gesto
  let rec = null;
  if (DZ.rec && DZ.rec.armed) {
    const path = dzElPath(el);
    if (path) {
      rec = { el, path, samples: [[0, 0, 0]], t0: performance.now(), last: [0, 0] };
      dzSetStatus("⏹ GRABANDO el movimiento… soltá para terminar");
    }
  }
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const p = dzToUser(ev.clientX, ev.clientY);
    const dx = p.x - start.x, dy = p.y - start.y;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 1) return;
    if (!moved && !rigDrag) {
      dzSnapshot();                                    // primer movimiento real
      if (ev.altKey) {
        pack = dzDuplicatePackForDrag(pack);
        bases = pack.map(n => ({ n, base: dzReadPos(n) }));
        el = pack[pack.length - 1];
      }
    }
    moved = true;
    if (rigDrag) {
      let pose;
      if (ev.shiftKey) {                       // bastón del títere: rotar desde el pivote
        const a = Math.atan2(p.y - rigDrag.pv.y, p.x - rigDrag.pv.x);
        pose = { ...rigDrag.k0, r: (rigDrag.k0.r || 0) + (a - rigDrag.a0) * 180 / Math.PI };
      } else {
        const local = dzRigParentDelta(rigDrag.id, dx, dy, rigFrame);
        pose = { ...rigDrag.k0, x: rigDrag.k0.x + local.x, y: rigDrag.k0.y + local.y };
      }
      DZ.rigLivePose = { [rigDrag.id]: pose };
      dzRigApplyLive(rigFrame, DZ.rigLivePose);
      rigDrag.pose = pose;
      const rec = DZ.perf && DZ.perf.rec;
      if (rec) {
        rec.livePose = pose;
        rec.take[rigDrag.id].push({ t: (performance.now() - rec.t0) / 1000,
          x: pose.x, y: pose.y, r: pose.r || 0,
          sx: pose.sx == null ? (pose.s == null ? 1 : pose.s) : pose.sx,
          sy: pose.sy == null ? (pose.s == null ? 1 : pose.s) : pose.sy });
      }
    } else {
      // GUÍAS DE ALINEACIÓN: si un borde o el centro de lo que arrastrás queda
      // casi a la altura del de otro objeto (o del lienzo), se imanta y se
      // dibuja la línea. Con Alt se ignora, para poder colocar algo libre.
      let ax = 0, ay = 0;
      if (!ev.altKey && alignRefs) {
        const r = dzAlignAdjust(alignBase, alignRefs, dx, dy);
        ax = r.ax; ay = r.ay;
        dzAlignRender(r.lineas);
      } else dzAlignRender(null);
      bases.forEach(b => dzWritePos(b.n, b.base, dx + ax, dy + ay));
    }
    if (rec) { rec.last = [dx, dy]; rec.samples.push([dx, dy, performance.now() - rec.t0]); }
    dzPositionHandle();
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    dzAlignClear();   // las guías de alineación viven solo durante el gesto
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    if (rigDrag && DZ.perf && DZ.perf.rec) {
      DZ.perf.rec.active = null; DZ.perf.rec.livePose = null; // vuelve al replay de su pista
    } else if (moved && rigDrag && rigDrag.pose) {
      if (DZ.rigAutoKey === false) {
        dzRigPanelSync();
        dzSetStatus(" Pose de prueba en F" + dzRigCur() + " · Enter clava, Esc descarta");
      } else {
        DZ.rigLivePose = null;
        dzRigSetKey(rigDrag.id, dzRigCur(), rigDrag.pose);
        dzSetStatus(" pose clavada en el cuadro " + dzRigCur() + " (Shift al arrastrar = rotar)");
      }
    }
    if (moved) { dzBuildInspector(el); if (!rigDrag) dzMarkDirty(); }
    if (rec && moved) dzRecFinish(rec);
    else if (rec) { DZ.rec = { armed: true }; }        // no arrastró: sigue armada
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

function dzMultiRotateDown(e, pack) {
  e.preventDefault(); e.stopPropagation(); dzSnapshot();
  const pointerId=e.pointerId, rects=pack.map(n=>n.getBoundingClientRect());
  const sx=(Math.min(...rects.map(r=>r.left))+Math.max(...rects.map(r=>r.right)))/2;
  const sy=(Math.min(...rects.map(r=>r.top))+Math.max(...rects.map(r=>r.bottom)))/2;
  const T=LOW.drawing.transforms, startScreen={x:e.clientX,y:e.clientY};
  const bases=pack.map(n=>{
    const consolidated=n.transform?.baseVal?.consolidate();
    const base=consolidated?T.multiply(T.identity(),consolidated.matrix):T.identity();
    const parentCTM=n.parentElement?.getScreenCTM?.();
    if(!parentCTM)return null;
    const p=n.ownerSVGElement.createSVGPoint();p.x=sx;p.y=sy;
    return {n,base,center:p.matrixTransform(parentCTM.inverse()),parentCTM};
  }).filter(Boolean);
  const move=ev=>{
    if(ev.pointerId!==pointerId)return;
    bases.forEach(({n,base,center,parentCTM})=>{
      let deg=T.screenRotationDelta(startScreen,{x:ev.clientX,y:ev.clientY},{x:sx,y:sy},parentCTM);
      if(ev.shiftKey)deg=Math.round(deg/15)*15; deg=Math.round(deg*10)/10;
      n.setAttribute("transform",T.attr(T.rigidRotate(base,deg,center)));
    });
    dzPositionHandle();
  };
  const up=ev=>{if(ev.pointerId!==pointerId)return;document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);dzMarkDirty();dzBuildLayers();};
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
}

function dzMultiScaleDown(e, hx, hy, pack) {
  e.preventDefault(); e.stopPropagation(); dzSnapshot();
  const pointerId=e.pointerId, rects=pack.map(n=>n.getBoundingClientRect());
  const sr={left:Math.min(...rects.map(r=>r.left)),top:Math.min(...rects.map(r=>r.top)),
    right:Math.max(...rects.map(r=>r.right)),bottom:Math.max(...rects.map(r=>r.bottom))};
  const anchorScreen={x:hx>0?sr.left:hx<0?sr.right:(sr.left+sr.right)/2,
    y:hy>0?sr.top:hy<0?sr.bottom:(sr.top+sr.bottom)/2};
  const start={x:e.clientX,y:e.clientY}, w=Math.max(1,sr.right-sr.left), h=Math.max(1,sr.bottom-sr.top);
  const T=LOW.drawing.transforms;
  const bases=pack.map(n=>{
    const consolidated=n.transform?.baseVal?.consolidate();
    const base=consolidated?T.multiply(T.identity(),consolidated.matrix):T.identity();
    const parentCTM=n.parentElement?.getScreenCTM?.();
    if(!parentCTM)return null;
    const p=n.ownerSVGElement.createSVGPoint();p.x=anchorScreen.x;p.y=anchorScreen.y;
    return {n,base,anchor:p.matrixTransform(parentCTM.inverse()),geo:consolidated?null:dzEscalaCapturar(n)};
  }).filter(Boolean), corner=hx!==0&&hy!==0;
  const move=ev=>{
    if(ev.pointerId!==pointerId)return;
    let kx=hx?Math.max(.05,1+(ev.clientX-start.x)*hx/w):1;
    let ky=hy?Math.max(.05,1+(ev.clientY-start.y)*hy/h):1;
    if(corner&&!ev.shiftKey){const k=Math.max(kx,ky);kx=ky=k;}
    bases.forEach(({n,base,anchor,geo})=>{ if(!dzEscalaGeometrica(n,geo,kx,ky,anchor.x,anchor.y)) n.setAttribute("transform",T.attr(T.rigidScale(base,kx,ky,anchor))); });
    dzPositionHandle();
  };
  const up=ev=>{if(ev.pointerId!==pointerId)return;document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);dzMarkDirty();dzBuildLayers();};
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
}
function dzUniqueCloneIds(root) {
  const nodes = [root, ...root.querySelectorAll("[id]")];
  nodes.forEach(n => {
    if (!n.id) return;
    const base = n.id.replace(/_copia(?:_\d+)?$/, ""); let id = base + "_copia", i = 2;
    while (document.getElementById(id)) id = base + "_copia_" + i++;
    n.id = id;
  });
}
function dzDuplicatePackForDrag(pack) {
  const copies = pack.map(source => {
    const clone = source.cloneNode(true); dzUniqueCloneIds(clone);
    source.parentNode.insertBefore(clone, source.nextSibling); return clone;
  });
  dzClearMulti(); DZ.multi = copies.slice();
  dzSelect(copies[copies.length - 1]);
  dzSetStatus(" Copia creada · soltá para ubicarla");
  return copies;
}
function dzClearMulti() {
  (DZ.multi || []).forEach(n => n.classList && n.classList.remove("dz-msel"));
  DZ.multi = [];
  if (DZ.sel?.isConnected) DZ.sel.classList.add("dz-sel");
}

function dzIsCanvasBackground(el) {
  if (!el || el.tagName?.toLowerCase() !== "rect") return false;
  if (el.hasAttribute("data-low-page")) return true;
  const svg = el.parentElement;
  if (!svg || svg.tagName?.toLowerCase() !== "svg") return false;
  const vb = (svg.getAttribute("viewBox") || "").trim().split(/\s+/).map(Number);
  return vb.length === 4 && (+el.getAttribute("x") || 0) === vb[0] && (+el.getAttribute("y") || 0) === vb[1]
    && Math.abs((+el.getAttribute("width") || 0) - vb[2]) < .01
    && Math.abs((+el.getAttribute("height") || 0) - vb[3]) < .01;
}

/* ── selección por marquee (arrastrar un rectángulo en el fondo del lienzo) ──
   Izquierda→derecha: sólo lo completamente contenido. Derecha→izquierda: todo
   lo que toca. Shift suma y Alt invierte temporalmente esa convención. */
function dzMarqueeStart(e) {
  e.preventDefault();
  const pointerId = e.pointerId;
  const cv = $("#dzCanvas");
  const cvRect = cv.getBoundingClientRect();
  const x0 = e.clientX, y0 = e.clientY;
  const box = document.createElement("div");
  box.className = "dz-marquee";
  cv.appendChild(box);
  let moved = false;
  const draw = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const l = Math.min(x0, ev.clientX), t = Math.min(y0, ev.clientY);
    const w = Math.abs(ev.clientX - x0), h = Math.abs(ev.clientY - y0);
    box.style.left = (l - cvRect.left) + "px"; box.style.top = (t - cvRect.top) + "px";
    box.style.width = w + "px"; box.style.height = h + "px";
    if (w + h > 3) moved = true;
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", draw);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    box.remove();
    if (ev.type === "pointercancel") return;
    if (!moved) { if (!ev.shiftKey) dzDeselect(); return; }   // clic simple  deseleccionar
    const mode = LOW.drawing.selection.marqueeMode(x0, ev.clientX, ev.altKey);
    dzMarqueeSelect(Math.min(x0, ev.clientX), Math.min(y0, ev.clientY),
                    Math.max(x0, ev.clientX), Math.max(y0, ev.clientY),
                    ev.shiftKey, mode);
  };
  document.addEventListener("pointermove", draw);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}
function dzMarqueeSelect(l, t, r, b, additive, mode = "touching") {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const direct = [...svg.children].filter(n => !n.hasAttribute("data-low-art"));
  const art = [...svg.querySelectorAll(':scope > g[data-low-art] > *')];
  const kids = [...direct, ...art].filter(n =>
    !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase()) &&
    !(n.classList && (n.classList.contains("dz-onion") || n.classList.contains("dz-penui"))) &&
    !n.hasAttribute("data-locked") && n.getAttribute("display") !== "none" && !dzIsCanvasBackground(n));
  if (!additive) dzClearMulti();
  else if ((DZ.multi || []).length < 2 && DZ.sel?.isConnected) DZ.multi = [DZ.sel];
  DZ.multi = DZ.multi || [];
  kids.forEach(el => {
    let bb; try { bb = el.getBoundingClientRect(); } catch (e) { return; }
    if (!bb.width && !bb.height) return;
    const hit = LOW.drawing.selection.marqueeHit(bb,
      { left:l, top:t, right:r, bottom:b }, mode);
    if (hit && !DZ.multi.includes(el)) DZ.multi.push(el);
  });
  DZ.multi = [...new Set(DZ.multi)].filter(n => n?.isConnected);
  if (DZ.multi.length > 1) {
    dzSelect(DZ.multi[DZ.multi.length - 1]);   // el "activo" es el último; la multi manda al mover
    dzSetStatus(" " + DZ.multi.length + " elemento(s) seleccionado(s) — Ctrl+G agrupa · Shift suma · marco → contiene / marco ← toca");
  } else if (DZ.multi.length === 1) {
    const only = DZ.multi[0]; DZ.multi = []; dzSelect(only); dzSetStatus("1 elemento seleccionado");
  } else { dzDeselect(); dzSetStatus("Nada en el rango"); }
}

/* Dos planos de arte por nivel: Color siempre debajo y Línea encima. */
function dzArtEnsure(svg) {
  if (!svg) return null;
  let colour = svg.querySelector(':scope > g[data-low-art="colour"]');
  let line = svg.querySelector(':scope > g[data-low-art="line"]');
  let changed = false;
  if (!colour) { colour = document.createElementNS("http://www.w3.org/2000/svg", "g"); colour.setAttribute("data-low-art", "colour"); colour.setAttribute("aria-label", "Color"); changed = true; }
  if (!line) { line = document.createElementNS("http://www.w3.org/2000/svg", "g"); line.setAttribute("data-low-art", "line"); line.setAttribute("aria-label", "Línea"); changed = true; }
  if (!colour.parentNode) svg.appendChild(colour);
  if (!line.parentNode) svg.appendChild(line);
  [...svg.children].filter(n => n !== colour && n !== line && !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())
    && !dzIsCanvasBackground(n) && !(n.classList?.contains("dz-onion") || n.classList?.contains("dz-penui")))
    .forEach(n => { line.appendChild(n); changed = true; });
  if (colour.nextSibling !== line) svg.insertBefore(colour, line);
  return { colour, line, changed };
}
function dzArtHost(svg, mode) {
  const arts = dzArtEnsure(svg); if (!arts) return svg;
  if (!mode && DZ.activeLayer?.isConnected && svg.contains(DZ.activeLayer) &&
      DZ.activeLayer.tagName?.toLowerCase() === "g") return DZ.activeLayer;
  return (mode || DZ.artMode || "line") === "colour" ? arts.colour : arts.line;
}
function dzArtAppend(svg, el, mode) { dzArtHost(svg, mode).appendChild(el); return el; }
function dzLayerOf(el) {
  if (!el?.closest) return null;
  return el.matches?.('g[data-low-layer],g[data-low-art]') ? el :
    el.closest('g[data-low-layer],g[data-low-art]');
}
function dzArtSetMode(mode) {
  DZ.artMode = mode === "colour" ? "colour" : "line";
  const arts = dzArtEnsure($("#dzCanvas").querySelector(":scope > svg"));
  DZ.activeLayer = DZ.artMode === "colour" ? arts?.colour : arts?.line;
  if (arts?.changed) { dzMarkDirty(); dzBuildLayers(); }
  dzToolOptsRender(); dzSetStatus(DZ.artMode === "line" ? "Plano Línea activo — el contorno queda arriba" : "Plano Color activo — pintás debajo del contorno");
}
function dzArtMoveSelection(mode) {
  const svg = $("#dzCanvas").querySelector(":scope > svg"), pack = DZ.multi?.length > 1 ? DZ.multi.slice() : (DZ.sel ? [DZ.sel] : []);
  if (!svg || !pack.length) return dzSetStatus("Seleccioná uno o más elementos primero");
  dzSnapshot(); const host = dzArtHost(svg, mode); pack.forEach(n => host.appendChild(n));
  DZ.artMode = mode; dzMarkDirty(); dzBuildLayers(); dzPositionHandle(); dzToolOptsRender();
  dzSetStatus(pack.length + (mode === "line" ? " elemento(s) movidos a Línea" : " elemento(s) movidos a Color (debajo del contorno)"));
}

/* posición base de un elemento según su tipo (para mover con el mouse) */
function dzReadPos(el) {
  const T=LOW.drawing.transforms, consolidated=el.transform?.baseVal?.consolidate();
  const base=consolidated?T.multiply(T.identity(),consolidated.matrix):T.identity();
  const root=el.ownerSVGElement?.getScreenCTM?.(), parent=el.parentElement?.getScreenCTM?.();
  let rootToParent=T.identity();
  if(root&&parent) rootToParent=T.multiply(parent.inverse(),root);
  return { mode:"matrix", base, rootToParent };
}
function dzWritePos(el, base, dx, dy) {
  const T=LOW.drawing.transforms;
  el.setAttribute("transform",T.attr(T.rigidTranslate(base.base,{x:dx,y:dy},base.rootToParent)));
}

/* Tirador de escala único para cualquier elemento. El gesto se mide en pantalla
   y se aplica como una matriz rígida en el padre; así una forma ya rotada sigue
   al puntero y nunca cambia su geometría interna. Shift habilita escala libre. */
function dzHandleDown(e) {
  if (!DZ.sel) return;
  e.preventDefault(); e.stopPropagation();
  dzCapturePointer(e);
  const pointerId = e.pointerId;
  dzSnapshot();
  const el = DZ.sel;
  const T = LOW.drawing.transforms;
  const originalTransform = el.getAttribute("transform");
  const consolidated = el.transform?.baseVal?.consolidate();
  const base = consolidated ? T.multiply(T.identity(), consolidated.matrix) : T.identity();
  const start = { x:e.clientX, y:e.clientY };
  const bb = el.getBoundingClientRect();
  const w0 = Math.max(1, bb.right - bb.left), h0 = Math.max(1, bb.bottom - bb.top);
  const parentCTM = el.parentElement?.getScreenCTM?.();
  if (!parentCTM) return;
  const ap = el.ownerSVGElement.createSVGPoint(); ap.x = bb.left; ap.y = bb.top;
  const anchorParent = ap.matrixTransform(parentCTM.inverse());
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
    const deform = ev.shiftKey;
    let kx = Math.max(0.05, 1 + dx / w0), ky = Math.max(0.05, 1 + dy / h0);
    if (!deform) { const k = Math.max(0.05, Math.min(kx, ky)); kx = ky = k; }
    el.setAttribute("transform", T.attr(T.rigidScale(base, kx, ky, anchorParent)));
    dzPositionHandle();
  };
  const up = (ev) => {
    if (ev?.pointerId != null && ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    if (ev.type === "pointercancel") {
      if (originalTransform == null) el.removeAttribute("transform");
      else el.setAttribute("transform", originalTransform);
      dzPositionHandle();
      return;
    }
    dzBuildInspector(el); dzMarkDirty();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

function dzDeleteSelected() {
  if (!DZ.sel && !(DZ.multi || []).length) return;
  dzSnapshot();
  const activeWillDisappear = DZ.activeLayer &&
    ((DZ.multi || []).includes(DZ.activeLayer) || DZ.sel === DZ.activeLayer || DZ.sel?.contains?.(DZ.activeLayer));
  if ((DZ.multi || []).length > 1) { DZ.multi.forEach(n => n.remove()); DZ.multi = []; DZ.sel = null; }
  else if (DZ.sel) { DZ.sel.remove(); DZ.sel = null; }
  if (activeWillDisappear || !DZ.activeLayer?.isConnected) DZ.activeLayer = null;
  $("#dzHandle").hidden = true; $("#dzPin").hidden = true;
  const rot = $("#dzRotate"); if (rot) rot.hidden = true;
  $("#dzProps").hidden = true; $("#dzEmpty").hidden = false;
  dzMarkDirty(); dzBuildLayers();
}
function dzDeleteContext() {
  const rigNode = DZ.rigMode && DZ.rigSelectionSource === "rig" && dzRigSelectedNode();
  if (rigNode) {
    if (DZ.rigSubmode !== "build") {
      dzSetStatus(`«${rigNode.id}» es un hueso · pasá a Construir para eliminarlo sin borrar el dibujo`);
      return true;
    }
    dzRigRemoveSelected(); return true;
  }
  if (DZ.sel || (DZ.multi || []).length) {
    dzDeleteSelected(); return true;
  }
  return false;
}

/* ══ agrupar (Ctrl+G) / desagrupar (Ctrl+Shift+G): como Illustrator ══ */
function dzGroupSel(unwrap) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  if (unwrap) {
    const g = DZ.sel;
    if (!g || g.tagName.toLowerCase() !== "g") return dzSetStatus(" Seleccioná un grupo para desagrupar");
    dzSnapshot();
    const parent = g.parentNode;
    // si el grupo tiene transform, los hijos lo heredan individualmente
    const tr = g.getAttribute("transform");
    [...g.children].forEach(ch => {
      if (tr) ch.setAttribute("transform", tr + " " + (ch.getAttribute("transform") || ""));
      parent.insertBefore(ch, g);
    });
    g.remove(); DZ.sel = null;
    dzDeselect(); dzMarkDirty(); dzBuildLayers();
    dzSetStatus(" Desagrupado");
    return;
  }
  const pack = ((DZ.multi || []).length > 1 ? DZ.multi.slice() : (DZ.sel ? [DZ.sel] : []))
    .filter(n => n?.isConnected);
  if (pack.length < 2) return dzSetStatus(" Shift+clic para seleccionar varios elementos y agruparlos");
  const parents = [...new Set(pack.map(n => n.parentNode))];
  if (parents.length !== 1) return dzSetStatus("Mové los elementos a la misma capa antes de agruparlos");
  dzSnapshot();
  const g = document.createElementNS(SVGNS, "g");
  // el grupo nace donde está el elemento más al frente (mantiene el orden z)
  const parent = parents[0];
  const inDom = [...parent.children].filter(n => pack.includes(n));
  if (inDom.length < 2) return dzSetStatus("No encontré dos objetos agrupables en esta capa");
  parent.insertBefore(g, inDom[inDom.length - 1].nextSibling);
  inDom.forEach(n => { n.classList.remove("dz-msel"); g.appendChild(n); });
  // Una carpeta con nombre: un <g> anonimo en la lista es una fila muda que no
  // se puede buscar ni nombrar, y el panel se vuelve ilegible en cuanto hay
  // dos. Se numera segun cuantas carpetas haya ya, y el doble clic la renombra.
  if (!g.id) {
    const yaHay = svg.querySelectorAll('g[id^="grupo_"]').length;
    g.id = "grupo_" + (yaHay + 1);
  }
  DZ.multi = [];
  dzSelect(g); dzMarkDirty(); dzBuildLayers();
  dzSetStatus("Carpeta \u00ab" + g.id + "\u00bb con " + inDom.length +
    " elementos \u00b7 el tri\u00e1ngulo la pliega \u00b7 Ctrl+Shift+G desagrupa");
}

/* ══ importar imagen como referencia/calco (nivel de imagen de OpenToonz) ══ */
async function dzImportImage() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const r = await api.import_ref_image();
  if (!r || r.cancel) return;
  if (r.error) return sysMsg(" " + r.error);
  dzSnapshot();
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  const el = document.createElementNS(SVGNS, "image");
  el.setAttribute("href", r.data);
  el.setAttribute("x", vb[0] + vb[2] * 0.1); el.setAttribute("y", vb[1] + vb[3] * 0.1);
  el.setAttribute("width", Math.round(vb[2] * 0.8));
  el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  el.setAttribute("opacity", "0.5");                 // media transparencia: para calcar
  dzArtAppend(svg, el);
  dzSelect(el); dzMarkDirty(); dzBuildLayers();
  dzSetStatus("📷 " + (r.name || "imagen") + " importada al 50% de opacidad para calcar — subile la opacidad en el panel si la querés sólida");
}

/* ── rasterizado (Promise sobre window.rasterizeSVG que usa __raster) ── */
function dzRasterize(svgText, maxPx) {
  return new Promise((resolve, reject) => {
    try { window.rasterizeSVG(svgText, maxPx || 1024); } catch (e) { return reject(e); }
    let n = 0;
    const t = setInterval(() => {
      const r = window.__raster;
      if (r && r !== "PENDING") {
        clearInterval(t);
        if (typeof r === "string" && r.startsWith("data:image")) resolve(r);
        else reject(new Error(typeof r === "string" ? r.replace(/^ERR:/, "") : "raster falló"));
      } else if (++n > 100) { clearInterval(t); reject(new Error("timeout rasterizando")); }
    }, 80);
  });
}

/* ── modal simple para pedir un texto dentro del estudio de diseño ── */
function dzPromptModal(title, ph, def) {
  return new Promise(resolve => {
    openModal(`<h2>${title}</h2>
      <textarea id="dzPrIn" class="cmp-field" rows="3" spellcheck="false" placeholder="${(ph || "").replace(/"/g, "&quot;")}">${def || ""}</textarea>
      <div class="m-actions"><button class="ghost" id="dzPrX">Cancelar</button>
      <button class="primary" id="dzPrOk">Aceptar</button></div>`);
    setTimeout(() => { const i = $("#dzPrIn"); if (i) i.focus(); }, 30);
    $("#dzPrX").onclick = () => { closeModal(); resolve(null); };
    $("#dzPrOk").onclick = () => { const v = $("#dzPrIn").value.trim(); closeModal(); resolve(v); };
  });
}

/* ── Diálogos orgánicos (reemplazan a confirm()/alert() del navegador, que en
   pywebview salen como chrome del SO y rompen el diseño; el confirm() nativo
   además congela el renderer). Mismo lenguaje visual que dzPromptModal. ── */
/** Escape y el clic fuera cierran el modal por su cuenta, sin pasar por los
    botones: sin esto la promesa quedaba pendiente para siempre y el flujo que
    la esperaba se colgaba en silencio. Devuelve una funcion para soltar el
    vigia cuando el cierre SI viene de un boton. */
function dzModalDismiss(alCerrar) {
  const overlay = $("#overlay");
  if (!overlay) return () => {};
  const obs = new MutationObserver(() => { if (overlay.hidden) { obs.disconnect(); alCerrar(); } });
  obs.observe(overlay, { attributes: true, attributeFilter: ["hidden"] });
  return () => obs.disconnect();
}
function dzConfirmModal(mensaje, opts = {}) {
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const ok = opts.ok || "Aceptar", cancel = opts.cancel || "Cancelar";
  const primary = opts.danger ? "primary danger" : "primary";
  return new Promise(resolve => {
    openModal(`${opts.title ? `<h2>${esc(opts.title)}</h2>` : ""}
      <p class="m-msg">${esc(mensaje)}</p>
      <div class="m-actions"><button class="ghost" id="dzCfX">${esc(cancel)}</button>
      <button class="${primary}" id="dzCfOk">${esc(ok)}</button></div>`);
    setTimeout(() => { const b = $("#dzCfOk"); if (b) b.focus(); }, 30);
    const soltar = dzModalDismiss(() => resolve(false));
    $("#dzCfX").onclick = () => { soltar(); closeModal(); resolve(false); };
    $("#dzCfOk").onclick = () => { soltar(); closeModal(); resolve(true); };
  });
}

/* Aviso simple (reemplaza alert()): un solo botón, se puede esperar. */
function dzNotice(mensaje, title) {
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  return new Promise(resolve => {
    openModal(`${title ? `<h2>${esc(title)}</h2>` : ""}
      <p class="m-msg">${esc(mensaje)}</p>
      <div class="m-actions"><button class="primary" id="dzNoOk">Entendido</button></div>`);
    setTimeout(() => { const b = $("#dzNoOk"); if (b) b.focus(); }, 30);
    const soltar = dzModalDismiss(() => resolve());
    $("#dzNoOk").onclick = () => { soltar(); closeModal(); resolve(); };
  });
}

/* ── RECV-02 de la matriz ───────────────────────────────────────────────────
   Tras un cierre inesperado, el trabajo recuperable NO se carga ni se descarta
   en silencio: se ofrecen las tres salidas de la matriz —Recuperar, Comparar y
   Descartar— con la hora del punto y la última operación a la vista. Comparar
   muestra las dos versiones dibujadas, que es la única forma honesta de elegir.
   Cerrar el diálogo sin elegir CONSERVA el punto: cancelar no puede ser una
   manera silenciosa de perder trabajo.
   Devuelve "recover" | "discard" | "keep". */
function dzRecoveryDecide(path, discoSvg, recovery) {
  return new Promise(resolve => {
    const esc = t => String(t == null ? "" : t).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const meta = recovery.metadata || {};
    const cuando = new Date(recovery.savedAt || Date.now());
    const hora = isNaN(cuando) ? "hora desconocida" : cuando.toLocaleString();
    const kb = n => Math.max(1, Math.round((n || 0) / 1024)) + " KB";
    const detalle = [meta.op ? "última operación: " + meta.op : null,
      meta.frame ? "cuadro " + meta.frame : null,
      meta.tool ? "herramienta " + meta.tool : null].filter(Boolean).join(" · ");
    const nombre = dzDocumentTabName(path);
    let soltar = () => {};
    const terminar = valor => { soltar(); closeModal(); resolve(valor); };

    const acciones = `<div class="m-actions">
        <button class="ghost danger" id="dzRcDiscard">Descartar</button>
        <button class="ghost" id="dzRcCompare">Comparar</button>
        <button class="primary" id="dzRcRecover">Recuperar</button></div>`;

    const cablear = () => {
      soltar = dzModalDismiss(() => resolve("keep"));
      $("#dzRcRecover").onclick = () => terminar("recover");
      $("#dzRcDiscard").onclick = () => terminar("discard");
      const comparar = $("#dzRcCompare");
      if (comparar) comparar.onclick = () => { soltar(); pintarComparacion(); };
      const volver = $("#dzRcBack");
      if (volver) volver.onclick = () => { soltar(); pintarResumen(); };
    };

    const pintarResumen = () => {
      openModal(`<h2>Hay trabajo sin guardar</h2>
        <p class="m-msg">«${esc(nombre)}» tiene cambios que no llegaron al disco.
        Punto de recuperación del ${esc(hora)}${detalle ? " · " + esc(detalle) : ""}.</p>
        <p class="dz-rc-sizes">En disco ${esc(kb(discoSvg.length))} · recuperado ${esc(kb(recovery.content.length))}</p>
        ${acciones}`);
      cablear();
    };

    const pintarComparacion = () => {
      openModal(`<h2>Comparar versiones</h2>
        <div class="dz-rc-compare">
          <figure><figcaption>En disco · ${esc(kb(discoSvg.length))}</figcaption><div class="dz-rc-pane" id="dzRcDisk"></div></figure>
          <figure><figcaption>Recuperado · ${esc(hora)} · ${esc(kb(recovery.content.length))}</figcaption><div class="dz-rc-pane" id="dzRcMem"></div></figure>
        </div>
        <div class="m-actions">
          <button class="ghost" id="dzRcBack">Volver</button>
          <button class="ghost danger" id="dzRcDiscard">Descartar</button>
          <button class="primary" id="dzRcRecover">Recuperar</button></div>`);
      // Se dibujan de verdad las dos versiones: comparar tamaños no alcanza
      // para decidir cuál es el trabajo que uno quiere conservar.
      const pintar = (id, texto) => { const caja = $(id); if (caja) caja.innerHTML = texto; };
      pintar("#dzRcDisk", discoSvg);
      pintar("#dzRcMem", recovery.content);
      cablear();
    };

    pintarResumen();
  });
}

/* ── generar FONDO con IA y mandarlo al fondo del eje z ── */
async function dzGenBg() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return dzSetStatus("Abrí o creá un diseño primero");
  const prompt = await dzPromptModal("Generar fondo con IA",
    "describí el fondo (ej: cielo al atardecer con nubes suaves, estilo acuarela)");
  if (!prompt) return;
  dzSetStatus(" Generando fondo con IA…");
  const r = await api.gen_background(prompt, "1024x1024");
  if (!r || r.error) return dzSetStatus(" " + ((r && r.error) || "no se pudo generar el fondo"));
  dzSnapshot();
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  const el = document.createElementNS(SVGNS, "image");
  el.setAttribute("href", r.data);
  el.setAttribute("x", vb[0]); el.setAttribute("y", vb[1]);
  el.setAttribute("width", vb[2]); el.setAttribute("height", vb[3]);
  el.setAttribute("preserveAspectRatio", "xMidYMid slice");
  el.setAttribute("data-bg", "1");
  svg.insertBefore(el, svg.firstChild);        // AL FONDO del eje z (detrás de todo)
  dzMarkDirty(); dzBuildLayers();
  dzSetStatus(" Fondo generado y enviado al fondo del lienzo (eje z)" +
              (r.used ? " · " + r.used : ""));
}

/* ── vectorizar: raster (imagen importada/generada)  trazos SVG editables ── */
async function dzVectorize() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return dzSetStatus("Abrí o creá un diseño primero");
  // usar la imagen seleccionada, o la primera <image> del lienzo
  let img = (DZ.sel && DZ.sel.tagName && DZ.sel.tagName.toLowerCase() === "image")
    ? DZ.sel : svg.querySelector("image");
  let href;
  if (img) {
    href = img.getAttribute("href") ||
      img.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  } else {
    // no hay imagen en el lienzo  elegir un archivo (p.ej. el PNG que generó
    // el agente). Antes esto solo funcionaba con imágenes ya importadas.
    dzSetStatus("Elegí la imagen a vectorizar (el PNG generado, un boceto…)");
    const r = await api.import_ref_image();
    if (!r || r.cancel) return dzSetStatus("");
    if (r.error) return dzSetStatus(" " + r.error);
    href = r.data;
  }
  if (!href) return dzSetStatus("La imagen no tiene datos para vectorizar");
  openModal(`<h2>Calcar a vectores</h2>
    <div class="sub">Convierte la imagen en trazos SVG editables siguiendo sus
    líneas y colores. «Líneas» calca solo el trazo (tinta) — ideal para bocetos,
    line-art y dibujos complejos; «Color» arma formas planas por color, como un
    póster serigrafiado.</div>
    <div class="krow"><label>Modo</label>
      <select id="vzMode" class="langsel">
        <option value="contorno" selected>Contorno (animación) — trazos largos y unificados, sin puntitos</option>
        <option value="lineas">Líneas — sigue el trazo del dibujo (tinta)</option>
        <option value="color">Color — formas planas por color</option>
      </select>
      <label class="soc-l2">Detalle</label>
      <select id="vzDetail" class="langsel">
        <option value="low">Bajo (simple)</option>
        <option value="medium">Medio</option>
        <option value="high" selected>Alto (complejo)</option>
      </select></div>
    <div class="krow"><label>Fondo</label>
      <label class="agchk"><input type="checkbox" id="vzBg" checked>
        quitar el fondo antes de calcar (detecta el color de las esquinas,
        como la varita mágica de Photoshop)</label></div>
    <div class="krow"><label>Tolerancia</label>
      <input type="range" id="vzTol" min="4" max="96" value="32" style="flex:1"
        title="Cuánto puede variar el color del fondo para ser eliminado">
      <span class="dz-hint" id="vzTolLbl">32</span></div>
    <div class="krow"><label>Referencia</label>
      <label class="agchk"><input type="checkbox" id="vzKeep">
        conservar la imagen original debajo (semitransparente, para seguir
        calcando encima)</label></div>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="vzGo">Calcar</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  $("#vzTol").oninput = e => { $("#vzTolLbl").textContent = e.target.value; };
  $("#vzGo").onclick = async () => {
    const mode = $("#vzMode").value, detail = $("#vzDetail").value;
    const rmBg = $("#vzBg").checked, tol = +$("#vzTol").value;
    const keep = $("#vzKeep").checked;
    closeModal();
    dzSetStatus(mode === "lineas"
      ? "🖋 Calcando las líneas del dibujo…"
      : "🖋 Calcando la imagen a formas de color…");
    const r = await api.vectorize_image(href, detail, mode, rmBg, tol);
    if (!r || r.error) return dzSetStatus(" " + ((r && r.error) || "no se pudo vectorizar"));
    let traced;
    try { traced = new DOMParser().parseFromString(r.svg, "image/svg+xml").querySelector("svg"); }
    catch (e) { return dzSetStatus(" el vectorizador devolvió SVG inválido"); }
    if (!traced) return dzSetStatus(" el vectorizador no devolvió SVG");
    const tw = parseFloat(traced.getAttribute("width")) || 512;
    const th = parseFloat(traced.getAttribute("height")) || 512;
    const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
    // si hay imagen fuente, calcar sobre su marco; si no (PNG generado), encajar
    // el calco en el lienzo manteniendo proporción
    let ix, iy, iw, ih;
    if (img) {
      ix = parseFloat(img.getAttribute("x")) || 0; iy = parseFloat(img.getAttribute("y")) || 0;
      iw = parseFloat(img.getAttribute("width")) || tw;
      ih = parseFloat(img.getAttribute("height")) || (iw * th / tw);
    } else {
      const k = Math.min((vb[2] || 1080) / tw, (vb[3] || 1080) / th);
      iw = tw * k; ih = th * k;
      ix = (vb[0] || 0) + ((vb[2] || 1080) - iw) / 2;
      iy = (vb[1] || 0) + ((vb[3] || 1080) - ih) / 2;
    }
    dzSnapshot();
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("transform", `translate(${ix} ${iy}) scale(${iw / tw} ${ih / th})`);
    [...traced.childNodes].forEach(n => {
      if (n.nodeType === 1 && n.tagName.toLowerCase() !== "title")
        g.appendChild(document.importNode(n, true));
    });
    if (img) {
      img.parentNode.insertBefore(g, img.nextSibling);
      if (keep) img.setAttribute("opacity", "0.35");   // queda de referencia para calcar
      else img.remove();
    } else {
      svg.appendChild(g);
    }
    dzSelect(g); dzMarkDirty(); dzBuildLayers();
    const n = g.querySelectorAll("path").length;
    dzSetStatus(`🖋 Calco listo: ${n} trazo${n === 1 ? "" : "s"} editable${n === 1 ? "" : "s"}` +
      (keep ? " — la imagen quedó debajo como referencia" : " (reemplazó la imagen)"));
  };
}

/* ── coloreado inteligente / entintado con IA (FLUX Kontext / SiliconFlow) ── */
async function dzColorize() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return dzSetStatus("Abrí o creá un diseño primero");
  const style = await dzPromptModal("Coloreado inteligente (IA)",
    "estilo/paleta (opcional): ej 'colores planos estilo anime, piel cálida, sombreado suave'", "");
  if (style === null) return;
  dzSetStatus(" Rasterizando el lienzo…");
  let png;
  try { png = await dzRasterize(svg.outerHTML, 1280); }
  catch (e) { return dzSetStatus(" No pude rasterizar el lienzo: " + (e.message || e)); }
  dzSetStatus(" Coloreando con IA… (puede tardar)");
  const r = await api.ai_colorize(png, style);
  if (!r || r.error) return dzSetStatus(" " + ((r && r.error) || "no se pudo colorear"));
  dzSnapshot();
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  const el = document.createElementNS(SVGNS, "image");
  el.setAttribute("href", r.data);
  el.setAttribute("x", vb[0]); el.setAttribute("y", vb[1]);
  el.setAttribute("width", vb[2]); el.setAttribute("height", vb[3]);
  el.setAttribute("preserveAspectRatio", "xMidYMid meet");
  el.setAttribute("data-colorized", "1");
  dzArtAppend(svg, el, "colour");             // capa nueva arriba del plano de color
  dzSelect(el); dzMarkDirty(); dzBuildLayers();
  dzSetStatus(" Coloreado con " + (r.used || "IA") +
              " — quedó como capa nueva arriba (movéla, bajale opacidad o borrala)");
}

/* ── paletas profesionales + armonías de color ── */
const DZ_PAL_PRESETS = {
  "Piel (skin tones)": ["#3B2219", "#6E4B3A", "#9C6B4E", "#C68A63", "#E3B18C", "#F3D3B5", "#FBE8D3"],
  "Flat UI": ["#1ABC9C", "#2ECC71", "#3498DB", "#9B59B6", "#34495E", "#F1C40F", "#E67E22", "#E74C3C"],
  "Pastel": ["#FFB5B5", "#FFD8A8", "#FFF3B0", "#C8E7C8", "#B5D8EB", "#D3C0EB", "#F5D0E8"],
  "Material": ["#F44336", "#E91E63", "#9C27B0", "#3F51B5", "#2196F3", "#009688", "#4CAF50", "#FFC107", "#FF9800"],
  "Cine (teal/orange)": ["#0B1A2A", "#123A4B", "#1E6F76", "#2AA198", "#E8A15A", "#D9722B", "#8C3B18"],
  "Tierra (earth)": ["#2E2A20", "#5B4636", "#8A6E4B", "#B49266", "#7A8B5A", "#4E6151", "#C9B79C"],
  "Neón": ["#0D0221", "#FF2A6D", "#FF6AC1", "#05D9E8", "#39FF14", "#F9F871", "#B967FF"],
  "Escala de grises": ["#111111", "#333333", "#555555", "#777777", "#999999", "#BBBBBB", "#DDDDDD", "#FFFFFF"],
};
function dzHexToHsl(hex) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || "");
  if (!m) return null;
  let r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0, l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
function dzHslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x]; else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  const H = v => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return "#" + H(r) + H(g) + H(b);
}
function dzHarmonies(hex) {
  const hsl = dzHexToHsl(hex); if (!hsl) return [];
  const [h, s, l] = hsl;
  return [
    hex,
    dzHslToHex(h + 180, s, l),                        // complementario
    dzHslToHex(h + 30, s, l), dzHslToHex(h - 30, s, l), // análogos
    dzHslToHex(h + 120, s, l), dzHslToHex(h + 240, s, l), // tríada
    dzHslToHex(h, s, Math.min(0.92, l + 0.18)),        // tinte
    dzHslToHex(h, s, Math.max(0.08, l - 0.18)),        // sombra
  ];
}
function dzSwatchRow(colors) {
  return '<div class="dz-prow">' + colors.map(c =>
    `<span class="dz-psw" data-c="${c}" style="background:${c}" title="${c}"></span>`).join("") + "</div>";
}
function dzPalettePro() {
  const cur = ($("#dzPFill") && $("#dzPFill").value) || "#E5322D";
  let html = `<h2>Paletas profesionales</h2>
    <div class="sub">Clic en un color = agregarlo a la paleta del proyecto (y aplicarlo al relleno).</div>
    <h3 style="margin:10px 0 4px;font-size:12px">Armonías de tu relleno (${cur})</h3>
    ${dzSwatchRow(dzHarmonies(cur))}`;
  for (const [name, cols] of Object.entries(DZ_PAL_PRESETS)) {
    html += `<h3 style="margin:10px 0 4px;font-size:12px">${name}</h3>${dzSwatchRow(cols)}`;
  }
  html += `<div class="m-actions"><button class="ghost" id="dzPalX">Cerrar</button></div>`;
  openModal(html);
  document.querySelectorAll("#modal .dz-psw").forEach(sw => {
    sw.onclick = () => {
      const c = sw.dataset.c;
      const pal = dzPaletteLoad();
      if (!pal.includes(c)) { pal.push(c); dzPaletteSave(pal); dzPaletteRender(); }
      DZ.fillColor = c; if ($("#dzPFill")) $("#dzPFill").value = c;
      dzStyleApply("fill", c);
    };
  });
  $("#dzPalX").onclick = closeModal;
}

/* ══ panel de estilo (relleno/trazo/grosor/opacidad) + paleta del proyecto ══ */
function dzStyleApply(attr, val) {
  const pack = (DZ.multi || []).length > 1 ? DZ.multi : (DZ.sel ? [DZ.sel] : []);
  if (!pack.length) return false;
  dzSnapshot();
  pack.forEach(n => n.setAttribute(attr, val));
  dzMarkDirty(); dzBuildLayers();
  return true;
}
function dzStyleSync(el) {
  // reflejar el estilo del elemento seleccionado en el panel
  const f = $("#dzPFill"), st = $("#dzPStroke"), w = $("#dzDrawW"), op = $("#dzOpacity");
  if (!f) return;
  const cs = getComputedStyle(el);
  const fill = dzHex(el.getAttribute("fill") || cs.fill);
  const stroke = dzHex(el.getAttribute("stroke") || cs.stroke);
  if (fill) f.value = fill;
  if (stroke) st.value = stroke;
  const sw = parseFloat(el.getAttribute("stroke-width") || cs.strokeWidth);
  if (sw) w.value = Math.round(sw);
  const o = el.getAttribute("opacity");
  op.value = o === null ? 100 : Math.round(parseFloat(o) * 100);
  $("#dzOpacityLbl").textContent = op.value + "%";
}
function dzPaletteKey() { return "low.palette." + (S.ws || "global"); }
function dzPaletteLoad() {
  try { return JSON.parse(dzPrefsStorage().getItem(dzPaletteKey()) || "[]"); }
  catch (e) { return []; }
}
function dzPaletteSave(p) {
  try { dzPrefsStorage().setItem(dzPaletteKey(), JSON.stringify(p.slice(0, 24))); } catch (e) { /* */ }
}
function dzPaletteRender() {
  const box = $("#dzPalette");
  if (!box) return;
  // Con la escena abierta, el panel muestra la PALETA DE LA ESCENA: estilos
  // numerados que gobiernan el color de los dibujos. El tacho de colores de
  // antes sigue existiendo para cuando se edita un SVG suelto, sin animacion:
  // ahi no hay escena de la cual sacar una paleta.
  if (DZ.doc && LOW.animation && LOW.animation.PaletteView && dzPalMount()) return;
  const pal = dzPaletteLoad();
  box.innerHTML = "";
  pal.forEach((c, i) => {
    const s = document.createElement("span");
    s.className = "dz-sw"; s.style.background = c; s.title = c;
    s.onclick = (e) => {
      if (e.shiftKey) { DZ.drawColor = c; $("#dzPStroke").value = c; dzStyleApply("stroke", c); }
      else { DZ.fillColor = c; $("#dzPFill").value = c; dzStyleApply("fill", c); }
    };
    s.oncontextmenu = (e) => { e.preventDefault(); pal.splice(i, 1); dzPaletteSave(pal); dzPaletteRender(); };
    box.appendChild(s);
  });
  const add = document.createElement("span");
  add.className = "dz-sw dz-sw-add"; add.textContent = "+";
  add.title = "Guardar el relleno actual en la paleta del proyecto";
  add.onclick = () => {
    const c = $("#dzPFill").value;
    if (!pal.includes(c)) { pal.push(c); dzPaletteSave(pal); dzPaletteRender(); }
  };
  box.appendChild(add);
  // acceso a paletas profesionales + armonías de color
  const pro = document.createElement("span");
  pro.className = "dz-sw dz-sw-pro"; pro.textContent = "";
  pro.title = "Paletas profesionales y armonías de color";
  pro.onclick = dzPalettePro;
  box.appendChild(pro);
}
let DZ_RECOVERY_TIMER = null;
let DZ_DOC_TIMER = null;
function dzMarkDirty() {
  DZ.dirty = true;
  const tab = dzDocumentTabCurrent(); if (tab) { tab.dirty = true; dzDocumentTabsRender(); }
  // Toda edición del lienzo entra al DIBUJO del modelo. Antes solo se volcaba
  // al cambiar de frame: si dibujabas y guardabas sin moverte, ese trazo no
  // llegaba nunca al documento. Con retardo, para no serializar el SVG en cada
  // punto de un trazo.
  clearTimeout(DZ_DOC_TIMER);
  DZ_DOC_TIMER = setTimeout(() => { if (DZ.doc) dzDocCommit(); }, 260);
  clearTimeout(DZ_RECOVERY_TIMER);
  DZ_RECOVERY_TIMER = setTimeout(() => {
    const svg = $("#dzCanvas")?.querySelector(":scope > svg");
    if (svg && DZ.path) window.LOW?.workspace?.recovery?.checkpoint(DZ.path, dzSerialize(svg), {
      frame: DZ.anim ? DZ.anim.idx + 1 : null, tool: DZ.tool || "select"
    });
  }, 320);
}

/* duplicar el elemento seleccionado (con un pequeño corrimiento para verlo) */
function dzDuplicate() {
  if (!DZ.sel) return;
  dzSnapshot();
  const c = DZ.sel.cloneNode(true);
  c.classList.remove("dz-sel");
  if (!c.getAttribute("class")) c.removeAttribute("class");
  DZ.sel.parentNode.insertBefore(c, DZ.sel.nextSibling);
  dzWritePos(c, dzReadPos(c), 20, 20);
  dzSelect(c); dzMarkDirty();
}

/* ══ herramientas de dibujo: lápiz , pincel 🖌 (presión de tableta), pluma 🖋 ══
   Usan Pointer Events: una tableta Huion (Windows Ink) manda pointerType "pen"
   con e.pressure real  el pincel modula el grosor con la presión. */
const SVGNS = "http://www.w3.org/2000/svg";
let DRAW = null;   // trazo a mano alzada en curso
let PEN = null;    // pluma vectorial en curso
let RULER = null;  // regla/hilo: {a:{x,y}, el:SVGLineElement|null, vp:[{x,y}]} puntos de fuga
let GUIDE_LINE = null; // Elemento SVG para la guía visual (línea punteada)
let GUIDE_SNAP_ANGLE = null; // Ángulo al que se está snappeando
let GUIDE_ACTIVE = false; // Si hay una guía activa

// Configuración de guías: ángulos permitidos (en grados) y umbral de detección
const GUIDE_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];
const GUIDE_THRESHOLD = 5; // Grados de tolerancia para activar la guía
const GUIDE_COLOR = "#FF5722"; // Color de la guía
const GUIDE_OPACITY = 0.5; // Opacidad de la guía

// select/direct  "" para que gane el CSS (flecha negra / flecha blanca);
// nodes usa la flecha blanca también (edita puntos de vector)
// lápiz/pincel/pluma = cursor de PUNTO (la mano queda solo para navegar:
// espacio mantenido, botón medio y clic derecho)
const DZ_DOT_CURSOR = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 18 18'%3E%3Ccircle cx='9' cy='9' r='5.5' fill='none' stroke='%23111' stroke-width='1.4'/%3E%3Ccircle cx='9' cy='9' r='1.6' fill='%23111'/%3E%3C/svg%3E\") 9 9, crosshair";
const DZ_CURSORS = { select: "", direct: "", nodes: "", eraser: "cell",
                     dropper: "copy", bucket: "pointer", hand: "grab",
                     pencil: DZ_DOT_CURSOR, brush: DZ_DOT_CURSOR, pen: DZ_DOT_CURSOR,
                     pivot: "crosshair", ruler: "crosshair",
                      inflator: "cell", handler: "ew-resize", iron: "default",
                      pliers: "crosshair", magnet: "cell" };
const DZ_TOOL_CURSOR_ICONS = {
  pencil: "i-pencil", brush: "i-brush", pen: "i-pennib", eraser: "i-eraser",
  dropper: "i-dropper", bucket: "i-bucket", nodes: "i-nodes", ruler: "i-ruler",
  pivot: "i-pivot", inflator: "i-inflate", handler: "i-contour",
  iron: "i-iron", pliers: "i-cut", magnet: "i-magnet"
};

// Función para calcular el ángulo entre dos puntos (en grados)
function _calculateAngle(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angleRad = Math.atan2(dy, dx);
  return (angleRad * 180 / Math.PI + 360) % 360;
}

// Función para encontrar el ángulo más cercano en GUIDE_ANGLES
function _findClosestGuideAngle(angle) {
  let closestAngle = null;
  let minDiff = Infinity;
  for (const guideAngle of GUIDE_ANGLES) {
    const diff = Math.min(Math.abs(angle - guideAngle), 360 - Math.abs(angle - guideAngle));
    if (diff < minDiff) {
      minDiff = diff;
      closestAngle = guideAngle;
    }
  }
  return { angle: closestAngle, diff: minDiff };
}

// Función para mostrar la guía visual
function _showGuideLine(svg, x1, y1, x2, y2, angle) {
  _hideGuideLine();
  GUIDE_LINE = document.createElementNS(SVGNS, "line");
  GUIDE_LINE.setAttribute("x1", x1.toFixed(1));
  GUIDE_LINE.setAttribute("y1", y1.toFixed(1));
  GUIDE_LINE.setAttribute("x2", x2.toFixed(1));
  GUIDE_LINE.setAttribute("y2", y2.toFixed(1));
  GUIDE_LINE.setAttribute("stroke", GUIDE_COLOR);
  GUIDE_LINE.setAttribute("stroke-width", "1");
  GUIDE_LINE.setAttribute("stroke-dasharray", "5,5");
  GUIDE_LINE.setAttribute("opacity", GUIDE_OPACITY);
  GUIDE_LINE.setAttribute("class", "dz-guide-line");
  GUIDE_LINE.setAttribute("data-angle", angle);
  svg.appendChild(GUIDE_LINE);
  GUIDE_ACTIVE = true;
  GUIDE_SNAP_ANGLE = angle;
}

// Función para ocultar la guía visual
function _hideGuideLine() {
  if (GUIDE_LINE) {
    GUIDE_LINE.remove();
    GUIDE_LINE = null;
  }
  GUIDE_ACTIVE = false;
  GUIDE_SNAP_ANGLE = null;
}

// Función para calcular el punto final ajustado a la guía
function _snapToGuide(startX, startY, currentX, currentY, angle) {
  const angleRad = angle * Math.PI / 180;
  const dx = currentX - startX;
  const dy = currentY - startY;
  const length = Math.hypot(dx, dy);
  const snappedX = startX + length * Math.cos(angleRad);
  const snappedY = startY + length * Math.sin(angleRad);
  return { x: snappedX, y: snappedY };
}

function dzToolCursorHide() {
  const cursor = $("#dzToolCursor");
  if (cursor) cursor.hidden = true;
}
function dzToolCursorMove(e) {
  const tool = DZ.tool || "select";
  const icon = DZ_TOOL_CURSOR_ICONS[tool];
  const cursor = $("#dzToolCursor"), cv = $("#dzCanvas");
  // En Pivotes el esqueleto es un overlay interactivo. Considerarlo un panel
  // ocultaba el cursor propio mientras el CSS también ocultaba el nativo:
  // resultado, el puntero desaparecía justo al intentar colocar el eje.
  const overRigPivot = tool === "pivot" && DZ.rigMode && e.target?.closest?.("#dzRigOverlay");
  if (!cursor || !cv || !icon || (dzOnUiPanel(e) && !overRigPivot)) { dzToolCursorHide(); return; }
  const rect = cv.getBoundingClientRect();
  cursor.style.left = (e.clientX - rect.left + cv.scrollLeft) + "px";
  cursor.style.top = (e.clientY - rect.top + cv.scrollTop) + "px";
  const pressure = e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 1;
  const brushSize = tool === "brush" ? (DZ.drawW || 6) * pressure * (DZ.zoom || 1) :
                    tool === "pencil" ? Math.max(1, (DZ.drawW || 2) * .55 * (DZ.zoom || 1)) : 10;
  cursor.style.setProperty("--tool-size", Math.max(8, Math.min(18, brushSize)) + "px");
  cursor.dataset.tool = tool;
  const use = $("#dzToolCursorUse");
  if (use) { use.setAttribute("href", "#" + icon); use.setAttribute("xlink:href", "#" + icon); }
  cursor.hidden = false;
}
/* ══  Diagnóstico de tableta: registra el flujo REAL de pointer events
   (tipo · pointerId · pointerType · botones · presión · Δpx · Δms) en un panel
   en vivo, para ver qué emite la Huion de verdad en vez de suponerlo. ══ */
function dzPenDebugToggle() {
  DZ.penDebug = !DZ.penDebug;
  let panel = $("#dzPenDbg");
  if (!DZ.penDebug) {
    if (DZ._penDbgFn) {
      document.removeEventListener("pointerdown", DZ._penDbgFn, true);
      document.removeEventListener("pointermove", DZ._penDbgFn, true);
      document.removeEventListener("pointerup", DZ._penDbgFn, true);
      document.removeEventListener("pointercancel", DZ._penDbgFn, true);
      DZ._penDbgFn = null;
    }
    if (DZ._penDbgRawFn) {
      $("#dzCanvas").removeEventListener("pointerrawupdate", DZ._penDbgRawFn);
      DZ._penDbgRawFn = null;
    }
    if (panel) panel.remove();
    dzSetStatus(" Diagnóstico de tableta OFF");
    return;
  }
  panel = document.createElement("div");
  panel.id = "dzPenDbg"; panel.className = "dz-pendbg";
  panel.innerHTML = '<div class="dz-pendbg-h"> tableta — hacé UNA línea y sacá captura <span style="cursor:pointer;float:right;opacity:.7" title="Abrir diagnóstico completo en navegador" onclick="try{api.open_tablet_diag()}catch(e){}">🔗 externo</span></div><div id="dzPenDbgLog"></div>';
  $("#dzCanvas").appendChild(panel);
  const log = $("#dzPenDbgLog");
  let lastT = 0, lastX = 0, lastY = 0, cnt = { down: 0, move: 0, up: 0, cancel: 0, raw: 0 }, buf = [];
  const addRow = (text, color) => {
    const row = document.createElement("div"); row.textContent = text;
    if (color) row.style.color = color;
    log.appendChild(row);
    while (log.childElementCount > 50) log.firstChild.remove();
    $(".dz-pendbg-h").textContent = ` down:${cnt.down} move:${cnt.move} raw:${cnt.raw} up:${cnt.up} cancel:${cnt.cancel||0}`;
  };
  DZ._penDbgFn = (e) => {
    const cv = $("#dzCanvas");
    const onCanvas = cv.contains(e.target) || e.target === cv;
    const t = performance.now();
    const dt = lastT ? Math.round(t - lastT) : 0; lastT = t;
    const dx = Math.round(e.clientX - lastX), dy = Math.round(e.clientY - lastY);
    lastX = e.clientX; lastY = e.clientY;
    const k = e.type.replace("pointer", "");
    cnt[k] = (cnt[k] || 0) + 1;
    const co = (e.getCoalescedEvents && e.getCoalescedEvents().length) || 0;
    const pr = (e.pressure != null) ? e.pressure.toFixed(3) : "-";
    const onCv = onCanvas ? "" : "";
    const line = `${onCv} ${k.padEnd(5)} id${e.pointerId} ${e.pointerType[0]} btn:${e.button} btns:${e.buttons} pr:${pr} tw:${(e.tiltX||0).toFixed(1)} Δ${dx},${dy} ${dt}ms${co?(" c"+co):""}`;
    let color = null;
    if (k === "down") color = "#33B5E8";
    if (k === "up" || k === "cancel") { color = "#F0450E"; try { api.save_tablet_log && api.save_tablet_log(buf.join('\n')); } catch(e){} }
    if (!onCanvas) color = "#666";
    addRow(line, color);
    buf.push(line);
    if (buf.length % 50 === 0) { try { api.save_tablet_log && api.save_tablet_log(buf.join('\n')); } catch(e){} }
    try { api.log_js && api.log_js("[pen] " + line); } catch (err) { /* */ }
  };
  DZ._penDbgRawFn = (e) => {
    cnt.raw = (cnt.raw || 0) + 1;
    const pr = (e.pressure != null) ? e.pressure.toFixed(3) : "-";
    const line = ` raw     id${e.pointerId} ${e.pointerType[0]} btns:${e.buttons} pr:${pr} tw:${(e.tiltX||0).toFixed(1)}`;
    buf.push(line);
    if (buf.length % 50 === 0) { try { api.save_tablet_log && api.save_tablet_log(buf.join('\n')); } catch(e){} }
    addRow(line, "#FFA000");
  };
  document.addEventListener("pointerdown", DZ._penDbgFn, true);
  document.addEventListener("pointermove", DZ._penDbgFn, true);
  document.addEventListener("pointerup", DZ._penDbgFn, true);
  document.addEventListener("pointercancel", DZ._penDbgFn, true);
  $("#dzCanvas").addEventListener("pointerrawupdate", DZ._penDbgRawFn);
  dzSetStatus(" Diagnóstico ON — elegí Pincel, hacé UNA línea y mandame la captura del panel");
}

function dzSetTool(t) {
  if (t !== DZ.tool) dzVectorGestureCancel("tool-change");
  if (t !== "shape" && typeof dzFormaCancelar === "function") dzFormaCancelar("tool-change");
  if (DRAW_TRACK) _drawFinish();
  if (RULER && t !== "ruler") dzRulerClear();
  DZ.tool = t;
  document.querySelectorAll(".dz-toolbtn").forEach(b =>
    b.classList.toggle("active", b.dataset.tool === t));
  const cv = $("#dzCanvas");
  cv.style.cursor = (t in DZ_CURSORS) ? DZ_CURSORS[t] : "crosshair";
  cv.dataset.tool = t;          // el CSS decide el cursor de los hijos del svg
  cv.classList.toggle("tool-cursor-active", !!DZ_TOOL_CURSOR_ICONS[t]);
  dzToolCursorHide();
  if (PEN && t !== "pen") dzPenFinish(true);
  if (t !== "nodes") dzNodesClear();
  // el gotero/balde/nodos trabajan SOBRE la selección o eligiendo elemento: no deseleccionar
  // Las herramientas de edición vectorial trabajan sobre la selección actual.
  // Antes Inflador borraba la selección al activarse y después exigía una:
  // quedaba inutilizable por diseño. Conservamos la selección en toda la mesa.
  if (!["select", "direct", "nodes", "dropper", "bucket", "inflator", "handler",
        "iron", "pliers", "magnet"].includes(t)) dzDeselect();
  dzSbTool(); dzToolOptsRender();
  dz3dApplyToolClass();         // 🔒 solo el plano activo recibe eventos en modo dibujo
  // Si se elige una herramienta desde la barra principal mientras se arma el
  // rig, el overlay debe ceder el puntero. Antes el icono cambiaba pero los
  // agarres invisibles del esqueleto seguían capturando mouse/tableta.
  if (!DZ.rigToolSync && DZ.rigMode && (DZ.rigSubmode || "build") === "build") {
    const rigTool = ({ pencil:"draw", brush:"draw", pen:"draw", eraser:"draw",
      bucket:"draw", iron:"draw", magnet:"draw", pliers:"cut", pivot:"pivot" })[t];
    if (rigTool && DZ.rigTool !== rigTool) dzRigAdoptCanvasTool(rigTool);
  }
}
function dzSwapPaint() {
  const fill = DZ.fillColor || $("#dzPFill")?.value || "#E5322D";
  const stroke = DZ.drawColor || $("#dzPStroke")?.value || "#1a1a1a";
  DZ.fillColor = stroke; DZ.drawColor = fill;
  if ($("#dzPFill")) $("#dzPFill").value = stroke;
  if ($("#dzPStroke")) $("#dzPStroke").value = fill;
  if ($("#toFill")) $("#toFill").value = stroke;
  if ($("#toColor")) $("#toColor").value = fill;
  const pack = (DZ.multi || []).length > 1 ? DZ.multi : (DZ.sel ? [DZ.sel] : []);
  if (pack.length) {
    dzSnapshot();
    pack.forEach(el => {
      const f = el.getAttribute("fill") || "none", s = el.getAttribute("stroke") || "none";
      el.setAttribute("fill", s); el.setAttribute("stroke", f);
    });
    dzMarkDirty(); dzBuildLayers(); dzStyleSync(DZ.sel);
  }
  dzSetStatus("Relleno y contorno intercambiados · Shift+X");
}
/* los clics del lienzo hacen preventDefault (para dibujar/arrastrar), y eso
   BLOQUEA el cambio de foco: si venías de escribir en el chat del dock, el
   foco quedaba preso en el textarea y los atajos "no andaban" (tipeabas al
   chat). Soltarlo explícitamente al tocar el lienzo. */
function dzReleaseFocus() {
  const a = document.activeElement;
  if (a && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(a.tagName)) a.blur();
}

/* ── presión suavizada: buffer circular de las últimas N muestras.
   OpenToonz usa un track continuo con presión por punto (TThickPoint);
   en la web la presión puede fluctuar frame a frame  media móvil.
   Aplica curva gamma de sensibilidad (OpenToonz V_BrushPressureSensitivity). ── */
function dzSmoothPressure(pr, track) {
  if (!track) return pr || 0.5;
  if (!track._pbuf) track._pbuf = [];
  const BUF = 5;
  const clamped = Math.max(0.03, pr || 0.03);
  track._pbuf.push(clamped);
  if (track._pbuf.length > BUF) track._pbuf.shift();
  let s = 0; for (let i = 0; i < track._pbuf.length; i++) s += track._pbuf[i];
  const avg = s / track._pbuf.length;
  const gamma = DZ.pressureGamma !== undefined ? DZ.pressureGamma : 0.85;
  return Math.pow(avg, gamma);
}

function dzCurrentBrush() {
  return window.LOW?.drawing?.brushes?.get?.(DZ.brushPreset || "") || null;
}


/* ═══════════════════════════════════════════════════════════════════════
   SISTEMA DE DIBUJO — v5 (v3.17.7)
   ═══════════════════════════════════════════════════════════════════════
   Un solo track activo. Sin máquinas de estado, sin stitching con timeout.
   Principio: acumular todos los puntos y renderizar. El post-procesado
   (Ramer-Douglas-Peucker + Catmull-Rom) limpia el ruido después.
   
   pointerdown con pointerType==="pen"  SIEMPRE inicia trazo.
   El navegador solo dispara pointerdown con contacto real (spec).
   La presión solo afecta el GROSOR del trazo, no si se dibuja o no.
   ═══════════════════════════════════════════════════════════════════════ */

function _dzDiag(msg, color) {
  const log = $("#dzPenDbgLog");
  if (log) {
    const row = document.createElement("div"); row.textContent = msg;
    if (color) row.style.color = color;
    log.appendChild(row);
    while (log.childElementCount > 60) log.firstChild.remove();
  }
  console.log("[LOW:draw]", msg);
}

let DRAW_TRACK = null;   // UN solo track: { pts, mode, el, pid, devType, _pbuf }
const DZPointerController = window.LOW?.input?.pointerController || null;

function _otDevType(e) {
  if (e.pointerType === "pen") return "pen";
  if (e.pointerType === "eraser") return "eraser";
  return "mouse";
}

function _otPressure(e) {
  if ((e.pointerType === "pen" || e.pointerType === "eraser") && e.pressure != null) {
    const min = Math.max(0, Math.min(.95, DZ.pressureMin || 0));
    const max = Math.max(min + .05, Math.min(1, DZ.pressureMax || 1));
    return Math.max(0, Math.min(1, (e.pressure - min) / (max - min)));
  }
  return 1; // mouse: ancho completo; 0.5 es un valor sintético de Pointer Events
}

function _drawAddPoint(track, x, y, pr, meta = null) {
  const last = track.pts[track.pts.length - 1];
  if (track.stabilizer) {
    const stable = track.stabilizer.push({ x, y, pressure: pr || .03 });
    if (!stable) return false;
    x = stable.x; y = stable.y; pr = stable.pressure;
  }
  const dx = x - last[0], dy = y - last[1];
  const d2 = dx * dx + dy * dy;
  // Solo descartar puntos idénticos (mismo pixel). Todo lo demás se dibuja.
  if (d2 < 0.01) return false;
  const smPr = dzSmoothPressure(pr, track);
  
  // Detección de guías para líneas rectas (con Shift)
  if (track.shiftPressed && track.pts.length === 1) {
    const angle = _calculateAngle(track.startX, track.startY, x, y);
    const { angle: closestAngle, diff } = _findClosestGuideAngle(angle);
    if (diff <= GUIDE_THRESHOLD) {
      const svg = track.el.parentNode;
      if (svg) {
        const snapped = _snapToGuide(track.startX, track.startY, x, y, closestAngle);
        _showGuideLine(svg, track.startX, track.startY, snapped.x, snapped.y, closestAngle);
        x = snapped.x;
        y = snapped.y;
      }
    } else {
      _hideGuideLine();
    }
  }
  
  track.pts.push([x, y, smPr, meta?.tiltX || 0, meta?.tiltY || 0, meta?.twist || 0, meta?.timeStamp || performance.now()]);
  if (track.mode !== "pencil") {
    const seg = document.createElementNS(SVGNS, "path");
    seg.setAttribute("d", `M ${last[0].toFixed(1)} ${last[1].toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`);
    seg.setAttribute("stroke-width", Math.max(0.3, (DZ.drawW || 6) * 2 * smPr).toFixed(1));
    track.el.appendChild(seg);
  }
  if (track.mode === "pencil") track.el.setAttribute("d", dzSmoothPath(track.pts));
  return true;
}

function _drawBeginTrack(e, svg) {
  const p = dzToUser(e.clientX, e.clientY);
  const pr = _otPressure(e);
  const dev = _otDevType(e);
  const track = {
    pts: [[p.x, p.y, pr, e.tiltX || 0, e.tiltY || 0, e.twist || 0, e.timeStamp || performance.now()]], mode: DZ.tool, el: null,
    pid: e.pointerId, devType: dev,
    _pbuf: [pr, pr, pr, pr, pr],
    startX: p.x, startY: p.y,
    shiftPressed: e.shiftKey,
    stabilizer: window.LOW?.drawing?.Stabilizer ? new LOW.drawing.Stabilizer({
      strength: Math.min(.72, Math.max(0, (DZ.smooth || 0) / 140)), pressureStrength: .28
    }) : null
  };
  if (track.stabilizer) track.stabilizer.push({ x: p.x, y: p.y, pressure: pr || .03 });
  if (DZ.tool === "pencil") {
    track.el = document.createElementNS(SVGNS, "path");
    track.el.setAttribute("fill", "none");
    track.el.setAttribute("stroke", DZ.drawColor || "#F0450E");
    track.el.setAttribute("stroke-width", DZ.drawW || 6);
    track.el.setAttribute("stroke-linecap", "round");
    track.el.setAttribute("stroke-linejoin", "round");
    dzStyleTag(track.el, "ink");            // el lapiz es LINEA
  } else {
    track.el = document.createElementNS(SVGNS, "g");
    track.el.setAttribute("data-low", "brush");
    track.el.setAttribute("stroke", DZ.drawColor || "#F0450E");
    track.el.setAttribute("fill", "none");
    track.el.setAttribute("stroke-linecap", "round");
    dzStyleTag(track.el, "ink");            // mientras se traza son segmentos
  }
  if ((DZ.drawOpacity || 1) < .999) track.el.setAttribute("opacity", DZ.drawOpacity.toFixed(2));
  dzArtAppend(svg, track.el);
  return track;
}

function _drawCancel(reason = "cancel") {
  const t = DRAW_TRACK; DRAW_TRACK = null;
  if (!t) return;
  t.el?.remove();
  _hideGuideLine();
  _dzDiag("× trazo cancelado: " + reason, "#F59E0B");
}

function _drawFinish() {
  if (!DRAW_TRACK) return;
  const t = DRAW_TRACK; DRAW_TRACK = null;
  if (DZPointerController && t.gestureToken != null
      && !DZPointerController.finish(t.gestureToken, t.pid)) {
    t.el?.remove(); _hideGuideLine(); return;
  }
  if (t.pts.length < 2) { if (t.el) t.el.remove(); return; }
  const pts = dzRefineStroke(t.pts);
  let finalEl = t.el;
  if (t.mode === "pencil") {
    t.el.setAttribute("d", dzSmoothPath(pts));
  } else {
    const ribbon = dzBrushFinalElement(pts, DZ.drawColor || "#F0450E");
    if (ribbon) {
      if (t.el.hasAttribute("opacity")) ribbon.setAttribute("opacity", t.el.getAttribute("opacity"));
      dzStyleTagInkAsFill(ribbon);          // cinta RELLENA, pero color de LÍNEA
      t.el.replaceWith(ribbon); finalEl = ribbon;
    }
    else { t.el.remove(); finalEl = null; }
  }
  if (finalEl) dzMirrorClone(finalEl);
  _hideGuideLine();
  dzMarkDirty(); dzBuildLayers();
}

function dzDrawRaw(e) {
  if (!DRAW_TRACK || e.pointerId !== DRAW_TRACK.pid) return;
  // Si hay track activo, SIEMPRE procesar (la presión puede ser 0 en el primer frame)
  const pr = (e.pressure != null) ? e.pressure : _otPressure(e);
  e.preventDefault();
  const p = dzToUser(e.clientX, e.clientY);
  _drawAddPoint(DRAW_TRACK, p.x, p.y, pr, e);
}

function dzDrawDown(e) {
  if (dzOnUiPanel(e)) return;   // clic en un panel flotante: no dibujar
  dzReleaseFocus();
  const tool = DZ.tool || "select";
  if (DZ.spaceDown || e.button === 1 || tool === "hand") return;
  if (e.target.closest && e.target.closest("#dzCam")) return;
  if (tool === "select" || tool === "direct") return;
  // ═══ 3D: si el clic es sobre un plano 3D, que lo maneje el handler 3D ═══
  if (DZ.d3 && e.target.closest && e.target.closest("#dz3dStage")) return;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;

  // ═══ pointerdown SIEMPRE inicia trazo si es pen ═══
  _dzDiag("▼ down " + e.pointerType + " pr:" + (e.pressure != null ? e.pressure.toFixed(4) : "null") +
    " btn:" + e.button + " btns:" + e.buttons + " tool:" + tool, "#33B5E8");

  e.preventDefault(); e.stopPropagation();
  dzCapturePointer(e);
  if (tool === "pivot") { dzPivotClick(e); return; }
  if (tool === "nodes") { dzNodesClick(e); return; }
  if (tool === "dropper") { dzDropperPick(e); return; }
  if (tool === "bucket") { dzBucketApply(e); return; }
  if (tool === "eraser") { dzEraseStart(e); return; }
  if (tool === "ruler") { dzRulerDown(e); return; }
  if (tool === "shape") { dzFormaDown(e); return; }
  if (tool === "inflator") { dzInflatorDown(e); return; }
  if (tool === "handler") { dzHandlerDown(e); return; }
  if (tool === "iron") { dzIronDown(e); return; }
  if (tool === "pliers") { dzPliersDown(e); return; }
  if (tool === "magnet") { dzMagnetDown(e); return; }
  const p = dzToUser(e.clientX, e.clientY);
  if (DZ.tool === "pen") { dzPenDown(p); return; }

  // Finalizar cualquier track previo colgado
  if (DRAW_TRACK) _drawFinish();

  dzSnapshot();
  DRAW_TRACK = _drawBeginTrack(e, svg);
  if (DZPointerController) {
    DRAW_TRACK.gestureToken = DZPointerController.begin({
      owner: "drawing", pointerId: e.pointerId, cancel: _drawCancel
    });
  }
}

function dzDrawMove(e) {
  if (PEN && PEN.dragging) { dzPenDrag(dzToUser(e.clientX, e.clientY)); return; }
  if (PEN && !DRAW_TRACK) { dzPenHover(dzToUser(e.clientX, e.clientY)); return; }
  if (DZ.tool === "ruler" && RULER && RULER.a) { dzRulerMove(e); return; }
  if (dzFormaEnCurso()) { dzFormaMove(e); return; }
  if (DZ.tool === "inflator" && INFLATOR && INFLATOR.el) { dzInflatorMove(e); return; }
  if (DZ.tool === "iron" && IRON && IRON.active) { dzIronApply(e); return; }
  if (DZ.tool === "magnet" && MAGNET && MAGNET.active) { dzMagnetMove(e); return; }
  if (DZ.tool === "handler" && HANDLER && HANDLER.el) { dzHandlerGlobalMove(e); return; }
  if (!DRAW_TRACK) return;
  if (e.pointerId !== DRAW_TRACK.pid) return;

  // Actualizar el estado de Shift en el track
  if (DRAW_TRACK) {
    DRAW_TRACK.shiftPressed = e.shiftKey;
  }

  // ═══ Si hay DRAW_TRACK activo y mismo pointerId, SIEMPRE dibujar ═══
  // (la presión solo afecta el grosor, no si se dibuja)
  e.preventDefault();

  // Procesar eventos coalescidos (alta precisión)
  const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length)
    ? e.getCoalescedEvents() : [e];
  for (const ev of evs) {
    const p = dzToUser(ev.clientX, ev.clientY);
    const pr = _otPressure(ev);
    _drawAddPoint(DRAW_TRACK, p.x, p.y, pr, ev);
  }
}

function dzDrawUp(e) {
  if (dzFormaEnCurso()) { dzFormaUp(e); return; }
  if (PEN && PEN.dragging) { dzPenUp(); return; }
  if (INFLATOR && INFLATOR.el) { dzInflatorUp(e); return; }
  if (IRON && IRON.active) { dzIronUp(e); return; }
  if (MAGNET && MAGNET.active) { dzMagnetUp(e); return; }
  if (HANDLER && HANDLER.el) { dzHandlerUp(e); return; }
  if (!DRAW_TRACK) return;
  if (e && e.pointerId != null && e.pointerId !== DRAW_TRACK.pid
      && e.type !== "pointercancel" && e.type !== "lostpointercapture") return;
  _dzDiag("▲ up   id" + (e ? e.pointerId : "?") + " pts:" + (DRAW_TRACK ? DRAW_TRACK.pts.length : 0), "#F0450E");
  _drawFinish();
}
/* ══ post-procesado del trazo (como OpenToonz al soltar el lápiz):
   1) media móvil  mata el temblor del pulso;
   2) Ramer-Douglas-Peucker  deja SOLO los puntos que definen la forma;
   3) Catmull-Rom  curva bezier limpia por esos puntos.
   La intensidad la controla el deslizador «Suavizado» (0-100). ══ */
function dzMovingAvg(pts, win) {
  if (win < 1 || pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const sums = [0, 0, 0, 0, 0, 0, 0]; let n = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(pts.length - 1, i + win); j++) {
      for (let channel = 0; channel < sums.length; channel++) sums[channel] += pts[j][channel] || (channel === 2 ? .5 : 0);
      n++;
    }
    out.push(sums.map(value => value / n));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function dzRDP(pts, eps) {
  if (pts.length < 3) return pts;
  const d2line = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = dx * dx + dy * dy;
    if (!L2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let imax = -1, dmax = 0;
    for (let i = a + 1; i < b; i++) {
      const d = d2line(pts[i], pts[a], pts[b]);
      if (d > dmax) { dmax = d; imax = i; }
    }
    if (dmax > eps && imax > 0) { keep[imax] = true; stack.push([a, imax], [imax, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function dzRefineStroke(pts) {
  const amt = DZ.smooth === undefined ? 40 : DZ.smooth;   // 0-100
  if (amt <= 0 || pts.length < 4) return pts;
  const win = Math.round(1 + amt / 30);                    // 1..4
  const eps = (amt / 100) * 3.5 / (DZ.zoom || 1);          // en unidades de usuario
  return dzRDP(dzMovingAvg(pts, win), eps);
}
/* cinta de ancho variable para el pincel: UN solo path relleno cuyo contorno
   sigue la presión (como los outline strokes vectoriales de OpenToonz).
   Puntas redondeadas + taper progresivo en los extremos. */
function dzBrushRibbon(pts, baseW, color) {
  if (pts.length < 2) return null;
  // ANCHO FIJO: el trazo sale del mismo grosor de punta a punta, sin escuchar
  // la presion ni adelgazar en los extremos. Es lo que hace falta para
  // entintar parejo —contornos, tipografia, tecnico— donde un trazo que
  // engorda y adelgaza segun como apoyaste el lapiz arruina el dibujo.
  const fijo = !!DZ.anchoFijo;
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(pts.length - 1, i + 1)];
    let tx = p1[0] - p0[0], ty = p1[1] - p0[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    // taper: entra suave (5 pts) y sale suave, como OpenToonz capStyle
    const tIn = Math.min(1, i / 5);
    const tOut = Math.min(1, (pts.length - 1 - i) / 5);
    const tip = tIn * tOut;
    const w = fijo ? baseW * 0.5
      : Math.max(0.2, baseW * (pts[i][2] || 0.5) * tip);
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]);
    R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  R.reverse();
  const side = (arr) => dzSmoothPath(arr).replace(/^M [\d.-]+ [\d.-]+ /, "");
  const d = dzSmoothPath(L) +
    ` L ${R[0][0].toFixed(1)} ${R[0][1].toFixed(1)} ` + side(R) + " Z";
  const el = document.createElementNS(SVGNS, "path");
  el.setAttribute("d", d);
  el.setAttribute("fill", color);
  // con grosor parejo las puntas se rematan redondas: sin el taper, un corte
  // recto deja el trazo con los extremos cuadrados y se nota el empalme
  if (fijo) {
    el.setAttribute("stroke", color);
    el.setAttribute("stroke-width", Math.max(0.2, baseW * 0.5) * 2);
    el.setAttribute("stroke-linejoin", "round");
    el.setAttribute("stroke-linecap", "round");
  } else el.setAttribute("stroke", "none");
  el.setAttribute("data-low", "brush");
  if (fijo) el.setAttribute("data-ancho", "fijo");
  return el;
}

/* suavizado Catmull-Rom convertido a bezier cúbicas: la curva pasa POR todos
   los puntos con continuidad C1 — trazos fieles y orgánicos */
function dzSmoothPath(pts) {
  const n = pts.length;
  if (n < 3)
    return `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} L ${pts[n - 1][0].toFixed(1)} ${pts[n - 1][1].toFixed(1)}`;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/* ══ pluma vectorial profesional (flecha blanca de Illustrator / pluma de
   OpenToonz): clic = esquina · clic y ARRASTRAR = curva con manijas visibles ·
   banda elástica de preview al mover el mouse · clic en el PRIMER punto
   cierra el trazado · Backspace borra el último punto · Enter termina ·
   Esc cancela. Las anclas y manijas se dibujan en una capa guía que jamás
   se guarda en el archivo. ══ */
function dzPenScale() {
  // tamaño de las guías en unidades de usuario, compensando el zoom
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  try { return 1 / (svg.getScreenCTM().a || 1); } catch (e) { return 1; }
}
function dzPenDown(p) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (PEN && PEN.anchors.length >= 2) {
    // clic sobre el PRIMER punto  cerrar el trazado (como Illustrator)
    const a0 = PEN.anchors[0], k = dzPenScale();
    if (Math.hypot(p.x - a0.x, p.y - a0.y) < 10 * k) {
      PEN.closed = true;
      dzPenFinish(false);
      return;
    }
  }
  if (!PEN) {
    dzSnapshot();                                      // Ctrl+Z deshace la pluma entera
    PEN = { anchors: [], el: document.createElementNS(SVGNS, "path"),
            guide: document.createElementNS(SVGNS, "g"), dragging: false, closed: false };
    PEN.el.setAttribute("fill", "none");
    PEN.el.setAttribute("stroke", DZ.drawColor || "#F0450E");
    PEN.el.setAttribute("stroke-width", DZ.drawW || 6);
    PEN.el.setAttribute("stroke-linecap", "round");
    PEN.el.setAttribute("stroke-linejoin", "round");
    PEN.guide.setAttribute("class", "dz-penui");       // capa guía: solo pantalla
    PEN.guide.setAttribute("pointer-events", "none");
    dzArtAppend(svg, PEN.el);
    svg.appendChild(PEN.guide);
    dzSetStatus("🖋 Pluma: clic = esquina · arrastrar = curva · clic en el 1er punto cierra · Backspace borra el último · Enter termina · Esc cancela");
  }
  PEN.anchors.push({ x: p.x, y: p.y, hx: p.x, hy: p.y });
  PEN.dragging = true;
  dzPenRender();
}
function dzPenDrag(p) {
  const a = PEN.anchors[PEN.anchors.length - 1];
  a.hx = p.x; a.hy = p.y;                              // la manija sigue el arrastre
  dzPenRender();
}
function dzPenUp() { if (PEN) { PEN.dragging = false; dzPenRender(); } }
function dzPenHover(p) {
  // banda elástica: preview del próximo segmento siguiendo el mouse
  if (!PEN || !PEN.anchors.length) return;
  PEN.hover = p;
  dzPenRender();
}
function dzPenBackspace() {
  if (!PEN) return;
  PEN.anchors.pop();
  if (!PEN.anchors.length) { dzPenFinish(true); return; }
  dzPenRender();
}
function dzPenPathD(A, closed) {
  let d = `M ${A[0].x.toFixed(1)} ${A[0].y.toFixed(1)}`;
  for (let i = 1; i < A.length; i++) {
    const prev = A[i - 1], cur = A[i];
    // manija de salida del anterior = su drag; de entrada de este = espejo del suyo
    const inx = 2 * cur.x - cur.hx, iny = 2 * cur.y - cur.hy;
    d += ` C ${prev.hx.toFixed(1)} ${prev.hy.toFixed(1)} ${inx.toFixed(1)} ${iny.toFixed(1)} ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
  }
  if (closed && A.length >= 2) {
    const last = A[A.length - 1], a0 = A[0];
    const inx = 2 * a0.x - a0.hx, iny = 2 * a0.y - a0.hy;
    d += ` C ${last.hx.toFixed(1)} ${last.hy.toFixed(1)} ${inx.toFixed(1)} ${iny.toFixed(1)} ${a0.x.toFixed(1)} ${a0.y.toFixed(1)} Z`;
  }
  return d;
}
function dzPenRender() {
  if (!PEN || !PEN.anchors.length) return;
  const A = PEN.anchors;
  PEN.el.setAttribute("d", dzPenPathD(A, false));
  // ── capa guía: anclas ▪, manijas ─, banda elástica ┈ ──
  const k = dzPenScale();
  const g = PEN.guide;
  g.innerHTML = "";
  const mk = (tag, attrs) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [key, v] of Object.entries(attrs)) n.setAttribute(key, v);
    g.appendChild(n); return n;
  };
  // banda elástica hacia el mouse (cuando no estás arrastrando una manija):
  // sale con la tangente de la última manija y aterriza recto en el cursor
  if (PEN.hover && !PEN.dragging) {
    const last = A[A.length - 1], h = PEN.hover;
    mk("path", { d: `M ${last.x} ${last.y} C ${last.hx} ${last.hy} ${h.x} ${h.y} ${h.x} ${h.y}`,
                 fill: "none", stroke: "#33B5E8", "stroke-width": 1.2 * k,
                 "stroke-dasharray": `${4 * k} ${4 * k}`, opacity: 0.8 });
  }
  A.forEach((a, i) => {
    const hasHandle = Math.hypot(a.hx - a.x, a.hy - a.y) > 0.5;
    if (hasHandle) {
      const inx = 2 * a.x - a.hx, iny = 2 * a.y - a.hy;
      mk("line", { x1: inx, y1: iny, x2: a.hx, y2: a.hy,
                   stroke: "#33B5E8", "stroke-width": 1 * k, opacity: 0.85 });
      mk("circle", { cx: a.hx, cy: a.hy, r: 3 * k, fill: "#33B5E8" });
      mk("circle", { cx: inx, cy: iny, r: 3 * k, fill: "#33B5E8", opacity: 0.7 });
    }
    // el primer punto se agranda cuando el mouse está cerca (se puede cerrar)
    const near0 = i === 0 && PEN.hover && A.length >= 2 &&
      Math.hypot(PEN.hover.x - a.x, PEN.hover.y - a.y) < 10 * k;
    const s = (near0 ? 8 : 5) * k;
    mk("rect", { x: a.x - s / 2, y: a.y - s / 2, width: s, height: s,
                 fill: near0 ? "#33B5E8" : "#fff", stroke: "#33B5E8",
                 "stroke-width": 1.4 * k });
  });
}
function dzPenFinish(cancel) {
  if (!PEN) return;
  PEN.guide.remove();
  if (cancel || PEN.anchors.length < 2) {
    PEN.el.remove();
    if (!cancel && DZ.undo && DZ.undo.length) DZ.undo.pop();   // no dibujó nada
  } else {
    PEN.el.setAttribute("d", dzPenPathD(PEN.anchors, PEN.closed));
    if (PEN.closed && DZ.fillColor) PEN.el.setAttribute("fill", DZ.fillColor);
    dzMirrorClone(PEN.el);                             // 🔄 modo espejo
    dzMarkDirty(); dzBuildLayers();
    dzSetStatus(PEN.closed ? "🖋 Trazado cerrado (relleno con el color actual) — editalo con nodos (A)" :
                             "🖋 Trazado listo — editalo con nodos (A)");
    PEN = null;
    return;
  }
  PEN = null;
  dzSetStatus("");
}

/* ══ atajos de teclado configurables (Preferencias  del estudio) ══ */
const DZ_KEY_DEFAULTS = {
  select: "v", direct: "d", hand: "h", nodes: "a", pencil: "n", brush: "b", pen: "p",
  eraser: "e", dropper: "i", bucket: "g", camera: "c", pivot: "j",
  rect: "r", ellipse: "o", text: "t", line: "l",
  zoomin: "+", zoomout: "-", zoom100: "0", zoomfit: "f",
  rotl: "[", rotr: "]", mirror: "m",
  prevframe: ",", nextframe: ".", rigkey: "k",
  // La barra espaciadora queda reservada para la mano. Enter reproduce, y es
  // reasignable como cualquier otro atajo.
  play: "enter",
};
const DZ_KEY_LABELS = {
  select: "Seleccionar (flecha)", hand: "Mano (navegar)", nodes: "Nodos (flecha blanca)",
  pencil: "Lápiz", brush: "Pincel", pen: "Pluma vectorial", eraser: "Borrador",
  dropper: "Cuentagotas", bucket: "Balde de pintura", camera: "Cámara",
  pivot: "Pivote de rig", rect: "Rectángulo", ellipse: "Elipse",
  text: "Texto", line: "Línea", zoomin: "Acercar", zoomout: "Alejar",
  zoom100: "Zoom 100%", zoomfit: "Ajustar a pantalla", rotl: "Girar vista ",
  rotr: "Girar vista ", mirror: "Modo espejo", prevframe: "Cuadro anterior",
  nextframe: "Cuadro siguiente", rigkey: "Crear clave de rig",
  play: "Reproducir / parar",
};
function dzKeysLoad() {
  let saved = {};
  try { saved = JSON.parse(dzPrefsStorage().getItem("low.dzkeys") || "{}"); } catch (e) { /* */ }
  DZ.keymap = { ...DZ_KEY_DEFAULTS, ...saved };
  DZ.keyrev = {};
  for (const [act, k] of Object.entries(DZ.keymap)) if (k) DZ.keyrev[k] = act;
}
function dzKeysSave() {
  try { dzPrefsStorage().setItem("low.dzkeys", JSON.stringify(DZ.keymap)); } catch (e) { /* */ }
  dzKeysLoad();
}
function dzRunAction(act) {
  const TOOLS = ["select", "direct", "hand", "nodes", "pencil", "brush", "pen", "eraser",
                 "dropper", "bucket", "pivot", "ruler", "inflator", "handler", "iron", "pliers", "magnet"];
  if (TOOLS.includes(act)) return dzSetTool(act);
  if (act === "play") return dzPlayToggle();
  if (act === "camera") return dzCamToggle();
  if (act === "text") return dzAddShape("text");
  if (["rect", "ellipse", "circle", "poly", "star", "line"].includes(act)) return dzFormaElegir(act);
  if (act === "zoomin") return dzZoom(0.15);
  if (act === "zoomout") return dzZoom(-0.15);
  // Escena de animación: un archivo con TODO (dibujos, capas, timing, fps)
  if (act === "escena-guardar") return dzSceneSave(false);
  if (act === "escena-guardar-como") return dzSceneSave(true);
  if (act === "escena-abrir") return dzSceneOpen();
  if (act === "audio-cargar") return dzAudioCargar();
  if (act === "audio-quitar") return dzAudioQuitar();
  // Ventana: separar un panel a su propia ventana (segundo monitor)
  if (act && act.startsWith("win-")) {
    const kind = act.slice(4);
    if (kind === "info") return dzSetStatus(" Cada panel separado recuerda en qué monitor y con qué tamaño quedó");
    return dzDetachPanel(kind);
  }
  if (act === "ws-save") return dzWsSaveCurrent();
  if (act === "ws-duplicate") return dzWsDuplicateCurrent();
  if (act === "ws-lock") return dzWsSetLocked(!DZ.workspaceLocked);
  if (act === "ws-reset") return dzWsResetCurrent();
  if (act === "zoom100") { DZ.zoom = 1; DZ.panX = DZ.panY = 0; DZ.viewRot = 0; return dzApplyZoom(); }
  if (act === "zoomfit") return dzFitView();
  if (act === "rotl") return dzRotView(-15);
  if (act === "rotr") return dzRotView(15);
  if (act === "mirror") return dzMirrorToggle();
  if (act === "rigkey" && DZ.rigMode) {
    if (DZ.sel?.id && DZ.doc?.scene.rigNode(DZ.sel.id)) return dzRigSetKey(DZ.sel.id, dzRigCur(), dzRigLocalAt(DZ.sel.id, dzRigCur()));
    return dzRigKeyAll();
  }
  if (act === "prevframe" && DZ.anim) { dzAnimStopIf(); return dzGoFrame(Math.max(0, DZ.anim.idx - 1)); }
  if (act === "nextframe" && DZ.anim) { dzAnimStopIf(); return dzGoFrame(Math.min(DZ.anim.frames.length - 1, DZ.anim.idx + 1)); }
}
/*  Preferencias del estudio: reasignar atajos (clic en el campo y apretá la
   tecla nueva) + suavizado por defecto */
function dzPrefsModal() {
  dzKeysLoad();
  const rows = Object.keys(DZ_KEY_DEFAULTS).map(act =>
    `<div class="krow"><label>${DZ_KEY_LABELS[act] || act}</label>` +
    `<input class="dz-keycap" data-act="${act}" value="${(DZ.keymap[act] || "").toUpperCase()}" readonly ` +
    `placeholder="(sin atajo)" title="Clic y apretá la tecla nueva · Supr la borra"></div>`).join("");
  openModal(`<h2> Preferencias del estudio</h2>
    <div class="sub">Clic en un campo y apretá la tecla nueva (una letra, número o símbolo).
    Supr/Retroceso deja la acción sin atajo. Los atajos funcionan cuando no estás escribiendo texto.</div>
    ${rows}
    <div class="dz-style-row" style="margin-top:12px">
      <span class="dz-hint">Suavizado del lápiz/pincel</span>
      <input type="range" id="prefSmooth" min="0" max="100" value="${DZ.smooth === undefined ? 40 : DZ.smooth}">
      <span class="dz-hint" id="prefSmoothLbl">${DZ.smooth === undefined ? 40 : DZ.smooth}</span>
    </div>
    <div class="dz-style-row">
      <span class="dz-hint">Sensibilidad de presión (gamma)</span>
      <input type="range" id="prefGamma" min="20" max="200" value="${Math.round((DZ.pressureGamma || 0.85) * 100)}">
      <span class="dz-hint" id="prefGammaLbl">${(DZ.pressureGamma || 0.85).toFixed(2)}</span>
    </div>
    <div class="dz-style-row">
      <span class="dz-hint">Rango útil Huion/Wacom</span>
      <label class="dz-hint">inicio <input class="dz-win" id="prefPressureMin" type="number" min="0" max="0.95" step="0.01" value="${DZ.pressureMin || 0}"></label>
      <label class="dz-hint">máximo <input class="dz-win" id="prefPressureMax" type="number" min="0.05" max="1" step="0.01" value="${DZ.pressureMax || 1}"></label>
      <button class="ghost" id="prefTabletDiag">Diagnóstico</button>
    </div>
    <div class="m-actions">
      <button class="ghost" id="prefReset">Restaurar por defecto</button>
      <button class="primary" id="mCancel">Listo</button>
    </div>`);
  document.querySelectorAll(".dz-keycap").forEach(inp => {
    inp.onkeydown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const act = inp.dataset.act;
      if (e.key === "Delete" || e.key === "Backspace") {
        DZ.keymap[act] = ""; inp.value = "";
      } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const k = e.key.toLowerCase();
        // si otra acción tenía esta tecla, se la saca (sin duplicados)
        for (const [a2, k2] of Object.entries(DZ.keymap))
          if (k2 === k && a2 !== act) {
            DZ.keymap[a2] = "";
            const otro = document.querySelector(`.dz-keycap[data-act="${a2}"]`);
            if (otro) otro.value = "";
          }
        DZ.keymap[act] = k; inp.value = k.toUpperCase();
      }
      dzKeysSave();
    };
    inp.onfocus = () => inp.select();
  });
  $("#prefSmooth").oninput = (e) => {
    DZ.smooth = +e.target.value;
    $("#prefSmoothLbl").textContent = e.target.value;
    const s = $("#dzSmooth"); if (s) { s.value = e.target.value; $("#dzSmoothLbl").textContent = e.target.value; }
    try { dzPrefsStorage().setItem("low.dzsmooth", String(DZ.smooth)); } catch (err) { /* */ }
  };
  $("#prefGamma").oninput = (e) => {
    DZ.pressureGamma = +e.target.value / 100;
    $("#prefGammaLbl").textContent = DZ.pressureGamma.toFixed(2);
    try { dzPrefsStorage().setItem("low.dzgamma", String(DZ.pressureGamma)); } catch (err) { /* */ }
  };
  const savePressureRange = () => {
    DZ.pressureMin = Math.max(0, Math.min(.95, +$("#prefPressureMin").value || 0));
    DZ.pressureMax = Math.max(DZ.pressureMin + .05, Math.min(1, +$("#prefPressureMax").value || 1));
    $("#prefPressureMin").value = DZ.pressureMin; $("#prefPressureMax").value = DZ.pressureMax;
    try { dzPrefsStorage().setItem("low.dzpressuremin", DZ.pressureMin); dzPrefsStorage().setItem("low.dzpressuremax", DZ.pressureMax); } catch (_) { /* noop */ }
  };
  $("#prefPressureMin").onchange = savePressureRange; $("#prefPressureMax").onchange = savePressureRange;
  $("#prefTabletDiag").onclick = () => api.open_tablet_diag();
  $("#prefReset").onclick = () => {
    DZ.keymap = { ...DZ_KEY_DEFAULTS };
    dzKeysSave();
    document.querySelectorAll(".dz-keycap").forEach(i2 =>
      i2.value = (DZ.keymap[i2.dataset.act] || "").toUpperCase());
  };
  $("#mCancel").onclick = closeModal;
}

/* ══ nodos (A): editar los puntos de un trazado, como la flecha blanca
   de Illustrator. Normaliza el path a comandos ABSOLUTOS y muestra un
   tirador por ancla; arrastrar mueve el punto (las manijas C lo siguen). ══ */
function dzToScreen(x, y) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const cv = $("#dzCanvas").getBoundingClientRect();
  const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
  const sp = pt.matrixTransform(svg.getScreenCTM());
  return { x: sp.x - cv.left, y: sp.y - cv.top };
}

/* ══ REGLAS + GUÍAS + CUADRÍCULA (2D) ═══════════════════════════════════════
   Reglas en los 4 bordes (Ctrl+R) en unidades del lienzo, guías arrastrables
   desde las reglas (como Photoshop) y cuadrícula de referencia. Todo es ayuda
   de vista: NO se guarda en el .svg. ══ */
function dzNiceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, raw))));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function dzRulersToggle() {
  DZ.rulers = !DZ.rulers;
  $("#dzRulers").hidden = !DZ.rulers;
  $("#dzRulersBtn") && $("#dzRulersBtn").classList.toggle("active", DZ.rulers);
  if (DZ.rulers) dzRulersRender();
  dzSetStatus(DZ.rulers ? "Reglas activas — arrastrá desde una regla para crear una guía (Ctrl+R oculta)" : "");
}
function dzGridToggle() {
  DZ.grid = !DZ.grid;
  $("#dzGrid2d").hidden = !DZ.grid;
  $("#dzGridBtn") && $("#dzGridBtn").classList.toggle("active", DZ.grid);
  if (DZ.grid) dzRulersRender();
}
function dzGuidesToggle() {
  DZ.guidesOn = DZ.guidesOn === false ? true : (DZ.guidesOn === undefined ? true : !DZ.guidesOn);
  $("#dzGuides").hidden = !DZ.guidesOn;
  $("#dzGuidesBtn") && $("#dzGuidesBtn").classList.toggle("active", DZ.guidesOn);
}
function dzRulersRender() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const cv = $("#dzCanvas").getBoundingClientRect();
  const o = dzToScreen(0, 0);
  const scale = Math.abs(dzToScreen(1, 0).x - o.x) || 1;   // px por unidad (rot=0)
  const step = dzNiceStep(64 / scale);
  if (DZ.rulers) {
    // eje X (arriba y abajo)
    const uL = dzToUser(cv.left, cv.top).x, uR = dzToUser(cv.right, cv.top).x;
    let a = Math.min(uL, uR), b = Math.max(uL, uR), hx = "";
    for (let t = Math.ceil(a / step) * step; t <= b; t += step) {
      const sx = dzToScreen(t, 0).x;
      hx += `<span class="dz-tk" style="left:${sx.toFixed(1)}px"><i>${Math.round(t)}</i></span>`;
      const sxm = dzToScreen(t + step / 2, 0).x;
      hx += `<span class="dz-tk mn" style="left:${sxm.toFixed(1)}px"></span>`;
    }
    $("#dzRlTop").innerHTML = hx; $("#dzRlBottom").innerHTML = hx;
    // eje Y (izquierda y derecha)
    const uT = dzToUser(cv.left, cv.top).y, uB = dzToUser(cv.left, cv.bottom).y;
    let c = Math.min(uT, uB), d = Math.max(uT, uB), hy = "";
    for (let t = Math.ceil(c / step) * step; t <= d; t += step) {
      const sy = dzToScreen(0, t).y;
      hy += `<span class="dz-tk v" style="top:${sy.toFixed(1)}px"><i>${Math.round(t)}</i></span>`;
      const sym = dzToScreen(0, t + step / 2).y;
      hy += `<span class="dz-tk v mn" style="top:${sym.toFixed(1)}px"></span>`;
    }
    $("#dzRlLeft").innerHTML = hy; $("#dzRlRight").innerHTML = hy;
  }
  if (DZ.grid) {
    const g = $("#dzGrid2d");
    const cell = step * scale;
    g.style.backgroundSize = `${cell}px ${cell}px, ${cell}px ${cell}px, ${cell * 5}px ${cell * 5}px, ${cell * 5}px ${cell * 5}px`;
    g.style.backgroundPosition = `${o.x}px ${o.y}px`;
  }
  dzGuidesRender();
}
function dzGuidesRender() {
  const box = $("#dzGuides");
  if (!box) return;
  const guides = DZ.guides || [];
  box.innerHTML = "";
  guides.forEach((g, i) => {
    const line = document.createElement("div");
    if (g.axis === "h") {
      const y = dzToScreen(0, g.u).y;
      line.className = "dz-guide h"; line.style.top = y.toFixed(1) + "px";
    } else {
      const x = dzToScreen(g.u, 0).x;
      line.className = "dz-guide v"; line.style.left = x.toFixed(1) + "px";
    }
    line.dataset.i = i;
    line.onpointerdown = (e) => dzGuideDrag(e, i);
    box.appendChild(line);
  });
}
/* arrastrar una guía existente; soltarla sobre una regla la elimina */
function dzGuideDrag(e, i) {
  e.preventDefault(); e.stopPropagation();
  const g = DZ.guides[i];
  const move = (ev) => {
    const p = dzToUser(ev.clientX, ev.clientY);
    g.u = g.axis === "h" ? p.y : p.x;
    dzGuidesRender();
  };
  const up = (ev) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    const cv = $("#dzCanvas").getBoundingClientRect();
    const rx = ev.clientX - cv.left, ry = ev.clientY - cv.top;
    if (rx < 20 || ry < 20 || rx > cv.width - 20 || ry > cv.height - 20) {
      DZ.guides.splice(i, 1);   // soltada sobre una regla  borrar
    }
    dzGuidesRender();
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}
/* crear una guía arrastrando desde una regla */
function dzRulerPull(e, axis) {
  e.preventDefault();
  if (DZ.guidesOn === false) dzGuidesToggle();
  DZ.guides = DZ.guides || [];
  const p0 = dzToUser(e.clientX, e.clientY);
  DZ.guides.push({ axis, u: axis === "h" ? p0.y : p0.x });
  const i = DZ.guides.length - 1;
  dzGuidesRender();
  dzGuideDrag(e, i);
}
/* parsea un atributo d a comandos absolutos: [{c:"M",n:[x,y]},{c:"C",n:[...]}] */

/* ══ borrador (E): arrastrá por encima y borra trazos/formas ENTEROS ══ */
function dzEraseStart(e) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  dzSnapshot();
  let erased = 0;
  const eraseAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest || el.closest("g.dz-onion")) return;
    if (el.closest("[data-locked]")) return;           // capa bloqueada 🔒
    const inSvg = el.closest("#dzCanvas svg");
    if (!inSvg || el === svg) return;
    const t = el.tagName.toLowerCase();
    if (!["path", "line", "circle", "rect", "ellipse", "polygon", "polyline", "text", "tspan", "image"].includes(t)) return;
    // los trazos de pincel viven en un <g data-low=brush>: borrar el grupo entero
    let target = el.closest('g[data-low="brush"]') || (t === "tspan" ? el.closest("text") : el);
    // no borrar el rect de fondo (cubre casi todo el lienzo)
    if (t === "rect") {
      const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
      const area = (+el.getAttribute("width") || 0) * (+el.getAttribute("height") || 0);
      if (area >= (vb[2] || 1) * (vb[3] || 1) * 0.9) return;
    }
    if (target === DZ.sel) dzDeselect();
    target.remove(); erased++;
  };
  eraseAt(e.clientX, e.clientY);
  const move = (ev) => eraseAt(ev.clientX, ev.clientY);
  const up = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    if (erased) { dzMarkDirty(); dzBuildLayers(); dzSetStatus("◪ Borré " + erased + " elemento(s)"); }
    else if (DZ.undo && DZ.undo.length) DZ.undo.pop();   // no borró nada: snapshot de más
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}

/* ══ cuentagotas (I) y balde (G) ══ */
function dzDropperPick(e) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  // elementsFromPoint permite saltar manijas, guías, el papel y los grupos
  // estructurales. elementFromPoint a secas solía devolver uno de esos y el
  // cuentagotas parecía decorativo aunque el evento sí llegaba.
  const el = document.elementsFromPoint(e.clientX, e.clientY).find(n =>
    n !== svg && svg.contains(n) && n.tagName &&
    !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase()) &&
    !n.matches?.('[data-low-art],.dz-onion,.dz-penui,[data-dz3d]') &&
    !n.closest?.('.dz-onion,.dz-penui,[data-dz3d]') && !dzIsCanvasBackground(n));
  if (!el) return dzSetStatus("💧 No hay color muestreable en ese punto");
  const cs = getComputedStyle(el);
  const fill = dzHex(el.getAttribute("fill") || cs.fill);
  const stroke = dzHex(el.getAttribute("stroke") || cs.stroke);
  if (!fill && !stroke) return dzSetStatus("💧 Ese elemento no tiene relleno ni trazo visible");
  if (fill) DZ.fillColor = fill;
  if (stroke) DZ.drawColor = stroke;
  // Una línea no tiene relleno: su trazo también pasa a ser el color de
  // relleno activo para que el color copiado sirva inmediatamente en formas.
  if (!fill && stroke) DZ.fillColor = stroke;
  const sw = parseFloat(el.getAttribute("stroke-width") || cs.strokeWidth);
  if (Number.isFinite(sw) && sw > 0) DZ.drawW = Math.max(1, Math.round(sw));
  const sync = (id, value) => { const i = $(id); if (i && value) i.value = value; };
  sync("#dzPFill", DZ.fillColor); sync("#dzPStroke", DZ.drawColor);
  sync("#toFill", DZ.fillColor); sync("#toColor", DZ.drawColor);
  if ($("#dzDrawW")) $("#dzDrawW").value = DZ.drawW;
  if ($("#toW")) $("#toW").value = DZ.drawW;
  dzPaletteRemember(fill || stroke);
  dzSetStatus("💧 Color copiado: " + (fill || stroke) + (stroke && fill ? " · contorno " + stroke : ""));
}

function dzPaletteRemember(color) {
  if (!color) return;
  const palette = dzPaletteLoad().filter(c => String(c).toLowerCase() !== color.toLowerCase());
  palette.unshift(color); dzPaletteSave(palette); dzPaletteRender();
}
/* ══ Balde (G): COLOR POR ZONA, no por coordenada =========================
   La geometría vive en Color Art, el contorno en Line Art y cada zona recibe
   una identidad estable. Al propagar, LOW compara forma+tamaño+trayectoria; si
   hay dos regiones posibles no adivina: omite ese dibujo y lo informa. */
function dzColoringPrefs() {
  if (!DZ.coloringPrefs) {
    let saved = {};
    try { saved = JSON.parse(dzPrefsStorage().getItem("low.coloring.v1") || "{}"); } catch (_) { /* */ }
    DZ.coloringPrefs = LOW.animation.coloring.normalizeSettings(saved);
  }
  return DZ.coloringPrefs;
}
function dzColoringPrefsSet(key, value) {
  DZ.coloringPrefs = LOW.animation.coloring.normalizeSettings({ ...dzColoringPrefs(), [key]: value });
  try { dzPrefsStorage().setItem("low.coloring.v1", JSON.stringify(DZ.coloringPrefs)); } catch (_) { /* */ }
  return DZ.coloringPrefs;
}
function dzFillZoneAtPoint(e, svg) {
  const stack = document.elementsFromPoint(e.clientX, e.clientY);
  for (const node of stack) {
    if (!svg.contains(node) || !node.matches) continue;
    const fill = node.matches('[data-low-zone],[data-low="fill"]') ? node :
      node.closest('[data-low-zone],[data-low="fill"]');
    if (fill && svg.contains(fill) && !fill.closest(".dz-onion,.dz-penui")) return fill;
  }
  return null;
}
function dzFillFindZone(root, zoneId) {
  if (!zoneId) return null;
  return [...root.querySelectorAll("[data-low-zone]")].find((n) => n.getAttribute("data-low-zone") === zoneId) || null;
}
function dzFillRemoveZone(root, zoneId) {
  let count = 0;
  [...root.querySelectorAll("[data-low-zone]")].forEach((n) => {
    if (n.getAttribute("data-low-zone") === zoneId) { n.remove(); count++; }
  });
  return count;
}
function dzFillRoot(content, vb) {
  const root = document.createElementNS(SVGNS, "svg");
  root.setAttribute("xmlns", SVGNS); root.setAttribute("viewBox", vb.join(" "));
  root.setAttribute("width", vb[2]); root.setAttribute("height", vb[3]);
  root.innerHTML = content || "";
  return root;
}
function dzFillRegionSet(imgData, w, h, gap) {
  const px = imgData.data, total = w * h, raw = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4, alpha = px[p + 3], lum = .2126 * px[p] + .7152 * px[p + 1] + .0722 * px[p + 2];
    if (alpha > 10 && lum < 245) raw[i] = 1;
  }
  let blocked = raw;
  const radius = Math.ceil(Math.max(0, Math.min(10, gap || 0)) / 2);
  if (radius) {
    blocked = new Uint8Array(raw);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (raw[y * w + x]) {
      for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) blocked[yy * w + xx] = 1;
      }
    }
  }
  const labels = new Int32Array(total), queue = new Int32Array(total), all = [];
  for (let i = 0; i < total; i++) if (blocked[i]) labels[i] = -1;
  let next = 0;
  for (let seed = 0; seed < total; seed++) {
    if (labels[seed]) continue;
    const label = ++next; let head = 0, tail = 0, count = 0, sx = 0, sy = 0;
    let minX = w, minY = h, maxX = -1, maxY = -1, edge = false;
    labels[seed] = label; queue[tail++] = seed;
    while (head < tail) {
      const at = queue[head++], x = at % w, y = (at / w) | 0;
      count++; sx += x; sy += y; edge = edge || x === 0 || y === 0 || x === w - 1 || y === h - 1;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const push = (n) => { if (!labels[n]) { labels[n] = label; queue[tail++] = n; } };
      if (x > 0) push(at - 1); if (x + 1 < w) push(at + 1);
      if (y > 0) push(at - w); if (y + 1 < h) push(at + w);
    }
    all.push({ label, count, sx, sy, minX, minY, maxX, maxY, edge });
  }
  const grid = dzColoringPrefs().grid, candidates = all.filter((r) => !r.edge && r.count > 12 && r.count < total * .9);
  const byLabel = new Map(candidates.map((r) => [r.label, r]));
  for (const r of candidates) r.signature = new Array(grid * grid).fill(0);
  for (let i = 0; i < total; i++) {
    const r = byLabel.get(labels[i]); if (!r) continue;
    const x = i % w, y = (i / w) | 0, bw = r.maxX - r.minX + 1, bh = r.maxY - r.minY + 1;
    const gx = Math.min(grid - 1, Math.floor((x - r.minX) / bw * grid));
    const gy = Math.min(grid - 1, Math.floor((y - r.minY) / bh * grid));
    r.signature[gy * grid + gx]++;
  }
  for (const r of candidates) {
    const bw = r.maxX - r.minX + 1, bh = r.maxY - r.minY + 1;
    for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
      const x0 = Math.floor(gx * bw / grid), x1 = Math.floor((gx + 1) * bw / grid);
      const y0 = Math.floor(gy * bh / grid), y1 = Math.floor((gy + 1) * bh / grid);
      r.signature[gy * grid + gx] /= Math.max(1, (x1 - x0) * (y1 - y0));
    }
    Object.assign(r, {
      area: r.count / total,
      centroid: { x: (r.sx / r.count + .5) / w, y: (r.sy / r.count + .5) / h },
      bbox: { x: r.minX / w, y: r.minY / h, w: bw / w, h: bh / h },
      aspect: bw / bh,
    });
  }
  return { labels, regions: candidates, components: all.map((r) => ({
    label: r.label, count: r.count, edge: r.edge,
    bbox: { x: r.minX, y: r.minY, w: r.maxX - r.minX + 1, h: r.maxY - r.minY + 1 }
  })) };
}
function dzFillNearestRegion(labels, regions, w, h, x, y) {
  const allowed = new Set(regions.map((r) => r.label));
  for (let radius = 0; radius <= 5; radius++) for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const label = labels[yy * w + xx];
      if (allowed.has(label)) return regions.find((r) => r.label === label) || null;
    }
  return null;
}
async function dzFillAnalyze(root, vb, point, gap) {
  const clean = dzFillPrepareSvg(root, vb), durl = await dzRasterize(clean.outerHTML, 720);
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = durl; });
  const canvas = document.createElement("canvas"); canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
  const set = dzFillRegionSet(ctx.getImageData(0, 0, img.width, img.height), img.width, img.height, gap);
  let region = null;
  if (point) {
    const x = Math.max(0, Math.min(img.width - 1, Math.round((point.x - vb[0]) / vb[2] * (img.width - 1))));
    const y = Math.max(0, Math.min(img.height - 1, Math.round((point.y - vb[1]) / vb[3] * (img.height - 1))));
    region = dzFillNearestRegion(set.labels, set.regions, img.width, img.height, x, y);
  }
  return { ...set, width: img.width, height: img.height, region };
}
function dzFillMask(analysis, region) {
  const mask = new Uint8Array(analysis.labels.length), label = region && region.label;
  for (let i = 0; i < mask.length; i++) if (analysis.labels[i] === label) mask[i] = 1;
  return mask;
}
function dzFillStyleIndex(color) {
  if (!DZ.doc || !DZ.doc.palette) return null;
  const pal = DZ.doc.palette;
  let style = pal.byColor(color);
  if (!style) style = DZ.doc.addStyle(color, `Relleno ${pal.nextIndex()}`);
  return style && style.index;
}
function dzFillPut(root, analysis, region, vb, zoneId, color, styleIndex, mode) {
  const exact = dzFillFindZone(root, zoneId);
  if (mode === "unpainted" && exact) return false;
  const arts = dzArtEnsure(root);
  if (exact) {
    exact.setAttribute("fill", color);
    if (styleIndex) exact.setAttribute(LOW.animation.palette.ATTR.paint, String(styleIndex));
    exact.setAttribute("data-low", "fill"); arts.colour.appendChild(exact);
    return true;
  }
  const d = dzFillPathData(analysis, region, vb); if (!d) return false;
  const path = document.createElementNS(SVGNS, "path");
  path.setAttribute("d", d); path.setAttribute("fill", color); path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("data-low", "fill"); path.setAttribute("data-low-zone", zoneId);
  if (styleIndex) path.setAttribute(LOW.animation.palette.ATTR.paint, String(styleIndex));
  arts.colour.appendChild(path);
  return true;
}
function dzColoringReportShow() {
  const report = DZ.lastColorReport; if (!report) return;
  const rows = (report.skipped || []).map((item) => `<li><button class="ghost colour-report-frame" data-frame="${item.frame || ""}">Cuadro ${item.frame || "—"} · dibujo ${item.number}</button> <span>${item.reason === "ambiguous" ? "zona ambigua" : item.reason === "low-confidence" ? "coincidencia débil" : "sin zona compatible"}</span></li>`).join("");
  openModal(`<h2>Informe de coloreo</h2><p>${report.changed} dibujo(s) actualizados. ${report.skipped.length} omitidos para evitar errores.</p>${rows ? `<ul>${rows}</ul>` : "<p>No hubo cuadros dudosos.</p>"}<div class="m-actions"><button class="primary" id="colourReportOk">Cerrar</button></div>`);
  $("#colourReportOk").onclick = closeModal;
  document.querySelectorAll(".colour-report-frame[data-frame]").forEach((button) => {
    button.onclick = () => {
      const frame = Number(button.dataset.frame); closeModal();
      if (frame > 0 && DZ.doc) dzDocGoTo(frame);
    };
  });
}
async function dzBucketApply(e) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg || DZ.coloringBusy) return;
  const coloring = LOW.animation.coloring, prefs = dzColoringPrefs(), vb = dzVB();
  const p = dzToUser(e.clientX, e.clientY);
  const existing = dzFillZoneAtPoint(e, svg);
  if (prefs.mode === "unpainted" && existing) return dzSetStatus("🪣 La zona ya tiene color · usá Pintar o Recolorear");
  if ((prefs.mode === "repaint" || prefs.mode === "unpaint") && !existing)
    return dzSetStatus("🪣 No hay un relleno en ese punto");
  const beforeCanvas = dzCanvasInner();
  let applied = false;
  DZ.coloringBusy = true;
  try {
    if (DZ.doc) { clearTimeout(DZ_DOC_TIMER); dzDocCommit(); }
    else dzSnapshot();
    const zoneId = existing?.getAttribute("data-low-zone") || coloring.zoneId();
    const targets = DZ.doc ? coloring.scopeTargets(DZ.doc, prefs.scope) : [];
    const currentNumber = DZ.doc?.drawing?.number;
    const changes = [], skipped = [];
    if (prefs.mode === "unpaint") {
      if (existing && !existing.getAttribute("data-low-zone")) existing.remove();
      else dzFillRemoveZone(svg, zoneId);
      if (DZ.doc?.drawing) changes.push({ levelId: DZ.doc.level.id, number: currentNumber, content: dzCanvasInner() });
      for (const item of targets) {
        if (item.number === currentNumber) continue;
        const root = dzFillRoot(item.drawing.content, vb);
        if (dzFillRemoveZone(root, zoneId)) changes.push({ levelId: item.levelId, number: item.number, content: root.innerHTML });
      }
      const changed = DZ.doc ? DZ.doc.applyDrawingContents(changes, "Borrar color de zona") : 1;
      applied = true;
      if (!DZ.doc) dzMarkDirty(); else DZ.dirty = true;
      DZ.lastColorReport = { changed, skipped: [] }; dzBuildLayers();
      return dzSetStatus(`🪣 Color eliminado en ${changed || 1} dibujo(s)`);
    }
    dzSetStatus("🪣 Analizando la zona y su movimiento…");
    const source = await dzFillAnalyze(svg, vb, p, prefs.gap);
    DZ.lastColorDebug = { point: { x: p.x, y: p.y }, width: source.width, height: source.height,
      candidates: source.regions.length, picked: source.region ? source.region.bbox : null };
    if (!source.region) return dzSetStatus("🪣 La zona no está cerrada · aumentá Cerrar hueco o corregí el contorno");
    const color = e.shiftKey ? (DZ.drawColor || "#1a1a1a") : (DZ.fillColor || "#F0450E");
    const styleIndex = dzFillStyleIndex(color);
    if (existing && !existing.getAttribute("data-low-zone")) existing.setAttribute("data-low-zone", zoneId);
    dzFillPut(svg, source, source.region, vb, zoneId, color, styleIndex, prefs.mode);
    if (DZ.doc?.drawing) changes.push({ levelId: DZ.doc.level.id, number: currentNumber, content: dzCanvasInner() });
    const sourceIndex = targets.findIndex((item) => item.number === currentNumber);
    const sequences = sourceIndex < 0 ? [targets] :
      [targets.slice(sourceIndex + 1), targets.slice(0, sourceIndex).reverse()];
    const totalTargets = sequences.reduce((sum, list) => sum + list.length, 0);
    let propagated = 0, visited = 0;
    // Se sigue hacia adelante y hacia atrás por separado. Mezclar ambos lados
    // en una sola caminata hacía que una pose anterior contaminara la
    // predicción de la pose siguiente.
    for (const sequence of sequences) {
      let reference = source.region, velocity = { x: 0, y: 0 };
      for (const item of sequence) {
        visited++;
        const root = dzFillRoot(item.drawing.content, vb), exact = dzFillFindZone(root, zoneId);
        dzSetStatus(`🪣 Siguiendo zona ${visited}/${totalTargets} · dibujo ${item.number}`);
        if (exact) {
          if (prefs.mode !== "unpainted") {
            dzFillPut(root, null, null, vb, zoneId, color, styleIndex, prefs.mode);
            changes.push({ levelId: item.levelId, number: item.number, content: root.innerHTML }); propagated++;
          }
          continue;
        }
        let analysis;
        try { analysis = await dzFillAnalyze(root, vb, null, prefs.gap); }
        catch (_) { skipped.push({ number: item.number, frame: item.frame, reason: "raster-error" }); continue; }
        const predicted = { x: reference.centroid.x + velocity.x, y: reference.centroid.y + velocity.y };
        const match = coloring.matchRegion(reference, analysis.regions, { ...prefs, predicted });
        if (!match.accepted) { skipped.push({ number: item.number, frame: item.frame, reason: match.reason, confidence: match.confidence }); continue; }
        const previous = reference.centroid;
        if (dzFillPut(root, analysis, match.candidate, vb, zoneId, color, styleIndex, prefs.mode)) {
          changes.push({ levelId: item.levelId, number: item.number, content: root.innerHTML }); propagated++;
        }
        reference = match.candidate;
        velocity = { x: reference.centroid.x - previous.x, y: reference.centroid.y - previous.y };
      }
    }
    const changed = DZ.doc ? DZ.doc.applyDrawingContents(changes, "Colorear zona en varios dibujos") : 1;
    applied = true;
    if (!DZ.doc) dzMarkDirty(); else DZ.dirty = true;
    DZ.lastColorReport = { changed, propagated, skipped, zoneId };
    dzPalCssRender(); dzBuildLayers();
    dzSetStatus(`🪣 ${changed || 1} dibujo(s) coloreados${skipped.length ? ` · ${skipped.length} omitidos por seguridad (Informe)` : " · sin conflictos"}`);
    dzToolOptsRender();
  } catch (err) {
    console.error("LOW coloring", err);
    if (!applied) dzCanvasSet(beforeCanvas);
    dzSetStatus("🪣 No se pudo completar el coloreo · no se modificaron los otros dibujos");
  } finally { DZ.coloringBusy = false; }
}
/* traza los bordes de la máscara en lazos cerrados (borde exterior + huecos) */
function dzTraceMaskJS(mask, w, h) {
  const get = (x, y) => (x >= 0 && y >= 0 && x < w && y < h) ? mask[y * w + x] : 0;
  const adj = new Map();
  const add = (a, b) => {
    let l = adj.get(a); if (!l) { l = []; adj.set(a, l); } l.push(b);
    let m = adj.get(b); if (!m) { m = []; adj.set(b, m); } m.push(a);
  };
  const K = (x, y) => x * (h + 2) + y;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    if (!get(x, y - 1)) add(K(x, y), K(x + 1, y));
    if (!get(x, y + 1)) add(K(x, y + 1), K(x + 1, y + 1));
    if (!get(x - 1, y)) add(K(x, y), K(x, y + 1));
    if (!get(x + 1, y)) add(K(x + 1, y), K(x + 1, y + 1));
  }
  const px = k => Math.floor(k / (h + 2)), py = k => k % (h + 2);
  const used = new Set();
  const ek = (a, b) => a < b ? a + "_" + b : b + "_" + a;
  const loops = [];
  for (const start of adj.keys()) {
    for (const first of adj.get(start)) {
      if (used.has(ek(start, first))) continue;
      used.add(ek(start, first));
      const loop = [start, first]; let prev = start, cur = first, guard = 0;
      while (cur !== start && guard++ < 200000) {
        const nbrs = adj.get(cur) || [];
        let nb = null;
        for (const cd of nbrs) if (cd !== prev && !used.has(ek(cur, cd))) { nb = cd; break; }
        if (nb === null) for (const cd of nbrs) if (!used.has(ek(cur, cd))) { nb = cd; break; }
        if (nb === null) break;
        used.add(ek(cur, nb)); loop.push(nb); prev = cur; cur = nb;
      }
      if (loop.length >= 8) loops.push(loop.map(k => [px(k), py(k)]));
    }
  }
  return loops;
}

/* ══ Regla / Hilo tensado (R): herramienta de línea recta interactiva.
   Clic = punto A  banda elástica hasta el cursor.
   Shift = snapping a 15° (múltiplos de 15°).
   Clic en punto B = crea la línea y reinicia desde B (trazado continuo).
   Escape = cancela la línea en curso.
   Clic derecho = fija un PUNTO DE FUGA (). Si hay al menos uno, al hacer
   clic en A la línea se tensa automáticamente hacia el punto de fuga más
   cercano (como el hilo de OpenToonz). Doble clic en punto de fuga lo borra. ══ */
function dzRulerDown(e) {
  const p = dzToUser(e.clientX, e.clientY);

  // Clic derecho  punto de fuga
  if (e.button === 2) {
    e.preventDefault();
    if (!RULER) RULER = { a: null, el: null, vp: [] };
    // ¿doble clic sobre punto de fuga existente?  borrarlo
    const R = 12 / (DZ.zoom || 1); // radio en unidades de usuario
    for (let i = RULER.vp.length - 1; i >= 0; i--) {
      const v = RULER.vp[i];
      if (Math.hypot(p.x - v.x, p.y - v.y) < R) {
        RULER.vp.splice(i, 1);
        dzRulerRenderVP();
        if (RULER.vp.length === 0 && !RULER.a) { dzRulerClear(); }
        return;
      }
    }
    RULER.vp.push({ x: p.x, y: p.y });
    dzRulerRenderVP();
    return;
  }

  // Clic izquierdo normal
  if (!RULER || !RULER.a) {
    // Primer punto
    if (!RULER) RULER = { a: null, el: null, vp: [] };
    RULER.a = p;
    // preview elástico
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    if (svg && !RULER.el) {
      RULER.el = document.createElementNS(SVGNS, "line");
      RULER.el.setAttribute("stroke", DZ.drawColor || "#F0450E");
      RULER.el.setAttribute("stroke-width", DZ.drawW || 4);
      RULER.el.setAttribute("stroke-linecap", "round");
      RULER.el.setAttribute("stroke-dasharray", "6 4");
      RULER.el.setAttribute("opacity", "0.7");
      RULER.el.setAttribute("data-low", "ruler-guide");
      svg.appendChild(RULER.el);
    }
    dzRulerUpdateElastic(p);
  } else {
    // Segundo punto  crear línea definitiva
    dzSnapshot();
    let bp = p;
    // snapping a punto de fuga si hay
    if (RULER.vp.length > 0 && !e.shiftKey) {
      bp = dzRulerSnapVP(p);
    }
    // snapping a 15° si Shift
    if (e.shiftKey) {
      bp = dzRulerSnapAngle(RULER.a, p);
    }
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    if (svg) {
      const ln = document.createElementNS(SVGNS, "line");
      ln.setAttribute("x1", RULER.a.x); ln.setAttribute("y1", RULER.a.y);
      ln.setAttribute("x2", bp.x); ln.setAttribute("y2", bp.y);
      ln.setAttribute("stroke", DZ.drawColor || "#F0450E");
      ln.setAttribute("stroke-width", DZ.drawW || 4);
      ln.setAttribute("stroke-linecap", "round");
      svg.appendChild(ln);
      dzMirrorClone(ln);
    }
    dzMarkDirty(); dzBuildLayers();
    // continuar desde B (trazado continuo como la pluma de OpenToonz)
    RULER.a = bp;
    dzRulerUpdateElastic(bp);
  }
}

function dzRulerMove(e) {
  const p = dzToUser(e.clientX, e.clientY);
  if (!RULER || !RULER.a) return;
  let bp = p;
  if (RULER.vp.length > 0 && !e.shiftKey) {
    bp = dzRulerSnapVP(p);
  }
  if (e.shiftKey) {
    bp = dzRulerSnapAngle(RULER.a, p);
  }
  dzRulerUpdateElastic(bp);
}

function dzRulerUpdateElastic(p) {
  if (!RULER || !RULER.el || !RULER.a) return;
  RULER.el.setAttribute("x1", RULER.a.x);
  RULER.el.setAttribute("y1", RULER.a.y);
  RULER.el.setAttribute("x2", p.x);
  RULER.el.setAttribute("y2", p.y);
}

function dzRulerSnapAngle(a, p) {
  const dx = p.x - a.x, dy = p.y - a.y;
  const ang = Math.atan2(dy, dx);
  const snap = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12); // 15° = π/12
  const dist = Math.hypot(dx, dy);
  return { x: a.x + dist * Math.cos(snap), y: a.y + dist * Math.sin(snap) };
}

function dzRulerSnapVP(p) {
  if (!RULER || !RULER.vp.length) return p;
  // snap al punto de fuga más cercano
  let best = RULER.vp[0], bestD = Math.hypot(p.x - best.x, p.y - best.y);
  for (let i = 1; i < RULER.vp.length; i++) {
    const d = Math.hypot(p.x - RULER.vp[i].x, p.y - RULER.vp[i].y);
    if (d < bestD) { bestD = d; best = RULER.vp[i]; }
  }
  return best;
}

/* dibuja los puntos de fuga como círculos semitransparentes */
function dzRulerRenderVP() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  // limpiar capa de guías de VP
  let g = svg.querySelector("g.dz-vp-guides");
  if (g) g.remove();
  if (!RULER || !RULER.vp.length) return;
  g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "dz-vp-guides");
  g.setAttribute("data-low", "vp-guide");
  const R = 7 / (DZ.zoom || 1);
  RULER.vp.forEach(vp => {
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("cx", vp.x); c.setAttribute("cy", vp.y);
    c.setAttribute("r", R);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "#FF6B6B");
    c.setAttribute("stroke-width", 2 / (DZ.zoom || 1));
    c.setAttribute("stroke-dasharray", "3 2");
    g.appendChild(c);
    // cruz
    const cr = R * 1.8;
    const l1 = document.createElementNS(SVGNS, "line");
    l1.setAttribute("x1", vp.x - cr); l1.setAttribute("y1", vp.y);
    l1.setAttribute("x2", vp.x + cr); l1.setAttribute("y2", vp.y);
    l1.setAttribute("stroke", "#FF6B6B");
    l1.setAttribute("stroke-width", 1.2 / (DZ.zoom || 1));
    l1.setAttribute("opacity", "0.6");
    g.appendChild(l1);
    const l2 = document.createElementNS(SVGNS, "line");
    l2.setAttribute("x1", vp.x); l2.setAttribute("y1", vp.y - cr);
    l2.setAttribute("x2", vp.x); l2.setAttribute("y2", vp.y + cr);
    l2.setAttribute("stroke", "#FF6B6B");
    l2.setAttribute("stroke-width", 1.2 / (DZ.zoom || 1));
    l2.setAttribute("opacity", "0.6");
    g.appendChild(l2);
  });
  svg.appendChild(g);
}

function dzRulerClear() {
  if (RULER && RULER.el) { RULER.el.remove(); }
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (svg) { const g = svg.querySelector("g.dz-vp-guides"); if (g) g.remove(); }
  RULER = null;
}

/* ═══════════════════════════════════════════════════════════════════════
   HERRAMIENTAS VECTORIALES estilo Toon Boom
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Inflador: seleccioná una forma y arrastrá para inflarla (expandir)
   o Shift+arrastrar para desinflarla (contraer). Escala alrededor del
   centro geométrico con un factor proporcional a la distancia arrastrada. ── */
let INFLATOR = null;   // gesto con geometría original (no acumula error por frame)

const DZ_VECTOR_ATTRS = ["d", "points", "x", "y", "width", "height", "cx", "cy",
  "r", "rx", "ry", "x1", "y1", "x2", "y2", "stroke", "stroke-width",
  "stroke-linejoin", "stroke-linecap"];
function dzVectorRemember(el, journal, attrs = DZ_VECTOR_ATTRS) {
  if (!el || journal.has(el)) return;
  const values = {};
  attrs.forEach(a => { values[a] = el.hasAttribute(a) ? el.getAttribute(a) : null; });
  journal.set(el, values);
}
function dzVectorRestore(journal) {
  if (!journal) return;
  journal.forEach((values, el) => {
    if (!el?.isConnected) return;
    Object.entries(values).forEach(([a, value]) => {
      if(a === "__html") el.innerHTML=value; else if (value == null) el.removeAttribute(a); else el.setAttribute(a, value);
    });
  });
  dzPositionHandle(); dzBuildLayers();
}
function dzVectorBegin(owner, e, state, clear) {
  state.pid = e.pointerId;
  state.journal ||= new Map();
  if (DZPointerController) state.gestureToken = DZPointerController.begin({
    owner: "vector:" + owner, pointerId: e.pointerId,
    cancel: () => { dzVectorRestore(state.journal); clear(); }
  });
  return state;
}
function dzVectorAccept(state, e) {
  if (!state) return false;
  if (state.pid != null && e.pointerId != null && state.pid !== e.pointerId) return false;
  return !DZPointerController || state.gestureToken == null ||
    DZPointerController.accepts(state.gestureToken, state.pid);
}
function dzVectorFinish(state, e) {
  if (!dzVectorAccept(state, e)) return false;
  return !DZPointerController || state.gestureToken == null ||
    DZPointerController.finish(state.gestureToken, state.pid);
}
function dzVectorGestureCancel(reason = "cancel") {
  const active = DZPointerController?.active;
  if (!active || !String(active.owner || "").startsWith("vector:")) return false;
  return DZPointerController.cancel(reason);
}

function dzVectorElementAt(e, shapesOnly = false) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return null;
  let el = e.target?.closest?.("path,line,polyline,polygon,circle,ellipse,rect");
  if (el && svg.contains(el) && !el.closest("[data-locked],g.dz-onion")) {
    if (!shapesOnly || el.tagName.toLowerCase() !== "line") return el;
  }
  return dzPickStroke(e.clientX, e.clientY, 22, true);
}

function dzPointInElement(el, clientX, clientY) {
  try {
    const svg = el.ownerSVGElement, p = svg.createSVGPoint(); p.x = clientX; p.y = clientY;
    return p.matrixTransform(el.getScreenCTM().inverse());
  } catch (_) { return dzToUser(clientX, clientY); }
}

/* EL INFLADOR infla la LINEA —el Pump de OpenToonz—, no la forma: lo pidio
   Mauro. La cuenta y el porque, en ui/vector/inflar-linea.js. */
function dzInflatorDown(e) {
  e.preventDefault(); e.stopPropagation();
  const el = dzPickStroke(e.clientX, e.clientY, 26, true) || DZ.sel || DZ.multi?.[0];
  if (!el) return dzSetStatus("🎈 El inflador trabaja sobre una linea: acercate a un trazo");
  dzSnapshot();
  const journal = new Map(); dzVectorRemember(el, journal);
  if (el.hasAttribute("data-low-brush-points"))
    journal.set(el, { ...journal.get(el), __html: el.innerHTML,
      "data-low-brush-points": el.getAttribute("data-low-brush-points") });
  INFLATOR = dzVectorBegin("inflator", e, { el, journal }, () => { INFLATOR = null; });
  dzInflatorAplicar(e);
}

function dzInflatorAplicar(e) {
  INFLATOR.ultimo = dzInflarPasada(INFLATOR.el, e); INFLATOR.desinflo = !!e.altKey;
  if (INFLATOR.ultimo?.elemento) INFLATOR.el = INFLATOR.ultimo.elemento; dzPositionHandle(); }

function dzInflatorMove(e) {
  if (INFLATOR?.el && dzVectorAccept(INFLATOR, e)) dzInflatorAplicar(e);
}

function dzInflatorUp(e) {
  if (e?.type === "pointercancel") { dzVectorGestureCancel("pointercancel"); return; }
  if (!INFLATOR?.el || !dzVectorFinish(INFLATOR, e)) return;
  dzMarkDirty(); dzBuildLayers();
  dzSetStatus(INFLATOR.ultimo && INFLATOR.ultimo.tipo === "local"
    ? "🎈 Lista: la linea quedo " + (INFLATOR.desinflo ? "mas fina" : "mas gruesa") + " donde pasaste"
    : "🎈 Lista: cambio el grosor de toda la linea");
  INFLATOR = null;
}

/* ── Manejador de contorno: clic en una línea y arrastrá ↕ para cambiar
   el grosor del trazo (stroke-width) en tiempo real. ── */
let HANDLER = null;   // { el, startW }
function dzVectorPrefs() {
  if (DZ.vectorPrefs) return DZ.vectorPrefs;
  let saved = {};
  try { saved = JSON.parse(dzPrefsStorage().getItem("low.2d.vectorTools") || "{}"); } catch (_) { /* valores seguros */ }
  DZ.vectorPrefs = {
    pumpSensitivity: Math.max(1, Math.min(12, +saved.pumpSensitivity || 4)),
    magnetRadius: Math.max(10, Math.min(240, +saved.magnetRadius || 60)),
    magnetStrength: Math.max(.05, Math.min(1, +saved.magnetStrength || .5)),
    ironPasses: Math.max(1, Math.min(5, +saved.ironPasses || 1)),
  };
  return DZ.vectorPrefs;
}
function dzVectorPrefsSet(key, value) {
  const prefs = dzVectorPrefs(); prefs[key] = value;
  try { dzPrefsStorage().setItem("low.2d.vectorTools", JSON.stringify(prefs)); } catch (_) { /* sesión privada */ }
}

/* Elige la LÍNEA (elemento con trazo) más cercana al cursor, no el relleno de
   fondo. Antes las herramientas de línea usaban elementFromPoint crudo  al no
   pegarle justo al trazo fino agarraban el rectángulo de fondo (falso positivo).
   1) si el elemento bajo el cursor tiene trazo, ese; 2) si no, el path/línea
   con stroke MÁS CERCANO dentro de una tolerancia. */
function dzStroked(el) {
  if (!el || !el.getAttribute) return false;
  const s = el.getAttribute("stroke");
  const t = el.tagName.toLowerCase();
  return s && s !== "none" &&
    ["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"].includes(t);
}
function dzEditableVector(el) {
  if (!el || !el.getAttribute) return false;
  const t = el.tagName.toLowerCase();
  if (!["path", "line", "polyline", "polygon", "circle", "ellipse", "rect"].includes(t)) return false;
  return dzStroked(el) || (t === "path" && el.getAttribute("fill") !== "none") ||
    el.getAttribute("data-low") === "brush";
}
function dzPickStroke(clientX, clientY, maxPx, acceptFilled = true) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return null;
  const el = document.elementsFromPoint(clientX, clientY).find(n => !n.closest?.(DZ_UI_SEL)) || null; // a TRAVES de la UI flotante: un tirador de la seleccion tapaba el trazo y la herramienta pedia acercarse
  const atomic = dzAtomicArtwork(el);
  if(atomic && svg.contains(atomic) && !atomic.closest('[data-locked],g.dz-onion') && dzBrushWidthState(atomic)) return atomic;
  if (el && el.closest && el.closest("#dzCanvas svg") && !el.closest("g.dz-onion")) {
    const s = el.closest("path,line,polyline,polygon,circle,ellipse,rect,text");
    if (s && s.tagName.toLowerCase() !== "svg" && (dzStroked(s) || (acceptFilled && dzEditableVector(s)))
        && !s.closest("[data-locked]")) return dzAtomicArtwork(s);
  }
  // nadie con trazo justo debajo  el más cercano por distancia (unidades usuario)
  const tol = maxPx || 16;
  let best = null, bestD = tol;
  svg.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect").forEach(c => {
    if ((!dzStroked(c) && !(acceptFilled && dzEditableVector(c))) || c.closest("[data-locked]") || c.closest("g.dz-onion")) return;
    let L; try { L = c.getTotalLength(); } catch (err) { return; }
    if (!L) return;
    const step = Math.max(1, L / 180), matrix = c.getScreenCTM();
    if (!matrix) return;
    for (let d = 0; d <= L; d += step) {
      const q = c.getPointAtLength(d);
      const sp = c.ownerSVGElement.createSVGPoint(); sp.x = q.x; sp.y = q.y;
      const screen = sp.matrixTransform(matrix);
      const dist = Math.hypot(screen.x - clientX, screen.y - clientY);
      if (dist < bestD) { bestD = dist; best = c; }
    }
  });
  return dzAtomicArtwork(best);
}
function dzHandlerDown(e) {
  e.preventDefault(); e.stopPropagation();
  // buscar la LÍNEA más cercana (no el fondo)
  const strokeEl = dzPickStroke(e.clientX, e.clientY);
  if (!strokeEl) return dzSetStatus("📏 Acercate más a una línea para ajustar su grosor");
  dzSnapshot();
  const journal = new Map(); dzVectorRemember(strokeEl, journal);
  const brushWidth = dzBrushWidthState(strokeEl);
  if(brushWidth) journal.set(strokeEl,{...journal.get(strokeEl),__html:strokeEl.innerHTML,filter:strokeEl.getAttribute("filter"),'data-grosor':strokeEl.getAttribute('data-grosor'),'data-low-brush-size':strokeEl.getAttribute('data-low-brush-size')});
  // Los pinceles variables son cintas rellenas. Darles un contorno del mismo
  // color permite que la bomba ensanche/afine también esos trazos reales.
  if (!brushWidth && !dzStroked(strokeEl) && strokeEl.tagName.toLowerCase() === "path") {
    const colour = strokeEl.getAttribute("fill") || DZ.drawColor || "#111111";
    strokeEl.setAttribute("stroke", colour);
    strokeEl.setAttribute("stroke-linejoin", "round");
    strokeEl.setAttribute("stroke-linecap", "round");
    strokeEl.setAttribute("stroke-width", "0.5");
  }
  const sw = parseFloat(strokeEl.getAttribute("stroke-width") || getComputedStyle(strokeEl).strokeWidth || "2");
  HANDLER = dzVectorBegin("handler", e,
    { el: strokeEl, brushWidth, startW: brushWidth?.size || (isNaN(sw) ? 2 : sw), startY: e.clientY, journal },
    () => { HANDLER = null; });
  dzSetStatus("📏 Manejador — arrastrá ↕ para engrosar/afinar el trazo");
}

function dzHandlerMove(e) {
  // se llama desde el move global — lo manejamos en dzDrawMove
}

function dzHandlerUp(e) {
  if (e?.type === "pointercancel") { dzVectorGestureCancel("pointercancel"); return; }
  if (!HANDLER?.el || !dzVectorFinish(HANDLER, e)) return;
  dzMarkDirty(); dzBuildLayers(); dzSetStatus("📏 Grosor ajustado");
  HANDLER = null;
}

/* handler se procesa en el mousemove global porque no usa DRAW_TRACK */
function dzHandlerGlobalMove(e) {
  if (!HANDLER?.el || !dzVectorAccept(HANDLER, e)) return;
  const dy = HANDLER.startY - e.clientY;
  const newW = Math.max(0.5, Math.min(200, HANDLER.startW + dy / dzVectorPrefs().pumpSensitivity));
  if(HANDLER.brushWidth) dzBrushWidthApply(HANDLER.el,HANDLER.brushWidth,newW); else HANDLER.el.setAttribute("stroke-width", newW.toFixed(1));
  dzSetStatus("📏 Grosor: " + newW.toFixed(1) + "px");
}

/* ── Plancha: pasá sobre un trazo para suavizarlo progresivamente.
   Cada pasada aplica media móvil  RDP  Catmull-Rom igual que el lápiz. ── */

function dzIronDown(e) {
  e.preventDefault(); e.stopPropagation();
  const el = dzPickStroke(e.clientX, e.clientY);
  if (!el) return dzSetStatus(" Acercate a un trazo para suavizarlo");
  dzSnapshot();
  IRON = dzVectorBegin("iron", e,
    { active:true, lastEl:null, lastX:e.clientX, lastY:e.clientY, journal:new Map() },
    () => { IRON = null; });
  dzIronApply(e);
}

let IRON = null;
function dzIronApply(e) {
  if (!IRON?.active || !dzVectorAccept(IRON, e)) return;
  if (IRON.lastEl && Math.hypot(e.clientX - IRON.lastX, e.clientY - IRON.lastY) < 5) return;
  const el = dzPickStroke(e.clientX, e.clientY, 24);
  if (!el) return;
  dzVectorRemember(el, IRON.journal, ["d", "points"]);
  for (let i = 0; i < dzVectorPrefs().ironPasses; i++) dzIronSmooth(el, false, false);
  IRON.lastEl = el; IRON.lastX = e.clientX; IRON.lastY = e.clientY;
  dzPositionHandle();
}
function dzIronUp(e) {
  if (e?.type === "pointercancel") { dzVectorGestureCancel("pointercancel"); return; }
  if (!IRON?.active || !dzVectorFinish(IRON, e)) return;
  dzMarkDirty(); dzBuildLayers(); dzSetStatus(" Planchado aplicado");
  IRON = null;
}

function dzIronSmooth(el, snapshot = true, finish = true) {
  if (snapshot) dzSnapshot();
  const tag = el.tagName.toLowerCase();
  if (tag === "path") {
    const d = el.getAttribute("d") || "";
    let pts = null;
    try {
      const length = el.getTotalLength(), count = Math.max(8, Math.min(160, Math.ceil(length / 6)));
      pts = Array.from({length:count + 1}, (_, i) => {
        const p = el.getPointAtLength(length * i / count); return [p.x, p.y, .5];
      });
    } catch (_) { pts = dzPathToPoints(d); }
    if (!pts || pts.length < 4) return;
    const refined = dzRefineStroke(pts);
    el.setAttribute("d", dzSmoothPath(refined) + (/\s*[zZ]\s*$/.test(d) ? " Z" : ""));
  } else if (tag === "polyline") {
    const ptsRaw = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
    const pts = [];
    for (let i = 0; i + 1 < ptsRaw.length; i += 2)
      pts.push([ptsRaw[i], ptsRaw[i + 1], 0.5]);
    const refined = dzRefineStroke(pts);
    el.setAttribute("points", refined.map(p => Math.round(p[0] * 10) / 10 + " " + Math.round(p[1] * 10) / 10).join(" "));
  }
  if (finish) { dzMarkDirty(); dzBuildLayers(); }
  dzSetStatus(" Plancha — pasá varias veces para alisar más");
}

/* convierte el atributo d de un path a array de puntos [x,y,pr] */
function dzPathToPoints(d) {
  const cmds = dzPathParse(d);
  if (!cmds) return null;
  const pts = [];
  for (const s of cmds) {
    if (s.c === "Z") continue;
    pts.push([s.n[s.n.length - 2], s.n[s.n.length - 1], 0.5]);
  }
  return pts;
}

/* ── Pinza: clic en el borde de un trazado para cortarlo en dos.
   Encuentra el punto más cercano del path al clic y lo parte ahí. ── */

function dzPliersDown(e) {
  e.preventDefault(); e.stopPropagation();
  const pathEl = dzPickStroke(e.clientX, e.clientY);
  if (!pathEl || pathEl.tagName.toLowerCase() !== "path")
    return dzSetStatus("✂ Acercate al borde de un trazado (path) para cortarlo");
  dzSnapshot();
  const p = dzPointInElement(pathEl, e.clientX, e.clientY);
  const cmds = dzPathParse(pathEl.getAttribute("d") || "");
  if (!cmds || cmds.length < 2) return;
  // encontrar el segmento más cercano al clic
  let bestSeg = -1, bestDist = Infinity, bestT = 0.5;
  for (let i = 0; i < cmds.length - 1; i++) {
    const s1 = cmds[i], s2 = cmds[i + 1];
    if (s1.c === "Z" || s2.c === "Z") continue;
    const x1 = s1.n[s1.n.length - 2], y1 = s1.n[s1.n.length - 1];
    const x2 = s2.n[s2.n.length - 2], y2 = s2.n[s2.n.length - 1];
    // punto más cercano en segmento
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / L2)) : 0.5;
    const cx = x1 + t * dx, cy = y1 + t * dy;
    const d = Math.hypot(p.x - cx, p.y - cy);
    if (d < bestDist) { bestDist = d; bestSeg = i; bestT = t; }
  }
  if (bestSeg < 0 || bestDist > 25 / (DZ.zoom || 1)) return dzSetStatus("✂ Muy lejos del trazo — acercate más al borde");
  // partir el path en bestSeg
  const s1 = cmds[bestSeg], s2 = cmds[bestSeg + 1];
  const x1 = s1.n[s1.n.length - 2], y1 = s1.n[s1.n.length - 1];
  const x2 = s2.n[s2.n.length - 2], y2 = s2.n[s2.n.length - 1];
  const mx = x1 + bestT * (x2 - x1), my = y1 + bestT * (y2 - y1);
  // primer path: desde 0 hasta bestSeg + punto de corte
  const cmds1 = cmds.slice(0, bestSeg + 1);
  const lastCmd = cmds1[cmds1.length - 1];
  lastCmd.n[lastCmd.n.length - 2] = mx;
  lastCmd.n[lastCmd.n.length - 1] = my;
  // segundo path: M al punto de corte + resto
  const cmds2 = [{ c: "M", n: [mx, my] }];
  // modificar el primer comando del resto para que empiece desde el corte
  const restStart = cmds[bestSeg + 1];
  restStart.n[restStart.n.length - 2] = x2;  // mantener el final igual
  restStart.n[restStart.n.length - 1] = y2;
  // arrancar el resto con M en el corte
  cmds2.push({ c: "L", n: [x2, y2] });
  for (let i = bestSeg + 2; i < cmds.length; i++) cmds2.push(cmds[i]);
  // crear los dos paths nuevos
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const NS = "http://www.w3.org/2000/svg";
  const el1 = document.createElementNS(NS, "path");
  el1.setAttribute("d", dzPathBuild(cmds1));
  copyStyle(pathEl, el1);
  const el2 = document.createElementNS(NS, "path");
  el2.setAttribute("d", dzPathBuild(cmds2));
  copyStyle(pathEl, el2);
  pathEl.parentNode.insertBefore(el1, pathEl);
  pathEl.parentNode.insertBefore(el2, pathEl);
  pathEl.remove();
  dzSelect(el1);
  dzMarkDirty(); dzBuildLayers();
  dzSetStatus("✂ Trazo cortado en dos — el primero queda seleccionado");
}

function copyStyle(src, dst) {
  for (const attr of ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "opacity", "data-low"]) {
    const v = src.getAttribute(attr);
    if (v) dst.setAttribute(attr, v);
  }
}

/* ── Imán: deforma los vértices cercanos de TODOS los trazados visibles.
   Clic y arrastrá: los puntos dentro del radio son atraídos hacia el cursor.
   Como el magnet warp de Toon Boom. ── */
let MAGNET = null;   // { active, radius }

function dzMagnetDown(e) {
  e.preventDefault(); e.stopPropagation();
  dzSnapshot();
  MAGNET = dzVectorBegin("magnet", e,
    { active: true, radius: dzVectorPrefs().magnetRadius / (DZ.zoom || 1), journal:new Map() },
    () => { MAGNET = null; });
  // Sin ancla cerca no movia NADA y decia «Deformacion aplicada»: se agrega el punto que falta (ui/vector/puntos-linea.js).
  MAGNET.agrego = dzMagnetAsegurarAncla(dzPickStroke(e.clientX, e.clientY, 26, true), e, MAGNET);
  dzMagnetApply(e);
  dzSetStatus("🧲 Imán activo — arrastrá para deformar · soltá para terminar");
}

function dzMagnetMove(e) {
  if (!MAGNET?.active || !dzVectorAccept(MAGNET, e)) return;
  dzMagnetApply(e);
}

function dzMagnetApply(e) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const paths = svg.querySelectorAll("path,polygon,polyline,line");
  let moved = 0;
  for (const el of paths) {
    if (el.closest("g.dz-onion") || el.closest("[data-locked]")) continue;
    const p = dzPointInElement(el, e.clientX, e.clientY);
    // Radio expresado en coordenadas locales del elemento, incluso si la capa
    // está trasladada, rotada o escalada.
    let localRadius = MAGNET.radius;
    try {
      const m = el.getScreenCTM();
      const pxPerUnit = Math.max(.001, (Math.hypot(m.a, m.b) + Math.hypot(m.c, m.d)) / 2);
      localRadius = dzVectorPrefs().magnetRadius / pxPerUnit;
    } catch (_) { /* usar radio del lienzo */ }
    const r2 = localRadius * localRadius;
    const tag = el.tagName.toLowerCase();
    dzVectorRemember(el, MAGNET.journal, tag === "path" ? ["d"] :
      (tag === "line" ? ["x1","y1","x2","y2"] : ["points"]));
    if (tag === "path") {
      const cmds = dzPathParse(el.getAttribute("d") || "");
      if (!cmds) continue;
      let dirty = false;
      for (const s of cmds) {
        if (s.c === "Z") continue;
        const lx = s.n[s.n.length - 2], ly = s.n[s.n.length - 1];
        const dx = p.x - lx, dy = p.y - ly;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2) {
          const force = 1 - Math.sqrt(d2) / localRadius;
          s.n[s.n.length - 2] = lx + dx * force * dzVectorPrefs().magnetStrength;
          s.n[s.n.length - 1] = ly + dy * force * dzVectorPrefs().magnetStrength;
          dirty = true; moved++;
        }
      }
      if (dirty) el.setAttribute("d", dzPathBuild(cmds));
    } else if (tag === "polygon" || tag === "polyline") {
      const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      let dirty = false;
      for (let i = 0; i + 1 < pts.length; i += 2) {
        const dx = p.x - pts[i], dy = p.y - pts[i + 1];
        if (dx * dx + dy * dy < r2) {
          const force = 1 - Math.hypot(dx, dy) / localRadius;
          pts[i] += dx * force * dzVectorPrefs().magnetStrength;
          pts[i + 1] += dy * force * dzVectorPrefs().magnetStrength;
          dirty = true; moved++;
        }
      }
      if (dirty) el.setAttribute("points", pts.map(v => Math.round(v * 100) / 100).join(" "));
    } else if (tag === "line") {
      for (const attr of ["x1", "y1", "x2", "y2"]) {
        const v = +el.getAttribute(attr);
        const isY = attr[0] === "y";
        const dx = p.x - (isY ? (+el.getAttribute(attr === "y1" ? "x1" : "x2")) : v);
        const dy = p.y - (isY ? v : (+el.getAttribute(attr === "x1" ? "y1" : "y2")));
        if (dx * dx + dy * dy < r2) {
          const force = 1 - Math.hypot(dx, dy) / localRadius;
          if (isY) el.setAttribute(attr, v + dy * force * dzVectorPrefs().magnetStrength);
          else el.setAttribute(attr, v + dx * force * dzVectorPrefs().magnetStrength);
          moved++;
        }
      }
    }
  }
  if (moved) dzSetStatus("🧲 Imán — " + moved + " puntos afectados");
}

function dzMagnetUp(e) {
  if (e?.type === "pointercancel") { dzVectorGestureCancel("pointercancel"); return; }
  if (!MAGNET?.active || !dzVectorFinish(MAGNET, e)) return;
  dzMarkDirty(); dzBuildLayers(); dzSetStatus("🧲 Deformación aplicada");
  MAGNET = null;
}

/* ═══════════════════════════════════════════════════════════════════════
   MESA GIRATORIA (disco de animación): dial en pantalla para rotar la
   vista como un animador tradicional. Se arrastra el disco para girar
   libremente la vista del lienzo.
   ═══════════════════════════════════════════════════════════════════════ */

function dzDiscToggle() {
  let disc = $("#dzDisc");
  if (disc) { disc.hidden = !disc.hidden; return; }
  disc = document.createElement("div");
  disc.id = "dzDisc"; disc.className = "dz-disc";
  disc.innerHTML = '<div class="dz-disc-notch" id="dzDiscNotch"></div>' +
    '<div class="dz-disc-inner"></div>' +
    '<div class="dz-disc-dial" id="dzDiscDial">0°</div>' +
    '<div class="dz-disc-peg"><div></div><div></div><div></div></div>';
  disc.title = "Mesa giratoria: arrastrá para rotar la vista · Shift: de a 15°";
  $("#dzCanvas").appendChild(disc);

  let startAngle = 0, startRot = 0;
  disc.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    const pointerId = e.pointerId;
    const rect = disc.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
    startRot = DZ.viewRot || 0;
    const move = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
      let delta = angle - startAngle;
      if (ev.shiftKey) delta = Math.round(delta / 15) * 15;
      DZ.viewRot = (startRot + delta) % 360;
      dzApplyZoom();
      // rotar la muesca visual
      const notch = $("#dzDiscNotch");
      if (notch) notch.style.transform = `rotate(${DZ.viewRot}deg)`;
      const dial = $("#dzDiscDial");
      if (dial) dial.textContent = Math.round(DZ.viewRot) + "°";
    };
    const up = (ev) => {
      if (ev.pointerId !== pointerId) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  });
  dzSetStatus(" Mesa giratoria activa — arrastrá el disco para girar la vista");
}

/* ══ animación: línea de tiempo + papel cebolla (cuadros _f001.svg…) ══ */
DZ.anim = null;   // {frames:[rutas], idx, playing, onion, cache:{}}
function dzIsPanelDetached(kind) {
  return !!(DZ.detached?.has(kind) || DZ.detachedAnimationPanels?.has(kind));
}
function dzTimelineReveal() {
  const panel = $("#dzTimeline");
  if (panel) panel.hidden = dzIsPanelDetached("timeline");
}

async function dzAnimToggle() {
  const bar = $("#dzTimeline");
  if (DZ.anim) {
    dzAnimStop(); bar.hidden = true; DZ.anim = null; dzOnionClear();
    dzXsSetVisible(false);
    $("#dzOnionPanel").hidden = true;
    $("#dzLevelStrip").hidden = true;
    $("#dzTlGrid").hidden = true;   // el grid de capas vive con la timeline
    dzAnimationDock(false);
    if (DZ.camMode) { DZ.camMode = false; $("#dzCamBtn").classList.remove("active"); $("#dzCam").hidden = true; $("#tlCamKey").hidden = true; }
    return;
  }
  if (!DZ.path && !DZ.doc) return sysMsg("Abrí o creá un documento primero («Nuevo documento», 🖋, o un .svg del árbol).");
  if (DZ.path) {   // UN .low NO TIENE DZ.path: sus cuadros viven en el documento. Persistir, make_frame y releer el arbol es el camino viejo del .svg suelto; con una escena abierta hay que saltearlo o la Timeline NO SE ENCIENDE y el espacio de Animacion no muestra nada —«el panel de animacion no muestra nada», lo vio Mauro con un documento nuevo—.
    await dzPersist(); let r = await api.make_frame(DZ.path);
    if (r && r.error) return sysMsg(" " + r.error);
    if (r.path !== DZ.path) { try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ } await openDesign(r.path); }
  }
  DZ.anim = { frames: [], idx: 0, playing: false, onion: false, cache: {} };
  dzAnimationDock(true);
  $("#dzOnionPanel").hidden = true;
  $("#tlOnion").classList.remove("active");
  // cargar la escena (claves de cámara/dibujo, easing) que vive junto a los cuadros
  const sc = DZ.path ? await api.scene_get(DZ.path) : null;   // la escena de un .low ya esta en el documento
  DZ.scene = (sc && sc.scene) || {};
  DZ.sceneHistory = new LOW.animation.History(180);
  dzTimelineReveal();
  // Sala Timeline de OpenToonz: visor arriba, transporte y editor de niveles ×
  // fotogramas acoplado abajo. La X-sheet vertical es una vista alternativa.
  dzAnimSetView("timeline");
  await dzTimelineRefresh();
  dzOnionUpdate();
  dzCamOverlay();
}
async function dzTimelineRefresh() {
  // Modelo nuevo (LowDoc): la barra de chips es una VISTA del modelo, igual que
  // la timeline y la xsheet. Si ya hay documento, se renderiza desde él y las
  // tres vistas muestran exactamente lo mismo (una sola fuente de verdad).
  if (DZ.doc) { dzTlFramesRender(); return; }
  const r = await api.list_frames(DZ.path);
  DZ.anim.frames = (r && r.frames) || [];
  DZ.anim.idx = DZ.anim.frames.indexOf(DZ.path);
  const box = $("#tlFrames");
  box.innerHTML = "";
  DZ.anim.frames.forEach((f, i) => {
    const c = document.createElement("div");
    c.className = "tl-frame" + (i === DZ.anim.idx ? " cur" : "");
    c.innerHTML = '<span class="tl-n">' + (i + 1) + "</span>";
    c.title = f.split(/[\\/]/).pop();
    c.onclick = () => dzGoFrame(i);
    box.appendChild(c);
    dzThumbInto(c, f, i);       // miniatura async (no bloquea la barra)
  });
  $("#tlInfo").textContent = DZ.anim.frames.length + " cuadro(s)";
  dzTimelineBadges();
  dzSbFrame();
  dzXsRender();
  if (!$("#dzTlGrid").hidden) dzTlGridRender();   // timeline por capas al día
}
/* Barra de chips (#tlFrames) como VISTA del modelo LowDoc: un chip por frame
   del rango de la escena. Muestra el número de frame, el drawing expuesto en la
   capa activa (o vacío) y una miniatura directa del dibujo EN MEMORIA (sin ir a
   disco). Es la misma fuente de verdad que la timeline y la xsheet. */
function dzTlFramesRender() {
  const box = $("#tlFrames");
  if (!box || !DZ.doc) return;
  const doc = DZ.doc, sc = doc.scene;
  const rango = sc.playRange();
  const total = Math.max(rango.out, doc.frame, sc.lastFrame() || 1) + 6;
  box.innerHTML = "";
  for (let i = 1; i <= total; i++) {
    const c = document.createElement("div");
    c.className = "tl-frame" + (i === doc.frame ? " cur" : "");
    const dw = sc.drawingAt(doc.layerId, i);
    const num = dw ? dw.number : null;
    c.innerHTML = '<span class="tl-n">' + i + "</span>";
    c.title = "Frame " + i + (num != null ? " · drawing " + num : " · vacío");
    c.onclick = () => dzGoFrame(i - 1);
    box.appendChild(c);
    if (num != null) dzTlThumbFromDoc(c, i);
  }
  $("#tlInfo").textContent = total + " cuadro(s)";
  dzTimelineBadges();
  dzSbFrame();
  dzXsRender();
  if (!$("#dzTlGrid").hidden) dzTlGridRender();   // timeline por capas al día
}
/* miniatura de un chip desde el dibujo del modelo (SVG ya en memoria) */
function dzTlThumbFromDoc(chip, frame) {
  const doc = DZ.doc;
  const dw = doc.scene.drawingAt(doc.layerId, frame);
  if (!dw || !dw.content) return;
  const tmp = document.createElement("div"); tmp.innerHTML = dw.content;
  const svg = tmp.querySelector("svg");
  if (!svg) return;
  svg.removeAttribute("width"); svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const th = document.createElement("div");
  th.className = "tl-thumb"; th.appendChild(svg);
  chip.insertBefore(th, chip.firstChild);
}
/* actualiza SOLO el chip activo y los badges (barato: se llama en cada cambio
   de frame, sin re-renderizar toda la barra) */
function dzTlFramesSync() {
  if (!DZ.doc) return;
  const box = $("#tlFrames");
  if (!box) return;
  box.querySelectorAll(".tl-frame").forEach((c, i) =>
    c.classList.toggle("cur", i + 1 === DZ.doc.frame));
  dzTimelineBadges();
}
/* miniatura del cuadro dentro del chip de la timeline (estilo X-sheet) */
async function dzThumbInto(chip, f, i) {
  let txt = DZ.anim && DZ.anim.cache[f];
  if (!txt) {
    if (i === DZ.anim.idx) {                        // el actual: lo que se ve en vivo
      const svg = $("#dzCanvas").querySelector(":scope > svg");
      if (svg) txt = dzSerialize(svg);
    } else {
      const r = await api.image_data(f);
      txt = r && r.svg;
    }
    if (DZ.anim && txt) DZ.anim.cache[f] = txt;
  }
  if (!txt || !chip.isConnected) return;
  const tmp = document.createElement("div"); tmp.innerHTML = txt;
  const svg = tmp.querySelector("svg");
  if (!svg) return;
  svg.removeAttribute("width"); svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  const th = document.createElement("div");
  th.className = "tl-thumb"; th.appendChild(svg);
  chip.insertBefore(th, chip.firstChild);
}

/* ══ insertar cuadro DESPUÉS del actual (⎀) — Shift: en blanco ══ */
async function dzFrameInsert(blank) {
  // Modelo nuevo: insertar una celda (vacía o copia del dibujo actual).
  if (DZ.doc) {
    const ly = DZ.doc.layer;
    if (!ly || ly.locked) return dzSetStatus("Capa bloqueada o sin capa activa");
    const f = DZ.doc.frame;
    const actual = ly.cellAt(f);
    DZ.doc.apply("insert", f, 1);          // corre lo que sigue hacia adelante
    if (!blank && actual != null) DZ.doc.setCell(f, actual);
    dzSetStatus(blank ? " Celda vacía insertada en " + f : " Frame " + f + " duplicado");
    return;
  }
  if (!DZ.anim) return;
  await dzPersist();
  let content = null;
  if (blank) {
    // cuadro en blanco: conservar SOLO el fondo (el rect que cubre el lienzo)
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    if (svg) {
      const c = svg.cloneNode(true);
      const vb = (c.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
      const area = (vb[2] || 1) * (vb[3] || 1);
      [...c.children].forEach(n => {
        const t = n.tagName.toLowerCase();
        if (t === "defs" || t === "style") return;
        const isBg = t === "rect" &&
          ((+n.getAttribute("width") || 0) * (+n.getAttribute("height") || 0)) >= area * 0.9;
        if (!isBg) n.remove();
      });
      c.classList.remove("dz-sel");
      content = c.outerHTML;
    }
  }
  const r = await api.insert_frame(DZ.path, content);
  if (r && r.error) return sysMsg(" " + r.error);
  DZ.anim.cache = {};                                // los números se corrieron
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await openDesign(r.path);
  dzTimelineReveal();
  await dzTimelineRefresh();
  dzOnionUpdate();
}

/* ══ 🪄 intercalado: genera el cuadro intermedio entre el actual y el
   siguiente interpolando los elementos que coinciden (por orden y tipo):
   posición, tamaño, colores, opacidad, transform y trazados compatibles ══ */
function dzLerp(a, b, t) { return a + (b - a) * t; }
function dzLerpColor(a, b, t) {
  const pa = dzHex(a), pb = dzHex(b);
  if (!pa || !pb) return t < 0.5 ? a : b;
  const na = parseInt(pa.slice(1), 16), nb = parseInt(pb.slice(1), 16);
  const r = Math.round(dzLerp(na >> 16, nb >> 16, t));
  const g = Math.round(dzLerp((na >> 8) & 255, (nb >> 8) & 255, t));
  const bl = Math.round(dzLerp(na & 255, nb & 255, t));
  return "#" + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0");
}
/* interpola dos strings numéricos con la MISMA estructura (d de path, points,
   transform): si los no-números difieren, devuelve null */
function dzLerpNums(a, b, t) {
  const rx = /-?[\d.]+(?:e-?\d+)?/g;
  if (a.replace(rx, "#") !== b.replace(rx, "#")) return null;
  const nb = (b.match(rx) || []).map(Number);
  let i = 0;
  return a.replace(rx, (m) => {
    const v = dzLerp(parseFloat(m), nb[i++], t);
    return String(Math.round(v * 100) / 100);
  });
}
const DZ_TWEEN_NUM = ["x", "y", "cx", "cy", "r", "rx", "ry", "width", "height",
                      "x1", "y1", "x2", "y2", "font-size", "stroke-width", "opacity"];
const DZ_TWEEN_COL = ["fill", "stroke"];
const DZ_TWEEN_STR = ["d", "points", "transform"];
/* ── INBETWEEN VECTORIAL (morphing de contornos, estilo Toon Boom) ──────────
   Re-muestrea un path `d` en N puntos equiespaciados por longitud (funciona en
   paths desconectados del DOM) para poder MORPHEAR dos dibujos DISTINTOS: sin
   esto, la interpolación solo servía entre trazados de estructura idéntica. */
function dzSamplePathD(d, N) {
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", d);
  let L; try { L = p.getTotalLength(); } catch (e) { return null; }
  if (!L) return null;
  const out = [];
  for (let i = 0; i < N; i++) {
    const pt = p.getPointAtLength(L * i / (N - 1));
    out.push([pt.x, pt.y]);
  }
  return out;
}
/* morphea el atributo d de AB en el instante t re-muestreando ambos a N puntos.
   Corrige el sentido del recorrido (si está invertido, la interpolación cruzaría
   fea) quedándose con la orientación de menor distancia total. */
function dzMorphD(da, db, t, N) {
  N = N || 64;
  const pa = dzSamplePathD(da, N), pb = dzSamplePathD(db, N);
  if (!pa || !pb) return null;
  const dist = (A, B) => { let s = 0; for (let i = 0; i < N; i++) s += Math.hypot(A[i][0] - B[i][0], A[i][1] - B[i][1]); return s; };
  const pbRev = [...pb].reverse();
  const B = dist(pa, pb) <= dist(pa, pbRev) ? pb : pbRev;
  const pts = [];
  for (let i = 0; i < N; i++)
    pts.push([Math.round(dzLerp(pa[i][0], B[i][0], t) * 100) / 100,
              Math.round(dzLerp(pa[i][1], B[i][1], t) * 100) / 100]);
  return dzSmoothPath(pts);
}
function dzTweenEl(a, b, t) {
  const out = a.cloneNode(true);
  DZ_TWEEN_NUM.forEach(k => {
    const va = a.getAttribute(k), vb = b.getAttribute(k);
    if (va !== null && vb !== null && va !== vb)
      out.setAttribute(k, String(Math.round(dzLerp(parseFloat(va), parseFloat(vb), t) * 100) / 100));
  });
  DZ_TWEEN_COL.forEach(k => {
    const va = a.getAttribute(k), vb = b.getAttribute(k);
    if (va && vb && va !== vb) out.setAttribute(k, dzLerpColor(va, vb, t));
  });
  DZ_TWEEN_STR.forEach(k => {
    const va = a.getAttribute(k), vb = b.getAttribute(k);
    if (va && vb && va !== vb) {
      let v = dzLerpNums(va, vb, t);
      // estructura distinta + es un path  MORPH real por re-muestreo (inbetween)
      if (!v && k === "d") v = dzMorphD(va, vb, t);
      if (v) out.setAttribute(k, v);
    }
  });
  // recursivo en hijos que coinciden (grupos, brush)
  const ka = [...out.children], kb = [...b.children];
  for (let i = 0; i < Math.min(ka.length, kb.length); i++)
    if (ka[i].tagName === kb[i].tagName)
      ka[i].replaceWith(dzTweenEl(ka[i], kb[i], t));
  return out;
}
/* construye el SVG interpolado entre el cuadro actual (A) y el siguiente (B)
   en el instante t (0..1). Devuelve {svg, matched} o null. */
function dzTweenBuild(svgA, svgB, t) {
  const ca = [...svgA.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())
    && !(n.classList && n.classList.contains("dz-onion")));
  const cb = [...svgB.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase()));
  const mid = svgA.cloneNode(false);
  [...svgA.children].forEach(n => {
    if (DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())) mid.appendChild(n.cloneNode(true));
  });
  // emparejar AB: primero por id (aunque cambie el orden), luego por posición
  const usedB = new Set();
  const partner = (a, i) => {
    if (a.id) {
      const byId = cb.find((n, j) => !usedB.has(j) && n.id === a.id && n.tagName === a.tagName);
      if (byId) { usedB.add(cb.indexOf(byId)); return byId; }
    }
    if (cb[i] && !usedB.has(i) && cb[i].tagName === a.tagName) { usedB.add(i); return cb[i]; }
    return null;
  };
  let matched = 0;
  for (let i = 0; i < ca.length; i++) {
    const b = partner(ca[i], i);
    if (b) { mid.appendChild(dzTweenEl(ca[i], b, t)); matched++; }
    else mid.appendChild(ca[i].cloneNode(true));    // sin par: queda como en A
  }
  mid.classList.remove("dz-sel");
  return { svg: mid.outerHTML.replace(/ class=""/g, ""), matched };
}
/* 🪄 modal: cuántos intermedios y con qué curva (interpolación de OpenToonz) */
function dzTweenModal() {
  if (!DZ.doc && !DZ.anim) return;
  // con el modelo, dzTweenRun verifica él mismo si hay un dibujo siguiente
  if (!DZ.doc && !DZ.anim.frames[DZ.anim.idx + 1])
    return sysMsg("🪄 No hay cuadro siguiente — el intercalado va ENTRE dos cuadros (pará en el primero de los dos)");
  openModal(`<h2>🪄 Intercalar (inbetween)</h2>
    <div class="sub">Genera los cuadros intermedios entre ESTE dibujo y el siguiente.
    Interpola posición, tamaño y color, y MORPHEA los contornos aunque sean dibujos
    distintos (re-muestreo estilo Toon Boom). Emparejá las capas por nombre (mismo
    id en los dos cuadros) para que morpheen los trazos correctos.</div>
    <div class="dz-style-row">
      <span class="dz-hint">Cantidad</span>
      <input type="number" id="twN" class="dz-win" value="1" min="1" max="8">
      <span class="dz-hint">Curva</span>
      <select id="twEase" class="langsel">
        <option value="linear">Lineal (ritmo parejo)</option>
        <option value="in">Ease in (arranca lento)</option>
        <option value="out">Ease out (frena suave)</option>
        <option value="inout" selected>Ease in-out (natural)</option>
      </select>
    </div>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="twGo">🪄 Intercalar</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  $("#twGo").onclick = () => {
    const n = Math.max(1, Math.min(8, +$("#twN").value || 1));
    const ease = $("#twEase").value;
    closeModal();
    dzTweenRun(n, ease);
  };
}
async function dzTweenRun(n, ease) {
  // Modelo nuevo: intercalar crea dibujos intermedios EN MEMORIA y los expone
  // entre el dibujo actual y el siguiente distinto, sin tocar el disco. Todo
  // queda en UNA sola entrada de historial (Ctrl+Z revierte el intercalado).
  if (DZ.doc) {
    dzDocCommit();
    const doc = DZ.doc, sc = doc.scene, ly = doc.layer, lv = doc.level;
    if (!ly || !lv || ly.locked) return dzSetStatus("Capa bloqueada o sin capa activa");
    const f0 = doc.frame;
    const dwA = sc.drawingAt(doc.layerId, f0);
    if (!dwA) return dzSetStatus("El frame actual está vacío: no hay de dónde intercalar");
    let f1 = null, dwB = null;
    for (let f = f0 + 1; f <= (sc.lastFrame() || 1) + 1; f++) {
      const d = sc.drawingAt(doc.layerId, f);
      if (d && d !== dwA) { f1 = f; dwB = d; break; }
    }
    if (!dwB || f1 == null)
      return dzSetStatus("🪄 No hay cuadro siguiente — el intercalado va ENTRE dos cuadros (pará en el primero de los dos)");
    const vb = dzVB();
    const wrap = (content) => {
      const tmp = document.createElement("div");
      tmp.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(" ")}">${content}</svg>`;
      return tmp.querySelector("svg");
    };
    const svgA = wrap(dwA.content), svgB = wrap(dwB.content);
    const fn = DZ_EASES[ease] || DZ_EASES.inout;
    // generar TODOS los intermedios primero, sin tocar la capa: si falla, no
    // queda una celda vacía a medias.
    const mids = [];
    let matched = 0;
    for (let k = 0; k < n; k++) {
      const t = fn((k + 1) / (n + 1));
      const b = dzTweenBuild(svgA, svgB, t);
      if (!b) break;
      matched = b.matched;
      const tmp2 = document.createElement("div"); tmp2.innerHTML = b.svg;
      const midSvg = tmp2.querySelector("svg");
      mids.push(midSvg ? midSvg.innerHTML : "");
    }
    if (!mids.length) return dzSetStatus(" No pude generar los intermedios");
    doc.history.begin("Intercalar");
    doc.apply("insert", f1, mids.length);          // corre el dibujo B hacia adelante
    const creados = [];
    mids.forEach((inner, k) => {
      const num = lv.nextNumber();
      lv.addDrawing(num, inner);
      creados.push({ num, content: inner });
      doc.setCell(f1 + k, num);
    });
    // los dibujos creados también entran al historial: Ctrl+Z no puede dejar
    // dibujos huérfanos en el nivel (revierte celdas Y material juntos).
    if (doc.history && creados.length) {
      const docRef = doc, lvId = lv.id;
      doc.history.push({
        label: "Crear dibujos intermedios", domain: "anim", before: null, after: creados,
        apply: (dir) => {
          const l = docRef.scene.level(lvId);
          if (!l) return;
          if (dir === "undo") creados.forEach((c) => l.removeDrawing(c.num));
          else creados.forEach((c) => l.addDrawing(c.num, c.content));
          docRef.emit("level");
        },
      });
    }
    doc.history.commit();
    doc.goTo(f1 + mids.length);
    dzTlFramesRender();
    dzOnionRender();
    dzSetStatus("🪄 " + mids.length + " cuadro(s) intermedio(s) creados (" + matched +
      " elementos interpolados, curva " + ease + "). El papel cebolla te muestra el arco.");
    return;
  }
  await dzPersist();
  const next = DZ.anim.frames[DZ.anim.idx + 1];
  const svgA = $("#dzCanvas").querySelector(":scope > svg");
  const rb = await api.image_data(next);
  if (!svgA || !rb || !rb.svg) return sysMsg(" No pude leer los dos cuadros");
  const tmp = document.createElement("div"); tmp.innerHTML = rb.svg;
  const svgB = tmp.querySelector("svg");
  if (!svgB) return sysMsg(" El cuadro siguiente no tiene SVG válido");
  const fn = DZ_EASES[ease] || DZ_EASES.inout;
  // insertar en orden INVERSO: cada insert va justo después del cuadro actual,
  // así el último insertado (t más chico) queda primero
  let matched = 0, made = 0;
  dzSetStatus("🪄 Generando " + n + " intermedio(s)…");
  for (let k = n; k >= 1; k--) {
    const t = fn(k / (n + 1));
    const b = dzTweenBuild(svgA, svgB, t);
    if (!b) break;
    matched = b.matched;
    const r = await api.insert_frame(DZ.path, b.svg);
    if (r && r.error) return dzSetStatus(" " + r.error);
    made++;
  }
  DZ.anim.cache = {};
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await dzTimelineRefresh();
  dzOnionUpdate();
  dzTimelineBadges();
  dzSetStatus("🪄 " + made + " cuadro(s) intermedio(s) creados (" + matched +
    " elementos interpolados, curva " + ease + "). El papel cebolla te muestra cómo quedó el arco.");
}

/* ══  exportar la animación: GIF / secuencia PNG / spritesheet ══ */
function dzSvgToPng(svgText, maxPx) {
  return new Promise((resolve) => {
    let s = svgText;
    if (!/<svg[^>]*\bwidth=/.test(s)) {
      const vb = /viewBox\s*=\s*["']([\d.\-\s]+)["']/.exec(s);
      if (vb) {
        const p = vb[1].trim().split(/\s+/);
        if (p.length === 4) s = s.replace(/<svg/, `<svg width="${p[2]}" height="${p[3]}"`);
      }
    }
    const blob = new Blob([s], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
        const scale = Math.min(1, (maxPx || 1080) / Math.max(w, h));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL("image/png"));
      } catch (e) { resolve(null); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
/** Atajo directo al XML para Premiere, desde el menú Animación y al lado del
 *  audio, que es donde lo busca el que quiere sincronizar. Estaba sólo dentro
 *  del modal de exportar y no lo encontraba nadie: ni el menú ni el botón de la
 *  timeline lo nombraban. */
async function dzExportPremiereDirecto() {
  if (!DZ.doc) return dzSetStatus("Abrí una animación para exportar el XML");
  const cuadros = dzExportCuadros();
  if (!cuadros.length) return dzSetStatus("No hay cuadros para exportar");
  const pista = DZ.doc.audio;
  // Se puede exportar sin audio —queda una secuencia lista para montar— pero
  // hay que decirlo ANTES, no después: el que viene a «sincronizar» y no cargó
  // el audio se lleva un XML mudo sin enterarse.
  if (!pista || !pista.buffer) {
    const sigue = await dzConfirmModal(
      "La escena no tiene audio cargado, así que el XML va a salir sólo con los cuadros. " +
      "Para que Premiere lo reciba ya sincronizado, cargá el audio primero desde " +
      "Animación → Cargar audio.",
      { title: "Exportar sin audio", ok: "Exportar igual", cancel: "Cancelar" });
    if (!sigue) return;
  }
  return dzDoExport("premiere");
}

function dzExportModal() {
  // El modelo nuevo no llena DZ.anim.frames: preguntarle a la escena.
  const cuadros = DZ.doc ? dzExportCuadros() : null;
  const cuantos = cuadros ? cuadros.length : (DZ.anim ? DZ.anim.frames.length : 0);
  if (!cuantos) return dzSetStatus("No hay cuadros para exportar");
  const tramo = cuadros && cuadros.length
    ? ` (F${cuadros[0]} a F${cuadros.at(-1)})` : "";
  openModal(`<h2> Exportar animación</h2>
    <div class="sub">${cuantos} ${cuantos === 1 ? "cuadro" : "cuadros"}${tramo} a ${$("#tlFps").value || 12} fps  carpeta export/ del proyecto.<br>
      ${DZ.doc && DZ.doc.audio ? "Audio: <b>" + (DZ.doc.audio.name || "cargado") + "</b>  el XML sale sincronizado." : "Sin audio cargado: el XML saldrá solo con los cuadros."}</div>
    <div class="m-actions" style="flex-wrap:wrap">
      <button class="primary" data-x="mp4">Video MP4</button>
      <button class="ghost" data-x="gif">GIF animado</button>
      <button class="ghost" data-x="png">Secuencia PNG</button>
      <button class="ghost" data-x="sheet">Spritesheet</button>
      <button class="ghost" data-x="premiere" title="Cuadros + audio + XML: se importa en Premiere, Resolve o Final Cut ya sincronizado">XML para Premiere</button>
      <button class="ghost" id="mCancel">Cancelar</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  document.querySelectorAll("#modal [data-x]").forEach(b => b.onclick = () => { closeModal(); dzDoExport(b.dataset.x); });
}
async function dzDoExport(kind) {
  await dzPersist();
  // Escena del modelo nuevo: los cuadros salen de la escena, no de una lista
  // de archivos en disco que ya no se llena.
  if (DZ.doc) return dzDoExportDoc(kind);
  const [lo, hi] = dzPlayRange();                // exporta solo el rango In/Out
  const frames = DZ.anim.frames.slice(lo, hi + 1);
  dzSetStatus(" Rasterizando " + frames.length + " cuadros…");
  const pngs = [];
  const throughCam = dzHasCam();                 // hay claves de cámara  sale POR cámara
  for (let i = 0; i < frames.length; i++) {
    let txt = DZ.anim.cache[frames[i]];
    if (!txt) {
      const r = await api.image_data(frames[i]);
      txt = r && r.svg;
      if (txt) DZ.anim.cache[frames[i]] = txt;
    }
    if (!txt) continue;
    txt = dzRigView(txt, dzFrameNum(frames[i]));
    if (throughCam) txt = dzCamView(txt, dzCamAt(dzFrameNum(frames[i])));
    const du = await dzSvgToPng(txt, kind === "sheet" ? 512 : 1080);
    if (du) pngs.push(du);
    dzSetStatus(` Rasterizando${throughCam ? " por cámara 🎬" : ""}… ${i + 1}/${frames.length}`);
  }
  if (!pngs.length) return dzSetStatus(" No pude rasterizar ningún cuadro");
  if (kind === "sheet") {
    // grilla ~cuadrada compuesta acá mismo en un canvas
    const imgs = await Promise.all(pngs.map(du => new Promise(res => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = du;
    })));
    const ok = imgs.filter(Boolean);
    const cols = Math.ceil(Math.sqrt(ok.length));
    const rows = Math.ceil(ok.length / cols);
    const fw = ok[0].naturalWidth, fh = ok[0].naturalHeight;
    const c = document.createElement("canvas"); c.width = cols * fw; c.height = rows * fh;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
    ok.forEach((im, i) => ctx.drawImage(im, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
    const r = await api.export_anim(dzRutaDeSalida(DZ), [c.toDataURL("image/png")], 12, "sheet");
    dzSetStatus(r && r.error ? " " + r.error : " Spritesheet exportado (" + cols + "×" + rows + ")  " + ((r && r.path) || "export/"));
  } else {
    const fps = Math.max(1, Math.min(60, +$("#tlFps").value || 12));
    const label = { mp4: " Codificando MP4 con ffmpeg…", webm: " Codificando WebM…",
                    gif: " Armando el GIF…" }[kind] || " Guardando la secuencia…";
    dzSetStatus(label);
    const r = await api.export_anim(dzRutaDeSalida(DZ), pngs, fps, kind);
    const done = { mp4: " (MP4 a " + fps + " fps)", webm: " (WebM a " + fps + " fps)",
                   gif: " (GIF a " + fps + " fps)" }[kind] || " (" + pngs.length + " PNGs)";
    dzSetStatus(r && r.error ? " " + r.error : " Exportado  " + ((r && r.path) || "export/") + done + dzExportAvisoFaltantes(pngs.length, frames.length));
  }
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
}
/* auto-guardado: los trazos del cuadro persisten SOLOS al cambiar de cuadro,
   reproducir, duplicar o hablar con el agente (flujo OpenToonz, sin diálogos) */
async function dzPersist() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg || !DZ.path || !DZ.dirty) return;
  const txt = dzSerialize(svg);
  let r = null, err = null;
  try { r = await api.save_file(DZ.path, txt); } catch (e) { err = e; }
  if (!dzSaveOk(r)) {
    // Un auto-guardado que falla es MAS grave que uno manual: nadie lo esta
    // mirando. Se conserva el trabajo en el punto de recuperacion y el
    // documento sigue sucio, en vez de darlo por guardado.
    window.LOW?.workspace?.recovery?.saveNow(DZ.path, txt, { op: "auto-guardado fallido" });
    return dzSaveFallo("El auto-guardado", dzSaveError(r, err));
  }
  DZ.dirty = false;
  const tab = dzDocumentTabCurrent(); if (tab) { tab.dirty = false; tab.content = txt; dzDocumentTabsRender(); }
  window.LOW?.workspace?.recovery?.clear(DZ.path);
  if (DZ.anim) DZ.anim.cache[DZ.path] = txt;   // la cache/miniatura ve lo nuevo
  setStatus(" auto-guardado");
}

async function dzGoFrame(i) {
  // Con documento abierto, navegar es del DOCUMENTO. Antes esto exigía dos
  // cosas del modo viejo —que existiera `DZ.anim` y que su lista de archivos
  // tuviera el cuadro— y `DZ.anim.frames` queda vacía a propósito cuando hay
  // documento (ver dzTimelineRefresh). Resultado: los clicks en los chips de
  // la barra de cuadros no movían nada. La lista de archivos sólo manda en el
  // modo viejo, sin documento.
  if (DZ.doc) {
    dzDocCommit();               // lo que esté en el lienzo, adentro
    if (DZ.anim) DZ.anim.idx = i;   // la barra vieja queda en sync visual
    DZ.doc.goTo(i + 1);          // 1-based; el subscribe repinta canvas + onion
    dzTimelineReveal();
    if (DZ.rigMode) { dzRigApplyLive(dzRigCur()); dzRigPanelSync(); }
    dzCamOverlay();
    return;
  }
  if (!DZ.anim || !DZ.anim.frames[i]) return;
  await dzPersist();                             // el papel cebolla necesita el disco al día
  await openDesign(DZ.anim.frames[i]);
  // openDesign no conoce la animación: restaurar la barra y el estado
  DZ.anim.idx = i;
  dzTimelineReveal();
  await dzTimelineRefresh();
  dzOnionUpdate();
  if (DZ.rigMode) { dzRigApplyLive(dzRigCur()); dzRigPanelSync(); }
  dzCamOverlay();
}
async function dzFrameAdd() {
  // Modelo nuevo: un frame más es un dibujo nuevo expuesto al final.
  if (DZ.doc) {
    const ly = DZ.doc.layer, lv = DZ.doc.level;
    if (!ly || !lv) return dzSetStatus("No hay capa/nivel activo");
    if (ly.locked) return dzSetStatus("La capa está bloqueada");
    dzDocCommit();
    const f = (DZ.doc.scene.lastFrame() || 0) + 1;
    // EN RIG, un cuadro nuevo SOSTIENE el mismo dibujo. Un muneco riggeado se
    // anima con poses, no redibujandolo: si aca crearamos un dibujo vacio, el
    // personaje desapareceria del cuadro nuevo y el rig se quedaria sin nada
    // que mover. Era el motivo por el que "agregar cuadros" rompia el rig.
    if (DZ.rigMode && dzRigHayNodos()) {
      const actual = ly.cellAt(DZ.doc.frame);
      if (actual != null) {
        DZ.doc.setCell(f, actual);
        DZ.doc.goTo(f);
        dzSetStatus("F" + f + ": el personaje sigue expuesto · posalo y queda la clave");
        return;
      }
    }
    const n = lv.nextNumber();
    DZ.doc.setCell(f, n);
    DZ.doc.goTo(f);
    dzSetStatus(" Drawing " + n + " expuesto en el frame " + f);
    return;
  }
  if (!DZ.anim) return;
  await dzPersist();
  const r = await api.dup_frame(DZ.path);
  if (r && r.error) return sysMsg(" " + r.error);
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await openDesign(r.path);
  dzTimelineReveal();
  await dzTimelineRefresh();
  dzOnionUpdate();
}
/* papel cebolla estilo OpenToonz: cuadros fantasma con TINTE (rojos = los
   anteriores, verde = el siguiente), opacidad decreciente, dibujados ENCIMA
   (sin su fondo) para que se vean sobre cualquier lienzo. No editable. */
function dzOnionClear() {
  document.querySelectorAll("#dzCanvas svg g.dz-onion").forEach(n => n.remove());
}
/* Los SVG históricos de LOW guardan una capa blanca de página como un rect.
   Al teñir un fantasma esa página se convertía en una placa roja/verde. Se
   elimina solo de la COPIA usada por papel cebolla: el dibujo real no cambia. */
function dzOnionStripPage(root, viewBox) {
  if (!root) return;
  const vb = String(viewBox || "0 0 1080 1080").trim().split(/[ ,]+/).map(Number);
  const pageArea = Math.max(1, Math.abs((vb[2] || 1080) * (vb[3] || 1080)));
  root.querySelectorAll("rect").forEach((rect) => {
    const width = Math.abs(parseFloat(rect.getAttribute("width")) || 0);
    const height = Math.abs(parseFloat(rect.getAttribute("height")) || 0);
    const fill = String(rect.getAttribute("fill") || "").trim().toLowerCase().replace(/\s+/g, "");
    const stroke = String(rect.getAttribute("stroke") || "none").trim().toLowerCase();
    const white = fill === "white" || fill === "#fff" || fill === "#ffffff"
      || fill === "rgb(255,255,255)" || fill === "rgba(255,255,255,1)";
    const pageLike = width * height >= pageArea * .20;
    if (pageLike && white && (stroke === "" || stroke === "none" || stroke === "transparent")) rect.remove();
  });
}
function dzOnionGhost(svgText, tintId, rgb, opacity) {
  const tmp = document.createElement("div"); tmp.innerHTML = svgText;
  const psvg = tmp.querySelector("svg");
  if (!psvg) return null;
  // sacarle el fondo al fantasma: un rect que cubre ~todo el lienzo tapa el
  // cuadro actual — solo queremos las líneas/formas (como niveles de OpenToonz)
  dzOnionStripPage(psvg, psvg.getAttribute("viewBox"));
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "dz-onion");
  g.setAttribute("opacity", String(opacity));
  g.setAttribute("pointer-events", "none");
  // tinte duotono via filtro (vive DENTRO del grupo  se va con él al guardar)
  const f = document.createElementNS(SVGNS, "filter");
  f.setAttribute("id", tintId);
  f.innerHTML = `<feColorMatrix type="matrix" values="0.25 0.25 0.25 0 ${rgb[0]}  0.25 0.25 0.25 0 ${rgb[1]}  0.25 0.25 0.25 0 ${rgb[2]}  0 0 0 1 0"/>`;
  g.appendChild(f);
  const inner = document.createElementNS(SVGNS, "g");
  inner.setAttribute("filter", `url(#${tintId})`);
  [...psvg.children].forEach(n => inner.appendChild(n));
  g.appendChild(inner);
  return g;
}
/* configuración del papel cebolla (panel 🗂 flotante): cuadros antes/después,
   colores de tinte y opacidad — persistente entre sesiones */
function dzOnionCfg() {
  if (!DZ.onionCfg) {
    let saved = {};
    try { saved = JSON.parse(dzPrefsStorage().getItem("fidel.dzonion") || "{}"); } catch (e) { /* */ }
    DZ.onionCfg = { before: 2, after: 1, alpha: 38,
                    colorB: "#8c0000", colorA: "#00731a", ...saved };
  }
  return DZ.onionCfg;
}
function dzOnionCfgSave() {
  try { dzPrefsStorage().setItem("fidel.dzonion", JSON.stringify(DZ.onionCfg)); } catch (e) { /* */ }
}
function dzHexToRgbF(hex) {
  const n = parseInt((dzHex(hex) || "#888888").slice(1), 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
let ONION_RUN = 0;   // token anti-carrera: navegar rápido no duplica fantasmas
async function dzOnionUpdate() {
  const run = ++ONION_RUN;
  dzOnionClear();
  if (!DZ.anim || !DZ.anim.onion) return;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const cfg = dzOnionCfg();
  const rgbB = dzHexToRgbF(cfg.colorB), rgbA = dzHexToRgbF(cfg.colorA);
  const base = (cfg.alpha || 38) / 100;
  const jobs = [];
  for (let k = 1; k <= (cfg.before || 0); k++)   // anteriores, cada vez más tenues
    if (DZ.anim.frames[DZ.anim.idx - k])
      jobs.push({ f: DZ.anim.frames[DZ.anim.idx - k], rgb: rgbB, op: base / k, id: "dzTintP" + k });
  for (let k = 1; k <= (cfg.after || 0); k++)    // siguientes
    if (DZ.anim.frames[DZ.anim.idx + k])
      jobs.push({ f: DZ.anim.frames[DZ.anim.idx + k], rgb: rgbA, op: base * 0.8 / k, id: "dzTintN" + k });
  for (const j of jobs) {
    const r = await api.image_data(j.f);
    if (run !== ONION_RUN) return;              // vino una pasada más nueva: abortar
    if (!r || !r.svg) continue;
    const g = dzOnionGhost(r.svg, j.id, j.rgb, j.op);
    if (g) svg.appendChild(g);                  // ENCIMA del cuadro actual
  }
}
/* ══ CÁMARA + ESCENA (estilo Toon Boom/OpenToonz) ═══════════════════════
   La escena vive en <base>_escena.json: claves de cámara por cuadro
   (posición/zoom/rotación), fotogramas clave de dibujo y curva de easing.
   La cámara se edita como un encuadre naranja sobre el lienzo (auto-key:
   moverla en un cuadro deja clave ahí). El play y el export salen POR la
   cámara, con multiplano: elementos con data-z se mueven en parallax. ══ */
const DZ_EASES = {
  linear: t => t,
  in: t => t * t,
  out: t => t * (2 - t),
  inout: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};
function dzFrameNum(path) {
  const m = /_f(\d{3})\.svg$/i.exec(path || "");
  return m ? parseInt(m[1], 10) : 1;
}
/* dzSceneSave vive abajo (sección GUARDAR Y ABRIR LA ESCENA) como UNA sola
   función sobre el modelo LowDoc. La definición histórica que guardaba sólo
   la cámara (api.scene_save) quedó eliminada: tener dos funciones con el mismo
   nombre hacía que la de abajo pisara a ésta por hoisting y la cámara legacy
   dejara de persistir sin avisar. */
function dzVB() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  return ((svg && svg.getAttribute("viewBox")) || "0 0 1080 1080").split(/\s+/).map(Number);
}
function dzCamDefault() {
  const vb = dzVB();
  return { cx: vb[0] + vb[2] / 2, cy: vb[1] + vb[3] / 2, w: vb[2], rot: 0 };
}
function dzCamFrame() { return DZ.doc ? DZ.doc.frame : dzFrameNum(DZ.path); }
function dzCamKeys() {
  if (DZ.doc) {
    DZ.doc.scene.camera = DZ.doc.scene.camera || { keys: {} };
    DZ.doc.scene.camera.keys = DZ.doc.scene.camera.keys || {};
    return DZ.doc.scene.camera.keys;
  }
  DZ.scene = DZ.scene || {}; DZ.scene.cam = DZ.scene.cam || {};
  return DZ.scene.cam;
}
/* cámara interpolada en el cuadro `num` (entre claves, con la curva elegida) */
function dzCamAt(num) {
  const cams = dzCamKeys();
  const ks = Object.keys(cams).map(Number).sort((a, b) => a - b);
  if (!ks.length) return dzCamDefault();
  if (cams[num]) return { ...cams[num] };
  let k1 = ks[0], k2 = ks[ks.length - 1];
  if (num <= k1) return { ...cams[k1] };
  if (num >= k2) return { ...cams[k2] };
  for (const k of ks) { if (k <= num) k1 = k; else { k2 = k; break; } }
  const t = (DZ_EASES[(DZ.scene && DZ.scene.ease) || "inout"] || DZ_EASES.inout)((num - k1) / (k2 - k1));
  const a = cams[k1], b = cams[k2];
  return { cx: dzLerp(a.cx, b.cx, t), cy: dzLerp(a.cy, b.cy, t),
           w: dzLerp(a.w, b.w, t), rot: dzLerp(a.rot || 0, b.rot || 0, t) };
}
/* vista POR la cámara: recorta al encuadre (viewBox), aplica la rotación y
   el parallax multiplano de los elementos con data-z (z>0 lejos, z<0 cerca) */
function dzCamView(svgText, cam) {
  const tmp = document.createElement("div"); tmp.innerHTML = svgText;
  const svg = tmp.querySelector("svg");
  if (!svg) return svgText;
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  const vbcx = vb[0] + vb[2] / 2, vbcy = vb[1] + vb[3] / 2;
  const h = cam.w * (vb[3] / vb[2]);
  const NS = "http://www.w3.org/2000/svg";
  const out = document.createElementNS(NS, "svg");
  out.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  out.setAttribute("viewBox", `${(cam.cx - cam.w / 2).toFixed(1)} ${(cam.cy - h / 2).toFixed(1)} ${cam.w.toFixed(1)} ${h.toFixed(1)}`);
  out.setAttribute("width", Math.round(vb[2])); out.setAttribute("height", Math.round(vb[3]));
  const g = document.createElementNS(NS, "g");
  if (cam.rot) g.setAttribute("transform", `rotate(${(-cam.rot).toFixed(2)} ${cam.cx.toFixed(1)} ${cam.cy.toFixed(1)})`);
  [...svg.children].forEach(n => {
    if (n.classList && n.classList.contains("dz-onion")) return;
    const z = Math.max(-60, Math.min(400, parseFloat(n.getAttribute && n.getAttribute("data-z")) || 0));
    const compX = parseFloat(n.getAttribute && n.getAttribute("data-comp-x")) || 0;
    const compY = parseFloat(n.getAttribute && n.getAttribute("data-comp-y")) || 0;
    const compRz = parseFloat(n.getAttribute && n.getAttribute("data-comp-rz")) || 0;
    const compSx = parseFloat(n.getAttribute && n.getAttribute("data-comp-sx")) || 1;
    const compSy = parseFloat(n.getAttribute && n.getAttribute("data-comp-sy")) || 1;
    if (z || compX || compY || compRz || compSx !== 1 || compSy !== 1) {
      // multiplano real (paneo Y dolly/zoom), como una cámara multiplano física:
      // p = cuánto acompaña esta capa el movimiento de la cámara (1 = igual que
      // el plano de acción; <1 = lejos, se mueve/escala menos; >1 = cerca, más)
      const p = 100 / (100 + z);
      const dx = (cam.cx - vbcx) * (1 - p), dy = (cam.cy - vbcy) * (1 - p);
      // dolly: el viewBox de salida ya escala TODO por (vb[2]/cam.w) al hacer
      // zoom. Para que la profundidad se sienta (lo cercano crece más rápido,
      // lo lejano casi no cambia de tamaño al acercar la cámara) hay que
      // contrarrestar ese escalado uniforme en proporción a 1-p.
      const zoomRatio = cam.w / vb[2]; // <1 = cámara acercada (dolly in)
      const extraScale = zoomRatio + (1 - zoomRatio) * p;
      const w = document.createElementNS(NS, "g");
      let tf = `translate(${(dx + compX).toFixed(1)} ${(dy + compY).toFixed(1)})`;
      if (Math.abs(extraScale - 1) > 1e-4) {
        tf += ` translate(${cam.cx.toFixed(1)} ${cam.cy.toFixed(1)}) scale(${extraScale.toFixed(4)}) translate(${(-cam.cx).toFixed(1)} ${(-cam.cy).toFixed(1)})`;
      }
      if (compRz || compSx !== 1 || compSy !== 1) {
        tf += ` translate(${vbcx.toFixed(1)} ${vbcy.toFixed(1)}) rotate(${compRz.toFixed(2)}) scale(${compSx.toFixed(4)} ${compSy.toFixed(4)}) translate(${(-vbcx).toFixed(1)} ${(-vbcy).toFixed(1)})`;
      }
      w.setAttribute("transform", tf);
      w.appendChild(n.cloneNode(true));
      g.appendChild(w);
    } else g.appendChild(n.cloneNode(true));
  });
  out.appendChild(g);
  return out.outerHTML;
}
function dzHasCam() { return Object.keys(dzCamKeys()).length > 0; }

/* ── overlay del encuadre: arrastrar = mover · esquina = zoom ·  = rotar ──
   AUTO-KEY: cualquier edición deja una clave de cámara en el cuadro actual. */
function dzCamToggle() {
  DZ.camMode = !DZ.camMode;
  DZ.tool = DZ.camMode ? "camera" : "select"; $("#dzCanvas").dataset.tool = DZ.tool;   // el CSS decide con esto si el encuadre agarra el puntero
  $("#dzCamBtn").classList.toggle("active", DZ.camMode);
  $("#tlCamKey").hidden = !DZ.camMode;
  if (DZ.camMode && !DZ.anim && !DZ.doc) { dzAnimToggle(); }   // la cámara vive en la timeline
  dzCamOverlay();
  dzToolOptsRender(); dzSbTool();
  dzSetStatus(DZ.camMode ?
    "🎬 Cámara: arrastrá el encuadre (mover), la esquina (zoom),  (rotar) — cada cambio deja CLAVE en este cuadro. El play y el export salen por acá." : "");
}
function dzCamCur() { return DZ.camDrag || dzCamAt(dzCamFrame()); }
function dzCamOverlay() {
  const box = $("#dzCam");
  if ((!DZ.camMode && !dzCamGuiaActiva()) || (!DZ.path && !DZ.doc) || !$("#dzCanvas").querySelector(":scope > svg")) { box.hidden = true; return; }
  box.classList.toggle("guia", !DZ.camMode);
  const cam = dzCamCur();
  const vb = dzVB();
  const h = cam.w * (vb[3] / vb[2]);
  const c = dzToScreen(cam.cx, cam.cy);
  const e1 = dzToScreen(cam.cx - cam.w / 2, cam.cy), e2 = dzToScreen(cam.cx + cam.w / 2, cam.cy);
  const t1 = dzToScreen(cam.cx, cam.cy - h / 2), t2 = dzToScreen(cam.cx, cam.cy + h / 2);
  const pw = Math.hypot(e2.x - e1.x, e2.y - e1.y), ph = Math.hypot(t2.x - t1.x, t2.y - t1.y);
  box.style.width = pw + "px"; box.style.height = ph + "px";
  box.style.left = (c.x - pw / 2) + "px"; box.style.top = (c.y - ph / 2) + "px";
  box.style.transform = `rotate(${cam.rot || 0}deg)`;
  const num = dzCamFrame();
  $("#dzCamTag").textContent = "Cámara 2D · F" + String(num).padStart(3, "0") +
    (dzCamKeys()[num] ? " · CLAVE" : " · interpolada");
  box.hidden = false;
}
function dzCamSetKey(cam) {
  const cams = dzCamKeys();
  cams[dzCamFrame()] = {
    cx: Math.round(cam.cx * 10) / 10, cy: Math.round(cam.cy * 10) / 10,
    w: Math.round(cam.w * 10) / 10, rot: Math.round((cam.rot || 0) * 10) / 10 };
  if (DZ.doc) { DZ.doc.touch(); DZ.doc.emit("camera"); } else dzSceneSave();
  dzCamOverlay(); dzTimelineBadges();
}
function dzCamKeyToggle() {
  if (!DZ.camMode) return;
  const cams = dzCamKeys(), num = dzCamFrame();
  if (cams[num]) {
    delete cams[num];
    dzSetStatus("🎬 Clave de cámara del cuadro " + num + " borrada");
  } else {
    cams[num] = dzCamCur();
    dzSetStatus("🎬🔑 Clave de cámara en el cuadro " + num);
  }
  if (DZ.doc) { DZ.doc.touch(); DZ.doc.emit("camera"); } else dzSceneSave();
  dzCamOverlay(); dzTimelineBadges();
}
/* ── interacción de cámara — v2, predecible ──────────────────────────────
   Durante el arrastre se muestra un PREVIEW en vivo (DZ.camDrag) SIN tocar la
   escena; recién al SOLTAR se deja UNA sola clave en el cuadro. Antes cada
   micro-movimiento clavaba un keyframe (comportamiento impredecible), y un
   simple clic sin mover dejaba una clave. Ahora un clic no clava nada. */
function dzCamCommit() {
  if (DZ.camDrag) { dzCamSetKey(DZ.camDrag); DZ.camDrag = null; }
}
function dzCamDrag(e) {
  if (e.target.id === "dzCamSize" || e.target.id === "dzCamRot") return;
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  const cam0 = dzCamAt(dzCamFrame());
  const start = dzToUser(e.clientX, e.clientY);
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const p = dzToUser(ev.clientX, ev.clientY);
    let dx = p.x - start.x, dy = p.y - start.y;
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }  // recto
    DZ.camDrag = { ...cam0, cx: Math.round((cam0.cx + dx) * 10) / 10, cy: Math.round((cam0.cy + dy) * 10) / 10 };
    dzCamOverlay();
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    if (ev.type !== "pointercancel") dzCamCommit(); else { DZ.camDrag = null; dzCamOverlay(); }
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
}
function dzCamResize(e) {
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  const cam0 = dzCamAt(dzCamFrame());
  const start = dzToUser(e.clientX, e.clientY);
  // zoom proporcional a la distancia al centro (alejar la esquina = achicar zoom)
  const d0 = Math.max(1, Math.hypot(start.x - cam0.cx, start.y - cam0.cy));
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const p = dzToUser(ev.clientX, ev.clientY);
    const d = Math.hypot(p.x - cam0.cx, p.y - cam0.cy);
    const w = Math.max(40, Math.round(cam0.w * (d / d0) * 10) / 10);
    DZ.camDrag = { ...cam0, w };
    dzCamOverlay();
    const vb = dzVB();
    dzSetStatus("🎬 zoom " + Math.round(vb[2] / w * 100) + "% del encuadre");
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
    if (ev.type !== "pointercancel") dzCamCommit(); else { DZ.camDrag = null; dzCamOverlay(); }
    dzSetStatus("");
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
}
function dzCamRotate(e) {
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  const cam0 = dzCamAt(dzCamFrame());
  const c = dzToScreen(cam0.cx, cam0.cy);
  const cv = $("#dzCanvas").getBoundingClientRect();
  const a0 = Math.atan2(e.clientY - cv.top - c.y, e.clientX - cv.left - c.x);
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    let deg = (cam0.rot || 0) + (Math.atan2(ev.clientY - cv.top - c.y, ev.clientX - cv.left - c.x) - a0) * 180 / Math.PI;
    if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
    DZ.camDrag = { ...cam0, rot: Math.round(deg * 10) / 10 };
    dzCamOverlay();
    dzSetStatus("🎬 rotación " + Math.round(DZ.camDrag.rot) + "°");
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up);
    if (ev.type !== "pointercancel") dzCamCommit(); else { DZ.camDrag = null; dzCamOverlay(); }
    dzSetStatus("");
  };
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", up);
}

/* ── fotogramas clave de dibujo (🔑) + badges del X-sheet ── */
function dzKeyToggle() {
  if (!DZ.anim) return;
  DZ.scene = DZ.scene || {};
  const keys = DZ.scene.keys = DZ.scene.keys || [];
  const num = dzFrameNum(DZ.path);
  const i = keys.indexOf(num);
  if (i >= 0) { keys.splice(i, 1); dzSetStatus("Cuadro " + num + " ya no es clave"); }
  else { keys.push(num); keys.sort((a, b) => a - b); dzSetStatus("🔑 Cuadro " + num + " marcado como FOTOGRAMA CLAVE"); }
  dzSceneSave(); dzTimelineBadges();
}
function dzTimelineBadges() {
  if (!DZ.anim && !DZ.doc) return;
  // Modelo nuevo: los badges salen del modelo (cámara y rig), no de DZ.scene.
  if (DZ.doc) {
    const doc = DZ.doc, sc = doc.scene;
    const cams = (sc.camera && sc.camera.keys) || {};
    const rig = dzRigTracks();
    document.querySelectorAll("#tlFrames .tl-frame").forEach((c, i) => {
      c.querySelectorAll(".tl-key").forEach(n => n.remove());
      const num = i + 1;   // los chips del modelo son 1-based
      const hasRig = Object.keys(rig).some(id => rig[id] && rig[id][num]);
      let badge = (cams[num] ? "●" : "") + (hasRig ? "◇" : "");
      if (badge) {
        const b = document.createElement("span");
        b.className = "tl-key"; b.textContent = badge;
        c.appendChild(b);
      }
    });
    return;
  }
  const keys = (DZ.scene && DZ.scene.keys) || [];
  const cams = (DZ.scene && DZ.scene.cam) || {};
  document.querySelectorAll("#tlFrames .tl-frame").forEach((c, i) => {
    c.querySelectorAll(".tl-key").forEach(n => n.remove());
    const num = dzFrameNum(DZ.anim.frames[i]);
    const rig = dzRigTracks();
    const hasRig = Object.keys(rig).some(id => rig[id] && rig[id][num]);
    let badge = (keys.includes(num) ? "◆" : "") + (cams[num] ? "●" : "") + (hasRig ? "◇" : "");
    if (badge) {
      const b = document.createElement("span");
      b.className = "tl-key"; b.textContent = badge;
      c.appendChild(b);
    }
  });
}


/* ══ RIG: claves de transformación por PIEZA (pegs de Toon Boom / AE) ══════
   Vive en LowDoc.scene.rig; el formato DZ.scene.rig queda sólo como migración.
   La pose interpolada se
   aplica ENCIMA del dibujo (nunca se hornea en el archivo): el transform
   original se preserva en data-rigbase y se restaura al serializar. */
function dzRigCur() {
  if (DZ.doc) return DZ.doc.frame;
  return (DZ.anim && DZ.anim.frames[DZ.anim.idx]) ? dzFrameNum(DZ.anim.frames[DZ.anim.idx]) : 1;
}
function dzRigTracks() {
  const nodes = DZ.doc && DZ.doc.scene && DZ.doc.scene.rig && DZ.doc.scene.rig.nodes;
  if (nodes) return Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, node.keys || {}]));
  return (DZ.scene && DZ.scene.rig) || {};
}
function dzRigAt(id, num) {
  if (DZ.doc && DZ.doc.scene.rigNode(id)) return DZ.doc.scene.rigWorldPose(id, num);
  const trk = dzRigTracks()[id];
  if (!trk) return null;
  const ks = Object.keys(trk).map(Number).sort((a, b) => a - b);
  if (!ks.length) return null;
  if (trk[num]) return { ...trk[num] };
  if (num <= ks[0]) return { ...trk[ks[0]] };
  if (num >= ks[ks.length - 1]) return { ...trk[ks[ks.length - 1]] };
  let k1 = ks[0], k2 = ks[ks.length - 1];
  for (const k of ks) { if (k <= num) k1 = k; else { k2 = k; break; } }
  const t = (DZ_EASES[(DZ.scene && DZ.scene.ease) || "inout"] || DZ_EASES.inout)((num - k1) / (k2 - k1));
  const a = trk[k1], b = trk[k2];
  return { x: dzLerp(a.x, b.x, t), y: dzLerp(a.y, b.y, t),
           r: dzLerp(a.r || 0, b.r || 0, t), s: dzLerp(a.s == null ? 1 : a.s, b.s == null ? 1 : b.s, t) };
}
function dzRigLocalAt(id, num) {
  if (DZ.doc && DZ.doc.scene.rigNode(id)) return DZ.doc.scene.rigPose(id, num);
  return dzRigAt(id, num);
}
function dzRigPivotOf(el) {
  const node = DZ.doc && el.id && DZ.doc.scene.rigNode(el.id);
  if (node && node.pivot) return { x: node.pivot.x, y: node.pivot.y };
  const pv = el.getAttribute && el.getAttribute("data-pivot");
  if (pv) { const p = pv.split(/\s+/).map(Number); return { x: p[0], y: p[1] }; }
  try { const b = el.getBBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }
  catch (e) { return { x: 0, y: 0 }; }
}
function dzRigChunk(el, k) {
  const pv = dzRigPivotOf(el), p = k || {};
  let t = "";
  if (p.x || p.y) t += `translate(${(+p.x || 0).toFixed(1)} ${(+p.y || 0).toFixed(1)}) `;
  if (p.r) t += `rotate(${(+p.r).toFixed(2)} ${pv.x.toFixed(1)} ${pv.y.toFixed(1)}) `;
  const sx = p.sx == null ? (p.s == null ? 1 : p.s) : p.sx;
  const sy = p.sy == null ? (p.s == null ? 1 : p.s) : p.sy;
  if (Math.abs(sx - 1) > 0.001 || Math.abs(sy - 1) > 0.001)
    t += `translate(${pv.x.toFixed(1)} ${pv.y.toFixed(1)}) scale(${(+sx).toFixed(3)} ${(+sy).toFixed(3)}) translate(${(-pv.x).toFixed(1)} ${(-pv.y).toFixed(1)}) `;
  return t.trim();
}
function dzRigMatrixChunk(matrix) {
  if (!matrix || matrix.length !== 6) return "";
  const m = matrix.map(n => Math.abs(n) < 1e-9 ? 0 : Math.round(n * 100000) / 100000);
  const identity = Math.abs(m[0] - 1) < 1e-6 && !m[1] && !m[2] && Math.abs(m[3] - 1) < 1e-6 && !m[4] && !m[5];
  return identity ? "" : `matrix(${m.join(" ")})`;
}
function dzRigApplyTo(el, k) {
  if (!el.hasAttribute("data-rigbase")) el.setAttribute("data-rigbase", el.getAttribute("transform") || "");
  const base = el.getAttribute("data-rigbase"), chunk = dzRigChunk(el, k);
  if (chunk) el.setAttribute("transform", chunk + (base ? " " + base : ""));
  else if (base) el.setAttribute("transform", base); else el.removeAttribute("transform");
}
function dzRigApplyMatrix(el, matrix) {
  if (!el.hasAttribute("data-rigbase")) el.setAttribute("data-rigbase", el.getAttribute("transform") || "");
  const base = el.getAttribute("data-rigbase"), chunk = dzRigMatrixChunk(matrix);
  if (chunk) el.setAttribute("transform", chunk + (base ? " " + base : ""));
  else if (base) el.setAttribute("transform", base); else el.removeAttribute("transform");
}
function dzRigStrip(root) {
  (root || document).querySelectorAll("[data-rigbase]").forEach(n => {
    const b = n.getAttribute("data-rigbase");
    if (b) n.setAttribute("transform", b); else n.removeAttribute("transform");
    n.removeAttribute("data-rigbase");
  });
  // las variantes escondidas vuelven a estar: `dzCanvasInner` pasa por aca
  // antes de guardar, asi que el dibujo nunca queda con piezas ocultas.
  (root || document).querySelectorAll("[data-rig-var]").forEach(n => {
    n.style.display = n.getAttribute("data-rig-var") || "";
    n.removeAttribute("data-rig-var");
  });
  // y el doblez: se devuelve el `d` original de cada trazo deformado
  (root || document).querySelectorAll("[data-defbase]").forEach(n => {
    const d = n.getAttribute("data-defbase");
    if (d) n.setAttribute("d", d);
    n.removeAttribute("data-defbase");
  });
}
/** El elemento que le toca dibujar a una pieza en un cuadro, escondiendo las
 *  otras variantes. Sin variantes extra devuelve el de siempre y no toca nada:
 *  el 99% de las piezas tiene un solo dibujo y no paga ningun costo. */
function dzRigDibujoDe(node, num, svg) {
  const porDefecto = node.elementId || node.id;
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc || !svg) return porDefecto;
  const slotId = "slot:" + node.id;
  const variantes = sc.rigVariants ? sc.rigVariants(slotId) : [];
  if (!variantes.length) return porDefecto;
  if (variantes.length < 2)
    return variantes[0].elementId || porDefecto;   // la unica manda, coincida o no
  const activo = sc.rigActiveAttachment(slotId, num);
  const elegido = (activo && activo.elementId) || porDefecto;
  for (const v of variantes) {
    const el = svg.querySelector("#" + CSS.escape(v.elementId));
    if (!el) continue;
    // se recuerda el display propio del dibujo para poder devolverselo: el rig
    // NUNCA hornea su vista dentro del dibujo guardado.
    if (!el.hasAttribute("data-rig-var")) el.setAttribute("data-rig-var", el.style.display || "");
    el.style.display = v.elementId === elegido ? "" : "none";
  }
  return elegido;
}

/** Cuantos nodos tiene el rig de la escena. */
function dzRigHayNodos() {
  return !!(DZ.doc && DZ.doc.scene.rig &&
    Object.keys(DZ.doc.scene.rig.nodes || {}).length);
}
function dzRigApplyLive(num, overrides = {}) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  dzRigStrip(svg);
  if (DZ.doc && DZ.doc.scene.rig) {
    const nodos = Object.values(DZ.doc.scene.rig.nodes);
    let hallados = 0;
    for (const node of nodos) {
      // Que dibujo va en este cuadro: una pieza puede tener varios (la mano
      // abierta, el puño) y las claves de sustitucion deciden cual se ve.
      const objetivo = dzRigDibujoDe(node, num, svg);
      const el = svg.querySelector("#" + CSS.escape(objetivo));
      if (el) {
        hallados++;
        // primero se dobla la geometria, despues se la ubica: la matriz del
        // hueso se aplica ENCIMA del dibujo ya deformado.
        const preview = DZ.rigDeformerPreview?.boneId === node.id && DZ.rigDeformerPreview?.frame === num
          ? DZ.rigDeformerPreview.points : null;
        const deformer = preview && DZ.doc.scene.rigDeformer?.(node.id);
        const doblez = preview && deformer
          ? LOW.animation.rigDeformador(deformer.rest, preview)
          : (DZ.doc.scene.rigDeformadorAt ? DZ.doc.scene.rigDeformadorAt(node.id, num) : null);
        if (doblez) dzDeformarElemento(el, doblez, svg);
        // Malla de deformación (nivel profesional): deforma el dibujo real por el
        // mismo camino que la curva; una malla en reposo devuelve null y no toca nada.
        const malla = DZ.doc.scene.rigMallaAt ? DZ.doc.scene.rigMallaAt(node.id, num, overrides) : null;
        if (malla) dzDeformarElemento(el, malla, svg);
        dzRigApplyMatrix(el, DZ.doc.scene.rigWorldMatrix(node.id, num, overrides));
      }
    }
    // Un cuadro donde el personaje no esta expuesto no tiene nada que posar, y
    // sin aviso parece que el rig "dejo de funcionar". Se dice en voz alta.
    if (DZ.rigMode && nodos.length && !hallados) {
      const hasArt = nodos.some(n => n.elementId || n.binding?.elementId);
      dzSetStatus(hasArt
        ? "F" + num + ": este cuadro no tiene al personaje · sostené su dibujo (↔ en la hoja de tiempos)"
        : "F" + num + ": animando sólo el esqueleto · las claves se conservarán al vincular un personaje");
    }
    dzPositionHandle(); dzRigOverlayRender(); return;
  }
  const rig = dzRigTracks();
  for (const id of Object.keys(rig)) {
    const el = svg.querySelector('[id="' + id.replace(/"/g, '') + '"]'), k = dzRigAt(id, num);
    if (el && k) dzRigApplyTo(el, k);
  }
  dzPositionHandle();
}
function dzRigSetKey(id, num, k) {
  if (DZ.doc) { DZ.doc.setRigKey(id, num, k); dzRigApplyLive(num); dzTimelineBadges(); dzRigPanelSync(); return; }
  DZ.scene = DZ.scene || {}; DZ.scene.rig = DZ.scene.rig || {}; DZ.scene.rig[id] = DZ.scene.rig[id] || {};
  DZ.scene.rig[id][num] = { x: +k.x || 0, y: +k.y || 0, r: +k.r || 0, s: k.s == null ? 1 : +k.s };
  dzSceneSave(); dzTimelineBadges(); dzRigPanelSync();
}
function dzRigDelKey(id, num) {
  if (DZ.doc) { DZ.doc.deleteRigKey(id, num); dzTimelineBadges(); dzRigApplyLive(dzRigCur()); dzRigPanelSync(); return; }
  const trk = dzRigTracks()[id]; if (!trk || !trk[num]) return;
  delete trk[num]; if (!Object.keys(trk).length) delete DZ.scene.rig[id];
  dzSceneSave(); dzTimelineBadges(); dzRigApplyLive(dzRigCur()); dzRigPanelSync();
}
function dzRigNodeElement(node) {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  return svg && node ? svg.querySelector("#" + CSS.escape(node.elementId || node.id)) : null;
}
/* Resuelve el id del HUESO a partir del id de una pieza de arte. El dibujo
   puede tener un id distinto del hueso (bindRigElement); esto evita posar un
   nodo fantasma con el id del <path>/<g> al arrastrar el arte en FK. */
function dzRigNodeIdOfElement(elementId) {
  if (!DZ.doc || !elementId) return null;
  const node = Object.values(DZ.doc.scene.rig.nodes).find(n => n.elementId === elementId);
  return node ? node.id : null;
}
function dzRigParentDelta(id, dx, dy, frame) {
  const node = DZ.doc && DZ.doc.scene.rigNode(id);
  if (!node?.parentId) return { x: dx, y: dy };
  const m = DZ.doc.scene.rigWorldMatrix(node.parentId, frame), det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-9) return { x: dx, y: dy };
  return { x: (m[3] * dx - m[2] * dy) / det, y: (-m[1] * dx + m[0] * dy) / det };
}
function dzRigSelectedNode() {
  if (!DZ.doc) return null;
  const id = DZ.rigSelectedId || (DZ.sel?.id &&
    (DZ.doc.scene.rigNode(DZ.sel.id)?.id || dzRigNodeIdOfElement(DZ.sel.id)));
  const node = DZ.doc.scene.rigNode(id) || null;
  // Seleccionar en la mesa algo que no es del rig borra la pieza elegida, y
  // esta bien que asi sea. Pero sumarle un dibujo a una pieza obliga a elegir
  // justamente un dibujo que todavia NO es del rig: para ese caso se recuerda
  // cual fue la ultima pieza.
  if (node) DZ.rigUltimaPieza = node.id;
  return node;
}
/** La pieza elegida, o la ultima que lo estuvo. Para acciones que necesitan la
 *  pieza aunque la mesa este apuntando a otro dibujo. */
function dzRigPiezaDestino() {
  return dzRigSelectedNode() ||
    (DZ.rigUltimaPieza && DZ.doc?.scene.rigNode(DZ.rigUltimaPieza)) || null;
}
function dzRigSelectNode(id) {
  const node = DZ.doc?.scene.rigNode(id); if (!node) return false;
  DZ.rigSelectedId = id;
  DZ.rigSelectionSource = "rig";
  const target = dzRigNodeElement(node);
  if (target) {
    // dzSelect también actualiza inspector/capas. El guard conserva la fuente
    // de selección como hueso en vez de reinterpretarla como clic sobre arte.
    DZ.rigSelectingNode = true;
    try { dzSelect(target); } finally { DZ.rigSelectingNode = false; }
    DZ.rigSelectedId = id; DZ.rigSelectionSource = "rig";
  }
  else {
    dzDeselect(); DZ.rigSelectedId = id; DZ.rigSelectionSource = "rig";
    dzRigPanelSync(); dzRigOverlayRender();
  }
  return true;
}
function dzRigIsPageElement(el, svg) {
  if (!el || el.tagName.toLowerCase() !== "rect") return false;
  const vb = String(svg?.getAttribute("viewBox") || "0 0 1080 1080").trim().split(/[ ,]+/).map(Number);
  const pageArea = Math.max(1, Math.abs((vb[2] || 1080) * (vb[3] || 1080)));
  const width = Math.abs(parseFloat(el.getAttribute("width")) || 0);
  const height = Math.abs(parseFloat(el.getAttribute("height")) || 0);
  const fill = String(el.getAttribute("fill") || "").trim().toLowerCase().replace(/\s+/g, "");
  const stroke = String(el.getAttribute("stroke") || "none").trim().toLowerCase();
  const white = ["white", "#fff", "#ffffff", "rgb(255,255,255)", "rgba(255,255,255,1)"].includes(fill);
  return width * height >= pageArea * .20 && white && ["", "none", "transparent"].includes(stroke);
}
function dzRigDrawableElements() {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg"); if (!svg) return [];
  const usable = el => !DZ_SKIP_TAGS.includes(el.tagName.toLowerCase())
    && !el.classList?.contains("dz-onion") && !el.classList?.contains("dz-penui")
    && !dzRigIsPageElement(el, svg);
  // Línea, Color y las capas de usuario son contenedores editoriales, no
  // piezas del personaje. Vincular un hueso a uno de esos <g> hacía que un
  // hueso moviese todo el nivel y que los siguientes quedaran sin dibujo.
  const pieces = [];
  const walk = el => {
    if (!usable(el)) return;
    const tag = el.tagName.toLowerCase();
    const container = tag === "g" && (el.hasAttribute("data-low-art") || el.hasAttribute("data-low-layer"));
    if (container) { [...el.children].forEach(walk); return; }
    // Un grupo creado por el usuario sí es una pieza rígida canónica: sus
    // paths se mantienen juntos y reciben una sola matriz de hueso.
    pieces.push(el);
  };
  [...svg.children].forEach(walk);
  return pieces.filter((el, index, all) => !all.some((parent, i) => i !== index && parent.contains(el)));
}

/* Un lienzo nuevo debe quedar listo para animar desde el primer momento.
 * Mantiene el documento de dibujo, pero monta la Timeline y la X-sheet del
 * mismo LowDoc para que no haya que descubrir el botón de Animación a mano. */
async function dzEnsureAnimationWorkspace() {
  if (!DZ.path && !DZ.doc) return false;   // un .low no tiene DZ.path: es el caso de «Nuevo documento», justo el que esta funcion existe para atender
  if (!DZ.anim) await dzAnimToggle();
  if (!DZ.anim) return false;
  const W = LOW.workspace?.workspaces;
  const animationWs = W?.get?.("animation");
  if (animationWs) W.activate("animation", dzWsAplicar);
  // Un layout personalizado puede haber guardado la Timeline oculta. La
  // creación de un documento nuevo tiene una promesa más básica: siempre
  // deja visible al menos la Timeline (si estaba separada, sigue separada).
  dzAnimationDock(true);
  dzTimelineReveal();
  if (!dzIsPanelDetached("timeline")) $("#dzTimeline")?.removeAttribute("hidden");
  await dzTlMount();
  return true;
}
function dzRigPieceSpec(el, index, requestedId) {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  let id = String(requestedId || el.id || `pieza_${index + 1}`).trim().replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]/g, "_");
  if (!id) id = `pieza_${index + 1}`;
  const occupied = svg?.querySelector("#" + CSS.escape(id));
  if (occupied && occupied !== el) id = dzUniqueId(id + "_");
  el.id = id;
  let pivot = { x: 0, y: 0 }, area = 0;
  try {
    const box = el.getBoundingClientRect();
    pivot = dzRigDefaultPivot(el);
    area = Math.max(1, box.width) * Math.max(1, box.height);
  } catch (_) { /* una pieza sin caja sigue siendo registrable */ }
  el.setAttribute("data-pivot", `${Math.round(pivot.x)} ${Math.round(pivot.y)}`);
  return { id, elementId: id, pivot, area, element: el };
}
function dzRigRegisterSpecs(specs, label) {
  if (!DZ.doc || !specs.length) return [];
  const activeId = specs[0].id;
  DZ.rigSelectedId = activeId;
  DZ.sel = specs[0].element;
  dzDocCommit();
  const ids = DZ.doc.ensureRigNodes(specs, label) || [];
  const active = $("#dzCanvas")?.querySelector(":scope > svg")?.querySelector("#" + CSS.escape(activeId));
  if (active) dzSelect(active);
  dzMarkDirty(); dzBuildLayers(); dzRigPanelSync(); dzRigOverlayRender();
  return ids;
}
function dzRigRegisterSelected() {
  if (!DZ.doc || !DZ.sel) return dzSetStatus("Seleccioná una pieza del personaje en la mesa");
  const chosen = (DZ.multi || []).length > 1 ? DZ.multi.slice() : [DZ.sel];
  const pieces = chosen.filter((el, index, all) => !all.some((parent, i) => i !== index && parent.contains(el)));
  const requested = $("#rigId").value.trim();
  const specs = pieces.map((el, index) => dzRigPieceSpec(el, index, index === 0 ? requested : ""));
  const ids = dzRigRegisterSpecs(specs, specs.length > 1 ? "Registrar piezas del rig" : "Registrar pieza del rig");
  dzRigSetMode("build");
  dzSetStatus(ids.length > 1
    ? `${ids.length} piezas registradas · elegí el padre de cada una o usá Preparar dibujo`
    : `Pieza «${ids[0]}» registrada · colocá su pivote y elegí el padre`);
  return ids[0] || null;
}
function dzRigPrepareDrawing() {
  if (!DZ.doc) return dzSetStatus("Abrí una animación antes de preparar el esqueleto");
  const pieces = dzRigDrawableElements();
  if (!pieces.length) return dzSetStatus("Dibujá o importá piezas separadas antes de preparar el esqueleto");
  // Registrar objetos sólo cataloga el arte. Los huesos y sus pivotes nacen al
  // dibujar el alambre; mezclar ambas cosas generaba un segundo esqueleto
  // invisible (un nodo y un pivote por cada forma del dibujo).
  dzSnapshot();
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  const ids = pieces.map((el, index) => {
    let id = String(el.id || `pieza_${index + 1}`).trim().replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]/g, "_");
    if (!id) id = `pieza_${index + 1}`;
    const occupied = svg?.querySelector("#" + CSS.escape(id));
    if (occupied && occupied !== el) id = dzUniqueId(id + "_");
    el.id = id;
    el.setAttribute("data-rig-piece", "1");
    return id;
  });
  const limpiados = DZ.doc.removeLegacyRigArtNodes?.(ids) || [];
  for (const id of limpiados) {
    svg?.querySelector("#" + CSS.escape(id))?.removeAttribute("data-pivot");
    if (DZ.rigSelectedId === id) DZ.rigSelectedId = null;
  }
  dzDocCommit();
  dzMarkDirty(); dzBuildLayers(); dzRigPanelSync(); dzRigOverlayRender();
  dzRigSetMode("build");
  dzSetStatus(`${ids.length} objetos listos${limpiados.length ? ` · ${limpiados.length} pivotes viejos limpiados` : ""} · ahora dibujá el alambre encima y tocá Repartir`);
  return ids;
}
function dzRigLibraryAdd(keyArg) {
  if(!DZ.doc)return dzSetStatus("Abrí una animación antes de colocar un esqueleto");
  const key=typeof keyArg==="string"&&keyArg ? keyArg : ($("#rigLibrary")?.value||"human_standard"), svg=$("#dzCanvas")?.querySelector(":scope > svg");
  if(!svg)return dzSetStatus("No hay lienzo donde colocar el esqueleto");
  const vb=svg.viewBox?.baseVal, width=(vb?.width||+svg.getAttribute("width")||1000), height=(vb?.height||+svg.getAttribute("height")||1000);
  const x=vb?.x||0,y=vb?.y||0, padX=width*.12,padY=height*.07, sobreElDibujo=(typeof dzRigCajaDelDibujo==="function")&&dzRigCajaDelDibujo(svg), caja=sobreElDibujo||{x:x+padX,y:y+padY,width:width-padX*2,height:height-padY*2};
  const prefix=`${key}_${Date.now().toString(36).slice(-5)}`;
  dzSnapshot();
  const ids=LOW.animation.rigLibrary.apply(DZ.doc,key,caja,prefix);   // el esqueleto se mide SOBRE el dibujo
  if(!ids.length)return dzSetStatus("No se pudo colocar esa plantilla");
  DZ.rigSelectedId=ids[0]; dzRigSetMode("build"); dzRigSetTool("edit");
  dzRigPanelSync(); dzRigOverlayRender(); dzTimelineBadges(); dzMarkDirty();
  dzSetStatus(`${ids.length} huesos colocados ${sobreElDibujo?"encima del dibujo":"en el centro de la hoja (no hay dibujo que medir)"} · ajustá articulaciones y tocá Repartir para pegarlos al personaje`);
}

const DZ_CHARACTER_LIBRARY_KEY = "low.2d.characters.v1";
function dzCharacterLibraryRead() {
  try {
    const list = JSON.parse(localStorage.getItem(DZ_CHARACTER_LIBRARY_KEY) || "[]");
    return Array.isArray(list) ? list.map(x => LOW.animation.characterLibrary.read(x)) : [];
  } catch (_) { return []; }
}
function dzCharacterLibraryWrite(list) {
  localStorage.setItem(DZ_CHARACTER_LIBRARY_KEY, JSON.stringify(list.slice(0, 40)));
}
function dzCharacterLibraryRender(selectedId) {
  const select = $("#rigCharacterLibrary"); if (!select || !LOW.animation.characterLibrary) return;
  const list = dzCharacterLibraryRead();
  select.innerHTML = '<option value="">Mis personajes…</option>' + list.map(p =>
    `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");
  if (selectedId && list.some(p => p.id === selectedId)) select.value = selectedId;
  const remove = $("#rigCharacterDelete"); if (remove) remove.disabled = !list.length;
}
async function dzCharacterSave() {
  if (!DZ.doc) return dzSetStatus("Abrí o creá un personaje primero");
  const current = $("#rigCharacterLibrary")?.value;
  const list = dzCharacterLibraryRead(), previous = list.find(p => p.id === current);
  const name = await dzPromptModal("Guardar personaje", "nombre", previous?.name || DZ.doc.scene.name || "Mi personaje");
  if (name == null || !name.trim()) return;
  try {
    const preset = LOW.animation.characterLibrary.capture(DZ.doc, dzCanvasInner(), name,
      previous?.id || `char_${Date.now().toString(36)}`);
    const next = list.filter(p => p.id !== preset.id); next.unshift(preset);
    dzCharacterLibraryWrite(next); dzCharacterLibraryRender(preset.id);
    dzSetStatus(`Personaje «${preset.name}» guardado · podés abrir una copia en cualquier lienzo`);
  } catch (err) { sysMsg(" No se pudo guardar el personaje: " + (err.message || err)); }
}
async function dzCharacterLoad() {
  const id = $("#rigCharacterLibrary")?.value;
  const preset = dzCharacterLibraryRead().find(p => p.id === id);
  if (!preset) return dzSetStatus("Elegí un personaje guardado primero");
  if ((DZ.dirty || DZ.doc?.dirty) && !(await dzConfirmModal(`¿Reemplazar el personaje actual por una copia de «${preset.name}»?`, { ok: "Reemplazar", danger: true }))) return;
  if (!DZ.doc) await dzDocInit();
  dzSnapshot();
  dzCanvasSet(preset.drawing); dzSyncCanvasDocument(true); DZ.doc.writeDrawing(dzCanvasInner());
  DZ.doc.replaceRig(preset.rig, `Cargar personaje «${preset.name}»`);
  DZ.rigSelectedId = Object.keys(DZ.doc.scene.rig.nodes || {})[0] || null;
  dzBuildLayers(); dzRigSetMode("build"); dzRigSetTool("edit");
  dzRigPanelSync(); dzRigOverlayRender(); dzTimelineBadges(); dzMarkDirty();
  dzSetStatus(`Copia editable de «${preset.name}» cargada · la plantilla guardada no cambia`);
}
async function dzCharacterDelete() {
  const id = $("#rigCharacterLibrary")?.value;
  const list = dzCharacterLibraryRead(), preset = list.find(p => p.id === id);
  if (!preset) return dzSetStatus("Elegí una plantilla para quitar");
  if (!(await dzConfirmModal(`¿Quitar «${preset.name}» de tu biblioteca? El personaje abierto no se borra.`, { ok: "Quitar", danger: true }))) return;
  dzCharacterLibraryWrite(list.filter(p => p.id !== id)); dzCharacterLibraryRender();
  dzSetStatus(`Plantilla «${preset.name}» quitada · el personaje abierto permanece`);
}
async function dzRigImportCharacter() {
  if (!DZ.doc) await dzDocInit();
  const svg=$("#dzCanvas")?.querySelector(":scope > svg");
  if (!DZ.doc || !svg) return dzSetStatus("Abrí un lienzo antes de importar el personaje");
  const r=await api.import_character_art();
  if(!r||r.cancel)return;
  if(r.error)return sysMsg(" " + r.error);
  dzSnapshot();
  const vb=svg.viewBox?.baseVal, vx=vb?.x||0, vy=vb?.y||0,
    vw=vb?.width||+svg.getAttribute("width")||1000, vh=vb?.height||+svg.getAttribute("height")||1000;
  const imported=[];
  if(r.svg){
    const parsed=new DOMParser().parseFromString(r.svg,"image/svg+xml");
    if(parsed.querySelector("parsererror"))return dzSetStatus("Ese SVG no se pudo leer");
    const source=parsed.documentElement, src=(source.getAttribute("viewBox")||`0 0 ${source.getAttribute("width")||vw} ${source.getAttribute("height")||vh}`).trim().split(/[ ,]+/).map(Number);
    const sx=src[2]||vw, sy=src[3]||vh, scale=Math.min(vw*.8/sx,vh*.8/sy),
      tx=vx+(vw-sx*scale)/2-src[0]*scale, ty=vy+(vh-sy*scale)/2-src[1]*scale;
    const structural=new Set(["defs","style","metadata","title","desc"]);
    const visible=[...source.children].filter(child=>!structural.has(child.tagName.toLowerCase()));
    // Illustrator suele envolver todos los objetos en un único grupo "Layer 1".
    // En ese caso importamos sus hijos como piezas independientes conservando
    // los atributos heredados del grupo mediante un wrapper por objeto.
    const illustratorLayer=visible.length===1&&visible[0].tagName.toLowerCase()==="g"&&
      [...visible[0].children].filter(child=>!structural.has(child.tagName.toLowerCase())).length>1?visible[0]:null;
    const pieces=illustratorLayer
      ? [...illustratorLayer.children].filter(child=>!structural.has(child.tagName.toLowerCase())).map(child=>({child,parent:illustratorLayer}))
      : visible.map(child=>({child,parent:null}));
    for(const child of [...source.children]){
      const tag=child.tagName.toLowerCase();
      if(structural.has(tag)){
        svg.insertBefore(document.importNode(child,true),svg.firstChild); continue;
      }
    }
    for(const piece of pieces){
      let el=document.importNode(piece.child,true);
      if(piece.parent){
        const wrapper=document.createElementNS(SVGNS,"g");
        for(const attr of [...piece.parent.attributes])if(attr.name!=="id")wrapper.setAttribute(attr.name,attr.value);
        wrapper.appendChild(el); if(piece.child.id)wrapper.id=piece.child.id; el=wrapper;
      }
      const old=el.getAttribute("transform")||"";
      el.setAttribute("transform",`translate(${tx} ${ty}) scale(${scale}) ${old}`.trim());
      if(!el.id)el.id=dzUniqueId("pieza_");
      el.setAttribute("data-rig-piece","1"); dzArtAppend(svg,el); imported.push(el);
    }
  }else if(r.data){
    const el=document.createElementNS(SVGNS,"image");
    el.id=dzUniqueId("personaje_"); el.setAttribute("href",r.data);
    el.setAttribute("x",vx+vw*.1);el.setAttribute("y",vy+vh*.1);
    el.setAttribute("width",vw*.8);el.setAttribute("height",vh*.8);
    el.setAttribute("preserveAspectRatio","xMidYMid meet");el.setAttribute("opacity","1");
    el.setAttribute("data-rig-piece","1");dzArtAppend(svg,el);imported.push(el);
  }
  if(!imported.length)return dzSetStatus("El archivo no contiene piezas importables");
  dzSelect(imported[0]); dzDocCommit(); dzMarkDirty(); dzBuildLayers(); dzRigSetMode("build"); dzRigPanelSync();
  dzSetStatus(r.kind==="raster"
    ? `Personaje importado como una pieza · colocá el esqueleto; para mover miembros por separado necesitás un SVG por piezas`
    : `${imported.length} piezas SVG importadas · colocá el esqueleto encima y tocá Repartir`);
  return imported;
}
function dzRigRemoveSelected() {
  const node = dzRigSelectedNode(); if (!node) return;
  if (DZ.rigSubmode !== "build") {
    dzSetStatus(`Pasá a Construir para eliminar «${node.id}» sin alterar una pose`); return;
  }
  if (DZ.rigGestureCancel) { const cancel=DZ.rigGestureCancel; DZ.rigGestureCancel=null; cancel(); }
  DZ.rigLivePose=null; DZ.rigIKPreview=null; DZ.rigBoneGeometryPreview=null;
  if (DZ.doc.removeRigNode(node.id)) {
    DZ.sel?.removeAttribute("data-pivot"); DZ.rigSelectedId = null; DZ.rigSelectionSource = null;
    if (DZ.rigUltimaPieza === node.id) DZ.rigUltimaPieza = null;
    dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender();
    dzTimelineBadges(); dzMarkDirty();
    dzSetStatus(`Hueso «${node.id}» eliminado; el dibujo permanece intacto`);
  }
}
async function dzRigClearAll() {
  if (!DZ.doc || !Object.keys(DZ.doc.scene.rig.nodes || {}).length)
    return dzSetStatus("No hay ningún esqueleto para eliminar");
  if (!(await dzConfirmModal("¿Eliminar todo el esqueleto? El dibujo queda intacto y podés deshacer con Ctrl+Z.", { ok: "Eliminar", danger: true }))) return;
  if (!DZ.doc.clearRig()) return;
  DZ.rigSelectedId = null; DZ.rigConstraintId = null; DZ.rigLivePose = null; DZ.rigIKPreview = null;
  DZ.rigSelectionSource = null;
  document.querySelectorAll("[data-pivot]").forEach(el => el.removeAttribute("data-pivot"));
  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); dzTimelineBadges(); dzMarkDirty();
  dzSetStatus("Esqueleto eliminado · el dibujo permanece intacto · Ctrl+Z para recuperarlo");
}
/* Vincula la pieza SVG seleccionada en la mesa al hueso activo del esqueleto.
   Es el puente entre «Crear hueso» (cadena ósea) y el dibujo: sin esto el
   hueso se posa solo y no arrastra el arte. */
function dzRigBindSelection() {
  // Al elegir el dibujo la selección visual deja el overlay del hueso. Se usa
  // también la última pieza activa para que el flujo «hueso → dibujo →
  // Vincular» no pierda el destino justo en el último clic.
  const node = dzRigPiezaDestino();
  if (!node) return dzSetStatus("Elegí un hueso del esqueleto primero (clic en el overlay o en la lista)");
  const el = DZ.sel;
  if (!el || !el.id) return dzSetStatus("Seleccioná en la mesa la pieza del dibujo que querés vincular");
  if (!DZ.doc.bindRigElement(node.id, el.id)) return dzSetStatus("No pude vincular: revisá que el hueso y la pieza existan");
  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
  dzSetStatus(`«${el.id}» quedó vinculada sólo al hueso «${node.id}» · probalo antes de animar`);
}
function dzRigUnbindSelection() {
  const node = dzRigPiezaDestino();
  if (!node) return dzSetStatus("Elegí el hueso cuyo dibujo querés soltar");
  const elementId = node.elementId || node.binding?.elementId;
  if (!elementId) return dzSetStatus(`El hueso «${node.id}» no tiene un dibujo vinculado`);
  if (!DZ.doc.unbindRigElement(node.id)) return dzSetStatus("No pude soltar el vínculo");
  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
  dzSetStatus(`«${elementId}» quedó libre · el hueso «${node.id}» se conserva`);
}
function dzRigTogglePin() {
  const node = dzRigSelectedNode(); if (!node) return dzSetStatus("Elegí una pieza del esqueleto");
  DZ.doc.setRigPinned(node.id, !node.pinned); dzRigPanelSync(); dzRigOverlayRender();
}

/* Pivote automático proximal. Si ya hay un alambre, usa la articulación
   superior que cae dentro de la pieza; sin alambre usa el centro de su corte
   superior. El centro geométrico era correcto matemáticamente pero inútil para
   hombros, caderas y cuellos. */
function dzRigDefaultPivot(el) {
  let box;
  try { box = el.getBoundingClientRect(); } catch (_) { return { x: 0, y: 0 }; }
  const upper = { x: (box.left + box.right) / 2, y: box.top };
  const fallback = dzToUser(upper.x, upper.y);
  const bones = Object.values(DZ.doc?.scene?.rig?.bones || {});
  const margin = Math.max(8, Math.min(box.width, box.height) * .12);
  let best = null;
  for (const bone of bones) {
    const local = bone.head || bone.pivot; if (!local) continue;
    let user = local;
    try { user = DZ.doc.scene.rigWorldPoint(bone.id, dzRigCur(), local); } catch (_) { /* reposo */ }
    const screen = dzFromUser(user.x, user.y); if (!screen) continue;
    if (screen.x < box.left - margin || screen.x > box.right + margin ||
        screen.y < box.top - margin || screen.y > box.bottom + margin) continue;
    const dx = screen.x - upper.x, dy = screen.y - upper.y;
    // Se prioriza el corte superior y, en empate, el más cercano al eje medio.
    const score = Math.max(0, dy) * 1.35 + Math.abs(dx) * .45 + Math.hypot(dx, dy) * .25;
    if (!best || score < best.score) best = { score, point: user };
  }
  return best ? { x: best.point.x, y: best.point.y } : fallback;
}

function dzRigUpgradeLegacyPivots() {
  if (!DZ.doc) return 0;
  let changed = 0;
  for (const node of Object.values(DZ.doc.scene.rig.nodes || {})) {
    const el = dzRigNodeElement(node); if (!el || !node.pivot) continue;
    let center;
    try {
      const b = el.getBoundingClientRect(); center = dzToUser((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    } catch (_) { continue; }
    // Solo migrar el viejo valor automático (centro exacto); jamás pisar un
    // pivote que el usuario haya colocado deliberadamente.
    if (Math.hypot(node.pivot.x - center.x, node.pivot.y - center.y) > 2) continue;
    const pivot = dzRigDefaultPivot(el);
    if (Math.hypot(pivot.x - node.pivot.x, pivot.y - node.pivot.y) < 2) continue;
    DZ.doc.setRigPivot(node.id, pivot);
    el.setAttribute("data-pivot", `${Math.round(pivot.x)} ${Math.round(pivot.y)}`);
    changed++;
  }
  if (changed) { dzMarkDirty(); dzRigApplyLive(dzRigCur()); }
  return changed;
}
function dzRigEnsureVisiblePivots() {
  if (!DZ.doc) return 0;
  let changed=0;
  for(const node of Object.values(DZ.doc.scene.rig.nodes||{})) {
    if(node.pivot) continue;
    const el=dzRigNodeElement(node);
    let p=node.head||null;
    if(!p&&el) { try { p=dzRigDefaultPivot(el); } catch(_){} }
    if(!p) continue;
    DZ.doc.setRigPivot(node.id,p);
    if(el) el.setAttribute("data-pivot",`${Math.round(p.x)} ${Math.round(p.y)}`);
    changed++;
  }
  return changed;
}
function dzRigRefreshToolButtons(tool) {
  ["select", "pose", "create", "edit", "draw", "cut", "pivot"].forEach(value => {
    const id = "#rigTool" + value[0].toUpperCase() + value.slice(1);
    $(id)?.classList.toggle("on", value === tool);
  });
  $("#rigBoneTool")?.classList.toggle("on", tool === "create");
}
function dzRigAdoptCanvasTool(tool) {
  DZ.rigTool = tool;
  DZ.rigBoneTool = false;
  DZ.rigBonePreview = null;
  dzRigRefreshToolButtons(tool);
  dzRigOverlayRender();
}
function dzRigSetTool(tool) {
  if (!["select", "pose", "create", "edit", "draw", "cut", "pivot"].includes(tool)) tool = "select";
  if (DZModeMachine) tool = DZModeMachine.setRigTool(tool).rig.tool;
  else if ((DZ.rigSubmode || "build") !== "build" && ["create", "edit", "draw", "cut", "pivot"].includes(tool)) tool = "pose";
  DZ.rigTool = tool;
  DZ.rigBoneTool = tool === "create";
  // Crear/elegir huesos usa cursor nativo visible. Un pincel activo antes
  // dejaba `cursor:none` aplicado sobre el overlay completo.
  if (!["draw", "cut", "pivot"].includes(tool)) {
    $("#dzCanvas")?.classList.remove("tool-cursor-active");
    $("#dzCanvas")?.style.removeProperty("cursor");
    dzToolCursorHide();
  }
  dzRigRefreshToolButtons(tool);
  // El alambre, su selección y su edición son herramientas propias del rig.
  // No dejamos la flecha general activa por debajo: si el overlay pierde un
  // evento, la mesa tampoco puede seleccionar ni mover el arte accidentalmente.
  const canvasTool = { select:"rigselect", pose:"rigpose", create:"rigbone",
    edit:"rigedit", draw:"pencil", cut:"pliers", pivot:"pivot" }[tool];
  if (canvasTool) {
    DZ.rigToolSync = true;
    try { dzSetTool(canvasTool); } finally { DZ.rigToolSync = false; }
  }
  const n = dzRigSelectedNode();
  const status = {
    create: "Alambre: arrastrá para crear huesos · esta herramienta nunca mueve el esqueleto existente",
    edit: "Editar alambre: arrastrá una articulación o una punta del esqueleto ya creado",
    draw: "Dibujar: el alambre queda visible como guía pero no captura la tableta",
    cut: "Cortes: tocá el trazo donde termina una pieza y empieza la articulación",
    pivot: n
      ? `Pivote de «${n.id}»: hacé clic donde articula · Alt+clic lo quita`
      : "Pivotes: elegí primero un hueso del alambre"
  }[tool];
  if (status) dzSetStatus(status);
  dzRigOverlayRender();
}
function dzRigSetMode(mode) {
  // Cambiar de estado es una barrera transaccional. Un pointerup pendiente de
  // Editar no puede atravesar hacia Animar y escribir head/tail/pivot después
  // del cambio de modo.
  if (DZ.rigGestureCancel) {
    const cancelPendingRigGesture = DZ.rigGestureCancel;
    DZ.rigGestureCancel = null;
    cancelPendingRigGesture();
  }
  DZ.rigBoneGeometryPreview = null;
  DZ.rigBuildPreview = null;
  if (DZ.rigTesting) {
    dzRigDiscardPreview();
    DZ.rigTesting = false;
    DZ.rigAutoKey = DZ.rigAutoKeyBeforeTest !== false;
    const auto = $("#rigAutoKey");
    if (auto) { auto.disabled = false; auto.checked = DZ.rigAutoKey; }
  }
  const modeState = DZModeMachine?.enterRig(mode);
  DZ.rigSubmode = modeState
    ? (modeState.rig.phase === "build" ? "build" : modeState.rig.solver)
    : (["build", "fk", "ik"].includes(mode) ? mode : "build");
  // al cambiar de modo, la herramienta vuelve a una coherente con ese modo:
  // build → seleccionar;  fk/ik → posar (para que arrastrar ya pose, sin pasos extra)
  if (DZ.rigSubmode === "build") dzRigSetTool("select");
  else dzRigSetTool(DZ.rigTool === "create" || DZ.rigTool === "select" ? "pose" : DZ.rigTool);
  const construyendo = DZ.rigSubmode === "build";
  const panel = $("#dzRigPanel");
  panel.dataset.mode = DZ.rigSubmode;
  panel.dataset.estado = construyendo ? "construir" : "animar";   // gobierna que secciones se ven
  $("#rigToolPose").disabled = construyendo;
  $("#rigToolCreate").disabled = !construyendo;
  $("#rigToolEdit").disabled = !construyendo;
  ["rigToolDraw", "rigToolCut", "rigToolPivot"].forEach(id => {
    const button = $("#" + id); if (button) button.disabled = !construyendo;
  });
  // Dos estados: Construir arma el muneco, Animar lo posa. Directa/Inversa son
  // dos formas de posar DENTRO de Animar, no un tercer modo hermano: mezclarlos
  // era lo que hacia imposible saber en que se estaba parado.
  $("#rigModeBuild").classList.toggle("on", construyendo);
  $("#rigModeTest")?.classList.remove("on");
  $("#rigModeAnim")?.classList.toggle("on", !construyendo);
  $("#rigModeFk").classList.toggle("on", DZ.rigSubmode === "fk");
  $("#rigModeIk").classList.toggle("on", DZ.rigSubmode === "ik");
  const gesto = $("#rigGesto");
  if (gesto) gesto.textContent = construyendo
    ? "Objetos → alambre → pivotes → repartir."
    : (DZ.rigSubmode === "ik"
      ? "Arrastrá el rombo para acomodar la cadena."
      : "Arrastrá la manija para rotar o la articulación para mover.");
  const hints = { build: "Registrar sólo identifica el dibujo. El alambre crea los huesos; Repartir los vincula. Cortes es opcional.",
    fk: "El pivote sólo se cambia en Construir. Sin Auto-clave, el gesto es una prueba: Enter la clava, Esc la descarta.",
    ik: "Elegí una cadena y arrastrá el rombo: los dos huesos se clavan en una sola operación." };
  $("#rigHint").textContent = hints[DZ.rigSubmode]; dzRigOverlayRender();
}

function dzRigEnterTest() {
  if (!DZ.doc) return dzSetStatus("Abrí una animación antes de probar el rig");
  const readiness = dzRigReadinessStatus();
  if (!readiness.readyToTest)
    return dzSetStatus("Todavía no hay un esqueleto válido para probar · colocá o dibujá huesos primero");
  dzRigDiscardPreview();
  DZ.rigAutoKeyBeforeTest = DZ.rigAutoKey;
  DZ.rigTesting = true;
  DZ.rigAutoKey = false;
  const state = DZModeMachine?.enterRig("test");
  DZ.rigSubmode = state?.rig?.solver || "fk";
  const panel = $("#dzRigPanel");
  panel.dataset.mode = DZ.rigSubmode;
  panel.dataset.estado = "probar";
  const auto = $("#rigAutoKey");
  if (auto) { auto.checked = false; auto.disabled = true; }
  $("#rigModeBuild").classList.remove("on");
  $("#rigModeTest").classList.add("on");
  $("#rigModeAnim").classList.remove("on");
  $("#rigModeFk").classList.toggle("on", DZ.rigSubmode === "fk");
  $("#rigModeIk").classList.toggle("on", DZ.rigSubmode === "ik");
  dzRigSetTool("pose");
  $("#rigGesto").textContent = "Mové el personaje libremente · Esc restaura · aquí nunca se crean claves.";
  $("#rigHint").textContent = readiness.readyToAnimate
    ? "Prueba segura: comprobá jerarquía, pivotes y piezas. Pasá a Animar cuando responda correctamente."
    : "El esqueleto se puede probar, pero todavía no tiene arte vinculado. Volvé a Construir y tocá Repartir.";
  dzRigOverlayRender(); dzRigPanelSync();
  dzSetStatus("Modo Probar · ninguna pose se guarda y Escape restaura el personaje");
}

function dzRigToggleBoneTool() {
  if (!DZ.doc) return dzSetStatus("Abrí una animación antes de crear huesos");
  dzRigSetMode("build");
  dzRigSetTool(DZ.rigTool === "create" ? "select" : "create");
  dzSetStatus(DZ.rigBoneTool
    ? "Crear hueso: arrastrá desde la articulación hasta la punta · empezá cerca de otra punta para encadenarlo"
    : "Herramienta de huesos desactivada");
}

function dzRigBoneId() {
  const bones = DZ.doc?.scene.rig.bones || {};
  let index = Object.keys(bones).length + 1, id = "hueso_" + index;
  while (bones[id]) id = "hueso_" + (++index);
  return id;
}

function dzRigNearestBoneTail(point, maxDistance = 18 / Math.max(.1, DZ.zoom || 1)) {
  let best = null;
  for (const bone of Object.values(DZ.doc?.scene.rig.bones || {})) {
    if (!bone.tail) continue;
    const tail = DZ.doc.scene.rigWorldPoint(bone.id, dzRigCur(), bone.tail);
    const distance = Math.hypot(tail.x - point.x, tail.y - point.y);
    if (distance <= maxDistance && (!best || distance < best.distance)) best = { bone, point: tail, distance };
  }
  return best;
}

function dzRigBoneCreateDrag(e, forced = null) {
  if (!DZ.doc || !DZ.rigBoneTool || DZ.rigSubmode !== "build") return;
  e.preventDefault(); e.stopPropagation();
  const overlay = $("#dzRigOverlay");
  try { overlay.setPointerCapture?.(e.pointerId); } catch (_) { /* WebView sin captura */ }
  const pointerId = e.pointerId, rawHead = forced?.head || dzToUser(e.clientX, e.clientY);
  const snap = forced?.parentId ? { bone: DZ.doc.scene.rigBone(forced.parentId), point: rawHead } :
    dzRigNearestBoneTail(rawHead);
  const head = snap?.point || rawHead, parentId = forced?.parentId || snap?.bone?.id || null;
  DZ.rigBonePreview = { head, tail: head, parentId };
  let gestureToken = null;
  const preview = ev => {
    if (ev.pointerId !== pointerId) return;
    DZ.rigBonePreview = { head, tail: dzToUser(ev.clientX, ev.clientY), parentId };
    dzRigOverlayRender();
  };
  const cleanup = () => {
    try { overlay.releasePointerCapture?.(e.pointerId); } catch (_) { /* */ }
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
  };
  // Crea el hueso, lo selecciona y —si hay una pieza de arte debajo de la
  // articulación— la vincula al hueso de una vez. Así «Crear hueso» mueve el
  // dibujo sin un paso extra, como se espera de un esqueleto (Moho/Harmony).
  const commit = (tailPoint) => {
    const id = dzRigBoneId();
    DZ.doc.ensureRigBone(id, { name: id, parentId, head, pivot: head, tail: tailPoint });
    DZ.rigSelectedId = id;
    // El centro del hueso cae sobre la pieza que controla; la articulación
    // inicial suele estar justo entre torso/brazo y daba vínculos ambiguos.
    const samples = [
      { x: head.x + (tailPoint.x - head.x) * .55, y: head.y + (tailPoint.y - head.y) * .55 },
      { x: head.x + (tailPoint.x - head.x) * .78, y: head.y + (tailPoint.y - head.y) * .78 },
      head,
    ];
    const alreadyBound = new Set(Object.values(DZ.doc.scene.rig.nodes)
      .filter(n => n.id !== id && n.elementId).map(n => n.elementId));
    let artId = null;
    for (const sample of samples) {
      const client = dzFromUser(sample.x, sample.y); if (!client) continue;
      const art = dzRigArtAtPoint(client.x, client.y);
      if (!art || alreadyBound.has(art.id)) continue;
      // Una pieza sin nombre recibe nombre de PIEZA, no el del hueso: si adopta
      // "hueso_12" el dibujo y su esqueleto pasan a llamarse igual y no hay
      // forma de distinguirlos en la lista ni en el archivo.
      if (art && !art.id) art.id = dzUniqueId("pieza_");
      if (art && art.id && DZ.doc.bindRigElement(id, art.id)) artId = art.id;
      if (artId) break;
    }
    dzRigPanelSync(); dzRigOverlayRender(); dzTimelineBadges(); dzMarkDirty();
    dzSetStatus((parentId ? "Hueso «" + id + "» conectado a «" + parentId + "»" : "Hueso raíz «" + id + "» creado")
      + (artId ? " y vinculado a «" + artId + "»" : " · Vincular dibujo para que mueva el arte")
      + " · arrastrá desde su punta para continuar la cadena");
  };
  const finish = ev => {
    if (ev.pointerId !== pointerId) return; cleanup();
    const value = DZ.rigBonePreview; DZ.rigBonePreview = null;
    if (!value) { dzRigOverlayRender(); return; }
    // clic corto (sin arrastrar): crea un hueso de longitud mínima horizontal
    // en vez de no hacer nada — el usuario lo ve al instante y lo puede editar.
    let tail = value.tail;
    if (Math.hypot(tail.x - head.x, tail.y - head.y) < 4) tail = { x: head.x + 28, y: head.y };
    commit(tail);
  };
  const cancel = () => { cleanup(); dzRigFinishGesture(gestureToken); DZ.rigBonePreview = null; dzRigOverlayRender(); };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", preview);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", cancel);
}

function dzRigBoneGeometryDrag(e, node, handle) {
  if (!DZ.doc || DZ.rigSubmode !== "build" || !node?.head || !node?.tail) return;
  e.preventDefault(); e.stopPropagation(); dzRigSelectNode(node.id);
  const pointerId = e.pointerId, start = dzToUser(e.clientX, e.clientY);
  const nodes=DZ.doc.scene.rig.nodes;
  const original=Object.fromEntries(Object.values(nodes).filter(n=>n.head&&n.tail)
    .map(n=>[n.id,{head:{...n.head},tail:{...n.tail},parentId:n.parentId}]));
  let gestureToken = null;
  const descendants=(id,out=new Set())=>{for(const n of Object.values(nodes))if(n.parentId===id&&!out.has(n.id)){out.add(n.id);descendants(n.id,out);}return out;};
  const joined=(parent,child)=>{
    if(!parent||!child)return false;
    const length=Math.hypot(parent.tail.x-parent.head.x,parent.tail.y-parent.head.y);
    return Math.hypot(parent.tail.x-child.head.x,parent.tail.y-child.head.y)<=Math.max(8,length*.12);
  };
  const preview = ev => {
    if (ev.pointerId !== pointerId) return;
    const point = dzToUser(ev.clientX, ev.clientY);
    const updates={};
    if (handle === "tail") {
      updates[node.id]={head:{...original[node.id].head},tail:point};
      for(const child of Object.values(nodes).filter(n=>n.parentId===node.id&&original[n.id]&&joined(original[node.id],original[n.id])))
        updates[child.id]={head:point,tail:{...original[child.id].tail}};
    } else if(handle === "head") {
      updates[node.id]={head:point,tail:{...original[node.id].tail}};
      const parent=node.parentId&&original[node.parentId];
      if(parent&&joined(parent,original[node.id]))updates[node.parentId]={head:{...parent.head},tail:point};
    } else {
      const dx = point.x - start.x, dy = point.y - start.y;
      const moving=new Set([node.id,...descendants(node.id)]);
      for(const id of moving){const base=original[id];if(base)updates[id]={head:{x:base.head.x+dx,y:base.head.y+dy},tail:{x:base.tail.x+dx,y:base.tail.y+dy}};}
      const parent=node.parentId&&original[node.parentId];
      if(parent&&joined(parent,original[node.id]))updates[node.parentId]={head:{...parent.head},tail:{...updates[node.id].head}};
    }
    DZ.rigBoneGeometryPreview = updates;
    dzRigOverlayRender();
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
  };
  const finish = ev => {
    if (ev.pointerId !== pointerId) return; cleanup();
    if (!dzRigFinishGesture(gestureToken)) return;
    const value = DZ.rigBoneGeometryPreview; DZ.rigBoneGeometryPreview = null;
    // Segunda validación en el punto de escritura. El gesto pudo empezar en
    // Construir y terminar después de pulsar Animar.
    if (DZ.rigSubmode !== "build" || DZ.rigTool !== "edit") {
      dzRigOverlayRender();
      return dzSetStatus("Edición cancelada · Animar conserva intacta la forma del esqueleto");
    }
    if (value && DZ.doc.setRigBoneGeometries(value, handle==="body"?"Mover rama del esqueleto":"Editar articulación")) {
      dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
      dzSetStatus(handle === "body" ? "Rama movida sin separar la jerarquía" : "Articulación actualizada sin abrir la cadena");
    } else dzRigOverlayRender();
  };
  const cancel = () => { cleanup(); dzRigFinishGesture(gestureToken); DZ.rigBoneGeometryPreview = null; dzRigOverlayRender(); };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", preview);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", cancel);
}

/* ══ FK sobre el overlay del esqueleto ═════════════════════════════════════
   En modo FK podés POSAR el hueso directamente desde el esqueleto:
   • arrastrar el cuerpo o la punta  → rota el hueso sobre su pivote;
   • arrastrar la articulación        → mueve el hueso (y sus hijos siguen).
   Antes el overlay sólo seleccionaba; ahora el gesto se vuelve clave de rig. */
function dzRigBoneFKDrag(e, node, mode) {
  if (!DZ.doc || DZ.rigSubmode !== "fk" || !node) return;
  e.preventDefault(); e.stopPropagation(); dzRigSelectNode(node.id);
  const pointerId = e.pointerId, frame = dzRigCur(), start = dzToUser(e.clientX, e.clientY);
  const pivot = node.pivot
    ? DZ.doc.scene.rigWorldPoint(node.id, frame, node.pivot)
    : (node.head ? DZ.doc.scene.rigWorldPoint(node.id, frame, node.head) : { x: 0, y: 0 });
  const k0 = dzRigLocalAt(node.id, frame) || { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
  const a0 = Math.atan2(start.y - pivot.y, start.x - pivot.x);
  let tocaElTope = false;   // para poder explicar por que dejo de girar
  // El giro se ACUMULA: atan2 devuelve entre -180 y 180, asi que al cruzar esa
  // linea el angulo salta al otro extremo y el gesto no podia pasar de media
  // vuelta —parecia que el hueso hacia tope—. Se lleva la cuenta del recorrido
  // real para poder dar vueltas enteras.
  let aPrevio = a0, giroAcumulado = 0;
  let gestureToken = null;
  const move = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const p = dzToUser(ev.clientX, ev.clientY), pose = { ...k0 };
    if (mode === "translate") {
      const local = dzRigParentDelta(node.id, p.x - start.x, p.y - start.y, frame);
      pose.x = (k0.x || 0) + local.x; pose.y = (k0.y || 0) + local.y;
    } else {
      const a = Math.atan2(p.y - pivot.y, p.x - pivot.x);
      // frenado EN VIVO contra los topes del hueso: si solo se clampeara al
      // soltar, el brazo pasaria de largo y despues pegaria un salto atras.
      // Sin tope (el rango completo) gira libre: tiene que poder dar la vuelta.
      let paso = a - aPrevio;
      if (paso > Math.PI) paso -= 2 * Math.PI;
      else if (paso < -Math.PI) paso += 2 * Math.PI;
      giroAcumulado += paso;
      aPrevio = a;
      const crudo = (k0.r || 0) + giroAcumulado * 180 / Math.PI;
      pose.r = LOW.animation.rigAplicarTope(node.limits, crudo);
      tocaElTope = Math.abs(pose.r - crudo) > 0.5;
    }
    DZ.rigLivePose = { [node.id]: pose };
    dzRigApplyLive(frame, DZ.rigLivePose);
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", cancel);
  };
  const up = (ev) => {
    if (ev.pointerId !== pointerId) return; cleanup();
    if (!dzRigFinishGesture(gestureToken)) return;
    const pose = DZ.rigLivePose && DZ.rigLivePose[node.id];
    if (pose) {
      if (DZ.rigAutoKey === false) {
        dzRigPanelSync();
        dzSetStatus("Pose de prueba en F" + frame + " · Enter clava, Esc descarta");
        return;
      }
      DZ.rigLivePose = null;
      dzRigSetKey(node.id, frame, pose);
      // Si dejo de girar antes de donde lo llevabas, no es que se colgo: lo paro
      // su tope. Decirlo evita que parezca una falla del programa.
      dzSetStatus(tocaElTope
        ? "«" + node.id + "» llegó a su tope de giro (" + (node.limits?.min ?? -180) +
          "° a " + (node.limits?.max ?? 180) + "°) · se cambia en Construir"
        : "Hueso «" + node.id + "» posado en F" + frame + (mode === "translate" ? " (mover)" : " (rotar)"));
    } else {
      DZ.rigLivePose = null;
      dzRigApplyLive(frame); dzRigOverlayRender();
    }
  };
  const cancel = () => { cleanup(); dzRigFinishGesture(gestureToken); DZ.rigLivePose = null; dzRigApplyLive(frame); dzRigOverlayRender(); };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", cancel);
}

function dzRigBuildPivotDrag(e, node) {
  if (!DZ.doc || DZ.rigSubmode !== "build") return;
  e.preventDefault(); e.stopPropagation();
  const target = dzRigNodeElement(node); dzRigSelectNode(node.id);
  const pointerId = e.pointerId;
  let gestureToken = null;
  const preview = ev => {
    if (ev.pointerId !== pointerId) return;
    DZ.rigBuildPreview = { nodeId: node.id, pivot: dzToUser(ev.clientX, ev.clientY) };
    dzRigOverlayRender();
  };
  const finish = ev => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
    if (!dzRigFinishGesture(gestureToken)) return;
    const value = DZ.rigBuildPreview; DZ.rigBuildPreview = null;
    if (DZ.rigSubmode !== "build" || !["pivot", "edit"].includes(DZ.rigTool)) {
      dzRigOverlayRender();
      return dzSetStatus("Pivote sin cambios · sólo se edita en Construir");
    }
    if (value?.nodeId === node.id) {
      DZ.doc.setRigPivot(node.id, value.pivot);
      target?.setAttribute("data-pivot", `${Math.round(value.pivot.x)} ${Math.round(value.pivot.y)}`);
      dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
      dzSetStatus(`Pivote de «${node.id}» colocado · ahora arrastrá su cuadrado al padre`);
    } else dzRigOverlayRender();
  };
  const cancel = () => {
    DZ.rigBuildPreview = null;
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
    dzRigFinishGesture(gestureToken);
    dzRigOverlayRender();
  };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", preview);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", cancel);
}

function dzRigBuildLinkDrag(e, node) {
  if (!DZ.doc || DZ.rigSubmode !== "build") return;
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  let gestureToken = null;
  const pointer = ev => ({ x: ev.clientX, y: ev.clientY });
  DZ.rigLinkPreview = { childId: node.id, pointer: pointer(e) };
  const preview = ev => {
    if (ev.pointerId !== pointerId) return;
    DZ.rigLinkPreview = { childId: node.id, pointer: pointer(ev) }; dzRigOverlayRender();
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
  };
  const finish = ev => {
    if (ev.pointerId !== pointerId) return; cleanup();
    if (!dzRigFinishGesture(gestureToken)) return;
    const hit = document.elementsFromPoint(ev.clientX, ev.clientY)
      .find(el => el.classList?.contains("dz-rig-joint") && el.dataset.id !== node.id);
    DZ.rigLinkPreview = null;
    const parentId = hit?.dataset.id || null;
    const changed = DZ.doc.setRigParent(node.id, parentId);
    if (changed === false && parentId) dzSetStatus("Ese vínculo formaría un ciclo y no se aplicó");
    else dzSetStatus(parentId ? `«${node.id}» vinculada a «${parentId}»` : `«${node.id}» quedó sin padre`);
    dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
  };
  const cancel = () => { cleanup(); dzRigFinishGesture(gestureToken); DZ.rigLinkPreview = null; dzRigOverlayRender(); };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", preview);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", cancel);
}
function dzRigKeyAll() {
  if (!DZ.doc) return;
  const poses = Object.fromEntries(Object.keys(DZ.doc.scene.rig.nodes).map(id => [id, DZ.doc.scene.rigPose(id, dzRigCur())]));
  if (DZ.doc.setRigPoseKeys(poses, dzRigCur(), "Clave global del rig")) {
    dzRigApplyLive(dzRigCur()); dzTimelineBadges(); dzRigPanelSync(); dzSetStatus(`Pose global clavada en F${dzRigCur()}`);
  }
}
function dzRigResetPose() {
  const node = dzRigSelectedNode(); if (!node) return;
  DZ.doc.setRigKey(node.id, dzRigCur(), { x: 0, y: 0, r: 0, sx: 1, sy: 1 });
  dzRigApplyLive(dzRigCur()); dzRigPanelSync();
}
/* pose de prueba (auto-clave OFF): Enter la clava, Esc la descarta */
function dzRigCommitPreview() {
  if (DZ.rigTesting) return false;
  const frame = dzRigCur();
  if (DZ.rigIKPreview && DZ.doc) {
    const p = DZ.rigIKPreview; DZ.rigIKPreview = null;
    const ok = DZ.doc.setRigIKTarget(p.constraintId, frame, p.target);
    dzRigApplyLive(frame); dzTimelineBadges(); dzRigPanelSync(); dzRigOverlayRender();
    return ok;
  }
  if (DZ.rigLivePose) {
    const poses = DZ.rigLivePose; DZ.rigLivePose = null;
    DZ.doc.setRigPoseKeys(poses, frame, "Clave de pose");
    dzRigApplyLive(frame); dzTimelineBadges(); dzRigPanelSync(); dzRigOverlayRender();
    return true;
  }
  return false;
}
function dzRigDiscardPreview() {
  const had = !!(DZ.rigLivePose || DZ.rigIKPreview);
  DZ.rigLivePose = null; DZ.rigIKPreview = null;
  if (had) { dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); }
  return had;
}
function dzRigCreateIK() {
  if (!DZ.doc) return;
  const id = DZ.doc.createRigIK($("#rigIkRoot").value, $("#rigIkMid").value, $("#rigIkEnd").value);
  if (!id) return dzSetStatus("IK necesita una cadena consecutiva con tres pivotes: hombro → codo → extremo");
  DZ.rigConstraintId = id; dzRigSetMode("ik"); dzRigPanelSync(); dzRigOverlayRender();
  dzSetStatus("Cadena IK creada · arrastrá el rombo verde para posar");
}
function dzRigDeleteIK() {
  if (!DZ.doc || !DZ.rigConstraintId) return;
  DZ.doc.deleteRigConstraint(DZ.rigConstraintId); DZ.rigConstraintId = null; dzRigPanelSync(); dzRigOverlayRender();
}
function dzRigFlipIK() {
  if (!DZ.doc || !DZ.rigConstraintId) return;
  const c = DZ.doc.scene.rigConstraint(DZ.rigConstraintId); if (!c) return;
  DZ.doc.setRigIKBend(c.id, c.bend === -1 ? 1 : -1);
  const target = DZ.doc.scene.rigTargetAt(c.id, dzRigCur()); if (target) DZ.doc.setRigIKTarget(c.id, dzRigCur(), target);
  dzRigApplyLive(dzRigCur()); dzRigPanelSync();
}
/** Si el extremo quedo lejos del objetivo, POR QUE. Sin esto el brazo se queda
 *  corto y no hay forma de saber si falta alcance o lo frena un tope. */
function dzRigIKPorQueNoLlega(constraintId, target) {
  const sc = DZ.doc && DZ.doc.scene, c = sc && sc.rigConstraint(constraintId);
  if (!c || !target) return null;
  const root = sc.rigNode(c.rootId), mid = sc.rigNode(c.midId), end = sc.rigNode(c.effectorId);
  if (!root || !mid || !end || !root.pivot || !mid.pivot || !end.pivot) return null;
  const frame = dzRigCur();
  const donde = sc.rigWorldPoint(end.id, frame, end.pivot);
  const error = Math.hypot(donde.x - target.x, donde.y - target.y);
  if (error <= 2) return null;                       // llego: nada que explicar

  const l1 = Math.hypot(mid.pivot.x - root.pivot.x, mid.pivot.y - root.pivot.y);
  const l2 = Math.hypot(end.pivot.x - mid.pivot.x, end.pivot.y - mid.pivot.y);
  const base = sc.rigWorldPoint(root.id, frame, root.pivot);
  const dist = Math.hypot(target.x - base.x, target.y - base.y);
  if (dist > l1 + l2 + 1)
    return `El objetivo est\u00e1 m\u00e1s lejos de lo que da el brazo (${Math.round(dist)} px ` +
      `contra ${Math.round(l1 + l2)} de alcance) \u00b7 se estir\u00f3 todo lo que pudo`;

  // esta al alcance y aun asi no llega: lo frena un tope
  const pegado = [root, mid].find(n => {
    const r = sc.rigPose(n.id, frame).r;
    return Math.abs(r - (n.limits?.min ?? -180)) < 0.5 || Math.abs(r - (n.limits?.max ?? 180)) < 0.5;
  });
  if (pegado)
    return `El tope de \u00ab${pegado.id}\u00bb no lo deja llegar \u00b7 prob\u00e1 ` +
      `«Invertir» o ampli\u00e1 su l\u00edmite`;
  return `Qued\u00f3 a ${Math.round(error)} px del objetivo`;
}

/** El pole efectivo de una cadena: el que el animador ya definió, o el que LOW
 *  ofrece del lado por el que la cadena YA dobla. Aceptar la oferta no mueve
 *  nada; por eso puede mostrarse sin haber escrito todavía en el documento. */
function dzRigPolePoint(c, frame) {
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc || !c) return null;
  const guardado = sc.rigPoleAt(c.id, frame);
  if (guardado) return guardado;
  const root = sc.rigNode(c.rootId), mid = sc.rigNode(c.midId), end = sc.rigNode(c.effectorId);
  if (!root?.pivot || !mid?.pivot || !end?.pivot) return null;
  return LOW.rigging.input.suggestedPole({
    root: sc.rigWorldPoint(c.rootId, frame, root.pivot),
    joint: sc.rigWorldPoint(c.midId, frame, mid.pivot),
    effector: sc.rigWorldPoint(c.effectorId, frame, end.pivot) });
}

/** Arrastrar el pole mueve la articulación en vivo, pero no escribe nada hasta
 *  soltar: Escape o perder el contacto de la tableta dejan la cadena como
 *  estaba, igual que el resto de los gestos del rig. */
function dzRigPoleDrag(e, constraintId) {
  if (!DZ.doc) return;
  e.preventDefault(); e.stopPropagation();
  const pointerId = e.pointerId;
  let gestureToken = null;
  const preview = ev => {
    if (ev.pointerId !== pointerId) return;
    const pole = dzToUser(ev.clientX, ev.clientY), num = dzRigCur();
    const solved = DZ.doc.scene.rigSolveIK(constraintId, num,
      DZ.doc.scene.rigTargetAt(constraintId, num), pole);
    if (!solved) return;
    DZ.rigPolePreview = { constraintId, pole };
    dzRigApplyLive(num, solved.poses);
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
  };
  const cancel = () => { cleanup(); dzRigFinishGesture(gestureToken); DZ.rigPolePreview = null; dzRigApplyLive(dzRigCur()); };
  const finish = ev => {
    if (ev.pointerId !== pointerId) return; cleanup();
    if (!dzRigFinishGesture(gestureToken)) return;
    const value = DZ.rigPolePreview;
    DZ.rigPolePreview = null;
    if (value && DZ.doc.setRigIKPole(constraintId, dzRigCur(), value.pole)) {
      dzRigApplyLive(dzRigCur()); dzTimelineBadges(); dzRigPanelSync();
      dzSetStatus(`Pole clavado en F${dzRigCur()} · la articulación lo sigue`);
    } else dzRigApplyLive(dzRigCur());
  };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", preview);
  document.addEventListener("pointerup", finish);
  document.addEventListener("pointercancel", cancel);
}

/** Emparejar: el objetivo IK viaja a donde la cadena ya está en FK. Después de
 *  esto se puede posar por IK sin que el dibujo pegue un salto. */
function dzRigMatchIK() {
  if (!DZ.doc || !DZ.rigConstraintId) return dzSetStatus("Elegí una cadena IK primero");
  if (!DZ.doc.matchRigIK(DZ.rigConstraintId, dzRigCur()))
    return dzSetStatus("La cadena no tiene los tres pivotes necesarios");
  dzRigApplyLive(dzRigCur()); dzTimelineBadges(); dzRigPanelSync(); dzRigOverlayRender();
  dzSetStatus(`Objetivo IK emparejado con la pose de F${dzRigCur()}`);
}

/** Clavar o soltar el apoyo de la cadena activa en el cuadro actual. Clavar no
 *  mueve nada; a partir de ahí, mover el cuerpo deja de arrastrar el pie. */
function dzRigTogglePin() {
  if (!DZ.doc || !DZ.rigConstraintId) return dzSetStatus("Elegí una cadena IK primero");
  const frame = dzRigCur(), clavado = DZ.doc.scene.rigPinnedAt(DZ.rigConstraintId, frame);
  if (!DZ.doc.setRigPin(DZ.rigConstraintId, frame, !clavado))
    return dzSetStatus("La cadena no admite apoyo en este cuadro");
  dzRigApplyLive(frame); dzTimelineBadges(); dzRigPanelSync(); dzRigOverlayRender();
  dzSetStatus(clavado ? `Apoyo suelto desde F${frame}` : `Apoyo clavado en F${frame} · el cuerpo ya no lo arrastra`);
}

/** El camino inverso: hornear la pose del cuadro y apagar la cadena, para
 *  seguir a mano desde donde quedó. */
function dzRigMatchFK() {
  if (!DZ.doc || !DZ.rigConstraintId) return dzSetStatus("Elegí una cadena IK primero");
  if (!DZ.doc.matchRigFK(DZ.rigConstraintId, dzRigCur()))
    return dzSetStatus("No hay pose que pasar a FK en este cuadro");
  dzRigApplyLive(dzRigCur()); dzTimelineBadges(); dzRigPanelSync(); dzRigOverlayRender();
  dzSetStatus(`Cadena en FK desde F${dzRigCur()} · la pose quedó clavada`);
}

function dzRigIKDrag(e, constraintId) {
  if (!DZ.doc) return;
  e.preventDefault(); e.stopPropagation(); const pointerId = e.pointerId;
  let gestureToken = null;
  const preview = ev => {
    if (ev.pointerId !== pointerId) return;
    const target = dzToUser(ev.clientX, ev.clientY), solved = DZ.doc.scene.rigSolveIK(constraintId, dzRigCur(), target);
    if (!solved) return;
    DZ.rigIKPreview = { constraintId, target: solved.target, poses: solved.poses }; dzRigApplyLive(dzRigCur(), solved.poses);
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", preview);
    document.removeEventListener("pointerup", finish);
    document.removeEventListener("pointercancel", cancel);
  };
  const cancel = () => { cleanup(); dzRigFinishGesture(gestureToken); DZ.rigIKPreview = null; dzRigApplyLive(dzRigCur()); };
  const finish = ev => {
    if (ev.pointerId !== pointerId) return; cleanup();
    if (!dzRigFinishGesture(gestureToken)) return;
    const value = DZ.rigIKPreview;
    if (value && DZ.rigAutoKey === false) {
      dzSetStatus(`Objetivo IK de prueba en F${dzRigCur()} · Enter clava, Esc descarta`);
      return;
    }
    DZ.rigIKPreview = null;
    if (value && DZ.doc.setRigIKTarget(constraintId, dzRigCur(), value.target)) {
      dzRigApplyLive(dzRigCur()); dzTimelineBadges(); dzRigPanelSync();
      dzSetStatus(dzRigIKPorQueNoLlega(constraintId, value.target) ||
        `Pose IK clavada en F${dzRigCur()}`);
    }
  };
  gestureToken = dzRigTrackGesture(cancel);
  document.addEventListener("pointermove", preview); document.addEventListener("pointerup", finish); document.addEventListener("pointercancel", cancel);
}
/* ══ LIPSYNC POR AMPLITUD ═══════════════════════════════════════════════════
   Lo que hace: reparte las bocas de la pieza según cuánta voz hay en cada
   cuadro. Lo que NO hace: distinguir fonemas — para eso hace falta
   reconocimiento del habla, y LOW no lo tiene. Se dice así en el panel, porque
   prometer sincronización de fonemas y entregar amplitud es peor que no tenerlo.
   Deja claves de sustitución comunes, corregibles desde la X-sheet.
   ═══════════════════════════════════════════════════════════════════════ */
function dzLipFormas() {
  const nodo = dzRigSelectedNode(), sc = DZ.doc && DZ.doc.scene;
  if (!nodo || !sc) return { slotId: null, variantes: [] };
  const slotId = dzRigSlotDe(nodo);
  return { slotId, variantes: slotId ? sc.rigVariants(slotId) : [] };
}
function dzLipPanelSync() {
  const caja = $("#rigLipFormas"), estado = $("#rigLipEstado");
  if (!caja) return;
  const { variantes } = dzLipFormas();
  const pista = DZ.doc && DZ.doc.audio;
  caja.innerHTML = "";
  variantes.forEach((v, i) => {
    const chip = document.createElement("span");
    chip.className = "rig2-lip-forma";
    chip.textContent = (i + 1) + ". " + (v.name || v.elementId);
    chip.title = i === 0 ? "La primera es la boca cerrada (silencio)"
      : i === variantes.length - 1 ? "La última es la boca más abierta" : "";
    caja.appendChild(chip);
  });
  if (!variantes.length) caja.innerHTML = '<span class="rig2-lip-vacio">Elegí la pieza de la boca: sus dibujos son las formas, de cerrada a abierta.</span>';
  if (estado) estado.textContent = !pista ? "sin audio"
    : variantes.length < 2 ? "faltan bocas"
    : `${variantes.length} bocas · ${pista.name || "audio"}`;
  const listo = !!pista && variantes.length >= 2;
  ["rigLipGen", "rigLipClear"].forEach((k) => { const b = $("#" + k); if (b) b.disabled = !listo; });
}
function dzLipRango() {
  const inEl = $("#tlIn"), outEl = $("#tlOut");
  const desde = Math.max(1, +(inEl && inEl.value) || 1);
  const pedido = +(outEl && outEl.value) || 0;
  const ultimo = (DZ.doc && DZ.doc.scene.lastFrame()) || desde;
  return { desde, hasta: pedido > 0 ? Math.max(desde, pedido) : Math.max(desde, ultimo) };
}
function dzLipGenerar() {
  const { slotId, variantes } = dzLipFormas();
  const pista = DZ.doc && DZ.doc.audio;
  if (!slotId || variantes.length < 2) return dzSetStatus("Elegí la pieza de la boca, con dos dibujos o más");
  if (!pista) return dzSetStatus("Cargá el audio de la toma antes de sincronizar");
  const fps = Math.max(1, +$("#tlFps").value || DZ.doc.scene.fps || 24);
  let picos = pista.peaks && pista.peaks.length ? pista.peaks : null;
  if (!picos && pista.buffer) picos = LOW.animation.lipsyncPicosDeBuffer(pista.buffer, fps);
  if (!picos || !picos.length) return dzSetStatus("El audio no tiene análisis todavía: volvé a cargarlo");
  const { desde, hasta } = dzLipRango();
  // el desfase del audio se respeta: si va corrido, la boca va corrida igual
  const off = Math.round(pista.offset || 0);
  const corridos = off ? Array.from({ length: picos.length + Math.max(0, off) },
    (_, i) => picos[i - off] || 0) : picos;
  const r = LOW.animation.lipsyncPorAmplitud(corridos, variantes.map((v) => v.id), {
    umbral: (+$("#rigLipUmbral").value || 8) / 100,
    sosten: +$("#rigLipSosten").value || 2, desde, hasta,
  });
  if (!r.cambios) return dzSetStatus("El audio está en silencio en ese tramo: no hay nada que sincronizar");
  const puestas = DZ.doc.applyLipsync(slotId, r.keys, "Lipsync de la toma");
  dzRigApplyLive(dzRigCur()); dzRigPanelSync();
  if (DZ.xsView) DZ.xsView.render();
  dzSetStatus(`Lipsync: ${puestas} cambios de boca entre F${desde} y F${hasta} · ` +
    "corregí lo que haga falta desde la X-sheet · Ctrl+Z lo saca entero");
}
function dzLipBorrar() {
  const { slotId } = dzLipFormas();
  const { desde, hasta } = dzLipRango();
  if (!slotId || !DZ.doc || !DZ.doc.clearRigSwitchRange(slotId, desde, hasta))
    return dzSetStatus("No había claves de boca en ese tramo");
  dzRigApplyLive(dzRigCur()); dzRigPanelSync();
  if (DZ.xsView) DZ.xsView.render();
  dzSetStatus(`Claves de boca borradas entre F${desde} y F${hasta}`);
}

/* ══ CONTROLES: los diales de cara, manos y ojos (§4.3, último nivel) ═══════
   Un dial con nombre que el animador mueve y que conduce acciones. Por dentro
   es un canal más (`controls/<id>`), así que hereda claves por cuadro, curvas
   en el Function Editor y la posibilidad de conducir un Smart Bone, sin
   inventar un subsistema paralelo para la cara.
   ═══════════════════════════════════════════════════════════════════════ */
function dzDialSeleccionado() {
  const marcado = $("#rigDialLista")?.querySelector(".rig2-dial.sel");
  return marcado ? marcado.dataset.id : null;
}
async function dzDialNuevo() {
  if (!DZ.doc) return dzSetStatus("Abrí una animación para crear controles");
  const nombre = await dzPromptModal("Control nuevo",
    "nombre del dial — ej. «boca abierta», «ceja izquierda»", "boca abierta");
  if (nombre == null) return dzSetStatus("Control no creado");
  const limpio = String(nombre).trim();
  if (!limpio) return dzSetStatus("El control necesita un nombre");
  const id = limpio.toLowerCase().replace(/\s+/g, "_").replace(/[^\w-]/g, "");
  if (!id) return dzSetStatus("Ese nombre no deja un identificador utilizable");
  if (!DZ.doc.createRigControl(id, { name: limpio, min: 0, max: 1, default: 0 }))
    return dzSetStatus("Ya existe un control con ese nombre");
  dzDialPanelSync(id);
  dzSetStatus("Control «" + limpio + "» creado · movelo y deja clave en el cuadro actual");
}
function dzDialQuitar() {
  const id = dzDialSeleccionado();
  if (!id || !DZ.doc || !DZ.doc.removeRigControl(id)) return dzSetStatus("Elegí un control");
  dzDialPanelSync();
  dzSetStatus("Control quitado · las acciones que conducía quedaron sin conductor");
}
function dzDialPanelSync(seleccionar) {
  const host = $("#rigDialLista"), estado = $("#rigDialEstado");
  if (!host) return;
  const controles = (DZ.doc && DZ.doc.scene.rig.controls) || {};
  const ids = Object.keys(controles);
  const previo = seleccionar || dzDialSeleccionado();
  const num = dzRigCur();
  host.innerHTML = "";
  for (const id of ids) {
    const c = controles[id];
    const fila = document.createElement("div");
    fila.className = "rig2-dial" + (id === previo ? " sel" : "");
    fila.dataset.id = id;
    const valor = DZ.doc.scene.rigControlValue(id, num);
    fila.innerHTML = `<span class="rig2-dial-nombre"></span>
      <input type="range" min="${c.min}" max="${c.max}" step="0.01" value="${valor}">
      <output>${Math.round(valor * 100) / 100}</output>`;
    fila.querySelector(".rig2-dial-nombre").textContent = c.name || id;
    const rango = fila.querySelector("input");
    // arrastrar previsualiza; al soltar queda UNA clave, no cien
    rango.oninput = () => {
      fila.querySelector("output").textContent = Math.round(+rango.value * 100) / 100;
      const canal = DZ.doc.scene.rigChannel(LOW.animation.rigControlPath(id));
      if (canal) canal.keys[Math.max(1, Math.round(num))] = +rango.value;
      dzRigApplyLive(num);
    };
    rango.onchange = () => {
      DZ.doc.setRigControlValue(id, num, +rango.value);
      dzRigApplyLive(num); dzRigOverlayRender();
      dzSetStatus("Clave del control «" + (c.name || id) + "» en el cuadro " + num);
    };
    fila.onpointerdown = (e) => {
      if (e.target.tagName === "INPUT") return;
      host.querySelectorAll(".rig2-dial").forEach((n) => n.classList.remove("sel"));
      fila.classList.add("sel");
    };
    host.appendChild(fila);
  }
  if (estado) estado.textContent = !ids.length ? "sin controles"
    : `${ids.length} ${ids.length === 1 ? "control" : "controles"}`;
  const quitar = $("#rigDialRemove");
  if (quitar) quitar.disabled = !dzDialSeleccionado();
  const nuevo = $("#rigDialNew");
  if (nuevo) nuevo.disabled = !DZ.doc;
}

/* ══ SMART BONES: acciones conducidas por ángulo (§4.3, nivel avanzado) ══════
   El artista dobla el codo, acomoda el brazo UNA vez y lo graba. A partir de
   ahí la corrección se aplica sola, dosificada por el ángulo real del codo, en
   toda la animación. Sin esto hay que arreglar lo mismo cuadro por cuadro.
   ═══════════════════════════════════════════════════════════════════════ */
/* ══ MALLA Y PESOS: los niveles 2 y 3 de la tabla de deformación (§4.3) ══════
   Rígido ya estaba: una pieza sigue a un hueso entera. Estos dos niveles son
   los que permiten que una pieza se DOBLE:

     flexi-binding  cada vértice sigue a los huesos que tiene cerca (por
                    distancia al segmento del hueso, no a su origen)
     pesos          esa influencia se corrige a mano, vértice por vértice

   El overlay es propio y no toca el del esqueleto: aquel es un renderer
   cacheado del que dependen varios recorridos, y meterle un modo más era
   arriesgar el armado del rig para agregar una herramienta de pintura.
   ═══════════════════════════════════════════════════════════════════════ */
function dzRigOverlayRender() {
  const overlay = $("#dzRigOverlay"), doc = DZ.doc;
  const empty = !overlay || !DZ.rigMode || !doc ||
      (!Object.keys(doc.scene.rig.nodes).length && !DZ.rigBoneTool);
  if (empty) {
    if (overlay) {
      overlay.setAttribute("hidden", ""); overlay.innerHTML = "";
      overlay.classList.remove("bone-create", "rig-pass-through"); overlay.onpointerdown = null;
      overlay.__rigCache = null;
    } return;
  }
  const selectedId = DZ.rigSelectedId || DZ.sel?.id;
  const num = dzRigCur();
  // signature estructural: si cambia (nodos/selección/modo/herramienta) se
  // reconstruye; si no (p. ej. solo se mueve la pose), se actualizan posiciones
  // sin destruir el DOM → sin flicker y sin perder el gesto en curso.
  const sig = JSON.stringify({
    n: Object.values(doc.scene.rig.nodes).map(n=>[n.id,n.role,n.control?.shape]).sort(), s: selectedId,
    m: DZ.rigSubmode || "build", t: DZ.rigTool || "select",
    c: Object.keys(doc.scene.rig.constraints || {}).sort()
  });
  const rebuild = overlay.__rigCache?.sig !== sig;
  overlay.removeAttribute("hidden");
  overlay.dataset.mode = DZ.rigSubmode || "build";
  overlay.dataset.tool = DZ.rigTool || "select";
  overlay.classList.toggle("bone-create", !!DZ.rigBoneTool && DZ.rigSubmode === "build");
  // Pivote necesita recibir el evento sobre las articulaciones visibles. La
  // versión anterior lo ponía en pass-through y anulaba toda la herramienta.
  overlay.classList.toggle("rig-pass-through", ["draw", "cut"].includes(DZ.rigTool));
  overlay.onpointerdown = e => {
    if (!DZ.rigBoneTool) return;
    // Los joints/tips manejan su propio pointerdown (encadenar/editar) y hacen
    // stopPropagation. Si llega hasta acá es área libre: crear un hueso nuevo.
    // (la línea decorativa .dz-rig-bone ya no intercepta: pointer-events:none)
    if (e.target === overlay || e.target.classList?.contains("dz-rig-bone") ||
        e.target.classList?.contains("dz-rig-label")) dzRigBoneCreateDrag(e);
  };
  const cv = $("#dzCanvas").getBoundingClientRect();
  overlay.setAttribute("viewBox", `0 0 ${Math.max(1, cv.width)} ${Math.max(1, cv.height)}`);
  // Escala real de una unidad del documento en pantalla. La geometría visible
  // del rig la sigue; los hits invisibles quedan en píxeles y siguen cómodos.
  const unit0 = dzFromUser(0, 0), unit1 = dzFromUser(1, 0);
  const rigViewScale = unit0 && unit1 ? Math.hypot(unit1.x - unit0.x, unit1.y - unit0.y) : (DZ.zoom || 1);
  const live = DZ.rigLivePose || DZ.rigIKPreview?.poses || {};
  const point = id => {
    const node = doc.scene.rigNode(id); if (!node?.pivot) return null;
    const geometry = DZ.rigBoneGeometryPreview?.[id] ||
      (DZ.rigBoneGeometryPreview?.id === id ? DZ.rigBoneGeometryPreview : null);
    const localPivot = geometry?.head || (DZ.rigBuildPreview?.nodeId === id ? DZ.rigBuildPreview.pivot : node.pivot);
    const p = doc.scene.rigWorldPoint(id, num, localPivot, live), s = dzFromUser(p.x, p.y);
    return s && { x: s.x - cv.left, y: s.y - cv.top };
  };
  const tailPoint = node => {
    const geometry = DZ.rigBoneGeometryPreview?.[node.id] ||
      (DZ.rigBoneGeometryPreview?.id === node.id ? DZ.rigBoneGeometryPreview : null);
    const localTail = geometry?.tail || node.tail; if (!localTail) return null;
    const p = doc.scene.rigWorldPoint(node.id, num, localTail, live), s = dzFromUser(p.x, p.y);
    return s && { x: s.x - cv.left, y: s.y - cv.top, user: p };
  };
  const ns = "http://www.w3.org/2000/svg";
  if (rebuild) { overlay.innerHTML = ""; overlay.__rigCache = { sig, els: new Map() }; }
  const els = overlay.__rigCache.els, used = new Set();
  const get = (key, tag, attrs, cls) => {
    used.add(key);
    let el = els.get(key);
    if (!el) { el = document.createElementNS(ns, tag); els.set(key, el); overlay.appendChild(el); }
    if (cls !== undefined) el.setAttribute("class", cls);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };
  const posable = DZ.rigTool === "pose";   // FK/IK: sin «Posar», el clic solo selecciona
  // para descongestionar la mesa: quién es familia directa del seleccionado
  const selNode = selectedId ? doc.scene.rigNode(selectedId) : null;
  const muchos = Object.keys(doc.scene.rig.nodes).length > 8;
  for (const node of Object.values(doc.scene.rig.nodes)) {
    const isControl = node.role === "control";
    let a = point(node.id), b = tailPoint(node);
    if (!b && node.parentId) { a = point(node.parentId); b = point(node.id); }
    if (!a || !b) continue;
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy)),nx=-dy/len,ny=dx/len;
    const metrics = LOW.rigging.input.visualMetrics(rigViewScale, isControl);
    const headW=metrics.headWidth,tipW=metrics.tipWidth;
    const bonePath=`M${a.x+nx*headW} ${a.y+ny*headW} L${b.x+nx*tipW} ${b.y+ny*tipW} `+
      `L${b.x-nx*tipW} ${b.y-ny*tipW} L${a.x-nx*headW} ${a.y-ny*headW} Z`;
    get("bs:" + node.id, "path", { d:bonePath,"data-id":node.id },
      "dz-rig-bone-shape" + (isControl ? " controller" : "") + (selectedId === node.id ? " active" : ""));
    const hit = get("bh:" + node.id, "line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, "data-id": node.id }, "dz-rig-bone-hit");
    const esHueso = !!node.tail;
    hit.onpointerdown = e => {
      const action = LOW.rigging.input.pointerAction({ phase:DZ.rigSubmode, tool:DZ.rigTool,
        target:"body", isBone:esHueso, parentId:node.parentId, pinned:node.pinned, role:node.role });
      if (action === "create") return dzRigBoneCreateDrag(e);
      if (action === "edit-body") return dzRigBoneGeometryDrag(e, node, "body");
      if (action === "rotate") return dzRigBoneFKDrag(e, node, "rotate");
      e.preventDefault(); e.stopPropagation(); dzRigSelectNode(node.id);
    };
  }
  for (const node of Object.values(doc.scene.rig.nodes)) {
    const isControl = node.role === "control";
    const p = point(node.id); if (!p) continue;
    const jointHandler = e => {
      const action = LOW.rigging.input.pointerAction({ phase:DZ.rigSubmode, tool:DZ.rigTool,
        target:"joint", isBone:!!node.tail, parentId:node.parentId, pinned:node.pinned,
        role:node.role, altKey:e.altKey });
      if (action === "create") return dzRigBoneCreateDrag(e);
      if (action === "pivot") return dzRigBuildPivotDrag(e, node);
      if (action === "edit-head") return dzRigBoneGeometryDrag(e, node, "head");
      if (action === "translate") return dzRigBoneFKDrag(e, node, "translate");
      if (action === "locked-child") {
        e.preventDefault(); e.stopPropagation(); dzRigSelectNode(node.id);
        return dzSetStatus("Articulación bloqueada a su padre · arrastrá el hueso o su punta para rotarlo");
      }
      e.preventDefault(); e.stopPropagation(); dzRigSelectNode(node.id);
    };
    // Con muchas piezas registradas la mesa se llena de puntos y no se ve el
    // dibujo. Los que no son el seleccionado ni su familia directa se atenúan:
    // siguen ahí y se siguen pudiendo agarrar (el área invisible no cambia),
    // pero dejan ver el personaje.
    const cerca = !selNode || node.id === selectedId || node.parentId === selectedId
      || selNode.parentId === node.id
      || (node.parentId && node.parentId === selNode.parentId);
    const tenue = muchos && !cerca && !node.pinned;
    const metrics = LOW.rigging.input.visualMetrics(rigViewScale, isControl);
    const joint = get("jt:" + node.id, "circle",
      { cx: p.x, cy: p.y, r: node.pinned ? metrics.rootRadius : (tenue ? Math.max(1, metrics.jointRadius * .6) : metrics.jointRadius), "data-id": node.id },
      "dz-rig-joint" + (node.pinned ? " root" : "") + (selectedId === node.id ? " selected" : "")
        + (isControl ? " controller" : "") + (tenue && !isControl ? " dim" : ""));
    joint.onpointerdown = jointHandler;
    if (isControl) {
      const shape=node.control?.shape||"ring";
      let control;
      const cr=metrics.controlRadius;
      if(shape==="pin") control=get("ct:"+node.id,"path",{d:`M${p.x} ${p.y-cr}L${p.x+cr} ${p.y}L${p.x} ${p.y+cr}L${p.x-cr} ${p.y}Z`,"data-id":node.id},"dz-rig-controller pin"+(selectedId===node.id?" selected":""));
      else if(shape==="slider") control=get("ct:"+node.id,"rect",{x:p.x-cr*1.18,y:p.y-cr*.64,width:cr*2.36,height:cr*1.28,rx:cr*.64,"data-id":node.id},"dz-rig-controller slider"+(selectedId===node.id?" selected":""));
      else control=get("ct:"+node.id,"circle",{cx:p.x,cy:p.y,r:cr,"data-id":node.id},"dz-rig-controller ring"+(selectedId===node.id?" selected":""));
      control.onpointerdown=jointHandler;
    }
    // área de agarre invisible más grande: los huesos de 5px eran difíciles de
    // atrapar con el lápiz; esto mantiene el aspecto denso pero facilita el gesto.
    const jointHit = get("jh:" + node.id, "circle", { cx: p.x, cy: p.y, r: 12, "data-id": node.id }, "dz-rig-hit");
    jointHit.onpointerdown = jointHandler;
    const tp = tailPoint(node);
    if (tp) {
      const tipHandler = e => {
        const action = LOW.rigging.input.pointerAction({ phase:DZ.rigSubmode, tool:DZ.rigTool,
          target:"tip", isBone:true, parentId:node.parentId, pinned:node.pinned,
          role:node.role, boneTool:DZ.rigBoneTool });
        if (action === "create-from-tip") return dzRigBoneCreateDrag(e, { head: tp.user, parentId: node.id });
        if (action === "rotate") return dzRigBoneFKDrag(e, node, "rotate");
        if (action === "edit-tail") return dzRigBoneGeometryDrag(e, node, "tail");
        // cualquier otro modo/herramienta: la punta al menos selecciona el hueso
        e.preventDefault(); e.stopPropagation(); dzRigSelectNode(node.id);
      };
      const tip = get("tp:" + node.id, "circle", { cx: tp.x, cy: tp.y, r: metrics.tipRadius, "data-id": node.id }, "dz-rig-bone-tip"+(isControl?" controller":""));
      tip.onpointerdown = tipHandler;
      const tipHit = get("th:" + node.id, "circle", { cx: tp.x, cy: tp.y, r: 11, "data-id": node.id }, "dz-rig-hit");
      tipHit.onpointerdown = tipHandler;
    }
    // MANIJA DE ROTACIÓN de una pieza: sale del pivote hacia el propio dibujo,
    // así se agarra la pieza y gira hacia donde uno la lleva. Sin esto, una
    // pieza sin padre no se podía rotar en la mesa y una con padre giraba al
    // revés, porque el único asidero era la línea que va hacia el padre.
    if (!node.tail && DZ.rigSubmode === "fk") {
      const arte = dzRigNodeElement(node);
      let dir = null;
      if (arte) {
        try {
          const caja = arte.getBoundingClientRect();
          const centro = { x: caja.left + caja.width / 2 - cv.left, y: caja.top + caja.height / 2 - cv.top };
          const v = { x: centro.x - p.x, y: centro.y - p.y };
          const largo = Math.hypot(v.x, v.y);
          // pivote en el centro del dibujo: la manija sale hacia el lado más largo
          dir = largo > 6 ? { x: v.x / largo, y: v.y / largo } : { x: 1, y: 0 };
        } catch (_) { dir = { x: 1, y: 0 }; }
      }
      if (dir) {
        const L = 46;
        const hx = p.x + dir.x * L, hy = p.y + dir.y * L;
        get("ra:" + node.id, "line", { x1: p.x, y1: p.y, x2: hx, y2: hy }, "dz-rig-rot-arm");
        const mango = get("rm:" + node.id, "circle", { cx: hx, cy: hy, r: 6, "data-id": node.id },
          "dz-rig-rot-handle" + (selectedId === node.id ? " selected" : ""));
        const mangoHit = get("rz:" + node.id, "circle", { cx: hx, cy: hy, r: 13, "data-id": node.id }, "dz-rig-hit");
        const rotar = e => {
          if (!posable) { e.preventDefault(); e.stopPropagation(); return dzRigSelectNode(node.id); }
          return dzRigBoneFKDrag(e, node, "rotate");
        };
        mango.onpointerdown = rotar;
        mangoHit.onpointerdown = rotar;
      }
    }
    // CURVA DEL DEFORMADOR: los puntos con los que se dobla la pieza. Viven en
    // el espacio del dibujo, asi que hay que pasarlos por la matriz del hueso
    // para dibujarlos donde el ojo los espera.
    const curva = DZ.rigDeformerPreview?.boneId === node.id && DZ.rigDeformerPreview?.frame === num
      ? DZ.rigDeformerPreview.points
      : (doc.scene.rigDeformerAt ? doc.scene.rigDeformerAt(node.id, num) : null);
    if (curva && curva.length > 1) {
      const enPantalla = curva.map(q => {
        const w = doc.scene.rigWorldPoint(node.id, num, q, live), s = dzFromUser(w.x, w.y);
        return s && { x: s.x - cv.left, y: s.y - cv.top };
      });
      if (enPantalla.every(Boolean)) {
        get("dc:" + node.id, "polyline",
          { points: enPantalla.map(q => q.x + "," + q.y).join(" ") }, "dz-rig-def-curva");
        enPantalla.forEach((q, i) => {
          const extremo = i === 0 || i === enPantalla.length - 1;
          get("dp:" + node.id + ":" + i, "circle", { cx: q.x, cy: q.y, r: extremo ? 4.5 : 5.5,
            "data-id": node.id }, "dz-rig-def-punto" + (extremo ? " extremo" : ""));
          const hit = get("dh:" + node.id + ":" + i, "circle",
            { cx: q.x, cy: q.y, r: 12, "data-id": node.id, "data-def": i }, "dz-rig-hit dz-rig-def-hit");
          hit.onpointerdown = e => dzRigDeformadorDrag(e, node, i);
        });
      }
    }
    if (selectedId === node.id || isControl) {
      const label = get("lb:" + node.id, "text", { x: p.x + 9, y: p.y - 8 }, "dz-rig-label");
      label.textContent = node.control?.label || node.name || node.id;
    }
  }
  if (DZ.rigBonePreview) {
    const hs = dzFromUser(DZ.rigBonePreview.head.x, DZ.rigBonePreview.head.y);
    const ts = dzFromUser(DZ.rigBonePreview.tail.x, DZ.rigBonePreview.tail.y);
    if (hs && ts) get("pb", "line", { x1: hs.x - cv.left, y1: hs.y - cv.top,
      x2: ts.x - cv.left, y2: ts.y - cv.top }, "dz-rig-bone-preview");
  }
  const selected = selectedId && doc.scene.rigNode(selectedId), selectedPoint = selected && point(selected.id);
  if (DZ.rigSubmode === "build" && selectedPoint) {
    const hx = selectedPoint.x + 28, hy = selectedPoint.y - 28;
    get("la", "line", { x1: selectedPoint.x, y1: selectedPoint.y, x2: hx, y2: hy }, "dz-rig-link-arm");
    const handle = get("lh", "rect", { x: hx - 5, y: hy - 5, width: 10, height: 10, rx: 1,
      "data-id": selected.id }, "dz-rig-link-handle");
    handle.onpointerdown = e => dzRigBuildLinkDrag(e, selected);
    if (DZ.rigLinkPreview?.childId === selected.id) {
      const p = DZ.rigLinkPreview.pointer;
      get("lp", "line", { x1: selectedPoint.x, y1: selectedPoint.y, x2: p.x - cv.left, y2: p.y - cv.top }, "dz-rig-link-preview");
    }
  }
  // ARCO: por donde pasa la pieza a lo largo del tramo. Un movimiento biologico
  // no viaja en linea recta, y sin ver la trayectoria no hay forma de saber si
  // la que hiciste es un arco o una escalera de tramos rectos.
  if (DZ.rigArco && selected) dzRigArcoDibujar(get, selected, cv, num);
  for (const c of Object.values(doc.scene.rig.constraints || {})) {
    const raw = DZ.rigIKPreview?.constraintId === c.id ? DZ.rigIKPreview.target : doc.scene.rigTargetAt(c.id, num); if (!raw) continue;
    const s = dzFromUser(raw.x, raw.y); if (!s) continue; const x = s.x - cv.left, y = s.y - cv.top;
    const target = get("ik:" + c.id, "path", { d: `M${x} ${y - 8}L${x + 8} ${y}L${x} ${y + 8}L${x - 8} ${y}Z`, "data-constraint": c.id },
      "dz-rig-target" + (DZ.rigConstraintId === c.id ? " active" : "")
        + (doc.scene.rigPinnedAt(c.id, num) ? " clavado" : ""));
    target.onpointerdown = e => { DZ.rigConstraintId = c.id; dzRigIKDrag(e, c.id); };
  }
  // POLE: adónde mira el codo o la rodilla. Se dibuja SOLO para la cadena
  // activa —una mesa con un pole por miembro es ilegible— y la línea punteada
  // hace visible a qué articulación manda.
  const cadenaActiva = DZ.rigConstraintId && doc.scene.rigConstraint(DZ.rigConstraintId);
  if (cadenaActiva && cadenaActiva.type === "ik2") {
    const preview = DZ.rigPolePreview?.constraintId === cadenaActiva.id ? DZ.rigPolePreview.pole : null;
    const pole = preview || dzRigPolePoint(cadenaActiva, num);
    const s = pole && dzFromUser(pole.x, pole.y), joint = point(cadenaActiva.midId);
    if (s && joint) {
      const x = s.x - cv.left, y = s.y - cv.top;
      get("pole-line:" + cadenaActiva.id, "line", { x1: joint.x, y1: joint.y, x2: x, y2: y }, "dz-rig-pole-line");
      // El pole SUGERIDO se distingue del guardado: uno es una oferta, el otro
      // una decisión del animador que ya vive en el archivo.
      const guardado = !!preview || !!doc.scene.rigPoleAt(cadenaActiva.id, num);
      const handle = get("pole:" + cadenaActiva.id, "circle",
        { cx: x, cy: y, r: 7, "data-constraint": cadenaActiva.id },
        "dz-rig-pole" + (guardado ? "" : " sugerido"));
      handle.onpointerdown = e => dzRigPoleDrag(e, cadenaActiva.id);
    }
  }
  for (const [key, el] of els) if (!used.has(key)) { el.remove(); els.delete(key); }
}
function dzRigReadinessStatus() {
  const artIds = dzRigDrawableElements().map(el => el.id).filter(Boolean);
  const report = LOW.animation.rigReadiness(DZ.doc?.scene?.rig || {}, artIds);
  const access = LOW.animation.rigModeAccess(report);
  const box = $("#rigReadiness");
  const testButton = $("#rigModeTest"), animateButton = $("#rigModeAnim");
  // Probar/Animar dependen de la jerarquía ósea, no de que ya exista arte.
  // Errores de slots o vínculos se informan, pero no secuestran el esqueleto.
  if (testButton) testButton.disabled = !access.test;
  if (animateButton) animateButton.disabled = !access.animate;
  if (!box) return report;
  const presentation = LOW.animation.rigWorkflowStatus(report, artIds.length);
  box.dataset.state = presentation.state;
  box.querySelector("b").textContent = presentation.title;
  box.querySelector("span").textContent = presentation.detail;
  return { ...report, readyToTest: access.test, readyToAnimate: access.animate,
    structuralErrors: access.structuralErrors };
}

/* Schematic básico: grafo de nodos del esqueleto (padre→hijo), coloreado por rol.
   El layout lo decide LOW.rigging.schematicLayout (puro, testeado); acá sólo se pinta. */
function dzRigSchematicRender(nodes, current) {
  const host = $("#rigSchematic"); if (!host) return;
  nodes = nodes || (DZ.doc ? Object.values(DZ.doc.scene.rig.nodes) : []);
  if (!nodes.length || !LOW.rigging || !LOW.rigging.schematicLayout) { host.innerHTML = ""; host.hidden = true; return; }
  host.hidden = false;
  if (current === undefined) current = dzRigSelectedNode();
  const L = LOW.rigging.schematicLayout(nodes.map(n => ({ id: n.id, name: n.name || n.id, parentId: n.parentId, role: n.role })));
  const byId = Object.fromEntries(L.nodes.map(n => [n.id, n]));
  const esc = s => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const parts = [];
  L.edges.forEach(e => {
    const a = byId[e.from], b = byId[e.to]; if (!a || !b) return;
    const my = (a.y + b.y) / 2;
    parts.push(`<path class="rig-sch-edge" d="M${a.x} ${a.y} C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}"/>`);
  });
  L.nodes.forEach(n => {
    const on = current && current.id === n.id;
    const full = n.name || n.id, label = full.length > 13 ? full.slice(0, 12) + "…" : full;
    parts.push(
      `<g class="rig-sch-node role-${n.role}${on ? " on" : ""}" data-id="${esc(n.id)}" transform="translate(${n.x} ${n.y})" tabindex="0" role="listitem" aria-label="${esc(full)}">` +
      `<circle r="11"/><text class="rig-sch-label" y="27" text-anchor="middle">${esc(label)}</text><title>${esc(full)}</title></g>`
    );
  });
  host.innerHTML = `<svg class="rig-sch-svg" viewBox="0 0 ${L.width} ${L.height}" preserveAspectRatio="xMidYMin meet" role="list" aria-label="Esquema del esqueleto">${parts.join("")}</svg>`;
  // Interacción: click = seleccionar · arrastrar un nodo sobre otro = reparentar (jerarquía).
  // El reparentado usa el comando real DZ.doc.setRigParent (guarda de ciclos incluida);
  // canReparent sólo decide el resaltado del destino válido antes de soltar.
  let drag = null;
  const clearHints = () => host.querySelectorAll(".drop-ok,.drag-src").forEach(n => n.classList.remove("drop-ok", "drag-src"));
  const nodeIdAt = (cx, cy) => { const el = document.elementFromPoint(cx, cy); const g = el && el.closest && el.closest(".rig-sch-node"); return g ? g.getAttribute("data-id") : null; };
  host.querySelectorAll(".rig-sch-node").forEach(g => {
    const id = g.getAttribute("data-id");
    g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); dzRigSelectNode(id); } });
    g.addEventListener("pointerdown", e => {
      if (e.button != null && e.button !== 0) return;
      drag = { id, x0: e.clientX, y0: e.clientY, moved: false };
      g.classList.add("drag-src"); try { g.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    g.addEventListener("pointermove", e => {
      if (!drag || drag.id !== id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 5) return;
      drag.moved = true; host.classList.add("reparenting");
      host.querySelectorAll(".rig-sch-node.drop-ok").forEach(n => n.classList.remove("drop-ok"));
      const over = nodeIdAt(e.clientX, e.clientY);
      if (over && over !== drag.id && LOW.rigging.canReparent(nodes, drag.id, over)) {
        const t = [...host.querySelectorAll(".rig-sch-node")].find(n => n.getAttribute("data-id") === over);
        if (t) t.classList.add("drop-ok");
      }
    });
    g.addEventListener("pointerup", e => {
      if (!drag || drag.id !== id) return;
      const wasDrag = drag.moved, dragId = drag.id;
      try { g.releasePointerCapture(e.pointerId); } catch (_) {}
      host.classList.remove("reparenting"); clearHints(); drag = null;
      if (!wasDrag) { dzRigSelectNode(dragId); return; }
      if (!DZ.doc) return;
      const over = nodeIdAt(e.clientX, e.clientY);
      if (over && LOW.rigging.canReparent(nodes, dragId, over)) { DZ.doc.setRigParent(dragId, over); dzRigSelectNode(dragId); }
      else if (!over && LOW.rigging.canReparent(nodes, dragId, null)) { DZ.doc.setRigParent(dragId, null); dzRigSelectNode(dragId); }
    });
    g.addEventListener("pointercancel", () => { host.classList.remove("reparenting"); clearHints(); drag = null; });
  });
}

function dzRigPanelSync() {
  if ($("#dzRigPanel").hidden) return;
  dzMeshPanelSync();          // malla y pesos siguen a la pieza seleccionada
  dzSmartPanelSync();         // y las acciones, al hueso conductor
  dzDialPanelSync();          // y los diales, al cuadro actual
  dzLipPanelSync();           // y el lipsync, a las bocas de la pieza
  const el = DZ.sel, num = dzRigCur(), nodes = DZ.doc ? Object.values(DZ.doc.scene.rig.nodes) : [], current = dzRigSelectedNode();
  $("#rigId").value = current?.id || (el && el.id) || ""; $("#rigCount").textContent = nodes.length; $("#rigFrame").textContent = "F" + num;
  const detected = dzRigDrawableElements().length;
  if ($("#rigObjectCount")) $("#rigObjectCount").textContent = detected + (detected === 1 ? " detectado" : " detectados");
  dzRigReadinessStatus();
  const k = (current && dzRigLocalAt(current.id, num)) || { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
  $("#rigX").value = Math.round(k.x); $("#rigY").value = Math.round(k.y); $("#rigR").value = Math.round(k.r * 10) / 10;
  $("#rigSX").value = Math.round((k.sx == null ? (k.s == null ? 1 : k.s) : k.sx) * 100) / 100;
  $("#rigSY").value = Math.round((k.sy == null ? (k.s == null ? 1 : k.s) : k.sy) * 100) / 100;
  $("#rigMin").value = current?.limits?.min ?? -180; $("#rigMax").value = current?.limits?.max ?? 180;
  const etiquetaTope = document.querySelector(".rig2-limits > span");
  if (etiquetaTope) etiquetaTope.textContent =
    LOW.animation.rigSinTope(current?.limits) ? "Tope de giro · sin tope" : "Tope de giro";
  dzRigCurvaRender();
  dzRigVarsRender();
  dzRigDoblarSync();
  const quePieza = $("#rigPrincipiosQue");
  if (quePieza) { const n = dzRigPiezaDestino(); quePieza.textContent = n ? n.id : "—"; }
  $("#rigPin").classList.toggle("on", !!current?.pinned); $("#rigPin").textContent = current?.pinned ? "Raíz fijada" : "Fijar raíz";
  const parent = $("#rigParent"); parent.innerHTML = '<option value="">— sin padre —</option>';
  nodes.filter(n => !current || n.id !== current.id).forEach(n => { const o = document.createElement("option"); o.value = n.id; o.textContent = n.id; o.selected = !!current && current.parentId === n.id; parent.appendChild(o); });
  parent.disabled = !current;
  const tree = $("#rigTree"); tree.innerHTML = "";
  const drawBranch = (node, depth) => {
    const row = document.createElement("div"); row.className = "rig2-node" + (!node.parentId ? " root" : "") + (current?.id === node.id ? " on" : "");
    row.style.paddingLeft = (6 + depth * 14) + "px"; row.innerHTML = `<i></i><span></span><small>${node.pinned ? "fija" : ""}</small>`;
    row.querySelector("span").textContent = node.id; row.onclick = () => dzRigSelectNode(node.id);
    tree.appendChild(row); nodes.filter(n => n.parentId === node.id).forEach(child => drawBranch(child, depth + 1));
  };
  nodes.filter(n => !n.parentId || !DZ.doc.scene.rigNode(n.parentId)).forEach(n => drawBranch(n, 0));
  dzRigSchematicRender(nodes, current);
  const chips = $("#rigChips"); chips.innerHTML = ""; const trk = (current && dzRigTracks()[current.id]) || {};
  Object.keys(trk).map(Number).sort((a, b) => a - b).forEach(n => {
    const c = document.createElement("span"); c.className = "dz-chip" + (n === num ? " on" : ""); c.textContent = " " + n;
    c.title = "Ir a F" + n + " · Alt+clic: borrar"; c.onclick = e => { if (e.altKey) dzRigDelKey(current.id, n); else if (DZ.doc) DZ.doc.goTo(n); };
    chips.appendChild(c);
  });
  ["rigIkRoot", "rigIkMid", "rigIkEnd"].forEach(id => {
    const select = $("#" + id), old = select.value; select.innerHTML = '<option value="">— elegir —</option>';
    nodes.forEach(n => { const o = document.createElement("option"); o.value = n.id; o.textContent = n.id; select.appendChild(o); });
    if ([...select.options].some(o => o.value === old)) select.value = old;
  });
  if (current) {
    $("#rigIkEnd").value = current.id; const mid = current.parentId && DZ.doc.scene.rigNode(current.parentId), root = mid?.parentId && DZ.doc.scene.rigNode(mid.parentId);
    if (mid) $("#rigIkMid").value = mid.id; if (root) $("#rigIkRoot").value = root.id;
  }
  const constraints = Object.values(DZ.doc?.scene.rig.constraints || {}), cs = $("#rigConstraint"); cs.innerHTML = '<option value="">— ninguna —</option>';
  constraints.forEach(c => { const o = document.createElement("option"); o.value = c.id; o.textContent = `${c.rootId} → ${c.effectorId}`; cs.appendChild(o); });
  if (!DZ.rigConstraintId && constraints[0]) DZ.rigConstraintId = constraints[0].id;
  if (constraints.some(c => c.id === DZ.rigConstraintId)) cs.value = DZ.rigConstraintId; else DZ.rigConstraintId = null;
  const active = DZ.rigConstraintId && DZ.doc.scene.rigConstraint(DZ.rigConstraintId), target = active && DZ.doc.scene.rigTargetAt(active.id, num);
  const clavada = active && DZ.doc.scene.rigPinnedAt(active.id, num);
  $("#rigIkStatus").textContent = active ? (clavada ? "activa · apoyo clavado" : "activa") : "sin cadena";
  $("#rigTarget").textContent = target ? `${Math.round(target.x)}, ${Math.round(target.y)}` : "—";
  // El botón dice lo que va a HACER, no el estado: así no hay que adivinar.
  const pin = $("#rigIkPin");
  if (pin) { pin.textContent = clavada ? "Soltar apoyo" : "Clavar apoyo"; pin.classList.toggle("on", !!clavada); pin.disabled = !active; }
}
function dzRigReadPanel() {
  const lectura = { x: +$("#rigX").value || 0, y: +$("#rigY").value || 0, r: +$("#rigR").value || 0,
    sx: +$("#rigSX").value || 1, sy: +$("#rigSY").value || 1 };
  // ESTIRAR Y ENCOGER CON VOLUMEN: el eje que no tocaste compensa al que si,
  // para que la pieza se deforme en vez de inflarse.
  if (DZ.rigVolumen) {
    const node = dzRigSelectedNode();
    const previo = node ? (dzRigLocalAt(node.id, dzRigCur()) || { sx: 1, sy: 1 }) : { sx: 1, sy: 1 };
    const cambioX = Math.abs(lectura.sx - (previo.sx == null ? 1 : previo.sx)) > 1e-6;
    const cambioY = Math.abs(lectura.sy - (previo.sy == null ? 1 : previo.sy)) > 1e-6;
    if (cambioX && !cambioY && Math.abs(lectura.sx) > 1e-6) lectura.sy = 1 / lectura.sx;
    else if (cambioY && !cambioX && Math.abs(lectura.sy) > 1e-6) lectura.sx = 1 / lectura.sy;
  }
  return lectura;
}
function dzRigToggle() {
  if (!DZ.anim && !DZ.doc) { sysMsg("Abrí una animación antes de armar el esqueleto."); return; }
  if (!DZ.rigMode) DZ.rigPreviousCanvasTool = /^rig/.test(DZ.tool || "") ? "select" : (DZ.tool || "select");
  DZ.rigMode = !DZ.rigMode; $("#dzRigBtn").classList.toggle("active", DZ.rigMode); $("#tlRigOpen")?.classList.toggle("active", DZ.rigMode); $("#dzRigPanel").hidden = !DZ.rigMode;
  $("#dzRigOverlay").toggleAttribute("hidden", !DZ.rigMode);
  if (DZ.rigMode) {
    const repaired=dzRigEnsureVisiblePivots();
    dzRigSetMode("build"); dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender();
    dzSetStatus(repaired ? `${repaired} pivote(s) recuperado(s) · Construir listo para armar la jerarquía` : "Esqueleto cut-out: Construir → elegí un punto y arrastrá el vínculo al padre");
  }
  else {
    DZModeMachine?.exitRig();
    DZ.rigBoneTool = false; DZ.rigLivePose = null; DZ.rigIKPreview = null;
    $("#rigBoneTool")?.classList.remove("on");
    const ovl = $("#dzRigOverlay");
    ovl.classList.remove("bone-create"); ovl.innerHTML = ""; ovl.__rigCache = null;
    dzSetTool(DZ.rigPreviousCanvasTool || "select");
  }
}
/* ══ TUTORIAL DEL RIG ═══════════════════════════════════════════════════════
   El sistema no se explica solo: piezas y huesos son la MISMA entidad, y la
   jerarquía se arma en la mesa y no en la línea de tiempo como en Harmony u
   OpenToonz. Esto vive dentro del programa (Ayuda → Cómo se riggea un
   personaje) porque un tutorial que hay que ir a buscar afuera no se lee. */
/** Arrastrar un punto de la curva doblа la pieza y deja la clave en el cuadro.
 *  El punto se guarda en el espacio del DIBUJO —no en el de la pantalla—, o el
 *  doblez saldria torcido en cuanto la pieza tuviera rotacion. */
function dzRigDeformadorDrag(e, node, indice) {
  if (!DZ.doc) return;
  e.preventDefault(); e.stopPropagation();
  dzRigSelectNode(node.id);
  const frame = dzRigCur(), pointerId = e.pointerId;
  const sc = DZ.doc.scene;
  const partida = sc.rigDeformerAt(node.id, frame);
  if (!partida) return;
  let ultimo = null, gestureToken = null;
  const mover = ev => {
    if (ev.pointerId !== pointerId) return;
    const enUsuario = dzToUser(ev.clientX, ev.clientY);
    const local = sc.rigLocalPoint(node.id, frame, enUsuario);
    ultimo = partida.map((q, i) => i === indice ? { x: local.x, y: local.y } : q);
    DZ.rigDeformerPreview = { boneId: node.id, frame, points: ultimo };
    dzRigApplyLive(frame); dzRigOverlayRender();
  };
  const cleanup = () => {
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    document.removeEventListener("pointercancel", cancelar);
  };
  const soltar = ev => {
    if (ev.pointerId !== pointerId) return;
    cleanup();
    if (!dzRigFinishGesture(gestureToken)) return;
    DZ.rigDeformerPreview = null;
    if (!ultimo) return;
    DZ.doc.setRigDeformerKey(node.id, frame, ultimo);
    dzRigApplyLive(frame); dzRigOverlayRender();
    dzRigPanelSync(); dzMarkDirty();
    dzSetStatus("\u00ab" + node.id + "\u00bb doblada en F" + frame +
      " \u00b7 punto " + (indice + 1) + " de " + partida.length);
  };
  const cancelar = () => {
    cleanup(); dzRigFinishGesture(gestureToken); DZ.rigDeformerPreview = null;
    dzRigApplyLive(frame); dzRigOverlayRender();
  };
  gestureToken = dzRigTrackGesture(cancelar);
  document.addEventListener("pointermove", mover);
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", cancelar);
}

/** La curva de reposo que le corresponde a una pieza: su eje largo, con tres
 *  puntos. Es la que hace que doblar "para arriba" doble como uno espera. */
function dzDeformadorCurvaDe(el) {
  let caja = null;
  try { caja = el.getBBox(); } catch (_) { return null; }
  if (!caja || (!caja.width && !caja.height)) return null;
  const cx = caja.x + caja.width / 2, cy = caja.y + caja.height / 2;
  return caja.width >= caja.height
    ? [{ x: caja.x, y: cy }, { x: cx, y: cy }, { x: caja.x + caja.width, y: cy }]
    : [{ x: cx, y: caja.y }, { x: cx, y: cy }, { x: cx, y: caja.y + caja.height }];
}

/** Le da a la pieza elegida una curva para doblarse. Convierte sus formas a
 *  trazos —un rect no se puede doblar— y deja eso guardado en el dibujo, no
 *  como un efecto pasajero: si no, al cambiar de cuadro volveria el rect. */
function dzRigDoblarCrear() {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return dzSetStatus("Eleg\u00ed primero la pieza que quer\u00e9s doblar");
  if (DZ.doc.scene.rigDeformer(node.id))
    return dzSetStatus("\u00ab" + node.id + "\u00bb ya tiene una curva \u00b7 arrastr\u00e1 sus puntos en la mesa");
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const el = svg && svg.querySelector("#" + CSS.escape(node.elementId || node.id));
  if (!el) return dzSetStatus("No encuentro el dibujo de \u00ab" + node.id + "\u00bb en la mesa");

  // 1 · a trazos, y que quede en el dibujo
  const formas = el.tagName.toLowerCase() === "g"
    ? [...el.querySelectorAll("rect,circle,ellipse,line,polyline,polygon")]
    : (el.tagName.toLowerCase() === "path" ? [] : [el]);
  let convertidas = 0;
  for (const forma of formas) if (dzFormaConvertir(forma)) convertidas++;
  if (convertidas) { dzDocCommit(); dzBuildLayers && dzBuildLayers(); }

  // 2 · la curva de reposo, por el eje largo de la pieza
  const objetivo = svg.querySelector("#" + CSS.escape(node.elementId || node.id));
  const reposo = dzDeformadorCurvaDe(objetivo);
  if (!reposo) return dzSetStatus("Esa pieza no tiene forma medible para doblar");
  if (!DZ.doc.createRigDeformer(node.id, reposo))
    return dzSetStatus("No se pudo crear la curva");

  DZ.rigDoblando = true;
  dzRigApplyLive(dzRigCur()); dzRigOverlayRender(); dzRigPanelSync(); dzMarkDirty();
  dzSetStatus("\u00ab" + node.id + "\u00bb ya se puede doblar" +
    (convertidas ? " (" + convertidas + " forma" + (convertidas > 1 ? "s" : "") + " pas\u00f3 a trazo)" : "") +
    " \u00b7 arrastr\u00e1 los puntos verdes de su curva");
}

/** El panel dice si la pieza es rigida, si tiene curva y si este cuadro la
 *  dobla: los tres estados que cambian lo que hacen los botones. */
function dzRigDoblarSync() {
  const eti = $("#rigDefEstado"), pista = $("#rigDefHint");
  if (!eti) return;
  const node = dzRigSelectedNode(), sc = DZ.doc && DZ.doc.scene;
  if (!node || !sc) { eti.textContent = "sin pieza";
    if (pista) pista.textContent = "Elegí una pieza para darle una curva.";
    return; }
  const d = sc.rigDeformer(node.id);
  if (!d) { eti.textContent = "rígida";
    if (pista) pista.textContent = "Una pieza rígida sólo rota. Con curva, se dobla: para el pelo, una cola o una manga.";
    return; }
  const f = dzRigCur(), claves = Object.keys(d.keys || {}).map(Number).sort((a, b) => a - b);
  eti.textContent = claves.length ? "curva · " + claves.length + (claves.length > 1 ? " claves" : " clave") : "curva";
  if (pista) pista.textContent = d.keys[f]
    ? "F" + f + " tiene su propio doblez · arrastrá los puntos verdes para cambiarlo."
    : "Arrastrá los puntos verdes en la mesa y el doblez queda clavado en F" + f + ".";
}

function dzRigDoblarQuitar() {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return;
  if (!DZ.doc.removeRigDeformer(node.id))
    return dzSetStatus("Esa pieza no tiene curva para sacar");
  // el dibujo vuelve a su forma: los trazos ya no se reescriben
  dzRigStrip($("#dzCanvas").querySelector(":scope > svg"));
  dzRigApplyLive(dzRigCur()); dzRigOverlayRender(); dzRigPanelSync(); dzMarkDirty();
  dzSetStatus("\u00ab" + node.id + "\u00bb vuelve a ser r\u00edgida \u00b7 el dibujo queda como estaba");
}

function dzRigDoblarLimpiar() {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return;
  const f = dzRigCur();
  if (!DZ.doc.deleteRigDeformerKey(node.id, f))
    return dzSetStatus("En F" + f + " no hay ning\u00fan doblez clavado");
  dzRigApplyLive(f); dzRigOverlayRender(); dzRigPanelSync(); dzMarkDirty();
  dzSetStatus("F" + f + " ya no dobla a \u00ab" + node.id + "\u00bb");
}

/* == EXPORTAR DESDE EL MODELO NUEVO =========================================
   El export recorria `DZ.anim.frames`, la lista de archivos del modelo viejo.
   En una escena de LowDoc esa lista esta vacia, asi que el dialogo de exportar
   ni siquiera abria. Aca se arma cada cuadro desde la escena. */

/** Proyecta las transformaciones canónicas de Composición sobre el SVG de un
 *  Level para un frame concreto. El export no depende del frame abierto ni de
 *  atributos DOM que hayan quedado de una visita anterior. */
function dzCompositionDrawingTexto(content, layerId, frame) {
  if (!content || !DZ.doc?.scene?.composition?.planes) return content || "";
  const box = document.createElement("div");
  box.innerHTML = `<svg xmlns="${SVGNS}">${content}</svg>`;
  const svg = box.querySelector("svg"), planes = DZ.doc.scene.composition.planes;
  dzCompositionElements(svg).forEach((el, index) => {
    const explicit = el.getAttribute("data-comp-plane") || el.id;
    const plane = Object.values(planes).find(candidate => candidate && (
      (explicit && candidate.id === explicit) ||
      (candidate.source?.layerId === layerId && candidate.source?.childIndex === index) ||
      (explicit && candidate.source?.elementId === explicit)));
    if (!plane) return;
    const value = DZ.doc.scene.compositionTransformAt(plane.id, frame) || plane.transform || {};
    const attrs = { "data-z": value.z || 0, "data-comp-x": value.x || 0,
      "data-comp-y": value.y || 0, "data-comp-rz": value.rotationZ || 0,
      "data-comp-sx": value.scaleX ?? 1, "data-comp-sy": value.scaleY ?? 1 };
    for (const [name, number] of Object.entries(attrs)) {
      const neutral = name === "data-comp-sx" || name === "data-comp-sy" ? 1 : 0;
      if (Math.abs(number - neutral) > 1e-6) el.setAttribute(name, number); else el.removeAttribute(name);
    }
  });
  return svg.innerHTML;
}

/** El SVG completo de un cuadro: todas las capas compuestas, con la resolucion
 *  de la escena y la hoja de la paleta —sin ella los colores por paleta salen
 *  en negro—. Devuelve "" si el cuadro esta vacio. */
function dzCuadroSvgTexto(frame) {
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc) return "";
  const partes = [];
  for (const ly of sc.layers) {
    if (ly.visible === false) continue;
    const dw = sc.drawingAt(ly.id, frame);
    if (dw && dw.content) partes.push(dzCompositionDrawingTexto(dw.content, ly.id, frame));
  }
  if (!partes.length) return "";
  const w = sc.width || 1920, h = sc.height || 1080;
  // la hoja de la paleta viaja adentro: el PNG se rasteriza aparte del documento
  const viva = $("#dzCanvas")?.querySelector(":scope > svg > style.dz-palcss");
  const estilos = viva ? viva.outerHTML : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
         `viewBox="0 0 ${w} ${h}">${estilos}${partes.join("")}</svg>`;
}

/** Los cuadros que entran en el export: el tramo activo de la escena. */
function dzExportCuadros() {
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc) return [];
  const r = sc.playRange();
  const salida = [];
  for (let f = r.in; f <= r.out; f++) salida.push(f);
  return salida;
}

/* ── XML para Premiere: la animación y su audio, en sincro, del otro lado ──
   GIF, PNG y spritesheet son para MIRAR. Cuando el trabajo sigue en montaje
   hace falta que la animación entre a la línea de tiempo del editor con su
   audio ya calzado, y eso es un XML de FCP7 (`xmeml`) — lo que Premiere,
   Resolve y Final Cut importan sin plugins.

   Se escribe TODO junto: cuadros, audio y XML en la misma carpeta. El audio
   sale como WAV desde el buffer decodificado porque el navegador nunca nos dio
   el archivo original; escribirlo al lado del XML es lo que evita que el
   montaje arranque pidiendo relinkear. */
async function dzExportPremiere(pngs, fps, cuadros) {
  if (!api || !api.export_premiere)
    return dzSetStatus("Esta versión de LOW no puede escribir el XML — reiniciá la app");
  const escena = DZ.doc.scene;
  const nombre = (escena.name || "secuencia").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "secuencia";   // MISMA regla que export_premiere en main.py (que hace strip("_")): si divergen, el XML nombra archivos que no existen
  const archivos = pngs.map((_, i) => `${nombre}_${String(i + 1).padStart(4, "0")}.png`);
  const pista = DZ.doc.audio;
  let audio = null, wav = null;
  if (pista && pista.buffer && LOW.animation.audioBufferAWav) {
    const crudo = LOW.animation.audioBufferAWav(pista.buffer);
    if (crudo) {
      wav = dzBytesABase64(crudo);
      audio = { file: "audio.wav", offsetFrames: pista.offset || 0,
        durationFrames: Math.max(1, Math.round(pista.duracionFrames || pngs.length)) };
    }
  }
  const xml = LOW.animation.premiereXML({
    name: escena.name || "LOW", fps, width: escena.width, height: escena.height,
    frames: archivos, audio,
  });
  dzSetStatus("Escribiendo la carpeta para Premiere…");
  const r = await api.export_premiere(dzRutaDeSalida(DZ), pngs, xml, wav, nombre);
  if (!r || r.error) return dzSetStatus("No pude escribir el XML: " + ((r && r.error) || ""));
  dzSetStatus(`XML listo en ${r.path} · ${r.frames} cuadros a ${fps} fps` +
    (r.audio ? " con audio" : " sin audio (la escena no tiene ninguno cargado)") +
    " · importalo desde Archivo → Importar de Premiere");
  return true;
}
/** Bytes a base64 sin pasar por un blob: el puente recibe texto. */
function dzBytesABase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

async function dzDoExportDoc(kind) {
  dzDocCommit();
  const cuadros = dzExportCuadros();
  if (!cuadros.length) return dzSetStatus("No hay cuadros para exportar");
  const throughCam = dzHasCam();
  const pngs = [];
  for (let i = 0; i < cuadros.length; i++) {
    const f = cuadros[i];
    let txt = dzCuadroSvgTexto(f);
    if (!txt) txt = dzExportCuadroEnBlanco(DZ.doc.scene);   // un cuadro en blanco es un cuadro: saltearlo ADELANTA todo lo que sigue
    txt = dzRigView(txt, f);                  // las poses del rig, aplicadas
    if (throughCam) txt = dzCamView(txt, dzCamAt(f));
    const du = await dzSvgToPng(txt, kind === "sheet" ? 512 : 1080);
    if (du) pngs.push(du);
    dzSetStatus("Rasterizando" + (throughCam ? " por c\u00e1mara" : "") +
      "\u2026 " + (i + 1) + "/" + cuadros.length);
  }
  if (!pngs.length) return dzSetStatus("No pude rasterizar ning\u00fan cuadro");
  const fps = Math.max(1, Math.min(60, +$("#tlFps").value || DZ.doc.scene.fps || 12));
  if (kind === "sheet") return dzExportSpritesheet(pngs, fps);
  if (kind === "premiere") return dzExportPremiere(pngs, fps, cuadros);
  dzSetStatus({ mp4: "Codificando MP4 con ffmpeg\u2026", webm: "Codificando WebM\u2026",
                gif: "Armando el GIF\u2026" }[kind] || "Guardando la secuencia\u2026");
  const r = await api.export_anim(dzRutaDeSalida(DZ), pngs, fps, kind);   // la del .low, no la del .svg suelto
  const detalle = { mp4: " (MP4 a " + fps + " fps)", webm: " (WebM a " + fps + " fps)",
                    gif: " (GIF a " + fps + " fps)" }[kind] || " (" + pngs.length + " PNGs)";
  dzSetStatus(r && r.error ? r.error
    : "Exportado " + ((r && r.path) || "export/") + detalle + " \u00b7 " +
      pngs.length + " cuadros (F" + cuadros[0] + " a F" + cuadros.at(-1) + ")" + dzExportAvisoFaltantes(pngs.length, cuadros.length));
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
}

/** La grilla del spritesheet, compartida por los dos caminos. */
async function dzExportSpritesheet(pngs, fps) {
  const imgs = await Promise.all(pngs.map(du => new Promise(res => {
    const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = du;
  })));
  const ok = imgs.filter(Boolean);
  if (!ok.length) return dzSetStatus("No pude armar el spritesheet");
  const cols = Math.ceil(Math.sqrt(ok.length)), rows = Math.ceil(ok.length / cols);
  const fw = ok[0].naturalWidth, fh = ok[0].naturalHeight;
  const c = document.createElement("canvas"); c.width = cols * fw; c.height = rows * fh;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  ok.forEach((im, i) => ctx.drawImage(im, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh));
  const r = await api.export_anim(dzRutaDeSalida(DZ), [c.toDataURL("image/png")], fps, "sheet");
  dzSetStatus(r && r.error ? r.error
    : "Spritesheet exportado (" + cols + "\u00d7" + rows + ") \u00b7 " + ((r && r.path) || "export/"));
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
}

/* == PRINCIPIOS DE ANIMACION AUTOMATIZABLES =================================
   Cuatro de los doce se pueden calcular; el resto es criterio y no hay boton
   que lo reemplace. Estos operan sobre las claves que ya pusiste: ninguno
   inventa poses, todos transforman las tuyas. */

/** Los descendientes de una pieza, con su profundidad (hijo 1, nieto 2...). */
function dzRigDescendientes(nodeId) {
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc) return [];
  const salida = [];
  const bajar = (padre, nivel) => {
    for (const n of Object.values(sc.rig.nodes)) {
      if (n.parentId !== padre) continue;
      salida.push({ id: n.id, nivel });
      bajar(n.id, nivel + 1);
    }
  };
  bajar(nodeId, 1);
  return salida;
}

/** ACCION COMPLEMENTARIA Y SUPERPUESTA (5): las partes que cuelgan llegan
 *  TARDE. Se corren las claves de cada descendiente tantos cuadros como su
 *  profundidad, y la cadena deja de moverse en bloque como un robot. */
function dzPrincipioDesfase(cuadros) {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return dzSetStatus("Eleg\u00ed la pieza de la que cuelga la cadena");
  const paso = Math.max(1, Math.round(cuadros || 1));
  const hijos = dzRigDescendientes(node.id);
  if (!hijos.length) return dzSetStatus("\u00ab" + node.id + "\u00bb no tiene piezas colgando");
  const sc = DZ.doc.scene;
  let movidas = 0;
  for (const { id, nivel } of hijos) {
    const claves = sc.rigNode(id).keys || {};
    const nums = Object.keys(claves).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
    if (!nums.length) continue;
    const copia = {};
    for (const f of nums) copia[f + paso * nivel] = JSON.parse(JSON.stringify(claves[f]));
    DZ.doc.replaceRigKeys(id, copia, "Desfasar la cadena");
    movidas += nums.length;
  }
  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzTimelineBadges?.(); dzMarkDirty();
  dzSetStatus("Cadena de \u00ab" + node.id + "\u00bb desfasada " + paso + " cuadro" +
    (paso > 1 ? "s" : "") + " por nivel \u00b7 " + movidas + " claves corridas");
}

/** POSE A POSE / BLOCKING (4): todas las claves del tramo pasan a escalon, para
 *  mirar solo las poses sin que la interpolacion las disimule. Volver a suave
 *  las devuelve. */
function dzPrincipioBlocking(prender) {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return dzSetStatus("Eleg\u00ed una pieza");
  const claves = DZ.doc.scene.rigNode(node.id).keys || {};
  const nums = Object.keys(claves).map(Number).filter(Number.isFinite);
  if (!nums.length) return dzSetStatus("\u00ab" + node.id + "\u00bb no tiene claves todav\u00eda");
  for (const f of nums) {
    const actual = dzRigEaseDe(DZ.doc.scene.rigNode(node.id), f);
    actual.hold = !!prender;
    if (prender) { actual.eo = [1/3, 1/3]; actual.ei = [2/3, 2/3]; }
    DZ.doc.setRigKeyEase(node.id, f, actual);
  }
  dzRigApplyLive(dzRigCur()); dzRigCurvaRender?.(); dzMarkDirty();
  dzSetStatus(prender
    ? "\u00ab" + node.id + "\u00bb en bloques: " + nums.length + " poses secas, sin intermedios"
    : "\u00ab" + node.id + "\u00bb vuelve a interpolar entre poses");
}

/** EXAGERACION (10): amplifica lo que ya animaste. Cada clave se aleja mas de
 *  la pose de reposo; con un factor menor a 1, se acerca (suaviza la actuacion). */
function dzPrincipioExagerar(factor) {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return dzSetStatus("Eleg\u00ed una pieza");
  const sc = DZ.doc.scene, nodo = sc.rigNode(node.id);
  const claves = nodo.keys || {};
  const nums = Object.keys(claves).map(Number).filter(Number.isFinite);
  if (nums.length < 1) return dzSetStatus("\u00ab" + node.id + "\u00bb no tiene claves para exagerar");
  const k = Number(factor) || 1.25;
  const base = nodo.rest || { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
  const copia = {};
  for (const f of nums) {
    const c = claves[f];
    copia[f] = { ...JSON.parse(JSON.stringify(c)),
      x: (base.x || 0) + ((c.x || 0) - (base.x || 0)) * k,
      y: (base.y || 0) + ((c.y || 0) - (base.y || 0)) * k,
      r: (base.r || 0) + ((c.r || 0) - (base.r || 0)) * k };
  }
  DZ.doc.replaceRigKeys(node.id, copia, k >= 1 ? "Exagerar" : "Suavizar la actuaci\u00f3n");
  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzMarkDirty();
  dzSetStatus("\u00ab" + node.id + "\u00bb " + (k >= 1 ? "exagerada" : "suavizada") +
    " \u00d7" + k.toFixed(2) + " sobre su reposo \u00b7 " + nums.length + " claves");
}

/** ESTIRAR Y ENCOGER CON VOLUMEN (1): al escalar un eje, el otro compensa, asi
 *  la masa no cambia. Sin esto, estirar infla la pieza en vez de deformarla. */
function dzPrincipioVolumen() {
  DZ.rigVolumen = !DZ.rigVolumen;
  $("#rigVolumen")?.classList.toggle("on", DZ.rigVolumen);
  dzSetStatus(DZ.rigVolumen
    ? "Volumen conservado: al estirar un eje, el otro se encoge solo"
    : "Volumen libre: cada eje se escala por su cuenta");
}

/* == RIG DIBUJANDO EL ALAMBRE ==============================================
   El camino corto para armar un muñeco: dibujás el monigote de alambre encima
   del personaje —hueso por hueso, como quien traza un esqueleto— y después el
   programa reparte el dibujo entre esos huesos.

   Antes había que ir pieza por pieza: elegirla, ponerle el pivote, decirle de
   quién cuelga y vincularla. Con veinte piezas eso son ochenta pasos, y por eso
   armar un personaje no se podía. Acá el alambre YA dice todo eso: dónde están
   las articulaciones, de quién cuelga cada parte y qué pedazo del dibujo le
   toca a cada hueso. */

/** Distancia de un punto al segmento de un hueso. */
function dzDistanciaASegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const largo2 = vx * vx + vy * vy;
  if (largo2 < 1e-9) return Math.hypot(px - ax, py - ay);
  let u = ((px - ax) * vx + (py - ay) * vy) / largo2;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - (ax + vx * u), py - (ay + vy * u));
}

/** Los puntos con los que se mide una pieza: el centro y las esquinas de su
 *  caja. Con el centro solo, una pieza larga y torcida —un brazo en diagonal—
 *  puede quedar más cerca del hueso equivocado. */
function dzPuntosDeMuestra(el) {
  let b = null;
  try { b = el.getBBox(); } catch (_) { return []; }
  if (!b || (!b.width && !b.height)) return [];
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const locales = [
    { x: cx, y: cy },
    { x: b.x + b.width * 0.25, y: b.y + b.height * 0.25 },
    { x: b.x + b.width * 0.75, y: b.y + b.height * 0.25 },
    { x: b.x + b.width * 0.25, y: b.y + b.height * 0.75 },
    { x: b.x + b.width * 0.75, y: b.y + b.height * 0.75 },
  ];
  // getBBox() devuelve coordenadas LOCALES. Los huesos viven en el sistema de
  // la raíz SVG; comparar ambos sin convertir hacía que una pieza agrupada,
  // escalada o girada se repartiera al hueso equivocado. getCTM incluye toda
  // la cadena de grupos pero no el zoom CSS de la interfaz.
  const root = el.ownerSVGElement, matrix = el.getCTM?.();
  if (!root || !matrix) return locales;
  return locales.map(p => {
    const point = root.createSVGPoint(); point.x = p.x; point.y = p.y;
    const world = point.matrixTransform(matrix);
    return { x:world.x, y:world.y };
  });
}

/** Reparte el dibujo entre los huesos ya dibujados: cada pieza va al hueso que
 *  le pasa más cerca. Es la operación que convierte un alambre en un rig. */
function dzRigRepartirDibujo() {
  if (!DZ.doc) return dzSetStatus("Abr\u00ed una animaci\u00f3n primero");
  const sc = DZ.doc.scene; if (typeof dzRigAlambreDerivar === "function") dzRigAlambreDerivar(DZ.doc);
  const huesos = Object.values(sc.rig.nodes).filter(n => n.head && n.tail);
  if (!huesos.length) return dzSetStatus(
    "Primero dibuj\u00e1 el alambre: Construir \u2192 Crear hueso, y arrastr\u00e1 desde cada articulaci\u00f3n");

  // Se lee la mesa, pero la mesa puede estar a medio repintar —crear huesos
  // dispara un repintado— y entonces la busqueda no encontraria nada y el
  // reparto fallaria en silencio. Si el dibujo tiene contenido y la mesa no,
  // se la pone al dia antes de mirar.
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  const delDibujo = DZ.doc.drawing?.content || "";
  if (svg && !dzCompositionElements(svg).length && delDibujo) dzCanvasSet(delDibujo);

  const piezas = dzRigDrawableElements();
  if (!piezas.length) return dzSetStatus(delDibujo
    ? "El dibujo tiene contenido pero la mesa está vacía · cambiá de cuadro y volvé"
    : "No encuentro piezas de dibujo en la mesa");

  // Los vínculos existentes no se pisan. Cada hueso rígido recibe una sola
  // pieza: asignar varias al mismo hueso reemplazaba silenciosamente las
  // anteriores y después sólo se movía la última.
  const tomados = new Set(Object.values(sc.rig.nodes).map(n => n.elementId).filter(Boolean));
  const huesosTomados = new Set(huesos.filter(n => n.elementId).map(n => n.id));
  // el largo del alambre da la escala: una pieza más lejos que eso no es del
  // muñeco (un fondo, una nota al margen) y se deja afuera
  const largoTotal = huesos.reduce((s, n) =>
    s + Math.hypot(n.tail.x - n.head.x, n.tail.y - n.head.y), 0);
  const alcance = Math.max(40, (largoTotal / huesos.length) * 1.6);

  let asignadas = 0; const lejos = [];    // con nombre: <<quedaron 3>> no dice cual
  const reparto = [];
  const candidatos = [];
  for (const el of piezas) {
    if (!el.id) el.id = dzUniqueId("pieza_");
    if (tomados.has(el.id)) continue;
    const muestras = dzPuntosDeMuestra(el);
    if (!muestras.length) continue;
    let mejorD = Infinity;
    for (const n of huesos) {
      if (huesosTomados.has(n.id)) continue;
      // se suma la distancia de todas las muestras: gana el hueso que le pasa
      // más cerca en conjunto, no el que roza una esquina
      let suma = 0;
      for (const m of muestras)
        suma += dzDistanciaASegmento(m.x, m.y, n.head.x, n.head.y, n.tail.x, n.tail.y);
      const d = suma / muestras.length;
      mejorD = Math.min(mejorD, d);
      if (d <= alcance) candidatos.push({ el, hueso:n, distancia:d });
    }
    if (mejorD > alcance) { lejos.push(el.id); continue; }
  }

  // Emparejamiento voraz global: primero se asegura la pareja más clara de
  // toda la figura; luego se retiran esa pieza y ese hueso. Es más estable que
  // decidir pieza por pieza según el orden del SVG.
  candidatos.sort((a, b) => a.distancia - b.distancia);
  for (const par of candidatos) {
    if (tomados.has(par.el.id) || huesosTomados.has(par.hueso.id)) continue;
    if (!DZ.doc.bindRigElement(par.hueso.id, par.el.id)) continue;
    tomados.add(par.el.id); huesosTomados.add(par.hueso.id); asignadas++;
    reparto.push(par.el.id + " \u2192 " + par.hueso.id);
  }

  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
  if (!asignadas) return dzSetStatus(lejos.length
    ? "Ninguna pieza cay\u00f3 cerca del alambre \u00b7 mov\u00e9 los huesos encima del personaje (Construir \u2192 Editar) y volv\u00e9 a Repartir"
    : "Todas las piezas ya ten\u00edan hueso");
  dzSetStatus(asignadas + (asignadas === 1 ? " pieza repartida" : " piezas repartidas") +
    " entre " + huesos.length + " huesos, sin reemplazar vínculos" +
    (lejos.length ? " \u00b7 sin hueso: " + lejos.slice(0, 3).join(", ") + (lejos.length > 3 ? " y " + (lejos.length - 3) + " m\u00e1s" : "") + " \u00b7 acercales un hueso, o eleg\u00ed la pieza y el hueso y toc\u00e1 Vincular" : "") +
    " \u00b7 pas\u00e1 a Probar antes de animar");
  return reparto;
}

/** Pincel de ancho fijo: el trazo sale parejo de punta a punta. */
function dzAnchoFijoToggle() {
  DZ.anchoFijo = !DZ.anchoFijo;
  $("#dzAnchoFijo")?.classList.toggle("on", DZ.anchoFijo); $("#dzAnchoFijo")?.setAttribute("aria-pressed",String(DZ.anchoFijo));
  try { dzPrefsStorage().setItem("low.anchoFijo", DZ.anchoFijo ? "1" : "0"); } catch (_) { /* sin storage */ }
  dzSetStatus(DZ.anchoFijo
    ? "Pincel de ancho fijo: el trazo sale parejo, sin seguir la presi\u00f3n"
    : "Pincel sensible a la presi\u00f3n: el trazo engorda y adelgaza con el l\u00e1piz");
}

/* == ARCOS: la trayectoria de una pieza ====================================
   El septimo principio. Los movimientos vivos describen curvas, no rectas, y
   la unica forma de corregir un arco es verlo: se dibuja por donde pasa el
   pivote de la pieza en cada cuadro del tramo, con los cuadros clave marcados.

   Los puntos muy juntos son cuadros lentos y los separados, rapidos: el mismo
   dibujo cuenta el arco Y el espaciado. */

/** Los puntos por donde pasa una pieza, cuadro a cuadro, en el tramo activo. */

function dzRigArcoPuntos(nodeId) {
  const sc = DZ.doc && DZ.doc.scene, node = sc && sc.rigNode(nodeId);
  if (!node) return [];
  const r = sc.playRange();
  // Se sigue el EXTREMO de la pieza, no su pivote: el pivote de un brazo es el
  // hombro y no se mueve cuando el brazo rota — el arco lo describe la punta.
  let ancla = node.tail;
  if (!ancla) {
    const hijo = Object.values(sc.rig.nodes).find(n => n.parentId === node.id && n.pivot);
    ancla = hijo ? hijo.pivot : null;
  }
  if (!ancla) {
    const svg = $("#dzCanvas")?.querySelector(":scope > svg");
    const el = svg && svg.querySelector("#" + CSS.escape(node.elementId || node.id));
    try { const b = el && el.getBBox();
      if (b) ancla = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } catch (_) { /* sin caja */ }
  }
  if (!ancla) ancla = node.pivot || node.head || { x: 0, y: 0 };
  const claves = new Set(Object.keys(node.keys || {}).map(Number));
  const salida = [];
  for (let f = r.in; f <= r.out; f++) {
    const w = sc.rigWorldPoint(nodeId, f, ancla);
    salida.push({ f, x: w.x, y: w.y, clave: claves.has(f) });
  }
  return salida;
}

function dzRigArcoDibujar(get, node, cv, num) {
  const puntos = dzRigArcoPuntos(node.id);
  if (puntos.length < 2) return;
  const enPantalla = puntos.map(q => {
    const s = dzFromUser(q.x, q.y);
    return s && { ...q, sx: s.x - cv.left, sy: s.y - cv.top };
  }).filter(Boolean);
  if (enPantalla.length < 2) return;
  // ¿se movio de verdad? un pivote quieto no tiene arco que mostrar
  const dx = Math.max(...enPantalla.map(q => q.sx)) - Math.min(...enPantalla.map(q => q.sx));
  const dy = Math.max(...enPantalla.map(q => q.sy)) - Math.min(...enPantalla.map(q => q.sy));
  if (dx < 2 && dy < 2) return;

  get("arco", "polyline", { points: enPantalla.map(q => q.sx + "," + q.sy).join(" ") }, "dz-rig-arco");
  for (const q of enPantalla) {
    get("arcp:" + q.f, "circle", { cx: q.sx, cy: q.sy, r: q.clave ? 3.6 : 2 },
      "dz-rig-arco-p" + (q.clave ? " clave" : "") + (q.f === num ? " ahora" : ""));
  }
}

/** Prende o apaga la trayectoria. */
function dzRigArcoToggle() {
  DZ.rigArco = !DZ.rigArco;
  $("#rigArco")?.classList.toggle("on", DZ.rigArco);
  dzRigOverlayRender();
  const node = dzRigSelectedNode();
  dzSetStatus(!DZ.rigArco ? "Arco oculto"
    : (node ? "Arco de \u00ab" + node.id + "\u00bb \u00b7 los puntos juntos son cuadros lentos, los separados r\u00e1pidos"
            : "Eleg\u00ed una pieza para ver su arco"));
}

/** Cuanto se aparta la trayectoria de una curva suave: sirve para saber si el
 *  arco quedo quebrado antes y despues de suavizarlo. */
function dzRigArcoQuiebre(nodeId) {
  const puntos = dzRigArcoPuntos(nodeId);
  if (puntos.length < 3) return 0;
  let suma = 0;
  for (let i = 1; i < puntos.length - 1; i++) {
    const a = puntos[i - 1], b = puntos[i], c = puntos[i + 1];
    // distancia del punto del medio a la recta entre sus vecinos
    const vx = c.x - a.x, vy = c.y - a.y, largo = Math.hypot(vx, vy) || 1;
    suma += Math.abs((b.x - a.x) * vy - (b.y - a.y) * vx) / largo;
  }
  return +(suma / (puntos.length - 2)).toFixed(2);
}

/* == TRAMO ACTIVO DE LA LINEA DE TIEMPO =====================================
   De que cuadro a que cuadro se anima. Lo de afuera se atenua y no entra ni en
   la reproduccion ni en el export. El modelo ya guardaba In/Out y el transporte
   los respetaba, pero solo se podian escribir a mano en dos casilleros: aca se
   agarran y se arrastran sobre la regla, como en Toon Boom y OpenToonz. */

/** El tramo vigente, resuelto: Out en 0 significa "hasta donde llegue". */
function dzRangoActual(largoVisible) {
  const sc = DZ.doc && DZ.doc.scene;
  const ultimo = Math.max(1, (sc && sc.lastFrame()) || 1, largoVisible ? 0 : 0);
  if (!sc) return { in: 1, out: ultimo, abierto: true };
  const abierto = !(sc.range.out > 0);
  return { in: Math.max(1, sc.range.in || 1),
           out: abierto ? ultimo : Math.max(1, sc.range.out),
           abierto };
}

/** Fija el tramo y lo deja escrito en los dos lados: modelo y casilleros. */
function dzRangoSet(desde, hasta, opciones) {
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc) return;
  const ultimo = Math.max(1, sc.lastFrame() || 1);
  let a = Math.max(1, Math.round(desde));
  let z = Math.max(1, Math.round(hasta));
  if (a > z) { const tmp = a; a = z; z = tmp; }        // cruzarlos no rompe nada
  sc.range.in = a;
  // guardar el Out tal cual: si coincide con el final de la escena se deja
  // abierto (0), asi la zona sigue creciendo cuando la escena crece.
  sc.range.out = (z >= ultimo && (opciones && opciones.abierto !== false)) ? 0 : z;
  if ($("#tlIn")) $("#tlIn").value = sc.range.in;
  if ($("#tlOut")) $("#tlOut").value = sc.range.out;
  DZ.doc.touch(); DZ.doc.emit("frame");
  dzTlGridRender();
  dzMarkDirty();
}

/** Arrastrar una manija de la regla. */
function dzRangoDrag(e, borde) {
  if (!DZ.doc) return;
  e.preventDefault(); e.stopPropagation();
  const cols = $("#dzTlgCols");
  const pointerId = e.pointerId;
  const tramo = dzRangoActual();
  const frameDesdeX = (clientX) => {
    const caja = cols.getBoundingClientRect();
    const primera = cols.querySelector(".dz-tlg-col");
    const ancho = primera ? primera.getBoundingClientRect().width : 22;
    return Math.max(1, Math.floor((clientX - caja.left + cols.scrollLeft) / Math.max(1, ancho)) + 1);
  };
  const mover = ev => {
    if (ev.pointerId !== pointerId) return;
    const f = frameDesdeX(ev.clientX);
    const a = borde === "in" ? f : tramo.in;
    const z = borde === "in" ? tramo.out : f;
    // arrastrar el Out lo fija: si no, moverlo al final lo dejaria abierto y
    // pareceria que el arrastre no hizo nada.
    dzRangoSet(a, z, { abierto: false });
  };
  const soltar = ev => {
    if (ev.pointerId != null && ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    document.removeEventListener("pointercancel", soltar);
    const t = dzRangoActual();
    dzSetStatus("Tramo activo: F" + t.in + " a F" + t.out + " \u00b7 " +
      (t.out - t.in + 1) + " cuadros \u00b7 doble clic en la regla para volver a toda la escena");
  };
  document.addEventListener("pointermove", mover);
  document.addEventListener("pointerup", soltar);
  document.addEventListener("pointercancel", soltar);
}

/** Devolver el tramo a toda la escena. */
function dzRangoTodo() {
  const sc = DZ.doc && DZ.doc.scene;
  if (!sc) return;
  sc.range.in = 1; sc.range.out = 0;
  if ($("#tlIn")) $("#tlIn").value = 1;
  if ($("#tlOut")) $("#tlOut").value = 0;
  DZ.doc.touch(); DZ.doc.emit("frame");
  dzTlGridRender(); dzMarkDirty();
  dzSetStatus("Tramo activo: toda la escena");
}

/* == COPIAR Y PEGAR UN CUADRO ===============================================
   El gesto mas usado de la animacion tradicional: copiar el dibujo y hacer el
   siguiente encima de la copia.

   Pegar crea un dibujo NUEVO con el mismo contenido, no una segunda exposicion
   del mismo: si compartieran dibujo, retocar uno cambiaria los dos y no se
   podria animar. Para compartir esta el sostener (la manija de la hoja de
   tiempos), que es otra cosa. */

function dzCuadroCopiar() {
  if (!DZ.doc) return false;
  dzDocCommit();                       // lo que este en la mesa, primero adentro
  const dibujo = DZ.doc.drawing;
  if (!dibujo) { dzSetStatus("Este cuadro no tiene dibujo para copiar"); return true; }
  DZ.clipCuadro = { numero: dibujo.number, contenido: dibujo.content || "",
                    desde: DZ.doc.frame, capa: DZ.doc.layerId,
                    ultimoDestino: DZ.doc.frame };
  dzSetStatus("Cuadro F" + DZ.doc.frame + " copiado \u00b7 Ctrl+V lo pega en el siguiente");
  return true;
}

function dzCuadroPegar() {
  if (!DZ.doc) return false;
  const clip = DZ.clipCuadro;
  if (!clip) { dzSetStatus("Todav\u00eda no copiaste ning\u00fan cuadro (Ctrl+C)"); return true; }
  const capa = DZ.doc.layer;
  if (!capa) { dzSetStatus("No hay capa activa"); return true; }
  if (capa.locked) { dzSetStatus("La capa est\u00e1 bloqueada"); return true; }

  // Si seguis parado donde dejo el ultimo pegado, el destino es el cuadro
  // siguiente: asi Ctrl+V repetido va encadenando copias, que es como se hace
  // una tira para ir modificandola. Si te moviste vos, pega donde estas.
  const destino = DZ.doc.frame === clip.ultimoDestino ? DZ.doc.frame + 1 : DZ.doc.frame;

  dzDocCommit();
  const copia = DZ.doc.duplicateDrawing(clip.numero);
  if (!copia) { dzSetStatus("No se pudo copiar ese dibujo"); return true; }
  DZ.doc.setCell(destino, copia.number, capa.id);
  DZ.doc.goTo(destino);
  clip.ultimoDestino = destino;
  dzMarkDirty();
  dzSetStatus("Pegado en F" + destino + " como dibujo " + copia.number +
    " \u00b7 es una copia aparte: retocarla no toca el original");
  return true;
}

/* == DEFORMADOR: aplicar la curva al dibujo =================================
   Doblar no es transformar: hay que REESCRIBIR la geometria, punto por punto.
   El original se guarda en `data-defbase` y `dzRigStrip` lo devuelve, asi que
   el doblez nunca se hornea dentro del dibujo guardado — igual que las poses. */

/** El `d` exacto de una forma simple. Se convierte al crear el deformador:
 *  un rect no se puede doblar, un trazo si. */
function dzFormaAPath(el) {
  const n = (a) => +(el.getAttribute(a) || 0);
  switch (el.tagName.toLowerCase()) {
    case "path": return el.getAttribute("d") || "";
    case "line": return `M${n("x1")} ${n("y1")} L${n("x2")} ${n("y2")}`;
    case "polyline": case "polygon": {
      const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return "";
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i < pts.length - 1; i += 2) d += ` L${pts[i]} ${pts[i + 1]}`;
      return d + (el.tagName.toLowerCase() === "polygon" ? " Z" : "");
    }
    case "circle": {
      const cx = n("cx"), cy = n("cy"), r = n("r");
      return `M${cx - r} ${cy} A${r} ${r} 0 1 0 ${cx + r} ${cy} A${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
    }
    case "ellipse": {
      const cx = n("cx"), cy = n("cy"), rx = n("rx"), ry = n("ry");
      return `M${cx - rx} ${cy} A${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
    }
    case "rect": {
      const x = n("x"), y = n("y"), w = n("width"), h = n("height");
      let rx = el.hasAttribute("rx") ? n("rx") : 0, ry = el.hasAttribute("ry") ? n("ry") : rx;
      rx = Math.min(rx || ry, w / 2); ry = Math.min(ry || rx, h / 2);
      if (!rx && !ry) return `M${x} ${y} H${x + w} V${y + h} H${x} Z`;
      return `M${x + rx} ${y} H${x + w - rx} A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}` +
        ` V${y + h - ry} A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}` +
        ` H${x + rx} A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        ` V${y + ry} A${rx} ${ry} 0 0 1 ${x + rx} ${y} Z`;
    }
    default: return "";
  }
}

/** Reemplaza una forma por un <path> equivalente, conservando todo lo demas.
 *  Devuelve el path nuevo, o el mismo elemento si ya era path. */
function dzFormaConvertir(el) {
  if (el.tagName.toLowerCase() === "path") return el;
  const d = dzFormaAPath(el);
  if (!d) return null;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  for (const a of el.attributes)
    if (!["x", "y", "width", "height", "rx", "ry", "cx", "cy", "r",
          "x1", "y1", "x2", "y2", "points"].includes(a.name))
      path.setAttribute(a.name, a.value);
  path.setAttribute("d", d);
  el.replaceWith(path);
  return path;
}

/** Los subpaths de un `d`, cada uno con sus puntos ya aplanados. Se muestrea
 *  con getPointAtLength: lo resuelve el navegador, que sabe leer cualquier
 *  comando —arcos incluidos— mejor que un parser hecho a mano. */
function dzPathAPuntos(d, svg) {
  const tramos = [];
  const partes = String(d).split(/(?=[Mm])/).filter(s => s.trim());
  const medidor = document.createElementNS("http://www.w3.org/2000/svg", "path");
  medidor.style.display = "none";
  svg.appendChild(medidor);
  try {
    for (const parte of partes) {
      medidor.setAttribute("d", parte);
      let largo = 0;
      try { largo = medidor.getTotalLength(); } catch (_) { continue; }
      if (!(largo > 0)) {
        const m = parte.match(/-?[\d.]+/g);
        if (m && m.length >= 2) tramos.push({ pts: [{ x: +m[0], y: +m[1] }], cerrado: false });
        continue;
      }
      // un punto cada ~3 px: por debajo de eso el doblez ya no se ve mejor y
      // el `d` se vuelve enorme
      const n = Math.max(2, Math.min(600, Math.ceil(largo / 3)));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const q = medidor.getPointAtLength(largo * i / n);
        pts.push({ x: q.x, y: q.y });
      }
      const cerrado = /[Zz]\s*$/.test(parte.trim());
      if (cerrado && pts.length > 1) pts.pop();       // el cierre lo pone la Z
      tramos.push({ pts, cerrado });
    }
  } finally { medidor.remove(); }
  return tramos;
}

function dzPuntosAPath(tramos) {
  const r = (v) => Math.round(v * 100) / 100;
  return tramos.map(({ pts, cerrado }) => {
    if (!pts.length) return "";
    let d = "M" + r(pts[0].x) + " " + r(pts[0].y);
    for (let i = 1; i < pts.length; i++) d += "L" + r(pts[i].x) + " " + r(pts[i].y);
    return d + (cerrado ? "Z" : "");
  }).filter(Boolean).join("");
}

/** Doblа un elemento (o los dibujables de un grupo) con el mapeador dado. */
function dzDeformarElemento(el, mapeador, svg) {
  if (!el || !mapeador) return 0;
  const hijos = el.tagName.toLowerCase() === "g"
    ? [...el.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon")]
    : [el];
  let tocados = 0;
  for (const hijo of hijos) {
    if (hijo.tagName.toLowerCase() !== "path") continue;   // ya se convirtio al crear
    if (!hijo.hasAttribute("data-defbase")) hijo.setAttribute("data-defbase", hijo.getAttribute("d") || "");
    const base = hijo.getAttribute("data-defbase");
    if (!base) continue;
    const tramos = dzPathAPuntos(base, svg);
    for (const tramo of tramos) tramo.pts = tramo.pts.map(q => mapeador.punto(q));
    hijo.setAttribute("d", dzPuntosAPath(tramos));
    tocados++;
  }
  return tocados;
}

/* == DIBUJOS DE UNA PIEZA (sustitucion de dibujo) ===========================
   Una mano no rota: se cambia por otra mano. Lo mismo el pie o la boca en la
   sincronia labial. Aca una pieza puede tener varios dibujos y una clave por
   cuadro decide cual se ve. El dibujo NO se interpola: vale desde su clave
   hasta la siguiente. */
function dzRigSlotDe(node) { return node ? "slot:" + node.id : null; }

function dzRigVarsRender() {
  const caja = $("#rigVars");
  if (!caja) return;
  const node = dzRigSelectedNode(), sc = DZ.doc && DZ.doc.scene;
  const frame = dzRigCur();
  const eti = $("#rigVarFrame"); if (eti) eti.textContent = "F" + frame;
  caja.innerHTML = "";
  if (!node || !sc) {
    caja.innerHTML = '<div class="vacio">Eleg\u00ed una pieza para ver sus dibujos.</div>';
    return;
  }
  const slotId = dzRigSlotDe(node), variantes = sc.rigVariants(slotId);
  if (!variantes.length) {
    caja.innerHTML = '<div class="vacio">Esta pieza todav\u00eda no tiene dibujo vinculado.</div>';
    return;
  }
  const activo = sc.rigActiveAttachment(slotId, frame);
  const sw = sc.rigSwitch(slotId), claveAca = sw && sw.keys[frame];
  for (const v of variantes) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rig2-var" + (activo && activo.id === v.id ? " activo" : "") +
      (claveAca === v.id ? " elegido" : "");
    const pt = document.createElement("span"); pt.className = "pt"; b.appendChild(pt);
    const nom = document.createElement("span"); nom.textContent = v.name || v.elementId;
    b.appendChild(nom);
    const marca = document.createElement("span"); marca.className = "clv";
    marca.textContent = claveAca === v.id ? "clave ac\u00e1" : (activo && activo.id === v.id ? "se ve" : "");
    b.appendChild(marca);
    b.title = "Mostrar \u00ab" + (v.name || v.elementId) + "\u00bb desde F" + frame;
    b.onclick = () => dzRigVarUsar(v.id);
    caja.appendChild(b);
  }
  const pista = $("#rigVarHint");
  if (pista) pista.textContent = variantes.length < 2
    ? "Dibuj\u00e1 otra versi\u00f3n en la mesa, seleccionala y toc\u00e1 Sumar dibujo."
    : "Un clic cambia el dibujo desde este cuadro en adelante, hasta el pr\u00f3ximo cambio.";
}

function dzRigVarUsar(attachmentId) {
  const node = dzRigSelectedNode();
  if (!node || !DZ.doc) return;
  const slotId = dzRigSlotDe(node), frame = dzRigCur();
  if (!DZ.doc.setRigSwitchKey(slotId, frame, attachmentId)) return dzRigVarsRender();
  const a = DZ.doc.scene.rigAttachment(attachmentId);
  dzRigApplyLive(frame); dzRigVarsRender(); dzTimelineBadges(); dzMarkDirty();
  dzSetStatus("Desde F" + frame + ", \u00ab" + node.id + "\u00bb muestra \u00ab" +
    ((a && (a.name || a.elementId)) || attachmentId) + "\u00bb");
}

function dzRigVarAdd() {
  const node = dzRigPiezaDestino();
  if (!node || !DZ.doc) return dzSetStatus("Eleg\u00ed primero la pieza del esqueleto");
  const el = DZ.sel;
  if (!el || !el.id) return dzSetStatus(
    "Seleccion\u00e1 en la mesa el dibujo que quer\u00e9s sumar como otra versi\u00f3n de \u00ab" + node.id + "\u00bb");
  if (el.id === (node.elementId || node.id))
    return dzSetStatus("Ese ya es el dibujo de la pieza \u00b7 seleccion\u00e1 la otra versi\u00f3n");
  const id = DZ.doc.addRigVariant(node.id, el.id, el.id);
  if (!id) return dzSetStatus("No se pudo sumar ese dibujo");
  // la mesa quedo apuntando al dibujo nuevo, que no es una pieza: se vuelve a
  // la pieza para que el panel muestre sus dibujos y se pueda elegir cual va
  dzRigSelectNode(node.id);
  dzRigVarsRender(); dzRigApplyLive(dzRigCur()); dzMarkDirty();
  dzSetStatus("\u00ab" + el.id + "\u00bb sumado a \u00ab" + node.id +
    "\u00bb \u00b7 toc\u00e1lo en la lista para mostrarlo desde un cuadro");
}

function dzRigVarDel() {
  const node = dzRigSelectedNode(), sc = DZ.doc && DZ.doc.scene;
  if (!node || !sc) return;
  const slotId = dzRigSlotDe(node), frame = dzRigCur();
  const activo = sc.rigActiveAttachment(slotId, frame);
  if (!activo) return dzSetStatus("No hay ning\u00fan dibujo elegido");
  if (sc.rigVariants(slotId).length < 2)
    return dzSetStatus("Es el \u00fanico dibujo de la pieza: no se puede quitar");
  const nombre = activo.name || activo.elementId;
  if (!DZ.doc.removeRigVariant(activo.id)) return dzSetStatus("No se pudo quitar ese dibujo");
  dzRigVarsRender(); dzRigApplyLive(frame); dzMarkDirty();
  dzSetStatus("El dibujo «" + nombre + "» salió de las versiones de «" +
    node.id + "» · el dibujo sigue en la mesa");
}

function dzRigVarClear() {
  const node = dzRigSelectedNode();
  if (!node || !DZ.doc) return;
  const frame = dzRigCur();
  if (!DZ.doc.deleteRigSwitchKey(dzRigSlotDe(node), frame))
    return dzSetStatus("En F" + frame + " no hay ning\u00fan cambio de dibujo para borrar");
  dzRigApplyLive(frame); dzRigVarsRender(); dzTimelineBadges(); dzMarkDirty();
  dzSetStatus("F" + frame + " ya no cambia el dibujo de \u00ab" + node.id +
    "\u00bb \u00b7 sigue el del cambio anterior");
}

/* == EDITOR DE CURVAS =======================================================
   El timing de un tramo, aparte de las poses. Se edita el tramo donde estas
   parado: la manija de SALIDA de la clave anterior y la de ENTRADA de la
   siguiente, igual que un cubic-bezier. Cambiar la curva no toca ni una pose:
   lo unico que cambia es CUANDO pasa lo que ya esta clavado. */
const DZ_EASE_PRESETS = {
  recta: { eo: [1 / 3, 1 / 3], ei: [2 / 3, 2 / 3] },
  suave: { eo: [0.65, 0], ei: [0.35, 1] },
  lento: { eo: [0.6, 0], ei: [0.85, 0.6] },
  frena: { eo: [0.15, 0.4], ei: [0.4, 1] },
  hold:  { eo: [1 / 3, 1 / 3], ei: [2 / 3, 2 / 3], hold: true }
};

/** El tramo que contiene el cuadro actual: la clave de la que se sale y a la
 *  que se llega. null si la pieza no tiene dos claves que lo abracen. */
function dzRigTramo() {
  const node = dzRigSelectedNode();
  if (!node || !DZ.doc) return null;
  const nums = Object.keys(node.keys || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (nums.length < 2) return null;
  const f = dzRigCur();
  let a = null, b = null;
  for (const k of nums) { if (k <= f) a = k; else { b = k; break; } }
  if (a == null) { a = nums[0]; b = nums[1]; }
  else if (b == null) { a = nums[nums.length - 2]; b = nums[nums.length - 1]; }
  return { node, a, b, f: Math.max(a, Math.min(b, f)) };
}

function dzRigEaseDe(node, frame) {
  const e = (node.keys[frame] || {}).ease || {};
  const nx = (m, dx, dy) => Array.isArray(m) && m.length === 2 ? [+m[0], +m[1]] : [dx, dy];
  return { eo: nx(e.eo, 1 / 3, 1 / 3), ei: nx(e.ei, 2 / 3, 2 / 3), hold: !!e.hold };
}

function dzRigCurvaRender() {
  const svg = $("#rigCurva"), quien = $("#rigEaseWho"), pista = $("#rigEaseHint");
  if (!svg) return;
  const tramo = dzRigTramo();
  svg.innerHTML = "";
  const ns = "http://www.w3.org/2000/svg";
  const nodo = (tag, attrs, cls) => {
    const e = document.createElementNS(ns, tag);
    for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
    if (cls) e.setAttribute("class", cls);
    svg.appendChild(e); return e;
  };

  if (!tramo) {
    if (quien) quien.textContent = "sin claves";
    nodo("rect", { x: 0, y: 0, width: 100, height: 100 }, "ec-marco");
    const txt = nodo("text", { x: 50, y: 54 }, "ec-vacio");
    txt.textContent = "hacen falta dos claves";
    if (pista) pista.textContent = "Pone al menos dos claves en esta pieza y el tramo aparece aca.";
    document.querySelectorAll(".rig2-ease button").forEach(b => b.classList.remove("on"));
    return;
  }

  const node = tramo.node, a = tramo.a, b = tramo.b, f = tramo.f;
  if (quien) quien.textContent = "F" + a + " \u2192 F" + b;
  const ea = dzRigEaseDe(node, a), eb = dzRigEaseDe(node, b);
  // el lienzo va de (0,100) abajo-izquierda a (100,0) arriba-derecha
  const X = v => v * 100, Y = v => 100 - v * 100;
  const p1 = { x: X(ea.eo[0]), y: Y(ea.eo[1]) }, p2 = { x: X(eb.ei[0]), y: Y(eb.ei[1]) };

  nodo("rect", { x: 0, y: 0, width: 100, height: 100 }, "ec-marco");
  nodo("line", { x1: 0, y1: 100, x2: 100, y2: 0 }, "ec-recta");
  if (b > a) {
    const px = X((f - a) / (b - a));
    nodo("line", { x1: px, y1: -8, x2: px, y2: 108 }, "ec-ahora");
  }

  if (ea.hold) {
    nodo("path", { d: "M0 100 L100 100 L100 0" }, "ec-curva");
    if (pista) pista.textContent = "Escalon: la pose se sostiene entera y salta recien en la clave siguiente.";
  } else {
    nodo("line", { x1: 0, y1: 100, x2: p1.x, y2: p1.y }, "ec-brazo");
    nodo("line", { x1: 100, y1: 0, x2: p2.x, y2: p2.y }, "ec-brazo");
    nodo("path", { d: "M0 100 C" + p1.x + " " + p1.y + " " + p2.x + " " + p2.y + " 100 0" }, "ec-curva");
    nodo("circle", { cx: 0, cy: 100, r: 3 }, "ec-ancla");
    nodo("circle", { cx: 100, cy: 0, r: 3 }, "ec-ancla");
    [["eo", p1, a], ["ei", p2, b]].forEach(par => {
      const cual = par[0], punto = par[1], frame = par[2];
      nodo("circle", { cx: punto.x, cy: punto.y, r: 4.5 }, "ec-manija");
      const hit = nodo("circle", { cx: punto.x, cy: punto.y, r: 11 }, "ec-hit");
      hit.onpointerdown = ev => dzRigCurvaDrag(ev, frame, cual);
    });
    if (pista) pista.textContent = "Arrastra las manijas para cambiar el timing sin tocar las poses.";
  }

  // CARTA DE TIEMPOS: donde cae cada cuadro intermedio dentro del recorrido.
  // Es el arco del TIMING, la reglita de toda la vida: marcas amontonadas =
  // ahi va lento, marcas separadas = ahi va rapido. La curva de arriba dice la
  // misma verdad, pero esto se lee de un vistazo y en cuadros reales.
  nodo("line", { x1: 0, y1: 122, x2: 100, y2: 122 }, "ec-carta-eje");
  const easeT = LOW.animation.rigEaseT;
  for (let f = a; f <= b; f++) {
    const avance = (b > a) ? (f - a) / (b - a) : 0;
    const donde = ea.hold ? (f >= b ? 1 : 0) : easeT(avance, node.keys[a]?.ease, node.keys[b]?.ease);
    const x = Math.max(0, Math.min(1, donde)) * 100;
    const extremo = f === a || f === b;
    nodo("line", { x1: x, y1: extremo ? 114 : 117, x2: x, y2: extremo ? 130 : 127 },
      "ec-carta-m" + (extremo ? " extremo" : "") + (f === tramo.f ? " ahora" : ""));
  }
  const leyenda = nodo("text", { x: 50, y: 141 }, "ec-carta-txt");
  leyenda.textContent = (b - a + 1) + " cuadros \u00b7 juntas = lento";

  const cual = ea.hold ? "hold" : dzRigPresetDe(ea, eb);
  document.querySelectorAll(".rig2-ease button").forEach(x => x.classList.toggle("on", x.dataset.ease === cual));
}

/** Que preset coincide con las manijas actuales, si alguno. */
function dzRigPresetDe(ea, eb) {
  const cerca = (u, v) => Math.abs(u - v) < 0.02;
  for (const nombre of Object.keys(DZ_EASE_PRESETS)) {
    const v = DZ_EASE_PRESETS[nombre];
    if (v.hold) continue;
    if (cerca(ea.eo[0], v.eo[0]) && cerca(ea.eo[1], v.eo[1]) &&
        cerca(eb.ei[0], v.ei[0]) && cerca(eb.ei[1], v.ei[1])) return nombre;
  }
  return null;
}

function dzRigCurvaDrag(e, frame, cual) {
  e.preventDefault(); e.stopPropagation();
  const svg = $("#rigCurva"), node = dzRigSelectedNode();
  if (!svg || !node) return;
  const pointerId = e.pointerId;
  const punto = ev => {                       // pantalla -> 0..1 del lienzo
    // getScreenCTM y no una regla de tres sobre la caja: el viewBox se ajusta
    // con preserveAspectRatio, asi que sobran margenes que la regla ignora.
    const m = svg.getScreenCTM();
    let vx, vy;
    if (m) {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const local = pt.matrixTransform(m.inverse()); vx = local.x; vy = local.y;
    } else {
      const caja = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      vx = vb.x + (ev.clientX - caja.left) / caja.width * vb.width;
      vy = vb.y + (ev.clientY - caja.top) / caja.height * vb.height;
    }
    // x se queda dentro del tramo o la curva deja de ser funcion del tiempo;
    // y puede pasarse de 0..1: eso es el rebote, y es deseable.
    return [Math.max(0, Math.min(1, vx / 100)),
            Math.max(-0.6, Math.min(1.6, (100 - vy) / 100))];
  };
  const mover = ev => {
    if (ev.pointerId !== pointerId) return;
    const actual = dzRigEaseDe(node, frame);
    actual[cual] = punto(ev);
    DZ.doc.setRigKeyEase(node.id, frame, actual);
    dzRigCurvaRender(); dzRigApplyLive(dzRigCur());
  };
  const soltar = ev => {
    if (ev.pointerId !== pointerId) return;
    document.removeEventListener("pointermove", mover);
    document.removeEventListener("pointerup", soltar);
    const v = dzRigEaseDe(node, frame)[cual];
    dzSetStatus("Curva de \u00ab" + node.id + "\u00bb en F" + frame + ": " +
      (cual === "eo" ? "salida" : "entrada") + " " + v[0].toFixed(2) + ", " + v[1].toFixed(2));
    dzMarkDirty();
  };
  document.addEventListener("pointermove", mover);
  document.addEventListener("pointerup", soltar);
}

function dzRigEasePreset(nombre) {
  const tramo = dzRigTramo();
  if (!tramo) return dzSetStatus("Pone dos claves en esta pieza para tener un tramo que curvar");
  const v = DZ_EASE_PRESETS[nombre];
  if (!v) return;
  const node = tramo.node, a = tramo.a, b = tramo.b;
  const ea = dzRigEaseDe(node, a); ea.eo = v.eo; ea.hold = !!v.hold;
  const eb = dzRigEaseDe(node, b); eb.ei = v.ei;
  DZ.doc.setRigKeyEase(node.id, a, ea);
  DZ.doc.setRigKeyEase(node.id, b, eb);
  dzRigCurvaRender(); dzRigApplyLive(dzRigCur()); dzMarkDirty();
  const comoSuena = { recta: "velocidad pareja", suave: "arranca y termina despacio",
    lento: "arranca despacio", frena: "llega despacio", hold: "sostiene y salta" };
  dzSetStatus("F" + a + " \u2192 F" + b + " de \u00ab" + node.id + "\u00bb: " + comoSuena[nombre]);
}

/* ══ PERSONAJE DE EJEMPLO ═══════════════════════════════════════════════════
   Un muñeco ya riggeado y animado, para aprender el flujo tocando algo que
   funciona en vez de armarlo a ciegas desde cero. Cinco piezas, tres niveles
   de jerarquía y un saludo de tres claves: alcanza para ver la cadena, los
   pivotes, el sostener del dibujo y la interpolación, todo junto. */
const DZ_EJEMPLO_SVG = [
  '<g id="pie_izq"><path d="M378 552h42q15 0 18 17H374z" fill="#34445f" stroke="#202936" stroke-width="3"/></g>',
  '<g id="pie_der"><path d="M438 552h42q15 0 18 17H434z" fill="#34445f" stroke="#202936" stroke-width="3"/></g>',
  '<g id="pierna_inf_izq"><rect x="383" y="478" width="34" height="82" rx="15" fill="#efb08e" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="pierna_inf_der"><rect x="443" y="478" width="34" height="82" rx="15" fill="#efb08e" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="muslo_izq"><rect x="376" y="405" width="44" height="82" rx="18" fill="#3b5278" stroke="#202936" stroke-width="3"/></g>',
  '<g id="muslo_der"><rect x="440" y="405" width="44" height="82" rx="18" fill="#3b5278" stroke="#202936" stroke-width="3"/></g>',
  '<g id="pelvis"><path d="M370 382h108l-9 43h-90z" fill="#263650" stroke="#202936" stroke-width="3"/></g>',
  '<g id="abdomen"><path d="M379 326h90v64h-90z" fill="#d94b38" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="pecho"><path d="M371 258Q424 236 477 258l-4 76h-98z" fill="#e85d3f" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="cuello"><rect x="406" y="224" width="36" height="42" rx="15" fill="#efb08e" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="cabeza"><circle cx="424" cy="180" r="58" fill="#f2bb98" stroke="#3a3030" stroke-width="3"/>',
  '<path d="M369 177Q365 112 424 112q58 3 56 67-25-36-87-30z" fill="#263650"/>',
  '<circle cx="405" cy="180" r="5" fill="#27313d"/><circle cx="443" cy="180" r="5" fill="#27313d"/>',
  '<path d="M405 207q19 14 38 0" fill="none" stroke="#8c453d" stroke-width="3" stroke-linecap="round"/></g>',
  '<g id="hombro_izq"><path d="M374 258q-29 0-40 25l37 17 27-38z" fill="#d94b38" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="hombro_der"><path d="M474 258q29 0 40 25l-37 17-27-38z" fill="#d94b38" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="brazo_izq"><rect x="296" y="281" width="86" height="38" rx="18" fill="#e85d3f" stroke="#3a3030" stroke-width="3" transform="rotate(-25 374 281)"/></g>',
  '<g id="brazo_der"><rect x="466" y="281" width="86" height="38" rx="18" fill="#e85d3f" stroke="#3a3030" stroke-width="3" transform="rotate(25 474 281)"/></g>',
  '<g id="antebrazo_izq"><rect x="245" y="335" width="82" height="34" rx="16" fill="#efb08e" stroke="#3a3030" stroke-width="3" transform="rotate(-52 315 337)"/></g>',
  '<g id="antebrazo_der"><rect x="521" y="335" width="82" height="34" rx="16" fill="#efb08e" stroke="#3a3030" stroke-width="3" transform="rotate(52 533 337)"/></g>',
  '<g id="mano_izq"><circle cx="259" cy="405" r="21" fill="#f2bb98" stroke="#3a3030" stroke-width="3"/></g>',
  '<g id="mano_der"><circle cx="589" cy="405" r="21" fill="#f2bb98" stroke="#3a3030" stroke-width="3"/></g>'
].join("");

// pieza: [pivote x, pivote y, de quién cuelga]
const DZ_EJEMPLO_RIG = {
  pelvis:            [424, 405, null],
  abdomen:           [424, 390, "pelvis"],
  pecho:             [424, 330, "abdomen"],
  cuello:            [424, 258, "pecho"],
  cabeza:            [424, 230, "cuello"],
  hombro_izq:        [424, 270, "pecho"],
  brazo_izq:         [374, 281, "hombro_izq"],
  antebrazo_izq:     [315, 337, "brazo_izq"],
  mano_izq:          [259, 405, "antebrazo_izq"],
  hombro_der:        [424, 270, "pecho"],
  brazo_der:         [474, 281, "hombro_der"],
  antebrazo_der:     [533, 337, "brazo_der"],
  mano_der:          [589, 405, "antebrazo_der"],
  muslo_izq:         [398, 410, "pelvis"],
  pierna_inf_izq:    [400, 482, "muslo_izq"],
  pie_izq:           [400, 552, "pierna_inf_izq"],
  muslo_der:         [462, 410, "pelvis"],
  pierna_inf_der:    [460, 482, "muslo_der"],
  pie_der:           [460, 552, "pierna_inf_der"]
};

// un saludo: tres claves y LOW rellena el medio
const DZ_EJEMPLO_CLAVES = {
  hombro_der:{ 1: 0, 7: -10, 13: 0 },
  brazo_der: { 1: 0, 7: -68, 13: -12 },
  antebrazo_der:{ 1: 0, 7: -46, 13: 8 },
  mano_der:  { 1: 0, 7: -18, 13: 6 },
  cabeza:    { 1: 0, 7: -7, 13: 2 }
};
const DZ_EJEMPLO_LARGO = 13;

async function dzRigEjemplo() {
  if (DZ.dirty || dzHayDibujoEnLaMesa() || (DZ.doc && DZ.doc.scene.lastFrame() > 1)) {
    const sigo = await dzRigEjemploConfirmar();
    if (!sigo) return;
  }
  // Se puede entrar por Ayuda sin haber abierto nunca el entorno de dibujo:
  // entonces no hay lienzo, ni panel del rig, ni nada donde poner al muneco.
  if ($("#designView").hidden) {
    try {
      const r = await api.new_design();
      if (r && r.path) await openDesign(r.path);
    } catch (_) { /* sin backend seguimos con el lienzo que haya */ }
    if ($("#designView").hidden) return dzSetStatus("Abrí o creá un lienzo primero");
  }
  // El panel del rig vive dentro del dock de animacion: con el dock cerrado se
  // abre el modo rig y no se ve ni un control. Se abre ANTES de armar nada.
  if (!DZ.anim && $("#dzAnimationDock")?.hidden) await dzAnimToggle();
  if (!dzCanvasSet(DZ_EJEMPLO_SVG)) return dzSetStatus("No hay lienzo donde poner el ejemplo");
  dzSyncCanvasDocument(true);
  if (!DZ.doc) await dzDocInit(); else dzDocCommit();
  if (!DZ.doc) return dzSetStatus("No se pudo abrir el personaje de ejemplo");

  for (const [id, [px, py, padre]] of Object.entries(DZ_EJEMPLO_RIG)) {
    DZ.doc.ensureRigBone(id, { name: id, elementId: id });
    DZ.doc.bindRigElement(id, id);
    DZ.doc.setRigPivot(id, { x: px, y: py });
    if (padre) DZ.doc.setRigParent(id, padre);
  }
  DZ.doc.setRigPinned("pelvis", true); dzRigAlambreDerivar(DZ.doc, "Personaje de ejemplo");
  // El ejemplo va SIN topes: es para aprender a animar, y encontrarse con un
  // codo que frena parece una falla del programa antes que una restriccion
  // puesta a proposito. Los topes se explican en el tutorial.

  // el personaje SOSTENIDO a lo largo de la escena: un rig se anima con poses
  const capa = DZ.doc.layer, celda = capa && capa.cellAt(1);
  if (capa && celda != null)
    for (let f = 2; f <= DZ_EJEMPLO_LARGO; f++) DZ.doc.setCell(f, celda, capa.id);

  for (const [id, claves] of Object.entries(DZ_EJEMPLO_CLAVES))
    for (const [frame, r] of Object.entries(claves))
      DZ.doc.setRigKey(id, +frame, { x: 0, y: 0, r, sx: 1, sy: 1 });

  DZ.doc.goTo(1);
  await dzRigOpen();                    // monta el panel y abre el modo, en orden
  dzRigSetMode("fk");
  dzRigSelectNode("brazo_der");
  dzMarkDirty();
  dzSetStatus("Personaje de ejemplo listo · dale a reproducir, o agarrá la manija del brazo y posalo");
}

function dzRigEjemploConfirmar() {
  return new Promise(resolve => {
    openModal(`<h2>Abrir el personaje de ejemplo</h2>
      <p class="sub"><b>Reemplaza el dibujo que hay en la mesa</b> por un muñeco ya riggeado.
      No se superpone: lo que está ahora se va, aunque esté guardado (se recupera reabriendo).</p>
      <div class="m-actions"><button class="ghost" id="dzEjX">Cancelar</button>
      <button class="primary" id="dzEjOk">Abrir el ejemplo</button></div>`);
    $("#dzEjX").onclick = () => { closeModal(); resolve(false); };
    $("#dzEjOk").onclick = () => { closeModal(); resolve(true); };
  });
}

function dzRigTutorial() {
  const paso = (n, t) => `<li><b>${n}</b> ${t}</li>`;
  openModal(`<h2>Cómo se riggea un personaje</h2>
    <div class="sub">El esqueleto de LOW en una pantalla · <b>Ayuda → Cómo se riggea</b> para volver acá</div>
    <div class="rigdoc">

      <p class="rigdoc-nota">El dibujo y el esqueleto son dos capas distintas. Las <b>piezas</b>
      son los objetos visibles; los <b>huesos</b> forman el alambre que los mueve. <b>Repartir</b>
      es el puente entre ambos. Por eso registrar una pieza nunca le agrega un pivote propio:
      el eje de giro pertenece al hueso que la controla.</p>

      <div class="rigdoc-abrir"><button class="primary" id="rigdocEjemplo">Abrir el personaje de ejemplo</button>
      <small>Un muñeco ya riggeado y animado, para seguir estos pasos tocando algo que funciona.</small></div>

      <h3>Tres pasos claros</h3>
      <p>Arriba del panel hay tres botones que ordenan <b>todo</b> el sistema:</p>
      <ul class="rigdoc-simb">
        <li><b>Construir</b> — armás el muñeco: registrás las piezas, movés los pivotes, decís
        de quién cuelga cada una, ponés topes. Acá <b>no se crean claves</b>: nada de lo que
        toques queda grabado en la animación, y la manija de posar ni siquiera aparece.</li>
        <li><b>Probar</b> — movés el esqueleto sin grabar. Sirve para comprobar jerarquía,
        pivotes y reparto; Escape restaura la pose anterior.</li>
        <li><b>Animar</b> — posás. La herramienta de posar queda puesta sola y cada gesto deja
        una clave en el cuadro donde estés parado. Los controles de armado desaparecen, así no
        rompés el rig sin querer.</li>
      </ul>
      <p>Dentro de <b>Animar</b> elegís <b>cómo</b> posar: <b>Directa</b> rota cada pieza por su
      pivote y los hijos siguen; <b>Inversa</b> te deja arrastrar la punta y acomoda la cadena
      sola. El renglón bajo los botones siempre dice qué gesto hace qué.</p>

      <h3>El camino corto: dibujar el alambre</h3>
      <p>Armar el muñeco pieza por pieza —elegirla, ponerle el pivote, decir de quién cuelga,
      vincularla— son cuatro pasos por parte. Con veinte partes, ochenta pasos. Hay un camino
      más corto:</p>
      <ol>
        ${paso("1", "En <b>Construir</b>, tocá <b>Crear hueso</b> y dibujá el monigote de alambre <b>encima</b> del personaje: arrastrá desde cada articulación hasta la siguiente. Empezá por el torso; si arrancás desde la punta del hueso anterior, la cadena se encadena sola.")}
        ${paso("2", "Tocá <b>Repartir el dibujo en el alambre</b>. Cada parte del dibujo se va con el hueso que le pasa más cerca.")}
        ${paso("3", "Pasá a <b>Probar</b> y mové brazos y piernas. No se graba ninguna clave; Escape restaura la pose.")}
        ${paso("4", "Cuando todo responda bien, pasá a <b>Animar</b>. El alambre ya contiene pivotes, jerarquía y qué pieza mueve cada hueso.")}
      </ol>
      <p class="rigdoc-tip">Lo que quede lejos del alambre no se asigna, y la barra de estado te
      dice cuántas quedaron afuera. Si una parte se fue al hueso equivocado, arreglala con
      <b>Mueve el dibujo</b>.</p>

      <h3>A · El personaje ya está dibujado por partes</h3>
      <ol>
        ${paso("1", "<b>Construir → Registrar.</b> Identifica las partes sueltas del dibujo. No crea huesos ni pivotes.")}
        ${paso("2", "Con <b>Alambre</b>, dibujá los huesos encima de esas partes, desde una articulación hasta la siguiente.")}
        ${paso("3", "Si hace falta, elegí un hueso y usá <b>Pivotes</b> para colocar con precisión su articulación. Alt+clic la restablece.")}
        ${paso("4", "Tocá <b>Repartir</b>: LOW vincula cada objeto con el hueso más cercano.")}
        ${paso("5", "Pasá a <b>Probar</b> y comprobá que ninguna pieza se desprenda.")}
        ${paso("6", "Pasá a <b>Animar</b>: recién ahí cada gesto deja una clave.")}
      </ol>

      <h3>B · Querés una cadena articulada</h3>
      <ol>
        ${paso("1", "<b>Construir → Crear hueso</b> y arrastrá desde la articulación hasta la punta.")}
        ${paso("2", "Para seguir la cadena, empezá el próximo arrastre <b>sobre la punta del anterior</b>: se engancha solo.")}
        ${paso("3", "El hueso toma el dibujo que tenga debajo. Si agarró otro, seleccioná la pieza correcta en la mesa y tocá <b>Mueve el dibujo</b>.")}
        ${paso("4", "Pasá a <b>Probar</b>, verificá la cadena y luego entrá en <b>Animar</b> para posar.")}
      </ol>

      <h3>El pivote de un hueso</h3>
      <p>Cada hueso tiene una articulación; las piezas no agregan puntos extra. Para cambiarla,
      elegí <b>Pivotes</b>, seleccioná el hueso y arrastrá su círculo. En <b>Editar</b>, Alt+arrastrar
      hace el mismo ajuste sin mover la geometría del hueso.</p>

      <h3>Posar</h3>
      <p><b>FK:</b> arrastrar el cuerpo del hueso o su punta lo <b>rota</b>; arrastrar la
      articulación lo <b>mueve</b> y los hijos siguen. Con <b>Auto-clave</b> cada gesto queda
      grabado en el cuadro actual; sin auto-clave, <b>Enter</b> graba y <b>Esc</b> descarta.</p>
      <p><b>IK:</b> elegí hombro, codo y extremo —tres nodos seguidos de la misma cadena—, tocá
      <b>Crear IK</b> y arrastrá el rombo. <b>Invertir</b> cambia para qué lado dobla el codo.</p>

      <h3>Animar el rig a lo largo de los cuadros</h3>
      <p>Un personaje riggeado se anima <b>con poses, no redibujándolo</b>: el mismo dibujo se
      sostiene a lo largo de la escena y lo que cambia cuadro a cuadro son las claves del rig.
      Por eso, con el modo rig abierto, <b>agregar un cuadro sostiene al personaje</b> en vez de
      darte una hoja en blanco. Fuera del rig, el botón sigue creando un dibujo nuevo, como
      siempre.</p>
      <p>Poné una pose cada tantos cuadros; LOW rellena el medio solo. Con claves en F1, F5 y F9
      los siete cuadros intermedios salen interpolados: no hay que tocarlos.</p>
      <p class="rigdoc-tip">Si caés en un cuadro donde el personaje no está expuesto, no hay nada
      que posar y la barra de estado te lo dice. Sostené su dibujo con <b>↔</b> en la hoja de
      tiempos y volvés a tener el muñeco.</p>

      <h3>El timing: curvas de interpolación</h3>
      <p>Las claves dicen <b>qué</b> pose y <b>cuándo</b>; la curva dice <b>cómo</b> se va de
      una a la otra. Sin curva, el movimiento sale a velocidad pareja de punta a punta, que es
      justo lo que hace que una animación parezca mecánica.</p>
      <p>La sección <b>Curva</b> del panel muestra el tramo donde estás parado —<i>F1 → F7</i>—
      con la recta de referencia punteada y la línea vertical del cuadro actual. Los cinco
      botones son los timings de siempre: <b>Recta</b>, <b>Suave</b> (arranca y termina
      despacio), <b>Arranca lento</b>, <b>Frena</b> y <b>Escalón</b>, que sostiene la pose
      entera y salta recién en la clave siguiente.</p>
      <p>Para afinarlo a mano, arrastrá las dos manijas. Si llevás una <b>por debajo del
      marco</b>, el valor se pasa para el otro lado antes de arrancar: eso es la
      <b>anticipación</b>, y es la razón por la que las manijas pueden salirse.</p>
      <p class="rigdoc-tip">Cambiar la curva no toca ninguna pose. Podés ajustar el timing todas
      las veces que quieras sin perder lo que clavaste.</p>

      <h3>Varios dibujos en una misma pieza</h3>
      <p>Una mano no rota: se <b>cambia</b> por otra mano. Lo mismo el pie, o la boca en la
      sincronía labial. Por eso una pieza puede tener varios dibujos y el cuadro decide cuál
      se ve.</p>
      <p>Dibujá la otra versión en la mesa, seleccionala, y con la pieza elegida tocá
      <b>Sumar dibujo</b> en la sección <b>Dibujos de la pieza</b>. Después, parado en el cuadro
      donde tiene que cambiar, hacé clic en el dibujo de la lista: vale <b>desde ahí hasta el
      próximo cambio</b>. Un dibujo no se interpola.</p>
      <p><b>Sin cambio acá</b> borra el cambio de este cuadro y deja que siga mandando el
      anterior. <b>Quitar</b> saca el dibujo de la pieza sin borrarlo del dibujo.</p>

      <h3>Doblar una pieza</h3>
      <p>Una pieza rígida sólo <b>rota</b>: sirve para un brazo, no para el pelo, una cola o
      una manga. Con <b>Dar curva</b>, la pieza pasa a doblarse.</p>
      <p>Aparecen tres puntos verdes sobre el dibujo. Arrastralos y la pieza se dobla siguiendo
      esa curva; el doblez queda clavado en el cuadro donde estás, así que se anima como
      cualquier otra cosa. <b>Sin doblez acá</b> borra el de este cuadro; <b>Quitar curva</b>
      devuelve la pieza a rígida y el dibujo a su forma.</p>
      <p class="rigdoc-tip">Para poder doblarse, la pieza pasa de forma a <b>trazo</b> — un
      rectángulo no se dobla. El programa lo hace solo al dar la curva y te lo avisa. El grosor
      del dibujo se mantiene: lo que cambia es por dónde pasa.</p>

      <h3>Qué es cada cosa en la mesa</h3>
      <ul class="rigdoc-simb">
        <li><i class="s-pivot"></i> el pivote: el punto sobre el que gira</li>
        <li><i class="s-root"></i> la raíz del personaje</li>
        <li><i class="s-bone"></i> el cuerpo de un hueso; de la punta sale la cadena</li>
        <li><i class="s-link"></i> el tirador de vínculo: arrastralo al pivote del padre</li>
        <li><i class="s-ik"></i> el objetivo de una cadena IK</li>
      </ul>
      <p class="rigdoc-tip">Con muchas piezas registradas, los pivotes lejanos se atenúan para
      dejar ver el dibujo. Siguen ahí: se agarran igual.</p>

      <h3>Si venís de Harmony o de OpenToonz</h3>
      <p>La jerarquía no se arma en la línea de tiempo: se arma <b>en la mesa</b>, arrastrando el
      cuadrado de una pieza hasta el círculo de la otra. Ese es el paso que no vas a encontrar
      donde lo buscás. El resto se traduce derecho: el <i>peg</i> es el nodo, el <i>center</i> es
      el botón Pivote, la Transform Tool es el modo FK, y los deformadores son Crear hueso.</p>

    </div>
    <div class="m-actions"><button class="primary" id="mCancel">Entendido</button></div>`);
  $("#mCancel").onclick = closeModal;
  const abrir = $("#rigdocEjemplo");
  if (abrir) abrir.onclick = () => { closeModal(); dzRigEjemplo(); };
}

async function dzRigOpen() {
  if (!DZ.anim && !DZ.doc) await dzAnimToggle();
  if (!DZ.anim && !DZ.doc) return;
  if (!DZ.rigMode) { dzRigToggle(); return; }
  $("#dzRigPanel").hidden = false; if (typeof dzRigAlambreDerivar === "function") dzRigAlambreDerivar(DZ.doc);
  $("#dzRigBtn").classList.add("active"); $("#tlRigOpen")?.classList.add("active");
  dzRigApplyLive(dzRigCur()); dzRigPanelSync(); dzRigOverlayRender();
}


/* ══ 🎥 ACTUACIÓN — titiritero digital (Momo/motion-sketch) ═══════════════
   Marcás el lapso, ⏹, y ACTUÁS el movimiento arrastrando la pieza en vivo
   (Shift = rotarla desde su pivote, como el bastón del títere). Las pasadas
   anteriores SE REPRODUCEN mientras grabás la nueva — animación por capas,
   una pieza por toma. Al cortar, la actuación se vuelve claves de rig. */
function dzPerfFps() { return Math.max(1, Math.min(60, +($("#tlFps") && $("#tlFps").value) || 12)); }
function dzPerfDur() { return Math.max(0.5, Math.min(30, +($("#perfDur") && $("#perfDur").value) || 3)); }

function dzPerfRec() {
  if (DZ.perf && DZ.perf.rec) { dzPerfRecEnd(true); return; }   // cortar antes
  if (!DZ.rigMode) return dzSetStatus("🎥 Activá el modo rig () primero");
  if (!DZ.scene) DZ.scene = {};
  let n = 3;
  $("#perfRec").classList.add("rec");
  dzSetStatus("🎥 " + n + "…");
  const cd = setInterval(() => {
    n--;
    if (n > 0) { dzSetStatus("🎥 " + n + "…"); return; }
    clearInterval(cd);
    const dur = dzPerfDur(), fps = dzPerfFps();
    DZ.perf = { rec: { t0: performance.now(), dur, fps, take: {}, active: null } };
    const loop = () => {
      if (!DZ.perf || !DZ.perf.rec) return;
      const t = (performance.now() - DZ.perf.rec.t0) / 1000;
      if (t >= dur) { dzPerfRecEnd(); return; }
      // replay de las pistas ya grabadas (menos la pieza que estás actuando)
      const num = 1 + t * fps;
      const active = DZ.perf.rec.active, live = DZ.perf.rec.livePose;
      dzRigApplyLive(num, active && live ? { [active]: live } : {});
      dzSetStatus("⏹ " + t.toFixed(1) + " / " + dur + "s — ¡actuá! (arrastrá la pieza · Shift rota)");
      DZ.perf.rec.raf = requestAnimationFrame(loop);
    };
    DZ.perf.rec.raf = requestAnimationFrame(loop);
  }, 700);
}
function dzPerfRecEnd(early) {
  const rec = DZ.perf && DZ.perf.rec;
  if (!rec) return;
  cancelAnimationFrame(rec.raf);
  DZ.perf = null;
  $("#perfRec").classList.remove("rec");
  const ids = Object.keys(rec.take).filter(id => rec.take[id].length > 1);
  if (!ids.length) { dzSetStatus("🎥 Toma vacía — no moviste ninguna pieza. ⏹ y arrastrá durante la cuenta."); return; }
  // remuestrear la actuación a una clave por cuadro del lapso
  const N = Math.max(2, Math.round(rec.dur * rec.fps));
  for (const id of ids) {
    const ss = rec.take[id];
    const keys = { ...(dzRigTracks()[id] || {}) };
    for (let f = 1; f <= N + 1; f++) {
      const tf = (f - 1) / rec.fps;
      let a = ss[0], b = ss[ss.length - 1];
      if (tf <= a.t) b = a;
      else if (tf >= b.t) a = b;
      else for (let i = 0; i < ss.length - 1; i++)
        if (ss[i].t <= tf && ss[i + 1].t >= tf) { a = ss[i]; b = ss[i + 1]; break; }
      const u = (b.t === a.t) ? 0 : (tf - a.t) / (b.t - a.t);
      keys[f] = {
        x: Math.round(dzLerp(a.x, b.x, u) * 10) / 10,
        y: Math.round(dzLerp(a.y, b.y, u) * 10) / 10,
        r: Math.round(dzLerp(a.r || 0, b.r || 0, u) * 10) / 10,
        sx: dzLerp(a.sx == null ? 1 : a.sx, b.sx == null ? 1 : b.sx, u),
        sy: dzLerp(a.sy == null ? 1 : a.sy, b.sy == null ? 1 : b.sy, u),
      };
    }
    if (DZ.doc) DZ.doc.replaceRigKeys(id, keys, "Grabar actuación");
    else { DZ.scene.rig = DZ.scene.rig || {}; DZ.scene.rig[id] = keys; }
  }
  if (!DZ.doc) dzSceneSave(); dzTimelineBadges(); dzRigPanelSync();
  dzSetStatus("🎥 Toma lista: " + ids.join(", ") + " (" + N + " claves). Otra ⏹ suma la próxima pieza.  para verla.");
  dzPerfPlay();
}
/* reproducir la actuación completa (reloj virtual, claves fraccionales) */
function dzPerfPlay() {
  if (DZ.perfPlaying) { DZ.perfPlaying = false; return; }
  const dur = dzPerfDur(), fps = dzPerfFps();
  DZ.perfPlaying = true;
  const t0 = performance.now();
  const loop = () => {
    if (!DZ.perfPlaying) { dzRigApplyLive(dzRigCur()); return; }
    const t = (performance.now() - t0) / 1000;
    if (t >= dur) { DZ.perfPlaying = false; dzRigApplyLive(dzRigCur()); dzSetStatus("🎥 fin de la actuación"); return; }
    dzRigApplyLive(1 + t * fps);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
/*  suavizado: promedio móvil sobre las claves — saca el temblor del pulso */
function dzPerfSmooth() {
  const rig = dzRigTracks();
  let done = 0;
  for (const id of Object.keys(rig)) {
    const ks = Object.keys(rig[id]).map(Number).sort((a, b) => a - b);
    if (ks.length < 3) continue;
    const orig = ks.map(k => ({ ...rig[id][k] }));
    for (let i = 1; i < ks.length - 1; i++) {
      const p = orig[i - 1], c = orig[i], nx = orig[i + 1];
      rig[id][ks[i]] = {
        x: Math.round((p.x + 2 * c.x + nx.x) / 4 * 10) / 10,
        y: Math.round((p.y + 2 * c.y + nx.y) / 4 * 10) / 10,
        r: Math.round(((p.r || 0) + 2 * (c.r || 0) + (nx.r || 0)) / 4 * 10) / 10,
        sx: c.sx == null ? (c.s == null ? 1 : c.s) : c.sx,
        sy: c.sy == null ? (c.s == null ? 1 : c.s) : c.sy,
      };
    }
    if (DZ.doc) DZ.doc.replaceRigKeys(id, rig[id], "Suavizar actuación");
    done++;
  }
  if (!DZ.doc) dzSceneSave(); dzRigApplyLive(dzRigCur()); dzRigPanelSync();
  dzSetStatus(done ? " actuación suavizada (" + done + " pista(s)) — repetí para más suave" : " no hay pistas para suavizar");
}
/*  generar los cuadros del lapso (mismo dibujo; el rig se aplica al exportar) */
async function dzPerfBake() {
  if (!DZ.anim) return dzSetStatus(" Abrí la animación (🎞) primero");
  const N = Math.max(2, Math.round(dzPerfDur() * dzPerfFps()));
  if (N > 200) return dzSetStatus(" Demasiados cuadros (" + N + ") — bajá duración o fps");
  await dzPersist();
  let cur = DZ.anim.frames.length;
  dzSetStatus(" generando cuadros… (" + cur + "/" + N + ")");
  let last = DZ.anim.frames[DZ.anim.frames.length - 1];
  while (cur < N) {
    const r = await api.dup_frame(last);
    if (r && r.error) return dzSetStatus(" " + r.error);
    last = r.path; cur++;
    if (cur % 6 === 0) dzSetStatus(" generando cuadros… (" + cur + "/" + N + ")");
  }
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await dzTimelineRefresh();
  dzSetStatus(" " + cur + " cuadros listos — la actuación sale en el export (GIF/video)");
}

/* ══ animación de ELEMENTOS (pegs de Toon Boom, versión LOW) ═══════════
   🏃 interpolación de movimiento: fijás inicio, movés el elemento al final
   y LOW genera los cuadros del recorrido con la curva elegida.
   ⏹ grabación en vivo: arrastrás el elemento y el recorrido REAL de tu mano
   (con sus tiempos) se convierte en cuadros — actuación en vivo. ══ */
function dzElPath(el) {
  // ruta de índices desde el svg raíz (las capas de UI van siempre al final,
  // así que los índices del contenido se mantienen entre vivo y serializado)
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const path = [];
  let n = el;
  while (n && n !== svg) {
    const p = n.parentNode;
    if (!p) return null;
    path.unshift([...p.children].indexOf(n));
    n = p;
  }
  return n === svg ? path : null;
}
function dzElAt(root, path) {
  let n = root;
  for (const i of path) { n = n.children[i]; if (!n) return null; }
  return n;
}
function dzPosDelta(a, b) {
  if (a.mode === "c") return [b.cx - a.cx, b.cy - a.cy];
  if (a.mode === "xy") return [b.x - a.x, b.y - a.y];
  return [b.tx - a.tx, b.ty - a.ty];
}
async function dzTweenFrames(baseSvgText, elPath, offsets) {
  // genera un cuadro por offset [dx,dy,rot] (en orden) insertándolos tras el actual
  // pivote de rotación: bbox del elemento VIVO — los clones no están montados y
  // getBBox() en un árbol desmontado devuelve 0×0 (giraría sobre el origen)
  let cx = 540, cy = 540; const alDoc = !DZ.path && !!DZ.doc, nuevos = [];   // en un .low los cuadros van al documento, no a archivos _fNNN.svg
  const live = dzElAt($("#dzCanvas").querySelector(":scope > svg"), elPath);
  if (live && live.getBBox) {
    try { const b = live.getBBox(); cx = b.x + b.width / 2; cy = b.y + b.height / 2; } catch (e) { /* sin render */ }
  }
  for (let k = offsets.length - 1; k >= 0; k--) {
    const tmp = document.createElement("div"); tmp.innerHTML = baseSvgText;
    const svg2 = tmp.querySelector("svg");
    const el2 = dzElAt(svg2, elPath);
    if (!el2) return "no encontré el elemento en el cuadro clonado";
    dzWritePos(el2, dzReadPos(el2), offsets[k][0], offsets[k][1]);
    if (offsets[k][2]) {
      const tr = el2.getAttribute("transform") || "";
      el2.setAttribute("transform", (tr ? tr + " " : "")
        + `rotate(${offsets[k][2]} ${cx + offsets[k][0]} ${cy + offsets[k][1]})`);
    }
    if (alDoc) { nuevos.unshift(svg2.innerHTML); continue; }   const r = await api.insert_frame(DZ.path, svg2.outerHTML);
    if (r && r.error) return r.error;
  }
  if (alDoc) { const t = dzCuadrosAlDocumento(DZ.doc, nuevos, DZ.doc.frame || 1); if (t && t.error) return t.error; dzDocGoTo(t.desde); }   return null;
}
async function dzMoveTween() {
  if (!DZ.anim) return sysMsg("🏃 Abrí la animación (🎞) primero");
  if (!DZ.moveT) {
    if (!DZ.sel) return dzSetStatus("🏃 Seleccioná el elemento a animar y tocá 🏃 para fijar el INICIO");
    const path = dzElPath(DZ.sel);
    if (!path) return dzSetStatus("🏃 Ese elemento no se puede animar (no cuelga del lienzo)");
    DZ.moveT = { el: DZ.sel, path, start: dzReadPos(DZ.sel) };
    $("#tlMove").classList.add("rec");
    dzSetStatus("🏃 INICIO fijado. Arrastrá el elemento a su posición FINAL y tocá 🏃 otra vez.");
    return;
  }
  const t = DZ.moveT; DZ.moveT = null; $("#tlMove").classList.remove("rec");
  if (!t.el.isConnected) return dzSetStatus("🏃 El elemento ya no está — cancelo");
  const [dx, dy] = dzPosDelta(t.start, dzReadPos(t.el));
  if (Math.abs(dx) + Math.abs(dy) < 2)
    return dzSetStatus("🏃 No lo moviste de lugar — cancelo. Fijá inicio, arrastrá y volvé a tocar 🏃.");
  openModal(`<h2>🏃 Interpolación de movimiento</h2>
    <div class="sub">Recorrido: ${Math.round(Math.hypot(dx, dy))} unidades. El elemento vuelve al inicio
    y se generan los cuadros del viaje (el último queda en la posición final).</div>
    <div class="dz-style-row">
      <span class="dz-hint">Cuadros</span>
      <input type="number" id="mtN" class="dz-win" value="6" min="2" max="24">
      <span class="dz-hint">Curva</span>
      <select id="mtEase" class="langsel">
        <option value="linear">Lineal</option>
        <option value="in">Ease in (acelera)</option>
        <option value="out">Ease out (frena)</option>
        <option value="inout" selected>Ease in-out (natural)</option>
      </select>
    </div>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="mtGo">🏃 Generar</button>
    </div>`);
  $("#mCancel").onclick = () => { closeModal(); };
  $("#mtGo").onclick = async () => {
    const n = Math.max(2, Math.min(24, +$("#mtN").value || 6));
    const fn = DZ_EASES[$("#mtEase").value] || DZ_EASES.inout;
    closeModal();
    // el elemento vuelve al INICIO en este cuadro; los nuevos hacen el viaje
    dzWritePos(t.el, dzReadPos(t.el), -dx, -dy);
    dzMarkDirty();
    await dzPersist();
    const base = dzSerialize($("#dzCanvas").querySelector(":scope > svg"));
    dzSetStatus("🏃 Generando " + n + " cuadros del recorrido…");
    const offs = [];
    for (let k = 1; k <= n; k++) offs.push([dx * fn(k / n), dy * fn(k / n)]);
    const err = await dzTweenFrames(base, t.path, offs);
    if (err) return dzSetStatus(" " + err);
    DZ.anim.cache = {};
    try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
    await dzTimelineRefresh(); dzOnionUpdate(); dzTimelineBadges();
    dzSetStatus("🏃 " + n + " cuadros generados — reproducí () para ver el movimiento.");
  };
}
/* ⏹ grabación en vivo: armás la grabación, arrastrás el elemento y el
   recorrido con SUS TIEMPOS reales se muestrea al fps de la timeline */
function dzRecToggle() {
  if (!DZ.anim) return sysMsg("⏹ Abrí la animación (🎞) primero");
  if (DZ.rec) { DZ.rec = null; $("#tlRec").classList.remove("rec"); dzSetStatus("⏹ Grabación desarmada"); return; }
  DZ.rec = { armed: true };
  $("#tlRec").classList.add("rec");
  dzSetStatus("⏹ Grabación ARMADA: agarrá un elemento y arrastralo actuando el movimiento — al soltar, cada instante se vuelve un cuadro.");
}
async function dzRecFinish(rec) {
  $("#tlRec").classList.remove("rec");
  DZ.rec = null;
  const fps = Math.max(1, Math.min(60, +$("#tlFps").value || 12));
  const dur = rec.samples.length ? rec.samples[rec.samples.length - 1][2] : 0;
  let nFrames = Math.min(48, Math.max(2, Math.round(dur / 1000 * fps)));
  if (rec.samples.length < 2 || dur < 120)
    return dzSetStatus("⏹ Muy corto — arrastrá el recorrido completo con el mouse apretado.");
  // remuestrear el gesto al fps de la timeline (interpolando entre muestras)
  const at = (ms) => {
    let i = rec.samples.findIndex(s => s[2] >= ms);
    if (i < 0) return rec.samples[rec.samples.length - 1];
    if (i === 0) return rec.samples[0];
    const a = rec.samples[i - 1], b = rec.samples[i];
    const f = (ms - a[2]) / Math.max(1, b[2] - a[2]);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const offs = [];
  for (let k = 1; k <= nFrames; k++) offs.push(at(dur * k / nFrames));
  // el elemento vuelve al inicio del gesto en el cuadro actual
  dzWritePos(rec.el, dzReadPos(rec.el), -rec.last[0], -rec.last[1]);
  dzMarkDirty();
  await dzPersist();
  const base = dzSerialize($("#dzCanvas").querySelector(":scope > svg"));
  dzSetStatus("⏹ Convirtiendo tu actuación en " + nFrames + " cuadros…");
  const err = await dzTweenFrames(base, rec.path, offs);
  if (err) return dzSetStatus(" " + err);
  DZ.anim.cache = {};
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await dzTimelineRefresh(); dzOnionUpdate(); dzTimelineBadges();
  dzSetStatus("⏹ Actuación grabada: " + nFrames + " cuadros a " + fps + " fps — dale .");
}

/* ══ 🎞 TITIRITERO (marioneta digital) ═══════════════════════════════════
   Grabación en vivo de performance: apretás REC, manipulás el muñeco en
   tiempo real (arrastrás/rotás cabeza, brazos, piezas del rig) y LOW captura
   la escena entera cada 1/fps segundos como cuadros — hasta que parás. Es el
   titiritero de varilla (rod puppet) digital: la actuación ES la animación.
   A diferencia de la grabación en vivo (un elemento), acá capturás TODO lo
   que muevas, con las manos, en wall-clock real. ══ */
function dzPuppetToggle() {
  if (DZ.pup && DZ.pup.recording) { dzPuppetStop(); return; }
  if (DZ.pup && DZ.pup.counting) { return; }        // en cuenta regresiva
  if (!DZ.anim) { dzAnimToggle(); }                 // el titiritero vive en la timeline
  if (!DZ.path && !DZ.doc) return sysMsg("🎞 Abrí o creá un documento primero.");
  // cuenta regresiva 3·2·1 para que agarres el muñeco listo
  DZ.pup = { counting: true, recording: false, snaps: [] };
  dzPuppetHUD("preparate…");
  let n = 3;
  const tick = () => {
    if (!DZ.pup || !DZ.pup.counting) return;        // cancelado
    if (n > 0) { dzPuppetHUD(" " + n); n--; setTimeout(tick, 700); }
    else dzPuppetStart();
  };
  tick();
}
function dzPuppetStart() {
  const fps = Math.max(1, Math.min(60, +$("#tlFps").value || 12));
  DZ.pup = { recording: true, counting: false, snaps: [], t0: performance.now(), fps };
  $("#tlPuppet").classList.add("rec");
  dzPuppetHUD(" REC  0.0s · 0 cuadros");
  // capturá la escena entera cada 1/fps mientras manipulás el muñeco
  DZ.pup.timer = setInterval(() => {
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    if (!svg) return;
    DZ.pup.snaps.push(!DZ.path && DZ.doc ? dzCanvasInner() : dzSerialize(svg));   // en un .low la toma va ADENTRO del documento: se guarda el contenido de la mesa, no el <svg> entero
    const secs = ((performance.now() - DZ.pup.t0) / 1000).toFixed(1);
    dzPuppetHUD(" REC  " + secs + "s · " + DZ.pup.snaps.length + " cuadros");
  }, 1000 / fps);
  dzSetStatus("🎞 GRABANDO — movés el muñeco con la mano; cada instante es un cuadro. Apretá 🎞 (o Esc) para cortar.");
}
async function dzPuppetStop() {
  const pup = DZ.pup; DZ.pup = null;
  if (pup && pup.timer) clearInterval(pup.timer);
  $("#tlPuppet").classList.remove("rec");
  dzPuppetHUD(null);
  if (!pup || !pup.recording) { dzSetStatus("🎞 Titiritero cancelado"); return; }
  const snaps = pup.snaps || [];
  if (snaps.length < 2) return dzSetStatus("🎞 Toma muy corta — apretá REC y movés el muñeco un rato antes de cortar.");
  dzSetStatus("🎞 Guardando la actuación (" + snaps.length + " cuadros)…");
  const r = (!DZ.path && DZ.doc) ? dzTomaAlDocumento(DZ.doc, snaps) : await api.record_take(DZ.path, snaps);
  if (r && r.error) return dzSetStatus(" " + r.error);
  DZ.anim.cache = {};
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await dzTimelineRefresh(); dzTimelineBadges();
  if (r && r.path) { await dzGoFrame(DZ.anim.frames.indexOf(r.path)); } else if (r && r.desde && typeof dzDocGoTo === "function") dzDocGoTo(r.desde);
  dzSetStatus("🎞 ¡Actuación grabada! " + (r.n || snaps.length) + " cuadros a " + pup.fps + " fps — dale  para verla.");
}
/* HUD grande de grabación sobre el lienzo (texto o null para ocultar) */
function dzPuppetHUD(txt) {
  let h = $("#dzPupHud");
  if (txt == null) { if (h) h.remove(); return; }
  if (!h) {
    h = document.createElement("div");
    h.id = "dzPupHud"; h.className = "dz-pup-hud";
    $("#dzCanvas").appendChild(h);
  }
  h.textContent = txt;
}

/* ══ 🚶 CICLO DE CAMINATA automático (estilo Toon Boom / OpenToonz) ══ */
function dzWalkCycleModal() {
  if (!DZ.anim) { dzAnimToggle(); if (!DZ.anim) return; }
  if (!DZ.sel) return sysMsg("🚶 Seleccioná un elemento para animar el ciclo de caminata");
  openModal(`<h2>🚶 Ciclo de caminata</h2>
    <div class="sub">Genera un ciclo automático de pasos: el elemento sube/baja y se inclina
    rítmicamente. Ideal para personajes enteros, siluetas o props que "caminan".</div>
    <div class="dz-style-row">
      <span class="dz-hint">Pasos (ciclo completo)</span>
      <input type="number" id="wcSteps" class="dz-win" value="2" min="1" max="8">
      <span class="dz-hint">Cuadros por paso</span>
      <input type="number" id="wcFrames" class="dz-win" value="8" min="4" max="24">
    </div>
    <div class="dz-style-row">
      <span class="dz-hint">Altura del paso (px)</span>
      <input type="number" id="wcBounce" class="dz-win" value="20" min="1" max="120">
      <span class="dz-hint">Balanceo (°)</span>
      <input type="number" id="wcSway" class="dz-win" value="8" min="0" max="45">
    </div>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="wcGo">🚶 Generar ciclo</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  $("#wcGo").onclick = () => {
    const steps = Math.max(1, Math.min(8, +$("#wcSteps").value || 2));
    const fpb = Math.max(4, Math.min(24, +$("#wcFrames").value || 8));
    const bounce = Math.max(1, Math.min(120, +$("#wcBounce").value || 20));
    const sway = Math.max(0, Math.min(45, +$("#wcSway").value || 8));
    closeModal();
    dzWalkCycleRun(steps, fpb, bounce, sway);
  };
}
async function dzWalkCycleRun(steps, fpb, bounce, sway) {
  const el = DZ.sel;
  if (!el) return;
  const elPath = dzElPath(el);
  if (!elPath) return dzSetStatus("🚶 Ese elemento no se puede animar (no cuelga del lienzo)");
  const totalFrames = steps * fpb;
  dzSnapshot();
  await dzPersist();
  const base = dzSerialize($("#dzCanvas").querySelector(":scope > svg"));
  dzSetStatus("🚶 Generando " + totalFrames + " cuadros de caminata…");
  const offs = [];
  for (let k = 1; k <= totalFrames; k++) {
    const phase = (k - 1) / fpb;                // 0..steps
    // parábola para el bounce: sube en el medio del paso
    const b = Math.sin(phase * Math.PI) * bounce;
    // sway sinusoidal
    const s = Math.sin(phase * Math.PI * 2) * sway;
    offs.push([0, -Math.abs(b), s]);            // [dx, dy, rotation]
  }
  const err = await dzTweenFrames(base, elPath, offs);
  if (err) return dzSetStatus(" " + err);
  DZ.anim.cache = {};
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  await dzTimelineRefresh(); dzOnionUpdate(); dzTimelineBadges();
  dzSetStatus("🚶 ¡Ciclo de caminata listo! " + totalFrames + " cuadros — dale  para verlo. Probá distintos bounce/sway para ajustar.");
}

/* ══ 🎭 DIORAMA: compositing sin nodos ═══════════════════════════════════
   En vez del mapa de nodos de Harmony/OpenToonz, una vista LATERAL física
   del multiplano (el diorama de la cámara multiplano de Disney): la cámara
   a la izquierda, el plano de acción en el medio, el fondo a la derecha, y
   cada capa es una tarjeta que arrastrás en profundidad. El grafo ya existe
   en la escena (orden = compositing, grupos = jerarquía, data-z = plano) —
   esto solo lo hace tangible. ══ */
const DZ_Z_MIN = -60, DZ_Z_MAX = 400;
function dzZToX(z, W) {
  // -60 (pegado a cámara) … 0 (acción) … 400 (fondo)  posición en el riel
  return ((z - DZ_Z_MIN) / (DZ_Z_MAX - DZ_Z_MIN)) * (W - 46) + 6;
}
function dzXToZ(x, W) {
  const z = ((x - 6) / (W - 46)) * (DZ_Z_MAX - DZ_Z_MIN) + DZ_Z_MIN;
  return Math.max(DZ_Z_MIN, Math.min(DZ_Z_MAX, Math.round(z)));
}
function dzZPanelToggle() {
  const p = $("#dzZPanel");
  p.hidden = !p.hidden;
  $("#dzZBtn").classList.toggle("active", !p.hidden);
  if (!p.hidden) dzZPanelRender();
}
function dzZPanelRender() {
  const rail = $("#dzZRail");
  if (!rail || $("#dzZPanel").hidden) return;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) { rail.innerHTML = ""; return; }
  const W = rail.clientWidth || 260;
  rail.innerHTML = `<div class="dz-zaction" style="left:${dzZToX(0, W)}px" title="Plano de acción (z = 0)"></div>`;
  const kids = dzCompositionElements(svg);
  const exact = $("#dzZExact"), selectedIndex = kids.indexOf(DZ.sel);
  if (exact) { exact.disabled = selectedIndex < 0; exact.value = selectedIndex < 0 ? 0 : (parseFloat(DZ.sel.getAttribute("data-z")) || 0); }
  kids.forEach((el, i) => {
    const z = Math.max(DZ_Z_MIN, Math.min(DZ_Z_MAX, parseFloat(el.getAttribute("data-z")) || 0));
    const card = document.createElement("div");
    card.className = "dz-zcard" + (el === DZ.sel ? " sel" : "");
    card.style.left = dzZToX(z, W) + "px";
    card.style.top = (6 + (i % 5) * 13) + "px";        // escalonadas para leerlas
    const name = el.id || dzLayerLabel(el);
    card.innerHTML = `<span class="dz-zname">${name.slice(0, 12)}</span><span class="dz-zz">${z}</span>`;
    card.title = name + " · z=" + z + " — arrastrá: izquierda acerca, derecha aleja";
    card.onmousedown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const ref = dzCompositionPlaneRef(el, i);
      const canonical = DZ.doc?.scene?.compositionTransformAt?.(ref.id, DZ.doc.frame);
      const before = canonical || { z };
      if (!DZ.doc) dzSnapshot();
      const railR = rail.getBoundingClientRect();
      const move = (ev) => {
        const zNew = dzXToZ(ev.clientX - railR.left, W);
        if (zNew === 0) el.removeAttribute("data-z");   // 0 = plano de acción, sin attr
        else el.setAttribute("data-z", zNew);
        card.style.left = dzZToX(zNew, W) + "px";
        card.querySelector(".dz-zz").textContent = zNew;
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        const afterZ = parseFloat(el.getAttribute("data-z")) || 0;
        if (DZ.doc?.setCompositionTransform) {
          DZ.doc.setCompositionTransform(ref.id, { ...before, z: afterZ }, {
            frame: DZ.compositionAutoKey ? DZ.doc.frame : null,
            source: ref.source,
            label: "Mover plano en profundidad"
          });
          DZ.dirty = true;
        } else dzMarkDirty();
        if (DZ.sel === el) dzBuildInspector(el);        // sincronizar el campo Z
        dzSetStatus("🎭 «" + name.slice(0, 20) + "» a z=" + (el.getAttribute("data-z") || 0) +
                    " — mové la cámara (🎬) y mirá el parallax en ");
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
    card.onclick = (e) => { e.stopPropagation(); if (!el.hasAttribute("data-locked")) dzSelect(el); };
    rail.appendChild(card);
  });
}

const DZ_TOOL_NAMES = { select: "seleccionar", hand: "mano", nodes: "nodos",
  pencil: "lápiz", brush: "pincel", pen: "pluma", eraser: "borrador",
  dropper: "cuentagotas", bucket: "balde", pivot: "pivote de rig", ruler: "regla",
  inflator: "inflador", handler: "manejador", iron: "plancha", pliers: "pinza", magnet: "imán",
  camera: "cámara 2D", shape: "forma" };
function dzMenuAction(act) {
  DZ.ultimoComando = act || "";   // CRASH-01: qué se estaba haciendo al fallar
  // menú Ventana: comparte implementación con dzRunAction (atajos de teclado)
  if (act && (act.startsWith("win-") || act.startsWith("ws-"))) return dzRunAction(act);
  if (act && act.startsWith("panel-")) return dzWindowPanelToggle(act.slice(6));
  if (act === "informefallo") return dzCrashReportManual();
  const A = {
    storyboard: dzStoryboardToggle,
    colab: dzColabToggle,
    nuevo: dzDocumentNew,
    "escena-abrir": dzSceneOpen,
    documento: dzDocModal, guardar: () => DZ.doc ? dzSceneSave(false) : dzSave(),
    "escena-guardar-como": () => DZ.doc ? dzSceneSave(true) : dzSave(),
    "cerrar-documento": dzDocumentClose,
    "borrar-documento": dzDocumentTrash,
    importar: dzImportImage,
    exportar: dzExportModal, exportanim: dzExportModal,
    premiere: dzExportPremiereDirecto,
    navegador: () => api.preview_html(DZ.path || null, $("#dzCanvas").innerHTML),   // idem: NUNCA la ruta del documento
    cerrar: () => closeDesign(),
    deshacer: dzUndo, rehacer: dzRedo, duplicar: dzDuplicate, borrar: dzDeleteSelected,
    agrupar: () => dzGroupSel(false), desagrupar: () => dzGroupSel(true),
    preferencias: dzPrefsModal, atajos: dzPrefsModal, "config-reset": dzConfigResetModal, "safe-mode": dzEnterSafeMode, pendebug: dzPenDebugToggle,
    zoomin: () => dzZoom(0.15), zoomout: () => dzZoom(-0.15),
    zoom100: () => dzRunAction("zoom100"), fit: dzFitView,
    rotl: () => dzRotView(-15), rotr: () => dzRotView(15),
    enderezar: () => { DZ.viewRot = 0; dzApplyZoom(); },
    diorama: dzZPanelToggle, profundidad: dzZPanelToggle,
    cebolla: dzOnionPanelToggle, deformar: () => window.dzWarpAlternar?.(), "camara-guia": dzCamGuiaAlternar,
    xsheet: dzXsToggle, codigo: dzToggleCode,
    alfrente: () => { if (!DZ.sel) return dzSetStatus("Seleccioná un elemento primero");
      dzSnapshot(); DZ.sel.parentNode.appendChild(DZ.sel); dzMarkDirty(); dzBuildLayers(); },
    atras: () => { if (!DZ.sel) return dzSetStatus("Seleccioná un elemento primero");
      dzSnapshot(); DZ.sel.parentNode.insertBefore(DZ.sel, DZ.sel.parentNode.firstChild); dzMarkDirty(); dzBuildLayers(); },
    bloquear: () => { if (!DZ.sel) return dzSetStatus("Seleccioná un elemento primero");
      dzSnapshot();
      if (DZ.sel.hasAttribute("data-locked")) DZ.sel.removeAttribute("data-locked");
      else { DZ.sel.setAttribute("data-locked", "1"); const el = DZ.sel; dzDeselect(); }
      dzMarkDirty(); dzBuildLayers(); },
    renombrar: async () => { if (!DZ.sel) return dzSetStatus("Seleccioná un elemento primero");
      const name = await dzPromptModal("Nombre de la capa", "nombre", DZ.sel.id || "");
      if (name === null) return;
      dzSnapshot();
      const clean = name.trim().replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]/g, "_");
      if (clean) DZ.sel.id = clean; else DZ.sel.removeAttribute("id");
      dzMarkDirty(); dzBuildLayers(); },
    "art-line": () => dzArtMoveSelection("line"),
    "art-colour": () => dzArtMoveSelection("colour"),
    pivote: () => dzSetTool("pivot"),
    timeline: dzAnimToggle, cuadro: dzFrameAdd, insertar: () => dzFrameInsert(false),
    clave: dzKeyToggle, intercalar: dzTweenModal, interpolar: dzMoveTween,
    grabar: dzRecToggle, claveia: dzAIKeyModal, esqueleto: dzRigOpen,
    arcos: dzArcoToggle,
    "mocap-video": dzMocapOpen,
    camara: dzCamToggle, clavecam: dzCamKeyToggle,
    tutorialrig: dzRigTutorial,
    ejemplorig: dzRigEjemplo,
    acerca: () => {
      openModal(`<h2>LOW Estudio</h2>
        <div class="sub">Editor de vectores y animación 2D con IA integrada, dentro de LOW v${S.version || ""}.
        Dibujo con presión, X-sheet, papel cebolla, cámara multiplano, rigging con pivotes,
        intercalado automático y fotogramas clave generados por IA.<br><br>
        Hecho por Mauro Gatti con LOW — código abierto.</div>
        <div class="m-actions"><button class="primary" id="mCancel">Cerrar</button></div>`);
      $("#mCancel").onclick = closeModal;
    },
  };
  if (A[act]) A[act]();
}

/** Ventana es el lugar único para recuperar un panel cerrado. Cerrar sólo
 * cambia layout: nunca borra dibujos, timing ni estado de la escena. */
function dzWindowPanelVisible(id) {
  const meta = LOW.workspace?.PANEL_CATALOG?.[id], panel = LOW.workspace?.panels?.panels?.get(id);
  if (!meta) return false;
  if (panel?.detached || dzIsPanelDetached(id)) return true;
  const node = document.querySelector(meta.element);
  return !!node && !node.hidden;
}
async function dzWindowPanelSet(id, show) {
  const meta = LOW.workspace?.PANEL_CATALOG?.[id];
  if (!meta || meta.closable === false) return false;
  const node = document.querySelector(meta.element);
  if (!node) return false;
  if (show && meta.owner) {
    const owner = LOW.workspace.PANEL_CATALOG[meta.owner];
    const ownerNode = owner && document.querySelector(owner.element);
    if (ownerNode) ownerNode.hidden = false;
    LOW.workspace.panels?.show?.(meta.owner);
  }
  if (id === "timeline") {
    // La timeline son DOS superficies: el transporte y la grilla de capas.
    // Cerrar sólo la barra dejaba la grilla ocupando la mesa: el panel decía
    // estar cerrado y seguía en pantalla.
    if (show) {
      if (!DZ.anim) await dzAnimToggle();
      dzAnimSetView("timeline");
      node.hidden = false;
      await dzTlMount();
    } else {
      node.hidden = true;
      const grid = $("#dzTlGrid"); if (grid) grid.hidden = true;
    }
  } else if (id === "xsheet") {
    if (show && !DZ.anim) await dzAnimToggle();
    dzXsSetVisible(show);
  } else if (id === "levelstrip") {
    if (show && !DZ.anim) await dzAnimToggle();
    if (show) dzLsMount(); else node.hidden = true;
  } else if (id === "onion") {
    if (show && !DZ.anim) await dzAnimToggle();
    dzOnionPanelSet(show);
  } else if (id === "rig") {
    if (show) await dzRigOpen(); else node.hidden = true;
  } else if (id === "mocap") {
    if (show) await dzMocapOpen(); else node.hidden = true;
  } else if (id === "storyboard") {
    if (show) await dzSbMount(); else node.hidden = true;
  } else if (id === "colab") {
    if (show) dzColabInit();
    node.hidden = !show;
    DZ.panelDock?.update?.();
  } else if (id === "multiplane") {
    // La mesa multiplano NO es un panel que se muestra: es una superficie que
    // se monta sobre el lienzo. Sacarle `hidden` sin montarla dejaba una capa
    // vacía a pantalla completa tapando todo el editor.
    dzCompositionViewShow(show);
  } else if (id === "fn") {
    dzFnSetVisible(show);
  } else if (id === "camera") {
    if (show !== !node.hidden) dzCamToggle();
  } else if (id === "code") {
    if (show !== !node.hidden) dzToggleCode();
  } else node.hidden = !show;
  LOW.workspace.panels?.update?.(id, { visible: !!show, detached: false });
  dzWindowMenuRender();
  return true;
}
function dzWindowPanelToggle(id) { return dzWindowPanelSet(id, !dzWindowPanelVisible(id)); }
function dzWindowMenuRender() {
  const host = document.querySelector("#dzPanelMenu");
  if (!host || !LOW.workspace?.PANEL_CATALOG) return;
  host.innerHTML = "";
  Object.entries(LOW.workspace.PANEL_CATALOG).forEach(([id, meta]) => {
    if (meta.closable === false || id === "canvas") return;
    const button = document.createElement("button"), panel = LOW.workspace.panels?.panels?.get(id);
    button.type = "button"; button.dataset.panel = id; button.textContent = meta.label || id;
    button.classList.toggle("checked", dzWindowPanelVisible(id));
    button.classList.toggle("detached", !!panel?.detached || dzIsPanelDetached(id));
    button.setAttribute("role", "menuitemcheckbox");
    button.setAttribute("aria-checked", dzWindowPanelVisible(id) ? "true" : "false");
    button.onmousedown = e => {
      e.preventDefault(); e.stopPropagation();
      button.closest(".dz-menu")?.classList.remove("open");
      dzWindowPanelToggle(id);
    };
    host.appendChild(button);
  });
}
function dzMenubarWire() {
  const menus = document.querySelectorAll("#dzMenubar .dz-menu");
  const closeAll = () => menus.forEach(m => m.classList.remove("open"));
  // La lista de paneles se dibuja al ABRIR el menú, no al arrancar: un panel se
  // enciende también desde su botón, desde un workspace o desde otra pantalla, y
  // una tilde que miente es peor que no tenerla.
  const abrir = (m) => { m.classList.add("open"); if (m.dataset.menu === "ventana") dzWindowMenuRender(); };
  menus.forEach(m => {
    m.addEventListener("mousedown", (e) => {
      if (e.target.closest(".dz-dd")) return;
      e.preventDefault();
      const was = m.classList.contains("open");
      closeAll();
      if (!was) abrir(m);
    });
    m.addEventListener("mouseenter", () => {
      // si hay un menú abierto, pasar el mouse cambia de menú (comportamiento clásico)
      if ([...menus].some(x => x.classList.contains("open"))) { closeAll(); abrir(m); }
    });
    m.querySelectorAll("[data-act]").forEach(item =>
      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); e.stopPropagation();
        closeAll();
        dzMenuAction(item.dataset.act);
      }));
  });
  document.addEventListener("mousedown", (e) => {
    if (!e.target.closest || !e.target.closest("#dzMenubar")) closeAll();
  });
}
/* barra de estado: herramienta · posición del cursor · zoom · cuadro · hint */
function dzSbTool() {
  const el = $("#sbTool");
  if (el) el.textContent = DZ_TOOL_NAMES[DZ.tool || "select"] || DZ.tool;
}
function dzSbFrame() {
  const el = $("#sbFrame");
  if (!el) return;
  if (DZ.doc) {
    el.textContent = `cuadro ${DZ.doc.frame}/${DZ.doc.scene.lastFrame() || 1}`;
    return;
  }
  el.textContent = DZ.anim ? `cuadro ${DZ.anim.idx + 1}/${DZ.anim.frames.length}` : "";
}
/* opciones contextuales de la herramienta activa (franja bajo la barra) */
function dzToolOptsRender() {
  const box = $("#dzToolOpts");
  if (!box) return;
  const t = DZ.tool || "select";
  const sm = DZ.smooth === undefined ? 40 : DZ.smooth;
  let html = `<span class="dz-to-name">${DZ_TOOL_NAMES[t] || t}</span>
    <span class="dz-artmodes" title="Plano de arte activo"><button id="toArtLine" class="${(DZ.artMode || "line") === "line" ? "on" : ""}" title="Dibujar contorno arriba">╱</button><button id="toArtColour" class="${DZ.artMode === "colour" ? "on" : ""}" title="Dibujar color debajo">●</button></span>`;
  if (["pencil", "brush", "pen"].includes(t)) {
    const presets = window.LOW?.drawing?.brushes?.all?.() || [];
    const presetSelect = t !== "pen" && presets.length ? `<label>Pincel <select id="toBrushPreset" class="langsel">${presets.map(p =>
      `<option value="${p.id}"${p.id === DZ.brushPreset ? " selected" : ""}>${p.name}</option>`).join("")}</select></label>` : "";
    html += presetSelect + (t !== "pen" ? `<button class="ghost" id="toBrushStudio" title="Biblioteca, preview y dinámica de pinceles">Pinceles…</button>` : "") + `<label>Trazo <input type="color" id="toColor" value="${dzHex(DZ.drawColor) || "#1a1a1a"}"></label>
      <label>Grosor <input type="number" id="toW" min="1" max="120" value="${DZ.drawW || 6}" class="dz-win"></label>` +
      (t !== "pen" ? `<label>Suavizado <input type="range" id="toSmooth" min="0" max="100" value="${sm}"><span id="toSmoothLbl">${sm}</span></label>` : "") +
      (t === "brush" ? `<span class="dz-hint">el grosor sigue la presión de la tableta</span>` : "") +
      (DZ.mirror ? `<span class="dz-hint">🔄 espejo activo</span>` : "");
  } else if (t === "bucket") {
    const cp = dzColoringPrefs();
    html += `<label>Relleno <input type="color" id="toFill" value="${dzHex(DZ.fillColor) || "#F0450E"}"></label>
      <label>Modo <select id="toFillMode" class="langsel"><option value="paint"${cp.mode === "paint" ? " selected" : ""}>Pintar</option><option value="unpainted"${cp.mode === "unpainted" ? " selected" : ""}>Sólo vacío</option><option value="repaint"${cp.mode === "repaint" ? " selected" : ""}>Recolorear</option><option value="unpaint"${cp.mode === "unpaint" ? " selected" : ""}>Borrar color</option></select></label>
      <label>Aplicar <select id="toFillScope" class="langsel"><option value="current"${cp.scope === "current" ? " selected" : ""}>Cuadro</option><option value="selection"${cp.scope === "selection" ? " selected" : ""}>Rango X-sheet</option><option value="onion"${cp.scope === "onion" ? " selected" : ""}>Mesa de luz</option><option value="level"${cp.scope === "level" ? " selected" : ""}>Nivel completo</option></select></label>
      <label title="Cierra discontinuidades pequeñas sin modificar el dibujo">Hueco <input type="number" id="toFillGap" min="0" max="10" value="${cp.gap}" class="dz-win"> px</label>
      ${DZ.lastColorReport ? '<button class="ghost" id="toFillReport" title="Ver cuadros coloreados y omitidos">Informe</button>' : ""}`;
  } else if (t === "ruler") {
    html += `<label>Trazo <input type="color" id="toColor" value="${dzHex(DZ.drawColor) || "#1a1a1a"}"></label>
      <label>Grosor <input type="number" id="toW" min="1" max="40" value="${DZ.drawW || 4}" class="dz-win"></label>
      <span class="dz-hint">clic = inicio · clic = fin (trazado continuo) · Shift = 15° · clic der = punto de fuga · Esc = cancela</span>`;
  } else if (t === "inflator") {
    html += `<span class="dz-hint">seleccioná una forma y arrastrá para inflar · Shift arrastrar = desinflar</span>`;
  } else if (t === "handler") {
    html += `<label>Sensibilidad <input type="range" id="toPumpSensitivity" min="1" max="12" value="${dzVectorPrefs().pumpSensitivity}"></label>
      <span class="dz-hint">Pump: clic en un trazo y arrastrá ↕ para cambiar el grosor</span>`;
  } else if (t === "iron") {
    html += `<label>Pasadas <input type="number" id="toIronPasses" min="1" max="5" value="${dzVectorPrefs().ironPasses}" class="dz-win"></label>
      <span class="dz-hint">clic sobre un trazo para suavizarlo sin cambiar de herramienta</span>`;
  } else if (t === "pliers") {
    html += `<span class="dz-hint">clic justo sobre el borde de un path para partirlo en dos</span>`;
  } else if (t === "magnet") {
    html += `<label>Radio <input type="range" id="toMagnetRadius" min="10" max="240" value="${dzVectorPrefs().magnetRadius}"></label>
      <label>Fuerza <input type="range" id="toMagnetStrength" min="5" max="100" value="${Math.round(dzVectorPrefs().magnetStrength * 100)}"></label>
      <span class="dz-hint">Pinch/Imán: arrastrá cerca del trazo para deformarlo</span>`;
  } else if (t === "eraser") {
    html += `<span class="dz-hint">pasá por encima y borra trazos enteros — las capas con candado no se tocan</span>`;
  } else if (t === "nodes") {
    html += `<span class="dz-hint">clic en un trazado muestra sus puntos · arrastralos · doble clic borra un punto</span>`;
  } else if (t === "dropper") {
    html += `<span class="dz-hint">clic en cualquier elemento toma su relleno, trazo y grosor</span>`;
  } else if (t === "pivot") {
    html += `<span class="dz-hint">clic fija el eje de rotación de la pieza (hombro, codo…) · Alt+clic lo quita</span>`;
  } else if (t === "hand") {
    html += `<span class="dz-hint">arrastrá para navegar · también espacio+arrastrar o botón del medio</span>`;
  } else if (t === "camera") {
    const cam = dzCamCur(), vb = dzVB(), zoom = Math.round(vb[2] / cam.w * 100);
    html += `<label>X <input type="number" id="toCamX" value="${cam.cx.toFixed(1)}" class="dz-win"></label>
      <label>Y <input type="number" id="toCamY" value="${cam.cy.toFixed(1)}" class="dz-win"></label>
      <label>Zoom <input type="number" id="toCamZoom" min="5" max="2000" value="${zoom}" class="dz-win">%</label>
      <label>Rotación <input type="number" id="toCamRot" step="0.1" value="${(cam.rot || 0).toFixed(1)}" class="dz-win">°</label>
      <button class="ghost" id="toCamKey">${dzCamKeys()[dzCamFrame()] ? "Quitar clave" : "Crear clave"}</button>
      <button class="ghost" id="toCamReset">Restablecer</button>`;
  } else {
    html += `<span class="dz-hint">clic selecciona · marco vacío selecciona varios · Shift suma · Alt+arrastrar duplica · flecha blanca entra al grupo</span>`;
  }
  box.innerHTML = html + (t === "inflator" && typeof dzInflarOpcionesHTML === "function" ? dzInflarOpcionesHTML() : "");
  if (t === "inflator" && typeof dzInflarOpcionesWire === "function") dzInflarOpcionesWire();
  $("#toArtLine").onclick = () => dzArtSetMode("line");
  $("#toArtColour").onclick = () => dzArtSetMode("colour");
  const preset = $("#toBrushPreset"); if (preset) preset.onchange = e => {
    const brush = LOW.drawing.brushes.get(e.target.value); if (!brush) return;
    DZ.brushPreset = brush.id; DZ.drawW = brush.size || DZ.drawW;
    DZ.smooth = Math.round((brush.smoothing || 0) * 100);
    if (brush.color) DZ.drawColor = brush.color;
    dzToolOptsRender(); dzSetStatus("Pincel: " + brush.name);
  };
  const brushStudio = $("#toBrushStudio"); if (brushStudio) brushStudio.onclick = dzBrushStudioOpen;
  const oc = $("#toColor"); if (oc) oc.oninput = e => { DZ.drawColor = e.target.value; const p = $("#dzPStroke"); if (p) p.value = e.target.value; };
  const ow = $("#toW"); if (ow) ow.oninput = e => { DZ.drawW = +e.target.value || 6; const p = $("#dzDrawW"); if (p) p.value = DZ.drawW; };
  const os = $("#toSmooth"); if (os) os.oninput = e => {
    DZ.smooth = +e.target.value; $("#toSmoothLbl").textContent = e.target.value;
    const p = $("#dzSmooth"); if (p) { p.value = e.target.value; $("#dzSmoothLbl").textContent = e.target.value; }
    try { dzPrefsStorage().setItem("fidel.dzsmooth", String(DZ.smooth)); } catch (err) { /* */ }
  };
  const of2 = $("#toFill"); if (of2) of2.oninput = e => { DZ.fillColor = e.target.value; const p = $("#dzPFill"); if (p) p.value = e.target.value; };
  const fillMode = $("#toFillMode"); if (fillMode) fillMode.onchange = e => dzColoringPrefsSet("mode", e.target.value);
  const fillScope = $("#toFillScope"); if (fillScope) fillScope.onchange = e => dzColoringPrefsSet("scope", e.target.value);
  const fillGap = $("#toFillGap"); if (fillGap) fillGap.onchange = e => { e.target.value = dzColoringPrefsSet("gap", e.target.value).gap; };
  const fillReport = $("#toFillReport"); if (fillReport) fillReport.onclick = dzColoringReportShow;
  const pump = $("#toPumpSensitivity"); if (pump) pump.oninput = e => dzVectorPrefsSet("pumpSensitivity", +e.target.value);
  const passes = $("#toIronPasses"); if (passes) passes.oninput = e => dzVectorPrefsSet("ironPasses", Math.max(1, Math.min(5, +e.target.value || 1)));
  const radius = $("#toMagnetRadius"); if (radius) radius.oninput = e => dzVectorPrefsSet("magnetRadius", +e.target.value);
  const strength = $("#toMagnetStrength"); if (strength) strength.oninput = e => dzVectorPrefsSet("magnetStrength", +e.target.value / 100);
}

let DZ_BRUSH_STUDIO = null;
function dzBrushSelect(brush) {
  if (!brush) return;
  DZ.brushPreset = brush.id; DZ.drawW = brush.size || DZ.drawW;
  DZ.smooth = Math.round((brush.smoothing || 0) * 100);
  if (brush.color) DZ.drawColor = brush.color;
  dzToolOptsRender(); dzSetStatus("Pincel: " + brush.name);
}
function dzBrushStudioOpen() {
  const root = $("#dzBrushStudio"), inspector = $("#dzInspector");
  if (!root || !inspector || !LOW.drawing?.BrushStudio) return;
  // El escenario multiplano ocupa el viewer completo y oculta el inspector.
  // Abrir el estudio de pinceles es una intención explícita de volver a dibujo.
  const workspaces = LOW.workspace?.workspaces;
  if (workspaces?.activeId !== "drawing") workspaces?.activate?.("drawing", dzWsAplicar);
  else dzCompositionViewShow(false);
  inspector.classList.add("brush-studio-open"); root.hidden = false;
  if (!DZ_BRUSH_STUDIO) DZ_BRUSH_STUDIO = new LOW.drawing.BrushStudio(root, {
    library: LOW.drawing.brushes, engine: LOW.drawing.brushEngine, selected: DZ.brushPreset,
    onSelect: dzBrushSelect, onImport: dzImportBrushes,
    onClose: () => { root.hidden = true; inspector.classList.remove("brush-studio-open"); },
    onError: error => sysMsg(" No pude guardar el pincel: " + error.message)
  });
  DZ_BRUSH_STUDIO.selected = DZ.brushPreset || DZ_BRUSH_STUDIO.selected; DZ_BRUSH_STUDIO.render();
}

async function dzImportBrushes() {
  const result = await api.import_brush_pack();
  if (!result || result.cancel) return;
  if (result.error) return sysMsg(" No pude importar el pincel: " + result.error);
  const incoming = Array.isArray(result.presets) ? result.presets : [];
  const valid = incoming.filter(p => p && p.name && (p.tipData || p.engine === "vector"));
  if (!valid.length) return dzSetStatus("El archivo no contiene pinceles utilizables");
  const stamp = Date.now().toString(36);
  try {
    LOW.drawing.brushes.saveMany(valid.map((preset, index) => ({ ...preset,
      id: `imported-${stamp}-${index + 1}`, imported: true })));
  } catch (error) { return sysMsg(" No pude guardar el paquete: " + error.message); }
  DZ.brushPreset = `imported-${stamp}-1`; DZ.drawW = valid[0].size || 36;
  if (DZ_BRUSH_STUDIO) { DZ_BRUSH_STUDIO.selected = DZ.brushPreset; DZ_BRUSH_STUDIO.filter = "imported"; DZ_BRUSH_STUDIO.render(); }
  dzToolOptsRender(); dzSetStatus(`${valid.length} pincel${valid.length === 1 ? "" : "es"} importado${valid.length === 1 ? "" : "s"} desde ${result.name || result.format || "archivo"}`);
}
/* splitter: redimensionar el inspector arrastrando (persistente) */
function dzSplitWire() {
  const sp = $("#dzSplit"), insp = document.querySelector(".dz-inspector");
  if (!sp || !insp) return;
  const saved = +dzPrefsStorage().getItem("fidel.dzinsw");
  if (saved >= 200 && saved <= 520) insp.style.width = saved + "px";
  sp.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = Math.max(200, Math.min(520, window.innerWidth - ev.clientX));
      insp.style.width = w + "px";
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      try { dzPrefsStorage().setItem("fidel.dzinsw", parseInt(insp.style.width) || 260); } catch (err) { /* */ }
      dzPositionHandle();
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  });
}
/* X-sheet: planilla de exposición vertical (número · nombre · claves) */
function dzXsSetVisible(show) {
  const panel = $("#dzXsheet");
  const button = $("#tlXs");
  const timeline = $("#dzTimeline");
  const canvas = $("#dzCanvas");
  if (!panel) return;
  show = !!show && !dzIsPanelDetached("xsheet");
  panel.hidden = !show;
  if (show) dzXsMount();          // planilla sobre el modelo (fase 3)
  if (button) button.classList.toggle("active", show);
  if (timeline) timeline.classList.toggle("xsheet-mode", show);
  if (canvas) canvas.classList.toggle("xsheet-open", show && panel.parentElement === canvas);
  // Un panel acoplado no conserva coordenadas flotantes.
  if (show && !panel.classList.contains("dz-panel-floating")) {
    panel.style.left = "";
    panel.style.top = "";
    panel.style.right = "";
  }
  if (show) dzXsRender();
}
function dzAnimSetView(mode) {
  const xsheet = mode === "xsheet";
  const grid = $("#dzTlGrid"), timeline = $("#dzTimeline");
  if (grid) grid.hidden = xsheet;
  dzXsSetVisible(xsheet);
  if (timeline) {
    timeline.classList.toggle("grid-mode", !xsheet);
    timeline.classList.toggle("xsheet-mode", xsheet);
  }
  const layers = $("#tlLayers"), xs = $("#tlXs");
  if (layers) layers.classList.toggle("active", !xsheet);
  if (xs) xs.classList.toggle("active", xsheet);
  if (!xsheet) void dzTlMount().then(() => dzPublishAnimationPanelState([], [], 0));
}
async function dzDetachAnimationPanel(kind) {
  if (!DZ.anim) await dzAnimToggle();
  if (!DZ.anim) return dzSetStatus("Abrí una animación antes de separar el panel");
  await dzTlGridRender();
  const result = await api.open_animation_panel(kind);
  if (!result || !result.error) {
    DZ.detachedAnimationPanels = DZ.detachedAnimationPanels || new Set();
    DZ.detachedAnimationPanels.add(kind);
    DZ.detached = DZ.detached || new Set();
    DZ.detached.add(kind);
    window.LOW?.workspace?.panels?.detach(kind);
    // Desacople real: la mesa principal recupera el espacio ocupado por el panel.
    if (kind === "timeline") {
      $("#dzTimeline").hidden = true;
      $("#dzTlGrid").hidden = true;
    } else {
      dzXsSetVisible(false);
    }
  }
  if (result && result.error) return dzSetStatus("No pude abrir la ventana: " + result.error);
  dzSetStatus((kind === "xsheet" ? "X-sheet" : "Timeline") + " separada · movela al segundo monitor");
}
function dzXsToggle() {
  if (!DZ.anim) { dzAnimToggle().then(() => dzAnimSetView("xsheet")); return; }
  dzAnimSetView("xsheet");
}
/* X-sheet (planilla de exposición): una fila por cuadro con MINIATURA, número,
   marcas (🔑 clave · 🎬 cámara) y NOTAS editables. Las notas se guardan en la
   escena (<base>_escena.json) junto a las claves y la cámara. */
function dzXsRender() {
  // La vista canónica es la dueña del panel: si ya está montada sobre el
  // modelo (LowDoc), la renderiza; el render legacy queda sólo como adaptador
  // mientras la escena todavía no se migró. Evita que la x-sheet vieja (basada
  // en archivos) pise la nueva (basada en el modelo).
  if (DZ.doc && DZ.xsView) { DZ.xsView.render(); return; }
  return dzOpenToonzXsRender();
  /* Implementación histórica conservada temporalmente para compatibilidad. */
  const box = $("#dzXsRows");
  if (!box || $("#dzXsheet").hidden || !DZ.anim) return;
  const keys = (DZ.scene && DZ.scene.keys) || [];
  const cams = (DZ.scene && DZ.scene.cam) || {};
  const notes = (DZ.scene && DZ.scene.notes) || {};
  box.innerHTML =
    '<div class="dz-xs-head"><span>#</span><span>cuadro</span><span></span><span>nota</span></div>';
  DZ.anim.frames.forEach((f, i) => {
    const num = dzFrameNum(f);
    const row = document.createElement("div");
    row.className = "dz-xs-row" + (i === DZ.anim.idx ? " cur" : "") +
      (keys.includes(num) ? " key" : "");
    // número (clic = ir al cuadro)
    const n = document.createElement("span");
    n.className = "dz-xs-n"; n.textContent = i + 1;
    n.title = "Ir al cuadro " + (i + 1);
    n.onclick = () => { dzAnimStopIf(); dzGoFrame(i); };
    // miniatura (clic = ir al cuadro)
    const thumb = document.createElement("div");
    thumb.className = "dz-xs-thumb";
    thumb.onclick = () => { dzAnimStopIf(); dzGoFrame(i); };
    dzXsThumbInto(thumb, f, i);
    // marcas
    const badge = document.createElement("span");
    badge.className = "dz-xs-b";
    badge.textContent = (keys.includes(num) ? "🔑" : "") + (cams[num] ? "🎬" : "");
    // nota editable
    const note = document.createElement("input");
    note.className = "dz-xs-note"; note.type = "text";
    note.placeholder = "…"; note.value = notes[num] || "";
    note.title = "Nota de este cuadro (timing, acción, referencia…)";
    note.onchange = () => {
      DZ.scene = DZ.scene || {}; DZ.scene.notes = DZ.scene.notes || {};
      const v = note.value.trim();
      if (v) DZ.scene.notes[num] = v; else delete DZ.scene.notes[num];
      dzSceneSave();
    };
    row.append(n, thumb, badge, note);
    box.appendChild(row);
  });
}

/** X-sheet principal estilo OpenToonz: tiempo vertical y una columna por nivel.
 * Las celdas sólidas inician una exposición y la línea vertical indica hold. */
async function dzOpenToonzXsRender() {
  const box = $("#dzXsRows");
  if (!box || $("#dzXsheet").hidden || !DZ.anim) return;
  const keys = (DZ.scene && DZ.scene.keys) || [];
  const cams = (DZ.scene && DZ.scene.cam) || {};
  const notes = (DZ.scene && DZ.scene.notes) || {};
  const svgs = await dzTlFrameSvgs();
  if (!box.isConnected || !DZ.anim) return;
  const perFrame = svgs.map(dzTlKeysOf);
  const levels = [];
  perFrame.forEach(set => set.forEach(name => { if (!levels.includes(name)) levels.push(name); }));
  levels.reverse();
  const shownLevels = levels.length ? levels : ['(vacío)'];
  const cols = `42px 32px repeat(${shownLevels.length}, minmax(74px, 1fr)) minmax(150px, 1.4fr)`;
  box.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'dz-xs-head';
  head.style.gridTemplateColumns = cols;
  head.innerHTML = '<span>F</span><span>CAM</span>' +
    shownLevels.map(name => `<span title="${name}">${name.replace(/^#/, '')}</span>`).join('') +
    '<span>Notas</span>';
  box.appendChild(head);
  DZ.anim.frames.forEach((f, i) => {
    const num = dzFrameNum(f);
    const current = perFrame[i] || new Set();
    const previous = i > 0 ? perFrame[i - 1] : new Set();
    const row = document.createElement('div');
    row.className = 'dz-xs-row' + (i === DZ.anim.idx ? ' cur' : '') + (keys.includes(num) ? ' key' : '');
    row.style.gridTemplateColumns = cols;
    const frame = document.createElement('span');
    frame.className = 'dz-xs-n'; frame.textContent = String(i + 1);
    frame.onclick = () => { dzAnimStopIf(); dzGoFrame(i); };
    const camera = document.createElement('span');
    camera.className = 'dz-xs-cam' + (cams[num] ? ' on' : '');
    camera.textContent = cams[num] ? '◆' : '';
    camera.onclick = () => { dzAnimStopIf(); dzGoFrame(i); };
    row.append(frame, camera);
    shownLevels.forEach(level => {
      const present = current.has(level);
      const start = present && !previous.has(level);
      const cell = document.createElement('button');
      cell.className = 'dz-xs-cell' + (present ? ' exposed' : '') + (start ? ' start' : ' hold');
      cell.textContent = start ? String(i + 1) : '';
      cell.title = present ? `${level} · ${start ? 'inicio' : 'exposición sostenida'}` : `${level} · vacío`;
      cell.onclick = () => { dzAnimStopIf(); dzGoFrame(i); };
      row.appendChild(cell);
    });
    const note = document.createElement('input');
    note.className = 'dz-xs-note'; note.type = 'text'; note.placeholder = 'Nota…';
    note.value = notes[num] || '';
    note.onchange = () => {
      DZ.scene = DZ.scene || {}; DZ.scene.notes = DZ.scene.notes || {};
      const value = note.value.trim();
      if (value) DZ.scene.notes[num] = value; else delete DZ.scene.notes[num];
      dzSceneSave();
    };
    row.appendChild(note);
    box.appendChild(row);
  });
}
/* miniatura del cuadro dentro de una celda del X-sheet */
async function dzXsThumbInto(cell, f, i) {
  let txt = DZ.anim && DZ.anim.cache[f];
  if (!txt) {
    if (i === DZ.anim.idx) {
      const svg = $("#dzCanvas").querySelector(":scope > svg");
      if (svg) txt = dzSerialize(svg);
    } else {
      const r = await api.image_data(f);
      txt = r && r.svg;
    }
    if (DZ.anim && txt) DZ.anim.cache[f] = txt;
  }
  if (!txt || !cell.isConnected) return;
  const tmp = document.createElement("div"); tmp.innerHTML = txt;
  const svg = tmp.querySelector("svg");
  if (!svg) return;
  svg.removeAttribute("width"); svg.removeAttribute("height");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  cell.innerHTML = ""; cell.appendChild(svg);
}

/* ══ TIMELINE POR CAPAS × cuadros (estilo Toon Boom) ═══════════════════════
   Filas = capas (por id, unidas entre cuadros); columnas = cuadros. La celda
   se marca si esa capa existe en ese cuadro. La profundidad Z de cada capa es
   la MISMA data-z que usa el diorama/multiplano (coherente). ══ */
function dzTlGridToggle() {
  if (!DZ.anim) { dzAnimToggle(); return; }
  dzAnimSetView("timeline");
}
async function dzTlFrameSvgs() {
  const out = [];
  for (let i = 0; i < DZ.anim.frames.length; i++) {
    const f = DZ.anim.frames[i];
    let txt = DZ.anim.cache[f];
    if (!txt) {
      if (i === DZ.anim.idx) { const s = $("#dzCanvas").querySelector(":scope > svg"); txt = s ? dzSerialize(s) : ""; }
      else { const r = await api.image_data(f); txt = (r && r.svg) || ""; }
      if (txt) DZ.anim.cache[f] = txt;
    }
    out.push(txt);
  }
  return out;
}
function dzTlKeysOf(svgText) {
  const set = new Set();
  const doc = new DOMParser().parseFromString(svgText || "<svg/>", "image/svg+xml");
  const s = doc.querySelector("svg");
  if (s) [...s.children].forEach(n => {
    const t = n.tagName.toLowerCase();
    if (DZ_SKIP_TAGS.includes(t)) return;
    const cls = (n.getAttribute && n.getAttribute("class")) || "";
    if (/dz-onion|dz-penui/.test(cls)) return;
    set.add(n.id ? "#" + n.id : "(sin nombre)");
  });
  return set;
}
async function dzTlGridRender() {
  const g = $("#dzTlGrid");
  if (!g || g.hidden || !DZ.anim) return;
  // La vista canónica es la dueña del panel principal. El render legacy queda
  // como adaptador solo mientras todavía no se migró una escena.
  if (DZ.doc && DZ.tlView) {
    DZ.tlView.render();
    await dzPublishAnimationPanelState([], [], 0);
    return;
  }
  const svgs = await dzTlFrameSvgs();
  const perFrame = svgs.map(dzTlKeysOf);
  const order = [];
  perFrame.forEach(set => set.forEach(k => { if (!order.includes(k)) order.push(k); }));
  order.reverse();   // al frente arriba (como Illustrator/PS)
  const cur = DZ.anim.idx;
  const keys = (DZ.scene && DZ.scene.keys) || [];   // fotogramas clave de dibujo
  const cams = (DZ.scene && DZ.scene.cam) || {};    // claves de cámara
  const fnum = i => dzFrameNum(DZ.anim.frames[i]);
  const selection = DZ.timelineSelection;
  const selected = i => !!selection && i >= selection.from && i <= selection.to;
  // OpenToonz muestra una regla de tiempo útil aunque la escena todavía tenga
  // pocos dibujos. Las celdas futuras se crean con doble clic.
  const requestedOut = Math.max(0, parseInt($("#tlOut").value || "0", 10));
  const displayCount = Math.max(48, DZ.anim.frames.length, requestedOut);
  const displayFrames = Array.from({ length: displayCount }, (_, i) => DZ.anim.frames[i] || null);
  // ── encabezado: números de cuadro (cada 5 resaltado) + marcas 🔑/🎬 + playhead ──
  // El TRAMO ACTIVO: de que cuadro a que cuadro se anima. Lo de afuera se
  // atenua y no se reproduce, como la zona activa de Toon Boom / OpenToonz.
  const tramo = dzRangoActual(displayCount);
  $("#dzTlgCols").innerHTML = displayFrames.map((f, i) => {
    const n = i + 1, mj = (n % 5 === 0), num = f ? fnum(i) : null;
    const mark = (num && keys.includes(num) ? "<i class='k'></i>" : "") + (num && cams[num] ? "<i class='c'></i>" : "");
    const fuera = n < tramo.in || n > tramo.out;
    const mango = n === tramo.in ? "<i class='mg in' data-borde='in' title='Primer cuadro del tramo — arrastrá'></i>"
      : (n === tramo.out ? "<i class='mg out' data-borde='out' title='Último cuadro del tramo — arrastrá'></i>" : "");
    return `<span class="dz-tlg-col${i === cur ? " cur" : ""}${selected(i) ? " selected" : ""}${mj ? " mj" : ""}` +
           `${fuera ? " fuera" : ""}" data-i="${i}">` +
           `${mj || i === cur ? n : ""}${mark}${mango}</span>`;
  }).join("");
  $("#dzTlgCols").querySelectorAll(".mg").forEach(m =>
    m.onpointerdown = e => dzRangoDrag(e, m.dataset.borde));
  $("#dzTlgCols").ondblclick = e => {
    if (e.target.closest(".mg")) return;      // doble clic en la manija: no
    dzRangoTodo();
  };
  const liveSvg = $("#dzCanvas").querySelector(":scope > svg");
  const rows = $("#dzTlgRows");
  rows.innerHTML = "";
  order.forEach(key => {
    const row = document.createElement("div");
    row.className = "dz-tlg-row";
    const id = key.startsWith("#") ? key.slice(1) : null;
    const liveEl = id && liveSvg ? liveSvg.querySelector("#" + CSS.escape(id)) : null;
    const z = liveEl ? (parseFloat(liveEl.getAttribute("data-z")) || 0) : 0;
    const hidden = liveEl && liveEl.getAttribute("display") === "none";
    const locked = liveEl && liveEl.hasAttribute("data-locked");
    // panel izquierdo de la capa (columna, como OpenToonz):  · 🔒 · nombre · Z
    const head = document.createElement("div");
    head.className = "dz-tlg-lhead";
    head.innerHTML =
      `<span class="dz-eye eye" title="${hidden ? "Mostrar" : "Ocultar"}">${hidden ? "◌" : ""}</span>` +
      `<span class="dz-eye lock" title="${locked ? "Desbloquear" : "Bloquear"}" style="opacity:${locked ? 1 : .4}">${locked ? "🔒" : "🔓"}</span>` +
      `<span class="dz-tlg-name" title="${key}">${key}</span>` +
      `<input class="dz-tlg-z" type="number" step="10" value="${z}" title="Profundidad Z — la misma de la cámara multiplano"${liveEl ? "" : " disabled"}>`;
    head.querySelector(".eye").onclick = () => {
      if (!liveEl) return; dzSnapshot();
      hidden ? liveEl.removeAttribute("display") : liveEl.setAttribute("display", "none");
      dzMarkDirty(); dzBuildLayers(); dzTlGridRender();
    };
    head.querySelector(".lock").onclick = () => {
      if (!liveEl) return; dzSnapshot();
      locked ? liveEl.removeAttribute("data-locked") : liveEl.setAttribute("data-locked", "1");
      dzMarkDirty(); dzBuildLayers(); dzTlGridRender();
    };
    head.querySelector(".dz-tlg-z").onchange = (e) => {
      if (!liveEl) return; dzSnapshot();
      const v = Math.max(-60, Math.min(400, Math.round(+e.target.value || 0)));
      if (v === 0) liveEl.removeAttribute("data-z"); else liveEl.setAttribute("data-z", v);
      dzMarkDirty(); dzBuildLayers();
      if (DZ.d3) dz3dBuild();
      dzZPanelRender();
    };
    row.appendChild(head);
    // celdas: EXPOSICIÓN estilo OpenToonz — inicio de toma sólido, sostenidos
    // con línea de continuación; clic navega al cuadro
    const cells = document.createElement("div");
    cells.className = "dz-tlg-cells";
    displayFrames.forEach((unused, i) => {
      const set = perFrame[i] || new Set();
      const on = set.has(key), prevOn = i > 0 && (perFrame[i - 1] || new Set()).has(key);
      const c = document.createElement("span");
      c.className = "dz-tlg-cell" +
        (on ? (prevOn ? " held" : " start") : "") + (i === cur ? " cur" : "") +
        (selected(i) ? " selected" : "") +
        (i + 1 < tramo.in || i + 1 > tramo.out ? " fuera" : "");
      c.dataset.i = i;
      c.onclick = e => dzTimelineCellActivate(i, false, e);
      c.ondblclick = e => dzTimelineCellActivate(i, true, e);
      c.oncontextmenu = e => dzTimelineContextMenu(e, i);
      cells.appendChild(c);
    });
    row.appendChild(cells);
    rows.appendChild(row);
  });
  // ── fila de CÁMARA (track propio, como OpenToonz) ──
  const camRow = document.createElement("div");
  camRow.className = "dz-tlg-row cam";
  camRow.innerHTML = `<div class="dz-tlg-lhead"><span class="dz-eye">🎬</span>` +
    `<span class="dz-tlg-name">Cámara</span></div>`;
  const camCells = document.createElement("div");
  camCells.className = "dz-tlg-cells";
  displayFrames.forEach((f, i) => {
    const has = !!(f && cams[fnum(i)]);
    const c = document.createElement("span");
    c.className = "dz-tlg-cell cam" + (has ? " key" : "") + (i === cur ? " cur" : "") +
      (selected(i) ? " selected" : "");
    c.dataset.i = i;
    c.onclick = e => dzTimelineCellActivate(i, false, e);
    c.ondblclick = e => dzTimelineCellActivate(i, true, e);
    c.oncontextmenu = e => dzTimelineContextMenu(e, i);
    camCells.appendChild(c);
  });
  camRow.appendChild(camCells);
  rows.appendChild(camRow);
  $("#dzTlgCols").querySelectorAll(".dz-tlg-col").forEach(c =>
    { c.onclick = e => dzTimelineCellActivate(+c.dataset.i, false, e);
      c.ondblclick = e => dzTimelineCellActivate(+c.dataset.i, true, e);
      c.oncontextmenu = e => dzTimelineContextMenu(e, +c.dataset.i); });
  dzPublishAnimationPanelState(perFrame, order, displayCount);
}

function dzTimelineContextMenu(e, index) {
  dzTimelineCellActivate(index, false, e);
  const command = (action, payload = {}) => () => window.lowAnimationPanelCommand?.({ action, payload:{ index, ...payload } });
  showCtxMenu(e, [
    { icon:"＋", label:"Nuevo dibujo", action:command("new-drawing") },
    { icon:"□", label:"Cuadro vacío", action:command("add-blank") },
    { icon:"⧉", label:"Duplicar exposición", action:command("add") },
    "separator",
    { icon:"✂", label:"Cortar celdas", shortcut:"Ctrl+X", action:command("cut-cells") },
    { icon:"▤", label:"Copiar celdas", shortcut:"Ctrl+C", action:command("copy-cells") },
    { icon:"▥", label:"Pegar celdas", shortcut:"Ctrl+V", action:command("paste-cells") },
    { icon:"∅", label:"Vaciar exposición", action:command("clear-cells") },
    "separator",
    { icon:"2", label:"Trabajar en doses", action:command("step-2") },
    { icon:"↔", label:"Extender exposición", action:command("longer-exposure") },
    { icon:"⇄", label:"Invertir selección", action:command("reverse-cells") },
    { icon:"⌁", label:"Ida y vuelta", action:command("swing-cells") },
    "separator",
    { icon:"⌫", label:"Eliminar cuadros", shortcut:"Supr", action:command("delete") }
  ]);
}

function dzAnimationPanelExtras(state) {
  const audio = DZ.doc && DZ.doc.audio;
  const cellSelection = DZ.doc && DZ.doc.cellSelection;
  const selection = cellSelection ? { anchor: Math.max(0, cellSelection.anchorFrame - 1),
    from: Math.max(0, cellSelection.from - 1), to: Math.max(0, cellSelection.to - 1) } :
    (DZ.timelineSelection || null);
  const current = Math.max(0, Math.min((state.frames || []).length - 1, +state.current || 0));
  const currentFrame = (state.frames || [])[current] || {};
  return Object.assign(state, {
    loop: !DZ.anim || DZ.anim.loop !== false,
    rangeIn: Math.max(1, parseInt($("#tlIn")?.value || "1", 10)),
    rangeOut: Math.max(0, parseInt($("#tlOut")?.value || "0", 10)),
    onion: !!(DZ.anim && DZ.anim.onion),
    onionFixed: [...(dzOnionCfgActual().fixed || [])],
    cameraMode: !!DZ.camMode,
    currentKey: !!currentFrame.key,
    currentCamera: !!currentFrame.camera,
    recording: !!DZ.rec,
    puppeteering: !!(DZ.pup && (DZ.pup.recording || DZ.pup.counting)),
    moving: !!DZ.moveT,
    selection: selection ? { anchor: selection.anchor, from: selection.from, to: selection.to } : null,
    audio: audio ? { name: audio.name || "Audio", muted: !!audio.muted,
      volume: audio.volume == null ? 1 : audio.volume, offset: audio.offset || 0 } : null
  });
}

async function dzPublishAnimationPanelState(perFrame, levels, displayCount) {
  if (!api || !DZ.anim) return;
  if (DZ.doc && DZ.doc.scene) {
    const doc = DZ.doc, scene = doc.scene, last = Math.max(1, scene.lastFrame());
    const rigNodes = Object.values((scene.rig && scene.rig.nodes) || {});
    const total = Math.max(48, displayCount || 0, last + 24);
    const frames = Array.from({ length: total }, (_, i) => ({ index: i, number: i + 1,
      exists: i < last, name: "F" + (i + 1), key: rigNodes.some(node => node.keys && node.keys[i + 1]),
      camera: !!(scene.camera && scene.camera.keys && scene.camera.keys[i + 1]) }));
    const state = dzAnimationPanelExtras({ frames, levels: scene.layers.map((ly) => ly.name),
      current: Math.max(0, doc.frame - 1), playing: !!(DZ.playback && DZ.playback.playing),
      fps: Math.max(1, +(scene.fps || $("#tlFps").value || 12)),
      exposures: scene.layers.map((ly) => frames.map((f) => ly.cellAt(f.number) != null)) });
    DZ.animationPanelState = state;
    try { await api.animation_panel_state(state); } catch (err) { /* ventana auxiliar opcional */ }
    return;
  }
  const cams = (DZ.scene && DZ.scene.cam) || {};
  const keys = (DZ.scene && DZ.scene.keys) || [];
  const timelineCore = window.LOW && LOW.animation && LOW.animation.timeline;
  if (timelineCore) {
    const playbackIndex = DZ.anim.playing && Number.isInteger(DZ.anim.previewIdx) ? DZ.anim.previewIdx : DZ.anim.idx;
    const state = dzAnimationPanelExtras(timelineCore.buildPanelState({ frames: DZ.anim.frames, levels,
      current: playbackIndex, playing: DZ.anim.playing,
      fps: Math.max(1, +($("#tlFps").value || 12)), perFrame,
      camera: cams, keys, displayCount }));
    DZ.animationPanelState = state;
    try { await api.animation_panel_state(state); } catch (err) { /* ventana auxiliar opcional */ }
    return;
  }
  const frames = Array.from({ length: displayCount }, (_, i) => ({
    index: i,
    number: i + 1,
    exists: i < DZ.anim.frames.length,
    name: DZ.anim.frames[i] ? DZ.anim.frames[i].split(/[\\/]/).pop() : "",
    key: i < DZ.anim.frames.length && keys.includes(dzFrameNum(DZ.anim.frames[i])),
    camera: i < DZ.anim.frames.length && !!cams[dzFrameNum(DZ.anim.frames[i])]
  }));
  const playbackIndex = DZ.anim.playing && Number.isInteger(DZ.anim.previewIdx) ? DZ.anim.previewIdx : DZ.anim.idx;
  const state = dzAnimationPanelExtras({
    frames, levels, current: playbackIndex, playing: !!DZ.anim.playing,
    fps: Math.max(1, +($("#tlFps").value || 12)),
    exposures: (levels || []).map(level => frames.map((f, i) =>
      !!(f.exists && perFrame[i] && perFrame[i].has(level))))
  });
  DZ.animationPanelState = state;
  try { await api.animation_panel_state(state); } catch (err) { /* ventana auxiliar opcional */ }
}

function dzPushAnimationPanelPlayback(index, playing) {
  if (!api || !DZ.animationPanelState) return;
  const now = performance.now();
  if (playing && now - (DZ.animationPanelPushAt || 0) < 60) return;
  DZ.animationPanelPushAt = now;
  const state = { ...DZ.animationPanelState, current: index, playing: !!playing };
  DZ.animationPanelState = state;
  api.animation_panel_state(state).catch(() => {});
}

/* ══ PANELES SEPARADOS (segundo monitor) ═════════════════════════════════
   Python hace de buzón entre la ventana principal y las auxiliares. Para la
   mesa publica el SVG canónico y devuelve trazos al mismo historial/documento. */
const DZ_PANELS = ["viewer", "timeline", "xsheet", "layers", "tools", "color", "onion", "levelstrip", "rig"];
DZ.detached = DZ.detached || new Set();

/** Id estable para una capa: el panel remoto no puede mandar un nodo del DOM. */
function dzPanelElId(el) {
  if (!el.id) el.id = "dz-l-" + (DZ.panelSeq = (DZ.panelSeq || 0) + 1);
  return el.id;
}

/** Foto chica del panel pedido (lo mínimo para dibujarlo del otro lado). */
function dzPanelSnapshot(kind) {
  if (kind === "viewer") {
    const svg = $("#dzCanvas")?.querySelector(":scope > svg");
    if (!svg) return { schema: 2, kind, svg: "", viewBox: "0 0 1020 1080" };
    const clone = svg.cloneNode(true);
    clone.querySelectorAll(".dz-onion,.dz-penui,.dz-node-overlay,.dz-vp-guides").forEach(el => el.remove());
    // El zoom/paneo pertenece a la ventana principal. Si viaja con el SVG, la
    // mesa separada lo vuelve a aplicar y el dibujo queda fuera de pantalla.
    ["transform", "width", "height", "max-width", "max-height", "aspect-ratio"]
      .forEach(p => clone.style.removeProperty(p));
    if (!clone.getAttribute("style")) clone.removeAttribute("style");
    return { schema: 2, kind, svg: new XMLSerializer().serializeToString(clone),
      viewBox: svg.getAttribute("viewBox") || `0 0 ${svg.getAttribute("width") || 1020} ${svg.getAttribute("height") || 1080}`,
      tool: DZ.tool || "pencil", color: DZ.drawColor || "#1a1a1a", width: DZ.drawW || 6,
      frame: DZ.doc ? DZ.doc.frame : 1,
      rig: DZ.doc ? dzPanelSnapshot("rig") : null };
  }
  if (kind === "levelstrip") {
    const lv = DZ.doc && DZ.doc.level;
    const selected = DZ.lsView?.selected || new Set();
    return { schema: 2, kind, level: lv ? lv.name : "", current: DZ.doc ? DZ.doc.cell : null,
      width: DZ.doc?.scene?.width || 1020, height: DZ.doc?.scene?.height || 1080,
      drawings: lv ? lv.drawings.map(d => ({ number: d.number,
        content: d.content || "", empty: d.isEmpty(), selected: selected.has(d.number),
        exposed: DZ.doc.scene.layers.some(ly => ly.levelId === lv.id && ly.cells.includes(d.number)) })) : [] };
  }
  if (kind === "layers") {
    // mismo filtro y mismo nombre que dzBuildLayers: si no, el panel separado
    // lista cosas que el panel de adentro no muestra (cebolla, UI de la pluma).
    const svg = $("#dzCanvas") && $("#dzCanvas").querySelector(":scope > svg");
    const kids = svg ? [...svg.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())
      && !(n.classList && (n.classList.contains("dz-onion") || n.classList.contains("dz-penui")))) : [];
    return { schema: 2, kind, layers: kids.slice().reverse().map(el => ({
      id: dzPanelElId(el),
      name: el.id ? el.id : dzLayerLabel(el),
      hidden: el.getAttribute("display") === "none",
      locked: el.hasAttribute("data-locked"),
      opacity: Math.round((el.getAttribute("opacity") == null ? 1 : +el.getAttribute("opacity")) * 100),
      selected: el === DZ.sel,
    })) };
  }
  if (kind === "tools") {
    // DZ.tool arranca sin definir: en todo el editor "sin definir" es "select".
    const cur = DZ.tool || "select";
    // El panel separado mostraba una lista de TEXTO: sin el icono no es la
    // barra de herramientas, es un menu. Viaja tambien el simbolo del sprite.
    return { schema: 2, kind, tools: [...document.querySelectorAll(".dz-toolbtn")].map(b => ({
      id: b.dataset.tool, label: (b.title || b.dataset.tool || "").split(/[·(:]/)[0].trim(),
      icon: (b.querySelector("use")?.getAttribute("href") || "").replace("#", ""),
      fill: !!b.querySelector("svg.ico-fill"),
      active: b.dataset.tool === cur,
    })).filter(t => t.id) };
  }
  if (kind === "onion") {
    const cfg = dzOnionCfgActual();
    return { schema: 2, kind, enabled: !!DZ.onionOn, frame: DZ.doc ? DZ.doc.frame : 1, cfg };
  }
  if (kind === "color") {
    // se lee del elemento seleccionado, no de inputs del panel: esos se crean
    // dinámicamente y sus ids cambian según lo que haya elegido.
    const el = DZ.sel || (DZ.multi || [])[0] || null;
    const at = (a, d) => (el && el.getAttribute(a)) || d;
    return { schema: 2, kind, hasSelection: !!el,
             fill: dzHex(at("fill", "#000000")),
             stroke: dzHex(at("stroke", "#000000")),
             width: at("stroke-width", "1") };
  }
  if (kind === "rig") {
    const doc = DZ.doc, frame = doc ? doc.frame : 1;
    const nodes = doc ? Object.values(doc.scene.rig.nodes).map(node => ({
      id: node.id, elementId: node.elementId, parentId: node.parentId,
      pivot: node.pivot, head: node.head, tail: node.tail, pinned: !!node.pinned, limits: node.limits,
      pose: doc.scene.rigPose(node.id, frame), keyed: !!node.keys?.[frame],
      worldPivot: node.pivot ? doc.scene.rigWorldPoint(node.id, frame, node.pivot) : null,
      selected: (DZ.rigSelectedId || DZ.sel?.id) === node.id,
    })) : [];
    const constraints = doc ? Object.values(doc.scene.rig.constraints || {}).map(c => ({
      id: c.id, rootId: c.rootId, midId: c.midId, effectorId: c.effectorId,
      bend: c.bend, target: doc.scene.rigTargetAt(c.id, frame),
      active: c.id === DZ.rigConstraintId,
    })) : [];
    return { schema: 2, kind, frame, mode: DZ.rigSubmode || "build", visible: !!DZ.rigMode,
      selected: DZ.rigSelectedId || DZ.sel?.id || null, activeConstraint: DZ.rigConstraintId || null,
      nodes, constraints };
  }
  return DZ.animationPanelState || null;   // timeline / xsheet
}

/** Contrato común de las ventanas auxiliares. Evita abrir un panel con una
 *  foto incompleta y volver a introducir variantes "sin preview". */
function dzPanelSnapshotValid(kind, state) {
  if (!state || state.kind !== kind) return false;
  if (kind === "viewer") return typeof state.svg === "string" && typeof state.viewBox === "string";
  if (kind === "levelstrip") return Array.isArray(state.drawings) && state.drawings.every(d =>
    Number.isFinite(+d.number) && typeof d.content === "string");
  if (kind === "layers") return Array.isArray(state.layers);
  if (kind === "tools") return Array.isArray(state.tools);
  if (kind === "color") return typeof state.hasSelection === "boolean";
  if (kind === "onion") return !!state.cfg;
  if (kind === "rig") return Array.isArray(state.nodes) && Array.isArray(state.constraints);
  return true;
}

/** Publica el estado de los paneles separados (solo esos: si no hay ninguno
 *  abierto no se toca nada). Se llama en bucle liviano, igual que el panel de
 *  animación, para no tener que enganchar cada mutación del editor. */
let dzPublishing = false;
async function dzPanelsPublish() {
  if (!api || !DZ.detached.size || dzPublishing) return;
  // Cada api.* es un viaje al puente de pywebview: si el anterior todavía no
  // volvió y se encima otro, la app se arrastra y termina sin responder.
  dzPublishing = true;
  try {
    for (const kind of DZ.detached) {
      if (kind === "timeline" || kind === "xsheet") continue;  // ya se publican solos
      const state = dzPanelSnapshot(kind);
      if (!dzPanelSnapshotValid(kind, state)) {
        console.warn("Panel separado sin estado válido:", kind); continue;
      }
      const key = JSON.stringify(state);
      if (DZ["panelLast_" + kind] === key) continue;           // sin cambios: no molestar
      DZ["panelLast_" + kind] = key;
      try { await api.panel_state(kind, state); }
      catch (err) { DZ.detached.delete(kind); }                // panel muerto: dejar de publicar
    }
  } finally { dzPublishing = false; }
}
setInterval(() => { dzPanelsPublish(); }, 900);

/** Separar un panel a su propia ventana. */
async function dzDetachPanel(kind) {
  if (!api || !DZ_PANELS.includes(kind)) return;
  if (kind === "timeline" || kind === "xsheet") return dzDetachAnimationPanel(kind);
  if (kind === "rig" && !DZ.rigMode) {
    if (!DZ.anim) await dzAnimToggle();
    if (!DZ.anim) { dzSetStatus("Abrí una animación para separar el esqueleto"); return; }
    dzRigToggle();
  }
  // Cargar el buzón ANTES de crear la ventana evita el primer render vacío y
  // obliga a que todo panel nuevo cumpla el mismo contrato de estado.
  const initial = dzPanelSnapshot(kind);
  if (!dzPanelSnapshotValid(kind, initial)) {
    dzSetStatus(" No se pudo separar el panel: estado incompleto"); return;
  }
  try { await api.panel_state(kind, initial); }
  catch (err) { dzSetStatus(" No se pudo preparar el panel separado"); return; }
  const call = api.open_panel ? api.open_panel(kind) : api.open_animation_panel(kind);
  const r = await call;
  // sin confirmación no se marca como separado: si no, la ventana principal
  // queda publicando estado para siempre a un panel que nunca abrió
  if (!r || r.error) {
    dzSetStatus(" No se pudo separar el panel" + (r && r.error ? ": " + r.error : ""));
    return;
  }
  DZ.detached.add(kind);
  const meta = LOW.workspace.PANEL_CATALOG[kind];
  const panel = meta && document.querySelector(meta.element);
  if (panel) panel.hidden = true;
  LOW.workspace.panels?.detach(kind);
  DZ["panelLast_" + kind] = "";        // forzar una primera publicación
  dzPanelsPublish();
  dzSetStatus(" Panel separado: arrastralo al otro monitor (vuelve solo la próxima vez)");
}

/** Comandos que llegan desde una ventana separada. */
window.lowPanelCommand = async ({ kind, action, payload }) => {
  payload = payload || {};
  if (kind === "timeline" || kind === "xsheet") return window.lowAnimationPanelCommand({ action, payload });
  if (action === "dock") {
    DZ.detached.delete(kind);
    const meta = LOW.workspace.PANEL_CATALOG[kind], panel = meta && document.querySelector(meta.element);
    // Volver SIEMPRE a la derecha no es restaurar: el riel de herramientas
    // reaparecia del otro lado de la pantalla. Se usa el muelle que el panel
    // tenia anotado; y lo que nunca estuvo en un muelle (el riel, el viewer)
    // se limita a reaparecer donde estaba.
    const zona = LOW.workspace.panels?.get?.(kind)?.dock || (meta?.allowedDocks || [])[0] || "right";
    const muelles = Object.values(DZ.panelDock?.docks || {});
    if (panel) {
      panel.hidden = false;
      if (muelles.includes(panel.parentElement)) DZ.panelDock.dock(panel, zona);
    }
    LOW.workspace.panels?.dock(kind, zona);
    if (kind === "rig") { DZ.rigMode = true; $("#dzRigBtn")?.classList.add("active"); $("#tlRigOpen")?.classList.add("active"); dzRigPanelSync(); dzRigOverlayRender(); }
    return true;
  }

  if (kind === "viewer") {
    if (action === "undo") { dzUndo(); return true; }
    if (action === "redo") { dzRedo(); return true; }
    if (action === "tool" && ["pencil", "brush", "eraser", "hand"].includes(payload.id)) {
      dzSetTool(payload.id); return true;
    }
    if (action === "stroke" && Array.isArray(payload.points) && payload.points.length > 1) {
      const svg = $("#dzCanvas")?.querySelector(":scope > svg"); if (!svg) return false;
      dzSnapshot();
      const points = payload.points.slice(0, 10000).map(p => [+p[0] || 0, +p[1] || 0, Math.max(0, Math.min(1, +p[2] || .5))]);
      const path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", dzSmoothPath(dzRefineStroke(points)));
      const pressure = points.reduce((sum, p) => sum + p[2], 0) / points.length;
      const baseWidth = Math.max(.5, Math.min(200, +payload.width || DZ.drawW || 6));
      const width = payload.tool === "brush" ? baseWidth * (.25 + pressure * .75) : baseWidth;
      path.setAttribute("fill", "none"); path.setAttribute("stroke", payload.color || DZ.drawColor || "#1a1a1a");
      path.setAttribute("stroke-width", String(width));
      path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("data-low", "viewer-stroke"); svg.appendChild(path);
      dzMarkDirty(); dzBuildLayers(); if (DZ.doc) dzDocCommit();
      return true;
    }
    if (action === "rig-select" && DZ.doc) {
      const node = DZ.doc.scene.rigNode(payload.id), el = dzRigNodeElement(node);
      if (el) dzSelect(el); return !!el;
    }
    if (action === "rig-target" && DZ.doc) {
      const target = { x: +payload.x || 0, y: +payload.y || 0 };
      if (!DZ.doc.setRigIKTarget(payload.id, DZ.doc.frame, target)) return false;
      DZ.rigConstraintId = payload.id; dzRigApplyLive(DZ.doc.frame);
      dzTimelineBadges(); dzRigPanelSync(); return true;
    }
  }

  if (kind === "tools" && action === "tool") { dzSetTool(payload.id); return true; }
  if (kind === "levelstrip" && DZ.doc) {
    const number = +payload.number, lv = DZ.doc.level;
    if (!lv || !lv.byNumber(number)) return false;
    if (action === "expose-drawing") {
      return DZ.doc.setCell(DZ.doc.frame, number);
    }
    if (action === "drawing") {
      const strip = DZ.lsView;
      if (strip) {
        const order = lv.drawings.map(d => d.number);
        if (payload.ctrlKey) {
          strip.selected.has(number) ? strip.selected.delete(number) : strip.selected.add(number);
          strip.anchor = number;
        } else if (payload.shiftKey && strip.anchor != null) {
          const a = order.indexOf(strip.anchor), b = order.indexOf(number);
          strip.selected = new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1));
        } else { strip.selected = new Set([number]); strip.anchor = number; }
        strip.render();
      }
      const frame = DZ.doc.frameOfDrawing(number);
      if (frame && !payload.ctrlKey && !payload.shiftKey) DZ.doc.goTo(frame);
      return true;
    }
  }

  if (kind === "layers") {
    const el = payload.id && document.getElementById(payload.id);
    if (!el) return false;
    if (action === "select") { dzSelect(el); }
    else if (action === "visible") {
      dzSnapshot();
      if (el.getAttribute("display") === "none") el.removeAttribute("display");
      else el.setAttribute("display", "none");
      dzMarkDirty(); dzBuildLayers();
    } else if (action === "lock") {
      dzSnapshot();
      if (el.hasAttribute("data-locked")) el.removeAttribute("data-locked");
      else { el.setAttribute("data-locked", "1"); if (el === DZ.sel) dzDeselect(); }
      dzMarkDirty(); dzBuildLayers();
    } else if (action === "opacity") {
      dzSnapshot();
      el.setAttribute("opacity", Math.max(0, Math.min(100, +payload.value || 0)) / 100);
      dzMarkDirty(); dzBuildLayers();
    }
    return true;
  }

  if (kind === "onion") {
    if (action === "onion") {
      if (payload.key === "enabled") { DZ.onionOn = !!payload.value; dzOnion2Render(); dzOnionRender(); }
      else dzOnionCfgSet({ [payload.key]: payload.value });
    }
    else if (action === "onion-mixer") dzOnionMixerSet(payload.side, +payload.distance, +payload.value, !!payload.live);
    else if (action === "onion-preset") dzOnionMixerPreset(payload.kind);
    else if (action === "onion-fixed") dzOnionCfgSet(
      LOW.animation.onion.toggleFixed(dzOnionCfgActual(), +payload.frame || (DZ.doc ? DZ.doc.frame : 1)));
    return true;
  }
  if (kind === "color") {
    if (action === "fill" || action === "stroke") dzStyleApply(action, payload.value);
    else if (action === "width") dzStyleApply("stroke-width", payload.value);
    return true;
  }
  if (kind === "rig" && DZ.doc) {
    const node = payload.id && DZ.doc.scene.rigNode(payload.id);
    if (action === "select-node" && node) {
      return dzRigSelectNode(node.id);
    }
    if (action === "mode") { dzRigSetMode(payload.mode); return true; }
    if (action === "rig-library") { dzRigLibraryAdd(payload.key); return true; }
    if (action === "key-all") { dzRigKeyAll(); return true; }
    if (action === "key" && node) { dzRigSetKey(node.id, DZ.doc.frame, payload.pose || DZ.doc.scene.rigPose(node.id, DZ.doc.frame)); return true; }
    if (action === "delete-key" && node) { dzRigDelKey(node.id, DZ.doc.frame); return true; }
    if (action === "pose" && node) { dzRigSetKey(node.id, DZ.doc.frame, payload.pose || {}); return true; }
    if (action === "pin" && node) { DZ.doc.setRigPinned(node.id, !node.pinned); dzRigPanelSync(); dzRigOverlayRender(); return true; }
    if (action === "limits" && node) { DZ.doc.setRigLimits(node.id, payload.min, payload.max); return true; }
    if (action === "constraint") { DZ.rigConstraintId = payload.id || null; dzRigSetMode("ik"); dzRigPanelSync(); dzRigOverlayRender(); return true; }
    const constraint = payload.id && DZ.doc.scene.rigConstraint(payload.id);
    if (action === "flip-ik" && constraint) {
      DZ.rigConstraintId = constraint.id; dzRigFlipIK(); return true;
    }
    if (action === "delete-ik" && constraint) {
      DZ.rigConstraintId = constraint.id; dzRigDeleteIK(); return true;
    }
    if (action === "create-ik") {
      const id = DZ.doc.createRigIK(payload.rootId, payload.midId, payload.effectorId);
      if (!id) return false;
      DZ.rigConstraintId = id; dzRigSetMode("ik"); dzRigPanelSync(); dzRigOverlayRender(); return true;
    }
  }
  return false;
};

function dzPanelCellSelection() {
  if (!DZ.doc) return null;
  return DZ.doc.cellSelection || { fromLayerId: DZ.doc.layerId, toLayerId: DZ.doc.layerId,
    anchorLayerId: DZ.doc.layerId, anchorFrame: DZ.doc.frame,
    from: DZ.doc.frame, to: DZ.doc.frame };
}
async function dzPanelCellCommand(action) {
  const doc = DZ.doc, selection = dzPanelCellSelection();
  if (!doc || !selection) { dzSetStatus("Abrí una escena de animación para editar celdas"); return false; }
  const cells = LOW.animation.shortcuts && LOW.animation.shortcuts.cells;
  if (action === "new-drawing") {
    if (doc.cell == null) doc.ensureDrawing();
    else { const drawing = doc.duplicateDrawing(doc.cell); if (drawing) doc.setCell(doc.frame, drawing.number); }
    doc.emit("frame");
  } else if (action === "new-level") {
    // LEVEL-01: un nivel nuevo PROPONE un nombre descriptivo en vez de crear
    // "Nivel 7" en silencio. El id interno no depende del nombre, así que
    // renombrarlo después no rompe ninguna referencia.
    const propuesto = `Nivel ${doc.scene.levels.length + 1}`;
    const nombre = await dzPromptModal("Nivel nuevo",
      "nombre descriptivo — ej. «Cabeza», «Fondo», «Mano izquierda»", propuesto);
    if (nombre == null) { dzSetStatus("Nivel no creado"); return false; }
    doc.addLayer(String(nombre).trim() || propuesto); doc.emit("frame");
  }
  // HIST-02: los tres caminos (X-sheet, barra de la Timeline y teclado) llaman
  // al MISMO comando; antes cada uno tenia su propia copia de la maniobra.
  else if (action === "copy-cells" && cells) {
    const r = cells.copy(doc, selection); if (r) dzSetStatus(cells.medida(r) + " copiadas");
  } else if (action === "cut-cells" && cells) {
    const r = cells.cut(doc, selection); if (r) dzSetStatus(cells.medida(r) + " cortadas");
  } else if (action === "paste-cells" && cells) {
    const r = cells.paste(doc); if (r) dzSetStatus(cells.medida(r) + " pegadas");
  } else if (action === "clear-cells") doc.clearCells(selection, "Vaciar rango");
  else if (action === "shorter-exposure") doc.apply("stepChange", doc.frame, -1);
  else if (action === "longer-exposure") doc.apply("stepChange", doc.frame, +1);
  else if (/^step-[123]$/.test(action)) doc.apply("step", selection.from, selection.to, +action.slice(-1));
  else if (action === "autoexpose") doc.apply("autoexpose", selection.from, selection.to);
  else if (action === "dedupe") doc.apply("dedupe", selection.from, selection.to);
  else if (action === "repeat-cells") doc.apply("repeat", selection.from, selection.to, 1);
  else if (action === "reverse-cells") doc.apply("reverse", selection.from, selection.to);
  else if (action === "swing-cells") doc.apply("swing", selection.from, selection.to);
  else return false;
  return true;
}

window.lowAnimationPanelCommand = async ({ action, payload }) => {
  if (!DZ.anim && action !== "open") await dzAnimToggle();
  if (!DZ.anim) return false;
  const index = Math.max(0, +(payload && payload.index) || 0);
  if (action === "play") await dzPlayToggle();
  else if (action === "stop") { if (DZ.playback) DZ.playback.stop(); else dzAnimStopIf(); }
  else if (action === "frame") await dzTimelineCellActivate(index, false, payload || null);
  else if (action === "create-frame") await dzTimelineCellActivate(index, true, payload || null);
  else if (action === "first") { if (DZ.playback) DZ.playback.first(); else { dzAnimStopIf(); await dzGoFrame(0); } }
  else if (action === "previous") { if (DZ.playback) DZ.playback.step(-1); else await dzGoFrame(Math.max(0, DZ.anim.idx - 1)); }
  else if (action === "next") { if (DZ.playback) DZ.playback.step(1); else await dzGoFrame(Math.min(DZ.anim.frames.length - 1, DZ.anim.idx + 1)); }
  else if (action === "last") { if (DZ.playback) DZ.playback.last(); else { dzAnimStopIf(); await dzGoFrame(Math.max(0, DZ.anim.frames.length - 1)); } }
  else if (action === "toggle-loop") {
    DZ.anim.loop = !(DZ.anim.loop !== false);
    $("#tlLoop")?.classList.toggle("active", DZ.anim.loop);
    if (DZ.playback) DZ.playback.setLoop(DZ.anim.loop);
    dzSetStatus(DZ.anim.loop ? "Loop activado" : "Reproducción única");
  }
  else if (action === "set-fps") {
    const fps = Math.max(1, Math.min(60, Math.round(+(payload && payload.value) || 12)));
    if ($("#tlFps")) $("#tlFps").value = fps;
    if (DZ.playback) DZ.playback.setFps(fps);
    else if (DZ.doc) { DZ.doc.scene.fps = fps; DZ.doc.touch(); }
  }
  else if (action === "set-range") {
    const input = payload && payload.edge === "out" ? $("#tlOut") : $("#tlIn");
    if (input) input.value = payload && payload.edge === "out"
      ? Math.max(0, Math.round(+payload.value || 0))
      : Math.max(1, Math.round(+payload.value || 1));
    if (DZ.playback) DZ.playback.setRange(+$("#tlIn").value || 1, +$("#tlOut").value || 0);
  }
  else if (action === "add") await dzFrameAdd();
  else if (action === "add-blank") await dzFrameInsert(true);
  else if (action === "insert") await dzFrameInsert(!!(payload && payload.blank));
  else if (action === "onion") $("#tlOnion")?.click();
  else if (action === "key") dzKeyToggle();
  else if (action === "tween") dzTweenModal();
  else if (action === "move") await dzMoveTween();
  else if (action === "record") dzRecToggle();
  else if (action === "puppet") dzPuppetToggle();
  else if (action === "walk") dzWalkCycleModal();
  else if (action === "ai") dzAIKeyModal();
  else if (action === "delete") await dzDeleteFrameSelection();
  else if (action === "camera") dzCamToggle();
  else if (action === "camera-key") dzCamKeyToggle();
  else if (action === "export") dzExportModal();
  else if (action === "audio-load") dzAudioCargar();
  else if (action === "audio-remove") dzAudioQuitar();
  else if (action === "audio-mute") {
    const track = DZ.doc && DZ.doc.audio;
    if (track) track.setMuted(!track.muted);
  }
  else if (["new-drawing", "new-level", "cut-cells", "copy-cells", "paste-cells", "clear-cells",
    "shorter-exposure", "longer-exposure", "step-1", "step-2", "step-3", "autoexpose", "dedupe",
    "repeat-cells", "reverse-cells", "swing-cells"].includes(action)) {
    dzPanelCellCommand(action);
  }
  else if (action === "toggle-onion-fixed") {
    const frame = Math.max(1, Math.round(+(payload && payload.frame) || 1));
    dzOnionCfgSet(LOW.animation.onion.toggleFixed(dzOnionCfgActual(), frame));
    DZ.onionOn = true;
  try { DZ.anchoFijo = dzPrefsStorage().getItem("low.anchoFijo") === "1"; } catch (_) { /* sin storage */ }
  $("#dzAnchoFijo")?.classList.toggle("on", !!DZ.anchoFijo); if (DZ.anim) DZ.anim.onion = true;
  }
  else if (action === "undo") dzUndo();
  else if (action === "redo") dzRedo();
  else if (action === "dock") {
    const kind = payload && payload.kind === "xsheet" ? "xsheet" : "timeline";
    DZ.detachedAnimationPanels = DZ.detachedAnimationPanels || new Set();
    DZ.detachedAnimationPanels.delete(kind);
    DZ.detached?.delete(kind);
    window.LOW?.workspace?.panels?.dock(kind);
    if (kind === "xsheet") {
      dzTimelineReveal();
      dzAnimSetView("xsheet");
    } else {
      dzTimelineReveal();
      dzAnimSetView("timeline");
    }
  }
  await dzTlGridRender();
  return true;
};

async function dzTimelineCellActivate(index, createFuture, event=null) {
  if (!DZ.anim) return;
  if (DZ.playback) DZ.playback.stop(); else dzAnimStopIf();
  const previous = DZ.timelineSelection || { anchor: DZ.anim.idx, from: DZ.anim.idx, to: DZ.anim.idx };
  if (event && event.shiftKey) {
    const anchor = previous.anchor == null ? DZ.anim.idx : previous.anchor;
    DZ.timelineSelection = { anchor, from: Math.min(anchor, index), to: Math.max(anchor, index) };
  } else {
    DZ.timelineSelection = { anchor: index, from: index, to: index };
  }
  if (DZ.doc) {
    const s = DZ.timelineSelection;
    DZ.doc.selectCellRange(DZ.doc.layerId, s.from + 1, DZ.doc.layerId, s.to + 1);
    DZ.doc.goTo(index + 1);
    if (createFuture) { DZ.doc.ensureDrawing(); DZ.doc.emit("frame"); }
    return;
  }
  if (index < DZ.anim.frames.length) { await dzGoFrame(index); return; }
  if (!createFuture) {
    dzSetStatus(`Fotograma ${index + 1} vacío · doble clic para extender la exposición hasta acá`);
    return;
  }
  const missing = index + 1 - DZ.anim.frames.length;
  if (missing > 120) return dzSetStatus("Extensión demasiado grande — ajustá el rango Out primero");
  dzSetStatus(`Creando ${missing} fotograma(s) hasta ${index + 1}…`);
  for (let i = 0; i < missing; i++) await dzFrameAdd();
  dzSetStatus(`Timeline extendida hasta el fotograma ${index + 1}`);
}

async function dzDeleteFrameSelection() {
  // Modelo nuevo: quitar TIEMPO de la capa activa. Los dibujos no se borran
  // (es la regla de la xsheet: borrar una exposición nunca borra el dibujo).
  if (DZ.doc) {
    const sel = DZ.doc.cellSelection;
    const from = sel ? Math.max(1, sel.from) : DZ.doc.frame;
    const to = sel ? Math.max(from, sel.to) : DZ.doc.frame;
    const label = from === to ? "el frame " + from : `los frames ${from}–${to}`;
    if (!(await dzConfirmModal(`¿Quitar ${label} de la capa activa? (los dibujos no se borran)`, { ok: "Quitar", danger: true }))) return;
    dzAnimStopIf();
    DZ.doc.apply("remove", from, to);
    DZ.doc.goTo(Math.max(1, Math.min(from, DZ.doc.scene.lastFrame() || 1)));
    dzSetStatus(" Frames quitados de la capa activa");
    return;
  }
  if (!DZ.anim || !DZ.anim.frames.length) return;
  const selection = DZ.timelineSelection || { from: DZ.anim.idx, to: DZ.anim.idx };
  const from = Math.max(0, Math.min(selection.from, DZ.anim.frames.length - 1));
  const to = Math.max(from, Math.min(selection.to, DZ.anim.frames.length - 1));
  const paths = DZ.anim.frames.slice(from, to + 1);
  if (paths.length >= DZ.anim.frames.length) return dzSetStatus("La escena debe conservar al menos un fotograma");
  const label = paths.length === 1 ? "este cuadro" : `los ${paths.length} cuadros seleccionados`;
  if (!(await dzConfirmModal(`¿Borrar ${label}? (no se puede deshacer)`, { ok: "Borrar", danger: true }))) return;
  dzAnimStopIf();
  let result = null;
  for (let i = paths.length - 1; i >= 0; i--) {
    result = await api.del_frame(paths[i]);
    if (result && result.error) return sysMsg(" " + result.error);
  }
  DZ.timelineSelection = null;
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
  if (result && result.path) await openDesign(result.path);
  dzTimelineReveal();
  await dzTimelineRefresh();
  dzOnionUpdate();
  dzSetStatus(`${paths.length} fotograma(s) eliminados`);
}

/* ══ 🔄 modo espejo: lápiz/pincel/pluma dibujan también reflejados sobre el
   eje vertical del lienzo — para personajes y diseños simétricos ══ */
function dzMirrorToggle() {
  DZ.mirror = !DZ.mirror;
  const b = $("#dzMirror"); if (b) b.classList.toggle("active", DZ.mirror);
  dzMirrorGuideRender();
  dzSetStatus(DZ.mirror ?
    "🔄 Modo espejo ACTIVADO: cada trazo se duplica reflejado (eje vertical del lienzo)" :
    "🔄 Modo espejo desactivado");
}
/* El eje de simetría tiene que VERSE. Sin la línea, el modo espejo era
   adivinanza: recién al soltar el trazo se descubría dónde caía el centro y con
   qué quedaba alineado el reflejo. La guía es UI de pantalla (clase dz-penui):
   no entra en el documento, ni en el export, ni en la exposición del cuadro.
   Doble trazo (claro debajo, punteado encima) para que se lea igual sobre fondo
   blanco que sobre uno negro, y stroke sin escalar para que no engorde al zoom. */
function dzMirrorGuideRender() {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  if (!svg) return;
  svg.querySelector(":scope > g.dz-mirror-guide")?.remove();
  if (!DZ.mirror) return;
  const vb = dzVB();
  const x = vb[0] + vb[2] / 2, y1 = vb[1], y2 = vb[1] + vb[3];
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "dz-penui dz-mirror-guide");
  g.setAttribute("pointer-events", "none");
  g.innerHTML =
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#fff" stroke-opacity=".55"` +
    ` stroke-width="3" vector-effect="non-scaling-stroke"/>` +
    `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#e0553f" stroke-opacity=".95"` +
    ` stroke-width="1" stroke-dasharray="8 6" vector-effect="non-scaling-stroke"/>`;
  svg.appendChild(g);
}
function dzMirrorClone(el) {
  if (!DZ.mirror || !el || !el.parentNode) return null;
  const vb = dzVB();
  const c = el.cloneNode(true);
  const own = el.getAttribute("transform") || "";
  c.setAttribute("transform",
    `translate(${(2 * (vb[0] + vb[2] / 2)).toFixed(1)} 0) scale(-1 1)` + (own ? " " + own : ""));
  el.parentNode.insertBefore(c, el.nextSibling);
  return c;
}

/* ──  fotograma clave con IA: describís el movimiento, el modelo dibuja la pose ── */
function dzAIKeyModal() {
  if (!DZ.anim) {
    dzAnimToggle().then(() => {
      if (DZ.anim) dzAIKeyModal();
      else dzSetStatus("Abrí o creá un diseño antes de generar una secuencia IA");
    });
    return;
  }
  openModal(`<h2> Secuencia de fotogramas con IA</h2>
    <div class="sub">El modelo parte del cuadro actual y genera una secuencia progresiva.
    Cada resultado se incorpora inmediatamente a la Timeline y sirve de referencia para el siguiente.</div>
    <textarea id="aiKeyTxt" class="cmp-field" rows="3" spellcheck="false"
      placeholder="ej: «el personaje levanta el brazo derecho y mira hacia arriba», «la pelota toca el piso y se aplasta»"></textarea>
    <div class="dz-ai-seq-options">
      <label>Cantidad de frames
        <input id="aiKeyCount" class="cmp-field" type="number" min="1" max="24" value="6">
      </label>
      <label><input id="aiKeyMark" type="checkbox" checked> marcar el último como fotograma clave</label>
    </div>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="aiKeyGo"> Generar e incorporar</button>
    </div>`);
  $("#mCancel").onclick = closeModal;
  $("#aiKeyGo").onclick = async () => {
    const txt = $("#aiKeyTxt").value.trim();
    const count = Math.max(1, Math.min(24, +$("#aiKeyCount").value || 1));
    const markLast = $("#aiKeyMark").checked;
    closeModal();
    if (!txt) return;
    await dzPersist();
    let currentPath = DZ.path;
    const generated = [];
    for (let i = 0; i < count; i++) {
      dzSetStatus(`IA generando frame ${i + 1}/${count}…`);
      const stepPrompt = `${txt}\nEste es el paso ${i + 1} de ${count} de la secuencia. ` +
        `Avanzá solo una fracción natural del movimiento; mantené continuidad exacta con el frame anterior` +
        (i === count - 1 ? " y completá la acción en este frame final." : ". No completes todavía la acción final.");
      const r = await api.ai_keyframe(currentPath, stepPrompt);
      if (r && r.error) {
        dzSetStatus(`La IA se detuvo en ${i}/${count}: ${r.error}`);
        break;
      }
      if (!r || !r.path) break;
      currentPath = r.path;
      generated.push(r.path);
    }
    if (!generated.length) return;
    DZ.anim.cache = {};
    DZ.scene = DZ.scene || {}; DZ.scene.keys = DZ.scene.keys || [];
    const num = dzFrameNum(currentPath);
    if (markLast && !DZ.scene.keys.includes(num)) {
      DZ.scene.keys.push(num); DZ.scene.keys.sort((a, b) => a - b);
    }
    dzSceneSave();
    try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (e) { /* */ }
    await openDesign(currentPath);
    dzTimelineReveal();
    await dzTimelineRefresh();
    dzOnionUpdate();
    dzAnimSetView("timeline");
    dzSetStatus(`${generated.length} frame(s) generados por IA e incorporados a la Timeline · último: ${num}`);
  };
}

/* reproducir: precarga los cuadros y los cicla a 12 fps */
function dzSetPlayButton(playing) {
  const button = $("#tlPlay");
  if (!button) return;
  button.innerHTML = `<svg class="ico ico-fill"><use href="#${playing ? "i-pause" : "i-play"}"/></svg>`;
  button.title = playing ? "Pausar" : "Reproducir";
}
async function dzPlayToggle() {
  // Desde la migración a Scene/Document, la reproducción profesional vive en
  // Playback. El transporte superior debe manejar el mismo estado que X-sheet
  // y Timeline; el reproductor de SVG sueltos queda solo para escenas legacy.
  if (DZ.doc) {
    if (!DZ.playback) await dzTlMount();
    if (DZ.playback) {
      if (!DZ.playback.playing) dzDocCommit();
      dzPlaybackBindUI(); DZ.playback.toggle(); return;
    }
  }
  return dzAnimPlay();
}

function dzPlaybackBindUI() {
  if (!DZ.playback || DZ.playbackUiBound === DZ.playback) return;
  if (DZ.playbackUiUnsub) DZ.playbackUiUnsub();
  DZ.playbackUiBound = DZ.playback;
  DZ.playbackUiUnsub = DZ.playback.subscribe((playback) => {
    dzSetPlayButton(playback.playing);
    const index = Math.max(0, (playback.doc ? playback.doc.frame : 1) - 1);
    dzPlaybackHead(index);
    dzPushAnimationPanelPlayback(index, playback.playing);
  });
  dzSetPlayButton(DZ.playback.playing);
}
async function dzAnimPlay() {
  if (!DZ.anim) return;
  if (DZ.anim.playing) return dzAnimStop();
  await dzPersist();
  const cv = $("#dzCanvas");
  for (const f of DZ.anim.frames) {
    if (!DZ.anim.cache[f]) {
      const r = await api.image_data(f);
      if (r && r.svg) DZ.anim.cache[f] = r.svg;
    }
  }
  dzOnionClear();
  $("#dzCam").hidden = true;                     // el encuadre no se dibuja: SE VE por él
  DZ.anim.playing = true;
  DZ.anim.previewIdx = DZ.anim.idx;
  dzSetPlayButton(true);
  dzTlGridRender();
  const [lo, hi] = dzPlayRange();                // rango In/Out (0-based, inclusive)
  const loop = DZ.anim.loop !== false;
  let i = (DZ.anim.idx >= lo && DZ.anim.idx <= hi) ? DZ.anim.idx : lo;
  const fps = Math.max(1, Math.min(60, +($("#tlFps") && $("#tlFps").value) || 12));
  const throughCam = dzHasCam();                 // hay claves de cámara  play POR cámara
  DZ.anim.timer = setInterval(() => {
    if (i >= hi) {                               // llegó al final del rango
      if (!loop) { dzAnimStop(); return; }
      i = lo;
    } else i++;
    let svgTxt = DZ.anim.cache[DZ.anim.frames[i]];
    if (svgTxt && throughCam) {
      svgTxt = dzRigView(svgTxt, dzFrameNum(DZ.anim.frames[i]));
      svgTxt = dzCamView(svgTxt, dzCamAt(dzFrameNum(DZ.anim.frames[i])));
    }
    if (svgTxt) {
      const old = cv.querySelector(":scope > svg");
      const tmp = document.createElement("div"); tmp.innerHTML = svgTxt;
      const ns = tmp.querySelector("svg");
      if (old && ns) { if (!ns.getAttribute("width") || throughCam) ns.style.width = old.style.width || "min(80vw, 900px)"; old.replaceWith(ns); dzApplyZoom(); }
    }
    document.querySelectorAll("#tlFrames .tl-frame").forEach((c, k) => c.classList.toggle("cur", k === i));
    DZ.anim.previewIdx = i;
    dzPlaybackHead(i);
    dzPushAnimationPanelPlayback(i, true);
  }, 1000 / fps);
}

function dzPlaybackHead(index) {
  document.querySelectorAll(".dz-tlg-col[data-i], .dz-tlg-cell[data-i]").forEach(el =>
    el.classList.toggle("cur", +el.dataset.i === index));
  document.querySelectorAll(".dz-xs-row").forEach((row, i) => row.classList.toggle("cur", i === index));
  const status = $("#sbFrame");
  if (!status) return;
  const total = DZ.doc ? (DZ.doc.scene.lastFrame() || 1) : (DZ.anim ? DZ.anim.frames.length : 1);
  status.textContent = `cuadro ${index + 1}/${total}`;
}
/* rango de reproducción/export [lo,hi] 0-based inclusive, según In/Out de la
   barra (In 1-based; Out 1-based, 0 = hasta el final), clamp a los cuadros */
function dzPlayRange() {
  const n = DZ.anim ? DZ.anim.frames.length : 1;
  let lo = (+($("#tlIn") && $("#tlIn").value) || 1) - 1;
  let out = +($("#tlOut") && $("#tlOut").value) || 0;
  let hi = out > 0 ? out - 1 : n - 1;
  lo = Math.max(0, Math.min(lo, n - 1));
  hi = Math.max(lo, Math.min(hi, n - 1));
  return [lo, hi];
}
function dzAnimStopIf() { if (DZ.anim && DZ.anim.playing) dzAnimStop(); }
function dzAnimStop() {
  if (!DZ.anim || !DZ.anim.playing) return;
  clearInterval(DZ.anim.timer);
  DZ.anim.playing = false;
  delete DZ.anim.previewIdx;
  dzSetPlayButton(false);
  dzPushAnimationPanelPlayback(DZ.anim.idx, false);
  dzTlGridRender();
  dzGoFrame(DZ.anim.idx);   // volver al cuadro editable real
}

/* ── panel de capas: lista de elementos, reordenar (z), mostrar/ocultar ── */
/* ══ ESPACIO 3D: visor tipo Blender para el multiplano ══════════════════════
   Cada capa (elemento de primer nivel del svg) es un PLANO flotando en
   profundidad — el mismo data-z del diorama y del export con parallax, ahora
   navegable: orbitás la escena, activás un plano y dibujás 2D sobre él
   (grease pencil de Blender). El truco que lo hace posible sin librerías:
   el browser proyecta solo los pointer events sobre elementos con CSS 3D,
   así que offsetX/offsetY llegan en coordenadas LOCALES del plano rotado. */
const DZ3D_DEPTH = 1.2;               // px de translateZ por unidad de data-z
const DZ3D_VIEWS = { persp: [-18, 28], front: [0, 0], top: [-89.9, 0], side: [0, 89.9] };

function dz3dToggle() {
  if (DZ.d3) return dz3dExit();
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return sysMsg("Abrí un diseño primero");
  DZ.d3 = { rx: -18, ry: 28, zoom: 0.65, panX: 0, panY: 30, act: -1, els: [] };
  $("#dz3DBtn").classList.add("active");
  dz3dBuild();
  dzSetStatus("Espacio 3D — con el lápiz dibujás DIRECTO en el aire desde cualquier ángulo (el plano se crea solo) · " +
    "arrastrá el fondo: orbitar · rueda: zoom al cursor · Shift/botón medio: panear · " +
    "doble clic: centrar · 1/3/7/5: vistas · Shift+A: plano · Esc: salir");
}

/* vuelve la cámara a su encuadre inicial (doble clic en el fondo o tecla F) */
function dz3dHome() {
  dz3dTween({ panX: 0, panY: 30, zoom: 0.65 });
}

/* navegación de cámara compartida: órbita con izquierdo (fondo) o DERECHO
   (en cualquier lado, incluso sobre un plano — el derecho JAMÁS dibuja);
   paneo con Shift+arrastre o botón medio */
function dz3dNavStart(e) {
  const d3 = DZ.d3, stage = $("#dz3dStage");
  if (!d3 || !stage) return;
  const pan = e.shiftKey || e.button === 1;
  const orbit = !pan && (e.button === 0 || e.button === 2);
  if (!orbit && !pan) return;
  const sx = e.clientX, sy = e.clientY;
  cancelAnimationFrame(d3._tw);                    // frenar tween en curso
  const base = { rx: d3.rx, ry: d3.ry, px: d3.panX, py: d3.panY };
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* pointer sintético */ }
  stage.classList.add("orbiting");
  const move = ev => {
    if (pan) { d3.panX = base.px + (ev.clientX - sx); d3.panY = base.py + (ev.clientY - sy); }
    else {
      d3.ry = base.ry + (ev.clientX - sx) * 0.4;
      d3.rx = Math.max(-90, Math.min(90, base.rx - (ev.clientY - sy) * 0.4));
      // órbita manual: ninguna vista predefinida queda "activa"
      stage.querySelectorAll(".dz3d-gizmo [data-v]").forEach(x => x.classList.remove("active"));
    }
    dz3dApply();
  };
  const up = () => {
    stage.removeEventListener("pointermove", move); stage.removeEventListener("pointerup", up);
    stage.classList.remove("orbiting");
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  e.preventDefault();
}

/* cambia a una vista predefinida con animación (gizmo o teclas 1/3/7/5) */
function dz3dView(v) {
  const [rx, ry] = DZ3D_VIEWS[v] || DZ3D_VIEWS.persp;
  dz3dTween({ rx, ry });
  const stage = $("#dz3dStage");
  if (stage) stage.querySelectorAll(".dz3d-gizmo [data-v]").forEach(x =>
    x.classList.toggle("active", x.dataset.v === v));
}

/* interpola la cámara hasta `to` (rx/ry/zoom/panX/panY) — la órbita deja de
   saltar en seco entre vistas: se siente fluida, estilo Feather */
function dz3dTween(to, ms = 280) {
  const d3 = DZ.d3; if (!d3) return;
  const from = { rx: d3.rx, ry: d3.ry, zoom: d3.zoom, panX: d3.panX, panY: d3.panY };
  // girar por el camino corto (persp→side no da la vuelta larga)
  let dry = ((to.ry !== undefined ? to.ry : from.ry) - from.ry) % 360;
  if (dry > 180) dry -= 360; if (dry < -180) dry += 360;
  const target = { ...from, ...to, ry: from.ry + dry };
  cancelAnimationFrame(d3._tw);
  const t0 = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);          // easeOutCubic
  const step = now => {
    if (!DZ.d3) return;                              // salió del 3D a mitad de camino
    const t = Math.min(1, (now - t0) / ms), k = ease(t);
    for (const p of ["rx", "ry", "zoom", "panX", "panY"])
      d3[p] = from[p] + (target[p] - from[p]) * k;
    dz3dApply();
    if (t < 1) d3._tw = requestAnimationFrame(step);
  };
  d3._tw = requestAnimationFrame(step);
}

/* snapshot de undo UNA sola vez por gesto (arrastre de Z/rotación/slider) */
function dz3dSnapOnce() {
  if (DZ.d3 && !DZ.d3._snap) { DZ.d3._snap = true; dzSnapshot(); }
}

/* fija la profundidad del pincel (slider vertical y Ctrl+rueda comparten esto)
   y actualiza el plano fantasma + el indicador */
function dz3dSetAirDepth(v) {
  const d3 = DZ.d3; if (!d3) return;
  d3.airDepth = Math.max(-400, Math.min(400, Math.round(v)));
  const s = $("#dz3dDepth"), lbl = $("#dz3dDepthVal");
  if (s) s.value = d3.airDepth;
  if (lbl) lbl.textContent = "z " + d3.airDepth;
  dz3dGhostUpdate();
}

/* reubica el plano fantasma: siempre mirando a cámara, a la profundidad del
   pincel — la confirmación VISUAL de dónde cae el próximo trazo al aire */
function dz3dGhostUpdate() {
  const g = $("#dz3dGhost"), d3 = DZ.d3;
  if (!g || !d3) return;
  const drawing = DZ.tool === "pencil" || DZ.tool === "brush";
  g.hidden = !drawing;
  if (!drawing) return;
  const rx = Math.round(-d3.rx), ry = Math.round(-d3.ry);
  const B = new DOMMatrix().rotateAxisAngle(1, 0, 0, rx).rotateAxisAngle(0, 1, 0, ry);
  const n = B.transformPoint(new DOMPoint(0, 0, 1, 0));
  const t = -(d3.airDepth || 0) * DZ3D_DEPTH;
  g.style.transform = `translate3d(${(n.x * t).toFixed(1)}px, ${(n.y * t).toFixed(1)}px, ${(n.z * t).toFixed(1)}px) ` +
    `rotateX(${rx}deg) rotateY(${ry}deg)`;
  const tag = $("#dz3dGhostTag");
  if (tag) tag.textContent = `⤓ pincel · z ${d3.airDepth || 0}`;
}

function dz3dKids(svg) {
  return [...svg.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())
    && !(n.classList && (n.classList.contains("dz-onion") || n.classList.contains("dz-penui"))));
}

/* ¿la capa es el FONDO del lienzo? (rect con relleno que cubre todo el viewBox).
   En 3D no es un "plano": se muestra fantasma para que no tape la escena ni
   se coma los trazos — en el archivo y en 2D queda intacto. */
function dz3dIsBackdrop(el, vb) {
  if (!el || el.tagName.toLowerCase() !== "rect") return false;
  const f = el.getAttribute("fill");
  if (!f || f === "none") return false;
  const [x0, y0, W, H] = vb || DZ.d3.vb || [0, 0, 1080, 1080];
  const x = +el.getAttribute("x") || 0, y = +el.getAttribute("y") || 0;
  const w = +el.getAttribute("width") || 0, h = +el.getAttribute("height") || 0;
  return w >= W * 0.95 && h >= H * 0.95 && x <= x0 + W * 0.05 && y <= y0 + H * 0.05;
}

// aplica clase al stage según la herramienta (solo en dibujo bloquea otros planos)
function dz3dApplyToolClass() {
  const stage = $("#dz3dStage");
  if (!stage) return;
  const drawing = DZ.tool === "pencil" || DZ.tool === "brush" || DZ.tool === "pen";
  stage.classList.toggle("tool-draw", drawing);
  dz3dGhostUpdate();               // el fantasma solo se ve con lápiz/pincel
}

function dz3dBuild() {
  const cv = $("#dzCanvas");
  const svg = cv.querySelector(":scope > svg");
  if (!svg || !DZ.d3) return;
  const old = $("#dz3dStage"); if (old) old.remove();
  svg.style.visibility = "hidden";
  $("#dzHandle").hidden = true; $("#dzRotate").hidden = true;

  // lienzo vacío: crear un plano base para que se pueda dibujar ya
  if (!dz3dKids(svg).length) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("data-low", "plano");
    svg.appendChild(g);
  }
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  const W = vb[2] || 1080, H = vb[3] || 1080;
  const G = Math.max(W, H) * 1.6;                       // tamaño del piso/ejes

  DZ.d3.vb = vb;                                        // para reglas y manejador Z
  const stage = document.createElement("div");
  stage.id = "dz3dStage";
  stage.classList.add("show-mesh", "show-rulers");
  stage.innerHTML = `
    <div class="dz3d-world" id="dz3dWorld">
      <div class="dz3d-grid" style="width:${G}px;height:${G}px;margin-left:${-G / 2}px;margin-top:${-G / 2}px;transform:translateY(${H / 2}px) rotateX(90deg)"></div>
      <div class="dz3d-axis ax-x" style="width:${G}px;margin-left:${-G / 2}px;transform:translateY(${H / 2}px)"></div>
      <div class="dz3d-axis ax-y" style="height:${G}px;margin-top:${-G / 2}px"></div>
      <div class="dz3d-axis ax-z" style="width:${G}px;margin-left:${-G / 2}px;transform:translateY(${H / 2}px) rotateY(90deg)"></div>
      <div class="dz3d-zhandle" id="dz3dZH" hidden
        title="Manejador del eje Z: arrastrá para acercar/alejar el plano activo en profundidad">
        <span class="zh-a">▲</span><span class="zh-z">Z</span><span class="zh-a">▼</span>
      </div>
      <div class="dz3d-rothandle" id="dz3dRotH" hidden
        title="Rotar el plano activo: arrastrá horizontal (eje Y) o vertical (eje X) · doble clic lo endereza"></div>
    </div>
    <div class="dz3d-gizmo">
      <span class="dz3d-axlbl x" title="Eje X (ancho del lienzo)">X</span>
      <span class="dz3d-axlbl y" title="Eje Y (alto del lienzo)">Y</span>
      <span class="dz3d-axlbl z" title="Eje Z (profundidad · data-z)">Z</span>
      <button data-v="persp" class="active" title="Vista en perspectiva">Persp</button>
      <button data-v="front" title="De frente (como el lienzo plano)">Frente</button>
      <button data-v="top" title="Desde arriba: se ve la separación en Z">Arriba</button>
      <button data-v="side" title="De costado: los planos de perfil">Lado</button>
      <span class="vsep"></span>
      <button class="dz3d-add" title="Agregar un plano nuevo frente a la cámara para dibujar"> Plano</button>
      <span class="vsep"></span>
      <button data-t="mesh" class="active" title="Malla de edición: grilla sobre el plano activo">Malla</button>
      <button data-t="rulers" class="active" title="Reglas X·Y en unidades del lienzo sobre el plano activo">Reglas</button>
      <button class="dz3d-x" title="Salir del espacio 3D">${icoUse("i-x")}</button>
    </div>
    <div class="dz3d-zbar" id="dz3dZbar" hidden>
      <span class="dz3d-zname" id="dz3dZname"></span>
      <span class="dz3d-orbadge" id="dz3dOrBadge" title="Eje/orientación del plano activo"></span>
      <span class="dz3d-axlbl z">Z</span>
      <input type="range" id="dz3dZr" min="-60" max="400" step="1" value="0"
        title="Profundidad del plano activo: negativo = más cerca de la cámara, 0 = plano de acción, positivo = fondo">
      <input type="number" id="dz3dZn" min="-60" max="400" step="1" value="0" class="dz-win">
      <span class="vsep"></span>
      <span class="dz-hint">orientar</span>
      <button class="dz3d-or" data-or="front" title="Frente (mira al frente, como el lienzo plano)">Frente</button>
      <button class="dz3d-or" data-or="floor" title="Piso (acostado, horizontal)">Piso</button>
      <button class="dz3d-or" data-or="left" title="Pared izquierda">◀</button>
      <button class="dz3d-or" data-or="right" title="Pared derecha"></button>
      <button class="dz3d-or" data-or="face" title="Girar el plano para que mire de frente a la cámara actual (billboard)">↺ cámara</button>
    </div>
    <div class="dz3d-hud" id="dz3dHud">
      <span><b>lápiz</b> dibuja en el aire</span><span><b>⌖</b> apuntá a un trazo: ancla ahí</span>
      <span><b>Ctrl+rueda</b> profundidad del lápiz</span>
      <span><b>arrastrar</b> orbitar</span><span><b>rueda</b> zoom</span>
      <span><b>Shift·medio</b> panear</span><span><b>2·clic</b> centrar</span>
      <span><b>1 3 7 5</b> vistas</span><span><b>Shift+A</b> plano</span><span><b>Esc</b> salir</span>
    </div>
    <div class="dz3d-coords" id="dz3dCoo" hidden></div>
    <div class="dz3d-cross" id="dz3dCross" hidden></div>
    <div class="dz3d-depth" id="dz3dDepthBox" title="Profundidad del pincel: dónde cae el próximo trazo al aire (también Ctrl+rueda)">
      <span class="dz3d-depth-lbl">⤓</span>
      <input type="range" id="dz3dDepth" min="-400" max="400" step="5" value="0">
      <span class="dz3d-depth-val" id="dz3dDepthVal">z 0</span>
      <button class="dz3d-depth-zero" id="dz3dDepth0" title="Pincel de vuelta a z 0">0</button>
    </div>`;
  cv.appendChild(stage);
  dz3dApplyToolClass();

  // ── planos: un svg por capa, con los defs (gradientes/filtros) clonados ──
  const world = $("#dz3dWorld");
  const kids = dz3dKids(svg);
  DZ.d3.els = kids;
  kids.forEach((el, i) => world.appendChild(dz3dMakeCard(el, i)));

  // ── plano FANTASMA del pincel: marco punteado donde cae el próximo trazo ──
  const ghost = document.createElement("div");
  ghost.id = "dz3dGhost";
  ghost.className = "dz3d-ghost";
  ghost.hidden = true;
  ghost.style.cssText = `width:${W}px;height:${H}px;margin-left:${-W / 2}px;margin-top:${-H / 2}px;`;
  ghost.innerHTML = `<span class="dz3d-ghost-tag" id="dz3dGhostTag"></span>`;
  world.appendChild(ghost);

  // ── controles de vista (con transición animada) ──
  stage.querySelectorAll(".dz3d-gizmo [data-v]").forEach(b =>
    b.onclick = () => dz3dView(b.dataset.v));
  stage.querySelector(".dz3d-x").onclick = () => dz3dExit();

  // ── órbita / paneo / zoom sobre el fondo ──
  const overUI = e => e.target.closest(".dz3d-card") || e.target.closest(".dz3d-gizmo") ||
    e.target.closest(".dz3d-zbar") || e.target.closest(".dz3d-hud");
  stage.addEventListener("pointerdown", e => {
    if (overUI(e)) return;
    // ── DIBUJO EN EL AIRE (Feather): con lápiz/pincel, arrastrar sobre el
    //    VACÍO crea (o reutiliza) un plano mirando a cámara y el trazo cae
    //    ahí, en el mismo gesto — se dibuja desde cualquier dirección ──
    const drawTool = DZ.tool === "pencil" || DZ.tool === "brush";
    if (drawTool && e.button === 0 && !e.shiftKey) { dz3dAirDraw(e); return; }
    dz3dNavStart(e);
  });
  stage.addEventListener("dblclick", e => {
    if (overUI(e)) return;
    dz3dHome();                                      // doble clic en el fondo = centrar
  });
  // ── coordenadas x·y·z EN VIVO bajo el cursor (con lápiz/pincel) ──
  // Muestra dónde va a caer el trazo; si hay un trazo existente bajo el
  // cursor se ancla ahí (⌖ cyan). Throttled: no recalcula en cada pixel.
  let cooT = 0;
  stage.addEventListener("pointermove", e => {
    const coo = $("#dz3dCoo"), cross = $("#dz3dCross");
    if (!coo || !cross) return;
    const drawingT = DZ.tool === "pencil" || DZ.tool === "brush";
    if (!drawingT || overUI(e)) { coo.hidden = true; cross.hidden = true; return; }
    const now = performance.now();
    if (now - cooT < 70) return;
    cooT = now;
    const d3 = DZ.d3;
    const vb = d3.vb || [0, 0, 1080, 1080];
    const W = vb[2] || 1080, H = vb[3] || 1080;
    const a = dz3dPickAnchor(e.clientX, e.clientY);
    let world = a && a.world;
    if (!world) {
      // sin ancla: el punto caería en el plano billboard, corrido según la
      // profundidad del lápiz (Ctrl+rueda) sobre el eje de visión
      const P = new DOMMatrix(); P.m34 = -1 / (parseFloat(getComputedStyle(stage).perspective) || 1400);
      const B = new DOMMatrix().rotateAxisAngle(1, 0, 0, Math.round(-d3.rx)).rotateAxisAngle(0, 1, 0, Math.round(-d3.ry));
      const n = B.transformPoint(new DOMPoint(0, 0, 1, 0));
      const t = -(d3.airDepth || 0) * DZ3D_DEPTH;
      const T = new DOMMatrix().translate(n.x * t, n.y * t, n.z * t).multiply(B);
      const M = P.translate(d3.panX, d3.panY).scale(d3.zoom)
        .rotateAxisAngle(1, 0, 0, d3.rx).rotateAxisAngle(0, 1, 0, d3.ry).multiply(T);
      const p = dz3dScreenToPlaneM(M, e.clientX, e.clientY);
      if (p) world = T.transformPoint(new DOMPoint(p.x, p.y, 0, 1));
    }
    if (!world) { coo.hidden = true; cross.hidden = true; return; }
    // coords en unidades del lienzo (x/y como las reglas, z como el slider)
    const X = Math.round(world.x + W / 2 + (vb[0] || 0));
    const Y = Math.round(world.y + H / 2 + (vb[1] || 0));
    const Zu = Math.round(-world.z / DZ3D_DEPTH);
    coo.textContent = `x ${X} · y ${Y} · z ${Zu}` + (a ? "  ⌖ anclado" :
      (d3.airDepth ? "  ⤓ prof. lápiz" : ""));
    coo.classList.toggle("anch", !!a);
    coo.hidden = false;
    const sr2 = stage.getBoundingClientRect();
    cross.style.left = (e.clientX - sr2.left) + "px";
    cross.style.top = (e.clientY - sr2.top) + "px";
    cross.classList.toggle("anch", !!a);
    cross.hidden = false;
  });
  stage.addEventListener("pointerleave", () => {
    const coo = $("#dz3dCoo"), cross = $("#dz3dCross");
    if (coo) coo.hidden = true;
    if (cross) cross.hidden = true;
  });
  stage.addEventListener("contextmenu", e => e.preventDefault());
  stage.addEventListener("wheel", e => {
    // ── Ctrl+rueda = PROFUNDIDAD DEL LÁPIZ (el "cursor 3D" de Blender):
    //    mueve el plano de dibujo sobre el eje de visión de la cámara.
    //    La rueda sola sigue siendo zoom (dolly) — viajar y dibujar en
    //    profundidad son dos controles distintos, como en Feather. ──
    if (e.ctrlKey) {
      e.preventDefault();
      dz3dSetAirDepth((DZ.d3.airDepth || 0) + (e.deltaY > 0 ? 10 : -10));
      dzSetStatus(`Profundidad del pincel: z ${DZ.d3.airDepth} — el marco punteado muestra dónde cae el trazo (apuntar a tinta ⌖ la pisa)`);
      return;
    }
    e.preventDefault();
    // zoom AL CURSOR: el punto bajo el puntero queda quieto (no al centro)
    const d3 = DZ.d3, r = stage.getBoundingClientRect();
    const cx = e.clientX - (r.left + r.width / 2), cy = e.clientY - (r.top + r.height / 2);
    const z2 = Math.max(0.12, Math.min(3, d3.zoom * (e.deltaY < 0 ? 1.1 : 0.9)));
    const f = z2 / d3.zoom;
    d3.panX = cx - (cx - d3.panX) * f;
    d3.panY = cy - (cy - d3.panY) * f;
    d3.zoom = z2;
    dz3dApply();
  }, { passive: false });

  // ── toggles de malla y reglas ──
  stage.querySelectorAll(".dz3d-gizmo [data-t]").forEach(b => b.onclick = () => {
    const on = stage.classList.toggle("show-" + b.dataset.t);
    b.classList.toggle("active", on);
  });
  // ── nuevo plano + presets de orientación (dibujar 2D en 3D tipo Feather) ──
  stage.querySelector(".dz3d-add").onclick = dz3dAddPlane;
  stage.querySelectorAll(".dz3d-or").forEach(b => b.onclick = () => {
    // "face" (billboard) rota el plano ACTIVO para que mire a cámara
    if (b.dataset.or === "face") {
      const i = DZ.d3.act; if (i < 0) return;
      dz3dSnapOnce(); dz3dSetRot(i, -DZ.d3.rx, -DZ.d3.ry, true); DZ.d3._snap = false;
      dz3dAxisBadge();
      dzSetStatus("Plano orientado a la cámara — dibujá de frente");
      return;
    }
    // Los demás presets (Piso/Pared/Frente) CREAN un nuevo plano con esa orientación
    dz3dAddOrientedPlane(b.dataset.or);
  });

  // ── slider vertical de profundidad del pincel (stylus-friendly) ──
  $("#dz3dDepth").addEventListener("input", e => {
    dz3dSetAirDepth(+e.target.value);
    dzSetStatus(`Profundidad del pincel: z ${DZ.d3.airDepth}`);
  });
  $("#dz3dDepth0").onclick = () => { dz3dSetAirDepth(0); dzSetStatus("Pincel de vuelta al plano de acción (z 0)"); };

  // ── barra Z (slider) + manejador Z arrastrable — deshacibles con Ctrl+Z ──
  $("#dz3dZr").addEventListener("input", e => { dz3dSnapOnce(); dz3dSetZ(DZ.d3.act, e.target.value, false); });
  $("#dz3dZr").addEventListener("change", e => { dz3dSetZ(DZ.d3.act, e.target.value, true); DZ.d3._snap = false; });
  $("#dz3dZn").addEventListener("change", e => { dz3dSnapOnce(); dz3dSetZ(DZ.d3.act, e.target.value, true); DZ.d3._snap = false; });
  const zh = $("#dz3dZH");
  zh.addEventListener("pointerdown", e => {
    e.stopPropagation(); e.preventDefault();
    const i = DZ.d3.act; if (i < 0) return;
    dz3dSnapOnce();
    const z0 = parseFloat(DZ.d3.els[i].getAttribute("data-z")) || 0;
    const dir = dz3dZDir();                       // eje Z del mundo, en px de pantalla
    const L2 = dir.x * dir.x + dir.y * dir.y;
    const sx = e.clientX, sy = e.clientY;
    zh.setPointerCapture(e.pointerId);
    zh.classList.add("drag");
    const move = ev => {
      // proyecta el arrastre sobre la dirección del eje Z en pantalla;
      // de frente (el eje apunta a cámara) cae al arrastre vertical
      const dz = L2 < 0.01 ? (sy - ev.clientY) * 0.8
        : ((ev.clientX - sx) * dir.x + (ev.clientY - sy) * dir.y) / L2;
      dz3dSetZ(i, z0 + dz, false);
    };
    const up = () => {
      zh.removeEventListener("pointermove", move); zh.removeEventListener("pointerup", up);
      zh.classList.remove("drag");
      dz3dSetZ(i, +$("#dz3dZr").value, true);
      DZ.d3._snap = false;
    };
    zh.addEventListener("pointermove", move);
    zh.addEventListener("pointerup", up);
  });
  // ── manejador de ROTACIÓN del plano activo (): horizontal=Y, vertical=X ──
  const rh = $("#dz3dRotH");
  rh.addEventListener("pointerdown", e => {
    e.stopPropagation(); e.preventDefault();
    const i = DZ.d3.act; if (i < 0) return;
    dz3dSnapOnce();
    const [rx0, ry0] = dz3dRot(DZ.d3.els[i]);
    const sx = e.clientX, sy = e.clientY;
    rh.setPointerCapture(e.pointerId);
    rh.classList.add("drag");
    const move = ev => {
      let ry = ry0 + (ev.clientX - sx) * 0.5;
      let rx = rx0 - (ev.clientY - sy) * 0.5;
      if (ev.shiftKey) { ry = Math.round(ry / 15) * 15; rx = Math.round(rx / 15) * 15; }
      rx = Math.max(-90, Math.min(90, rx)); ry = Math.max(-180, Math.min(180, ry));
      dz3dSetRot(i, rx, ry, false);
    };
    const up = () => {
      rh.removeEventListener("pointermove", move); rh.removeEventListener("pointerup", up);
      rh.classList.remove("drag");
      const [rx, ry] = dz3dRot(DZ.d3.els[i]);
      dz3dSetRot(i, rx, ry, true);
      DZ.d3._snap = false;
    };
    rh.addEventListener("pointermove", move);
    rh.addEventListener("pointerup", up);
  });
  rh.addEventListener("dblclick", e => {
    e.stopPropagation();
    if (DZ.d3.act >= 0) {
      dz3dSnapOnce(); dz3dSetRot(DZ.d3.act, 0, 0, true); DZ.d3._snap = false;   // enderezar
    }
  });

  dz3dApply();
  // activar SIEMPRE un plano al entrar para que la barra Z esté viva — pero
  // uno DIBUJABLE: preferir el <g> de más adelante y jamás el fondo del
  // lienzo (el rect blanco se auto-activaba y "no dibujaba nada")
  if (DZ.d3.act >= 0 && DZ.d3.act < kids.length && !dz3dIsBackdrop(kids[DZ.d3.act], vb)) {
    dz3dActivate(DZ.d3.act);
  } else if (kids.length) {
    let pick = -1;
    for (let i = kids.length - 1; i >= 0; i--) {
      if (dz3dIsBackdrop(kids[i], vb)) continue;
      if (pick < 0) pick = i;
      if (kids[i].tagName.toLowerCase() === "g") { pick = i; break; }
    }
    dz3dActivate(pick >= 0 ? pick : kids.length - 1);
  }
}

/* orientación 3D del plano (data-rot3d="rx,ry") — lo que hace que se pueda
   dibujar 2D sobre planos inclinados como Feather, no solo apilados en Z */
function dz3dRot(el) {
  const r = (el.getAttribute("data-rot3d") || "0,0").split(",").map(Number);
  return [r[0] || 0, r[1] || 0];
}
/* nombre legible de la orientación del plano (para el indicador de eje) */
function dz3dOrientName(el) {
  const [rx, ry] = dz3dRot(el);
  const near = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180) < 20;
  if (near(rx, 0) && near(ry, 0)) return "Frente (Z)";
  if (near(rx, 90) || near(rx, -90)) return "Piso (Y)";
  if (near(ry, 90) || near(ry, -90)) return "Pared (X)";
  return `libre ${Math.round(rx)}°/${Math.round(ry)}°`;
}
/* actualiza el indicador de eje/orientación del plano activo en la barra Z */
function dz3dAxisBadge() {
  const b = $("#dz3dOrBadge");
  if (!b || !DZ.d3 || DZ.d3.act < 0) { if (b) b.textContent = ""; return; }
  b.textContent = dz3dOrientName(DZ.d3.els[DZ.d3.act]);
}
function dz3dCardZ(card, el) {
  const z = parseFloat(el.getAttribute("data-z")) || 0;
  const [rx, ry] = dz3dRot(el);
  const [ox, oy, oz] = dz3dOff(el);
  // el plano se traslada (offset 3D + profundidad Z) y se orienta libremente;
  // se dibuja igual porque las coordenadas se proyectan con la misma matriz
  card.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, ${(oz - z * DZ3D_DEPTH).toFixed(1)}px) ` +
    `rotateX(${rx}deg) rotateY(${ry}deg)`;
  const tag = card.querySelector(".dz3d-tag");
  if (tag) tag.textContent = dzLayerLabel(el) + " · z=" + z +
    (rx || ry ? ` · ${Math.round(rx)}°/${Math.round(ry)}°` : "") +
    ((ox || oy || oz) ? " · ⌖" : "");
}
/* fija la orientación del plano i (presets y arrastre comparten esto) */
function dz3dSetRot(i, rx, ry, commit) {
  const d3 = DZ.d3; if (!d3 || i < 0) return;
  const el = d3.els[i];
  rx = Math.round(rx); ry = Math.round(ry);
  if (!rx && !ry) el.removeAttribute("data-rot3d");
  else el.setAttribute("data-rot3d", rx + "," + ry);
  const card = document.querySelector(`#dz3dWorld .dz3d-card[data-i="${i}"]`);
  if (card) dz3dCardZ(card, el);
  if (i === d3.act) dz3dZHandlePlace();
  if (commit) { DZ.dirty = true; dzPersist(); }
}
/* ── PROYECCIÓN pantalla→plano ──
   Matriz total del plano: perspective(stage) · mundo (pan·zoom·órbita) ·
   card (translateZ · rot3d). Como el plano es chato, el mapeo (u,v)→pantalla
   es una homografía 3x3 invertible: con ella dibujamos "en el aire" sin
   depender de offsetX (que solo existe si el evento cae sobre el plano). */
/* offset 3D del plano (data-off3d="x,y,z" en px del mundo) — permite que un
   plano pase por CUALQUIER punto del espacio, no solo por el eje del mundo:
   la base de la precisión al dibujar (anclar la profundidad donde apuntás) */
function dz3dOff(el) {
  const o = (el.getAttribute("data-off3d") || "0,0,0").split(",").map(Number);
  return [o[0] || 0, o[1] || 0, o[2] || 0];
}
/* matriz del plano en el espacio del MUNDO (sin cámara): offset + profundidad + orientación */
function dz3dCardMatrix(el) {
  const [ox, oy, oz] = dz3dOff(el);
  const z = parseFloat(el.getAttribute("data-z")) || 0;
  const [crx, cry] = dz3dRot(el);
  return new DOMMatrix()
    .translate(ox, oy, oz - z * DZ3D_DEPTH)
    .rotateAxisAngle(1, 0, 0, crx)
    .rotateAxisAngle(0, 1, 0, cry);
}
function dz3dPlaneMatrix(el) {
  const d3 = DZ.d3, stage = $("#dz3dStage");
  const persp = parseFloat(getComputedStyle(stage).perspective) || 1400;
  const P = new DOMMatrix();
  P.m34 = -1 / persp;                        // w = 1 − z/d (perspectiva CSS)
  return P.translate(d3.panX, d3.panY)
    .scale(d3.zoom)
    .rotateAxisAngle(1, 0, 0, d3.rx)
    .rotateAxisAngle(0, 1, 0, d3.ry)
    .multiply(dz3dCardMatrix(el));
}
/* núcleo de la proyección inversa: mouse → coords CENTRADAS del plano de
   matriz M (homografía 3x3 invertida por adjunta) */
function dz3dScreenToPlaneM(M, clientX, clientY) {
  const stage = $("#dz3dStage");
  if (!stage) return null;
  const r = stage.getBoundingClientRect();
  const mx = clientX - (r.left + r.width / 2);
  const my = clientY - (r.top + r.height / 2);
  const a = M.m11, b = M.m21, c = M.m41,
        d = M.m12, e = M.m22, f = M.m42,
        g = M.m14, h = M.m24, i = M.m44;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-9) return null;     // plano de canto: sin intersección útil
  const u = ((e * i - f * h) * mx + (c * h - b * i) * my + (b * f - c * e));
  const v = ((f * g - d * i) * mx + (a * i - c * g) * my + (c * d - a * f));
  const w = ((d * h - e * g) * mx + (b * g - a * h) * my + (a * e - b * d));
  if (Math.abs(w) < 1e-9) return null;
  return { x: u / w, y: v / w };
}
/* punto del mouse (clientX/Y) → coordenadas SVG del plano `el` */
function dz3dScreenToPlane(el, clientX, clientY) {
  const d3 = DZ.d3;
  if (!d3) return null;
  const p = dz3dScreenToPlaneM(dz3dPlaneMatrix(el), clientX, clientY);
  if (!p) return null;
  const vb = d3.vb || [0, 0, 1080, 1080];
  const W = vb[2] || 1080, H = vb[3] || 1080;
  return { x: p.x + W / 2 + (vb[0] || 0), y: p.y + H / 2 + (vb[1] || 0) };
}
/* distancia perpendicular de un punto 3D (mundo) al plano `el` */
function dz3dPlaneDist(el, p) {
  const [ox, oy, oz] = dz3dOff(el);
  const z = parseFloat(el.getAttribute("data-z")) || 0;
  const [crx, cry] = dz3dRot(el);
  const n = new DOMMatrix().rotateAxisAngle(1, 0, 0, crx).rotateAxisAngle(0, 1, 0, cry)
    .transformPoint(new DOMPoint(0, 0, 1, 0));           // normal (w=0: solo rota)
  return Math.abs(n.x * (p.x - ox) + n.y * (p.y - oy) + n.z * (p.z - (oz - z * DZ3D_DEPTH)));
}
/* punto de TINTA más cercano a (x,y) en coords del plano, o null si no hay
   nada a menos de `tol` — muestrea los trazos (bbox primero, después puntos) */
function dz3dNearestInk(root, x, y, tol) {
  let best = null, bestD = tol * tol;
  for (const g of root.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")) {
    let b; try { b = g.getBBox(); } catch (err) { continue; }
    if (x < b.x - tol || x > b.x + b.width + tol || y < b.y - tol || y > b.y + b.height + tol) continue;
    if (typeof g.getTotalLength !== "function") continue;
    let L; try { L = g.getTotalLength(); } catch (err) { continue; }
    if (!L) continue;
    const step = Math.max(4, L / 300);
    for (let s = 0; s <= L; s += step) {
      const q = g.getPointAtLength(s);
      const dd = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y);
      if (dd < bestD) { bestD = dd; best = { x: q.x, y: q.y }; }
    }
  }
  return best;
}
/* busca BAJO EL CURSOR un punto de dibujo existente y devuelve su punto 3D
   en el mundo — el ancla de profundidad: el trazo nuevo pasa POR AHÍ, que es
   como Feather logra que dos trazos "se toquen" aunque los dibujes desde
   ángulos distintos. Si hay varios candidatos gana el más cercano a cámara. */
function dz3dPickAnchor(clientX, clientY) {
  const d3 = DZ.d3;
  if (!d3) return null;
  const vb = d3.vb || [0, 0, 1080, 1080];
  const W = vb[2] || 1080, H = vb[3] || 1080;
  let best = null;
  for (let i = 0; i < d3.els.length; i++) {
    const el = d3.els[i];
    if (dz3dIsBackdrop(el, vb)) continue;
    const p = dz3dScreenToPlane(el, clientX, clientY);
    if (!p) continue;
    const card = document.querySelector(`#dz3dWorld .dz3d-card[data-i="${i}"]`);
    const content = card && card.querySelector('[data-dz3d="content"]');
    const ink = content && dz3dNearestInk(content, p.x, p.y, 14);
    if (!ink) continue;
    // anclar al punto de TINTA exacto (no al cursor): el cruce es perfecto
    const local = new DOMPoint(ink.x - (vb[0] || 0) - W / 2, ink.y - (vb[1] || 0) - H / 2, 0, 1);
    const w = dz3dPlaneMatrix(el).transformPoint(local).w;   // menor w = más cerca
    if (!best || w < best.w) best = { w, world: dz3dCardMatrix(el).transformPoint(local), el };
  }
  return best;
}

/* commit de un trazo terminado sobre la capa `el` (índice idx): compartido
   por el dibujo sobre planos (wire) y el dibujo en el aire */
function dz3dCommitStroke(el, idx, pts, tool, drawColor, drawW) {
  if (pts.length < 3) return;
  dzSnapshot();
  const refined = dzRefineStroke(pts);
  let stroke;
  if (tool === "brush") stroke = dzStyleTag(dzBrushRibbon(refined, drawW, drawColor), "paint");
  else {
    stroke = document.createElementNS(SVGNS, "path");
    stroke.setAttribute("d", dzSmoothPath(refined));
    stroke.setAttribute("fill", "none");
    stroke.setAttribute("stroke", drawColor);
    stroke.setAttribute("stroke-width", drawW);
    stroke.setAttribute("stroke-linecap", "round");
    stroke.setAttribute("stroke-linejoin", "round");
    stroke.setAttribute("data-low", "pencil");
    dzStyleTag(stroke, "ink");
  }
  if (!stroke) return;
  if (el.tagName.toLowerCase() === "g") {
    el.appendChild(stroke);
    dzMirrorClone(stroke);                       // espejo en vivo también en 3D
    DZ.dirty = true; dzPersist();
    dz3dSyncCard(idx);
  } else {
    // capa suelta: el trazo se vuelve una capa hermana con la misma pose
    const z = el.getAttribute("data-z");
    if (z) stroke.setAttribute("data-z", z);
    const rot = el.getAttribute("data-rot3d");
    if (rot) stroke.setAttribute("data-rot3d", rot);
    const off = el.getAttribute("data-off3d");
    if (off) stroke.setAttribute("data-off3d", off);
    el.parentNode.insertBefore(stroke, el.nextSibling);
    const mir = dzMirrorClone(stroke);
    DZ.dirty = true; dzPersist();
    dz3dInsertCard(stroke, idx + 1);             // sin reconstruir el mundo
    if (mir) dz3dInsertCard(mir, idx + 2);
  }
  dzBuildLayers();
}

/* ── DIBUJO EN EL AIRE (gesto Feather): con lápiz/pincel, arrastrar sobre el
   vacío dibuja YA desde cualquier ángulo — se reutiliza el plano billboard
   que mira a la cámara actual (±8°) o se crea uno, y el trazo se proyecta
   al plano con dz3dScreenToPlane. Sin eventos sintéticos: matemática. ── */
function dz3dAirDraw(e) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const d3 = DZ.d3, stage = $("#dz3dStage");
  if (!svg || !d3 || !stage) return;
  const tool = DZ.tool === "brush" ? "brush" : "pencil";
  const rx = Math.round(-d3.rx), ry = Math.round(-d3.ry);
  // ANCLA DE PROFUNDIDAD: si apuntás a un trazo existente, el plano nuevo
  // pasa por ESE punto 3D — dos elipses dibujadas desde ángulos distintos se
  // cruzan donde las apuntaste, no cada una por su lado (precisión Feather)
  let anchor = dz3dPickAnchor(e.clientX, e.clientY);
  // sin tinta bajo el lápiz: manda la PROFUNDIDAD elegida con Ctrl+rueda
  // (offset sobre el eje de visión — el "cursor 3D")
  if (!anchor && d3.airDepth) {
    const n = new DOMMatrix().rotateAxisAngle(1, 0, 0, rx).rotateAxisAngle(0, 1, 0, ry)
      .transformPoint(new DOMPoint(0, 0, 1, 0));         // normal del billboard
    const t = -d3.airDepth * DZ3D_DEPTH;                 // + = fondo (misma escala que el slider Z)
    anchor = { world: new DOMPoint(n.x * t, n.y * t, n.z * t, 1) };
  }
  // ¿ya hay un plano <g> mirando a esta cámara? (±8°: no explotar en planos)
  const dAng = (p, q) => Math.abs(((p - q) % 360 + 540) % 360 - 180);
  const near = (p, q) => dAng(p, q) <= 8;
  const facing = el => {
    if (!el || el.tagName.toLowerCase() !== "g" || dz3dIsBackdrop(el, d3.vb)) return false;
    const [erx, ery] = dz3dRot(el);
    if (!near(erx, rx) || !near(ery, ry)) return false;
    // con ancla: además tiene que pasar cerca del punto anclado
    return !anchor || dz3dPlaneDist(el, anchor.world) <= 8;
  };
  // preferir el plano ACTIVO si sirve: el trazo que sigue cae en el mismo
  // plano que el anterior (continuidad), no en el primer <g> que matchee
  let idx = facing(d3.els[d3.act]) ? d3.act : d3.els.findIndex(facing);
  if (idx < 0) {
    dzSnapshot();
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("data-low", "plano");
    if (rx || ry) g.setAttribute("data-rot3d", rx + "," + ry);
    if (anchor) {
      const a = anchor.world;
      g.setAttribute("data-off3d", `${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)}`);
    }
    svg.appendChild(g);
    DZ.dirty = true;
    dz3dInsertCard(g, d3.els.length);
    idx = d3.els.length - 1;
    dzBuildLayers();
  }
  dz3dActivate(idx);
  const el = d3.els[idx];
  const card = document.querySelector(`#dz3dWorld .dz3d-card[data-i="${idx}"]`);
  const cs = card && card.querySelector("svg");
  if (!cs) return;
  const p0 = dz3dScreenToPlane(el, e.clientX, e.clientY);
  if (!p0) return;
  const ptrack = {};
  const pts = [[p0.x, p0.y, dzSmoothPressure(e.pressure || 0.5, ptrack)]];
  const drawColor = DZ.drawColor || (tool === "brush" ? "#E93D82" : "#F0450E");
  const drawW = DZ.drawW || 6;
  const live = document.createElementNS(SVGNS, "path");
  live.setAttribute("fill", "none");
  live.setAttribute("stroke", drawColor);
  live.setAttribute("stroke-width", drawW);
  live.setAttribute("stroke-linecap", "round");
  live.setAttribute("stroke-linejoin", "round");
  live.setAttribute("opacity", "0.85");
  cs.appendChild(live);
  try { stage.setPointerCapture(e.pointerId); } catch (err) { /* pointer sintético */ }
  const move = ev => {
    const evs = (ev.getCoalescedEvents && ev.getCoalescedEvents().length)
          ? ev.getCoalescedEvents() : [ev];
    for (const c of evs) {
      const p = dz3dScreenToPlane(el, c.clientX, c.clientY);
      if (p) pts.push([p.x, p.y, dzSmoothPressure(c.pressure || 0.5, ptrack)]);
    }
    live.setAttribute("d", "M " + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L "));
  };
  const up = () => {
    stage.removeEventListener("pointermove", move); stage.removeEventListener("pointerup", up);
    live.remove();
    dz3dCommitStroke(el, idx, pts, tool, drawColor, drawW);
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  e.preventDefault();
}

/* agrega un plano nuevo para dibujar, orientado frente a la cámara (billboard) */
function dz3dAddPlane() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg || !DZ.d3) return;
  dzSnapshot();
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("data-low", "plano");
  // frente a la cámara actual: contrarrestar la órbita del mundo
  const rx = Math.round(-DZ.d3.rx), ry = Math.round(-DZ.d3.ry);
  if (rx || ry) g.setAttribute("data-rot3d", rx + "," + ry);
  svg.appendChild(g);
  DZ.dirty = true;
  dz3dInsertCard(g, DZ.d3.els.length);            // sin reconstruir el mundo
  dz3dActivate(DZ.d3.els.length - 1);
  dzSetTool("pencil");
  dzSetStatus("Plano nuevo frente a la cámara — dibujá con lápiz/pincel. Orientalo con los presets o el manejador .");
}
/* Crea un NUEVO plano con orientación predefinida (front/floor/left/right)
   y orbita la cámara para verlo de frente y dibujar cómodo. */
function dz3dAddOrientedPlane(or) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg || !DZ.d3) return;
  const OR = { front: [0, 0], floor: [90, 0], left: [0, 90], right: [0, -90] };
  const VIEW = { front: [0, 0], floor: [-89.9, 0], left: [0, -90], right: [0, 90] };
  const NAMES = { front: "Frente (Z)", floor: "Piso (Y)", left: "Pared izquierda (X)", right: "Pared derecha (X)" };
  const [rx, ry] = OR[or] || [0, 0];
  dzSnapshot();
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("data-low", "plano");
  if (rx || ry) g.setAttribute("data-rot3d", rx + "," + ry);
  svg.appendChild(g);
  DZ.dirty = true;
  dz3dInsertCard(g, DZ.d3.els.length);            // sin reconstruir el mundo
  dz3dActivate(DZ.d3.els.length - 1);
  // orbitar (animado) para verlo de frente y dibujar cómodo
  const [vrx, vry] = VIEW[or] || [0, 0];
  dz3dTween({ rx: vrx, ry: vry });
  const stage = $("#dz3dStage");
  if (stage) stage.querySelectorAll(".dz3d-gizmo [data-v]").forEach(x => x.classList.remove("active"));
  dzSetTool("pencil");
  dzSetStatus("Plano nuevo: «" + (NAMES[or] || or) + "» — dibujá con lápiz. Orbitá con arrastre para ver la escena 3D.");
}

function dz3dApply() {
  const d3 = DZ.d3, w = $("#dz3dWorld");
  if (!d3 || !w) return;
  w.style.transform = `translate(${d3.panX}px, ${d3.panY}px) scale(${d3.zoom}) ` +
                      `rotateX(${d3.rx}deg) rotateY(${d3.ry}deg)`;
  dz3dGhostUpdate();               // el fantasma del pincel sigue a la cámara
  const sb = $("#sbZoom");
  if (sb) sb.textContent = Math.round(d3.zoom * 100) + "% · 3D " +
    Math.round(d3.rx) + "°/" + Math.round(d3.ry) + "°";
}

function dz3dActivate(i) {
  const d3 = DZ.d3; if (!d3) return;
  d3.act = i;
  document.querySelectorAll("#dz3dWorld .dz3d-card").forEach(c =>
    c.classList.toggle("act", +c.dataset.i === i));
  const el = d3.els[i];
  DZ.sel = el;                                   // props/rig/walk usan la selección
  const zb = $("#dz3dZbar");
  zb.hidden = false;
  $("#dz3dZname").textContent = dzLayerLabel(el);
  const z = parseFloat(el.getAttribute("data-z")) || 0;
  $("#dz3dZr").value = z; $("#dz3dZn").value = z;
  const zh = $("#dz3dZH"), rh = $("#dz3dRotH");
  if (zh) zh.hidden = false;
  if (rh) rh.hidden = false;
  dz3dZHandlePlace();
  dz3dAxisBadge();
  dz3dApplyToolClass();         // 🔒 refresca pointer-events según tool y plano activo
}

/* mueve el plano activo en el eje Z (slider, manejador y teclado comparten esto) */
function dz3dSetZ(i, z, commit) {
  const d3 = DZ.d3; if (!d3 || i < 0) return;
  const el = d3.els[i];
  z = Math.max(-60, Math.min(400, Math.round(+z || 0)));
  if (z === 0) el.removeAttribute("data-z"); else el.setAttribute("data-z", z);
  $("#dz3dZr").value = z; $("#dz3dZn").value = z;
  const card = document.querySelector(`#dz3dWorld .dz3d-card[data-i="${i}"]`);
  if (card) dz3dCardZ(card, el);
  if (i === d3.act) dz3dZHandlePlace();
  if (commit) { DZ.dirty = true; dzPersist(); dzZPanelRender(); }
}

/* dirección del eje Z del mundo en PANTALLA (px por unidad de data-z) */
function dz3dZDir() {
  const w = $("#dz3dWorld");
  const m = new DOMMatrix(getComputedStyle(w).transform);
  const o = m.transformPoint(new DOMPoint(0, 0, 0));
  const p = m.transformPoint(new DOMPoint(0, 0, -DZ3D_DEPTH));
  return { x: p.x - o.x, y: p.y - o.y };
}

/* pega los manejadores Z (derecha) y rotación (arriba-izq) al plano activo,
   compartiendo su profundidad y orientación para que floten sobre el plano */
function dz3dZHandlePlace() {
  const d3 = DZ.d3, zh = $("#dz3dZH"), rh = $("#dz3dRotH");
  if (!d3 || d3.act < 0) return;
  const el = d3.els[d3.act];
  const z = parseFloat(el.getAttribute("data-z")) || 0;
  const [rx, ry] = dz3dRot(el);
  const [ox, oy, oz] = dz3dOff(el);
  const W = (d3.vb && d3.vb[2]) || 1080, H = (d3.vb && d3.vb[3]) || 1080;
  const base = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, ${(oz - z * DZ3D_DEPTH).toFixed(1)}px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  if (zh) zh.style.transform = base + ` translate(${W / 2 + 30}px, 0)`;
  if (rh) rh.style.transform = base + ` translate(${-W / 2 - 30}px, ${-H / 2}px)`;
}

/* malla de edición + reglas X·Y + capa de guías del plano — UI del visor:
   vive SOLO en el svg del plano, jamás se guarda al archivo */
function dz3dPlaneUI(cs, vb, contentNode) {
  const [x0, y0, W, H] = [vb[0], vb[1], vb[2] || 1080, vb[3] || 1080];
  const mk = (tag, at) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in at) n.setAttribute(k, at[k]);
    return n;
  };
  const step = W > 1600 ? 100 : 50, major = step * 2;
  // malla (detrás del dibujo)
  const mesh = mk("g", { "data-dz3d": "mesh", class: "dz3d-mesh" });
  for (let x = x0; x <= x0 + W + 0.1; x += step)
    mesh.appendChild(mk("line", { x1: x, y1: y0, x2: x, y2: y0 + H,
      class: (x - x0) % major === 0 ? "mj" : "mn" }));
  for (let y = y0; y <= y0 + H + 0.1; y += step)
    mesh.appendChild(mk("line", { x1: x0, y1: y, x2: x0 + W, y2: y,
      class: (y - y0) % major === 0 ? "mj" : "mn" }));
  cs.appendChild(mesh);
  cs.appendChild(contentNode);
  // reglas: X arriba (rojo) · Y a la izquierda (verde), en unidades del lienzo
  const rul = mk("g", { "data-dz3d": "rulers", class: "dz3d-rulers" });
  rul.appendChild(mk("rect", { x: x0, y: y0, width: W, height: 17, class: "rbg" }));
  rul.appendChild(mk("rect", { x: x0, y: y0, width: 17, height: H, class: "rbg" }));
  for (let x = x0; x <= x0 + W + 0.1; x += step) {
    const mj = (x - x0) % major === 0;
    rul.appendChild(mk("line", { x1: x, y1: y0, x2: x, y2: y0 + (mj ? 13 : 7), class: "rx" }));
    if (mj && x > x0) {
      const t = mk("text", { x: x + 3, y: y0 + 13, class: "rt" });
      t.textContent = x; rul.appendChild(t);
    }
  }
  for (let y = y0; y <= y0 + H + 0.1; y += step) {
    const mj = (y - y0) % major === 0;
    rul.appendChild(mk("line", { x1: x0, y1: y, x2: x0 + (mj ? 13 : 7), y2: y, class: "ry" }));
    if (mj && y > y0) {
      const t = mk("text", { x: x0 + 3, y: y - 4, class: "rt" });
      t.textContent = y; rul.appendChild(t);
    }
  }
  cs.appendChild(rul);
  cs.appendChild(mk("g", { "data-dz3d": "guides" }));
  // superficie de dibujo: rect transparente que cubre TODO el plano y queda
  // arriba de todo  es siempre el target del puntero, así offsetX/offsetY caen
  // en coordenadas del plano (aunque esté rotado en 3D). fill=transparent recibe
  // eventos (a diferencia de fill=none). Es UI: no se guarda al archivo.
  cs.appendChild(mk("rect", { "data-dz3d": "surf", x: x0, y: y0, width: W, height: H,
                              fill: "transparent" }));
}

/* crea la card 3D de una capa: svg clonado (con defs), malla, reglas y
   superficie de dibujo. Compartida por dz3dBuild y dz3dInsertCard. */
function dz3dMakeCard(el, i) {
  const d3 = DZ.d3, vb = d3.vb;
  const W = vb[2] || 1080, H = vb[3] || 1080;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const defs = [...svg.children].filter(n => DZ_SKIP_TAGS.includes(n.tagName.toLowerCase()));
  const card = document.createElement("div");
  card.className = "dz3d-card";
  card.dataset.i = i;
  card.style.cssText = `width:${W}px;height:${H}px;margin-left:${-W / 2}px;margin-top:${-H / 2}px;`;
  const cs = document.createElementNS(SVGNS, "svg");
  cs.setAttribute("viewBox", vb.join(" "));
  cs.setAttribute("width", W); cs.setAttribute("height", H);
  defs.forEach(d => cs.appendChild(d.cloneNode(true)));
  const clone = el.cloneNode(true);
  clone.setAttribute("data-dz3d", "content");
  dz3dPlaneUI(cs, vb, clone);        // malla + contenido + reglas X·Y + guías
  card.appendChild(cs);
  const tag = document.createElement("span");
  tag.className = "dz3d-tag";
  card.appendChild(tag);
  if (dz3dIsBackdrop(el, vb)) card.classList.add("dz3d-bg");   // fondo: fantasma
  dz3dCardZ(card, el);
  dz3dWireCard(card, cs);
  return card;
}

/* inserta un plano nuevo en el mundo SIN reconstruir todo: la cámara no
   parpadea y los demás planos quedan intactos (antes cada trazo sobre una
   capa suelta reconstruía el espacio 3D completo) */
function dz3dInsertCard(el, idx) {
  const d3 = DZ.d3, world = $("#dz3dWorld");
  if (!d3 || !world) return;
  d3.els.splice(idx, 0, el);
  const cards = [...world.querySelectorAll(".dz3d-card")];
  const card = dz3dMakeCard(el, idx);
  if (cards[idx]) world.insertBefore(card, cards[idx]); else world.appendChild(card);
  // renumerar: los handlers leen data-i al momento del evento, así que basta
  [...world.querySelectorAll(".dz3d-card")].forEach((c, j) => c.dataset.i = j);
  if (d3.act >= idx) d3.act++;
  return card;
}

/* refresca el contenido del plano i desde el svg real (tras dibujar/mover) */
function dz3dSyncCard(i) {
  const d3 = DZ.d3; if (!d3) return;
  const card = document.querySelector(`#dz3dWorld .dz3d-card[data-i="${i}"]`);
  const el = d3.els[i];
  if (!card || !el) return;
  const cs = card.querySelector("svg");
  const clone = el.cloneNode(true);
  clone.setAttribute("data-dz3d", "content");
  cs.replaceChild(clone, cs.querySelector('[data-dz3d="content"]'));
  dz3dCardZ(card, el);
}

function dz3dWireCard(card, cs) {
  const surf = cs.querySelector('[data-dz3d="surf"]') || cs;
  surf.addEventListener("pointerdown", e => {
    e.stopPropagation();
    const d3 = DZ.d3;
    // botón derecho/medio/Shift SIEMPRE navegan, incluso sobre un plano —
    // el derecho jamás dibuja (antes pintaba si caía sobre el plano activo)
    if (e.button !== 0 || e.shiftKey) { e.preventDefault(); return dz3dNavStart(e); }
    // índice y capa se leen AL MOMENTO del evento (data-i): las cards pueden
    // renumerarse cuando se insertan planos nuevos sin reconstruir el mundo
    const i = +card.dataset.i;
    const el = d3.els[i];
    if (!el) return;
    const tool = DZ.tool || "select";
    const drawing = (tool === "pencil" || tool === "brush" || tool === "pen");
    // dibujar dibuja YA (activa + traza en el mismo gesto); mover/seleccionar
    // en un plano nuevo solo activa con el primer clic
    if (d3.act !== i) {
      dz3dActivate(i);
      if (!drawing) return;
    }

    // ── dibujo 2D sobre el plano activo (lápiz / pincel), en cualquier ángulo ──
    if (drawing) {
      // si el plano activo NO mira a la cámara (>25°), el trazo va al AIRE
      // (billboard): siempre dibujás donde estás mirando, como Feather.
      // Para dibujar SOBRE un plano inclinado, orientate a él primero
      // (presets Piso/Pared/Frente de la barra Z te orbitan solos).
      if (tool === "pencil" || tool === "brush") {
        const [crx, cry] = dz3dRot(el);
        const dAng = (p, q) => Math.abs(((p - q) % 360 + 540) % 360 - 180);
        if (Math.max(dAng(crx, -d3.rx), dAng(cry, -d3.ry)) > 25)
          return dz3dAirDraw(e);
      }
      // coordenadas por PROYECCIÓN (homografía), no por offsetX: un solo
      // camino matemático para dibujar sobre planos y en el aire, idéntico
      // en pywebview, Chrome y tests — y verificable
      const p0 = dz3dScreenToPlane(el, e.clientX, e.clientY);
      if (!p0) return;
      const ptrack = {};                             // buffer de presión de ESTE trazo
      const pts = [[p0.x, p0.y, dzSmoothPressure(e.pressure || 0.5, ptrack)]];
      const drawColor = DZ.drawColor || (tool === "pencil" ? "#F0450E" : tool === "pen" ? "#F0450E" : "#E93D82");
      const drawW = DZ.drawW || (tool === "pen" ? 2 : 6);
      const live = document.createElementNS(SVGNS, "path");
      live.setAttribute("fill", "none");
      live.setAttribute("stroke", drawColor);
      live.setAttribute("stroke-width", drawW);
      live.setAttribute("stroke-linecap", "round");
      live.setAttribute("stroke-linejoin", "round");
      live.setAttribute("opacity", "0.85");
      cs.appendChild(live);
      try { surf.setPointerCapture(e.pointerId); } catch (err) { /* pointer sintético */ }
      const move = ev => {
        // eventos coalescidos: el trazo captura TODOS los puntos intermedios
        // (misma fidelidad que el dibujo 2D, clave con tableta)
        const evs = (ev.getCoalescedEvents && ev.getCoalescedEvents().length)
          ? ev.getCoalescedEvents() : [ev];
        for (const c of evs) {
          const p = dz3dScreenToPlane(el, c.clientX, c.clientY);
          if (p) pts.push([p.x, p.y, dzSmoothPressure(c.pressure || 0.5, ptrack)]);
        }
        live.setAttribute("d", "M " + pts.map(p => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L "));
      };
      const up = () => {
        surf.removeEventListener("pointermove", move); surf.removeEventListener("pointerup", up);
        live.remove();
        dz3dCommitStroke(el, i, pts, tool, drawColor, drawW);
      };
      surf.addEventListener("pointermove", move);
      surf.addEventListener("pointerup", up);
      e.preventDefault();
      return;
    }

    // ── mover la capa DENTRO de su plano (ejes X·Y locales) con guías ──
    if (tool === "select" || tool === "direct") {
      const P0 = dz3dScreenToPlane(el, e.clientX, e.clientY);
      if (!P0) return;
      const sx = P0.x, sy = P0.y;
      const clone = cs.querySelector('[data-dz3d="content"]');
      const start = dzReadPos(clone);
      const guides = cs.querySelector('[data-dz3d="guides"]');
      const vb = (cs.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
      const [x0, y0, W, H] = [vb[0], vb[1], vb[2] || 1080, vb[3] || 1080];
      // guías inteligentes: centro y bordes del lienzo + centros de las otras capas
      let b0 = null;
      try { b0 = clone.getBBox(); } catch (err) { /* sin render */ }
      const tX = [x0 + W / 2], tY = [y0 + H / 2];
      document.querySelectorAll("#dz3dWorld .dz3d-card").forEach(c => {
        if (+c.dataset.i === i) return;
        try {
          const b = c.querySelector('[data-dz3d="content"]').getBBox();
          if (b.width || b.height) { tX.push(b.x + b.width / 2); tY.push(b.y + b.height / 2); }
        } catch (err) { /* vacía */ }
      });
      const SNAP = 8;
      let dx = 0, dy = 0;
      try { surf.setPointerCapture(e.pointerId); } catch (err) { /* pointer sintético */ }
      const move = ev => {
        const P = dz3dScreenToPlane(el, ev.clientX, ev.clientY);
        if (!P) return;
        dx = P.x - sx; dy = P.y - sy;
        guides.innerHTML = "";
        if (b0 && !ev.altKey) {                       // Alt = mover libre, sin imán
          const cx = b0.x + b0.width / 2 + dx, cy = b0.y + b0.height / 2 + dy;
          let gx = null, gy = null;
          for (const t of tX) if (Math.abs(cx - t) < SNAP) { dx += t - cx; gx = t; break; }
          for (const t of tY) if (Math.abs(cy - t) < SNAP) { dy += t - cy; gy = t; break; }
          if (gx === null && Math.abs(b0.x + dx - x0) < SNAP) { dx = x0 - b0.x; gx = x0; }
          if (gx === null && Math.abs(b0.x + b0.width + dx - (x0 + W)) < SNAP) { dx = x0 + W - b0.x - b0.width; gx = x0 + W; }
          if (gy === null && Math.abs(b0.y + dy - y0) < SNAP) { dy = y0 - b0.y; gy = y0; }
          if (gy === null && Math.abs(b0.y + b0.height + dy - (y0 + H)) < SNAP) { dy = y0 + H - b0.y - b0.height; gy = y0 + H; }
          const gl = (x1, y1, x2, y2) => {
            const l = document.createElementNS(SVGNS, "line");
            l.setAttribute("x1", x1); l.setAttribute("y1", y1);
            l.setAttribute("x2", x2); l.setAttribute("y2", y2);
            l.setAttribute("class", "dz3d-gl");
            guides.appendChild(l);
          };
          if (gx !== null) gl(gx, y0, gx, y0 + H);
          if (gy !== null) gl(x0, gy, x0 + W, gy);
        }
        dzWritePos(clone, start, dx, dy);
      };
      const up = () => {
        surf.removeEventListener("pointermove", move); surf.removeEventListener("pointerup", up);
        guides.innerHTML = "";
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        dzSnapshot();
        dzWritePos(el, dzReadPos(el), dx, dy);
        DZ.dirty = true; dzPersist();
        dz3dSyncCard(i);
      };
      surf.addEventListener("pointermove", move);
      surf.addEventListener("pointerup", up);
      e.preventDefault();
    }
  });
}

function dz3dExit(silent) {
  const stage = $("#dz3dStage"); if (stage) stage.remove();
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (svg) svg.style.visibility = "";
  $("#dz3DBtn").classList.remove("active");
  DZ.d3 = null;
  if (!silent) {
    dzPersist();
    dzBuildLayers();
    dzApplyZoom();
    dzSetStatus("Lienzo plano — la profundidad Z de cada capa quedó guardada (cámara multiplano/parallax)");
  }
}

const DZ_SKIP_TAGS = ["defs", "title", "desc", "style", "metadata", "lineargradient",
                      "radialgradient", "filter", "clippath", "mask", "symbol"];
function dzLayerLabel(el) {
  if (el.getAttribute("data-low-art") === "line") return "Línea";
  if (el.getAttribute("data-low-art") === "colour") return "Color";
  const t = el.tagName.toLowerCase();
  if (t === "text" || t === "tspan") return "T «" + (el.textContent || "").trim().slice(0, 16) + "»";
  if (el.id) return t + " #" + el.id;
  const f = el.getAttribute("fill");
  return t + (f && f !== "none" ? " · " + f : "");
}
/* Panel de capas por COLUMNAS estilo Toon Boom: visibilidad · candado ·
   color · nombre (con jerarquía padre/hijo) · opacidad · profundidad Z.
   La profundidad Z es la superposición del multiplano (parallax/diorama). */
function dzBuildLayers() {
  const box = $("#dzLayers");
  if (!box) return;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) { box.innerHTML = ""; return; }
  // Todo objeto pertenece a una capa real. Los SVG anteriores que todavía
  // tenían formas sueltas se organizan bajo Línea/Color al abrir el panel.
  if (!svg.querySelector(':scope > g[data-low-art]')) {
    const organized = dzArtEnsure(svg);
    if (organized?.changed) dzMarkDirty();
  }
  const kids = [...svg.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())
    && !(n.classList && (n.classList.contains("dz-onion") || n.classList.contains("dz-penui"))));
  if (!kids.length) { box.innerHTML = ""; return; }
  box.innerHTML =
    '<div class="dz-layers-h" title="Arrastrá para reordenar · Alt+soltar para agrupar · doble clic para renombrar">CAPAS <span class="dz-layers-count">' + kids.length + '</span></div>' +
    '<div class="dz-lay-head"><span title="Visible"></span><span title="Bloquear">🔒</span>' +
    '<span></span><span class="dz-lh-name">Nombre</span>' +
    '<span class="dz-lh-op" title="Opacidad %">OP</span>' +
    '<span class="dz-lh-z" title="Profundidad Z (superposición/multiplano)">Z</span></div>';
  // en DOM el último dibuja arriba  mostramos al frente primero (como Illustrator)
  // La jerarquía baja hasta el fondo: antes se mostraba UN solo nivel, asi que
  // un grupo dentro de un grupo desaparecia de la lista y no habia forma de
  // llegar a lo que tenia adentro.
  const MAX_HONDO = 8;   // tope de cortesia: una anidacion mas honda no se lee
  const bajar = (nodos, nivel) => {
    [...nodos].reverse().forEach(el => {
      box.appendChild(dzLayerRow(el, nivel));
      if (el.tagName.toLowerCase() !== "g") return;
      if (el.hasAttribute("data-collapsed")) return;     // plegado: no se abre
      if (nivel >= MAX_HONDO) return;
      const sub = [...el.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase()));
      if (sub.length) bajar(sub, nivel + 1);
    });
  };
  bajar(kids, 0);
  dzZPanelRender();   // el diorama refleja los cambios de capas al instante
}

function dzLayerRow(el, depth) {
  // Un grupo es carpeta a CUALQUIER profundidad: antes solo contaba en el
  // primer nivel, y los grupos anidados no tenian con que plegarse.
  const isGroup = el.tagName.toLowerCase() === "g"
    && [...el.children].some(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase()));
  const row = document.createElement("div");
  row.className = "dz-lay-row" + (el === DZ.sel ? " sel" : "") +
    (el === DZ.activeLayer ? " active-layer" : "") + (depth ? " child" : "") +
    (el.hasAttribute("data-low-art") ? " art-root" : "");
  row.dataset.nivel = String(depth);   // la sangria dice de quien cuelga
  row.draggable = true;   // reordenar y emparentar valen a cualquier profundidad
  //  visibilidad
  const hidden = el.getAttribute("display") === "none";
  const eye = document.createElement("span");
  eye.className = "dz-eye"; eye.textContent = hidden ? "◌" : "";
  eye.title = hidden ? "Mostrar" : "Ocultar";
  if (hidden) eye.style.opacity = ".4";
  eye.onclick = (e) => { e.stopPropagation(); dzSnapshot();
    hidden ? el.removeAttribute("display") : el.setAttribute("display", "none");
    dzMarkDirty(); dzBuildLayers(); };
  // 🔒 candado
  const locked = el.hasAttribute("data-locked");
  const lock = document.createElement("span");
  lock.className = "dz-eye"; lock.textContent = locked ? "🔒" : "🔓";
  lock.title = locked ? "Desbloquear" : "Bloquear";
  lock.style.opacity = locked ? "1" : "0.4";
  lock.onclick = (e) => { e.stopPropagation(); dzSnapshot();
    if (locked) el.removeAttribute("data-locked"); else el.setAttribute("data-locked", "1");
    if (!locked && el === DZ.sel) dzDeselect();
    dzMarkDirty(); dzBuildLayers(); };
  // ▦ color / disclosure de grupo
  const chip = document.createElement("span");
  if (isGroup) {
    const plegado = el.hasAttribute("data-collapsed");
    chip.className = "dz-lay-disc" + (plegado ? " plegado" : "");
    // el triangulo estaba VACIO: la carpeta se podia plegar pero no habia nada
    // que tocar, asi que en la practica no se podian esconder los subelementos
    chip.textContent = plegado ? "\u25b8" : "\u25be";
    const cuantos = [...el.children].filter(n => !DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())).length;
    chip.title = (plegado ? "Desplegar" : "Plegar") + " la carpeta (" + cuantos +
      (cuantos === 1 ? " elemento)" : " elementos)");
    chip.onclick = (e) => { e.stopPropagation();
      if (plegado) el.removeAttribute("data-collapsed");
      else el.setAttribute("data-collapsed", "1");
      dzBuildLayers(); };
  } else {
    chip.className = "dz-chipcolor";
    const f = el.getAttribute("fill"), st = el.getAttribute("stroke");
    chip.style.background = (f && f !== "none" ? f : st && st !== "none" ? st : "transparent");
  }
  // nombre (indentado si es hijo)
  const lbl = document.createElement("span");
  lbl.className = "dz-layer-t";
  lbl.style.paddingLeft = (depth * 12) + "px";
  lbl.textContent = el.hasAttribute("data-low-art") ? dzLayerLabel(el) : (el.id ? el.id : dzLayerLabel(el));
  lbl.ondblclick = async (e) => {
    e.stopPropagation();
    const name = await dzPromptModal("Nombre de la capa", "para vos y para el rig", el.id || "");
    if (name === null) return;
    dzSnapshot();
    const clean = name.trim().replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]/g, "_");
    if (clean) el.id = clean; else el.removeAttribute("id");
    dzMarkDirty(); dzBuildLayers();
  };
  // opacidad (columna Toon Boom)
  const op = document.createElement("input");
  op.className = "dz-lay-op"; op.type = "number"; op.min = 0; op.max = 100;
  const curOp = el.getAttribute("opacity");
  op.value = curOp == null ? 100 : Math.round(parseFloat(curOp) * 100);
  op.title = "Opacidad %";
  op.onclick = (e) => e.stopPropagation();
  op.onchange = (e) => { dzSnapshot();
    const v = Math.max(0, Math.min(100, +e.target.value || 0));
    if (v >= 100) el.removeAttribute("opacity"); else el.setAttribute("opacity", (v / 100).toFixed(2));
    dzMarkDirty(); };
  // profundidad Z (superposición / multiplano)
  const z = document.createElement("input");
  z.className = "dz-lay-z"; z.type = "number"; z.step = 10;
  z.value = parseFloat(el.getAttribute("data-z")) || 0;
  z.title = "Profundidad Z: negativo = cerca de cámara, 0 = plano de acción, positivo = fondo";
  z.onclick = (e) => e.stopPropagation();
  z.onchange = (e) => { dzSnapshot();
    const v = Math.max(-60, Math.min(400, Math.round(+e.target.value || 0)));
    if (v === 0) el.removeAttribute("data-z"); else el.setAttribute("data-z", v);
    dzMarkDirty(); dzBuildLayers(); };
  row.append(eye, lock, chip, lbl, op, z);
  row.onclick = () => {
    if (el.hasAttribute("data-locked")) return;
    DZ.activeLayer = el.tagName.toLowerCase() === "g" ? el : dzLayerOf(el);
    dzSelect(el);
    if (DZ.activeLayer) dzSetStatus("Capa activa: «" + (DZ.activeLayer.id || dzLayerLabel(DZ.activeLayer)) + "»");
  };
  row.oncontextmenu = e => {
    const oculto = el.getAttribute("display") === "none", bloqueado = el.hasAttribute("data-locked");
    if (!bloqueado) dzSelect(el);
    const renombrar = async () => {
      const nombre = await dzPromptModal("Nombre de la capa", "nombre", el.id || "capa");
      if (!nombre || nombre.trim() === (el.id || "")) return;
      dzSnapshot(); el.id = dzUniqueId(nombre.trim()); dzMarkDirty(); dzBuildLayers();
    };
    showCtxMenu(e, [
      { icon:oculto ? "◉" : "○", label:oculto ? "Mostrar" : "Ocultar", action:() => eye.click() },
      { icon:bloqueado ? "◇" : "▣", label:bloqueado ? "Desbloquear" : "Bloquear", action:() => lock.click() },
      { icon:"◇", label:"Renombrar…", action:renombrar },
      "separator",
      { icon:"⧉", label:"Duplicar capa", shortcut:"Ctrl+D", disabled:bloqueado, action:dzDuplicate },
      { icon:isGroup ? "⌁" : "▣", label:isGroup ? "Desagrupar" : "Agrupar selección", shortcut:isGroup ? "Ctrl+Shift+G" : "Ctrl+G", disabled:bloqueado, action:() => dzGroupSel(isGroup) },
      { icon:"╱", label:"Mover a Línea", disabled:bloqueado || el.hasAttribute("data-low-art"), action:() => dzArtMoveSelection("line") },
      { icon:"●", label:"Mover a Color", disabled:bloqueado || el.hasAttribute("data-low-art"), action:() => dzArtMoveSelection("colour") },
      { icon:"↑", label:"Subir", disabled:bloqueado, action:() => dzLayerMove(1) },
      { icon:"↓", label:"Bajar", disabled:bloqueado, action:() => dzLayerMove(-1) },
      { icon:"⇣", label:"Combinar hacia abajo", disabled:bloqueado, action:dzLayerMergeDown },
      "separator",
      { icon:"⌫", label:"Eliminar capa", shortcut:"Supr", disabled:bloqueado, action:dzDeleteSelected }
    ]);
  };
  {
    row.ondragstart = (e) => { DZ.dragLayer = el; e.dataTransfer.effectAllowed = "move"; };
    row.ondragover = (e) => { e.preventDefault(); row.classList.add("dz-dropover"); };
    row.ondragleave = () => row.classList.remove("dz-dropover");
    row.ondrop = (e) => {
      e.preventDefault(); row.classList.remove("dz-dropover");
      const src = DZ.dragLayer; DZ.dragLayer = null;
      if (!src || src === el || el.contains(src) || src.contains(el)) return;
      dzSnapshot();
      if (e.altKey) {
        if (el.tagName.toLowerCase() === "g") {
          el.appendChild(src);
          dzSetStatus(" «" + (src.id || src.tagName) + "» ahora es parte de «" + (el.id || "grupo") + "» — rota y se mueve con él");
        } else {
          const g = document.createElementNS(SVGNS, "g");
          el.parentNode.insertBefore(g, el);
          g.appendChild(el); g.appendChild(src);
          dzSetStatus(" Grupo nuevo con ambos — nombralo con doble clic (Ctrl+Shift+G desagrupa)");
        }
      } else {
        el.parentNode.insertBefore(src, el.nextSibling);
      }
      dzMarkDirty(); dzBuildLayers(); dzPositionHandle();
    };
  }
  return row;
}

/* ── acciones del panel de capas (estilo Photoshop) ── */
function dzLayerNew() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  dzSnapshot();
  const g = document.createElementNS(SVGNS, "g");
  g.id = dzUniqueId("capa");
  g.setAttribute("data-low-layer", "1");
  const host = DZ.activeLayer?.hasAttribute?.("data-low-layer") && DZ.activeLayer.parentNode
    ? DZ.activeLayer.parentNode : dzArtHost(svg);
  host.appendChild(g);                                  // arriba de su plano
  DZ.activeLayer = g;
  dzMarkDirty(); dzBuildLayers(); dzSelect(g);
  dzSetStatus("Capa nueva «" + g.id + "» al frente — dibujá o pegá adentro");
}
function dzUniqueId(base) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  let i = 1, id;
  do { id = base + i++; } while (svg && svg.querySelector("#" + CSS.escape(id)));
  return id;
}
/* combinar la capa activa con la de ABAJO (menor z-order) en un solo grupo */
function dzLayerMergeDown() {
  const el = DZ.sel; if (!el) return;
  const below = el.previousElementSibling;
  if (!below || DZ_SKIP_TAGS.includes(below.tagName.toLowerCase()))
    return dzSetStatus("No hay capa debajo para combinar");
  dzSnapshot();
  const g = document.createElementNS(SVGNS, "g");
  g.id = dzUniqueId("combinada");
  below.parentNode.insertBefore(g, below);
  g.appendChild(below); g.appendChild(el);             // debajo primero, activa encima
  dzMarkDirty(); dzBuildLayers(); dzSelect(g);
  dzSetStatus("Capas combinadas en «" + g.id + "»");
}
/* subir (+1, al frente) o bajar (-1, atrás) la capa activa en el orden de dibujo */
function dzLayerMove(dir) {
  const el = DZ.activeLayer?.isConnected && DZ.activeLayer.hasAttribute?.("data-low-layer")
    ? DZ.activeLayer : DZ.sel;
  if (!el || el.hasAttribute?.("data-low-art")) return dzSetStatus("Elegí una capa para reordenarla");
  dzSnapshot();
  let moved = false;
  if (dir > 0 && el.nextElementSibling) {
    el.parentNode.insertBefore(el, el.nextElementSibling.nextElementSibling);
    moved = true;
  } else if (dir < 0 && el.previousElementSibling) {
    el.parentNode.insertBefore(el, el.previousElementSibling);
    moved = true;
  }
  if (!moved) return dzSetStatus(dir > 0 ? "La capa ya está al frente" : "La capa ya está al fondo");
  dzMarkDirty(); dzBuildLayers(); dzPositionHandle();
  dzSetStatus(dir > 0 ? "Capa subida al frente" : "Capa bajada al fondo");
}
/* modo de fusión (mix-blend-mode) de la capa activa — la superposición de PS */
function dzLayerBlend(mode) {
  const el = DZ.sel; if (!el) return;
  dzSnapshot();
  const st = (el.getAttribute("style") || "").replace(/mix-blend-mode:[^;]+;?/g, "").trim();
  el.setAttribute("style", (st ? st + ";" : "") + (mode && mode !== "normal" ? "mix-blend-mode:" + mode : ""));
  if (!el.getAttribute("style")) el.removeAttribute("style");
  dzMarkDirty();
}
function dzLayerOpacity(v, commit) {
  const el = DZ.sel; if (!el) return;
  if (commit) dzSnapshot();
  const o = Math.max(0, Math.min(100, +v || 0));
  if (o >= 100) el.removeAttribute("opacity"); else el.setAttribute("opacity", (o / 100).toFixed(2));
  $("#dzLayOpacityLbl").textContent = o + "%";
  if (commit) { dzMarkDirty(); dzBuildLayers(); }
}
/* refleja fusión y opacidad de la capa activa en el panel */
function dzLayerToolsSync(el) {
  const bl = $("#dzBlend"), op = $("#dzLayOpacity"), lbl = $("#dzLayOpacityLbl");
  if (!bl || !el) return;
  const m = /mix-blend-mode:\s*([a-z-]+)/.exec(el.getAttribute("style") || "");
  bl.value = m ? m[1] : "normal";
  const o = el.getAttribute("opacity");
  const pct = o == null ? 100 : Math.round(parseFloat(o) * 100);
  op.value = pct; if (lbl) lbl.textContent = pct + "%";
  dzCompositorSync(el);
}

function dzLayersToggle() {
  const insp = $("#dzInspector");
  if (!insp) return;
  const hidden = insp.style.display === "none";
  insp.style.display = hidden ? "" : "none";
  dzSetStatus(hidden ? "" : "Panel de capas oculto (F7 para mostrarlo)");
}

/* ── alinear el elemento seleccionado respecto del lienzo (viewBox) ── */
/* ══ CHAT PLEGABLE ══════════════════════════════════════════════════════
   El área de dibujo tiene que ser la mayor parte de la pantalla. El chat vive
   plegado en una línea y se abre cuando se lo necesita. */
function dzDockPlegar(plegar) {
  const d = $("#dzDock");
  if (!d) return;
  d.classList.toggle("plegado", plegar !== false);
  if (plegar === false) { const p = $("#dzPrompt"); if (p) p.focus(); }
}
function dzDockWire() {
  const b = $("#dzDockToggle");
  if (b && !b.dataset.wired) { b.dataset.wired = "1"; b.onclick = () => dzDockPlegar(false); }
  const p = $("#dzPrompt");
  if (p && !p.dataset.wiredBlur) {
    p.dataset.wiredBlur = "1";
    // se pliega solo al salir, si no quedó nada escrito: no hay que acordarse
    // de cerrarlo
    p.addEventListener("blur", () => { if (!p.value.trim()) dzDockPlegar(true); });
    p.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // frenar el evento: si sigue subiendo, el Escape global CIERRA el editor
      // de diseño entero. Acá Escape solo pliega el chat.
      e.preventDefault();
      e.stopPropagation();
      p.blur();
      dzDockPlegar(true);
    });
  }
  if (!window.__dzDockKey) {
    window.__dzDockKey = true;
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dzDockPlegar($("#dzDock") && !$("#dzDock").classList.contains("plegado"));
      }
    });
  }
}

/* ══ SACAR UN PANEL ARRASTRÁNDOLO (estilo OpenToonz) ═════════════════════
   En OpenToonz se agarra la barra de título de un panel, se tira, y el panel
   se convierte en una ventana flotante que se puede llevar al otro monitor.
   Acá igual: cuando el arrastre se aleja lo suficiente del panel, se abre como
   ventana nativa (open_panel) y el panel acoplado se oculta.

   Se exige distancia — no basta con un clic — porque el mismo encabezado se
   usa para mover el panel dentro de la ventana. */
const DZ_DETACH_PX = 90;

function dzDragOutWire(cabecera, kind) {
  const head = typeof cabecera === "string" ? $(cabecera) : cabecera;
  if (!head || head.dataset.dragout === "1") return;
  head.dataset.dragout = "1";
  head.title = (head.title ? head.title + " · " : "") + "arrastrá para sacarlo a otra pantalla";
  head.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button, input, .dz-op-x")) return;
    const x0 = e.clientX, y0 = e.clientY;
    let aviso = null, disparado = false;
    const mover = (ev) => {
      const d = Math.hypot(ev.clientX - x0, ev.clientY - y0);
      if (d > 24 && !aviso) {
        aviso = document.createElement("div");
        aviso.className = "dz-dragout";
        aviso.textContent = "Soltá para sacarlo a otra ventana";
        document.body.appendChild(aviso);
      }
      if (aviso) {
        aviso.style.left = ev.clientX + 14 + "px";
        aviso.style.top = ev.clientY + 14 + "px";
        aviso.classList.toggle("listo", d > DZ_DETACH_PX);
      }
      if (d > DZ_DETACH_PX) disparado = true;
    };
    const soltar = () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      if (aviso) aviso.remove();
      if (disparado) dzDetachPanel(kind);
    };
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
  });
}

/** Engancha el arrastre en todos los paneles que se pueden separar. */
function dzDragOutAll() {
  // Deshabilitado: el desacople nativo no conserva todavía una experiencia
  // consistente de tamaño, posición y escala entre monitores.
}

function dzAnimationDock(visible) {
  dzPanelDockSetup();
  document.querySelectorAll(".dz-animation-dock").forEach(dock => {
    const panels = Array.from(dock.children).filter(el => !el.matches(".dz-dock-resizer,.dz-panel-splitter"));
    dock.hidden = !visible || !panels.length;
  });
  const view = $("#designView");
  if (view) view.classList.toggle("animation-workspace", !!visible);
}

function dzPanelDockSetup() {
  if (window.LOW_PANEL_DOCKING) return;
  window.LOW_PANEL_DOCKING = true;
  const view = $("#designView"), body = view && view.querySelector(".dz-body");
  const right = $("#dzAnimationDock"), canvas = $("#dzCanvas"), timeline = $("#dzTimeline");
  if (!view || !body || !right || !canvas || !timeline) return;
  right.dataset.zone = "right";
  const makeDock = (zone, before, parent) => {
    const dock = document.createElement(zone === "bottom" ? "section" : "aside");
    dock.className = "dz-animation-dock"; dock.dataset.zone = zone; dock.hidden = true;
    dock.setAttribute("aria-label", "Acople " + zone);
    parent.insertBefore(dock, before); return dock;
  };
  const camFields = ["toCamX", "toCamY", "toCamZoom", "toCamRot"];
  if (camFields.some(id => $("#" + id))) {
    const apply = () => {
      const vb = dzVB(), base = dzCamCur();
      dzCamSetKey({ ...base, cx: +$("#toCamX").value, cy: +$("#toCamY").value,
        w: vb[2] / Math.max(.05, +$("#toCamZoom").value / 100), rot: +$("#toCamRot").value });
    };
    camFields.forEach(id => { const el = $("#" + id); if (el) el.onchange = apply; });
    $("#toCamKey").onclick = () => { dzCamKeyToggle(); dzToolOptsRender(); };
    $("#toCamReset").onclick = () => { dzCamSetKey(dzCamDefault()); dzToolOptsRender(); };
  }
  const left = makeDock("left", canvas, body);
  const bottom = makeDock("bottom", timeline, view);
  const docks = { left, right, bottom };
  const dockSizes = (() => { try { return JSON.parse(dzPrefsStorage().getItem("low.2d.dockSizes") || "{}"); } catch (_) { return {}; } })();
  const sizeDock = (dock, value) => {
    const zone = dock.dataset.zone;
    if (zone === "bottom") {
      const px = Math.max(130, Math.min(Math.round(innerHeight * .55), value));
      dock.style.height = dock.style.flexBasis = px + "px";
      dockSizes.bottom = px;
    } else {
      const px = Math.max(190, Math.min(520, value));
      dock.style.width = dock.style.flexBasis = px + "px";
      dockSizes[zone] = px;
    }
    dzPrefsStorage().setItem("low.2d.dockSizes", JSON.stringify(dockSizes));
  };
  const wireDockResize = dock => {
    const zone = dock.dataset.zone;
    const handle = document.createElement("div");
    handle.className = "dz-dock-resizer";
    handle.setAttribute("role", "separator");
    handle.setAttribute("aria-label", zone === "bottom" ? "Cambiar altura de paneles" : "Cambiar ancho de paneles");
    handle.title = zone === "bottom" ? "Arrastrá para cambiar la altura" : "Arrastrá para cambiar el ancho";
    dock.appendChild(handle);
    if (dockSizes[zone]) sizeDock(dock, dockSizes[zone]);
    handle.addEventListener("pointerdown", e => {
      if (DZ.workspaceLocked || e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); handle.setPointerCapture?.(e.pointerId);
      const startX = e.clientX, startY = e.clientY;
      const start = zone === "bottom" ? dock.getBoundingClientRect().height : dock.getBoundingClientRect().width;
      document.body.classList.add("dz-resizing-dock");
      const move = ev => sizeDock(dock, zone === "bottom"
        ? start + startY - ev.clientY
        : start + (zone === "left" ? ev.clientX - startX : startX - ev.clientX));
      const up = () => {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
        document.body.classList.remove("dz-resizing-dock");
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    });
  };
  Object.values(docks).forEach(wireDockResize);
  const saved = (() => { try { return JSON.parse(dzPrefsStorage().getItem("low.2d.panelLayout") || "{}"); } catch (_) { return {}; } })();
  const save = (panel, place, rect) => {
    saved[panel.id] = { place, ...(rect || {}) };
    dzPrefsStorage().setItem("low.2d.panelLayout", JSON.stringify(saved));
  };
  const panelSizes = (() => { try { return JSON.parse(dzPrefsStorage().getItem("low.2d.panelSizes") || "{}"); } catch (_) { return {}; } })();
  /* Un panel OCULTO no ocupa lugar, así que tampoco tiene borde que arrastrar.
     Contarlos dejaba tiradas por la pantalla líneas de redimensionado con su
     cartelito —"Arrastrá para cambiar la altura del panel"— sobre un panel que
     no estaba, y mantenía abiertos muelles vacíos ocupando ancho de lienzo. */
  const panelesDe = dock => Array.from(dock.children)
    .filter(el => !el.matches(".dz-dock-resizer,.dz-panel-splitter"));
  const visiblesDe = dock => panelesDe(dock)
    .filter(el => !el.hidden && getComputedStyle(el).display !== "none");
  const refreshPanelSplitters = dock => {
    dock.querySelectorAll(":scope > .dz-panel-splitter").forEach(el => el.remove());
    const panels = panelesDe(dock);
    if (dock.dataset.zone === "bottom") panels.forEach(panel => {
      if (panelSizes[panel.id]?.w) panel.style.width = panelSizes[panel.id].w + "px";
    });
    else panels.forEach(panel => {
      if (panelSizes[panel.id]?.h) panel.style.height = panel.style.flexBasis = panelSizes[panel.id].h + "px";
    });
    visiblesDe(dock).slice(0, -1).forEach(panel => {
      const split = document.createElement("div");
      split.className = "dz-panel-splitter"; split.setAttribute("role", "separator");
      split.title = dock.dataset.zone === "bottom" ? "Arrastrá para cambiar el ancho del panel" : "Arrastrá para cambiar la altura del panel";
      panel.after(split);
      split.addEventListener("pointerdown", e => {
        if (DZ.workspaceLocked || e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        const horizontal = dock.dataset.zone === "bottom";
        const start = horizontal ? panel.getBoundingClientRect().width : panel.getBoundingClientRect().height;
        const origin = horizontal ? e.clientX : e.clientY;
        const move = ev => {
          const value = Math.max(horizontal ? 220 : 110, Math.min(horizontal ? 720 : 620,
            start + (horizontal ? ev.clientX : ev.clientY) - origin));
          if (horizontal) panel.style.width = panel.style.flexBasis = value + "px";
          else panel.style.height = panel.style.flexBasis = value + "px";
        };
        const up = () => {
          document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
          panelSizes[panel.id] = horizontal ? { w: panel.offsetWidth } : { h: panel.offsetHeight };
          dzPrefsStorage().setItem("low.2d.panelSizes", JSON.stringify(panelSizes));
        };
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
      });
    });
  };
  const updateDocks = () => Object.values(docks).forEach(d => {
    d.hidden = !visiblesDe(d).length || !DZ.anim;
  });
  /* Los paneles se muestran y se ocultan desde muchos lados (workspaces, menú
     Ventana, botones propios). En vez de acordarse de avisar en cada uno, se
     mira el atributo `hidden` de los hijos del muelle: si cambia, se rehacen
     las divisiones. El guardia evita el bucle, porque rehacerlas también
     modifica los hijos. */
  let recalculando = false;
  const recalcularMuelles = () => {
    if (recalculando) return;
    recalculando = true;
    requestAnimationFrame(() => {
      Object.values(docks).forEach(refreshPanelSplitters);
      updateDocks();
      recalculando = false;
    });
  };
  if (typeof MutationObserver === "function") {
    const vigia = new MutationObserver(recalcularMuelles);
    Object.values(docks).forEach(d => vigia.observe(d,
      { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true }));
  }
  const dockPanel = (panel, zone) => {
    panel.classList.remove("dz-panel-floating");
    panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = panel.style.width = panel.style.height = "";
    docks[zone].appendChild(panel); save(panel, zone); refreshPanelSplitters(docks[zone]); updateDocks();
  };
  const floatPanel = (panel, x, y, w, h) => {
    panel.classList.add("dz-panel-floating"); document.body.appendChild(panel);
    const leftPx = Math.max(8, Math.min(innerWidth - w - 8, x));
    const topPx = Math.max(8, Math.min(innerHeight - 80, y));
    Object.assign(panel.style, { left: leftPx + "px", top: topPx + "px", width: w + "px", height: h + "px" });
    save(panel, "float", { x: leftPx, y: topPx, w, h }); Object.values(docks).forEach(refreshPanelSplitters); updateDocks();
  };
  const overlay = document.createElement("div"); overlay.className = "dz-dock-overlay"; overlay.hidden = true;
  overlay.innerHTML = '<i data-zone="left">Izquierda</i><i data-zone="right">Derecha</i><i data-zone="bottom">Abajo</i>';
  document.body.appendChild(overlay);
  const targetAt = (x, y) => {
    const r = view.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    if (y > r.bottom - Math.max(150, r.height * .24)) return "bottom";
    if (x < r.left + Math.max(170, r.width * .18)) return "left";
    if (x > r.right - Math.max(170, r.width * .18)) return "right";
    return null;
  };
  const wire = (panel, head) => {
    if (!panel || !head || head.dataset.dockWire) return;
    head.dataset.dockWire = "1";
    head.title = "Arrastrá para mover · soltá sobre una zona resaltada para acoplar";
    const redock = document.createElement("button");
    redock.className = "dz-redock"; redock.type = "button"; redock.textContent = "Acoplar";
    redock.title = "Volver a acoplar a la derecha";
    redock.onclick = e => { e.stopPropagation(); dockPanel(panel, "right"); };
    head.insertBefore(redock, head.querySelector(".dz-op-x"));
    const external = document.createElement("button");
    external.className = "dz-external"; external.type = "button"; external.textContent = "Otra pantalla";
    external.title = "Abrir como ventana nativa para llevar a otro monitor";
    const panelKind = panel.id === "dzLevelStrip" ? "levelstrip"
      : panel.id === "dzOnionPanel" ? "onion"
      : panel.id === "dzRigPanel" ? "rig"
      : panel.id === "dzMocapPanel" ? "mocap"
      : panel.id === "dzColab" ? "colab" : "xsheet";
    if (panelKind !== "mocap" && panelKind !== "colab") {
      external.onclick = e => { e.stopPropagation(); dzDetachPanel(panelKind); };
      head.insertBefore(external, head.querySelector(".dz-op-x"));
    }
    head.addEventListener("pointerdown", e => {
      if (DZ.workspaceLocked) { dzSetStatus(" Disposición bloqueada · Ventana → Desbloquear disposición"); return; }
      if (e.button !== 0 || e.target.closest("button,input,.dz-op-x")) return;
      e.preventDefault(); e.stopPropagation();
      const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      let moved = false, zone = null;
      const move = ev => {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 5) return;
        if (!moved) { moved = true; floatPanel(panel, r.left, r.top, Math.max(220, r.width), Math.max(150, r.height)); overlay.hidden = false; }
        const nx = Math.max(8, Math.min(innerWidth - panel.offsetWidth - 8, ev.clientX - dx));
        const ny = Math.max(8, Math.min(innerHeight - 56, ev.clientY - dy));
        panel.style.left = nx + "px"; panel.style.top = ny + "px";
        zone = targetAt(ev.clientX, ev.clientY);
        overlay.querySelectorAll("i").forEach(i => i.classList.toggle("active", i.dataset.zone === zone));
      };
      const up = ev => {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
        overlay.hidden = true;
        if (!moved) return;
        if (zone) dockPanel(panel, zone);
        else save(panel, "float", { x: parseInt(panel.style.left), y: parseInt(panel.style.top), w: panel.offsetWidth, h: panel.offsetHeight });
      };
      document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
    });
    head.addEventListener("dblclick", () => { if (panel.classList.contains("dz-panel-floating")) dockPanel(panel, "right"); });
    if (window.ResizeObserver) new ResizeObserver(() => {
      if (!panel.classList.contains("dz-panel-floating")) return;
      save(panel, "float", { x: panel.offsetLeft, y: panel.offsetTop, w: panel.offsetWidth, h: panel.offsetHeight });
    }).observe(panel);
  };
  for (const [id, headId] of [["dzLevelStrip","dzLsHead"],["dzOnionPanel","dzOpHead"],
    ["dzXsheet","dzXsHead"],["dzRigPanel","dzRigHead"],["dzMocapPanel","dzMocapHead"],
    ["dzColab","dzColabHead"]]) {
    const panel = $("#" + id), head = $("#" + headId); if (!panel) continue;
    const cfg = saved[id];
    if (cfg && cfg.place === "float") floatPanel(panel, cfg.x || 80, cfg.y || 80, cfg.w || 260, cfg.h || 260);
    else dockPanel(panel, cfg && docks[cfg.place] ? cfg.place : "right");
    wire(panel, head);
  }
  updateDocks();
  DZ.panelDock = { dock: dockPanel, float: floatPanel, docks, update: updateDocks };
}

/* ══ TIRA DE DIBUJOS DEL NIVEL ══════════════════════════════════════════
   Muestra el MATERIAL (qué dibujos existen), no el tiempo. Un dibujo que no
   está en ninguna celda antes era invisible aunque existiera. */
/** STORYBOARD: monta el panel de paneles y el generador de tomas. Vive del
 *  mismo LowDoc que todo lo demás, así que lo que se decide acá se guarda con
 *  la escena y entra en Undo. */
async function dzSbMount() {
  const host = $("#dzSbBody");
  if (!host || !LOW.storyboard?.BoardView) return false;
  await dzDocInit();
  if (!DZ.doc) return false;
  if (!DZ.sbView) DZ.sbView = new LOW.storyboard.BoardView(host, DZ.doc);
  else DZ.sbView.setDoc(DZ.doc);
  DZ.sbView.status = (texto) => dzSetStatus(" " + texto);
  // Elegir un panel en la lista mueve el escenario: una sola verdad, sin dos
  // selecciones que puedan discrepar.
  DZ.sbView.onStage = async (id) => {
    DZ.sbView.selectedId = id;
    if (await dzSbStageOpen()) dzSbStageSync();
  };
  const panel = $("#dzStoryboard");
  if (panel) panel.hidden = false;
  DZ.sbView.render();
  const cerrar = $("#dzSbClose");
  if (cerrar && !cerrar.dataset.wired) {
    cerrar.dataset.wired = "1";
    cerrar.onclick = () => { if (panel) panel.hidden = true; LOW.workspace.panels?.update?.("storyboard", { visible: false }); };
  }
  return true;
}
/** ESCENARIO 3D de la toma. three.js se carga recién acá: 600 KB que no tienen
 *  por qué pesarle al arranque de quien nunca lo abre. */
async function dzSbStageOpen() {
  const raiz = $("#dzStoryboardStage"), host = $("#dzSbStageView");
  if (!raiz || !host || !LOW.storyboard?.StageView) return false;
  await dzDocInit();
  const info = $("#sbStageInfo");
  if (!DZ.sbStage) {
    if (info) info.textContent = "cargando el motor 3D…";
    DZ.sbStage = new LOW.storyboard.StageView(host, DZ.doc);
    // Mover o enfocar una figura vuelve por comando: entra en Undo y se guarda.
    DZ.sbStage.onCast = (cast, focoId, escribir) => {
      const board = DZ.sbStage.board; if (!board) return;
      const patch = { shot: { cast, focus: focoId || board.shot.focus } };
      if (escribir) DZ.doc.updateStoryboardBoard(board.id, patch, "Mover una figura del escenario");
      else DZ.doc.updateStoryboardBoard(board.id, { shot: { focus: focoId } }, "Enfocar una figura");
      DZ.sbStage.board = DZ.doc.scene.board(board.id);
      dzSbStageSync();
    };
  } else DZ.sbStage.setDoc?.(DZ.doc);
  raiz.hidden = false;
  try { await DZ.sbStage.mount(); }
  catch (error) {
    raiz.hidden = true;
    return dzSetStatus(" No se pudo abrir el escenario 3D: " + (error?.message || error));
  }
  DZ.sbStage.status = (t) => dzSetStatus(" " + t);
  dzSbStageWire();
  dzSbStagePark(true);
  dzSbStageSync();
  return true;
}
/** El panel del storyboard flota centrado sobre el lienzo y, con el escenario
 *  abierto, tapaba justo lo que hay que mirar. Se lo estaciona contra el borde
 *  mientras dura el escenario y se le devuelve su lugar al cerrarlo. */
function dzSbStagePark(parked) {
  const panel = $("#dzStoryboard"); if (!panel) return;
  if (parked) {
    if (DZ.sbPanelHome == null) DZ.sbPanelHome = panel.getAttribute("style") || "";
    panel.style.left = "12px";
    panel.style.top = "56px";
    panel.style.right = "auto";
  } else if (DZ.sbPanelHome != null) {
    panel.setAttribute("style", DZ.sbPanelHome);
    DZ.sbPanelHome = null;
  }
}
function dzSbStageClose() {
  const raiz = $("#dzStoryboardStage"); if (raiz) raiz.hidden = true;
  dzSbStagePark(false);
}
/** El escenario siempre muestra el panel elegido en la lista: una sola verdad. */
function dzSbStageSync() {
  const stage = DZ.sbStage; if (!stage || !DZ.doc) return;
  const id = DZ.sbView?.selectedId;
  const board = (id && DZ.doc.scene.board(id)) || DZ.doc.scene.storyboard.boards[0] || null;
  stage.setBoard(board);
  const info = $("#sbStageInfo"), pose = $("#sbStagePose"), alto = $("#sbStageAlto");
  const foco = board && stage._focused && stage._focused();
  if (pose && !pose.options.length)
    (LOW.animation.STAGE_POSES || []).forEach(p => pose.add(new Option(p.replace("-", " "), p)));
  if (pose) { pose.value = foco ? foco.pose : "de-pie"; pose.disabled = !foco; }
  if (alto) { alto.value = foco ? foco.height : 170; alto.disabled = !foco; }
  if (info) {
    if (!board) info.textContent = "no hay paneles: creá uno en el storyboard";
    else if (!foco) info.textContent = "escenario vacío · «+ Figura» pone a alguien delante de la cámara";
    else {
      const shots = LOW.storyboard.shots;
      const tipo = shots.SHOT_TYPES.find(t => t.id === board.shot.type);
      info.textContent = `${tipo ? tipo.name : board.shot.type} · ${board.shot.cast.length} figura(s)` +
        (board.drawingRef?.png ? " · con referencia" : "");
    }
  }
}
function dzSbStageWire() {
  if (DZ.sbStageWired) return;
  DZ.sbStageWired = true;
  const stage = () => DZ.sbStage;
  const modo = (m) => {
    stage().setMode(m);
    $("#sbStageEscenario").classList.toggle("on", m === "escenario");
    $("#sbStageCamara").classList.toggle("on", m === "camara");
  };
  $("#sbStageEscenario").onclick = () => modo("escenario");
  $("#sbStageCamara").onclick = () => modo("camara");
  $("#sbStageClose").onclick = dzSbStageClose;
  const editarFoco = (patch, label) => {
    const board = stage().board, foco = stage()._focused(); if (!board || !foco) return;
    const cast = board.shot.cast.map(f => f.id === foco.id ? { ...f, ...patch } : { ...f });
    DZ.doc.updateStoryboardBoard(board.id, { shot: { cast } }, label);
    stage().board = DZ.doc.scene.board(board.id); dzSbStageSync();
  };
  $("#sbStagePose").onchange = (e) => editarFoco({ pose: e.target.value }, "Cambiar la pose");
  $("#sbStageAlto").onchange = (e) => editarFoco({ height: +e.target.value || 170 }, "Cambiar la altura");
  $("#sbStageAdd").onclick = () => {
    const board = stage().board; if (!board) return dzSetStatus(" Creá un panel primero");
    const cast = board.shot.cast.map(f => ({ ...f }));
    const id = "fig_" + (cast.length + 1) + "_" + Math.random().toString(36).slice(2, 5);
    cast.push({ id, x: cast.length * 70, z: 0, height: 170, pose: "de-pie" });
    DZ.doc.updateStoryboardBoard(board.id, { shot: { cast, focus: cast.length === 1 ? id : board.shot.focus } },
      "Agregar una figura al escenario");
    stage().board = DZ.doc.scene.board(board.id); dzSbStageSync();
  };
  $("#sbStageDel").onclick = () => {
    const board = stage().board, foco = stage()._focused(); if (!board || !foco) return;
    const cast = board.shot.cast.filter(f => f.id !== foco.id).map(f => ({ ...f }));
    DZ.doc.updateStoryboardBoard(board.id, { shot: { cast, focus: cast[0]?.id || null } },
      "Quitar una figura del escenario");
    stage().board = DZ.doc.scene.board(board.id); dzSbStageSync();
  };
  $("#sbStageShot").onclick = () => {
    const board = stage().board; if (!board) return;
    const png = stage().capture(320);
    if (!png) return dzSetStatus(" El escenario todavía no tiene nada que fotografiar");
    DZ.doc.updateStoryboardBoard(board.id, { drawingRef: { kind: "stage", png } },
      "Tomar la referencia del panel");
    stage().board = DZ.doc.scene.board(board.id);
    dzSbStageSync(); DZ.sbView?.render();
    dzSetStatus(" Referencia guardada en el panel · el dibujo va encima, no la reemplaza");
  };
}

function dzStoryboardToggle() {
  const panel = $("#dzStoryboard");
  if (!panel) return;
  if (panel.hidden) void dzSbMount(); else panel.hidden = true;
}

/* ── FUNCTION EDITOR: la ventana de las curvas ─────────────────────────────
   El editor lee el modelo y escribe con los comandos del documento, así que
   Undo, guardado y reapertura funcionan sin que la vista guarde nada propio.
   Su cabeza lectora es el cuadro del documento: mover una es mover las tres
   —Timeline, X-sheet y curvas— porque hay un solo tiempo. */
function dzFnMount() {
  const host = $("#dzFnEditor");
  if (!host || !LOW.animation.FunctionEditor || !DZ.doc) return null;
  if (!DZ.fnView) {
    DZ.fnView = new LOW.animation.FunctionEditor(host, {
      getDoc: () => DZ.doc,
      onFrame: (f) => { if (DZ.doc) dzDocGoTo(f); },
      status: (t) => dzSetStatus(t),
      // el filtro "Selección" sigue al hueso activo del rig
      getSelection: () => DZ.rigSelectedId || null,
    });
  }
  DZ.fnView.setDoc(DZ.doc);
  DZ.fnView.render();
  return DZ.fnView;
}
function dzFnSetVisible(show) {
  const panel = $("#dzFnEditor");
  if (!panel) return;
  show = !!show && !dzIsPanelDetached("fn");
  panel.hidden = !show;
  if (show) dzFnMount();
}

function dzFnToggle() {
  const panel = $("#dzFnEditor");
  if (!panel) return;
  const abrir = panel.hidden;
  if (abrir && !DZ.doc) return dzSetStatus("Abrí una animación para ver sus curvas");
  dzFnSetVisible(abrir);
  dzSetStatus(abrir ? "Editor de funciones abierto" : "Editor de funciones cerrado");
}

function dzLsMount() {
  const host = $("#dzLsBody");
  if (!host || !LOW.animation.LevelStrip || !DZ.doc) return;
  if (!DZ.lsView) DZ.lsView = new LOW.animation.LevelStrip(host, DZ.doc);
  else DZ.lsView.setDoc(DZ.doc);
  const panel = $("#dzLevelStrip");
  if (panel) panel.hidden = false;
  DZ.lsView.render();
  const cerrar = $("#dzLsClose");
  if (cerrar && !cerrar.dataset.wired) {
    cerrar.dataset.wired = "1";
    cerrar.onclick = () => { $("#dzLevelStrip").hidden = true; };
  }
}

/* ══ TIMELINE NUEVA (sobre el modelo) ═══════════════════════════════════
   Se monta en el mismo cajón que la vieja. Las dos vistas —planilla vertical y
   timeline horizontal— leen el MISMO documento, así que lo que cambiás en una
   aparece en la otra sin sincronizar nada a mano. */
/* ══ AUDIO DE LA ESCENA ═════════════════════════════════════════════════
   Lo mínimo para animar con sonido: ver la onda frame a frame, escucharla
   sincronizada y encontrar la sílaba arrastrando. Los picos se guardan con la
   escena, así la onda sigue estando aunque el archivo no esté a mano. */
function dzAudioTrack() {
  if (!DZ.doc) return null;
  if (!DZ.doc.audio && LOW.animation.AudioTrack) {
    DZ.doc.audio = new LOW.animation.AudioTrack(DZ.doc);
  }
  return DZ.doc.audio || null;
}

function dzAudioWire() {
  const inp = $("#dzAudioFile");
  if (!inp || inp.dataset.wired) return;
  inp.dataset.wired = "1";
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    inp.value = "";
    if (!f) return;
    const track = dzAudioTrack();
    if (!track) return;
    try {
      dzSetStatus(" Analizando el audio…");
      await track.load(await f.arrayBuffer(), f.name);
      DZ.doc.touch();
      if (DZ.tlView) { DZ.tlView.audio = track; DZ.tlView.render(); }
      if (DZ.playback) DZ.playback.audio = track;
      dzSetStatus(" Audio cargado: " + f.name + " · " + track.peaks.length + " frames de onda");
    } catch (err) {
      sysMsg(" No pude leer ese audio: " + (err.message || err));
    }
  };
}

function dzAudioCargar() {
  dzAudioWire();
  const inp = $("#dzAudioFile");
  if (inp) inp.click();
}

function dzAudioQuitar() {
  const track = DZ.doc && DZ.doc.audio;
  if (!track) return;
  track.stop();
  DZ.doc.audio = null;
  if (DZ.tlView) { DZ.tlView.audio = null; DZ.tlView.render(); }
  if (DZ.playback) DZ.playback.audio = null;
  DZ.doc.touch();
  dzSetStatus(" Audio quitado");
}

async function dzTlMount() {
  const host = $("#dzTlgRows");
  if (!host || !LOW.animation.TimelineView) return;
  await dzDocInit();
  if (!DZ.playback) {
    DZ.playback = new LOW.animation.Playback(DZ.doc);
    DZ.playback.subscribe(() => {
      if (DZ.xsView) DZ.xsView.render();
      if (DZ.tlView) DZ.tlView.render();
    });
  } else DZ.playback.setDoc(DZ.doc);
  dzPlaybackBindUI();
  if (!DZ.tlView) DZ.tlView = new LOW.animation.TimelineView(host, DZ.doc);
  else DZ.tlView.setDoc(DZ.doc);
  DZ.tlView.playback = DZ.playback;
  DZ.tlView.audio = (DZ.doc && DZ.doc.audio) || null;
  DZ.tlView.onionEnabled = !!DZ.onionOn;
  DZ.tlView.toggleOnion = () => {
    DZ.onionOn = !DZ.onionOn;
    if (DZ.anim) DZ.anim.onion = DZ.onionOn;
    $("#tlOnion")?.classList.toggle("active", DZ.onionOn);
    dzOnion2Render(); dzOnionRender();
    DZ.tlView.onionEnabled = DZ.onionOn; DZ.tlView.render();
  };
  DZ.tlView.openOnion = () => {
    if (dzIsPanelDetached("onion")) return dzSetStatus("La mesa de luz está separada en otra ventana");
    DZ.onionOn = true; if (DZ.anim) DZ.anim.onion = true;
    dzOnionPanelSet(true); dzOnion2Render(); dzOnionRender();
  };
  DZ.tlView.loadAudio = dzAudioCargar;
  DZ.tlView.status = (message) => dzSetStatus(" " + message);
  // el encabezado de la vieja sobra: la nueva trae su propia regla de frames
  const head = document.querySelector("#dzTlGrid .dz-tlg-head");
  if (head) head.hidden = true;
  const cols = $("#dzTlgCols");
  if (cols) cols.innerHTML = "";
  DZ.tlView.render();
}

/* ══ GUARDAR Y ABRIR LA ESCENA ══════════════════════════════════════════
   La escena entera (niveles, dibujos, capas, exposiciones, fps, rango) va a UN
   archivo `.lowscene`. Antes cada frame era un .svg suelto y no había dónde
   guardar el timing: los holds y el rango se perdían al cerrar.

   El autoguardado local es la red de seguridad: si LOW se cierra mal, al
   reabrir se ofrece lo último. */
const DZ_SCENE_KEY = "low.scene.autosave";
function dzSceneRecoveryIdentity(doc = DZ.doc, tab = dzDocumentTabCurrent()) {
  const store = window.LOW?.workspace?.sceneRecovery;
  return store?.identity?.({
    path: doc?.path || tab?.path || DZ.path || "",
    sceneId: doc?.scene?.id || tab?.runtime?.doc?.scene?.id || ""
  }) || "";
}
function dzSceneRecoveryClear(doc = DZ.doc, tab = dzDocumentTabCurrent()) {
  const store = window.LOW?.workspace?.sceneRecovery;
  const identities = new Set([dzSceneRecoveryIdentity(doc, tab), tab?.recoveryIdentity].filter(Boolean));
  identities.forEach(identity => store?.clear?.(identity));
  if (tab) tab.recoveryIdentity = null;
}

/** Descarta por completo el documento activo y todo estado visual asociado.
 *  Es deliberadamente más fuerte que ocultar el módulo: un documento nuevo no
 *  puede heredar rig, cámara, selección, historial ni recuperación del anterior. */
function dzDocumentReset() {
  dzSceneRecoveryClear(DZ.doc, dzDocumentTabCurrent());
  if (DZ.anim?.playing) dzAnimStop();
  if (DZ.perf?.rec) dzPerfRecEnd(false);
  dzMocapResetSession({ closePanel: true });
  if (DZ.doc?.listeners?.clear) DZ.doc.listeners.clear();
  ["xsView", "tlView", "lsView", "palView"].forEach((key) => {
    try { DZ[key]?.dispose?.(); } catch (_) { /* la limpieza no debe bloquear */ }
    DZ[key] = null;
  });
  if (DZ.playbackUiUnsub) { DZ.playbackUiUnsub(); DZ.playbackUiUnsub = null; }
  if (DZ.playback?.stop) DZ.playback.stop();
  DZ.playback = null;
  DZ.doc = null;
  DZ.anim = null;
  DZ.scene = {};
  DZ.sel = null;
  DZ.multi = [];
  DZ.rigMode = false;
  DZ.rigSubmode = "build";
  DZ.rigNodeId = null;
  DZ.rigSelectedId = null;
  DZ.rigSelectionSource = null;
  DZ.rigConstraintId = null;
  DZ.rigLivePose = null;
  DZ.rigIKPreview = null;
  DZ.rigBoneTool = false;
  DZ.path = null;
  DZ.dirty = false;
  DZ.onionOn = false;
  $("#dzRigPanel")?.setAttribute("hidden", "");
  $("#dzRigOverlay")?.setAttribute("hidden", "");
  if ($("#dzRigOverlay")) $("#dzRigOverlay").innerHTML = "";
  $("#dzRigBtn")?.classList.remove("active");
  $("#tlRigOpen")?.classList.remove("active");
  $("#dzTimeline")?.setAttribute("hidden", "");
  $("#dzXs")?.setAttribute("hidden", "");
  dzDeselect();
}

/* ══ VIDEO DE REFERENCIA / MOTION CAPTURE ════════════════════════════════
   La pista pertenece al documento. El blob sólo sirve para previsualizar en
   esta sesión; al reabrir se conserva el análisis y se pide revincular el
   archivo fuente, evitando incrustar cientos de MB en una escena. */
function dzMocapTrack() {
  if (!DZ.doc || !LOW.animation.MotionCaptureTrack) return null;
  if (!DZ.doc.mocap) DZ.doc.mocap = new LOW.animation.MotionCaptureTrack(DZ.doc);
  return DZ.doc.mocap;
}
/** El video es un recurso de la sesion, no del documento. Esta limpieza evita
 *  que una mascara, un blob o una deteccion del archivo anterior reaparezca en
 *  un lienzo nuevo. Los datos persistentes siguen viviendo dentro del LowDoc. */
function dzMocapResetSession({ closePanel = false } = {}) {
  if (DZ.mocapAbort) {
    try { DZ.mocapAbort.abort(); } catch (_) { /* ya finalizado */ }
    DZ.mocapAbort = null;
  }
  const video = $("#mocapVideo");
  if (video) {
    try { video.pause(); } catch (_) { /* sin medio cargado */ }
    video.onloadedmetadata = null;
    video.removeAttribute("src");
    try { video.load(); } catch (_) { /* WebView sin backend multimedia */ }
    video.hidden = true;
  }
  if (DZ.mocapObjectUrl) {
    try { URL.revokeObjectURL(DZ.mocapObjectUrl); } catch (_) { /* blob ya revocado */ }
    DZ.mocapObjectUrl = null;
  }
  const input = $("#mocapVideoFile"); if (input) input.value = "";
  const canvas = $("#mocapSilhouette");
  if (canvas) {
    try { canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); } catch (_) { /* canvas no disponible */ }
    canvas.hidden = true;
    canvas.classList.remove("correcting", "placing-joint");
  }
  const subject = $("#mocapSubjectBox");
  if (subject) { subject.hidden = true; subject.removeAttribute("style"); }
  video?.parentElement?.classList.remove("marking");
  ["mocapCorrection", "mocapToLevel", "mocapPoseTools", "mocapPoseOptions",
    "mocapPoseStatus", "mocapApplyRig", "mocapNextPoseIssue"].forEach(id => {
      const el = $("#" + id); if (el) el.hidden = true;
    });
  $("#mocapPaint")?.classList.remove("active");
  $("#mocapErase")?.classList.remove("active");
  const overlay = $("#dzMocapSheet");
  if (overlay) {
    overlay.hidden = true;
    overlay.innerHTML = "";
    overlay.removeAttribute("viewBox"); overlay.removeAttribute("width"); overlay.removeAttribute("height");
    overlay.style.transform = "";
  }
  const status = $("#mocapStatus");
  if (status) status.textContent = "Importá una actuación para verla sincronizada con los cuadros.";
  if (closePanel) {
    const panel = $("#dzMocapPanel"); if (panel) panel.hidden = true;
    LOW.workspace?.panels?.hide?.("mocap");
  }
}
function dzMocapSync() {
  const video = $("#mocapVideo"), track = DZ.doc && DZ.doc.mocap;
  if (!video || !track || !track.source || !video.src || !video.duration) {
    dzMocapRenderSilhouette();
    return;
  }
  const t = Math.min(Math.max(0, track.timeAt(DZ.doc.frame, DZ.doc.scene.fps)), Math.max(0, video.duration - .001));
  if (Math.abs(video.currentTime - t) > .025) video.currentTime = t;
  dzMocapRenderSilhouette();
}
function dzMocapPoseStatus() {
  const track=DZ.doc?.mocap,options=$("#mocapPoseOptions"),status=$("#mocapPoseStatus"),apply=$("#mocapApplyRig"),nextPose=$("#mocapNextPoseIssue"),poseTools=$("#mocapPoseTools");
  if(!track||!LOW.animation.mocapPoseSequence){if(options)options.hidden=true;if(status)status.hidden=true;if(apply)apply.hidden=true;if(nextPose)nextPose.hidden=true;if(poseTools)poseTools.hidden=true;return null;}
  const interpolate=track.analysisOptions?.poseInterpolation!==false,sequence=LOW.animation.mocapPoseSequence(track,interpolate),report=LOW.animation.mocapPoseReport(track,sequence),contacts=LOW.animation.mocapFootContacts?.(sequence);
  const visible=report.observedFrames>0,missed=(track.poseAnalysis?.missedFrames||[]).length;if(options)options.hidden=!visible;if(status)status.hidden=!visible;if(apply)apply.hidden=!visible;
  if(nextPose)nextPose.hidden=!missed;if(poseTools)poseTools.hidden=!(visible||missed);
  if(status&&visible){const usable=Object.values(report.chainFrames).filter(Boolean).length,expanded=report.generatedFrames>report.observedFrames?` → ${report.generatedFrames} con completado`:"",origin=report.automaticFrames?` · ${report.automaticFrames} automáticos · ${report.manualFrames} revisados`:"",left=contacts?.ranges?.left?.length||0,right=contacts?.ranges?.right?.length||0,feet=left||right?` · apoyos ${left} izq./${right} der.`:"";
    status.textContent=`${report.observedJoints}/${report.totalJoints} articulaciones · ${report.observedFrames} cuadros con pose${expanded}${origin} · ${usable} cadenas utilizables${feet}`;}
  return {sequence,report,contacts};
}
function dzMocapIsIssue(data) {
  return !!data && !data.corrected && (!!data.occluded || (data.confidence != null && Number(data.confidence) < .45));
}
function dzMocapRenderSilhouette() {
  const canvas = $("#mocapSilhouette"), track = DZ.doc && DZ.doc.mocap;
  const frame = DZ.doc?.frame;
  const data = frame != null && track?.silhouetteAt?.(frame);
  const pose=frame != null&&track?.poseAt?.(frame);
  dzMocapPoseStatus();
  const poseMissing=frame!=null&&(track?.poseAnalysis?.missedFrames||[]).includes(frame);
  if (!canvas || (!data&&!pose&&!poseMissing)) {
    if (canvas) canvas.hidden = true;
    const tools=$("#mocapCorrection"); if(tools)tools.hidden=true;
    const toLevel=$("#mocapToLevel");if(toLevel)toLevel.hidden=true;
    dzMocapRenderCanvasGuide();
    return;
  }
  const source=track?.source||{},width=data?.width||Math.min(512,Math.max(192,source.width||192)),height=data?.height||Math.max(108,Math.round(width*(source.height||108)/(source.width||192)));
  canvas.width=width; canvas.height=height; canvas.hidden=false;
  const ctx=canvas.getContext("2d"),image=data?ctx.createImageData(data.width,data.height):null;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  if(data&&LOW.animation.decodeMocapMask){const mask=LOW.animation.decodeMocapMask(data);for(let i=0,p=0;i<mask.length;i++,p+=4){image.data[p]=255;image.data[p+1]=74;image.data[p+2]=32;image.data[p+3]=mask[i];}ctx.putImageData(image,0,0);}
  if(pose?.joints){ctx.save();ctx.strokeStyle="#30cbbc";ctx.lineWidth=2;ctx.lineCap="round";const chains=[["nose","neck"],["left_shoulder","neck"],["neck","right_shoulder"],["left_shoulder","left_elbow"],["left_elbow","left_wrist"],["right_shoulder","right_elbow"],["right_elbow","right_wrist"],["neck","hips"],["hips","left_knee"],["left_knee","left_ankle"],["hips","right_knee"],["right_knee","right_ankle"]];
    chains.forEach(([a,b])=>{a=pose.joints[a];b=pose.joints[b];if(!a||!b)return;ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();});ctx.fillStyle="#30cbbc";ctx.strokeStyle="#081515";ctx.lineWidth=1.2;Object.values(pose.joints).forEach(j=>{if(!j)return;ctx.beginPath();ctx.arc(j.x*canvas.width,j.y*canvas.height,3.2,0,Math.PI*2);ctx.fill();ctx.stroke();});ctx.restore();}
  const tools=$("#mocapCorrection"); if(tools)tools.hidden=!data;
  const toLevel=$("#mocapToLevel");if(toLevel)toLevel.hidden=!data;
  const poseTools=$("#mocapPoseTools");if(poseTools)poseTools.hidden=false;
  const status=$("#mocapStatus"),confidence=Math.round(Math.max(0,Math.min(1,(data?.confidence??pose?.confidence)==null?1:Number(data?.confidence??pose?.confidence)||0))*100);
  if(status&&data){
    if(data.corrected)status.textContent=`Cuadro ${DZ.doc.frame} validado manualmente`;
    else if(data.occluded)status.textContent=`Cuadro ${DZ.doc.frame}: sujeto oculto o sin movimiento · corregí o validá la silueta`;
    else if(dzMocapIsIssue(data))status.textContent=`Cuadro ${DZ.doc.frame}: confianza ${confidence}% · revisá la silueta`;
    else status.textContent=`Cuadro ${DZ.doc.frame}: silueta estable · confianza ${confidence}%`;
  }else if(status&&pose)status.textContent=`Cuadro ${DZ.doc.frame}: cuerpo detectado · confianza ${confidence}%${pose.corrected?" · corregido manualmente":""}`;
  else if(status&&poseMissing)status.textContent=`Cuadro ${DZ.doc.frame}: no se detectó el cuerpo · colocá los puntos visibles manualmente`;
  dzMocapRenderCanvasGuide();
}
function dzMocapMaskDataUrl(data,color) {
  if(!data||!LOW.animation.decodeMocapMask)return null;const canvas=document.createElement("canvas");canvas.width=data.width;canvas.height=data.height;
  const ctx=canvas.getContext("2d"),image=ctx.createImageData(data.width,data.height),mask=LOW.animation.decodeMocapMask(data),rgb=color||[255,74,32];
  for(let i=0,p=0;i<mask.length;i++,p+=4){image.data[p]=rgb[0];image.data[p+1]=rgb[1];image.data[p+2]=rgb[2];image.data[p+3]=mask[i];}ctx.putImageData(image,0,0);return canvas.toDataURL("image/png");
}
function dzMocapRenderCanvasGuide() {
  const overlay=$("#dzMocapSheet"),design=$("#dzCanvas")?.querySelector(":scope > svg:not(#dzMocapSheet):not(#dzRigOverlay)"),track=DZ.doc&&DZ.doc.mocap;
  const data=track?.silhouetteAt?.(DZ.doc.frame),guide=$("#mocapGuide");
  if(!overlay||!design||!data||guide?.classList.contains("active")===false){if(overlay){overlay.hidden=true;overlay.innerHTML="";}return;}
  const size=dzSvgDocumentSize(design),url=dzMocapMaskDataUrl(data);if(!url){overlay.hidden=true;overlay.innerHTML="";return;}
  overlay.hidden=false;overlay.setAttribute("viewBox",`${size.x} ${size.y} ${size.width} ${size.height}`);overlay.setAttribute("width",size.width);overlay.setAttribute("height",size.height);
  overlay.style.transform=design.style.transform;overlay.innerHTML=`<image href="${url}" x="${size.x}" y="${size.y}" width="${size.width}" height="${size.height}" opacity=".42" preserveAspectRatio="none"/>`;
}
function dzMocapCommitMask(canvas,mask) {
  const track=DZ.doc&&DZ.doc.mocap,data=track?.silhouetteAt?.(DZ.doc.frame);
  if(!track||!data||!LOW.animation.encodeMocapMask)return;
  let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1,count=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){const q=y*canvas.width+x;if(mask[q]){count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}}
  track.setSilhouette(DZ.doc.frame,{width:canvas.width,height:canvas.height,runs:LOW.animation.encodeMocapMask(mask),coverage:count/mask.length,
    bounds:maxX<0?null:{x:minX/canvas.width,y:minY/canvas.height,w:(maxX-minX+1)/canvas.width,h:(maxY-minY+1)/canvas.height},corrected:true,
    confidence:1,occluded:false,components:count?1:0,keptComponents:count?1:0});
  DZ.doc.touch(); dzMocapRenderSilhouette();
}
function dzMocapCorrectionWire() {
  const canvas=$("#mocapSilhouette"),paint=$("#mocapPaint"),erase=$("#mocapErase"),brush=$("#mocapBrush"),guide=$("#mocapGuide"),toLevel=$("#mocapToLevel"),joint=$("#mocapJoint"),placeJoint=$("#mocapPlaceJoint"),deleteJoint=$("#mocapDeleteJoint"),applyRig=$("#mocapApplyRig"),poseInterpolation=$("#mocapPoseInterpolation"),footLock=$("#mocapFootLock"),keyTolerance=$("#mocapKeyTolerance"),validate=$("#mocapValidate"),nextIssue=$("#mocapNextIssue"),nextPoseIssue=$("#mocapNextPoseIssue");
  if(!canvas||canvas.dataset.correctorWired)return; canvas.dataset.correctorWired="1";
  let mode=null,drawing=false,mask=null,before=null;
  const activate=next=>{mode=next;paint?.classList.toggle("active",next==="paint");erase?.classList.toggle("active",next==="erase");canvas.classList.toggle("correcting",!!next);};
  paint.onclick=()=>activate(mode==="paint"?null:"paint"); erase.onclick=()=>activate(mode==="erase"?null:"erase");
  guide.onclick=()=>{guide.classList.toggle("active");dzMocapRenderCanvasGuide();};
  toLevel.onclick=()=>{const track=DZ.doc?.mocap;if(!track)return;const size=dzCurrentDocumentSize(),frames=Object.keys(track.silhouettes||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),items=[],empty=[];
    frames.forEach(frame=>{const data=track.silhouetteAt(frame),content=LOW.animation.mocapMaskSvgContent?.(data,size,{fill:"#282828",opacity:.68});if(content)items.push({frame,content});else empty.push(frame);});
    if(!items.length){dzSetStatus(" No se creó un nivel vacío: las máscaras no contienen al sujeto · usá Detectar cuerpo o elegí un fondo limpio y analizá otra vez");return;}
    const layer=DZ.doc.addReferenceSequence(items,"Rotoscopía");if(layer){dzBuildLayers();dzCanvasSet(DZ.doc.drawing?.content||"");dzTlFramesRender();const skipped=empty.length?` · ${empty.length} vacíos omitidos`:"";dzSetStatus(` Nivel de calco creado: ${items.length} siluetas visibles${skipped}`);}};
  let placingJoint=false;
  placeJoint.onclick=()=>{placingJoint=!placingJoint;placeJoint.classList.toggle("active",placingJoint);canvas.classList.toggle("placing-joint",placingJoint);activate(null);};
  const changeJoint=(name,value,label)=>{const track=DZ.doc?.mocap,frame=DZ.doc?.frame;if(!track||!frame)return;const previous=track.poseAt(frame),before={sample:previous?JSON.parse(JSON.stringify(previous)):null,missedFrames:[...(track.poseAnalysis?.missedFrames||[])]},joints=JSON.parse(JSON.stringify(previous?.joints||{}));if(value)joints[name]=value;else delete joints[name];
    if(Object.keys(joints).length)track.setPose(frame,joints,1,{source:"manual",corrected:true});else delete track.samples[frame];
    if(value&&Object.keys(joints).length>=2&&track.poseAnalysis?.missedFrames)track.poseAnalysis.missedFrames=track.poseAnalysis.missedFrames.filter(item=>Number(item)!==Number(frame));
    const current=track.poseAt(frame),after={sample:current?JSON.parse(JSON.stringify(current)):null,missedFrames:[...(track.poseAnalysis?.missedFrames||[])]};
    if(DZ.doc.history){const doc=DZ.doc;DZ.doc.history.push({label,domain:"mocap",before,after,apply:(_dir,next)=>{if(next.sample){const meta=Object.assign({},next.sample);delete meta.joints;delete meta.confidence;doc.mocap.setPose(frame,next.sample.joints,next.sample.confidence,meta);}else delete doc.mocap.samples[frame];if(doc.mocap.poseAnalysis)doc.mocap.poseAnalysis.missedFrames=[...next.missedFrames];doc.touch();if(doc.frame===frame)dzMocapRenderSilhouette();}});}DZ.doc.touch();dzMocapRenderSilhouette();};
  deleteJoint.onclick=()=>changeJoint(joint.value,null,"Quitar articulación de video");
  canvas.addEventListener("click",e=>{if(!placingJoint)return;e.preventDefault();e.stopImmediatePropagation();const r=canvas.getBoundingClientRect();changeJoint(joint.value,{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height)),confidence:1},"Colocar articulación de video");placingJoint=false;placeJoint.classList.remove("active");canvas.classList.remove("placing-joint");});
  const syncPoseOptions=()=>{const track=DZ.doc?.mocap;if(!track)return;track.analysisOptions=Object.assign({},track.analysisOptions,{poseInterpolation:poseInterpolation?.checked!==false,footLock:footLock?.checked!==false,keyTolerance:+keyTolerance?.value||0});DZ.doc.touch();dzMocapPoseStatus();};
  if(poseInterpolation)poseInterpolation.onchange=syncPoseOptions;if(footLock)footLock.onchange=syncPoseOptions;if(keyTolerance)keyTolerance.oninput=syncPoseOptions;
  if(validate)validate.onclick=()=>{
    const track=DZ.doc?.mocap,frame=DZ.doc?.frame,current=track?.silhouetteAt?.(frame);if(!track||!frame||!current)return dzSetStatus(" No hay una silueta para validar en este cuadro");
    const before=JSON.parse(JSON.stringify(current)),after=Object.assign({},before,{corrected:true,confidence:1,occluded:false});track.setSilhouette(frame,after);
    if(DZ.doc.history){const doc=DZ.doc;DZ.doc.history.push({label:"Validar silueta",domain:"mocap",before,after:JSON.parse(JSON.stringify(after)),apply:(_dir,value)=>{doc.mocap.setSilhouette(frame,JSON.parse(JSON.stringify(value)));doc.touch();if(doc.frame===frame)dzMocapRenderSilhouette();}});}
    DZ.doc.touch();dzMocapRenderSilhouette();dzSetStatus(` Silueta F${frame} validada · Ctrl+Z revierte`);
  };
  if(nextIssue)nextIssue.onclick=()=>{
    const track=DZ.doc?.mocap;if(!track)return;const issues=Object.keys(track.silhouettes||{}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b).filter(frame=>dzMocapIsIssue(track.silhouetteAt(frame)));
    if(!issues.length)return dzSetStatus(" No quedan siluetas de baja confianza por revisar");
    const target=issues.find(frame=>frame>DZ.doc.frame)||issues[0];DZ.doc.goTo(target);dzMocapRenderSilhouette();dzSetStatus(` Revisá la silueta F${target} · pintá, borrá o confirmá con ✓`);
  };
  if(nextPoseIssue)nextPoseIssue.onclick=()=>{const track=DZ.doc?.mocap,issues=(track?.poseAnalysis?.missedFrames||[]).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);if(!issues.length)return dzSetStatus(" No quedan cuadros sin pose por revisar");const target=issues.find(frame=>frame>DZ.doc.frame)||issues[0];DZ.doc.goTo(target);dzMocapRenderSilhouette();dzSetStatus(` Pose faltante en F${target} · elegí una articulación y colocala sobre la referencia`);};
  if(applyRig)applyRig.onclick=async ()=>{
    const track=DZ.doc?.mocap,rig=DZ.doc?.scene?.rig;if(!track||!rig)return;if(!Object.keys(rig.nodes||{}).length)return dzSetStatus(" Colocá o construí un esqueleto antes de transferir movimiento");
    const size={width:DZ.doc.scene.width,height:DZ.doc.scene.height},prepared=LOW.animation.mocapPoseSequence(track,track.analysisOptions?.poseInterpolation!==false),contacts=LOW.animation.mocapFootContacts(prepared),motion=track.analysisOptions?.footLock===false?prepared:LOW.animation.stabilizeMocapFootContacts(prepared,contacts),rawSequence={};
    if(track.poseAnalysis)track.poseAnalysis.contacts=contacts;
    for(const [frame,sample] of Object.entries(motion)){const poses=LOW.animation.retargetHumanPose(sample,rig,size);if(Object.keys(poses).length)rawSequence[frame]=poses;}
    const rawKeys=Object.values(rawSequence).reduce((sum,poses)=>sum+Object.keys(poses).length,0),sequence=LOW.animation.reduceRigPoseSequence(rawSequence,track.analysisOptions?.keyTolerance??2);
    const frames=Object.keys(sequence),keys=Object.values(sequence).reduce((sum,poses)=>sum+Object.keys(poses).length,0);
    if(!frames.length)return dzSetStatus(" No hay pares de articulaciones suficientes para transferir");
    const reduction=rawKeys>keys?` (${rawKeys-keys} redundantes eliminadas)`:"";if(!(await dzConfirmModal(`Se crearán ${keys} claves en ${frames.length} cuadros${reduction}. El rig y sus pivotes no cambiarán. ¿Aplicar?`, { ok: "Aplicar" })))return;
    if(DZ.doc.setRigPoseSequence(sequence,"Retargeting desde video")){dzRigApplyLive(DZ.doc.frame);dzTimelineBadges();dzSetStatus(` Movimiento aplicado: ${keys} claves${reduction} · Ctrl+Z revierte todo`);}
  };
  const apply=e=>{if(!drawing||!mode||!mask)return;const r=canvas.getBoundingClientRect(),cx=(e.clientX-r.left)/r.width*canvas.width,cy=(e.clientY-r.top)/r.height*canvas.height,rad=+(brush?.value||8);
    for(let y=Math.max(0,Math.floor(cy-rad));y<Math.min(canvas.height,Math.ceil(cy+rad));y++)for(let x=Math.max(0,Math.floor(cx-rad));x<Math.min(canvas.width,Math.ceil(cx+rad));x++)if((x-cx)**2+(y-cy)**2<=rad**2)mask[y*canvas.width+x]=mode==="paint"?255:0;
    const ctx=canvas.getContext("2d"),image=ctx.createImageData(canvas.width,canvas.height);for(let i=0,p=0;i<mask.length;i++,p+=4){image.data[p]=255;image.data[p+1]=74;image.data[p+2]=32;image.data[p+3]=mask[i];}ctx.putImageData(image,0,0);};
  canvas.addEventListener("pointerdown",e=>{if(!mode)return;e.preventDefault();const data=DZ.doc?.mocap?.silhouetteAt?.(DZ.doc.frame);if(!data)return;before=JSON.parse(JSON.stringify(data));mask=LOW.animation.decodeMocapMask(data);drawing=true;canvas.setPointerCapture?.(e.pointerId);apply(e);});
  canvas.addEventListener("pointermove",apply);
  const finish=()=>{if(!drawing)return;drawing=false;const frame=DZ.doc.frame;dzMocapCommitMask(canvas,mask);const after=JSON.parse(JSON.stringify(DZ.doc.mocap.silhouetteAt(frame)));
    if(DZ.doc.history&&JSON.stringify(before)!==JSON.stringify(after)){const doc=DZ.doc;DZ.doc.history.push({label:"Corregir silueta",domain:"mocap",before,after,apply:(_dir,value)=>{doc.mocap.setSilhouette(frame,JSON.parse(JSON.stringify(value)));doc.touch();if(doc.frame===frame)dzMocapRenderSilhouette();}});}
    mask=null;before=null;};
  canvas.addEventListener("pointerup",finish);canvas.addEventListener("pointercancel",finish);
}
function dzMocapRenderSubject() {
  const video=$("#mocapVideo"), box=$("#mocapSubjectBox"), track=DZ.doc&&DZ.doc.mocap;
  if(!video||!box||!track?.subjectRegion){if(box)box.hidden=true;return;}
  const r=track.subjectRegion, vr=video.getBoundingClientRect(), wrap=video.parentElement.getBoundingClientRect();
  box.hidden=false; box.style.left=(vr.left-wrap.left+r.x*vr.width)+"px"; box.style.top=(vr.top-wrap.top+r.y*vr.height)+"px";
  box.style.width=(r.w*vr.width)+"px"; box.style.height=(r.h*vr.height)+"px";
}
function dzMocapWire() {
  const input = $("#mocapVideoFile"), open = $("#mocapImport"), analyze = $("#mocapAnalyze"), detectPose=$("#mocapDetectPose"), subject=$("#mocapSubject"), background=$("#mocapBackground");
  const video = $("#mocapVideo"), status = $("#mocapStatus");
  if (!input) return;
  const panel=$("#dzMocapPanel"),close=$("#dzMocapClose");
  if(close&&!close.dataset.wired){close.dataset.wired="1";close.onclick=()=>{if(panel)panel.hidden=true;LOW.workspace?.panels?.hide?.("mocap");};}
  if(panel&&!panel.dataset.wheelWired){panel.dataset.wheelWired="1";panel.addEventListener("wheel",e=>{if(!e.target.closest?.('input[type="number"]'))return;e.preventDefault();e.stopPropagation();panel.scrollTop+=e.deltaY;},{passive:false});}
  dzMocapCorrectionWire();
  const threshold=$("#mocapThreshold"),cleanup=$("#mocapCleanup"),poseConfidence=$("#mocapPoseConfidence"),poseInterpolation=$("#mocapPoseInterpolation"),footLock=$("#mocapFootLock"),keyTolerance=$("#mocapKeyTolerance");
  const current=DZ.doc?.mocap?.analysisOptions;if(current){threshold.value=current.threshold||54;cleanup.value=current.cleanup||4;if(poseConfidence)poseConfidence.value=current.poseConfidence??.45;if(poseInterpolation)poseInterpolation.checked=current.poseInterpolation!==false;if(footLock)footLock.checked=current.footLock!==false;if(keyTolerance)keyTolerance.value=current.keyTolerance??2;}dzMocapPoseStatus();
  if(input.dataset.wired)return;
  input.dataset.wired = "1";
  const syncOptions=()=>{const track=dzMocapTrack();if(!track)return;track.analysisOptions=Object.assign({},track.analysisOptions,{threshold:+threshold.value||54,cleanup:+cleanup.value||4,poseConfidence:+poseConfidence?.value||.45,poseInterpolation:poseInterpolation?.checked!==false,keyTolerance:+keyTolerance?.value||0});DZ.doc.touch();};
  threshold.oninput=syncOptions;cleanup.oninput=syncOptions;if(poseConfidence)poseConfidence.oninput=syncOptions;
  open.onclick = () => input.click();
  if(background)background.onclick=()=>{const track=dzMocapTrack();if(!track||!video.src||!video.duration)return dzSetStatus(" Importá primero un video");const time=Math.max(0,Math.min(video.duration-.001,video.currentTime||0));track.analysisOptions=Object.assign({},track.analysisOptions,{backgroundTime:time,backgroundLocked:true});DZ.doc.touch();status.textContent=`Fondo limpio fijado en ${time.toFixed(2)} s · ahora extraé las siluetas`;dzSetStatus(" Cuadro de fondo guardado para separar mejor al personaje");};
  input.onchange = () => {
    const file = input.files && input.files[0]; input.value = "";
    if (!file) return;
    if (DZ.mocapObjectUrl) URL.revokeObjectURL(DZ.mocapObjectUrl);
    DZ.mocapObjectUrl = URL.createObjectURL(file);
    video.src = DZ.mocapObjectUrl; video.hidden = false;
    video.onloadedmetadata = () => {
      const track = dzMocapTrack(); if (!track) return;
      track.setSource({ name: file.name, duration: video.duration,
        width: video.videoWidth, height: video.videoHeight });
      DZ.doc.touch(); dzMocapSync();
      threshold.value=track.analysisOptions?.threshold||54;cleanup.value=track.analysisOptions?.cleanup||4;
      dzMocapRenderSubject();
      status.textContent = `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${video.duration.toFixed(1)} s · sincronizado`;
    };
  };
  subject.onclick=()=>{
    if(!video.src)return dzSetStatus(" Importá primero un video");
    const wrap=video.parentElement; wrap.classList.add("marking"); subject.classList.add("active");
    status.textContent="Arrastrá un rectángulo sobre la persona que querés seguir";
    let start=null;
    const point=e=>{const r=video.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};};
    const down=e=>{e.preventDefault();start=point(e);video.setPointerCapture?.(e.pointerId);};
    const move=e=>{if(!start)return;const p=point(e),track=dzMocapTrack();track.setSubjectRegion({x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)});dzMocapRenderSubject();};
    const up=e=>{if(!start)return;move(e);start=null;wrap.classList.remove("marking");subject.classList.remove("active");video.removeEventListener("pointerdown",down);video.removeEventListener("pointermove",move);video.removeEventListener("pointerup",up);video.removeEventListener("pointercancel",up);DZ.doc.touch();status.textContent="Sujeto marcado · la silueta y el cuerpo se analizarán solamente en esa región";};
    video.addEventListener("pointerdown",down);video.addEventListener("pointermove",move);video.addEventListener("pointerup",up);video.addEventListener("pointercancel",up);
  };
  if(detectPose)detectPose.onclick=async()=>{
    if(DZ.mocapAbort){DZ.mocapAbort.abort();return;}const track=DZ.doc?.mocap;if(!track?.source)return dzSetStatus(" Importá primero un video de actuación");const engine=LOW.animation.mocapEngines.get("mediapipe-pose");if(!engine)return dzSetStatus(" No se cargó el detector corporal local");
    DZ.mocapAbort=new AbortController();detectPose.textContent="Cancelar";detectPose.classList.add("danger");analyze.disabled=true;track.status="processing";status.textContent="Preparando el detector corporal local…";
    try{await engine.analyze(track,video,{signal:DZ.mocapAbort.signal,onProgress:(p,f,last,detected,missed)=>{status.textContent=`Detectando cuerpo… ${Math.round(p*100)}% · cuadro ${f}/${last} · ${detected} encontrados · ${missed} para revisar`;}});DZ.doc.touch();dzMocapRenderSilhouette();const report=track.poseAnalysis||{},execution=report.execution==="worker"?" · proceso en segundo plano":" · modo compatible",semantic=report.semantic?` · ${report.semantic} siluetas semánticas`:"";status.textContent=`${report.detected||0} poses detectadas · ${report.missed||0} cuadros sin cuerpo · ${report.retained||0} correcciones conservadas${semantic}${execution}`;dzSetStatus(` Captura corporal terminada: ${report.detected||0} cuadros detectados`);}
    catch(error){if(error.name==="AbortError"){track.status=Object.keys(track.samples||{}).length?"tracked":"reference";status.textContent="Detección cancelada · se conservaron todas las poses anteriores";dzSetStatus(" Captura corporal cancelada sin perder datos");}else{track.status="error";status.textContent="Falló la detección corporal: "+(error.message||error);dzSetStatus(" No se pudo iniciar el detector corporal local");}}
    finally{DZ.mocapAbort=null;detectPose.textContent="Detectar cuerpo";detectPose.classList.remove("danger");analyze.disabled=false;}
  };
  analyze.onclick = async () => {
    if(DZ.mocapAbort){DZ.mocapAbort.abort();return;}
    const track = DZ.doc && DZ.doc.mocap;
    if (!track || !track.source) return dzSetStatus(" Importá primero un video de actuación");
    const id = "local-motion-silhouette", engine = LOW.animation.mocapEngines.get(id);
    if (!engine) return dzSetStatus(" No se cargó el analizador local");
    DZ.mocapAbort=new AbortController();analyze.textContent="Cancelar";analyze.classList.add("danger");if(detectPose)detectPose.disabled=true; track.status = "processing"; status.textContent = "Extrayendo siluetas localmente… 0%";
    try { await engine.analyze(track, video,{signal:DZ.mocapAbort.signal,onProgress:(p,f,last)=>{status.textContent=`Extrayendo siluetas… ${Math.round(p*100)}% · cuadro ${f}/${last}`;}});
      track.engine = id; track.status = "tracked"; DZ.doc.touch(); dzMocapRenderSilhouette();
      const count=Object.keys(track.silhouettes||{}).length,usable=Object.values(track.silhouettes||{}).filter(item=>LOW.animation.mocapMaskStats?.(item).usable).length,issues=Object.values(track.silhouettes||{}).filter(dzMocapIsIssue).length;
      status.textContent=usable?`${usable}/${count} siluetas visibles · ${issues} cuadro${issues===1?"":"s"} para revisar`:`No se encontró una silueta visible · marcá al sujeto y usá Detectar cuerpo`;
      dzSetStatus(usable?` Captura terminada: ${usable} siluetas visibles · ${issues} para revisar`:` El análisis no encontró al sujeto: no se generarán cuadros blancos`); }
    catch (err) {if(err.name==="AbortError"){track.status=Object.keys(track.silhouettes||{}).length?"tracked":"reference";status.textContent="Análisis cancelado · se conservaron los resultados anteriores";dzSetStatus(" Captura cancelada sin perder datos");}else{track.status = "error"; status.textContent = "Falló el análisis: " + (err.message || err);}}
    finally { DZ.mocapAbort=null;analyze.textContent="Extraer siluetas";analyze.classList.remove("danger");if(detectPose)detectPose.disabled=false; }
  };
}

async function dzMocapOpen() {
  await dzDocInit();
  if (!DZ.anim) await dzAnimToggle();
  dzPanelDockSetup();
  const panel = $("#dzMocapPanel");
  if (panel) {
    panel.hidden = false;
    LOW.workspace?.panels?.show?.("mocap");
    DZ.panelDock?.update?.();
  }
  dzMocapWire();
  dzMocapSync();
  dzSetStatus(" Motion Capture independiente: importá una actuación; Cut-out sólo interviene al aplicar el movimiento a un rig");
}

async function dzDocumentMayDiscard(action) {
  const dirty = !!(DZ.doc?.dirty || DZ.dirty);
  return !dirty || await dzConfirmModal(`Hay cambios sin guardar. ¿${action} sin guardarlos?`, { ok: "Descartar", danger: true });
}

async function dzDocumentNew() {
  // Un documento nuevo nace siendo un archivo `.low` (ui/animation/escena-nueva.js).
  // Antes esto escribia un `diseno_<fecha>.svg` suelto y la escena se quedaba en
  // memoria: en el workspace de Mauro habia 157 SVG —138 en blanco— y CERO .low.
  return dzEscenaNueva();
}

async function dzDocumentClose() {
  if (!DZ.path && !DZ.doc) return false;
  if (!(await dzDocumentMayDiscard("Cerrar el documento"))) return false;
  dzDocumentReset();
  $("#designView").hidden = true;
  $("#dzTitle").textContent = "Sin documento";
  if (RULER) dzRulerClear();
  return true;
}

async function dzDocumentTrash() {
  const target = DZ.doc?.path || DZ.path;
  if (!target) return sysMsg(" Este documento todavía no tiene un archivo para borrar.");
  const name = String(target).split(/[\\/]/).pop();
  if (!(await dzConfirmModal(`¿Mover «${name}» a la papelera del proyecto? Podrás recuperarlo desde .low-trash.`, { ok: "Mover a la papelera", danger: true }))) return false;
  const r = await api.trash_design(target);
  if (!r || r.error) return sysMsg(" No pude moverlo a la papelera: " + ((r && r.error) || "error desconocido"));
  dzDocumentReset();
  $("#designView").hidden = true;
  $("#dzTitle").textContent = "Sin documento";
  try { S.tree = (await api.refresh_tree()).tree; renderTree(); } catch (_) { /* evento del backend alcanza */ }
  sysMsg(" Documento movido a la papelera del proyecto.");
  return true;
}

/* ── SAVE-03 / SAVE-04 de la matriz de regresion ────────────────────────────
   El puente devuelve un OBJETO tambien cuando la escritura falla
   ({error, path, recoverable}) — y todo objeto es truthy. Los guardados que
   preguntaban `if (r)` o `if (r && r.path)` daban por escrito lo que nunca se
   escribio: marcaban el documento limpio, BORRABAN el punto de recuperacion y
   anunciaban exito. Un disco lleno se llevaba el trabajo en silencio.
   Un guardado es exitoso solo si trae `path` y no trae `error`. */
function dzSaveOk(r) { return !!(r && r.path && !r.error); }
function dzSaveError(r, err) {
  if (err) return err.message || String(err);
  return (r && r.error) || "no se pudo escribir en disco";
}
/** Deja el documento como lo que es: sin guardar. Conserva el punto de
    recuperacion y lo dice, en vez de anunciar un exito que no ocurrio. */
function dzSaveFallo(que, detalle) {
  DZ.dirty = true;
  if (DZ.doc) DZ.doc.dirty = true;
  const tab = dzDocumentTabCurrent();
  if (tab) { tab.dirty = true; dzDocumentTabsRender(); }
  setStatus("⚠ sin guardar: " + detalle);
  sysMsg("⚠ " + que + " NO se guardó: " + detalle +
    ". La versión anterior en disco sigue intacta y el punto de recuperación se " +
    "conserva — reintentá o usá Guardar como.");
  return false;
}

async function dzSceneSave(comoNuevo) {
  if (!DZ.doc) return false;
  dzDocCommit();                      // lo que esté en el lienzo, adentro
  const json = JSON.stringify(DZ.doc.toJSON(), null, 1);
  // La extension de LOW es .low. Las .lowscene de antes se siguen abriendo
  // —§14: una version nueva no rompe documentos anteriores—; lo que cambia es
  // con que nombre se ofrece guardar. El marcador de formato DENTRO del JSON
  // sigue siendo "lowscene": eso no es la extension, es el contenido, y lo lee
  // tambien el punto de recuperacion.
  const nombre = (DZ.doc.scene.name || "escena").replace(/[^\w\-.]+/g, "_") + ".low";
  const tabBefore = dzDocumentTabCurrent();
  const recoveryBefore = dzSceneRecoveryIdentity(DZ.doc, tabBefore);
  try {
    const r = await api.save_file(comoNuevo ? "" : (DZ.doc.path || ""), json, nombre);
    if (dzSaveOk(r)) {
      DZ.doc.path = r.path;
      DZ.doc.dirty = false;
      const tab = dzDocumentTabCurrent();
      if (tab) { tab.path = r.path; tab.name = dzDocumentTabName(r.path, r.name || tab.name); tab.dirty = false; dzDocumentTabsRender(); }
      window.LOW?.workspace?.sceneRecovery?.clear?.(recoveryBefore);
      dzSceneRecoveryClear(DZ.doc, tab);
      dzSetStatus(" Escena guardada: " + (r.name || r.path));
      return true;
    }
    if (r && r.error) {
      DZ.doc.dirty = true;
      sysMsg(" Guardado incompleto: " + r.error +
        ". La versión guardada anterior sigue intacta. Podés reintentar o usar Guardar como.");
    }
  } catch (err) { sysMsg(" No pude guardar la escena: " + (err.message || err)); }
  return false;
}

/** Abre una escena. Sin argumento pregunta con el diálogo; con una ruta la abre
 *  directo — es el camino del doble clic en un .low. Es UNA sola
 *  implementación a propósito: dos caminos que abren escenas se desincronizan
 *  en cuanto uno de los dos cambia. */
async function dzSceneOpen(ruta) {
  try {
    const r = ruta ? await api.open_file(ruta) : await api.open_dialog();
    if (!r || r.error) { if (r && r.error) sysMsg(" " + r.error); return false; }
    if (!r.content) return false;
    const doc = LOW.animation.LowDoc.fromJSON(r.content); if (!$("#dzWorkspaces")?.children.length) dzWsInit();   // las pestañas de espacios las montaba openDesign, y esto no pasa por ahi
    const existing = r.path && dzDocumentTabFind(r.path);
    if (existing) return dzDocumentTabActivate(existing.id);
    dzDocumentTabPrepareNew();
    doc.path = r.path || null;
    dzDocUse(doc);
    $("#designView").hidden = false;
    $("#dzTitle").textContent = r.name || doc.scene.name || "Documento de animación";
    dzDocumentTabRegister(r.path || doc.path || `scene:${Date.now()}`, r.name || doc.scene.name || "Documento de animación");
    requestAnimationFrame(() => dzFitView());
    dzSetStatus(" Escena abierta: " + (r.name || r.path));
    return true;
  } catch (err) { sysMsg(" No pude abrir la escena: " + (err.message || err)); }
  return false;
}

/** Pone un documento en uso y reengancha todo lo que depende de él. */
function dzDocUse(doc) {
  DZ.doc = doc; dzHojaDeDibujoAsegurar(doc.scene);   // sin hoja de dibujo, el lienzo escribe en un overlay oculto y el commit siguiente VACIA el documento
  if (!DZ.history) DZ.history = new LOW.core.HistoryManager({ limit: 180 });
  else DZ.history.clear();
  doc.setHistory(DZ.history);
  if (DZ.playback) DZ.playback.setDoc(doc);
  if (DZ.xsView) DZ.xsView.setDoc(doc);
  if (DZ.tlView) DZ.tlView.setDoc(doc);
  if (DZ.lsView) DZ.lsView.setDoc(doc);
  if (DZ.colab) dzColabVigilar();
  doc.subscribe((d, motivo) => {
    if (DZ.doc !== d) return;
    if (motivo === "frame") {
      const selectedId = DZ.sel && DZ.sel.id, dw = d.drawing;
      dzCanvasSet(dw ? dw.content : ""); dzOnionRender();
      const hasRig = Object.keys((d.scene.rig && d.scene.rig.nodes) || {}).length > 0;
      if (hasRig) {
        dzRigApplyLive(d.frame);
        const selected = selectedId && $("#dzCanvas")?.querySelector(":scope > svg")?.querySelector("#" + CSS.escape(selectedId));
        if (DZ.rigMode && selected) dzSelect(selected); else if (DZ.rigMode) dzRigPanelSync();
      }
    }
    else if (motivo === "onion") dzOnionRender();
    else if (motivo === "document") dzSyncCanvasDocument(); else if (motivo === "composition") dzCompositionAplicar?.();
  });
  const d = doc.drawing;
  dzCanvasSet(d ? d.content : "");
  dzSyncCanvasDocument(true);
  dzOnionRender();
  dzOnion2Render();
  dzSyncTransportFromDoc();   // fps y rango In/Out del archivo, a los controles
  if (Object.keys((doc.scene.rig && doc.scene.rig.nodes) || {}).length) dzRigApplyLive(doc.frame);
}

/** Refleja fps y rango In/Out del documento en los controles de transporte.
 *  Sin esto, abrir una escena dejaba los controles con los valores por defecto
 *  aunque el archivo guardara otros. */
function dzSyncTransportFromDoc() {
  if (!DZ.doc) return;
  const sc = DZ.doc.scene;
  if ($("#tlFps")) $("#tlFps").value = sc.fps || 12;
  if ($("#tlIn")) $("#tlIn").value = sc.range.in || 1;
  if ($("#tlOut")) $("#tlOut").value = sc.range.out || 0;
}

/** Autoguardado de la escena, por si LOW se cierra mal. */
function dzSceneAutosave(doc = DZ.doc, tab = dzDocumentTabCurrent()) {
  if (!doc) return false;
  const store = window.LOW?.workspace?.sceneRecovery;
  const identity = dzSceneRecoveryIdentity(doc, tab);
  if (!store || !identity) return false;
  const saved = store.saveNow(identity, doc.toJSON(), {
    path: doc.path || tab?.path || null, sceneId: doc.scene?.id || null,
    name: doc.scene?.name || tab?.name || "Escena", frame: doc.frame || 1
  });
  if (saved && tab) tab.recoveryIdentity = identity;
  return saved;
}
setInterval(() => { if (DZ.doc && DZ.doc.dirty) dzSceneAutosave(); }, 8000);

/** ¿Hay una escena sin guardar de la sesión anterior? */
function dzSceneRecovered() {
  const store = window.LOW?.workspace?.sceneRecovery;
  const identity = dzSceneRecoveryIdentity(null, dzDocumentTabCurrent());
  if (!store || !identity) return null;
  let record = store.get(identity);
  if (!record && DZ.documentTabs.length <= 1) record = store.migrateLegacy(identity);
  return record?.content || null;
}

/* ══ PANEL DE PAPEL CEBOLLA ══════════════════════════════════════════════
   Mesa de luz: diez dibujos distintos antes y diez después, cada uno con su
   propio fader. Escribe en la config del documento, que es la que usa
   `animation/onion.js` para resolver QUÉ dibujos mostrar. */
function dzOnionCfgActual() {
  const base = LOW.animation.onion.DEFAULTS;
  if (DZ.doc) return { ...base, ...(DZ.doc.onionCfg || {}) };
  return { ...base, ...(DZ.onionCfg2 || {}) };
}
function dzOnionCfgSet(patch, options=null) {
  const cfg = { ...dzOnionCfgActual(), ...patch };
  if (DZ.doc) { DZ.doc.onionCfg = cfg; DZ.doc.touch(); DZ.doc.emit("onion"); }
  else DZ.onionCfg2 = cfg;
  try { dzPrefsStorage().setItem("low.onion.v2", JSON.stringify(cfg)); } catch (_) { /* noop */ }
  if (!options || !options.live) dzOnion2Render();
  if (!DZ.doc) dzOnionRender();
}
function dzOnionProfile(cfg, side) {
  const key = side === "before" ? "beforeOpacity" : "afterOpacity";
  const slots = LOW.animation.onion.MAX_SLOTS || 10;
  if (Array.isArray(cfg[key])) return Array.from({ length: slots }, (_, i) =>
    Math.max(0, Math.min(1, Number(cfg[key][i]) || 0)));
  const count = Math.max(0, Number(cfg[side]) || 0);
  return Array.from({ length: slots }, (_, i) => i < count
    ? Math.max(0, Math.min(1, cfg.alpha * Math.pow(cfg.falloff, i))) : 0);
}
function dzOnionMixerSet(side, distance, value, live=false) {
  const cfg = dzOnionCfgActual();
  const key = side === "before" ? "beforeOpacity" : "afterOpacity";
  const profile = dzOnionProfile(cfg, side);
  profile[distance - 1] = Math.max(0, Math.min(1, Number(value) || 0));
  let count = 0;
  profile.forEach((v, i) => { if (v > .005) count = i + 1; });
  dzOnionCfgSet({ [key]: profile, [side]: count }, { live });
}
function dzOnionMixerPreset(kind) {
  const slots = LOW.animation.onion.MAX_SLOTS || 10;
  const curve = Array.from({ length: slots }, (_, i) => Math.max(.02, .48 * Math.pow(.72, i)));
  let beforeOpacity, afterOpacity;
  if (kind === "clear") beforeOpacity = afterOpacity = Array(slots).fill(0);
  else if (kind === "flat") beforeOpacity = afterOpacity = Array(slots).fill(.24);
  else { beforeOpacity = curve.slice(); afterOpacity = curve.slice(); }
  dzOnionCfgSet({ beforeOpacity, afterOpacity,
    before: kind === "clear" ? 0 : slots, after: kind === "clear" ? 0 : slots });
}
function dzOnion2Render() {
  const cfg = dzOnionCfgActual();
  const mixer = $("#onMixer");
  if (mixer) {
    mixer.innerHTML = "";
    const channel = (side, distance, value, color, label) => {
      const wrap = document.createElement("div"); wrap.className = "onion2-channel";
      const top = document.createElement("label"); top.textContent = label;
      const input = document.createElement("input"); input.type = "range"; input.min = 0; input.max = 100;
      input.value = Math.round(value * 100); input.style.setProperty("--channel", color);
      input.title = `${label}: ${input.value}%`;
      const out = document.createElement("output"); out.textContent = input.value + "%";
      input.oninput = () => { out.textContent = input.value + "%"; input.title = `${label}: ${input.value}%`;
        dzOnionMixerSet(side, distance, +input.value / 100, true); };
      input.onchange = () => dzOnionMixerSet(side, distance, +input.value / 100, false);
      input.ondblclick = () => dzOnionMixerSet(side, distance,
        Math.max(.02, cfg.alpha * Math.pow(cfg.falloff, distance - 1)), false);
      wrap.append(top, input, out); mixer.appendChild(wrap);
    };
    const before = dzOnionProfile(cfg, "before"), after = dzOnionProfile(cfg, "after");
    for (let d = before.length; d >= 1; d--) channel("before", d, before[d - 1], cfg.colorBefore, "−" + d);
    const current = document.createElement("div"); current.className = "onion2-channel current";
    current.innerHTML = "<label>0</label><i></i><output>actual</output>"; mixer.appendChild(current);
    for (let d = 1; d <= after.length; d++) channel("after", d, after[d - 1], cfg.colorAfter, "+" + d);
  }
  const set = (id, v) => { const e = $(id); if (e) e.value = v; };
  set("#onColorB", cfg.colorBefore); set("#onColorA", cfg.colorAfter);
  const pw = $("#onOn");
  if (pw) pw.classList.toggle("on", !!DZ.onionOn);
  const lines = $("#onLines");
  if (lines) lines.classList.toggle("on", !!cfg.linesOnly);
  // marcadores fijos: cada uno se saca con un clic
  const box = $("#onFixed");
  if (box) {
    box.innerHTML = "";
    for (const f of cfg.fixed || []) {
      const b = document.createElement("b");
      b.textContent = f;
      b.title = "Quitar el fijo del frame " + f;
      b.onclick = () => dzOnionCfgSet(LOW.animation.onion.toggleFixed(dzOnionCfgActual(), f));
      box.appendChild(b);
    }
    if (!(cfg.fixed || []).length) {
      const s = document.createElement("span");
      s.className = "onion2-val"; s.textContent = "—";
      box.appendChild(s);
    }
  }
}
function dzOnionPanelSet(show) {
  const panel = $("#dzOnionPanel"); if (!panel) return;
  panel.hidden = !show;
  const dock = panel.closest(".dz-animation-dock");
  if (show && dock) dock.hidden = false;
  else DZ.panelDock?.update();
  if ($("#tlOnion")) $("#tlOnion").classList.toggle("active", !!show);
}
async function dzOnionPanelToggle() {
  if (!DZ.anim) await dzAnimToggle();
  if (!DZ.anim) return;
  const show = $("#dzOnionPanel").hidden;
  DZ.anim.onion = show;
  dzOnionPanelSet(show);
  if (show) { DZ.onionOn = true; dzOnion2Render(); dzOnionUpdate(); }
}
function dzOnion2Wire() {
  try {
    const guardado = JSON.parse(dzPrefsStorage().getItem("low.onion.v2") || "{}");
    DZ.onionCfg2 = { ...LOW.animation.onion.DEFAULTS, ...guardado };
  } catch (_) { DZ.onionCfg2 = { ...LOW.animation.onion.DEFAULTS }; }
  const on = (id, ev, fn) => { const e = $(id); if (e) e[ev] = fn; };
  const power = $("#onOn");
  if (power) { power.innerHTML = '<svg class="ico"><use href="#i-onion"/></svg>'; power.setAttribute("aria-label", "Activar papel cebolla"); }
  on("#onColorB", "oninput", (e) => dzOnionCfgSet({ colorBefore: e.target.value }));
  on("#onColorA", "oninput", (e) => dzOnionCfgSet({ colorAfter: e.target.value }));
  on("#onCurve", "onclick", () => dzOnionMixerPreset("curve"));
  on("#onFlat", "onclick", () => dzOnionMixerPreset("flat"));
  on("#onClear", "onclick", () => dzOnionMixerPreset("clear"));
  on("#onLines", "onclick", () => dzOnionCfgSet({ linesOnly: !dzOnionCfgActual().linesOnly }));
  on("#onOn", "onclick", () => { DZ.onionOn = !DZ.onionOn; dzOnion2Render(); dzOnionRender(); });
  on("#onFixAdd", "onclick", () => {
    const f = DZ.doc ? DZ.doc.frame : 1;
    dzOnionCfgSet(LOW.animation.onion.toggleFixed(dzOnionCfgActual(), f));
  });
  dzOnion2Render();
}

/* ══ DOCUMENTO DE ANIMACIÓN sobre el modelo nuevo ════════════════════════
   Puente entre el modelo (animation/) y la pantalla. Convive con la animación
   vieja de archivos por frame: si hay una escena legacy abierta se MIGRA, así
   nada se pierde y a partir de ahí ya se pueden hacer holds.
   Ver docs/2D_REDESIGN.md — fase 3. */
DZ.doc = null;      // LowDoc
DZ.xsView = null;   // XsheetView
DZ.palView = null;  // PaletteView
DZ.palStyle = null; // numero del estilo con el que se dibuja
DZ.palTarget = "ink"; // Línea o pintura: destino explícito del Color Studio
DZ.palStyles = { ink: null, paint: null }; // estilos independientes, como ink & paint tradicional

/* == PALETA: el color como referencia =====================================
   El trazo no guarda un color, guarda el NUMERO de un estilo, y el color lo
   resuelve una hoja de estilos que se inyecta en el SVG. Asi cambiar un color
   recolorea todo lo que lo usa -en todos los dibujos, expuestos o no- sin
   recorrer nada, y el color literal queda igual en el archivo como respaldo
   para abrirlo en cualquier visor. */

/** El estilo con el que se esta dibujando. */
function dzPalActual(papel = DZ.palTarget || "ink") {
  if (!DZ.doc || !LOW.animation.palette) return null;
  const pal = DZ.doc.palette;
  if (!pal) return null;
  const role = papel === "paint" ? "paint" : "ink";
  let st = DZ.palStyles?.[role] != null ? pal.byIndex(DZ.palStyles[role]) : null;
  // primera vez: se engancha al estilo que ya tiene el color del lapiz, para
  // que empezar a usar la paleta no cambie de color lo que estabas dibujando
  if (!st) st = pal.byColor(role === "paint" ? DZ.fillColor : DZ.drawColor) ||
                pal.styles[role === "paint" ? 2 : 0] || pal.styles[0] || null;
  if (!DZ.palStyles) DZ.palStyles = { ink: null, paint: null };
  DZ.palStyles[role] = st ? st.index : null;
  DZ.palStyle = st ? st.index : null;
  return st;
}

/** Marca un elemento nuevo con el estilo activo. `papel` es "ink" (la linea) o
 *  "paint" (el relleno): el lapiz y la pluma son linea, el pincel de LOW es una
 *  cinta rellena. */
/** El trazo terminado del pincel es una cinta RELLENA, pero conceptualmente es
    LÍNEA: tiene que salir del color de tinta configurado, igual que el lápiz.
    Etiquetarlo con el PAPEL "paint" lo ataba al estilo «Relleno» —blanco por
    defecto— y la hoja de la paleta lo impone con !important, así que le ganaba
    al fill del propio trazo: el pincel dibujaba blanco sobre papel blanco y
    parecía que no dibujaba. Acá se separan las dos cosas que estaban mezcladas:
    QUÉ estilo manda (el de tinta) y en QUÉ atributo se aplica (el relleno). */
function dzStyleTagInkAsFill(el) {
  const st = dzPalActual("ink");
  if (!el || !el.setAttribute || !st || !st.index) return el;
  el.setAttribute(LOW.animation.palette.ATTR.paint, String(st.index));
  return el;
}
function dzStyleTag(el, papel) {
  if (!el || !el.setAttribute) return el;
  const st = dzPalActual(papel);
  if (!st || !st.index) return el;
  const A = LOW.animation.palette.ATTR;
  el.setAttribute(papel === "paint" ? A.paint : A.ink, String(st.index));
  return el;
}

/** Inyecta (o actualiza) la hoja de la paleta dentro del SVG del lienzo. */
function dzPalCssRender() {
  const cv = $("#dzCanvas");
  const svg = cv && cv.querySelector(":scope > svg");
  if (!svg || !DZ.doc || !LOW.animation.palette) return;
  const pal = DZ.doc.palette;
  const css = pal ? LOW.animation.palette.css(pal) : "";
  let el = svg.querySelector(":scope > style.dz-palcss");
  if (!css) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElementNS(SVGNS, "style");
    el.setAttribute("class", "dz-palcss");
    svg.insertBefore(el, svg.firstChild);
  }
  if (el.textContent !== css) el.textContent = css;
}

/** Muestra la paleta de la escena en su panel. */
function dzPalMount() {
  const host = $("#dzPalette");
  if (!host || !LOW.animation.PaletteView || !DZ.doc) return false;
  if (!DZ.palView) {
    const pal = DZ.doc.palette;
    const inkInitial = DZ.palStyles.ink || pal?.byColor(DZ.drawColor)?.index || pal?.styles[0]?.index;
    const paintInitial = DZ.palStyles.paint || pal?.byColor(DZ.fillColor)?.index || pal?.styles[2]?.index || inkInitial;
    DZ.palStyles = { ink: inkInitial || null, paint: paintInitial || null };
    DZ.palView = new LOW.animation.PaletteView(host, DZ.doc, {
      current: DZ.palTarget === "paint" ? paintInitial : inkInitial,
      target: DZ.palTarget,
      currents: DZ.palStyles,
      // elegir un estilo cambia con que se dibuja: el color del lapiz sigue al
      // estilo activo, asi el resto del editor no se entera de nada
      onPick: (st, target = "ink") => {
        DZ.palStyle = st.index;
        DZ.palTarget = target;
        DZ.palStyles[target === "paint" ? "paint" : "ink"] = st.index;
        if (target === "paint") {
          DZ.fillColor = st.color;
          if ($("#dzPFill")) $("#dzPFill").value = st.color;
        } else {
          DZ.drawColor = st.color;
          if ($("#dzPStroke")) $("#dzPStroke").value = st.color;
        }
        dzSetStatus(` ${target === "paint" ? "Pintura" : "Línea"} · Estilo ${st.index} — ${st.name || ""}`);
      },
    });
  } else DZ.palView.setDoc(DZ.doc);
  const st = dzPalActual(DZ.palTarget);
  if (st) DZ.palView.current = st.index;
  DZ.palView.render();
  return true;
}

/** Contenido dibujable del lienzo (lo de adentro del <svg>, sin el <svg>). */

function dzCanvasSet(contenido) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return false;
  svg.innerHTML = contenido || "";
  dzCompositionApplyToCanvas();
  dzPalCssRender();          // el innerHTML se llevo la hoja de la paleta
  dzMirrorGuideRender();     // ...y tambien la guia del eje de simetria
  // Cambiar de Drawing sólo reemplaza el contenido interior. La raíz conserva
  // exactamente la resolución canónica de la escena.
  dzSyncCanvasDocument();
  dzDeselect && dzDeselect();
  dzBuildLayers && dzBuildLayers();
  return true;
}

/** Guarda lo que hay en el lienzo dentro del dibujo actual del documento. */
function dzDocCommit() {
  if (!DZ.doc) return;
  if (DZPointerController?.owns('vector:corners')) DZPointerController.cancel('document-commit');
  DZ.doc.writeDrawing(dzCanvasInner());
}

/** Abre el frame `f`: guarda lo actual y muestra el dibujo que corresponde. */
function dzDocGoTo(f) {
  if (!DZ.doc) return;
  dzDocCommit();
  DZ.doc.goTo(f);
  const d = DZ.doc.drawing;
  dzCanvasSet(d ? d.content : "");
  dzOnionRender();
}

/** Papel cebolla sobre DIBUJOS: pide al modelo qué mostrar y lo pinta. */
function dzOnionRender() {
  document.querySelectorAll("#dzCanvas svg g.dz-onion").forEach((n) => n.remove());
  if (!DZ.doc || !DZ.onionOn) return;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const cfg = { ...LOW.animation.onion.DEFAULTS, ...(DZ.doc.onionCfg || {}) };
  const capas = LOW.animation.onion.resolve(DZ.doc.scene, DZ.doc.layerId, DZ.doc.frame, cfg);
  for (const c of capas) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "dz-onion");
    g.setAttribute("opacity", String(c.opacity));
    g.setAttribute("pointer-events", "none");
    g.innerHTML = c.drawing.content || "";
    // el fantasma se tine entero, asi que NO puede seguir referenciando la
    // paleta: la hoja de estilos le impondria su color y el papel cebolla
    // dejaria de distinguir el pasado del futuro
    g.querySelectorAll("[data-stk],[data-fil]").forEach((n) => {
      n.removeAttribute("data-stk"); n.removeAttribute("data-fil");
    });
    dzOnionStripPage(g, svg.getAttribute("viewBox"));
    // teñir: todo el fantasma del color de su lado del tiempo
    g.querySelectorAll("*").forEach((n) => {
      if (cfg.linesOnly && n.getAttribute("fill") && n.getAttribute("fill") !== "none") n.setAttribute("fill", "none");
      else if (n.getAttribute("fill") && n.getAttribute("fill") !== "none") n.setAttribute("fill", c.color);
      if (n.getAttribute("stroke") && n.getAttribute("stroke") !== "none") n.setAttribute("stroke", c.color);
    });
    svg.insertBefore(g, svg.firstChild);
  }
}

/** Arranca (o migra) el documento de animación. */
async function dzDocInit() {
  const A = LOW.animation;
  if (!A || !A.LowDoc) return null;
  if (DZ.doc) return DZ.doc;
  const root = $("#dzCanvas")?.querySelector(":scope > svg");
  const openedSize = dzSvgDocumentSize(root);
  let recoveredDocument = false;
  // migrar desde la animación vieja si la hay
  if (DZ.anim && DZ.anim.frames && DZ.anim.frames.length) {
    const contents = {};
    for (const ruta of DZ.anim.frames) {
      if (DZ.anim.cache[ruta]) { contents[ruta] = dzInnerOf(DZ.anim.cache[ruta]); continue; }
      try { const r = await api.image_data(ruta); if (r && r.svg) contents[ruta] = dzInnerOf(r.svg); }
      catch (_) { /* un frame ilegible no puede frenar la migración */ }
    }
    DZ.doc = A.LowDoc.fromLegacy(DZ.anim.frames, contents, DZ.scene?.fps || 12, DZ.path);
    dzSetStatus(" Escena migrada al modelo nuevo: " + DZ.doc.scene.levels[0].drawings.length + " dibujos");
  } else {
    // ¿quedó una escena sin guardar de la sesión anterior?
    const rec = dzSceneRecovered();
    const tieneAlgo = rec && (rec.scene.levels || []).some(
      (l) => (l.drawings || []).some((d) => d.content && d.content.length > 40));
    if (tieneAlgo && !/[?&]mock=1/.test(location.search) && await dzConfirmModal(
        "LOW encontró una escena de animación que no llegó a guardarse. ¿La recuperás?", { ok: "Recuperar" })) {
      try {
        DZ.doc = A.LowDoc.fromJSON(rec);
        recoveredDocument = true;
        dzSetStatus(" Escena recuperada");
      } catch (_) { DZ.doc = new A.LowDoc(); }
    } else {
      DZ.doc = new A.LowDoc();
      DZ.doc.writeDrawing(dzCanvasInner());   // lo que ya estaba dibujado es el dibujo 1
    }
  }
  if (!recoveredDocument) DZ.doc.scene.setSize(openedSize.width, openedSize.height);
  if (DZ.scene && DZ.scene.rig && !Object.keys(DZ.doc.scene.rig.nodes).length) {
    DZ.doc.scene.rig = new A.Scene({ rig: DZ.scene.rig }).rig;
    DZ.doc.dirty = true;
  }
  DZ.onionOn = true;
  // UNA sola pila de historial para todo el editor: así Ctrl+Z deshace lo
  // último que hiciste, sea un trazo o un cambio de timing, en el orden real.
  if (!DZ.history) DZ.history = new LOW.core.HistoryManager({ limit: 180 });
  DZ.doc.setHistory(DZ.history);
  DZ.doc.subscribe((doc, motivo) => {
    if (DZ.doc !== doc) return;
    if (motivo === "frame") {
      const selectedId = DZ.sel && DZ.sel.id;
      const drawing = doc.drawing;
      dzCanvasSet(drawing ? drawing.content : "");
      dzOnionRender();
      dzTlFramesSync();          // la barra de chips sigue al modelo
      if (DZ.arcoOn) dzArcoRender();
      dzMocapSync();
      const hasRig = Object.keys((doc.scene.rig && doc.scene.rig.nodes) || {}).length > 0;
      if (hasRig) {
        dzRigApplyLive(doc.frame);
        const selected = selectedId && $("#dzCanvas").querySelector(":scope > svg")?.querySelector("#" + CSS.escape(selectedId));
        if (DZ.rigMode && selected) dzSelect(selected); else if (DZ.rigMode) dzRigPanelSync();
      }
    } else if (motivo === "onion") dzOnionRender();
    else if (motivo === "document") dzSyncCanvasDocument(); else if (motivo === "composition") dzCompositionAplicar?.();
  });
  // la paleta gobierna el color por hoja de estilos: cada cambio se ve al
  // instante en el lienzo, sin recorrer los dibujos
  DZ.doc.subscribe((doc, motivo) => {
    if (DZ.doc !== doc) return;
    if (motivo === "palette" || (motivo === "content" && DZ.palView)) dzPalCssRender();
  });
  dzPalCssRender();
  dzMocapWire();
  if (DZ.doc.mocap && DZ.doc.mocap.source) {
    const st = $("#mocapStatus");
    if (st) st.textContent = DZ.doc.mocap.source.name + " · fuente desconectada: importala otra vez para previsualizar";
  }
  dzPaletteRender();          // el panel pasa a mostrar la paleta de la escena
  dzSyncCanvasDocument();
  dzSyncTransportFromDoc();   // fps y rango del archivo, a los controles
  if (Object.keys((DZ.doc.scene.rig && DZ.doc.scene.rig.nodes) || {}).length) dzRigApplyLive(DZ.doc.frame);
  return DZ.doc;
}

/** Extrae el interior de un <svg> serializado. */
function dzInnerOf(texto) {
  const tmp = document.createElement("div");
  tmp.innerHTML = texto || "";
  const s = tmp.querySelector("svg");
  return s ? s.innerHTML : "";
}

/** Muestra la X-sheet nueva en su panel. */
async function dzXsMount() {
  const host = $("#dzXsRows");
  if (!host || !LOW.animation.XsheetView) return;
  await dzDocInit();
  if (!DZ.playback) {
    DZ.playback = new LOW.animation.Playback(DZ.doc);
    // el transporte se redibuja al reproducir/parar para reflejar el estado
    DZ.playback.subscribe(() => { if (DZ.xsView) DZ.xsView.render(); });
  } else DZ.playback.setDoc(DZ.doc);
  dzPlaybackBindUI();
  if (!DZ.xsView) DZ.xsView = new LOW.animation.XsheetView(host, DZ.doc);
  else DZ.xsView.setDoc(DZ.doc);
  DZ.xsView.playback = DZ.playback;
  dzAudioWire();
  if (DZ.doc.audio) {
    DZ.playback.audio = DZ.doc.audio;
    if (DZ.tlView) DZ.tlView.audio = DZ.doc.audio;
  }
  // sacar el foco de cualquier campo de texto: si quedó en el chat, los atajos
  // de una tecla (espacio, flechas, punto y coma) no llegan nunca
  if (typeof dzReleaseFocus === "function") dzReleaseFocus();
  dzLsMount();
  // atajos de animación: navegar por frames y por DIBUJOS, timing y celdas
  LOW.animation.shortcuts.wire(() => DZ.doc, () => DZ.playback, {
    getSelection: () => DZ.doc && DZ.doc.cellSelection,
    // Copiar y pegar un DIBUJO vive en un solo lugar: acá se lo presta a los
    // atajos, en vez de tener una segunda implementación escuchando aparte que
    // ganaba o perdía según si la X-sheet estaba montada.
    copiarDibujo: () => dzCuadroCopiar(),
    pegarDibujo: () => dzCuadroPegar(),
    hayDibujoCopiado: () => !!DZ.clipCuadro,
    deleteScene: () => dzDeleteContext(),
    status: (m) => dzSetStatus(" " + m),
    toggleOnion: () => { DZ.onionOn = !DZ.onionOn; dzOnion2Render(); dzOnionRender(); },
  });
  DZ.xsView.render();
}

/* ══ WORKSPACES: un layout por etapa del proceso ═════════════════════════
   Cambiar de workspace reorganiza la interfaz y NADA más: la escena, el
   documento abierto y el estado del proyecto quedan intactos. Los layouts son
   datos (workspace/workspaces.js), así que el usuario puede guardar los suyos.
   Esta parte es solo la vista: aplica lo que el modelo decide. */
function dzWsAplicar(ws) {
  const cat = LOW.workspace.PANEL_CATALOG;
  const body = $(".dz-body");
  if (!ws || !body) return;
  $("#designView")?.classList.toggle("color-workspace", ws.id === "color");
  $("#dzInspector")?.classList.toggle("color-studio-open", ws.id === "color");
  const compositor = $("#dzCompositor"); if (compositor) compositor.hidden = ws.id !== "composite";

  for (const [id, meta] of Object.entries(cat)) {
    const cfg = (ws.panels || []).find((x) => x.id === id);
    const el = document.querySelector(meta.element);
    if (!el) continue;
    const oculto = !cfg || cfg.hidden;
    // el viewer no se puede ocultar: sin lienzo no hay programa
    if (meta.fijo) { el.hidden = false; continue; }
    if (id === "timeline") {
      // la timeline tiene su propio encendido (carga la escena): no basta con
      // mostrar el div, hay que pedirle al módulo que se abra o se cierre
      const abierta = !!DZ.anim;   // LA VERDAD ES DZ.anim, NO que el div se vea: la barra de transporte puede estar a la vista con la Timeline APAGADA, y entonces esto daba «ya esta abierta» y no la prendia nunca. Asi se veia el espacio de Animacion sin grilla, sin X-sheet y sin tira de niveles.
      if (!oculto && !abierta) dzAnimToggle();
      else if (oculto && abierta) dzAnimToggle();
      if (!oculto) dzTlMount();
    } else if (id === "xsheet") {
      if (typeof dzXsSetVisible === "function") dzXsSetVisible(!oculto);
    } else if (id === "fn") {
      dzFnSetVisible(!oculto);
    } else if (id === "multiplane") {
      dzCompositionViewShow(!oculto);
      $("#dzZBtn")?.classList.toggle("active", !oculto);
    } else {
      el.hidden = oculto;
    }
    if (!oculto && DZ.panelDock && ["xsheet", "onion", "levelstrip"].includes(id)) {
      if (["left", "right", "bottom"].includes(cfg.dock)) DZ.panelDock.dock(el, cfg.dock);
      else if (cfg.dock === "detached") setTimeout(() => dzDetachPanel(id), 0);
    }
    // NO imponer tamaños. Al hacerlo (tools 56px, inspector 250px, timeline
    // 92px) la barra de herramientas no entraba en su ancho, el lienzo quedaba
    // aplastado y aparecían márgenes enormes por todos lados: el workspace
    // decide QUÉ se ve, no con cuántos píxeles. El tamaño lo manda el CSS de la
    // app, salvo que el usuario lo haya ajustado y guardado a mano.
    if (cfg && cfg.userSize) {
      if (cfg.dock === "bottom" || cfg.dock === "top") el.style.height = cfg.userSize + "px";
      else if (cfg.dock === "left" || cfg.dock === "right") el.style.width = cfg.userSize + "px";
    } else { el.style.width = ""; el.style.height = ""; }
    // el registro de paneles conserva el estado para las ventanas separadas
    if (LOW.workspace.panels && LOW.workspace.panels.panels.has(id)) {
      LOW.workspace.panels.update(id, { visible: !oculto, dock: (cfg && cfg.dock) || "right" });
    }
  }
  // el chat plegado en los workspaces de trabajo: ahí la pantalla es para dibujar
  dzDockWire();
  dzDockPlegar(ws.chat !== true);
  if (ws.abre3d && typeof openL3d === "function") openL3d();
  else if (typeof closeL3d === "function" && !$("#l3dView").hidden) closeL3d();
  dzWsRender();
  dzWindowMenuRender();
  dzSetStatus(" " + ws.name + (ws.descripcion ? " — " + ws.descripcion : ""));
}

/** Dibuja las pestañas de workspace. */
function dzWsRender() {
  const box = $("#dzWorkspaces");
  if (!box) return;
  const W = LOW.workspace.workspaces;
  const activo = W.activeId || W.lastUsed();
  box.innerHTML = "";
  for (const ws of W.all()) {
    const b = document.createElement("button");
    b.className = "dz-ws-tab" + (ws.id === activo ? " active" : "");
    b.textContent = ws.name;
    b.title = ws.descripcion || ws.name;
    b.onclick = () => W.activate(ws.id, dzWsAplicar);
    // doble clic: guardar el layout actual con otro nombre, como en OpenToonz
    b.ondblclick = async (e) => {
      e.preventDefault();
      const nombre = await dzPromptModal("Nombre del espacio de trabajo", "nombre", ws.name);
      if (!nombre) return;
      W.save(ws.id, ws.panels, nombre);
      dzWsRender();
    };
    box.appendChild(b);
  }
}

function dzWsCapture() {
  return Object.entries(LOW.workspace.PANEL_CATALOG).map(([id, meta]) => {
    const el = document.querySelector(meta.element);
    if (!el) return { id, hidden: true };
    const dock = el.closest(".dz-animation-dock");
    const detached = DZ.detached && DZ.detached.has(id);
    const cfg = { id, hidden: !!el.hidden, dock: detached ? "detached" :
      (el.classList.contains("dz-panel-floating") ? "float" : (dock?.dataset.zone || "center")) };
    if (cfg.dock === "left" || cfg.dock === "right") cfg.userSize = Math.round(el.getBoundingClientRect().width);
    if (cfg.dock === "bottom") cfg.userSize = Math.round(el.getBoundingClientRect().height);
    return cfg;
  });
}
function dzWsSaveCurrent() {
  const W = LOW.workspace.workspaces, id = W.activeId || W.lastUsed(), ws = W.get(id);
  W.save(id, dzWsCapture(), ws?.name || id); dzWsRender();
  dzSetStatus(" Disposición guardada en «" + (ws?.name || id) + "»");
}
async function dzWsDuplicateCurrent() {
  const W = LOW.workspace.workspaces, id = W.activeId || W.lastUsed();
  const nombre = await dzPromptModal("Nuevo espacio de trabajo", "nombre", (W.get(id)?.name || "Espacio") + " · personalizado");
  if (!nombre) return;
  W.save(id, dzWsCapture(), W.get(id)?.name || id);
  const copy = W.duplicate(id, nombre); if (copy) W.activate(copy.id, dzWsAplicar);
}
function dzWsSetLocked(value) {
  DZ.workspaceLocked = !!value;
  dzPrefsStorage().setItem("low.workspace.locked", DZ.workspaceLocked ? "1" : "0");
  $("#designView")?.classList.toggle("workspace-locked", DZ.workspaceLocked);
  dzSetStatus(DZ.workspaceLocked ? " Disposición bloqueada" : " Disposición desbloqueada");
}
function dzWsResetCurrent() {
  const W = LOW.workspace.workspaces, id = W.activeId || W.lastUsed();
  const ws = W.reset(id); if (ws) W.activate(ws.id, dzWsAplicar);
}

function dzWsInit() {
  if (!window.LOW || !LOW.workspace || !LOW.workspace.workspaces) return;
  dzDragOutAll();
  dzPanelDockSetup();
  dzWsSetLocked(dzPrefsStorage().getItem("low.workspace.locked") === "1");
  dzWsRender();
  LOW.workspace.workspaces.activate(LOW.workspace.workspaces.lastUsed(), dzWsAplicar);
}

/* ══ GUÍAS DE ALINEACIÓN DINÁMICAS (estilo Illustrator) ══════════════════
   Mientras arrastrás, si un borde o el centro de lo que movés queda casi a la
   altura del de otro objeto, se imanta y aparece la línea de alineación. Es
   distinto de las guías fijas (las que se tiran de la regla): estas viven solo
   durante el gesto y salen de los objetos mismos. */
const DZ_ALIGN_PX = 6;          // tolerancia EN PANTALLA: no cambia con el zoom
DZ.alignLines = [];

/** Referencias de alineación de todo lo que NO se está moviendo: bordes y
 *  centro de cada objeto, más los bordes y el centro del lienzo. */
function dzAlignRefs(excluir) {
  const svg = $("#dzCanvas") && $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return { xs: [], ys: [] };
  const fuera = new Set(excluir || []);
  const xs = [], ys = [];
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  // el lienzo también alinea (bordes y centro), como la mesa de trabajo de Illustrator
  xs.push({ v: vb[0], tipo: "lienzo" }, { v: vb[0] + vb[2] / 2, tipo: "lienzo" },
          { v: vb[0] + vb[2], tipo: "lienzo" });
  ys.push({ v: vb[1], tipo: "lienzo" }, { v: vb[1] + vb[3] / 2, tipo: "lienzo" },
          { v: vb[1] + vb[3], tipo: "lienzo" });
  for (const n of svg.children) {
    if (fuera.has(n) || DZ_SKIP_TAGS.includes(n.tagName.toLowerCase())) continue;
    if (n.classList && (n.classList.contains("dz-onion") || n.classList.contains("dz-penui"))) continue;
    if (n.getAttribute("display") === "none") continue;
    const b = n.getBoundingClientRect();
    if (!b.width && !b.height) continue;
    const p1 = dzToUser(b.left, b.top), p2 = dzToUser(b.right, b.bottom);
    xs.push({ v: p1.x, tipo: "obj", y1: p1.y, y2: p2.y },
            { v: (p1.x + p2.x) / 2, tipo: "obj", y1: p1.y, y2: p2.y },
            { v: p2.x, tipo: "obj", y1: p1.y, y2: p2.y });
    ys.push({ v: p1.y, tipo: "obj", x1: p1.x, x2: p2.x },
            { v: (p1.y + p2.y) / 2, tipo: "obj", x1: p1.x, x2: p2.x },
            { v: p2.y, tipo: "obj", x1: p1.x, x2: p2.x });
  }
  return { xs, ys };
}

/** Corrige (dx,dy) para que la selección quede alineada con algo. Devuelve el
 *  ajuste y las líneas a dibujar. La tolerancia se mide en PÍXELES de pantalla
 *  para que imantar cueste lo mismo con cualquier zoom. */
function dzAlignAdjust(bounds, refs, dx, dy) {
  const tol = DZ_ALIGN_PX / (DZ.zoom || 1);
  const lineas = [];
  let ax = 0, ay = 0, mejorX = tol, mejorY = tol;
  const bordesX = [bounds.x1 + dx, (bounds.x1 + bounds.x2) / 2 + dx, bounds.x2 + dx];
  const bordesY = [bounds.y1 + dy, (bounds.y1 + bounds.y2) / 2 + dy, bounds.y2 + dy];
  for (const b of bordesX) for (const r of refs.xs) {
    const d = Math.abs(r.v - b);
    if (d < mejorX) { mejorX = d; ax = r.v - b; }
  }
  for (const b of bordesY) for (const r of refs.ys) {
    const d = Math.abs(r.v - b);
    if (d < mejorY) { mejorY = d; ay = r.v - b; }
  }
  // recalcular con el ajuste puesto, para dibujar solo las que quedaron exactas
  for (const b of bordesX) for (const r of refs.xs) {
    if (Math.abs(r.v - (b + ax)) < 0.01) {
      const y1 = Math.min(r.y1 ?? bounds.y1 + dy + ay, bounds.y1 + dy + ay);
      const y2 = Math.max(r.y2 ?? bounds.y2 + dy + ay, bounds.y2 + dy + ay);
      lineas.push({ axis: "v", v: r.v, a: y1, b: y2 });
    }
  }
  for (const b of bordesY) for (const r of refs.ys) {
    if (Math.abs(r.v - (b + ay)) < 0.01) {
      const x1 = Math.min(r.x1 ?? bounds.x1 + dx + ax, bounds.x1 + dx + ax);
      const x2 = Math.max(r.x2 ?? bounds.x2 + dx + ax, bounds.x2 + dx + ax);
      lineas.push({ axis: "h", v: r.v, a: x1, b: x2 });
    }
  }
  return { ax, ay, lineas };
}

/** Dibuja las líneas de alineación del gesto en curso. */
function dzAlignRender(lineas) {
  let box = $("#dzAlignLayer");
  if (!box) {
    box = document.createElement("div");
    box.id = "dzAlignLayer";
    box.className = "dz-alignlines";
    $("#dzCanvas").appendChild(box);
  }
  if (!lineas || !lineas.length) { box.innerHTML = ""; return; }
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  const cv = $("#dzCanvas").getBoundingClientRect();
  const vistos = new Set();
  box.innerHTML = lineas.map(L => {
    const clave = L.axis + ":" + Math.round(L.v * 10);
    if (vistos.has(clave)) return "";
    vistos.add(clave);
    // de coordenadas de usuario a píxeles de pantalla, con el mismo camino que
    // usa el resto del editor (respeta zoom, paneo y rotación de vista)
    const p1 = dzFromUser(L.axis === "v" ? L.v : L.a, L.axis === "v" ? L.a : L.v);
    const p2 = dzFromUser(L.axis === "v" ? L.v : L.b, L.axis === "v" ? L.b : L.v);
    if (!p1 || !p2) return "";
    const x1 = p1.x - cv.left, y1 = p1.y - cv.top, x2 = p2.x - cv.left, y2 = p2.y - cv.top;
    const largo = Math.hypot(x2 - x1, y2 - y1);
    const ang = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    return `<i style="left:${x1}px;top:${y1}px;width:${largo}px;transform:rotate(${ang}deg)"></i>`;
  }).join("");
  void svg;
}

function dzAlignClear() {
  const box = $("#dzAlignLayer");
  if (box) box.innerHTML = "";
  DZ.alignLines = [];
}

function dzAlign(mode) {
  const el = DZ.sel;
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!el || !svg) return;
  dzSnapshot();
  const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
  const b = el.getBoundingClientRect();
  const p1 = dzToUser(b.left, b.top), p2 = dzToUser(b.right, b.bottom);
  let dx = 0, dy = 0;
  if (mode === "l") dx = vb[0] - p1.x;
  if (mode === "ch") dx = (vb[0] + vb[2] / 2) - (p1.x + p2.x) / 2;
  if (mode === "r") dx = (vb[0] + vb[2]) - p2.x;
  if (mode === "t") dy = vb[1] - p1.y;
  if (mode === "cv") dy = (vb[1] + vb[3] / 2) - (p1.y + p2.y) / 2;
  if (mode === "b") dy = (vb[1] + vb[3]) - p2.y;
  dzWritePos(el, dzReadPos(el), dx, dy);
  dzPositionHandle(); dzMarkDirty(); dzBuildInspector(el);
}

/* ── alineación ENTRE objetos + distribuir (multi-selección, estilo Illustrator) ── */
function dzSelBounds(els) {
  return els.map(el => {
    const b = el.getBoundingClientRect();
    const p1 = dzToUser(b.left, b.top), p2 = dzToUser(b.right, b.bottom);
    return { el, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
             cx: (p1.x + p2.x) / 2, cy: (p1.y + p2.y) / 2, w: p2.x - p1.x, h: p2.y - p1.y };
  });
}
function dzAlignSel(mode) {
  const els = (DZ.multi || []).length > 1 ? DZ.multi : null;
  if (!els) return;
  dzSnapshot();
  const bs = dzSelBounds(els);
  const L = Math.min(...bs.map(b => b.x1)), R = Math.max(...bs.map(b => b.x2));
  const T = Math.min(...bs.map(b => b.y1)), B = Math.max(...bs.map(b => b.y2));
  for (const b of bs) {
    let dx = 0, dy = 0;
    if (mode === "l") dx = L - b.x1;
    if (mode === "ch") dx = (L + R) / 2 - b.cx;
    if (mode === "r") dx = R - b.x2;
    if (mode === "t") dy = T - b.y1;
    if (mode === "cv") dy = (T + B) / 2 - b.cy;
    if (mode === "b") dy = B - b.y2;
    if (dx || dy) dzWritePos(b.el, dzReadPos(b.el), dx, dy);
  }
  dzPositionHandle(); dzMarkDirty();
  dzSetStatus(" " + els.length + " alineados");
}
function dzDistribute(axis) {
  const els = (DZ.multi || []).length > 2 ? DZ.multi : null;
  if (!els) { dzSetStatus("distribuir necesita 3+ elementos (Shift+clic)"); return; }
  dzSnapshot();
  const bs = dzSelBounds(els).sort((a, b) => axis === "h" ? a.cx - b.cx : a.cy - b.cy);
  const first = bs[0], last = bs[bs.length - 1];
  const span = axis === "h" ? last.cx - first.cx : last.cy - first.cy;
  const step = span / (bs.length - 1);
  bs.forEach((b, i) => {
    if (i === 0 || i === bs.length - 1) return;
    const target = (axis === "h" ? first.cx : first.cy) + step * i;
    const d = target - (axis === "h" ? b.cx : b.cy);
    dzWritePos(b.el, dzReadPos(b.el), axis === "h" ? d : 0, axis === "h" ? 0 : d);
  });
  dzMarkDirty(); dzSetStatus(" distribuidos con espaciado parejo");
}
/* voltear horizontal/vertical (uno o varios), anclado al centro local */
function dzFlip(axis) {
  const els = (DZ.multi || []).length > 1 ? DZ.multi : (DZ.sel ? [DZ.sel] : []);
  if (!els.length) return;
  dzSnapshot();
  for (const el of els) {
    let lb = null; try { lb = el.getBBox(); } catch (e) { continue; }
    const cx = lb.x + lb.width / 2, cy = lb.y + lb.height / 2;
    const sx = axis === "h" ? -1 : 1, sy = axis === "h" ? 1 : -1;
    const chunk = ` translate(${(cx * (1 - sx)).toFixed(2)} ${(cy * (1 - sy)).toFixed(2)}) scale(${sx} ${sy})`;
    const tr = el.getAttribute("transform") || "";
    el.setAttribute("transform", (tr ? tr + " " : "") + chunk.trim());
  }
  dzPositionHandle(); dzMarkDirty();
}

/* ── 🧬 Variaciones: el agente evoluciona el diseño y elegís con un clic.
   Cría selectiva de diseños — elegí una y volvé a evolucionar desde ella. ── */
async function dzVariations() {
  if (!DZ.path || DZ.busy) return;
  DZ.busy = true;
  dzSetStatus("🧬 Generando variaciones del diseño (4 direcciones en paralelo)…");
  try {
    // mandar el estado ACTUAL del lienzo (con tus últimos toques, aún sin guardar)
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    const r = await api.design_variations(DZ.path, svg ? dzSerialize(svg) : "");
    const vs = (r && r.variants) || [];
    if (r && r.error) { dzSetStatus(" " + r.error); return; }
    if (!vs.length) { dzSetStatus(" No salieron variaciones válidas — probá de nuevo (o cambiá de modelo)."); return; }
    openModal(`<h2>🧬 Variaciones</h2>
      <div class="sub">Clic en una para reemplazar el diseño — después podés volver a 🧬 y evolucionar desde ella. (Nada se guarda hasta que toques .)</div>
      <div class="var-grid">` +
      vs.map((v, i) => `<div class="var-cell" data-i="${i}"><div class="var-tag">${v.dir}</div>${v.svg}</div>`).join("") +
      `</div><div class="m-actions"><button class="ghost" id="mCancel">Cerrar</button></div>`);
    document.querySelectorAll(".var-cell").forEach(c => c.onclick = () => {
      const v = vs[+c.dataset.i];
      $("#dzCodeArea").value = v.svg;
      dzApplyCode();
      closeModal();
      dzSetStatus("🧬 Aplicada la variación «" + v.dir + "» —  para guardarla, o 🧬 para seguir evolucionando.");
    });
    $("#mCancel").onclick = closeModal;
    dzSetStatus("");
  } catch (e) {
    dzSetStatus(" " + (e.message || e));
  } finally {
    DZ.busy = false;
  }
}

/* ── open code design: ver/editar el SVG como código, lado a lado ── */
function dzToggleCode() {
  const panel = $("#dzCode");
  if (panel.hidden) {
    const svg = $("#dzCanvas").querySelector(":scope > svg");
    $("#dzCodeArea").value = svg ? dzSerialize(svg) : "";
    panel.hidden = false;
  } else {
    panel.hidden = true;
  }
}
/* reemplaza el svg del lienzo por otro (texto), conservando tirador/pin */
function dzApplySvgText(txt, options = {}) {
  const cv = $("#dzCanvas");
  const handle = $("#dzHandle");
  const old = cv.querySelector(":scope > svg");
  const tmp = document.createElement("div"); tmp.innerHTML = txt;
  const nsvg = tmp.querySelector("svg");
  if (!nsvg) { sysMsg(" El código no tiene un <svg> válido."); return false; }
  if (old) old.remove();
  cv.insertBefore(nsvg, handle);
  const wanted = options.documentSize || (DZ.doc?.scene ? {
    width: DZ.doc.scene.width, height: DZ.doc.scene.height
  } : null);
  dzNormalizeSvgDocument(nsvg, wanted);
  DZ.sel = null; DZ.multi = []; dzNodesClear();
  $("#dzProps").hidden = true; $("#dzEmpty").hidden = false; handle.hidden = true;
  dzApplyZoom(); dzMarkDirty(); dzBuildLayers();
  if (DZ.anim) dzOnionUpdate();
  if (DZ.d3) dz3dBuild();   // en espacio 3D: reflejar el svg nuevo (undo/redo/código)
  return true;
}
function dzApplyCode() {
  const txt = $("#dzCodeArea").value.trim();
  if (!txt) return;
  dzSnapshot();
  dzApplySvgText(txt);
}

/* ── deshacer/rehacer (Ctrl+Z / Ctrl+Y): fotos del SVG antes de cada cambio ── */
function dzSnapshot() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  if (!DZ.history) DZ.history = new LOW.core.HistoryManager({ limit: 180 });
  DZ.history.push({ label: "Editar dibujo", domain: "drawing", before: dzSerialize(svg), after: null,
    capture: () => { const current = $("#dzCanvas").querySelector(":scope > svg"); return current ? dzSerialize(current) : null; },
    apply: (_direction, value) => { if (value) dzApplySvgText(value); } });
  DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack;
}
function dzUndo() {
  // El volcado del lienzo al modelo está en camino (260 ms): si se dispara
  // DESPUÉS de deshacer, vuelve a escribir lo que acabás de sacar. Se cancela.
  clearTimeout(DZ_DOC_TIMER);
  if (!DZ.history || !DZ.history.undo()) { setStatus("(nada para deshacer)"); return; }
  DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack;
  const sig = DZ.history.redoStack[DZ.history.redoStack.length - 1];
  setStatus("↩ deshecho" + (sig && sig.label ? ": " + sig.label.toLowerCase() : ""));
}
function dzRedo() {
  clearTimeout(DZ_DOC_TIMER);
  if (!DZ.history || !DZ.history.redo()) return;
  DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack;
  setStatus("↪ rehecho");
}
/* serializa el svg sin las marcas de la UI (clase de selección) */
function dzSerialize(svg) {
  const c = svg.cloneNode(true);
  dzRigStrip(c);            // restaurar transform original: la pose vive en la escena
  c.querySelectorAll("g.dz-onion").forEach(n => n.remove());   // papel cebolla: solo UI
  c.querySelectorAll("g.dz-penui").forEach(n => n.remove());   // guías de la pluma: solo UI
  c.querySelectorAll("g.dz-vp-guides,[data-low='ruler-guide']").forEach(n => n.remove()); // guías de regla
  c.querySelectorAll(".dz-sel").forEach(n => n.classList.remove("dz-sel"));
  c.querySelectorAll(".dz-msel").forEach(n => n.classList.remove("dz-msel"));
  c.querySelectorAll("[class='']").forEach(n => n.removeAttribute("class"));
  c.style.removeProperty("transform");
  ["width", "height", "max-width", "max-height", "aspect-ratio"].forEach((p) => c.style.removeProperty(p));
  if (!c.getAttribute("style")) c.removeAttribute("style");   // no dejar style="" vacío
  return c.outerHTML;
}

/* ── chat del diseño: pedirle una corrección al agente sin salir del editor ── */
function dzSetStatus(txt) {
  const el = $("#dzStatus");
  const sb = $("#sbHint");
  if (sb) sb.textContent = txt || "";
  if (!txt) { el.hidden = true; el.textContent = ""; return; }
  el.hidden = false; el.textContent = txt;
}
async function designPrompt() {
  const ta = $("#dzPrompt");
  const text = ta.value.trim();
  if (!text || !DZ.path || DZ.busy) return;
  ta.value = "";
  DZ.busy = true;
  const tag = DZ.sel ? DZ.sel.tagName.toLowerCase() : null;
  dzSetStatus(tag ? `✍ LOW edita el <${tag}>…` : "✍ LOW está ajustando el diseño…");
  userMsg(" " + (tag ? `[${tag}] ` : "") + text); persist("user", "(diseño) " + text);
  try {
    let msg;
    if (DZ.sel) {
      // MODO COMENTARIO/PIN: el cambio aplica SOLO al elemento marcado. Le paso el
      // código exacto del elemento como ancla para que edit_file sea preciso.
      const exact = dzElementCode(DZ.sel);
      msg = "Estás editando el SVG «" + DZ.path + "» en el editor de diseño de LOW. " +
        "El usuario dejó un comentario sobre UN elemento puntual. Modificá SOLO ese elemento " +
        "(no toques el resto del SVG) con edit_file, usando este fragmento exacto como old_text:\n" +
        "```\n" + exact + "\n```\n" +
        "Comentario del usuario: " + text +
        "\nMantené el viewBox y que quede dentro del lienzo. Confirmá en una línea qué cambiaste.";
    } else {
      msg = "Estás editando el SVG «" + DZ.path + "» abierto en el editor de diseño de LOW. " +
        "Aplicá SOLO este cambio con edit_file (mantené el viewBox y todo dentro del lienzo, " +
        "prolijo y alineado): " + text +
        "\nConfirmá en una línea qué cambiaste.";
    }
    const r = await api.send_chat(msg, "", "xml", null);
    const reply = (r && (r.full || r.text)) || "";
    dzSetStatus(reply ? reply.slice(0, 300) : (r && r.status) || "Listo.");
  } catch (e) {
    dzSetStatus(" " + (e.message || e));
  } finally {
    DZ.busy = false;
  }
}

/* código exacto de un elemento (sin marcas de UI) para anclar el edit_file */
function dzElementCode(el) {
  const c = el.cloneNode(true);
  c.classList.remove("dz-sel");
  if (!c.getAttribute("class")) c.removeAttribute("class");
  return c.outerHTML;
}

const dzGet = (el, attr, cssProp) => el.getAttribute(attr) ||
  (cssProp ? getComputedStyle(el)[cssProp] : "") || "";

function dzField(label, id, value, type) {
  const v = (value == null ? "" : String(value)).replace(/"/g, "&quot;");
  return `<div class="dz-field"><label>${label}</label>` +
    `<input id="${id}" type="${type || "text"}" value="${v}"></div>`;
}

// aplicar un atributo (o quitarlo si queda vacío) al elemento seleccionado
function dzSet(el, attr, val) {
  if (val === "" || val == null) el.removeAttribute(attr);
  else el.setAttribute(attr, val);
}
// normaliza un color SVG (nombre/hex/rgb) a #rrggbb para el <input type=color>
function dzHex(c) {
  c = (c || "").trim();
  if (!c || /^(none|transparent|currentcolor|inherit)$/i.test(c)) return null;
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map(x => x + x).join("");
  const rgb = c.match(/^rgba?\(\s*([\d.]+)(?:\s*,|\s+)\s*([\d.]+)(?:\s*,|\s+)\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgb) {
    if (rgb[4] && (rgb[4] === "0" || rgb[4] === "0%")) return null;
    const byte = n => Math.max(0, Math.min(255, Math.round(+n))).toString(16).padStart(2, "0");
    return "#" + byte(rgb[1]) + byte(rgb[2]) + byte(rgb[3]);
  }
  try {
    const cx = document.createElement("canvas").getContext("2d");
    cx.fillStyle = "#010203"; cx.fillStyle = c;
    if (cx.fillStyle === "#010203" && c.toLowerCase() !== "#010203") return null;
    if (/^#[0-9a-f]{6}$/i.test(cx.fillStyle)) return cx.fillStyle;
    if (/^#[0-9a-f]{3}$/i.test(cx.fillStyle)) return "#" + cx.fillStyle.slice(1).split("").map(x => x + x).join("");
  } catch (e) { /* */ }
  return null;
}

async function dzSave() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg || !DZ.path) return;
  const txt = dzSerialize(svg);
  let r = null, err = null;
  try { r = await api.save_file(DZ.path, txt); } catch (e) { err = e; }
  if (!r && !err) return;                       // el diálogo se canceló: no hay nada que decir
  if (!dzSaveOk(r)) return dzSaveFallo("El diseño", dzSaveError(r, err));
  DZ.dirty = false;
  const tab = dzDocumentTabCurrent(); if (tab) { tab.dirty = false; tab.content = txt; dzDocumentTabsRender(); }
  // el punto de recuperación se borra SOLO cuando el disco confirmó
  window.LOW?.workspace?.recovery?.clear(DZ.path);
  setStatus(" " + (r.name || "diseño guardado")); sysMsg(" Diseño guardado: " + (r.name || DZ.path));
}

/* ── Herramientas del agente (qué puede hacer solo) ── */
function modalTools() {
  const rows = (S.agentTools || []).map(t =>
    `<div class="listrow"><span class="lr-name">${t.name}</span>` +
    `<span class="lr-desc">${(t.desc || "").replace(/</g, "&lt;")}</span></div>`).join("");
  openModal(`<h2>Herramientas del agente</h2>
    <div class="sub">Lo que LOW puede hacer por su cuenta cuando le pedís algo. No hay filtros ocultos.</div>
    ${rows || '<div class="sub">—</div>'}
    <div class="m-actions"><button class="primary" id="mCancel">Cerrar</button></div>`);
  $("#mCancel").onclick = closeModal;
}

/* ── Plantillas de órdenes: un clic las carga en el input ── */
const TEMPLATES = [
  ["Crear una app web", "Creá una app web completa en un solo archivo HTML (con CSS y JS embebidos) que "],
  ["Explicar el código", "Explicá qué hace el código del editor, paso a paso y en criollo."],
  ["Encontrar bugs", "Revisá el código del editor y encontrá bugs o casos borde que fallen. Listalos."],
  ["Escribir tests", "Escribí tests para el código del editor y corrélos para verificar que pasan."],
  ["Refactorizar", "Refactorizá el código del editor para que sea más legible, sin cambiar su comportamiento."],
  ["Documentar", "Agregá comentarios y docstrings claros al código del editor."],
  ["Juego en HTML", "Hacé un juego simple jugable en un solo archivo HTML (canvas + JS), sin dependencias."],
];
/* ── Rutinas: órdenes reutilizables (predefinidas + guardadas por el usuario) ──
   Clic  ejecuta al instante · clic en el nombre la carga en el input para editar */
function modalRoutines() {
  const user = (S.routines || []).map((r, i) =>
    `<div class="listrow"><span class="lr-name rt-fill" data-p="${esc(r.prompt)}">${esc(r.name)}</span>` +
    `<span class="lr-desc">${esc(r.prompt).slice(0, 70)}…</span>` +
    `<div class="rt-actions"><span class="rt-run" data-p="${esc(r.prompt)}"> ejecutar</span>` +
    `<span class="rt-del" data-n="${esc(r.name)}">✕</span></div></div>`).join("");
  const built = TEMPLATES.map(t =>
    `<div class="listrow"><span class="lr-name rt-fill" data-p="${esc(t[1])}">${esc(t[0])}</span>` +
    `<span class="lr-desc">${esc(t[1]).slice(0, 70)}…</span>` +
    `<div class="rt-actions"><span class="rt-run" data-p="${esc(t[1])}"> ejecutar</span></div></div>`).join("");
  openModal(`<h2>Rutinas</h2>
    <div class="sub">Órdenes reutilizables. <b> ejecutar</b> la manda ya; el nombre la carga en el input.</div>
    ${user ? '<div class="rt-group">Tuyas</div>' + user : ''}
    <div class="rt-group">Predefinidas</div>${built}
    <div class="rt-save">
      <input id="rtName" class="cmp-field" placeholder="Nombre de la rutina" spellcheck="false">
      <button class="ghost" id="rtSaveBtn"> Guardar la orden que está en el input</button>
    </div>
    <div class="m-actions"><button class="primary" id="mCancel">Cerrar</button></div>`);
  const fill = p => { $("#inp").value = p; closeModal(); $("#inp").focus(); };
  const runp = p => { closeModal(); $("#inp").value = p; send(); };
  document.querySelectorAll("#modal .rt-fill").forEach(e => e.onclick = () => fill(e.dataset.p));
  document.querySelectorAll("#modal .rt-run").forEach(e => e.onclick = () => runp(e.dataset.p));
  document.querySelectorAll("#modal .rt-del").forEach(e => e.onclick = async () => {
    const st = await api.delete_routine(e.dataset.n); S.routines = st.routines; modalRoutines();
  });
  $("#rtSaveBtn").onclick = async () => {
    const name = $("#rtName").value.trim();
    const prompt = $("#inp").value.trim();
    if (!name) { $("#rtName").focus(); return; }
    if (!prompt) { sysMsg("Escribí primero la orden en el cuadro de texto, después guardala como rutina."); return; }
    const st = await api.save_routine(name, prompt);
    S.routines = st.routines; modalRoutines();
  };
  $("#mCancel").onclick = closeModal;
}

/* ── Servidores SSH (alias para ssh_exec / scp_upload / /ssh) ── */
function modalServers() {
  const esc = v => (v == null ? "" : String(v)).replace(/"/g, "&quot;");
  const hosts = (S.sshHosts || []).map(h => ({ ...h }));   // copia editable
  openModal(`<h2>Servidores SSH</h2>
    <div class="sub">Guardá servidores para que el agente los use por alias
    (ssh_exec / scp_upload) o con <b>/ssh &lt;alias&gt; &lt;comando&gt;</b>.
    «clave» = ruta a tu clave privada (opcional si usás el agente SSH).</div>
    <div id="srvList"></div>
    <button class="ghost" id="srvAdd" style="margin-top:8px"> Agregar servidor</button>
    <div class="m-actions">
      <button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="mSave">Guardar</button>
    </div>`);
  const render = () => {
    const box = $("#srvList");
    box.innerHTML = "";
    if (!hosts.length) { box.innerHTML = '<div class="sub">Todavía no hay servidores.</div>'; return; }
    hosts.forEach((h, i) => {
      const row = document.createElement("div");
      row.className = "srv-row";
      row.innerHTML =
        `<input data-k="name" placeholder="alias" value="${esc(h.name)}" spellcheck="false">` +
        `<input data-k="user" placeholder="usuario" value="${esc(h.user)}" spellcheck="false">` +
        `<input data-k="host" placeholder="ip o dominio" value="${esc(h.host)}" spellcheck="false">` +
        `<input data-k="port" placeholder="22" value="${esc(h.port)}" class="srv-port" spellcheck="false">` +
        `<input data-k="key" placeholder="ruta clave (opcional)" value="${esc(h.key)}" spellcheck="false">` +
        `<button class="srv-del" title="Quitar">✕</button>`;
      row.querySelectorAll("input").forEach(inp => {
        inp.oninput = () => { hosts[i][inp.dataset.k] = inp.value; };
      });
      row.querySelector(".srv-del").onclick = () => { hosts.splice(i, 1); render(); };
      box.appendChild(row);
    });
  };
  render();
  $("#srvAdd").onclick = () => { hosts.push({ name: "", user: "", host: "", port: "", key: "" }); render(); };
  $("#mCancel").onclick = closeModal;
  $("#mSave").onclick = async () => {
    const r = await api.save_ssh_hosts(
      hosts.filter(h => (h.name || "").trim() && (h.host || "").trim()));
    S.sshHosts = r.ssh_hosts;
    closeModal();
    sysMsg(` ${S.sshHosts.length} servidor(es) SSH guardado(s). Usalos por alias con ssh_exec o /ssh.`);
  };
}

/* ── Historial de conversaciones (clickeable  restaurar) ── */
async function modalHistory() {
  const files = await api.history();
  const rows = files.length ? files.map(f =>
    `<div class="listrow hist" data-id="${f.id}"><span class="lr-name">${f.id}</span>` +
    `<span class="lr-desc">${(f.first || "").replace(/</g, "&lt;")}</span></div>`).join("")
    : '<div class="sub">Todavía no hay conversaciones guardadas.</div>';
  openModal(`<h2>Historial de conversaciones</h2>
    <div class="sub">Un clic restaura la conversación en el chat.</div>
    ${rows}
    <div class="m-actions"><button class="primary" id="mCancel">Cerrar</button></div>`);
  document.querySelectorAll("#modal .hist").forEach(el => {
    el.onclick = () => { closeModal(); resume(el.dataset.id); };
  });
  $("#mCancel").onclick = closeModal;
}

/* ── barra de estado ── */
function updateLnCol() {
  const c = cm.getCursor();
  $("#lncol").textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
}
