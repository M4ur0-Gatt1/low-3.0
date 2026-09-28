function dzBuildInspector(el) {
  const tag = el.tagName.toLowerCase();
  const P = $("#dzProps");
  const isText = tag === "text" || tag === "tspan";
  let html = `<div class="dz-tag">&lt;${tag}&gt;</div>`;
  // alinear respecto del lienzo
  html += `<div class="dz-field"><label>Alinear al lienzo</label><div class="dz-alignrow">` +
    `<span class="dz-al" data-al="l" title="Izquierda">⇤</span>` +
    `<span class="dz-al" data-al="ch" title="Centro horizontal">↔</span>` +
    `<span class="dz-al" data-al="r" title="Derecha">⇥</span>` +
    `<span class="dz-al" data-al="t" title="Arriba">⤒</span>` +
    `<span class="dz-al" data-al="cv" title="Centro vertical">↕</span>` +
    `<span class="dz-al" data-al="b" title="Abajo">⤓</span>` +
    `</div></div>`;
  html += `<div class="dz-field"><label>Voltear</label><div class="dz-alignrow">` +
    `<span class="dz-al" data-flip="h" title="Voltear horizontal">⇋</span>` +
    `<span class="dz-al" data-flip="v" title="Voltear vertical">⇵</span>` +
    `</div></div>`;
  if ((DZ.multi || []).length > 1) {
    html += `<div class="dz-field"><label> Entre los ${DZ.multi.length} seleccionados</label><div class="dz-alignrow">` +
      `<span class="dz-al" data-alsel="l" title="Izquierdas juntas">⇤</span>` +
      `<span class="dz-al" data-alsel="ch" title="Centros verticales">↔</span>` +
      `<span class="dz-al" data-alsel="r" title="Derechas juntas">⇥</span>` +
      `<span class="dz-al" data-alsel="t" title="Arribas juntas">⤒</span>` +
      `<span class="dz-al" data-alsel="cv" title="Centros horizontales">↕</span>` +
      `<span class="dz-al" data-alsel="b" title="Abajos juntas">⤓</span>` +
      `</div><div class="dz-alignrow" style="margin-top:4px">` +
      `<span class="dz-al" data-dist="h" title="Distribuir horizontal (3+)">⇹</span>` +
      `<span class="dz-al" data-dist="v" title="Distribuir vertical (3+)">⇳</span>` +
      `</div></div>`;
  }
  // color de relleno y trazo (picker + texto para aceptar none/hex/nombre)
  html += `<div class="dz-field"><label>Relleno (fill)</label><div class="dz-row">` +
    `<input id="dzFillC" type="color" value="${dzHex(dzGet(el, "fill", "fill"))}" style="width:44px">` +
    `<input id="dzFill" type="text" value="${dzGet(el, "fill", "fill")}" style="flex:1"></div></div>`;
  html += `<div class="dz-field"><label>Trazo (stroke)</label><div class="dz-row">` +
    `<input id="dzStrokeC" type="color" value="${dzHex(dzGet(el, "stroke", "stroke"))}" style="width:44px">` +
    `<input id="dzStroke" type="text" value="${dzGet(el, "stroke", "stroke")}" style="flex:1"></div></div>`;
  html += `<div class="dz-row">` +
    dzField("Grosor trazo", "dzSW", dzGet(el, "stroke-width", ""), "number") +
    dzField("Opacidad", "dzOp", dzGet(el, "opacity", "opacity"), "number") + `</div>`;
  // multiplano: profundidad respecto de la cámara (0 = plano de acción,
  // positivo = fondo lejano se mueve menos, negativo = primer plano más rápido)
  html += `<div class="dz-row">` +
    dzField("Profundidad Z 🎬", "dzZ", el.getAttribute("data-z") || "", "number") +
    `<div class="dz-field"><label>&nbsp;</label><div class="dz-hint">0=acción · +lejos · −cerca</div></div></div>`;
  if (isText) {
    html += `<div class="dz-field"><label>Texto</label><input id="dzText" type="text" value="${(el.textContent || "").replace(/"/g, "&quot;")}"></div>`;
    const fam = dzGet(el, "font-family", "fontFamily").replace(/["']/g, "");
    html += `<div class="dz-field"><label>Tipografía</label><select id="dzFont">` +
      DZ_FONTS.map(f => `<option ${fam.indexOf(f) === 0 ? "selected" : ""}>${f}</option>`).join("") +
      `</select></div>`;
    html += `<div class="dz-row">` +
      dzField("Tamaño", "dzFS", parseFloat(dzGet(el, "font-size", "fontSize")) || "", "number") +
      `<div class="dz-field"><label>Peso</label><select id="dzFW">` +
      ["normal", "bold", "300", "400", "500", "600", "700", "800", "900"].map(w =>
        `<option ${String(dzGet(el, "font-weight", "fontWeight")) === w ? "selected" : ""}>${w}</option>`).join("") +
      `</select></div></div>`;
    const anc = dzGet(el, "text-anchor", "") || "start";
    html += `<div class="dz-field"><label>Alineación del texto</label><div class="dz-alignrow">` +
      `<span class="dz-al${anc === "start" ? " on" : ""}" data-anchor="start" title="Izquierda">⤆</span>` +
      `<span class="dz-al${anc === "middle" ? " on" : ""}" data-anchor="middle" title="Centrado">☰</span>` +
      `<span class="dz-al${anc === "end" ? " on" : ""}" data-anchor="end" title="Derecha">⤇</span>` +
      `<span class="dz-al${dzGet(el, "font-style", "") === "italic" ? " on" : ""}" data-italic="1" title="Cursiva"><i>I</i></span>` +
      `</div></div>`;
    html += `<div class="dz-field"><label>Pares sugeridos</label><div class="dz-suggest">` +
      DZ_PAIRS.map((p, i) => `<span class="dz-chip" data-pair="${i}">${p[0]} / ${p[1]}</span>`).join("") +
      `</div><div class="dz-hint">Aplica la tipografía de título al elemento.</div></div>`;
  }
  // posición: x/y (rect,text) o cx/cy (circle,ellipse)
  if (el.hasAttribute("x") || el.hasAttribute("y"))
    html += `<div class="dz-row">` + dzField("X", "dzX", dzGet(el, "x", ""), "number") +
      dzField("Y", "dzY", dzGet(el, "y", ""), "number") + `</div>`;
  else if (el.hasAttribute("cx") || el.hasAttribute("cy"))
    html += `<div class="dz-row">` + dzField("Centro X", "dzCX", dzGet(el, "cx", ""), "number") +
      dzField("Centro Y", "dzCY", dzGet(el, "cy", ""), "number") + `</div>`;
  if (el.hasAttribute("width") || el.hasAttribute("height"))
    html += `<div class="dz-row">` + dzField("Ancho", "dzW", dzGet(el, "width", ""), "number") +
      dzField("Alto", "dzH", dzGet(el, "height", ""), "number") + `</div>`;
  if (tag === "line")
    html += `<div class="dz-row">` + dzField("X1", "dzX1", dzGet(el, "x1", ""), "number") +
      dzField("Y1", "dzY1", dzGet(el, "y1", ""), "number") + `</div>` +
      `<div class="dz-row">` + dzField("X2", "dzX2", dzGet(el, "x2", ""), "number") +
      dzField("Y2", "dzY2", dzGet(el, "y2", ""), "number") + `</div>`;
  P.innerHTML = html; P.hidden = false; $("#dzEmpty").hidden = true;
  dzWire(el, isText);
  window.dzFormaPincelInspector?.(el, P);
}


function dzWire(el, isText) {
  // A focused field is not an edit. Consecutive input events belong to one
  // intention, closed by change/blur; each successful edit reaches LowDoc.
  const on = (id, fn) => {
    const input = $("#" + id); if (!input) return;
    let entry = null;
    const reset = () => { entry = null; };
    input.addEventListener('change', reset); input.addEventListener('blur', reset);
    const ranges = {dzSW:[0,Infinity],dzOp:[0,1],dzW:[0,Infinity],dzH:[0,Infinity],dzFS:[0,Infinity]};
    if(ranges[id]) { input.min=ranges[id][0]; if(Number.isFinite(ranges[id][1])) input.max=ranges[id][1]; }
    if(input.type==='number') input.step='any';
    input.addEventListener('input', event => {
      if(!el.isConnected || DZ.sel!==el) return;
      if(input.type==='number' && (input.validity.badInput || (input.value && !Number.isFinite(+input.value)))) return;
      if(ranges[id] && input.value && (+input.value<ranges[id][0] || +input.value>ranges[id][1])) return;
      const before=dzDrawingEditBegin(); fn(event); const after=dzDrawingEditCapture();
      if(before===after) return;
      entry=dzDrawingEditRecord(before,'Editar propiedad',after,entry);
      dzPositionHandle();
    });
  };
  on("dzFill", e => { dzSet(el, "fill", e.target.value); const c = $("#dzFillC"); if (c) c.value = dzHex(e.target.value); });
  on("dzFillC", e => { dzSet(el, "fill", e.target.value); $("#dzFill").value = e.target.value; });
  on("dzStroke", e => { dzSet(el, "stroke", e.target.value); const c = $("#dzStrokeC"); if (c) c.value = dzHex(e.target.value); });
  on("dzStrokeC", e => { dzSet(el, "stroke", e.target.value); $("#dzStroke").value = e.target.value; });
  on("dzSW", e => dzSet(el, "stroke-width", e.target.value));
  on("dzOp", e => dzSet(el, "opacity", e.target.value));
  on("dzZ", e => dzSet(el, "data-z", e.target.value));
  on("dzX", e => dzSet(el, "x", e.target.value));
  on("dzY", e => dzSet(el, "y", e.target.value));
  on("dzCX", e => dzSet(el, "cx", e.target.value));
  on("dzCY", e => dzSet(el, "cy", e.target.value));
  on("dzW", e => dzSet(el, "width", e.target.value));
  on("dzH", e => dzSet(el, "height", e.target.value));
  on("dzX1", e => dzSet(el, "x1", e.target.value));
  on("dzY1", e => dzSet(el, "y1", e.target.value));
  on("dzX2", e => dzSet(el, "x2", e.target.value));
  on("dzY2", e => dzSet(el, "y2", e.target.value));
  document.querySelectorAll("#dzProps .dz-al").forEach(b => b.onclick = () => {
    if (b.dataset.al) dzAlign(b.dataset.al);
    else if (b.dataset.flip) dzFlip(b.dataset.flip);
    else if (b.dataset.alsel) dzAlignSel(b.dataset.alsel);
    else if (b.dataset.dist) dzDistribute(b.dataset.dist);
    else if (b.dataset.anchor) { const before=dzDrawingEditBegin(); dzSet(el, "text-anchor", b.dataset.anchor);
      dzDrawingEditRecord(before,'Alinear texto'); dzBuildInspector(el); dzPositionHandle(); }
    else if (b.dataset.italic) { const before=dzDrawingEditBegin();
      dzSet(el, "font-style", dzGet(el, "font-style", "") === "italic" ? "" : "italic");
      dzDrawingEditRecord(before,'Cambiar cursiva'); dzBuildInspector(el); dzPositionHandle(); }
  });
  if (isText) {
    on("dzText", e => { el.textContent = e.target.value; });
    on("dzFont", e => dzSet(el, "font-family", e.target.value));
    on("dzFS", e => dzSet(el, "font-size", e.target.value));
    on("dzFW", e => dzSet(el, "font-weight", e.target.value));
    document.querySelectorAll("#dzProps .dz-chip").forEach(ch => ch.onclick = () => {
      const pair = DZ_PAIRS[+ch.dataset.pair];
      const before=dzDrawingEditBegin();
      dzSet(el, "font-family", pair[0]);
      const sel = $("#dzFont"); if (sel) sel.value = DZ_FONTS.includes(pair[0]) ? pair[0] : sel.value;
      dzDrawingEditRecord(before,'Cambiar tipografía'); dzPositionHandle();
    });
  }
}

