/* ══════════════════════════════════════════════════════════════════════════
   ELEGIR UNA HERRAMIENTA DE DIBUJO CON EL ESQUELETO PUESTO

   Reportado mirando la pantalla: «las herramientas del rigging tienen
   defectos, aparece como un pincel en lugar de hacer lo que debería».

   Medido: con `DZ.rigMode` encendido, el riel sigue ofreciendo TODAS las
   herramientas de dibujo —brush, pencil, eraser, bucket, dropper, pen, ruler,
   inflator, iron, pliers, magnet— y `dzSetTool()` las acepta sin preguntar.
   Queda un pincel encima del esqueleto: el gesto que uno hace para mover una
   articulación pinta, y la herramienta de rig «no hace lo que debería».

   El contrato ya existía y no se estaba usando: `application/mode-machine.js`
   es «la autoridad sobre qué herramientas son válidas en dibujo y rigging»,
   pero `dzSetTool` nunca la consultaba.

   QUÉ HACE ESTE MÓDULO. Si se elige una herramienta de dibujo con el esqueleto
   puesto, pone el rig en su modo «Dibujar» y aplica la herramienta elegida.
   No la rechaza: el botón dice «pincel» y quien lo aprieta quiere pintar; un
   botón que no hace nada es otro defecto, no un arreglo.

   CORREGIDO EN v4.49.0 — la primera versión de esto SALÍA del modo rig, y eso
   estuvo mal. Reportado: «no me deja dibujar sobre el esqueleto; tienen que
   andar los dos flujos». MEDIDO: con el esqueleto puesto había 43 elementos
   dibujados en el overlay; al elegir el lápiz quedaban 0. Dibujar funcionaba,
   pero el esqueleto DESAPARECÍA — y dibujar *encima* del esqueleto, usándolo
   de referencia, es justamente lo que uno quiere hacer.

   Peor: la app YA tenía ese modo resuelto. `dzRigSetTool("draw")` pone el
   overlay en `rig-pass-through` (el puntero atraviesa al lienzo) y anuncia
   «el alambre queda visible como guía pero no captura la tableta». Mi
   envoltorio interceptaba el `dzSetTool` interno de esa misma función y
   apagaba el rig, así que el mensaje prometía algo que ya no pasaba.
   MEDIDO sin el envoltorio: rigMode true, 43 huesos a la vista, el puntero
   pasa, y el trazo se dibuja. Era cuestión de no estorbar.

   Dos reglas, entonces:
   · Si el cambio lo pide el PROPIO rig —`DZ.rigToolSync`, la bandera que
     `dzRigSetTool` levanta antes de llamar acá— no se toca nada. app.js ya
     respeta esa bandera en otro lugar (línea ~5065); acá faltaba.
   · Si lo pide la persona, se pasa el rig a «Dibujar» y después se aplica SU
     herramienta, no `pencil` a la fuerza: quien eligió el borrador quiere
     el borrador.

   Se envuelve `dzSetTool` desde afuera: `app.js` está justo en el techo del
   presupuesto de §12 y esto es una preocupación separada.

   @module application/herramienta-y-modo
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const application = LOW.application = LOW.application || {};

  /** Las que SÍ se usan con el esqueleto puesto. Las de rig empiezan con
   *  «rig»; las otras tres se listan porque son de navegación y edición
   *  estructural, no de pintar: sirven igual mientras se arma el muñeco. */
  const SIRVEN_CON_RIG = new Set(["select", "direct", "hand", "pivot"]);
  const esDeRig = (t) => typeof t === "string" && t.startsWith("rig");
  const valeConRig = (t) => esDeRig(t) || SIRVEN_CON_RIG.has(t);

  function enRigMode() {
    // OJO: `DZ` es `const` en app.js, asi que NO es propiedad de window.
    // Leerlo como `global.DZ` da undefined EN SILENCIO y este guard no se
    // activa nunca. Ya me paso una vez y el verificador de contratos del repo
    // lo marca: se nombra suelto, con guarda `typeof`.
    const estado = (typeof DZ !== "undefined") ? DZ : null;
    return !!(estado && estado.rigMode);
  }

  /** Envuelve `dzSetTool`. Declaración de función en script clásico: vive en el
   *  objeto global, así que reemplazarla acá alcanza para todos los llamadores. */
  function envolver() {
    const original = global.dzSetTool;
    if (typeof original !== "function" || original.__conModo) return false;
    const envuelto = function (t) {
      const estadoDZ = (typeof DZ !== "undefined") ? DZ : null;
      // El rig sincronizando su propia herramienta con la mesa: no se decide
      // nada acá. Es la misma bandera que app.js ya respeta (línea ~5065).
      // MEDIDO: en una secuencia normal esta rama corre CINCO veces —el rig
      // pide pliers, rigbone, rigedit, pencil y rigselect—, así que es código
      // vivo, no decorativo. Honestidad sobre su cobertura: al mutarla, el
      // resultado final de esas cinco converge igual, así que el guardia no
      // la distingue. Es una guarda de RE-ENTRADA, no un cambio de conducta:
      // sin ella el envoltorio se llama a sí mismo a través de dzRigSetTool.
      if (estadoDZ && estadoDZ.rigToolSync) return original.call(this, t);

      if (enRigMode() && !valeConRig(t)) {
        // El esqueleto QUEDA. Se pasa el rig a su modo «Dibujar»: el alambre
        // sigue a la vista como guía y el puntero lo atraviesa hasta la mesa.
        try {
          if (typeof global.dzRigSetTool === "function") global.dzRigSetTool("draw");
        } catch (_) { /* si no se puede, al menos se aplica la herramienta */ }
        const r = original.call(this, t);   // SU herramienta, no «pencil» a la fuerza
        try {
          if (typeof global.dzRigOverlayRender === "function") global.dzRigOverlayRender();
          if (typeof global.dzSetStatus === "function")
            global.dzSetStatus("Dibujás con el esqueleto a la vista como guía · " +
              "para mover huesos, elegí la flecha");
        } catch (_) { /* dibujar importa más que el aviso */ }
        return r;
      }
      return original.call(this, t);
    };
    envuelto.__conModo = true;
    global.dzSetTool = envuelto;
    return true;
  }

  application.herramientaYModo = { SIRVEN_CON_RIG, valeConRig, esDeRig, envolver, enRigMode };
  // carga DESPUÉS de app.js, así que `dzSetTool` ya existe
  envolver();
})(window);
