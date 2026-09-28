(function (global) {
  "use strict";
  const animation = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  const lerp = (a, b, t) => a + (b - a) * t;
  function sample(keys, frame) {
    const entries = Object.entries(keys || {}).map(([f, v]) => [+f, v]).sort((a, b) => a[0] - b[0]);
    if (!entries.length) return null;
    const prev = [...entries].reverse().find(([f]) => f <= frame) || entries[0];
    const next = entries.find(([f]) => f >= frame) || entries[entries.length - 1];
    if (prev[0] === next[0]) return { ...prev[1] };
    const t = (frame - prev[0]) / (next[0] - prev[0]); const out = {};
    new Set([...Object.keys(prev[1]), ...Object.keys(next[1])]).forEach(k => {
      out[k] = typeof prev[1][k] === "number" && typeof next[1][k] === "number" ? lerp(prev[1][k], next[1][k], t) : prev[1][k];
    }); return out;
  }
  animation.camera = { sample };
})(window);
