import { MapDiorama } from '../three/MapDiorama';
import type { StoryChapter, StoryLevel, StoryNode } from './types';
import './story-map.css';

interface StoryMapProps {
  level: StoryLevel;
  current: string;
  selected: string;
  completed: string[];
  onSelect: (id: string) => void;
  moving?: boolean;
  fitView?: boolean;
}

interface ChapterMapProps {
  chapter: StoryChapter;
  levels: StoryLevel[];
  selected: string;
  completed: string[];
  unlocked: string[];
  onSelect: (id: string) => void;
  fitView?: boolean;
}

const symbols: Record<StoryNode['kind'], string> = { story: '◇', battle: '⚔', camp: '⌂', choice: '⋈', exit: '→' };
const kinds: Record<StoryNode['kind'], string> = { story: '剧情', battle: '交战', camp: '整备', choice: '抉择', exit: '启程' };
const trees = [[82,370],[111,401],[141,362],[163,396],[199,360],[238,403],[736,463],[766,481],[803,455],[837,487],[877,449],[913,476],[305,106],[335,129],[361,102],[384,139],[405,111]];
const ridges = [[27,70,1.1],[106,107,.9],[726,49,1],[792,73,1.2],[865,49,1],[678,108,.9]];

/** Atmospheric drawing only. All travel topology comes from the scenario's edges. */
function Terrain({ terrain, chapter = false }: { terrain: StoryLevel['map']['terrain']; chapter?: boolean }) {
  const river = terrain === 'river' || chapter;
  return <g className={`sh-map-terrain sh-map-terrain-${terrain}`}>
    <rect width="1000" height="660" fill="#ddd3b6"/>
    <path d="M0 115Q145 35 328 102T705 116T1000 61V0H0Z" fill="#b8b894" opacity=".58"/>
    <path d="M0 544Q161 485 342 548T669 538T1000 547V660H0Z" fill="#b5b28a" opacity=".54"/>
    <path d="M25 185Q144 127 262 176T492 159M10 202Q145 149 255 194T493 177M578 535Q742 487 956 540M575 551Q751 507 964 557" fill="none" stroke="#a7a17a" strokeWidth="1.4" opacity=".6"/>
    <path d={river ? 'M488 -20C371 97 536 144 463 245S546 366 444 446S446 574 364 680' : 'M1000 298C847 272 868 373 744 357S624 470 512 465S376 559 217 588L113 660'} fill="none" stroke="#8aaba1" strokeWidth={river ? 44 : 18} opacity=".85"/>
    <path d={river ? 'M488 -20C371 97 536 144 463 245S546 366 444 446S446 574 364 680' : 'M1000 298C847 272 868 373 744 357S624 470 512 465S376 559 217 588L113 660'} fill="none" stroke="#c5d2b7" strokeWidth={river ? 27 : 8}/>
    {ridges.map(([x,y,s], i) => <g key={i} transform={`translate(${x} ${y}) scale(${terrain === 'mountain' ? s * 1.4 : s})`} opacity={terrain === 'town' ? .32 : .65}>
      <path d="M0 91 48 0 101 91" fill="#b1b397" stroke="#7d8a70" strokeWidth="1.5"/><path d="M48 0 39 41 49 37 37 74 50 62 45 91H101Z" fill="#939d81"/><path d="m24 50 10-10m34 8 13 23" fill="none" stroke="#6e7c65"/>
    </g>)}
    {trees.map(([x,y],i) => <g key={i} transform={`translate(${x} ${y}) scale(${.8 + (i % 3) * .15})`} opacity=".58">
      <path d="M0 29Q-13 19-6 10Q-5-3 4-2Q17-1 14 10Q25 22 13 29Z" fill="#81936c" stroke="#647b5b"/><path d="M5 9v31m0-18-7-6m7 11 7-8" stroke="#62735a" fill="none"/>
    </g>)}
    {(terrain === 'village' || terrain === 'town' || chapter) && <g className="sh-map-settlement" stroke="#82785c" strokeWidth="1.3" opacity=".65">
      <g transform="translate(607 156)"><path d="M0 23h65v39H0Z" fill="#b9ac88"/><path d="m-10 24 43-24 43 24Z" fill="#787e67"/><path d="M24 62V39h16v23M8 35v11m46-11v11" fill="#81765b"/></g>
      <g transform="translate(684 192) scale(.75)"><path d="M0 23h65v39H0Z" fill="#c3b58e"/><path d="m-10 24 43-24 43 24Z" fill="#7c8067"/><path d="M24 62V39h16v23" fill="#81765b"/></g>
      <g transform="translate(270 464) scale(.75)"><path d="M0 23h65v39H0Z" fill="#c3b58e"/><path d="m-10 24 43-24 43 24Z" fill="#7c8067"/><path d="M24 62V39h16v23" fill="#81765b"/></g>
      {terrain === 'town' && <g transform="translate(565 225)"><path d="M0 15h170v37H0Z" fill="#a5a183"/><path d="M70 52V30q15-19 30 0v22" fill="#706f59"/><path d="M62 14V-8h47v22m-56-22 32-15 34 15" fill="#7c8067"/></g>}
    </g>}
    {(terrain === 'hills' || terrain === 'village') && <g fill="none" stroke="#9e9c70" strokeWidth="1.3" opacity=".75">
      <path d="m651 532 54-30 41 31-54 33ZM708 499l52-29 41 31-53 29ZM697 571l55-30 42 31-53 29Z"/>
      <path d="m664 531 29 20m-16-29 29 20m15-42 29 20m-16-29 29 20m-53 53 29 20m-16-28 29 20"/>
    </g>}
    <g stroke="#776d50" strokeWidth="1" opacity=".12">{Array.from({length:20},(_,i)=><path key={i} d={`M${i*52} 0V660M0 ${i*43}H1000`}/>)}</g>
    <path d="M16 16H984V644H16Z M22 22H978V638H22Z" fill="none" stroke="#766a4d" opacity=".38"/>
    <g className="sh-map-compass" transform="translate(929 577)" fill="none" stroke="#6c7055"><circle r="24"/><path d="M0-35 7-7 35 0 7 7 0 35-7 7-35 0-7-7Z"/><path d="M0-35V35M-35 0H35"/><path d="M0-35 7-7 0 0Z" fill="#687657"/><text y="-45" fill="#59654b" stroke="none" textAnchor="middle" fontSize="14">北</text></g>
  </g>;
}

