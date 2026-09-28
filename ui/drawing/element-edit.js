/* Completed element edits use the same drawing history and canonical commit as
   the rest of the canvas. Preview gestures never enter history. */
function dzDrawingEditCapture() {
  const svg = document.querySelector('#dzCanvas > svg');
  return svg ? dzSerialize(svg) : null;
}
function dzDrawingEditBegin() {
  clearTimeout(DZ_DOC_TIMER);
  if (DZ.doc && DZ.doc.drawing?.content !== dzCanvasInner()) dzDocCommit();
  return dzDrawingEditCapture();
}
function dzDrawingEditRecord(before, label, after = dzDrawingEditCapture(), coalesce = null) {
  if (!before || !after || before === after) return null;
  if (DZ.doc) {
    DZ.doc.writeDrawing(dzCanvasInner(), {label, coalesce});
    dzMarkDirty();
    return DZ.history.undoStack.at(-1);
  }
  if (!DZ.history) DZ.history = new LOW.core.HistoryManager({limit:180});
  if (coalesce && DZ.history.undoStack.at(-1) === coalesce && !DZ.history.redoStack.length) {
    coalesce.after = after; dzMarkDirty(); return coalesce;
  }
  const entry = {label, domain:'drawing', before, after,
    apply: (_direction, value) => { if (value) dzApplySvgText(value); }};
  DZ.history.push(entry); DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack;
  dzMarkDirty();
  return entry;
}
