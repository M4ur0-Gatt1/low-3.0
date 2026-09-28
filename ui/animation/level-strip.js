/* ══════════════════════════════════════════════════════════════════════════
   LEVEL STRIP — los dibujos del nivel

   La X-sheet muestra el TIEMPO; esta tira muestra el MATERIAL: qué dibujos
   existen en el nivel, estén expuestos o no. Es la otra mitad de la distinción
   que sostiene todo el módulo, y hasta ahora no se veía en ninguna parte: un
   dibujo que no estaba en ninguna celda era invisible aunque existiera.

   Desde acá se navega a donde está expuesto un dibujo, se lo duplica para
   partir de él, se lo renumera y se lo borra (la única operación que sí
   destruye un dibujo, por eso pide confirmación).

   Cada miniatura es el SVG del dibujo, sin más: no hay que renderizar nada
   aparte ni mantener una caché que se desincronice.

   @module animation/level-strip
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  class LevelStrip {
    constructor(host, doc) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.doc = doc;
      this.selected = new Set();
      this.anchor = null;
      this._desuscribir = doc ? doc.subscribe((d, m) => {
        // se redibuja con lo que la afecta, no con cada movimiento del frame
        if (m === "level" || m === "cells" || m === "content" || m === "frame" || m === "palette")
          this.render();
      }) : null;
    }
    setDoc(doc) {
      if (this._desuscribir) this._desuscribir();
      this.doc = doc;
      this._desuscribir = doc ? doc.subscribe(() => this.render()) : null;
      this.render();
    }
    dispose() { if (this._desuscribir) this._desuscribir(); if (this.host) this.host.innerHTML = ""; }

    render() {
      if (!this.host || !this.doc) return;
      const doc = this.doc;
      const lv = doc.level;
      const box = document.createElement("div");
      box.className = "ls2";

      const head = document.createElement("div");
      head.className = "ls2-head";
      head.textContent = lv ? lv.name : "Sin nivel";
      // LEVEL-01: el nombre del nivel se puede corregir. Cambia lo que ve la
      // persona; el id interno —lo que referencian capas, celdas y paleta— no
      // se toca, así que renombrar nunca rompe una referencia.
      head.title = lv ? "Doble clic para renombrar el nivel" : "";
      head.ondblclick = async (event) => {
        if (!lv || event.target !== head || !global.dzPromptModal) return;
        const nombre = await global.dzPromptModal("Renombrar nivel",
          "nombre descriptivo — ej. «Cabeza», «Fondo»", lv.name);
        if (nombre != null && doc.renameLevel(lv.id, nombre)) this.render();
      };
      const nuevo = document.createElement("button");
      nuevo.className = "ls2-add";
      nuevo.textContent = "+";
      nuevo.title = "Dibujo nuevo, vacío, expuesto en el frame actual";
      nuevo.onclick = () => {
        if (!lv) return;
        const n = lv.nextNumber();
        doc.setCell(doc.frame, n);
      };
      head.appendChild(nuevo);
      box.appendChild(head);

      const tira = document.createElement("div");
      tira.className = "ls2-strip";
      // la miniatura lleva la hoja de la paleta: si no, mostraria el color
      // literal que quedo guardado y no el que el estilo dice hoy
      const hojaPal = (animation.palette && lv && doc.scene.levelPalette)
        ? animation.palette.css(doc.scene.levelPalette(lv.id)) : "";
      const actual = doc.cell;
      const expuestos = new Set();
      for (const ly of doc.scene.layers) {
        if (lv && ly.levelId === lv.id) ly.cells.forEach((c) => c != null && expuestos.add(c));
      }

      for (const d of (lv ? lv.drawings : [])) {
        const cel = document.createElement("div");
        cel.className = "ls2-item"
          + (d.number === actual ? " actual" : "")
          + (this.selected.has(d.number) ? " selected" : "")
          + (expuestos.has(d.number) ? "" : " suelto");
        cel.title = expuestos.has(d.number)
          ? `Dibujo ${d.number} · clic: ir a donde está expuesto`
          : `Dibujo ${d.number} · NO está expuesto en ninguna celda`;

        const mini = document.createElement("div");
        mini.className = "ls2-thumb";
        // el propio SVG del dibujo, escalado: sin caché que se desincronice
        mini.innerHTML = d.isEmpty()
          ? ""
          : `<svg viewBox="0 0 ${doc.scene.width} ${doc.scene.height}"
                  preserveAspectRatio="xMidYMid meet">${
                    hojaPal ? `<style>${hojaPal}</style>` : ""}${d.content}</svg>`;
        const num = document.createElement("b");
        num.className = "ls2-num";
        num.textContent = d.number;
        cel.append(mini, num);

        cel.onclick = (e) => {
          const drawings = lv.drawings.map((x) => x.number);
          if (e.ctrlKey || e.metaKey) {
            this.selected.has(d.number) ? this.selected.delete(d.number) : this.selected.add(d.number);
            this.anchor = d.number;
          } else if (e.shiftKey && this.anchor != null) {
            const a = drawings.indexOf(this.anchor), b = drawings.indexOf(d.number);
            this.selected = new Set(drawings.slice(Math.min(a, b), Math.max(a, b) + 1));
          } else { this.selected = new Set([d.number]); this.anchor = d.number; }
          // Seleccionar material no altera el timing. Exponer es una accion
          // separada (doble clic, menu contextual o drag hacia la XSheet).
          const f = doc.frameOfDrawing(d.number);
          if (f && !(e.ctrlKey || e.metaKey || e.shiftKey)) doc.goTo(f);
          this.render();
        };
        cel.ondblclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          doc.setCell(doc.frame, d.number);
        };
        cel.draggable = true;
        cel.ondragstart = (e) => {
          if (!this.selected.has(d.number)) this.selected = new Set([d.number]);
          const numbers = lv.drawings.map((x) => x.number).filter((n) => this.selected.has(n));
          animation.levelDrag = { levelId: lv.id, numbers };
          e.dataTransfer.effectAllowed = "copyMove";
          e.dataTransfer.setData("application/x-low-level-drawings",
            JSON.stringify({ levelId: lv.id, numbers }));
          e.dataTransfer.setData("text/plain", numbers.join(", "));
          cel.classList.add("dragging");
        };
        cel.ondragend = () => { cel.classList.remove("dragging"); animation.levelDrag = null; };
        // menú con lo que se puede hacer con un dibujo
        cel.oncontextmenu = (e) => {
          e.preventDefault();
          if (!this.selected.has(d.number)) {
            this.selected = new Set([d.number]); this.anchor = d.number; this.render();
          }
          this._menu(e, d);
        };
        tira.appendChild(cel);
      }
      if (!(lv ? lv.drawings.length : 0)) {
        const vacio = document.createElement("div");
        vacio.className = "ls2-empty";
        vacio.textContent = "Todavía no hay dibujos. Dibujá en el lienzo o tocá +.";
        tira.appendChild(vacio);
      }
      box.appendChild(tira);
      this.host.innerHTML = "";
      this.host.appendChild(box);
      const act = tira.querySelector(".ls2-item.actual");
      if (act && act.scrollIntoView) act.scrollIntoView({ inline: "nearest", block: "nearest" });
    }

    _menu(e, d) {
      const doc = this.doc;
      document.querySelectorAll(".ls2-menu").forEach((m) => m.remove());
      const m = document.createElement("div");
      m.className = "ls2-menu";
      m.style.left = e.clientX + "px";
      m.style.top = e.clientY + "px";
      const item = (txt, fn) => {
        const b = document.createElement("button");
        b.textContent = txt;
        b.onclick = () => { m.remove(); fn(); };
        m.appendChild(b);
      };
      item(this.selected.size > 1 ? `Exponer ${this.selected.size} dibujos desde el frame actual`
        : "Exponer en el frame actual", () => {
        const lv = doc.level;
        const numbers = lv.drawings.map((x) => x.number).filter((n) => this.selected.has(n));
        doc.exposeDrawings(lv.id, numbers.length ? numbers : [d.number], doc.layerId, doc.frame);
      });
      item("Duplicar", () => {
        const nuevo = doc.duplicateDrawing(d.number);
        if (nuevo) doc.setCell(doc.frame, nuevo.number);
      });
      item("Renumerar…", async () => {
        const n = await dzPromptModal(`Renumerar dibujo ${d.number}`, "nuevo número", String(d.number));
        if (n === null) return;
        const v = parseInt(n, 10);
        if (!v || v === d.number) return;
        if (!doc.renumberDrawing(d.number, v)) await dzNotice("Ese número ya está usado por otro dibujo.");
      });
      item("Borrar el dibujo", async () => {
        if (await dzConfirmModal(`¿Borrar el dibujo ${d.number}? Se vacían las celdas donde estaba expuesto.`, { ok: "Borrar", danger: true }))
          doc.deleteDrawing(d.number);
      });
      document.body.appendChild(m);
      const cerrar = () => { m.remove(); document.removeEventListener("pointerdown", cerrar); };
      setTimeout(() => document.addEventListener("pointerdown", cerrar), 0);
    }
  }

  animation.LevelStrip = LevelStrip;
})(window);
