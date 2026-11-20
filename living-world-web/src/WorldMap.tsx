import { MapDiorama } from './three/MapDiorama';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { JOBS, type Battle, type Unit } from './core/battle';
import './world.css';
import type { LocalProgress } from './campaign';

type Encounter = { name: string; subtitle: string; detail: string; units: Unit[] };
type WorldProps = {
  encounters: Encounter[];
  team: Unit[];
  location: number;
  initialSelection?: number;
  cleared: number[];
  onMove: (location: number) => void;
  onEnter: (encounter: number) => void;
  onFormation: (selected: number) => void;
  onHome: () => void;
};
const points = [{ x: 185, y: 452 }, { x: 408, y: 370 }, { x: 618, y: 268 }, { x: 808, y: 165 }];
const modelPoint = ({x,y}: {x: number; y: number}, id: string) => ({id, x: x / 10, y: y / 6.5});
const worldPoints = points.map((point, i) => modelPoint(point, String(i)));
const worldRoads = worldPoints.slice(1).map((point, i) => ({from: worldPoints[i].id, to: point.id}));
const localRoads = [{from:'camp',to:'bridge'},{from:'bridge',to:'approach'},{from:'camp',to:'woods'},{from:'woods',to:'approach'},{from:'approach',to:'fortress'}];
const roads = ['M185 452 C245 440 255 388 305 405 S365 378 408 370', 'M408 370 C452 333 480 366 500 320 S565 306 618 268', 'M618 268 C667 230 680 270 715 215 S775 205 808 165'];
const woods = [
  [320, 150], [345, 166], [373, 143], [394, 166], [420, 132], [444, 150], [466, 177], [343, 198], [376, 204], [411, 195], [441, 214],
  [528, 440], [550, 469], [580, 454], [610, 479], [638, 449], [670, 472], [701, 449], [735, 480], [586, 511], [620, 529], [656, 515],
  [787, 328], [817, 346], [848, 318], [873, 344], [908, 321], [835, 386], [865, 405], [896, 375], [918, 410],
  [195, 283], [222, 303], [244, 273], [271, 290], [293, 271], [260, 325], [217, 342],
];
const mountains = [[502, 84], [542, 105], [585, 85], [626, 115], [662, 85], [700, 113], [739, 80], [776, 103], [728, 137], [556, 134]];

