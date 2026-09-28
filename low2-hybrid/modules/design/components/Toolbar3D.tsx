/**
 * Barra de herramientas 3D.
 *
 * - Herramientas: Lápiz, Mover, Borrar, Liquify
 * - Superficies guía: Plano, Cilindro, Esfera, Toro, Loft
 * - Modo espejo X
 * - Pincel: color y grosor (opacidad/dureza viven en PropertiesPanel3D)
 *
 * @module design/components/Toolbar3D
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLowStore } from '../../../store/low-store';
import type { WebGLDesign3D } from '../engine/webgl-design3d';
import { ToolType, SurfaceType, GizmoMode, BrushSettings } from '../../../types/design-types';
import { ColorWheel } from './ColorWheel';
import { LOW_ACCENT } from '../theme';

import { BRUSH_PRESETS } from '../brush-presets';


const Icons = {
  Pencil: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 2l4 4-10 10H7v-5L18 2z"/></svg>,
  Guide: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round"><line x1="3" y1="20" x2="21" y2="4"/></svg>,
  Move: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>,
  Select: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 3l7 17 2-7 7-2z" strokeLinejoin="round"/><circle cx="4" cy="3" r="1.6" fill="currentColor" stroke="none"/><circle cx="11" cy="20" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="11" r="1.6" fill="currentColor" stroke="none"/></svg>,
  Eraser: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14 2.2c.8-.8 2-.8 2.8 0L22 7.4c.8.8.8 2 0 2.8L12 20"/></svg>,
  Liquify: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3c-1.3 0-2.5.5-3.5 1.5C3.5 5.5 3 6.7 3 8s.5 2.5 1.5 3.5S7 13 8 13s2.5-.5 3.5-1.5S13 9 13 8s-.5-2.5-1.5-3.5S9 3 8 3z"/><path d="M16 11c-1.3 0-2.5.5-3.5 1.5S11 15 11 16s.5 2.5 1.5 3.5 2.5 1.5 3.5 1.5 2.5-.5 3.5-1.5 1.5-2.5 1.5-3.5-.5-2.5-1.5-3.5-2.5-1.5-3.5-1.5z"/></svg>,
  Scissors: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>,
  FreeDraw: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="6" strokeDasharray="2 3"/><circle cx="12" cy="12" r="10.5" strokeDasharray="2 4"/></svg>,
  Fill: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M4 12.5 11 5.5l7.5 7.5-7 7z" fill="currentColor" fillOpacity="0.25"/><path d="M9 3.5 11 5.5"/><path d="M20.5 15.5c1 1.4 1.5 2.4 1.5 3a1.5 1.5 0 0 1-3 0c0-.6.5-1.6 1.5-3z" fill="currentColor"/></svg>,
  Rect: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3.5" y="5.5" width="17" height="13" rx="1"/></svg>,
  Circle: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="8.5"/></svg>,
  Poly: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.2 20 8v8l-8 4.8L4 16V8z"/></svg>,
  Plane: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="3"/></svg>,
  Cylinder: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/></svg>,
  Sphere: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="3"/><path d="M12 3v18"/></svg>,
  Torus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="9" ry="4"/></svg>,
  Loft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0"/><path d="M3 7v10M21 7v10"/></svg>,
  Mirror: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v18M3 12h18"/><path d="M8 7l-4 5 4 5M16 7l4 5-4 5"/></svg>,
  GizmoMove: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20"/><path d="M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3"/></svg>,
  GizmoScale: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="9" height="9"/><path d="M13 20h7v-7M20 20L11 11"/></svg>,
  GizmoRotate: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>,
};

/** Sección desplegable (toggle) de la barra. */
const Section: React.FC<{ title: string; open: boolean; onToggle: () => void; children: React.ReactNode }> = ({
  title, open, onToggle, children,
}) => (
  <div>
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', border: 'none', background: 'transparent', color: 'var(--studio-muted, #9aa3b2)',
        cursor: 'pointer', fontSize: '10px', textTransform: 'uppercase',
        letterSpacing: '0.5px', padding: '4px 2px', fontFamily: 'system-ui, sans-serif',
      }}
    >
      <span>{title}</span>
      <span style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>▸</span>
    </button>
    {open && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', padding: '2px 0 6px' }}>{children}</div>}
  </div>
);

