#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   CÁMARA ESTILO AFTER EFFECTS — EL MODELO (sin navegador)

   Controla la matemática de ui/composition/ae-camera.js:
   - la lente: 50 mm en una hoja de 1920 = zoom 2666,7 px (el valor de AE);
   - convertir una clave 2D en cámara AE NO cambia el cuadro: mismo paralaje
     que la cámara 2D al panear (compensación de escala Z incluida);
   - órbita, track XY, track Z y lente hacen lo que dicen;
   - perspectiva: lo que queda detrás de la cámara no se pinta, el orden es
     por distancia y la profundidad de campo desenfoca fuera del plano de foco;
   - la interpolación entre claves (zoom logarítmico) y desde una clave 2D.

     node tools/check_ae_camera_model.js
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
require(path.join(__dirname, "..", "ui", "composition", "ae-camera.js"));
const ae = globalThis.LOW.composition.aeCamera;

let fallas = 0;
const ok = (cond, msg) => { console.log((cond ? "OK    " : "FALLA ") + msg); if (!cond) fallas++; };
const cerca = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const VB = [0, 0, 1920, 1080];
const cx = 960, cy = 540;

// planos falsos: lo único que la proyección lee es tagName, classList y getAttribute
function plano(attrs = {}, tag = "g") {
  return { tagName: tag, classList: { contains: () => false }, getAttribute: (k) => (k in attrs ? String(attrs[k]) : null) };
}
const svgDe = (...hijos) => ({ children: hijos });
const aplicar = (m, u, v) => [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]];

// 1) lente
ok(cerca(ae.zoomDeFocal(50, 1920), 2666.667), "50 mm en 1920 px = zoom 2666,7 px");
ok(cerca(ae.anguloDeZoom(ae.zoomDeFocal(50, 1920), 1920), 39.598, 1e-3), "50 mm = 39,6° de ángulo de visión");
ok(cerca(ae.focalDeZoom(ae.zoomDeAngulo(60, 1920), 1920), 31.177, 1e-3), "ángulo → zoom → focal ida y vuelta");

// 2) de 2D a AE sin saltos
const leg = { cx: cx + 300, cy: cy - 80, w: 1920, rot: 0 };
const camA = ae.desdeLegacy(leg, VB);
ok(cerca(camA.cx, leg.cx) && cerca(camA.cy, leg.cy) && cerca(camA.w, leg.w), "la cámara AE conserva cx/cy/w de la clave 2D");
let iguales = true;
// -150 y 600 están FUERA del rango de la cámara 2D (-60…400): la AE tiene que
// limitarlos igual. Sin límite, -150 quedaba detrás de la cámara por omisión y el
// plano de primer plano desaparecía al pasar a la cámara AE (3.50, medido)
for (const z of [0, 40, 120, 300, -40, -150, 600]) {
  const [p] = ae.planosProyectados(svgDe(plano({ "data-z": z })), camA, VB);
  if (!p.matriz) { iguales = false; continue; }
  const pp = 100 / (100 + Math.max(-60, Math.min(400, z)));
  for (const [u, v] of [[0, 0], [1920, 1080], [500, 700]]) {
    const [sx, sy] = aplicar(p.matriz, u, v);
    // cámara 2D con w = ancho: el plano se corre (cx - centro)·p y la vista recorta en cx - w/2
    const lx = u + (leg.cx - cx) * (1 - pp) - (leg.cx - 960), ly = v + (leg.cy - cy) * (1 - pp) - (leg.cy - 540);
    if (!cerca(sx, lx, 1e-4) || !cerca(sy, ly, 1e-4)) iguales = false;
  }
}
ok(iguales, "paneo: la cámara AE da el MISMO paralaje que la cámara 2D (Z 0, 40, 120, 300, -40, y -150/600 limitados)");
const back = ae.aplicarLegacy({ ...camA, cx: camA.cx + 100, w: camA.w / 2 }, VB);
ok(cerca(back.cx, camA.cx + 100) && cerca(back.w, camA.w / 2), "editar cx/w de una clave AE se traslada a la cámara 3D");

