/* Extraido de app.js (biblia §12 AHORA·7). El archivo tenia 18.650 lineas, un
   tercio del frontend en un solo lugar, y cada funcion nueva lo hacia crecer.
   La regla desde v4.16.0: nada nuevo entra en app.js, y cada trabajo se lleva un
   pedazo afuera al salir. `tools/check_app_js_budget.py` lo hace cumplir.

   Estos modulos NO son IIFE con namespace como los de ui/animation: las
   funciones tienen que seguir siendo GLOBALES, porque los llaman los manejadores
   de la interfaz, la tabla de acciones de menu de app.js y los recorridos E2E
   por nombre. Cambiar eso a la vez que se mueve el codigo seria dos cambios
   mezclados; el namespace viene despues, con su propia prueba.

   Se carga DESPUES de app.js: usa DZ, $, dzSetStatus y compania en tiempo de
   ejecucion, nunca al definirse.


   EQUIPO: el panel de trabajo remoto. La sincronizacion vive en
   ui/collaboration/transport.js; aca esta el panel y el pegado con el documento. */

/* ══════════════════════════════════════════════════════════════════════════
   EQUIPO — trabajo remoto sobre el mismo proyecto

   Conecta con el relé propio (`server/low_relay.py`). Lo que se comparte:

     · QUIÉN ESTÁ y en qué cuadro y con qué herramienta.
     · QUÉ PIEZA tiene tomada cada uno. Los bloqueos los arbitra el servidor.
     · LO QUE SE DIBUJA, al nivel del NIVEL: cuando cambia algo, sale la
       instantánea de la capa y su nivel. Es grueso a propósito y por eso van
       de la mano con los bloqueos: si dos personas editan el MISMO nivel a la
       vez, la última instantánea gana y alguien pierde trazos. Tomando el
       nivel eso no pasa, y el panel lo dice con todas las letras.
     · COMENTARIOS sobre el cuadro.

   Lo que NO comparte: la pantalla. Eso es video en vivo entre navegadores
   (WebRTC), otra pieza y otro problema; el relé mueve texto.

   Lo remoto NO entra en el historial propio: el Ctrl+Z de uno no puede
   deshacer el trabajo del que está al lado.
   ══════════════════════════════════════════════════════════════════════════ */
const DZ_COLAB_CONF = "low.colab.conf";

/** Huella corta de un texto (FNV-1a). Se guarda esto y no el texto entero:
 *  comparar niveles guardando su JSON dejaba vivos cientos de kilobytes por
 *  nivel, para siempre, sólo para saber si algo cambió. */
function dzHuella(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return texto.length + ":" + h.toString(36);
}

function dzColabPanel() { return $("#dzColab"); }

function dzColabToggle() {
  const p = dzColabPanel();
  if (!p) return;
  const abrir = p.hidden;
  if (abrir) dzColabInit();
  p.hidden = !abrir;
  DZ.panelDock?.update?.();          // el muelle se reacomoda con el panel
  LOW.workspace?.panels?.update?.("colab", { visible: abrir });
  dzSetStatus(abrir ? "Panel de equipo abierto" : "Panel de equipo cerrado");
}

function dzColabConfGuardada() {
  try { return JSON.parse(localStorage.getItem(DZ_COLAB_CONF) || "{}"); }
  catch (e) { return {}; }
}

function dzColabInit() {
  const p = dzColabPanel();
  if (!p || p.dataset.listo) return;
  p.dataset.listo = "1";
  const c = dzColabConfGuardada();
  const set = (id, v) => { const el = $(id); if (el && v != null) el.value = v; };
  set("#colabUrl", c.url); set("#colabRoom", c.room);
  set("#colabNombre", c.nombre); set("#colabToken", c.token); set("#colabRol", c.rol);
  $("#colabCerrar").onclick = () => { p.hidden = true; DZ.panelDock?.update?.();
    LOW.workspace?.panels?.update?.("colab", { visible: false }); };
  $("#colabConectar").onclick = () => dzColabConectar();
  $("#colabDesconectar").onclick = () => dzColabDesconectar();
  $("#colabTomar").onclick = () => dzColabTomarNivel();
  $("#colabComentar").onclick = () => dzColabEnviarComentario();
  $("#colabTexto").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); dzColabEnviarComentario(); }
  });
  $("#colabSoloCuadro").onchange = () => dzColabComentsRender();
}

