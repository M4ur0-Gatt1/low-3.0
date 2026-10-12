/* ══ ▶ VISTA PREVIA DE LA EXPORTACIÓN ═══════════════════════════════════════
   Pedido de Mauro: «quiero poder reproducir una preview antes de exportar,
   dentro de la pantalla».

   La reproducción de la línea de tiempo muestra la MESA: el lienzo entero, el
   papel cebolla, las guías y el zoom del momento. Lo que sale del export es
   otra cosa: sólo el tramo In/Out, encuadrado por la cámara si tiene claves,
   con las poses del rig y con los cuadros vacíos como papel. Hasta ahora eso
   se veía recién al abrir el MP4.

   Esto rasteriza los cuadros con LA MISMA función que el export
   (`dzExportCuadroSvg` y `dzSvgToPng`) y los reproduce en un modal, como el
   «Preview» de Harmony o la previsualización de After Effects:
   - ▶/⏸, la barra para recorrer cuadro a cuadro (suena el pedacito de audio,
     igual que el scrub de la timeline) y «En bucle»;
   - el audio de la escena, sincronizado y con su desplazamiento;
   - los mismos botones de exportar abajo, para salir directo si está bien.

   Se rasteriza a un tamaño de pantalla (hasta 1280 px), no al del documento:
   es para mirar, y así un tramo largo se prepara rápido. Cerrar el modal (botón,
   Esc o clic afuera) corta la preparación, la reproducción y el audio: no queda
   ningún bucle corriendo de fondo. */
