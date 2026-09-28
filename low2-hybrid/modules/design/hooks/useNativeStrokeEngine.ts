/**
 * Hook que conecta el input de puntero de React con el Stroke Engine nativo C++.
 *
 * - Normaliza eventos de puntero (Wacom, Huion, mouse, touch)
 * - Gestiona presión / inclinación / rotación del lápiz
 * - Convierte coordenadas de pantalla a espacio OpenGL normalizado [-1, 1]
 * - Delega en `nativeBridge.design3D`; si el motor nativo no está, el bridge
 *   degrada a no-op (ver low-bridge.ts) y el hook igual funciona.
 *
 * @module design/hooks/useNativeStrokeEngine
 */

import type * as React from 'react';
import { useRef, useCallback } from 'react';
import { nativeBridge } from '../../../native/bridge/low-bridge';

interface UseNativeStrokeEngineOptions {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  projectId: string;
  readOnly: boolean;
  onNativeReady: () => void;
  onError: (error: Error) => void;
}

interface UseNativeStrokeEngineReturn {
  handlePointerDown: (e: React.PointerEvent) => void;
  handlePointerMove: (e: React.PointerEvent) => void;
  handlePointerUp: (e: React.PointerEvent) => void;
  initializeEngine: (canvas: HTMLCanvasElement, container: HTMLDivElement) => Promise<void>;
}

export const useNativeStrokeEngine = ({
  canvasRef,
  projectId,
  readOnly,
  onNativeReady,
  onError,
}: UseNativeStrokeEngineOptions): UseNativeStrokeEngineReturn => {
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const engineInitializedRef = useRef(false);

  const initializeEngine = useCallback(
    async (canvas: HTMLCanvasElement, _container: HTMLDivElement) => {
      try {
        if (!nativeBridge.design3D) {
          throw new Error('El puente nativo no está disponible');
        }

        const rect = canvas.getBoundingClientRect();
        const width = Math.floor(rect.width);
        const height = Math.floor(rect.height);

        // DPI para pantallas retina
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;

        await nativeBridge.design3D.initialize({
          canvas,
          projectId,
          width: canvas.width,
          height: canvas.height,
          dpr,
        });

        engineInitializedRef.current = true;
        onNativeReady();
        console.log('[LOW 2.0] Motor 3D nativo inicializado correctamente');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError(error);
        console.error('[LOW 2.0] Error al inicializar motor nativo:', error);
      }
    },
    [projectId, onNativeReady, onError]
  );

  const getNormalizedCoordinates = useCallback(
    (e: React.PointerEvent, canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Normalizar a [-1, 1] para OpenGL (Y invertido)
      const normalizedX = (x / rect.width) * 2 - 1;
      const normalizedY = -(y / rect.height) * 2 + 1;
      return { x: normalizedX, y: normalizedY };
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (readOnly || !engineInitializedRef.current || !nativeBridge.design3D) {
        return;
      }
      e.preventDefault();
      canvasRef.current?.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const { x, y } = getNormalizedCoordinates(e, canvas);
      nativeBridge.design3D.onPointerDown({
        x,
        y,
        pressure: e.pressure || 0.5,
        tiltX: e.tiltX || 0,
        tiltY: e.tiltY || 0,
        twist: 0,
        timestamp: e.timeStamp,
        pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
      });
      lastPointRef.current = { x: e.clientX, y: e.clientY };
    },
    [readOnly, canvasRef, getNormalizedCoordinates]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!engineInitializedRef.current || !nativeBridge.design3D) {
        return;
      }
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const { x, y } = getNormalizedCoordinates(e, canvas);
      const input = {
        x,
        y,
        pressure: e.pressure || (isDrawingRef.current ? 0.5 : 0),
        tiltX: e.tiltX || 0,
        tiltY: e.tiltY || 0,
        twist: 0,
        timestamp: e.timeStamp,
        pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
        isDrawing: isDrawingRef.current,
      };

      if (isDrawingRef.current) {
        nativeBridge.design3D.onPointerMove(input);
      } else {
        nativeBridge.design3D.onPointerHover(input);
      }
      lastPointRef.current = { x: e.clientX, y: e.clientY };
    },
    [canvasRef, getNormalizedCoordinates]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (readOnly || !engineInitializedRef.current || !nativeBridge.design3D) {
        return;
      }
      e.preventDefault();
      isDrawingRef.current = false;
      lastPointRef.current = null;
      canvasRef.current?.releasePointerCapture(e.pointerId);

      const canvas = canvasRef.current;
      if (!canvas) return;

      const { x, y } = getNormalizedCoordinates(e, canvas);
      nativeBridge.design3D.onPointerUp({
        x,
        y,
        pressure: 0,
        tiltX: 0,
        tiltY: 0,
        twist: 0,
        timestamp: e.timeStamp,
        pointerType: e.pointerType as 'mouse' | 'pen' | 'touch',
      });
    },
    [readOnly, canvasRef, getNormalizedCoordinates]
  );

  return { handlePointerDown, handlePointerMove, handlePointerUp, initializeEngine };
};

export default useNativeStrokeEngine;
