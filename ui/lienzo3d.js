/* ══ LIENZO 3D — dibujo con MALLAS reales (WebGL / Three.js) ══
   Distinto del "Espacio 3D" del estudio (SVG sobre planos): acá los trazos
   son geometría 3D de verdad — tubos con presión, luces, sombras y export
   GLB. Three.js r147 vendoreado (ui/vendor/three.min.js): sin toolchain,
   offline, como todo LOW.

   FASE 1 (completada): escena base — grilla infinita con niebla, luces con
   sombras, órbita/pan/zoom con inercia, toolbar flotante, render on-demand.
   FASE 2 (implementando): Motor de Contexto + Superficies de Dibujo + Pincel.
   FASE 3: edición con gizmos (mover/rotar/escalar).
   FASE 4: export GLB + bloom/DoF + guardado nativo.

   Estado en L3D (mismo patrón que DZ): un objeto módulo, funciones l3d*. */

const L3D = {
  open: false,
  renderer: null, scene: null, camera: null, controls: null,
  tool: "brush",          // brush | move | erase
  dirty: true,            // render on-demand: solo dibuja si algo cambió
  raf: 0,
  strokes: [],            // [{points:[[x,y,z,p]...], mesh, color, width}]
  
  // ══ MOTOR DE CONTEXTO (Feather-style) ═══════════════════════════
  surfaces: [],           // [DrawingSurface] — guías activas
  activeSurface: null,    // superficie donde se está dibujando
  capturePriority: ["vertex", "curve", "intersection", "surface", "mesh", "plane"],
  lastPoint: null,        // último punto dibujado (para continuidad)
  isDrawing: false,       // estado del lápiz/mouse
  
  // ══ CONFIGURACIÓN DEL PINCEL ════════════════════════════════════
  brush: {
    color: 0x2c3e50,
    width: 4,
    pressure: 1.0,
    material: "standard", // standard | toon | glossy
    mirror: false,        // espejo X para simetría
  },
};

// ════════════════════════════════════════════════════════════════════
// IDrawingSurface — interfaz base para TODAS las superficies
// Inspirado en Feather: cada guía responde igual, sin importar su forma
// ════════════════════════════════════════════════════════════════════

class DrawingSurface {
  constructor(name, type) {
    this.name = name;
    this.type = type;         // plane | cylinder | sphere | torus | cone | loft | mesh | image
    this.visible = true;
    this.mesh = null;         // Three.js Mesh para visualización
    this.priority = 4;        // prioridad por defecto (menor = más prioritario)
  }
  
  // RayIntersect(ray) → {point, normal, uv, distance} o null
  intersectRay(ray) { return null; }
  
  // ClosestPoint(worldPoint) → point3D sobre la superficie
  closestPoint(pt) { return pt.clone(); }
  
  // Normal(uv) → vector normal en ese punto
  normal(uv) { return new THREE.Vector3(0, 1, 0); }
  
  // UVCoordinates(worldPoint) → {u, v}
  uvCoordinates(pt) { return { u: 0, v: 0 }; }
  
  // DrawPreview() — renderiza la superficie en la escena
  drawPreview(scene) { if (this.mesh && this.visible) scene.add(this.mesh); }
  
  dispose() { if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.material.dispose(); } }
}

// ════════════════════════════════════════════════════════════════════
// Plano de dibujo — superficie básica perpendicular a la cámara
// ════════════════════════════════════════════════════════════════════

class PlaneSurface extends DrawingSurface {
  constructor(position, normal, size = 4000) {
    super("Plano", "plane");
    this.position = position.clone();
    this.normal = normal.normalize().clone();
    this.size = size;
    
    // Visualización: plano semi-transparente
    const geom = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x3498db, side: THREE.DoubleSide, transparent: true, opacity: 0.15,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.position);
    this.mesh.lookAt(this.position.clone().add(this.normal));
    this.priority = 6; // menos prioritario que vértices/curvas
  }
  
  intersectRay(ray) {
    const intersects = ray.intersectObject(this.mesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        point: hit.point,
        normal: hit.face ? hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize() : this.normal,
        uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : { u: 0, v: 0 },
        distance: hit.distance
      };
    }
    return null;
  }
  
  closestPoint(pt) {
    // Proyectar punto al plano
    const v = pt.clone().sub(this.position);
    const dist = v.dot(this.normal);
    return pt.clone().sub(this.normal.clone().multiplyScalar(dist));
  }
  
  normal(uv) { return this.normal.clone(); }
  
  uvCoordinates(pt) {
    const local = pt.clone().sub(this.position);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.mesh.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.mesh.quaternion);
    return {
      u: (local.dot(right) / this.size) + 0.5,
      v: (local.dot(up) / this.size) + 0.5
    };
  }
}

// ════════════════════════════════════════════════════════════════════
// Cilindro — superficie tubular para dibujar alrededor
// ════════════════════════════════════════════════════════════════════