function Edge({ from, to, done }: { from: {x:number;y:number}; to: {x:number;y:number}; done: boolean }) {
  return <g className={done ? 'sh-map-road sh-map-road-done' : 'sh-map-road'}>
    <path d={`M${from.x*10} ${from.y*6.6}L${to.x*10} ${to.y*6.6}`} className="sh-map-road-under"/>
    <path d={`M${from.x*10} ${from.y*6.6}L${to.x*10} ${to.y*6.6}`} className="sh-map-road-line"/>
  </g>;
}

export default function StoryMap({ level, current, selected, completed, onSelect, moving = false, fitView = false }: StoryMapProps) {
  return <section className="sh-map" role="region" aria-label={`${level.title}节点地图`}>
    <div className="sh-map-heading"><div><span>行军手绘图 / {level.period}</span><strong>{level.location}</strong></div><span className="sh-map-seal">山河<br/>初燃</span></div>
    <div className="sh-map-scroll" tabIndex={fitView ? undefined : 0} aria-label={fitView ? undefined : '可横向浏览的关卡地图'}>
      <div className={`sh-map-canvas ${moving ? 'sh-map-moving' : ''}`}>
        <svg viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true"><Terrain terrain={level.map.terrain}/>
          {level.edges.map((edge,i)=>{const a=level.nodes.find(n=>n.id===edge.from),b=level.nodes.find(n=>n.id===edge.to);return a&&b?<Edge key={i} from={a} to={b} done={completed.includes(a.id)&&completed.includes(b.id)}/>:null;})}
        </svg>
        <MapDiorama setting="chronicle" terrain={level.map.terrain} seed={level.id} nodes={level.nodes} roads={level.edges} current={current} selected={selected}/>
        <svg className="sh-geography-labels" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true">
          {level.map.labels.map((label,i)=><text className="sh-map-place" key={i} x={label.x*10} y={label.y*6.6} textAnchor="middle">{label.name}</text>)}
        </svg>
        {level.nodes.map(node=><button key={node.id} type="button" data-node-id={node.id} aria-label={`节点 ${node.name}`} aria-pressed={selected===node.id} disabled={moving} onClick={()=>onSelect(node.id)} style={{left:`${node.x}%`,top:`${node.y}%`}} className={`sh-map-node sh-map-kind-${node.kind} ${selected===node.id?'sh-map-selected':''} ${current===node.id?'sh-map-current':''} ${completed.includes(node.id)?'sh-map-complete':''}`}>
          <span className="sh-map-node-icon" aria-hidden="true">{completed.includes(node.id)?'✓':symbols[node.kind]}</span>
          <span className="sh-map-node-title">{node.name}</span>
          <span className="sh-map-node-meta">{current===node.id?'队伍在此':completed.includes(node.id)?'已记录':`${node.optional?'支线 · ':''}${kinds[node.kind]}`}</span>
        </button>)}
      </div>
    </div>
    <div className="sh-map-legend"><span><b>◇</b> 剧情</span><span><b>⚔</b> 交战</span><span><b>⌂</b> 整备</span><span><b>⋈</b> 抉择</span><span className="sh-map-legend-current"><i/> 当前驻地</span></div>
    <p className="sh-map-note">{level.map.routeNote} <span>节点为玩法抽象，路径为叙事示意，不代表精确地形。</span></p>
  </section>;
}