function FrontierNames() {
  return <g fill="#6f745c" fontFamily="serif" letterSpacing="6" opacity=".7"><text x="330" y="115" fontSize="16">寂 静 林 地</text><text x="580" y="590" fontSize="17">苔 原 荒 野</text><text x="661" y="64" fontSize="14">眠 龙 山 脉</text><text x="280" y="550" fontSize="13" transform="rotate(-18 280 550)">白 鹭 河</text><text x="54" y="222" fontSize="13" transform="rotate(-90 54 222)">西 境 之 海</text></g>;
}
function MapTerrain({ local = false }: { local?: boolean }) {
  const prefix = local ? 'local' : 'world';
  return <>
    <defs>
      <pattern id={`${prefix}-paper`} width="64" height="64" patternUnits="userSpaceOnUse"><path d="M0 32H64M32 0V64" stroke="#7d7153" strokeWidth=".5" opacity=".11"/><circle cx="8" cy="19" r=".8" fill="#7e735b" opacity=".25"/><circle cx="47" cy="51" r=".6" fill="#7e735b" opacity=".25"/></pattern>
      <radialGradient id={`${prefix}-ground`}><stop stopColor="#e8dfc3"/><stop offset="1" stopColor="#c5b993"/></radialGradient>
      <pattern id={`${prefix}-water`} width="25" height="20" patternUnits="userSpaceOnUse"><path d="M2 10q5-4 10 0t10 0" fill="none" stroke="#b3c6bf" opacity=".55" strokeWidth="1"/></pattern>
      <symbol id={`${prefix}-tree`} viewBox="0 0 25 39"><path d="M12 2 2 18h5L0 29h10v8h4v-8h10l-7-11h5Z" fill="#71836a" stroke="#50654d" strokeWidth="1"/><path d="M12 9v21m0-10-7 5m7-10 6 5" fill="none" stroke="#b5bb8e" strokeWidth=".8"/></symbol>
      <symbol id={`${prefix}-mountain`} viewBox="0 0 65 70"><path d="M2 66 32 4l31 62Z" fill="#bbb59b" stroke="#8e8b72" strokeWidth="1.4"/><path d="M32 4v62H2Z" fill="#e7e1c9"/><path d="m20 29 12-25 13 25-10-6-6 7-4-6Z" fill="#faf3da"/><path d="m32 31 8 20 14 15M22 45l-8 21" stroke="#97947d" fill="none"/></symbol>
      <symbol id={`${prefix}-keep`} viewBox="0 0 50 58"><path d="M10 52V21h30v31M5 23V9h7v6h6V9h7v6h6V9h7v6h7v8ZM5 52h40" fill="#d8c9a4" stroke="#665e46" strokeWidth="2"/><path d="M20 52V39q5-8 10 0v13M17 27v6m16-6v6" fill="#8f8263" stroke="#665e46" strokeWidth="2"/><path d="M25 9V0l15 4-15 3" fill="#936b51" stroke="#665e46"/></symbol>
    </defs>
    <rect width="1000" height="650" fill={`url(#${prefix}-ground)`}/>
    <path d="M0 0h135q-34 59 14 92t-13 101q52 51-2 101t-19 100q-32 42-11 83t-50 67q49 62 13 106H0Z" fill="#8fa99f"/>
    <path d="M0 0h135q-34 59 14 92t-13 101q52 51-2 101t-19 100q-32 42-11 83t-50 67q49 62 13 106H0Z" fill={`url(#${prefix}-water)`}/>
    <path d="M135 0q-34 59 14 92t-13 101q52 51-2 101t-19 100q-32 42-11 83t-50 67q49 62 13 106" fill="none" stroke="#e6e0be" strokeWidth="7"/>
    <path d="M162 115q160-91 339 30t340 17M195 579q146-59 283-15t405-55M323 270q90-62 177-34" fill="none" stroke="#a39f7d" strokeWidth="1" opacity=".6"/>
    <path d="M555 0q-20 115-38 143t31 78q40 48-15 72t-32 88q-2 51-75 83t-23 80q22 55 0 106" stroke="#819d93" strokeWidth="13" fill="none"/>
    <path d="M555 0q-20 115-38 143t31 78q40 48-15 72t-32 88q-2 51-75 83t-23 80q22 55 0 106" stroke="#b8cdc0" strokeWidth="5" fill="none"/>
    <path d="M515 382q60 11 77 46t71 13" stroke="#8ea89a" strokeWidth="5" fill="none"/>
    {woods.map(([x, y], i) => <use key={i} href={`#${prefix}-tree`} x={x} y={y} width={23 + i % 3 * 3} height={36 + i % 3 * 4} opacity={.72 + i % 3 * .1}/>)}
    {mountains.map(([x, y], i) => <use key={i} href={`#${prefix}-mountain`} x={x} y={y} width="64" height="70"/>)}
    <rect width="1000" height="650" fill={`url(#${prefix}-paper)`} pointerEvents="none"/>
    <FrontierNames/>
  </>;
}
function Compass({ className = '' }: { className?: string }) {
  return <div className={`world-compass ${className}`} aria-hidden="true"><span>N</span><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="27"/><path d="m40 3 7 30 30 7-30 7-7 30-7-30-30-7 30-7Z"/><path d="M40 3v74M3 40h74"/><path d="m40 3 7 30-7 7Z" className="world-compass-fill"/></svg></div>;
}
function PartyFlag({ x, y, moving }: { x: number; y: number; moving: boolean }) {
  return <div className={`world-party-flag ${moving ? 'world-travelling' : ''}`} style={{ left: `${x / 10}%`, top: `${y / 6.5}%` }} aria-label={moving ? '队伍行军中' : '队伍当前位置'}><span className="world-flag-pole"/><span className="world-flag-cloth">✧</span><span className="world-flag-shadow"/></div>;
}

/** Keep the 1.52:1 orthographic terrain undistorted; its roads and the HUD markers
 * must project into the same visible space after cropping to a portrait screen. */