class CylinderSurface extends DrawingSurface {
  constructor(position, axis, radius, height) {
    super("Cilindro", "cylinder");
    this.position = position.clone();
    this.axis = axis.normalize().clone();
    this.radius = radius;
    this.height = height;
    
    const geom = new THREE.CylinderGeometry(radius, radius, height, 32, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xe74c3c, side: THREE.DoubleSide, transparent: true, opacity: 0.15,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.position);
    // Rotar para alinear eje Y del cilindro con el axis dado
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.axis);
    this.mesh.setRotationFromQuaternion(q);
    this.priority = 5;
  }
  
  intersectRay(ray) {
    const intersects = ray.intersectObject(this.mesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        point: hit.point,
        normal: hit.face ? hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize() : new THREE.Vector3(),
        uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : { u: 0, v: 0 },
        distance: hit.distance
      };
    }
    return null;
  }
  
  closestPoint(pt) {
    // Transformar a espacio local del cilindro
    const local = pt.clone().sub(this.position);
    const qInv = new THREE.Quaternion().setFromUnitVectors(this.axis, new THREE.Vector3(0, 1, 0)).invert();
    local.applyQuaternion(qInv);
    
    // Proyectar a superficie cilíndrica
    const radial = new THREE.Vector3(local.x, 0, local.z).normalize().multiplyScalar(this.radius);
    const y = Math.max(-this.height/2, Math.min(this.height/2, local.y));
    
    const result = new THREE.Vector3(radial.x, y, radial.z);
    result.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.axis));
    result.add(this.position);
    return result;
  }
  
  normal(uv) {
    // Normal en coordenadas cilíndricas
    const angle = uv.u * Math.PI * 2;
    const n = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    n.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.axis));
    return n;
  }
  
  uvCoordinates(pt) {
    const local = pt.clone().sub(this.position);
    const qInv = new THREE.Quaternion().setFromUnitVectors(this.axis, new THREE.Vector3(0, 1, 0)).invert();
    local.applyQuaternion(qInv);
    
    const angle = Math.atan2(local.z, local.x);
    const u = ((angle + Math.PI) / (Math.PI * 2));
    const v = (local.y + this.height/2) / this.height;
    return { u, v };
  }
}

// ════════════════════════════════════════════════════════════════════
// Esfera — superficie esférica para dibujar en 360°
// ════════════════════════════════════════════════════════════════════

class SphereSurface extends DrawingSurface {
  constructor(position, radius) {
    super("Esfera", "sphere");
    this.position = position.clone();
    this.radius = radius;
    
    const geom = new THREE.SphereGeometry(radius, 32, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9b59b6, side: THREE.DoubleSide, transparent: true, opacity: 0.15,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.position);
    this.priority = 5;
  }
  
  intersectRay(ray) {
    const intersects = ray.intersectObject(this.mesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        point: hit.point,
        normal: hit.face ? hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize() : new THREE.Vector3(),
        uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : { u: 0, v: 0 },
        distance: hit.distance
      };
    }
    return null;
  }
  
  closestPoint(pt) {
    const dir = pt.clone().sub(this.position).normalize();
    return this.position.clone().add(dir.multiplyScalar(this.radius));
  }
  
  normal(uv) {
    // Normal desde UV esférico
    const phi = uv.v * Math.PI;
    const theta = uv.u * Math.PI * 2;
    return new THREE.Vector3(
      Math.sin(phi) * Math.cos(theta),
      Math.cos(phi),
      Math.sin(phi) * Math.sin(theta)
    );
  }
  
  uvCoordinates(pt) {
    const local = pt.clone().sub(this.position).normalize();
    const phi = Math.acos(local.y);
    const theta = Math.atan2(local.z, local.x);
    return {
      u: (theta + Math.PI) / (Math.PI * 2),
      v: phi / Math.PI
    };
  }
}

// ════════════════════════════════════════════════════════════════════
// Toro — superficie donut para curvas cerradas
// ════════════════════════════════════════════════════════════════════

class TorusSurface extends DrawingSurface {
  constructor(position, axis, majorRadius, minorRadius) {
    super("Toro", "torus");
    this.position = position.clone();
    this.axis = axis.normalize().clone();
    this.majorRadius = majorRadius;
    this.minorRadius = minorRadius;
    
    const geom = new THREE.TorusGeometry(majorRadius, minorRadius, 16, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xf39c12, side: THREE.DoubleSide, transparent: true, opacity: 0.15,
      depthWrite: false
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.position.copy(this.position);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.axis);
    this.mesh.setRotationFromQuaternion(q);
    this.priority = 5;
  }
  
