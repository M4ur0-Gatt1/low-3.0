/* ══════════════════════════════════════════════════════════════════════════
   EL RESCATE ANTE CAÍDAS, EN DISCO (v3.45, cierre de la fase 1 del camino a la
   estabilidad: «que no se pierda nada»)

   El rescate de cada documento y de cada escena (lo sin guardar, por si LOW se
   cierra mal) vivía en el almacenamiento del navegador, ~5 MB por origen: un
   documento de más de 2,5 MB, o el almacén lleno, y no había rescate. Ahora,
   adentro de LOW, cada clave es un archivo en %APPDATA%/LOW/rescate/
   (almacen3d.py: escritura atómica con respaldo).

   CÓMO, SIN TOCAR LA LÓGICA DEL RESCATE. Los dos almacenes de
   workspace/recovery.js hablan con un objeto con la forma del almacenamiento
   del navegador (getItem/setItem/removeItem). Acá hay uno igual: lee de la
   memoria al instante y escribe al disco en cola, una escritura por clave a la
   vez y la última gana. Se les cambia `storage` y siguen como estaban.

   LAS REGLAS, las mismas que las bibliotecas de la 3.44:
   - al arrancar se leen todos los rescates del disco y se suman a lo que había
     en el navegador: por clave, el más nuevo gana (el índice de escenas se une);
     lo del navegador pasa al disco y recién se borra de ahí cuando el disco
     confirma;
   - lo que se escribe mientras se lee el disco no lo pisa la lectura;
   - abrir un documento ESPERA a que termine la lectura (si no, se abría sin
     ofrecer el rescate y el autoguardado lo pisaba);
   - si el disco falla: copia en el navegador y AVISO (workspace/rescate-aviso.js);
   - sin el puente al disco (un navegador suelto), el navegador, como antes.

   @module workspace/rescate-disco
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const PREFIJOS = ["low.document.recovery.", "low.scene.recovery.v2."];
  const esRescate = (k) => PREFIJOS.some((p) => String(k).indexOf(p) === 0);
  const esIndice = (k) => /\.index$/.test(k);
  const marca = (texto) => { try { return Number(JSON.parse(texto).savedAt) || 0; } catch (_) { return 0; } };
  const lista = (texto) => { try { const v = JSON.parse(texto || "[]"); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const nav = () => { try { return global.localStorage; } catch (_) { return null; } };
  const api = () => { const a = global.pywebview && global.pywebview.api; return a && typeof a.rescate_guardar === "function" ? a : null; };
  const aviso = (clave, motivo) => { try { global.LOW.workspace.rescateAviso.avisar("disco:" + clave, 0, motivo); } catch (_) { console.warn("[rescate] " + motivo); } };

  class AlmacenRescate {
    constructor() {
      this.mapa = new Map();
      this.estado = "navegador";          // navegador | leyendo | disco
      this.tocadas = new Set();            // claves escritas o borradas en esta sesión
      this.cola = new Map();               // clave → {texto|null}: lo que falta escribir
      this.enCurso = new Set();
    }
    /* EN MODO NAVEGADOR ES UN PASAMANOS: lee y escribe el navegador directo,
       como antes de la 3.45 (una foto tomada al arrancar no veía lo escrito
       después, y la poda no podía tirarlo). La memoria manda desde que empieza
       la lectura del disco. */
    get _nav() { return this.estado === "navegador"; }
    _foto() {
      const ls = nav();
      try { if (ls) for (const k of Object.keys(ls)) if (esRescate(k)) this.mapa.set(k, ls.getItem(k)); } catch (_) { /* sin almacén */ }
    }
    // ── la forma del almacenamiento del navegador ──
    getItem(k) {
      if (this._nav) { try { return nav() ? nav().getItem(k) : null; } catch (_) { return null; } }
      return this.mapa.has(k) ? this.mapa.get(k) : null;
    }
    keys() {
      if (this._nav) { try { return nav() ? Object.keys(nav()).filter(esRescate) : []; } catch (_) { return []; } }
      return [...this.mapa.keys()];
    }
    key(i) { return this.keys()[i] ?? null; }
    get length() { return this.keys().length; }
    setItem(k, v) {
      v = String(v);
      // como antes: si no entra, TIRA (los almacenes podan y reintentan)
      if (this._nav) { const ls = nav(); if (ls) ls.setItem(k, v); return; }
      this.mapa.set(k, v); this.tocadas.add(k);
      this._encolar(k, v);
    }
    removeItem(k) {
      try { nav() && nav().removeItem(k); } catch (_) { /* sin almacén */ }
      if (this._nav) return;
      this.mapa.delete(k);
      this.tocadas.add(k); this._encolar(k, null);
    }
    // ── el disco ──
    _encolar(k, texto) {
      this.cola.set(k, texto);
      if (!this.enCurso.has(k)) void this._vaciar(k);
    }
    async _vaciar(k) {
      this.enCurso.add(k);
      while (this.cola.has(k)) {
        const texto = this.cola.get(k); this.cola.delete(k);
        let r;
        try { r = texto === null ? await api().rescate_borrar(k) : await api().rescate_guardar(k, texto); }
        catch (e) { r = { error: String((e && e.message) || e) }; }
        if (r && r.ok) {
          // ya está en el disco: el navegador no guarda obra
          if (texto !== null) { try { nav() && nav().removeItem(k); } catch (_) { /* */ } }
          try { global.LOW.workspace.rescateAviso.avisados.delete("disco:" + k); } catch (_) { /* */ }
        } else if (texto !== null) {
          let copia = false;
          try { nav().setItem(k, texto); copia = true; } catch (_) { /* tampoco entró */ }
          aviso(k, ((r && r.error) || "sin respuesta") + (copia ? "; quedó una copia en el navegador" : ""));
        }
      }
      this.enCurso.delete(k);
    }
    /** ¿Queda algo por escribir? (para las pruebas) */
    escribiendo() { return this.cola.size > 0 || this.enCurso.size > 0; }
    /** Lee el disco y suma lo del navegador. Una sola vez. */
    async leer() {
      const a = api();
      if (!a) return;                       // sin puente: el navegador, como antes
      this._foto();
      this.estado = "leyendo";
      let r;
      try { r = await a.rescate_leer_todo(); } catch (e) { r = { error: String((e && e.message) || e) }; }
      if (!r || r.error || r.sinApp) {
        // sin puente, o no se pudo leer: se vuelve al navegador (escribir el disco
        // a ciegas podría pisar un rescate que no se vio). Lo escrito mientras
        // tanto pasa al navegador.
        this.cola.clear();
        const ls = nav();
        for (const k of this.tocadas) {
          try { if (this.mapa.has(k)) ls.setItem(k, this.mapa.get(k)); else ls.removeItem(k); } catch (_) { /* no entró */ }
        }
        this.tocadas.clear(); this.mapa.clear();
        this.estado = "navegador";
        if (!(r && r.sinApp)) aviso("lectura", "no se pudo leer la carpeta de rescates: " + ((r && r.error) || "sin respuesta"));
        return;
      }
      this.estado = "disco";
      const delDisco = r.registros || {};
      // 1. lo del disco entra donde la sesión no escribió y es más nuevo; el
      //    índice de escenas se UNE siempre (si no, lo del disco no se lista)
      for (const [k, texto] of Object.entries(delDisco)) {
        if (!esRescate(k)) continue;
        if (esIndice(k)) {
          const junto = JSON.stringify([...new Set([...lista(texto), ...lista(this.mapa.get(k))])]);
          if (junto !== this.mapa.get(k)) { this.mapa.set(k, junto); if (this.tocadas.has(k)) this._encolar(k, junto); }
          continue;
        }
        if (this.tocadas.has(k)) continue;
        if (!this.mapa.has(k) || marca(texto) >= marca(this.mapa.get(k))) this.mapa.set(k, texto);
      }
      // 2. todo lo que el disco no tiene igual, al disco (el pase del navegador)
      for (const [k, texto] of this.mapa) {
        if (this.tocadas.has(k)) continue;     // ya está en la cola
        if (delDisco[k] === texto) { try { nav() && nav().removeItem(k); } catch (_) { /* */ } continue; }
        this._encolar(k, texto);
      }
      if (r.rotos) aviso("rotos", r.rotos + (r.rotos === 1 ? " rescate ilegible" : " rescates ilegibles") + " en la carpeta de rescates");
    }
  }

  const almacen = new AlmacenRescate();
  const ws = (global.LOW = global.LOW || {}).workspace = global.LOW.workspace || {};
  function enchufar() {
    if (ws.recovery) { ws.recovery.storage = almacen; }
    if (ws.sceneRecovery) ws.sceneRecovery.storage = almacen;
  }
  enchufar();

  /* ABRIR ESPERA A LA LECTURA. Un .low abierto por doble clic, o «Abrir…» en el
     primer segundo, consultaba el rescate antes de que llegara del disco: no
     lo ofrecía, y el autoguardado de lo abierto lo pisaba. */
  let soltar;
  const listo = new Promise((r) => { soltar = r; });
  setTimeout(() => soltar(), 10000);        // nunca colgar la apertura
  const ESPERAN = ["openDesign", "dzDocInit", "dzSceneOpen", "dzEscenaConRescate", "dzEscenaRescatar"];
  function hacerEsperar() {
    for (const n of ESPERAN) {
      const original = global[n];
      if (typeof original !== "function" || original.__esperaRescate) continue;
      const envuelta = async function () { await listo; return original.apply(this, arguments); };
      envuelta.__esperaRescate = true;
      global[n] = envuelta;
    }
  }
  if (global.document && global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", hacerEsperar, { once: true });
  else hacerEsperar();

  async function arrancar() {
    if (almacen.estado !== "navegador" || arrancar.hecho) return;
    arrancar.hecho = true;
    enchufar();
    if (api()) {
      try { await almacen.leer(); } catch (_) { /* se sigue con el navegador */ }
      if (almacen.estado === "disco" && ws.recovery) ws.recovery.tope = 256 * 1024 * 1024;
    }
    soltar();
    // la invitación del 2D se pintó antes de que llegara el disco: se repinta
    // para que ofrezca el rescate que acaba de aparecer
    try {
      if (global.document.querySelector("#dzBienvenida2D") && global.dzBienvenida2DQuitar && global.dzBienvenida2DPintar) {
        global.dzBienvenida2DQuitar(); global.dzBienvenida2DPintar();
      }
    } catch (_) { /* la invitación es vista */ }
    try { global.dispatchEvent(new Event("low:rescate-listo")); } catch (_) { /* */ }
  }
  if (api()) void arrancar();
  else global.addEventListener("pywebviewready", () => { void arrancar(); });

  ws.rescateDisco = { almacen, listo, estado: () => almacen.estado, escribiendo: () => almacen.escribiendo() };
})(typeof window !== "undefined" ? window : globalThis);
