"use strict";

(function (global) {
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const rigging = LOW.rigging = LOW.rigging || {};
  const ALLOWED_MODES = new Set(["rigid", "weightedMesh", "curve", "envelope", "warp"]);

  function collections(rig) {
    rig.bones ||= rig.nodes || {};
    rig.nodes = rig.bones;
    rig.slots ||= {};
    rig.attachments ||= {};
    rig.bindings ||= {};
    return rig;
  }
  function elementOf(rig, binding) {
    return rig.attachments?.[binding?.attachmentId]?.elementId || binding?.elementId || null;
  }
  function bindElement(source, boneId, elementId, requestedMode = "rigid") {
    const rig = collections(source || {}), bone = rig.bones[boneId];
    if (!bone || !elementId) return false;
    const mode = ALLOWED_MODES.has(requestedMode) ? requestedMode : "rigid";
    for (const other of Object.values(rig.bones)) {
      if (other.id === boneId || (other.elementId || other.binding?.elementId) !== elementId) continue;
      delete other.elementId; delete other.binding;
    }
    for (const [id, binding] of Object.entries(rig.bindings))
      if (binding.boneId !== boneId && elementOf(rig, binding) === elementId) delete rig.bindings[id];
    const slotId = `slot:${boneId}`, attachmentId = `attachment:${boneId}`, bindingId = `binding:${boneId}`;
    bone.elementId = elementId;
    bone.binding = { mode, elementId };
    rig.slots[slotId] ||= { id: slotId, name: bone.name || boneId, boneId,
      drawOrder: Object.keys(rig.slots).length, activeAttachmentId: attachmentId, visible: true };
    rig.attachments[attachmentId] ||= { id: attachmentId, slotId, type: "drawing",
      name: bone.name || boneId, levelId: null, drawingNumber: null };
    rig.attachments[attachmentId].elementId = elementId;
    rig.bindings[bindingId] = { id: bindingId, mode, boneId, slotId, attachmentId, elementId };
    rig.slots[slotId].activeAttachmentId = attachmentId;
    return true;
  }
  function unbindElement(source, boneId) {
    const rig = collections(source || {}), bone = rig.bones[boneId];
    if (!bone) return false;
    const had = !!(bone.elementId || bone.binding || Object.values(rig.bindings).some(b => b.boneId === boneId));
    if (!had) return false;
    delete bone.elementId; delete bone.binding;
    for (const [id, binding] of Object.entries(rig.bindings))
      if (binding.boneId === boneId) delete rig.bindings[id];
    return true;
  }
  function repairOwnership(source) {
    const rig = collections(source || {}), owners = new Map(); let repaired = 0;
    for (const bone of Object.values(rig.bones)) {
      const elementId = bone.elementId || bone.binding?.elementId;
      if (!elementId) continue;
      if (!owners.has(elementId)) { owners.set(elementId, bone.id); continue; }
      if (owners.get(elementId) === bone.id) continue;
      delete bone.elementId; delete bone.binding; repaired++;
    }
    for (const [id, binding] of Object.entries(rig.bindings)) {
      const elementId = elementOf(rig, binding);
      if (!elementId || !binding.boneId) continue;
      const owner = owners.get(elementId);
      if (!owner) { owners.set(elementId, binding.boneId); continue; }
      if (owner === binding.boneId) continue;
      delete rig.bindings[id]; repaired++;
    }
    return repaired;
  }
  rigging.binding = { ALLOWED_MODES, bindElement, unbindElement, repairOwnership, elementOf };
  animation.rigBinding = rigging.binding;
})(typeof window !== "undefined" ? window : globalThis);
