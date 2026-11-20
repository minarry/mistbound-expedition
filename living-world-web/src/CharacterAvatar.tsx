import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Job } from './core/battle';
import './character.css';

export interface CharacterAvatarProps {
  job: Job;
  side?: 'ally' | 'enemy';
  pose?: 'idle' | 'attack' | 'cast' | 'hit' | 'guard' | 'fallen';
  duration?: number;
  paused?: boolean;
}

/** Original vector actors. Animation is presentation only and never advances simulation. */
export default function CharacterAvatar({ job, side = 'ally', pose = 'idle', duration = 1800, paused = false }: CharacterAvatarProps) {
  const unique = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const previousPose = useRef<CharacterAvatarProps['pose']>(undefined);
  const metalId = `cha-metal-${unique}`;
  const clothId = `cha-cloth-${unique}`;
  const metal = `url(#${metalId})`;
  const cloth = `url(#${clothId})`;
  const style = { '--cha-duration': `${Number.isFinite(duration) ? Math.max(100, duration) : 1800}ms` } as CSSProperties;

  // A newly selected replay frame needs a readable still image even while paused.
  // Pausing an existing pose preserves its actual animation time without seeking.
  useLayoutEffect(() => {
    if (paused && previousPose.current !== pose && svgRef.current) {
      for (const animation of svgRef.current.getAnimations({ subtree: true })) {
        const length = animation.effect?.getTiming().duration;
        if (typeof length === 'number') animation.currentTime = length * (pose === 'fallen' ? 1 : .65);
      }
    }
    previousPose.current = pose;
  }, [paused, pose]);

  return <svg ref={svgRef} className={`cha-avatar cha-${job} cha-${side} cha-pose-${pose}${paused ? ' cha-paused' : ''}`} viewBox="0 0 120 140" fill="none" aria-hidden="true" focusable="false" style={style}>
    <defs>
      <linearGradient id={metalId} x1="40" y1="45" x2="79" y2="95" gradientUnits="userSpaceOnUse"><stop className="cha-metal-light" /><stop offset=".48" className="cha-metal-mid" /><stop offset="1" className="cha-metal-dark" /></linearGradient>
      <linearGradient id={clothId} x1="36" y1="47" x2="65" y2="110" gradientUnits="userSpaceOnUse"><stop className="cha-cloth-light" /><stop offset="1" className="cha-cloth-dark" /></linearGradient>
    </defs>
    <g className="cha-facing">
      <ellipse className="cha-shadow" cx="59" cy="129" rx="31" ry="5" fill="#000" opacity=".29" />
      <g className="cha-ground-spell"><ellipse cx="61" cy="127" rx="37" ry="8" className="cha-magic-stroke" strokeWidth="1.3" /><ellipse cx="61" cy="127" rx="28" ry="5" className="cha-magic-stroke" strokeDasharray="6 7" /><path d="M25 127h9m54 0h9M61 117v5m0 10v5" className="cha-magic-stroke" /></g>
      <g className="cha-figure">
        <g className="cha-cape">
          <path d={job === 'priest' ? 'M45 44C33 52 32 76 23 116L43 112 55 118 69 108 62 49Z' : 'M43 45C36 57 33 80 24 108L42 103 51 109 65 99 62 49Z'} fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M42 51C39 72 35 91 31 103L40 100M50 56 46 95" stroke="var(--cha-gold)" strokeWidth="1.2" opacity=".65" />
        </g>
        {job === 'bow' && <g className="cha-quiver"><path d="m35 48 12-3 10 39-12 4Z" fill="#55452e" stroke="var(--cha-outline)" strokeWidth="1.3" /><path d="m37 49-5-18m10 17-4-21m9 22-2-19" stroke="#cfbd86" strokeWidth="1.5" /><path d="m32 31-4-6 5 1 3 5m2-4-4-6 5 1 3 5m3 3-2-6 5 2 1 6" fill="var(--cha-feather)" /></g>}
        <g className="cha-back-leg"><path d="m47 83-3 24-5 15 12 2 7-18 4-20Z" fill="var(--cha-trousers)" stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m42 111 12 3-3 11-14 2c-3-3 1-5 3-7Z" fill="var(--cha-boot)" stroke="var(--cha-outline)" strokeWidth="1.4" /><path d="m43 114 9 2" stroke="var(--cha-gold)" /></g>
        <g className="cha-front-leg"><path d="m57 85 3 23 6 15 11-2-6-17-3-21Z" fill="var(--cha-trousers)" stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m63 112 11-2 3 10 8 5c1 3-5 3-18 1Z" fill="var(--cha-boot)" stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m65 115 9-2" stroke="var(--cha-gold)" /></g>
        <g className="cha-back-arm"><path d="M45 50Q36 53 35 65l-3 18 8 3 8-23Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m32 80 8 2-1 9c-1 4-7 4-8-1Z" fill="var(--cha-skin)" stroke="var(--cha-outline)" strokeWidth="1.3" /><path d="m33 76 8 2-1 7-8-2Z" fill={metal} stroke="var(--cha-outline)" strokeWidth="1" /></g>
        {job === 'priest' ? <g className="cha-torso"><path d="M44 47 62 47 70 65 68 82 78 115 58 119 39 111 46 80 39 59Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m48 48 7 34-8 30 9 3 9-32-4-34" fill="var(--cha-robe)" /><path d="m53 52 4 24 5-23M47 111l8 3 10-31" stroke="var(--cha-gold)" strokeWidth="1.4" /><path d="M44 79h23l2 6-27-1Z" fill="var(--cha-leather)" /><path d="m58 77 4 4-4 5-4-5Z" fill="var(--cha-gold)" /></g> : <g className="cha-torso"><path d="M44 47 61 46 71 57 67 81 71 95 54 98 41 92 43 78 39 58Z" fill={job === 'bow' ? cloth : metal} stroke="var(--cha-outline)" strokeWidth="1.7" strokeLinejoin="round" /><path d="m46 52 7 5 10-6-2 20-7 7-8-6Z" fill="var(--cha-tabard)" stroke="var(--cha-gold)" strokeWidth="1" /><path d="m53 59 4 5-3 6-4-5Z" fill="var(--cha-gold)" /><path d="m43 81 26-1 1 6-28 1Z" fill="var(--cha-leather)" stroke="var(--cha-outline)" /><rect x="53" y="80" width="7" height="7" rx="1" fill="var(--cha-gold)" /><path d="m46 88-2 6m12-6-1 8m10-10 2 7" stroke="var(--cha-gold)" opacity=".6" /></g>}
        <g className="cha-head">
          <path d="m48 36 1 13 9 5 7-7-7-10Z" fill="var(--cha-skin-shadow)" stroke="var(--cha-outline)" strokeWidth="1.2" />
          {job === 'priest' || job === 'bow' ? <path d="M39 35C38 22 44 15 53 14c12 0 19 9 18 23l-6 12-21-1Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.6" /> : null}
          <path d="M47 23c6-6 17-2 19 6l1 7 4 5-5 2-3 6-12-3-6-9Z" fill="var(--cha-skin)" stroke="var(--cha-outline)" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="m61 36 4 1m-3 7h3" stroke="var(--cha-face)" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M45 33c-4-2-5 4-1 7l4 1" fill="var(--cha-skin-shadow)" stroke="var(--cha-outline)" />
          {job === 'sword' && <><path d="M42 36 38 30 42 21 50 17 60 18 67 24 65 30 58 27 54 32 50 27 47 37Z" fill="#665044" stroke="var(--cha-outline)" strokeWidth="1.4" strokeLinejoin="round" /><path d="m44 24 8-4 8 3" stroke="#a18b63" strokeWidth="1.3" /></>}
          {job === 'guard' && <><path d="M39 31c0-18 26-23 30-4l1 6-14-3-8 5-1 11-7-5Z" fill={metal} stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m53 17 3 13m-15 1 28-3" stroke="var(--cha-gold)" strokeWidth="2" /><path d="m44 18 1-7 8-2 4 6" fill="var(--cha-tabard)" stroke="var(--cha-outline)" strokeWidth="1.3" /><path d="m42 35 4 7" stroke="var(--cha-metal-highlight)" /></>}
          {(job === 'bow' || job === 'priest') && <><path d="M40 35c0-12 4-18 13-20 9 1 14 8 17 17l-10-6-9 2-8 15Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.3" /><path d="m44 36 7-12 9-2 7 8" stroke="var(--cha-gold)" strokeWidth="1.2" />{job === 'priest' && <path d="m53 17 4 5-4 5-3-5Z" fill="var(--cha-gold)" />}</>}
        </g>
        {job === 'sword' && <g className="cha-weapon-arm cha-sword-arm"><path d="M64 51c8-2 12 7 9 15l-1 6 8-2 4 7-17 7-7-7 2-17Z" fill={metal} stroke="var(--cha-outline)" strokeWidth="1.6" /><path d="m77 69 8 2 1 6-7 3-3-5Z" fill="var(--cha-skin)" stroke="var(--cha-outline)" strokeWidth="1.2" /><g className="cha-sword-weapon"><path d="m83 70 10-37 5-8 1 10-11 37Z" fill="#d8dfc7" stroke="var(--cha-outline)" strokeWidth="1.2" strokeLinejoin="round" /><path d="m95 36-10 34" stroke="#fff5ce" strokeWidth="1.1" /><path d="m77 69 16 5-1 4-16-5Z" fill="var(--cha-gold)" stroke="var(--cha-outline)" /><path d="m83 75-3 10 4 1 3-10Z" fill="var(--cha-leather)" stroke="var(--cha-outline)" /><circle cx="81" cy="86" r="2.5" fill="var(--cha-gold)" /></g><path d="M62 52c4-4 11-1 14 6l-6 6-9-5Z" fill={metal} stroke="var(--cha-gold)" strokeWidth="1.2" /></g>}
        {job === 'guard' && <><g className="cha-short-sword"><path d="m31 82-8 31 3 7 5-6 5-30Z" fill="#c8d0b9" stroke="var(--cha-outline)" strokeWidth="1.2" /><path d="m25 82 15 4" stroke="var(--cha-gold)" strokeWidth="4" /></g><g className="cha-weapon-arm cha-shield-arm"><path d="M64 51c9 0 12 9 8 19l13 3-2 10-20-5-4-18Z" fill={metal} stroke="var(--cha-outline)" strokeWidth="1.6" /><path d="m62 50 10 2 4 9-7 4-10-5Z" fill={metal} stroke="var(--cha-gold)" strokeWidth="1.3" /><path d="m69 66 17-5 18 9-5 26-16 15-15-18Z" fill="var(--cha-tabard)" stroke="var(--cha-gold)" strokeWidth="2.7" strokeLinejoin="round" /><path d="m74 70 12-4 13 7-5 20-11 11-10-13Z" fill={metal} stroke="var(--cha-outline)" strokeWidth="1.2" /><path d="m86 70 5 13-8 14-5-13Z" fill="var(--cha-tabard)" stroke="var(--cha-gold)" strokeWidth="1" /><circle cx="84" cy="83" r="4" fill="var(--cha-gold)" /><path d="m71 70 2 2m25 1-2 2m-11 28v-3" stroke="#e8d29b" strokeWidth="2" /></g></>}
        {job === 'bow' && <><g className="cha-weapon-arm cha-bow-arm"><path d="M62 52c7-2 9 7 10 13l16 3-1 8-21-3-8-13Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m80 66 8 2 4 4-3 6-8-3Z" fill="var(--cha-skin)" stroke="var(--cha-outline)" strokeWidth="1.2" /><path d="m75 66 7 1-1 9-7-2Z" fill="var(--cha-leather)" stroke="var(--cha-gold)" /><g className="cha-bow-weapon"><path d="M88 39c21 10 21 53 0 64" stroke="var(--cha-outline)" strokeWidth="5" /><path d="M88 39c21 10 21 53 0 64" stroke="var(--cha-gold)" strokeWidth="2.5" /><path d="M88 39 87 103" className="cha-bowstring-rest" stroke="#dfd7b4" strokeWidth=".9" /><path d="M88 39 59 71 88 103" className="cha-bowstring-drawn" stroke="#dfd7b4" strokeWidth=".9" /><path d="m101 66 1 10" stroke="var(--cha-leather)" strokeWidth="4" /></g></g><g className="cha-draw-hand"><path d="M47 55 48 69 65 70l2 7-24-1-6-15Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.4" /><path d="m61 69 8 1 3 3-3 4-8-1Z" fill="var(--cha-skin)" stroke="var(--cha-outline)" /><path d="m55 69 6 0v7h-6Z" fill="var(--cha-leather)" stroke="var(--cha-gold)" /></g><g className="cha-arrow"><path d="M62 72h46" stroke="#e7d19a" strokeWidth="1.3" /><path d="m109 72-6-3 1 3-1 3Z" fill="#dfe4cd" /><path d="m67 72-5-4h6l5 4-5 4h-6Z" fill="var(--cha-feather)" /></g></>}
        {job === 'priest' && <g className="cha-weapon-arm cha-staff-arm"><path d="M64 51c6 1 8 8 8 15l10 5-2 9-16-5-7-16Z" fill={cloth} stroke="var(--cha-outline)" strokeWidth="1.5" /><path d="m76 69 8 2 4 6-4 4-9-4Z" fill="var(--cha-skin)" stroke="var(--cha-outline)" strokeWidth="1.2" /><path d="m72 68 6 2-2 9-6-3" fill="var(--cha-robe)" stroke="var(--cha-gold)" /><g className="cha-staff-weapon"><path d="m86 38-6 84" stroke="var(--cha-outline)" strokeWidth="5" /><path d="m86 38-6 84" stroke="var(--cha-gold)" strokeWidth="2.5" /><path d="m87 17 9 9-2 12-8 8-8-9-1-11Z" fill="var(--cha-tabard)" stroke="var(--cha-gold)" strokeWidth="1.8" /><path d="m87 24 4 7-5 8-4-8Z" className="cha-magic-fill" /><circle cx="87" cy="31" r="11" className="cha-staff-halo cha-magic-stroke" strokeWidth="1" /><path d="m81 111 4 1m-5 4 4 1" stroke="var(--cha-robe)" strokeWidth="2" /></g></g>}
        <g className="cha-slash"><path d="M70 19c33 14 47 52 21 81 8-31 2-58-21-81Z" fill="var(--cha-flash)" opacity=".8" /><path d="M78 23c23 19 32 44 20 66" stroke="#fff4cb" strokeWidth="1.8" strokeLinecap="round" /></g>
        <g className="cha-cast-sparkles"><circle cx="86" cy="31" r="18" className="cha-magic-stroke" strokeWidth="1.1" strokeDasharray="3 7" /><path d="m105 42 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm-28-29 2 4 4 2-4 2-2 4-2-4-4-2 4-2ZM98 77l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" className="cha-magic-fill" /><circle cx="66" cy="31" r="2" className="cha-magic-fill" /><circle cx="102" cy="22" r="1.5" className="cha-magic-fill" /></g>
        <g className="cha-hit-sparks"><path d="m73 51 2 11 11-3-8 8 9 7-12-2-2 12-4-12-10 4 7-9-8-6 11 2Z" fill="var(--cha-flash)" /><path d="m88 52 7-6m-7 35 7 5M59 53l-6-5" stroke="var(--cha-flash)" strokeWidth="2" strokeLinecap="round" /></g>
        <path className="cha-guard-aura" d="M79 48c16 3 28 16 29 34-2 17-13 28-29 35" stroke="var(--cha-flash)" strokeWidth="3" strokeLinecap="round" />
      </g>
    </g>
  </svg>;
}
