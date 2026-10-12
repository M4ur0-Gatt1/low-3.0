/* Lipsync desde el texto (ui/animation/lipsync-texto.js). Uso: node tools/run_lipsync_texto_tests.js */
const fs = require("fs"), path = require("path");
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/lipsync-texto.js"), "utf8"));
const L = global.LOW.animation.lipsyncTexto;

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle == null ? "" : JSON.stringify(detalle));
};
const fon = (t) => L.g2pEspanol(t).filter((x) => !x.pausa).map((x) => x.f).join("");
const pausas = (t) => L.g2pEspanol(t).filter((x) => x.pausa).map((x) => x.pausa);
const vis = (t, o = {}) => L.tramos(L.g2pEspanol(t), { fps: 24, ...o }).tramos.map((x) => x.visema);

// 1. Fonética: dígrafos, letras que cambian según la vocal, letras mudas
{
  ok(fon("chico") === "tʃiko", "ch es una africada", fon("chico"));
  ok(fon("llave") === "ʝabe", "ll suena como y; v como b", fon("llave"));
  ok(fon("perro") === "pero" && L.g2pEspanol("perro").find((x) => x.f === "r").tipo === "vibrante", "rr es vibrante múltiple");
  ok(L.g2pEspanol("pero").find((x) => x.f === "ɾ").tipo === "vibrante_simple", "r entre vocales es simple");
  ok(L.g2pEspanol("rosa")[0].tipo === "vibrante", "r inicial es múltiple");
  ok(L.g2pEspanol("honra").find((x) => x.f === "r").tipo === "vibrante", "r después de n es múltiple");
  ok(fon("queso") === "keso" && fon("quien") === "kien", "qu + e/i: la u no suena", [fon("queso"), fon("quien")]);
  ok(fon("guerra") === "gera" && fon("guiso") === "giso", "gu + e/i: la u no suena", [fon("guerra"), fon("guiso")]);
  ok(fon("pingüino") === "pinguino", "gü: la u suena", fon("pingüino"));
  ok(fon("gente") === "xente" && fon("gato") === "gato", "g + e/i suena como j", [fon("gente"), fon("gato")]);
  ok(fon("cielo") === "sielo" && fon("casa") === "kasa", "c + e/i: seseo; c + a: k", [fon("cielo"), fon("casa")]);
  ok(fon("acción") === "aksion", "cc: k + s", fon("acción"));
  ok(fon("hola") === "ola" && fon("ahora") === "aoɾa", "la h no suena", [fon("hola"), fon("ahora")]);
  ok(fon("zapato") === "sapato", "z: seseo", fon("zapato"));
  ok(fon("año") === "aɲo", "ñ", fon("año"));
  ok(fon("taxi") === "taksi" && fon("xilófono") === "silofono" && fon("México") === "mexiko", "x: ks, s inicial, j en México", [fon("taxi"), fon("xilófono"), fon("México")]);
  ok(fon("hoy") === "oi" && fon("yo") === "ʝo" && fon("pan y vino") === "panibino", "y: vocal al final y sola; consonante si no", [fon("hoy"), fon("yo"), fon("pan y vino")]);
}

// 2. Tildes y acento: la tónica se marca (dura más)
{
  const t = (w) => { const f = L.g2pEspanol(w).filter((x) => x.tipo === "vocal" || x.tipo === "semivocal"); const i = f.findIndex((x) => x.tonica); return i; };
  ok(L.g2pEspanol("canción").find((x) => x.tonica).f === "o", "la tilde manda: can-CIÓN (la tónica es la ó; la i es semivocal)", L.g2pEspanol("canción"));
  ok(t("casa") === 0, "llana sin tilde: CA-sa", t("casa"));
  ok(t("reloj") === 1, "aguda (termina en consonante): re-LOJ", t("reloj"));
  ok(t("árbol") === 0, "tilde en la primera: ÁR-bol", t("árbol"));
  ok(L.g2pEspanol("de").every((x) => !x.tonica), "las palabras átonas no llevan acento");
  ok(L.g2pEspanol("tío").find((x) => x.f === "i").tipo === "vocal", "í con tilde rompe el diptongo: vocal plena");
  ok(L.g2pEspanol("tierra").find((x) => x.f === "i").tipo === "semivocal", "ie: la i es semivocal (diptongo)");
}

