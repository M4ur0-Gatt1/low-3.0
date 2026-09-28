function dzFillPrepareSvg(root, vb) {
  const clean = root.cloneNode(true);
  clean.setAttribute("xmlns", SVGNS); clean.setAttribute("viewBox", vb.join(" "));
  // El SVG vivo lleva el zoom/pan del visor en `style`. Serializar ese estilo
  // dentro del bitmap encogía o desplazaba también la geometría analizada.
  clean.removeAttribute("style"); clean.removeAttribute("class");
  clean.querySelectorAll('.dz-onion,.dz-penui,[data-dz3d],g[data-low-art="colour"],style.dz-palcss,[data-low="fill"]').forEach((n) => n.remove());
  clean.querySelectorAll('rect').forEach(el => { if (dzIsCanvasBackground(el)) el.remove(); });
  clean.querySelectorAll('[data-low="forma-pincel"]').forEach(g => {
    const path=document.createElementNS(SVGNS,'path');path.setAttribute('d',g.getAttribute('data-d')||'');
    path.setAttribute('stroke-width',g.getAttribute('data-grosor')||'1.5');g.replaceChildren(path);
  });
  clean.querySelectorAll("image,text,foreignObject").forEach((n) => n.remove());
  clean.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon").forEach((el) => {
    if (el.closest("defs")) return;
    if (el.closest('[data-low="brush"],[data-low="raster-brush"],[data-low="imported-brush"]')) {
      el.setAttribute('fill','#000');el.setAttribute('stroke','none');el.removeAttribute('fill-opacity');return;
    }
    const sw = parseFloat(el.getAttribute("stroke-width") || "0");
    el.setAttribute("fill", "none"); el.setAttribute("stroke", "#000000");
    el.setAttribute("stroke-width", String(Math.max(1.5, Number.isFinite(sw) ? sw : 1.5)));
    el.setAttribute("opacity", "1");
    if (el.style) { el.style.fill = "none"; el.style.stroke = "#000000"; el.style.opacity = "1"; }
  });
  const bg = document.createElementNS(SVGNS, "rect");
  bg.setAttribute("x", vb[0]); bg.setAttribute("y", vb[1]);
  bg.setAttribute("width", vb[2]); bg.setAttribute("height", vb[3]);
  bg.setAttribute("fill", "#ffffff"); bg.setAttribute("stroke", "none");
  clean.insertBefore(bg, clean.firstChild);
  return clean;
}

function dzFillPathData(analysis, region, vb) {
  const loops = dzTraceMaskJS(dzFillMask(analysis, region), analysis.width, analysis.height);
  const sx = vb[2] / analysis.width, sy = vb[3] / analysis.height;
  return loops.map((loop) => {
    let pts = loop.slice(0, -1).map(([x, y]) => [vb[0] + x * sx, vb[1] + y * sy]);
    // Remove only collinear grid points. Spline smoothing can spill outside
    // the region (particularly at rectangle corners and around holes).
    pts = pts.filter((p,i,all) => {
      const a=all[(i+all.length-1)%all.length], b=all[(i+1)%all.length];
      return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-8;
    });
    return pts.length >= 3 ? 'M '+pts.map(p=>p.join(' ')).join(' L ')+' Z' : '';
  }).filter(Boolean).join(" ");
}
