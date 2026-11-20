import type { SceneWeather } from './mapScenery';
import { useEffect, useRef, useState } from 'react';
import './map-diorama.css';

export interface MapPoint { id: string; x: number; y: number }
export interface MapRoad { from: string; to: string }
export interface MapDioramaProps {
  view?: 'map' | 'landscape';
  terrain?: string;
  coastal?: boolean;
  weather?: SceneWeather;
  seed?: string;
  setting?: 'frontier' | 'chronicle';
  nodes?: readonly MapPoint[];
  roads?: readonly MapRoad[];
  current?: string;
  selected?: string;
  travelTo?: string;
  travelDuration?: number;
  className?: string;
}

type MapInstance = import('./mapScene').MapInstance;

/** Fill a positioned parent. Node anchors are percentages measured from its top-left. */
export function MapDiorama({ view = 'map', terrain = 'hills', coastal = false, weather = 'clear', seed = 'frontier', setting = 'frontier', nodes = [], roads = [], current, selected, travelTo, travelDuration = 1650, className = '' }: MapDioramaProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<MapInstance | undefined>(undefined);
  const markers = useRef({ current, selected, travelTo, travelDuration });
  const [state, setState] = useState('loading');
  // Callers can pass rich scenario objects. Only their projection and topology affect this scene.
  const topology = JSON.stringify({
    nodes: nodes.map(({ id, x, y }) => ({ id, x, y })),
    roads: roads.map(({ from, to }) => ({ from, to })),
  });

  useEffect(() => {
    markers.current = { current, selected, travelTo, travelDuration };
    instance.current?.setMarkers(current, selected, travelTo, travelDuration);
  }, [current, selected, travelTo, travelDuration]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let mounted = true;
    let started = false;
    setState('loading');
    const start = async () => {
      if (started) return;
      started = true;
      try {
        const { createMapScene } = await import('./mapScene');
        if (!mounted) return;
        instance.current = createMapScene(element, { view, terrain, coastal, weather, seed, setting, ...JSON.parse(topology) }, next => {
          if (mounted) setState(next);
        });
        instance.current.setMarkers(markers.current.current, markers.current.selected, markers.current.travelTo, markers.current.travelDuration);
      } catch {
        if (mounted) setState('fallback');
      }
    };
    const observer = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); void start(); }
    }, { rootMargin: '100px' }) : null;
    if (observer) observer.observe(element); else void start();
    return () => {
      mounted = false;
      observer?.disconnect();
      instance.current?.dispose();
      instance.current = undefined;
    };
  }, [view, terrain, coastal, weather, seed, setting, topology]);

  return <div ref={host} className={`map-diorama ${className}`} data-weather={weather} data-3d-view={view} data-3d-state={state} aria-hidden="true"/>;
}
