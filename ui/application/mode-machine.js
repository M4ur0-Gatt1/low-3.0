/* ══════════════════════════════════════════════════════════════════════════
   MÁQUINA DE MODOS DEL ESTUDIO 2D

   Ésta es la autoridad sobre qué herramientas son válidas en dibujo y rigging.
   No toca el DOM ni el documento: expresa el contrato y deja que la vista lo
   represente. Así mouse, lápiz, atajos y botones consultan la misma decisión.

   @module application/mode-machine
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const application = LOW.application = LOW.application || {};

  const BUILD_TOOLS = new Set(["select", "create", "edit", "draw", "cut", "pivot"]);
  const ANIMATE_TOOLS = new Set(["select", "pose"]);
  const RIG_MODES = new Set(["build", "test", "fk", "ik"]);

  class ModeMachine {
    constructor() {
      this.state = {
        workspace: "drawing",
        rig: { active: false, phase: "build", solver: "fk", tool: "select" }
      };
    }

    snapshot() {
      return {
        workspace: this.state.workspace,
        rig: { ...this.state.rig }
      };
    }

    enterRig(mode = "build") {
      this.state.workspace = "rigging";
      this.state.rig.active = true;
      return this.setRigMode(mode);
    }

    exitRig() {
      this.state.workspace = "drawing";
      this.state.rig = { active: false, phase: "build", solver: "fk", tool: "select" };
      return this.snapshot();
    }

    setRigMode(mode) {
      const normalized = RIG_MODES.has(mode) ? mode : "build";
      const build = normalized === "build";
      const testing = normalized === "test";
      this.state.rig.active = true;
      this.state.rig.phase = build ? "build" : (testing ? "test" : "animate");
      if (!build && !testing) this.state.rig.solver = normalized;
      this.state.rig.tool = build ? "select" : "pose";
      return this.snapshot();
    }

    setRigTool(tool) {
      const allowed = this.state.rig.phase === "build" ? BUILD_TOOLS : ANIMATE_TOOLS;
      const fallback = this.state.rig.phase === "build" ? "select" : "pose";
      this.state.rig.tool = allowed.has(tool) ? tool : fallback;
      return this.snapshot();
    }

    wheelPolicy({ altKey = false } = {}) {
      if (altKey) return "zoom";
      return this.state.rig.active ? "block" : "scroll";
    }

    cancelAction(context = {}) {
      if (context.modal) return "modal";
      if (context.gesture) return "gesture";
      if (context.preview) return "preview";
      if (context.puppet) return "puppet";
      if (context.pen) return "pen";
      if (context.ruler) return "ruler";
      if (this.state.rig.active && this.state.rig.tool !== "select") return "rig-tool";
      if (this.state.rig.active && context.rigSelection) return "rig-selection";
      if (context.canvasTool && context.canvasTool !== "select") return "canvas-tool";
      if (context.canvasSelection) return "canvas-selection";
      return "none";
    }
  }

  application.ModeMachine = ModeMachine;
  application.createModeMachine = () => new ModeMachine();
})(window);