// 3) herramientas
const base = ae.desdeLegacy({ cx, cy, w: 1920 }, VB);
const dist = (c) => Math.hypot(c.x - c.poiX, c.y - c.poiY, c.z - c.poiZ);
const orb = ae.orbitar(base, 35, 20, VB);
ok(cerca(dist(orb), dist(base)) && cerca(orb.poiX, base.poiX) && !cerca(orb.x, base.x), "órbita: gira alrededor del punto de interés a la misma distancia");
const orbArriba = ae.orbitar(base, 0, 400, VB);
ok(orbArriba.y < base.y && Math.abs(Math.atan2(-(orbArriba.y - orbArriba.poiY), Math.hypot(orbArriba.x - orbArriba.poiX, orbArriba.z - orbArriba.poiZ)) * 180 / Math.PI) <= 89.01,
  "órbita vertical se frena en 89° (no da vuelta la cámara)");
const txy = ae.trackXY(base, 100, 0, VB);
ok(cerca(txy.x - base.x, txy.poiX - base.poiX) && txy.x < base.x && cerca(txy.z, base.z), "track XY: mueve cámara y punto de interés juntos");
const [antes] = ae.planosProyectados(svgDe(plano()), base, VB), [despues] = ae.planosProyectados(svgDe(plano()), txy, VB);
ok(cerca(aplicar(despues.matriz, 960, 540)[0] - aplicar(antes.matriz, 960, 540)[0], 100), "track XY de 100 px: el plano del punto de interés sigue al cursor 100 px");
const tz = ae.trackZ(base, 500, VB);
ok(cerca(tz.z, base.z + 500) && cerca(tz.poiZ, base.poiZ + 500), "track Z: dolly por el eje de la cámara");
const ln = ae.lente(base, base.zoom * 2, VB);
ok(cerca(ln.z, base.z) && cerca(ln.zoom, base.zoom * 2) && cerca(ln.w, base.w / 2), "lente: duplica el zoom sin mover la cámara");
// dolly zoom (vértigo): acercar la cámara y abrir la lente deja igual el plano de acción y cambia el fondo
const vert = ae.lente(ae.trackZ(base, base.zoom / 2, VB), base.zoom / 2, VB);
const fondoA = ae.planosProyectados(svgDe(plano({ "data-z": 200 })), base, VB)[0].matriz[0];
const fondoB = ae.planosProyectados(svgDe(plano({ "data-z": 200 })), vert, VB)[0].matriz[0];
const accionB = ae.planosProyectados(svgDe(plano()), vert, VB)[0].matriz[0];
ok(cerca(accionB, 1) && !cerca(fondoA, fondoB, 0.01), "dolly zoom: el plano de acción queda igual y el fondo cambia de tamaño");

// 4) perspectiva
const hijos = [plano({ "data-z": 300 }), plano({ "data-z": 0 }), plano({ "data-z": -95 }), plano({}, "defs")];
const lejos = ae.trackZ(base, base.zoom * 0.99, VB);   // la cámara pasa por delante del plano a Z -95
const pl = ae.planosProyectados(svgDe(...hijos), lejos, VB);
ok(pl[2].oculto === true, "un plano detrás de la cámara no se pinta");
ok(pl[3].pasa === true, "<defs> pasa sin transformar");
ok(pl[0].distancia > pl[1].distancia, "las distancias crecen con la profundidad (orden de pintado de AE)");
const dof = ae.completar({ ...base, dof: true, lockFocus: true, aperture: 40, blurLevel: 100 }, VB);
const pd = ae.planosProyectados(svgDe(plano({ "data-z": 0 }), plano({ "data-z": 200 })), dof, VB);
ok(pd[0].blur < 0.01 && pd[1].blur > 1, "profundidad de campo: nítido en foco, desenfocado lejos");
const sinDof = ae.planosProyectados(svgDe(plano({ "data-z": 200 })), base, VB);
ok(sinDof[0].blur === 0, "sin profundidad de campo no hay desenfoque");