function useMapProjection() {
  const root = useRef<HTMLElement>(null);
  const [size, setSize] = useState({width:1000,height:650,top:0,bottom:0});
  useLayoutEffect(() => {
    const host = root.current;
    if (!host) return;
    const dock = host.querySelector<HTMLElement>('.world-dock')!;
    const header = host.querySelector<HTMLElement>('.world-topbar')!;
    const measure = () => {
      const {width,height,top:y,bottom:end} = host.getBoundingClientRect();
      if (!width || !height) return;
      const top = header.getBoundingClientRect().bottom - y;
      const bottom = end - dock.getBoundingClientRect().top;
      setSize(old => old.width === width && old.height === height && old.top === top && old.bottom === bottom
        ? old : {width,height,top,bottom});
    };
    measure();
    const resize = new ResizeObserver(measure);
    [host,dock,header].forEach(element => resize.observe(element));
    return () => resize.disconnect();
  },[]);
  const {width,height,top,bottom} = size;
  const terrainWidth = Math.max(width,height*1.52);
  const terrainHeight = terrainWidth/1.52;
  const routeHeight = Math.max(1,height-top-bottom);
  const routeVars = {'--route-top':top+'px','--route-bottom':bottom+'px',
    '--terrain-width':terrainWidth+'px','--terrain-height':terrainHeight+'px'} as CSSProperties;
  const project = <T extends {x:number;y:number}>(p:T) => ({...p,
    x:50 + (p.x-50)*width/terrainWidth,
    y:50 + (top + routeHeight*p.y/100-height/2)/terrainHeight*100,
  });
  const fallbackTransform = 'translate(0,'+(top/height*650)+') scale(1,'+(routeHeight/height)+')';
  return {root,routeVars,project,fallbackTransform};
}

function MapHeader({ title, layer, onBack, onFormation, moving }: {
  title: string; layer: '大地图'|'战场地图'; onBack: () => void; onFormation: () => void; moving: boolean;
}) {
  const parent = layer === '大地图' ? '主菜单' : '大地图';
  return <div className="world-topbar">
    <div className="world-heading-group">
      <button className="world-back" aria-label={'← 返回' + parent} disabled={moving} onClick={onBack}>
        <span aria-hidden="true">‹</span>{parent}
      </button>
      <div className="world-top-title"><small>{layer}</small><h1>{title}</h1></div>
    </div>
    <button className="world-formation" aria-label="☷ 编队与战术" disabled={moving} onClick={onFormation}>
      <span aria-hidden="true">☷</span> 编队与战术
    </button>
  </div>;
}

function MapProgress({ label, current, total }: { label: string; current: number; total: number }) {
  return <span className="world-progress-caption">{label} <strong>{current} / {total}</strong></span>;
}

