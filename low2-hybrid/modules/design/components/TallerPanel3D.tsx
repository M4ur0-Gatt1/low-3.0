import React, { useEffect, useRef, useState } from 'react';
import { lowStore, useLowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { MANIQUIES, type Maniqui } from '../engine/maniqui3d';
import { cargarKitsPropios, guardarKitsPropios, kitsDeFabrica, type Kit, type Pieza } from '../engine/biblioteca3d';

/* Panel «Personaje»: el TALLER DE PERSONAJE (ver engine/maniqui3d.ts).
   Mauro: «un módulo de diseño de personaje con todas las herramientas al
   mejor estilo Grease Pencil… una biblioteca de maniquíes distintos que
   también sirva para el módulo 3D de composición de fondos».
   - Fuera del taller: elegís un maniquí (o uno de tus personajes) y entrás.
   - En el taller: las proporciones en cabezas, el giradiscos (frente, tres
     cuartos, perfil, espalda), las líneas de modelo, el espejo, el maniquí
     transparente, la hoja de modelo y el giro en cuadros para el 2D, y
     guardar en la biblioteca (colección «Mis personajes»). Se dibuja con
     TODAS las herramientas del estudio: los trazos se pegan a la parte del
     maniquí donde arrancan y la siguen. */

const enLOW = () => window.parent !== window;
/** Dónde se guarda lo que se está editando (lo pone la biblioteca al abrir uno de tus personajes con ✎). */
export const destinoTaller: { kitId: string | null; piezaId: string | null } = { kitId: null, piezaId: null };

const VISTAS: [number, string][] = [[0, 'Frente'], [45, '3/4'], [90, 'Perfil'], [135, '3/4 espalda'], [180, 'Espalda']];
const DESLIZADORES: { k: keyof Maniqui; nombre: string; min: number; max: number; paso: number; ayuda: string }[] = [
  { k: 'cabezas', nombre: 'Alto en cabezas', min: 1.5, max: 12, paso: 0.5, ayuda: 'Cuántas cabezas mide: 2,5 chibi · 5 cartoon · 7,5 realista · 8,5 heroico' },
  { k: 'hombros', nombre: 'Hombros', min: 0.6, max: 4, paso: 0.05, ayuda: 'Ancho de hombros, en cabezas' },
  { k: 'cadera', nombre: 'Cadera', min: 0.6, max: 4, paso: 0.05, ayuda: 'Ancho de cadera, en cabezas' },
  { k: 'brazos', nombre: 'Brazos', min: 0.5, max: 1.8, paso: 0.02, ayuda: 'Largo de los brazos (1 = el de siempre)' },
  { k: 'piernas', nombre: 'Piernas', min: 0.4, max: 1.8, paso: 0.02, ayuda: 'Largo de las piernas (1 = el de siempre)' },
  { k: 'grosor', nombre: 'Grosor', min: 0.5, max: 2, paso: 0.05, ayuda: 'De delgado a robusto' },
  { k: 'cabezaAncho', nombre: 'Cabeza (ancho)', min: 0.5, max: 1.3, paso: 0.02, ayuda: 'Ancho de la cabeza respecto de su alto' },
];

/** Mis personajes: lo guardado en las colecciones propias con sus proporciones. */
function misPersonajes(): { kit: Kit; p: Pieza }[] {
  return cargarKitsPropios().flatMap((k) => k.piezas.filter((p) => p.maniqui && !p.id.startsWith('maniqui-')).map((p) => ({ kit: k, p })));
}

export function TallerPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [taller, setTaller] = useState(() => engine.current?.enTaller() ?? null);
  const [nombre, setNombre] = useState(() => engine.current?.enEdicion()?.nombre ?? 'Personaje');
  const [preset, setPreset] = useState('cartoon');
  const [vista, setVista] = useState(25);
  const [fantasma, setFantasma] = useState(false);
  const [vistasHoja, setVistasHoja] = useState<number[]>([0, 45, 90, 135, 180]);
  const [conManiqui, setConManiqui] = useState(true);
  const [marco, setMarco] = useState({ w: 1920, h: 1080 });
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const antes = useRef<Maniqui | null>(null);
  const mirror = useLowStore().mirrorMode;

  useEffect(() => {
    const oir = () => { const e = engine.current; const t = e?.enTaller() ?? null; setTaller(t); if (t) setVista(t.vista); const ed = e?.enEdicion(); if (ed) setNombre(ed.nombre); };
    const alMensaje = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; width?: number; height?: number; ok?: boolean; error?: string; aviso?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:encuadre' && m.width && m.height) setMarco({ w: m.width, h: m.height });
      else if (m.type === 'low:hoja-recibida') { setOcupado(false); setAviso(m.error ? 'No se pudo mandar: ' + m.error : (m.aviso || 'Listo: está en el 2D')); }
    };
    oir();
    window.addEventListener('low3d:taller', oir);
    window.addEventListener('low3d:edicion', oir);
    window.addEventListener('message', alMensaje);
    if (enLOW()) window.parent.postMessage({ type: 'low:pedir-encuadre' }, '*');
    return () => { window.removeEventListener('low3d:taller', oir); window.removeEventListener('low3d:edicion', oir); window.removeEventListener('message', alMensaje); };
  }, [engine]);

  /* ── FUERA DEL TALLER: elegir maniquí o personaje ── */
  if (!taller) {
    const mios = misPersonajes();
    const abrir = (p: Pieza | null, kitId: string | null) => {
      const e = engine.current; if (!e) return;
      destinoTaller.kitId = kitId; destinoTaller.piezaId = p?.id ?? null;
      const m = MANIQUIES.find((x) => x.id === preset)?.m;
      if (!e.abrirTaller(p, p?.nombre || nombre.trim() || 'Personaje', m)) setAviso('Terminá primero lo que estás editando (guardalo o cancelalo)');
    };
    return <div className="persp3d taller3d">
      <p className="persp3d-nota">El <b>Taller de personaje</b>: dibujá tu personaje SOBRE un maniquí, con todas las herramientas, y giralo de verdad para armar sus vistas. Tu escena espera afuera, intacta.</p>
      <h3>Maniquí</h3>
      <div className="taller3d-presets" role="radiogroup" aria-label="Maniquí">
        {MANIQUIES.map((x) => <button key={x.id} role="radio" aria-checked={preset === x.id} data-maniqui={x.id} title={x.descripcion}
          className={preset === x.id ? 'on' : ''} onClick={() => setPreset(x.id)}><b>{x.nombre}</b><small>{String(x.m.cabezas).replace('.', ',')} cabezas</small></button>)}
      </div>
      <label className="toma3d-fila">Nombre<input aria-label="Nombre del personaje" value={nombre} maxLength={60} onChange={(ev) => setNombre(ev.target.value)}/></label>
      <button className="persp3d-boton persp3d-repetir-ya taller3d-entrar" onClick={() => abrir(null, null)}>Abrir el taller</button>
      {mios.length > 0 && <><h3>Mis personajes</h3>
        <div className="taller3d-mios">{mios.map(({ kit, p }) => <button key={kit.id + '/' + p.id} data-personaje={p.id} onClick={() => abrir(p, kit.id)} title={'Abrir «' + p.nombre + '» en el taller'}>{p.nombre}</button>)}</div></>}
      <p className="persp3d-nota">Los maniquíes también están en la Biblioteca (colección «Maniquíes»): colocalos en tus fondos para darles escala humana.</p>
      {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
    </div>;
  }

  /* ── EN EL TALLER ── */
  const m = taller.m;
  const e = engine.current;
  const ponerVista = (g: number) => { setVista(g); e?.vistaPersonaje(g); };
  const empezarArrastre = () => { if (!antes.current) antes.current = { ...m }; };
  const terminarArrastre = () => { if (antes.current) { e?.confirmarManiqui(antes.current); antes.current = null; } };
  const elegirPreset = (id: string) => {
    const x = MANIQUIES.find((y) => y.id === id); if (!x || !e) return;
    setPreset(id); e.setManiqui({ ...x.m, color: m.color });
  };
  const mandar = (modo: 'hoja' | 'giro') => {
    if (!e || ocupado) return;
    if (!enLOW()) { setAviso('Abrí el estudio desde LOW (botón 3D) para mandar al 2D'); return; }
    const grados = [...vistasHoja].sort((a, b) => a - b);
    if (!grados.length) { setAviso('Elegí al menos una vista'); return; }
    // la hoja: las vistas lado a lado en el cuadro del 2D (menos el margen de los
    // rótulos de las líneas, el 8%); el giro: cada vista llena el cuadro
    const W = modo === 'hoja' ? Math.max(64, Math.floor((marco.w * 0.92) / grados.length)) : marco.w;
    const H = modo === 'hoja' ? Math.round(marco.h * 0.9) : marco.h;
    const r = e.hojaDeModelo(W, H, grados, { maniqui: conManiqui });
    if (!r) { setAviso('No hay nada para mandar'); return; }
    setOcupado(true);
    setAviso(modo === 'hoja' ? 'Mandando la hoja de modelo al 2D…' : 'Mandando el giro en cuadros al 2D…');
    window.parent.postMessage({ type: 'low:send-hoja-modelo', modo, nombre: nombre.trim() || 'Personaje', ancho: W, alto: H, ...r }, '*');
  };
  const guardar = () => {
    if (!e) return;
    const r = e.terminarEdicion(true, { nombre: nombre.trim() || 'Personaje', categoria: 'personaje' });
    if (!r.ok || !r.pieza) return;
    const propios = cargarKitsPropios();
    // tus personajes van a TU colección «Mis personajes», que arranca vacía (los
    // maniquíes de fábrica siguen en «Maniquíes»: copiarlos ensuciaba la lista)
    let k = (destinoTaller.kitId && propios.find((x) => x.id === destinoTaller.kitId)) || propios.find((x) => x.nombre === 'Mis personajes');
    if (!k) {
      const base = kitsDeFabrica().find((x) => x.id === 'fabrica-maniquies')!;
      k = { id: 'kit-' + Date.now().toString(36), nombre: 'Mis personajes', descripcion: 'Los personajes del Taller de personaje', estilo: { ...base.estilo }, piezas: [] } as Kit;
      propios.push(k);
    }
    const p: Pieza = { ...r.pieza, id: destinoTaller.piezaId || 'personaje-' + Date.now().toString(36) };
    k.piezas = k.piezas.some((x) => x.id === p.id) ? k.piezas.map((x) => (x.id === p.id ? p : x)) : [...k.piezas, p];
    const ok = guardarKitsPropios(propios.map((x) => (x.id === k!.id ? k! : x)));
    try { window.localStorage.setItem('low3d:kit-activo', k.id); } catch { /* sin almacenamiento */ }
    destinoTaller.kitId = null; destinoTaller.piezaId = null;
    setAviso(ok ? `«${p.nombre}» guardado en «${k.nombre}» · en la Biblioteca lo colocás en tus fondos` : 'No entró en el almacenamiento del estudio: exportá la colección (.lowkit) desde la Biblioteca');
  };
  const cancelar = () => { e?.terminarEdicion(false); destinoTaller.kitId = null; destinoTaller.piezaId = null; };

  return <div className="persp3d taller3d taller3d-activo">
    <label className="toma3d-fila">Nombre<input aria-label="Nombre del personaje" value={nombre} maxLength={60} onChange={(ev) => setNombre(ev.target.value)}/></label>

    <h3>Vistas</h3>
    <div className="taller3d-vistas" role="group" aria-label="Vistas del personaje">
      {VISTAS.map(([g, n]) => <button key={g} data-vista={g} aria-pressed={Math.round(vista) === g} onClick={() => ponerVista(g)}>{n}</button>)}
    </div>
    <label className="toma3d-fila" title="Girá el personaje (el giradiscos)">Girar
      <input type="range" aria-label="Girar el personaje" min={0} max={360} step={5} value={Math.round(vista)} onChange={(ev) => ponerVista(Number(ev.target.value))}/>
      <output>{Math.round(vista)}°</output></label>
    <div className="taller3d-ver">
      <label><input type="checkbox" checked={taller.lineas} onChange={(ev) => e?.setLineasModelo(ev.target.checked)}/> Líneas de modelo</label>
      <label title="Lo que dibujás de un lado aparece del otro (como el espejo de Grease Pencil)"><input type="checkbox" checked={!!mirror.x}
        onChange={(ev) => lowStore.setMirrorMode({ ...mirror, x: ev.target.checked })}/> Espejo</label>
      <label title="El maniquí se ve transparente; se sigue dibujando sobre él"><input type="checkbox" checked={fantasma}
        onChange={(ev) => { setFantasma(ev.target.checked); e?.setManiquiFantasma(ev.target.checked); }}/> Maniquí transparente</label>
    </div>

    <h3>Proporciones</h3>
    <label className="toma3d-fila">Base<select aria-label="Proporciones de base" value={MANIQUIES.find((x) => x.m.cabezas === m.cabezas && x.m.hombros === m.hombros)?.id ?? ''} onChange={(ev) => elegirPreset(ev.target.value)}>
      <option value="" disabled>A medida</option>
      {MANIQUIES.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    {DESLIZADORES.map((d) => <label key={d.k} className="toma3d-fila taller3d-desl" title={d.ayuda}>{d.nombre}
      <input type="range" aria-label={d.nombre} data-prop={d.k} min={d.min} max={d.max} step={d.paso} value={Number(m[d.k])}
        onPointerDown={empezarArrastre} onKeyDown={empezarArrastre} onPointerUp={terminarArrastre} onKeyUp={terminarArrastre} onBlur={terminarArrastre}
        onChange={(ev) => { empezarArrastre(); e?.verManiqui({ [d.k]: Number(ev.target.value) }); }}/>
      <output>{Number(m[d.k]).toFixed(d.paso < 0.1 ? 2 : 1).replace('.', ',')}</output></label>)}
    <label className="toma3d-fila" title="El alto real en metros: la escala del personaje al colocarlo en un fondo">Alto (m)
      <input type="number" aria-label="Alto en metros" min={0.1} max={30} step={0.05} value={m.alto} onChange={(ev) => e?.setManiqui({ alto: Number(ev.target.value) || m.alto })}/></label>
    <label className="toma3d-fila">Color<input type="color" aria-label="Color del maniquí" value={m.color} onChange={(ev) => e?.setManiqui({ color: ev.target.value })}/></label>
    <p className="persp3d-nota">Dibujá con todas las herramientas: lo que arranca sobre una parte del maniquí se pega a ella y la sigue si cambiás las proporciones.</p>

    <h3>Al 2D</h3>
    <div className="taller3d-vistas" role="group" aria-label="Vistas para el 2D">
      {VISTAS.map(([g, n]) => <label key={g}><input type="checkbox" data-hoja={g} checked={vistasHoja.includes(g)}
        onChange={(ev) => setVistasHoja(ev.target.checked ? [...vistasHoja, g] : vistasHoja.filter((x) => x !== g))}/>{n}</label>)}
    </div>
    <label className="taller3d-ver"><span><input type="checkbox" checked={conManiqui} onChange={(ev) => setConManiqui(ev.target.checked)}/> Con el maniquí</span></label>
    <div className="biblio3d-acciones">
      <button className="persp3d-boton taller3d-hoja" disabled={ocupado} onClick={() => mandar('hoja')} title="Las vistas lado a lado, sin perspectiva y con las líneas de modelo, en una capa de referencia del 2D">Mandar hoja de modelo</button>
      <button className="persp3d-boton taller3d-giro" disabled={ocupado} onClick={() => mandar('giro')} title="Cada vista en un cuadro de una capa nueva: el giro, listo para animarlo">Mandar el giro en cuadros</button>
    </div>

    <div className="biblio3d-acciones taller3d-cierre">
      <button className="persp3d-boton persp3d-repetir-ya taller3d-guardar" onClick={guardar}>Guardar en la biblioteca</button>
      <button className="persp3d-boton" onClick={cancelar}>Cancelar</button>
    </div>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;
}
