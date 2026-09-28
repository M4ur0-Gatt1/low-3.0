(function (global) {
  "use strict";
  const ai = (global.LOW = global.LOW || {}).ai = global.LOW.ai || {};
  class TaskRunner {
    constructor({ maxSteps = 40, maxRetries = 2, repeatLimit = 2, onProgress = () => {} } = {}) {
      this.maxSteps = maxSteps; this.maxRetries = maxRetries; this.repeatLimit = repeatLimit; this.onProgress = onProgress; this.cancelled = false;
    }
    cancel() { this.cancelled = true; }
    signature(step) { return JSON.stringify([step.name, step.payload || {}]); }
    async run(steps, context = {}) {
      this.cancelled = false; const results = [], seen = new Map();
      const taskId = context.taskId || `task_${Date.now().toString(36)}`;
      for (let index = 0; index < Math.min(steps.length, this.maxSteps); index++) {
        if (this.cancelled) { ai.recovery?.checkpoint(taskId, { status: "cancelled", index, steps, results }); return { status: "cancelled", taskId, results }; }
        const step = steps[index], sig = this.signature(step), repeats = (seen.get(sig) || 0) + 1; seen.set(sig, repeats);
        if (repeats > this.repeatLimit) { ai.recovery?.checkpoint(taskId, { status: "blocked-loop", index, steps, results });
          return { status: "blocked-loop", taskId, results, error: `Acción repetida: ${step.name}` }; }
        let lastError = null;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
          try { this.onProgress({ index, attempt, step }); const value = await ai.commands.execute(step, context);
            results.push({ step, value, ok: true }); ai.recovery?.checkpoint(taskId, { status: "running", index: index + 1, steps, results }); lastError = null; break; }
          catch (error) { lastError = error; if (attempt === this.maxRetries) results.push({ step, error: String(error), ok: false }); }
        }
        if (lastError) { ai.recovery?.checkpoint(taskId, { status: "failed", index, steps, results, error: String(lastError) });
          return { status: "failed", taskId, results, error: String(lastError) }; }
      }
      ai.recovery?.clear(taskId); return { status: "complete", taskId, results };
    }
  }
  ai.TaskRunner = TaskRunner;
})(window);
