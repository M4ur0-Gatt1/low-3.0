/* ══ 🦴 EL ALAMBRE QUE FALTABA ═══════════════════════════════════════════════
   Un esqueleto puede llegar con PIVOTES y sin cola: así nacen el personaje de
   ejemplo y los rigs que entran importados o desde un .low viejo. Visto en la
   mesa parece un esqueleto entero —el dibujante ve la línea entre articulación
   y articulación— pero por dentro no hay hueso: `tail` está vacío. Y entonces

     · «Editar» sobre el cuerpo del hueso NO edita (el gesto cae en «elegir»),
     · el pivote se mueve pero la punta no existe, así que no se puede alargar,
     · «Cortes» no tiene dónde cortar,
     · y «Repartir» contesta «primero dibujá el alambre» con el muñeco entero
       a la vista, que es lo que hacía imposible unir un esqueleto a un dibujo.

   Acá se deduce la cola de cada hueso de la propia jerarquía: la de un hueso
   con hijos es la articulación del hijo que CONTINÚA la cadena —el más
   alineado con la dirección que traía, no el primero que aparezca en la
   lista—; la de una punta —mano, pie, cabeza— se estira en esa misma
   dirección. El pivote no se toca: las poses y las claves ya grabadas quedan
   exactamente donde estaban. */
(function (global) {
  "use strict";

  const pivoteDe = n => (n && (n.pivot || n.head)) || null;

  /** Cuántos huesos cuelgan de `id`, contando nietos. Sirve para elegir la
      continuación de una raíz: de la pelvis salen la columna y las dos
      piernas, y la columna es la que lleva medio muñeco detrás. */
  function descendientes(id, hijosDe, visto) {
    visto = visto || new Set();
    if (visto.has(id)) return 0;           // una jerarquía rota no debe colgar
    visto.add(id);
    let total = 0;
    for (const h of hijosDe.get(id) || []) total += 1 + descendientes(h.id, hijosDe, visto);
    return total;
  }

  /**
   * Completa la cola de los huesos que no la tienen.
   * @returns {number} cuántos huesos pasaron a ser hueso de verdad.
   */
  function dzRigAlambreDerivar(doc, etiqueta) {
    const nodos = doc && doc.scene && doc.scene.rig && doc.scene.rig.nodes;
    if (!nodos) return 0;
    const lista = Object.values(nodos);
    const hijosDe = new Map();
    for (const n of lista) {
      if (!n.parentId || !nodos[n.parentId]) continue;
      if (!hijosDe.has(n.parentId)) hijosDe.set(n.parentId, []);
      hijosDe.get(n.parentId).push(n);
    }
    const alto = +(doc.scene && doc.scene.height) || 1000;
    const minimo = Math.max(8, alto * 0.03);
    const cambios = {};
    for (const n of lista) {
      const p = pivoteDe(n);
      if (n.tail || !p) continue;
      const padre = n.parentId ? nodos[n.parentId] : null, q = pivoteDe(padre);
      let dir = null;
      if (q) {
        const largo = Math.hypot(p.x - q.x, p.y - q.y);
        if (largo > 0.001) dir = { x: (p.x - q.x) / largo, y: (p.y - q.y) / largo, largo };
      }
      const hijos = (hijosDe.get(n.id) || []).filter(h => {
        const hp = pivoteDe(h);
        return hp && Math.hypot(hp.x - p.x, hp.y - p.y) > 0.001;
      });
      let cola = null;
      if (hijos.length) {
        let mejor = null, mejorPuntaje = -Infinity;
        for (const h of hijos) {
          const hp = pivoteDe(h), largo = Math.hypot(hp.x - p.x, hp.y - p.y);
          // Con dirección heredada gana el hijo que sigue derecho (el hombro no
          // es la continuación del pecho: el cuello sí). Sin ella —la raíz— gana
          // el que arrastra más esqueleto detrás. Empate: el más largo.
          const puntaje = dir
            ? (((hp.x - p.x) / largo) * dir.x + ((hp.y - p.y) / largo) * dir.y) * 1e6 + largo
            : descendientes(h.id, hijosDe) * 1e6 + largo;
          if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; mejor = hp; }
        }
        cola = { x: mejor.x, y: mejor.y };
      } else {
        const d = dir || { x: 0, y: 1, largo: 0 };       // sin padre: hacia abajo
        const largo = Math.max(minimo, d.largo * 0.6);
        cola = { x: p.x + d.x * largo, y: p.y + d.y * largo };
      }
      if (Math.hypot(cola.x - p.x, cola.y - p.y) < 2) continue;
      cambios[n.id] = { head: { x: p.x, y: p.y }, tail: cola };
    }
    const ids = Object.keys(cambios);
    if (!ids.length) return 0;
    if (typeof doc.setRigBoneGeometries !== "function") return 0;
    doc.setRigBoneGeometries(cambios, etiqueta || "Deducir el alambre del esqueleto");
    return ids.length;
  }

  /* ── DONDE VA EL ESQUELETO ─────────────────────────────────────────────────
     «Colocar» medía la HOJA, no el dibujo: la plantilla es proporcional (la
     cabeza al 18% de alto, la cadera al 62%…) y esas proporciones se aplicaban
     al lienzo entero. El esqueleto caía en el medio de la página, con el
     personaje a un costado y a otra escala; después «Repartir» ataba la pierna
     del dibujo a la mano del esqueleto porque era el hueso que le quedaba más
     cerca. De ahí que unir un esqueleto a un dibujo «no anduviera».
     Midiendo el DIBUJO, cada hueso nace sobre la parte que le toca. */
  function dzRigCajaDelDibujo(hoja) {
    const svg = hoja || (typeof document !== "undefined" && document.querySelector("#dzCanvas > svg"));
    if (!svg || typeof svg.getCTM !== "function") return null;
    const piezas = typeof global.dzRigDrawableElements === "function"
      ? global.dzRigDrawableElements() : [...svg.children];
    const base = svg.getCTM();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of piezas) {
      let caja = null;
      try { caja = el.getBBox && el.getBBox(); } catch (_) { caja = null; }
      if (!caja || (!caja.width && !caja.height)) continue;
      // getBBox habla en el sistema del elemento: un grupo con transform
      // mentiría. Se lleva a coordenadas de la hoja antes de unir.
      let m = null;
      try { m = base && el.getCTM ? base.inverse().multiply(el.getCTM()) : null; } catch (_) { m = null; }
      const puntos = [[caja.x, caja.y], [caja.x + caja.width, caja.y],
        [caja.x + caja.width, caja.y + caja.height], [caja.x, caja.y + caja.height]];
      for (const [px, py] of puntos) {
        const p = m && typeof DOMPoint === "function"
          ? new DOMPoint(px, py).matrixTransform(m) : { x: px, y: py };
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    if (!(x1 > x0) || !(y1 > y0)) return null;
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }

  global.dzRigAlambreDerivar = dzRigAlambreDerivar;
  global.dzRigCajaDelDibujo = dzRigCajaDelDibujo;
  global.LOW = global.LOW || {};
  global.LOW.rigging = global.LOW.rigging || {};
  global.LOW.rigging.alambreDerivar = dzRigAlambreDerivar;
  global.LOW.rigging.cajaDelDibujo = dzRigCajaDelDibujo;
})(typeof window !== "undefined" ? window : globalThis);
