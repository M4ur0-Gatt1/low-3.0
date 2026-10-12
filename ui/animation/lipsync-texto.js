/* ══════════════════════════════════════════════════════════════════════════
   LIPSYNC DESDE EL TEXTO: DIÁLOGO → FONEMAS → VISEMAS → CLAVES DE BOCA

   Pedido de Mauro (oct-2026, LOW 3.20): escribir una frase y que LOW arme la
   animación de la boca en la línea de tiempo, con las bocas del personaje.

   Es la segunda fuente del lipsync que LOW ya tenía (lipsync.js, por el
   VOLUMEN del audio): el resultado son las mismas claves de sustitución del
   slot de la boca (rig.switches), editables desde la X-sheet, reproducibles y
   en el historial. Este módulo es PURO —sin DOM—, en tres partes:

   1. FONÉTICA (g2p). Español con reglas propias. Se evaluaron eSpeak NG y las
      bibliotecas G2P de Python: piden un binario nativo por sistema (o un
      WASM de varios MB) y pasar por el puente de Python en cada vista previa.
      La ortografía del español es casi fonémica: con las reglas de dígrafos,
      C/G/R/X/Y/H, la U muda, el seseo, el acento y las pausas, la conversión
      es exacta para el texto normal, corre al instante, sin red y se prueba
      en node. Otros idiomas se registran en `g2p` con la misma forma.

   2. VISEMAS. Los siete pedidos más `V7_M_B_P`: una boca que no cierra en
      M/B/P es el error de lipsync que más se nota. En español la V suena como
      B (bilabial): va a M_B_P, no a F_V. Las velares (k, g, j) y la H no
      tienen posición de labios propia: toman la boca de la vocal que sigue
      (coarticulación). Cada personaje asigna sus dibujos a cada visema; lo que
      no tiene asignado cae en el visema más parecido.

   3. TIEMPO. Cada sonido dura según su tipo (vocal tónica > átona > nasal >
      oclusiva > vibrante simple) y las pausas según la puntuación, a la
      velocidad de lectura elegida. Se pasa a cuadros con los FPS de la escena
      acumulando el tiempo (sin deriva), se juntan los visemas iguales
      seguidos, y lo que dura menos que el sostén mínimo se absorbe —salvo el
      cierre de labios de M/B/P, que siempre se ve—. Es una ESTIMACIÓN: la voz
      real todavía no se analizó; se ajusta con el inicio y la velocidad.

   @module animation/lipsync-texto
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  /* ── 1. FONÉTICA ───────────────────────────────────────────────────────── */
  const VOCALES = "aeiouáéíóúü";
  const FUERTES = "aeoáéó";
  const SIN_TILDE = { "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u", "ü": "u" };
  const esVocal = (c) => !!c && VOCALES.includes(c);
  // palabras átonas: no llevan acento propio (para la duración)
  const ATONAS = new Set(("a al ante bajo cabe con contra de del desde en entre hacia hasta para por según sin so sobre tras " +
    "el la lo los las un una unos unas y e ni o u que pero mas sino me te se nos os le les mi mis tu tus su sus si cuando como donde").split(" "));
  // la X que suena como J (México, Oaxaca, Texas…)
  const X_COMO_J = /^(m[eé]xic|mexican|oaxac|texa|xavier|ximena)/;

  const UNIDADES = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce",
    "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiuno", "veintidós",
    "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
  const DECENAS = ["", "", "", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const CENTENAS = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];
  /** Un número a palabras (hasta 999.999; más largo, cifra por cifra). */
  function numeroEnPalabras(n) {
    if (!Number.isFinite(n) || n < 0) return "";
    if (n < 30) return UNIDADES[n];
    if (n < 100) { const d = Math.floor(n / 10), u = n % 10; return DECENAS[d] + (u ? " y " + UNIDADES[u] : ""); }
    if (n === 100) return "cien";
    if (n < 1000) { const c = Math.floor(n / 100), r = n % 100; return CENTENAS[c] + (r ? " " + numeroEnPalabras(r) : ""); }
    if (n < 1000000) { const m = Math.floor(n / 1000), r = n % 1000; return (m === 1 ? "mil" : numeroEnPalabras(m) + " mil") + (r ? " " + numeroEnPalabras(r) : ""); }
    return String(n).split("").map((d) => UNIDADES[+d]).join(" ");
  }

  /** Separa el texto en palabras y pausas. Los números se dicen con palabras. */
  function trozos(texto) {
    let t = String(texto || "").normalize("NFC").toLowerCase();
    t = t.replace(/\d+/g, (m) => " " + numeroEnPalabras(+m) + " ")
      .replace(/%/g, " por ciento ").replace(/&/g, " y ").replace(/\+/g, " más ").replace(/@/g, " arroba ");
    const out = [];
    const re = /(\.\.\.|…|\r?\n+|[.!?]+|[,;:]|[—–-]+|[a-zñáéíóúü]+)/g;
    let m;
    while ((m = re.exec(t))) {
      const s = m[1];
      if (/^[a-zñáéíóúü]+$/.test(s)) out.push({ palabra: s });
      else if (s === "..." || s === "…") out.push({ pausa: "suspensivos" });
      else if (/\n/.test(s)) out.push({ pausa: "linea" });
      else if (/[.!?]/.test(s)) out.push({ pausa: "punto" });
      else if (s === ",") out.push({ pausa: "coma" });
      else if (s === ";" || s === ":") out.push({ pausa: "punto_y_coma" });
      else out.push({ pausa: "guion" });
    }
    return out;
  }

  /** La vocal tónica de una palabra: la de la tilde o la de las reglas (aguda/llana). */
  function tonica(palabra) {
    const conTilde = [...palabra].findIndex((c) => "áéíóú".includes(c));
    if (conTilde >= 0) return conTilde;
    if (ATONAS.has(palabra)) return -1;
    // núcleos: grupos de vocales (las débiles i/u se juntan con la de al lado: diptongo)
    const nucleos = [];
    for (let i = 0; i < palabra.length; i++) {
      if (!esVocal(palabra[i])) continue;
      if (palabra[i] === "u" && i > 0 && "qg".includes(palabra[i - 1]) && "ei".includes(palabra[i + 1] || "")) continue;   // la U muda de que/qui/gue/gui
      const previo = nucleos[nucleos.length - 1];
      if (previo && previo.fin === i - 1 && !(FUERTES.includes(palabra[i]) && FUERTES.includes(palabra[i - 1]))) { previo.fin = i; previo.vocales.push(i); }
      else nucleos.push({ ini: i, fin: i, vocales: [i] });
    }
    if (!nucleos.length) return -1;
    const ultima = palabra[palabra.length - 1];
    const n = (esVocal(ultima) || ultima === "n" || ultima === "s") && nucleos.length > 1 ? nucleos[nucleos.length - 2] : nucleos[nucleos.length - 1];
    // en un diptongo el acento cae en la fuerte (o en la segunda si son dos débiles)
    const fuerte = n.vocales.find((i) => FUERTES.includes(palabra[i]));
    return fuerte != null ? fuerte : n.vocales[n.vocales.length - 1];
  }

  /**
   * Español → fonemas. Cada fonema: { f, tipo, tonica?, palabra } o una pausa
   * { pausa }. Tipos: vocal, semivocal, oclusiva, nasal, fricativa, africada,
   * lateral, vibrante_simple, vibrante.
   */
  function g2pEspanol(texto) {
    const salida = [];
    let nPalabra = 0;
    for (const tr of trozos(texto)) {
      if (tr.pausa) { salida.push({ pausa: tr.pausa }); continue; }
      const w = tr.palabra, acento = tonica(w), idx = nPalabra++;
      if (salida.length && !salida[salida.length - 1].pausa) salida.push({ pausa: "espacio" });
      const pon = (f, tipo, i) => salida.push({ f, tipo, palabra: idx, ...(tipo === "vocal" && i === acento ? { tonica: true } : {}) });
      for (let i = 0; i < w.length; i++) {
        const c = w[i], s = w[i + 1] || "", p = w[i - 1] || "";
        const vocal = SIN_TILDE[c] || c;
        if (esVocal(c)) {
          // i/u átonas junto a otra vocal: semivocal (diptongo), más corta
          const debil = (c === "i" || c === "u") && (esVocal(s) || esVocal(p)) && i !== acento;
          pon(vocal, debil ? "semivocal" : "vocal", i);
          continue;
        }
        switch (c) {
          case "h": break;                                         // muda (la «ch» se lee en la c)
          case "c":
            if (s === "h") { pon("tʃ", "africada"); i++; }
            else if ("eiéí".includes(s)) pon("s", "fricativa");   // seseo: suena como S (y es la misma boca)
            else pon("k", "oclusiva");
            break;
          case "q":
            pon("k", "oclusiva");
            if (s === "u" && "eiéí".includes(w[i + 2] || "")) i++;  // que/qui: la U no suena
            break;
          case "g":
            if ("eiéí".includes(s)) pon("x", "fricativa");
            else {
              pon("g", "oclusiva");
              if (s === "u" && "eiéí".includes(w[i + 2] || "")) i++; // gue/gui: la U no suena
            }
            break;
          case "j": pon("x", "fricativa"); break;
          case "l":
            if (s === "l") { pon("ʝ", "fricativa"); i++; }           // ll
            else pon("l", "lateral");
            break;
          case "r":
            if (s === "r") { pon("r", "vibrante"); i++; }
            else if (i === 0 || "lns".includes(p)) pon("r", "vibrante");
            else pon("ɾ", "vibrante_simple");
            break;
          case "y":
            // la conjunción «y» y la Y final de palabra (hoy, rey, muy) suenan como I
            if (w.length === 1 || (i === w.length - 1 && esVocal(p))) pon("i", w.length === 1 ? "vocal" : "semivocal", i);
            else pon("ʝ", "fricativa");
            break;
          case "x":
            if (X_COMO_J.test(w)) pon("x", "fricativa");
            else if (i === 0) pon("s", "fricativa");
            else { pon("k", "oclusiva"); pon("s", "fricativa"); }
            break;
          case "z": pon("s", "fricativa"); break;
          case "ñ": pon("ɲ", "nasal"); break;
          case "v": case "b": pon("b", "oclusiva"); break;
          case "w": pon("u", "semivocal"); break;
          case "k": pon("k", "oclusiva"); break;
          case "p": pon("p", "oclusiva"); break;
          case "t": pon("t", "oclusiva"); break;
          case "d": pon("d", "oclusiva"); break;
          case "f": pon("f", "fricativa"); break;
          case "s": pon("s", "fricativa"); break;
          case "m": pon("m", "nasal"); break;
          case "n": pon("n", "nasal"); break;
          default: break;
        }
      }
    }
    // sin pausas sueltas al principio ni repetidas
    return salida.filter((t, i, a) => !(t.pausa === "espacio" && (i === 0 || i === a.length - 1 || a[i + 1].pausa)));
  }

  /** Fonética por idioma: se registran acá. */
  const g2p = { es: g2pEspanol };

  /* ── 2. VISEMAS ────────────────────────────────────────────────────────── */
  const VISEMAS = [
    { id: "V0_Rest", nombre: "Reposo", ayuda: "Boca en reposo: silencios y pausas" },
    { id: "V1_A_E", nombre: "A · E · I", ayuda: "Vocales abiertas (la I comparte la boca estirada)" },
    { id: "V2_O", nombre: "O", ayuda: "Vocal redondeada" },
    { id: "V3_U", nombre: "U", ayuda: "Vocal cerrada y redondeada (también la W)" },
    { id: "V4_F_V", nombre: "F", ayuda: "Labio inferior contra los dientes. En español la V suena como B: va a M·B·P" },
    { id: "V5_L_N", nombre: "L · N · T · D · R", ayuda: "La lengua arriba, la boca entreabierta" },
    { id: "V6_S_Z", nombre: "S · Z · CH · Y", ayuda: "Sibilantes: los dientes casi juntos" },
    { id: "V7_M_B_P", nombre: "M · B · P · V", ayuda: "Labios cerrados: es el visema que más se nota si falta" },
  ];
  /** Si el personaje no tiene dibujo para un visema, el más parecido. */
  const PARECIDO = { V7_M_B_P: ["V0_Rest"], V4_F_V: ["V7_M_B_P", "V6_S_Z", "V0_Rest"], V3_U: ["V2_O", "V1_A_E"],
    V2_O: ["V3_U", "V1_A_E"], V6_S_Z: ["V5_L_N", "V1_A_E"], V5_L_N: ["V1_A_E", "V6_S_Z"], V1_A_E: ["V5_L_N", "V0_Rest"], V0_Rest: ["V7_M_B_P"] };
  /** Fonema → visema. «@vocal» = toma la boca de la vocal de al lado (coarticulación). */
  const FONEMA_VISEMA = {
    a: "V1_A_E", e: "V1_A_E", i: "V1_A_E", o: "V2_O", u: "V3_U",
    p: "V7_M_B_P", b: "V7_M_B_P", m: "V7_M_B_P", f: "V4_F_V",
    t: "V5_L_N", d: "V5_L_N", n: "V5_L_N", l: "V5_L_N", "ɾ": "V5_L_N", r: "V5_L_N", "ɲ": "V5_L_N",
    s: "V6_S_Z", "θ": "V6_S_Z", "tʃ": "V6_S_Z", "ʝ": "V6_S_Z",
    k: "@vocal", g: "@vocal", x: "@vocal",
  };

  /* ── 3. TIEMPO ─────────────────────────────────────────────────────────── */
  // segundos a velocidad 1 (habla conversada, ~6 sílabas por segundo)
  const DURACION = { vocal: 0.085, tonica: 0.13, semivocal: 0.05, oclusiva: 0.065, nasal: 0.07, fricativa: 0.09,
    africada: 0.09, lateral: 0.065, vibrante_simple: 0.04, vibrante: 0.085 };
  const PAUSA = { espacio: 0, guion: 0.18, coma: 0.22, punto_y_coma: 0.3, punto: 0.45, suspensivos: 0.6, linea: 0.5 };

  /**
   * Fonemas → tramos de visema en cuadros.
   * @returns {{tramos: {visema, desde, hasta, fonemas}[], fin: number, segundos: number}}
   */
  function tramos(fonemas, opciones = {}) {
    const fps = Math.max(1, +opciones.fps || 24);
    const vel = Math.max(0.2, Math.min(4, +opciones.velocidad || 1));
    const inicio = Math.max(1, Math.round(+opciones.inicio || 1));
    const sosten = Math.max(1, Math.round(+opciones.sosten || (fps >= 18 ? 2 : 1)));
    // 1) visema y duración de cada fonema
    const lista = fonemas.map((t, i) => {
      if (t.pausa) return { visema: t.pausa === "espacio" ? null : "V0_Rest", seg: PAUSA[t.pausa] || 0, fon: "·" };
      let v = FONEMA_VISEMA[t.f] || "V5_L_N";
      if (v === "@vocal") {   // la vocal de adelante, o la de atrás, o reposo
        const vocal = fonemas.slice(i + 1).find((x) => x.pausa || x.tipo === "vocal" || x.tipo === "semivocal")
          || [...fonemas.slice(0, i)].reverse().find((x) => x.pausa || x.tipo === "vocal" || x.tipo === "semivocal");
        v = vocal && !vocal.pausa ? FONEMA_VISEMA[vocal.f] : "V5_L_N";
      }
      const seg = t.tipo === "vocal" && t.tonica ? DURACION.tonica : (DURACION[t.tipo] || 0.07);
      return { visema: v, seg, fon: t.f };
    });
    // 2) a cuadros, acumulando el tiempo (sin deriva); el espacio no cambia de boca
    let t = 0;
    const crudos = [];
    for (const x of lista) {
      const ini = t; t += x.seg / vel;
      if (!x.visema) continue;
      const desde = inicio + Math.round(ini * fps), hasta = inicio + Math.round(t * fps) - 1;
      const ult = crudos[crudos.length - 1];
      if (ult && ult.visema === x.visema && ult.hasta >= desde - 1) { ult.hasta = Math.max(ult.hasta, hasta); ult.fonemas += x.fon; continue; }
      crudos.push({ visema: x.visema, desde, hasta, fonemas: x.fon });
    }
    // 3) sostén mínimo: lo más corto se absorbe en el anterior (menos el cierre de labios)
    const res = [];
    for (const c of crudos) {
      if (c.hasta < c.desde) c.hasta = c.desde;   // lo que no llegó a un cuadro: uno
      const dur = c.hasta - c.desde + 1, prev = res[res.length - 1];
      if (prev && c.desde <= prev.hasta) c.desde = prev.hasta + 1;   // nunca dos en el mismo cuadro
      if (c.hasta < c.desde) c.hasta = c.desde;
      if (prev && dur < sosten && c.visema !== "V7_M_B_P" && prev.visema !== "V7_M_B_P") { prev.hasta = c.hasta; prev.fonemas += c.fonemas; continue; }
      if (prev && prev.visema === c.visema) { prev.hasta = c.hasta; prev.fonemas += c.fonemas; continue; }
      res.push({ ...c });
    }
    // la boca termina en reposo
    const ult = res[res.length - 1];
    if (ult && ult.visema !== "V0_Rest") res.push({ visema: "V0_Rest", desde: ult.hasta + 1, hasta: ult.hasta + 1, fonemas: "·" });
    return { tramos: res, fin: res.length ? res[res.length - 1].desde : inicio, segundos: t };
  }

  /* ── mapa visema → dibujo del personaje ────────────────────────────────── */
  const plano = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const POR_NOMBRE = [
    ["V7_M_B_P", /v7|m[\s_.·-]*b[\s_.·-]*p|\bmbp\b|\bm\b|labios? cerrad/],
    ["V0_Rest", /v0|rest|reposo|neutr|cerrad|silen/],
    ["V4_F_V", /v4|\bf\b|f[\s_.·-]*v|\bfv\b|dientes? (sobre|en) labio/],
    ["V6_S_Z", /v6|s[\s_.·-]*z|\bs\b|\bz\b|\bch\b|sibil/],
    ["V5_L_N", /v5|l[\s_.·-]*n|\bl\b|\bn\b|lengua|\bt\b|\bd\b/],
    ["V3_U", /v3|\bu\b|\bw\b|\boo\b/],
    ["V2_O", /v2|\bo\b/],
    ["V1_A_E", /v1|a[\s_.·-]*e|\ba\b|\be\b|\bi\b|abiert/],
  ];
  /**
   * Para cada visema, el id del dibujo (variante del slot) que lo representa.
   * Manda lo que el animador eligió (`guardado`); si no, el nombre del dibujo;
   * si tampoco, el orden de cerrada a abierta (la convención del lipsync por
   * volumen). Devuelve { mapa, origen } — origen: "elegido" | "nombre" | "orden".
   */
  function resolverMapa(variantes, guardado = {}) {
    const vs = (variantes || []).filter((v) => v && v.id);
    const mapa = {}, origen = {};
    if (!vs.length) return { mapa, origen };
    for (const v of VISEMAS) if (guardado[v.id] && vs.some((x) => x.id === guardado[v.id])) { mapa[v.id] = guardado[v.id]; origen[v.id] = "elegido"; }
    const libres = () => VISEMAS.filter((v) => !mapa[v.id]);
    for (const [vid, re] of POR_NOMBRE) {
      if (mapa[vid]) continue;
      const hit = vs.find((x) => re.test(plano(x.name || x.elementId || x.id)));
      if (hit) { mapa[vid] = hit.id; origen[vid] = "nombre"; }
    }
    // por orden (cerrada → abierta): el resto se reparte con sentido
    const n = vs.length, idx = (f) => vs[Math.max(0, Math.min(n - 1, Math.round(f * (n - 1))))].id;
    const porOrden = { V0_Rest: idx(0), V7_M_B_P: idx(0), V3_U: idx(0.25), V6_S_Z: idx(0.3), V5_L_N: idx(0.4), V4_F_V: idx(0.2), V2_O: idx(0.6), V1_A_E: idx(1) };
    for (const v of libres()) { mapa[v.id] = porOrden[v.id]; origen[v.id] = "orden"; }
    return { mapa, origen };
  }
  /** El dibujo para un visema, cayendo en el parecido si no tiene. */
  function dibujoDe(visema, mapa) {
    if (mapa[visema]) return mapa[visema];
    for (const otro of PARECIDO[visema] || []) if (mapa[otro]) return mapa[otro];
    return mapa.V0_Rest || Object.values(mapa)[0] || null;
  }

  /**
   * Todo junto: texto → claves { cuadro: idDeDibujo }, sólo los CAMBIOS.
   * opciones: { idioma, fps, inicio, velocidad, sosten, limite, mapa }
   */
  function clavesDeTexto(texto, opciones = {}) {
    const fon = (g2p[opciones.idioma || "es"] || g2p.es)(texto);
    const r = tramos(fon, opciones);
    const limite = Math.round(+opciones.limite || 0);
    const keys = {}, avisos = [];
    let anterior = opciones.antes || null, cortados = 0;
    for (const t of r.tramos) {
      if (limite && t.desde > limite) { cortados++; continue; }
      const dib = opciones.mapa ? dibujoDe(t.visema, opciones.mapa) : t.visema;
      if (dib && dib !== anterior) { keys[t.desde] = dib; anterior = dib; }
    }
    if (cortados) avisos.push("el diálogo sigue después del final de la escena (F" + limite + "): " + cortados + " cambio" + (cortados === 1 ? "" : "s") + " de boca quedaron afuera");
    return { keys, fonemas: fon, tramos: r.tramos, fin: limite ? Math.min(limite, r.fin) : r.fin, segundos: r.segundos, avisos };
  }

  animation.lipsyncTexto = { g2p, g2pEspanol, tonica, trozos, numeroEnPalabras, VISEMAS, FONEMA_VISEMA, PARECIDO,
    DURACION, PAUSA, tramos, resolverMapa, dibujoDe, clavesDeTexto };
})(typeof window !== "undefined" ? window : globalThis);
