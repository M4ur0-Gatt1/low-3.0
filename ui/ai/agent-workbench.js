/* A factual activity ledger: only executed events populate it.
   Feed "En vivo" (estilo Devin): cada escritura/edición llega como diff
   (evento live_diff) y cada comando como salida de terminal (live_term),
   ambos generados en code_runner/live_feed.py. La tarjeta más nueva queda
   abierta; las anteriores se colapsan y se pueden volver a abrir. */
(function () {
  let files = new Set(), steps = 0, errors = 0, filter = "all";
  const MAX_LIVE = 40;
  const el = id => document.getElementById(id);
  function status(text) { if (el("workbenchStatus")) el("workbenchStatus").textContent = text; }
  function node(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function baseName(p) { return String(p || "").split(/[\\/]/).pop(); }
  function applyFilter(card) {
    card.hidden = filter !== "all" && card.dataset.kind !== filter;
  }
  function pushCard(card) {
    const box = el("workbenchLive");
    if (!box) return;
    for (const c of box.children) c.classList.add("collapsed");   // solo la nueva abierta
    applyFilter(card);
    box.prepend(card);
    while (box.children.length > MAX_LIVE) box.lastChild.remove();
  }
  function card(kind, title, meta, bad) {
    const c = node("div", "wb-live-card wb-live-" + kind + (bad ? " bad" : ""));
    c.dataset.kind = kind;
    const head = node("div", "wb-live-card-head");
    head.append(node("span", "wb-live-title", title), node("span", "wb-live-meta", meta));
    head.onclick = () => c.classList.toggle("collapsed");
    c.append(head);
    return c;
  }
  function diffCard(d) {
    const meta = (d.new ? "nuevo · " : "") + `+${d.added} −${d.removed}`;
    const c = card("diff", baseName(d.path), meta, false);
    c.title = d.path;
    const open = node("button", "wb-live-open", "Abrir");
    open.type = "button";
    open.onclick = ev => { ev.stopPropagation(); if (typeof openFile === "function") openFile(d.path); };
    c.firstChild.append(open);
    const pre = node("pre", "wb-live-body");
    for (const line of d.lines || []) {
      const k = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : "ctx";
      pre.append(node("span", "dl-" + k, line || " "));
    }
    if (d.truncated) pre.append(node("span", "dl-hunk", "… diff recortado"));
    if (!(d.lines || []).length) pre.append(node("span", "dl-ctx", "(sin diferencias de texto)"));
    c.append(pre);
    return c;
  }
  function termCard(t) {
    const bad = t.code !== 0 && t.code !== null && t.code !== undefined;
    const c = card("term", "$ " + t.command, "exit " + t.code, bad);
    c.append(node("pre", "wb-live-body wb-live-term-out", t.output || "(sin salida)"));
    return c;
  }
  function bindFilters() {
    document.querySelectorAll("[data-live-filter]").forEach(b => {
      if (b.dataset.bound) return;
      b.dataset.bound = "1";
      b.onclick = () => {
        filter = b.dataset.liveFilter;
        document.querySelectorAll("[data-live-filter]").forEach(x => x.classList.toggle("on", x === b));
        for (const c of el("workbenchLive")?.children || []) applyFilter(c);
      };
    });
  }
  window.LOW = window.LOW || {};
  window.LOW.Workbench = {
    start() {
      files = new Set(); steps = errors = 0;
      el("workbenchFiles").replaceChildren();
      el("workbenchPlan").replaceChildren();
      el("workbenchSteps").replaceChildren();
      el("workbenchLive")?.replaceChildren();
      bindFilters();
      status("Analizando la tarea…");
    },
    finish(failed = false) {
      status(`${failed ? "Interrumpido / error" : "Turno finalizado"} · ${steps} acciones · ${files.size} archivo(s) · ${errors} error(es)`);
    },
    event(m) {
      if (!el("workbenchStatus")) return;
      if (m.event === "agent_plan") {
        el("workbenchPlan").replaceChildren();
        const labels = {pending:"Pendiente", in_progress:"En curso", completed:"Completado"};
        for (const step of m.data.steps || []) {
          const item = document.createElement("li");
          item.textContent = `${labels[step.status] || "Pendiente"} · ${step.title}`;
          el("workbenchPlan").append(item);
        }
      }
      if (m.event === "tool_start") status("En curso: " + m.data.name);
      if (m.event === "live_diff") { bindFilters(); pushCard(diffCard(m.data)); }
      if (m.event === "live_term") { bindFilters(); pushCard(termCard(m.data)); }
      if (m.event === "tool") {
        steps++; if (m.data.error) errors++;
        const line = document.createElement("li");
        line.textContent = `${m.data.error ? "Error" : "Ejecutado"} · ${m.data.name}${m.data.file ? " · " + m.data.file : ""}`;
        line.title = m.data.res || "";
        el("workbenchSteps").prepend(line);
        while (el("workbenchSteps").children.length > 30) el("workbenchSteps").lastChild.remove();
        status(`${steps} acciones · ${errors} errores`);
      }
      if (m.event === "wrote" && !files.has(m.data.path)) {
        files.add(m.data.path);
        const button = document.createElement("button");
        button.textContent = m.data.path.split(/[\\/]/).pop();
        button.title = m.data.path;
        button.onclick = () => openFile(m.data.path);
        el("workbenchFiles").append(button);
      }
    }
  };
})();
