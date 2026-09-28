/* Color Studio — edición profesional de estilos de escena. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));

  class PaletteView {
    constructor(host, doc, opts = {}) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.doc = doc; this.onPick = opts.onPick || null; this.current = opts.current || null;
      this.target = opts.target === "paint" ? "paint" : "ink";
      this.currents = { ink: opts.currents?.ink || this.current, paint: opts.currents?.paint || null };
      this._editing = false; this._before = null; this._opacityBefore = null;
      this.storage = global.LOW?.safeMode?.preferenceStorage || global.localStorage;
      try { this.recent = JSON.parse(this.storage?.getItem("low.color.recent.v1") || "[]"); } catch (_) { this.recent = []; }
      this._sub(doc);
    }
    _sub(doc) {
      if (this._desuscribir) this._desuscribir();
      this._desuscribir = doc ? doc.subscribe((_d, reason) => {
        if (!/^(palette|content|level|layer)$/.test(reason)) return;
        if (this._editing && reason === "palette") return this._syncEditor();
        this.render();
      }) : null;
    }
    setDoc(doc) { this.doc = doc; this._sub(doc); this.render(); }
    dispose() { if (this._desuscribir) this._desuscribir(); if (this.host) this.host.innerHTML = ""; }
    activo() { const p = this.doc?.palette; return p ? (p.byIndex(this.current) || p.styles[0] || null) : null; }
    setTarget(target) {
      this.currents[this.target] = this.current;
      this.target = target === "paint" ? "paint" : "ink";
      this.current = this.currents[this.target] || this.current;
      const st = this.activo(); if (st && this.onPick) this.onPick(st, this.target); this.render();
    }
    setCurrent(index) {
      const st = this.doc?.palette?.byIndex(index); if (!st) return false;
      this.current = st.index; this.currents[this.target] = st.index;
      if (this.onPick) this.onPick(st, this.target); this.render(); return true;
    }
    _color(hex, commit = false) {
      const st = this.activo(), P = animation.palette, next = P.normColor(hex);
      if (!st || !/^#[0-9a-f]{6}$/i.test(next) || this.doc.palette.locked) return false;
      if (this._before == null) this._before = st.color;
      const previous = this._before;
      this._editing = !commit; this.doc.setStyleColor(st.index, next, commit, this._before);
      if (commit) { this._remember(previous); this._remember(next); this._editing = false; this._before = null; }
      if (this.onPick) this.onPick(st, this.target); this._syncEditor(); return true;
    }
    _syncEditor() {
      const st = this.activo(), P = animation.palette; if (!st || !this.host) return;
      const rgb = P.hexToRgb(st.color), hsv = P.hexToHsv(st.color);
      const set = (q, value) => { const n = this.host.querySelector(q); if (n) n.value = value; };
      set("[data-color-hex]", st.color.toUpperCase());
      if (rgb) { set('[data-channel="r"]', rgb.r); set('[data-channel="g"]', rgb.g); set('[data-channel="b"]', rgb.b); }
      if (hsv) {
        set('[data-channel="h"]', Math.round(hsv.h)); set('[data-channel="s"]', Math.round(hsv.s)); set('[data-channel="v"]', Math.round(hsv.v)); set("[data-hue]", Math.round(hsv.h));
        const spectrum = this.host.querySelector(".pal2-spectrum"); if (spectrum) spectrum.style.setProperty("--hue", `hsl(${hsv.h} 100% 50%)`);
        const cursor = this.host.querySelector(".pal2-cursor"); if (cursor) { cursor.style.left = hsv.s + "%"; cursor.style.top = (100 - hsv.v) + "%"; }
      }
      const preview = this.host.querySelector(".pal2-preview"); if (preview) preview.style.background = st.color;
      const swatch = this.host.querySelector(`.pal2-item[data-index="${st.index}"] .pal2-sw`); if (swatch) swatch.style.background = st.color;
      const opacity=this.host.querySelector("[data-style-opacity]");if(opacity)opacity.value=Math.round(st.opacity*100);
      const opacityOut=this.host.querySelector("[data-style-opacity-out]");if(opacityOut)opacityOut.textContent=Math.round(st.opacity*100)+"%";
    }
    _opacity(value, commit=false) {
      const st=this.activo();if(!st||this.doc.palette.locked)return false;
      if(this._opacityBefore==null)this._opacityBefore=st.opacity;
      this._editing=!commit;this.doc.setStyleOpacity(st.index,clamp(value,0,100)/100,commit,this._opacityBefore);
      if(commit){this._editing=false;this._opacityBefore=null;}this._syncEditor();return true;
    }
    _remember(color) {
      const value = animation.palette.normColor(color);
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      this.recent = [value, ...(this.recent || []).filter((c) => c !== value)].slice(0, 8);
      try { this.storage?.setItem("low.color.recent.v1", JSON.stringify(this.recent)); } catch (_) { /* opcional */ }
    }
    async _importFile(file) {
      if (!file || this.doc?.palette?.locked) return 0;
      const colors = animation.palette.parsePaletteFile(file.name, await file.arrayBuffer());
      if (!colors.length) { this._notice("El archivo no contiene colores compatibles"); return 0; }
      const pal=this.doc.palette, history=this.doc.history, ownTx=!!history&&!history.transaction, group=file.name.replace(/\.[^.]+$/,""); let added=0;
      if (ownTx) history.begin(`Importar paleta ${file.name}`);
      for (const entry of colors) {
        if (pal.byColor(entry.color)) continue;
        let name=(entry.name||`Color ${pal.nextIndex()}`).trim(), suffix=2;
        while (pal.styleByName(name)) name=`${entry.name||"Color"} ${suffix++}`;
        const created=this.doc.addStyle(entry.color,name);if(created){this.doc.setStyleGroup(created.index,group);added++;}
      }
      if (ownTx) history.commit();
      this._notice(added ? `${added} colores importados de ${file.name}` : "Todos esos colores ya estaban en la paleta");
      return added;
    }
    _exportGpl() {
      const text=animation.palette.exportGPL(this.doc?.palette), blob=new Blob([text],{type:"text/plain;charset=utf-8"}), url=URL.createObjectURL(blob), a=document.createElement("a");
      a.href=url;a.download=(this.doc?.palette?.name||"paleta").replace(/[^a-z0-9_-]+/gi,"-")+".gpl";a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
      this._notice("Paleta GPL exportada para Photoshop, Krita y GIMP");
    }
    _channelChange(input) {
      const P = animation.palette; if (!this.activo()) return;
      if (/^[rgb]$/.test(input.dataset.channel)) {
        const v = {}; this.host.querySelectorAll('[data-channel="r"],[data-channel="g"],[data-channel="b"]').forEach((n) => v[n.dataset.channel] = clamp(n.value, 0, 255));
        this._color(P.rgbToHex(v.r, v.g, v.b), true);
      } else {
        const v = {}; this.host.querySelectorAll('[data-channel="h"],[data-channel="s"],[data-channel="v"]').forEach((n) => v[n.dataset.channel] = clamp(n.value, 0, n.dataset.channel === "h" ? 359 : 100));
        this._color(P.hsvToHex(v.h, v.s, v.v), true);
      }
    }
    render() {
      if (!this.host || !this.doc) return;
      const doc = this.doc, P = animation.palette, pal = doc.palette; if (!pal) return this.host.replaceChildren();
      if (!pal.byIndex(this.current)) this.current = pal.styles[0]?.index || null;
      this.currents[this.target] = this.current;
      const st = this.activo(), usage = P.usage(doc.scene, pal), orphans = P.orphans(doc.scene, pal);
      const box = el("div", "pal2 color-studio" + (pal.locked ? " bloqueada" : ""));
      const head = el("header", "pal2-head"), title = el("div", "pal2-title"), name = el("b", "pal2-name", pal.name);
      name.title = "Doble clic para renombrar"; name.ondblclick = async () => { const n = await dzPromptModal("Nombre de la paleta", "nombre", pal.name); if (n?.trim()) { pal.name = n.trim(); doc.touch(); doc.emit("palette"); } };
      title.append(name, el("small", "", "Estilos vinculados a toda la escena"));
      const actions = el("div", "pal2-actions"), adopt = el("button", "pal2-btn", "Adoptar"), add = el("button", "pal2-btn primary", "+ Estilo");
      adopt.title = "Convertir colores literales en estilos editables"; adopt.onclick = () => { const r = doc.adoptColors(); this._notice(r?.elementos ? `${r.elementos} elementos vinculados` : "La escena ya está vinculada"); };
      add.onclick = () => { const n = doc.addStyle(st?.color || "#000000"); if (n) this.setCurrent(n.index); }; add.disabled = adopt.disabled = pal.locked;
      actions.append(adopt, add); head.append(title, actions); box.append(head);

      const filebar=el("div","pal2-filebar"), importButton=el("button","","Importar ASE / ACO / GPL"), exportButton=el("button","","Exportar GPL"), picker=el("input","");
      picker.type="file";picker.accept=".ase,.aco,.gpl,.json,.lowpalette";picker.hidden=true;picker.onchange=async()=>{await this._importFile(picker.files?.[0]);picker.value="";};
      importButton.disabled=pal.locked;importButton.onclick=()=>picker.click();exportButton.onclick=()=>this._exportGpl();filebar.append(importButton,exportButton,picker);box.appendChild(filebar);

      const targets = el("div", "pal2-targets"); targets.setAttribute("aria-label", "Destino del color");
      [["ink", "Línea"], ["paint", "Pintura"]].forEach(([id, label]) => { const b = el("button", this.target === id ? "active" : "", label); b.dataset.target = id; b.onclick = () => this.setTarget(id); targets.appendChild(b); });
      box.appendChild(targets);
      if (st) {
        const editor = el("section", "pal2-editor"), spectrum = el("div", "pal2-spectrum"); spectrum.tabIndex = pal.locked ? -1 : 0;
        spectrum.setAttribute("role", "slider"); spectrum.setAttribute("aria-label", "Saturación y valor"); spectrum.appendChild(el("i", "pal2-cursor"));
        const fromPointer = (e, commit) => { const r = spectrum.getBoundingClientRect(), hsv = P.hexToHsv(this.activo().color); this._color(P.hsvToHex(hsv.h, clamp((e.clientX-r.left)/r.width*100,0,100), 100-clamp((e.clientY-r.top)/r.height*100,0,100)), commit); };
        spectrum.onpointerdown = (e) => { if (pal.locked) return; spectrum.setPointerCapture(e.pointerId); fromPointer(e, false); spectrum.onpointermove = (m) => fromPointer(m, false); spectrum.onpointerup = (u) => { spectrum.onpointermove = null; fromPointer(u, true); }; };
        const hue = el("input", "pal2-hue"); hue.type = "range"; hue.min = 0; hue.max = 359; hue.dataset.hue = ""; hue.disabled = pal.locked;
        hue.oninput = () => { const x = P.hexToHsv(this.activo().color); this._color(P.hsvToHex(hue.value, x.s, x.v), false); };
        hue.onchange = () => { const x = P.hexToHsv(this.activo().color); this._color(P.hsvToHex(hue.value, x.s, x.v), true); }; editor.append(spectrum, hue);
        const readout = el("div", "pal2-readout"); readout.appendChild(el("i", "pal2-preview"));
        const hex = el("input", "pal2-hex"); hex.dataset.colorHex = ""; hex.maxLength = 7; hex.spellcheck = false; hex.disabled = pal.locked; hex.setAttribute("aria-label", "Color hexadecimal"); hex.onchange = () => this._color(hex.value.startsWith("#") ? hex.value : "#" + hex.value, true);
        readout.append(hex, el("span", "pal2-gamut", "sRGB")); editor.appendChild(readout);
        const channels = el("div", "pal2-channels");
        [["r","R",255],["g","G",255],["b","B",255],["h","H",359],["s","S",100],["v","V",100]].forEach(([id,label,max]) => { const wrap = el("label", ""); wrap.appendChild(el("span", "", label)); const input = el("input", ""); input.type="number"; input.min=0; input.max=max; input.dataset.channel=id; input.disabled=pal.locked; input.onchange=()=>this._channelChange(input); wrap.appendChild(input); channels.appendChild(wrap); });
        editor.appendChild(channels);
        const opacity=el("label","pal2-opacity");opacity.appendChild(el("span","","Opacidad"));const opacityRange=el("input","");opacityRange.type="range";opacityRange.min=0;opacityRange.max=100;opacityRange.dataset.styleOpacity="";opacityRange.disabled=pal.locked;opacityRange.oninput=()=>this._opacity(opacityRange.value,false);opacityRange.onchange=()=>this._opacity(opacityRange.value,true);const opacityOut=el("output","","100%");opacityOut.dataset.styleOpacityOut="";opacity.append(opacityRange,opacityOut);editor.appendChild(opacity);
        const harmony = el("div", "pal2-harmonies"); harmony.appendChild(el("span", "pal2-section-label", "Armonía")); const row = el("div", "pal2-harmony-row");
        P.harmonies(st.color).forEach((h) => { const b = el("button", ""); b.style.background=h.color; b.title=`${h.name} · ${h.color}`; b.disabled=pal.locked; b.onclick=()=>this._color(h.color,true); row.appendChild(b); }); harmony.appendChild(row); editor.appendChild(harmony);
        if (this.recent?.length) { const recent=el("div","pal2-recent"); recent.appendChild(el("span","pal2-section-label","Recientes")); const recentRow=el("div","pal2-recent-row"); this.recent.forEach((color)=>{const b=el("button","");b.style.background=color;b.title=color.toUpperCase();b.disabled=pal.locked;b.onclick=()=>this._color(color,true);recentRow.appendChild(b);});recent.appendChild(recentRow);editor.appendChild(recent); }
        box.appendChild(editor);
      }
      const library = el("section", "pal2-library"), libraryHead = el("div", "pal2-library-head"); libraryHead.append(el("span", "pal2-section-label", `Estilos · ${pal.styles.length}`), el("small", "", "uso en escena")); library.appendChild(libraryHead);
      const filters=el("div","pal2-filterbar"),search=el("input","pal2-search"),groupFilter=el("select","pal2-group-filter");search.type="search";search.placeholder="Buscar estilos";search.setAttribute("aria-label","Buscar estilos");groupFilter.setAttribute("aria-label","Filtrar por grupo");groupFilter.appendChild(new Option("Todos los grupos",""));[...new Set(pal.styles.map(s=>s.meta?.group).filter(Boolean))].sort().forEach(g=>groupFilter.appendChild(new Option(g,g)));filters.append(search,groupFilter);library.appendChild(filters);
      const grid = el("div", "pal2-grid");
      pal.styles.forEach((style) => { const count = usage[style.index] || {ink:0,paint:0,total:0}; const item = el("button", "pal2-item"+(style.index===this.current?" actual":"")+(!count.total?" sinuso":"")); item.dataset.index=style.index;
        const sw = el("i", "pal2-sw"); sw.style.background=style.color; const copy=el("span","pal2-item-copy"); copy.append(el("b","",style.name||`Estilo ${style.index}`),el("small","",`${style.meta?.group?style.meta.group+" · ":""}#${style.index} · ${style.color.toUpperCase()}`)); const use=el("span","pal2-use",count.total?`${count.total}`:"—"); use.title=`${count.ink} líneas · ${count.paint} rellenos`;item.dataset.group=style.meta?.group||"";
        item.append(sw,copy,use); item.onclick=()=>this.setCurrent(style.index); item.ondblclick=async ()=>{ if(!pal.locked){const n=await dzPromptModal(`Nombre del estilo ${style.index}`,"nombre",style.name);if(n?.trim())doc.renameStyle(style.index,n.trim());}}; item.oncontextmenu=(e)=>{e.preventDefault();this._menu(e,style,count,pal);}; grid.appendChild(item); });
      const applyFilter=()=>{const term=search.value.trim().toLowerCase(),group=groupFilter.value;grid.querySelectorAll(".pal2-item").forEach((item)=>item.hidden=(!!term&&!item.textContent.toLowerCase().includes(term))||(!!group&&item.dataset.group!==group));};search.oninput=applyFilter;groupFilter.onchange=applyFilter;
      library.appendChild(grid); box.appendChild(library);
      if (orphans.length) box.appendChild(el("div", "pal2-orphans", `Referencias sin estilo: ${orphans.join(", ")}. Reasignalas desde el menú de un estilo.`));
      box.appendChild(el("footer", "pal2-foot", pal.locked ? "Paleta bloqueada" : "Clic derecho: duplicar, reasignar o borrar")); this.host.replaceChildren(box); this._syncEditor();
    }
    _notice(text) { const f=this.host.querySelector(".pal2-foot"); if(f)f.textContent=text; if(global.dzSetStatus)global.dzSetStatus(" "+text); }
    _menu(e, st, usage, pal) {
      document.querySelectorAll(".ls2-menu").forEach((n)=>n.remove()); const menu=el("div","ls2-menu"); menu.style.left=e.clientX+"px"; menu.style.top=e.clientY+"px";
      const action=(label,fn,disabled=false)=>{const b=el("button","",label);b.disabled=disabled;b.onclick=()=>{menu.remove();fn();};menu.appendChild(b);}; action("Usar este estilo",()=>this.setCurrent(st.index)); action("Duplicar",()=>{let name=st.name+" copia",i=2;while(pal.styleByName(name))name=st.name+` copia ${i++}`;const h=this.doc.history,tx=!!h&&!h.transaction;if(tx)h.begin("Duplicar estilo");const n=this.doc.addStyle(st.color,name);if(n&&st.meta?.group)this.doc.setStyleGroup(n.index,st.meta.group);if(tx)h.commit();if(n)this.setCurrent(n.index);},pal.locked);
      action(st.meta?.group?`Grupo: ${st.meta.group}…`:"Asignar a grupo…",async ()=>{const group=await dzPromptModal("Grupo del estilo","vacío para quitar",st.meta?.group||"");if(group!=null)this.doc.setStyleGroup(st.index,group);},pal.locked);
      const others=pal.styles.filter((s)=>s.index!==st.index); action(`Reasignar ${usage.total||0} usos…`,async ()=>{const n=await dzPromptModal("Reasignar usos","número del estilo de destino",String(others[0]?.index||""));if(n!=null)this._notice(`${this.doc.reassignStyle(st.index,parseInt(n,10))||0} elementos reasignados`);},!usage.total||!others.length||pal.locked); action("Borrar estilo",()=>this.doc.removeStyle(st.index)||this._notice("No puede borrarse mientras esté en uso"),usage.total||pal.locked);
      // STYLE-02: para un estilo EN USO, reasignar y borrar es una sola acción
      // reversible. Ofrecerlas por separado dejaba a mitad de camino cualquier
      // Ctrl+Z: el estilo volvía sin sus usos, o al revés.
      action(`Reasignar y borrar…`,async ()=>{const n=await dzPromptModal("Reasignar y borrar el estilo","número del estilo que se queda con los usos",String(others[0]?.index||""));if(n==null)return;const r=this.doc.replaceStyle(st.index,parseInt(n,10));this._notice(r.borrado?`${r.reasignados} usos reasignados y estilo borrado (un solo Ctrl+Z)`:"No pude reasignar y borrar ese estilo");},!usage.total||!others.length||pal.locked);
      document.body.appendChild(menu); const close=()=>{menu.remove();document.removeEventListener("pointerdown",close);};setTimeout(()=>document.addEventListener("pointerdown",close),0);
    }
  }
  animation.PaletteView = PaletteView;
})(window);
