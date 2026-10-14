import React, { useEffect, useState } from 'react';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { AJUSTES_INICIALES, encuadre, type Encuadre, type Perspectiva3DAjustes } from '../engine/perspectiva3d';

/* Panel «Cámara» del estudio (v3.29.3; antes «Perspectiva para layouts»).
   Mauro: «esa vista de calle es de lo más inútil y tiene mucho ruido». Se
   fueron los esquemas de líneas: el espacio se arma con el piso, las guías y
   las cajas, y la cámara en perspectiva hace fugar todo sola. Acá queda la
   cámara del layout: el cuadro del 2D, la altura de los ojos (el horizonte),
   los encuadres de 1, 2 y 3 puntos, el giro, la inclinación y el lente.
   «Mandar al 2D» está en Toma; «Repetir hacia la fuga», en Escena. */

const LENTES = [14, 18, 24, 28, 35, 50, 85, 135];
const ENCUADRES: { id: Encuadre; nombre: string; puntos: string; ayuda: string }[] = [
  { id: 'frente', nombre: 'De frente', puntos: '1 punto', ayuda: 'Calles y pasillos de frente: fuga una sola dirección' },
  { id: 'esquina', nombre: 'En esquina', puntos: '2 puntos', ayuda: 'Esquinas de casas y edificios: fugan las dos horizontales' },
  { id: 'arriba', nombre: 'Desde arriba', puntos: '3 puntos', ayuda: 'Vista de pájaro: fuga también la vertical, hacia abajo' },
  { id: 'abajo', nombre: 'Desde abajo', puntos: '3 puntos', ayuda: 'Vista de hormiga: fuga también la vertical, hacia arriba' },
];
const enLOW = () => window.parent !== window;

export function PerspectivaPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [a, setA] = useState<Perspectiva3DAjustes>(() => engine.current?.getPerspectiva() ?? AJUSTES_INICIALES);
  const [cuadro, setCuadro] = useState({ w: 1920, h: 1080, doc: false });
  const [ultimo, setUltimo] = useState<Encuadre | null>(null);

  useEffect(() => {
    const sync = () => { const e = engine.current; if (e) setA(e.getPerspectiva()); };
    // al orbitar con el mouse la cámara cambia: los controles muestran lo que se ve
    const alSoltar = (ev: PointerEvent) => {
      const e = engine.current;
      // sólo después de orbitar (botón derecho) o desplazar (medio) en perspectiva:
      // al terminar un TRAZO (izquierdo) no se toca nada
      if (!e || ev.button === 0 || e.currentView() !== 'persp' || !e.getPerspectiva().activa) return;
      e.setPerspectiva(e.leerPerspectiva(), { mover: false });
      setUltimo(null);
    };
    const alMensaje = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; width?: number; height?: number; hayDocumento?: boolean } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:encuadre' && m.width && m.height) {
        setCuadro({ w: m.width, h: m.height, doc: !!m.hayDocumento });
        engine.current?.setAspecto2D(m.width, m.height);
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

  /** Tocar cualquier control de la cámara prende el cuadro del 2D: sin él no
   *  hay altura de ojos ni lente que ajustar. */
  const cambiar = (c: Partial<Perspectiva3DAjustes>) => {
    const e = engine.current; if (!e) return;
    setA(e.setPerspectiva({ activa: true, ...c }));
  };
  const rango = (etiqueta: string, clave: 'altura' | 'giro' | 'inclinacion', min: number, max: number, paso: number, unidad: string) =>
    <label className="persp3d-rango">{etiqueta}<output>{a[clave]}{unidad}</output>
      <input type="range" aria-label={etiqueta} min={min} max={max} step={paso} value={a[clave]}
        onChange={(ev) => { setUltimo(null); cambiar({ [clave]: Number(ev.target.value) }); }}/></label>;

  return <div className="persp3d">
    <label className="persp3d-activa"><input type="checkbox" checked={a.activa} onChange={(ev) => { const e = engine.current; if (e) setA(e.setPerspectiva({ activa: ev.target.checked })); }}/> Ver el cuadro del 2D</label>
    <p className="persp3d-nota">El marco muestra lo que sale como fondo, con el horizonte y los puntos de fuga. La cámara hace fugar todo sola: armá el espacio con el piso, guías y cajas.</p>
    <h3>Encuadre</h3>
    <div className="studio-option-grid persp3d-puntos">
      {ENCUADRES.map((x) => <button key={x.id} title={x.ayuda} aria-pressed={a.activa && ultimo === x.id}
        onClick={() => { setUltimo(x.id); cambiar(encuadre(x.id, a.altura)); }}>
        <small>{x.puntos}</small>{x.nombre}</button>)}
    </div>
    {rango('Altura de los ojos (horizonte)', 'altura', 0.2, 80, 0.1, ' m')}
    {rango('Girar la vista', 'giro', -180, 180, 1, '°')}
    {rango('Inclinación', 'inclinacion', -80, 80, 1, '°')}
    <label className="persp3d-rango">Lente<select aria-label="Lente" value={a.lente} onChange={(ev) => cambiar({ lente: Number(ev.target.value) })}>
      {LENTES.map((l) => <option key={l} value={l}>{l} mm{l <= 18 ? ' · gran angular' : l >= 85 ? ' · tele' : ''}</option>)}</select></label>
    <p className="persp3d-nota">Cuadro del 2D: {cuadro.w}×{cuadro.h}{cuadro.doc ? '' : ' (abrí un documento en LOW para usar su tamaño)'} · orbitá con el botón derecho: los controles siguen lo que ves · para mandarlo al 2D, abrí Toma.</p>
  </div>;
}
