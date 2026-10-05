/* LOS PINCELES Y LA PRESIÓN: pruebas del motor (sin navegador). node tools/run_pinceles_tests.js

   Pedido de Mauro (oct-2026): «mejoremos los pinceles, aumentemos la variedad
   y mejoremos la sensibilidad a la tableta; quiero pinceles de efectos y de
   texturas». Medido antes de tocar nada:
   · la presión del camino rápido (pointerrawupdate) no estaba calibrada y con
     el mouse valía 0,5: el ancho de un trazo de mouse saltaba entre 0,52 y 1;
   · la presión zigzagueaba entre la calibrada y la cruda (las dos copias de
     cada muestra entran: el estabilizador está calibrado así);
   · el filtro de presión era de 5 muestras: distinto según la tableta;
   · `texture` no hacía nada en los vectoriales, y no había efectos.
   Acá se exige el motor: remates, formas, variaciones, filtros, presión. */
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
global.window = global;
for (const f of ["ui/drawing/brushes.js", "ui/drawing/brush-engine-pro.js", "ui/drawing/pincel-efectos.js", "ui/drawing/presion.js"])
  eval(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const D = global.LOW.drawing, E = D.brushEngine;
let total = 0; const fallas = [];
const prueba = (n, fn) => { total++; try { fn(); } catch (e) { fallas.push(n + " :: " + e.message); } };
const linea = (n = 60, largo = 300, pr = () => .8) => Array.from({ length: n + 1 }, (_, i) => ({ x: i * largo / n, y: 0, pressure: pr(i / n), time: i * 8 }));

// ── catálogo ──
prueba("hay 40 pinceles, todos con categoría y nombre", () => {
  const todos = D.brushes.all();
  assert.ok(todos.length >= 40, "hay " + todos.length);
  const cats = new Set(D.BRUSH_CATEGORIAS.map((c) => c[0]));
  for (const b of todos) { assert.ok(cats.has(D.brushes.categoria(b)), b.id + " sin categoría válida"); assert.ok(b.name, b.id + " sin nombre"); }
  for (const c of ["lapiz", "tinta", "pintura", "textura", "efecto"]) assert.ok(todos.filter((b) => b.cat === c).length >= 5, "pocos pinceles en " + c);
});
prueba("los ids de siempre siguen existiendo (trazos guardados y favoritos los nombran)", () => {
  for (const id of ["animation-pencil", "blue-pencil", "red-pencil", "clean-ink", "technical-ink", "dry-brush", "charcoal", "airbrush", "marker", "soft-eraser",
    "rough-ink", "comic-ink", "sumi", "flat-gouache", "wet-gouache", "watercolor", "chalk", "pastel", "pixel", "texture-spray", "soft-shader", "calligraphy"])
    assert.ok(D.brushes.get(id), "desapareció " + id);
});
prueba("toda textura declarada por un pincel existe en el motor de efectos (nada declarado que no se pinte)", () => {
  for (const b of D.brushes.all()) if (b.texture && b.texture !== "pixel") assert.ok(D.efectos.TEXTURAS.includes(b.texture), b.id + ": textura «" + b.texture + "» no se pinta");
});
prueba("el selector agrupa por categoría", () => {
  const html = D.opcionesDePinceles("neon");
  assert.match(html, /<optgroup label="Efectos">/); assert.match(html, /<option value="neon" selected>Neón<\/option>/);
  assert.equal((html.match(/<option /g) || []).length, D.brushes.all().length, "faltan pinceles en el selector");
});

// ── remates ──
prueba("remate: el trazo arranca y termina finito, el cuerpo queda igual", () => {
  const b = { id: "t", size: 10, pressureSize: 0, taperStart: .5, taperEnd: .5 };
  const ancho = (r) => { const m = /M ([\d.-]+) ([\d.-]+)/.exec(r.path); return r; };
  const r = E.buildVectorOutline(linea(), b), plano = E.buildVectorOutline(linea(), { ...b, taperStart: 0, taperEnd: 0 });
  const anchos = (o) => { const pts = o.path.replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number); const n = pts.length / 4; const out = [];
    for (let i = 0; i < n; i++) { const izq = pts[i * 2 + 1], der = pts[pts.length - 1 - i * 2]; out.push(Math.abs(izq - der)); } return out; };
  const a = anchos(r), p = anchos(plano);
  assert.ok(a[0] < p[0] * .2, "no arranca en punta: " + a[0].toFixed(2) + " vs " + p[0].toFixed(2));
  const medio = Math.floor(a.length / 2);
  assert.ok(Math.abs(a[medio] - p[medio]) < .01, "el remate tocó el cuerpo del trazo");
  ancho(r);
});
prueba("remate en raster: los sellos de las puntas son más chicos", () => {
  const d = E.buildRasterDabs(linea(), { id: "r", engine: "raster", size: 20, pressureSize: 0, spacing: .1, taperStart: .5, taperEnd: .5 });
  const medio = d[Math.floor(d.length / 2)].width;
  assert.ok(d[0].width < medio * .3 && d.at(-1).width < medio * .3, "las puntas no se afinan: " + d[0].width.toFixed(1) + " / " + medio.toFixed(1));
});

