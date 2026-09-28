/**
 * Punto de entrada del renderer (Vite + React) para el estudio 3D de LOW 2.0.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Animation3DNative } from '../modules/design/animation-3d-native';

const el = document.getElementById('root');
if (!el) throw new Error('No se encontró #root');

const App = () => {
  const [module, setModule] = useState<'home' | '3d'>('3d');
  const close3D = () => {
    if (window.parent !== window) {
      // El bundle puede cargarse desde file:// dentro de pywebview (origin
      // opaco); el padre valida event.source contra el iframe antes de actuar.
      window.parent.postMessage({ type: 'low:close-3d' }, '*');
      return;
    }
    setModule('home');
  };
  if (module === '3d') return <Animation3DNative projectId="demo" onRequestClose={close3D} />;
  return (
    <main style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#15171d', color: '#eef1f6', fontFamily: 'system-ui' }}>
      <section style={{ textAlign: 'center' }}>
        <h1 style={{ marginBottom: 8 }}>LOW</h1>
        <p style={{ color: '#9aa3b2', marginBottom: 24 }}>Módulos creativos</p>
        <button onClick={() => setModule('3d')} style={{ padding: '12px 20px', border: 0, borderRadius: 8, background: '#0078d4', color: '#fff', cursor: 'pointer' }}>
          Abrir estudio 3D
        </button>
      </section>
    </main>
  );
};

createRoot(el).render(<React.StrictMode><App /></React.StrictMode>);
