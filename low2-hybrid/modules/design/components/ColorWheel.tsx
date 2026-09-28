/**
 * Círculo cromático (rueda HSV): matiz = ángulo, saturación = distancia al
 * centro, brillo = slider aparte. Implementado con gradientes CSS puros
 * (conic-gradient para el matiz, radial-gradient blanco→transparente para
 * la saturación, filter:brightness() para el valor) — sin canvas ni
 * dependencias nuevas.
 *
 * @module design/components/ColorWheel
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LOW_ACCENT } from '../theme';

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full || '000000', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('');
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

const SIZE = 112;
const R = SIZE / 2;

export const ColorWheel: React.FC<Props> = ({ value, onChange }) => {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [hsv, setHsv] = useState<[number, number, number]>(() => rgbToHsv(...hexToRgb(value)));

  // si el color cambia desde afuera (paleta, preset), reflejarlo en la rueda
  useEffect(() => setHsv(rgbToHsv(...hexToRgb(value))), [value]);

  const applyFromClient = useCallback((clientX: number, clientY: number, v: number) => {
    const el = wheelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const sat = Math.min(1, Math.hypot(dx, dy) / R);
    let hue = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (hue < 0) hue += 360;
    setHsv([hue, sat, v]);
    onChange(rgbToHex(...hsvToRgb(hue, sat, v)));
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* noop */ }
    applyFromClient(e.clientX, e.clientY, hsv[2]);
    const move = (ev: PointerEvent) => applyFromClient(ev.clientX, ev.clientY, hsv[2]);
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onValueChange = (v100: number) => {
    const v = v100 / 100;
    setHsv([hsv[0], hsv[1], v]);
    onChange(rgbToHex(...hsvToRgb(hsv[0], hsv[1], v)));
  };

  const [h, s, v] = hsv;
  const dotX = R + Math.cos((h * Math.PI) / 180) * s * R;
  const dotY = R + Math.sin((h * Math.PI) / 180) * s * R;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
      <div
        ref={wheelRef}
        onPointerDown={onPointerDown}
        style={{
          width: SIZE, height: SIZE, borderRadius: '50%', position: 'relative', cursor: 'crosshair',
          filter: `brightness(${v})`,
          background:
            'radial-gradient(circle at center, #fff 0%, rgba(255,255,255,0) 100%), ' +
            'conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.15)',
        }}
      >
        <div
          style={{
            position: 'absolute', left: dotX - 6, top: dotY - 6, width: 12, height: 12,
            borderRadius: '50%', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.6)',
            pointerEvents: 'none', background: value,
          }}
        />
      </div>
      <input
        type="range" min={0} max={100} value={Math.round(v * 100)}
        onChange={(e) => onValueChange(Number(e.target.value))}
        title="Brillo"
        style={{ width: SIZE, accentColor: LOW_ACCENT }}
      />
    </div>
  );
};

export default ColorWheel;