  intersectRay(ray) {
    const intersects = ray.intersectObject(this.mesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        point: hit.point,
        normal: hit.face ? hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize() : new THREE.Vector3(),
        uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : { u: 0, v: 0 },
        distance: hit.distance
      };
    }
    return null;
  }
  
  closestPoint(pt) {
    // Aproximación iterativa al punto más cercano en el toro
    const local = pt.clone().sub(this.position);
    const qInv = new THREE.Quaternion().setFromUnitVectors(this.axis, new THREE.Vector3(0, 0, 1)).invert();
    local.applyQuaternion(qInv);
    
    const xyDist = Math.sqrt(local.x * local.x + local.y * local.y);
    const angle = Math.atan2(local.y, local.x);
    
    const toroidalU = ((xyDist - this.majorRadius) / this.minorRadius);
    const toroidalV = angle / (Math.PI * 2);
    
    const u = Math.atan2(toroidalU, local.z / this.minorRadius);
    const v = toroidalV;
    
    const ringAngle = v * Math.PI * 2;
    const tubeAngle = u;
    
    const x = (this.majorRadius + this.minorRadius * Math.cos(tubeAngle)) * Math.cos(ringAngle);
    const y = (this.majorRadius + this.minorRadius * Math.cos(tubeAngle)) * Math.sin(ringAngle);
    const z = this.minorRadius * Math.sin(tubeAngle);
    
    const result = new THREE.Vector3(x, y, z);
    result.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.axis));
    result.add(this.position);
    return result;
  }
  
  normal(uv) {
    const ringAngle = uv.v * Math.PI * 2;
    const tubeAngle = uv.u * Math.PI * 2;
    
    const cx = this.majorRadius * Math.cos(ringAngle);
    const cy = this.majorRadius * Math.sin(ringAngle);
    
    const px = (this.majorRadius + this.minorRadius * Math.cos(tubeAngle)) * Math.cos(ringAngle);
    const py = (this.majorRadius + this.minorRadius * Math.cos(tubeAngle)) * Math.sin(ringAngle);
    const pz = this.minorRadius * Math.sin(tubeAngle);
    
    return new THREE.Vector3(px - cx, py - cy, pz).normalize();
  }
  
  uvCoordinates(pt) {
    const local = pt.clone().sub(this.position);
    const qInv = new THREE.Quaternion().setFromUnitVectors(this.axis, new THREE.Vector3(0, 0, 1)).invert();
    local.applyQuaternion(qInv);
    
    const xyDist = Math.sqrt(local.x * local.x + local.y * local.y);
    const ringAngle = Math.atan2(local.y, local.x);
    const tubeAngle = Math.atan2(local.z, xyDist - this.majorRadius);
    
    return {
      u: (tubeAngle + Math.PI) / (Math.PI * 2),
      v: (ringAngle + Math.PI) / (Math.PI * 2)
    };
  }
}

// ════════════════════════════════════════════════════════════════════
// Loft — superficie interpolada entre múltiples curvas guía
// Similar a Rhino: no triangula, crea superficie editable
// ════════════════════════════════════════════════════════════════════

class LoftSurface extends DrawingSurface {
  constructor(curves, segments = 16) {
    super("Loft", "loft");
    this.curves = curves;     // array de Curve3
    this.segments = segments;
    
    // Generar geometría loft
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const curve = this._interpolateCurves(t);
      points.push(curve.getPoints(32));
    }
    
    const geom = new THREE.BufferGeometry();
    const vertices = [];
    for (let row = 0; row < points.length - 1; row++) {
      for (let col = 0; col < points[row].length - 1; col++) {
        const p1 = points[row][col];
        const p2 = points[row + 1][col];
        const p3 = points[row + 1][col + 1];
        const p4 = points[row][col + 1];
        
        vertices.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
        vertices.push(p1.x, p1.y, p1.z, p3.x, p3.y, p3.z, p4.x, p4.y, p4.z);
      }
    }
    
    geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1abc9c, side: THREE.DoubleSide, transparent: true, opacity: 0.15,
      depthWrite: false, wireframe: true
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.priority = 4;
  }
  
  _interpolateCurves(t) {
    // Interpolación lineal simple entre curvas
    if (this.curves.length === 1) return this.curves[0];
    if (this.curves.length === 2) {
      return new THREE.LineCurve3(
        this.curves[0].getPoint(t),
        this.curves[1].getPoint(t)
      );
    }
    // Para más curvas, usar Catmull-Rom
    const points = this.curves.map(c => c.getPoint(t));
    return new THREE.CatmullRomCurve3(points);
  }
  
  intersectRay(ray) {
    const intersects = ray.intersectObject(this.mesh);
    if (intersects.length > 0) {
      const hit = intersects[0];
      return {
        point: hit.point,
        normal: hit.face ? hit.face.normal.clone().normalize() : new THREE.Vector3(0, 1, 0),
        uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : { u: 0, v: 0 },
        distance: hit.distance
      };
    }
    return null;
  }
  
  closestPoint(pt) {
    // Búsqueda exhaustiva en la malla (podría optimizarse con BVH)
    let minDist = Infinity;
    let closest = pt.clone();
    
    const positions = this.mesh.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      const v = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
      const dist = v.distanceToSquared(pt);
      if (dist < minDist) {
        minDist = dist;
        closest.copy(v);
      }
    }
    return closest;
  }
  
  normal(uv) {
    // Normal aproximada desde la malla
    if (!this.mesh.geometry.attributes.normal) return new THREE.Vector3(0, 1, 0);
    const normals = this.mesh.geometry.attributes.normal.array;
    const idx = Math.floor(uv.v * (normals.length / 3 - 1)) * 3;
    return new THREE.Vector3(normals[idx], normals[idx+1], normals[idx+2]);
  }
  
  uvCoordinates(pt) {
    // UV aproximado basado en proyección
    return { u: 0.5, v: 0.5 };
  }
}

