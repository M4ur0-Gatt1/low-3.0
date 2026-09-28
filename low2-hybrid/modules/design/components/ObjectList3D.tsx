/**
 * Lista de OBJETOS del dibujo 3D.
 *
 * Un grupo (Ctrl+G) tiene que poder verse, elegirse y deshacerse desde algún
 * lado: mientras agrupar solo marcaba los trazos por dentro, no se notaba en
 * ninguna parte de la pantalla y no había forma de saber qué estaba unido.
 *
 * Cada fila es un objeto tal como lo ve el dibujante: un grupo cuenta como uno
 * solo (con cuántas piezas tiene), y los trazos sueltos van aparte.
 *
 * @module design/components/ObjectList3D
 */

import React, { useState } from 'react';
import { useLowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { LOW_ACCENT, LOW_CYAN } from '../theme';

interface Props {
  engine: React.MutableRefObject<WebGLDesign3D | null>;
}

const ICONO: Record<string, string> = {
  group: '⛶', stroke: '╱', fill: '◧', solid: '🧊',
};

export const ObjectList3D: React.FC<Props> = ({ engine }) => {
  const { objects } = useLowStore();
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const eng = () => engine.current;

  if (!objects.length) {
    return (
      <div style={{ fontSize: 11, opacity: 0.6, padding: '6px 2px' }}>
        Dibujá algo. Con varias líneas elegidas, <b>Ctrl+G</b> las une en un objeto.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto' }}>
      {objects.map((o) => (
        <div
          key={o.id}
          onClick={() => eng()?.selectObjectById(o.id)}
          onDoubleClick={() => { if (o.kind === 'group') { setEditando(o.id); setValor(o.name); } }}
          title={o.kind === 'group'
            ? 'Clic: elegir el objeto entero · doble clic: renombrar'
            : 'Clic: elegir'}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px',
            borderRadius: 6, cursor: 'pointer', fontSize: 12,
            background: o.selected ? 'rgba(51,181,232,.16)' : 'transparent',
            outline: o.selected ? `1px solid ${LOW_CYAN}` : 'none',
          }}
        >
          <span style={{ width: 14, textAlign: 'center', opacity: 0.85 }}>{ICONO[o.kind] || '╱'}</span>
          {editando === o.id ? (
            <input
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              onBlur={() => { eng()?.renameObject(o.id, valor); setEditando(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { eng()?.renameObject(o.id, valor); setEditando(null); }
                if (e.key === 'Escape') setEditando(null);
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '1px 4px' }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {o.name}
            </span>
          )}
          {o.kind === 'group' && (
            <>
              <span style={{ fontSize: 10, opacity: 0.55 }}>{o.count}</span>
              <button
                onClick={(e) => { e.stopPropagation(); eng()?.ungroupById(o.id); }}
                title="Separar este objeto en sus líneas (Ctrl+Shift+G)"
                style={{
                  border: 'none', background: 'transparent', color: LOW_ACCENT,
                  cursor: 'pointer', fontSize: 12, padding: '0 3px', borderRadius: 4,
                }}
              >⤫</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
};