// 3. Puntuación y pausas
{
  ok(JSON.stringify(pausas("Hola, ¿cómo estás?")) === JSON.stringify(["coma", "espacio", "punto"]), "coma, espacio, cierre de pregunta", pausas("Hola, ¿cómo estás?"));
  ok(pausas("Bueno... sí").includes("suspensivos"), "los puntos suspensivos son una pausa larga");
  ok(pausas("uno; dos: tres").filter((p) => p === "punto_y_coma").length === 2, "punto y coma, y dos puntos");
  ok(pausas("¡Hola!").join() === "punto", "¡! se cierra como un punto; el de apertura no hace pausa", pausas("¡Hola!"));
  ok(fon("Tengo 25 años") === fon("tengo veinticinco años"), "los números se dicen con palabras");
  ok(L.numeroEnPalabras(1984) === "mil novecientos ochenta y cuatro", "1984", L.numeroEnPalabras(1984));
}

// 4. Visemas: agrupa lo que se ve igual, M/B/P cierra, las velares toman la vocal
{
  ok(vis("mamá").join() === "V7_M_B_P,V1_A_E,V7_M_B_P,V1_A_E,V0_Rest", "mamá: cierra, abre, cierra, abre, reposo", vis("mamá"));
  ok(vis("vaca")[0] === "V7_M_B_P", "la v es bilabial: M_B_P, no F_V", vis("vaca"));
  ok(vis("foto")[0] === "V4_F_V", "la f: labio y dientes", vis("foto"));
  ok(vis("oso", { sosten: 1 }).join() === "V2_O,V6_S_Z,V2_O,V0_Rest", "oso", vis("oso", { sosten: 1 }));
  ok(vis("cuco", { sosten: 1 })[0] === "V3_U", "la k toma la boca de la vocal que sigue (coarticulación)", vis("cuco", { sosten: 1 }));
  ok(!vis("casa casa").includes(undefined), "sin visemas vacíos");
  const s = vis("Hola. Chau.");
  ok(s.includes("V0_Rest") && s.indexOf("V0_Rest") < s.length - 1, "el punto cierra la boca en medio de la frase", s);
}

// 5. Tiempo: FPS, inicio, velocidad, duraciones que varían, sin duplicados
{
  const a24 = L.tramos(L.g2pEspanol("Hola, ¿cómo estás?"), { fps: 24, inicio: 1 });
  const a12 = L.tramos(L.g2pEspanol("Hola, ¿cómo estás?"), { fps: 12, inicio: 1 });
  const a30 = L.tramos(L.g2pEspanol("Hola, ¿cómo estás?"), { fps: 30, inicio: 1 });
  ok(Math.abs((a24.fin - 1) / 24 - (a12.fin - 1) / 12) < 0.2 && Math.abs((a24.fin - 1) / 24 - (a30.fin - 1) / 30) < 0.2,
    "el mismo diálogo dura lo mismo en segundos a 12, 24 y 30 fps", [a12.fin, a24.fin, a30.fin]);
  const b = L.tramos(L.g2pEspanol("Hola, ¿cómo estás?"), { fps: 24, inicio: 50 });
  ok(b.tramos[0].desde === 50 && b.fin - 50 === a24.fin - 1, "arranca en el cuadro pedido, y corre todo igual", [b.tramos[0].desde, b.fin, a24.fin]);
  const lento = L.tramos(L.g2pEspanol("Hola, ¿cómo estás?"), { fps: 24, velocidad: 0.5 });
  ok(lento.fin - 1 > (a24.fin - 1) * 1.8, "a mitad de velocidad dura casi el doble", [lento.fin, a24.fin]);
  const d = a24.tramos.map((t) => t.hasta - t.desde + 1);
  ok(new Set(d).size > 2, "las duraciones varían según el sonido", d);
  ok(a24.tramos.every((t, i, arr) => i === 0 || (t.desde > arr[i - 1].hasta && t.visema !== arr[i - 1].visema)), "sin solapes ni dos tramos iguales seguidos", a24.tramos);
  ok(a24.tramos.filter((t) => t.visema !== "V7_M_B_P" && t.visema !== "V0_Rest").every((t) => t.hasta - t.desde + 1 >= 2), "a 24 fps nada dura menos de 2 cuadros (salvo el cierre de labios)", a24.tramos);
  ok(a24.tramos[a24.tramos.length - 1].visema === "V0_Rest", "termina en reposo");
  const coma = L.tramos(L.g2pEspanol("hola, hola"), { fps: 24 }).tramos.find((t) => t.visema === "V0_Rest");
  ok(coma && coma.hasta - coma.desde + 1 >= 4, "la coma deja la boca en reposo unos cuadros", coma);
}

