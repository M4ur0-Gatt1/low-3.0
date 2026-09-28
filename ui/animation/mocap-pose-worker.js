/* Pose Landmarker en segundo plano. El worker nunca modifica el documento:
   recibe un cuadro, devuelve landmarks simples y puede descartarse sin efectos. */
let landmarker = null;

function plainLandmarks(list) {
  return (list || []).map(pose => (pose || []).map(point => ({
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
    z: Number(point.z) || 0,
    visibility: Number.isFinite(point.visibility) ? point.visibility : 1,
    presence: Number.isFinite(point.presence) ? point.presence : 1
  })));
}

function binaryMask(mask) {
  if (!mask) return null;
  const source = mask.getAsFloat32Array(), data = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index++) data[index] = source[index] >= .5 ? 1 : 0;
  return { width: mask.width, height: mask.height, data };
}

self.onmessage = async event => {
  const message = event.data || {}, id = message.id;
  try {
    if (message.type === "init") {
      const module = await import(message.moduleUrl);
      const vision = await module.FilesetResolver.forVisionTasks(message.wasmRoot);
      landmarker = await module.PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: message.modelUrl, delegate: "CPU" },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: message.minimum,
        minPosePresenceConfidence: message.minimum,
        minTrackingConfidence: message.minimum,
        outputSegmentationMasks: true
      });
      self.postMessage({ id, ok: true, value: { ready: true } });
      return;
    }
    if (message.type === "detect") {
      if (!landmarker) throw new Error("El detector corporal no fue inicializado");
      const result = landmarker.detectForVideo(message.bitmap, message.timestamp), mask = binaryMask(result?.segmentationMasks?.[0]);
      message.bitmap?.close?.();
      const value = { landmarks: plainLandmarks(result?.landmarks), mask };
      result?.close?.();
      self.postMessage({ id, ok: true, value }, mask ? [mask.data.buffer] : []);
      return;
    }
    if (message.type === "close") {
      landmarker?.close?.(); landmarker = null;
      self.postMessage({ id, ok: true, value: { closed: true } });
      self.close();
      return;
    }
    throw new Error("Mensaje de worker desconocido");
  } catch (error) {
    message.bitmap?.close?.();
    self.postMessage({ id, ok: false, error: String(error?.message || error) });
  }
};
