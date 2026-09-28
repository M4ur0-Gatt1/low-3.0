// Serialize artwork without transient editor selection.
function dzCanvasInner() {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return "";
  // se excluye lo que es asistencia visual, no dibujo
  const tmp = svg.cloneNode(true);
  // La pose vive en Scene.rig. Guardar `data-rigbase` o la matriz de preview
  // dentro del Drawing hornearía el muñeco y duplicaría la transformación al
  // volver a abrirlo.
  dzRigStrip(tmp);
  tmp.querySelectorAll("g.dz-onion, g.dz-penui, style.dz-palcss").forEach((n) => n.remove());
  tmp.querySelectorAll('[class]').forEach((node) => {
    node.classList.remove('dz-sel');
    if (!node.getAttribute('class').trim()) node.removeAttribute('class');
  });
  return tmp.innerHTML;
}
