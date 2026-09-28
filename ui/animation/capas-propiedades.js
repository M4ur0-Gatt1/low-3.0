/* ══════════════════════════════════════════════════════════════════════════
   PROPIEDADES DE UNA CAPA: opacidad, modo de fusión, mesa de luz y orden

   Pedido: «la posibilidad de intercambiar y modificar las posiciones de la
   capa para decidir cuál va arriba», «el foquito para usar la mesa de luz» y
   «todas las opciones de superposición de capas como en Harmony o Photoshop».

   Se abre desde el botón de propiedades de cada fila de la línea de tiempo.
   Todo pasa por comandos del documento (setLayerProperty, moveLayer,
   duplicateLayer, removeLayer): cada cambio es UNA entrada de Undo, y la
   opacidad no apila una entrada por cada píxel del deslizador (se aplica al
   soltar).

   @module animation/capas-propiedades
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  /** Los nombres de Photoshop en castellano. */
  const NOMBRES = {
    normal: "Normal", multiply: "Multiplicar", screen: "Trama", overlay: "Superponer",
    darken: "Oscurecer", lighten: "Aclarar", "color-dodge": "Sobreexponer color",
    "color-burn": "Subexponer color", "hard-light": "Luz fuerte", "soft-light": "Luz suave",
    difference: "Diferencia", exclusion: "Exclusión", hue: "Tono", saturation: "Saturación",
    color: "Color", luminosity: "Luminosidad",
  };

  let abierto = null;
  function cerrar() {
    if (!abierto) return;
    abierto.el.remove();
    document.removeEventListener("mousedown", abierto.fuera, true);
    document.removeEventListener("keydown", abierto.tecla, true);
    abierto = null;
  }

  function abrir(doc, layerId, ancla) {
    cerrar();
    const ly = doc && doc.scene.layer(layerId);
    if (!ly) return null;
    const el = document.createElement("div");
    el.className = "dz-capa-props";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", "Propiedades de la capa " + ly.name);

    const titulo = document.createElement("h4");
    titulo.textContent = ly.name;
    el.appendChild(titulo);

    const campo = (etiqueta, control, valor) => {
      const l = document.createElement("label");
      const s = document.createElement("span"); s.textContent = etiqueta;
      l.append(s, control);
      if (valor) l.appendChild(valor);
      el.appendChild(l);
      return control;
    };

    // opacidad: se VE mientras se arrastra, se escribe una vez al soltar
    const op = document.createElement("input");
    op.type = "range"; op.min = "0"; op.max = "100"; op.step = "1";
    op.value = String(Math.round((ly.opacity == null ? 1 : ly.opacity) * 100));
    op.dataset.capa = "opacidad";
    const opv = document.createElement("span"); opv.textContent = op.value + "%";
    op.oninput = () => { opv.textContent = op.value + "%"; };
    op.onchange = () => doc.setLayerProperty(ly.id, "opacity", (+op.value) / 100, "Opacidad de capa");
    campo("Opacidad", op, opv);

    const fu = document.createElement("select");
    fu.dataset.capa = "fusion";
    for (const m of animation.LAYER_BLENDS || ["normal"]) {
      const o = document.createElement("option"); o.value = m; o.textContent = NOMBRES[m] || m; fu.appendChild(o);
    }
    fu.value = ly.blend || "normal";
    fu.onchange = () => doc.setLayerProperty(ly.id, "blend", fu.value, "Modo de fusión: " + (NOMBRES[fu.value] || fu.value));
    campo("Fusión", fu);

    const luz = document.createElement("input");
    luz.type = "checkbox"; luz.checked = !!ly.lightTable; luz.dataset.capa = "luz";
    luz.onchange = () => doc.setLayerProperty(ly.id, "lightTable", luz.checked, luz.checked ? "Mesa de luz" : "Apagar mesa de luz");
    campo("Mesa de luz", luz);

    const idx = doc.scene.layers.indexOf(ly), n = doc.scene.layers.length;
    const fila = document.createElement("div"); fila.className = "fila";
    const boton = (texto, titulo, fn, clase) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = texto; b.title = titulo;
      if (clase) b.className = clase;
      b.onclick = fn; fila.appendChild(b); return b;
    };
    boton("↑ Adelante", "Traer la capa una posición adelante", () => { doc.moveLayer(ly.id, idx + 1); cerrar(); }).disabled = idx >= n - 1;
    boton("↓ Atrás", "Llevar la capa una posición atrás", () => { doc.moveLayer(ly.id, idx - 1); cerrar(); }).disabled = idx <= 0;
    el.appendChild(fila);
    const fila2 = document.createElement("div"); fila2.className = "fila";
    const b2 = (texto, titulo, fn, clase) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = texto; b.title = titulo;
      if (clase) b.className = clase; b.onclick = fn; fila2.appendChild(b); return b;
    };
    b2("Duplicar", "Duplicar la capa con sus dibujos, encima de la original", () => { doc.duplicateLayer(ly.id); cerrar(); });
    b2("Eliminar", "Eliminar la capa (se puede deshacer)", async () => {
      cerrar();
      const ok = typeof global.dzConfirmModal === "function"
        ? await global.dzConfirmModal("¿Eliminar la capa «" + ly.name + "» con sus dibujos? Se puede deshacer con Ctrl+Z.", { ok: "Eliminar" })
        : true;
      if (ok) doc.removeLayer(ly.id);
    }, "peligro").disabled = n <= 1;
    el.appendChild(fila2);
    const nota = document.createElement("small");
    nota.textContent = "La mesa de luz es de la vista: al exportar la capa sale normal. Opacidad y fusión salen igual que se ven.";
    el.appendChild(nota);

    document.body.appendChild(el);
    // al lado del botón, sin salirse de la ventana
    const r = ancla && ancla.getBoundingClientRect ? ancla.getBoundingClientRect() : { right: 40, top: 40, bottom: 40 };
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = r.right + 6, y = r.top - 10;
    if (x + w > innerWidth - 8) x = Math.max(8, innerWidth - w - 8);
    if (y + h > innerHeight - 8) y = Math.max(8, innerHeight - h - 8);
    el.style.left = x + "px"; el.style.top = y + "px";

    const fuera = (e) => { if (!el.contains(e.target) && e.target !== ancla && !(ancla && ancla.contains(e.target))) cerrar(); };
    const tecla = (e) => { if (e.key === "Escape") { e.stopPropagation(); cerrar(); } };
    document.addEventListener("mousedown", fuera, true);
    document.addEventListener("keydown", tecla, true);
    abierto = { el, fuera, tecla, layerId };
    return el;
  }

  animation.capasPropiedades = { abrir, cerrar, NOMBRES };
  global.dzCapaPropiedades = (doc, layerId, ancla) => {
    if (abierto && abierto.layerId === layerId) { cerrar(); return null; }   // el mismo botón lo cierra
    return abrir(doc, layerId, ancla);
  };
})(window);
