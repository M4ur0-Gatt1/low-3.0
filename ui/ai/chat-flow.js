/* Flujo del chat del agente (fuera de app.js por el presupuesto §12).
   - Respuestas con formato: bloques de código con «Copiar», listas, títulos,
     negrita, enlaces. Mientras llega el streaming se muestra texto plano (barato
     y sin parpadeo); al cerrar cada tramo se formatea una sola vez.
   - Copiar cualquier respuesta entera.
   - Nada se pierde: si la llamada falla o la conexión se corta aparece
     «Reintentar» / «Editar» con tu mensaje (y la imagen adjunta).
   - Un turno por vez: Enter mientras LOW trabaja no dispara otro turno; tu
     texto queda en el cuadro y se avisa cómo detener.
   - Cuadro de texto: crece con lo que escribís, ↑/↓ recorre tus mensajes
     anteriores y el borrador sobrevive a un cierre.
   Usa globales de app.js (S, send, sysMsg, setStatus, setAttachedImage,
   scrollMsgs) que se resuelven en tiempo de llamada. */
(function (global) {
  "use strict";
  const HIST_KEY = "low.chat.history.v1", DRAFT_KEY = "low.chat.draft.v1";
  const HIST_MAX = 50, INP_MAX_PX = 220;
  const $id = id => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = global.localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { global.localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  /* ── markdown mínimo y SEGURO: todo se escapa antes de dar formato ── */
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  function inline(raw) {
    return esc(raw).split(/(`[^`\n]+`)/).map(part => {
      if (part.length > 2 && part[0] === "`" && part[part.length - 1] === "`")
        return "<code>" + part.slice(1, -1) + "</code>";
      return part
        .replace(/\*\*([^*\n]+?)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\w)/g, "$1<em>$2</em>")
        .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g,
                 '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }).join("");
  }
  function toHtml(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const out = []; let para = [], list = null;
    const flushPara = () => { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } };
    const flushList = () => { if (list) { out.push(`<${list.tag}>` + list.items.map(i => "<li>" + inline(i) + "</li>").join("") + `</${list.tag}>`); list = null; } };
    const flush = () => { flushPara(); flushList(); };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fence = /^\s*```\s*([\w+#.-]*)/.exec(line);
      if (fence) {
        flush();
        const code = [];
        while (++i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i]);
        const lang = fence[1] || "código";
        out.push(`<div class="md-code"><div class="md-code-h"><span>${esc(lang)}</span>` +
                 `<button type="button" class="md-copy">Copiar</button></div><pre><code>${esc(code.join("\n"))}</code></pre></div>`);
        continue;
      }
      let m;
      if (!line.trim()) { flush(); continue; }
      if ((m = /^\s*(#{1,4})\s+(.*)$/.exec(line))) { flush(); out.push(`<div class="md-h md-h${m[1].length}">${inline(m[2])}</div>`); continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); continue; }
      if ((m = /^\s*>\s?(.*)$/.exec(line))) { flush(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
      if ((m = /^\s*(?:([-*•+])|(\d+)[.)])\s+(.*)$/.exec(line))) {
        flushPara();
        const tag = m[1] ? "ul" : "ol";
        if (!list || list.tag !== tag) { flushList(); list = { tag, items: [] }; }
        list.items.push(m[3]);
        continue;
      }
      if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += " " + line.trim(); continue; }
      flushList(); para.push(line);
    }
    flush();
    return out.join("");
  }

  /* ── portapapeles con respaldo (pywebview a veces no expone clipboard) ── */
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (_) {}
    ta.remove(); return ok;
  }
  function flashCopied(btn, ok) {
    const prev = btn.dataset.label || btn.textContent;
    btn.dataset.label = prev;
    btn.textContent = ok ? "Copiado ✓" : "No se pudo copiar";
    clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = prev; }, 1400);
  }

  /* ── burbuja de respuesta ── */
  function render(el, text) {
    el.dataset.raw = text;
    if (!/[`*#>\[_\-\d•+]/.test(text)) { el.textContent = text; el.classList.remove("md"); return; }
    el.innerHTML = toHtml(text);
    el.classList.add("md");
    el.querySelectorAll(".md-copy").forEach(b => {
      b.onclick = async () => flashCopied(b, await copy(b.closest(".md-code").querySelector("code").textContent));
    });
  }
  function addActions(bubble) {
    if (!bubble || bubble.querySelector(".m-actions")) return;
    const bar = document.createElement("div");
    bar.className = "m-actions";
    const b = document.createElement("button");
    b.type = "button"; b.className = "m-act"; b.textContent = "Copiar respuesta";
    b.onclick = async () => {
      const t = bubble.querySelector(".m-txt");
      flashCopied(b, await copy((t && (t.dataset.raw || t.textContent)) || ""));
    };
    bar.appendChild(b);
    bubble.appendChild(bar);
  }
  /* agentMsg(text): pinta la burbuja ya con formato */
  function fill(el, text) {
    text = text || "";
    if (text) render(el, text); else el.textContent = "";
    queueMicrotask(() => {
      const w = el.closest(".m-agent");
      if (w) { w.dataset.t = String(Date.now()); addActions(w); }
    });
  }
  /* agent_end: el tramo que llegó en vivo se formatea una vez */
  function finalize(el) {
    if (!el) return;
    const text = el.textContent;
    if (!text.trim()) { const w = el.closest(".m-agent"); if (w) w.classList.add("m-empty"); return; }
    render(el, text);
    if (typeof scrollMsgs === "function") scrollMsgs();
  }

  /* ── historial de mensajes enviados (↑/↓) y borrador ── */
  let hist = store.get(HIST_KEY, []), hIdx = -1, hStash = "";
  function remember(msg) {
    msg = (msg || "").trim();
    if (!msg || msg.startsWith("/")) return;
    hist = hist.filter(x => x !== msg); hist.push(msg);
    if (hist.length > HIST_MAX) hist = hist.slice(-HIST_MAX);
    store.set(HIST_KEY, hist); hIdx = -1;
  }
  function resize() {
    const inp = $id("inp");
    if (!inp) return;
    inp.style.height = "auto";
    inp.style.height = Math.min(inp.scrollHeight, INP_MAX_PX) + "px";
    inp.style.overflowY = inp.scrollHeight > INP_MAX_PX ? "auto" : "hidden";
  }
  function saveDraft() { const inp = $id("inp"); if (inp) store.set(DRAFT_KEY, inp.value); }
  function setInput(text, focus = true) {
    const inp = $id("inp");
    if (!inp) return;
    inp.value = text || "";
    resize(); saveDraft();
    if (focus) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }

  /* ── fila «Reintentar / Editar» ── */
  function retryRow(text, msg, img) {
    const box = $id("msgs");
    if (!box) return null;
    const row = document.createElement("div");
    row.className = "m-sys m-retry";
    const t = document.createElement("span");
    t.textContent = text;
    row.appendChild(t);
    if (msg || img) {
      const again = document.createElement("button");
      again.type = "button"; again.className = "m-act"; again.textContent = "↻ Reintentar";
      again.onclick = () => {
        if (global.S && S.busy) return blocked();
        row.remove();
        setInput(msg, false);
        if (img && typeof setAttachedImage === "function") setAttachedImage(img);
        send();
      };
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "m-act"; edit.textContent = "✎ Editar";
      edit.onclick = () => {
        setInput(msg);
        if (img && typeof setAttachedImage === "function") setAttachedImage(img);
      };
      row.append(again, edit);
    }
    box.appendChild(row);
    if (typeof scrollMsgs === "function") scrollMsgs();
    return row;
  }
  function lastAgentOfTurn() {
    const all = document.querySelectorAll("#msgs .m-agent");
    const w = all[all.length - 1];
    const t0 = (global.S && S.turnStart) || 0;
    return w && Number(w.dataset.t || 0) >= t0 ? w : null;
  }
  function tag(w, text, cls) {
    const who = w && w.querySelector(".m-who");
    if (!who) return;
    const s = document.createElement("span");
    s.className = "m-tag" + (cls ? " " + cls : ""); s.textContent = text;
    who.appendChild(s);
  }

  /* intento de enviar con un turno en curso: no se pierde nada, se avisa */
  function blocked() {
    if (typeof setStatus === "function")
      setStatus("LOW está trabajando — tu mensaje queda en el cuadro · ■ o Esc para detener");
    const b = $id("btnSend");
    if (b) { b.classList.remove("send-nudge"); void b.offsetWidth; b.classList.add("send-nudge"); }
    return true;
  }

  /* fin de turno: estado, tiempos y salidas de emergencia */
  function after(r, msg, img) {
    remember(msg); resize(); saveDraft();
    if (!r) { retryRow("No llegó respuesta del agente.", msg, img); return; }
    if (r.busy) {
      const users = document.querySelectorAll("#msgs .m-user");
      const u = users[users.length - 1];
      if (u) u.remove();
      if (!$id("inp").value) setInput(msg);
      blocked();
      return;
    }
    const w = lastAgentOfTurn();
    if (w && global.S && S.turnStart) tag(w, Math.max(1, Math.round((Date.now() - S.turnStart) / 1000)) + " s");
    if (r.cut) {
      if (w && r.streamed) tag(w, "cortada", "bad");
      retryRow(r.streamed ? "La conexión con el modelo se cortó antes de terminar." : "¿Lo intento de nuevo?", msg, img);
      return;
    }
    if (r.stopped) { if (w && r.streamed) tag(w, "detenida", "bad"); return; }
    if (r.status === "Error" || r.status === "Rate limit") retryRow("¿Lo intento de nuevo?", msg, img);
  }
  function fail(e, msg, img) {
    remember(msg);
    retryRow("Falló la llamada: " + ((e && e.message) || e), msg, img);
  }

  /* ── enganche del cuadro de texto ── */
  function hook() {
    const inp = $id("inp");
    if (!inp || inp.dataset.flow) return;
    inp.dataset.flow = "1";
    if (!inp.value) { const d = store.get(DRAFT_KEY, ""); if (d) inp.value = d; }
    resize();
    inp.addEventListener("input", () => { hIdx = -1; resize(); saveDraft(); });
    // captura: corre ANTES del Enter→send() de app.js
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter" && (e.isComposing || e.keyCode === 229)) { e.stopImmediatePropagation(); return; }
      if (e.key === "Enter" && !e.shiftKey) { setTimeout(() => { resize(); saveDraft(); }, 0); return; }
      const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
      const atEnd = inp.selectionStart === inp.value.length;
      if (e.key === "ArrowUp" && hist.length && (inp.value === "" || (hIdx >= 0 && atStart))) {
        e.preventDefault();
        if (hIdx < 0) { hStash = inp.value; hIdx = hist.length; }
        hIdx = Math.max(0, hIdx - 1);
        inp.value = hist[hIdx]; resize();
        inp.setSelectionRange(0, 0);
      } else if (e.key === "ArrowDown" && hIdx >= 0 && atEnd) {
        e.preventDefault();
        hIdx++;
        if (hIdx >= hist.length) { hIdx = -1; inp.value = hStash; } else inp.value = hist[hIdx];
        resize();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook, { once: true });
  else hook();

  const LOW = (global.LOW = global.LOW || {});
  LOW.chatFlow = { toHtml, fill, finalize, after, fail, blocked, retryRow, resize, remember, setInput, copy };
})(window);
