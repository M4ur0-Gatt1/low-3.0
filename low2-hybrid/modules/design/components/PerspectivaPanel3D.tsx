import React, { useEffect, useState } from 'react';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { AJUSTES_INICIALES, preset, type Esquema3D, type Perspectiva3DAjustes } from '../engine/perspectiva3d';

/* Panel «Perspectiva» del estudio: esquemas de exterior e interior, 1/2/3
   puntos de fuga, horizonte, giro, inclinación, lente y «Mandar al 2D».
   La lógica vive en engine/perspectiva3d.ts; esto sólo la maneja. */

const ESQUEMAS: { id: Esquema3D; nombre: string; grupo: 'Exterior' | 'Interior' | 'Libre'; ayuda: string }[] = [
  { id: 'calle', nombre: 'Calle', grupo: 'Exterior', ayuda: 'Calzada, veredas y fachadas con pisos' },
  { id: 'manzana', nombre: 'Manzana', grupo: 'Exterior', ayuda: 'Cuadras con edificios, vistas desde una esquina' },
  { id: 'habitacion', nombre: 'Habitación', grupo: 'Interior', ayuda: 'Piso, paredes y techo cuadriculados' },
  { id: 'fuga', nombre: 'Sólo líneas', grupo: 'Libre', ayuda: 'Un enrejado de rectas en los tres ejes' },
];
const LENTES = [14, 18, 24, 28, 35, 50, 85, 135];
const enLOW = () => window.parent !== window;

export function PerspectivaPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [a, setA] = useState<Perspectiva3DAjustes>(() => engine.current?.getPerspectiva() ?? AJUSTES_INICIALES);
  const [cuadro, setCuadro] = useState({ w: 1920, h: 1080, doc: false });
  const [aviso, setAviso] = useState('');
  const [lineas, setLineas] = useState(0);
  // repetir hacia la fuga: cuántas copias, cada cuánto (m) y en qué eje
  const [rep, setRep] = useState<{ eje: 'x' | 'z' | 'y'; copias: number; sep: number }>({ eje: 'z', copias: 5, sep: 0 });

  useEffect(() => {
    const sync = () => { const e = engine.current; if (e) { setA(e.getPerspectiva()); setLineas(e.lineasDePerspectiva()); } };
    // al orbitar con el mouse la cámara cambia: los controles muestran lo que se ve
    const alSoltar = (ev: PointerEvent) => {
      const e = engine.current;
      // sólo después de orbitar (botón derecho) o desplazar (medio) en perspectiva:
      // al terminar un TRAZO (izquierdo) no se toca nada
      if (!e || ev.button === 0 || e.currentView() !== 'persp' || !e.getPerspectiva().activa) return;
      e.setPerspectiva(e.leerPerspectiva(), { mover: false });
    };
    const alMensaje = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; width?: number; height?: number; hayDocumento?: boolean; ok?: boolean; error?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:encuadre' && m.width && m.height) {
        setCuadro({ w: m.width, h: m.height, doc: !!m.hayDocumento });
        engine.current?.setAspecto2D(m.width, m.height);
      } else if (m.type === 'low:sent-to-2d') {
        setAviso(m.error ? 'No se pudo mandar: ' + m.error : '');
      }
    };
    sync();
    window.addEventListener('low3d:persp', sync);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('message', alMensaje);
    if (enLOW()) window.parent.postMessage({ type: 'low:pedir-encuadre' }, '*');
    return () => {
      window.removeEventListener('low3d:persp', sync);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('message', alMensaje);
    };
  }, [engine]);

  const cambiar = (c: Partial<Perspectiva3DAjustes>) => {
    const e = engine.current; if (!e) return;
    setA(e.setPerspectiva(c));
    setLineas(e.lineasDePerspectiva());
  };
  const mandar = () => {
    const e = engine.current; if (!e) return;
    if (!enLOW()) { setAviso('Abrí el estudio desde LOW (botón 3D) para mandar el layout al 2D'); return; }
    const r = e.mandarAl2D(cuadro.w, cuadro.h);
    if (!r) { setAviso('Prendé la perspectiva para mandar el layout'); return; }
    setAviso('Mandando al 2D…');
    window.parent.postMessage({ type: 'low:send-to-2d', ...r }, '*');
  };
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
  const rango = (etiqueta: string, clave: 'altura' | 'giro' | 'inclinacion', min: number, max: number, paso: number, unidad: string) =>
    <label className="persp3d-rango">{etiqueta}<output>{a[clave]}{unidad}</output>
      <input type="range" aria-label={etiqueta} min={min} max={max} step={paso} value={a[clave]} disabled={!a.activa}
        onChange={(ev) => cambiar({ [clave]: Number(ev.target.value) })}/></label>;

  return <div className="persp3d">
    <label className="persp3d-activa"><input type="checkbox" checked={a.activa} onChange={(ev) => cambiar({ activa: ev.target.checked })}/> Perspectiva para layout de fondo</label>
    <p className="persp3d-nota">Rectas paralelas en el espacio: la cámara las hace fugar. Cambiá el horizonte o girá la vista y todo sigue fugando exacto.</p>
    <h3>Esquema</h3>
    <div className="studio-option-grid">
      {ESQUEMAS.map((s) => <button key={s.id} title={s.grupo + ' · ' + s.ayuda} aria-pressed={a.activa && a.esquema === s.id}
        onClick={() => cambiar({ activa: true, esquema: s.id, ...preset(s.id, a.puntos) })}>
        <small>{s.grupo}</small>{s.nombre}</button>)}
    </div>
    <h3>Puntos de fuga</h3>
    <div className="studio-option-grid persp3d-puntos">
      {([1, 2, 3] as const).map((n) => <button key={n} aria-pressed={a.activa && a.puntos === n}
        title={n === 1 ? 'De frente: fuga una sola dirección' : n === 2 ? 'Girada: fugan las dos horizontales' : a.esquema === 'habitacion' ? 'Desde abajo: fuga también la vertical' : 'Desde arriba: fuga también la vertical'}
        onClick={() => cambiar({ activa: true, ...preset(a.esquema, n) })}>{n} {n === 1 ? 'punto' : 'puntos'}</button>)}
    </div>
    {rango('Horizonte (altura de los ojos)', 'altura', 0.2, a.esquema === 'habitacion' ? 2.7 : 80, 0.1, ' m')}
    {rango('Girar la vista', 'giro', -180, 180, 1, '°')}
    {rango('Inclinación', 'inclinacion', -80, 80, 1, '°')}
    <label className="persp3d-rango">Lente<select aria-label="Lente" value={a.lente} disabled={!a.activa} onChange={(ev) => cambiar({ lente: Number(ev.target.value) })}>
      {LENTES.map((l) => <option key={l} value={l}>{l} mm{l <= 18 ? ' · gran angular' : l >= 85 ? ' · tele' : ''}</option>)}</select></label>
    <div className="studio-option-grid persp3d-densidad">
      {(['pocas', 'muchas'] as const).map((d) => <button key={d} aria-pressed={a.densidad === d} disabled={!a.activa} onClick={() => cambiar({ densidad: d })}>{d === 'pocas' ? 'Pocas líneas' : 'Muchas líneas'}</button>)}
    </div>
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
    <p className="persp3d-nota">Cuadro del 2D: {cuadro.w}×{cuadro.h}{a.activa ? ` · ${lineas} líneas` : ''} · orbitá con el botón derecho</p>
    <button className="persp3d-mandar" disabled={!a.activa} onClick={mandar}>Mandar al 2D</button>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;
}
