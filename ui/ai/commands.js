(function (global) {
  "use strict";
  const ai = (global.LOW = global.LOW || {}).ai = global.LOW.ai || {};
  const schemas = new Map(); const handlers = new Map();
  function define(name, schema, handler) { schemas.set(name, schema || {}); if (handler) handlers.set(name, handler); }
  function validate(name, payload = {}) { const schema = schemas.get(name); if (!schema) return { ok: false, error: `Comando desconocido: ${name}` };
    const missing = (schema.required || []).filter(k => payload[k] == null); return missing.length ? { ok: false, error: `Falta: ${missing.join(", ")}` } : { ok: true }; }
  async function execute(command, context) { const check = validate(command.name, command.payload); if (!check.ok) throw Error(check.error);
    const handler = handlers.get(command.name); if (!handler) throw Error(`Sin ejecutor: ${command.name}`); return handler(command.payload || {}, context); }
  [
    ["insert_frames", ["at", "count"]], ["duplicate_exposure", ["level", "frame"]],
    ["create_layer", ["name"]], ["modify_camera", ["frame", "properties"]],
    ["generate_inbetweens", ["from", "to", "count"]], ["apply_brush_preset", ["preset"]],
    ["move_surface", ["surface", "transform"]]
  ].forEach(([name, required]) => define(name, { required }));
  ai.commands = { define, validate, execute, schemas, handlers };
})(window);