function dzColabEstado(estado, detalle) {
  const el = $("#colabEstado");
  if (!el) return;
  const textos = { cortado: "sin conectar", conectando: "conectando…", listo: "en línea",
                   reintentando: "reintentando…", denegado: "rechazado" };
  el.dataset.estado = estado;
  el.textContent = detalle || textos[estado] || estado;
  const conectado = estado === "listo";
  const bd = $("#colabDesconectar"), bc = $("#colabConectar");
  if (bd) bd.disabled = !DZ.colab;
  if (bc) bc.disabled = !!DZ.colab;
  const vivo = $("#colabVivo");
  if (vivo) vivo.hidden = !conectado;
}

function dzColabConectar() {
  if (DZ.colab) return;
  const url = ($("#colabUrl").value || "").trim();
  const room = ($("#colabRoom").value || "").trim();
  const nombre = ($("#colabNombre").value || "").trim();
  if (!url || !room || !nombre)
    return dzSetStatus("Para conectarte hacen falta servidor, proyecto y tu nombre");
  const token = $("#colabToken").value || "";
  const rol = $("#colabRol").value || "editor";
  // el id se guarda: si uno vuelve tras un corte tiene que ser el MISMO,
  // o sus propios bloqueos le quedan tomados por «otra persona»
  const guardada = dzColabConfGuardada();
  const id = guardada.id || (nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" +
             Math.random().toString(36).slice(2, 7));
  try {
    localStorage.setItem(DZ_COLAB_CONF, JSON.stringify({ url, room, nombre, token, rol, id }));
  } catch (e) { /* modo privado: se conecta igual, sólo no recuerda */ }

  const T = LOW.collaboration && LOW.collaboration.RelayTransport;
  if (!T) return dzSetStatus("Falta el módulo de trabajo remoto");
  let t;
  try {
    t = new T({ url, room, actor: { id, nombre, color: dzColabColor(id) }, rol, token: token || null });
  } catch (e) { return dzSetStatus("No se pudo conectar: " + e.message); }
  DZ.colab = t;

  t.on("estado", (e) => dzColabEstado(e.estado));
  t.on("reintento", (e) => dzColabEstado("reintentando",
    "reintentando en " + Math.round(e.espera / 1000) + " s"));
  t.on("denegado", (m) => {
    dzColabEstado("denegado", m.motivo || "rechazado");
    dzSetStatus("El servidor rechazó la conexión: " + (m.motivo || ""));
    DZ.colab = null;
    dzColabEstado("cortado");
  });
  t.on("presencia", () => dzColabGenteRender());
  t.on("bloqueos", () => { dzColabLocksRender(); dzColabAvisoNivel(); });
  t.on("comentarios", () => dzColabComentsRender());
  t.on("comentario", (c) => {
    dzColabComentsRender();
    if (c && c.actorId !== t.actorId) dzSetStatus("Comentario de " + (c.nombre || "alguien") +
      (c.cuadro ? " en el cuadro " + c.cuadro : ""));
  });
  t.on("rechazado", (m) => dzSetStatus(m.motivo || "el servidor rechazó un cambio"));
  t.on("operacion", (e) => dzColabAplicar(e));
  t.conectar();
  dzColabEstado("conectando");
  dzColabVigilar();
}

function dzColabDesconectar() {
  if (!DZ.colab) return;
  DZ.colab.desconectar();
  DZ.colab = null;
  if (DZ.colabLatido) { clearInterval(DZ.colabLatido); DZ.colabLatido = null; }
  dzColabEstado("cortado");
  dzColabGenteRender(); dzColabLocksRender();
  dzSetStatus("Desconectado del equipo");
}

function dzColabColor(id) {
  const paleta = ["#d2564e", "#d99a3a", "#48a06c", "#4a86c8", "#8d6bbf", "#3f9c9c"];
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n * 31 + id.charCodeAt(i)) % 997;
  return paleta[n % paleta.length];
}

/* ── lo que sale ────────────────────────────────────────────────────────── */

/** Se manda la instantánea de la capa y el nivel que se tocaron, agrupada:
 *  un trazo produce muchos avisos seguidos y no hay por qué mandar veinte
 *  copias del mismo nivel. */
