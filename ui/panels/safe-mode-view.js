"use strict";

/* UI de preferencias recuperables. La política y los dominios viven en
   core/safe-mode.js; este módulo sólo presenta decisiones al usuario. */
function dzConfigResetModal() {
  const safe = window.LOW?.safeMode;
  if (!safe) return dzNotice("El gestor de configuración no está disponible.", "Configuración 2D");
  const rows = Object.entries(safe.domains).map(([id, domain]) =>
    `<label class="krow"><span>${domain.label}</span><input type="checkbox" data-reset-domain="${id}"></label>`).join("");
  openModal(`<h2>Restablecer configuración 2D</h2>
    <div class="sub">Elegí solamente las áreas que querés devolver a sus valores de fábrica.
    No se borran escenas, dibujos, recuperación automática, personajes ni archivos del proyecto.
    El cambio se aplica al volver a abrir LOW.</div>
    ${rows}
    <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button>
      <button class="danger" id="configResetApply">Restablecer seleccionadas</button></div>`);
  $("#mCancel").onclick = closeModal;
  $("#configResetApply").onclick = () => {
    const domains = [...document.querySelectorAll("[data-reset-domain]:checked")].map(node => node.dataset.resetDomain);
    if (!domains.length) return dzNotice("Elegí al menos un área para restablecer.", "Configuración 2D");
    const result = safe.reset(domains, { confirmed: true, storage: localStorage });
    closeModal();
    dzSetStatus(` Configuración restablecida (${result.removed.length} preferencias) · cerrá y abrí LOW para aplicarla`);
  };
}

async function dzEnterSafeMode() {
  if ((DZ.doc && DZ.doc.dirty) || DZ.dirty)
    return dzNotice("Hay cambios sin guardar. Guardalos antes de reiniciar la interfaz en modo seguro.", "Modo seguro");
  const ok = await dzConfirmModal("LOW reiniciará solamente la interfaz con el espacio Dibujo, atajos y pinceles de fábrica. No borra tu configuración: al abrir normalmente vuelve a estar disponible.",
    { title: "Modo seguro", ok: "Reiniciar en modo seguro" });
  if (!ok) return;
  const result = await api.enter_safe_mode();
  if (!result || result.error) return dzNotice("No pude activar el modo seguro.", "Modo seguro");
  const url = new URL(location.href); url.searchParams.set("safe", "1");
  location.replace(url.toString());
}

window.dzConfigResetModal = dzConfigResetModal;
window.dzEnterSafeMode = dzEnterSafeMode;
