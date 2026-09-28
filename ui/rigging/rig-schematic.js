/* rig-schematic.js — Layout puro del esquemático del esqueleto (schematic básico).
 *
 * Toma los huesos del rig (id, name, parentId, role) y devuelve una disposición
 * tipo "tidy tree": profundidad por ancestría (raíz arriba) y columna por orden
 * de hojas, con cada padre centrado sobre sus hijos. Es PURO y determinista, así
 * que se testea sin DOM (tools/run_rig_schematic_tests.js) y la vista sólo pinta
 * lo que esta función decide. Un hueso cuyo padre no existe se trata como raíz.
 */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const rigging = LOW.rigging = LOW.rigging || {};

  function schematicLayout(nodes, opts) {
    opts = opts || {};
    const colW = opts.colW || 96, rowH = opts.rowH || 66, pad = opts.pad || 34;
    const list = (nodes || []).filter(n => n && n.id != null);
    const order = new Map(list.map((n, i) => [n.id, i]));
    const byId = new Map(list.map(n => [n.id, {
      id: n.id, name: n.name || String(n.id),
      role: n.role === "control" ? "control" : (n.role === "deformer" ? "deformer" : "bone"),
      parentId: n.parentId != null ? n.parentId : null, children: []
    }]));
    // Vincular hijos; un padre inexistente convierte al nodo en raíz.
    const roots = [];
    byId.forEach(n => {
      const p = n.parentId != null && byId.get(n.parentId);
      if (p) p.children.push(n); else roots.push(n);
    });
    const sortSiblings = arr => arr.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    let leaf = 0, depthMax = 0;
    const place = (n, depth, guard) => {
      if (guard.has(n.id)) return;            // corta ciclos defensivamente
      guard.add(n.id);
      n.depth = depth; if (depth > depthMax) depthMax = depth;
      sortSiblings(n.children);
      if (!n.children.length) { n.col = leaf++; }
      else {
        n.children.forEach(c => place(c, depth + 1, guard));
        const cols = n.children.map(c => c.col);
        n.col = (Math.min(...cols) + Math.max(...cols)) / 2;
      }
    };
    sortSiblings(roots);
    roots.forEach(r => place(r, 0, new Set()));
    const cols = Math.max(1, leaf);
    const out = [];
    byId.forEach(n => out.push({
      id: n.id, name: n.name, role: n.role, depth: n.depth ?? 0, col: n.col ?? 0,
      x: pad + (n.col ?? 0) * colW, y: pad + (n.depth ?? 0) * rowH
    }));
    const edges = [];
    byId.forEach(n => { if (n.parentId != null && byId.get(n.parentId)) edges.push({ from: n.parentId, to: n.id }); });
    return {
      nodes: out, edges, cols, depthMax,
      width: pad * 2 + (cols - 1) * colW, height: pad * 2 + depthMax * rowH,
      colW, rowH, pad
    };
  }

  /* ¿Se puede colgar `dragId` de `targetId`? Espeja la guarda de document.setRigParent
     (sin ciclos, sin auto-padre) para dar feedback en el esquemático ANTES de soltar.
     targetId null/"" = volver a raíz (válido si hoy tiene padre). Es pura → testeable. */
  function canReparent(nodes, dragId, targetId) {
    const byId = new Map((nodes || []).filter(n => n && n.id != null).map(n => [n.id, n]));
    const drag = byId.get(dragId);
    if (!drag) return false;
    if (targetId == null || targetId === "") return drag.parentId != null; // a raíz
    if (targetId === dragId) return false;                                  // no a sí mismo
    if (!byId.has(targetId)) return false;
    if ((drag.parentId ?? null) === targetId) return false;                 // ya cuelga de ahí
    // el destino no puede ser descendiente del que arrastro (crearía ciclo)
    for (let p = byId.get(targetId), guard = 0; p && guard < 999; guard++) {
      if (p.id === dragId) return false;
      p = p.parentId != null ? byId.get(p.parentId) : null;
    }
    return true;
  }

  rigging.schematicLayout = schematicLayout;
  rigging.canReparent = canReparent;
})(typeof window !== "undefined" ? window : globalThis);
