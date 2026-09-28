/**
 * Gestor de capas/grupos del módulo 3D — al estilo del Stage Panel de Feather.
 *
 * Cada trazo pertenece a una capa. Desde acá se puede:
 *  - crear / renombrar (doble click) / eliminar capas (con su contenido)
 *  - ocultar/mostrar y regular opacidad de todo el grupo
 *  - seleccionar TODAS las curvas de la capa (⛶) para transformar/recolorear
 *  - pintar todas las curvas de la capa con el color actual del pincel (🎨)
 *  - fijar la capa activa (donde caen los trazos nuevos)
 *
 * Las acciones que tocan la geometría 3D van al motor (engine); las de
 * metadata (nombre, visible, opacidad) al store.
 *
 * @module design/components/LayerManager3D
 */

import React, { useState } from 'react';
import { useLowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { LOW_ACCENT_DEEP } from '../theme';

interface Props {
  engine: React.MutableRefObject<WebGLDesign3D | null>;
}

const iconBtn: React.CSSProperties = {
  border: 'none', background: 'transparent', color: 'inherit',
  cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '2px 5px', borderRadius: 4,
};

export const LayerManager3D: React.FC<Props> = ({ engine }) => {
  const {
    layers, activeLayerId, brushSettings,
    setActiveLayer, addLayer, toggleLayerVisibility, toggleLayerLock,
    renameLayer, setLayerOpacity,
  } = useLowStore();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const eng = () => engine.current;

  return (
    <div style={{
      backgroundColor: 'transparent', color: 'var(--studio-fg, #ccc)', fontSize: 12,
      fontFamily: 'system-ui, sans-serif', maxHeight: 320, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 10px', borderBottom: '1px solid var(--studio-line, #444)' }}>
        <button style={iconBtn} title="Nueva capa" onClick={() => addLayer()}>＋ capa</button>
      </div>

      <div style={{ overflowY: 'auto' }}>
        {[...layers].reverse().map((layer) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              onClick={() => setActiveLayer(layer.id)}
              style={{
                display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px',
                cursor: 'pointer', borderBottom: '1px solid var(--studio-line, #383838)',
                backgroundColor: isActive ? 'var(--studio-active, #B8330A)' : 'transparent',
                color: 'var(--studio-fg, #ccc)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  style={{ ...iconBtn, opacity: layer.visible ? 1 : 0.4 }}
                  title={layer.visible ? 'Ocultar capa' : 'Mostrar capa'}
                  onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
                >{layer.visible ? '👁' : '⊘'}</button>
                <button
                  style={{ ...iconBtn, opacity: layer.locked ? 1 : 0.4 }}
                  title={layer.locked ? 'Desbloquear' : 'Bloquear'}
                  onClick={(e) => { e.stopPropagation(); toggleLayerLock(layer.id); }}
                >{layer.locked ? '🔒' : '🔓'}</button>

                {editingId === layer.id ? (
                  <input
                    autoFocus
                    value={editValue}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => { renameLayer(layer.id, editValue.trim() || layer.name); setEditingId(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingId(null); }}
                    style={{ flex: 1, minWidth: 0, background: '#1e1e1e', color: '#fff', border: '1px solid #555', borderRadius: 3, padding: '1px 4px', font: 'inherit' }}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingId(layer.id); setEditValue(layer.name); }}
                    title="Doble click para renombrar"
                    style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >{layer.name}</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} onClick={(e) => e.stopPropagation()}>
                <input
                  type="range" min={0} max={100} value={Math.round(layer.opacity * 100)}
                  title="Opacidad de la capa"
                  onChange={(e) => setLayerOpacity(layer.id, Number(e.target.value) / 100)}
                  style={{ flex: 1, accentColor: '#4c9bff', height: 3 }}
                />
                <button style={iconBtn} title="Seleccionar todas las curvas de la capa"
                  onClick={() => eng()?.selectLayer(layer.id)}>⛶</button>
                <button style={iconBtn} title="Pintar toda la capa con el color actual del pincel"
                  onClick={() => eng()?.setLayerColor(layer.id, brushSettings.color)}>🎨</button>
                <button style={{ ...iconBtn, opacity: layers.length > 1 ? 0.8 : 0.25 }}
                  title="Eliminar capa y su contenido" disabled={layers.length <= 1}
                  onClick={() => eng()?.deleteLayer(layer.id)}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LayerManager3D;
