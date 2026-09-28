(function (global) {
  "use strict";

  const LOW = global.LOW = global.LOW || {};
  const collaboration = LOW.collaboration = LOW.collaboration || {};
  const ROLES = Object.freeze({ owner: 3, editor: 2, reviewer: 1, viewer: 0 });
  const clone = value => JSON.parse(JSON.stringify(value));

  function compareOperations(a, b) {
    return (a.lamport - b.lamport) || String(a.actorId).localeCompare(String(b.actorId)) || String(a.id).localeCompare(String(b.id));
  }

  class CollaborationSession {
    constructor({ projectId, actorId, role = "editor", apply, now = () => Date.now() } = {}) {
      if (!projectId || !actorId) throw Error("projectId y actorId son obligatorios");
      this.projectId = String(projectId); this.actorId = String(actorId); this.role = role;
      this.apply = typeof apply === "function" ? apply : () => {};
      this.now = now; this.clock = 0; this.sequence = 0; this.online = true;
      this.pending = []; this.seen = new Set(); this.presence = new Map(); this.locks = new Map();
    }
    can(permission = "edit") {
      const required = permission === "manage" ? 3 : permission === "comment" ? 1 : 2;
      return (ROLES[this.role] ?? -1) >= required;
    }
    setOnline(value) { this.online = !!value; return this.online ? this.drain() : []; }
    create(type, target, payload = {}, meta = {}) {
      if (!this.can(type === "comment" ? "comment" : "edit")) throw Error(`El rol ${this.role} no puede modificar el proyecto`);
      this.clock += 1; this.sequence += 1;
      return Object.freeze({
        id: `${this.actorId}:${this.sequence}`, projectId: this.projectId, actorId: this.actorId,
        lamport: this.clock, type: String(type), target: String(target), payload: clone(payload),
        baseRevision: Number(meta.baseRevision) || 0, groupId: meta.groupId || null, createdAt: this.now()
      });
    }
    submit(type, target, payload, meta) {
      const operation = this.create(type, target, payload, meta);
      this.receive(operation, { local: true });
      this.pending.push(operation);
      return operation;
    }
    receive(operation, { local = false } = {}) {
      if (!operation || operation.projectId !== this.projectId || this.seen.has(operation.id)) return false;
      this.clock = Math.max(this.clock, Number(operation.lamport) || 0) + (local ? 0 : 1);
      this.seen.add(operation.id);
      this.apply(clone(operation), { local });
      return true;
    }
    acknowledge(ids) {
      const accepted = new Set(Array.isArray(ids) ? ids : [ids]);
      this.pending = this.pending.filter(operation => !accepted.has(operation.id));
    }
    drain() { return this.online ? this.pending.slice().sort(compareOperations) : []; }
    updatePresence(actor) {
      if (!actor?.id) return false;
      this.presence.set(String(actor.id), { ...clone(actor), lastSeen: this.now() }); return true;
    }
    activePresence(maxAge = 15000) {
      const threshold = this.now() - maxAge;
      return [...this.presence.values()].filter(actor => actor.lastSeen >= threshold);
    }
    acquireLock(resourceId, ttl = 30000) {
      const id = String(resourceId), current = this.locks.get(id), now = this.now();
      if (current && current.expiresAt > now && current.actorId !== this.actorId) return false;
      this.locks.set(id, { actorId: this.actorId, expiresAt: now + ttl }); return true;
    }
    releaseLock(resourceId) {
      const id = String(resourceId), current = this.locks.get(id);
      if (!current || current.actorId !== this.actorId) return false;
      return this.locks.delete(id);
    }
  }

  collaboration.ROLES = ROLES;
  collaboration.compareOperations = compareOperations;
  collaboration.CollaborationSession = CollaborationSession;
})(typeof window !== "undefined" ? window : globalThis);