// ════════════════════════════════════════════════════════════════════
// SISTEMA DE CAPTURA POR PRIORIDAD (Feather-style)
// Consulta todos los captadores y elige el mejor
// ════════════════════════════════════════════════════════════════════

function l3dFindIntersection(ray) {
  let bestHit = null;
  let bestPriority = Infinity;
  
  // 1. Verificar vértices de strokes existentes (snap a puntos)
  for (const stroke of L3D.strokes) {
    for (const pt of stroke.points) {
      const vertex = new THREE.Vector3(pt[0], pt[1], pt[2]);
      const dist = ray.ray.distanceToPoint(vertex);
      if (dist < 15 && dist < bestPriority) {
        bestPriority = dist;
        bestHit = { point: vertex, normal: new THREE.Vector3(0,1,0), type: "vertex", distance: dist };
      }
    }
  }
  
  // 2. Verificar curvas completas (snap a línea)
  // ... (se puede agregar luego con TubeGeometry intersection)
  
  // 3. Verificar intersecciones entre curvas
  // ... (futuro: detectar cruces de strokes)
  
  // 4. Verificar superficies guía activas
  for (const surf of L3D.surfaces) {
    if (!surf.visible) continue;
    const hit = surf.intersectRay(ray);
    if (hit && hit.distance < bestPriority) {
      bestPriority = hit.distance;
      bestHit = { ...hit, type: "surface", surface: surf };
    }
  }
  
  // 5. Verificar meshes importadas
  // ... (futuro: cargar OBJ/GLTF y hacer raycast)
  
  // 6. fallback: plano de profundidad fija (si existe)
  if (!bestHit && L3D.depthPlane) {
    const hit = L3D.depthPlane.intersectRay(ray);
    if (hit) bestHit = { ...hit, type: "plane" };
  }
  
  return bestHit;
}

// ════════════════════════════════════════════════════════════════════
// CREAR GUÍAS RÁPIDAS (como Feather: Draw Guide)
// ════════════════════════════════════════════════════════════════════

function l3dCreateGuide(type, params) {
  let surface;
  
  switch (type) {
    case "plane":
      // Plano perpendicular a la cámara en la posición del cursor
      const camDir = new THREE.Vector3();
      L3D.camera.getWorldDirection(camDir);
      surface = new PlaneSurface(params.position || new THREE.Vector3(0, 0, 0), camDir, params.size || 4000);
      break;
      
    case "cylinder":
      surface = new CylinderSurface(
        params.position || new THREE.Vector3(0, 0, 0),
        params.axis || new THREE.Vector3(0, 1, 0),
        params.radius || 200,
        params.height || 400
      );
      break;
      
    case "sphere":
      surface = new SphereSurface(
        params.position || new THREE.Vector3(0, 0, 0),
        params.radius || 300
      );
      break;
      
    case "torus":
      surface = new TorusSurface(
        params.position || new THREE.Vector3(0, 0, 0),
        params.axis || new THREE.Vector3(0, 0, 1),
        params.majorRadius || 250,
        params.minorRadius || 80
      );
      break;
      
    case "loft":
      surface = new LoftSurface(params.curves || [], params.segments || 16);
      break;
      
    default:
      console.warn("Tipo de guía desconocido:", type);
      return null;
  }
  
  L3D.surfaces.push(surface);
  L3D.activeSurface = surface;
  L3D.dirty = true;
  return surface;
}

function l3dClearGuides() {
  for (const surf of L3D.surfaces) {
    L3D.scene.remove(surf.mesh);
    surf.dispose();
  }
  L3D.surfaces = [];
  L3D.activeSurface = null;
  L3D.dirty = true;
}

function l3dToggleGuide(type) {
  const existing = L3D.surfaces.find(s => s.type === type);
  if (existing) {
    existing.visible = !existing.visible;
    L3D.activeSurface = existing.visible ? existing : null;
  } else {
    l3dCreateGuide(type, {});
  }
  L3D.dirty = true;
}

