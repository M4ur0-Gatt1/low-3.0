import React, { useState } from 'react';
import type { WebGLDesign3D } from '../engine/webgl-design3d';

/* «Repetir hacia la fuga», en el panel Escena (v3.29.3). Vivía en el panel de
   perspectiva, pero es una acción sobre lo elegido —como Agrupar o Crear
   volumen—: copiar un edificio hacia atrás, cada tantos metros. */
export function RepetirPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [rep, setRep] = useState<{ eje: 'x' | 'z' | 'y'; copias: number; sep: number }>({ eje: 'z', copias: 5, sep: 0 });
  const [aviso, setAviso] = useState('');
  /** La separación sugerida: lo que mide lo elegido en ese eje, más un 20 %. */
  const sugerir = (eje: 'x' | 'z' | 'y') => {
    const e = engine.current; if (!e) return 0;
    const l = e.largoSeleccion(eje);
    return l > 0 ? Math.round(l * 1.2 * 10) / 10 : 0;
  };
  const repetir = () => {
    const e = engine.current; if (!e) return;
    if (!e.selectedCount()) { setAviso('Elegí el edificio con Mover (V) y después apretá Repetir'); return; }
    const sep = rep.sep > 0 ? rep.sep : sugerir(rep.eje);
    if (!(sep > 0)) { setAviso('Poné cada cuántos metros va una copia'); return; }
    const n = e.repetirHaciaLaFuga(rep.eje, rep.copias, sep);
    setRep({ ...rep, sep });
    setAviso(n ? `${rep.copias} copias hacia la fuga, cada ${sep} m · Ctrl+Z las saca` : 'No se pudo repetir: elegí un trazo, una figura o un volumen');
  };
  return <div className="studio-scene-section persp3d">
    <h3>Repetir hacia la fuga</h3>
    <p className="persp3d-nota">Elegí un edificio con Mover (V): se copia hacia atrás, hacia su punto de fuga, cada tantos metros.</p>
    <div className="persp3d-repetir">
      <label>Eje<select aria-label="Eje de la repetición" value={rep.eje} onChange={(ev) => { const eje = ev.target.value as 'x' | 'z' | 'y'; setRep({ ...rep, eje, sep: sugerir(eje) || rep.sep }); }}>
        <option value="z">Al fondo (Z)</option><option value="x">Al costado (X)</option><option value="y">Para arriba (Y)</option></select></label>
      <label>Copias<input type="number" aria-label="Copias" min={1} max={200} value={rep.copias} onChange={(ev) => setRep({ ...rep, copias: Math.max(1, Math.min(200, Number(ev.target.value) || 1)) })}/></label>
      <label>Cada<input type="number" aria-label="Separación en metros" min={0} step={0.5} value={rep.sep || ''} placeholder="auto"
        onChange={(ev) => setRep({ ...rep, sep: Math.max(0, Number(ev.target.value) || 0) })}/> m</label>
      <button className="persp3d-boton" onClick={() => { const e = engine.current; if (e) setRep({ ...rep, eje: e.ejeHaciaAtras(), sep: sugerir(e.ejeHaciaAtras()) }); }} title="El eje que va hacia atrás desde la cámara, y la separación según lo elegido">Medir</button>
      <button className="persp3d-boton persp3d-repetir-ya" onClick={repetir}>Repetir</button>
    </div>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;
}
