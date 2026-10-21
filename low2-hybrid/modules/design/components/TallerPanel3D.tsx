import React, { useEffect, useState } from 'react';
import { lowStore, useLowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { CUERPOS, PROP_RANGOS, PARTES_GROSOR, cargarPoses, cargarAnimaciones, type BaseCuerpo, type ModoTaller, type PincelEscultura, type Proporciones } from '../engine/personaje3d';
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
  ['posar', 'Posar', 'Como un armazón de stop motion: arrastrar una parte la gira de a poco (Shift: más fino · Alt: sobre su largo · flechas: de a 2°). Anillos de manos y pies: el brazo o la pierna entera; rombos: los hombros; cuadrado: la cadera con los pies quietos'],
  ['animar', 'Animar', 'Animaciones listas (caminar, correr, saltar…) y poses clave por cuadro: el cuerpo pasa de una a otra solo. Se agarra el cuerpo como en Posar y cada pose queda como clave'],
  ['esculpir', 'Esculpir', 'Modelá la piel como en Blender o ZBrush · Shift: suavizar · Ctrl: invertir · F: tamaño · Shift+F: fuerza · [ ]: tamaño · la presión de la lapicera dosifica'],
];
/** [pincel, nombre, tecla (la de Blender), qué hace] */
const PINCELES: [PincelEscultura, string, string, string][] = [
  ['dibujar', 'Dibujar', 'X', 'Levanta la piel por el plano del pincel (Ctrl: hunde) · el Draw de Blender, el Standard de ZBrush'],
  ['arcilla', 'Arcilla', 'C', 'Tiras planas, como poner arcilla con la espátula: construye volumen por capas (Ctrl: saca) · el Clay Strips'],
  ['capa', 'Capa', 'L', 'Sube la piel a una altura pareja: pasar dos veces no acumula (placas, parches, ropa ceñida) · el Layer'],
  ['inflar', 'Inflar', 'I', 'Empuja la piel hacia afuera (Ctrl: desinfla): músculos, panza, nariz'],
  ['surco', 'Surco', '⇧C', 'Hunde una línea fina: arrugas, pliegues, párpados, labios (Ctrl: cresta) · el DamStandard'],
  ['pellizcar', 'Pellizcar', 'P', 'Junta la piel hacia el centro: afina bordes y marca aristas'],
  ['suavizar', 'Suavizar', 'S', 'Empareja la piel (con cualquier pincel: Shift)'],
  ['aplanar', 'Aplanar', '⇧T', 'Lleva la piel a un plano: caras, cortes, planos duros'],
  ['raspar', 'Raspar', 'R', 'Baja lo que sobresale del plano (Ctrl: rellena lo hundido) · el Scrape / Fill'],
  ['tirar', 'Mover', 'G', 'Agarra un pedazo de piel y lo lleva con el cursor · el Grab / Move'],
  ['gancho', 'Gancho', 'K', 'Estira la piel siguiendo el cursor: cuernos, orejas en punta, mechones · el Snake Hook'],
  ['empujar', 'Empujar', 'N', 'Corre la piel por la superficie hacia donde va el trazo · el Nudge'],
  ['mascara', 'Máscara', 'M', 'Protege lo que pintás de todos los pinceles; también marca dónde va una pieza (Ctrl: borra · Shift: suaviza el borde)'],
];
const DEFINICIONES: [number, string][] = [[0, 'Normal'], [1, 'Alta (×4)'], [2, 'Muy alta (×16)']];
const VELOCIDADES: [number, string][] = [[0.5, 'Lenta (½)'], [1, 'Normal'], [1.5, 'Rápida (1½)'], [2, 'Doble']];
const DESLIZADORES: { k: keyof Proporciones; nombre: string; ayuda: string }[] = [
  { k: 'cabeza', nombre: 'Cabeza', ayuda: 'El tamaño de la cabeza: más grande, más caricatura' },
  { k: 'cuello', nombre: 'Cuello', ayuda: 'El largo del cuello' },
  { k: 'torso', nombre: 'Torso', ayuda: 'El largo del torso' },
  { k: 'hombros', nombre: 'Hombros', ayuda: 'El ancho de hombros' },
  { k: 'caderas', nombre: 'Caderas', ayuda: 'El ancho de caderas' },
  { k: 'brazos', nombre: 'Brazos', ayuda: 'El largo de los brazos' },
  { k: 'piernas', nombre: 'Piernas', ayuda: 'El largo de las piernas' },
  { k: 'manos', nombre: 'Manos (tamaño)', ayuda: 'El tamaño de las manos, con los dedos' },
  { k: 'pies', nombre: 'Pies (tamaño)', ayuda: 'El tamaño de los pies' },
];
const DEDOS_PANEL: [('cerrar' | 'indice' | 'pulgar'), string][] = [['cerrar', 'Cerrar los dedos'], ['indice', 'Índice'], ['pulgar', 'Pulgar']];
const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
/** Los diales de la cara: [clave, nombre, mín, máx] */
const DIALES_CARA: [string, string, number, number][] = [
  ['ojos', 'Párpados (abiertos ↔ cerrados)', -0.4, 1], ['miraX', 'Mirada (izquierda ↔ derecha)', -1, 1], ['miraY', 'Mirada (abajo ↔ arriba)', -1, 1],
  ['boca', 'Boca (cerrada ↔ abierta)', 0, 1], ['sonrisa', 'Comisuras (triste ↔ sonrisa)', -1, 1], ['ancho', 'Ancho (fruncida ↔ estirada)', -1, 1],
  ['cejas', 'Cejas (abajo ↔ arriba)', -1, 1], ['fruncir', 'Fruncir el ceño', 0, 1],
];

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
  const listas = engine.current?.expresionesTaller() ?? { expresiones: [], visemas: [], contexturas: [] };
  const [vistasHoja, setVistasHoja] = useState<number[]>([0, 45, 90, 135, 180]);
  const [conCuerpo, setConCuerpo] = useState(true);
  const [marco, setMarco] = useState({ w: 1920, h: 1080, fps: 24, cuadros: 24 });
  const [animaciones, setAnimaciones] = useState(() => engine.current?.animacionesDelTaller() ?? []);
  const [anim, setAnim] = useState('Walk_Loop');
  const [vel, setVel] = useState(1);
  const [calidad, setCalidad] = useState(0.5);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [parteMascara, setParteMascara] = useState('torso');
  const [intensidadFiltro, setIntensidadFiltro] = useState(0.5);
  const [nombrePieza, setNombrePieza] = useState('');
  const mirror = useLowStore().mirrorMode;

  useEffect(() => {
    const oir = () => { const e = engine.current; const t = e?.enTaller() ?? null; setTaller(t); if (t) setVista(t.vista); const ed = e?.enEdicion(); if (ed) setNombre(ed.nombre); };
    const alMensaje = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; width?: number; height?: number; fps?: number; cuadros?: number; ok?: boolean; error?: string; aviso?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:encuadre' && m.width && m.height) setMarco({ w: m.width, h: m.height, fps: m.fps || 24, cuadros: m.cuadros || 24 });
      else if (m.type === 'low:hoja-recibida') { setOcupado(false); setAviso(m.error ? 'No se pudo mandar: ' + m.error : (m.aviso || 'Listo: está en el 2D')); }
    };
    oir();
    cargarPoses().then(() => setPoses(engine.current?.posesDelTaller() ?? []));
    cargarAnimaciones().then(() => setAnimaciones(engine.current?.animacionesDelTaller() ?? []));
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
  const mandarActuacion = async () => {
    if (!e || ocupado) return;
    if (!enLOW()) { setAviso('Abrí el estudio desde LOW (botón 3D) para mandar al 2D'); return; }
    setOcupado(true);
    const W = Math.round(marco.w * calidad), H = Math.round(marco.h * calidad);
    const cuadros = await e.actuacionRender(W, H, (h, n) => setAviso(`Preparando la actuación: cuadro ${h} de ${n}…`));
    if (!cuadros.length) { setOcupado(false); setAviso('No hay nada para mandar'); return; }
    setAviso('Mandando la actuación al 2D…');
    window.parent.postMessage({ type: 'low:send-hoja-modelo', modo: 'actuacion', nombre: nombre.trim() || 'Personaje', ancho: W, alto: H,
      vistas: cuadros.map((c) => ({ grados: 0, nombre: 'F' + String(c.cuadro).padStart(3, '0'), png: c.png })) }, '*');
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
      <label className="taller3d-ver" title="Al levantar el brazo por encima del hombro, la clavícula sube con él (como un hombro de verdad)"><span><input type="checkbox" checked={t.hombrosAuto} onChange={(ev) => e?.setHombrosAuto(ev.target.checked)}/> Hombros automáticos</span></label>
      {t.diales.length > 0 && <>
        <h3>Ajuste fino · {t.nombreControl}</h3>
        {t.diales.map((d) => <label key={d.eje} className="toma3d-fila taller3d-desl">{d.nombre}
          <input type="range" aria-label={'Ajuste fino: ' + d.nombre} data-dial={d.eje} min={d.min} max={d.max} step={0.5} value={d.valor}
            onChange={(ev) => e?.verDialTaller(d.eje, Number(ev.target.value))}
            onPointerUp={() => e?.confirmarVivo()} onKeyUp={() => e?.confirmarVivo()} onBlur={() => e?.confirmarVivo()}/>
          <output>{fmt(d.valor, 1)}°</output></label>)}
      </>}

      <h3>Manos</h3>
      {(['l', 'r'] as const).map((lado) => <div key={lado} className="taller3d-mano">
        <p className="persp3d-nota">{lado === 'l' ? 'Mano izquierda' : 'Mano derecha'}</p>
        <div className="taller3d-claves" aria-label={lado === 'l' ? 'Mano izquierda' : 'Mano derecha'}>
          {(e?.manosDeFabrica() ?? []).map((x) => <button key={x.id} data-mano={lado + ':' + x.id} onClick={() => e?.manoTaller(lado, x.id)}>{x.nombre}</button>)}
        </div>
        {DEDOS_PANEL.map(([k, n]) => <label key={k} className="toma3d-fila taller3d-desl">{n}
          <input type="range" aria-label={(lado === 'l' ? 'Mano izquierda: ' : 'Mano derecha: ') + n} data-dedo={lado + ':' + k} min={0} max={1} step={0.02} value={t.manos[lado][k]}
            onChange={(ev) => e?.verManoTaller(lado, { [k]: Number(ev.target.value) })}
            onPointerUp={() => e?.confirmarVivo()} onKeyUp={() => e?.confirmarVivo()} onBlur={() => e?.confirmarVivo()}/>
          <output>{fmt(t.manos[lado][k])}</output></label>)}
      </div>)}

      {t.tieneCara && <>
        <h3>Cara</h3>
        <div className="taller3d-claves" aria-label="Expresiones">
          {listas.expresiones.map((x) => <button key={x.id} data-expresion={x.id} onClick={() => e?.expresionTaller(x.id)}>{x.nombre}</button>)}
        </div>
        <p className="persp3d-nota">Para hablar (visemas): una clave por sílaba</p>
        <div className="taller3d-claves" aria-label="Visemas">
          {listas.visemas.map((x) => <button key={x.id} data-visema={x.id} onClick={() => e?.expresionTaller(x.id)}>{x.nombre}</button>)}
        </div>
        {DIALES_CARA.map(([k, n, mn, mx]) => {
          const v = k === 'ojos' ? (t.cara.ojoI + t.cara.ojoD) / 2 : (t.cara as unknown as Record<string, number>)[k];
          return <label key={k} className="toma3d-fila taller3d-desl">{n}
            <input type="range" aria-label={'Cara: ' + n} data-cara={k} min={mn} max={mx} step={0.02} value={v}
              onChange={(ev) => { const x = Number(ev.target.value); e?.verCaraTaller(k === 'ojos' ? { ojoI: x, ojoD: x } : { [k]: x }); }}
              onPointerUp={() => e?.confirmarVivo()} onKeyUp={() => e?.confirmarVivo()} onBlur={() => e?.confirmarVivo()}/>
            <output>{fmt(v)}</output></label>;
        })}
      </>}
    </>}

    {t.modo === 'animar' && <>
      <p className="persp3d-nota taller3d-articulacion" aria-live="polite">{t.control ? <>Elegido: <b>{t.nombreControl}</b></> : 'Agarrá el cuerpo como en Posar: cada pose queda como clave en el cuadro de ahora'}</p>
      <h3>Animaciones listas</h3>
      <p className="persp3d-nota">Caminar, correr, saltar, sentarse, bailar… (43, de Quaternius). Quedan como claves, una por cuadro, para retocarlas posando.</p>
      <label className="toma3d-fila">Animación<select aria-label="Animación de la biblioteca" value={anim} onChange={(ev) => setAnim(ev.target.value)}>
        {animaciones.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({fmt(a.segundos, 1)} s)</option>)}</select></label>
      <label className="toma3d-fila">Velocidad<select aria-label="Velocidad de la animación" value={vel} onChange={(ev) => setVel(Number(ev.target.value))}>
        {VELOCIDADES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
      <div className="biblio3d-acciones">
        <button className="persp3d-boton taller3d-animacion" disabled={!animaciones.length} title="Claves en cada cuadro desde el de ahora; después se retocan"
          onClick={async () => { const n = await e?.ponerAnimacionTaller(anim, marco.fps, vel); if (n) { setAviso(`Animación puesta: ${n} cuadros desde el ${t.cuadro} · retocá las poses y quedan como claves`); e?.reproducirTaller(true, marco.fps); } }}>Poner desde el cuadro {t.cuadro} y reproducir</button>
      </div>

      <h3>Actuación</h3>
      <p className="persp3d-nota">Poses clave por cuadro: el cuerpo pasa de una a otra solo. Con la primera clave puesta, cada cambio de pose deja clave en el cuadro de ahora.</p>
      <label className="toma3d-fila">Cuadros<input type="number" aria-label="Cuadros de la actuación" min={1} max={10000} value={t.cuadros}
        onChange={(ev) => { const v = Number(ev.target.value); if (v >= 1) e?.setCuadrosActuacion(v); }}/>
        <button className="persp3d-boton" title="Los cuadros de la escena del 2D" onClick={() => e?.setCuadrosActuacion(marco.cuadros)}>Como la escena ({marco.cuadros})</button></label>
      <label className="toma3d-fila taller3d-desl">Cuadro
        <input type="range" aria-label="Cuadro de la actuación" min={1} max={t.cuadros} step={1} value={t.cuadro} onChange={(ev) => e?.setCuadroTaller(Number(ev.target.value))}/>
        <output>{t.cuadro}</output></label>
      <div className="taller3d-claves" aria-label="Claves de la actuación">
        {t.claves.length ? t.claves.map((f) => <button key={f} data-clave={f} className={f === t.cuadro ? 'on' : ''} onClick={() => e?.setCuadroTaller(f)} title={'Ir al cuadro ' + f}>{f}</button>)
          : <span className="persp3d-nota">Sin claves todavía</span>}
      </div>
      <div className="biblio3d-acciones">
        <button className="persp3d-boton taller3d-clave" onClick={() => e?.claveTaller()} title="La pose de ahora como clave en este cuadro">Clave aquí</button>
        <button className="persp3d-boton taller3d-sin-clave" disabled={!t.claves.includes(t.cuadro)} onClick={() => e?.quitarClaveTaller()}>Borrar clave</button>
        <button className="persp3d-boton" onClick={() => e?.setCuadroTaller(Math.max(1, t.cuadro - 1))} title="Cuadro anterior">◀ Anterior</button>
        <button className="persp3d-boton" onClick={() => e?.setCuadroTaller(Math.min(t.cuadros, t.cuadro + 1))} title="Cuadro siguiente">Siguiente ▶</button>
        <button className="persp3d-boton taller3d-play" disabled={!t.claves.length} onClick={() => e?.reproducirTaller(!t.reproduciendo, marco.fps)}>{t.reproduciendo ? '⏸ Parar' : '▶ Reproducir'}</button>
      </div>
      <label className="toma3d-fila">Calidad<select aria-label="Calidad de la actuación" value={calidad} onChange={(ev) => setCalidad(Number(ev.target.value))}>
        <option value={0.5}>Media (la mitad: más liviana)</option><option value={1}>Completa</option></select></label>
      <div className="biblio3d-acciones">
        <button className="persp3d-boton persp3d-repetir-ya taller3d-actuacion" disabled={ocupado} onClick={mandarActuacion}
          title="Un cuadro de la actuación por cuadro de la escena, desde la cámara de ahora, en una capa de referencia para rotoscopiar">Mandar la actuación al 2D</button>
      </div>
    </>}

    {t.modo === 'esculpir' && (() => {
      const P = t.pincel, ayudaPincel = PINCELES.find((x) => x[0] === P.tipo)?.[3] ?? '', modelado = e?.listasModelado();
      const desl = (aria: string, nombre: string, titulo: string, min: number, max: number, paso: number, valor: number, poner: (v: number) => void, salida: string) =>
        <label className="toma3d-fila taller3d-desl" title={titulo}>{nombre}
          <input type="range" aria-label={aria} min={min} max={max} step={paso} value={valor} onChange={(ev) => poner(Number(ev.target.value))}/>
          <output>{salida}</output></label>;
      return <>
      <div className="taller3d-pinceles taller3d-pinceles-grilla" role="radiogroup" aria-label="Pincel de escultura">
        {PINCELES.map(([p, n, tecla, ayuda]) => <button key={p} role="radio" aria-checked={P.tipo === p} data-pincel={p} title={ayuda + ' · tecla ' + tecla}
          className={P.tipo === p ? 'on' : ''} onClick={() => e?.setPincelEscultura({ tipo: p })}>{n}<kbd>{tecla}</kbd></button>)}
      </div>
      <p className="persp3d-nota taller3d-ayuda-pincel">{ayudaPincel}</p>
      {desl('Tamaño del pincel', 'Tamaño', 'El tamaño del pincel (en centímetros) · F: con el mouse · [ y ]', 0.2, 40, 0.1, Math.round(P.radio * 1000) / 10, (v) => e?.setPincelEscultura({ radio: v / 100 }), fmt(P.radio * 100, 1) + ' cm')}
      {desl('Fuerza del pincel', 'Fuerza', 'Cuánto cambia la piel en cada pasada · Shift+F: con el mouse', 0.05, 1, 0.05, P.fuerza, (v) => e?.setPincelEscultura({ fuerza: v }), Math.round(P.fuerza * 100) + ' %')}
      {desl('Dureza del pincel', 'Dureza', 'Suave: se desvanece desde el centro · Firme: parejo hasta el borde', 0, 0.9, 0.05, P.dureza, (v) => e?.setPincelEscultura({ dureza: v }), Math.round(P.dureza * 100) + ' %')}
      <label className="toma3d-fila" title="Cómo se apaga el pincel del centro al borde (las curvas de Blender)">Caída
        <select aria-label="Caída del pincel" value={P.caida} onChange={(ev) => e?.setPincelEscultura({ caida: ev.target.value as typeof P.caida })}>
          {(modelado?.caidas ?? []).map((c) => <option key={c.id} value={c.id} title={c.ayuda}>{c.nombre}</option>)}</select></label>
      {desl('Estabilizador del pincel', 'Estabilizador', 'La punta va detrás del cursor, atada con una cuerda: trazos firmes con el pulso tembloroso (el Lazy Mouse de ZBrush)', 0, 120, 2, P.estabilizador, (v) => e?.setPincelEscultura({ estabilizador: v }), P.estabilizador ? P.estabilizador + ' px' : 'no')}
      {desl('Espaciado del pincel', 'Espaciado', 'Cada cuánto toca el pincel a lo largo del trazo (más junto: más parejo)', 0.05, 0.6, 0.01, P.espaciado, (v) => e?.setPincelEscultura({ espaciado: v }), Math.round(P.espaciado * 100) + ' %')}
      <div className="taller3d-ver">
        <label><input type="checkbox" checked={P.simetria} onChange={(ev) => e?.setPincelEscultura({ simetria: ev.target.checked })}/> Simetría</label>
        <label title="El pincel no atraviesa lo fino (orejas, dedos, labios): toca sólo lo que mira a la cámara"><input type="checkbox" aria-label="Sólo caras de frente" checked={P.soloFrente} onChange={(ev) => e?.setPincelEscultura({ soloFrente: ev.target.checked })}/> Sólo caras de frente</label>
        <label title="Con la lapicera, apretar más agranda el pincel (además de darle fuerza)"><input type="checkbox" checked={P.presionTamano} onChange={(ev) => e?.setPincelEscultura({ presionTamano: ev.target.checked })}/> Presión = tamaño</label>
      </div>

      <h3>Máscara</h3>
      <p className="persp3d-nota">Lo enmascarado se ve oscuro y ningún pincel lo mueve. Pintala con <b>Máscara (M)</b> o elegí una parte del cuerpo.{t.mascara > 0 ? ` Enmascarado: ${Math.max(1, Math.round(t.mascara * 100))} %` : ''}</p>
      <label className="toma3d-fila">Parte<select aria-label="Parte para enmascarar" value={parteMascara} onChange={(ev) => setParteMascara(ev.target.value)}>
        {(modelado?.partes ?? []).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
      <div className="biblio3d-acciones taller3d-acciones-chicas">
        <button className="persp3d-boton" data-mascara-parte="poner" onClick={() => e?.mascaraParteTaller(parteMascara, 'poner')} title="Enmascara sólo esa parte">Sólo esa</button>
        <button className="persp3d-boton" data-mascara-parte="sumar" onClick={() => e?.mascaraParteTaller(parteMascara, 'sumar')} title="Suma esa parte a la máscara">Sumar</button>
        <button className="persp3d-boton" data-mascara-parte="quitar" onClick={() => e?.mascaraParteTaller(parteMascara, 'quitar')} title="Saca esa parte de la máscara">Quitar</button>
      </div>
      <div className="biblio3d-acciones taller3d-acciones-chicas">
        <button className="persp3d-boton" data-mascara="invertir" onClick={() => e?.mascaraTaller('invertir')} title="Lo protegido queda libre y al revés · Ctrl+I">Invertir</button>
        <button className="persp3d-boton" data-mascara="crecer" onClick={() => e?.mascaraTaller('crecer')} title="La máscara crece un anillo de puntos">Crecer</button>
        <button className="persp3d-boton" data-mascara="achicar" onClick={() => e?.mascaraTaller('achicar')} title="La máscara se achica un anillo de puntos">Achicar</button>
        <button className="persp3d-boton" data-mascara="suavizar" onClick={() => e?.mascaraTaller('suavizar')} title="El borde de la máscara, difuso">Suavizar</button>
        <button className="persp3d-boton" data-mascara="afilar" onClick={() => e?.mascaraTaller('afilar')} title="El borde de la máscara, nítido">Afilar</button>
        <button className="persp3d-boton" data-mascara="limpiar" disabled={!t.mascara} onClick={() => e?.mascaraTaller('limpiar')} title="Sin máscara · Alt+M">Borrar</button>
      </div>

      <h3>Piezas: ropa, pelo, accesorios</h3>
      <p className="persp3d-nota">Enmascará dónde va (una remera: el torso y los brazos; el pelo: la cabeza) y levantala con grosor, como el Extract de ZBrush. La pieza sigue al cuerpo cuando posa o engorda, y se dibuja encima.</p>
      {desl('Grosor de la pieza nueva', 'Grosor', 'Cuánto se despega de la piel', 0.5, 40, 0.5, Math.round(t.nuevaPieza.grosor * 2000) / 2, (v) => e?.setNuevaPieza({ grosor: v / 1000 }), fmt(t.nuevaPieza.grosor * 1000, 1) + ' mm')}
      {desl('Suavizado de la pieza nueva', 'Suavizado', 'Cero calca la piel; más, una tela lisa que no marca los músculos', 0, 1, 0.05, t.nuevaPieza.suave, (v) => e?.setNuevaPieza({ suave: v }), Math.round(t.nuevaPieza.suave * 100) + ' %')}
      <label className="toma3d-fila">Nombre<input type="text" aria-label="Nombre de la pieza nueva" placeholder="Remera, pelo, botas…" value={nombrePieza} onChange={(ev) => setNombrePieza(ev.target.value)}/>
        <input type="color" aria-label="Color de la pieza nueva" value={t.nuevaPieza.color} onChange={(ev) => e?.setNuevaPieza({ color: ev.target.value })}/></label>
      <div className="biblio3d-acciones">
        <button className="persp3d-boton persp3d-repetir-ya taller3d-extraer" disabled={!t.mascara} onClick={() => { if (e?.extraerPiezaTaller(nombrePieza)) setNombrePieza(''); }}
          title="Levanta una pieza de lo enmascarado (un paso de Ctrl+Z)">Levantar la pieza de la máscara</button>
      </div>
      {t.piezas.map((x) => <div key={x.id} className="taller3d-pieza" data-pieza={x.id}>
        <div className="toma3d-fila">
          <input type="checkbox" aria-label={'Ver ' + x.nombre} checked={x.visible !== false} onChange={(ev) => e?.piezaTaller(x.id, { visible: ev.target.checked })}/>
          <input type="text" aria-label="Nombre de la pieza" defaultValue={x.nombre} onBlur={(ev) => { if (ev.target.value.trim() && ev.target.value !== x.nombre) e?.piezaTaller(x.id, { nombre: ev.target.value }); }}/>
          <input type="color" aria-label={'Color de ' + x.nombre} value={x.color} onChange={(ev) => e?.piezaTaller(x.id, { color: ev.target.value })}/>
          <button className="persp3d-boton" aria-label={'Borrar ' + x.nombre} onClick={() => e?.borrarPiezaTaller(x.id)}>✕</button>
        </div>
        <label className="toma3d-fila taller3d-desl">Grosor
          <input type="range" aria-label={'Grosor de ' + x.nombre} data-pieza-grosor={x.id} min={0.5} max={40} step={0.5} value={Math.round(x.grosor * 2000) / 2}
            onChange={(ev) => e?.verPiezaTaller(x.id, { grosor: Number(ev.target.value) / 1000 })}
            onPointerUp={() => e?.confirmarVivo(false)} onKeyUp={() => e?.confirmarVivo(false)} onBlur={() => e?.confirmarVivo(false)}/>
          <output>{fmt(x.grosor * 1000, 1)} mm</output></label>
        <label className="toma3d-fila taller3d-desl">Suavizado
          <input type="range" aria-label={'Suavizado de ' + x.nombre} min={0} max={1} step={0.05} value={x.suave}
            onChange={(ev) => e?.verPiezaTaller(x.id, { suave: Number(ev.target.value) })}
            onPointerUp={() => e?.confirmarVivo(false)} onKeyUp={() => e?.confirmarVivo(false)} onBlur={() => e?.confirmarVivo(false)}/>
          <output>{Math.round(x.suave * 100)} %</output></label>
      </div>)}

      <h3>Capas de escultura</h3>
      <p className="persp3d-nota">Como en Nomad Sculpt: lo que esculpís va a la capa elegida, y su dial lo sube o lo baja (unas arrugas, una panza, una variante).</p>
      <div className="taller3d-capas" role="radiogroup" aria-label="Capas de escultura">
        <label className="taller3d-capa"><input type="radio" name="capa-esc" data-capa="" checked={!t.capaActiva} onChange={() => e?.activarCapaTaller(null)}/> <span>Principal</span></label>
        {t.capas.map((c) => <div key={c.id} className="taller3d-capa" data-capa-fila={c.id}>
          <input type="radio" name="capa-esc" aria-label={'Esculpir en ' + c.nombre} data-capa={c.id} checked={t.capaActiva === c.id} onChange={() => e?.activarCapaTaller(c.id)}/>
          <input type="text" aria-label="Nombre de la capa" defaultValue={c.nombre} onBlur={(ev) => { if (ev.target.value.trim() && ev.target.value !== c.nombre) e?.renombrarCapaTaller(c.id, ev.target.value); }}/>
          <input type="range" aria-label={'Intensidad de ' + c.nombre} data-capa-fuerza={c.id} min={-1} max={2} step={0.05} value={c.fuerza}
            onChange={(ev) => e?.verFuerzaCapa(c.id, Number(ev.target.value))}
            onPointerUp={() => e?.confirmarVivo(false)} onKeyUp={() => e?.confirmarVivo(false)} onBlur={() => e?.confirmarVivo(false)}/>
          <output>{fmt(c.fuerza)}</output>
          <button className="persp3d-boton" title="Pasa lo de la capa a la principal (como «aplicar» en Blender)" onClick={() => e?.quitarCapaTaller(c.id, true)}>Fijar</button>
          <button className="persp3d-boton" aria-label={'Borrar ' + c.nombre} onClick={() => e?.quitarCapaTaller(c.id)}>✕</button>
        </div>)}
      </div>
      <div className="biblio3d-acciones"><button className="persp3d-boton taller3d-nueva-capa" onClick={() => e?.nuevaCapaTaller()}>Nueva capa</button></div>

      <h3>Filtros (toda la piel)</h3>
      <p className="persp3d-nota">De una, sobre todo lo que no esté enmascarado (el Mesh Filter de Blender).</p>
      {desl('Intensidad del filtro', 'Intensidad', 'Cuánto hace cada pasada del filtro', 0.05, 1, 0.05, intensidadFiltro, setIntensidadFiltro, Math.round(intensidadFiltro * 100) + ' %')}
      <div className="biblio3d-acciones taller3d-acciones-chicas">
        {([['suavizar', 'Suavizar'], ['inflar', 'Inflar'], ['desinflar', 'Desinflar'], ['afilar', 'Afilar']] as const).map(([f, n]) =>
          <button key={f} className="persp3d-boton" data-filtro={f} onClick={() => e?.filtroTaller(f, intensidadFiltro)}>{n}</button>)}
      </div>

      <label className="toma3d-fila" title="Más malla: más detalle para esculpir (la escultura pasa de un nivel al otro)">Definición
        <select aria-label="Definición de la piel" value={t.definicion} onChange={(ev) => { setAviso('Subdividiendo la piel…'); const v = Number(ev.target.value); setTimeout(() => { e?.setDefinicionTaller(v); setAviso(''); }, 30); }}>
          {DEFINICIONES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
        <output>{Math.round(t.triangulos / 1000)} mil △</output></label>
      <div className="biblio3d-acciones"><button className="persp3d-boton taller3d-sin-escultura" onClick={() => e?.sinEscultura()} title="La piel vuelve a como vino (Ctrl+Z lo deshace)">Volver a la piel original</button></div>
      </>;
    })()}

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
    {t.aceptaContextura && <><p className="persp3d-nota">Contextura</p>
    <div className="taller3d-claves" aria-label="Contextura">
      {listas.contexturas.map((x) => <button key={x.id} data-contextura={x.id} onClick={() => e?.contexturaTaller(x.id)}>{x.nombre}</button>)}
    </div></>}
    {t.aceptaContextura && ([['peso', 'Peso (flaco ↔ gordo)', -1, 1.5], ['musculo', 'Músculo (blando ↔ marcado)', -1, 1]] as [string, string, number, number][]).map(([k, n, mn, mx]) =>
      <label key={k} className="toma3d-fila taller3d-desl">{n}
        <input type="range" aria-label={n} data-forma={k} min={mn} max={mx} step={0.05} value={(t.forma as unknown as Record<string, number>)[k]}
          onChange={(ev) => e?.verFormaTaller({ [k]: Number(ev.target.value) })}
          onPointerUp={() => e?.confirmarVivo(false)} onKeyUp={() => e?.confirmarVivo(false)} onBlur={() => e?.confirmarVivo(false)}/>
        <output>{fmt((t.forma as unknown as Record<string, number>)[k])}</output></label>)}
    <p className="persp3d-nota">Grosor de cada parte (el diámetro, sin cambiar el largo)</p>
    {PARTES_GROSOR.map(({ id, nombre: n }) => { const v = t.forma.grosor?.[id] ?? 1; return <label key={id} className="toma3d-fila taller3d-desl">{n}
      <input type="range" aria-label={'Grosor: ' + n} data-grosor={id} min={0.5} max={1.8} step={0.02} value={v}
        onChange={(ev) => e?.verFormaTaller({ grosor: { [id]: Number(ev.target.value) } })}
        onPointerUp={() => e?.confirmarVivo(false)} onKeyUp={() => e?.confirmarVivo(false)} onBlur={() => e?.confirmarVivo(false)}/>
      <output>{fmt(v)}</output></label>; })}
    <p className="persp3d-nota">Largo de cada parte</p>
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
