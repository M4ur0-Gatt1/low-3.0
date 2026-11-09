/* ══════════════════════════════════════════════════════════════════════════
   EL DIÁLOGO DE MODIFICADORES Y EFECTOS DE UNA CAPA

   Clic derecho en la capa → «Modificadores y efectos…». Una lista, en orden,
   de lo que cambia cómo se ve la capa sin tocar sus dibujos
   (animation/modificadores.js): se agregan, se configuran, se apagan y se
   quitan. Cada «Aplicar» es UN paso de Ctrl+Z (document.js, setLayerMods).
   Los textos que vienen del archivo se ponen con textContent.

   @module animation/modificadores-ui
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const M = () => global.LOW && global.LOW.animation && global.LOW.animation.modificadores;

  /** Qué se puede agregar y con qué valores arranca. */
  const CATALOGO = {
    tiempo: { nombre: "Tiempo (desfase, bucle, ida y vuelta)", nuevo: (doc) => ({ tipo: "tiempo", modo: "bucle", desfase: 0, desde: 1, hasta: Math.max(2, doc.layer ? doc.layer.lastFrame() : 24), fijo: 1 }) },
    temblor: { nombre: "Temblor de línea (boil)", nuevo: () => ({ tipo: "temblor", amplitud: 3, cada: 2, escala: 0.03, semilla: 1 }) },
    trazado: { nombre: "Se dibuja solo (build)", nuevo: (doc) => ({ tipo: "trazado", desde: doc.frame || 1, hasta: (doc.frame || 1) + 23 }) },
    desenfoque: { nombre: "Efecto: desenfoque", nuevo: () => ({ tipo: "desenfoque", radio: 4 }) },
    sombra: { nombre: "Efecto: sombra proyectada", nuevo: () => ({ tipo: "sombra", dx: 8, dy: 8, radio: 4, color: "#000000", opacidad: 0.5 }) },
    resplandor: { nombre: "Efecto: resplandor", nuevo: () => ({ tipo: "resplandor", radio: 10, color: "#ffd76a", intensidad: 0.8 }) },
    colorear: { nombre: "Efecto: colorear", nuevo: () => ({ tipo: "colorear", color: "#3a6ea5", cantidad: 1 }) },
  };
  /** Los campos de cada tipo: [clave, etiqueta, tipo de input, opciones]. */
  const CAMPOS = {
    tiempo: [["modo", "Modo", "select", [["normal", "Desfase"], ["bucle", "Bucle"], ["ida-vuelta", "Ida y vuelta"], ["invertido", "Al revés"], ["fijo", "Clavada en un cuadro"]]],
      ["desfase", "Desfase (cuadros)", "number"], ["desde", "Tramo: desde", "number"], ["hasta", "hasta", "number"], ["fijo", "Cuadro fijo", "number"]],
    temblor: [["amplitud", "Amplitud (px)", "number"], ["cada", "Cambia cada (cuadros)", "number"], ["escala", "Tamaño del temblor", "number"], ["semilla", "Variante", "number"]],
    trazado: [["desde", "Empieza en el cuadro", "number"], ["hasta", "Termina en el cuadro", "number"]],
    desenfoque: [["radio", "Radio (px)", "number"]],
    sombra: [["dx", "Corrimiento X", "number"], ["dy", "Corrimiento Y", "number"], ["radio", "Suavidad (px)", "number"], ["color", "Color", "color"], ["opacidad", "Opacidad (0 a 1)", "number"]],
    resplandor: [["radio", "Radio (px)", "number"], ["color", "Color", "color"], ["intensidad", "Intensidad (0 a 1)", "number"]],
    colorear: [["color", "Color", "color"], ["cantidad", "Cantidad (0 a 1)", "number"]],
  };

  function abrir(layerId) {
    const D = dz(), doc = D && D.doc, ly = doc && doc.scene.layer(layerId);
    if (!ly || !M() || typeof doc.setLayerMods !== "function" || typeof global.openModal !== "function") return false;
    let lista = M().modsData(ly.mods || []);
    global.openModal(`<h2>Modificadores y efectos</h2>
      <div class="sub" id="mdCapa"></div>
      <div class="sub">Cambian cómo se ve la capa sin tocar sus dibujos: se sacan y la capa vuelve a ser la de antes.
      Se ven en las otras capas de la mesa, al reproducir y al exportar; mientras dibujás en esta capa, se ve como es.</div>
      <div id="mdLista"></div>
      <div class="dz-style-row"><span class="dz-hint">Agregar</span><select id="mdNuevo" class="langsel"></select><button class="ghost" id="mdAgregar">Agregar</button></div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="mdAplicar">Aplicar</button></div>`);
    const $m = (s) => document.querySelector(s);
    $m("#mdCapa").textContent = "Capa «" + ly.name + "»";
    const sel = $m("#mdNuevo");
    for (const [k, v] of Object.entries(CATALOGO)) { const o = document.createElement("option"); o.value = k; o.textContent = v.nombre; sel.appendChild(o); }
    const pintar = () => {
      const caja = $m("#mdLista");
      caja.replaceChildren();
      if (!lista.length) { const p = document.createElement("div"); p.className = "sub"; p.textContent = "Sin modificadores."; caja.appendChild(p); }
      lista.forEach((m, i) => {
        const bloque = document.createElement("fieldset");
        bloque.className = "md-bloque"; bloque.dataset.i = String(i);
        const tit = document.createElement("legend");
        const on = document.createElement("input"); on.type = "checkbox"; on.checked = m.activo !== false; on.title = "Prender o apagar";
        on.onchange = () => { m.activo = on.checked; };
        const nombre = document.createElement("span"); nombre.textContent = " " + (CATALOGO[m.tipo] ? CATALOGO[m.tipo].nombre : m.tipo) + " ";
        const quitar = document.createElement("button"); quitar.className = "ghost md-quitar"; quitar.textContent = "Quitar";
        quitar.onclick = (e) => { e.preventDefault(); lista.splice(i, 1); pintar(); };
        tit.append(on, nombre, quitar);
        bloque.appendChild(tit);
        for (const [clave, etiqueta, tipo, opciones] of CAMPOS[m.tipo] || []) {
          const fila = document.createElement("label"); fila.className = "dz-style-row";
          const t = document.createElement("span"); t.className = "dz-hint"; t.textContent = etiqueta;
          let campo;
          if (tipo === "select") {
            campo = document.createElement("select"); campo.className = "langsel";
            for (const [v, txt] of opciones) { const o = document.createElement("option"); o.value = v; o.textContent = txt; if (m[clave] === v) o.selected = true; campo.appendChild(o); }
            campo.onchange = () => { m[clave] = campo.value; };
          } else if (tipo === "color") {
            campo = document.createElement("input"); campo.type = "color"; campo.value = String(m[clave]);
            campo.oninput = () => { m[clave] = campo.value; };
          } else {
            campo = document.createElement("input"); campo.type = "number"; campo.className = "dz-win"; campo.value = String(m[clave]);
            campo.step = clave === "escala" ? "0.005" : /opacidad|intensidad|cantidad/.test(clave) ? "0.05" : "1";
            campo.oninput = () => { m[clave] = Number(campo.value); };
          }
          campo.dataset.campo = clave;
          fila.append(t, campo);
          bloque.appendChild(fila);
        }
        caja.appendChild(bloque);
      });
    };
    pintar();
    $m("#mdAgregar").onclick = () => { const c = CATALOGO[sel.value]; if (c) { lista.push(c.nuevo(doc)); pintar(); } };
    $m("#mCancel").onclick = () => global.closeModal();
    $m("#mdAplicar").onclick = () => {
      const r = doc.setLayerMods(ly.id, lista);
      global.closeModal();
      if (r) { avisar("Modificadores de «" + ly.name + "» aplicados · Ctrl+Z los deshace"); if (typeof global.dzMarkDirty === "function") global.dzMarkDirty(); }
    };
    return true;
  }

  const a = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  a.modificadoresUI = { abrir, CATALOGO, CAMPOS };
})(typeof window !== "undefined" ? window : globalThis);
