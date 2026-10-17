import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { CATEGORIAS, cargarKitsPropios, guardarKitsPropios, kitAArchivo, kitDeArchivo, kitsDeFabrica,
  type Categoria, type EstiloKit, type Kit, type Pieza } from '../engine/biblioteca3d';

/* Panel «Biblioteca» del estudio: los kits de piezas (estilos) y sus piezas.
   Elegir una pieza deja lista la herramienta Piezas (N): clic coloca, arrastrar
   siembra. Los kits de fábrica no se cambian: se DUPLICAN y la copia es tuya.
   La lógica de datos vive en engine/biblioteca3d.ts; la de colocar, en el motor. */

const enLOW = () => window.parent !== window;
const CLAVE_ACTIVO = 'low3d:kit-activo';

export function BibliotecaPanel3D({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const fabrica = useMemo(() => kitsDeFabrica(), []);
  const [propios, setPropios] = useState<Kit[]>(() => cargarKitsPropios());
  const kits = [...fabrica, ...propios];
  const [kitId, setKitId] = useState<string>(() => { try { return window.localStorage.getItem(CLAVE_ACTIVO) || 'fabrica-plano'; } catch { return 'fabrica-plano'; } });
  const kit = kits.find((k) => k.id === kitId) || fabrica[0];
  const [cat, setCat] = useState<Categoria | 'todas'>('todas');
  const [activa, setActiva] = useState<string | null>(() => engine.current?.getPiezaActiva()?.id ?? null);
  const [aviso, setAviso] = useState('');
  const [nueva, setNueva] = useState<{ nombre: string; categoria: Categoria } | null>(null);
  const [borrar, setBorrar] = useState(false);
  const [sep, setSep] = useState(() => engine.current?.getSeparacionSiembra() ?? 1.2);
  const minis = useRef(new Map<string, string>());
  const [, setVersion] = useState(0);

  const persistir = (lista: Kit[]) => {
    setPropios(lista);
    if (!guardarKitsPropios(lista)) setAviso('No entró en el almacenamiento del estudio: exportá el kit (.lowkit) para no perderlo');
  };
  const cambiarKit = (id: string) => {
    setKitId(id);
    try { window.localStorage.setItem(CLAVE_ACTIVO, id); } catch { /* sin almacenamiento */ }
    const k = kits.find((x) => x.id === id);
    if (k) engine.current?.setEstiloCalles(k.estilo);
    setActiva(null); engine.current?.setPiezaActiva(null); setBorrar(false);
  };
  // al abrir el panel, el estilo de las calles es el del kit en uso
  useEffect(() => { engine.current?.setEstiloCalles(kit.estilo); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // miniaturas de a poco (cada una es un render): primero lo que se ve
  const piezas = kit.piezas.filter((p) => cat === 'todas' || p.categoria === cat);
  useEffect(() => {
    let vivo = true;
    const faltan = piezas.filter((p) => !minis.current.has(kit.id + '/' + p.id));
    const una = () => {
      if (!vivo || !faltan.length) return;
      const p = faltan.shift()!;
      try { minis.current.set(kit.id + '/' + p.id, engine.current?.miniaturaPieza(p) || ''); } catch { minis.current.set(kit.id + '/' + p.id, ''); }
      setVersion((v) => v + 1);
      window.setTimeout(una, 0);
    };
    una();
    return () => { vivo = false; };
  }, [kit.id, cat, kit.piezas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // la respuesta de LOW al guardar/abrir un .lowkit
  useEffect(() => {
    const oir = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; ok?: boolean; error?: string; content?: string; path?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:kit-guardado') setAviso(m.error ? 'No se pudo exportar: ' + m.error : m.ok ? 'Kit exportado' + (m.path ? ': ' + m.path : '') : '');
      else if (m.type === 'low:kit-abierto') { if (m.error) setAviso('No se pudo abrir: ' + m.error); else if (m.content) importarTexto(m.content); }
    };
    window.addEventListener('message', oir);
    return () => window.removeEventListener('message', oir);
  });

  const elegir = (p: Pieza) => {
    setActiva(p.id);
    engine.current?.setPiezaActiva(p);
    lowStore.setCurrentTool('pieza');
    setAviso(p.categoria === 'arbol' || p.categoria === 'vegetacion' || p.categoria === 'roca'
      ? `${p.nombre}: clic para colocar, arrastrá para sembrar varias · Shift: sin variar`
      : `${p.nombre}: clic sobre el piso o una caja para colocar`);
  };
  /** Un kit propio para guardar cosas: el elegido si ya es tuyo; si es de fábrica, una copia. */
  const kitPropio = (): Kit => {
    if (!kit.fabrica) return kit;
    const copia: Kit = { ...JSON.parse(JSON.stringify(kit)), id: 'kit-' + Date.now().toString(36), nombre: kit.nombre + ' (mío)', fabrica: undefined };
    persistir([...propios, copia]);
    cambiarKit(copia.id);
    return copia;
  };
  const actualizar = (k: Kit) => persistir(propios.map((x) => (x.id === k.id ? k : x)));
  const duplicar = () => { const c = kitPropio(); if (c === kit) { const d = { ...JSON.parse(JSON.stringify(kit)), id: 'kit-' + Date.now().toString(36), nombre: kit.nombre + ' (copia)' }; persistir([...propios, d]); cambiarKit(d.id); } setAviso('Copia lista: este kit es tuyo, cambiale piezas y colores'); };
  const vacio = () => { const k: Kit = { id: 'kit-' + Date.now().toString(36), nombre: 'Mi kit', descripcion: '', estilo: { ...kit.estilo }, piezas: [] }; persistir([...propios, k]); cambiarKit(k.id); setAviso('Kit vacío: elegí objetos en la escena y «Guardar lo elegido como pieza»'); };
  const guardarPieza = () => {
    const e = engine.current; if (!e || !nueva) return;
    const p = e.piezaDesdeSeleccion(nueva.nombre.trim() || 'Pieza', nueva.categoria);
    if (!p) { setAviso('Elegí primero lo que va a ser la pieza (Mover, V) y después guardala'); return; }
    const k = kitPropio();
    const destino = propios.find((x) => x.id === k.id) || k;
    const conPieza = { ...destino, piezas: [...destino.piezas, p] };
    persistir([...propios.filter((x) => x.id !== k.id), conPieza]);
    setNueva(null);
    setAviso(`«${p.nombre}» guardada en «${conPieza.nombre}» (${p.tam.map((v) => v.toFixed(1)).join(' × ')} m)`);
  };
  const quitarPieza = (p: Pieza) => { if (kit.fabrica) return; actualizar({ ...kit, piezas: kit.piezas.filter((x) => x.id !== p.id) }); if (activa === p.id) { setActiva(null); engine.current?.setPiezaActiva(null); } };
  const variar = (p: Pieza, v: Partial<Pieza['variacion']>) => {
    const np = { ...p, variacion: { ...p.variacion, ...v } };
    if (!kit.fabrica) actualizar({ ...kit, piezas: kit.piezas.map((x) => (x.id === p.id ? np : x)) });
    else Object.assign(p.variacion, v);           // en un kit de fábrica, sólo por esta sesión
    if (activa === p.id) engine.current?.setPiezaActiva(np);
    setVersion((x) => x + 1);
  };
  const colores = (c: Partial<EstiloKit>) => { if (kit.fabrica) return; const k = { ...kit, estilo: { ...kit.estilo, ...c } }; actualizar(k); engine.current?.setEstiloCalles(k.estilo); };
  const borrarKit = () => {
    if (kit.fabrica) return;
    if (!borrar) { setBorrar(true); window.setTimeout(() => setBorrar(false), 4000); return; }
    persistir(propios.filter((x) => x.id !== kit.id)); cambiarKit('fabrica-plano');
  };
  const exportar = () => {
    const texto = kitAArchivo(kit), nombre = kit.nombre.replace(/[^\w\-. ]+/g, '_') + '.lowkit';
    if (enLOW()) { window.parent.postMessage({ type: 'low:guardar-kit', name: nombre, json: texto }, '*'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' })); a.download = nombre; a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const importarTexto = (texto: string) => {
    const k = kitDeArchivo(texto);
    if (!k) { setAviso('Ese archivo no es un kit de LOW (.lowkit)'); return; }
    persistir([...propios, k]); cambiarKit(k.id); setAviso(`Kit «${k.nombre}» importado: ${k.piezas.length} piezas`);
  };
  const importar = () => {
    if (enLOW()) { window.parent.postMessage({ type: 'low:abrir-kit' }, '*'); return; }
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.lowkit,application/json';
    i.onchange = () => { const f = i.files?.[0]; if (f) f.text().then(importarTexto); };
    i.click();
  };

  const p = kit.piezas.find((x) => x.id === activa) || null;
  return <div className="persp3d biblio3d">
    <label className="toma3d-fila">Kit<select aria-label="Kit de piezas" value={kit.id} onChange={(ev) => cambiarKit(ev.target.value)}>
      <optgroup label="De fábrica">{fabrica.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</optgroup>
      {propios.length > 0 && <optgroup label="Mis kits">{propios.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</optgroup>}
    </select></label>
    {kit.fabrica ? <p className="persp3d-nota">{kit.descripcion} · De fábrica: duplicalo para cambiarlo.</p>
      : <label className="toma3d-fila">Nombre<input aria-label="Nombre del kit" value={kit.nombre} maxLength={60} onChange={(ev) => actualizar({ ...kit, nombre: ev.target.value })}/></label>}
    <div className="biblio3d-cats" role="tablist" aria-label="Categorías">
      {[{ id: 'todas' as const, nombre: 'Todas' }, ...CATEGORIAS.filter((c) => kit.piezas.some((x) => x.categoria === c.id))].map((c) =>
        <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}>{c.nombre}</button>)}
    </div>
    <div className="biblio3d-grilla" aria-label="Piezas del kit">
      {piezas.length ? piezas.map((x) => {
        const m = minis.current.get(kit.id + '/' + x.id);
        return <button key={x.id} data-pieza={x.id} className={activa === x.id ? 'on' : ''} aria-pressed={activa === x.id} title={`${x.nombre} · ${x.tam.map((v) => v.toFixed(1)).join(' × ')} m`} onClick={() => elegir(x)}>
          {m ? <img src={m} alt=""/> : <span className="biblio3d-cargando"/>}<span>{x.nombre}</span></button>;
      }) : <p className="persp3d-nota">{kit.piezas.length ? 'Nada en esta categoría' : 'Este kit está vacío: armá algo en la escena, elegilo y guardalo como pieza'}</p>}
    </div>
    {p && <div className="persp3d-repetir biblio3d-variar">
      <label>Tamaño mín.<input type="number" aria-label="Tamaño mínimo" step={0.05} min={0.1} max={10} value={p.variacion.escalaMin} onChange={(ev) => variar(p, { escalaMin: Number(ev.target.value) || 1 })}/></label>
      <label>Tamaño máx.<input type="number" aria-label="Tamaño máximo" step={0.05} min={0.1} max={10} value={p.variacion.escalaMax} onChange={(ev) => variar(p, { escalaMax: Number(ev.target.value) || 1 })}/></label>
      <label>Giro<select aria-label="Giro de cada copia" value={p.variacion.giro} onChange={(ev) => variar(p, { giro: ev.target.value as Pieza['variacion']['giro'] })}>
        <option value="libre">Al azar</option><option value="recto">Derecho</option><option value="no">Nunca</option></select></label>
      <label>Separación<input type="number" aria-label="Separación al sembrar" step={0.1} min={0.3} max={6} value={sep} onChange={(ev) => { const v = Number(ev.target.value) || 1.2; setSep(v); engine.current?.setSeparacionSiembra(v); }}/></label>
      {!kit.fabrica && <button className="persp3d-boton" onClick={() => quitarPieza(p)}>Quitar del kit</button>}
    </div>}
    <h3>Piezas propias</h3>
    {nueva ? <div className="persp3d-repetir">
      <label>Nombre<input aria-label="Nombre de la pieza" autoFocus value={nueva.nombre} maxLength={60} onChange={(ev) => setNueva({ ...nueva, nombre: ev.target.value })}/></label>
      <label>Categoría<select aria-label="Categoría de la pieza" value={nueva.categoria} onChange={(ev) => setNueva({ ...nueva, categoria: ev.target.value as Categoria })}>
        {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      <button className="persp3d-boton persp3d-repetir-ya" onClick={guardarPieza}>Guardar</button>
      <button className="persp3d-boton" onClick={() => setNueva(null)}>Cancelar</button>
    </div> : <button className="persp3d-boton biblio3d-guardar" onClick={() => setNueva({ nombre: '', categoria: 'casa' })} title="Lo elegido con Mover (V) pasa a ser una pieza del kit: después se coloca con un clic">Guardar lo elegido como pieza</button>}
    {!kit.fabrica && <><h3>Colores de las calles</h3>
      <div className="biblio3d-colores">
        {(['calzada', 'vereda', 'pintura', 'tinta'] as const).map((c) => <label key={c}><input type="color" aria-label={'Color: ' + c} value={kit.estilo[c]} onChange={(ev) => colores({ [c]: ev.target.value })}/>{c[0].toUpperCase() + c.slice(1)}</label>)}
      </div></>}
    <h3>Kits</h3>
    <div className="biblio3d-acciones">
      <button className="persp3d-boton" onClick={duplicar}>Duplicar kit</button>
      <button className="persp3d-boton" onClick={vacio}>Kit vacío</button>
      <button className="persp3d-boton" onClick={exportar}>Exportar…</button>
      <button className="persp3d-boton" onClick={importar}>Importar…</button>
      {!kit.fabrica && <button className="persp3d-boton biblio3d-borrar" onClick={borrarKit}>{borrar ? '¿Seguro? Borrar' : 'Borrar kit'}</button>}
    </div>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;
}
