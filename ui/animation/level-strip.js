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
      this._miniaturas = new Map();             // número de dibujo → { clave, el } (ver render)
      this._desuscribir = doc ? doc.subscribe((d, m) => {
        // se redibuja con lo que la afecta, no con cada movimiento del frame
        if (m === "frame") this._soloActual();
        else if (m === "level" || m === "cells" || m === "content" || m === "palette")
          this.render();
      }) : null;
    }
    setDoc(doc) {
      if (this._desuscribir) this._desuscribir();
      this.doc = doc;
      this._desuscribir = doc ? doc.subscribe((d, m) => (m === "frame" ? this._soloActual() : this.render())) : null;
      this.render();
    }
    /** Cambio de cuadro: lo único que cambia en la tira es cuál dibujo está
     *  «actual». Rearmarla entera (miniaturas incluidas) costaba ~4 ms POR
     *  CUADRO y en reproducción eso se come el tiempo del cuadro. Si cambió el
     *  nivel, ahí sí se rearma. */
    _soloActual() {
      const doc = this.doc, lv = doc && doc.level;
      if (!this.host || !doc || (lv ? lv.id : null) !== this._nivelPintado) return this.render();
      const actual = doc.cell;
      let nuevo = null;
      this.host.querySelectorAll(".ls2-item").forEach((el) => {
        const es = +el.dataset.num === actual;
        el.classList.toggle("actual", es);
        if (es) nuevo = el;
      });
      if (nuevo && nuevo !== this._actualPintado && global.LOW && global.LOW.core && global.LOW.core.scrollDentro)
        global.LOW.core.scrollDentro(nuevo, { limite: this.host });
      this._actualPintado = nuevo;
    }
    dispose() { if (this._desuscribir) this._desuscribir(); if (this.host) this.host.innerHTML = ""; }

    /** La miniatura de un dibujo: la que ya estaba si el dibujo no cambió
     *  (la clave es el contenido mismo, así que no hay caché que se
     *  desincronice). Rearmarlas todas era parsear el nivel entero en cada
     *  trazo, dos veces («cells» y «content»): medido en una sesión larga
     *  (v3.57), ~100 ms de bloqueo al apoyar el lápiz con 12 dibujos cargados,
     *  y creciendo con el documento. */
    _miniatura(d, hojaPal) {
      const doc = this.doc;
      const clave = { vacio: d.isEmpty(), w: doc.scene.width, h: doc.scene.height, hoja: hojaPal, content: d.content };
      const previa = this._miniaturas.get(d.number), p = previa && previa.clave;
      if (p && p.vacio === clave.vacio && p.w === clave.w && p.h === clave.h && p.hoja === clave.hoja && p.content === clave.content) return previa;
      const el = document.createElement("div");
      el.className = "ls2-thumb";
      // el propio SVG del dibujo, escalado
      el.innerHTML = clave.vacio
        ? ""
        : `<svg viewBox="0 0 ${doc.scene.width} ${doc.scene.height}"
                preserveAspectRatio="xMidYMid meet">${
                  hojaPal ? `<style>${hojaPal}</style>` : ""}${d.content}</svg>`;
      return { clave, el };
    }
    _contexto() {
      const doc = this.doc, lv = doc.level;
      // la miniatura lleva la hoja de la paleta: si no, mostraria el color
      // literal que quedo guardado y no el que el estilo dice hoy
      const hojaPal = (animation.palette && lv && doc.scene.levelPalette)
        ? animation.palette.css(doc.scene.levelPalette(lv.id)) : "";
      const expuestos = new Set();
      for (const ly of doc.scene.layers) {
        if (lv && ly.levelId === lv.id) ly.cells.forEach((c) => c != null && expuestos.add(c));
      }
      return { lv, hojaPal, expuestos, actual: doc.cell };
    }
    _clase(d, actual, expuestos) {
      return "ls2-item" + (d.number === actual ? " actual" : "") + (this.selected.has(d.number) ? " selected" : "")
        + (expuestos.has(d.number) ? "" : " suelto");
    }
    _titulo(d, expuestos) {
      return expuestos.has(d.number)
        ? `Dibujo ${d.number} · clic: ir a donde está expuesto`
        : `Dibujo ${d.number} · NO está expuesto en ninguna celda`;
    }
    /** EN EL LUGAR: si el nivel y sus dibujos son los mismos objetos de la
     *  última vez (lo normal al dibujar), sólo se tocan clases, títulos y la
     *  miniatura del dibujo que cambió. Rearmar la tira, aun reusando las
     *  miniaturas, obligaba al navegador a recalcular los estilos de todos
     *  sus SVG al volver a insertarlos. Si cambió algo de forma (otro nivel,
     *  dibujos agregados, quitados o renumerados), false: se rearma. */
    _enElLugar() {
      const P = this._pintado, doc = this.doc, lv = doc.level;
      if (!P || !lv || P.lv !== lv || P.nombre !== lv.name || !P.box.isConnected || !this.host.contains(P.box)) return false;
      if (P.dibujos.length !== lv.drawings.length || lv.drawings.some((d, i) => d !== P.dibujos[i] || d.number !== P.numeros[i])) return false;
      const { hojaPal, expuestos, actual } = this._contexto();
      const miniaturas = new Map();
      let act = null;
      for (const d of lv.drawings) {
        const c = P.celdas.get(d.number);
        const clase = this._clase(d, actual, expuestos);
        if (c.cel.className.replace(/ dragging/, "") !== clase) c.cel.className = clase + (c.cel.classList.contains("dragging") ? " dragging" : "");
        const titulo = this._titulo(d, expuestos);
        if (c.cel.title !== titulo) c.cel.title = titulo;
        const m = this._miniatura(d, hojaPal);
        if (m.el !== c.mini) { c.cel.replaceChild(m.el, c.mini); c.mini = m.el; }
        miniaturas.set(d.number, m);
        if (d.number === actual) act = c.cel;
      }
      this._miniaturas = miniaturas;
      // mover el scroll obliga a medir la página: sólo si cambió cuál es el actual
      if (act && act !== this._actualPintado && global.LOW && global.LOW.core && global.LOW.core.scrollDentro)
        global.LOW.core.scrollDentro(act, { limite: this.host });
      this._actualPintado = act;
      return true;
    }

    render() {
      if (!this.host || !this.doc) return;
      if (this._enElLugar()) return;
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
        doc.createBlankDrawing();
      };
      head.appendChild(nuevo);
      box.appendChild(head);

      const tira = document.createElement("div");
      tira.className = "ls2-strip";
      const { hojaPal, expuestos, actual } = this._contexto();

      // las de otro nivel no sirven: se descartan al cambiar de nivel
      if ((lv ? lv.id : null) !== this._nivelMiniaturas) this._miniaturas = new Map();
      const miniaturas = new Map(), celdas = new Map();
      for (const d of (lv ? lv.drawings : [])) {
        const cel = document.createElement("div");
        cel.className = this._clase(d, actual, expuestos);
        cel.dataset.num = d.number;
        cel.title = this._titulo(d, expuestos);

        const m = this._miniatura(d, hojaPal), mini = m.el;
        miniaturas.set(d.number, m);
        celdas.set(d.number, { cel, mini });
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
      this._miniaturas = miniaturas;            // sólo las de los dibujos que existen
      this._nivelMiniaturas = lv ? lv.id : null;
      // lo que se pintó, para la próxima vez poder actualizar en el lugar
      this._pintado = lv ? { lv, nombre: lv.name, box, dibujos: lv.drawings.slice(),
        numeros: lv.drawings.map((d) => d.number), celdas } : null;
      const act = tira.querySelector(".ls2-item.actual");
      this._nivelPintado = lv ? lv.id : null;
      this._actualPintado = act;
      // sólo dentro de la tira: scrollIntoView arrastraba el panel lateral entero
      if (act && (global.LOW && global.LOW.core && global.LOW.core.scrollDentro)) global.LOW.core.scrollDentro(act, { limite: this.host });
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
        doc.createBlankDrawing(true, d.number);
      });
      item("Renumerar…", async () => {
        const n = await dzPromptModal(`Renumerar dibujo ${d.number}`, "nuevo número", String(d.number));
        if (n === null) return;
        const v = Number(n);
        if (!Number.isSafeInteger(v) || v < 1) { await dzNotice("Usá un número entero positivo para el dibujo."); return; }
        if (v === d.number) return;
        if (!doc.renumberDrawing(d.number, v)) await dzNotice("Ese número ya está usado o el dibujo pertenece a una capa bloqueada.");
      });
      item("Borrar el dibujo", async () => {
        if (await dzConfirmModal(`¿Borrar el dibujo ${d.number}? Se vacían las celdas donde estaba expuesto.`, { ok: "Borrar", danger: true }))
          if (!doc.deleteDrawing(d.number)) await dzNotice("El dibujo está protegido por una capa bloqueada.");
      });
      document.body.appendChild(m);
      /* El clic DENTRO del menú no lo cierra. Reportado en v3.1.0: «los dibujos
         del nivel no se borran». MEDIDO: el pointerdown del propio clic sobre
         «Borrar el dibujo» cerraba el menú, el botón desaparecía antes de su
         click y NINGÚN ítem hacía nada (Exponer, Duplicar, Renumerar, Borrar). */
      const cerrar = (ev) => {
        if (ev && ev.target && m.contains(ev.target)) return;
        m.remove(); document.removeEventListener("pointerdown", cerrar);
      };
      setTimeout(() => document.addEventListener("pointerdown", cerrar), 0);
    }
  }

  animation.LevelStrip = LevelStrip;
})(window);
