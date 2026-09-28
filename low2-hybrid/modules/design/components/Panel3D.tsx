/**
 * Contenedor de panel flotante MOVIBLE y MINIMIZABLE.
 *
 * Envuelve a Toolbar / Properties / Layers. Se arrastra desde la barra de
 * título y se colapsa con el botón "–". Al arrastrar por primera vez cambia de
 * anclaje (left/right/top/bottom) a coordenadas left/top absolutas.
 *
 * @module design/components/Panel3D
 */

import React, { useRef, useState } from 'react';

interface Anchor {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

interface Props {
  title: string;
  initial: Anchor;
  width?: number;
  children: React.ReactNode;
}

export const Panel3D: React.FC<Props> = ({ title, initial, width, children }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const grab = useRef<{ ox: number; oy: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const onMove = (e: PointerEvent) => {
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent || !grab.current) return;
    const pr = parent.getBoundingClientRect();
    setPos({
      left: e.clientX - pr.left - grab.current.ox,
      top: e.clientY - pr.top - grab.current.oy,
    });
  };
  const onUp = () => {
    grab.current = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  const onHeaderDown = (e: React.PointerEvent) => {
    const el = rootRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const r = el.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    grab.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    setPos({ left: r.left - pr.left, top: r.top - pr.top }); // fijar antes de mover
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const style: React.CSSProperties = {
    position: 'absolute',
    ...(width ? { width } : {}),
    zIndex: 100,
    borderRadius: 12,
    overflow: 'visible',
    border: '1px solid rgba(255,255,255,.08)',
    boxShadow: '0 16px 44px rgba(0,0,0,.28), 0 2px 8px rgba(0,0,0,.22)',
    // overflow visible: no clipar popovers (p. ej. el círculo cromático)
    ...(pos ? { left: pos.left, top: pos.top } : initial),
  };

  return (
    <div ref={rootRef} style={style}>
      <div
        onPointerDown={onHeaderDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '7px 9px 6px 11px',
          background: 'rgba(28,29,32,.94)',
          color: '#e8e8e6',
          fontSize: 10,
          fontFamily: 'Inter, Figtree, system-ui, sans-serif',
          textTransform: 'uppercase',
          letterSpacing: '0.72px',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
          borderTopLeftRadius: 11,
          borderTopRightRadius: 11,
        }}
      >
        <span>{title}</span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expandir' : 'Minimizar'}
          style={{
            width: 22, height: 22, border: 'none', borderRadius: 6,
            background: 'transparent', color: '#aaa9a5', cursor: 'pointer',
            fontSize: 13, lineHeight: 1, padding: 0,
          }}
        >
          {collapsed ? '▢' : '–'}
        </button>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  );
};

export default Panel3D;
