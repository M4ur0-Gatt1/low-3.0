function dzMeshInfluenceId() { return DZ.rigSelectedId || (DZ.sel && DZ.sel.id) || null; }
function dzMeshBoneId() {
  const selected=dzMeshInfluenceId(),scene=DZ.doc?.scene;
  if(!selected||!scene)return selected;
  if(scene.rigMesh(selected))return selected;
  const owners=Object.entries(scene.rig.meshes||{}).filter(([,mesh])=>mesh.weights?.some(w=>w[selected]>0));
  return owners.length===1?owners[0][0]:selected;
}
function dzMeshActual() {
  const id = dzMeshBoneId();
  return id && DZ.doc?.scene?.rigMesh ? DZ.doc.scene.rigMesh(id) : null;
}
/** La caja del arte vinculado al hueso: es donde tiene sentido la rejilla. */
function dzMeshCajaDe(boneId) {
  const el = boneId && document.getElementById(boneId);
  if (!el || !el.getBBox) return null;
  try {
    const b = el.getBBox();
    if (!(b.width > 0) || !(b.height > 0)) return null;
    const margen = Math.max(b.width, b.height) * .06;
    return { x: b.x - margen, y: b.y - margen, width: b.width + margen * 2, height: b.height + margen * 2 };
  } catch (e) { return null; }
}
function dzMeshCrear() {
  const id = dzMeshBoneId();
  if (!id || !DZ.doc) return dzSetStatus("Elegí una pieza del esqueleto para ponerle malla");
  if (DZ.doc.scene.rigMesh(id)) return dzSetStatus("Esa pieza ya tiene malla");
  const caja = dzMeshCajaDe(id);
  if (!caja) return dzSetStatus("No encuentro el dibujo de esa pieza para medir la malla");
  if (!DZ.doc.createRigMesh(id, { cols: 4, rows: 4, box: caja }))
    return dzSetStatus("No pude crear la malla");
  dzMeshPanelSync(); dzMeshOverlayRender();
  dzSetStatus("Malla 4×4 creada · «Pesos automáticos» la ata a los huesos");
}
function dzMeshAuto() {
  const id = dzMeshBoneId();
  if (!id || !DZ.doc || !DZ.doc.scene.rigMesh(id)) return dzSetStatus("Creá la malla primero");
  if (!DZ.doc.autoRigMeshWeights(id)) return dzSetStatus("Hacen falta huesos con largo para repartir pesos");
  dzMeshPanelSync(); dzMeshOverlayRender();
  dzSetStatus("Pesos repartidos por distancia · pintá encima para corregir");
}
function dzMeshQuitar() {
  const id = dzMeshBoneId();
  if (!id || !DZ.doc || !DZ.doc.removeRigMesh(id)) return dzSetStatus("Esa pieza no tiene malla");
  DZ.meshPaint = false;
  dzMeshPanelSync(); dzMeshOverlayRender();
  dzSetStatus("Malla quitada · la pieza vuelve a deformación rígida");
}
function dzMeshPaintToggle() {
  if (!dzMeshActual()) return dzSetStatus("Creá la malla antes de pintar pesos");
  DZ.meshPaint = !DZ.meshPaint;
  dzMeshPanelSync(); dzMeshOverlayRender();
  dzSetStatus(DZ.meshPaint
    ? "Pintando pesos del hueso seleccionado · Shift resta · Esc sale"
    : "Pincel de pesos apagado");
}
function dzMeshPanelSync() {
  const malla = dzMeshActual(), estado = $("#rigMeshEstado");
  if (estado) estado.textContent = !dzMeshBoneId() ? "elegí una pieza"
    : !malla ? "sin malla"
    : (malla.weights && malla.weights.length ? `${malla.cols}×${malla.rows} · con pesos` : `${malla.cols}×${malla.rows} · sin pesos`);
  const on = (sel, cond) => { const b = $(sel); if (b) b.disabled = !cond; };
  on("#rigMeshCreate", !!dzMeshBoneId() && !malla);
  on("#rigMeshAuto", !!malla);
  on("#rigMeshPaint", !!malla);
  on("#rigMeshRemove", !!malla);
  $("#rigMeshPaint")?.classList.toggle("active", !!DZ.meshPaint && !!malla);
}
/** Dibuja la rejilla y colorea cada vértice según cuánto pesa al hueso
    seleccionado: negro = nada, naranja pleno = lo sigue entero. Sin eso los
    pesos son un número invisible y no hay forma de corregirlos con criterio. */
