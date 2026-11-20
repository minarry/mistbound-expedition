import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MapDiorama } from './three/MapDiorama';
function Landscape(){return <svg className="landing-art" viewBox="0 0 1000 750" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stopColor="#182c29"/><stop offset="1" stopColor="#8e9675"/></linearGradient><linearGradient id="mist" x2="0" y2="1"><stop stopColor="#9ca885" stopOpacity=".6"/><stop offset="1" stopColor="#1a332c" stopOpacity="0"/></linearGradient><radialGradient id="glow"><stop stopColor="#ded2a3" stopOpacity=".28"/><stop offset="1" stopColor="#ded2a3" stopOpacity="0"/></radialGradient></defs><rect width="1000" height="750" fill="url(#sky)"/><circle cx="690" cy="205" r="200" fill="url(#glow)"/><circle cx="690" cy="205" r="62" fill="#d6ce9f" opacity=".75"/><path d="M0 420L120 250 180 312 290 142 400 300 510 220 610 350 790 150 1000 430V750H0Z" fill="#53685a"/><path d="M180 312L290 142 342 222 304 201 275 240 255 220Z M724 238L790 150 863 246 809 215 776 239 766 211Z" fill="#9ca48b" opacity=".5"/><path d="M0 470L170 350 270 460 440 320 570 480 690 350 840 420 1000 315V750H0Z" fill="#304e43"/><path d="M0 520Q200 390 380 510T730 470T1000 440V750H0Z" fill="url(#mist)"/><path d="M0 600Q240 410 440 565T1000 520V750H0Z" fill="#203b31"/><path d="M610 750Q530 660 640 600T680 510Q610 480 655 450Q585 490 628 520T564 620T486 750Z" fill="#b0b094" opacity=".4"/><g fill="#142c24">{Array.from({length:19},(_,i)=><g key={i} transform={`translate(${i*64-70},${490+Math.sin(i*3)*50}) scale(${.7+(i%3)*.25})`}><path d="M0 130L23 65 10 72 32 28 27 32 43 0 62 38 52 32 75 79 63 68 85 130Z"/><rect x="38" y="115" width="10" height="50"/></g>)}</g><g transform="translate(735,310)"><path d="M0 180V30H15V0H27V30H65V0H77V30H92V180Z" fill="#172f27"/><path d="M-12 80L46 45 104 80Z" fill="#10251f"/><path d="M38 110Q46 95 54 110V140H38Z" fill="#dac28a"/><path d="M35 30V-45H40V30M40-44L80-35 40-18Z" fill="#b3a475"/></g><path d="M0 690Q210 590 350 700T730 665T1000 690V750H0Z" fill="#10241e"/><g transform="translate(495,602)" fill="#0d1e19"><circle cy="-17" r="10"/><path d="M-13-7L-24 40H20L12-7Z"/><path d="M-10 33L-16 63H-9L0 40 7 63H14L10 33Z"/><path d="M18-20V58H22V-20Z"/><path d="M22-19L63-10 22 2Z" fill="#b7a475"/></g><g fill="#c8bf91" opacity=".7"><circle cx="377" cy="500" r="1.5"/><circle cx="420" cy="602" r="2"/><circle cx="560" cy="410" r="2"/><circle cx="820" cy="290" r="1"/></g></svg>}

interface LandingProps {
  hasSave: boolean;
  continueAt: string;
  cleared: number;
  onStart: () => void;
  onRestart: () => void;
  onEdit: (tab: 'characters' | 'skills' | 'levels') => void;
  onStory: () => void;
  onChronicle: () => void;
}

export default function Landing({hasSave,continueAt,cleared,onStart,onRestart,onEdit,onStory,onChronicle}: LandingProps) {
  const [panel, setPanel] = useState<'menu'|'restart'|null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = () => { setPanel(null); requestAnimationFrame(()=>toggle.current?.focus()); };
  useEffect(()=>{
    if (panel) dialog.current?.querySelector<HTMLElement>('button')?.focus();
  },[panel]);
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key==='Escape') { event.preventDefault(); close(); }
    if (event.key!=='Tab') return;
    const items = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button,a[href]'));
    const edge = event.shiftKey ? items[0] : items.at(-1);
    if(document.activeElement===edge) {
      event.preventDefault();
      (event.shiftKey ? items.at(-1) : items[0])?.focus();
    }
  }
  return <main className="title-scene">
    <div className="landing-visual title-view" aria-hidden="true"><Landscape/><MapDiorama view="landscape" seed="mistbound-valley" terrain="village"/></div>
    <div className="title-hud" inert={panel!==null}>
      <div className="title-top">
        <div className="title-place"><span className="title-compass" aria-hidden="true">✥</span><span>北境<i>/</i>灰苇河谷</span></div>
        <button className="title-menu" ref={toggle} aria-haspopup="dialog" onClick={()=>setPanel('menu')}><span className="menu-lines" aria-hidden="true"/>菜单</button>
      </div>
      <section className="title-copy">
        <div className="title-wordmark" aria-hidden="true"><i/>MISTBOUND EXPEDITION</div>
        <h1>雾境远征</h1>
        <p>{hasSave?<>继续上次行程<br/>{continueAt}</>:<>北境的灯塔已经熄灭了七夜。<br/>你的队伍，即将走入雾中。</>}</p>
        <nav className="title-choices" aria-label="选择战役">
          <button className="title-start" onClick={onStart}>{hasSave?'继续远征':'开始游戏'} <span aria-hidden="true">→</span></button>
          <button className="title-chronicle" onClick={onChronicle} aria-label="进入《山河初燃》"><small>剧情战役</small><strong>山河初燃</strong><span aria-hidden="true">›</span></button>
        </nav>
      </section>
      {hasSave&&<div className="title-progress"><span className="title-beacons" aria-hidden="true">{[0,1,2].map(i=><i key={i} className={i<cleared?'lit':''}/>)}</span>已解放据点 <b>{cleared} / 3</b></div>}
    </div>
    {panel&&<div className="title-shade" onClick={e=>{if(e.target===e.currentTarget)close();}}>
      <div className="title-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="menu-title" onKeyDown={handleKeys}>
        <div className="title-dialog-head"><h2 id="menu-title">{panel==='menu'?'远征菜单':'从营地重新出发？'}</h2><button aria-label="关闭菜单" onClick={close}>×</button></div>
        {panel==='menu'?<nav aria-label="远征菜单">
          <button onClick={()=>{setPanel(null);onStory();}}>观看序章<span>›</span></button>
          <button onClick={()=>onEdit('characters')}>内容编辑<small>角色 · 技能 · 关卡</small><span>›</span></button>
          <a href="/?lab=assets">三维工坊<span>↗</span></a>
          {hasSave&&<button onClick={()=>setPanel('restart')}>重新出发<span>›</span></button>}
        </nav>:<><p>当前行军位置与通关进度将重置，工坊设置保留。</p><div className="title-confirm-actions"><button onClick={close}>保留当前远征</button><button onClick={onRestart}>重新开始</button></div></>}
      </div>
    </div>}
  </main>;
}
