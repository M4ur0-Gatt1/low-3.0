/* ══════════════════════════════════════════════════════════════════════════
   LA PLANILLA DE PRODUCCIÓN: LA GUÍA DE TRABAJO DE LA OBRA

   Pedido de Mauro (nov-2026, LOW 3.57): «un seguimiento de pasos de
   producción, como si fuera una planilla de planificación, con los pasos para
   ir tildando a medida que avanza la producción: diseño de personajes,
   storyboards, diseño de fondos… como una guía de trabajo».

   Ventana → Planilla de producción… abre un panel flotante (se arrastra por el
   encabezado) con las etapas de un corto —preproducción, producción y
   postproducción— y sus pasos. Cada paso:
     · se tilda cuando está hecho (queda la fecha), o se marca «en curso»;
     · lleva una nota y quién lo hace;
     · si tiene herramienta en LOW, «Ir» la abre (el storyboard, el estudio 3D
       para personajes y fondos, el esqueleto, la cámara, la exportación…).
   Se agregan, renombran (doble clic) y quitan pasos: la guía es un punto de
   partida, no una ley.

   La planilla vive en el documento (scene.produccion), así que viaja en el
   .low y cada cambio es un paso de Ctrl+Z (document.js, setProduccion).

   @module panels/produccion
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  /** Adónde lleva «Ir». Sólo esto: la planilla viene de un archivo, y un
   *  archivo no puede decidir qué se ejecuta (ni «borrar documento» ni nada
   *  que no esté acá). */
  const DESTINOS = {
    "3d": { titulo: "Abrir el estudio 3D", abrir: () => global.openL3d && global.openL3d() },
    "menu:storyboard": { titulo: "Abrir el storyboard" },
    "menu:esqueleto": { titulo: "Abrir el esqueleto / cut-out" },
    "menu:camara": { titulo: "Abrir la cámara" },
    "menu:xsheet": { titulo: "Abrir la X-sheet" },
    "menu:profundidad": { titulo: "Abrir la profundidad (multiplano)" },
    "menu:perspectiva": { titulo: "Abrir la perspectiva" },
    "menu:mocap-video": { titulo: "Abrir video mocap / rotoscopía" },
    "menu:audio-cargar": { titulo: "Cargar el audio" },
    "menu:premiere": { titulo: "Sincronizar con el audio y exportar XML" },
    "menu:vistaprevia": { titulo: "Abrir la vista previa de la exportación" },
    "menu:exportanim": { titulo: "Exportar la animación" },
  };

  /** La guía de un corto animado 2D, en el orden en que se trabaja. */
  const GUIA_CORTO = [
    { id: "pre", nombre: "Preproducción", pasos: [
      ["idea", "Idea y sinopsis"],
      ["guion", "Guion"],
      ["personajes", "Diseño de personajes", "3d"],
      ["hojas", "Hoja de modelo y giro de cada personaje", "3d"],
      ["storyboard", "Storyboard", "menu:storyboard"],
      ["voces", "Voces y audio guía", "menu:audio-cargar"],
      ["animatica", "Animática con el audio", "menu:storyboard"],
      ["fondos-diseno", "Diseño de fondos y layouts", "3d"],
      ["paleta", "Paleta de color de personajes y fondos"],
    ] },
    { id: "prod", nombre: "Producción", pasos: [
      ["layout", "Layout de cada plano: encuadre, cámara y fondo", "menu:camara"],
      ["rig", "Rig de los personajes en piezas", "menu:esqueleto"],
      ["claves", "Poses clave", "menu:xsheet"],
      ["intercalado", "Intercalado", "menu:xsheet"],
      ["limpieza", "Limpieza de línea"],
      ["color", "Color y pintura"],
      ["fondos-finales", "Fondos finales", "3d"],
      ["composicion", "Composición: cámara, profundidad y efectos", "menu:profundidad"],
    ] },
    { id: "post", nombre: "Postproducción", pasos: [
      ["labial", "Sincronía labial"],
      ["sonido", "Música y efectos de sonido", "menu:audio-cargar"],
      ["montaje", "Montaje", "menu:premiere"],
      ["revision", "Revisión completa en la vista previa", "menu:vistaprevia"],
      ["exportar", "Exportación final", "menu:exportanim"],
      ["copia", "Copia de seguridad del proyecto (el .low y su carpeta .fondos)"],
    ] },
  ];
  function guiaCorto() {
    return { etapas: GUIA_CORTO.map((e) => ({ id: e.id, nombre: e.nombre,
      pasos: e.pasos.map(([id, texto, ir]) => ({ id, texto, estado: "pendiente", ...(ir ? { ir } : {}) })) })) };
  }

  /** Cuántos pasos hay y cuántos están hechos (de todo, o de una etapa). */
  function avance(etapas) {
    let total = 0, hechos = 0, enCurso = 0;
    for (const e of etapas) for (const p of e.pasos) {
      total++;
      if (p.estado === "hecho") hechos++;
      else if (p.estado === "en-curso") enCurso++;
    }
    return { total, hechos, enCurso, porciento: total ? Math.round((100 * hechos) / total) : 0 };
  }

  /* ── los cambios: siempre por el documento (un paso de Ctrl+Z) ─────────── */

  const copia = (v) => JSON.parse(JSON.stringify(v));
  function cambiar(label, fn) {
    const D = dz(), doc = D && D.doc;
    if (!doc || typeof doc.setProduccion !== "function") return avisar("Abrí o creá un documento para usar la planilla de producción");
    const p = doc.scene.produccion ? copia(doc.scene.produccion) : null;
    const nueva = fn(p);
    if (nueva === undefined) return;
    if (doc.setProduccion(nueva, { label }) && typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    pintar();
  }
  const conPaso = (p, eid, pid, fn) => {
    const e = p && p.etapas.find((x) => x.id === eid), paso = e && e.pasos.find((x) => x.id === pid);
    if (!paso) return undefined;
    fn(paso, e);
    return p;
  };
  const idNuevo = (p, base) => {
    const usados = new Set(p.etapas.flatMap((e) => [e.id, ...e.pasos.map((x) => x.id)]));
    let i = 1; while (usados.has(base + "-" + i)) i++;
    return base + "-" + i;
  };

  const api = {
    empezar: () => cambiar("Empezar la planilla de producción", (p) => (p ? undefined : guiaCorto())),
    empezarVacia: () => cambiar("Empezar la planilla de producción", (p) => (p ? undefined :
      { etapas: GUIA_CORTO.map((e) => ({ id: e.id, nombre: e.nombre, pasos: [] })) })),
    tildar: (eid, pid, hecho) => cambiar(hecho ? "Paso hecho" : "Paso sin terminar", (p) => conPaso(p, eid, pid, (x) => {
      x.estado = hecho ? "hecho" : "pendiente";
      if (hecho) x.fecha = new Date().toISOString(); else delete x.fecha;
    })),
    enCurso: (eid, pid) => cambiar("Paso en curso", (p) => conPaso(p, eid, pid, (x) => {
      x.estado = x.estado === "en-curso" ? "pendiente" : "en-curso"; delete x.fecha;
    })),
    renombrar: (eid, pid, texto) => cambiar("Renombrar un paso", (p) => (String(texto || "").trim()
      ? conPaso(p, eid, pid, (x) => { x.texto = String(texto).trim(); }) : undefined)),
    anotar: (eid, pid, nota) => cambiar("Nota de un paso", (p) => conPaso(p, eid, pid, (x) => {
      const n = String(nota || "").trim(); if (n) x.nota = n; else delete x.nota;
    })),
    asignar: (eid, pid, quien) => cambiar("Quién hace un paso", (p) => conPaso(p, eid, pid, (x) => {
      const q = String(quien || "").trim(); if (q) x.quien = q; else delete x.quien;
    })),
    agregar: (eid, texto) => cambiar("Agregar un paso", (p) => {
      const e = p && p.etapas.find((x) => x.id === eid), t = String(texto || "").trim();
      if (!e || !t) return undefined;
      e.pasos.push({ id: idNuevo(p, "propio"), texto: t, estado: "pendiente" });
      return p;
    }),
    quitar: (eid, pid) => cambiar("Quitar un paso", (p) => {
      const e = p && p.etapas.find((x) => x.id === eid);
      if (!e || !e.pasos.some((x) => x.id === pid)) return undefined;
      e.pasos = e.pasos.filter((x) => x.id !== pid);
      return p;
    }),
    ir: (destino) => {
      const d = DESTINOS[destino];
      if (!d) return false;
      if (d.abrir) { d.abrir(); return true; }
      // el mismo camino que el ítem del menú (que se dispara al apretar, no al
      // soltar: un .click() sobre el ítem no hacía nada)
      if (typeof global.dzMenuAction !== "function") return false;
      global.dzMenuAction(destino.slice(5));
      return true;
    },
  };

  /* ── el panel ──────────────────────────────────────────────────────────── */

  let PANEL = null, cerradas = new Set(), docVisto = null, desuscribir = null, reloj = null;
  // los títulos de dzPromptModal van como HTML: un nombre que viene del archivo se escapa
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const el = (tag, cls, texto) => { const n = document.createElement(tag); if (cls) n.className = cls; if (texto != null) n.textContent = texto; return n; };
  const boton = (texto, titulo, fn, cls = "") => { const b = el("button", cls, texto); b.type = "button"; if (titulo) b.title = titulo; b.onclick = fn; return b; };

  function abrir() {
    if (!PANEL) {
      PANEL = el("section", "prod-panel");
      PANEL.id = "dzProduccion";
      PANEL.setAttribute("role", "dialog");
      PANEL.setAttribute("aria-label", "Planilla de producción");
      const cab = el("header", "prod-head");
      cab.append(el("strong", "", "Planilla de producción"), el("span", "prod-flex"),
        boton("×", "Cerrar la planilla (queda guardada en el documento)", cerrar, "prod-cerrar"));
      PANEL.append(cab, el("div", "prod-cuerpo"));
      document.body.appendChild(PANEL);
      arrastrable(PANEL, cab);
      // el documento activo puede cambiar (pestañas, abrir otro): se sigue al actual
      reloj = setInterval(() => { const D = dz(); if ((D && D.doc) !== docVisto) pintar(); }, 600);
    }
    pintar();
    return PANEL;
  }
  function cerrar() {
    if (desuscribir) desuscribir();
    desuscribir = null; docVisto = null;
    clearInterval(reloj); reloj = null;
    if (PANEL) PANEL.remove();
    PANEL = null;
  }

  function pintar() {
    if (!PANEL) return;
    const D = dz(), doc = D && D.doc;
    if (doc !== docVisto) {
      if (desuscribir) desuscribir();
      desuscribir = doc && typeof doc.subscribe === "function"
        ? doc.subscribe((_d, motivo) => { if (motivo === "produccion") pintar(); }) : null;
      docVisto = doc;
    }
    const cuerpo = PANEL.querySelector(".prod-cuerpo");
    cuerpo.replaceChildren();
    if (!doc) { cuerpo.append(el("p", "prod-vacia", "Abrí o creá un documento de animación: la planilla se guarda adentro del .low.")); return; }
    const p = doc.scene.produccion;
    if (!p) {
      cuerpo.append(el("p", "prod-vacia", "La guía de trabajo de la obra, de la idea a la exportación. Se guarda en este documento y cada cambio se deshace con Ctrl+Z."));
      const acciones = el("div", "prod-empezar");
      acciones.append(boton("Empezar con la guía de un corto", "Preproducción, producción y postproducción con sus pasos", api.empezar, "prod-primario"),
        boton("Empezar vacía", "Las tres etapas sin pasos, para armar la tuya", api.empezarVacia));
      cuerpo.append(acciones);
      return;
    }
    const a = avance(p.etapas);
    const resumen = el("div", "prod-resumen");
    resumen.append(el("b", "", a.hechos + " de " + a.total), el("span", "", " pasos hechos · " + a.porciento + " %" + (a.enCurso ? " · " + a.enCurso + " en curso" : "")));
    const barra = el("div", "prod-barra"), lleno = el("i");
    lleno.style.width = a.porciento + "%";
    barra.append(lleno);
    resumen.append(barra);
    cuerpo.append(resumen);
    for (const e of p.etapas) cuerpo.append(pintarEtapa(e));
  }

  function pintarEtapa(e) {
    const sec = el("section", "prod-etapa" + (cerradas.has(e.id) ? " cerrada" : ""));
    sec.dataset.etapa = e.id;
    const a = avance([e]);
    const tit = boton("", "Mostrar u ocultar los pasos de " + e.nombre, () => {
      if (cerradas.has(e.id)) cerradas.delete(e.id); else cerradas.add(e.id);
      pintar();
    }, "prod-etapa-tit");
    tit.append(el("span", "prod-flecha", cerradas.has(e.id) ? "▸" : "▾"), el("span", "prod-etapa-nombre", e.nombre),
      el("span", "prod-etapa-cuenta", a.hechos + "/" + a.total));
    sec.append(tit);
    if (cerradas.has(e.id)) return sec;
    const lista = el("ul", "prod-pasos");
    for (const paso of e.pasos) lista.append(pintarPaso(e, paso));
    sec.append(lista);
    sec.append(boton("+ Agregar paso", "Un paso propio en " + e.nombre, async () => {
      const t = typeof global.dzPromptModal === "function" ? await global.dzPromptModal("Nuevo paso en " + esc(e.nombre), "qué hay que hacer", "") : null;
      if (t && t.trim()) api.agregar(e.id, t);
    }, "prod-agregar"));
    return sec;
  }

  function pintarPaso(e, paso) {
    const li = el("li", "prod-paso est-" + paso.estado);
    li.dataset.paso = paso.id;
    const tilde = el("input");
    tilde.type = "checkbox"; tilde.checked = paso.estado === "hecho";
    tilde.setAttribute("aria-label", "Hecho: " + paso.texto);
    tilde.onchange = () => api.tildar(e.id, paso.id, tilde.checked);
    const texto = el("span", "prod-texto", paso.texto);
    texto.title = "Doble clic para renombrar";
    texto.ondblclick = async () => {
      const t = typeof global.dzPromptModal === "function" ? await global.dzPromptModal("Nombre del paso", "nombre", paso.texto) : null;
      if (t != null) api.renombrar(e.id, paso.id, t);
    };
    const datos = el("span", "prod-datos");
    if (paso.quien) datos.append(el("span", "prod-quien", paso.quien));
    if (paso.estado === "hecho" && paso.fecha) {
      const f = new Date(paso.fecha);
      if (!isNaN(f)) datos.append(el("span", "prod-fecha", f.toLocaleDateString()));
    }
    const botones = el("span", "prod-botones");
    if (paso.estado !== "hecho")
      botones.append(boton(paso.estado === "en-curso" ? "En curso" : "Empezar", paso.estado === "en-curso" ? "Volver a pendiente" : "Marcar en curso",
        () => api.enCurso(e.id, paso.id), "prod-curso" + (paso.estado === "en-curso" ? " on" : "")));
    if (paso.ir && DESTINOS[paso.ir])
      botones.append(boton("Ir", DESTINOS[paso.ir].titulo, () => { if (!api.ir(paso.ir)) avisar("No encontré esa herramienta en esta versión de LOW"); }, "prod-ir"));
    botones.append(boton("✎", paso.nota ? "Nota: " + paso.nota : "Agregar una nota", async () => {
      const n = typeof global.dzPromptModal === "function" ? await global.dzPromptModal("Nota de «" + esc(paso.texto) + "»", "lo que haga falta recordar", paso.nota || "") : null;
      if (n != null) api.anotar(e.id, paso.id, n);
    }, "prod-nota" + (paso.nota ? " on" : "")),
    boton("@", paso.quien ? "Lo hace: " + paso.quien : "Quién lo hace", async () => {
      const q = typeof global.dzPromptModal === "function" ? await global.dzPromptModal("¿Quién hace «" + esc(paso.texto) + "»?", "nombre", paso.quien || "") : null;
      if (q != null) api.asignar(e.id, paso.id, q);
    }, "prod-asignar"),
    boton("⌫", "Quitar este paso (Ctrl+Z lo devuelve)", () => api.quitar(e.id, paso.id), "prod-quitar"));
    li.append(tilde, texto, datos, botones);
    if (paso.nota) li.append(el("div", "prod-nota-texto", paso.nota));
    return li;
  }

  /** Arrastre por el encabezado, como el panel de la prueba maestra. */
  function arrastrable(panel, asa) {
    asa.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("button, input")) return;
      ev.preventDefault();
      const r = panel.getBoundingClientRect(), dx = ev.clientX - r.left, dy = ev.clientY - r.top;
      const mover = (m) => {
        panel.style.left = Math.max(0, Math.min(innerWidth - 80, m.clientX - dx)) + "px";
        panel.style.top = Math.max(0, Math.min(innerHeight - 40, m.clientY - dy)) + "px";
        panel.style.right = "auto"; panel.style.bottom = "auto";
      };
      const soltar = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); };
      addEventListener("pointermove", mover); addEventListener("pointerup", soltar);
    });
  }

  /* ── la entrada de menú, sin tocar app.js ──────────────────────────────── */
  // Los ítems del menú se disparan al APRETAR (app.js, mousedown) y el menú se
  // cierra en ese momento: el clic de después ya no cae sobre el ítem. Por eso
  // se escucha el mousedown (sin frenarlo: el menú se cierra como siempre) y
  // también el clic, para el teclado y los lectores de pantalla.
  for (const tipo of ["mousedown", "click"]) document.addEventListener(tipo, (ev) => {
    const item = ev.target.closest && ev.target.closest('[data-act="produccion"]');
    if (item) abrir();
  }, true);

  global.LOW = global.LOW || {};
  global.LOW.produccion = { abrir, cerrar, guiaCorto, avance, DESTINOS, ...api };
})(typeof window !== "undefined" ? window : globalThis);
