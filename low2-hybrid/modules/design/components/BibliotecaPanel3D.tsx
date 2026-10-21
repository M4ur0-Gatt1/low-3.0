import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { TallerPanel3D, destinoTaller } from './TallerPanel3D';
import { CATEGORIAS, cargarKitsPropios, guardarKitsPropios, kitAArchivo, kitDeArchivo, kitsDeFabrica,
  type Categoria, type EstiloKit, type Kit, type Pieza } from '../engine/biblioteca3d';

/* Panel «Biblioteca de escenografía». Mauro: «tengo que poder generar cada
   elemento 3D y guardarlo en su biblioteca». Cómo se llaman las cosas (como en
   teatro, cine y animación):
   - una ESCENOGRAFÍA es un juego de elementos con su estilo (en el código, Kit);
   - un ELEMENTO es cada cosa que la compone: decorados (casas, edificios),
     ambientación (faroles), utilería, vegetación, rocas (en el código, Pieza).
   Elegir un elemento deja lista la herramienta Elementos (N): clic coloca,
   arrastrar siembra. «Nuevo elemento» / «Editar» abren el EDITOR: la mesa
   vacía para dibujarlo con todas las herramientas; «Guardar» lo lleva a la
   escenografía y vuelve a tu escena como estaba. Las de fábrica no se cambian:
   lo que guardes va a tu copia («… (mía)»). */

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
  const [nueva, setNueva] = useState<{ nombre: string; categoria: Categoria; desde: 'mesa' | 'cero' } | null>(null);
  const [borrar, setBorrar] = useState(false);
  const [sep, setSep] = useState(() => engine.current?.getSeparacionSiembra() ?? 1.2);
  const [edicion, setEdicion] = useState(() => engine.current?.enEdicion() ?? null);
  const [edNombre, setEdNombre] = useState(edicion?.nombre ?? '');
  const [edCat, setEdCat] = useState<Categoria>(edicion?.categoria ?? 'casa');
  /** en qué escenografía y con qué id se guarda lo que se está editando */
  const destino = useRef<{ kitId: string; piezaId: string | null } | null>(null);
  const minis = useRef(new Map<string, string>());
  const [, setVersion] = useState(0);

  const persistir = (lista: Kit[]) => {
    setPropios(lista);
    if (!guardarKitsPropios(lista)) setAviso('No entró en el almacenamiento del estudio: exportá la escenografía (.lowkit) para no perderla');
  };
  const cambiarKit = (id: string) => {
    setKitId(id);
    try { window.localStorage.setItem(CLAVE_ACTIVO, id); } catch { /* sin almacenamiento */ }
    const k = kits.find((x) => x.id === id);
    if (k) engine.current?.setEstiloCalles(k.estilo);
    setActiva(null); engine.current?.setPiezaActiva(null); setBorrar(false);
  };
  // al abrir el panel, el estilo de las calles y del paisaje es el de la escenografía en uso
  useEffect(() => { engine.current?.setEstiloCalles(kit.estilo); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // el editor se prende y se apaga desde el motor
  useEffect(() => {
    const oir = () => { const ed = engine.current?.enEdicion() ?? null; setEdicion(ed); if (ed) { setEdNombre(ed.nombre); setEdCat(ed.categoria); } };
    window.addEventListener('low3d:edicion', oir);
    return () => window.removeEventListener('low3d:edicion', oir);
  }, [engine]);

  // un personaje no tiene miniatura hasta que llega su cuerpo: entonces se rehace
  const [cargas, setCargas] = useState(0);
  useEffect(() => {
    const oir = () => { for (const k of [...minis.current.keys()]) if (!minis.current.get(k)) minis.current.delete(k); setCargas((v) => v + 1); };
    window.addEventListener('low3d:personajes', oir);
    return () => window.removeEventListener('low3d:personajes', oir);
  }, []);

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
  }, [kit.id, cat, kit.piezas.length, edicion, cargas]); // eslint-disable-line react-hooks/exhaustive-deps

  // la respuesta de LOW al guardar/abrir un .lowkit
  useEffect(() => {
    const oir = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; ok?: boolean; error?: string; content?: string; path?: string } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:kit-guardado') setAviso(m.error ? 'No se pudo exportar: ' + m.error : m.ok ? 'Escenografía exportada' + (m.path ? ': ' + m.path : '') : '');
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
      ? `${p.nombre}: clic para colocar, arrastrá para sembrar varios · Shift: sin variar`
      : `${p.nombre}: clic sobre el piso, el terreno o una caja para colocarlo`);
  };
  /** Una escenografía TUYA para guardar: la elegida si ya es tuya; si es de fábrica, tu copia. */
  const kitPropio = (): Kit => {
    if (!kit.fabrica) return kit;
    const yaHay = propios.find((k) => k.nombre === kit.nombre + ' (mía)');
    if (yaHay) { cambiarKit(yaHay.id); return yaHay; }
    const copia: Kit = { ...JSON.parse(JSON.stringify(kit)), id: 'kit-' + Date.now().toString(36), nombre: kit.nombre + ' (mía)', fabrica: undefined };
    persistir([...propios, copia]);
    cambiarKit(copia.id);
    return copia;
  };
  const actualizar = (k: Kit) => persistir(propios.map((x) => (x.id === k.id ? k : x)));
  /** Guarda (o reemplaza) un elemento en una escenografía propia. */
  const guardarEn = (k: Kit, p: Pieza) => {
    const base = propios.find((x) => x.id === k.id) || k;
    const yaEsta = base.piezas.some((x) => x.id === p.id);
    const nuevo = { ...base, piezas: yaEsta ? base.piezas.map((x) => (x.id === p.id ? p : x)) : [...base.piezas, p] };
    persistir([...propios.filter((x) => x.id !== k.id), nuevo]);
    minis.current.delete(k.id + '/' + p.id);
    return nuevo;
  };
  const duplicar = () => {
    const d = { ...JSON.parse(JSON.stringify(kit)), id: 'kit-' + Date.now().toString(36), nombre: kit.nombre + (kit.fabrica ? ' (mía)' : ' (copia)'), fabrica: undefined };
    persistir([...propios, d]); cambiarKit(d.id); setAviso('Copia lista: esta escenografía es tuya, cambiale elementos y colores');
  };
  const vacio = () => { const k: Kit = { id: 'kit-' + Date.now().toString(36), nombre: 'Mi escenografía', descripcion: '', estilo: { ...kit.estilo }, piezas: [] }; persistir([...propios, k]); cambiarKit(k.id); setAviso('Escenografía vacía: «+ Nuevo elemento» para dibujar el primero'); };

  /* ── el editor de elementos ── */
  const editar = (p: Pieza | null, nombre: string, categoria: Categoria) => {
    const e = engine.current; if (!e) return;
    // un PERSONAJE (o un maniquí) se edita en el Taller de personaje
    if (p?.maniqui || categoria === 'personaje') {
      destinoTaller.kitId = kit.fabrica ? null : kit.id; destinoTaller.piezaId = kit.fabrica ? null : p?.id ?? null;
      if (!e.abrirTaller(p, nombre)) setAviso('Ya estás editando algo: guardalo o cancelalo primero');
      setNueva(null);
      return;
    }
    // lo de fábrica se guarda en TU copia; lo tuyo, en su lugar
    destino.current = { kitId: kit.fabrica ? '' : kit.id, piezaId: kit.fabrica ? null : p?.id ?? null };
    if (!e.editarElemento(p, nombre, categoria)) setAviso('Ya estás editando un elemento: guardalo o cancelalo primero');
    setNueva(null);
  };
  const guardarEdicion = () => {
    const e = engine.current; if (!e) return;
    const r = e.terminarEdicion(true, { nombre: edNombre.trim() || 'Elemento', categoria: edCat });
    if (!r.ok || !r.pieza) return;
    const d = destino.current;
    const k = d && d.kitId ? (propios.find((x) => x.id === d.kitId) || kitPropio()) : kitPropio();
    const p = { ...r.pieza, id: d?.piezaId || 'propia-' + Date.now().toString(36) };
    const nuevo = guardarEn(k, p);
    destino.current = null;
    setAviso(`«${p.nombre}» guardado en «${nuevo.nombre}» (${p.tam.map((v) => v.toFixed(1)).join(' × ')} m) · elegilo para colocarlo`);
  };
  const cancelarEdicion = () => { engine.current?.terminarEdicion(false); destino.current = null; };

  const guardarSeleccion = () => {
    const e = engine.current; if (!e || !nueva) return;
    const p = e.piezaDesdeSeleccion(nueva.nombre.trim() || 'Elemento', nueva.categoria);
    if (!p) { setAviso('Elegí primero lo que va a ser el elemento (Mover, V) y después guardalo'); return; }
    const nuevo = guardarEn(kitPropio(), p);
    setNueva(null);
    setAviso(`«${p.nombre}» guardado en «${nuevo.nombre}» (${p.tam.map((v) => v.toFixed(1)).join(' × ')} m)`);
  };
  const quitarPieza = (p: Pieza) => { if (kit.fabrica) return; actualizar({ ...kit, piezas: kit.piezas.filter((x) => x.id !== p.id) }); if (activa === p.id) { setActiva(null); engine.current?.setPiezaActiva(null); } };
  const variar = (p: Pieza, v: Partial<Pieza['variacion']>) => {
    const np = { ...p, variacion: { ...p.variacion, ...v } };
    if (!kit.fabrica) actualizar({ ...kit, piezas: kit.piezas.map((x) => (x.id === p.id ? np : x)) });
    else Object.assign(p.variacion, v);           // en una de fábrica, sólo por esta sesión
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
    if (!k) { setAviso('Ese archivo no es una escenografía de LOW (.lowkit)'); return; }
    persistir([...propios, k]); cambiarKit(k.id); setAviso(`Escenografía «${k.nombre}» importada: ${k.piezas.length} elementos`);
  };
  const importar = () => {
    if (enLOW()) { window.parent.postMessage({ type: 'low:abrir-kit' }, '*'); return; }
    const i = document.createElement('input'); i.type = 'file'; i.accept = '.lowkit,application/json';
    i.onchange = () => { const f = i.files?.[0]; if (f) f.text().then(importarTexto); };
    i.click();
  };

  const selCategoria = (valor: Categoria, cambiar: (c: Categoria) => void, etiqueta: string) =>
    <select aria-label={etiqueta} value={valor} onChange={(ev) => cambiar(ev.target.value as Categoria)}>
      {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>;

  /* ── EN EL TALLER DE PERSONAJE: su panel ── */
  if (edicion && engine.current?.enTaller()) return <TallerPanel3D engine={engine}/>;
  /* ── EDITANDO: sólo el editor ── */
  if (edicion) return <div className="persp3d biblio3d biblio3d-editor">
    <p className="biblio3d-editando">Editando un elemento</p>
    <label className="toma3d-fila">Nombre<input aria-label="Nombre del elemento" value={edNombre} maxLength={60} onChange={(ev) => setEdNombre(ev.target.value)}/></label>
    <label className="toma3d-fila">Categoría{selCategoria(edCat, setEdCat, 'Categoría del elemento')}</label>
    <p className="persp3d-nota">Dibujalo con todas las herramientas: Dibujar, Figuras, Caja (se guarda maciza, del color del pincel), Volumen (Ctrl+E). La base del elemento es el piso; el centro, la marca magenta.</p>
    <div className="biblio3d-acciones">
      <button className="persp3d-boton persp3d-repetir-ya biblio3d-guardar-edicion" onClick={guardarEdicion}>Guardar en la escenografía</button>
      <button className="persp3d-boton" onClick={cancelarEdicion}>Cancelar</button>
    </div>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;

  const p = kit.piezas.find((x) => x.id === activa) || null;
  return <div className="persp3d biblio3d">
    <label className="toma3d-fila">Escenografía<select aria-label="Escenografía" value={kit.id} onChange={(ev) => cambiarKit(ev.target.value)}>
      <optgroup label="De fábrica">{fabrica.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</optgroup>
      {propios.length > 0 && <optgroup label="Mis escenografías">{propios.map((k) => <option key={k.id} value={k.id}>{k.nombre}</option>)}</optgroup>}
    </select></label>
    {kit.fabrica ? <p className="persp3d-nota">{kit.descripcion} · De fábrica: lo que guardes va a tu copia.</p>
      : <label className="toma3d-fila">Nombre<input aria-label="Nombre de la escenografía" value={kit.nombre} maxLength={60} onChange={(ev) => actualizar({ ...kit, nombre: ev.target.value })}/></label>}
    <div className="biblio3d-cats" role="tablist" aria-label="Categorías">
      {[{ id: 'todas' as const, nombre: 'Todos' }, ...CATEGORIAS.filter((c) => kit.piezas.some((x) => x.categoria === c.id))].map((c) =>
        <button key={c.id} role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)}>{c.nombre}</button>)}
    </div>
    <div className="biblio3d-grilla" aria-label="Elementos de la escenografía">
      {piezas.map((x) => {
        const m = minis.current.get(kit.id + '/' + x.id);
        return <div key={x.id} className={'biblio3d-carta' + (activa === x.id ? ' on' : '')}>
          <button data-pieza={x.id} aria-pressed={activa === x.id} title={`${x.nombre} · ${x.tam.map((v) => v.toFixed(1)).join(' × ')} m`} onClick={() => elegir(x)}>
            {m ? <img src={m} alt=""/> : <span className="biblio3d-cargando"/>}<span>{x.nombre}</span></button>
          <button className="biblio3d-editar" data-editar={x.id} title={kit.fabrica ? 'Editar una copia (va a tu escenografía)' : 'Editar este elemento'} aria-label={'Editar ' + x.nombre} onClick={() => editar(x, x.nombre, x.categoria)}>✎</button>
        </div>;
      })}
      <button className="biblio3d-nuevo" onClick={() => setNueva({ nombre: '', categoria: cat === 'todas' ? 'casa' : cat, desde: 'cero' })} title="Abre la mesa vacía para dibujar un elemento nuevo">+ Nuevo elemento</button>
    </div>
    {!piezas.length && <p className="persp3d-nota">{kit.piezas.length ? 'Nada en esta categoría' : 'Escenografía vacía: «+ Nuevo elemento» para dibujar el primero'}</p>}
    {nueva && <div className="persp3d-repetir biblio3d-nueva">
      <label>Nombre<input aria-label="Nombre del elemento" autoFocus value={nueva.nombre} maxLength={60} onChange={(ev) => setNueva({ ...nueva, nombre: ev.target.value })}/></label>
      <label>Categoría{selCategoria(nueva.categoria, (c) => setNueva({ ...nueva, categoria: c }), 'Categoría del elemento')}</label>
      {nueva.desde === 'cero'
        ? <button className="persp3d-boton persp3d-repetir-ya biblio3d-empezar" onClick={() => editar(null, nueva.nombre.trim() || 'Elemento', nueva.categoria)}>Dibujarlo</button>
        : <button className="persp3d-boton persp3d-repetir-ya" onClick={guardarSeleccion}>Guardar</button>}
      <button className="persp3d-boton" onClick={() => setNueva(null)}>Cancelar</button>
    </div>}
    {p && <div className="persp3d-repetir biblio3d-variar">
      <label>Tamaño mín.<input type="number" aria-label="Tamaño mínimo" step={0.05} min={0.1} max={10} value={p.variacion.escalaMin} onChange={(ev) => variar(p, { escalaMin: Number(ev.target.value) || 1 })}/></label>
      <label>Tamaño máx.<input type="number" aria-label="Tamaño máximo" step={0.05} min={0.1} max={10} value={p.variacion.escalaMax} onChange={(ev) => variar(p, { escalaMax: Number(ev.target.value) || 1 })}/></label>
      <label>Giro<select aria-label="Giro de cada copia" value={p.variacion.giro} onChange={(ev) => variar(p, { giro: ev.target.value as Pieza['variacion']['giro'] })}>
        <option value="libre">Al azar</option><option value="recto">Derecho</option><option value="no">Nunca</option></select></label>
      <label>Separación<input type="number" aria-label="Separación al sembrar" step={0.1} min={0.3} max={6} value={sep} onChange={(ev) => { const v = Number(ev.target.value) || 1.2; setSep(v); engine.current?.setSeparacionSiembra(v); }}/></label>
      {!kit.fabrica && <button className="persp3d-boton" onClick={() => quitarPieza(p)}>Quitar de la escenografía</button>}
    </div>}
    <button className="persp3d-boton biblio3d-guardar" onClick={() => setNueva({ nombre: '', categoria: 'casa', desde: 'mesa' })} title="Lo elegido con Mover (V) en tu escena pasa a ser un elemento">Guardar lo elegido como elemento</button>
    {!kit.fabrica && <><h3>Colores de las calles y el paisaje</h3>
      <div className="biblio3d-colores">
        {(['calzada', 'vereda', 'pintura', 'tinta', 'pasto', 'tierra', 'roca', 'nieve', 'agua'] as const).map((c) => <label key={c}><input type="color" aria-label={'Color: ' + c} value={kit.estilo[c] || '#888888'} onChange={(ev) => colores({ [c]: ev.target.value })}/>{c[0].toUpperCase() + c.slice(1)}</label>)}
      </div></>}
    <h3>Escenografías</h3>
    <div className="biblio3d-acciones">
      <button className="persp3d-boton" onClick={duplicar}>Duplicar</button>
      <button className="persp3d-boton" onClick={vacio}>Nueva vacía</button>
      <button className="persp3d-boton" onClick={exportar}>Exportar…</button>
      <button className="persp3d-boton" onClick={importar}>Importar…</button>
      {!kit.fabrica && <button className="persp3d-boton biblio3d-borrar" onClick={borrarKit}>{borrar ? '¿Seguro? Borrar' : 'Borrar escenografía'}</button>}
    </div>
    {aviso && <p className="persp3d-aviso" role="status">{aviso}</p>}
  </div>;
}
