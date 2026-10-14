import React, { useEffect, useRef, useState } from 'react';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { cuadrosARender, TOMA_INICIAL, type Toma3D } from '../engine/toma3d';

/* Panel «Toma» del estudio: la cámara animada que saca los fondos para el 2D.
   Se mueve la vista, se pone una clave en un cuadro, se mueve otra vez, otra
   clave… y la cámara pasa entre claves por una curva suave. «Mandar la toma
   al 2D» renderiza los cuadros (en unos, en dos o en tres) como JPG o PNG y
   llegan a una capa de fondo de la escena, cada uno en su cuadro.
   La lógica vive en engine/toma3d.ts y en el motor; esto sólo la maneja.
   v3.29.3: también «Mandar este encuadre al 2D» (un solo fondo, con sus
   puntos de fuga para el imán del 2D), que antes estaba en el panel de
   perspectiva. Ya no hay «líneas de la perspectiva» que mandar. */

const enLOW = () => window.parent !== window;

export function TomaPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [toma, setToma] = useState<Toma3D>(() => engine.current?.getToma() ?? TOMA_INICIAL);
  const [cuadro, setCuadro] = useState(1);
  const [marco, setMarco] = useState({ w: 1920, h: 1080, fps: 24, doc: false });
  // cajas: las cajas del estudio son andamio; con esto salen al 2D como volúmenes grises de referencia
  const [op, setOp] = useState<{ cada: number; formato: 'jpg' | 'png'; calidad: number; cajas: boolean }>({ cada: 2, formato: 'jpg', calidad: 90, cajas: false });
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [jugando, setJugando] = useState(false);
  const reloj = useRef<number | null>(null);

  useEffect(() => {
    const sync = () => { const e = engine.current; if (e) setToma(e.getToma()); };
    const alMensaje = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; width?: number; height?: number; fps?: number; cuadros?: number; hayDocumento?: boolean; ok?: boolean; error?: string; aviso?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:encuadre' && m.width && m.height) {
        setMarco({ w: m.width, h: m.height, fps: m.fps || 24, doc: !!m.hayDocumento });
        const e = engine.current;
        // la toma dura lo que la escena del 2D, mientras nadie la haya cambiado a mano
        if (e && m.cuadros && m.cuadros > 1 && e.getToma().cuadros === TOMA_INICIAL.cuadros && !e.getToma().claves.length) setToma(e.setToma({ cuadros: m.cuadros }));
      } else if (m.type === 'low:sent-to-2d') {
        setAviso(m.error ? 'No se pudo mandar: ' + m.error : 'Listo: el encuadre está en el 2D, con sus puntos de fuga');
      } else if (m.type === 'low:toma-recibida') {
        setOcupado(false);
        setAviso(m.error ? 'No se pudo mandar: ' + m.error : (m.aviso || 'Listo: los fondos están en el 2D'));
      }
    };
    sync();
    window.addEventListener('low3d:toma', sync);
    window.addEventListener('message', alMensaje);
    if (enLOW()) window.parent.postMessage({ type: 'low:pedir-encuadre' }, '*');
    return () => {
      window.removeEventListener('low3d:toma', sync);
      window.removeEventListener('message', alMensaje);
      if (reloj.current) window.clearInterval(reloj.current);
    };
  }, [engine]);

  const ir = (f: number) => {
    const c = Math.max(1, Math.min(toma.cuadros, Math.round(f) || 1));
    setCuadro(c);
    engine.current?.tomaIr(c);
  };
  const clave = () => {
    const e = engine.current; if (!e) return;
    const t = e.tomaPonerClave(cuadro);
    if (!t) { setAviso('Pasá a la vista Perspectiva para poner la clave de la cámara'); return; }
    setToma(t);
    setAviso(t.claves.length === 1 ? 'Primera clave. Mové la vista, cambiá de cuadro y poné otra: la cámara va de una a otra' : `Clave en el cuadro ${cuadro} · ${t.claves.length} claves`);
  };
  const quitar = () => { const e = engine.current; if (e) setToma(e.tomaQuitarClave(cuadro)); };
  const parar = () => { if (reloj.current) window.clearInterval(reloj.current); reloj.current = null; setJugando(false); };
  const jugar = () => {
    if (jugando) return parar();
    if (!toma.claves.length) { setAviso('Poné al menos una clave para ver la toma'); return; }
    let f = 1;
    setJugando(true);
    reloj.current = window.setInterval(() => {
      ir(f);
      f++;
      if (f > toma.cuadros) parar();
    }, 1000 / Math.max(1, marco.fps));
  };
  /** Un solo fondo: lo que se ve ahora en Perspectiva, del tamaño del cuadro
   *  del 2D, con los puntos de fuga en esos píxeles (el 2D los usa para el imán). */
  const mandarEncuadre = () => {
    const e = engine.current; if (!e) return;
    if (!enLOW()) { setAviso('Abrí el estudio desde LOW (botón 3D) para mandar el encuadre al 2D'); return; }
    const r = e.mandarAl2D(marco.w, marco.h, { cajas: op.cajas });
    if (!r) { setAviso('Pasá a la vista Perspectiva para mandar el encuadre'); return; }
    setAviso('Mandando al 2D…');
    window.parent.postMessage({ type: 'low:send-to-2d', ...r }, '*');
  };
  const mandar = async () => {
    const e = engine.current; if (!e || ocupado) return;
    if (!enLOW()) { setAviso('Abrí el estudio desde LOW (botón 3D) para mandar la toma al 2D'); return; }
    if (!toma.claves.length) { setAviso('Poné al menos una clave de cámara'); return; }
    parar();
    setOcupado(true);
    const cuadros = cuadrosARender(toma, op.cada);
    const fotos = await e.tomaRender(cuadros, marco.w, marco.h, { formato: op.formato, calidad: op.calidad / 100, cajas: op.cajas },
      (h, n) => setAviso(`Renderizando ${h} de ${n}…`));
    if (!fotos.length) { setOcupado(false); setAviso('No se pudo renderizar la toma'); return; }
    setAviso('Mandando al 2D…');
    window.parent.postMessage({ type: 'low:send-toma', nombre: toma.nombre, width: marco.w, height: marco.h, cuadros: toma.cuadros,
      cada: op.cada, formato: op.formato, fotos }, '*');
  };

  const enClave = toma.claves.some((k) => k.cuadro === cuadro);
  return <div className="persp3d toma3d">
    {/* un fondo solo (lo más común): arriba de todo. Medido en la app real a
        1366×705: abajo del panel quedaba fuera de la vista y había que hacer scroll */}
    <h3>Un fondo</h3>
    <label className="toma3d-check" title="Las cajas son andamio y no salen al 2D. Con esto salen como volúmenes grises, de referencia para dibujar encima"><input type="checkbox" checked={op.cajas} onChange={(ev) => setOp({ ...op, cajas: ev.target.checked })}/> Con las cajas (gris)</label>
    <button className="persp3d-boton toma3d-encuadre" onClick={mandarEncuadre} title="Un solo fondo: lo que se ve ahora, con sus puntos de fuga para dibujar encima en el 2D">Mandar este encuadre al 2D</button>
    <h3>Toma animada</h3>
    <p className="persp3d-nota">Mové la vista (en Perspectiva), elegí el cuadro y poné una clave. La cámara pasa de clave en clave por una curva suave.</p>
    <label className="toma3d-fila">Nombre<input aria-label="Nombre de la toma" value={toma.nombre} maxLength={60}
      onChange={(ev) => { const e = engine.current; if (e) setToma(e.setToma({ nombre: ev.target.value })); }}/></label>
    <label className="toma3d-fila">Dura<input type="number" aria-label="Cuadros de la toma" min={1} max={100000} value={toma.cuadros}
      onChange={(ev) => { const e = engine.current; if (e) setToma(e.setToma({ cuadros: Number(ev.target.value) || 1 })); }}/> cuadros</label>
    <div className="toma3d-linea">
      <input type="range" aria-label="Cuadro de la toma" min={1} max={toma.cuadros} value={Math.min(cuadro, toma.cuadros)} onChange={(ev) => ir(Number(ev.target.value))}/>
      <input type="number" aria-label="Cuadro" min={1} max={toma.cuadros} value={cuadro} onChange={(ev) => ir(Number(ev.target.value))}/>
    </div>
    <div className="toma3d-claves" aria-label="Claves de la toma">
      {toma.claves.length ? toma.claves.map((k) => <button key={k.cuadro} className={k.cuadro === cuadro ? 'on' : ''} onClick={() => ir(k.cuadro)} title={`Ir a la clave del cuadro ${k.cuadro}`}>◆ {k.cuadro}</button>)
        : <span className="persp3d-nota">Sin claves todavía</span>}
    </div>
    <div className="toma3d-botones">
      <button className="persp3d-boton persp3d-repetir-ya toma3d-clave" onClick={clave} title="Guarda cómo se ve la cámara ahora en este cuadro">{enClave ? '◆ Cambiar clave' : '◆ Clave aquí'}</button>
      <button className="persp3d-boton" onClick={quitar} disabled={!enClave}>Quitar clave</button>
      <button className="persp3d-boton toma3d-jugar" onClick={jugar}>{jugando ? '■ Parar' : '▶ Ver la toma'}</button>
    </div>
    <h3>Mandar al 2D</h3>
    <div className="persp3d-repetir">
      <label>Un fondo cada<select aria-label="Cada cuántos cuadros" value={op.cada} onChange={(ev) => setOp({ ...op, cada: Number(ev.target.value) })}>
        <option value={1}>1 cuadro (en unos)</option><option value={2}>2 cuadros (en dos)</option><option value={3}>3 cuadros (en tres)</option><option value={4}>4 cuadros</option></select></label>
      <label>Formato<select aria-label="Formato de los fondos" value={op.formato} onChange={(ev) => setOp({ ...op, formato: ev.target.value as 'jpg' | 'png' })}>
        <option value="jpg">JPG (liviano)</option><option value="png">PNG (transparente)</option></select></label>
      {op.formato === 'jpg' && <label>Calidad<input type="number" aria-label="Calidad JPG" min={50} max={100} value={op.calidad}
        onChange={(ev) => setOp({ ...op, calidad: Math.max(50, Math.min(100, Number(ev.target.value) || 90)) })}/></label>}
    </div>
    <button className="persp3d-boton persp3d-repetir-ya toma3d-mandar" disabled={ocupado} onClick={mandar}>
      {ocupado ? 'Trabajando…' : `Mandar la toma al 2D (${cuadrosARender(toma, op.cada).length} fondos)`}</button>

    <p className="persp3d-nota">Cuadro del 2D: {marco.w}×{marco.h} · {marco.fps} cuadros por segundo{marco.doc ? '' : ' · abrí un documento de animación en LOW'}</p>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;
}