// ── sellos: forma y variación ──
prueba("los pinceles de siempre dejan los MISMOS sellos (la variación va por otra secuencia)", () => {
  const b = D.brushes.get("chalk"), d = E.buildRasterDabs(linea(40), b);
  const n = E.normalizeBrush({ ...b, engine: "raster" });
  for (const x of d) { assert.equal(x.shape, "ellipse"); assert.equal(x.hue, 0); }
  assert.ok(Math.abs(d[5].height / d[5].width - n.roundness) < 1e-9, "la redondez cambió");
});
prueba("variación de tamaño, ángulo y color: determinista y dentro del rango", () => {
  const b = { id: "v", engine: "raster", size: 20, pressureSize: 0, spacing: .3, sizeJitter: .5, angleJitter: 1, hueJitter: 1, angleFollowsStroke: false, shape: "star", seed: 7 };
  const a = E.buildRasterDabs(linea(), b), c = E.buildRasterDabs(linea(), b);
  assert.deepEqual(a, c, "la misma semilla dio sellos distintos: el trazo cambiaría al volver a dibujarlo");
  const w = a.map((x) => x.width), h = a.map((x) => x.hue), ang = a.map((x) => x.angle);
  assert.ok(Math.min(...w) >= 10 - 1e-9 && Math.max(...w) <= 20 + 1e-9 && Math.max(...w) - Math.min(...w) > 3, "la variación de tamaño no varía o se sale: " + Math.min(...w) + ".." + Math.max(...w));
  assert.ok(Math.max(...h) > 60 && Math.min(...h) < -60, "la variación de color no gira el tono");
  assert.ok(Math.max(...ang) - Math.min(...ang) > 180, "la variación de ángulo no gira los sellos");
  assert.ok(a.every((x) => x.shape === "star"));
});
prueba("una forma desconocida cae en la redonda", () => assert.equal(E.normalizeBrush({ shape: "dragón" }).shape, "ellipse"));
prueba("cada forma tiene su camino", () => { for (const s of E.SHAPES) if (s !== "ellipse") assert.ok(D.efectos.FORMAS[s], "falta la forma " + s); });