function l3dToggle() { L3D.open ? l3dClose() : l3dOpen(); }

function l3dOpen() {
  const view = $("#l3dView");
  if (!view) return;
  if (typeof THREE === "undefined") return sysMsg(" Falta ui/vendor/three.min.js — reinstalá LOW.");
  view.hidden = false;
  const ab = $("#abL3d"); if (ab) ab.classList.add("active");
  if (!L3D.renderer) l3dInit();
  L3D.open = true;
  l3dResize();
  l3dInvalidate();
  l3dLoop();
  setStatus("Lienzo 3D — arrastrá: orbitar · rueda: zoom · Shift/medio: panear · Esc: salir");
}

function l3dClose() {
  L3D.open = false;
  cancelAnimationFrame(L3D.raf);
  const view = $("#l3dView"); if (view) view.hidden = true;
  const ab = $("#abL3d"); if (ab) ab.classList.remove("active");
  setStatus("Listo");
}

function l3dInit() {
  const host = $("#l3dCanvasHost");

  // ── renderer: antialias + sombras suaves + color correcto ──
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputEncoding = THREE.sRGBEncoding;
  host.appendChild(r.domElement);
  // pointer capture tolerante: OrbitControls revienta si el pointer ya no
  // existe (stylus que se levanta rápido, eventos sintéticos del arnés)
  const rawCap = r.domElement.setPointerCapture.bind(r.domElement);
  const rawRel = r.domElement.releasePointerCapture.bind(r.domElement);
  r.domElement.setPointerCapture = id => { try { rawCap(id); } catch (err) { /* pointer ido */ } };
  r.domElement.releasePointerCapture = id => { try { rawRel(id); } catch (err) { /* pointer ido */ } };

  // ── escena: el mismo gris del Espacio 3D; la niebla "disuelve" el borde
  //    de la grilla → sensación de lienzo infinito ──
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xD9D9D6);
  scene.fog = new THREE.Fog(0xD9D9D6, 2600, 7000);

  const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000);
  camera.position.set(430, 400, 760);

  // ── luces: hemisferio (relleno suave) + sol con sombras ──
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8f8f89, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(650, 950, 420);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -1600; sun.shadow.camera.right = 1600;
  sun.shadow.camera.top = 1600; sun.shadow.camera.bottom = -1600;
  sun.shadow.camera.far = 5000;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // ── piso fantasma: SOLO recibe la sombra (no se ve un "suelo") ──
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(20000, 20000),
    new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;               // apenas bajo la grilla: sin z-fighting
  ground.receiveShadow = true;
  scene.add(ground);

  // ── grilla doble escala + ejes (como los editores 3D pro) ──
  const grid = new THREE.GridHelper(4000, 40, 0x8f8f89, 0xc2c2bc);
  grid.material.transparent = true;
  grid.material.opacity = 0.55;
  scene.add(grid);
  const axes = new THREE.AxesHelper(220);
  axes.position.y = 0.5;
  scene.add(axes);

  // ── órbita con inercia — mismo lenguaje del Espacio 3D del estudio ──
  const controls = new THREE.OrbitControls(camera, r.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 160, 0);
  controls.maxPolarAngle = Math.PI * 0.96;   // no atravesar el piso del todo
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,                // Fase 2: izquierdo = pincel; órbita pasa a fondo/derecho
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  controls.addEventListener("change", l3dInvalidate);

  L3D.renderer = r; L3D.scene = scene; L3D.camera = camera; L3D.controls = controls;

  // ── toolbar flotante ──
  document.querySelectorAll("#l3dTools [data-l3dtool]").forEach(b =>
    b.onclick = () => l3dSetTool(b.dataset.l3dtool));
  const exit = $("#l3dExit"); if (exit) exit.onclick = l3dClose;

  window.addEventListener("resize", () => { if (L3D.open) l3dResize(); });
  document.addEventListener("keydown", e => {
    if (!L3D.open) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); l3dClose(); }
  });
}

function l3dSetTool(t) {
  L3D.tool = t;
  document.querySelectorAll("#l3dTools [data-l3dtool]").forEach(b =>
    b.classList.toggle("active", b.dataset.l3dtool === t));
  const NAMES = { brush: "Pincel 3D (tubos — llega en Fase 2)",
                  move: "Mover/rotar/escalar (Fase 3)", erase: "Borrador (Fase 2)" };
  setStatus("Lienzo 3D · " + (NAMES[t] || t));
}

function l3dResize() {
  const host = $("#l3dCanvasHost");
  if (!host || !L3D.renderer) return;
  const w = host.clientWidth || 1, h = host.clientHeight || 1;
  L3D.camera.aspect = w / h;
  L3D.camera.updateProjectionMatrix();
  L3D.renderer.setSize(w, h);
  l3dInvalidate();
}

