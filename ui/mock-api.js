/* ══ ARNÉS DE PRUEBAS — mock del puente pywebview ══
   Permite abrir la UI completa de LOW en un navegador común para probar y
   verificar (a mano o automatizado) sin la app Python:

     cd low && python -m http.server 8791
     → http://localhost:8791/ui/index.html?mock=1

   SOLO se activa con ?mock=1 en la URL: la app real (pywebview) jamás pasa
   query params, así que este archivo es inerte en producción.
   Cualquier método no listado devuelve una promesa vacía ({}). */
(function () {
  if (!new URLSearchParams(location.search).has("mock")) return;
  // `?mock=1` es una opción explícita de pruebas: debe reemplazar incluso el
  // contenedor vacío que algunos navegadores embebidos inyectan antes de cargar.

  // diseño de muestra: dos capas <g> con profundidad + una capa SUELTA
  // (el <path> superior) para poder probar el flujo "capa suelta" del 3D
  const SAMPLE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" preserveAspectRatio="xMidYMid meet">' +
    '<rect width="1920" height="1080" fill="#ffffff"/>' +                          // fondo real, como los diseños de LOW
    '<g data-low="plano"><circle cx="510" cy="620" r="150" fill="#F0450E"/>' +
    '<rect x="300" y="760" width="480" height="40" fill="#171716"/></g>' +
    '<g data-low="plano" data-z="140"><rect x="330" y="330" width="420" height="260" fill="#33B5E8" opacity="0.85"/></g>' +
    '<path d="M 200 200 L 400 260 L 340 380 Z" fill="#F0A030"/>' +
    '</svg>';

  const STATE = {
    version: "mock", zoom: 1.0, theme: "dark",
    ws: "C:\\mock\\proyecto", branch: "", session_id: "mock",
    providers: [{ name: "mock", has_key: true }], provider: "mock",
    model: "mock-1", models: ["mock-1"], langs: ["python"], apis: 1,
    tree: [], routines: [], agent: {}, ssh_hosts: [], chain: [],
  };

  const impl = {
    log_js: m => console.log("[js→py]", m),
    export_premiere: async (path, frames, xml, wav, name) => {
      window.__premiere = { path, frames: (frames || []).length, xml, wav: !!wav, name };
      return { path: "C:\\mock\\export\\" + name + "_premiere", name: name + ".xml",
        frames: (frames || []).length, audio: !!wav };
    },
    crash_report: async (data) => {
      // el mock imita la lista blanca del puente: si el informe filtra algo
      // privado, la prueba tiene que poder verlo
      const permitidos = ["motivo", "error", "origen", "version", "sistema", "gpu",
        "escena", "ultimoComando", "herramienta", "cuandoUI"];
      const limpio = {}; permitidos.forEach(k => { if (data && data[k] != null) limpio[k] = data[k]; });
      window.__ultimoInforme = { enviado: data, guardado: limpio };
      return { path: "C:\\mock\\fallos\\fallo-mock.json", name: "fallo-mock.json", campos: Object.keys(limpio).sort() };
    },
    // La bitácora de la prueba maestra (§15). El mock la deja a la vista para
    // que el recorrido pueda comprobar QUE SE ESCRIBE y con qué forma: sin eso
    // el instrumento podría medir bien y no guardar nada.
    session_log: async (data) => {
      window.__ultimaBitacora = data;
      return { path: "C:\mock\sesiones\prueba15-mock.json",
        name: "prueba15-mock.json", carpeta: "C:\mock\sesiones" };
    },
    // paneles separados: el mock guarda el buzón en memoria y deja ver los
    // comandos, para poder probar el flujo sin ventanas nativas
    __panels: {},
    panel_state: async (kind, state) => { const M = impl.__panels;
      if (state) { M[kind] = state; return state; } return M[kind] || {}; },
    panel_command: async (kind, action, payload) => {
      window.lowPanelCommand && window.lowPanelCommand({ kind, action, payload }); return { ok: true }; },
    open_panel: async kind => { (window.__opened = window.__opened || []).push(kind); return { ok: true, mock: true }; },
    panel_closed: async () => ({ ok: true }),
    get_state: async () => {
      const seguro = new URLSearchParams(location.search).has("safe");
      const base = seguro ? { ...STATE, safe_mode: true, ws: null, branch: "", tree: [] } : { ...STATE };
      // Doble clic en un .low: el puente real entrega el archivo UNA sola vez y
      // despues lo limpia, para que un refresco no lo reabra encima del trabajo.
      base.open_file = STATE.__abrir || null;
      STATE.__abrir = null;
      return base;
    },
    // Mismo contrato que el puente: {path, name, content} o {error}
    open_file: async (path) => (window.__lowFiles || {})[path]
      || { error: "no existe " + path },
    enter_safe_mode: async () => ({ ok: true }),
    history: async () => [],
    ollama_models: async () => [],
    refresh_tree: async () => ({ tree: [] }),
    new_design: async () => ({ path: "C:\\mock\\rig-test.svg" }),
    // Guarda la escena escrita, no sólo la llamada: así un recorrido puede
    // comprobar QUE se escribió el `.low` y con qué adentro.
    new_scene: async (content) => {
      const escritas = (window.__lowEscenas = window.__lowEscenas || []);
      const path = "C:\\mock\\escena_" + (escritas.length + 1) + ".low";
      const name = path.split("\\").pop();
      escritas.push({ path, name, content });
      (window.__lowFiles = window.__lowFiles || {})[path] = { path, name, content };
      return { path, name };
    },
    save_design: async () => ({ ok: true }),
    image_data: async path => ({ svg: SAMPLE_SVG, name: path || "mock.svg" }),
  };
  const noop = async () => ({});
  window.pywebview = { api: new Proxy(impl, {
    get: (t, k) => (k in t ? t[k] : noop),
  }) };
  window.__MOCK__ = true;
  // app.js registra su listener al parsear; disparar recién con la página cargada
  const fire = () => window.dispatchEvent(new Event("pywebviewready"));
  if (document.readyState === "complete") setTimeout(fire, 0);
  else window.addEventListener("load", () => setTimeout(fire, 0));
})();
