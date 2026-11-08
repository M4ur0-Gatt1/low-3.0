/* ══════════════════════════════════════════════════════════════════════════
   MOVIMIENTO DE UNA CAPA ENTERA (la transformación de capa de Grease Pencil,
   el peg de Harmony)

   Pedido de Mauro (nov-2026, LOW 3.59): lo que Blender trae para 2D. Con esto
   una capa entera se mueve, gira y escala con claves —un fondo que se panea,
   un cartel que entra— y puede SEGUIR a otra capa: el vaso sigue a la capa de
   la mano, y la mano se anima sola.

   Clic derecho en la capa → «Movimiento de la capa…»: posición, giro y escala
   en el cuadro actual, poner o quitar la clave, el pivote y la capa padre.
   El dibujo no se toca: el movimiento se aplica al mostrar las otras capas,
   al reproducir y al exportar (animation/capas-en-mesa.js). La capa que se
   está dibujando se ve en su lugar propio, para que el lápiz caiga donde se
   apoya. Cada cambio es un paso de Ctrl+Z (document.js, _cambioMov).

   @module animation/movimiento-capa
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const animation = () => (global.LOW && global.LOW.animation) || {};
  const red = (v, n = 2) => +(+v).toFixed(n);

  function abrir(layerId) {
    const D = dz(), doc = D && D.doc, ly = doc && doc.scene.layer(layerId);
    if (!ly || typeof doc.ponerClaveMov !== "function" || typeof global.openModal !== "function") return false;
    const f = doc.frame;
    const v = animation().movEn ? animation().movEn(ly.mov, f) : { x: 0, y: 0, rot: 0, esc: 1 };
    const piv = ly.mov ? ly.mov.pivote : { x: 0, y: 0 };
    const w = doc.scene.width || 1920, h = doc.scene.height || 1080;
    global.openModal(`<h2>Movimiento de la capa</h2>
      <div class="sub">Mueve, gira y escala <b>la capa entera</b> con claves, sin tocar sus dibujos. Entre clave y clave el movimiento es parejo.
      Mientras dibujás en esta capa se ve en su lugar propio; las otras capas, la reproducción y la exportación la muestran movida.</div>
      <div class="sub" id="mcCapa"></div>
      <div class="dz-style-row">
        <span class="dz-hint">X</span><input type="number" id="mcX" class="dz-win" step="1" value="${red(v.x)}">
        <span class="dz-hint">Y</span><input type="number" id="mcY" class="dz-win" step="1" value="${red(v.y)}">
      </div>
      <div class="dz-style-row">
        <span class="dz-hint">Giro °</span><input type="number" id="mcRot" class="dz-win" step="1" value="${red(v.rot)}">
        <span class="dz-hint">Escala</span><input type="number" id="mcEsc" class="dz-win" step="0.05" min="0.01" value="${red(v.esc, 3)}">
      </div>
      <div class="dz-style-row">
        <span class="dz-hint">Pivote</span><input type="number" id="mcPx" class="dz-win" value="${red(piv.x)}"><input type="number" id="mcPy" class="dz-win" value="${red(piv.y)}">
        <button class="ghost" id="mcCentro" title="El centro de la hoja (${w / 2}, ${h / 2})">Centro</button>
      </div>
      <div class="dz-style-row">
        <span class="dz-hint">Sigue a</span><select id="mcPadre" class="langsel"></select>
      </div>
      <div class="dz-style-row">
        <span class="dz-hint">Mira a</span><select id="mcMira" class="langsel"></select>
      </div>
      <div class="sub" id="mcClaves"></div>
      <div class="m-actions">
        <button class="ghost" id="mcQuitarTodo">Quitar todo el movimiento</button>
        <button class="ghost" id="mcQuitar">Quitar la clave del cuadro ${f}</button>
        <button class="ghost" id="mCancel">Cerrar</button>
        <button class="primary" id="mcClave">Clave en el cuadro ${f}</button>
      </div>`);
    const $m = (s) => document.querySelector(s);
    $m("#mcCapa").textContent = "Capa «" + ly.name + "» · cuadro " + f;
    // las opciones se arman con textContent: los nombres vienen del archivo
    const sel = $m("#mcPadre");
    const ninguna = document.createElement("option"); ninguna.value = ""; ninguna.textContent = "(ninguna: se mueve sola)"; sel.appendChild(ninguna);
    for (const otra of doc.scene.layers) {
      if (otra.id === ly.id) continue;
      const o = document.createElement("option"); o.value = otra.id; o.textContent = otra.name;
      if (ly.mov && ly.mov.padre === otra.id) o.selected = true;
      sel.appendChild(o);
    }
    // los HUESOS del rig: la capa se pega al hueso (el vaso a la mano del personaje)
    const nodos = Object.values((doc.scene.rig && doc.scene.rig.nodes) || {});
    if (nodos.length) {
      const grupo = document.createElement("optgroup"); grupo.label = "Huesos del rig";
      for (const n of nodos) {
        const o = document.createElement("option"); o.value = "hueso:" + n.id; o.textContent = "Hueso: " + (n.name || n.id);
        if (ly.mov && ly.mov.padre === "hueso:" + n.id) o.selected = true;
        grupo.appendChild(o);
      }
      sel.appendChild(grupo);
    }
    // MIRA A: la capa gira hacia el pivote de otra
    const mira = $m("#mcMira");
    const nadie = document.createElement("option"); nadie.value = ""; nadie.textContent = "(nadie)"; mira.appendChild(nadie);
    for (const otra of doc.scene.layers) {
      if (otra.id === ly.id) continue;
      const o = document.createElement("option"); o.value = otra.id; o.textContent = otra.name;
      if (ly.mov && ly.mov.mirarA === otra.id) o.selected = true;
      mira.appendChild(o);
    }
    mira.onchange = () => {
      const otra = mira.value || null;
      if (doc.setMirarAMov(ly.id, otra)) avisar(otra ? "«" + ly.name + "» mira ahora a otra capa (gira sobre su pivote)" : "«" + ly.name + "» ya no mira a nadie");
      else if (otra) { avisar("No se puede: esa capa ya depende de «" + ly.name + "» (sería un círculo)"); mira.value = ly.mov && ly.mov.mirarA ? ly.mov.mirarA : ""; }
    };
    const claves = ly.mov ? Object.keys(ly.mov.claves).map(Number).sort((a, b) => a - b) : [];
    $m("#mcClaves").textContent = claves.length ? "Claves en los cuadros: " + claves.join(", ") : "Todavía no tiene claves.";
    $m("#mcQuitar").disabled = !(ly.mov && ly.mov.claves[f]);
    $m("#mcQuitarTodo").disabled = !ly.mov;
    $m("#mcCentro").onclick = () => { $m("#mcPx").value = w / 2; $m("#mcPy").value = h / 2; };
    const cerrar = () => global.closeModal();
    $m("#mCancel").onclick = cerrar;
    /** Pivote y padre se guardan junto con lo demás, en un solo Ctrl+Z por cosa cambiada. */
    const pivoteYPadre = () => {
      const px = Number($m("#mcPx").value) || 0, py = Number($m("#mcPy").value) || 0;
      if (!ly.mov || ly.mov.pivote.x !== px || ly.mov.pivote.y !== py) { if (ly.mov) doc.setPivoteMov(ly.id, px, py); else return { px, py }; }
      return null;
    };
    $m("#mcClave").onclick = () => {
      const valores = { x: Number($m("#mcX").value) || 0, y: Number($m("#mcY").value) || 0, rot: Number($m("#mcRot").value) || 0,
        esc: Math.max(0.01, Number($m("#mcEsc").value) || 1) };
      const padre = sel.value || null;
      const pendiente = pivoteYPadre();
      doc.ponerClaveMov(ly.id, f, valores);
      if (pendiente) doc.setPivoteMov(ly.id, pendiente.px, pendiente.py);
      if ((ly.mov ? ly.mov.padre : null) !== padre && !doc.setPadreMov(ly.id, padre))
        avisar("No se puede: esa capa ya sigue a «" + ly.name + "» (sería un círculo)");
      else avisar("Clave de movimiento de «" + ly.name + "» en el cuadro " + f + " · Ctrl+Z la saca");
      if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
      cerrar();
    };
    $m("#mcQuitar").onclick = () => { if (doc.quitarClaveMov(ly.id, f)) avisar("Clave del cuadro " + f + " quitada"); cerrar(); };
    $m("#mcQuitarTodo").onclick = () => { if (doc.quitarMov(ly.id)) avisar("«" + ly.name + "» volvió a su lugar · Ctrl+Z lo deshace"); cerrar(); };
    // cambiar sólo el padre (sin tocar claves): al elegir, se aplica
    sel.onchange = () => {
      const padre = sel.value || null;
      if (doc.setPadreMov(ly.id, padre)) avisar(padre ? "«" + ly.name + "» sigue ahora a otra capa" : "«" + ly.name + "» ya no sigue a ninguna capa");
      else if (padre) { avisar("No se puede: esa capa ya sigue a «" + ly.name + "» (sería un círculo)"); sel.value = ly.mov && ly.mov.padre ? ly.mov.padre : ""; }
    };
    return true;
  }

  const a = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  a.movimientoCapa = { abrir };
})(typeof window !== "undefined" ? window : globalThis);
