import { chapterWeather } from '../three/mapScenery';
import { MapDiorama } from '../three/MapDiorama';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type SetStateAction } from 'react';
import BattleView from '../BattleView';
import type { Battle, Unit } from '../core/battle';
import { storyBook as book } from './book';
import { canMove, decodeStorySave, dialogueLines, dispatchStory, missingObjectives, narrativeContent, newStorySession, nextStoryStop, STORY_SAVE_KEY, unlockedLevels, type StoryCommand } from './session';
import type { DialogueLine, StoryLevel } from './types';
import StoryMap, { ChapterMap } from './StoryMap';
import { scriptMarkdown } from './script';
import HudWindow from './HudWindow';
import './narrative.css';
import './campaign-hud.css';

const kinds = { story: '剧情', battle: '战斗节点', camp: '整备', choice: '同行抉择', exit: '关卡收束' };
const battleNames = {ally:'胜利',enemy:'失利',draw:'僵持'};
function loadStory() {
  try { const raw = localStorage.getItem(STORY_SAVE_KEY); return { state: raw ? decodeStorySave(book, raw) : newStorySession(book), warning: '' }; }
  catch { return { state: newStorySession(book), warning: '剧情存档未能读取，已回到章节目录。雾境远征的存档不受影响。' }; }
}
function Portrait({ name, large = false }: { name: string; large?: boolean }) {
  const person = book.cast.find(c => name.includes(c.name));
  const index = Math.max(0, book.cast.findIndex(c => c.id === person?.id));
  return <div className={`sh-portrait ${large ? 'sh-portrait-large' : ''}`} style={{ '--sh-portrait': ['#748780', '#927761', '#9c9272', '#6c8170'][index] } as CSSProperties} aria-hidden="true">
    {person ? <svg viewBox="0 0 100 115"><path d="M7 115q0-38 27-43h32q27 5 27 43" fill="currentColor"/><path d="m35 72 15 16 15-16-8-9H43Z" fill="#c8ab8d"/><path d="M30 38q0-26 20-26t20 26v15q-3 22-20 24-18-5-20-24Z" fill="#d2b799"/><path d="M30 46q-8-18 1-30 23-16 38 5l2 29-6-18q-18 5-30-2Z" fill="#303c36"/><path d="M27 26q4-17 27-15 20 2 19 18l-26 2Z" fill={index === 2 ? '#c9c1a4' : '#798b79'}/><path d="M28 28h48l-2 5H30Z" fill="#596c5c"/><path d="M37 46h7m13 0h7M46 60q5 3 10-1" stroke="#5d5146" fill="none" strokeWidth="2"/><path d="m34 75 16 14-9 10-13-18m38-6L50 89l10 10 14-17M50 90v25" stroke="#d3c7a5" strokeOpacity=".4" fill="none" strokeWidth="2"/>{index === 0 && <path d="m67 93 10 20H56l-5-20Z" fill="#d5c5a0"/>}{index === 2 && <path d="M26 86v29m-4-25 10 0" stroke="#d5c5a0" strokeWidth="6"/>}</svg> : <span>山<br/>河</span>}
  </div>;
}
function Dialogue({ lines, index, level, onNext, onSkip, onAtlas, label = '剧情对话' }: { lines: DialogueLine[]; index: number; level: StoryLevel; onNext: () => void; onSkip: () => void; onAtlas?: () => void; label?: string }) {
  const [auto, setAuto] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const line = lines[index];
  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => {
    if (!auto) return;
    const timer = window.setTimeout(onNext, Math.max(6500, line.text.length * 105));
    return () => clearTimeout(timer);
  }, [auto, index, line.text.length, onNext]);
  if (!line) return null;
  return <div className={`sh-dialogue-overlay sh-scene-${level.map.terrain}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={box} onKeyDown={e => {
    if (e.key === 'Tab') { const focusable = Array.from(box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')); const first = focusable[0], last = focusable.at(-1); if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && (document.activeElement === last || document.activeElement === box.current)) { e.preventDefault(); first?.focus(); } }
  }}>
    <div className="sh-scene-backdrop" aria-hidden="true"><svg viewBox="0 0 1400 720" preserveAspectRatio="xMidYMid slice"><circle cx="1000" cy="170" r="68" fill="#d6c99b" opacity=".5"/><path d="M0 430 210 165 350 370 610 110 890 402 1100 185 1400 370V720H0Z" fill="#4a6258"/><path d="M0 510 260 340 460 490 770 290 980 540 1400 310V720H0Z" fill="#2b4840"/><path d="M0 610Q280 480 500 580T1000 540L1400 540V720H0Z" fill="#1c332e"/><g fill="#192c29" stroke="#526356" strokeWidth="2"><path d="M790 600V452h185v148Z"/><path d="m750 460 130-83 132 83Z"/><path d="M1050 615V480h175v135Z"/><path d="m1015 484 124-71 119 71Z"/></g><g fill="#c3aa70" opacity=".7"><path d="M840 520h23v30h-23ZM901 520h23v30h-23ZM1098 535h20v25h-20Z"/></g><path d="M200 720q330-120 580-90t620-100" fill="none" stroke="#b0b096" opacity=".18" strokeWidth="55"/></svg><MapDiorama setting="chronicle" view="landscape" weather={chapterWeather[level.id]} terrain={level.map.terrain} seed={level.id}/><div className="sh-scene-mist"/></div>
    <div className="sh-dialogue-top"><span>山河初燃 <i>／</i> {level.period}</span><div className="sh-dialogue-nav">
      {onAtlas && <button onClick={onAtlas} aria-label="返回章节大地图" title="保存当前对白并返回章节大地图">‹ 大地图</button>}
      <button onClick={onSkip}>略过本段 →</button></div></div>
    <div className="sh-dialogue-heading"><span>{level.location}</span><h2>{line.title || level.title}</h2><p>{level.style.weather} · {level.style.lighting}</p></div>
    <div className="sh-dialogue-card"><Portrait name={line.speaker} large/><div className="sh-dialogue-copy" aria-live="polite"><div className="sh-speaker"><strong>{line.speaker}</strong><small>{line.kind === 'history' ? '史实旁白' : line.kind === 'dialogue' ? '原创角色对白' : '场景叙述'}</small></div><p>{line.text}</p><div className="sh-dialogue-controls"><span>{String(index + 1).padStart(2, '0')} <i>/ {String(lines.length).padStart(2, '0')}</i></span><div><button onClick={() => setAuto(!auto)} aria-pressed={auto}>{auto ? '暂停自动播放' : '自动播放'}</button><button className="sh-primary" onClick={onNext}>{index === lines.length - 1 ? '结束本段' : '继续对白'} →</button></div></div></div></div>
  </div>;
}
function Sources({ level }: { level: StoryLevel }) {
  return <div className="sh-sources">{level.sources.map(id => { const s = book.sources.find(s => s.id === id)!; return <article key={id}><small>{s.type === 'memoir' ? '《星火燎原》· 回忆细节参考' : '历史事件 · 补充核对'}</small><strong>{s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title} ↗</a> : s.title}</strong><p>{s.note}</p></article>; })}</div>;
}
function ScriptLines({ lines }: { lines: DialogueLine[] }) { return <div className="sh-script-lines">{lines.map((line, i) => <p key={i} className={line.kind}><strong>{line.speaker}</strong><small>{line.kind === 'history' ? '史实' : line.kind === 'dialogue' ? '原创' : '场景'}</small><span>{line.text}</span></p>)}</div>; }
function downloadScript() {
  const url = URL.createObjectURL(new Blob([scriptMarkdown(book)], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = '山河初燃-完整关卡剧本.md'; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function NarrativeCampaign({ onHome }: { onHome: () => void }) {
  const [loaded] = useState(loadStory);
  const [state, setState] = useState(loaded.state);
  const [warning, setWarning] = useState(loaded.warning);
  const [tab, setTab] = useState<'play' | 'journal' | 'script'>('play');
  const [chapterId, setChapterId] = useState(book.levels.find(l => l.id === state.levelId)!.chapterId);
  const [selectedLevel, setSelectedLevel] = useState(state.levelId);
  const [selectedNode, setSelectedNode] = useState(state.progress[state.levelId]?.current || '');
  const [battleMode, setBattleMode] = useState<'battle' | 'formation' | null>(null);
  const [review, setReview] = useState<{ level: StoryLevel; lines: DialogueLine[]; index: number } | null>(null);
  const [panel, setPanel] = useState<'menu'|'details'|'reset'|null>(null);
  const send = useCallback((command: StoryCommand) => setState(s => dispatchStory(book, s, command)), []);
  useEffect(() => { try { localStorage.setItem(STORY_SAVE_KEY, JSON.stringify(state)); } catch { setWarning('浏览器暂时无法保存，请保持本页打开。当前剧情仍可继续。'); } }, [state]);
  useEffect(() => { setSelectedNode(state.progress[state.levelId]?.current || ''); }, [state.levelId, state.progress[state.levelId]?.current]);
  const unlocked = unlockedLevels(book, state);
  const completed = book.levels.filter(l => state.progress[l.id]?.completed).map(l => l.id);
  const chapter = book.chapters.find(c => c.id === chapterId)!;
  const currentLevel = book.levels.find(l => l.id === state.levelId)!;
  const atlasLevel = book.levels.find(l => l.id === selectedLevel)!;
  const progress = state.progress[state.levelId];
  const currentNode = currentLevel.nodes.find(n => n.id === progress?.current);
  const node = currentLevel.nodes.find(n => n.id === selectedNode) || currentNode;
  const activeDialogue = dialogueLines(book, state.pending);
  const nextLine = useCallback(() => send({ type: 'next' }), [send]);
  const battleContent = useMemo(() => { const content = narrativeContent(); content.encounters[0] = { ...content.encounters[0], name: currentNode?.name || currentLevel.title, subtitle: currentLevel.period, detail: currentNode?.objective || currentLevel.objective, units: content.encounters[0].units.map((u, i) => ({ ...u, name: ['前沿守备', '接近分队', '远处射手'][i] })) }; return content; }, [currentLevel, currentNode]);
  const setTeam = useCallback((update: SetStateAction<Unit[]>) => setState(old => dispatchStory(book, old, { type: 'team', team: typeof update === 'function' ? update(old.team) : update })), []);
  const enter = (id: string) => { setTab('play'); setSelectedLevel(id); setChapterId(book.levels.find(l => l.id === id)!.chapterId); send({ type: 'enter', levelId: id }); };
  const showReview = (level: StoryLevel, lines: DialogueLine[]) => setReview({ level, lines, index: 0 });
  const recordBattle = useCallback((winner: Battle['winner'] | null) => {
    if (winner) send({ type: 'battle-result', winner });
  }, [send]);
  const playBattle = () => setBattleMode('battle');
  const returnFromBattle = () => {
    if (battleMode === 'battle') setSelectedNode(progress.current);
    setBattleMode(null);
  };
  useEffect(()=>{
    if (!battleMode && state.view==='level' && !state.pending && progress?.lastBattle?.needsDebrief) send({type:'failure'});
  },[battleMode,state.view,state.pending,progress,send]);

  const field = useRef<HTMLDivElement>(null);
  const [fieldSize,setFieldSize] = useState({width:1200,height:760});
  useEffect(()=>{
    if(!field.current) return;
    const observer=new ResizeObserver(([entry])=>{
      const {width,height}=entry.contentRect;
      if(width && height) setFieldSize(old=>old.width===width&&old.height===height?old:{width,height});
    });
    observer.observe(field.current);
    return ()=>observer.disconnect();
  },[battleMode]);
  // Reserve space for the HUD without moving a location relative to its 3D road or marker.
  const project = useCallback(<T extends {x:number;y:number}>(point:T):T=>{
    const {width,height}=fieldSize;
    const narrow=width<700, short=height<490;
    const top=Math.min(height*.24,short?58:76);
    const bottom=Math.min(height*.43,short?94:narrow?204:134);
    // The orthographic map lens is 1.52:1. Crop the terrain on phones and
    // project the interactive route into the visible part of that canvas.
    const canvasWidth=Math.max(width,height*1.52);
    const canvasHeight=Math.max(height,width/1.52);
    const visibleY=top+(height-top-bottom)*point.y/100;
    return {...point, x:50+(point.x-50)*width/canvasWidth,
      y:50+(visibleY-height/2)/canvasHeight*100};
  },[fieldSize]);
  const mappedLevel = useMemo(()=>({...currentLevel,nodes:currentLevel.nodes.map(project),
    map:{...currentLevel.map,labels:currentLevel.map.labels.map(project)}}),[currentLevel,project]);
  const chapterLevels=useMemo(()=>book.levels.filter(l=>l.chapterId===chapter.id)
    .map(l=>({...l,world:project(l.world)})),[chapter,project]);
  const atlas = state.view === 'atlas';
  const nextLevel = book.levels[book.levels.indexOf(currentLevel) + 1];
  const detailsLevel = atlas ? atlasLevel : currentLevel;
  const allDone = completed.length === book.levels.length;
  const activeModal = !!(state.pending || review || panel || tab !== 'play');
  const openReader = (which: 'journal' | 'script') => { setPanel(null); setTab(which); };
  const toAtlas = () => {
    setTab('play'); setPanel(null); setBattleMode(null);
    if (!atlas) { setChapterId(currentLevel.chapterId); setSelectedLevel(currentLevel.id); }
    send({type:'atlas'});
  };
  const atlasProgress = state.progress[atlasLevel.id];
  const locked = !unlocked.includes(atlasLevel.id);
  const parkedAt = atlasLevel.nodes.find(n => n.id === atlasProgress?.current);
  let atlasAction = '进入战场地图';
  let atlasHint = atlasLevel.objective;
  if (locked) {
    atlasAction = '完成前关后启程';
    atlasHint = '先完成前一关，再从这里进入战场地图。';
  } else if (parkedAt) {
    atlasAction = atlasProgress.completed ? '回访战场地图' : '继续本关战场';
    if (atlasProgress.pausedDialogue) atlasHint = `队伍驻在「${parkedAt.name}」。继续本关可接着阅读对白。`;
    else if (!atlasProgress.completed) atlasHint = `队伍驻在「${parkedAt.name}」。继续本关即回到这个节点。`;
  }
  const nextStop = progress && nextStoryStop(currentLevel, progress);
  const resolved = !!(node && progress?.resolved.includes(node.id));
  const firstEngagement = node?.kind === 'battle' && !resolved && !progress?.lastBattle;
  const blocked = !!(node && currentNode && node.id!==currentNode.id && !canMove(currentLevel,progress,node.id));
  function nodeGuidance() {
    if (!node || !currentNode || !progress) return '';
    if (blocked) {
      if (!progress.resolved.includes(currentNode.id)) return `先完成「${currentNode.name}」的行动。`;
      if (node.id === currentLevel.exit && missingObjectives(currentLevel, progress).length) return '完成其余主线节点后再前往出口。';
      return '请选择与驻地相连的地点。';
    }
    if (node.id!==currentNode.id) return '从「'+currentNode.name+'」行军至此。';
    if (progress.completed && node.id===currentLevel.exit) return nextLevel ? '本关已完成，下一站是「'+nextLevel.title+'」。' : '全篇行程已完成，可返回章节大地图翻阅行记。';
    if (resolved) return nextStop ? '已完成本地行动。沿路前往「'+nextStop.name+'」，或在地图上另选地点。' : '已完成本地行动。可在地图上另选地点。';
    if (node.kind==='battle' && progress.lastBattle) return '上次推演'+battleNames[progress.lastBattle.winner]+'。执行剧情目标，继续行军。';
    return node.objective;
  }

  if (battleMode) return <div className="sh-battle-wrapper">
    <BattleView key={`${battleMode}-${currentLevel.id}-${currentNode?.id}`} content={battleContent} team={state.team} setTeam={setTeam}
      encounter={0} mode={battleMode} onResult={recordBattle} onBack={returnFromBattle}
      onWorld={toAtlas} worldLabel="章节大地图" originLabel="战场地图" siteLabel={currentNode?.name}
      resultHint={winner=>resolved?'这里的剧情行动已完成。返回战场可继续选择行军地点。':winner==='ally'
        ? '队伍仍驻「'+currentNode?.name+'」。返回战场地图执行剧情目标，继续本关。'
        : '回到「'+currentNode?.name+'」阅读整备对白，再决定重试或执行剧情目标。'}/>
  </div>;

  return <div className="sh-app">
    <div className="sh-field" inert={activeModal} ref={field}>
      <div className="sh-map-field" data-testid={atlas ? 'story-atlas' : 'story-level'} data-level-id={atlas ? undefined : currentLevel.id} data-current-node={atlas ? undefined : currentNode?.id}>
        {atlas ? <ChapterMap fitView chapter={chapter} levels={chapterLevels} selected={selectedLevel} completed={completed} unlocked={unlocked} onSelect={setSelectedLevel}/>
          : progress && node && currentNode && <StoryMap fitView level={mappedLevel} current={currentNode.id} selected={node.id} completed={progress.resolved} onSelect={setSelectedNode}/>}
      </div>
      <header className="sh-field-header">
        <div className="sh-header-id">{atlas?<span className="sh-stamp" aria-hidden="true">山河</span>:<button className="sh-hud-button sh-back-atlas" aria-label="返回章节大地图" onClick={toAtlas}>‹ 大地图</button>}<div>
          <small>{atlas ? '山河初燃 · 章节大地图' : '战场地图 · '+book.chapters.find(c=>c.id===currentLevel.chapterId)!.title}</small>
          {atlas ? <label className="sh-chapter-pick"><select aria-label="选择章节" value={chapterId} onChange={e=>{
            const c=book.chapters.find(c=>c.id===e.target.value)!; setChapterId(c.id); setSelectedLevel(c.levels[0]);
          }}>{book.chapters.map((c,i)=><option key={c.id} value={c.id}>{String(i+1).padStart(2,'0')}　{c.title}</option>)}</select><span aria-hidden="true">⌄</span></label> : <h1>{currentLevel.title}</h1>}
        </div></div>
        <div className="sh-hud-actions">
          {!atlas && <button className="sh-hud-button" aria-label="小队编成与战术" onClick={()=>setBattleMode('formation')}>编队</button>}
          <button className="sh-hud-button" aria-haspopup="dialog" onClick={()=>setPanel('menu')}>行军菜单</button>
        </div>
      </header>
      {warning && <div role="status" className="sh-warning">{warning}<button onClick={()=>setWarning('')}>关闭</button></div>}
      {atlas ? <section className="sh-command-deck" aria-label="选中关卡">
        <div className="sh-command-copy">
          <small className="sh-command-meta">{atlasLevel.period}　·　行程 {atlasLevel.id.slice(1)} / {book.levels.length}</small>
          <h2>{atlasLevel.title}</h2><p>{atlasHint}</p>
        </div>
        <div className="sh-command-actions">
          <button className="sh-outline" onClick={()=>setPanel('details')}>行程详情</button>
          <button className="sh-primary" disabled={locked} onClick={()=>enter(atlasLevel.id)}>{atlasAction} →</button>
        </div>
        {allDone && <div className="sh-ending" data-testid="story-finale"><strong>全篇行记已完成</strong><span>1930年秋，新的考验还在河的另一边。</span><button className="sh-link" onClick={()=>openReader('journal')}>翻阅完整行军手记 →</button></div>}
      </section> : progress && node && currentNode && <section className="sh-command-deck" aria-label="节点行动">
        <div className="sh-command-copy" aria-live="polite">
          <small className="sh-command-meta">{node.id===currentNode.id?'队伍驻地':'驻地 '+currentNode.name+' ／ 目的地'}　·　{kinds[node.kind]}　·　{progress.resolved.length} / {currentLevel.nodes.length} 节点</small>
          <h2>{node.name}</h2>
          <p>{nodeGuidance()}</p>
        </div>
        <div className="sh-command-actions">
          <button className="sh-outline" onClick={()=>setPanel('details')}>行程详情</button>
          {node.id!==currentNode.id ?
            <button className="sh-primary" disabled={!canMove(currentLevel,progress,node.id)} onClick={()=>send({type:'move',nodeId:node.id})}>前往选中节点 →</button>
            : <>
              {node.kind==='battle' && <button className={firstEngagement?'sh-primary':'sh-outline'} onClick={playBattle}>{progress.lastBattle?'再次战斗推演':'进入战斗推演'}</button>}
              {progress.completed && node.id===currentLevel.exit ?
                <button className="sh-primary" data-testid="level-complete" onClick={()=>nextLevel?enter(nextLevel.id):toAtlas()}>{nextLevel?'前往下一关':'返回全篇行记'} →</button>
                : progress.resolved.includes(node.id) ?
                  <>{nextStop&&<button className="sh-primary" onClick={()=>send({type:'move',nodeId:nextStop.id})}>前往{nextStop.name} →</button>}
                  <button className="sh-outline" onClick={()=>showReview(currentLevel,[...node.dialogue,...(node.choices?.find(c=>c.id===progress.choices[node.id])?.lines??[]),...node.after])}>回看节点对白</button></>
                  : node.kind==='choice' ? node.choices!.map(c=><button className="sh-choice" key={c.id} data-choice-id={c.id} title={c.text} onClick={()=>send({type:'choose',choiceId:c.id})}>{c.label} →</button>)
                  : <button className={firstEngagement?'sh-outline':'sh-primary'} onClick={()=>send({type:'complete'})}>{node.kind==='exit'?'结束本关 · 阅读后续':node.kind==='battle'?'执行剧情目标':'完成节点行动'} →</button>}
            </>}
        </div>
      </section>}
    </div>

    {panel==='menu' && <HudWindow title="行军菜单" compact onClose={()=>setPanel(null)}>
      <div className="sh-menu-info"><span>山河初燃</span><span>已完成 {completed.length} / {book.levels.length} 关</span></div>
      <nav className="sh-menu-grid">
        {!atlas && <button onClick={toAtlas}>返回章节大地图</button>}
        {atlas && progress && !progress.completed && <button onClick={()=>{setPanel(null);enter(state.levelId);}}>回到正在进行的关卡</button>}
        <button onClick={()=>openReader('journal')}>行军手记</button><button onClick={()=>openReader('script')}>剧本与史料</button>
        <button onClick={()=>setPanel('reset')}>重新开始本篇</button><button onClick={onHome}>返回游戏首页</button>
      </nav>
    </HudWindow>}
    {panel==='details' && <HudWindow title="行程详情" onClose={()=>setPanel(null)}>
      <div className="sh-dossier">
        <small className="sh-command-meta">{detailsLevel.period}　·　{detailsLevel.location}</small>
        <h3>{detailsLevel.title}</h3><p>{detailsLevel.background}</p>
        {atlas && <><h4>{chapter.title}</h4><p>{chapter.summary}</p><h4>行程目标</h4><p>{detailsLevel.objective}</p></>}
        {!atlas && progress && node && <><h4>{node.name}</h4><p>{node.summary}</p>
          {node.choices?.map(c=><p key={c.id}><strong>{c.label}</strong>　{c.text}</p>)}
          <h4>行程任务</h4><ul>{currentLevel.nodes.filter(n=>!n.optional).map(n=><li key={n.id}>{progress.resolved.includes(n.id)?'✓':'○'}　{n.objective}</li>)}</ul></>}
        <details className="sh-details"><summary>场景与史实</summary>
          <p>{detailsLevel.map.routeNote}</p><p>节点为玩法抽象，线路为叙事示意。战术推演采用原型兵种与动作，推演胜负由队伍配置决定，历史进程按剧情推进。</p>
          {detailsLevel.historicalNotes.map(line=><p key={line}>{line}</p>)}
          <div className="sh-style-notes">{([ ['色彩',detailsLevel.style.palette], ['天气',detailsLevel.style.weather], ['光线',detailsLevel.style.lighting], ['声音设定',detailsLevel.style.sound], ['构图',detailsLevel.style.composition] ]).map(([label,v])=><span key={label}>{label} · {v}</span>)}</div>
          <Sources level={detailsLevel}/>
        </details>
      </div>
    </HudWindow>}
    {panel==='reset' && <HudWindow title="重新开始剧情" compact onClose={()=>setPanel(null)}>
      <div className="sh-dossier"><h3>从秋收余火重新出发？</h3><p>将重置《山河初燃》的关卡、行军手记与小队设置。</p>
        <div className="sh-command-actions"><button className="sh-outline" onClick={()=>setPanel(null)}>保留行记</button>
        <button className="sh-primary" onClick={()=>{setState(newStorySession(book));setSelectedNode('');setChapterId(book.chapters[0].id);setSelectedLevel(book.levels[0].id);setTab('play');setPanel(null);}}>确认重新开始</button></div>
      </div>
    </HudWindow>}
    {tab!=='play' && <div className="sh-reader-layer" inert={!!review}><HudWindow title={tab==='script'?'剧本与史料':'行军手记'} onClose={()=>setTab('play')}>
      <nav className="sh-reader-nav">
        <button aria-pressed={tab==='journal'} onClick={()=>setTab('journal')}>行军手记</button>
        <button aria-pressed={tab==='script'} onClick={()=>setTab('script')}>剧本与史料</button>
        <button onClick={toAtlas}>返回章节大地图</button>
      </nav>
      {tab === 'journal' && <main className="sh-main sh-reader" data-testid="story-journal"><p>已访问地点的对白、选择与关卡结尾。</p>{!Object.keys(state.progress).length && <div className="sh-empty">手记还是空的。先从第一章启程。</div>}{book.levels.filter(l => state.progress[l.id]).map(l => { const p = state.progress[l.id]; return <details key={l.id} className="sh-details" open={l.id === state.levelId}><summary>{l.title} <small>{p.completed ? '本关完成' : `${p.resolved.length} / ${l.nodes.length} 节点完成`}</small></summary><button className="sh-link" onClick={() => showReview(l, l.intro)}>重看开场</button>{l.nodes.filter(n => p.visited.includes(n.id)).map(n => <article className="sh-journal-entry" key={n.id}><div><strong>{n.name}</strong><span>{p.resolved.includes(n.id) ? '已完成' : '正在经历'}</span></div><ScriptLines lines={n.dialogue}/>{p.choices[n.id] && <div className="sh-choice-record">手记中的决定：{n.choices!.find(c => c.id === p.choices[n.id])?.label}<ScriptLines lines={n.choices!.find(c => c.id === p.choices[n.id])!.lines}/></div>}{p.resolved.includes(n.id) && <ScriptLines lines={n.after}/>}</article>)}{p.completed && <><h3>这一程之后</h3><ScriptLines lines={l.outro}/></>}<button className="sh-outline" onClick={() => enter(l.id)}>回到这段行程</button></details>; })}</main>}

      {tab === 'script' && <main className="sh-main sh-reader" data-testid="story-script"><div className="sh-reader-heading"><span className="sh-kicker">完整剧本 · 含未游玩剧情</span><button className="sh-outline" onClick={downloadScript}>↓ 导出完整剧本</button></div><p>{book.premise}</p><details className="sh-details"><summary>创作边界与人物发展</summary>{book.sourceNotes.map(n => <p key={n}>{n}</p>)}<div className="sh-cast-cards">{book.cast.map(c => <article key={c.id}><Portrait name={c.name}/><h3>{c.name} · {c.role}</h3><p>{c.description}</p><p>{c.arc}</p></article>)}</div></details><label className="sh-script-select">选择关卡剧本<select value={selectedLevel} onChange={e => { setSelectedLevel(e.target.value); setChapterId(book.levels.find(l => l.id === e.target.value)!.chapterId); }}>{book.levels.map(l => <option key={l.id} value={l.id}>{l.id.slice(1)} · {l.title}</option>)}</select></label><article className="sh-script-level"><span className="sh-period">{atlasLevel.period} · {atlasLevel.location}</span><h2>{atlasLevel.title}</h2><p>{atlasLevel.background}</p><p><strong>关卡目标：</strong>{atlasLevel.objective}</p><div className="sh-script-style"><span>色彩 · {atlasLevel.style.palette}</span><span>天气 · {atlasLevel.style.weather}</span><span>光线 · {atlasLevel.style.lighting}</span><span>声音 · {atlasLevel.style.sound}</span><span>构图 · {atlasLevel.style.composition}</span></div><h3>开场</h3><ScriptLines lines={atlasLevel.intro}/>{atlasLevel.nodes.map(n => <section key={n.id}><h3>{n.name} <small>{kinds[n.kind]} · {n.optional ? '可选' : '主线'}</small></h3><p>{n.summary}</p><p className="sh-script-objective">目标：{n.objective}</p><ScriptLines lines={n.dialogue}/>{n.choices?.map(c => <div className="sh-choice-record" key={c.id}><h4>选择：{c.label}</h4><p>{c.text}</p><ScriptLines lines={c.lines}/></div>)}<h4>完成后</h4><ScriptLines lines={n.after}/></section>)}<h3>收束与下一关</h3><ScriptLines lines={atlasLevel.outro}/><h3>推演失利与重试</h3><ScriptLines lines={atlasLevel.failure}/><h3>地图与史实</h3><p>{atlasLevel.map.routeNote}</p>{atlasLevel.historicalNotes.map((n, i) => <p key={i}>{n}</p>)}<Sources level={atlasLevel}/></article></main>}

    </HudWindow></div>}
    {state.pending && <Dialogue key={`${state.pending.kind}-${state.pending.levelId}-${state.pending.nodeId || ''}-${state.pending.choiceId || ''}`} lines={activeDialogue} index={state.pending.line} level={currentLevel} onNext={nextLine} onSkip={() => send({ type: 'skip' })} onAtlas={toAtlas}/>}
    {review && <Dialogue key={`review-${review.level.id}`} label="对白回看" lines={review.lines} index={review.index} level={review.level} onNext={() => setReview(r => r && (r.index >= r.lines.length - 1 ? null : { ...r, index: r.index + 1 }))} onSkip={() => setReview(null)}/>}
  </div>;
}
