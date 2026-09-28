/* ══════════════════════════════════════════════════════════════════════════
   CONJUNTOS DE CONTROLES (C05) — la cara armada de una vez

   Armar la actuación de un personaje a mano es repetir siempre lo mismo: un
   control por ojo, uno por ceja, uno para la boca, y para cada uno un juego de
   vistas con sus dibujos. Después viene el segundo personaje y se repite todo,
   con otros nombres y otros rangos, y ya no se parecen en nada.

   Un CONJUNTO es esa receta escrita una vez: qué controles hay, con qué
   recorrido, y qué PIEZAS necesita. Aplicarlo a un personaje crea los controles
   y, para cada pieza, el juego de vistas listo para que le pongan los dibujos.
   O sea que se apoya en lo de C04 en vez de inventar otro mecanismo.

   LA REGLA QUE PIDE EL PLAN: «vinculación explícita a cada personaje». Acá eso
   significa que el conjunto NO adivina qué pieza es el ojo izquierdo. Se puede
   SUGERIR por nombre —`sugerir()`, que es una ayuda— pero aplicar exige el
   mapa, y lo que no esté mapeado se DEVUELVE como faltante en vez de crearse a
   medias. Un control que quedó colgado de ninguna pieza es peor que no tenerlo:
   se mueve y no pasa nada, y hay que descubrir por qué.

   Este archivo es DATOS y funciones puras: no toca el DOM ni el documento.

   @module rigging/control-sets
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const rigging = LOW.rigging = LOW.rigging || {};

  /** Los conjuntos que vienen de fábrica.
   *
   *  Los recorridos no son decorativos: un párpado va de abierto (0) a cerrado
   *  (100) porque así se piensa un parpadeo, y una mirada va de -100 a 100
   *  porque tiene dos lados y un centro. El valor por defecto es SIEMPRE la
   *  pose neutra, para que aplicar un conjunto no deforme al personaje. */
  const CATALOGO = [
    { id: "ojos", name: "Ojos",
      descripcion: "Parpadeo de cada ojo y la mirada, que mueve los dos juntos.",
      roles: [
        { key: "ojo_izq", name: "Ojo izquierdo", pistas: ["ojo izq", "ojo_l", "eye_l", "ojo izquierdo"] },
        { key: "ojo_der", name: "Ojo derecho", pistas: ["ojo der", "ojo_r", "eye_r", "ojo derecho"] },
      ],
      controles: [
        { key: "parpado_izq", name: "Párpado izquierdo", min: 0, max: 100, default: 0, rol: "ojo_izq" },
        { key: "parpado_der", name: "Párpado derecho", min: 0, max: 100, default: 0, rol: "ojo_der" },
        // la mirada no tiene vistas propias: mueve las piezas que ya están
        { key: "mirada_x", name: "Mirada horizontal", min: -100, max: 100, default: 0 },
        { key: "mirada_y", name: "Mirada vertical", min: -100, max: 100, default: 0 },
      ] },
    { id: "cejas", name: "Cejas",
      descripcion: "Cada ceja sube, baja y se quiebra: con eso solo ya hay expresión.",
      roles: [
        { key: "ceja_izq", name: "Ceja izquierda", pistas: ["ceja izq", "ceja_l", "brow_l"] },
        { key: "ceja_der", name: "Ceja derecha", pistas: ["ceja der", "ceja_r", "brow_r"] },
      ],
      controles: [
        { key: "ceja_izq_alto", name: "Ceja izquierda", min: -100, max: 100, default: 0, rol: "ceja_izq" },
        { key: "ceja_der_alto", name: "Ceja derecha", min: -100, max: 100, default: 0, rol: "ceja_der" },
      ] },
    { id: "boca", name: "Boca",
      descripcion: "Apertura y forma, y el juego de vistas donde van los fonemas del lipsync.",
      roles: [{ key: "boca", name: "Boca", pistas: ["boca", "mouth"] }],
      controles: [
        { key: "boca_forma", name: "Forma de la boca", min: 0, max: 100, default: 0, rol: "boca" },
        { key: "boca_abre", name: "Apertura", min: 0, max: 100, default: 0 },
      ] },
    { id: "manos", name: "Manos",
      descripcion: "Cada mano cambia de dibujo: puño, abierta, señalando.",
      roles: [
        { key: "mano_izq", name: "Mano izquierda", pistas: ["mano izq", "mano_l", "hand_l"] },
        { key: "mano_der", name: "Mano derecha", pistas: ["mano der", "mano_r", "hand_r"] },
      ],
      controles: [
        { key: "mano_izq_forma", name: "Mano izquierda", min: 0, max: 100, default: 0, rol: "mano_izq" },
        { key: "mano_der_forma", name: "Mano derecha", min: 0, max: 100, default: 0, rol: "mano_der" },
      ] },
  ];

  const porId = (id) => CATALOGO.find((c) => c.id === id) || null;

  const normalizar = (s) => String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  /** SUGIERE qué pieza podría ser cada rol, mirando los nombres. Es una ayuda
   *  para no obligar a mapear cuatro cosas a mano cada vez, y NADA MÁS: quien
   *  aplica el conjunto decide. Devuelve `{ rol: piezaId }` sólo con lo que
   *  reconoce, y deja afuera lo dudoso en vez de arriesgar. */
  function sugerir(conjunto, piezas) {
    const set = typeof conjunto === "string" ? porId(conjunto) : conjunto;
    const out = {};
    if (!set) return out;
    const usadas = new Set();
    for (const rol of set.roles) {
      const pistas = [normalizar(rol.name), ...(rol.pistas || []).map(normalizar)];
      let elegida = null;
      for (const p of piezas || []) {
        const nombre = normalizar(p.name || p.id);
        if (usadas.has(p.id)) continue;
        if (pistas.some((pista) => pista && nombre.includes(pista))) { elegida = p; break; }
      }
      if (elegida) { out[rol.key] = elegida.id; usadas.add(elegida.id); }
    }
    return out;
  }

  /** Qué roles del conjunto quedaron SIN pieza en un mapa dado. Lo que la
   *  interfaz muestra antes de dejar aplicar. */
  function faltantes(conjunto, mapa) {
    const set = typeof conjunto === "string" ? porId(conjunto) : conjunto;
    if (!set) return [];
    return set.roles.filter((r) => !(mapa && mapa[r.key])).map((r) => ({ key: r.key, name: r.name }));
  }

  rigging.controlSets = { CATALOGO, porId, sugerir, faltantes, normalizar };
})(window);
