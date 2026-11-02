import React, { useEffect, useRef, useState } from 'react';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { cuadrosARender } from '../engine/toma3d';

/* EDITAR UN FONDO DEL 2D. En el 2D, clic derecho en una capa que vino del
   estudio → «Editar en el estudio 3D»: llega el proyecto de donde salió esa
   capa y los ajustes con que se mandó (cuántos planos, en unos o en dos, JPG
   o PNG…). La escena que tenías se aparta (motor: editarFuente2D). Movés lo
   que haga falta y «Actualizar en el 2D» manda de nuevo lo mismo, con el MISMO
   nombre: reemplaza a la capa de antes (un paso de Ctrl+Z en el 2D) y tu
   escena vuelve. «Cancelar» vuelve sin mandar nada. */

type Tipo = 'encuadre' | 'planos' | 'toma';
type Params = { cajas?: boolean; planos?: number; cada?: number; formato?: 'jpg' | 'png'; calidad?: number };
type Pedido = { tipo: Tipo; nombre: string; params: Params; capa: string };

const RESPUESTAS = ['low:sent-to-2d', 'low:planos-recibidos', 'low:toma-recibida'];

/** El origen que acompaña a todo envío al 2D: el proyecto y los ajustes. */
export function origenDe(e: WebGLDesign3D, params: Params): { proyecto: string; params: Params } {
  return { proyecto: JSON.stringify(e.exportProject()), params };
}

export function Fuente2DBarra({ engine }: { engine: React.MutableRefObject<WebGLDesign3D | null> }) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const marco = useRef({ w: 1920, h: 1080 });
  const pedidoRef = useRef<Pedido | null>(null);
  pedidoRef.current = pedido;

  useEffect(() => {
    const alMensaje = (ev: MessageEvent) => {
      const m = ev.data as { type?: string; tipo?: Tipo; nombre?: string; params?: Params; proyecto?: string; capa?: string;
        width?: number; height?: number; ok?: boolean; error?: string } | null;
      if (!m || typeof m !== 'object' || ev.source !== window.parent) return;
      if (m.type === 'low:encuadre' && m.width && m.height) marco.current = { w: m.width, h: m.height };
      else if (m.type === 'low:editar-fuente' && typeof m.proyecto === 'string' && m.tipo) {
        const e = engine.current; if (!e) return;
        const p: Pedido = { tipo: m.tipo, nombre: String(m.nombre || ''), params: m.params || {}, capa: String(m.capa || m.nombre || 'la capa') };
        void e.editarFuente2D(m.proyecto).then((ok) => {
          if (!ok) { setAviso('No se pudo abrir el proyecto de esa capa'); return; }
          setPedido(p); setAviso('');
          window.parent.postMessage({ type: 'low:pedir-encuadre' }, '*');
        });
      } else if (pedidoRef.current && m.type && RESPUESTAS.includes(m.type)) {
        setOcupado(false);
        if (m.error) { setAviso('No se pudo actualizar: ' + m.error); return; }
        engine.current?.terminarFuente2D();
        setPedido(null); setAviso('');
      }
    };
    window.addEventListener('message', alMensaje);
    return () => window.removeEventListener('message', alMensaje);
  }, [engine]);

  if (!pedido) return null;

  const actualizar = async () => {
    const e = engine.current; if (!e || ocupado) return;
    const { w, h } = marco.current, op = pedido.params, origen = origenDe(e, op);
    if (pedido.tipo === 'encuadre') {
      const r = e.mandarAl2D(w, h, { cajas: op.cajas });
      if (!r) { setAviso('Pasá a la vista Perspectiva para actualizar el encuadre'); return; }
      setOcupado(true);
      window.parent.postMessage({ type: 'low:send-to-2d', ...r, origen }, '*');
    } else if (pedido.tipo === 'planos') {
      const r = e.mandarEnPlanos(w, h, op.planos || 3, { cajas: op.cajas });
      if (!r) { setAviso('Pasá a la vista Perspectiva, con algo a la vista, para actualizar los planos'); return; }
      setOcupado(true);
      window.parent.postMessage({ type: 'low:send-planos', nombre: pedido.nombre || 'Multiplano', ...r, origen }, '*');
    } else {
      const toma = e.getToma();
      if (!toma.claves.length) { setAviso('La toma no tiene claves de cámara'); return; }
      setOcupado(true);
      const fotos = await e.tomaRender(cuadrosARender(toma, op.cada || 2), w, h,
        { formato: op.formato || 'jpg', calidad: (op.calidad || 90) / 100, cajas: op.cajas }, (k, n) => setAviso(`Renderizando ${k} de ${n}…`));
      if (!fotos.length) { setOcupado(false); setAviso('No se pudo renderizar la toma'); return; }
      // el MISMO nombre que la capa del 2D, aunque la toma se haya renombrado acá
      window.parent.postMessage({ type: 'low:send-toma', nombre: pedido.nombre || toma.nombre, width: w, height: h, cuadros: toma.cuadros,
        cada: op.cada || 2, formato: op.formato || 'jpg', fotos, origen }, '*');
    }
  };
  const cancelar = () => { engine.current?.terminarFuente2D(); setPedido(null); setAviso(''); };
  const que = pedido.tipo === 'encuadre' ? 'el encuadre' : pedido.tipo === 'planos' ? 'los planos' : 'la toma';

  return <div className="fuente2d-barra" role="region" aria-label="Editando una capa del 2D">
    <span>Editando «{pedido.capa}» del 2D · tu escena está apartada y vuelve al terminar</span>
    <button className="persp3d-boton persp3d-repetir-ya fuente2d-actualizar" disabled={ocupado} onClick={() => { void actualizar(); }}
      title={`Manda de nuevo ${que} con los mismos ajustes: reemplaza a la capa del 2D`}>{ocupado ? 'Trabajando…' : 'Actualizar en el 2D'}</button>
    <button className="persp3d-boton fuente2d-cancelar" disabled={ocupado} onClick={cancelar} title="Vuelve a tu escena sin mandar nada">Cancelar</button>
    {aviso && <span className="fuente2d-aviso" role="status">{aviso}</span>}
  </div>;
}