function dzColabVigilar() {
  if (!DZ.doc) return;
  if (!DZ.colabWatchedDocs) DZ.colabWatchedDocs = new WeakSet();
  if (DZ.colabWatchedDocs.has(DZ.doc)) return;
  DZ.colabWatchedDocs.add(DZ.doc);
  DZ.colabVigilando = true;
  DZ.doc.subscribe((doc, motivo) => {
    // Las solapas conservan su LowDoc. Un aviso tardio de una solapa
    // inactiva nunca debe publicarse como si perteneciera a la visible.
    if (DZ.doc !== doc) return;
    if (!DZ.colab || DZ.colab.estado !== "listo") return;
    if (motivo === "frame") {
      // OJO: esto corre una vez POR CUADRO, y en reproduccion son 24 por
      // segundo. Todo lo que se cuelgue aca se paga en la fluidez del programa
      // entero — medido: 60 cuadros pasaban de 206 ms a 553 ms conectado.
      dzColabPresencia();                    // va limitada a una por segundo
      // La lista de comentarios solo depende del cuadro cuando el filtro
      // «solo este cuadro» esta puesto. Repintarla siempre costaba 7 ms por
      // cuadro con apenas cuarenta comentarios, y crece con cada uno nuevo.
      const filtro = $("#colabSoloCuadro");
      if (filtro && filtro.checked && !dzColabReproduciendo()) dzColabComentsRender();
      dzColabAvisoNivel();
      return;
    }
    if (motivo !== "content" && motivo !== "cells" && motivo !== "level") return;
    if (DZ.colabAplicando) return;           // esto vino de la red: no rebotarlo
    if (dzColabReproduciendo()) return;      // reproducir no edita nada
    const ly = doc.layer, lv = doc.level;
    if (!ly && !lv) return;
    clearTimeout(DZ.colabEnvio);
    DZ.colabEnvio = setTimeout(() => dzColabEnviarNivel(ly && ly.id, lv && lv.id), 350);
  });
  if (!DZ.colabLatido) {
    // el relé da por ido al que no da señales en 20 s
    DZ.colabLatido = setInterval(() => dzColabPresencia(true), 8000);
  }
  dzColabPresencia();
}

function dzColabEnviarNivel(layerId, levelId) {
  const t = DZ.colab;
  if (!t || t.estado !== "listo" || !DZ.doc) return false;
  if (t.rol !== "editor" && t.rol !== "owner") return false;
  const snap = DZ.doc.snapshotPara(layerId, levelId);
  if (!snap || (!snap.layers.length && !snap.levels.length)) return false;
  const clave = String(levelId || layerId || ""), texto = dzHuella(JSON.stringify(snap));
  // No se manda lo que ya está allá afuera. La bandera `colabAplicando` tapa el
  // rebote inmediato, pero lo recibido vuelve a pasar por el lienzo y sale otra
  // vez un instante después: dos personas quedaban devolviéndose la misma
  // instantánea sin fin. Comparar el contenido corta ese ida y vuelta de raíz.
  DZ.colabUltimo = DZ.colabUltimo || {};
  if (DZ.colabUltimo[clave] === texto) return false;
  DZ.colabUltimo[clave] = texto;
  const op = { id: t.actor.id + ":" + (DZ.colabSeq = (DZ.colabSeq || 0) + 1),
               type: "snapshot.level", target: clave, payload: snap };
  t.enviarOp(op);
  return true;
}

/** ¿Esta corriendo la animacion? Mientras se reproduce no hay ediciones que
 *  mandar y nadie necesita ver la cabeza lectora del otro moverse cuadro a
 *  cuadro: es el momento en que MENOS hay que molestar al programa. */
function dzColabReproduciendo() {
  return !!(DZ.playback && (DZ.playback.playing || DZ.playback.isPlaying));
}

/** Donde esta uno. Va LIMITADA: una por segundo alcanza de sobra para que el
 *  equipo sepa en que cuadro anda cada cual, y sin el limite eran veinticuatro
 *  mensajes por segundo y por persona atravesando el rele para nada. */
