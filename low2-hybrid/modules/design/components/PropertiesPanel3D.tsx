/**
 * Panel de propiedades del módulo 3D.
 *
 * Controles finos que no entran en la Toolbar: opacidad y dureza del pincel, y
 * los parámetros geométricos de la superficie guía activa (radio, segmentos).
 * Todo se sincroniza con el store global.
 *
 * @module design/components/PropertiesPanel3D
 */

import React from 'react';
import { useLowStore } from '../../../store/low-store';
import { LOW_ACCENT } from '../theme';
import { BRUSH_PRESETS } from '../brush-presets';

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '14px',
  // el ancho lo fija el contenedor (Panel3D). Antes acá había un width:220px
  // fijo que, sumado al padding con box-sizing content-box, daba 248px: el
  // cuerpo del panel sobresalía de su propia barra de título.
  width: '100%',
  boxSizing: 'border-box',
  backgroundColor: 'var(--studio-bg, #2d2d2d)',
  color: 'var(--studio-fg, #ccc)',
  fontSize: '12px',
  fontFamily: 'system-ui, sans-serif',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '8px',
};

const sliderStyle: React.CSSProperties = {
  width: '100%',
  accentColor: LOW_ACCENT,
};

const sectionTitle: React.CSSProperties = {
  fontSize: '11px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: 'var(--studio-muted, #888)',
  marginBottom: '2px',
};

export const PropertiesPanel3D: React.FC<{ section?: 'brush' | 'surface' }> = ({ section }) => {
  const { brushSettings, setBrushSettings, activeSurface, setActiveSurface, selectedObject } =
    useLowStore();

  const surfaceRadius = Number(activeSurface?.params.radius ?? 1);
  const surfaceSegments = Number(activeSurface?.params.segments ?? 32);

  const updateSurfaceParam = (key: string, value: number) => {
    if (!activeSurface) return;
    setActiveSurface({
      ...activeSurface,
      params: { ...activeSurface.params, [key]: value },
    });
  };

  /** Valores a MOSTRAR para posición/rotación/escala. Para la rotación, si el
   *  usuario todavía no escribió ninguna, se muestra la que el motor le dio al
   *  encarar el plano a la vista (`autoRotation`). Antes se mostraba 0,0,0
   *  siempre: tocar un solo campo mandaba el vector entero en cero y el plano
   *  saltaba a una orientación que no tenía nada que ver con la que se veía. */
  const shownVector = (key: 'position' | 'rotation' | 'scale'): number[] => {
    const fallback = key === 'scale' ? [1, 1, 1] : [0, 0, 0];
    const explicit = activeSurface?.params[key] as number[] | undefined;
    if (explicit) return explicit;
    if (key === 'rotation' && activeSurface?.params.autoRotation) return activeSurface.params.autoRotation;
    return fallback;
  };

  const updateSurfaceVector = (key: 'position' | 'rotation' | 'scale', axis: number, value: number) => {
    if (!activeSurface) return;
    // se parte de los valores MOSTRADOS, no de 0,0,0: así editar un eje deja
    // los otros dos donde el usuario los está viendo.
    const vector = [...shownVector(key)];
    vector[axis] = value;
    setActiveSurface({ ...activeSurface, params: { ...activeSurface.params, [key]: vector } });
  };

  return (
    <div style={panelStyle}>
      {section !== 'surface' && <>
      {/* Pincel */}
      <div style={sectionTitle}>Pincel</div>
      <div className="studio-option-grid" aria-label="Pinceles predefinidos">
        {BRUSH_PRESETS.map(preset=><button key={preset.id} title={`Preset ${preset.label}`}
          onClick={()=>setBrushSettings({...brushSettings,...preset.values})}>{preset.label}</button>)}
      </div>

      <label style={labelStyle}>
        <span>Opacidad</span>
        <span>{Math.round(brushSettings.opacity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(brushSettings.opacity * 100)}
        onChange={(e) =>
          setBrushSettings({ ...brushSettings, opacity: Number(e.target.value) / 100 })
        }
        style={sliderStyle}
      />

      <label style={labelStyle}>
        <span>Dureza</span>
        <span>{Math.round(brushSettings.hardness * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(brushSettings.hardness * 100)}
        onChange={(e) =>
          setBrushSettings({ ...brushSettings, hardness: Number(e.target.value) / 100 })
        }
        style={sliderStyle}
      />

      <label style={labelStyle}>
        <span>Sensibilidad a la presión</span>
        <span>{Math.round(brushSettings.pressureSensitivity * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(brushSettings.pressureSensitivity * 100)}
        onChange={(e) =>
          setBrushSettings({ ...brushSettings, pressureSensitivity: Number(e.target.value) / 100 })
        }
        title="Cuánto adelgaza el trazo con poca presión del lápiz (0% = ancho constante). El mouse siempre dibuja a ancho completo."
        style={sliderStyle}
      />

      <label style={labelStyle}>
        <span>Estabilizador (pulso)</span>
        <span>{Math.round(brushSettings.stabilization * 100)}%</span>
      </label>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(brushSettings.stabilization * 100)}
        onChange={(e) =>
          setBrushSettings({ ...brushSettings, stabilization: Number(e.target.value) / 100 })
        }
        title="Suaviza el temblor de la mano retrasando un poco el trazo respecto al puntero real (0% = crudo, como antes)."
        style={sliderStyle}
      />

      </>}
      {section !== 'brush' && <>
      {/* Superficie activa */}
      <div style={{ height: '1px', backgroundColor: '#444', margin: '2px 0' }} />
      <div style={sectionTitle}>
        Superficie{activeSurface ? `: ${activeSurface.type}` : ''}
      </div>

      {activeSurface ? (
        <>
          <label style={labelStyle}>
            <span>Radio</span>
            <span>{surfaceRadius.toFixed(1)}</span>
          </label>
          <input
            type="range"
            min={1}
            max={100}
            value={surfaceRadius * 10}
            onChange={(e) => updateSurfaceParam('radius', Number(e.target.value) / 10)}
            style={sliderStyle}
          />

          <label style={labelStyle}>
            <span>Segmentos</span>
            <span>{surfaceSegments}</span>
          </label>
          <input
            type="range"
            min={3}
            max={128}
            value={surfaceSegments}
            onChange={(e) => updateSurfaceParam('segments', Number(e.target.value))}
            style={sliderStyle}
          />

          {(['position', 'rotation', 'scale'] as const).map((key) => {
            const fallback = key === 'scale' ? [1, 1, 1] : [0, 0, 0];
            const values = shownVector(key);
            const label = key === 'position' ? 'Posición' : key === 'rotation' ? 'Rotación' : 'Escala';
            return (
              <div key={key}>
                <div style={{ ...sectionTitle, marginTop: 8 }}>{label}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {(['X', 'Y', 'Z'] as const).map((axis, i) => (
                    <label key={axis} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ color: axis === 'X' ? '#ff6868' : axis === 'Y' ? '#67d47b' : '#65a8ff' }}>{axis}</span>
                      <input type="number" step={key === 'rotation' ? 5 : 0.1} value={Number(values[i] ?? fallback[i])}
                        onChange={(e) => updateSurfaceVector(key, i, Number(e.target.value))}
                        style={{ width: '100%', minWidth: 0, background: '#1e1e1e', color: '#eee', border: '1px solid #555', borderRadius: 3 }} />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div style={{ opacity: 0.6, fontStyle: 'italic' }}>
          Elegí una superficie en la barra para editar sus parámetros.
        </div>
      )}

      </>}
      {/* Selección */}
      {selectedObject && (
        <>
          <div style={{ height: '1px', backgroundColor: '#444', margin: '2px 0' }} />
          <div style={sectionTitle}>Selección</div>
          <div>
            {selectedObject.name ?? selectedObject.id}{' '}
            <span style={{ opacity: 0.6 }}>({selectedObject.type})</span>
          </div>
        </>
      )}
    </div>
  );
};

export default PropertiesPanel3D;
