/* Captura de movimiento por video — modelo persistente, independiente de UI. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const engines = new Map();

  class MotionCaptureTrack {
    constructor(doc) {
      this.doc = doc || null;
      this.source = null;
      this.range = { in: 1, out: 1 };
      this.status = "empty";
      this.engine = null;
      this.poseEngine = null;
      this.poseAnalysis = null;
      this.subjectRegion = null;
      this.analysisOptions = { threshold: 54, cleanup: 4, backgroundTime: 0, backgroundLocked: false, poseConfidence: .45, poseInterpolation: true, footLock: true, keyTolerance: 2 };
      this.samples = {};
      this.silhouettes = {};
    }
    setSubjectRegion(region) {
      if (!region) { this.subjectRegion = null; return null; }
      const x=Math.max(0,Math.min(1,Number(region.x)||0)), y=Math.max(0,Math.min(1,Number(region.y)||0));
      const w=Math.max(.01,Math.min(1-x,Number(region.w)||1)), h=Math.max(.01,Math.min(1-y,Number(region.h)||1));
      this.subjectRegion={x,y,w,h}; return this.subjectRegion;
    }
    setSource(meta) {
      meta = meta || {};
      this.source = {
        name: String(meta.name || "video"), path: String(meta.path || ""),
        duration: Math.max(0, Number(meta.duration) || 0),
        width: Math.max(0, Number(meta.width) || 0),
        height: Math.max(0, Number(meta.height) || 0),
        fps: Math.max(0, Number(meta.fps) || 0)
      };
      const sceneFps = this.doc && this.doc.scene ? this.doc.scene.fps : 24;
      this.range = { in: 1, out: Math.max(1, Math.round(this.source.duration * sceneFps)) };
      this.status = "reference";
      return this;
    }
    setPose(frame, joints, confidence, metadata) {
      const f = Math.max(1, Math.round(Number(frame) || 1));
      this.samples[f] = { joints: JSON.parse(JSON.stringify(joints || {})),
        confidence: confidence == null ? 1 : Math.max(0, Math.min(1, Number(confidence) || 0)) };
      Object.assign(this.samples[f], metadata || {});
      this.status = "tracked";
      return this.samples[f];
    }
    setSilhouette(frame, data) {
      const f = Math.max(1, Math.round(Number(frame) || 1));
      this.silhouettes[f] = Object.assign({}, data || {});
      this.status = "tracked";
      return this.silhouettes[f];
    }
    silhouetteAt(frame) { return this.silhouettes[Math.max(1, Math.round(Number(frame) || 1))] || null; }
    poseAt(frame) { return this.samples[Math.max(1, Math.round(Number(frame) || 1))] || null; }
    timeAt(frame, sceneFps) {
      const fps = Math.max(1, Number(sceneFps) || (this.doc && this.doc.scene && this.doc.scene.fps) || 24);
      return Math.max(0, (Math.max(1, Number(frame) || 1) - this.range.in) / fps);
    }
    toJSON() {
      return { version: 3, source: this.source, range: this.range, status: this.status,
        subjectRegion: this.subjectRegion,
        analysisOptions: this.analysisOptions,
        engine: this.engine, poseEngine: this.poseEngine, poseAnalysis: this.poseAnalysis,
        samples: this.samples, silhouettes: this.silhouettes };
    }
    fromJSON(data) {
      data = data || {};
      this.source = data.source ? Object.assign({}, data.source) : null;
      this.range = Object.assign({ in: 1, out: 1 }, data.range || {});
      this.status = data.status || (this.source ? "reference" : "empty");
      this.engine = data.engine || null;
      this.poseEngine = data.poseEngine || null;
      this.poseAnalysis = data.poseAnalysis ? Object.assign({},data.poseAnalysis) : null;
      this.subjectRegion = data.subjectRegion ? this.setSubjectRegion(data.subjectRegion) : null;
      this.analysisOptions = Object.assign({threshold:54,cleanup:4,backgroundTime:0,backgroundLocked:false,poseConfidence:.45,poseInterpolation:true,footLock:true,keyTolerance:2},data.analysisOptions||{});
      // Migración: en escenas anteriores sólo un tiempo distinto de cero prueba
      // que el usuario eligió un fondo; cero era también el valor automático.
      if(data.analysisOptions && data.analysisOptions.backgroundLocked == null)
        this.analysisOptions.backgroundLocked = Number(data.analysisOptions.backgroundTime) > 0;
      this.samples = Object.assign({}, data.samples || {});
      this.silhouettes = Object.assign({}, data.silhouettes || {});
      return this;
    }
  }

  function registerMocapEngine(id, engine) {
    if (!id || !engine || typeof engine.analyze !== "function") throw new Error("Motor mocap inválido");
    engines.set(String(id), engine);
  }

  function waitForVideo(video, event) {
    return new Promise((resolve, reject) => {
      const ok = () => { clean(); resolve(); };
      const bad = () => { clean(); reject(new Error("No se pudo decodificar el video")); };
      const clean = () => { video.removeEventListener(event, ok); video.removeEventListener("error", bad); };
      video.addEventListener(event, ok, { once: true });
      video.addEventListener("error", bad, { once: true });
    });
  }
  async function seek(video, time) {
    if (Math.abs(video.currentTime - time) < .002) return;
    const done = waitForVideo(video, "seeked");
    video.currentTime = time;
    await done;
  }
  function encodeMask(mask) {
    const runs = [];
    for (let i = 0; i < mask.length;) {
      const value = mask[i], start = i;
      while (i < mask.length && mask[i] === value && i - start < 65535) i++;
      runs.push(i - start, value);
    }
    return runs;
  }
  function decodeMask(data) {
    const size = Math.max(0, (data.width || 0) * (data.height || 0));
    const out = new Uint8Array(size), runs = data.runs || [];
    let at = 0;
    for (let i = 0; i + 1 < runs.length && at < size; i += 2) {
      out.fill(runs[i + 1] ? 255 : 0, at, Math.min(size, at + runs[i])); at += runs[i];
    }
    return out;
  }

  function mocapMaskStats(data) {
    const mask = decodeMask(data || {}), pixels = mask.length;
    let count = 0;
    for (const value of mask) if (value) count++;
    const minimum = Math.max(1, Math.min(4, Math.ceil(pixels * .0004)));
    return { pixels, count, coverage: pixels ? count / pixels : 0,
      empty: count === 0, usable: count >= minimum };
  }

  /** Convierte la máscara binaria en geometría SVG autónoma. Los calcos dejan
   *  de depender de un PNG data: embebido (que algunos WebView empaquetados
   *  no repintan al cambiar de Drawing) y una máscara vacía ya no se confunde
   *  con un dibujo blanco válido. Cada tramo horizontal se guarda como un
   *  rectángulo dentro de un único path compacto. */
  function mocapMaskSvgContent(data, size = {}, options = {}) {
    const width = Math.max(1, Math.round(Number(data?.width) || 0));
    const height = Math.max(1, Math.round(Number(data?.height) || 0));
    const mask = decodeMask(data || {}), stats = mocapMaskStats(data);
    if (!stats.usable || mask.length !== width * height) return null;
    const path = [];
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width;) {
        while (x < width && !mask[row + x]) x++;
        if (x >= width) break;
        const start = x;
        while (x < width && mask[row + x]) x++;
        path.push(`M${start} ${y}h${x - start}v1h${start - x}z`);
      }
    }
    const targetWidth = Math.max(1, Number(size.width) || width),
      targetHeight = Math.max(1, Number(size.height) || height),
      x = Number(size.x) || 0, y = Number(size.y) || 0,
      fill = options.fill || "#282828",
      opacity = Number.isFinite(+options.opacity) ? Math.max(0, Math.min(1, +options.opacity)) : .6;
    return `<g data-low-roto="1" data-mask-width="${width}" data-mask-height="${height}" ` +
      `transform="translate(${x} ${y}) scale(${targetWidth / width} ${targetHeight / height})">` +
      `<path d="${path.join("")}" fill="${fill}" opacity="${opacity}"/></g>`;
  }

  function medianMocapBackground(samples) {
    const usable = (samples || []).filter(frame => frame && frame.length);
    if (!usable.length) return new Uint8ClampedArray();
    const length = Math.min(...usable.map(frame => frame.length)), out = new Uint8ClampedArray(length);
    for (let p = 0; p < length; p += 4) {
      for (let channel = 0; channel < 3; channel++) {
        const values = usable.map(frame => frame[p + channel]).sort((a, b) => a - b);
        out[p + channel] = values[Math.floor(values.length / 2)];
      }
      out[p + 3] = 255;
    }
    return out;
  }
  function filterMotionComponents(input, width, height, previousBounds) {
    const size=Math.max(0,width*height),mask=input instanceof Uint8Array?input:new Uint8Array(input||[]),visited=new Uint8Array(size),components=[];
    for(let start=0;start<size;start++){if(!mask[start]||visited[start])continue;const queue=[start],pixels=[];visited[start]=1;let minX=width,minY=height,maxX=-1,maxY=-1,sumX=0,sumY=0;
      for(let at=0;at<queue.length;at++){const q=queue[at],x=q%width,y=Math.floor(q/width);pixels.push(q);sumX+=x;sumY+=y;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
        for(let yy=Math.max(0,y-1);yy<=Math.min(height-1,y+1);yy++)for(let xx=Math.max(0,x-1);xx<=Math.min(width-1,x+1);xx++){const next=yy*width+xx;if(!visited[next]&&mask[next]){visited[next]=1;queue.push(next);}}}
      components.push({pixels,area:pixels.length,minX,minY,maxX,maxY,cx:sumX/pixels.length/width,cy:sumY/pixels.length/height});
    }
    const empty={mask:new Uint8Array(size),bounds:null,centroid:null,components:0,keptComponents:0,confidence:0,occluded:true};if(!components.length)return empty;
    const iou=component=>{if(!previousBounds)return 0;const ax=component.minX/width,ay=component.minY/height,aw=(component.maxX-component.minX+1)/width,ah=(component.maxY-component.minY+1)/height;
      const x0=Math.max(ax,previousBounds.x),y0=Math.max(ay,previousBounds.y),x1=Math.min(ax+aw,previousBounds.x+previousBounds.w),y1=Math.min(ay+ah,previousBounds.y+previousBounds.h),intersection=Math.max(0,x1-x0)*Math.max(0,y1-y0),union=aw*ah+previousBounds.w*previousBounds.h-intersection;return union?intersection/union:0;};
    const pcx=previousBounds?previousBounds.x+previousBounds.w/2:.5,pcy=previousBounds?previousBounds.y+previousBounds.h/2:.5;
    const score=component=>component.area*(1+5*iou(component))/(1+(previousBounds?Math.hypot(component.cx-pcx,component.cy-pcy)*2:0));
    const anchor=components.reduce((best,component)=>score(component)>score(best)?component:best,components[0]),minimum=Math.max(3,anchor.area*.015),focus=previousBounds||{x:anchor.minX/width,y:anchor.minY/height,w:(anchor.maxX-anchor.minX+1)/width,h:(anchor.maxY-anchor.minY+1)/height};
    const inside=component=>component.cx>=focus.x-.18&&component.cx<=focus.x+focus.w+.18&&component.cy>=focus.y-.18&&component.cy<=focus.y+focus.h+.18;
    const kept=components.filter(component=>component===anchor||(component.area>=minimum&&inside(component))),out=new Uint8Array(size);let minX=width,minY=height,maxX=-1,maxY=-1,sumX=0,sumY=0,keptArea=0,totalArea=0;
    components.forEach(component=>{totalArea+=component.area;});kept.forEach(component=>{component.pixels.forEach(q=>{out[q]=1;});keptArea+=component.area;sumX+=component.cx*component.area;sumY+=component.cy*component.area;minX=Math.min(minX,component.minX);minY=Math.min(minY,component.minY);maxX=Math.max(maxX,component.maxX);maxY=Math.max(maxY,component.maxY);});
    const bounds={x:minX/width,y:minY/height,w:(maxX-minX+1)/width,h:(maxY-minY+1)/height},continuity=previousBounds?Math.max(.2,Math.min(1,iou(anchor)*3+.25)):1;
    return {mask:out,bounds,centroid:{x:sumX/keptArea,y:sumY/keptArea},components:components.length,keptComponents:kept.length,confidence:Math.max(0,Math.min(1,keptArea/Math.max(1,totalArea)*continuity)),occluded:false};
  }

  /* Motor local y determinista. Extrae siluetas de movimiento comparando cada
     cuadro con el primero. No afirma estimar articulaciones: entrega material
     real de rotoscopía aun sin APIs, GPU ni conexión. */
  const localSilhouetteEngine = {
    async analyze(track, video, options) {
      if (!video || !video.duration || !video.videoWidth) throw new Error("El video no está listo");
      if (typeof document === "undefined") throw new Error("El analizador necesita el lienzo de LOW");
      options = options || {};
      const analysis=Object.assign({threshold:54,cleanup:4},track.analysisOptions||{},options.analysis||{});
      const fps = Math.max(1, Number(track.doc && track.doc.scene && track.doc.scene.fps) || 24);
      const width = Math.min(192, Math.max(64, video.videoWidth));
      const height = Math.max(36, Math.round(width * video.videoHeight / video.videoWidth));
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const oldTime = video.currentTime, oldPaused = video.paused;
      const roi=track.subjectRegion||{x:0,y:0,w:1,h:1};
      const rx0=Math.floor(roi.x*width), ry0=Math.floor(roi.y*height);
      const rx1=Math.ceil((roi.x+roi.w)*width), ry1=Math.ceil((roi.y+roi.h)*height);
      video.pause();
      const hasCleanBackground=analysis.backgroundLocked===true;
      let background;
      if(hasCleanBackground){
        const backgroundTime=Math.max(0,Math.min(video.duration-.001,Number(analysis.backgroundTime)));
        await seek(video,backgroundTime);ctx.drawImage(video,0,0,width,height);
        background=ctx.getImageData(0,0,width,height).data.slice();
      }else{
        // Sin una toma limpia explícita, el primer cuadro no sirve como fondo:
        // suele contener al actor y produce máscaras vacías. Una mediana temporal
        // recupera el fondo estático mientras la persona se desplaza por el plano.
        const samples=[];
        for(let sample=1;sample<=5;sample++){
          await seek(video,Math.max(0,Math.min(video.duration-.001,video.duration*sample/6)));
          ctx.drawImage(video,0,0,width,height);samples.push(ctx.getImageData(0,0,width,height).data.slice());
        }
        background=medianMocapBackground(samples);
      }
      const last = Math.min(track.range.out, track.range.in + Math.max(1, Math.floor(video.duration * fps)) - 1);
      const previous=track.silhouettes;track.silhouettes = {};let previousBounds=null;
      try {
        for (let frame = track.range.in; frame <= last; frame++) {
          if (options.signal && options.signal.aborted) { const e=new Error("Análisis cancelado");e.name="AbortError";throw e; }
          const time = Math.min(video.duration - .001, track.timeAt(frame, fps));
          await seek(video, Math.max(0, time));
          ctx.drawImage(video, 0, 0, width, height);
          const pixels = ctx.getImageData(0, 0, width, height).data;
          const raw = new Uint8Array(width * height), mask = new Uint8Array(width * height);
          for (let p = 0, q = 0; p < pixels.length; p += 4, q++) {
            const px=q%width, py=Math.floor(q/width);
            if(px<rx0||px>=rx1||py<ry0||py>=ry1){ raw[q]=0; continue; }
            const delta = Math.abs(pixels[p] - background[p]) + Math.abs(pixels[p+1] - background[p+1]) + Math.abs(pixels[p+2] - background[p+2]);
            raw[q] = delta > Math.max(1,Number(analysis.threshold)||54) ? 1 : 0;
          }
          let count=0;
          for (let y=1;y<height-1;y++) for (let x=1;x<width-1;x++) {
            const q=y*width+x; let near=0;
            for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++) near+=raw[q+yy*width+xx];
            if(near>=Math.max(1,Math.min(9,Number(analysis.cleanup)||4))){ mask[q]=1; count++; }
          }
          const stable=filterMotionComponents(mask,width,height,previousBounds);if(stable.bounds)previousBounds=stable.bounds;
          const keptCount=stable.mask.reduce((sum,value)=>sum+(value?1:0),0);
          track.setSilhouette(frame,{width,height,runs:encodeMask(stable.mask),coverage:keptCount/stable.mask.length,bounds:stable.bounds,centroid:stable.centroid,
            components:stable.components,keptComponents:stable.keptComponents,confidence:stable.confidence,occluded:stable.occluded,rawCoverage:count/mask.length});
          if (options.onProgress) options.onProgress((frame-track.range.in+1)/(last-track.range.in+1), frame, last);
          if ((frame-track.range.in)%4===0) await new Promise(resolve => setTimeout(resolve,0));
        }
      } catch(error) { track.silhouettes=previous;throw error; }
      finally { await seek(video, Math.min(oldTime, video.duration - .001));if (!oldPaused) video.play().catch(()=>{}); }
      track.engine = "local-motion-silhouette"; track.status = "tracked";
      return track;
    }
  };
  const MEDIAPIPE_JOINTS={nose:0,left_shoulder:11,right_shoulder:12,left_elbow:13,right_elbow:14,left_wrist:15,right_wrist:16,
    left_hip:23,right_hip:24,left_knee:25,right_knee:26,left_ankle:27,right_ankle:28};
  function mediapipeLandmarksToLow(landmarks, region, minimumConfidence) {
    const roi=region||{x:0,y:0,w:1,h:1},minimum=Math.max(0,Math.min(1,Number(minimumConfidence)||0)),joints={};
    const confidence=landmark=>{if(!landmark)return 0;const visibility=Number.isFinite(landmark.visibility)?landmark.visibility:1,presence=Number.isFinite(landmark.presence)?landmark.presence:1;return Math.max(0,Math.min(1,visibility,presence));};
    const point=index=>{const raw=landmarks&&landmarks[index],score=confidence(raw);if(!raw||!Number.isFinite(raw.x)||!Number.isFinite(raw.y)||score<minimum)return null;
      return{x:Math.max(0,Math.min(1,roi.x+raw.x*roi.w)),y:Math.max(0,Math.min(1,roi.y+raw.y*roi.h)),z:Number.isFinite(raw.z)?raw.z:0,confidence:score};};
    Object.entries(MEDIAPIPE_JOINTS).forEach(([name,index])=>{const value=point(index);if(value)joints[name]=value;});
    const midpoint=(name,a,b)=>{if(!a||!b)return;joints[name]={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:((a.z||0)+(b.z||0))/2,confidence:Math.min(a.confidence,b.confidence)};};
    midpoint("neck",joints.left_shoulder,joints.right_shoulder);midpoint("hips",joints.left_hip,joints.right_hip);
    delete joints.left_hip;delete joints.right_hip;
    const scores=Object.values(joints).map(joint=>joint.confidence).filter(Number.isFinite);
    return {joints,confidence:scores.length?scores.reduce((sum,value)=>sum+value,0)/scores.length:0};
  }
  let mediaPipeModulePromise=null;
  function loadMediaPipeModule(moduleUrl) {
    if(!mediaPipeModulePromise)mediaPipeModulePromise=import(moduleUrl).catch(error=>{mediaPipeModulePromise=null;throw error;});
    return mediaPipeModulePromise;
  }
  function retainManualPoseSamples(samples) {
    const retained={};Object.entries(samples||{}).forEach(([frame,sample])=>{if(!sample?.source||sample.source==="manual"||sample.corrected)retained[frame]=JSON.parse(JSON.stringify(sample));});return retained;
  }
  function mergeSemanticMocapSilhouettes(previous, detected) {
    const corrected={};Object.entries(previous||{}).forEach(([frame,item])=>{if(item?.corrected)corrected[frame]=JSON.parse(JSON.stringify(item));});return Object.assign({},detected||{},corrected);
  }
  function binaryPoseMask(mask) {
    if(!mask)return null;const source=mask.getAsFloat32Array(),data=new Uint8Array(source.length);for(let index=0;index<source.length;index++)data[index]=source[index]>=.5?1:0;return{width:mask.width,height:mask.height,data};
  }
  function expandMocapRegionMask(mask, region, width, height) {
    const outWidth=Math.max(1,Math.round(width)||1),outHeight=Math.max(1,Math.round(height)||1),out=new Uint8Array(outWidth*outHeight),roi=region||{x:0,y:0,w:1,h:1};if(!mask?.data||!mask.width||!mask.height)return out;
    const x0=Math.max(0,Math.floor(roi.x*outWidth)),y0=Math.max(0,Math.floor(roi.y*outHeight)),x1=Math.min(outWidth,Math.ceil((roi.x+roi.w)*outWidth)),y1=Math.min(outHeight,Math.ceil((roi.y+roi.h)*outHeight));
    for(let y=y0;y<y1;y++){const v=Math.max(0,Math.min(.999999,(y/outHeight-roi.y)/roi.h)),sy=Math.floor(v*mask.height);for(let x=x0;x<x1;x++){const u=Math.max(0,Math.min(.999999,(x/outWidth-roi.x)/roi.w)),sx=Math.floor(u*mask.width);out[y*outWidth+x]=mask.data[sy*mask.width+sx]?1:0;}}
    return out;
  }
  function semanticMocapSilhouette(mask, region, width, height, previousBounds) {
    const expanded=expandMocapRegionMask(mask,region,width,height),stable=filterMotionComponents(expanded,width,height,previousBounds),count=stable.mask.reduce((sum,value)=>sum+(value?1:0),0);
    return{width,height,runs:encodeMask(stable.mask),coverage:count/stable.mask.length,bounds:stable.bounds,centroid:stable.centroid,components:stable.components,keptComponents:stable.keptComponents,confidence:stable.confidence,occluded:stable.occluded,source:"mediapipe",semantic:true};
  }
  function createPoseWorker(url) {
    if(typeof Worker!=="function"||typeof createImageBitmap!=="function")return null;
    // MediaPipe 1.0.1 carga su fábrica WASM mediante importScripts; por eso el
    // contenedor debe ser un worker clásico aunque el bundle se importe como ESM.
    const worker=new Worker(url),pending=new Map();let serial=0,closed=false;
    const failAll=error=>{for(const item of pending.values())item.reject(error);pending.clear();};
    worker.onmessage=event=>{const message=event.data||{},item=pending.get(message.id);if(!item)return;pending.delete(message.id);message.ok?item.resolve(message.value):item.reject(new Error(message.error||"Falló el detector corporal"));};
    worker.onerror=event=>failAll(new Error(event.message||"Falló el worker de captura corporal"));
    return {call(type,payload,transfer){if(closed)return Promise.reject(new Error("El worker corporal está cerrado"));const id=++serial;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage(Object.assign({id,type},payload||{}),transfer||[]);});},
      close(){if(closed)return;closed=true;try{worker.postMessage({id:++serial,type:"close"});}catch(_){/* cierre defensivo */}setTimeout(()=>worker.terminate(),100);failAll(new Error("Worker corporal cerrado"));}};
  }
  const mediaPipePoseEngine={
    async analyze(track,video,options){
      if(!video||!video.duration||!video.videoWidth)throw new Error("El video no está listo");
      if(typeof document==="undefined")throw new Error("La detección corporal necesita el visor de LOW");options=options||{};
      const base=document.baseURI,moduleUrl=options.moduleUrl||new URL("vendor/mediapipe/vision_bundle.mjs",base).href,
        wasmRoot=options.wasmRoot||new URL("vendor/mediapipe/wasm",base).href,modelUrl=options.modelUrl||new URL("models/pose_landmarker_lite.task",base).href;
      const minimum=Math.max(.05,Math.min(.95,Number(track.analysisOptions?.poseConfidence)||.45)),workerUrl=options.workerUrl||new URL("animation/mocap-pose-worker.js",base).href;
      let poseWorker=createPoseWorker(workerUrl),landmarker=null,execution="worker";
      if(poseWorker){try{await poseWorker.call("init",{moduleUrl,wasmRoot,modelUrl,minimum});}catch(_){poseWorker.close();poseWorker=null;}}
      if(!poseWorker){execution="main";const module=await loadMediaPipeModule(moduleUrl),vision=await module.FilesetResolver.forVisionTasks(wasmRoot);landmarker=await module.PoseLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:modelUrl,delegate:"CPU"},runningMode:"VIDEO",numPoses:1,
        minPoseDetectionConfidence:minimum,minPosePresenceConfidence:minimum,minTrackingConfidence:minimum,outputSegmentationMasks:true});}
      const fps=Math.max(1,Number(track.doc?.scene?.fps)||24),last=Math.min(track.range.out,track.range.in+Math.max(1,Math.floor(video.duration*fps))-1),roi=track.subjectRegion||{x:0,y:0,w:1,h:1};
      const canvas=document.createElement("canvas"),sourceWidth=Math.max(1,video.videoWidth*roi.w),sourceHeight=Math.max(1,video.videoHeight*roi.h);
      canvas.width=Math.min(512,Math.max(192,Math.round(sourceWidth)));canvas.height=Math.max(108,Math.round(canvas.width*sourceHeight/sourceWidth));const ctx=canvas.getContext("2d",{willReadFrequently:true});
      const previous=track.samples,retained=retainManualPoseSamples(previous),previousSilhouettes=track.silhouettes;track.samples=Object.assign({},retained);
      const oldTime=video.currentTime,oldPaused=video.paused,missedFrames=[],semanticSilhouettes={},semanticWidth=Math.min(320,Math.max(192,video.videoWidth)),semanticHeight=Math.max(108,Math.round(semanticWidth*video.videoHeight/video.videoWidth));let detected=0,missed=0,semantic=0,previousBounds=null;video.pause();
      try{
        for(let frame=track.range.in;frame<=last;frame++){
          if(options.signal?.aborted){const error=new Error("Detección cancelada");error.name="AbortError";throw error;}
          const time=Math.min(video.duration-.001,track.timeAt(frame,fps));await seek(video,Math.max(0,time));ctx.drawImage(video,roi.x*video.videoWidth,roi.y*video.videoHeight,roi.w*video.videoWidth,roi.h*video.videoHeight,0,0,canvas.width,canvas.height);
          let landmarks,mask;if(poseWorker){const bitmap=await createImageBitmap(canvas),result=await poseWorker.call("detect",{bitmap,timestamp:Math.round(time*1000)},[bitmap]);landmarks=result?.landmarks?.[0];mask=result?.mask;}else{const result=landmarker.detectForVideo(canvas,Math.round(time*1000));landmarks=result?.landmarks?.[0];mask=binaryPoseMask(result?.segmentationMasks?.[0]);result?.close?.();}
          if(!retained[frame]){const mapped=mediapipeLandmarksToLow(landmarks,roi,minimum);if(Object.keys(mapped.joints).length){track.setPose(frame,mapped.joints,mapped.confidence,{source:"mediapipe",corrected:false});detected++;}else{missed++;missedFrames.push(frame);}}
          if(mask){const silhouette=semanticMocapSilhouette(mask,roi,semanticWidth,semanticHeight,previousBounds);if(silhouette.bounds){previousBounds=silhouette.bounds;semanticSilhouettes[frame]=silhouette;semantic++;}}
          if(options.onProgress)options.onProgress((frame-track.range.in+1)/(last-track.range.in+1),frame,last,detected,missed);await new Promise(resolve=>setTimeout(resolve,0));
        }
      }catch(error){track.samples=previous;track.silhouettes=previousSilhouettes;throw error;}
      finally{try{poseWorker?.close();landmarker?.close();}catch(_){/* liberación defensiva */}await seek(video,Math.min(oldTime,video.duration-.001));if(!oldPaused)video.play().catch(()=>{});}
      if(semantic)track.silhouettes=mergeSemanticMocapSilhouettes(previousSilhouettes,semanticSilhouettes);
      const contacts=mocapFootContacts(mocapPoseSequence(track,true));
      track.poseEngine="mediapipe-pose";track.poseAnalysis={detected,missed,missedFrames,retained:Object.keys(retained).length,semantic,model:"pose_landmarker_lite",confidence:minimum,execution,contacts};track.status="tracked";return track;
    }
  };
  const RETARGET_CHAINS = [
    ["spine","hips","neck"],["head","neck","nose"],
    ["clavicle_L","neck","left_shoulder"],["upper_arm_L","left_shoulder","left_elbow"],["forearm_L","left_elbow","left_wrist"],
    ["clavicle_R","neck","right_shoulder"],["upper_arm_R","right_shoulder","right_elbow"],["forearm_R","right_elbow","right_wrist"],
    ["thigh_L","hips","left_knee"],["shin_L","left_knee","left_ankle"],
    ["thigh_R","hips","right_knee"],["shin_R","right_knee","right_ankle"]
  ];
  const MOCAP_JOINTS = ["nose","neck","left_shoulder","right_shoulder","left_elbow","right_elbow","left_wrist","right_wrist","hips","left_knee","right_knee","left_ankle","right_ankle"];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const angle=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI;
  const normAngle=value=>{let n=(value+180)%360;if(n<0)n+=360;return n-180;};
  function mocapPoseSequence(track, interpolate = true) {
    const source=track&&track.samples||{},frames=Object.keys(source).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),out={};
    for(const frame of frames)out[frame]=clone(source[frame]);
    if(!interpolate||frames.length<2)return out;
    const names=new Set();for(const frame of frames)Object.keys(source[frame]?.joints||{}).forEach(name=>names.add(name));
    for(const name of names){const keys=frames.filter(frame=>source[frame]?.joints?.[name]);
      for(let index=0;index<keys.length-1;index++){const first=keys[index],last=keys[index+1],a=source[first].joints[name],b=source[last].joints[name];if(last-first<2)continue;
        for(let frame=first+1;frame<last;frame++){out[frame]||(out[frame]={joints:{},confidence:1});out[frame].joints||(out[frame].joints={});if(out[frame].joints[name])continue;const t=(frame-first)/(last-first);
          out[frame].joints[name]={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,confidence:Math.min(a.confidence??source[first].confidence??1,b.confidence??source[last].confidence??1),interpolated:true};}
      }
    }
    return Object.fromEntries(Object.entries(out).sort((a,b)=>Number(a[0])-Number(b[0])));
  }
  function mocapFootContacts(sequence, options) {
    const source=sequence||{},frames=Object.keys(source).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),settings=Object.assign({floorTolerance:.045,speedThreshold:.018,minFrames:2},options||{});
    const all=[];for(const frame of frames)for(const side of ["left","right"]){const point=source[frame]?.joints?.[`${side}_ankle`];if(point&&Number.isFinite(point.y))all.push(point.y);}
    if(!all.length)return{floorY:null,leftFrames:[],rightFrames:[],frames:{},ranges:{left:[],right:[]}};
    all.sort((a,b)=>a-b);const floorY=all[Math.min(all.length-1,Math.floor((all.length-1)*.9))],contacts={left:[],right:[]};
    const velocity=(index,name)=>{const here=source[frames[index]]?.joints?.[name];if(!here)return Infinity;const values=[];for(const offset of [-1,1]){const otherIndex=index+offset,otherFrame=frames[otherIndex],other=source[otherFrame]?.joints?.[name];if(!other||!Number.isFinite(otherFrame))continue;const span=Math.max(1,Math.abs(otherFrame-frames[index]));values.push(Math.hypot(other.x-here.x,other.y-here.y)/span);}return values.length?Math.min(...values):0;};
    for(const side of ["left","right"]){const name=`${side}_ankle`,candidates=[];for(let index=0;index<frames.length;index++){const frame=frames[index],point=source[frame]?.joints?.[name];if(point&&Math.abs(point.y-floorY)<=settings.floorTolerance&&velocity(index,name)<=settings.speedThreshold)candidates.push(frame);}
      let run=[];const flush=()=>{if(run.length>=settings.minFrames)contacts[side].push(...run);run=[];};for(const frame of candidates){if(run.length&&frame!==run.at(-1)+1)flush();run.push(frame);}flush();}
    const resultFrames={};for(const side of ["left","right"])for(const frame of contacts[side])(resultFrames[frame]||(resultFrames[frame]={}))[side]=true;
    const rangesFor=values=>{const ranges=[];let start=null,last=null;for(const frame of values){if(start==null){start=last=frame;continue;}if(frame===last+1){last=frame;continue;}ranges.push({from:start,to:last});start=last=frame;}if(start!=null)ranges.push({from:start,to:last});return ranges;};
    return{floorY,leftFrames:contacts.left,rightFrames:contacts.right,frames:resultFrames,ranges:{left:rangesFor(contacts.left),right:rangesFor(contacts.right)},settings};
  }
  function stabilizeMocapFootContacts(sequence, contactReport) {
    const output=clone(sequence||{}),frames=Object.keys(output).map(Number).filter(Number.isFinite).sort((a,b)=>a-b),anchors={left:null,right:null};
    for(const frame of frames){const sample=output[frame],active=contactReport?.frames?.[frame]||{},corrections=[];for(const side of ["left","right"]){const point=sample?.joints?.[`${side}_ankle`];if(!active[side]||!point){anchors[side]=null;continue;}if(!anchors[side])anchors[side]={x:point.x,y:point.y};corrections.push({x:anchors[side].x-point.x,y:anchors[side].y-point.y});}
      if(!corrections.length)continue;const dx=corrections.reduce((sum,item)=>sum+item.x,0)/corrections.length,dy=corrections.reduce((sum,item)=>sum+item.y,0)/corrections.length;for(const point of Object.values(sample.joints||{})){if(!point)continue;point.x+=dx;point.y+=dy;}}
    return output;
  }
  function mocapPoseReport(track, sequence) {
    const exact=track&&track.samples||{},expanded=sequence||mocapPoseSequence(track,true),confirmed=new Set(),observed=new Set(),samples=Object.values(exact),manual=samples.filter(sample=>!sample?.source||sample.source==="manual"||sample.corrected);
    samples.forEach(sample=>Object.keys(sample?.joints||{}).forEach(name=>observed.add(name)));manual.forEach(sample=>Object.keys(sample?.joints||{}).forEach(name=>confirmed.add(name)));
    const chainFrames={};for(const [suffix,a,b] of RETARGET_CHAINS)chainFrames[suffix]=Object.values(expanded).filter(sample=>sample?.joints?.[a]&&sample?.joints?.[b]).length;
    return {observedFrames:samples.length,manualFrames:manual.length,automaticFrames:samples.length-manual.length,confirmedFrames:manual.length,generatedFrames:Object.keys(expanded).length,
      observedJoints:observed.size,confirmedJoints:confirmed.size,totalJoints:MOCAP_JOINTS.length,missingJoints:MOCAP_JOINTS.filter(name=>!observed.has(name)),chainFrames};
  }
  function retargetHumanPose(sample,rig,size) {
    const joints=sample&&sample.joints||{},nodes=rig&&rig.nodes||{},width=Math.max(1,size&&size.width||1),height=Math.max(1,size&&size.height||1);
    const bySuffix=suffix=>Object.values(nodes).find(n=>n.id===suffix||n.id.endsWith("_"+suffix));
    const poses={},worldDelta={};
    const inherited=node=>{let sum=0,parent=node&&node.parentId,guard=0;while(parent&&guard++<64){sum+=worldDelta[parent]||0;parent=nodes[parent]&&nodes[parent].parentId;}return sum;};
    const root=bySuffix("root"),hips=joints.hips;
    if(root&&hips&&root.pivot)poses[root.id]={x:hips.x*width-root.pivot.x,y:hips.y*height-root.pivot.y,r:0,sx:1,sy:1};
    for(const [suffix,aName,bName] of RETARGET_CHAINS){const node=bySuffix(suffix),a=joints[aName],b=joints[bName];if(!node||!a||!b||!node.head||!node.tail)continue;
      const desired=angle({x:a.x*width,y:a.y*height},{x:b.x*width,y:b.y*height}),rest=angle(node.head,node.tail),r=normAngle(desired-rest-inherited(node));
      poses[node.id]={x:0,y:0,r,sx:1,sy:1};worldDelta[node.id]=r;
    }
    return poses;
  }
  function reduceRigPoseSequence(sequence, tolerance = 2) {
    const amount=Math.max(0,Number(tolerance)||0);if(!amount)return clone(sequence||{});
    const byNode={};for(const [rawFrame,poses] of Object.entries(sequence||{})){const frame=Number(rawFrame);for(const [id,pose] of Object.entries(poses||{}))(byNode[id]||(byNode[id]=[])).push({frame,pose});}
    const result={},positionTolerance=Math.max(.01,amount),rotationTolerance=Math.max(.05,amount*.75),scaleTolerance=Math.max(.0001,amount/500);
    const put=(frame,id,pose)=>{(result[frame]||(result[frame]={}))[id]=clone(pose);};
    for(const [id,rawPoints] of Object.entries(byNode)){const points=rawPoints.sort((a,b)=>a.frame-b.frame);if(points.length<=2){points.forEach(point=>put(point.frame,id,point.pose));continue;}
      const keep=new Set([0,points.length-1]);
      const error=(point,start,end)=>{const span=end.frame-start.frame,t=span?Math.max(0,Math.min(1,(point.frame-start.frame)/span)):0,a=start.pose,b=end.pose,p=point.pose;
        const linear=name=>(+a[name]||0)+((+b[name]||0)-(+a[name]||0))*t;
        const predictedRotation=(+a.r||0)+normAngle((+b.r||0)-(+a.r||0))*t;
        return Math.max(Math.abs((+p.x||0)-linear("x"))/positionTolerance,Math.abs((+p.y||0)-linear("y"))/positionTolerance,
          Math.abs(normAngle((+p.r||0)-predictedRotation))/rotationTolerance,Math.abs((p.sx??1)-((a.sx??1)+((b.sx??1)-(a.sx??1))*t))/scaleTolerance,
          Math.abs((p.sy??1)-((a.sy??1)+((b.sy??1)-(a.sy??1))*t))/scaleTolerance);};
      const simplify=(first,last)=>{if(last-first<2)return;let worst=0,index=-1;for(let i=first+1;i<last;i++){const value=error(points[i],points[first],points[last]);if(value>worst){worst=value;index=i;}}if(worst>1&&index>first){keep.add(index);simplify(first,index);simplify(index,last);}};
      simplify(0,points.length-1);Array.from(keep).sort((a,b)=>a-b).forEach(index=>put(points[index].frame,id,points[index].pose));
    }
    return Object.fromEntries(Object.entries(result).sort((a,b)=>Number(a[0])-Number(b[0])));
  }
  animation.MotionCaptureTrack = MotionCaptureTrack;
  animation.encodeMocapMask = encodeMask;
  animation.decodeMocapMask = decodeMask;
  animation.mocapMaskStats = mocapMaskStats;
  animation.mocapMaskSvgContent = mocapMaskSvgContent;
  animation.medianMocapBackground = medianMocapBackground;
  animation.filterMocapMotionComponents = filterMotionComponents;
  animation.mediapipeLandmarksToLow = mediapipeLandmarksToLow;
  animation.retainManualMocapPoses = retainManualPoseSamples;
  animation.mergeSemanticMocapSilhouettes = mergeSemanticMocapSilhouettes;
  animation.expandMocapRegionMask = expandMocapRegionMask;
  animation.semanticMocapSilhouette = semanticMocapSilhouette;
  animation.createMocapPoseWorker = createPoseWorker;
  animation.mocapPoseSequence = mocapPoseSequence;
  animation.mocapFootContacts = mocapFootContacts;
  animation.stabilizeMocapFootContacts = stabilizeMocapFootContacts;
  animation.mocapPoseReport = mocapPoseReport;
  animation.retargetHumanPose = retargetHumanPose;
  animation.reduceRigPoseSequence = reduceRigPoseSequence;
  animation.mocapEngines = {
    register: registerMocapEngine,
    get: (id) => engines.get(String(id)) || null,
    list: () => Array.from(engines.keys())
  };
  registerMocapEngine("local-motion-silhouette", localSilhouetteEngine);
  registerMocapEngine("mediapipe-pose", mediaPipePoseEngine);
})(typeof window !== "undefined" ? window : globalThis);
