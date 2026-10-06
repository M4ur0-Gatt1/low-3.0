(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  class BrushStudio {
    constructor(root, options = {}) {
      this.root = root; this.library = options.library; this.engine = options.engine; this.options = options;
      this.query = ""; this.filter = "all"; this.selected = options.selected || this.library?.all?.()[0]?.id || null;
      this.storage = global.LOW?.safeMode?.preferenceStorage || global.localStorage;
      try { this.favorites = new Set(JSON.parse(this.storage?.getItem("low.brush.favorites") || "[]")); } catch (_) { this.favorites = new Set(); }
      this.render();
    }
    brushes() {
      const query = this.query.trim().toLocaleLowerCase();
      return (this.library?.all?.() || []).filter(brush => {
        if (this.filter === "favorites" && !this.favorites.has(brush.id)) return false;
        if (this.filter === "imported" && !brush.imported) return false;
        if (!["all", "favorites", "imported"].includes(this.filter) && (this.library.categoria ? this.library.categoria(brush) : brush.cat) !== this.filter) return false;
        return !query || `${brush.name} ${brush.texture || ""} ${brush.engine || ""}`.toLocaleLowerCase().includes(query);
      });
    }
    render() {
      const active = this.library?.get?.(this.selected), brushes = this.brushes();
      this.root.innerHTML = `<header><div><b>Estudio de pinceles</b><small>${this.library?.all?.().length || 0} pinceles</small></div><button data-a="close" aria-label="Cerrar">×</button></header>
        <div class="bst-search"><input type="search" placeholder="Buscar pincel" value="${esc(this.query)}"><button data-a="import" title="Photoshop .abr, Procreate .brushset, Krita .bundle/.kpp, GIMP .gbr/.gih, MyPaint .myb, PNG">Instalar biblioteca…</button></div>
        <nav><button data-filter="all"${this.filter === "all" ? ' class="active"' : ""}>Todos</button><button data-filter="favorites"${this.filter === "favorites" ? ' class="active"' : ""}>Favoritos</button>${(global.LOW?.drawing?.BRUSH_CATEGORIAS || []).filter(([id]) => !["propio", "importado"].includes(id)).map(([id, nombre]) => `<button data-filter="${id}"${this.filter === id ? ' class="active"' : ""}>${esc(nombre)}</button>`).join("")}<button data-filter="imported"${this.filter === "imported" ? ' class="active"' : ""}>Importados</button></nav>${this.navBibliotecas()}
        <div class="bst-list" role="listbox" aria-label="Pinceles">${brushes.map(brush => `<button class="bst-brush${brush.id === this.selected ? " selected" : ""}" data-id="${esc(brush.id)}" role="option" aria-selected="${brush.id === this.selected}"><span class="bst-tip ${brush.engine || "vector"}">${brush.tipData ? `<img src="${esc(brush.tipData)}" alt="">` : ""}</span><span><b>${esc(brush.name)}</b><small>${brush.engine === "raster" ? "Raster" : "Vector"}${brush.imported ? " · importado" : ""}</small></span><i>${this.favorites.has(brush.id) ? "★" : "☆"}</i></button>`).join("") || '<p class="bst-empty">No hay pinceles con ese filtro.</p>'}</div>
        <section class="bst-editor${active ? "" : " disabled"}"><div class="bst-preview"><svg viewBox="0 0 300 86" aria-label="Vista previa del pincel"></svg></div>
          <div class="bst-title"><strong>${esc(active?.name || "Sin selección")}</strong><button data-a="favorite" title="Favorito">${this.favorites.has(this.selected) ? "★" : "☆"}</button><button data-a="duplicate">Duplicar</button></div>
          ${this.controls(active)}
        </section>`;
      this.wire(); if (active) this.preview(active); this.miniaturas();
    }
    /* Lo que el motor elegido NO puede usar se muestra apagado y con el motivo,
       en vez de dejar un deslizador que se mueve y no hace nada.

       Los dos casos son de una cinta vectorial: es UN camino relleno, así que
       no puede cambiar de opacidad a lo largo del trazo (Presión → opacidad) ni
       tener el borde difuso (Dureza). No es que falten: no existen en esa
       forma de dibujar. Un deslizador vivo que no cambia nada es peor que uno
       apagado que explica por qué. */
    static get INERTES() {
      return { vector: {
        pressureOpacity: "Una cinta vectorial es un solo camino relleno: no puede cambiar de opacidad a lo largo del trazo. Usá un pincel raster.",
        hardness: "El borde de una cinta vectorial es el borde del camino: no hay difuminado que ajustar. Usá un pincel raster.",
        shape: "Las formas son de SELLOS: una cinta vectorial es un solo camino. Usá un pincel raster.",
        sizeJitter: "La variación es por sello: una cinta vectorial no tiene sellos. Usá un pincel raster.",
        angleJitter: "La variación es por sello: una cinta vectorial no tiene sellos. Usá un pincel raster.",
        hueJitter: "La variación es por sello: una cinta vectorial no tiene sellos. Usá un pincel raster.",
        opacityJitter: "La variación es por sello: una cinta vectorial no tiene sellos. Usá un pincel raster."
      }, raster: {} };
    }
    /** Las BIBLIOTECAS instaladas (Photoshop, Procreate, Krita, GIMP…): elegir
     *  una muestra sólo sus pinceles; «Quitar» la desinstala. */
    navBibliotecas() {
      const libs = [...((global.LOW?.drawing?.bibliotecas?.instaladas) || new Map()).values()];
      const actual = String(this.filter || "").startsWith("lib:") ? this.filter.slice(4) : "";
      return `<div class="bst-libs"><select data-a="lib" aria-label="Biblioteca"><option value="">${libs.length ? "Bibliotecas instaladas (" + libs.length + ")…" : "Sin bibliotecas instaladas"}</option>` +
        libs.map((l) => `<option value="${esc(l.id)}"${l.id === actual ? " selected" : ""}>${esc(l.name)} · ${l.count}</option>`).join("") + `</select>` +
        (actual ? (() => { const l = libs.find((x) => x.id === actual) || {};
          // una INCLUIDA (viene con LOW) se oculta, no se borra; se muestra su autor y licencia
          return (l.author ? `<small class="bst-lib-cred">${esc(l.author)}${l.license ? " · " + esc(l.license) : ""}</small>` : "") +
            `<button data-a="quitarlib" title="${l.builtin ? "Ocultar esta biblioteca incluida (no se borra del programa)" : "Desinstalar esta biblioteca"}">${l.builtin ? "Ocultar biblioteca" : "Quitar biblioteca"}</button>`; })() : "") + `</div>`;
    }
    controls(brush) {
      const p = brush || {};
      const motor = p.engine === "raster" ? "raster" : "vector";
      const inertes = BrushStudio.INERTES[motor] || {};
      const slider = (key, label, min, max, step, value) => {
        const porque = inertes[key];
        return `<label class="bst-slider${porque ? " inerte" : ""}"${porque ? ` title="${esc(porque)}"` : ""}>` +
          `<span>${label}<output>${porque ? "—" : value}</output></span>` +
          `<input data-p="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"${porque ? " disabled" : ""}></label>`;
      };
      return `<div class="bst-controls">${slider("size", "Tamaño", .5, 160, .5, p.size ?? 6)}${slider("opacity", "Opacidad", 0, 1, .01, p.opacity ?? 1)}${slider("spacing", "Espaciado", .01, 1, .01, p.spacing ?? .08)}${slider("smoothing", "Suavizado", 0, 1, .01, p.smoothing ?? .35)}${slider("pressureSize", "Presión → tamaño", 0, 1, .01, p.pressureSize ?? .75)}${slider("pressureOpacity", "Presión → opacidad", 0, 1, .01, p.pressureOpacity ?? 0)}${slider("tiltSize", "Inclinación", 0, 1, .01, p.tiltSize ?? 0)}${slider("scatter", "Dispersión", 0, 2, .01, p.scatter ?? 0)}${slider("hardness", "Dureza", 0, 1, .01, p.hardness ?? .8)}</div>` + this.controlsFx(p, inertes, slider);
    }
    /** Textura, forma, remates, brillo y variaciones (oct-2026). */
    controlsFx(p, inertes, slider) {
      const fx = global.LOW?.drawing?.efectos || { GRANOS: {}, BORDES: {} };
      const select = (key, label, opciones, value) => {
        const porque = inertes[key];
        return `<label class="bst-slider bst-select${porque ? " inerte" : ""}"${porque ? ` title="${esc(porque)}"` : ""}><span>${label}</span>` +
          `<select data-p="${key}"${porque ? " disabled" : ""}>${opciones.map(([v, t]) => `<option value="${esc(v)}"${String(value ?? "") === v ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`;
      };
      const texturas = [["", "Lisa"]].concat(Object.entries(fx.GRANOS).map(([k, v]) => [k, v.nombre]), Object.entries(fx.BORDES).map(([k, v]) => [k, v.nombre]));
      const formas = [["ellipse", "Redonda"], ["dot", "Punto"], ["star", "Destello"], ["blade", "Pasto"], ["leaf", "Hoja"], ["square", "Confeti"], ["line", "Rayita"]];
      return `<div class="bst-controls bst-fx"><b class="bst-sub">Textura y efecto</b>${select("texture", "Textura", texturas, p.texture || "")}` +
        `${slider("textureStrength", "Fuerza de textura", 0, 1, .01, p.textureStrength ?? .6)}${slider("textureScale", "Escala de textura", .2, 5, .05, p.textureScale ?? 1)}` +
        `${slider("glow", "Brillo", 0, 1, .01, p.glow ?? 0)}${slider("taperStart", "Remate al empezar", 0, 1, .01, p.taperStart ?? 0)}${slider("taperEnd", "Remate al terminar", 0, 1, .01, p.taperEnd ?? 0)}` +
        `<b class="bst-sub">Sellos</b>${select("shape", "Forma", formas, p.shape || "ellipse")}` +
        `${slider("sizeJitter", "Variación de tamaño", 0, 1, .01, p.sizeJitter ?? 0)}${slider("angleJitter", "Variación de ángulo", 0, 1, .01, p.angleJitter ?? 0)}` +
        `${slider("hueJitter", "Variación de color", 0, 1, .01, p.hueJitter ?? 0)}${slider("opacityJitter", "Variación de opacidad", 0, 1, .01, p.opacityJitter ?? 0)}</div>`;
    }
    wire() {
      this.root.querySelector('[data-a="close"]').onclick = () => this.options.onClose?.();
      this.root.querySelector('[data-a="import"]').onclick = () => (global.dzImportBrushes || this.options.onImport)?.();
      const libSel = this.root.querySelector('[data-a="lib"]');
      if (libSel) libSel.onchange = () => { this.filter = libSel.value ? "lib:" + libSel.value : "all"; this.render(); };
      const quitar = this.root.querySelector('[data-a="quitarlib"]');
      if (quitar) quitar.onclick = () => { const id = this.filter.slice(4); global.LOW?.drawing?.bibliotecas?.quitar(id); this.filter = "all"; this.render(); };
      this.root.querySelector(".bst-search input").oninput = event => {
        this.query = event.target.value; const caret = event.target.selectionStart; this.render();
        const search = this.root.querySelector(".bst-search input"); search.focus(); search.setSelectionRange(caret, caret);
      };
      this.root.querySelectorAll("[data-filter]").forEach(button => button.onclick = () => { this.filter = button.dataset.filter; this.render(); });
      this.root.querySelectorAll(".bst-brush").forEach(button => button.onclick = event => {
        if (event.target.tagName === "I") return this.toggleFavorite(button.dataset.id);
        this.selected = button.dataset.id; this.options.onSelect?.(this.library.get(this.selected)); this.render();
      });
      this.root.querySelector('[data-a="favorite"]').onclick = () => this.toggleFavorite(this.selected);
      this.root.querySelector('[data-a="duplicate"]').onclick = () => this.duplicate();
      this.root.querySelectorAll(".bst-controls input").forEach(input => {
        input.oninput = () => this.change(input);
        input.onchange = () => this.render();
      });
      this.root.querySelectorAll(".bst-controls select").forEach(select => {
        select.onchange = () => { this.change(select); this.render(); };
      });
    }
    toggleFavorite(id) {
      if (!id) return; this.favorites.has(id) ? this.favorites.delete(id) : this.favorites.add(id);
      try { this.storage?.setItem("low.brush.favorites", JSON.stringify([...this.favorites])); }
      catch (error) { this.options.onError?.(new Error("No hay espacio para guardar favoritos.")); }
      this.render();
    }
    duplicate() {
      const brush = this.library.get(this.selected); if (!brush) return;
      const copy = { ...brush, id: `custom-${Date.now().toString(36)}`, name: `${brush.name} · copia`, custom: true, imported: false };
      this.library.save(copy); this.selected = copy.id; this.options.onSelect?.(copy); this.render();
    }
    change(input) {
      let brush = this.library.get(this.selected); if (!brush) return;
      if (this.library.isBuiltin?.(brush.id)) {
        brush = { ...brush, id: `custom-${Date.now().toString(36)}`, name: `${brush.name} · personalizado`, custom: true };
        this.selected = brush.id;
      }
      const valor = input.tagName === "SELECT" ? (input.value || null) : Number(input.value);
      brush = { ...brush, [input.dataset.p]: valor };
      try { this.library.save(brush); } catch (error) { return this.options.onError?.(error); }
      const salida = input.closest("label").querySelector("output"); if (salida) salida.textContent = input.value;
      const title = this.root.querySelector(".bst-title strong"); if (title) title.textContent = brush.name;
      this.options.onSelect?.(brush); this.preview(brush);
    }
    /** Cada pincel de la lista con un trazo chico de VERDAD (el mismo render
     *  de la mesa): con 40 pinceles, un ícono genérico no deja elegir. */
    miniaturas() {
      if (typeof global.dzBrushRenderElement !== "function") return;
      const NS = "http://www.w3.org/2000/svg";
      this.root.querySelectorAll(".bst-brush").forEach((boton) => {
        const tip = boton.querySelector(".bst-tip"), brush = this.library.get(boton.dataset.id);
        if (!tip || !brush || brush.tipData || tip.querySelector("svg")) return;
        const pts = Array.from({ length: 18 }, (_, i) => [6 + i * 3, 14 - Math.sin(i / 2.8) * 6, .25 + .75 * Math.sin(i / 17 * Math.PI), 0, 0, 0, i * 8]);
        try {
          const el = global.dzBrushRenderElement(pts, "#e9ebe8", { brush, size: Math.max(2, Math.min(9, (brush.size || 6) / 3)) });
          if (!el) return;
          const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 62 28"); svg.appendChild(el);
          tip.textContent = ""; tip.appendChild(svg); tip.classList.add("con-trazo");
        } catch (_) { /* sin miniatura, queda el ícono */ }
      });
    }
    preview(brush) {
      const svg = this.root.querySelector(".bst-preview svg"); if (!svg || !this.engine) return;
      const points = Array.from({ length: 34 }, (_, i) => ({ x: 14 + i * 8.2, y: 53 - Math.sin(i / 5) * 17, pressure: .12 + i / 38, tiltX: i, tiltY: 0, time: i * 8 }));
      svg.innerHTML = "";
      if (typeof global.dzBrushRenderElement === "function") {
        try {
          const pts = points.map(q => [q.x, q.y, q.pressure, q.tiltX, q.tiltY, 0, q.time]);
          const el = global.dzBrushRenderElement(pts, "#e9ebe8", { brush, size: Math.min(30, brush.size || 6) });
          if (el) { svg.appendChild(el); return; }
        } catch (_) { /* si el render falla, la vista previa simple de abajo */ }
      }
      if (brush.engine === "vector") {
        const result = this.engine.buildVectorOutline(points, brush); if (!result) return;
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", result.path); path.setAttribute("fill", "#e9ebe8"); svg.appendChild(path);
      } else {
        this.engine.buildRasterDabs(points, brush).slice(0, 90).forEach(dab => {
          const node = document.createElementNS("http://www.w3.org/2000/svg", brush.tipData ? "image" : "ellipse");
          if (brush.tipData) { node.setAttribute("href", brush.tipData); node.setAttribute("x", dab.x-dab.width/2); node.setAttribute("y", dab.y-dab.height/2); node.setAttribute("width", dab.width); node.setAttribute("height", dab.height); }
          else { node.setAttribute("cx", dab.x); node.setAttribute("cy", dab.y); node.setAttribute("rx", dab.width/2); node.setAttribute("ry", dab.height/2); node.setAttribute("fill", "#e9ebe8"); }
          node.setAttribute("opacity", dab.opacity); svg.appendChild(node);
        });
      }
    }
  }
  drawing.BrushStudio = BrushStudio;
})(typeof window !== "undefined" ? window : globalThis);
