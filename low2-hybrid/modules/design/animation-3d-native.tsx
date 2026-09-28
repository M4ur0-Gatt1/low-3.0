/**
 * LOW 2.0 - Estudio de dibujo 3D estilo Feather.
 *
 * Monta el viewport WebGL (WebGLDesign3D) y superpone la UI flotante
 * (Toolbar / Properties / Layers) + toggle de fondo claro/oscuro. El motor es
 * dueño de la interacción y lee el store; los paneles solo mutan el store.
 *
 * @module design/animation-3d-native
 */

import React, { useEffect, useRef, useState } from 'react';
import { WebGLDesign3D, type Theme } from './engine/webgl-design3d';
import { lowStore } from '../../store/low-store';
import { StudioChrome3D } from './components/StudioChrome3D';
import { LOW_ACCENT } from './theme';

const bg: Record<Theme, string> = {
  // El claro NO llega al blanco puro. Arrancaba en #ffffff justo en el centro,
  // que es donde uno dibuja: contra ese fondo se perdían de vista el anillo del
  // pincel y el cursor. Un gris claro los deja siempre visibles y no cansa.
  light: 'radial-gradient(120% 115% at 50% 8%, #f3f2ef 0%, #e7e6e2 68%, #d9d8d4 100%)',
  dark: 'radial-gradient(120% 115% at 50% 10%, #45494b 0%, #34383a 62%, #2c3032 100%)',
};

interface Props {
  projectId?: string;
  readOnly?: boolean;
  onRequestClose?: () => void;
}

