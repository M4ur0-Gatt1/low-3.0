/* Provider settings are kept separate from the animation editor. */
(function () {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
  const field = (p, key, label, type = "text") => `<label>${label}<input type="${type}"
    data-provider="${escape(p.name)}" data-field="${key}" value="${escape(p[key])}"
    autocomplete="off" spellcheck="false"></label>`;
  function row(p) {
    const gateway = ["higgsfield", "replicate"].includes(p.name);
    return `<details class="provider-card"><summary>${escape(p.name)}
      <span>${p.media_only ? "Imagen / video" : "LLM"} · ${p.has_key ? "Clave guardada; sin verificar" : "Sin clave"}</span></summary>
      ${field({...p, api_key: p.key}, "api_key", p.name === "higgsfield" ? "API key (ID:SECRET)" : "API key", "password")}
      ${!gateway && !p.media_only ? field(p, "base_url", "Base URL (opcional)") : ""}
      ${field(p, "model", p.media_only ? "Modelo de video" : "Modelo de chat")}
      ${p.name === "cloudflare" ? field(p, "account_id", "Account ID") : ""}
      ${gateway || p.name === "fal" ? field(p, "image_model", "Modelo de imagen") : ""}
      ${gateway ? ["image", "video"].map(kind => `<label>Parámetros de ${kind === "image" ? "imagen" : "video"} (JSON del modelo)
        <textarea data-provider="${escape(p.name)}" data-field="${kind}_params" rows="3">${escape(JSON.stringify(p[kind + "_params"] || {}, null, 2))}</textarea></label>`).join("") : ""}
      ${p.name === "higgsfield" ? '<small>Ingresá ID:SECRET de Higgsfield Console, sin el prefijo Key. Se necesitan ambas partes.</small>' : ''}
      <button type="button" data-check="${escape(p.name)}">${p.media_only ? 'Revisar configuración' : 'Comprobar catálogo'}</button>
      <div data-result="${escape(p.name)}" role="status"></div>
      <small>La clave guardada no confirma saldo, acceso al modelo ni conexión.</small>
    </details>`;
  }
  window.LOW = window.LOW || {};
  window.LOW.ProviderSettings = {
    render(providers) {
      return `<div id="providerCards">${providers.map(row).join("")}</div>
        <button type="button" id="addProvider">+ Endpoint LLM compatible con OpenAI</button>
        <p class="sub">Podés agregar varios servicios o servidores locales. Las APIs con protocolos propios necesitan un adaptador.</p>`;
    },
    bind(check) {
      document.getElementById("providerCards").addEventListener("click", async event => {
        const button = event.target.closest("[data-check]");
        if (!button || !check) return;
        const card = button.closest(".provider-card"), result = card.querySelector("[data-result]");
        button.disabled = true; result.textContent = "Comprobando los valores del formulario…";
        let timer;
        try {
          const settings = window.LOW.ProviderSettings.collect(card)[button.dataset.check];
          const reply = await Promise.race([check(button.dataset.check, settings), new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('La comprobación no respondió en 20 segundos. Podés reintentar; no se generó contenido.')), 20000);
          })]);
          if (!reply || typeof reply.message !== 'string') throw Error('El puente devolvió una respuesta inválida. Reiniciá LOW y reintentá.');
          result.textContent = reply.message;
          if (reply.models?.length) {
            card.querySelector("datalist")?.remove();
            const list = document.createElement("datalist"); list.id = "models_" + button.dataset.check;
            reply.models.forEach(id => { const option = document.createElement("option"); option.value = id; list.append(option); });
            card.append(list); card.querySelector('[data-field="model"]').setAttribute("list", list.id);
          }
        } catch (error) { result.textContent = error.message || "No se pudo comprobar la conexión."; }
        finally { clearTimeout(timer); button.disabled = false; }
      });
      document.getElementById("addProvider").onclick = () => {
        const name = "custom_" + Date.now().toString(36);
        document.getElementById("providerCards").insertAdjacentHTML("beforeend", row({name, model: "", base_url: ""}));
        const card = document.getElementById("providerCards").lastElementChild;
        card.open = true;
        card.querySelector('[data-field="base_url"]').focus();
      };
    },
    collect(root = document.getElementById('providerCards')) {
      const values = {};
      root.querySelectorAll("[data-field]").forEach(input => {
        const {provider, field} = input.dataset;
        const value = field.endsWith("_params") ? JSON.parse(input.value || "{}") : input.value.trim();
        if (field.endsWith("_params") && (!value || Array.isArray(value) || typeof value !== "object"))
          throw Error(`${provider}: los parámetros deben ser un objeto JSON`);
        (values[provider] ||= {})[field] = value;
      });
      for (const [name, value] of Object.entries(values)) {
        if (name.startsWith("custom_") && (!/^https?:\/\//.test(value.base_url) || !value.model))
          throw Error(`${name}: completá la URL HTTP(S) y el modelo`);
      }
      return values;
    }
  };
})();
