import React, { useEffect, useState } from 'react';
import { useLowStore } from '../../../store/low-store';
import type { ToolType } from '../../../types/design-types';
import type { WebGLDesign3D, ViewName } from '../engine/webgl-design3d';
import { Toolbar3D } from './Toolbar3D';
import { PropertiesPanel3D } from './PropertiesPanel3D';
import { LayerManager3D } from './LayerManager3D';
import { ObjectList3D } from './ObjectList3D';
import { PerspectivaPanel3D } from './PerspectivaPanel3D';
import { RepetirPanel3D } from './RepetirPanel3D';
import { TomaPanel3D } from './TomaPanel3D';
import { BibliotecaPanel3D } from './BibliotecaPanel3D';
import './studio-chrome.css';

type Panel = 'brush' | 'scene' | 'tools' | 'guides' | 'persp' | 'toma' | 'biblioteca' | null;
const paths: Record<string,string> = {
 pencil:'M4 17 16 5l3 3L7 20H4v-3ZM14 7l3 3', guide:'M3 17 11 5l10 4-8 12L3 17ZM8 11l10 4',
 move:'M12 3v18M3 12h18M9 6l3-3 3 3M6 9l-3 3 3 3M18 9l3 3-3 3M9 18l3 3 3-3',
 eraser:'m4 14 9-10 7 7-8 9H9l-5-6ZM9 9l7 7M12 20h9', rect:'M4 5h16v14H4z', box:'M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Zm0 9 8-4.5M12 12v9M12 12 4 7.5',
 calle:'M8 3 4 21M16 3l4 18M12 4v3m0 4v3m0 4v3',
 pieza:'M12 3c3 2 5 5 5 8a5 5 0 0 1-10 0c0-3 2-6 5-8ZM12 16v5M8 21h8',
 liquify:'M4 7c5-8 7 12 12 4s8 5 1 8M5 16c1-3 5-3 6 0', more:'M5 12h1m5 0h1m5 0h1',
 layers:'m3 8 9-5 9 5-9 5-9-5Zm0 5 9 5 9-5M3 18l9 5 9-5',
 focus:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z',
 undo:'M8 5 3 10l5 5M3 10h10a6 6 0 0 1 0 12', redo:'m16 5 5 5-5 5m5-5h-10a6 6 0 0 0 0 12',
 back:'m14 5-7 7 7 7M7 12h14', save:'M4 3h13l3 3v15H4V3Zm3 0v7h9V3M8 21v-7h8v7',
 sun:'M12 1v2m0 18v2M1 12h2m18 0h2M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
 help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
export const StudioIcon=({name}:{name:string})=><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.more}/></svg>;
/* CONSTRUIR: las herramientas de armar el escenario (caja, calles y las que
   vengan: edificios, árboles, terreno, agua) son UN botón de la barra con su
   lista, como los grupos de Toon Boom. Cada una sumada suelta saturaba la
   vista inicial (check_3d_studio_ui la limita a propósito). */
