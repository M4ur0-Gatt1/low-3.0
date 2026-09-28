/* Contrato puro del modo seguro y el reset 2D. Uso: node tools/run_safe_mode_tests.js */
const fs = require("fs"), vm = require("vm"), path = require("path");
const root = path.resolve(__dirname, "..");

class MemoryStorage {
  constructor(data = {}) { this.data = new Map(Object.entries(data).map(([k, v]) => [k, String(v)])); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(String(key)) ? this.data.get(String(key)) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

function load(search, data = {}) {
  const storage = new MemoryStorage(data);
  const context = { console, URLSearchParams, location: { search }, localStorage: storage };
  context.window = context; context.globalThis = context;
  vm.createContext(context);
  for (const file of ["ui/core/safe-mode.js", "ui/drawing/brushes.js", "ui/workspace/workspaces.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  return { context, storage, safe: context.LOW.safeMode };
}

let ok = 0;
function test(name, fn) {
  try { fn(); ok++; console.log("OK", name); }
  catch (error) { console.error("FALLA", name, error.stack || error); process.exitCode = 1; }
}
const saved = {
  "low.workspace.active": "animation",
  "low.workspaces.v1": JSON.stringify({ drawing: { id: "drawing", name: "Roto", panels: [] } }),
  "low.dzkeys": JSON.stringify({ pencil: "z" }),
  "low.brushes.v1": JSON.stringify([{ id: "custom-test", name: "Importado", size: 99 }]),
  "low.palette.C:\\proyecto": "[#fff]",
  "low.document.recovery.scene-a": "ARTE",
  "project.scene": "NO TOCAR",
};

test("el arranque normal lee las preferencias", () => {
  const { context, safe, storage } = load("", saved);
  if (safe.active || safe.preferenceStorage !== storage) throw Error("el modo normal fue aislado");
  if (context.LOW.workspace.workspaces.lastUsed() !== "animation") throw Error("no leyó el workspace");
  if (!context.LOW.drawing.brushes.get("custom-test")) throw Error("no leyó el pincel personalizado");
});

test("el modo seguro usa fábrica sin borrar lo guardado", () => {
  const { context, safe, storage } = load("?safe=1", saved);
  if (!safe.active) throw Error("no se activó");
  if (context.LOW.workspace.workspaces.lastUsed() !== "drawing") throw Error("no abrió Dibujo");
  if (context.LOW.workspace.workspaces.get("drawing").name !== "Dibujo") throw Error("cargó layout personalizado");
  if (context.LOW.drawing.brushes.get("custom-test")) throw Error("cargó pincel personalizado");
  safe.preferenceStorage.setItem("low.dzkeys", "temporal");
  if (storage.getItem("low.dzkeys") !== saved["low.dzkeys"]) throw Error("sobrescribió la preferencia real");
  if (safe.preferenceStorage.getItem("low.document.recovery.scene-a") !== "ARTE") throw Error("ocultó recuperación");
});

test("cancelar el reset no modifica ninguna clave", () => {
  const { safe, storage } = load("", saved), before = JSON.stringify([...storage.data]);
  const result = safe.reset(["workspace", "shortcuts"], { storage, confirmed: false });
  if (!result.cancelled || JSON.stringify([...storage.data]) !== before) throw Error("cancelar cambió datos");
});

test("el reset actúa sólo sobre los dominios elegidos", () => {
  const { safe, storage } = load("", saved);
  const result = safe.reset(["shortcuts", "drawing"], { storage, confirmed: true });
  if (!result.ok || storage.getItem("low.dzkeys") !== null) throw Error("no limpió atajos");
  if (storage.getItem("low.palette.C:\\proyecto") !== null) throw Error("no limpió la paleta de UI");
  if (storage.getItem("low.workspace.active") !== "animation") throw Error("tocó espacios no elegidos");
  if (storage.getItem("low.brushes.v1") !== saved["low.brushes.v1"]) throw Error("tocó pinceles no elegidos");
  if (storage.getItem("low.document.recovery.scene-a") !== "ARTE" || storage.getItem("project.scene") !== "NO TOCAR")
    throw Error("tocó proyecto o recuperación");
});

if (!process.exitCode) console.log(`SAFE MODE TOTAL ${ok} OK ${ok} FALLAN 0`);
