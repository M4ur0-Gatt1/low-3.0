/* Personajes reutilizables: arte + rig, sin depender de la interfaz. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const clone = value => JSON.parse(JSON.stringify(value));

  function characterPreset(data) {
    data = data || {};
    const name = String(data.name || "Personaje").trim().slice(0, 80) || "Personaje";
    const drawing = String(data.drawing || "");
    const rig = animation.rigToJSON ? animation.rigToJSON(data.rig || {}) : clone(data.rig || {});
    return { format: "low-character", version: 1, id: String(data.id || `char_${Date.now().toString(36)}`),
      name, createdAt: data.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), drawing, rig };
  }
  function captureCharacter(doc, drawing, name, id) {
    if (!doc || !doc.scene) throw new Error("No hay documento para guardar");
    if (!String(drawing || "").trim()) throw new Error("El personaje no tiene dibujo");
    if (!Object.keys(doc.scene.rig?.nodes || {}).length) throw new Error("El personaje no tiene esqueleto");
    return characterPreset({ id, name, drawing, rig: doc.scene.rig });
  }
  function readCharacter(data) {
    if (!data || data.format !== "low-character" || !data.drawing || !data.rig)
      throw new Error("La plantilla de personaje no es válida");
    return characterPreset(data);
  }
  animation.characterLibrary = { create: characterPreset, capture: captureCharacter, read: readCharacter, clone };
})(typeof window !== "undefined" ? window : globalThis);
