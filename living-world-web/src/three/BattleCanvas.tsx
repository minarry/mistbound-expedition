import { useLayoutEffect, useRef } from 'react';
import type { Fighter, Frame } from '../core/battle';
import type { BattleTheatre } from './BattleTheatre';

export interface BattleCanvasProps {
  units: Fighter[];
  frame?: Frame;
  previousFrame?: Frame;
  duration?: number;
  playing?: boolean;
  poseFraction?: number;
  selected?: string;
  deployment?: boolean;
}

/** Accessible labels and input targets stay in the DOM; the canvas only paints. */
export default function BattleCanvas(props: BattleCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useRef<BattleTheatre | null>(null);
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
    scene.current?.update(props);
  });
  useLayoutEffect(() => {
    const canvas = canvasRef.current!;
    let active = true;
    void import('./BattleTheatre').then(({ BattleTheatre }) => {
      if (!active) return;
      // Pass the probed context through to Three, so unsupported devices use the
      // existing vector scene without an exception from renderer construction.
      const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
      if (!context) {
        canvas.dataset.battleRenderer = 'fallback';
        return;
      }
      scene.current = new BattleTheatre(canvas, context, latest.current);
    }).catch(() => {
      if (active) canvas.dataset.battleRenderer = 'fallback';
    });
    return () => {
      active = false;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  return <canvas ref={canvasRef} className="bs-model-canvas" data-battle-renderer="loading" data-battle-models="loading" aria-hidden="true"/>;
}
