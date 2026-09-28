(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const composition = LOW.composition = LOW.composition || {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const round = (value, step) => step > 0 ? Math.round(value / step) * step : value;
  const DEFAULT_CAMERA = Object.freeze({ x: 0, y: 0, z: -1000, rotationX: 0, rotationY: 0,
    rotationZ: 0, focalLength: 50, sensorWidth: 36, focusDistance: 1000, aperture: 0 });

  function normalizeTransform(value = {}) {
    return { x: Number(value.x) || 0, y: Number(value.y) || 0, z: clamp(value.z || 0, -10000, 10000),
      rotationX: Number(value.rotationX) || 0, rotationY: Number(value.rotationY) || 0,
      rotationZ: Number(value.rotationZ) || 0,
      scaleX: clamp(value.scaleX ?? value.scale ?? 1, .001, 1000),
      scaleY: clamp(value.scaleY ?? value.scale ?? 1, .001, 1000) };
  }
  function snapTransform(transform, settings = {}) {
    const value = normalizeTransform(transform);
    if (settings.enabled === false) return value;
    const spatial = Math.max(0, Number(settings.spatial) || 10), depth = Math.max(0, Number(settings.depth) || spatial);
    const angle = Math.max(0, Number(settings.angle) || 15), scale = Math.max(0, Number(settings.scale) || .05);
    return { x: round(value.x, spatial), y: round(value.y, spatial), z: round(value.z, depth),
      rotationX: round(value.rotationX, angle), rotationY: round(value.rotationY, angle),
      rotationZ: round(value.rotationZ, angle), scaleX: round(value.scaleX, scale), scaleY: round(value.scaleY, scale) };
  }
  function cameraProjection(camera = {}) {
    const value = { ...DEFAULT_CAMERA, ...camera };
    const focalLength = clamp(value.focalLength, 1, 500), sensorWidth = clamp(value.sensorWidth, 1, 100);
    return { ...value, focalLength, sensorWidth, fov: 2 * Math.atan(sensorWidth / (2 * focalLength)) * 180 / Math.PI };
  }
  function projectPlane(transform, camera = DEFAULT_CAMERA) {
    const plane = normalizeTransform(transform), lens = cameraProjection(camera);
    const distance = Math.max(1, plane.z - lens.z), referenceDistance = Math.max(1, -lens.z);
    const perspectiveScale = referenceDistance / distance, focusError = Math.abs(distance - lens.focusDistance);
    const blur = lens.aperture > 0 ? clamp(focusError / distance * lens.aperture * 12, 0, 40) : 0;
    return { x: (plane.x - lens.x) * perspectiveScale, y: (plane.y - lens.y) * perspectiveScale,
      scaleX: plane.scaleX * perspectiveScale, scaleY: plane.scaleY * perspectiveScale,
      rotationX: plane.rotationX - lens.rotationX, rotationY: plane.rotationY - lens.rotationY,
      rotationZ: plane.rotationZ - lens.rotationZ, distance, perspectiveScale, blur };
  }
  function parallaxDelta(transform, cameraBefore, cameraAfter) {
    const before = projectPlane(transform, cameraBefore), after = projectPlane(transform, cameraAfter);
    return { x: after.x - before.x, y: after.y - before.y, scale: after.perspectiveScale / before.perspectiveScale };
  }
  function classifyDepth(z) { z = Number(z) || 0; return z < -100 ? "foreground" : z > 250 ? "background" : "action"; }
  function transformOperation(planeId, before, after, meta = {}) {
    if (!planeId) throw Error("planeId es obligatorio");
    return { type: "composition.plane.transform", target: `plane:${planeId}`,
      payload: { before: normalizeTransform(before), after: normalizeTransform(after) },
      meta: { groupId: meta.groupId || `transform:${planeId}`, baseRevision: Number(meta.baseRevision) || 0 } };
  }
  composition.multiplane = Object.freeze({ DEFAULT_CAMERA, normalizeTransform, snapTransform,
    cameraProjection, projectPlane, parallaxDelta, classifyDepth, transformOperation });
})(typeof window !== "undefined" ? window : globalThis);