function dzMeshOverlayRender() {
  const overlay = $("#dzMeshOverlay"), doc = DZ.doc, id = dzMeshBoneId();
  const malla = dzMeshActual();
  if (!overlay) return;
  if (!DZ.rigMode || !doc || !malla || !DZ.meshPaint) {
    overlay.setAttribute("hidden", ""); overlay.innerHTML = ""; overlay.onpointerdown = null;
    return;
  }
  overlay.removeAttribute("hidden");
  const cv = overlay.getBoundingClientRect();
  overlay.setAttribute("viewBox", `0 0 ${Math.max(1, cv.width)} ${Math.max(1, cv.height)}`);
  const num = dzRigCur();
  const puntos = doc.scene.rigMeshSkinnedAt(id, num) || malla.rest;
  const pantalla = puntos.map((p) => {
    const s = dzFromUser(p.x, p.y);
    return s ? { x: s.x - cv.left, y: s.y - cv.top } : { x: 0, y: 0 };
  });
  const nx = malla.cols, ny = malla.rows, ns = SVGNS;
  const frag = document.createDocumentFragment();
  const linea = (a, b) => {
    const l = document.createElementNS(ns, "line");
    l.setAttribute("x1", a.x.toFixed(1)); l.setAttribute("y1", a.y.toFixed(1));
    l.setAttribute("x2", b.x.toFixed(1)); l.setAttribute("y2", b.y.toFixed(1));
    l.setAttribute("class", "dz-mesh-hilo"); frag.appendChild(l);
  };
  for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++) {
    if (c + 1 < nx) linea(pantalla[r * nx + c], pantalla[r * nx + c + 1]);
    if (r + 1 < ny) linea(pantalla[r * nx + c], pantalla[(r + 1) * nx + c]);
  }
  pantalla.forEach((p, i) => {
    const w = (malla.weights && malla.weights[i] && malla.weights[i][dzMeshInfluenceId()]) || 0;
    const punto = document.createElementNS(ns, "circle");
    punto.setAttribute("cx", p.x.toFixed(1)); punto.setAttribute("cy", p.y.toFixed(1));
    punto.setAttribute("r", 5);
    punto.setAttribute("class", "dz-mesh-vertice");
    punto.setAttribute("data-i", i);
    punto.setAttribute("data-w", w.toFixed(3));
    if(malla.locked?.[i]){punto.style.stroke='#63d4e5';punto.style.strokeWidth='2.5';}
    punto.setAttribute("fill", `rgb(${Math.round(40 + 200 * w)},${Math.round(30 + 60 * w)},${Math.round(30 + 20 * w)})`);
    frag.appendChild(punto);
  });
  overlay.innerHTML = "";
  overlay.appendChild(frag);
  overlay.onpointerdown = (e) => dzMeshPincel(e, pantalla);
}
/** Un trazo del pincel = UNA operación de historial, aunque toque cien veces
    los mismos vértices: pintar es un gesto, no cincuenta pasos de Undo. */
function dzMeshPincel(e, pantalla) {
  const doc = DZ.doc, id = dzMeshBoneId();
  if (!doc || !id || e.button!==0) return;
  e.preventDefault();e.stopPropagation();
  const influence=dzMeshInfluenceId(),frame=doc.frame,pointerId=e.pointerId;
  const before=JSON.stringify(doc.scene.rigMesh(id)),abort=new AbortController(),signal=abort.signal;
  const valid=()=>DZ.doc===doc&&doc.frame===frame&&dzMeshInfluenceId()===influence&&DZ.meshPaint&&JSON.stringify(doc.scene.rigMesh(id))===before;
  const radio = Math.max(8, +($("#rigMeshRadius")?.value) || 48);
  const fuerza = Math.max(.05, (+($("#rigMeshForce")?.value) || 35) / 100);
  const resta = e.shiftKey;
  const operation=$("#rigMeshOperation")?.value||'paint';
  const cv = $("#dzMeshOverlay").getBoundingClientRect();
  const tocados = new Set();
  const pintar = (ev) => {
    const x = ev.clientX - cv.left, y = ev.clientY - cv.top;
    pantalla.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) <= radio) tocados.add(i); });
  };
  pintar(e);
  const mover = (ev) => {if(ev.pointerId===pointerId)pintar(ev);};
  const cancel=()=>{abort.abort();clearInterval(watch);};
  const soltar = (ev) => {
    if(ev.pointerId!==pointerId)return;
    const stillValid=valid();cancel();if(!stillValid)return;
    if (!tocados.size) return;
    const changed=operation==='lock'||operation==='unlock'
      ? doc.setRigMeshLocks(id,[...tocados],operation==='lock')
      : operation==='smooth'?doc.smoothRigMeshWeights(id,[...tocados],fuerza)
      : doc.paintRigMeshWeight(id, [...tocados], influence, resta ? -fuerza : fuerza,resta ? "Restar peso" : "Pintar peso");
    dzMeshPanelSync(); dzMeshOverlayRender(); dzRigApplyLive(dzRigCur());
    dzSetStatus(changed?`${tocados.size} vértices · ${operation==='paint'?'pesos editados':operation==='smooth'?'pesos suavizados':operation==='lock'?'pesos bloqueados':'pesos desbloqueados'} · Ctrl+Z lo deshace`:'Sin cambios · los pesos bloqueados se conservan');
  };
  const watch=setInterval(()=>{if(!valid())cancel();},150);
  window.addEventListener("pointermove", mover,{signal});
  window.addEventListener("pointerup", soltar,{signal});
  window.addEventListener("pointercancel",ev=>{if(ev.pointerId===pointerId)cancel();},{signal});
  document.addEventListener("keydown",ev=>{if(ev.key==='Escape'){ev.preventDefault();ev.stopImmediatePropagation();cancel();dzSetStatus('Pintura de pesos cancelada');}},{capture:true,signal});
}

