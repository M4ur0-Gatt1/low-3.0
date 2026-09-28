(function (global) {
  "use strict";
  const animation = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  function rows(state) {
    return (state.frames || []).filter(f => f.exists).map((frame, i) => ({
      frame, cells: (state.levels || []).map((level, li) => {
        const on = !!(state.exposures[li] && state.exposures[li][i]);
        const previous = i > 0 && !!(state.exposures[li] && state.exposures[li][i - 1]);
        return { level, exposed: on, start: on && !previous, hold: on && previous };
      })
    }));
  }
  animation.xsheet = { rows };
})(window);
