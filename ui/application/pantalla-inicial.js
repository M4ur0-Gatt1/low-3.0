/* ══════════════════════════════════════════════════════════════════════════
   LA PRIMERA PANTALLA ES EL MÓDULO 2D

   Decisión de Mauro, y da vuelta la jerarquía que tenía LOW: «mantengamos un
   solo programa avanzando más sobre el módulo 2D y haciéndolo más presente, que
   sea la primera pantalla, y que la IA y redes sean un botón — al revés de lo
   que es ahora».

   Hasta acá LOW abría en el lado programador —la conversación con el agente, el
   árbol del proyecto, las herramientas de código— y el estudio de dibujo vivía
   detrás del ícono de la pluma. Ahora es lo contrario: se abre dibujando, y al
   agente se va por un botón.

   TRES CUIDADOS, y los tres salieron de mirar qué pasaba de verdad:

   1. NO SE CREA NINGÚN ARCHIVO AL ARRANCAR. El camino que ya existía para
      «entrar al diseño» llama a `new_design()`, que escribe un
      `disenos/diseno_<fecha>.svg` en el disco. Usarlo en el arranque dejaría un
      SVG nuevo por cada vez que abrís LOW. Así que la primera pantalla se abre
      VACÍA y sólo crea cuando se lo pide.

   2. EL MÓDULO VACÍO SE VEÍA ROTO. Medido: abrir el estudio sin documento deja
      las herramientas y los paneles, y en el medio un damero enorme sin lienzo,
      sin pestañas y sin nada que hacer. Eso no es una pantalla de bienvenida,
      es una pantalla que parece fallada. Por eso hay una invitación con las dos
      únicas cosas que uno quiere hacer al abrir: empezar algo nuevo o seguir
      algo que ya existe.

   3. EL BOTÓN A LA IA NO PUEDE SER EL DE CERRAR. El botón X del estudio corre
      `closeDesign()`, que CIERRA EL DOCUMENTO —no cambia de pantalla—. Usarlo
      como interruptor te haría perder el dibujo. El botón nuevo sólo esconde el
      estudio; el documento queda abierto y volver es inmediato.

   Las dos acciones de la invitación reusan las del menú Archivo por su nombre
   (`nuevo` y `escena-abrir`), que son las probadas; no hay un segundo camino
   para crear o abrir.

   @module application/pantalla-inicial
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  const ID_INVITACION = "dzBienvenida2D";
  const ID_BOTON_IA = "dzIrAlAgente";
  const ID_BOTON_3D = "dzIrAl3D";

  /* OJO CON ESTO: `DZ` se declara con `const` en app.js, así que NO existe como
     `window.DZ` — hay que nombrarlo suelto, que resuelve el binding léxico que
     los scripts clásicos comparten. Leyendo `global.DZ` esto devolvía siempre
     false y la invitación no se iba nunca aunque hubiera un documento abierto.
     Lo mismo pasa con `api`, que tampoco vive en window. */
  function hayTrabajoAbierto() {
    if (typeof DZ === "undefined" || !DZ) return false;
    if (DZ.path || DZ.doc) return true;
    /* Y ADEMAS LAS PESTANAS, que es lo que salio de medirlo en la app real: con
       un diseno .svg abierto —dos pestanas, siete cuadros— `DZ.path` y `DZ.doc`
       estaban los dos en null, asi que la invitacion se quedaba CLAVADA encima
       del documento y tapandolo. La contabilidad de «que hay abierto» son
       `documentTabs` / `activeDocumentTab`: es con eso que app.js decide si
       muestra la barra de pestanas. */
    if (DZ.activeDocumentTab) return true;
    return !!(DZ.documentTabs && DZ.documentTabs.length);
  }

  /** ¿Quedó trabajo sin guardar de una sesión que se cortó?
   *
   *  NO se puede usar `dzSceneRecovered()`: ésa pide la identidad del documento
   *  ACTUAL, y al arrancar no hay ninguno —devuelve null aunque el rescate esté
   *  guardado, medido—. El almacén sí se puede listar, y se pregunta por
   *  contenido de verdad con la misma vara que usa `dzDocInit`: un dibujo con
   *  más de 40 caracteres de geometría. Un lienzo en blanco no es «trabajo». */
  function hayRescate() {
    // HAY DOS RESCATES, y el que importa es el del DOCUMENTO.
    //
    // `LOW.workspace.recovery` guarda el SVG del lienzo con 450 ms de retardo:
    // es el que tiene los últimos trazos. `LOW.workspace.sceneRecovery` guarda
    // el modelo de la escena y se escribe en momentos más gruesos — medido: tras
    // dibujar un trazo y matar el proceso, el punto de la escena tenía 189 bytes
    // de lienzo VACÍO y el del documento sí traía el trazo.
    //
    // El del documento no se puede listar: `DocumentRecovery` indexa por hash de
    // la ruta y sólo ofrece `get(path)`. Pero cada valor guarda su propia ruta
    // adentro, así que se recorren las claves con su prefijo.
    let mejor = null;
    try {
      for (const clave of Object.keys(localStorage)) {
        if (clave.indexOf("low.document.recovery.") !== 0) continue;
        let v = null;
        try { v = JSON.parse(localStorage.getItem(clave) || "null"); } catch (_) { continue; }
        if (!v || !v.path || !v.content) continue;
        if (!mejor || (v.savedAt || 0) > (mejor.savedAt || 0))
          mejor = { tipo: "documento", ruta: v.path, savedAt: v.savedAt };
      }
    } catch (_) { /* sin almacenamiento */ }
    if (mejor) return mejor;
    // Y si no hay ninguno, el de la escena. Se pregunta por contenido de verdad
    // con la misma vara que usa `dzDocInit`: más de 40 caracteres de geometría.
    // Un lienzo en blanco no es «trabajo».
    const almacen = global.LOW && global.LOW.workspace && global.LOW.workspace.sceneRecovery;
    if (!almacen || typeof almacen.list !== "function") return null;
    try {
      const r = almacen.list().find((x) => ((x.content && x.content.scene &&
        x.content.scene.levels) || []).some((nivel) => (nivel.drawings || [])
          .some((d) => d.content && d.content.length > 40)));
      return r ? { tipo: "escena", savedAt: r.savedAt } : null;
    } catch (_) { return null; }
  }

  function soloElNombre(ruta) {
    const partes = String(ruta || "").split(/[\\/]/);
    return partes[partes.length - 1] || "el dibujo";
  }

  function cuandoFue(marca) {
    const t = Number(marca);
    if (!Number.isFinite(t) || t <= 0) return "";
    const minutos = Math.round((Date.now() - t) / 60000);
    if (minutos < 1) return " · de hace un instante";
    if (minutos < 60) return " · de hace " + minutos + " min";
    const horas = Math.round(minutos / 60);
    if (horas < 24) return " · de hace " + horas + (horas === 1 ? " hora" : " horas");
    try { return " · del " + new Date(t).toLocaleDateString(); } catch (_) { return ""; }
  }

  /** Esconde el estudio SIN cerrar el documento, y deja el lado del agente a la
   *  vista. Volver es el botón de la pluma en la barra izquierda. */
  function dzIrAlAgente() {
    cerrarEl3D();
    const vista = document.querySelector("#designView");
    if (vista) vista.hidden = true;
    const pluma = document.querySelector("#abDesign");
    if (pluma) pluma.classList.add("vuelve-al-2d");
    if (typeof global.dzSetStatus === "function")
      global.dzSetStatus("IA y redes — la pluma de la barra izquierda te devuelve al dibujo");
    return true;
  }

  /** La vuelta al estudio, sin crear nada.
   *
   *  El botón de la pluma corría `designEntry()`, que si no hay un `DZ.path`
   *  llama a `new_design()` y ESCRIBE un archivo. Eso era tolerable cuando
   *  entrar al diseño pasaba una vez por sesión; ahora que la IA es un botón, el
   *  viaje de ida y vuelta es constante, y cada vuelta dejaría un SVG nuevo en
   *  `disenos/`. Peor: con un documento `.low` abierto `DZ.path` puede estar en
   *  null, así que el archivo se crearía teniendo trabajo abierto.
   *
   *  Así que la vuelta primero MUESTRA lo que ya hay; sólo si de verdad no hay
   *  nada abierto delega en el camino de siempre. */
  function dzVolverAlEstudio() {
    cerrarEl3D();
    const vista = document.querySelector("#designView");
    document.querySelector("#abDesign")?.classList.remove("vuelve-al-2d");
    if (hayTrabajoAbierto()) {
      if (vista) vista.hidden = false;
      quitarInvitacion();
      return true;
    }
    if (vista) { vista.hidden = false; pintarInvitacion(); return true; }
    return typeof global.designEntry === "function" ? global.designEntry() : false;
  }

  /** CAMBIAR DE PANTALLA CIERRA EL 3D, y esto no es por prolijidad.
   *
   *  `#l3dView` está en z-index 62 y `#designView` en 61, así que el estudio 3D
   *  TAPA el 2D. Mostrar el 2D sin cerrar el 3D deja al dibujante pidiendo
   *  volver al dibujo y mirando otra pantalla. Medido: al apretar la pluma con
   *  el 3D abierto, `#designView` visible y `elementFromPoint` en el medio de la
   *  mesa devolviendo `#l3dFrame`. */
  function cerrarEl3D() {
    const vista = document.querySelector("#l3dView");
    if (!vista || vista.hidden) return false;
    if (typeof global.closeL3d === "function") { global.closeL3d(); return true; }
    vista.hidden = true;
    return true;
  }

  /** DEL ESTUDIO 2D AL 3D, que si no no había manera.
   *
   *  La única puerta al estudio 3D es el botón de la barra izquierda, y esa
   *  barra queda TAPADA por `#designView`, que es `position:fixed; inset:0`.
   *  Medido: con el 2D abierto, `elementFromPoint` sobre la pluma y sobre el
   *  botón del 3D devuelve el propio `#designView`. Mientras LOW abría en el
   *  lado programador eso no se notaba —ahí la barra sí se alcanza—, pero desde
   *  que el 2D es la primera pantalla el estudio 3D quedó sin entrada: había que
   *  irse a la IA primero. Es un agujero que abrió la inversión de v4.28.0, así
   *  que se tapa desde acá y con el mismo patrón que el botón a la IA. */
  function dzIrAl3D() {
    if (typeof global.openL3d !== "function") {
      global.dzSetStatus?.("El estudio 3D no está disponible en esta ventana");
      return false;
    }
    global.openL3d();
    global.dzSetStatus?.("Estudio 3D — «Volver» arriba te devuelve al dibujo, " +
      "y el documento 2D queda abierto");
    return true;
  }

  /** El botón permanente del estudio. Va al lado del que cierra el documento,
   *  pero NO es ése: éste sólo cambia de pantalla. */
  function ponerBoton() {
    if (document.querySelector("#" + ID_BOTON_IA)) return;
    const cerrar = document.querySelector("#dzClose");
    if (!cerrar || !cerrar.parentElement) return;
    const boton = document.createElement("button");
    boton.className = "ibtn dz-ir-agente";
    boton.id = ID_BOTON_IA;
    boton.title = "IA y redes — el agente, el proyecto y los módulos de código. " +
      "El documento queda abierto: se vuelve con la pluma de la izquierda.";
    boton.innerHTML = '<svg class="ico"><use href="#i-sparkle"/></svg><span>IA</span>';
    boton.onclick = dzIrAlAgente;
    cerrar.parentElement.insertBefore(boton, cerrar);
    ponerBoton3D(cerrar);
  }

  /** El botón al estudio 3D, al lado del de la IA. */
  function ponerBoton3D(cerrar) {
    if (!cerrar || !cerrar.parentElement) return;
    if (document.querySelector("#" + ID_BOTON_3D)) return;
    const boton = document.createElement("button");
    boton.className = "ibtn dz-ir-agente dz-ir-3d";
    boton.id = ID_BOTON_3D;
    boton.title = "LOW Estudio — dibujo 3D con guías. El documento 2D queda " +
      "abierto: se vuelve con «Volver», arriba del estudio 3D.";
    boton.innerHTML = '<svg class="ico"><use href="#i-cube-sketch"/></svg><span>3D</span>';
    boton.onclick = dzIrAl3D;
    cerrar.parentElement.insertBefore(boton, cerrar);
  }

  /** La invitación, sólo cuando no hay nada abierto. */
  function pintarInvitacion() {
    const lienzo = document.querySelector("#dzCanvas");
    if (!lienzo) return;
    if (hayTrabajoAbierto()) { quitarInvitacion(); return; }
    if (document.querySelector("#" + ID_INVITACION)) return;
    const caja = document.createElement("div");
    caja.id = ID_INVITACION;
    caja.className = "bien2d";
    caja.innerHTML = `<div class="bien2d-cuerpo">
      <h2>Animación 2D</h2>
      <p>Dibujo cuadro a cuadro, X-sheet, esqueletos, cámara y multiplano.</p>
      <div class="bien2d-acciones">
        <button type="button" data-a="nuevo" class="bien2d-primario" disabled>Nuevo documento</button>
        <button type="button" data-a="abrir" disabled>Abrir documento…</button>
      </div>
      <div class="bien2d-rescate" hidden>
        <p></p>
        <button type="button" data-a="rescate" disabled>Recuperar lo que quedó sin guardar</button>
      </div>
      <button type="button" data-a="agente" class="bien2d-agente">o ir a IA y redes</button>
      <p class="bien2d-espera">Preparando LOW…</p>
    </div>`;
    // Las dos acciones son las del menú Archivo, por su nombre: no hay un
    // segundo camino para crear ni para abrir.
    caja.querySelector('[data-a="nuevo"]').onclick = () => global.dzMenuAction?.("nuevo");
    caja.querySelector('[data-a="abrir"]').onclick = () => global.dzMenuAction?.("escena-abrir");
    caja.querySelector('[data-a="agente"]').onclick = dzIrAlAgente;
    // EL RESCATE ANTE CAÍDA SE OFRECE ACÁ, y antes no se ofrecía en ningún
    // lado. El ofrecimiento vive dentro de `dzDocInit`, que sólo corre al crear
    // o abrir un documento; desde que LOW abre SIN documento, quien volvía
    // después de un cierre forzado veía un estudio vacío y ninguna señal de que
    // su trabajo estaba guardado. Medido en la app real: un trazo sin guardar,
    // matar el proceso, reabrir — el rescate estaba en el almacén (2.674 bytes
    // de escena) y la invitación ofrecía sólo Nuevo, Abrir e ir a la IA.
    //
    // La acción delega en «Nuevo documento», que es el camino probado: al
    // arrancar el documento, `dzDocInit` encuentra el rescate y pregunta. Se
    // pregunta dos veces, sí, pero por un camino que ya está andando y probado.
    const rescate = hayRescate();
    if (rescate) {
      const fila = caja.querySelector(".bien2d-rescate");
      fila.hidden = false;
      const boton = fila.querySelector('[data-a="rescate"]');
      if (rescate.tipo === "documento") {
        fila.querySelector("p").textContent = "Quedó trabajo sin guardar en «" +
          soloElNombre(rescate.ruta) + "»" + cuandoFue(rescate.savedAt) + ".";
        // `openDesign` es quien consume este rescate: compara el punto con el
        // archivo del disco y pregunta cuál querés. Es el camino probado.
        boton.onclick = () => global.openDesign?.(rescate.ruta);
      } else {
        fila.querySelector("p").textContent =
          "Quedó una escena sin guardar de una sesión anterior" + cuandoFue(rescate.savedAt) + ".";
        // El rescate de la escena lo consume `dzDocInit`, que corre al abrir un
        // documento: se delega ahí y él pregunta.
        boton.onclick = () => global.dzMenuAction?.("nuevo");
      }
    }
    lienzo.appendChild(caja);
    vigilar();
    if (puenteListo) habilitar();   // no es el arranque: el puente ya esta. VA
                                    // DESPUES del appendChild: habilitar() busca
                                    // la tarjeta en el DOM por su id.
  }

  /* EL RELOJ VIVE CON LA INVITACION, no con el arranque.
     El documento puede aparecer por varios caminos —Nuevo, Abrir, un .low por
     doble clic, o el que se estaba restaurando— y ninguno emite un evento
     global al que colgarse, asi que hay que mirar. Estaba armado UNA vez en el
     arranque: una invitacion repintada al volver de la IA no la vigilaba nadie,
     y se volvia a clavar. Ahora se arma al pintarla y se apaga al quitarla. */
  let reloj = 0;
  /* EL PUENTE SE PRENDE UNA VEZ, LA INVITACION SE PINTA MUCHAS. Las acciones
     nacen apagadas porque al arrancar todavia no esta Python; `habilitar()`
     corria UNA sola vez, al final del arranque. Pero la invitacion se vuelve a
     pintar cada vez que la mesa queda vacia —al cerrar el documento, al volver
     de la IA—, y esa copia nueva nacia apagada para siempre: «Nuevo documento»,
     «Abrir documento» y hasta «Recuperar lo que quedo sin guardar» muertos, con
     «Preparando LOW...» abajo. LOW quedaba inservible sin haberse roto nada.
     Lo reporto Mauro: «lo cerre y lo volvi a abrir y quedo clavado». */
  let puenteListo = false;

  function vigilar() {
    if (reloj) return;
    reloj = setInterval(() => { if (hayTrabajoAbierto()) quitarInvitacion(); }, 500);
  }

  /* LAS ACCIONES NACEN APAGADAS, y esto las prende.
     La invitacion se pinta a los ~100 ms para que no se vea la pantalla vieja,
     pero «Nuevo documento» necesita el puente de Python: un boton visible que
     no hace nada es exactamente el defecto que acabamos de arreglar, asi que
     hasta que el arranque termina se muestran apagados y con «Preparando LOW».

     El de «ir a IA y redes» es la excepcion y nace USABLE: no necesita nada del
     puente —solo esconde el estudio—, y si el arranque muriera seria la unica
     cosa clickeable de la pantalla. */
  function habilitar() {
    puenteListo = true;             // y desde ahora TODA invitacion nace usable
    const caja = document.querySelector("#" + ID_INVITACION);
    if (!caja) return;
    caja.querySelectorAll("button[data-a]").forEach((b) => { b.disabled = false; b.hidden = false; });
    caja.querySelector(".bien2d-espera")?.remove();
  }

  function quitarInvitacion() {
    document.querySelector("#" + ID_INVITACION)?.remove();
    if (reloj) { clearInterval(reloj); reloj = 0; }
  }

  /** LO QUE SE VE, lo antes posible.
   *
   *  MEDIDO EN LA APP REAL: el estudio aparecia a los 6.542 ms, y hasta ese
   *  momento lo que se veia era la pantalla vieja. La llamada del arranque esta
   *  al final de `init()`, detras de `api.get_state()`, `loadChatTabs()` y
   *  `resume()` —o sea, el estudio de dibujo esperaba a que cargara el CHAT DE
   *  LA IA, que es justo la jerarquia que Mauro pidio dar vuelta—. El splash
   *  tapa el primer segundo; los otros cinco los veia.
   *
   *  Esta fase no necesita nada del puente: el estudio, su barra y la
   *  invitacion son HTML que ya esta en la pagina. Corre con el DOM y nada mas.
   *  El re-cableado de la pluma NO puede venir acá: `bind()` le pone
   *  `designEntry` en la linea 517 de app.js y corre DESPUES de las esperas,
   *  asi que pisaria lo nuestro. Por eso son dos fases. */
  function dzPantallaInicialTemprano() {
    const vista = document.querySelector("#designView");
    if (!vista) return false;
    vista.hidden = false;
    ponerBoton();
    pintarInvitacion();
    return true;
  }

  /** Se llama una vez al terminar de armar la interfaz. */
  function dzPantallaInicial() {
    const vista = document.querySelector("#designView");
    if (!vista) return false;
    vista.hidden = false;
    ponerBoton();
    // La pluma de la barra izquierda pasa a ser el camino de VUELTA, y no puede
    // crear un archivo cada vez. Se re-cablea desde acá para no agregarle
    // lineas a app.js, que esta en su techo.
    const pluma = document.querySelector("#abDesign");
    if (pluma) {
      pluma.onclick = dzVolverAlEstudio;
      pluma.title = "Animación 2D — el estudio de dibujo";
    }
    // pintarInvitacion() se encarga de dejar el reloj vigilando.
    pintarInvitacion();
    habilitar();      // el puente ya esta: las acciones se pueden usar
    if (typeof global.dzFitView === "function") requestAnimationFrame(() => {
      try { global.dzFitView(); } catch (_) { /* sin lienzo todavía */ }
    });
    return true;
  }

  global.dzPantallaInicial = dzPantallaInicial;
  global.dzPantallaInicialTemprano = dzPantallaInicialTemprano;
  // Se arranca solo, sin agregarle una linea a app.js, que esta en su techo.
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", dzPantallaInicialTemprano, { once: true });
  else dzPantallaInicialTemprano();
  global.dzIrAlAgente = dzIrAlAgente;
  global.dzIrAl3D = dzIrAl3D;
  global.dzVolverAlEstudio = dzVolverAlEstudio;
  global.dzBienvenida2DPintar = pintarInvitacion;
  global.dzBienvenida2DQuitar = quitarInvitacion;
})(typeof window !== "undefined" ? window : globalThis);