function dzColabPresencia(forzar) {
  const t = DZ.colab;
  if (!t || t.estado !== "listo" || !DZ.doc) return false;
  const ahora = Date.now();
  if (!forzar && DZ.colabPresenciaAt && ahora - DZ.colabPresenciaAt < 1000) return false;
  DZ.colabPresenciaAt = ahora;
  return t.presencia({ cuadro: DZ.doc.frame || 1, herramienta: DZ.tool || "",
                       capa: (DZ.doc.layer && DZ.doc.layer.name) || "" });
}

/* ── lo que entra ───────────────────────────────────────────────────────── */

function dzColabAplicar(e) {
  const op = e && e.op;
  if (!op || op.type !== "snapshot.level" || !DZ.doc) return;
  DZ.colabAplicando = true;                  // no reenviar lo que acabo de recibir
  DZ.colabUltimo = DZ.colabUltimo || {};
  DZ.colabUltimo[String(op.target || "")] = dzHuella(JSON.stringify(op.payload));
  try {
    if (DZ.doc.applyRemoteSnapshot(op.payload)) {
      const quien = (DZ.colab && (DZ.colab.actores.find((a) => a.id === op.actorId) || {}).nombre) || "alguien";
      dzSetStatus("Cambio de " + quien);
    }
  } finally { setTimeout(() => { DZ.colabAplicando = false; }, 0); }
}

/* ── bloqueos ───────────────────────────────────────────────────────────── */

function dzColabRecursoNivel(levelId) { return "nivel:" + levelId; }

async function dzColabTomarNivel() {
  const t = DZ.colab;
  if (!t || t.estado !== "listo" || !DZ.doc) return;
  const lv = DZ.doc.level;
  if (!lv) return dzSetStatus("No hay nivel seleccionado");
  const recurso = dzColabRecursoNivel(lv.id);
  const mio = t.bloqueos[recurso];
  if (mio && mio.actorId === t.actorId) { t.soltar(recurso); return dzSetStatus("Soltaste «" + lv.name + "»"); }
  const r = await t.bloquear(recurso, 600);
  if (r.ok) dzSetStatus("Tomaste «" + lv.name + "»: nadie más lo edita mientras tanto");
  else if (r.sinRed) dzSetStatus("Sin conexión: no se pudo tomar el nivel");
  else dzSetStatus("«" + lv.name + "» lo tiene " + (r.de || "otra persona"));
}

/** Aviso visible cuando uno está parado sobre un nivel que tomó otro. No se
 *  bloquea el dibujo —eso enfurece a cualquiera que esté probando algo—, se
 *  avisa: el que sigue igual sabe que su instantánea puede perder. */
function dzColabAvisoNivel() {
  const t = DZ.colab, aviso = $("#colabAvisoNivel");
  const lv = DZ.doc && DZ.doc.level;
  const b = t && lv ? t.bloqueadaPorOtro(dzColabRecursoNivel(lv.id)) : null;
  document.body.classList.toggle("colab-nivel-ajeno", !!b);
  if (aviso) aviso.textContent = b ? "«" + lv.name + "» lo está editando " + (b.nombre || "otro") : "";
}

/* ── pintado del panel ──────────────────────────────────────────────────── */

function dzColabGenteRender() {
  const ul = $("#colabGente"), t = DZ.colab;
  if (!ul) return;
  const gente = (t && t.actores) || [];
  ul.innerHTML = "";
  if (!gente.length) { ul.innerHTML = '<li class="colab-vacio">nadie más por ahora</li>'; return; }
  gente.forEach((a) => {
    const li = document.createElement("li");
    const yo = t && a.id === t.actorId;
    li.innerHTML = '<i class="colab-punto"></i><b></b><span></span>';
    li.querySelector(".colab-punto").style.background = a.color || dzColabColor(a.id || "");
    li.querySelector("b").textContent = (a.nombre || a.id) + (yo ? " (vos)" : "");
    const donde = [];
    if (a.cuadro) donde.push("cuadro " + a.cuadro);
    if (a.herramienta) donde.push(a.herramienta);
    if (a.rol && a.rol !== "editor") donde.push(a.rol);
    li.querySelector("span").textContent = donde.join(" · ");
    ul.appendChild(li);
  });
}

