/* ══════════════════════════════════════════════════════════════════════════
   WORKSPACES — un espacio de trabajo por etapa del proceso

   Equivalente a los Rooms de OpenToonz: la interfaz se reorganiza según lo que
   estés haciendo, en vez de mostrar todo siempre. Dibujar no necesita la misma
   pantalla que ajustar timing, y tener las dos cosas a la vez es lo que hace
   que un programa se sienta un prototipo.

   Cambiar de workspace toca SOLO el layout. No cambia la escena, no cierra
   documentos, no destruye paneles. El estado del proyecto queda intacto.

   Los layouts son DATOS, no código: se guardan, se duplican y el usuario puede
   armar los suyos ("Animación - dos monitores"). Nunca se escribe un layout
   dentro de la UI.

   @module workspace/workspaces
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const workspace = LOW.workspace = LOW.workspace || {};

  /** Catálogo de paneles: qué existe y cómo se llama en pantalla. El id es lo
   *  que usan los layouts; `element` lo resuelve la app al aplicarlo. */
  const PANELES = {
    tools:      { label: "Herramientas", element: ".dz-tools", allowedDocks: ["left", "right"] },
    toolOptions:{ label: "Opciones de herramienta", element: "#dzToolOpts", fijo: true,
      closable: false, externalizable: false, allowedDocks: ["top"] },
    canvas:     { label: "Viewer", element: ".dz-canvas", fijo: true, closable: false,
      externalizable: true, allowedDocks: ["center"] },
    layers:     { label: "Propiedades y capas", element: ".dz-inspector", allowedDocks: ["left", "right"] },
    timeline:   { label: "Línea de tiempo", element: "#dzTimeline", externalizable: true,
      allowedDocks: ["top", "bottom"] },
    xsheet:     { label: "X-sheet", element: "#dzXsheet", externalizable: true,
      allowedDocks: ["left", "right", "bottom"] },
    camera:     { label: "Cámara", element: "#dzCam", allowedDocks: ["center"] },
    multiplane: { label: "Escenario multiplano 3D", element: "#dzComposition3D", allowedDocks: ["center"] },
    onion:      { label: "Papel cebolla", element: "#dzOnionPanel", externalizable: true,
      allowedDocks: ["left", "right", "bottom"] },
    levelstrip: { label: "Dibujos del nivel", element: "#dzLevelStrip", externalizable: true,
      allowedDocks: ["left", "right", "bottom"] },
    rig:        { label: "Rigging", element: "#dzRigPanel", externalizable: true,
      allowedDocks: ["left", "right", "bottom"] },
    mocap:      { label: "Motion Capture", element: "#dzMocapPanel",
      allowedDocks: ["left", "right", "bottom"] },
    storyboard: { label: "Storyboard", element: "#dzStoryboard", externalizable: true,
      allowedDocks: ["left", "right", "bottom"] },
    colab:      { label: "Equipo", element: "#dzColab",
      allowedDocks: ["left", "right", "bottom"] },
    fn:         { label: "Editor de funciones", element: "#dzFnEditor", externalizable: true,
      allowedDocks: ["bottom", "left", "right"] },
    color:      { label: "Paleta", element: "#dzPalette", owner: "layers", allowedDocks: ["left", "right"] },
    code:       { label: "Código SVG", element: ".dz-code", allowedDocks: ["left", "right"] },
  };

  /** Los workspaces que vienen de fábrica. Cada uno prioriza SU tarea: lo que
   *  no hace falta para esa etapa, no está. Esa es la regla de UX. */
  const PRESETS = [
    { id: "drawing", name: "Dibujo",
      descripcion: "Dibujar y editar. El viewer manda; el timing queda al margen.",
      panels: [
        { id: "tools",    dock: "left" },
        { id: "canvas",   dock: "center" },
        { id: "layers",   dock: "right" },
        { id: "color",    dock: "right" },
        { id: "onion",    hidden: true },
        { id: "levelstrip", hidden: true },
        { id: "timeline", hidden: true },
        { id: "xsheet",   hidden: true },
        { id: "camera",   hidden: true },
        { id: "code",     hidden: true },
      ] },
    { id: "animation", name: "Animación",
      descripcion: "Timing, exposiciones y poses. Acá la X-sheet es la protagonista.",
      panels: [
        { id: "fn",       hidden: true },
        { id: "tools",    dock: "left" },
        { id: "canvas",   dock: "center" },
        { id: "xsheet",   dock: "right" },
        { id: "timeline", dock: "bottom" },
        { id: "onion",    hidden: true },
        { id: "levelstrip", dock: "right" },
        { id: "layers",   hidden: true },
        { id: "color",    hidden: true },
        { id: "code",     hidden: true },
      ] },
    { id: "cleanup", name: "Limpieza",
      descripcion: "Pasar el rough a línea limpia, con la referencia siempre visible.",
      panels: [
        { id: "tools",    dock: "left" },
        { id: "canvas",   dock: "center" },
        { id: "layers",   dock: "right" },
        { id: "onion",    hidden: true },
        { id: "timeline", dock: "bottom" },
        { id: "xsheet",   hidden: true },
        { id: "color",    hidden: true },
        { id: "code",     hidden: true },
      ] },
    { id: "color", name: "Color",
      descripcion: "Pintar. La paleta ocupa el lugar que merece.",
      panels: [
        { id: "tools",    dock: "left" },
        { id: "canvas",   dock: "center" },
        { id: "color",    dock: "right" },
        { id: "layers",   dock: "right" },
        { id: "timeline", dock: "bottom" },
        { id: "xsheet",   hidden: true },
        { id: "onion",    hidden: true },
        { id: "code",     hidden: true },
      ] },
    { id: "composite", name: "Composición",
      descripcion: "Mesa multiplano, cámara, profundidad y armado final.",
      chat: true,
      panels: [
        { id: "canvas",   dock: "center" },
        // Composicion trae SU PROPIO outliner e inspector: los equivalentes del
        // 2D se ocultan por CSS (`#designView.composition-3d`) para no aplastar
        // el escenario con paneles dobles. Decir aca que se ven era mentira, y
        // hacia imposible auditar «cada espacio muestra lo que promete».
        { id: "layers",   hidden: true },
        { id: "code",     hidden: true },
        { id: "timeline", dock: "bottom" },
        { id: "multiplane", dock: "right" },
        { id: "tools",    hidden: true },
        { id: "xsheet",   hidden: true },
        { id: "color",    hidden: true },
      ] },
    { id: "camera", name: "Cámara",
      descripcion: "Encuadre y movimiento de cámara.",
      panels: [
        { id: "canvas",   dock: "center" },
        { id: "camera",   dock: "overlay" },
        { id: "layers",   dock: "right" },
        { id: "timeline", dock: "bottom" },
        { id: "tools",    dock: "left" },
        { id: "xsheet",   hidden: true },
        { id: "color",    hidden: true },
        { id: "code",     hidden: true },
      ] },
    { id: "3d", name: "3D",
      descripcion: "El estudio 3D de LOW, sin reconstruir nada.",
      abre3d: true,
      panels: [{ id: "canvas", dock: "center" }] },
  ];

  const KEY = "low.workspaces.v1";
  const KEY_ACTIVE = "low.workspace.active";

  class Workspaces {
    constructor(storage = (global.LOW?.safeMode?.preferenceStorage || global.localStorage)) {
      this.storage = storage;
      this.listeners = new Set();
      this.activeId = null;
    }

    /** Todos los workspaces: los de fábrica más los que armó el usuario. Los
     *  del usuario pisan al preset del mismo id (así se puede personalizar uno
     *  de fábrica sin perder el original: basta con borrar el guardado). */
    all() {
      const propios = this._read();
      const base = PRESETS.map((p) => propios[p.id] || p);
      const extra = Object.values(propios).filter((w) => !PRESETS.some((p) => p.id === w.id));
      return base.concat(extra);
    }
    get(id) { return this.all().find((w) => w.id === id) || null; }
    panels() { return PANELES; }

    _read() { try { return JSON.parse(this.storage?.getItem(KEY) || "{}"); } catch (_) { return {}; } }
    _write(all) { try { this.storage?.setItem(KEY, JSON.stringify(all)); } catch (_) { /* sin espacio */ } }

    /** Guarda el layout actual dentro de un workspace (el usuario movió cosas
     *  y quiere conservarlas). */
    save(id, panels, name) {
      const all = this._read();
      const previo = this.get(id) || {};
      all[id] = { ...previo, id, name: name || previo.name || id, panels: JSON.parse(JSON.stringify(panels)) };
      this._write(all);
      return all[id];
    }
    /** Duplica un workspace con otro nombre ("Animación - dos monitores"). */
    duplicate(id, nuevoNombre) {
      const src = this.get(id);
      if (!src) return null;
      const nuevoId = `${id}-${Date.now().toString(36)}`;
      return this.save(nuevoId, src.panels, nuevoNombre || `${src.name} (copia)`);
    }
    remove(id) { const all = this._read(); delete all[id]; this._write(all); }
    /** Devuelve un preset a su estado de fábrica. */
    reset(id) { this.remove(id); return this.get(id); }

    /** Aplica un workspace. `aplicar` es la función de la vista que sabe tocar
     *  el DOM: este módulo nunca lo toca, solo decide. */
    activate(id, aplicar) {
      const w = this.get(id);
      if (!w) return null;
      this.activeId = id;
      try { this.storage?.setItem(KEY_ACTIVE, id); } catch (_) { /* noop */ }
      if (typeof aplicar === "function") aplicar(w);
      this.listeners.forEach((fn) => fn(w));
      return w;
    }
    /** El último workspace usado (para abrir donde se dejó). */
    lastUsed() {
      try { return this.storage?.getItem(KEY_ACTIVE) || "drawing"; } catch (_) { return "drawing"; }
    }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  }

  workspace.PANEL_CATALOG = PANELES;
  workspace.WORKSPACE_PRESETS = PRESETS;
  workspace.Workspaces = Workspaces;
  workspace.workspaces = new Workspaces();
})(window);