(function (global) {
  "use strict";

  const LADO_MAX = 1280;
  let actual = null;                      // la vista previa abierta, si hay una

  const $id = id => document.getElementById(id);
  const fpsDeExport = () => Math.max(1, Math.min(60,
    +(($id("tlFps") || {}).value) || (DZ.doc && DZ.doc.scene && DZ.doc.scene.fps) || 12));

  function aviso(texto) {
    if (typeof global.dzSetStatus === "function") global.dzSetStatus(texto);
  }

  function detener(p) {
    if (!p) return;
    p.vivo = false;
    p.reproduciendo = false;
    if (p.raf) cancelAnimationFrame(p.raf);
    p.raf = 0;
    if (p.audio) try { p.audio.stop(); } catch (_) { /* */ }
    if (p.soltar) p.soltar();
    if (actual === p) actual = null;
  }

  /** ¿Sigue abierto ESTE modal? Otro openModal reemplaza el contenido sin
   *  esconder el overlay: por eso se mira el lienzo, no sólo el overlay. */
  const abierta = p => p.vivo && p.lienzo.isConnected && !$id("overlay").hidden;

  function mostrar(p, i) {
    p.i = Math.max(0, Math.min(p.imgs.length - 1, i));
    const img = p.imgs[p.i];
    if (img) p.ctx.drawImage(img, 0, 0, p.lienzo.width, p.lienzo.height);
    p.barra.value = String(p.i);
    p.rotulo.textContent = "F" + p.cuadros[p.i] + " · " + (p.i + 1) + "/" + p.cuadros.length;
  }

  function sonarDesde(p, i) {
    if (p.audio && p.audio.buffer) p.audio.playFrom(p.cuadros[i]);
  }

  function pausar(p) {
    p.reproduciendo = false;
    if (p.raf) cancelAnimationFrame(p.raf);
    p.raf = 0;
    if (p.audio) p.audio.stop();
    p.boton.textContent = "▶";
    p.boton.title = "Reproducir (Espacio)";
  }

  function reproducir(p) {
    if (!p.imgs.length) return;
    if (p.i >= p.imgs.length - 1) mostrar(p, 0);        // terminó: arranca de nuevo
    p.reproduciendo = true;
    p.i0 = p.i;
    p.t0 = performance.now();
    sonarDesde(p, p.i);
    p.boton.textContent = "⏸";
    p.boton.title = "Pausa (Espacio)";
    const paso = ahora => {
      if (!abierta(p)) return detener(p);
      if (!p.reproduciendo) return;
      // el cuadro sale del RELOJ, no de contar vueltas: si la máquina se atrasa
      // se saltea un cuadro, pero la imagen no se separa del audio
      let i = p.i0 + Math.floor((ahora - p.t0) * p.fps / 1000);
      if (i >= p.imgs.length) {
        if (!p.bucle.checked) { mostrar(p, p.imgs.length - 1); return pausar(p); }
        p.i0 = 0; p.t0 = ahora; i = 0;
        sonarDesde(p, 0);
      }
      if (i !== p.i) mostrar(p, i);
      p.raf = requestAnimationFrame(paso);
    };
    p.raf = requestAnimationFrame(paso);
  }

  async function aImagen(dataUrl) {
    const img = new Image();
    img.src = dataUrl;
    try { await img.decode(); } catch (_) { return null; }
    return img;
  }

  async function dzVistaPreviaExport() {
    if (!DZ.doc || !DZ.doc.scene) return aviso("Abrí una animación para ver la vista previa");
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const cuadros = global.dzExportCuadros();
    if (!cuadros.length) return aviso("No hay cuadros para exportar");
    detener(actual);
    const escena = DZ.doc.scene, fps = fpsDeExport();
    const porCamara = global.dzHasCam();
    const lado = Math.min(LADO_MAX, Math.max(escena.width || 1080, escena.height || 1080));
    global.openModal(`<div class="lowprev-caja" id="lowPrevCaja"><h2>Vista previa</h2>
      <div class="sub">${cuadros.length} ${cuadros.length === 1 ? "cuadro" : "cuadros"} (F${cuadros[0]} a F${cuadros.at(-1)}) a ${fps} fps${porCamara ? " · por la cámara" : ""}${DZ.doc.audio && DZ.doc.audio.buffer ? " · con audio" : ""}</div>
      <div class="lowprev"><canvas id="lowPrevLienzo" width="${escena.width || 1920}" height="${escena.height || 1080}"></canvas>
        <div class="lowprev-preparando" id="lowPrevPreparando">Preparando la vista previa…</div></div>
      <div class="lowprev-controles">
        <button class="ghost" id="lowPrevPlay" disabled title="Reproducir (Espacio)">▶</button>
        <input type="range" id="lowPrevBarra" min="0" max="${cuadros.length - 1}" value="0" disabled aria-label="Cuadro">
        <span class="lowprev-rotulo" id="lowPrevRotulo">F${cuadros[0]}</span>
        <label class="lowprev-bucle"><input type="checkbox" id="lowPrevBucle" checked> En bucle</label>
      </div>
      <div class="m-actions" style="flex-wrap:wrap">
        <button class="primary" data-x="mp4">Video MP4</button>
        <button class="ghost" data-x="gif">GIF animado</button>
        <button class="ghost" data-x="png">Secuencia PNG</button>
        <button class="ghost" data-x="sheet">Spritesheet</button>
        <button class="ghost" data-x="premiere">XML para Premiere</button>
        <button class="ghost" id="lowPrevCerrar">Cerrar</button>
      </div></div>`);
    const p = actual = {
      vivo: true, cuadros, fps, imgs: [], i: 0, raf: 0, reproduciendo: false,
      audio: DZ.doc.audio || null,
      lienzo: $id("lowPrevLienzo"), boton: $id("lowPrevPlay"), barra: $id("lowPrevBarra"),
      rotulo: $id("lowPrevRotulo"), bucle: $id("lowPrevBucle"),
    };
    p.ctx = p.lienzo.getContext("2d");
    p.soltar = typeof global.dzModalDismiss === "function" ? global.dzModalDismiss(() => detener(p)) : null;
    $id("lowPrevCerrar").onclick = () => { detener(p); global.closeModal(); };
    document.querySelectorAll("#modal [data-x]").forEach(b => b.onclick = () => {
      detener(p); global.closeModal(); global.dzDoExport(b.dataset.x);
    });
    p.boton.onclick = () => (p.reproduciendo ? pausar(p) : reproducir(p));
    // Teclas propias, mientras el foco está en la vista previa: Espacio es la
    // mano del lienzo para el atajo global, y acá tiene que ser ▶/⏸. Se cortan
    // antes de que lleguen al documento; las flechas recorren cuadro a cuadro.
    const caja = $id("lowPrevCaja");
    caja.addEventListener("keydown", e => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || "") && e.target.type !== "checkbox") return;
      if (!p.imgs.length || p.boton.disabled) return;
      if (e.code === "Space") {
        e.preventDefault(); e.stopPropagation();
        if (!e.repeat) (p.reproduciendo ? pausar(p) : reproducir(p));
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault(); e.stopPropagation();
        if (p.reproduciendo) pausar(p);
        mostrar(p, p.i + (e.key === "ArrowRight" ? 1 : -1));
        if (p.audio && p.audio.buffer) p.audio.scrub(p.cuadros[p.i]);
      }
    });
    caja.addEventListener("keyup", e => { if (e.code === "Space") { e.preventDefault(); e.stopPropagation(); } });
    p.barra.oninput = () => {
      if (p.reproduciendo) pausar(p);
      mostrar(p, +p.barra.value);
      if (p.audio && p.audio.buffer) p.audio.scrub(p.cuadros[p.i]);
    };

    // ── preparar: los mismos cuadros que el export, a tamaño de pantalla
    const preparando = $id("lowPrevPreparando");
    for (let k = 0; k < cuadros.length; k++) {
      if (!abierta(p)) return detener(p);
      const du = await global.dzSvgToPng(global.dzExportCuadroSvg(cuadros[k], porCamara), lado);
      const img = du ? await aImagen(du) : null;
      if (!abierta(p)) return detener(p);
      if (!img) continue;
      if (!p.imgs.length) {                       // el lienzo toma la forma del cuadro
        p.lienzo.width = img.naturalWidth; p.lienzo.height = img.naturalHeight;
      }
      p.imgs.push(img);
      if (p.imgs.length === 1) mostrar(p, 0);
      preparando.textContent = "Preparando la vista previa… " + (k + 1) + "/" + cuadros.length;
    }
    if (!p.imgs.length) { preparando.textContent = "No pude rasterizar ningún cuadro"; return; }
    if (p.imgs.length < cuadros.length) {
      // igual que el export: si se pierde un cuadro, se dice
      p.cuadros = p.cuadros.slice(0, p.imgs.length);
      preparando.textContent = "Faltan " + (cuadros.length - p.imgs.length) + " de " + cuadros.length +
        " cuadros: la exportación también va a salir más corta";
    } else preparando.hidden = true;
    p.barra.max = String(p.imgs.length - 1);
    p.barra.disabled = false;
    p.boton.disabled = false;
    mostrar(p, 0);
    p.boton.focus();                              // Espacio = ▶/⏸, sin atajos globales
  }

  global.dzVistaPreviaExport = dzVistaPreviaExport;
  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.vistaPrevia = {
    abrir: dzVistaPreviaExport,
    estado: () => actual && { cuadro: actual.cuadros[actual.i], i: actual.i, total: actual.imgs.length,
      reproduciendo: actual.reproduciendo, listo: !actual.boton.disabled },
  };
})(typeof window !== "undefined" ? window : globalThis);