export const Animation3DNative: React.FC<Props> = ({ projectId = 'default', onRequestClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WebGLDesign3D | null>(null);
  const [theme, setTheme] = useState<Theme>(() => { try { return localStorage.getItem('low3d:theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const engine = new WebGLDesign3D();
    engine.mount(canvasRef.current, containerRef.current);
    engine.setTheme(theme);
    // Retomar donde quedaste: el estudio autoguarda y al abrirlo restaura el
    // último proyecto (los botones Guardar/Abrir siguen siendo para archivos
    // .low3d propios, esto es la red por si cerraste sin guardar).
    engine.restoreAutosave();
    engineRef.current = engine;
    (window as unknown as { __low3d?: WebGLDesign3D }).__low3d = engine;
    (window as unknown as { __lowStore?: typeof lowStore }).__lowStore = lowStore;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // solo al montar; los cambios de tema se aplican en el efecto de abajo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    engineRef.current?.setTheme(theme);
    try { localStorage.setItem('low3d:theme', theme); } catch { /* preferencias opcionales */ }
  }, [theme]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return;
      event.preventDefault();
      // Escape primero CANCELA lo que esté en curso (un arrastre del joystick,
      // un trazo a medio hacer, la selección). Salir usa el botón Volver;
      // repetir Escape nunca abandona el espacio de trabajo.
      if (eng()?.escapeConsume()) return;
      // Salir del estudio requiere el botón Volver; Esc sólo cancela.
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onRequestClose]);

  const [guideOpacity, setGuideOpacity] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dark = theme === 'dark';

  const eng = () => engineRef.current;
  // Ruta del archivo abierto/guardado. Mientras exista, Guardar SOBRESCRIBE sin
  // diálogo ni aviso: "guardar" tiene que ser un gesto invisible. El diálogo es
  // solo para "Guardar como…" o para el primer guardado de un proyecto nuevo.
  const projectPathRef = useRef<string>('');
  const [savedTick, setSavedTick] = useState(0);
  /** Estado del panel de exportación STL. Antes esto era window.confirm(), y
   *  dentro de pywebview los diálogos nativos del navegador NO responden: el
   *  botón "no hacía nada". Ahora el aviso es DOM propio del estudio, que
   *  funciona igual en la app y en el navegador. */
  /** "Nuevo proyecto" preguntaba con window.confirm, que dentro de pywebview no
   *  responde: el botón no hacía absolutamente nada (mismo problema que tenía
   *  el de STL). El aviso es DOM propio del estudio. */
  const [confirmNuevo, setConfirmNuevo] = useState(false);
  /** Avisos que antes iban por window.alert y tampoco se veían. */
  const [aviso, setAviso] = useState('');
  const [stlPanel, setStlPanel] = useState<null | {
    solidos: number; trazos: number; rellenos: number; guias: number; caras: number;
    triangulos: number; exportables: number; seleccion: number;
    aristasAbiertas: number; cerrada: boolean;
    /** El panel NO se cierra al exportar: se queda esperando la respuesta del
     *  host y termina mostrando la RUTA del archivo. Antes se cerraba al
     *  instante y, si algo fallaba de ahi para abajo, el boton parecia no
     *  hacer nada: ni archivo, ni error, ni idea de donde habia quedado. */
    fase: 'informe' | 'guardando' | 'listo' | 'falla';
    msg: string;
  }>(null);

  /** Abre el panel con el informe previo: un STL solo lleva triángulos, así que
   *  hay que decir QUÉ entra y QUÉ queda afuera ANTES de escribir el archivo.
   *  Enterarse después, con el archivo ya en el slicer, es mucho peor. */
  const pedirSTL = () => {
    const e = eng();
    if (!e) return;
    const rep = e.stlReport(false);
    setStlPanel({ ...rep, seleccion: e.selectedCount(), fase: 'informe', msg: '' });
  };

  /** Escribe el STL. `soloSel` lo elige el usuario en el panel. */
  const hacerSTL = (soloSel: boolean) => {
    const fase = (f: 'guardando' | 'listo' | 'falla', msg: string) =>
      setStlPanel((p) => (p ? { ...p, fase: f, msg } : p));
    // TODO el cuerpo va en try/catch: este codigo corre dentro de un iframe que
    // no tiene el puente de la app, asi que una excepcion aca no aparece en
    // low.log ni en ningun lado. Sin esto, un error se ve igual que un boton
    // muerto.
    try {
      const e = eng();
      if (!e) { fase('falla', 'El motor 3D todavia no esta listo.'); return; }
      const r = e.exportSTL({ binary: true, scale: 10, onlySelection: soloSel });
      if (!r) { fase('falla', 'No habia nada exportable en la escena.'); return; }
      const name = (projectId || 'modelo') + '.stl';
      const bytes = r.data instanceof DataView
        ? new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength)
        : new TextEncoder().encode(String(r.data));
      const kb = Math.max(1, Math.round(bytes.length / 1024));
      // Dentro de LOW el estudio corre en un iframe de pywebview, donde la
      // descarga del navegador no hace nada: se le pasa al host en base64 y el
      // host contesta con low:saved-binary diciendo DONDE quedo.
      if (window.parent !== window) {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        fase('guardando', `Generado: ${r.report.triangulos.toLocaleString('es-AR')} triangulos, ${kb} KB. Elegi donde guardarlo.`);
        window.parent.postMessage(
          { type: 'low:save-binary', name, base64: btoa(bin) }, '*');
        return;
      }
      // Copia a un ArrayBuffer propio: TS 5.7 distingue ArrayBuffer de
      // SharedArrayBuffer y no acepta el Uint8Array genérico como BlobPart.
      const blobBytes = new Uint8Array(bytes.byteLength);
      blobBytes.set(bytes);
      const url = URL.createObjectURL(new Blob([blobBytes.buffer], { type: 'model/stl' }));
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      fase('listo', `Descargado ${name} (${kb} KB).`);
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      fase('falla', 'No pude generar el STL: ' + detalle);
      // que quede en low.log: el host si tiene puente con Python
      try {
        window.parent.postMessage({ type: 'low:log', text: 'STL: ' + detalle }, '*');
      } catch { /* estamos en un navegador suelto */ }
    }
  };

  const saveProject = (asNew = false) => {
    const project = eng()?.exportProject();
    if (!project) return;
    const json = JSON.stringify(project, null, 2);
    const name = `${projectId || 'proyecto'}.low3d`;
    // Dentro de LOW el estudio corre en un iframe de pywebview, donde la
    // descarga del navegador (blob + <a download>) NO hace nada: por eso el
    // botón Guardar "no respondía". Ahí le pasamos el JSON a la app, que lo
    // escribe con el diálogo nativo. En un navegador suelto, descarga normal.
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'low:save-project', name, json,
        path: asNew ? '' : projectPathRef.current,
      }, '*');
      return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const openProject = async (file?: File) => {
    if (!file) return;
    try {
      eng()?.importProject(JSON.parse(await file.text()));
      // el navegador no da la ruta real del archivo: a partir de acá Guardar
      // vuelve a preguntar dónde, que es lo correcto (no sabemos de dónde vino)
      projectPathRef.current = '';
      setSavedTick(n => n + 1);
    } catch (error) { setAviso(error instanceof Error ? error.message : 'No se pudo abrir el proyecto'); }
  };
  /** Abrir por la app (pywebview): así SÍ queda la ruta y Guardar sobrescribe. */
  const openProjectViaHost = () => window.parent.postMessage({ type: 'low:open-project' }, '*');

  // respuestas del host: ruta con la que quedó el proyecto
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data as {
        type?: string; path?: string; json?: string;
        bytes?: number; error?: string; cancelado?: boolean } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'low:saved-binary') {
        // el host ya escribio (o no): el panel muestra la RUTA real
        setStlPanel((pnl) => {
          if (!pnl) return pnl;
          if (m.cancelado) return { ...pnl, fase: 'informe', msg: '' };
          if (m.error) return { ...pnl, fase: 'falla', msg: 'No se pudo guardar: ' + m.error };
          const kb = Math.max(1, Math.round((m.bytes || 0) / 1024));
          return { ...pnl, fase: 'listo',
                   msg: `Guardado (${kb} KB) en:
${m.path || '(ruta desconocida)'}` };
        });
        return;
      }
      if (m.type === 'low:saved') {
        if (m.path) projectPathRef.current = m.path;
        setSavedTick((n) => n + 1);
      } else if (m.type === 'low:opened' && typeof m.json === 'string') {
        try {
          eng()?.importProject(JSON.parse(m.json));
          projectPathRef.current = m.path || '';
          setSavedTick(n => n + 1);
        } catch { setAviso('No se pudo abrir el proyecto'); }
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Ctrl+S guarda sobre el mismo archivo; Ctrl+Shift+S pregunta dónde.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      saveProject(e.shiftKey);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="low-studio" data-theme={theme} style={{ position: 'relative', width: '100%', height: '100%', background: bg[theme], overflow: 'hidden' }} ref={containerRef}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} onContextMenu={(e) => e.preventDefault()} />
      <input ref={fileInputRef} type="file" accept=".low3d,application/json" hidden
        onChange={(e) => { void openProject(e.target.files?.[0]); e.currentTarget.value = ''; }} />

      <StudioChrome3D engine={engineRef} dark={dark} onTheme={() => setTheme(dark ? 'light' : 'dark')}
        onClose={onRequestClose} onNew={() => setConfirmNuevo(true)}
        onOpen={() => { if (window.parent !== window) openProjectViaHost(); else fileInputRef.current?.click(); }}
        onSave={saveProject} onExport={pedirSTL}
        projectName={projectPathRef.current.split(/[\\/]/).pop() || 'Sin título'}
        guideOpacity={guideOpacity} onGuideOpacity={v => { setGuideOpacity(v); eng()?.setGuideOpacity(v / 100); }} />
      {(confirmNuevo || aviso) && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.45)', pointerEvents: 'auto',
        }} onClick={() => { setConfirmNuevo(false); setAviso(''); }}>
          <div onClick={(ev) => ev.stopPropagation()} style={{
            width: 340, padding: 16, borderRadius: 10,
            background: dark ? '#414443' : '#f4f6fa',
            border: `1px solid ${dark ? '#626762' : '#d3d8e2'}`,
            boxShadow: '0 24px 60px rgba(0,0,0,.5)',
            color: dark ? '#e6e9f0' : '#23272f',
            font: '400 12px/1.5 Figtree, system-ui, sans-serif',
          }}>
            <div style={{ font: '600 11px/1 Figtree, sans-serif', letterSpacing: .8,
                          textTransform: 'uppercase', opacity: .7, marginBottom: 10 }}>
              {confirmNuevo ? 'Proyecto nuevo' : 'Aviso'}
            </div>
            <div>{confirmNuevo
              ? 'Se descarta el dibujo actual. Si querés conservarlo, cancelá y guardalo primero.'
              : aviso}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => { setConfirmNuevo(false); setAviso(''); }} style={{
                height: 30, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${dark ? '#626762' : '#d3d8e2'}`,
                background: 'transparent', color: 'inherit', fontSize: 12,
              }}>{confirmNuevo ? 'Cancelar' : 'Cerrar'}</button>
              {confirmNuevo && (
                <button onClick={() => { setConfirmNuevo(false); eng()?.newProject(); projectPathRef.current = ''; setSavedTick(n => n + 1); }} style={{
                  height: 30, padding: '0 14px', borderRadius: 7, cursor: 'pointer',
                  border: 'none', background: LOW_ACCENT, color: '#fff', fontSize: 12, fontWeight: 600,
                }}>Empezar de nuevo</button>
              )}
            </div>
          </div>
        </div>
      )}

      {stlPanel && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
          background: 'rgba(0,0,0,.45)', pointerEvents: 'auto',
        }} onClick={() => setStlPanel((p) => (p && p.fase === 'guardando' ? p : null))}>
          <div onClick={(ev) => ev.stopPropagation()} style={{
            width: 372, padding: 16, borderRadius: 10,
            background: dark ? '#414443' : '#f4f6fa',
            border: `1px solid ${dark ? '#626762' : '#d3d8e2'}`,
            boxShadow: '0 24px 60px rgba(0,0,0,.5)',
            color: dark ? '#e6e9f0' : '#23272f',
            font: '400 12px/1.5 Figtree, system-ui, sans-serif',
          }}>
            <div style={{ font: '600 11px/1 Figtree, sans-serif', letterSpacing: .8,
                          textTransform: 'uppercase', opacity: .7, marginBottom: 10 }}>
              Exportar STL
            </div>
            {stlPanel.fase !== 'informe' ? (
              <div>
                <div style={{ padding: '9px 10px', borderRadius: 6, whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  background: stlPanel.fase === 'falla' ? 'rgba(240,69,14,.14)'
                    : stlPanel.fase === 'listo' ? 'rgba(30,132,73,.16)'
                    : (dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)'),
                  border: `1px solid ${stlPanel.fase === 'falla' ? 'rgba(240,69,14,.45)'
                    : stlPanel.fase === 'listo' ? 'rgba(30,132,73,.5)'
                    : (dark ? '#626762' : '#d3d8e2')}` }}>
                  {stlPanel.msg}
                </div>
                {stlPanel.fase === 'guardando' && (
                  <div style={{ opacity: .7, marginTop: 8 }}>
                    Se abrio el dialogo de la app para elegir la carpeta. Si no lo ves,
                    puede estar detras de esta ventana.
                  </div>
                )}
              </div>
            ) : stlPanel.exportables === 0 ? (
              <div>
                No hay nada sólido para exportar.
                <div style={{ opacity: .7, marginTop: 8 }}>
                  Un STL solo lleva triángulos: sirven los trazos (que son tubos cerrados) y los
                  volúmenes (<b>Ctrl+E</b>). Las guías son andamio y los rellenos son caras sin
                  espesor, así que no se pueden imprimir.
                </div>
              </div>
            ) : (
              <div>
                <div>
                  Se exportan <b>{stlPanel.exportables}</b> objeto(s): {stlPanel.solidos} volumen(es)
                  y {stlPanel.trazos} trazo(s), <b>{stlPanel.triangulos.toLocaleString('es-AR')}</b> triángulos.
                </div>
                {stlPanel.caras > 0 && (
                  <div style={{ opacity: .7, marginTop: 8 }}>
                    De {stlPanel.caras} figura(s) va el contorno, no la cara: una cara
                    no tiene espesor. Para imprimirla, convertila en volumen con <b>Ctrl+E</b>.
                  </div>
                )}
                {(stlPanel.rellenos > 0 || stlPanel.guias > 0) && (
                  <div style={{ opacity: .7, marginTop: 8 }}>
                    Quedan afuera
                    {stlPanel.rellenos > 0 && ` ${stlPanel.rellenos} relleno(s) — caras sin espesor`}
                    {stlPanel.rellenos > 0 && stlPanel.guias > 0 && ' y'}
                    {stlPanel.guias > 0 && ` ${stlPanel.guias} guía(s) — son andamio`}.
                  </div>
                )}
                <div style={{ opacity: .7, marginTop: 8 }}>
                  Escala: 1 unidad de LOW = 10 mm.
                </div>
                {/* Para imprimir, que la malla CIERRE es el dato que importa.
                    Los volúmenes cierran; los trazos quedan abiertos porque el
                    tubo y sus tapas no están soldados. Decirlo antes evita la
                    sorpresa en el slicer. */}
                <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 6,
                  background: stlPanel.cerrada ? 'rgba(30,132,73,.16)' : 'rgba(240,69,14,.14)',
                  border: `1px solid ${stlPanel.cerrada ? 'rgba(30,132,73,.5)' : 'rgba(240,69,14,.45)'}` }}>
                  {stlPanel.cerrada ? (
                    <span>La malla <b>cierra</b>: lista para imprimir.</span>
                  ) : (
                    <span>
                      La malla <b>no cierra</b> ({stlPanel.aristasAbiertas} aristas abiertas).
                      Se exporta igual y la mayoría de los slicers la repara al abrirla.
                      {stlPanel.trazos > 0 && ' Los trazos quedan abiertos: para un sólido cerrado, convertilos en volumen con Ctrl+E.'}
                    </span>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              {stlPanel.fase === 'guardando' ? (
                <span style={{ opacity: .6, alignSelf: 'center' }}>Esperando el dialogo…</span>
              ) : (
                <button onClick={() => setStlPanel(null)} style={{
                  height: 30, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${dark ? '#626762' : '#d3d8e2'}`,
                  background: 'transparent', color: 'inherit', fontSize: 12,
                }}>{stlPanel.fase === 'informe' && stlPanel.exportables > 0 ? 'Cancelar' : 'Cerrar'}</button>
              )}
              {stlPanel.fase === 'informe' && stlPanel.exportables > 0 && stlPanel.seleccion > 0 && (
                <button onClick={() => hacerSTL(true)} style={{
                  height: 30, padding: '0 12px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${LOW_ACCENT}`, background: 'transparent',
                  color: LOW_ACCENT, fontSize: 12,
                }}>Solo la selección ({stlPanel.seleccion})</button>
              )}
              {stlPanel.fase === 'informe' && stlPanel.exportables > 0 && (
                <button onClick={() => hacerSTL(false)} style={{
                  height: 30, padding: '0 14px', borderRadius: 7, cursor: 'pointer',
                  border: 'none', background: LOW_ACCENT, color: '#fff', fontSize: 12, fontWeight: 600,
                }}>Exportar</button>
              )}
              {stlPanel.fase === 'falla' && (
                <button onClick={() => setStlPanel((pn) => (pn ? { ...pn, fase: 'informe', msg: '' } : pn))} style={{
                  height: 30, padding: '0 14px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${LOW_ACCENT}`, background: 'transparent',
                  color: LOW_ACCENT, fontSize: 12,
                }}>Volver a intentar</button>
              )}
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default Animation3DNative;
