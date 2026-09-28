(function (global) {
  "use strict";
  const workspace = (global.LOW = global.LOW || {}).workspace = global.LOW.workspace || {};
  class WindowCoordinator {
    constructor(api) { this.api = api; this.open = new Set(); }
    async detach(id) { if (!this.api?.open_animation_panel) throw Error("Ventanas auxiliares no disponibles");
      const result = await this.api.open_animation_panel(id); if (result?.error) throw Error(result.error);
      this.open.add(id); workspace.panels?.detach(id); return result; }
    dock(id) { this.open.delete(id); workspace.panels?.dock(id); }
    isDetached(id) { return this.open.has(id); }
  }
  workspace.WindowCoordinator = WindowCoordinator;
})(window);
