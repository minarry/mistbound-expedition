import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import BattleStage from './BattleStage';
import CharacterAvatar from './CharacterAvatar';
import BattleCanvas from './three/BattleCanvas';
import { CONDITIONS, TARGETS, defaultRules, simulate, skillsFor, type GameContent, type Unit, type Job, type Rule, type Battle, type Fighter } from './core/battle';
import './tactical-hud.css';

interface BattleViewProps {
  content: GameContent;
  team: Unit[];
  setTeam: Dispatch<SetStateAction<Unit[]>>;
  encounter: number;
  mode?: 'battle' | 'formation';
  onWin?: () => void;
  onBack: () => void;
  onWorld?: () => void;
  returnToWorldOnWin?: boolean;
  worldLabel?: string;
  originLabel?: string;
  siteLabel?: string;
  resultHint?: (winner: Battle['winner']) => string;
  onResult?: (winner: Battle['winner'] | null) => void;
}

const resultTitles = { ally:'战斗胜利', enemy:'战斗失利', draw:'战斗僵持' };

export default function BattleView({content,team,setTeam,encounter,mode='battle',onWin,onBack,onResult,onWorld,
  worldLabel='大地图',originLabel='战场地图',siteLabel,resultHint,returnToWorldOnWin=false}: BattleViewProps) {
  const {jobs,skills} = content;
  const mission = content.encounters[encounter];
  const [selected,setSelected] = useState(team[0].id);
  const [battle,setBattle] = useState<Battle|null>(()=>mode==='battle'?simulate(team,mission.units,content):null);
  const [step,setStep] = useState(0), [playing,setPlaying] = useState(mode==='battle');
  const [speed,setSpeed] = useState(1800), [replay,setReplay] = useState(0);
  const [moving,setMoving] = useState(false), [inspectEnemy,setInspectEnemy] = useState(false);
  const [panel,setPanel] = useState<'orders'|'log'|null>(null);
  const [phase,setPhase] = useState<'encounter'|'report'|'review'>('encounter');
  const [exitIntent,setExitIntent] = useState<'retreat'|'deploy'|null>(null);
  const settled = useRef<Battle|null>(null);
  const resumeAfterCancel = useRef(false);
  const exitTrigger = useRef<HTMLElement|null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null), closeRef = useRef<HTMLButtonElement>(null);
  const hero = team.find(u=>u.id===selected) || team[0];
  const frame = battle?.frames[step], finished = !!battle && step===battle.frames.length-1;
  const duration = frame?.kind==='start' ? Math.round(speed*.8) : speed;
  const playbackClock = useRef<{key:string;remaining:number}|null>(null);
  useEffect(()=>{
    const key = `${replay}:${step}:${duration}`;
    if(playbackClock.current?.key!==key) playbackClock.current={key,remaining:duration*(!playing&&frame?.action ? .35 : 1)};
    const clock=playbackClock.current;
    if(!playing||!battle||finished) return;
    const started=performance.now();
    const timer=window.setTimeout(()=>{clock.remaining=0;setStep(s=>Math.min(s+1,battle.frames.length-1));},clock.remaining);
    return ()=>{clearTimeout(timer);clock.remaining=Math.max(0,clock.remaining-(performance.now()-started));};
  },[playing,battle,step,duration,finished,replay]);
  useEffect(()=>{
    if(!finished || !battle) return;
    if(settled.current!==battle) {
      settled.current=battle;
      if(battle.winner==='ally') onWin?.();
      onResult?.(battle.winner);
      setPlaying(false);setPanel(null);setPhase('report');
    } else if(phase==='review' && playing) {
      setPlaying(false);setPanel(null);setPhase('report');
    }
  },[finished,battle,onWin,onResult,phase,playing]);
  function closePanel() {setPanel(null);toggleRef.current?.focus();}
  useEffect(()=>{
    if(!panel) return;
    closeRef.current?.focus();
    const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closePanel();}};
    window.addEventListener('keydown',onKey);
    return ()=>window.removeEventListener('keydown',onKey);
  },[panel]);
  function seek(index:number) {setPlaying(false);setStep(index);}
  function start() {
    settled.current=null;setPhase('encounter');
    onResult?.(null);setBattle(simulate(team,mission.units,content));setStep(0);setPlaying(true);
    setMoving(false);setPanel(null);setInspectEnemy(false);setReplay(n=>n+1);
  }
  function edit() {
    setPhase('encounter');setPlaying(false);setBattle(null);setPanel(null);setStep(0);
  }
  function showReport() {
    if(!battle) return;
    seek(battle.frames.length-1);
    setPanel(null);
    if(settled.current===battle) setPhase('report');
  }
  function review(openLog = false) {
    if(!battle) return;
    setPhase('review');setStep(openLog ? battle.frames.length-1 : 0);
    setPlaying(!openLog);setPanel(openLog ? 'log' : null);setReplay(n=>n+1);
  }
  function requestExit(intent:'retreat'|'deploy') {
    if(!battle || settled.current===battle) { if(intent==='retreat') onBack(); else edit(); return; }
    resumeAfterCancel.current=playing;
    exitTrigger.current=document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPlaying(false);setPanel(null);setExitIntent(intent);
  }
  function cancelExit() {
    setExitIntent(null);setPlaying(resumeAfterCancel.current);
    requestAnimationFrame(()=>exitTrigger.current?.focus());
  }
  function update(fn:(u:Unit)=>Unit) {setTeam(old=>old.map(u=>u.id===hero.id?fn(u):u));}
  function changeRule(index:number,patch:Partial<Rule>) {
    update(u=>({...u,rules:u.rules.map((r,i)=>i===index?{...r,...patch}:r)}));
  }
  function raiseRule(index:number) {
    update(u=>{const rules=[...u.rules];[rules[index-1],rules[index]]=[rules[index],rules[index-1]];return {...u,rules};});
  }
  function addMember() {
    const slot = [0,1,2,3,4,5].find(s=>!team.some(u=>u.slot===s));
    if(slot===undefined) return;
    const id = 'a'+[10,11,12,13,14,15].find(n=>!team.some(u=>u.id==='a'+n));
    setTeam([...team,{id,name:'新晋队员',job:'sword',slot,rules:defaultRules('sword')}]);
    setSelected(id);
  }
  function selectSlot(slot:number,occupant?:Unit) {
    if(moving) {
      setTeam(old=>old.map(u=>u.id===hero.id?{...u,slot}:u.slot===slot?{...u,slot:hero.slot}:u));
      setMoving(false);
    } else if(occupant) setSelected(occupant.id);
  }
  function showOrders() {
    if(panel==='orders') {closePanel();return;}
    setMoving(false);setInspectEnemy(false);setPanel('orders');
  }
  const side = inspectEnemy ? 'enemy' : 'ally';
  const units:Fighter[] = (inspectEnemy?mission.units:team).map(u=>({...u,side,hp:jobs[u.job].hp,maxHp:jobs[u.job].hp,ap:3,pp:2}));
  const place = siteLabel || mission.name;
  const reportVisible = !!battle && phase==='report';
  const battlefieldRoute = {label:'返回战场地图',go:onBack};
  const worldRoute = onWorld && {label:'返回'+worldLabel,go:onWorld};
  const worldFirst = returnToWorldOnWin && battle?.winner==='ally' && !!worldRoute;
  const primaryRoute = worldFirst ? worldRoute : battlefieldRoute;
  const secondaryRoute = worldFirst ? battlefieldRoute : worldRoute;
  const reviewing = phase==='review';
  const endUnits = battle?.frames.at(-1)?.units || [];
  const strength = (side:Fighter['side']) => {
    const force=endUnits.filter(u=>u.side===side);
    return `${force.filter(u=>u.hp>0).length} / ${force.length}`;
  };
  return <section className={`tactical-screen ${battle?'in-replay':'in-deployment'} ${panel?'has-sheet':''} ${reportVisible?'showing-report':''}`} aria-label={reportVisible?'战果':battle?'战斗推演':'队伍部署'}>
    <div className="tactical-live" inert={reportVisible || !!exitIntent}>
    {battle && frame ? <BattleStage frame={frame} previousFrame={battle.frames[step-1]} content={content} step={step} duration={duration} playing={playing&&!finished} replay={replay} inGame/>
    : <div className={`tactical-board formation ${side} ${moving?'choosing-slot':''}`}>
      <BattleCanvas units={units} selected={inspectEnemy?undefined:hero.id} deployment/>
      <div className="tactical-ranks" aria-hidden="true"><span>前排</span><span>后排</span></div>
      <div className="tactical-slots slots">{[0,3,1,4,2,5].map(slot=>{
        const u=units.find(u=>u.slot===slot), active=u?.id===hero.id && !inspectEnemy;
        return <button key={slot} aria-label={`${inspectEnemy?'敌方':'我方'}${slot<3?'前排':'后排'}${slot%3+1}${u?' '+u.name:''}`}
          aria-pressed={active} disabled={inspectEnemy||(!u&&!moving)} className={`tactical-slot ${u?'occupied':'vacant'} ${active?'current':''}`} onClick={()=>selectSlot(slot,u)}>
          {u?<><span className="formation-avatar" data-character-anchor={u.id}><CharacterAvatar job={u.job} side={side}/></span>
            <span className="tactical-nameplate"><strong>{u.name}</strong><small>{jobs[u.job].name}</small></span></>
          : <span className="tactical-empty"><b>＋</b>{moving?'移至此处':'空阵位'}</span>}
        </button>;
      })}</div>
    </div>}

    <div className="tactical-ident">
      {mode==='battle' && !reviewing && <button className="tactical-back" aria-label="返回战场地图" title="返回战场地图" onClick={()=>requestExit('retreat')}>←</button>}
      <div><small>{reviewing?'战果 / 本场回看':battle?'战场地图 / 战斗推演':originLabel+' / '+(inspectEnemy?'敌情侦察':'队伍部署')}</small><h1>{mode==='formation' ? siteLabel || '雾行小队' : place}</h1></div>
    </div>
    <div className="tactical-status">{battle?<><span>回合</span><b>{String(frame?.round??0).padStart(2,'0')}</b><i>/ 08</i></>:<><span>{inspectEnemy?'守军':'队员'}</span><b>{units.length}</b><i>/ 6</i></>}</div>

    {battle ? <div className="tactical-dock replay-dock">
      <div className="playback-track"><span>战斗回放</span><input className="timeline" aria-label="战斗时间轴" type="range" min={0} max={battle.frames.length-1} value={step} onChange={e=>seek(Number(e.target.value))}/><output>{step+1} / {battle.frames.length}</output></div>
      <div className="playback-buttons">
        <button className="hud-icon" aria-label="上一事件" title="上一事件" disabled={step===0} onClick={()=>seek(step-1)}>⏮</button>
        <button className="hud-primary" onClick={()=>finished?review():setPlaying(!playing)}>{finished?'从头回看':playing?'暂停回放':'继续回放'}</button>
        <button className="hud-icon" aria-label="单步" title="单步" disabled={finished} onClick={()=>seek(step+1)}>⏭</button>
        <select aria-label="回放速度" value={speed} onChange={e=>{setSpeed(Number(e.target.value));setReplay(n=>n+1);}}><option value={3000}>0.6×</option><option value={1800}>1×</option><option value={900}>2×</option></select>
        <button ref={toggleRef} aria-expanded={panel==='log'} onClick={()=>{if(panel==='log')closePanel();else {setPlaying(false);setPanel('log');}}}>战斗日志</button>
        <button onClick={showReport}>{reviewing?'返回战果':'查看战果'}</button>{!reviewing && <button onClick={()=>requestExit('deploy')}>返回部署</button>}
      </div>
    </div> : <div className="tactical-dock formation-dock">
      <div className="formation-summary" aria-live="polite"><b>{inspectEnemy?'敌方阵列':hero.name}</b><span>{inspectEnemy?'侦察阵位':moving?'请选择目标阵位':`${jobs[hero.job].name} · ${hero.slot<3?'前排':'后排'} ${hero.slot%3+1}`}</span></div>
      <div className="formation-actions">
        {mode==='battle'&&<button onClick={()=>{setMoving(false);setPanel(null);setInspectEnemy(!inspectEnemy);}}>{inspectEnemy?'查看我方':'侦察敌方'}</button>}
        {!inspectEnemy&&<><button aria-pressed={moving} onClick={()=>{setPanel(null);setMoving(!moving);}}>{moving?'取消换位':'换位'}</button><button ref={toggleRef} aria-expanded={panel==='orders'} onClick={showOrders}>编辑战术</button></>}
        <button className="hud-primary" onClick={mode==='formation'?onBack:start} title={mode==='formation'?'完成编队并返回'+originLabel:undefined}>{mode==='formation'?'完成编队 →':'开始交战 →'}</button>
      </div>
    </div>}

    {panel && <aside className={`tactical-sheet ${panel==='log'?'log-sheet':'orders-sheet'}`} aria-label={panel==='log'?'战斗日志':'编队与战术'}>
      <div className="tactical-sheet-head"><h2>{panel==='log'?'战斗日志':'编队与战术'}</h2><button ref={closeRef} aria-label="关闭面板" onClick={closePanel}>×</button></div>
      <div className="tactical-sheet-body">
        {panel==='log' && frame && <details className="tactical-strength">
          <summary>当前阵列状态</summary>
          <table><thead><tr><th>角色</th><th>生命</th><th>AP</th><th>PP</th></tr></thead><tbody>
            {frame.units.map(u=><tr key={u.id}><th><span>{u.side==='ally'?'我方':'敌方'}</span> {u.name}</th><td>{u.hp} / {u.maxHp}</td><td>{u.ap}</td><td>{u.pp}</td></tr>)}
          </tbody></table>
        </details>}
        {panel==='log' && battle && <div className="log">{battle.frames.slice(0,step+1).map((f,i)=>
          <button key={i} className={`bs-log-jump ${i===step?'latest':''}`} onClick={()=>{seek(i);closePanel();}} title="回看这次行动"><span>{String(i+1).padStart(2,'0')}</span><p>{f.text}</p></button>).reverse()}</div>}
        {panel==='orders' && <>
          <div className="roster" aria-label="小队成员">{team.map(u=><button key={u.id} title={u.name} aria-label={u.name} aria-pressed={u.id===hero.id} className={u.id===hero.id?'active':''} onClick={()=>setSelected(u.id)}>{jobs[u.job].icon}</button>)}{team.length<6&&<button aria-label="增加队员" onClick={addMember}>＋</button>}</div>
          <div className="tactical-selected"><h3>{hero.name}</h3><span>{hero.slot<3?'前排':'后排'} {hero.slot%3+1}</span></div>
          <label className="job-label">角色职业<select aria-label="角色职业" value={hero.job} onChange={e=>{const job=e.target.value as Job;update(u=>({...u,job,rules:defaultRules(job)}));}}>{Object.entries(jobs).map(([key,j])=><option key={key} value={key}>{j.name}</option>)}</select></label>
          <div className="stats">{([['生命','hp'],['攻击','atk'],['防御','def'],['速度','speed']] as const).map(([label,key])=><span key={key}><b>{jobs[hero.job][key]}</b>{label}</span>)}</div>
          <div className="tactics-title"><strong>行动优先级</strong><span>从上至下匹配</span></div>
          {hero.rules.map((rule,i)=><div className="rule" key={i}><div className="rule-head"><span className="rule-number">{i+1}</span><select aria-label={`战术${i+1}技能`} value={rule.skill} onChange={e=>changeRule(i,{skill:e.target.value as Rule['skill']})}>{skillsFor(hero.job).map(s=><option key={s} value={s}>{skills[s].name} · {skills[s].cost} AP</option>)}</select><input aria-label={`启用战术${i+1}`} type="checkbox" checked={rule.enabled} onChange={e=>changeRule(i,{enabled:e.target.checked})}/><button title="上移优先级" aria-label={`上移战术${i+1}`} disabled={i===0} onClick={()=>raiseRule(i)}>↑</button></div>
            <label>当<select aria-label={`战术${i+1}条件`} value={rule.condition} onChange={e=>changeRule(i,{condition:e.target.value as Rule['condition']})}>{Object.entries(CONDITIONS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
            <label>目标<select aria-label={`战术${i+1}目标`} value={rule.target} onChange={e=>changeRule(i,{target:e.target.value as Rule['target']})}>{Object.entries(TARGETS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label></div>)}
          <div className="passive"><span>被动 · 1 PP</span><p>{jobs[hero.job].passive}</p></div>
          <div className="editor-footer"><button disabled={team.length<=1} onClick={()=>{const rest=team.filter(u=>u.id!==hero.id);setTeam(rest);setSelected(rest[0].id);}}>移出队伍</button><button onClick={()=>{setTeam(structuredClone(content.squad));setSelected(content.squad[0].id);}}>重置编队</button></div>
        </>}
      </div>
    </aside>}
    </div>
    {reportVisible && battle && <div className="tactical-overlay">
      <section className="tactical-report" data-testid="battle-result" data-outcome={battle.winner} aria-labelledby="encounter-outcome">
        <p className="report-place">{place} <span>/</span> 战果</p>
        <h2 id="encounter-outcome">{resultTitles[battle.winner]}</h2>
        <dl className="report-strength">
          <div><dt>推演回合</dt><dd>{battle.rounds}</dd></div>
          <div><dt>我方可战</dt><dd>{strength('ally')}</dd></div>
          <div><dt>敌方可战</dt><dd>{strength('enemy')}</dd></div>
        </dl>
        <p className="report-next">{resultHint?.(battle.winner) || (worldFirst?'返回'+worldLabel+'选择下一个目的地。':battle.winner==='ally'?'返回战场查看当前据点。':'返回战场整理队伍，或调整编队后重新挑战。')}</p>
        <div className="report-routes">
          <button autoFocus className="hud-primary" onClick={primaryRoute.go}>{primaryRoute.label}</button>
          {secondaryRoute && <button onClick={secondaryRoute.go}>{secondaryRoute.label}</button>}
        </div>
        <div className="report-tools" aria-label="本场记录与再战">
          <button onClick={()=>review()}>回看本场</button>
          <button onClick={()=>review(true)}>战斗日志</button>
          <button onClick={edit}>调整编队再战</button>
        </div>
      </section>
    </div>}
    {exitIntent && <div className="tactical-overlay">
      <section className="tactical-report retreat-confirm" role="dialog" aria-modal="true" aria-labelledby="retreat-title"
        onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();cancelExit();}}}>
        <p className="report-place">{place} <span>/</span> 战斗推演</p>
        <h2 id="retreat-title">{exitIntent==='retreat'?'撤回战场地图？':'返回战前部署？'}</h2>
        <p className="report-next">本场尚未结算。{exitIntent==='retreat'?'撤回后队伍留在当前交战地点，重新交战会从第一回合开始。':'调整部署会结束这次推演。准备就绪后，从第一回合重新交战。'}</p>
        <div className="report-routes">
          <button autoFocus className="hud-primary" onClick={cancelExit}>继续推演</button>
          <button onClick={()=>{setExitIntent(null);if(exitIntent==='retreat')onBack();else edit();}}>{exitIntent==='retreat'?'撤回战场地图':'调整部署'}</button>
        </div>
      </section>
    </div>}
  </section>;
}
