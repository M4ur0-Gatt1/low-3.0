/* Autoscroll inteligente del chat (fuera de app.js por el presupuesto §12).
   Solo pega el chat al final si ya estabas abajo. Si subiste a leer, no te
   arranca de ahí: aparece "↓ Nuevos mensajes". force=true (mensaje propio,
   cambio de conversación) siempre baja.
   Usa el estado global S de app.js (se resuelve en tiempo de llamada). */
(function () {
  const MSGS_PIN_PX = 80;
  let pinned = true;
  function nearBottom(m) { return m.scrollHeight - m.scrollTop - m.clientHeight < MSGS_PIN_PX; }
  function jumpBtn() {
    const m = document.getElementById("msgs");
    let b = document.getElementById("msgsJump");
    if (!b && m) {
      b = document.createElement("button");
      b.id = "msgsJump"; b.type = "button"; b.className = "msgs-jump"; b.hidden = true;
      b.textContent = "↓ Nuevos mensajes";
      b.onclick = () => scrollMsgs(true);
      m.after(b);
      m.addEventListener("scroll", () => {
        pinned = nearBottom(m);
        if (pinned) b.hidden = true;
      }, { passive: true });
    }
    return b;
  }
  function scrollMsgs(force) {
    const m = document.getElementById("msgs");
    if (!m) return;
    const b = jumpBtn();
    if (force || pinned) {
      m.scrollTop = m.scrollHeight; pinned = true;
      if (b) b.hidden = true;
    } else if (b) b.hidden = false;
  }
  /* limpiar el chat (nueva conversación / resume / cerrar pestaña) */
  function resetMsgs() {
    const m = document.getElementById("msgs");
    if (m) m.innerHTML = "";
    pinned = true;
    const b = document.getElementById("msgsJump");
    if (b) b.hidden = true;
  }
  window.scrollMsgs = scrollMsgs;
  window.resetMsgs = resetMsgs;
})();