// 6. Mapa de visemas a los dibujos de cada personaje
{
  const porNombre = [{ id: "a1", name: "Reposo" }, { id: "a2", name: "A_E" }, { id: "a3", name: "O" }, { id: "a4", name: "U" },
    { id: "a5", name: "F_V" }, { id: "a6", name: "L_N" }, { id: "a7", name: "S_Z" }, { id: "a8", name: "M_B_P" }];
  const m = L.resolverMapa(porNombre).mapa;
  ok(m.V0_Rest === "a1" && m.V1_A_E === "a2" && m.V2_O === "a3" && m.V3_U === "a4" && m.V4_F_V === "a5" && m.V5_L_N === "a6" && m.V6_S_Z === "a7" && m.V7_M_B_P === "a8",
    "reconoce los dibujos por su nombre", m);
  const tres = [{ id: "c", name: "cerrada" }, { id: "m", name: "media" }, { id: "ab", name: "abierta" }];
  const m3 = L.resolverMapa(tres);
  ok(m3.mapa.V0_Rest === "c" && m3.mapa.V1_A_E === "ab" && m3.mapa.V7_M_B_P === "c", "con tres bocas de cerrada a abierta, se reparten con sentido", m3);
  const elegido = L.resolverMapa(tres, { V2_O: "c" });
  ok(elegido.mapa.V2_O === "c" && elegido.origen.V2_O === "elegido", "lo que el animador eligió manda");
  ok(L.dibujoDe("V4_F_V", { V7_M_B_P: "m", V0_Rest: "r" }) === "m", "sin dibujo para F, cae en M_B_P (el más parecido)");
  ok(L.dibujoDe("V3_U", { V2_O: "o" }) === "o", "sin U, cae en O");
}

// 7. Claves: sólo los CAMBIOS, sin duplicados aunque dos visemas usen el mismo dibujo; límite de la escena
{
  const mapa = { V0_Rest: "cerrada", V7_M_B_P: "cerrada", V1_A_E: "abierta", V2_O: "abierta", V3_U: "media", V4_F_V: "media", V5_L_N: "media", V6_S_Z: "media" };
  const r = L.clavesDeTexto("Mamá, ¿me ayudás?", { fps: 24, inicio: 10, mapa });
  const frames = Object.keys(r.keys).map(Number).sort((a, b) => a - b), vals = frames.map((f) => r.keys[f]);
  ok(frames[0] === 10, "la primera clave en el cuadro de inicio", frames);
  ok(vals.every((v, i) => i === 0 || v !== vals[i - 1]), "nunca dos claves seguidas con el mismo dibujo", vals);
  ok(vals[vals.length - 1] === "cerrada", "la boca termina cerrada");
  const ant = L.clavesDeTexto("ma", { fps: 24, inicio: 1, mapa, antes: "cerrada" });
  ok(!Object.values(ant.keys).length || ant.keys[1] !== "cerrada", "no repite la boca que ya estaba antes del diálogo", ant.keys);
  const corto = L.clavesDeTexto("Esta es una frase bastante larga para una escena tan corta", { fps: 24, inicio: 1, mapa, limite: 20 });
  ok(Object.keys(corto.keys).every((f) => +f <= 20) && corto.avisos.length === 1, "respeta el final de la escena y avisa", corto);
  const vacio = L.clavesDeTexto("  ¿?  ", { fps: 24, mapa });
  ok(Object.keys(vacio.keys).length <= 1, "un texto sin palabras no anima nada", vacio.keys);
}

console.log(`LIPSYNC DESDE EL TEXTO: ${pass + fail} pruebas, ${pass} bien, ${fail} fallan`);
process.exit(fail ? 1 : 0);
