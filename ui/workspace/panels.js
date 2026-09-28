(function (global) {
  "use strict";
  const workspace = (global.LOW = global.LOW || {}).workspace = global.LOW.workspace || {};
  const DOCK_ZONES = Object.freeze(["top", "left", "center", "right", "bottom"]);
  const clone = value => JSON.parse(JSON.stringify(value));

  /** Modelo puro del layout. Describe dónde vive cada panel, pero nunca toca
      el DOM ni la escena. Un id sólo puede aparecer una vez: esa regla evita
      que dos Rooms terminen mostrando dos Palettes con estados divergentes. */
  class DockLayout {
    constructor(data = null) {
      this.version = 2;
      this.groups = [];
      this.floating = [];
      this.hidden = [];
      if (data) this.restore(data);
    }
    _group(id) { return this.groups.find(group => group.id === id) || null; }
    _remove(panelId) {
      this.groups.forEach(group => { group.tabs = group.tabs.filter(id => id !== panelId); });
      this.groups = this.groups.filter(group => group.tabs.length);
      this.floating = this.floating.filter(item => item.panelId !== panelId);
      this.hidden = this.hidden.filter(id => id !== panelId);
    }
    _groupId(zone) {
      return `group_${zone}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    }
    dock(panelId, zone = "right", groupId = null, index = null) {
      if (!panelId) return null;
      if (!DOCK_ZONES.includes(zone)) zone = "right";
      this._remove(panelId);
      let group = groupId && this._group(groupId);
      if (!group || group.zone !== zone) {
        group = { id: groupId || this._groupId(zone), zone, tabs: [], activePanelId: panelId,
          size: null, collapsed: false, autoHide: false };
        this.groups.push(group);
      }
      const at = index == null ? group.tabs.length : Math.max(0, Math.min(group.tabs.length, Math.round(index)));
      group.tabs.splice(at, 0, panelId); group.activePanelId = panelId;
      return group;
    }
    tab(panelId, targetPanelId) {
      const target = this.groups.find(group => group.tabs.includes(targetPanelId));
      return target ? this.dock(panelId, target.zone, target.id) : null;
    }
    float(panelId, rect = {}) {
      if (!panelId) return null;
      this._remove(panelId);
      const item = { panelId, x: Number(rect.x) || 80, y: Number(rect.y) || 80,
        width: Math.max(180, Number(rect.width || rect.w) || 320),
        height: Math.max(120, Number(rect.height || rect.h) || 260) };
      this.floating.push(item); return item;
    }
    close(panelId) { if (!panelId) return false; this._remove(panelId); this.hidden.push(panelId); return true; }
    activate(panelId) {
      const group = this.groups.find(item => item.tabs.includes(panelId));
      if (!group) return false; group.activePanelId = panelId; return true;
    }
    setGroup(groupId, patch = {}) {
      const group = this._group(groupId); if (!group) return null;
      if (patch.size != null) group.size = Math.max(0, Number(patch.size) || 0);
      if (patch.collapsed != null) group.collapsed = !!patch.collapsed;
      if (patch.autoHide != null) group.autoHide = !!patch.autoHide;
      return group;
    }
    locate(panelId) {
      const group = this.groups.find(item => item.tabs.includes(panelId));
      if (group) return { kind: "dock", zone: group.zone, groupId: group.id,
        index: group.tabs.indexOf(panelId), active: group.activePanelId === panelId };
      const floating = this.floating.find(item => item.panelId === panelId);
      if (floating) return { kind: "float", ...floating };
      return this.hidden.includes(panelId) ? { kind: "hidden" } : null;
    }
    snapshot() { return clone({ version: this.version, groups: this.groups,
      floating: this.floating, hidden: this.hidden }); }
    restore(data = {}) {
      this.groups = []; this.floating = []; this.hidden = [];
      const seen = new Set();
      for (const source of Array.isArray(data.groups) ? data.groups : []) {
        const zone = DOCK_ZONES.includes(source.zone) ? source.zone : "right";
        const tabs = (Array.isArray(source.tabs) ? source.tabs : [])
          .filter(id => id && !seen.has(id) && (seen.add(id) || true));
        if (!tabs.length) continue;
        this.groups.push({ id: source.id || this._groupId(zone), zone, tabs,
          activePanelId: tabs.includes(source.activePanelId) ? source.activePanelId : tabs[0],
          size: source.size == null ? null : Math.max(0, Number(source.size) || 0),
          collapsed: !!source.collapsed, autoHide: !!source.autoHide });
      }
      for (const item of Array.isArray(data.floating) ? data.floating : []) {
        if (!item.panelId || seen.has(item.panelId)) continue;
        seen.add(item.panelId);
        this.floating.push({ panelId: item.panelId, x: Number(item.x) || 80,
          y: Number(item.y) || 80, width: Math.max(180, Number(item.width || item.w) || 320),
          height: Math.max(120, Number(item.height || item.h) || 260) });
      }
      for (const id of Array.isArray(data.hidden) ? data.hidden : [])
        if (id && !seen.has(id)) { seen.add(id); this.hidden.push(id); }
      return this;
    }
  }

  class PanelManager {
    constructor(storage = (global.LOW?.safeMode?.preferenceStorage || global.localStorage)) { this.panels = new Map(); this.listeners = new Set(); this.storage = storage; this.key = "low.panels.v1"; this.layout = new DockLayout(); }
    saved() { try { return JSON.parse(this.storage?.getItem(this.key) || "{}"); } catch (_) { return {}; } }
    register(id, config = {}) { const previous = this.saved()[id] || {}; const panel = { id, label: config.label || id,
      dock: config.dock || "right", visible: config.visible !== false,
      detached: false, size: config.size || null, element: config.element || null,
      closable: config.closable !== false, externalizable: !!config.externalizable,
      allowedDocks: Array.isArray(config.allowedDocks) ? config.allowedDocks.slice() : DOCK_ZONES.slice(),
      ...config, ...previous };
      // Las ventanas nativas no sobreviven al cierre: se restauran acopladas.
      panel.detached = false; this.panels.set(id, panel); return panel; }
    get(id) { return this.panels.get(id) || null; }
    update(id, patch) { const p = this.panels.get(id); if (!p) return null; Object.assign(p, patch); this.emit(id); return p; }
    detach(id) { return this.update(id, { detached: true, visible: true }); }
    dock(id, dock) { return this.update(id, { detached: false, dock: dock || this.panels.get(id)?.dock || "right", visible: true }); }
    hide(id) { return this.update(id, { visible: false }); }
    show(id) { return this.update(id, { visible: true }); }
    snapshot() { return [...this.panels.values()].map(({ element, ...p }) => ({ ...p })); }
    restore(list = []) { list.forEach(x => this.panels.has(x.id) && this.update(x.id, x)); }
    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(id) { const snapshot = this.snapshot(); const serial = Object.fromEntries(snapshot.map(p => [p.id, p]));
      try { this.storage?.setItem(this.key, JSON.stringify(serial)); } catch (_) {}
      this.listeners.forEach(fn => fn(this.panels.get(id), snapshot)); }
  }
  workspace.DOCK_ZONES = DOCK_ZONES;
  workspace.DockLayout = DockLayout;
  workspace.PanelManager = PanelManager; workspace.panels = new PanelManager();
})(window);