function l3dInvalidate() { L3D.dirty = true; }

/* bucle on-demand: la GPU descansa si no pasa nada (batería, ventilador) */
function l3dLoop() {
  if (!L3D.open) return;
  L3D.raf = requestAnimationFrame(l3dLoop);
  if (L3D.controls.update()) L3D.dirty = true;   // la inercia sigue moviendo la cámara
  if (L3D.dirty) {
    L3D.renderer.render(L3D.scene, L3D.camera);
    L3D.dirty = false;
  }
}

// ════════════════════════════════════════════════════════════════════
// SISTEMA DE DIBUJO — Flujo Feather-style
// mouse → ray → surface → punto → curva
// NUNCA usa Z fijo, siempre dibuja SOBRE una superficie
// ════════════════════════════════════════════════════════════════════

function l3dGetMouseRay(clientX, clientY) {
  const rect = L3D.renderer.domElement.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  
  const mouse = new THREE.Vector2(x, y);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(mouse, L3D.camera);
  return raycaster.ray;
}

function l3dStartDrawing(clientX, clientY) {
  if (!L3D.open || L3D.tool !== "brush") return;
  
  const ray = l3dGetMouseRay(clientX, clientY);
  const hit = l3dFindIntersection(ray);
  
  if (hit) {
    L3D.isDrawing = true;
    L3D.lastPoint = hit.point.clone();
    
    // Crear nuevo stroke
    const stroke = {
      points: [[hit.point.x, hit.point.y, hit.point.z, L3D.brush.pressure]],
      color: L3D.brush.color,
      width: L3D.brush.width,
      material: L3D.brush.material,
      mesh: null,
      surface: hit.surface || null,
      normal: hit.normal ? hit.normal.clone() : new THREE.Vector3(0, 1, 0)
    };
    
    L3D.strokes.push(stroke);
    l3dUpdateStrokeMesh(stroke);
    L3D.dirty = true;
    
    setStatus(`Dibujando sobre ${hit.type === "vertex" ? "vértice" : hit.surface ? hit.surface.name : "plano"}`);
  }
}

function l3dContinueDrawing(clientX, clientY) {
  if (!L3D.isDrawing || L3D.strokes.length === 0) return;
  
  const ray = l3dGetMouseRay(clientX, clientY);
  const hit = l3dFindIntersection(ray);
  
  const currentStroke = L3D.strokes[L3D.strokes.length - 1];
  
  let point;
  if (hit) {
    point = hit.point.clone();
    currentStroke.normal.copy(hit.normal || new THREE.Vector3(0, 1, 0));
    currentStroke.surface = hit.surface || null;
  } else {
    // Si no hay intersección, proyectar desde el último punto en la dirección del rayo
    // hacia la superficie activa o plano de profundidad
    if (L3D.activeSurface) {
      const surfHit = L3D.activeSurface.intersectRay(ray);
      if (surfHit) point = surfHit.point.clone();
      else point = L3D.lastPoint.clone().add(ray.direction.clone().multiplyScalar(100));
    } else {
      point = L3D.lastPoint.clone().add(ray.direction.clone().multiplyScalar(100));
    }
  }
  
  // Suavizar: interpolar con el punto anterior para evitar saltos
  const dist = point.distanceTo(L3D.lastPoint);
  if (dist > 5) {  // mínimo movimiento para agregar punto
    // Interpolación lineal para suavidad
    const alpha = Math.min(1, 15 / dist);
    point.lerp(L3D.lastPoint, 1 - alpha);
    
    currentStroke.points.push([point.x, point.y, point.z, L3D.brush.pressure]);
    L3D.lastPoint.copy(point);
    
    // Regenerar malla del stroke (procedural: spline → ribbon → mesh)
    l3dUpdateStrokeMesh(currentStroke);
    L3D.dirty = true;
  }
}

function l3dStopDrawing() {
  L3D.isDrawing = false;
  L3D.lastPoint = null;
  setStatus("Lienzo 3D");
}

// ════════════════════════════════════════════════════════════════════
// GENERACIÓN DE MALLA PROCEDURAL (Feather-style)
// Spline → Ribbon/Tube → Mesh → GPU
// Nunca guarda millones de vértices, solo puntos de control
// ════════════════════════════════════════════════════════════════════

function l3dUpdateStrokeMesh(stroke) {
  if (stroke.mesh) {
    L3D.scene.remove(stroke.mesh);
    stroke.mesh.geometry.dispose();
    stroke.mesh.material.dispose();
  }
  
  if (stroke.points.length < 2) return;
  
  // Convertir puntos a Catmull-Rom spline para suavidad
  const pts = stroke.points.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  
  // Generar tubo a lo largo del spline (como Feather: ribbon/tube procedural)
  const geometry = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), stroke.width / 2, 8, false);
  
  // Material según configuración
  let material;
  switch (stroke.material) {
    case "toon":
      material = new THREE.MeshToonMaterial({ color: stroke.color });
      break;
    case "glossy":
      material = new THREE.MeshStandardMaterial({ 
        color: stroke.color, roughness: 0.2, metalness: 0.6 
      });
      break;
    default: // standard
      material = new THREE.MeshStandardMaterial({ 
        color: stroke.color, roughness: 0.5, metalness: 0.3 
      });
  }
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  stroke.mesh = mesh;
  L3D.scene.add(mesh);
}

