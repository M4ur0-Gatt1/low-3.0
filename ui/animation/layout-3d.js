/* ══ 🏙 EL LAYOUT DEL ESTUDIO 3D, EN EL 2D ══════════════════════════════════
   El estudio 3D arma la perspectiva de un fondo (calle, manzana, habitación)
   y con «Mandar al 2D» le pasa a LOW dos cosas:
   1. Las líneas renderizadas del tamaño del cuadro, con fondo transparente:
      entran como capa de calco «Layout 3D» al FONDO, con un solo dibujo
      expuesto en toda la escena. Volver a mandar REEMPLAZA ese dibujo (no
      apila capas) y es un paso de Ctrl+Z.
   2. Los puntos de fuga de la cámara en píxeles del cuadro: pasan a ser la
      perspectiva de la escena (drawing/perspectiva.js), así el lápiz se imanta
      exacto a las mismas rectas que se ven en el calco.
   El estudio pregunta antes el tamaño del cuadro (`low:pedir-encuadre`) para
   que su marco y su render tengan la forma del 2D. */
(function (global) {
  "use strict";

  const marco = () => document.getElementById("l3dFrame");
  const aviso = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const escena = () => (typeof DZ !== "undefined" && DZ.doc && DZ.doc.scene) || null;

  function responder(f, datos) {
    try { f.contentWindow.postMessage(datos, "*"); } catch (_) { /* el estudio se cerró */ }
  }

  function recibir(m, f) {
    const sc = escena();
    if (!sc || typeof DZ.doc.setLayout3D !== "function") {
      const error = "Abrí o creá un documento de animación en LOW para recibir el layout";
      aviso(error);
      return responder(f, { type: "low:sent-to-2d", error });
    }
    if (typeof m.png !== "string" || !m.png.startsWith("data:image/png")) {
      return responder(f, { type: "low:sent-to-2d", error: "no llegó la imagen del layout" });
    }
    const W = sc.width || 1920, H = sc.height || 1080;
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();   // lo que estaba en la mesa, guardado antes
    const contenido = `<image data-low="layout-3d" href="${m.png}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>`;
    DZ.doc.setLayout3D(contenido, { nombre: "Layout 3D" });
    // si el cuadro cambió de tamaño mientras tanto, los puntos se llevan al nuevo
    const kx = W / (Number(m.width) || W), ky = H / (Number(m.height) || H);
    const vps = (Array.isArray(m.vps) ? m.vps : []).map((v) => ({ x: v.x * kx, y: v.y * ky, eje: v.eje, color: v.color }));
    if (typeof global.dzPerspectivaDesde3D === "function")
      global.dzPerspectivaDesde3D(vps, { paralelas: m.paralelas, ajustes: m.ajustes });
    try {
      if (typeof global.dzBuildLayers === "function") global.dzBuildLayers();
      if (typeof global.dzTlFramesRender === "function") global.dzTlFramesRender();
      if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
      // el dibujo activo no cambió: NO se rehace el lienzo (dzCanvasSet borraba las
      // capas de contexto recién pintadas y el layout no se veía). Se pintan al final.
      if (typeof global.dzCapasEnMesa === "function") global.dzCapasEnMesa();
    } catch (e) { console.warn("[layout 3D]", e); }
    if (typeof global.closeL3d === "function") global.closeL3d();
    aviso("Layout 3D en la capa «Layout 3D» (al fondo) · el lápiz se imanta a los " +
      vps.length + (vps.length === 1 ? " punto de fuga" : " puntos de fuga") + " de la cámara 3D");
    responder(f, { type: "low:sent-to-2d", ok: true });
  }

  /** LOS FONDOS DE UNA TOMA (panel «Toma» del estudio): JPG o PNG, uno por
   *  cuadro renderizado, a una capa de fondo de la escena. En el disco van como
   *  archivos al lado del .low (fondos_archivo.py), no adentro. */
  function recibirToma(m, f) {
    const sc = escena();
    const responderToma = (r) => responder(f, { type: "low:toma-recibida", ...r });
    if (!sc || typeof DZ.doc.setToma3D !== "function") {
      const error = "Abrí o creá un documento de animación en LOW para recibir la toma";
      aviso(error);
      return responderToma({ error });
    }
    const fotos = (Array.isArray(m.fotos) ? m.fotos : [])
      .filter((x) => x && Number(x.cuadro) > 0 && typeof x.data === "string" && /^data:image\/(jpeg|png);base64,/.test(x.data));
    if (!fotos.length) return responderToma({ error: "no llegaron los fondos de la toma" });
    const W = sc.width || 1920, H = sc.height || 1080;
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const nombre = String(m.nombre || "Toma 1").slice(0, 60);
    const items = fotos.map((x) => ({ cuadro: Math.round(x.cuadro),
      content: `<image data-low="toma-3d" href="${x.data}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>` }));
    const ly = DZ.doc.setToma3D(nombre, items, { hasta: Number(m.cuadros) || 0 });
    if (!ly) return responderToma({ error: "no se pudo armar la capa de fondos" });
    try {
      if (typeof global.dzBuildLayers === "function") global.dzBuildLayers();
      if (typeof global.dzTlFramesRender === "function") global.dzTlFramesRender();
      if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
      if (typeof global.dzCapasEnMesa === "function") global.dzCapasEnMesa();
    } catch (e) { console.warn("[toma 3D]", e); }
    const texto = fotos.length + (fotos.length === 1 ? " fondo" : " fondos") + " de la toma «" + nombre + "» en la capa «" + ly.name +
      "» (al fondo)" + (Number(m.cada) > 1 ? ", uno cada " + Number(m.cada) + " cuadros" : "") + " · Ctrl+Z los saca";
    if (typeof global.closeL3d === "function") global.closeL3d();
    aviso(texto);
    responderToma({ ok: true, aviso: texto });
  }

  global.addEventListener("message", (ev) => {
    const f = marco();
    if (!f || ev.source !== f.contentWindow) return;
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "low:pedir-encuadre") {
      const sc = escena();
      responder(f, { type: "low:encuadre", width: sc ? sc.width : 1920, height: sc ? sc.height : 1080, hayDocumento: !!sc,
        fps: sc ? sc.fps : 24, cuadros: sc && typeof sc.playRange === "function" ? sc.playRange().out : 24 });
    } else if (m.type === "low:send-to-2d") {
      recibir(m, f);
    } else if (m.type === "low:send-toma") {
      recibirToma(m, f);
    }
  });

  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.layout3d = { recibir, recibirToma };
})(typeof window !== "undefined" ? window : globalThis);
