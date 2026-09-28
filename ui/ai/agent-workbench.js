/* A factual activity ledger: only executed events populate it. */
(function () {
  let files = new Set(), steps = 0, errors = 0;
  const el = id => document.getElementById(id);
  function status(text) { if (el("workbenchStatus")) el("workbenchStatus").textContent = text; }
  window.LOW = window.LOW || {};
  window.LOW.Workbench = {
    start() {
      files = new Set(); steps = errors = 0;
      el("workbenchFiles").replaceChildren();
      el("workbenchPlan").replaceChildren();
      el("workbenchSteps").replaceChildren();
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