// ════════════════════════════════════════════════════════════════════
// MODO ESPEJO (simetría X como en Feather/ZBrush)
// ════════════════════════════════════════════════════════════════════

function l3dToggleMirror() {
  L3D.brush.mirror = !L3D.brush.mirror;
  setStatus(L3D.brush.mirror ? "Espejo X: ACTIVADO" : "Espejo X: desactivado");
}

// ════════════════════════════════════════════════════════════════════
// EXPORTAR GLB (Fase 4)
// ════════════════════════════════════════════════════════════════════

function l3dExportGLB() {
  if (L3D.strokes.length === 0) {
    sysMsg(" No hay trazos para exportar");
    return;
  }
  
  // Crear escena temporal solo con los strokes
  const exportScene = new THREE.Scene();
  for (const stroke of L3D.strokes) {
    if (stroke.mesh) {
      exportScene.add(stroke.mesh.clone());
    }
  }
  
  // Usar GLTFExporter de Three.js (necesita vendor/gltf-exporter.js)
  if (typeof THREE.GLTFExporter === "undefined") {
    sysMsg(" Export GLB: falta gltf-exporter.js en vendor/");
    return;
  }
  
  const exporter = new THREE.GLTFExporter();
  exporter.parse(
    exportScene,
    function(gltf) {
      // Descargar como archivo .glb
      const blob = new Blob([gltf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `low_lienzo3d_${Date.now()}.glb`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("GLB exportado");
    },
    function(error) {
      sysMsg(" Error al exportar GLB: " + error.message);
    },
    { binary: true }  // GLB en vez de GLTF
  );
}

// ════════════════════════════════════════════════════════════════════
// IMPORTAR MESH COMO SUPERFICIE DE DIBUJO (Fase 2 avanzada)
// ════════════════════════════════════════════════════════════════════

function l3dImportMesh(fileData, callback) {
  if (typeof THREE.OBJLoader === "undefined" && typeof THREE.GLTFLoader === "undefined") {
    sysMsg(" Import: faltan loaders en vendor/");
    return;
  }
  
  // Detectar formato por magic bytes o extensión
  const isGLB = fileData.byteLength > 4 && new Uint8Array(fileData, 0, 4).every((b, i) => 
    [0x67, 0x6C, 0x54, 0x46][i] === b  // "glTF"
  );
  
  const onLoad = (object) => {
    // Convertir toda la malla en una superficie de dibujo
    const meshSurfaces = [];
    
    object.traverse((child) => {
      if (child.isMesh) {
        const surf = new DrawingSurface(child.name || "Mesh", "mesh");
        surf.mesh = child.clone();
        surf.mesh.material = new THREE.MeshBasicMaterial({
          color: 0x95a5a6, side: THREE.DoubleSide, transparent: true, opacity: 0.1,
          depthWrite: false, wireframe: true
        });
        surf.priority = 5;
        
        // Sobrescribir intersectRay para usar la malla importada
        surf.intersectRay = function(ray) {
          const intersects = ray.intersectObject(this.mesh);
          if (intersects.length > 0) {
            const hit = intersects[0];
            return {
              point: hit.point,
              normal: hit.face ? hit.face.normal.clone().transformDirection(this.mesh.matrixWorld).normalize() : new THREE.Vector3(),
              uv: hit.uv ? { u: hit.uv.x, v: hit.uv.y } : { u: 0, v: 0 },
              distance: hit.distance
            };
          }
          return null;
        };
        
        meshSurfaces.push(surf);
      }
    });
    
    L3D.surfaces.push(...meshSurfaces);
    if (meshSurfaces.length > 0) {
      L3D.activeSurface = meshSurfaces[0];
      setStatus(`Mesh importada: ${meshSurfaces.length} superficies`);
    }
    
    if (callback) callback(meshSurfaces);
  };
  
  if (isGLB || fileData instanceof ArrayBuffer) {
    const loader = new THREE.GLTFLoader();
    const blob = new Blob([fileData], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    loader.load(url, (gltf) => onLoad(gltf.scene), null, (err) => {
      sysMsg(" Error al cargar GLB: " + err.message);
      URL.revokeObjectURL(url);
    });
    URL.revokeObjectURL(url);
  } else {
    // Asumir OBJ
    const loader = new THREE.OBJLoader();
    const text = new TextDecoder().decode(fileData);
    const obj = loader.parse(text);
    onLoad(obj);
  }
}

// ════════════════════════════════════════════════════════════════════
// LIQUIFY-style editing (Fase 3)
// Campo vectorial sobre spline, no modificación directa de triángulos
// ════════════════════════════════════════════════════════════════════

function l3dLiquifyStroke(strokeIndex, brushPos, brushRadius, strength) {
  const stroke = L3D.strokes[strokeIndex];
  if (!stroke) return;
  
  // Mover puntos de control del spline dentro del radio del pincel
  for (let i = 0; i < stroke.points.length; i++) {
    const pt = new THREE.Vector3(stroke.points[i][0], stroke.points[i][1], stroke.points[i][2]);
    const dist = pt.distanceTo(brushPos);
    
    if (dist < brushRadius) {
      const falloff = 1 - (dist / brushRadius);
      const displacement = brushPos.clone().sub(pt).normalize().multiplyScalar(strength * falloff);
      
      stroke.points[i][0] += displacement.x;
      stroke.points[i][1] += displacement.y;
      stroke.points[i][2] += displacement.z;
    }
  }
  
  // Regenerar malla
  l3dUpdateStrokeMesh(stroke);
  L3D.dirty = true;
}

// ════════════════════════════════════════════════════════════════════
// BORRAR TRAZOS (erase tool)
// ════════════════════════════════════════════════════════════════════

function l3dEraseAt(clientX, clientY) {
  const ray = l3dGetMouseRay(clientX, clientY);
  
  // Buscar strokes cercanos al rayo
  for (let i = L3D.strokes.length - 1; i >= 0; i--) {
    const stroke = L3D.strokes[i];
    for (const pt of stroke.points) {
      const vertex = new THREE.Vector3(pt[0], pt[1], pt[2]);
      const dist = ray.ray.distanceToPoint(vertex);
      if (dist < 30) {
        // Eliminar stroke
        if (stroke.mesh) {
          L3D.scene.remove(stroke.mesh);
          stroke.mesh.geometry.dispose();
          stroke.mesh.material.dispose();
        }
        L3D.strokes.splice(i, 1);
        L3D.dirty = true;
        return true;
      }
    }
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════
// EVENTOS DE MOUSE/POINTER para dibujo
// ════════════════════════════════════════════════════════════════════

function l3dOnPointerDown(e) {
  if (!L3D.open) return;
  if (L3D.tool === "erase") {
    l3dEraseAt(e.clientX, e.clientY);
    return;
  }
  l3dStartDrawing(e.clientX, e.clientY);
}

function l3dOnPointerMove(e) {
  if (!L3D.open) return;
  if (L3D.isDrawing) {
    l3dContinueDrawing(e.clientX, e.clientY);
  }
}

function l3dOnPointerUp(e) {
  if (!L3D.open) return;
  l3dStopDrawing();
}

// Instalar listeners cuando se abre el lienzo
const _origL3dInit = l3dInit;
l3dInit = function() {
  _origL3dInit();
  
  const canvas = L3D.renderer.domElement;
  canvas.addEventListener("pointerdown", l3dOnPointerDown);
  canvas.addEventListener("pointermove", l3dOnPointerMove);
  canvas.addEventListener("pointerup", l3dOnPointerUp);
  canvas.addEventListener("pointerleave", l3dStopDrawing);
};

// ════════════════════════════════════════════════════════════════════
// ATAJOS DE TECLADO para gestión de guías
// ════════════════════════════════════════════════════════════════════

const _origKeyHandler = document.onkeydown;
document.addEventListener("keydown", (e) => {
  if (!L3D.open) return;
  
  // G: crear guía automática (plano perpendicular a cámara)
  if (e.key.toLowerCase() === "g" && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    l3dCreateGuide("plane", {});
    setStatus("Guía: plano creado en posición de cámara");
  }
  
  // Ctrl+G: limpiar todas las guías
  if (e.key.toLowerCase() === "g" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    l3dClearGuides();
    setStatus("Guías limpiadas");
  }
  
  // 1-5: cambiar tipo de guía
  if (e.key >= "1" && e.key <= "5" && !e.ctrlKey && !e.metaKey) {
    const types = ["plane", "cylinder", "sphere", "torus", "loft"];
    const idx = parseInt(e.key) - 1;
    l3dToggleGuide(types[idx]);
    setStatus(`Guía: ${types[idx]} ${L3D.surfaces.find(s => s.type === types[idx])?.visible ? "activa" : "oculta"}`);
  }
  
  // M: toggle espejo
  if (e.key.toLowerCase() === "m" && !e.ctrlKey && !e.metaKey) {
    l3dToggleMirror();
  }
  
  // E: exportar GLB
  if (e.key.toLowerCase() === "e" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    l3dExportGLB();
  }
});
