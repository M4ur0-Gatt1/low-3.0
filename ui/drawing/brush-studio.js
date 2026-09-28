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
        return !query || `${brush.name} ${brush.texture || ""} ${brush.engine || ""}`.toLocaleLowerCase().includes(query);
      });
    }
    render() {
      const active = this.library?.get?.(this.selected), brushes = this.brushes();
      this.root.innerHTML = `<header><div><b>Estudio de pinceles</b><small>${this.library?.all?.().length || 0} pinceles</small></div><button data-a="close" aria-label="Cerrar">×</button></header>
        <div class="bst-search"><input type="search" placeholder="Buscar pincel" value="${esc(this.query)}"><button data-a="import">Importar…</button></div>
        <nav><button data-filter="all"${this.filter === "all" ? ' class="active"' : ""}>Todos</button><button data-filter="favorites"${this.filter === "favorites" ? ' class="active"' : ""}>Favoritos</button><button data-filter="imported"${this.filter === "imported" ? ' class="active"' : ""}>Importados</button></nav>
        <div class="bst-list" role="listbox" aria-label="Pinceles">${brushes.map(brush => `<button class="bst-brush${brush.id === this.selected ? " selected" : ""}" data-id="${esc(brush.id)}" role="option" aria-selected="${brush.id === this.selected}"><span class="bst-tip ${brush.engine || "vector"}">${brush.tipData ? `<img src="${esc(brush.tipData)}" alt="">` : ""}</span><span><b>${esc(brush.name)}</b><small>${brush.engine === "raster" ? "Raster" : "Vector"}${brush.imported ? " · importado" : ""}</small></span><i>${this.favorites.has(brush.id) ? "★" : "☆"}</i></button>`).join("") || '<p class="bst-empty">No hay pinceles con ese filtro.</p>'}</div>
        <section class="bst-editor${active ? "" : " disabled"}"><div class="bst-preview"><svg viewBox="0 0 300 86" aria-label="Vista previa del pincel"></svg></div>
          <div class="bst-title"><strong>${esc(active?.name || "Sin selección")}</strong><button data-a="favorite" title="Favorito">${this.favorites.has(this.selected) ? "★" : "☆"}</button><button data-a="duplicate">Duplicar</button></div>
          ${this.controls(active)}
        </section>`;
      this.wire(); if (active) this.preview(active);
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
        hardness: "El borde de una cinta vectorial es el borde del camino: no hay difuminado que ajustar. Usá un pincel raster."
      }, raster: {} };
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
      return `<div class="bst-controls">${slider("size", "Tamaño", .5, 160, .5, p.size ?? 6)}${slider("opacity", "Opacidad", 0, 1, .01, p.opacity ?? 1)}${slider("spacing", "Espaciado", .01, 1, .01, p.spacing ?? .08)}${slider("smoothing", "Suavizado", 0, 1, .01, p.smoothing ?? .35)}${slider("pressureSize", "Presión → tamaño", 0, 1, .01, p.pressureSize ?? .75)}${slider("pressureOpacity", "Presión → opacidad", 0, 1, .01, p.pressureOpacity ?? 0)}${slider("tiltSize", "Inclinación", 0, 1, .01, p.tiltSize ?? 0)}${slider("scatter", "Dispersión", 0, 2, .01, p.scatter ?? 0)}${slider("hardness", "Dureza", 0, 1, .01, p.hardness ?? .8)}</div>`;
    }
    wire() {
      this.root.querySelector('[data-a="close"]').onclick = () => this.options.onClose?.();
      this.root.querySelector('[data-a="import"]').onclick = () => this.options.onImport?.();
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
      brush = { ...brush, [input.dataset.p]: Number(input.value) };
      try { this.library.save(brush); } catch (error) { return this.options.onError?.(error); }
      input.closest("label").querySelector("output").textContent = input.value;
      const title = this.root.querySelector(".bst-title strong"); if (title) title.textContent = brush.name;
      this.options.onSelect?.(brush); this.preview(brush);
    }
    preview(brush) {
      const svg = this.root.querySelector(".bst-preview svg"); if (!svg || !this.engine) return;
      const points = Array.from({ length: 34 }, (_, i) => ({ x: 14 + i * 8.2, y: 53 - Math.sin(i / 5) * 17, pressure: .12 + i / 38, tiltX: i, tiltY: 0, time: i * 8 }));
      svg.innerHTML = "";
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
