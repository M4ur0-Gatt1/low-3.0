import React, { useEffect, useState } from 'react';
import { lowStore, useLowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { CUERPOS, PROP_RANGOS, cargarPoses, type BaseCuerpo, type ModoTaller, type PincelEscultura, type Proporciones } from '../engine/personaje3d';
import { cargarKitsPropios, guardarKitsPropios, kitsDeFabrica, type Kit, type Pieza } from '../engine/biblioteca3d';

/* Panel «Personaje»: el TALLER DE PERSONAJE (ver engine/personaje3d.ts).
   Mauro: «un módulo de diseño de personaje con todas las herramientas al
   mejor estilo Grease Pencil», «quiero algo mucho más estilizado y realista»
   y «tengo que poder modelarlo también».
   - Fuera del taller: elegís un cuerpo (hombre, mujer, maniquí) o uno de tus
     personajes y entrás.
   - En el taller, tres modos: DIBUJAR sobre el cuerpo (los trazos se pegan al
     hueso que tocan y lo siguen), POSAR (agarrar una parte y arrastrarla) y
     ESCULPIR la piel. Más las proporciones, el giradiscos, las líneas de
     modelo, la hoja de modelo y el giro para el 2D, y guardar en «Mis
     personajes». */

const enLOW = () => window.parent !== window;
/** Dónde se guarda lo que se está editando (lo pone la biblioteca al abrir uno de tus personajes con ✎). */
export const destinoTaller: { kitId: string | null; piezaId: string | null } = { kitId: null, piezaId: null };

const VISTAS: [number, string][] = [[0, 'Frente'], [45, '3/4'], [90, 'Perfil'], [135, '3/4 espalda'], [180, 'Espalda']];
const MODOS: [ModoTaller, string, string][] = [
  ['dibujar', 'Dibujar', 'Dibujá sobre el cuerpo con todas las herramientas: cada trazo se pega a la parte que toca y la sigue'],
  ['posar', 'Posar', 'Agarrá una parte del cuerpo y arrastrala: gira desde su articulación (el codo y la rodilla, para un solo lado)'],
  ['esculpir', 'Esculpir', 'Modelá la piel con pinceles: tirar, inflar, desinflar, suavizar, aplanar'],
];
const PINCELES: [PincelEscultura, string, string][] = [
  ['tirar', 'Tirar', 'Agarra la piel y la lleva con el cursor'],
  ['inflar', 'Inflar', 'Empuja la piel hacia afuera (músculos, panza, nariz)'],
  ['desinflar', 'Desinflar', 'Hunde la piel (cintura, mejillas)'],
  ['suavizar', 'Suavizar', 'Empareja la piel bajo el pincel'],
  ['aplanar', 'Aplanar', 'Lleva la piel a un plano (caras, cortes)'],
];
const DESLIZADORES: { k: keyof Proporciones; nombre: string; ayuda: string }[] = [
  { k: 'cabeza', nombre: 'Cabeza', ayuda: 'El tamaño de la cabeza: más grande, más caricatura' },
  { k: 'cuello', nombre: 'Cuello', ayuda: 'El largo del cuello' },
  { k: 'torso', nombre: 'Torso', ayuda: 'El largo del torso' },
  { k: 'hombros', nombre: 'Hombros', ayuda: 'El ancho de hombros' },
  { k: 'caderas', nombre: 'Caderas', ayuda: 'El ancho de caderas' },
  { k: 'brazos', nombre: 'Brazos', ayuda: 'El largo de los brazos' },
  { k: 'piernas', nombre: 'Piernas', ayuda: 'El largo de las piernas' },
];
const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** Mis personajes: lo guardado en las colecciones propias como personaje. */
function misPersonajes(): { kit: Kit; p: Pieza }[] {
  return cargarKitsPropios().flatMap((k) => k.piezas.filter((p) => p.categoria === 'personaje' || p.maniqui).map((p) => ({ kit: k, p })));
}

export function TallerPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [taller, setTaller] = useState(() => engine.current?.enTaller() ?? null);
  const [nombre, setNombre] = useState(() => engine.current?.enEdicion()?.nombre ?? 'Personaje');
  const [base, setBase] = useState<BaseCuerpo>('hombre');
  const [vista, setVista] = useState(25);
  const [poses, setPoses] = useState(() => engine.current?.posesDelTaller() ?? []);
  const [vistasHoja, setVistasHoja] = useState<number[]>([0, 45, 90, 135, 180]);
  const [conCuerpo, setConCuerpo] = useState(true);
  const [marco, setMarco] = useState({ w: 1920, h: 1080 });
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
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
    cargarPoses().then(() => setPoses(engine.current?.posesDelTaller() ?? []));
    window.addEventListener('low3d:taller', oir);
    window.addEventListener('low3d:edicion', oir);
    window.addEventListener('message', alMensaje);
    if (enLOW()) window.parent.postMessage({ type: 'low:pedir-encuadre' }, '*');
    return () => { window.removeEventListener('low3d:taller', oir); window.removeEventListener('low3d:edicion', oir); window.removeEventListener('message', alMensaje); };
  }, [engine]);

  /* ── FUERA DEL TALLER: elegir cuerpo o personaje ── */
  if (!taller) {
    const mios = misPersonajes();
    const abrir = (p: Pieza | null, kitId: string | null) => {
      const e = engine.current; if (!e) return;
      destinoTaller.kitId = kitId; destinoTaller.piezaId = p?.id ?? null;
      if (!e.abrirTaller(p, p?.nombre || nombre.trim() || 'Personaje', base)) setAviso('Terminá primero lo que estás editando (guardalo o cancelalo)');
    };
    return <div className="persp3d taller3d">
      <p className="persp3d-nota">El <b>Taller de personaje</b>: un cuerpo de verdad para dibujarle encima, posarlo y modelarlo, y girarlo para armar sus vistas. Tu escena espera afuera, intacta.</p>
      <h3>Cuerpo</h3>
      <div className="taller3d-presets" role="radiogroup" aria-label="Cuerpo">
        {CUERPOS.map((x) => <button key={x.id} role="radio" aria-checked={base === x.id} data-cuerpo={x.id} title={x.descripcion}
          className={base === x.id ? 'on' : ''} onClick={() => setBase(x.id)}><b>{x.nombre}</b><small>{x.descripcion}</small></button>)}
      </div>
      <label className="toma3d-fila">Nombre<input aria-label="Nombre del personaje" value={nombre} maxLength={60} onChange={(ev) => setNombre(ev.target.value)}/></label>
      <button className="persp3d-boton persp3d-repetir-ya taller3d-entrar" onClick={() => abrir(null, null)}>Abrir el taller</button>
      {mios.length > 0 && <><h3>Mis personajes</h3>
        <div className="taller3d-mios">{mios.map(({ kit, p }) => <button key={kit.id + '/' + p.id} data-personaje={p.id} onClick={() => abrir(p, kit.id)} title={'Abrir «' + p.nombre + '» en el taller'}>{p.nombre}</button>)}</div></>}
      <p className="persp3d-nota">Los cuerpos también están en la Biblioteca (colección «Personajes»), en varias poses: colocalos en tus fondos para darles escala humana. Cuerpos y poses: Quaternius (CC0).</p>
      {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
    </div>;
  }

  /* ── EN EL TALLER ── */
  const e = engine.current;
  const ponerVista = (g: number) => { setVista(g); e?.vistaPersonaje(g); };
  const mandar = (modo: 'hoja' | 'giro') => {
    if (!e || ocupado) return;
    if (!enLOW()) { setAviso('Abrí el estudio desde LOW (botón 3D) para mandar al 2D'); return; }
    const grados = [...vistasHoja].sort((a, b) => a - b);
    if (!grados.length) { setAviso('Elegí al menos una vista'); return; }
    // la hoja: las vistas lado a lado en el cuadro del 2D (menos el margen de los
    // rótulos de las líneas, el 8%); el giro: cada vista llena el cuadro
    const W = modo === 'hoja' ? Math.max(64, Math.floor((marco.w * 0.92) / grados.length)) : marco.w;
    const H = modo === 'hoja' ? Math.round(marco.h * 0.9) : marco.h;
    const r = e.hojaDeModelo(W, H, grados, { maniqui: conCuerpo });
    if (!r) { setAviso('No hay nada para mandar'); return; }
    setOcupado(true);
    setAviso(modo === 'hoja' ? 'Mandando la hoja de modelo al 2D…' : 'Mandando el giro en cuadros al 2D…');
    window.parent.postMessage({ type: 'low:send-hoja-modelo', modo, nombre: nombre.trim() || 'Personaje', ancho: W, alto: H, ...r }, '*');
  };
  const guardar = async () => {
    if (!e) return;
    await e.personajesListos();
    const r = e.terminarEdicion(true, { nombre: nombre.trim() || 'Personaje', categoria: 'personaje' });
    if (!r.ok || !r.pieza) return;
    const propios = cargarKitsPropios();
    // tus personajes van a TU colección «Mis personajes», que arranca vacía (los
    // de fábrica siguen en «Personajes»: copiarlos ensuciaba la lista)
    let k = (destinoTaller.kitId && propios.find((x) => x.id === destinoTaller.kitId)) || propios.find((x) => x.nombre === 'Mis personajes');
    if (!k) {
      const kb = kitsDeFabrica().find((x) => x.id === 'fabrica-maniquies')!;
      k = { id: 'kit-' + Date.now().toString(36), nombre: 'Mis personajes', descripcion: 'Los personajes del Taller de personaje', estilo: { ...kb.estilo }, piezas: [] } as Kit;
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
  const t = taller;

  return <div className="persp3d taller3d taller3d-activo">
    <label className="toma3d-fila">Nombre<input aria-label="Nombre del personaje" value={nombre} maxLength={60} onChange={(ev) => setNombre(ev.target.value)}/></label>
    {!t.listo && <p className="persp3d-nota" role="status">Cargando el cuerpo…</p>}

    <div className="taller3d-modos" role="radiogroup" aria-label="Qué hace el mouse sobre el personaje">
      {MODOS.map(([m, n, ayuda]) => <button key={m} role="radio" aria-checked={t.modo === m} data-modo={m} title={ayuda}
        className={t.modo === m ? 'on' : ''} onClick={() => e?.setModoTaller(m)}>{n}</button>)}
    </div>
    <p className="persp3d-nota taller3d-ayuda">{MODOS.find((x) => x[0] === t.modo)![2]}</p>

    {t.modo === 'posar' && <>
      <label className="toma3d-fila">Pose<select aria-label="Pose de fábrica" value="" onChange={(ev) => { if (ev.target.value) e?.ponerPose(ev.target.value === '-' ? null : ev.target.value); }}>
        <option value="">Elegí una pose…</option>
        <option value="-">Pose T (reposo)</option>
        {poses.filter((p) => p.id !== 't').map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select></label>
      <p className="persp3d-nota taller3d-articulacion" aria-live="polite">{t.control ? <>Elegido: <b>{t.nombreControl}</b></> : 'Tocá una parte del cuerpo para elegirla'}</p>
      <div className="biblio3d-acciones">
        <button className="persp3d-boton taller3d-enderezar" disabled={!t.control} onClick={() => e?.enderezarControl()} title="Esa parte vuelve a como está en reposo">Enderezar</button>
        <button className="persp3d-boton taller3d-copiar" disabled={!t.control || !/_[lr]$/.test(t.control)} onClick={() => e?.copiarControlAlOtroLado()} title="El otro brazo (o pierna) queda igual, espejado">Copiar al otro lado</button>
        <button className="persp3d-boton taller3d-espejar" onClick={() => e?.espejarPose()} title="Toda la pose al revés: lo de la izquierda a la derecha">Espejar la pose</button>
      </div>
      <label className="taller3d-ver"><span><input type="checkbox" checked={t.pies} onChange={(ev) => e?.setPiesEnElPiso(ev.target.checked)}/> Pies en el piso</span></label>
    </>}

    {t.modo === 'esculpir' && <>
      <div className="taller3d-pinceles" role="radiogroup" aria-label="Pincel de escultura">
        {PINCELES.map(([p, n, ayuda]) => <button key={p} role="radio" aria-checked={t.pincel.tipo === p} data-pincel={p} title={ayuda}
          className={t.pincel.tipo === p ? 'on' : ''} onClick={() => e?.setPincelEscultura({ tipo: p })}>{n}</button>)}
      </div>
      <label className="toma3d-fila taller3d-desl" title="El tamaño del pincel (en centímetros)">Tamaño
        <input type="range" aria-label="Tamaño del pincel" min={1} max={40} step={0.5} value={Math.round(t.pincel.radio * 200) / 2} onChange={(ev) => e?.setPincelEscultura({ radio: Number(ev.target.value) / 100 })}/>
        <output>{fmt(t.pincel.radio * 100, 1)} cm</output></label>
      <label className="toma3d-fila taller3d-desl" title="Cuánto cambia la piel en cada pasada">Fuerza
        <input type="range" aria-label="Fuerza del pincel" min={0.05} max={1} step={0.05} value={t.pincel.fuerza} onChange={(ev) => e?.setPincelEscultura({ fuerza: Number(ev.target.value) })}/>
        <output>{Math.round(t.pincel.fuerza * 100)} %</output></label>
      <label className="taller3d-ver"><span><input type="checkbox" checked={t.pincel.simetria} onChange={(ev) => e?.setPincelEscultura({ simetria: ev.target.checked })}/> Simetría (izquierda = derecha)</span></label>
      <div className="biblio3d-acciones"><button className="persp3d-boton taller3d-sin-escultura" onClick={() => e?.sinEscultura()} title="La piel vuelve a como vino (Ctrl+Z lo deshace)">Volver a la piel original</button></div>
    </>}

    <h3>Vistas</h3>
    <div className="taller3d-vistas" role="group" aria-label="Vistas del personaje">
      {VISTAS.map(([g, n]) => <button key={g} data-vista={g} aria-pressed={Math.round(vista) === g} onClick={() => ponerVista(g)}>{n}</button>)}
    </div>
    <label className="toma3d-fila" title="Girá el personaje (el giradiscos)">Girar
      <input type="range" aria-label="Girar el personaje" min={0} max={360} step={5} value={Math.round(vista)} onChange={(ev) => ponerVista(Number(ev.target.value))}/>
      <output>{Math.round(vista)}°</output></label>
    <div className="taller3d-ver">
      <label><input type="checkbox" checked={t.lineas} onChange={(ev) => e?.setLineasModelo(ev.target.checked)}/> Líneas de modelo</label>
      <label title="Lo que dibujás de un lado aparece del otro, sobre el otro lado del cuerpo"><input type="checkbox" checked={!!mirror.x}
        onChange={(ev) => lowStore.setMirrorMode({ ...mirror, x: ev.target.checked })}/> Espejo</label>
      <label title="El cuerpo se ve transparente; se sigue dibujando sobre él"><input type="checkbox" checked={t.fantasma}
        onChange={(ev) => e?.setPersonajeFantasma(ev.target.checked)}/> Cuerpo transparente</label>
    </div>

    <h3>Cuerpo y proporciones</h3>
    <label className="toma3d-fila">Cuerpo<select aria-label="Cuerpo" value={t.base} onChange={(ev) => e?.cambiarCuerpo(ev.target.value as BaseCuerpo)}>
      {CUERPOS.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
    {DESLIZADORES.map((d) => <label key={d.k} className="toma3d-fila taller3d-desl" title={d.ayuda}>{d.nombre}
      <input type="range" aria-label={d.nombre} data-prop={d.k} min={PROP_RANGOS[d.k][0]} max={PROP_RANGOS[d.k][1]} step={0.02} value={t.prop[d.k]}
        onPointerUp={() => e?.confirmarProporciones()} onKeyUp={() => e?.confirmarProporciones()} onBlur={() => e?.confirmarProporciones()}
        onChange={(ev) => e?.verProporciones({ [d.k]: Number(ev.target.value) })}/>
      <output>{fmt(t.prop[d.k])}</output></label>)}
    <label className="toma3d-fila" title="El alto real en metros: la escala del personaje al colocarlo en un fondo">Alto (m)
      <input type="number" aria-label="Alto en metros" min={0.2} max={9} step={0.05} value={t.alto ? Math.round(t.alto * 100) / 100 : ''}
        onChange={(ev) => { const v = Number(ev.target.value); if (v > 0 && t.alto > 0) e?.setProporciones({ escala: t.prop.escala * v / t.alto }); }}/></label>
    <label className="toma3d-fila">Color<input type="color" aria-label="Color del personaje" value={t.color} onChange={(ev) => e?.setColorPersonaje(ev.target.value)}/></label>

    <h3>Al 2D</h3>
    <div className="taller3d-vistas" role="group" aria-label="Vistas para el 2D">
      {VISTAS.map(([g, n]) => <label key={g}><input type="checkbox" data-hoja={g} checked={vistasHoja.includes(g)}
        onChange={(ev) => setVistasHoja(ev.target.checked ? [...vistasHoja, g] : vistasHoja.filter((x) => x !== g))}/>{n}</label>)}
    </div>
    <label className="taller3d-ver"><span><input type="checkbox" checked={conCuerpo} onChange={(ev) => setConCuerpo(ev.target.checked)}/> Con el cuerpo</span></label>
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
