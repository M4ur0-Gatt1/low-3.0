(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};

  function marqueeMode(startX, endX, invert = false) {
    const natural = endX >= startX ? "contained" : "touching";
    if (!invert) return natural;
    return natural === "contained" ? "touching" : "contained";
  }

  function marqueeHit(bounds, selection, mode) {
    if (!bounds || !selection) return false;
    if (mode === "contained") {
      return bounds.left >= selection.left && bounds.top >= selection.top
        && bounds.right <= selection.right && bounds.bottom <= selection.bottom;
    }
    return !(bounds.right < selection.left || bounds.left > selection.right
      || bounds.bottom < selection.top || bounds.top > selection.bottom);
  }

  drawing.selection = { marqueeMode, marqueeHit };
})(typeof window !== "undefined" ? window : globalThis);