// ── filtros de textura y efecto ──
prueba("un pincel liso no lleva filtro (no se paga nada)", () => assert.equal(D.efectos.filtro({ size: 6 }, "x"), null));
prueba("cada textura arma su filtro", () => {
  for (const t of D.efectos.TEXTURAS) {
    const f = D.efectos.filtro({ size: 10, texture: t, seed: 3 }, "f_" + t);
    assert.ok(f && f.startsWith('<filter id="f_' + t + '"'), t + ": sin filtro");
    assert.ok(/feTurbulence/.test(f), t + ": sin ruido");
  }
});
prueba("la fuerza de textura en 0 deja la tinta entera", () => {
  const f = D.efectos.filtro({ size: 10, texture: "chalk", textureStrength: 0 }, "z");
  assert.match(f, /values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1"/, "con fuerza 0 el grano igual corta: " + f);
});
prueba("brillo y neón", () => {
  const g = D.efectos.filtro({ size: 8, glow: .8 }, "g"), n = D.efectos.filtro({ size: 8, glow: .8, neon: true }, "n");
  assert.match(g, /feGaussianBlur/); assert.doesNotMatch(g, /feMorphology/);
  // el núcleo del neón: una tinta CLARA del mismo color (no blanco puro), angosta
  assert.match(n, /operator="erode"/, "el neón no tiene núcleo angosto");
  assert.match(n, /intercept="\.75"/, "el núcleo del neón no es una tinta clara del color");
});
prueba("girar el tono", () => {
  assert.equal(D.efectos.girarTono("#ff0000", 120), "#00ff00");
  assert.equal(D.efectos.girarTono("#808080", 90), "#808080", "un gris no tiene tono que girar");
  assert.equal(D.efectos.girarTono("url(#g)", 90), "url(#g)");
});

// ── la presión ──
const P = D.presion;
prueba("el mouse vale 1 siempre (el camino rápido le daba 0,5)", () => {
  assert.equal(P.calibrada({ pointerType: "mouse", pressure: .5 }), 1);
  assert.equal(P.calibrada({ pointerType: "touch", pressure: 0 }), 1);
});
prueba("la calibración estira el rango de la mano a 0–1", () => {
  assert.equal(P.calibrada({ pointerType: "pen", pressure: .1 }, { min: .1, max: .6 }), 0);
  assert.equal(P.calibrada({ pointerType: "pen", pressure: .6 }, { min: .1, max: .6 }), 1);
  assert.ok(Math.abs(P.calibrada({ pointerType: "pen", pressure: .35 }, { min: .1, max: .6 }) - .5) < 1e-9);
});
prueba("el filtro de presión es por TIEMPO: misma mano, misma respuesta a 60 y a 240 muestras por segundo", () => {
  const respuesta = (hz) => { const t = {}; let v = 0; for (let ms = 0; ms <= 60; ms += 1000 / hz) v = P.suavizar(ms < 1 ? .1 : .9, t, ms, 1); return v; };
  const a = respuesta(60), b = respuesta(240);
  assert.ok(Math.abs(a - b) < .03, "60 Hz da " + a.toFixed(3) + " y 240 Hz " + b.toFixed(3));
  const t = {}; P.suavizar(.1, t, 0, 1); const r = P.suavizar(.9, t, 12, 1);
  assert.ok(r > .55 && r < .65, "a los 12 ms (una constante) tenía que ir ~63 % del camino: " + r.toFixed(3));
});
prueba("«Probar con la tableta»: propone inicio y máximo de la mano", () => {
  const crudas = []; for (let i = 0; i < 200; i++) crudas.push(.08 + .5 * Math.sin(i / 199 * Math.PI));
  crudas.push(.99);   // un pico suelto no cuenta
  const r = P.proponerRango(crudas);
  assert.ok(r.max > .5 && r.max < .62, "máximo propuesto " + r.max);
  assert.ok(r.min >= 0 && r.min < .08, "inicio propuesto " + r.min);
  assert.equal(P.proponerRango([.5, .5]), null, "con dos muestras no hay nada que proponer");
});

console.log("PINCELES: " + total + " pruebas, " + (total - fallas.length) + " bien, " + fallas.length + " fallan");
if (fallas.length) { fallas.forEach((f) => console.error("FALLA: " + f)); process.exit(1); }