export function ChapterMap({ chapter, levels, selected, completed, unlocked, onSelect, fitView = false }: ChapterMapProps) {
  const ordered=chapter.levels.map(id=>levels.find(level=>level.id===id)).filter((level):level is StoryLevel=>!!level);
  return <section className="sh-map sh-map-chapter" role="region" aria-label={`${chapter.title}章节地图`}>
    <div className="sh-map-heading"><div><span>{chapter.period} / {chapter.region}</span><strong>{chapter.title}</strong></div><span className="sh-map-seal">行军<br/>纪事</span></div>
    <div className="sh-map-scroll" tabIndex={fitView ? undefined : 0} aria-label={fitView ? undefined : '可横向浏览的章节地图'}><div className="sh-map-canvas">
      <svg viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true"><Terrain terrain="hills" chapter/>
        {ordered.slice(1).map((level,i)=><Edge key={level.id} from={ordered[i].world} to={level.world} done={completed.includes(ordered[i].id)&&completed.includes(level.id)}/>)}
      </svg>
      <MapDiorama setting="chronicle" terrain="hills" seed={chapter.id} nodes={ordered.map(level=>({id:level.id,...level.world}))} roads={ordered.slice(1).map((level,i)=>({from:ordered[i].id,to:level.id}))} selected={selected}/>
      <svg className="sh-geography-labels" viewBox="0 0 1000 660" preserveAspectRatio="none" aria-hidden="true">
        <text className="sh-map-region-label" x="47" y="604">{chapter.region}</text>
      </svg>
      {ordered.map((level,i)=>{const done=completed.includes(level.id),open=unlocked.includes(level.id)||done;return <button key={level.id} type="button" data-level-id={level.id} aria-label={`关卡 ${level.title}`} aria-pressed={selected===level.id} onClick={()=>onSelect(level.id)} style={{left:`${level.world.x}%`,top:`${level.world.y}%`}} className={`sh-map-node sh-map-level ${selected===level.id?'sh-map-selected':''} ${done?'sh-map-complete':''} ${!open?'sh-map-locked':''}`}>
        <span className="sh-map-node-icon" aria-hidden="true">{done?'✓':String(i+1).padStart(2,'0')}</span><span className="sh-map-node-title">{level.title}</span><span className="sh-map-node-meta">{done?'可重访':open?'可启程':'待前关完成'} · {level.period}</span>
      </button>;})}
    </div></div>
    <div className="sh-map-legend"><span><b>✓</b> 已完成</span><span><b>◇</b> 选择关卡查看详情</span><span>灰色地点尚未开放</span></div>
    <p className="sh-map-note">行程示意 · 非等比例地理图。连线表示剧情先后，不代表精确行军路线。<span>可预览全部关卡，沿已开放的路线启程。</span></p>
  </section>;
}
