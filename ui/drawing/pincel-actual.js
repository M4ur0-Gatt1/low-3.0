/* ══════════════════════════════════════════════════════════════════════════
   EL PINCEL ELEGIDO: siempre hay uno, y se recuerda

   Reporte de un usuario (oct-2026, vía Mauro): «el pincel por defecto es un
   poco vectorial, tosco; que sea más fluido y suave».

   MEDIDO: al arrancar no había NINGÚN pincel elegido (`DZ.brushPreset`
   nacía vacío). El selector mostraba «Lápiz de animación» —la primera opción
   de la lista— pero el Pincel dibujaba con el camino VIEJO (dzBrushRibbon):
   pocos puntos por lado, bordes que no quedan paralelos en las curvas y
   extremos cortados en recto. El motor de pinceles —con la cinta suave, los
   remates redondos y la vista en vivo— sólo corría si uno elegía un pincel a
   mano. Y lo elegido no se guardaba: al reabrir LOW, otra vez el camino viejo.

   Acá `DZ.brushPreset` pasa a ser una propiedad que se guarda sola: la
   cambien el selector, el Estudio, una biblioteca o el agente, queda en
   `low.brush.actual`. Al arrancar se usa la guardada o «Tinta limpia».

   @module drawing/pincel-actual
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const CLAVE = "low.brush.actual";
  const POR_DEFECTO = "clean-ink";
  const registro = () => global.LOW?.drawing?.brushes;
  const existe = (id) => !!(id && registro()?.get?.(id));
  const leer = () => { try { return global.localStorage.getItem(CLAVE); } catch (_) { return null; } };
  const guardar = (id) => { try { if (id) global.localStorage.setItem(CLAVE, id); } catch (_) { /* sin almacenamiento */ } };

  function instalar() {
    const dz = typeof DZ !== "undefined" ? DZ : null;     // DZ es `const` de app.js: alcance compartido
    if (!dz) return;
    const desc = Object.getOwnPropertyDescriptor(dz, "brushPreset");
    if (desc && desc.get) return;
    let actual = desc ? desc.value : undefined;
    Object.defineProperty(dz, "brushPreset", {
      configurable: true, enumerable: true,
      get() { return actual; },
      set(id) { actual = id; guardar(id); },
    });
    const guardado = leer();
    if (!actual) actual = existe(guardado) ? guardado : POR_DEFECTO;
    // un pincel de una biblioteca instalada llega después (se cargan del
    // disco): si lo guardado era de ahí, se lo vuelve a poner cuando aparezca
    if (guardado && !existe(guardado)) {
      let intentos = 0;
      const reintentar = setInterval(() => {
        if (existe(guardado)) { if (dz.brushPreset === POR_DEFECTO) actual = guardado; clearInterval(reintentar); global.dzToolOptsRender?.(); }
        else if (++intentos > 40) clearInterval(reintentar);
      }, 250);
    }
    global.dzToolOptsRender?.();
  }

  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", instalar, { once: true });
  else instalar();
})(typeof window !== "undefined" ? window : globalThis);