const iconBtn = (active: boolean): React.CSSProperties => ({
  width: '38px', height: '38px', border: '1px solid', borderRadius: '9px',
  borderColor: active ? 'rgba(240,69,14,.72)' : 'transparent',
  backgroundColor: active ? 'rgba(240,69,14,.18)' : 'transparent', color: active ? 'var(--studio-accent, #ff7448)' : 'var(--studio-fg, #bbbcb9)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
});
const hoverIn = (e: React.MouseEvent<HTMLButtonElement>, active: boolean) => {
  if (!active) { e.currentTarget.style.backgroundColor = 'var(--studio-hover, rgba(255,255,255,.065))'; }
};
const hoverOut = (e: React.MouseEvent<HTMLButtonElement>, active: boolean) => {
  if (!active) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--studio-fg, #ccc)'; }
};

interface Toolbar3DProps {
  /** El motor: hace falta para opciones de herramienta que viven en él (p. ej.
   *  la cantidad de lados del polígono), no en el store. */
  engine?: React.MutableRefObject<WebGLDesign3D | null>;
}

export const Toolbar3D: React.FC<Toolbar3DProps> = ({ engine }) => {
  const {
    currentTool, setCurrentTool, activeSurface, setActiveSurface,
    mirrorMode, setMirrorMode, brushSettings, setBrushSettings, gizmoMode, setGizmoMode,
  } = useLowStore();
  const [showWheel, setShowWheel] = useState(false);
  const [wheelPos, setWheelPos] = useState<{ top: number; left: number } | null>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const toggleWheel = () => {
    if (!showWheel && swatchRef.current) {
      const r = swatchRef.current.getBoundingClientRect();
      setWheelPos({ top: Math.max(8, Math.min(r.top, window.innerHeight - 300)), left: Math.max(8, Math.min(r.right + 8, window.innerWidth - 290)) });
    }
    setShowWheel((v) => !v);
  };
  const [open, setOpen] = useState<Record<string, boolean>>({ dibujo: true, figuras: false, seleccion: false, superficies: false, pincel: false });
  const [estilo, setEstilo] = useState<'stroke' | 'fill' | 'both'>(engine?.current?.getShapeStyle() ?? 'both');
  const esFigura = currentTool === 'rect' || currentTool === 'circle' || currentTool === 'poly';
  // Joystick: el estado real vive en el motor (es una opcion de la herramienta,
  // no del documento), y aca se refleja para poder pintar los botones.
  const [joyOn, setJoyOn] = useState<boolean>(engine?.current?.getJoystick() ?? false);
  const [joyMode, setJoyMode] = useState<'2d' | '3d'>(engine?.current?.getJoyMode() ?? '3d');
  const [joyLock, setJoyLock] = useState<boolean>(engine?.current?.getJoyLocked() ?? false);
  // el motor avisa cuando el joystick cambia por ATAJO (J / T / K): sin esto los
  // botones quedaban mintiendo sobre el estado real
  useEffect(() => {
    const alDia = () => {
      const e = engine?.current;
      if (!e) return;
      setJoyOn(e.getJoystick());
      setJoyMode(e.getJoyMode());
      setJoyLock(e.getJoyLocked());
    };
    window.addEventListener('low3d:joy', alDia);
    return () => window.removeEventListener('low3d:joy', alDia);
  }, [engine]);
  useEffect(() => {
    const group = ['rect','circle','poly'].includes(currentTool) ? 'figuras' : ['move','select'].includes(currentTool) ? 'seleccion' : 'dibujo';
    setOpen(o => ({ ...o, [group]: true }));
  }, [currentTool]);
  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const draw: { id: ToolType; icon: React.FC; label: string }[] = [
    { id: 'pencil', icon: Icons.Pencil, label: 'Lápiz (P)' },
    { id: 'pencil-free', icon: Icons.Pencil, label: 'Dibujo libre — sin guía; rueda ajusta profundidad (F)' },
    { id: 'guide', icon: Icons.Guide, label: 'Línea guía — define un plano de dibujo (G)' },
    { id: 'eraser', icon: Icons.Eraser, label: 'Borrar (E)' },
    { id: 'scissors', icon: Icons.Scissors, label: 'Tijera — corta el trazo donde clickees encima (C)' },
    { id: 'fill', icon: Icons.Fill, label: 'Relleno — click sobre el contorno de una forma CERRADA y la pinta sólida (B)' },
    { id: 'liquify', icon: Icons.Liquify, label: 'Liquify — arrastrá para deformar el trazo (radio = tamaño de pincel) (L)' },
  ];
  const figuras: { id: ToolType; icon: React.FC; label: string }[] = [
    { id: 'rect', icon: Icons.Rect, label: 'Rectángulo — arrastrá sobre el plano activo (o sobre la vista). Shift: cuadrado' },
    { id: 'circle', icon: Icons.Circle, label: 'Círculo / elipse — arrastrá sobre el plano activo (o sobre la vista). Shift: círculo perfecto' },
    { id: 'poly', icon: Icons.Poly, label: 'Polígono regular — la cantidad de lados se elige abajo. Shift: proporcionado' },
  ];
  const sel: { id: ToolType; icon: React.FC; label: string }[] = [
    { id: 'move', icon: Icons.Move, label: 'Seleccionar / Mover (click o lazo) (V)' },
    { id: 'select', icon: Icons.Select, label: 'Editar puntos del vector (A)' },
  ];
  const surfaces: { id: SurfaceType; icon: React.FC; label: string }[] = [
    { id: 'plane', icon: Icons.Plane, label: 'Plano' },
    { id: 'cylinder', icon: Icons.Cylinder, label: 'Cilindro' },
    { id: 'sphere', icon: Icons.Sphere, label: 'Esfera' },
    { id: 'torus', icon: Icons.Torus, label: 'Toro' },
    { id: 'loft', icon: Icons.Loft, label: 'Loft' },
  ];

  const toolBtn = (t: { id: ToolType; icon: React.FC; label: string }) => (
    <button key={t.id} onClick={() => setCurrentTool(t.id)} title={t.label} aria-label={t.label} aria-pressed={currentTool === t.id} style={iconBtn(currentTool === t.id)}
      onMouseEnter={(e) => hoverIn(e, currentTool === t.id)} onMouseLeave={(e) => hoverOut(e, currentTool === t.id)}>
      <div style={{ width: '20px', height: '20px' }}><t.icon /></div>
    </button>
  );

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: '3px', padding: '9px',
      backgroundColor: 'var(--studio-bg, #161719)', color: 'var(--studio-fg, #bbbcb9)', width: '100%', boxSizing: 'border-box',
      borderBottomLeftRadius: 11, borderBottomRightRadius: 11,
    }}>
      <Section title="Dibujo" open={open.dibujo} onToggle={() => toggle('dibujo')}>
        {draw.map(toolBtn)}
      </Section>

      <Section title="Figuras" open={open.figuras} onToggle={() => toggle('figuras')}>
        {figuras.map(toolBtn)}
        {/* Contorno / relleno de la figura. Vive en el motor, como los lados del
            polígono: es una opción de la herramienta, no del documento. */}
        {esFigura && (
          <div style={{ display: 'flex', gap: 2, width: '100%', padding: '4px 0' }}>
            {([
              ['stroke', 'Contorno', 'Solo el perímetro, sin relleno'],
              ['fill', 'Relleno', 'Solo la cara sólida, sin contorno'],
              ['both', 'Ambos', 'Contorno y cara sólida en una sola pieza'],
            ] as const).map(([id, label, title]) => (
              <button key={id} title={title}
                onClick={() => { engine?.current?.setShapeStyle(id); setEstilo(id); }}
                style={{
                  flex: 1, height: 22, border: 'none', borderRadius: 5, cursor: 'pointer',
                  fontSize: 10, fontFamily: 'system-ui, sans-serif',
                  backgroundColor: estilo === id ? LOW_ACCENT : 'transparent',
                  color: estilo === id ? '#fff' : 'var(--studio-fg, #ccc)',
                }}>{label}</button>
            ))}
          </div>
        )}
        {currentTool === 'poly' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 2px', width: '100%' }}>
            <span style={{ opacity: 0.7 }}>Lados</span>
            <input
              type="number" min={3} max={24} defaultValue={engine?.current?.getPolySides() ?? 6}
              onChange={(e) => engine?.current?.setPolySides(Number(e.target.value))}
              style={{ width: 46, fontSize: 11, padding: '1px 4px' }} />
          </label>
        )}
      </Section>

      <Section title="Selección" open={open.seleccion} onToggle={() => toggle('seleccion')}>
        {sel.map(toolBtn)}
        {currentTool === 'move' && (
          <div style={{ width: '100%', padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <button
              onClick={() => { const v = !joyOn; engine?.current?.setJoystick(v); setJoyOn(v); }}
              title="Joystick (J) - un solo control para mover, rotar y escalar, como en Feather"
              style={{
                height: 24, border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 10,
                fontFamily: 'system-ui, sans-serif',
                backgroundColor: joyOn ? LOW_ACCENT : 'transparent', color: joyOn ? '#fff' : 'var(--studio-fg, #ccc)',
              }}><span aria-hidden="true" style={{ fontSize: 14, marginRight: 5 }}>◎</span>Joystick</button>
            {joyOn && (
              <div style={{ display: 'flex', gap: 2 }}>
                {(['3d', '2d'] as const).map((m) => (
                  <button key={m}
                    onClick={() => { engine?.current?.setJoyMode(m); setJoyMode(m); }}
                    title={m === '3d'
                      ? 'Ejes globales X/Y/Z: conos para mover, anillos para rotar, esfera para rotar libre'
                      : 'Sobre la vista: mover en pantalla, escalar de ancho/alto/libre y rotar en el eje de la camara'}
                    style={{
                      flex: 1, height: 22, border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 10,
                      fontFamily: 'system-ui, sans-serif',
                      backgroundColor: joyMode === m ? LOW_ACCENT : 'transparent',
                      color: joyMode === m ? '#fff' : 'var(--studio-fg, #ccc)',
                    }}>{m.toUpperCase()}</button>
                ))}
                <button
                  onClick={() => { const v = !joyLock; engine?.current?.setJoyLocked(v); setJoyLock(v); }}
                  title="Candado (K) - mover solo en las cuatro direcciones, escalar uniforme y rotar de 15 en 15 grados"
                  style={{
                    width: 26, height: 22, border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                    backgroundColor: joyLock ? LOW_ACCENT : 'transparent', color: joyLock ? '#fff' : 'var(--studio-fg, #ccc)',
                  }}>{joyLock ? '\u{1F512}' : '\u{1F513}'}</button>
              </div>
            )}
          </div>
        )}
        {currentTool === 'move' && !joyOn && ([
          { id: 'translate' as GizmoMode, icon: Icons.GizmoMove, label: 'Gizmo: mover' },
          { id: 'rotate' as GizmoMode, icon: Icons.GizmoRotate, label: 'Gizmo: rotar' },
          { id: 'scale' as GizmoMode, icon: Icons.GizmoScale, label: 'Gizmo: redimensionar' },
        ]).map((g) => (
          <button key={g.id} onClick={() => setGizmoMode(g.id)} title={g.label} style={{ ...iconBtn(gizmoMode === g.id), width: 32, height: 32 }}>
            <div style={{ width: '16px', height: '16px' }}><g.icon /></div>
          </button>
        ))}
      </Section>

      <Section title="Superficies" open={open.superficies} onToggle={() => toggle('superficies')}>
        {surfaces.map((s) => (
          <button key={s.id}
            // Hay UNA superficie de apoyo a la vez: elegir otro tipo la
            // REEMPLAZA y destildar el tipo activo la BORRA. (No acumular:
            // en vista ortogonal se apilaban una sobre otra y no se iban.)
            onClick={() => setActiveSurface(s.id === activeSurface?.type ? null : { type: s.id, params: {} })}
            title={`${s.label} — reemplaza la superficie activa; volvé a tocarlo para quitarla`}
            style={iconBtn(activeSurface?.type === s.id)}
            onMouseEnter={(e) => hoverIn(e, activeSurface?.type === s.id)} onMouseLeave={(e) => hoverOut(e, activeSurface?.type === s.id)}>
            <div style={{ width: '20px', height: '20px' }}><s.icon /></div>
          </button>
        ))}
        {(['x', 'y', 'z'] as const).map((axis) => (
          <button key={axis} onClick={() => setMirrorMode({ ...mirrorMode, [axis]: !mirrorMode[axis] })}
            title={`Simetría ${axis.toUpperCase()}`} style={iconBtn(mirrorMode[axis])}
            onMouseEnter={(e) => hoverIn(e, mirrorMode[axis])} onMouseLeave={(e) => hoverOut(e, mirrorMode[axis])}>
            <span style={{ fontWeight: 700 }}>{axis.toUpperCase()}</span>
          </button>
        ))}
      </Section>

      <Section title="Pincel" open={open.pincel} onToggle={() => toggle('pincel')}>
        {BRUSH_PRESETS.map((p) => (
          <button key={p.id} onClick={() => setBrushSettings({ ...brushSettings, ...p.values })} title={`Preset "${p.label}"`}
            style={{ height: 26, minWidth: 42, padding: '0 6px', border: 'none', borderRadius: 6, backgroundColor: 'transparent', color: 'var(--studio-fg, #ccc)', cursor: 'pointer', fontSize: 10, fontFamily: 'system-ui, sans-serif' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#3d3d3d'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--studio-fg, #ccc)'; }}>
            {p.label}
          </button>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', marginTop: 4 }}>
          <button ref={swatchRef} onClick={toggleWheel} title="Color del pincel (círculo cromático)"
            style={{ width: 40, height: 40, border: showWheel ? `2px solid ${LOW_ACCENT}` : '2px solid transparent', borderRadius: 6, cursor: 'pointer', backgroundColor: brushSettings.color }} />
          <input type="range" min="1" max="100" value={brushSettings.size}
            onChange={(e) => setBrushSettings({ ...brushSettings, size: Number(e.target.value) })}
            title="Tamaño del pincel" style={{ flex: 1, accentColor: LOW_ACCENT }} />
        </div>
      </Section>

      {showWheel && wheelPos && createPortal(
        <>
          {/* fondo invisible: clickear afuera cierra la rueda */}
          <div onClick={() => setShowWheel(false)} style={{ position: 'fixed', inset: 0, zIndex: 99998 }} />
          <div style={{
            position: 'fixed', top: wheelPos.top, left: wheelPos.left, zIndex: 99999,
            padding: 12, backgroundColor: '#2d2d2d', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}>
            <ColorWheel value={brushSettings.color} onChange={(color) => setBrushSettings({ ...brushSettings, color })} />
          </div>
        </>,
        document.body,
      )}
    </div>
  );
};

export default Toolbar3D;
