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

  /** EL ORIGEN DE UN ENVÍO: el estudio manda, junto con las imágenes, su
   *  proyecto (JSON) y los ajustes con que las hizo. El proyecto se guarda una
   *  vez en la escena y el nivel apunta a él (scene-model.js, fuente3dData).
   *  undefined si el estudio no mandó origen (uno anterior a v3.56): el nivel
   *  conserva el que tuviera. */
  function fuenteDe(m, tipo, nombre) {
    const o = m && m.origen, sc = escena();
    if (!sc || !o || typeof o !== "object" || typeof o.proyecto !== "string" || typeof sc.guardarProyecto3D !== "function") return undefined;
    const proyecto = sc.guardarProyecto3D(o.proyecto);
    return proyecto ? { tipo, proyecto, nombre, params: o.params || {}, fecha: new Date().toISOString() } : undefined;
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
    // si el cuadro cambió de tamaño mientras tanto, los puntos se llevan al nuevo
    const kx = W / (Number(m.width) || W), ky = H / (Number(m.height) || H);
    const vps = (Array.isArray(m.vps) ? m.vps : []).map((v) => ({ x: v.x * kx, y: v.y * ky, eje: v.eje, color: v.color }));
    // la imagen y la perspectiva son UN paso de Ctrl+Z (antes eran dos: el
    // primer Ctrl+Z sacaba sólo los puntos de fuga y dejaba el calco)
    const h = DZ.doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Layout desde el estudio 3D");
    try {
      DZ.doc.setLayout3D(contenido, { nombre: "Layout 3D", fuente: fuenteDe(m, "encuadre", "Layout 3D") });
      if (typeof global.dzPerspectivaDesde3D === "function")
        global.dzPerspectivaDesde3D(vps, { paralelas: m.paralelas, ajustes: m.ajustes });
    } finally { if (tx) h.commit(); }
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
    const ly = DZ.doc.setToma3D(nombre, items, { hasta: Number(m.cuadros) || 0, fuente: fuenteDe(m, "toma", nombre) });
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

  /** EN PLANOS (cámara multiplano): cada plano del estudio 3D a una capa al
   *  fondo, del más lejano al más cercano, con su imagen y su profundidad
   *  (`data-z`): la cámara del 2D los mueve en paralaje al panear y acercar. */
  function recibirPlanos(m, f) {
    const sc = escena();
    const responderP = (r) => responder(f, { type: "low:planos-recibidos", ...r });
    if (!sc || typeof DZ.doc.setPlanos3D !== "function") {
      const error = "Abrí o creá un documento de animación en LOW para recibir los planos";
      aviso(error);
      return responderP({ error });
    }
    const planos = (Array.isArray(m.planos) ? m.planos : [])
      .filter((p) => p && typeof p.png === "string" && /^data:image\/png;base64,/.test(p.png) && Number.isFinite(Number(p.z)));
    if (!planos.length) return responderP({ error: "no llegaron los planos" });
    const W = sc.width || 1920, H = sc.height || 1080;
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const nombre = String(m.nombre || "Multiplano").slice(0, 60);
    const capas = DZ.doc.setPlanos3D(nombre, planos.map((p) => ({ z: Math.max(-60, Math.min(400, Math.round(Number(p.z)))),
      content: `<image data-low="plano-3d" data-z="${Math.max(-60, Math.min(400, Math.round(Number(p.z))))}" href="${p.png}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>` })),
      { fuente: fuenteDe(m, "planos", nombre) });
    if (!capas) return responderP({ error: "no se pudieron armar las capas" });
    try {
      if (typeof global.dzBuildLayers === "function") global.dzBuildLayers();
      if (typeof global.dzTlFramesRender === "function") global.dzTlFramesRender();
      if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
      if (typeof global.dzCapasEnMesa === "function") global.dzCapasEnMesa();
    } catch (e) { console.warn("[planos 3D]", e); }
    const texto = planos.length + " planos en capas al fondo («" + nombre + " · 1» es el más lejano) con su profundidad para la cámara multiplano · Ctrl+Z los saca";
    if (typeof global.closeL3d === "function") global.closeL3d();
    aviso(texto);
    responderP({ ok: true, aviso: texto });
  }

  /** EL TALLER DE PERSONAJE (estudio 3D): la HOJA DE MODELO —las vistas lado
   *  a lado, sin perspectiva, con las líneas de modelo y el nombre de cada
   *  vista— en una capa de referencia al fondo; o el GIRO EN CUADROS: cada
   *  vista en un cuadro de esa capa, para animar el giro. Volver a mandar el
   *  mismo personaje reemplaza la capa. Un paso de Ctrl+Z. */
  function recibirHoja(m, f) {
    const sc = escena();
    const responderH = (r) => responder(f, { type: "low:hoja-recibida", ...r });
    if (!sc || typeof DZ.doc.setToma3D !== "function") {
      const error = "Abrí o creá un documento de animación en LOW para recibir el personaje";
      aviso(error);
      return responderH({ error });
    }
    const vistas = (Array.isArray(m.vistas) ? m.vistas : []).filter((v) => v && typeof v.png === "string" && /^data:image\/png;base64,/.test(v.png));
    if (!vistas.length) return responderH({ error: "no llegaron las vistas" });
    const W = sc.width || 1920, H = sc.height || 1080;
    const nombre = String(m.nombre || "Personaje").slice(0, 60);
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    let ly, texto;
    if (m.modo === "giro" || m.modo === "actuacion") {
      // el GIRO (una vista por cuadro) o la ACTUACIÓN para rotoscopiar (un
      // cuadro de la actuación por cuadro de la escena, desde la cámara del estudio)
      const act = m.modo === "actuacion";
      const items = vistas.map((v, i) => ({ cuadro: i + 1,
        content: `<image data-low="toma-3d" href="${v.png}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>` }));
      ly = DZ.doc.setToma3D((act ? "actuacion:" : "giro:") + nombre, items, { hasta: vistas.length, titulo: (act ? "Actuación · " : "Giro · ") + nombre });
      texto = act
        ? "La actuación de «" + nombre + "»: " + vistas.length + " cuadros en la capa «" + (ly && ly.name) + "» (al fondo, para rotoscopiar) · Ctrl+Z la saca"
        : "El giro de «" + nombre + "»: " + vistas.length + " vistas, una por cuadro, en la capa «" + (ly && ly.name) + "» (al fondo) · Ctrl+Z la saca";
    } else {
      // a la izquierda, un margen para los rótulos de las líneas (no tapan la primera vista)
      const n = vistas.length, margen = Math.round(W * 0.08), anchoVista = (W - margen) / n, altoImg = Math.round(H * 0.9);
      const arriba = Number(m.arriba), abajo = Number(m.abajo), rango = arriba - abajo;
      let svg = "";
      vistas.forEach((v, i) => {
        svg += `<image data-low="toma-3d" href="${v.png}" x="${(margen + i * anchoVista).toFixed(1)}" y="0" width="${anchoVista.toFixed(1)}" height="${altoImg}" preserveAspectRatio="xMidYMid meet"/>`;
        svg += `<text x="${(margen + (i + 0.5) * anchoVista).toFixed(1)}" y="${(altoImg + (H - altoImg) * 0.62).toFixed(1)}" text-anchor="middle" font-family="Figtree, sans-serif" font-size="${Math.round(H * 0.032)}" fill="#55606b">${esc(v.nombre || "")}</text>`;
      });
      if (Number.isFinite(rango) && rango > 0) for (const l of (Array.isArray(m.lineas) ? m.lineas : [])) {
        const y = ((arriba - Number(l.y)) / rango) * altoImg;
        if (!(y >= 0 && y <= altoImg)) continue;
        svg += `<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="#33B5E8" stroke-width="2" stroke-dasharray="14 9" opacity=".75"/>`;
        svg += `<text x="10" y="${(y - 6).toFixed(1)}" font-family="Figtree, sans-serif" font-size="${Math.round(H * 0.022)}" fill="#2a8fbd">${esc(l.nombre || "")}</text>`;
      }
      ly = DZ.doc.setToma3D("hoja:" + nombre, [{ cuadro: 1, content: svg }],
        { hasta: Math.max(1, sc.lastFrame ? sc.lastFrame() : 1), titulo: "Hoja de modelo · " + nombre });
      texto = "La hoja de modelo de «" + nombre + "» (" + n + " vistas, con las líneas de modelo) está en la capa «" + (ly && ly.name) + "» (al fondo, para calcar) · Ctrl+Z la saca";
    }
    if (!ly) return responderH({ error: "no se pudo armar la capa" });
    try {
      if (typeof global.dzBuildLayers === "function") global.dzBuildLayers();
      if (typeof global.dzTlFramesRender === "function") global.dzTlFramesRender();
      if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
      if (typeof global.dzCapasEnMesa === "function") global.dzCapasEnMesa();
    } catch (e) { console.warn("[hoja de modelo]", e); }
    if (typeof global.closeL3d === "function") global.closeL3d();
    aviso(texto);
    responderH({ ok: true, aviso: texto });
  }

  /** EDITAR EN EL 3D (clic derecho en la capa): abre el estudio con el proyecto
   *  de donde salió ese nivel y los mismos ajustes del envío. El estudio aparta
   *  la escena que tenía abierta, y «Actualizar en el 2D» rehace los fondos con
   *  el mismo nombre (reemplazan a los de antes, un paso de Ctrl+Z) y la
   *  devuelve. `id`: el de la capa o el de su nivel. */
  let estudioListo = false, pendiente = null;
  function fuenteDeCapa(id) {
    const sc = escena();
    if (!sc) return null;
    const ly = sc.layers.find((l) => l.id === id);
    const lv = sc.levels.find((l) => l.id === (ly ? ly.levelId : id));
    const fu = lv && lv.fuente3d;
    if (!fu) return null;
    const proyecto = sc.proyectos3d && sc.proyectos3d[fu.proyecto];
    return proyecto ? { fuente: fu, proyecto, capa: (ly && ly.name) || lv.name } : null;
  }
  function editar(id) {
    const x = fuenteDeCapa(id);
    if (!x) { aviso("Esa capa no vino del estudio 3D (o se mandó con una versión anterior): no hay proyecto para abrir"); return false; }
    pendiente = { type: "low:editar-fuente", tipo: x.fuente.tipo, nombre: x.fuente.nombre, params: x.fuente.params,
                  proyecto: x.proyecto, capa: x.capa };
    if (typeof global.openL3d === "function") global.openL3d();
    const f = marco();
    // el estudio ya estaba abierto de antes: se le manda ya; si no, cuando avise que está listo
    if (f && estudioListo) { responder(f, pendiente); pendiente = null; }
    aviso("Abriendo «" + x.capa + "» en el estudio 3D · al terminar, «Actualizar en el 2D»");
    return true;
  }

  global.addEventListener("message", (ev) => {
    const f = marco();
    if (!f || ev.source !== f.contentWindow) return;
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.type === "low:estudio-listo") {
      estudioListo = true;
      if (pendiente) { responder(f, pendiente); pendiente = null; }
    } else if (m.type === "low:pedir-encuadre") {
      const sc = escena();
      responder(f, { type: "low:encuadre", width: sc ? sc.width : 1920, height: sc ? sc.height : 1080, hayDocumento: !!sc,
        fps: sc ? sc.fps : 24, cuadros: sc && typeof sc.playRange === "function" ? sc.playRange().out : 24 });
    } else if (m.type === "low:send-to-2d") {
      recibir(m, f);
    } else if (m.type === "low:send-toma") {
      recibirToma(m, f);
    } else if (m.type === "low:send-planos") {
      recibirPlanos(m, f);
    } else if (m.type === "low:send-hoja-modelo") {
      recibirHoja(m, f);
    } else if (m.type === "low:guardar-kit" && typeof m.json === "string") {
      // los kits de la biblioteca 3D (.lowkit): dentro del estudio las descargas no andan
      Promise.resolve(typeof api !== "undefined" && api.save_file("", m.json, String(m.name || "kit.lowkit")))
        .then((r) => responder(f, { type: "low:kit-guardado", ok: !!(r && r.path && !r.error), path: r && r.path, error: r && r.error }))
        .catch((e) => responder(f, { type: "low:kit-guardado", error: String(e && e.message || e) }));
    } else if (m.type === "low:abrir-kit") {
      Promise.resolve(typeof api !== "undefined" && api.open_dialog())
        .then((r) => { if (r && (r.content || r.error)) responder(f, { type: "low:kit-abierto", content: r.content, error: r.error }); })
        .catch((e) => responder(f, { type: "low:kit-abierto", error: String(e && e.message || e) }));
    }
  });

  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.layout3d = { recibir, recibirToma, recibirPlanos, recibirHoja, editar, fuenteDeCapa };
})(typeof window !== "undefined" ? window : globalThis);