function dzColabLocksRender() {
  const ul = $("#colabLocks"), t = DZ.colab;
  if (!ul) return;
  const bl = (t && t.bloqueos) || {};
  const claves = Object.keys(bl);
  ul.innerHTML = "";
  if (!claves.length) { ul.innerHTML = '<li class="colab-vacio">ninguna pieza tomada</li>'; return; }
  claves.forEach((k) => {
    const b = bl[k], mio = t && b.actorId === t.actorId;
    const nivel = DZ.doc && DZ.doc.scene.level(k.replace(/^nivel:/, ""));
    const li = document.createElement("li");
    li.className = mio ? "colab-lock-mio" : "";
    li.innerHTML = "<b></b><span></span>";
    li.querySelector("b").textContent = nivel ? nivel.name : k;
    li.querySelector("span").textContent = mio ? "vos" : (b.nombre || b.actorId);
    if (mio) {
      const x = document.createElement("button");
      x.textContent = "soltar";
      x.onclick = () => { t.soltar(k); };
      li.appendChild(x);
    }
    ul.appendChild(li);
  });
}

function dzColabComentsRender() {
  const ul = $("#colabComents"), t = DZ.colab;
  if (!ul) return;
  const solo = $("#colabSoloCuadro") && $("#colabSoloCuadro").checked;
  const cuadro = (DZ.doc && DZ.doc.frame) || 0;
  let lista = (t && t.comentarios) || [];
  if (solo) lista = lista.filter((c) => Number(c.cuadro) === cuadro);
  ul.innerHTML = "";
  if (!lista.length) {
    ul.innerHTML = '<li class="colab-vacio">' + (solo ? "nada sobre este cuadro" : "sin comentarios") + "</li>";
    return;
  }
  lista.slice(-60).forEach((c) => {
    const li = document.createElement("li");
    li.className = c.resuelto ? "colab-com-ok" : "";
    li.innerHTML = "<header><b></b><i></i></header><p></p>";
    li.querySelector("b").textContent = c.nombre || c.actorId || "";
    li.querySelector("i").textContent = c.cuadro ? "cuadro " + c.cuadro : "";
    li.querySelector("p").textContent = c.texto || "";
    // dzGoFrame es 0-based sobre la barra de cuadros; el comentario guarda el
    // número de cuadro tal como lo ve el animador. Sin el -1, clickear
    // «cuadro 7» aterriza en el 8.
    if (c.cuadro) li.querySelector("i").onclick = () => dzGoFrame(Number(c.cuadro) - 1);
    const b = document.createElement("button");
    b.textContent = c.resuelto ? "reabrir" : "resolver";
    b.onclick = () => { if (t) t.resolverComentario(c.id, !c.resuelto); };
    li.querySelector("header").appendChild(b);
    ul.appendChild(li);
  });
  ul.scrollTop = ul.scrollHeight;
}

function dzColabEnviarComentario() {
  const t = DZ.colab, campo = $("#colabTexto");
  if (!t || !campo) return;
  const c = t.comentar(campo.value, (DZ.doc && DZ.doc.frame) || 0);
  if (!c) return dzSetStatus(t.estado === "listo" ? "El comentario está vacío" : "Sin conexión");
  campo.value = "";
}

/* Nombres que la interfaz y los recorridos usan por nombre global. */
window.dzHuella = dzHuella;
window.dzColabPanel = dzColabPanel;
window.dzColabToggle = dzColabToggle;
window.dzColabConfGuardada = dzColabConfGuardada;
window.dzColabInit = dzColabInit;
window.dzColabEstado = dzColabEstado;
window.dzColabConectar = dzColabConectar;
window.dzColabDesconectar = dzColabDesconectar;
window.dzColabColor = dzColabColor;
window.dzColabVigilar = dzColabVigilar;
window.dzColabEnviarNivel = dzColabEnviarNivel;
window.dzColabReproduciendo = dzColabReproduciendo;
window.dzColabPresencia = dzColabPresencia;
window.dzColabAplicar = dzColabAplicar;
window.dzColabRecursoNivel = dzColabRecursoNivel;
window.dzColabAvisoNivel = dzColabAvisoNivel;
window.dzColabGenteRender = dzColabGenteRender;
window.dzColabLocksRender = dzColabLocksRender;
window.dzColabComentsRender = dzColabComentsRender;
window.dzColabEnviarComentario = dzColabEnviarComentario;
