#!/usr/bin/env node
/* bus.js — canal rápido de mensajes entre agentes (Claude ↔ Codex).
 *
 * Reemplaza el ida y vuelta lento por CLAUDE_HANDOFF.md para los mensajes cortos
 * de coordinación ("congelado", "verde", "dale", "reservo X"). El handoff sigue
 * siendo el REGISTRO de decisiones/diseño; el bus es la mensajería.
 *
 * Almacén: docs/agent-bus.jsonl (append-only, una línea JSON por mensaje).
 *
 * Uso:
 *   node tools/bus.js post <from> <to|all> <kind> <mensaje...>
 *   node tools/bus.js read [n]            # últimos n (def. 15), todos
 *   node tools/bus.js read <agente> [n]   # últimos n dirigidos a <agente> o a "all"
 *   node tools/bus.js since <ISO|N>       # mensajes tras esa fecha ISO, o los últimos N
 *
 * Ejemplos:
 *   node tools/bus.js post claude codex freeze "rig congelado, 4.3.0 ok, dale con el bump"
 *   node tools/bus.js read codex 20
 */
"use strict";
const fs = require("fs"), path = require("path");
const FILE = path.join(__dirname, "..", "docs", "agent-bus.jsonl");

const readAll = () => {
  try {
    return fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
};

const hhmm = (iso) => { const d = new Date(iso); return isNaN(d) ? iso : d.toISOString().slice(11, 16); };
const fmt = (m) => `${hhmm(m.ts)} ${m.from}→${m.to} [${m.kind}] ${m.msg}`;

const [, , cmd, ...rest] = process.argv;

if (cmd === "post") {
  const [from, to, kind, ...msgParts] = rest;
  const msg = (msgParts.join(" ") || "").trim();
  if (!from || !to || !kind || !msg) {
    console.error('uso: node tools/bus.js post <from> <to|all> <kind> "<mensaje>"');
    process.exit(2);
  }
  const line = JSON.stringify({ ts: new Date().toISOString(), from, to, kind, msg });
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.appendFileSync(FILE, line + "\n");
  console.log("enviado: " + fmt(JSON.parse(line)));
  process.exit(0);
}

if (cmd === "read") {
  let agent = null, n = 15;
  if (rest[0] && isNaN(+rest[0])) { agent = rest[0].toLowerCase(); if (rest[1]) n = +rest[1] || 15; }
  else if (rest[0]) n = +rest[0] || 15;
  let msgs = readAll();
  if (agent) msgs = msgs.filter(m => (m.to || "").toLowerCase() === agent || (m.to || "").toLowerCase() === "all");
  msgs.slice(-n).forEach(m => console.log(fmt(m)));
  process.exit(0);
}

if (cmd === "since") {
  const arg = rest[0] || "";
  let msgs = readAll();
  if (/^\d+$/.test(arg)) msgs = msgs.slice(-(+arg));
  else if (arg) { const t = Date.parse(arg); if (!isNaN(t)) msgs = msgs.filter(m => Date.parse(m.ts) > t); }
  msgs.forEach(m => console.log(fmt(m)));
  process.exit(0);
}

console.error("comandos: post | read | since\n  node tools/bus.js post <from> <to|all> <kind> \"<msg>\"\n  node tools/bus.js read [agente] [n]\n  node tools/bus.js since <ISO|N>");
process.exit(2);