function Intel({ description, units, team }: { description: string; units?: Unit[]; team?: Unit[] }) {
  const members = units || team || [];
  return <details className="world-intel" onKeyDown={event => {
    if (event.key === 'Escape' && event.currentTarget.open) {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }}>
    <summary>地点情报 <span aria-hidden="true">⌃</span></summary>
    <div className="world-intel-sheet">
      <p>{description}</p>
      {members.length > 0 && <>
        <h3>{units ? '驻守队伍' : '远征队员'} <span>{members.length} 人</span></h3>
        <ul>{members.map(member => <li key={member.id}><b aria-hidden="true">{JOBS[member.job].icon}</b><span>{member.name}</span><small>{JOBS[member.job].name}</small></li>)}</ul>
      </>}
    </div>
  </details>;
}

export default function WorldMap({ encounters, team, location, initialSelection, cleared, onMove, onEnter, onFormation, onHome }: WorldProps) {
  const projection = useMapProjection();
  const [selected, setSelected] = useState(initialSelection ?? location);
  const [destination, setDestination] = useState(location);
  const [moving, setMoving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const nodes = [{ name: '晨星营地', subtitle: '远征的起点', detail: '篝火还未熄灭。整理队伍，沿着旧王道出发，找回被浓雾吞没的道路。' }, ...encounters];
  const node = nodes[selected];
  const unlocked = (i: number) => i <= 1 || cleared.includes(i - 2);
  const isHere = selected === location;
  const canTravel = (i: number) => !moving && unlocked(i) && Math.abs(i - location) === 1;
  const travel = (goal: number) => {
    const next = location + Math.sign(goal - location);
    if (!unlocked(goal) || !canTravel(next)) return;
    setSelected(goal); setDestination(next); setMoving(true);
    timer.current = setTimeout(() => { setMoving(false); onMove(next); }, 1650);
  };
  const current = points[moving ? destination : location];
  const atCamp = isHere && selected === 0;
  const locked = !unlocked(selected);
  const clearedHere = selected > 0 && cleared.includes(selected - 1);
  const objective = encounters.findIndex((_, i) => !cleared.includes(i)) + 1;
  const goal = atCamp ? objective || 1 : selected;
  const waypoint = location + Math.sign(goal - location);
  const orderLabel = moving ? '行军中…' : locked ? '先解放前方据点'
    : isHere && !atCamp ? (clearedHere ? '回访战场地图' : '进入战场地图') : '行军至' + nodes[waypoint].name;
  let hint: string;
  if (moving) hint = '从' + nodes[location].name + '前往' + nodes[destination].name + '。';
  else if (locked) hint = '先解放' + nodes[selected - 1].name + '，即可开通此路。';
  else if (isHere && !atCamp) hint = clearedHere
    ? (objective ? '下一个远征目标是' + nodes[objective].name + '。点选该地即可行军。' : '全境已解放。可以回访战场，或选择其他驻地。')
    : '队伍已抵达。进入战场部署路线，推进至据点。';
  else if (goal !== waypoint) hint = '前往' + nodes[goal].name + '，先经' + nodes[waypoint].name + '。';
  else hint = '从' + nodes[location].name + '前往' + nodes[waypoint].name + (waypoint ? '，抵达后可进入战场地图。' : '休整。');
  const order = () => {
    if (isHere && !atCamp) onEnter(selected - 1);
    else travel(goal);
  };

  return <main ref={projection.root} style={projection.routeVars} className="world-screen world-map-panel" aria-label="雾境边陲大地图">
    <div className="world-cartography">
      <svg className="world-map-svg" preserveAspectRatio="none" viewBox="0 0 1000 650" role="img" aria-label={`世界地图，晨星营地通向${encounters.map(e=>e.name).join('、')}`}><MapTerrain/><g transform={projection.fallbackTransform}>{roads.map((path, i) => <g key={path}><path d={path} stroke="#f0e7cb" strokeWidth="10" fill="none"/><path d={path} stroke={cleared.includes(i) ? '#5b795a' : '#9f8b5e'} strokeWidth="2.4" strokeDasharray="5 7" fill="none"/></g>)}<path d="m485 345 20 9m-19-18 21 10" stroke="#746145" strokeWidth="5"/><g opacity=".65"><use href="#world-keep" x="788" y="105" width="43" height="50"/><use href="#world-keep" x="598" y="214" width="34" height="40"/></g><path d="m170 426 15-26 17 26Zm15-26v26" fill="#dccba4" stroke="#827251" strokeWidth="2"/></g></svg>
      <div className="world-model-field"><MapDiorama coastal terrain="hills" seed="mistbound-frontier" nodes={worldPoints.map(projection.project)} roads={worldRoads} selected={String(selected)} current={String(location)} travelTo={moving ? String(destination) : undefined}/>
      <svg className="world-model-labels" viewBox="0 0 1000 650" preserveAspectRatio="none" aria-hidden="true"><FrontierNames/></svg></div>
      <div className="world-route-plane">{nodes.map((n, i) => <button key={i} className={['world-node', selected === i && 'world-node-selected', location === i && 'world-node-here', !unlocked(i) && 'world-node-locked'].filter(Boolean).join(' ')}
        style={{ left: points[i].x / 10 + '%', top: points[i].y / 6.5 + '%' }} disabled={moving}
        aria-label={n.name + (!unlocked(i) ? '，未解锁' : '') + (location === i ? '，当前位置' : '')}
        aria-current={location === i ? 'location' : undefined} aria-pressed={selected === i} onClick={() => setSelected(i)}>
        <span className="world-node-ring">{i === 0 ? '⌂' : cleared.includes(i - 1) ? '✓' : unlocked(i) ? '⚑' : '◇'}</span>
        <span className="world-node-label"><strong>{n.name}</strong></span>
      </button>)}
      <PartyFlag x={current.x} y={current.y} moving={moving}/></div>
    </div>
    <MapHeader title="雾境边陲" layer="大地图" onBack={onHome} onFormation={()=>onFormation(selected)} moving={moving}/>
    <Compass/>
    <div className="world-dock">
      <div className="world-map-footer"><span><i/> 队伍驻地 <b>{nodes[location].name}</b></span><MapProgress label={objective ? '据点解放' : '全境已解放'} current={cleared.length} total={encounters.length}/></div>
      <div className="world-order">
        <div className="world-order-info" aria-live="polite">
          <div className="world-order-title"><h2>{node.name}</h2><span>{isHere ? '当前驻地' : locked ? '道路封锁' : '选中目的地'}{clearedHere && ' · 已解放'}</span></div>
          <p>{hint}</p>
        </div>
        <div className="world-order-actions"><Intel key={selected} description={node.detail} units={selected ? encounters[selected - 1].units : undefined} team={team}/>
          <button className="world-primary" disabled={moving || locked} onClick={order} title={orderLabel}><span className="world-command-label">{orderLabel}</span><span aria-hidden="true">→</span></button>
        </div>
      </div>
    </div>
  </main>;
}

type LocalProps = {
  progress: LocalProgress; onProgress: (next:LocalProgress)=>void;
  encounter: Encounter; index: number; cleared: boolean;
  lastOutcome?: Battle['winner']; nextObjective?: string;
  onBattle: () => void; onBack: () => void; onFormation: () => void;
};
const start = { x: 190, y: 495 }, bridge = { x: 410, y: 375 }, forest = { x: 320, y: 240 }, approach = { x: 610, y: 255 }, fortress = { x: 805, y: 155 };
const localPoints = [modelPoint(start,'camp'), modelPoint(bridge,'bridge'), modelPoint(forest,'woods'), modelPoint(approach,'approach'), modelPoint(fortress,'fortress')];
const routeOptions = [
  {key:'bridge', label:'旧石桥', action:'沿石桥前进', pos:bridge, icon:'⌒'},
  {key:'woods', label:'林间小径', action:'穿过林间小径', pos:forest, icon:'♧'},
] as const;

export function LocalMap({ progress, onProgress, encounter, index, cleared, lastOutcome, nextObjective, onBattle, onBack, onFormation }: LocalProps) {
  const projection = useMapProjection();
  const { route, stage } = progress;
  const [moving, setMoving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const stepNames = ['战场入口', route === 'bridge' ? '旧石桥' : '林间小径', '高地观察点', encounter.name];
  const stepIds = ['camp', route, 'approach', 'fortress'];
  const stops = [start, route === 'bridge' ? bridge : forest, approach, fortress];
  const visualStage = moving ? Math.min(3, stage + 1) : stage;
  const marker = stops[visualStage];
  const advance = () => {
    if (moving || stage >= 3) return;
    setMoving(true);
    timer.current = setTimeout(() => { onProgress({...progress, stage:stage+1}); setMoving(false); }, 1650);
  };
  const settled = stage === 3 && cleared;
  const retry = stage === 3 && (lastOutcome === 'enemy' || lastOutcome === 'draw');
  const orderLabel = moving ? '队伍推进中…' : settled ? '返回大地图' : [
    '沿选定路线出发','前往高地观察点','接近敌军据点',retry ? '再次推演' : '启动战斗推演',
  ][stage];
  const returnHint = nextObjective ? '返回大地图，向' + nextObjective + '继续行军。' : '全境已解放。返回大地图可回访各处战场。';
  const hint = moving ? '正在前往' + stepNames[visualStage] + '…' : [
    '当前路线经' + stepNames[1] + '。可点选桥或林径更换路线。',
    '前往高地观察点，沿途查看守军情报。',
    '下一站是' + encounter.name + '，抵达后可以启动推演。',
    settled ? returnHint : retry ? '队伍仍驻据点前沿。调整编队后可再次推演。' : '已抵达据点前沿。确认编队后与守军交战。',
  ][stage];
  const status = settled ? '据点已解放' : retry ? (lastOutcome === 'draw' ? '推演僵持' : '推演失利') : stage === 3 ? '准备交战' : stage === 0 ? '选择路线' : '当前驻地';

  return <main ref={projection.root} style={projection.routeVars} className="world-screen world-map-panel local-screen" aria-label={encounter.name + '战场地图'}>
    <div className="world-cartography local-cartography">
      <svg className="world-map-svg" preserveAspectRatio="none" viewBox="0 0 1000 650" aria-hidden="true"><MapTerrain local/><g transform={projection.fallbackTransform}><path d="M190 495 280 455 410 375 502 322 610 255 706 218 805 155" fill="none" stroke="#eee6ca" strokeWidth="13"/><path d="M190 495 231 360 320 240 450 228 610 255" fill="none" stroke="#eee6ca" strokeWidth="13"/><path d="M190 495 280 455 410 375 502 322 610 255 706 218 805 155" fill="none" stroke={route === 'bridge' ? '#8e7046' : '#aaa184'} strokeWidth="3" strokeDasharray="7 7"/><path d="M190 495 231 360 320 240 450 228 610 255" fill="none" stroke={route === 'woods' ? '#5f7859' : '#aaa184'} strokeWidth="3" strokeDasharray="7 7"/><path d="m395 362 33 29m-25-37 33 29" fill="none" stroke="#7a6544" strokeWidth="6"/><use href="#local-keep" x="770" y="80" width="70" height="80"/><path d="m162 478 25-40 25 40Zm25-40v40" fill="#dfd1af" stroke="#776847" strokeWidth="2"/><path d="m591 234 18-28 19 28Z" fill="#b8b193" stroke="#807b63" strokeWidth="2"/><text x="623" y="376" fill="#766c4e" fontSize="14" letterSpacing="5" transform="rotate(-18 623 376)">敌 军 警 戒 区</text></g></svg>
      <div className="world-model-field"><MapDiorama terrain={['river','mountain','town'][index]} seed={'mistbound-region-' + index}
        nodes={localPoints.map(projection.project)} roads={localRoads} current={stepIds[stage]} selected={stage === 0 ? route : undefined}
        travelTo={moving ? stepIds[visualStage] : undefined}/></div>
      <div className="world-route-plane"><div className="local-map-point local-map-origin" style={{left:'19%', top:start.y / 6.5 + '%'}}><span>⌂</span><strong>战场入口</strong></div>
      {routeOptions.map(r => <button key={r.key} className={'local-map-point local-route-point' + (route === r.key ? ' local-point-selected' : '')}
        style={{left:r.pos.x / 10 + '%', top:r.pos.y / 6.5 + '%'}} disabled={stage > 0 || moving} aria-label={r.action}
        aria-pressed={route === r.key} onClick={() => onProgress({...progress,route:r.key})}><span>{r.icon}</span><strong>{r.label}</strong></button>)}
      <div className={'local-map-point' + (stage >= 2 ? ' local-point-visited' : '')} style={{left:'61%',top:approach.y / 6.5 + '%'}}><span>◇</span><strong>高地观察点</strong></div>
      <div className={'local-map-point local-enemy-point' + (stage === 3 ? ' local-point-visited' : '')} style={{left:'80.5%',top:fortress.y / 6.5 + '%'}}><span>{cleared ? '✓' : '⚔'}</span><strong>{encounter.name}</strong></div>
      <PartyFlag x={marker.x} y={marker.y} moving={moving}/></div>
    </div>
    <MapHeader title={encounter.name} layer="战场地图" onBack={onBack} onFormation={onFormation} moving={moving}/>
    <Compass/>
    <div className="world-dock">
      <div className="world-map-footer"><span><i/> {stage === 0 ? '已选路线' : '行军路线'} <b>{stepNames[1]}</b></span><MapProgress label="行军进度" current={stage} total={3}/></div>
      <div className="world-order">
        <div className="world-order-info" aria-live="polite">
          <div className="world-order-title"><h2>{stepNames[stage]}</h2><span>{status}</span></div>
          <p>{hint}</p>
        </div>
        <div className="world-order-actions"><Intel key={stage} description={encounter.detail} units={encounter.units}/>
          {settled && <button className="world-secondary" onClick={onBattle}>重新推演</button>}
          <button className="world-primary" disabled={moving} onClick={settled ? onBack : stage === 3 ? onBattle : advance}>{orderLabel}<span aria-hidden="true">{stage === 3 && !settled ? '⚔' : '→'}</span></button>
        </div>
      </div>
    </div>
  </main>;
}