// 5) interpolación
const k2 = ae.lente(ae.trackXY(base, 400, 0, VB), base.zoom * 4, VB);
const mitad = ae.interpolar(base, k2, 0.5, VB);
ok(cerca(mitad.zoom, base.zoom * 2), "interpolación: el zoom va en escala logarítmica (×4 pasa por ×2 a la mitad)");
ok(cerca(mitad.x, (base.x + k2.x) / 2), "interpolación: la posición va lineal");
const mix = ae.interpolar({ cx, cy, w: 1920, rot: 0 }, k2, 0, VB);
ok(mix.ae === 1 && cerca(mix.cx, cx) && cerca(mix.w, 1920), "interpolar desde una clave 2D arranca en el mismo cuadro");
const r = ae.redondear(mitad);
ok(r.ae === 1 && Number.isFinite(r.zoom) && cerca(r.x, mitad.x, 1e-2), "redondear conserva la cámara AE");

// 6) render 3D (3.51): la cámara de three.js tiene que ver EXACTAMENTE lo mismo
// que el proyector AE, también con la cámara orbitada y con un plano corrido
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const pantallaThree = (t, W) => {   // perspectiva de three: cámara mirando su -Z local, Y arriba
  const d = [W[0] - t.posicion[0], W[1] - t.posicion[1], W[2] - t.posicion[2]];
  const prof = -dot3(d, t.atras), tg = Math.tan(t.fovY * Math.PI / 360);
  const nx = dot3(d, t.derecha) / prof / (tg * t.aspecto), ny = dot3(d, t.arriba) / prof / tg;
  return [VB[0] + (nx + 1) / 2 * VB[2], VB[1] + (1 - ny) / 2 * VB[3]];
};
let igualThree = true;
for (const c of [base, ae.orbitar(base, 35, -12, VB), ae.lente(ae.trackXY(base, 300, -80, VB), base.zoom * 0.6, VB)]) {
  const t = ae.paraThree(c, VB), proy = ae.proyector(c, VB);
  for (const W of [[cx, cy, 0], [100, 900, 1500], [1800, 120, -600], [960, 540, 4000]]) {
    const a = proy(W); if (!a) continue;
    const [bx, by] = pantallaThree(t, W);
    if (!cerca(a.x, bx, 1e-6) || !cerca(a.y, by, 1e-6)) igualThree = false;
  }
}
ok(igualThree, "render 3D: la cámara de three.js proyecta cada punto donde lo pone el proyector AE (base, orbitada, con lente)");
const t0 = ae.paraThree(base, VB);
ok(cerca(Math.abs(dot3(t0.derecha, t0.arriba)), 0, 1e-9) && cerca(dot3(t0.arriba, t0.atras), 0, 1e-9), "render 3D: la base de la cámara es ortonormal");
// las esquinas del plano en el mundo son las mismas que usa la vista SVG
const pm = ae.planosMundo(svgDe(plano({ "data-z": 120, "data-comp-x": 40, "data-comp-rz": 15 })), VB)[0];
const pj = ae.planosProyectados(svgDe(plano({ "data-z": 120, "data-comp-x": 40, "data-comp-rz": 15 })), base, VB)[0];
const proyB = ae.proyector(base, VB);
let esquinasOk = pm.esquinas.length === 4;
for (const [i, [u, v]] of [[0, [0, 0]], [2, [1920, 1080]]]) {
  const s = proyB(pm.esquinas[i]), [ex, ey] = aplicar(pj.matriz, u, v);
  // con la cámara de frente la vista afín es exacta: deben coincidir
  if (!s || !cerca(s.x, ex, 1e-6) || !cerca(s.y, ey, 1e-6)) esquinasOk = false;
}
ok(esquinasOk, "render 3D: las esquinas de cada plano coinciden con la vista SVG (cámara de frente)");
ok(ae.planosMundo(svgDe(plano({ "data-z": -150 })), VB)[0].z === ae.planosMundo(svgDe(plano({ "data-z": -60 })), VB)[0].z,
  "render 3D: el mismo límite de profundidad que las otras vistas");

console.log(fallas ? "\nFALLAS: " + fallas : "\nTODO OK");
process.exit(fallas ? 1 : 0);