const GRUPO_CONSTRUIR:ToolType[]=['box','calle','pieza'];
const tools:{id:ToolType;name:string;key:string;icon:string;hint:string}[]=[
 {id:'pencil',name:'Dibujar',key:'P',icon:'pencil',hint:'Arrastrá para dibujar · Shift mantiene la línea recta'},
 {id:'guide',name:'Guía',key:'G',icon:'guide',hint:'Dibujá una guía para orientar el próximo trazo en el espacio'},
 {id:'move',name:'Mover',key:'V',icon:'move',hint:'Seleccioná una pieza · arrastrá el control para transformarla'},
 {id:'eraser',name:'Borrar',key:'E',icon:'eraser',hint:'Tocá un trazo para quitarlo · Ctrl+Z lo recupera'},
 {id:'rect',name:'Figuras',key:'',icon:'rect',hint:'Arrastrá sobre la guía · Shift conserva las proporciones'},
 {id:'box',name:'Caja',key:'X',icon:'box',hint:'Arrastrá la base sobre el piso · mové para la altura y clic · Esc cancela'},
 {id:'calle',name:'Calles',key:'R',icon:'calle',hint:'Marcá el recorrido con clics sobre el piso · doble clic o Enter termina · Esc cancela · Shift: tramos a 15°'},
 {id:'pieza',name:'Piezas',key:'N',icon:'pieza',hint:'Elegí una pieza en la biblioteca · clic coloca · arrastrá para sembrar · Shift: sin variar'},
 {id:'liquify',name:'Deformar',key:'L',icon:'liquify',hint:'Empujá el trazo · el tamaño del pincel define la zona de influencia'},
];
const viewNames:Record<ViewName,string>={persp:'Perspectiva',front:'Frente',back:'Atrás',left:'Izquierda',right:'Derecha',top:'Arriba',bottom:'Abajo'};
interface Props {
 engine:React.MutableRefObject<WebGLDesign3D|null>; dark:boolean; onTheme:()=>void;
 onClose?:()=>void; onNew:()=>void; onOpen:()=>void; onSave:(as:boolean)=>void; onExport:()=>void;
 projectName:string; guideOpacity:number; onGuideOpacity:(v:number)=>void;
}
export function StudioChrome3D({engine,dark,onTheme,onClose,onNew,onOpen,onSave,onExport,projectName,guideOpacity,onGuideOpacity}:Props){
 const state=useLowStore();const [panel,setPanel]=useState<Panel>(null),[menu,setMenu]=useState(false),[help,setHelp]=useState(false),[focus,setFocus]=useState(false);
 const [view,setView]=useState<ViewName>('persp'),[grid,setGrid]=useState(true),[axes,setAxes]=useState(false);
 const [history,setHistory]=useState({undo:false,redo:false});
 const [joystick,setJoystick]=useState(false);
 const active=tools.find(t=>t.id===state.currentTool);
 // los avisos del motor (p. ej. «acá no hay dónde apoyar») se VEN unos segundos en la barra de contexto
 const [aviso,setAviso]=useState('');
 // VISTA VACÍA: hay cosas pero la cámara no muestra ninguna → «Encuadrar lo dibujado»
 const [vacia,setVacia]=useState(false);
 useEffect(()=>{const oir=(e:Event)=>setVacia(!!(e as CustomEvent).detail);window.addEventListener('low3d:vista-vacia',oir);return()=>window.removeEventListener('low3d:vista-vacia',oir);},[]);
 // GUÍA «Armar un fondo»: la primera vez que se abre el estudio; después, desde la ayuda (?)
 const [guia,setGuia]=useState(()=>{try{return localStorage.getItem('low3d:guia-fondos')!=='1';}catch{return false;}});
 const cerrarGuia=()=>{setGuia(false);try{localStorage.setItem('low3d:guia-fondos','1');}catch{/* sin almacenamiento */}};
 // apenas se empieza a trabajar en la mesa, la guía se va sola (no tapa el dibujo)
 useEffect(()=>{if(!guia)return;const ir=(e:PointerEvent)=>{if((e.target as HTMLElement)?.closest?.('.studio-guia-ok'))return;cerrarGuia();};window.addEventListener('pointerdown',ir,true);return()=>window.removeEventListener('pointerdown',ir,true);},[guia]);
 // RECTAS A LOS EJES (imán de fuga): se ve y se apaga desde la barra del pincel
 // EL PAVIMENTADOR: el ancho de la calle (pasaje, calle, avenida)
 const [calle,setCalle]=useState<'pasaje'|'calle'|'avenida'>('calle');
 useEffect(()=>{const sync=()=>{const e=engine.current;if(e)setCalle(e.getCalleTipo());};sync();const t=window.setTimeout(sync,0);
   window.addEventListener('low3d:calle',sync);return()=>{clearTimeout(t);window.removeEventListener('low3d:calle',sync);};},[engine]);
  // el grupo Construir: el botón muestra la herramienta en uso (o la última usada)
  const [construir,setConstruir]=useState<ToolType>('box');
  const [menuConstruir,setMenuConstruir]=useState<{x:number;y:number}|null>(null);
  useEffect(()=>{if(GRUPO_CONSTRUIR.includes(state.currentTool))setConstruir(state.currentTool);
    // Piezas sin su biblioteca no sirve: elegir la herramienta la abre
    if(state.currentTool==='pieza')setPanel('biblioteca');},[state.currentTool]);
  const abrirConstruir=(b:HTMLElement)=>{const r=b.getBoundingClientRect();setMenuConstruir({x:r.right+8,y:Math.max(8,r.top-6)});};
 const [fuga,setFuga]=useState(true);
 useEffect(()=>{const sync=()=>{const e=engine.current;if(e)setFuga(e.getImanFuga());};sync();const t=window.setTimeout(sync,0);
   window.addEventListener('low3d:fuga',sync);return()=>{clearTimeout(t);window.removeEventListener('low3d:fuga',sync);};},[engine]);
 useEffect(()=>{let t=0;const oir=(e:Event)=>{setAviso(String((e as CustomEvent).detail||''));clearTimeout(t);t=window.setTimeout(()=>setAviso(''),4500);};
   window.addEventListener('low3d:aviso',oir);return()=>{clearTimeout(t);window.removeEventListener('low3d:aviso',oir);};},[]);
 const toggle=(p:Panel)=>{setPanel(old=>old===p?null:p);setMenu(false);setHelp(false);};
 useEffect(()=>{
   const sync=()=>{const e=engine.current;if(e){setView(e.currentView());setHistory(e.historyState());setJoystick(e.getJoystick());}};
   sync();window.addEventListener('low3d:view',sync);window.addEventListener('low3d:history',sync);window.addEventListener('low3d:joy',sync);
   const timer=window.setTimeout(sync,0);
   return()=>{clearTimeout(timer);window.removeEventListener('low3d:view',sync);window.removeEventListener('low3d:history',sync);window.removeEventListener('low3d:joy',sync);};
 },[engine]);
 useEffect(()=>{
   const key=(e:KeyboardEvent)=>{
     if((e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))return;
     if(e.key==='Tab'){e.preventDefault();e.stopImmediatePropagation();setFocus(v=>!v);}
     else if(e.key==='Escape'&&(menu||help||panel||focus)){e.preventDefault();e.stopImmediatePropagation();setMenu(false);setHelp(false);setPanel(null);setFocus(false);}
     else if(e.key==='?'){e.preventDefault();setHelp(v=>!v);}
   };
   window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[menu,help,panel,focus]);
 useEffect(()=>{const root=engine.current?.canvasElement()?.parentElement;root?.classList.toggle('studio-focus',focus);root?.classList.toggle('studio-inspector-open',!!panel&&!focus);return()=>{root?.classList.remove('studio-focus','studio-inspector-open');};},[focus,panel,engine]);
 const iconButton=(name:string,label:string,action:()=>void,pressed?:boolean,disabled=false)=><button type="button" className="studio-icon-button" title={label} aria-label={label} aria-pressed={pressed} disabled={disabled} onClick={action}><StudioIcon name={name}/></button>;
 return <div className={'studio-chrome'+(focus?' is-focused':'')}>
   <header className="studio-header studio-surface">
     <div className="studio-project">
       {onClose&&iconButton('back','Volver a LOW',onClose)}<b className="studio-wordmark">LOW<span>3D</span></b>
       <button className="studio-project-menu" onClick={()=>{setMenu(v=>!v);setHelp(false);}} aria-expanded={menu} aria-label="Archivo del proyecto">{projectName}<span>⌄</span></button>
       {iconButton('save','Guardar proyecto (Ctrl+S)',()=>onSave(false))}
     </div>
     <div className="studio-history">{iconButton('undo','Deshacer (Ctrl+Z)',()=>engine.current?.undo(),undefined,!history.undo)}{iconButton('redo','Rehacer (Ctrl+Shift+Z)',()=>engine.current?.redo(),undefined,!history.redo)}</div>
     <div className="studio-header-actions">
       <button className="studio-text-button" onClick={()=>toggle('brush')} aria-pressed={panel==='brush'}>Pincel</button>
       <button className="studio-text-button" onClick={()=>toggle('guides')} aria-pressed={panel==='guides'}>Guías</button>
       <button className="studio-text-button" onClick={()=>toggle('scene')} aria-pressed={panel==='scene'}><StudioIcon name="layers"/>Escena <span className="studio-count">{state.objects.length}</span></button>
       <button className="studio-text-button" data-panel="persp" title="La cámara del layout: altura de los ojos, encuadre, lente y el cuadro del 2D" onClick={()=>toggle('persp')} aria-pressed={panel==='persp'}>Cámara</button>
       <button className="studio-text-button" data-panel="toma" title="Toma: la cámara animada que saca los fondos para el 2D (en JPG o PNG)" onClick={()=>toggle('toma')} aria-pressed={panel==='toma'}>Toma</button>
       {iconButton('sun',dark?'Usar fondo claro':'Usar fondo oscuro',onTheme)}
       {iconButton('help','Ayuda y atajos (?)',()=>{setHelp(v=>!v);setMenu(false);},help)}
       {iconButton('focus','Concentración (Tab)',()=>setFocus(true))}
     </div>
   </header>
   {menu&&<><button className="studio-dismiss" aria-label="Cerrar menú" onClick={()=>setMenu(false)}/><div className="studio-file-menu studio-surface" role="menu">
     {[['Nuevo proyecto',onNew,''],['Abrir…',onOpen,''],['Guardar',()=>onSave(false),'Ctrl S'],['Guardar como…',()=>onSave(true),'Ctrl ⇧ S'],['Exportar STL…',onExport,'']].map(([label,fn,key])=><button role="menuitem" key={label as string} onClick={()=>{setMenu(false);(fn as ()=>void)();}}>{label as string}<kbd>{key as string}</kbd></button>)}
   </div></>}
   <nav className="studio-tool-rail studio-surface" aria-label="Herramientas 3D">
     {tools.filter(t=>!GRUPO_CONSTRUIR.includes(t.id)||t.id===construir).map(t=><button key={t.id} data-tool={t.id} className={GRUPO_CONSTRUIR.includes(t.id)?'studio-grupo':undefined}
       onContextMenu={GRUPO_CONSTRUIR.includes(t.id)?(e)=>{e.preventDefault();abrirConstruir(e.currentTarget);}:undefined} title={`${t.name}${t.key?' ('+t.key+')':''}`} aria-label={t.name} aria-pressed={state.currentTool===t.id||(t.id==='rect'&&['circle','poly'].includes(state.currentTool))} onClick={(e)=>{if((e.target as HTMLElement).closest('.studio-grupo-caret')){abrirConstruir(e.currentTarget);return;}state.setCurrentTool(t.id);if(t.id==='rect')setPanel('tools');}}><StudioIcon name={t.icon}/><span>{t.name}</span>{GRUPO_CONSTRUIR.includes(t.id)&&<i className="studio-grupo-caret" aria-label="Más herramientas para construir" title="Más para construir: caja, calles…">▸</i>}</button>)}
     <span className="studio-rail-divider"/>
     <button title="Todas las herramientas" aria-label="Todas las herramientas" aria-pressed={panel==='tools'} onClick={()=>toggle('tools')}><StudioIcon name="more"/><span>Más</span></button>
   </nav>
   {menuConstruir&&<><button className="studio-dismiss" aria-label="Cerrar la lista" onClick={()=>setMenuConstruir(null)}/>
     <div className="studio-grupo-menu studio-surface" role="menu" aria-label="Construir" style={{left:menuConstruir.x,top:menuConstruir.y}}>
       <h3>Construir</h3>
       {tools.filter(t=>GRUPO_CONSTRUIR.includes(t.id)).map(t=><button key={t.id} role="menuitem" data-tool={t.id} aria-pressed={state.currentTool===t.id}
         onClick={()=>{state.setCurrentTool(t.id);setConstruir(t.id);setMenuConstruir(null);}}><StudioIcon name={t.icon}/><span>{t.name}</span><kbd>{t.key}</kbd></button>)}
     </div></>}
   <div className={'studio-context'+(aviso?' is-aviso':'')} aria-live="polite"><strong>{active?.name||({'pencil-free':'Dibujo libre',select:'Editar puntos',scissors:'Tijera',fill:'Relleno',circle:'Círculo',poly:'Polígono'} as Record<string,string>)[state.currentTool]}</strong><span>{aviso||active?.hint||'Elegí las opciones de la herramienta en el inspector'}</span></div>
   {state.currentTool==='move'&&<div className="studio-transform-strip studio-surface" aria-label="Transformación de selección">
     {(['translate','rotate','scale'] as const).map((mode,i)=><button key={mode} aria-pressed={state.gizmoMode===mode&&!joystick} onClick={()=>{engine.current?.setJoystick(false);setJoystick(false);state.setGizmoMode(mode);}}>{['Mover','Rotar','Escalar'][i]}</button>)}
     <button aria-pressed={joystick} onClick={()=>{engine.current?.setJoystick(!joystick);setJoystick(!joystick);}}>Joystick</button>
   </div>}
   {panel&&<aside className="studio-inspector studio-surface" aria-label="Inspector 3D">
     <div className="studio-inspector-title"><h2>{{brush:'Pincel',guides:'Guías y superficies',scene:'Escena',tools:'Herramientas',persp:'Cámara del layout',toma:'Toma: fondos para el 2D',biblioteca:'Biblioteca de piezas'}[panel]}</h2><button aria-label="Cerrar inspector" title="Cerrar inspector (Esc)" onClick={()=>setPanel(null)}>×</button></div>
     <div className="studio-inspector-content">
       {panel==='tools'&&<Toolbar3D engine={engine}/>}
       {panel==='persp'&&<PerspectivaPanel3D engine={engine}/>}
       {panel==='toma'&&<TomaPanel3D engine={engine}/>}
       {panel==='biblioteca'&&<BibliotecaPanel3D engine={engine}/>}
       {panel==='brush'&&<PropertiesPanel3D section="brush"/>}
       {panel==='guides'&&<><div className="studio-guide-tools"><p>Una superficie orienta los trazos en el espacio.</p><div className="studio-option-grid">{(['plane','cylinder','sphere','torus','loft'] as const).map((type,i)=><button key={type} aria-pressed={state.activeSurface?.type===type} onClick={()=>state.setActiveSurface(state.activeSurface?.type===type?null:{type,params:{}})}>{['Plano','Cilindro','Esfera','Toro','Loft'][i]}</button>)}</div><label>Visibilidad de guías <output>{guideOpacity}%</output><input aria-label="Visibilidad de guías" type="range" min="0" max="100" value={guideOpacity} onChange={e=>onGuideOpacity(Number(e.target.value))}/></label><button className="studio-text-button" onClick={()=>engine.current?.deleteGuide()}>Quitar última guía</button></div><PropertiesPanel3D section="surface"/></>}
       {panel==='scene'&&<><div className="studio-scene-section"><h3>Objetos</h3><ObjectList3D engine={engine}/><div className="studio-selection-actions"><button disabled={!state.objects.some(o=>o.selected)} onClick={()=>engine.current?.groupSelection()}>Agrupar</button><button disabled={!state.objects.some(o=>o.selected)} onClick={()=>engine.current?.ungroupSelection()}>Desagrupar</button><button disabled={!state.objects.some(o=>o.selected)} onClick={()=>engine.current?.solidifySelection()}>Crear volumen</button></div><RepetirPanel3D engine={engine}/></div><div className="studio-scene-section"><h3>Capas</h3><LayerManager3D engine={engine}/></div></>}
     </div>
   </aside>}
   <div className="studio-brush-strip studio-surface">
     <input type="color" aria-label="Color del pincel" value={state.brushSettings.color} onChange={e=>state.setBrushSettings({...state.brushSettings,color:e.target.value})}/>
     <label>Tamaño<input aria-label="Tamaño del pincel" type="range" min="1" max="100" value={state.brushSettings.size} onChange={e=>state.setBrushSettings({...state.brushSettings,size:Number(e.target.value)})}/><output>{state.brushSettings.size}</output></label>
     <button title="Ajustes de pincel" onClick={()=>toggle('brush')}>{Math.round(state.brushSettings.opacity*100)}%<span> opacidad</span></button>
     <button className="studio-fuga" aria-pressed={fuga} title={fuga?'Rectas a los ejes: una línea casi recta, al soltarla, va exacta por la arista o el eje de su superficie y fuga sola. Shift o apagarlo: queda como la dibujaste':'Rectas a los ejes apagado: las líneas quedan como las dibujaste'}
       onClick={()=>{const e=engine.current;if(e){e.setImanFuga(!fuga);setFuga(!fuga);}}}>Rectas a los ejes</button>
     {state.currentTool==='calle'&&<span className="studio-calle-tipo" role="group" aria-label="Ancho de la calle">{(['pasaje','calle','avenida'] as const).map((t,i)=><button key={t} data-calle={t} aria-pressed={calle===t} title={['Pasaje: 4 m de calzada','Calle: 7,5 m de calzada','Avenida: 14 m de calzada, doble línea'][i]} onClick={()=>{engine.current?.setCalleTipo(t);setCalle(t);}}>{['Pasaje','Calle','Avenida'][i]}</button>)}</span>}
   </div>
   <div className="studio-view-strip studio-surface">
     <select aria-label="Vista de cámara" value={view} onChange={e=>{engine.current?.setView(e.target.value as ViewName);setView(e.target.value as ViewName);}}>{Object.entries(viewNames).map(([v,label])=><option value={v} key={v}>{label}</option>)}</select>
     {iconButton('focus','Encuadrar selección o escena (Inicio)',()=>engine.current?.frameContent())}
     <button aria-pressed={grid} title="Mostrar cuadrícula" onClick={()=>setGrid(engine.current?.toggleGrid()??true)}>Cuadrícula</button>
     <button aria-pressed={axes} title="Mostrar ejes y puntos de fuga" onClick={()=>setAxes(engine.current?.toggleAxes()??false)}>Ejes</button>
   </div>
   <div className="studio-navigation-hint">Espacio + arrastrar: desplazar <span>·</span> Botón derecho: orbitar <span>·</span> Rueda: acercar</div>
   {guia&&!help&&<section className="studio-guia studio-surface" aria-label="Cómo armar un fondo">
     <h2>Armar un fondo en 4 pasos</h2>
     <ol>
       <li><b>Cámara</b>: elegí un encuadre (de frente, en esquina…) y tildá «Ver el cuadro del 2D» para ver lo que sale de fondo. El horizonte es la línea amarilla; las letras X, Y, Z —o sus flechas en el borde— marcan los puntos de fuga.</li>
       <li><b>Caja</b> (X): arrastrá la base sobre el piso, subí el mouse para la altura y hacé clic.</li>
       <li><b>Dibujar</b> (P) sobre sus caras: una línea casi recta se acomoda sola y fuga. No hace falta apuntar al punto de fuga.</li>
       <li><b>Toma</b> → «Mandar este encuadre al 2D»: el fondo y sus puntos de fuga pasan al 2D.</li>
     </ol>
     <button className="studio-guia-ok" onClick={cerrarGuia}>Entendido</button>
   </section>}
   {vacia&&!guia&&<div className="studio-vacia studio-surface" role="status">No se ve nada de lo dibujado<button onClick={()=>{engine.current?.frameContent();}}>Encuadrar lo dibujado</button></div>}
   {help&&<section className="studio-help studio-surface" aria-label="Ayuda de navegación"><div className="studio-inspector-title"><h2>Dibujar en el espacio</h2><button aria-label="Cerrar ayuda" onClick={()=>setHelp(false)}>×</button></div><p><button className="studio-guia-link" onClick={()=>{setHelp(false);setGuia(true);}}>Cómo armar un fondo en 4 pasos</button></p><p>Creá una guía, dibujá sobre ella y orbitá para continuar desde otro ángulo.</p><dl>{[['P / G','Dibujar / crear guía'],['V / A','Mover / editar puntos'],['E / C','Borrar / cortar'],['F','Dibujo libre; rueda ajusta profundidad'],['J / T / K','Joystick / 2D–3D / precisión'],['Shift / Alt','Línea recta / eje fijo'],['X / R','Caja / calles'],['Ctrl G / Ctrl ⇧ G','Agrupar / desagrupar'],['Ctrl E','Convertir selección en volumen'],['Ctrl C / Ctrl V','Copiar / pegar'],['Inicio','Encuadrar selección o escena'],['Tab / Esc','Concentración / cancelar']].map(([k,v])=><React.Fragment key={k}><dt><kbd>{k}</kbd></dt><dd>{v}</dd></React.Fragment>)}</dl></section>}
   {focus&&<button className="studio-focus-exit studio-surface" onClick={()=>setFocus(false)}>Mostrar interfaz <kbd>Tab</kbd></button>}
 </div>;
}
