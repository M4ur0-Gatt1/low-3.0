(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const composition = LOW.composition = LOW.composition || {};

  class CompositionController {
    constructor({ doc, collaboration = null, onPreview = () => {}, onChange = () => {} } = {}) {
      if (!doc) throw Error("CompositionController necesita LowDoc");
      this.doc = doc; this.collaboration = collaboration;
      this.onPreview = onPreview; this.onChange = onChange; this.gesture = null;
    }
    begin({ planeId, source = {}, frame = null, autoKey = false } = {}) {
      if (!planeId || this.gesture) return false;
      const plane = this.doc.scene.ensureCompositionPlane(planeId, source);
      if (!plane || plane.locked) return false;
      const effectiveFrame = autoKey ? (frame || this.doc.frame) : null;
      const before = this.doc.scene.compositionTransformAt(planeId, effectiveFrame);
      this.gesture = { planeId, source, frame: effectiveFrame, before, preview: { ...before } };
      return true;
    }
    preview(patch, snap = {}) {
      if (!this.gesture) return null;
      const M = composition.multiplane;
      const raw = { ...this.gesture.preview, ...patch };
      this.gesture.preview = M && snap.enabled !== false ? M.snapTransform(raw, snap) : raw;
      this.onPreview(this.gesture.planeId, { ...this.gesture.preview });
      return { ...this.gesture.preview };
    }
    commit(label = "Transformar plano") {
      const gesture = this.gesture; this.gesture = null;
      if (!gesture) return false;
      if (JSON.stringify(gesture.before) === JSON.stringify(gesture.preview)) return false;
      const ok = this.doc.setCompositionTransform(gesture.planeId, gesture.preview, {
        frame: gesture.frame, source: gesture.source, label
      });
      if (!ok) return false;
      if (this.collaboration?.submit) {
        const spec = composition.multiplane.transformOperation(gesture.planeId, gesture.before, gesture.preview, {
          groupId: `composition:${gesture.planeId}:${Date.now()}`,
          baseRevision: Math.max(0, this.doc.scene.revision - 1)
        });
        this.collaboration.submit(spec.type, spec.target, spec.payload, spec.meta);
      }
      this.onChange(gesture.planeId, { ...gesture.preview });
      return true;
    }
    cancel() {
      const gesture = this.gesture; this.gesture = null;
      if (!gesture) return false;
      this.onPreview(gesture.planeId, { ...gesture.before }); return true;
    }
    applyRemote(operation) {
      if (operation?.type !== "composition.plane.transform") return false;
      const id = String(operation.target || "").replace(/^plane:/, "");
      if (!id || !operation.payload?.after) return false;
      const ok = this.doc.setCompositionTransform(id, operation.payload.after, {
        source: operation.payload.source || {}, label: "Cambio remoto de plano"
      });
      if (ok) this.onChange(id, operation.payload.after, { remote: true });
      return ok;
    }
  }
  composition.CompositionController = CompositionController;
})(typeof window !== "undefined" ? window : globalThis);
