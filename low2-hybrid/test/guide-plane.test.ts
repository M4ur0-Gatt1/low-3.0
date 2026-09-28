/**
 * Prueba el invariante que estaba roto: el PLANO DE RESPALDO de una guía tiene
 * que contener a la malla barrida que el usuario ve en pantalla.
 *
 * Reproduce el barrido exactamente como buildGuideSurface() y mide la distancia
 * de cada vértice al plano. Con la normal vieja (= eje de barrido) el plano sale
 * girado 90° y los vértices se van a metros de distancia.
 */
import * as THREE from 'three';
import { WebGLDesign3D } from '../modules/design/engine/webgl-design3d';

type Case = { name: string; axis: THREE.Vector3; points: THREE.Vector3[] };

/** Vértices que buildGuideSurface genera: la curva barrida ±L sobre `axis`. */
function sweptVertices(points: THREE.Vector3[], axis: THREE.Vector3) {
  const box = new THREE.Box3().setFromPoints(points);
  const L = THREE.MathUtils.clamp(box.getSize(new THREE.Vector3()).length() * 2, 5, 14);
  const out: THREE.Vector3[] = [];
  for (const p of points) {
    out.push(p.clone().addScaledVector(axis, L));
    out.push(p.clone().addScaledVector(axis, -L));
  }
  return out;
}

function centroid(points: THREE.Vector3[]) {
  const c = new THREE.Vector3();
  points.forEach((p) => c.add(p));
  return c.multiplyScalar(1 / points.length);
}

/** Traza vertical dibujada en la vista Izquierda: vive en un plano x = const,
 *  y el barrido va sobre X (la normal de ese plano). */
const line = (from: THREE.Vector3, to: THREE.Vector3, n = 12) =>
  Array.from({ length: n }, (_, i) => from.clone().lerp(to, i / (n - 1)));

const CASES: Case[] = [
  {
    name: 'vista Izquierda — trazo vertical (barrido sobre X)',
    axis: new THREE.Vector3(-1, 0, 0),
    points: line(new THREE.Vector3(1.5, 0, 0), new THREE.Vector3(1.5, 2, 0)),
  },
  {
    name: 'vista Frente — trazo vertical (barrido sobre Z)',
    axis: new THREE.Vector3(0, 0, 1),
    points: line(new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(0, 2, -0.5)),
  },
  {
    name: 'vista Arriba — trazo horizontal (barrido sobre Y, degeneraba lookAt)',
    axis: new THREE.Vector3(0, 1, 0),
    points: line(new THREE.Vector3(-1, 0.8, 0), new THREE.Vector3(1, 0.8, 0)),
  },
  {
    name: 'vista Frente — trazo diagonal',
    axis: new THREE.Vector3(0, 0, 1),
    points: line(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1.4, 0.7, 0)),
  },
  {
    // Este es el caso que de verdad ejercita el helper: un trazo CURVO va por la
    // rama de BÓVEDA, que es la que usa guidePlaneNormalOf(). Una bóveda no es
    // plana, así que acá no se exige desvío cero — solo que la normal sea
    // perpendicular al eje de barrido (el invariante que estaba roto) y que el
    // plano quede MUCHÍSIMO más cerca de la malla que el de la normal vieja.
    name: 'vista Frente — ARCO (bóveda, barrido sobre Z)',
    axis: new THREE.Vector3(0, 0, 1),
    points: Array.from({ length: 16 }, (_, i) => {
      const t = -0.9 + (1.8 * i) / 15;              // arco suave en el plano XY
      return new THREE.Vector3(t, 0.45 * (1 - t * t), 0);
    }),
  },
];

/** Casos donde la malla NO es plana por definición: no se les exige desvío 0. */
const CURVOS = new Set(['vista Frente — ARCO (bóveda, barrido sobre Z)']);

let failed = 0;
const cam = new THREE.Vector3(0, 0, 1);

for (const c of CASES) {
  const cen = centroid(c.points);
  const verts = sweptVertices(c.points, c.axis);

  const nuevo = WebGLDesign3D.guidePlaneNormalOf(c.points, c.axis, cam);
  const planoNuevo = new THREE.Plane().setFromNormalAndCoplanarPoint(nuevo, cen);
  const viejo = c.axis.clone().normalize(); // lo que hacía el código anterior
  const planoViejo = new THREE.Plane().setFromNormalAndCoplanarPoint(viejo, cen);

  const maxDist = (pl: THREE.Plane) =>
    Math.max(...verts.map((v) => Math.abs(pl.distanceToPoint(v))));

  const dNuevo = maxDist(planoNuevo);
  const dViejo = maxDist(planoViejo);
  const ortogonal = Math.abs(nuevo.dot(c.axis)); // debe ser ~0: la normal ⟂ al barrido

  // Invariante duro en todos los casos: la normal del plano de respaldo tiene
  // que ser PERPENDICULAR al eje de barrido (era exactamente paralela antes).
  // Para los rectos, además, la malla es plana → el plano la contiene exacto.
  const ok = ortogonal < 1e-6 && (CURVOS.has(c.name) ? dNuevo < dViejo / 5 : dNuevo < 1e-6);
  if (!ok) failed++;
  console.log(
    `${ok ? 'OK  ' : 'FALLA'} ${c.name}\n` +
    `      normal nueva  = (${nuevo.toArray().map((v) => v.toFixed(3)).join(', ')})\n` +
    `      desvío malla→plano:  nuevo ${dNuevo.toExponential(2)} m` +
    `   ·   viejo ${dViejo.toFixed(2)} m\n` +
    `      normal·eje_barrido:  nuevo ${ortogonal.toExponential(2)}` +
    `   ·   viejo ${Math.abs(viejo.dot(c.axis)).toFixed(2)} (1.00 = paralela, o sea plano girado 90°)`
  );
}

console.log(failed ? `\n${failed} caso(s) FALLAN` : '\nTodos los casos pasan');
process.exit(failed ? 1 : 0);
