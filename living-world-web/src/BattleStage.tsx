import { useId, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Frame, GameContent, Fighter, BattleEffect } from './core/battle';
import CharacterAvatar from './CharacterAvatar';
import BattleCanvas from './three/BattleCanvas';
import './battle-stage.css';

export interface BattleStageProps {
  frame: Frame;
  previousFrame?: Frame;
  content: GameContent;
  step: number;
  duration: number;
  playing: boolean;
  replay: number;
  poseFraction?: number;
  inGame?: boolean;
}
const healingEffects = new Set<BattleEffect>(['heal', 'blessing']);
function position(unit: Fighter) {
  const front = unit.slot < 3;
  return { x: unit.side === 'ally' ? (front ? 33 : 15) : (front ? 67 : 85), y: 24 + (unit.slot % 3) * 27 };
}
function positionStyle(unit: Fighter): CSSProperties {
  const p = position(unit);
  return { left: `${p.x}%`, top: `${p.y}%` };
}
const sideName = (u?: Fighter) => u?.side === 'ally' ? '我方' : '敌方';
function EffectLayer({ frame, effectId }: { frame: Frame; effectId: string }) {
  const { action } = frame;
  const source = frame.units.find(u => u.id === frame.actor);
  const target = frame.units.find(u => u.id === frame.target);
  if (!action || !source || !target) return null;
  const a = position(source), b = position(target);
  const x1 = a.x * 10, y1 = a.y * 6 - 18, x2 = b.x * 10, y2 = b.y * 6 - 18;
  const same = source.id === target.id;
  const isHealing = healingEffects.has(action.effect), cover = action.effect === 'cover';
  const ranged = action.effect === 'pierce' || action.effect === 'followup' || (action.effect === 'strike' && source.job === 'bow');
  const midX = (x1 + x2) / 2, midY = Math.min(y1, y2) - (same ? 60 : 42);
  const path = same ? `M${x1 - 24} ${y1} C${x1 - 100} ${y1 - 100},${x1 + 100} ${y1 - 100},${x1 + 24} ${y1}` : `M${x1} ${y1} Q${midX} ${midY} ${x2} ${y2}`;
  const original = action.redirectedFrom ? frame.units.find(u => u.id === action.redirectedFrom) : undefined;
  const incoming = action.incomingActor ? frame.units.find(u => u.id === action.incomingActor) : undefined;
  return <svg className={`bs-effects bs-effect-${action.effect}`} viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true" data-testid="skill-effect" data-effect={action.effect}>
    <defs><marker id={effectId} markerWidth="9" markerHeight="9" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L8 4 L0 8 L2 4Z" fill="currentColor"/></marker></defs>
    {incoming && <path className="bs-threat-path" d={`M${position(incoming).x * 10} ${position(incoming).y * 6 - 18} L${x2} ${y2}`} />}
    {original && <path className="bs-intercept-path" d={`M${position(original).x * 10} ${position(original).y * 6 - 18} L${x2} ${y2}`} />}
    <path className="bs-trajectory-halo" d={path}/>
    <path className="bs-trajectory" d={path} pathLength="100" markerEnd={`url(#${effectId})`}/>
    {!same && <g className="bs-missile" style={{ offsetPath: `path('${path}')` } as CSSProperties}>
      {ranged ? <><path d="M-24 0H17M11-5 20 0 11 5M-22-5-15 0-22 5" fill="none" stroke="currentColor" strokeWidth="3"/><circle r="6" opacity=".3"/></> : <circle r={isHealing ? 9 : 5} fill="currentColor"/>}
    </g>}
    <g transform={`translate(${x2} ${y2})`}>
      <g className="bs-impact">
        <ellipse rx="40" ry="34" className="bs-impact-ring"/>
        {cover ? <path className="bs-shield-effect" d="M0-40 31-28 27 12 Q18 34 0 43 Q-18 34-27 12L-31-28Z M0-24V24M-15-6H15"/> : isHealing ? <><path className="bs-heal-cross" d="M-5-27H5V-5H27V5H5V27H-5V5H-27V-5H-5Z"/>{[-1, 1].map((n)=><path key={n} d={`M${n*41}-18v16m-8-8h16`} transform={`translate(${n*5} 0)`} className="bs-spark"/>)}</> : <><path className="bs-slash" d={action.effect === 'heavy' ? 'M-42 31Q-10-15 40-35 M-35 39Q-3-6 45-28' : 'M-31 24Q-7-10 30-26'}/>{[0,1,2,3,4,5].map(i=><path key={i} className="bs-spark" d="M0-44V-57" transform={`rotate(${i*60})`}/>)}</>}
      </g>
    </g>
    <g transform={`translate(${x1} ${y1})`}><ellipse className="bs-source-ring" rx="35" ry="28"/></g>
  </svg>;
}

export default function BattleStage({ frame, previousFrame, content, step, duration, playing: requestedPlaying, replay, poseFraction, inGame }: BattleStageProps) {
  const playing = requestedPlaying && poseFraction === undefined;
  const stageRef = useRef<HTMLElement>(null);
  const marker = useId().replace(/:/g, '');
  const cue = frame.action;
  const actor = frame.units.find(u => u.id === frame.actor);
  const target = frame.units.find(u => u.id === frame.target);
  const heal = cue && healingEffects.has(cue.effect);
  const cover = cue?.effect === 'cover';
  const original = cue?.redirectedFrom && frame.units.find(u => u.id === cue.redirectedFrom);
  const eventKey = `${replay}-${step}`;
  useLayoutEffect(()=>{
    // A newly selected paused frame is a readable still; toggling pause keeps live animation time.
    if (!playing && stageRef.current) {
      const fraction = Math.max(0, Math.min(1, poseFraction ?? .65));
      const selector = poseFraction === undefined ? '.bs-effects, .bs-floating' : '.bs-effects, .bs-floating, .bs-acting .bs-character, .bs-receiving .bs-character';
      for (const element of stageRef.current.querySelectorAll(selector)) {
        for (const animation of element.getAnimations({subtree:true})) animation.currentTime = duration * fraction;
      }
    }
  },[eventKey, poseFraction]);
  const actorPose = cue?.effect === 'cover' ? 'guard' : heal ? 'cast' : 'attack';
  const label = frame.kind === 'end' ? frame.text : frame.round === 0 ? '战斗即将开始' : `第 ${frame.round} 轮 · 行动资源恢复`;
  const totals = (side: Fighter['side']) => frame.units.filter(u => u.side === side && u.hp > 0).length;
  return <section ref={stageRef} className={`bs-stage ${playing ? 'is-playing' : 'is-paused'} ${cue ? `bs-tone-${cover ? 'cover' : heal ? 'heal' : actor?.side === 'enemy' ? 'enemy' : 'attack'}` : ''}`} style={{ '--action-duration': `${duration}ms` } as CSSProperties} aria-label="战斗演出" data-testid="battle-stage" data-step={step} data-playing={playing}>
    <div className="bs-action-banner" role="status" aria-live="polite" data-testid="action-banner">
      {cue && actor && target ? <>
        <div className={`bs-banner-person ${actor.side}`}><span>{sideName(actor)} · {content.jobs[actor.job].name}</span><strong data-testid="action-actor">{actor.name}</strong><small>{cover ? '正在掩护' : heal ? '正在施法' : '正在行动'}</small></div>
        <div className="bs-banner-skill"><span className="bs-event-type">{cue.resource === 'PP' ? '被动反应' : '主动技能'} <i>−{cue.cost} {cue.resource}</i></span><strong data-testid="action-skill">{cue.label}</strong><div className="bs-skill-arrow"><span/>→<span/></div></div>
        <div className={`bs-banner-person bs-banner-target ${target.side}`}><span>{sideName(target)} · {content.jobs[target.job].name}</span><strong data-testid="action-target">{target.name}</strong><small data-testid="action-amount">{cover ? '受到掩护 · 减伤 45%' : `${heal ? '恢复' : '受到'} ${cue.amount} ${heal ? 'HP' : '点伤害'}${target.hp === 0 ? ' · 倒下' : ''}`}</small></div>
      </> : <div className="bs-phase-banner"><span>{frame.kind === 'end' ? 'ENCOUNTER RESOLVED' : 'BATTLE CHRONICLE'}</span><strong className={inGame && frame.kind === 'end' ? 'battle-message' : undefined}>{label}</strong><small>{frame.kind === 'end' ? '可返回区域继续探索，或调整编队再次挑战' : '每人 3 AP / 2 PP · 按速度依次行动'}</small></div>}
    </div>
    <div className="bs-arena" data-testid="battle-arena">
      <svg className="bs-scenery" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id={`${marker}-sky`} x2="0" y2="1"><stop stopColor="#263c3b"/><stop offset=".65" stopColor="#152723"/><stop offset="1" stopColor="#233125"/></linearGradient><radialGradient id={`${marker}-ground`}><stop stopColor="#576549" stopOpacity=".5"/><stop offset="1" stopColor="#15231c" stopOpacity=".1"/></radialGradient></defs><rect width="1000" height="600" fill={`url(#${marker}-sky)`}/><circle cx="490" cy="80" r="42" fill="#c4c4a1" opacity=".15"/><path d="M0 140 100 53 183 124 310 21 442 133 554 46 669 130 802 40 1000 164V600H0Z" fill="#213a32"/><path d="M0 190 156 131 305 211 420 118 590 194 760 116 1000 210V600H0Z" fill="#152b24"/><path d="M0 260Q260 160 500 260T1000 240V600H0Z" fill="#1e2f24"/><ellipse cx="500" cy="408" rx="490" ry="220" fill={`url(#${marker}-ground)`}/><path d="M463 600 487 270 519 270 547 600" fill="#b4b68b" opacity=".04"/>{[178,340,502].map(y=><path key={y} d={`M60 ${y} Q500 ${y-30} 940 ${y}`} stroke="#bec395" strokeOpacity=".09" fill="none"/>)}<g stroke="#758265" strokeOpacity=".19" fill="none"><path d="M18 600 117 328 100 200M982 600 883 328 900 200"/><path d="M110 600 167 350M890 600 833 350"/></g><g fill="#19291f" opacity=".8"><path d="M25 0 35 230 0 390H0V0Z M975 0 965 230 1000 390H1000V0Z"/></g></svg>
      <BattleCanvas units={frame.units} frame={frame} previousFrame={previousFrame} duration={duration} playing={playing} poseFraction={poseFraction}/>
      <div className={inGame ? "bs-grid-plane" : undefined}><div className="bs-side-label bs-side-ally">雾行小队 <b>{totals('ally')} 人存活</b></div><div className="bs-side-label bs-side-enemy">敌方守军 <b>{totals('enemy')} 人存活</b></div>
      <div className="bs-rank-label" style={{left:'15%'}}>后排</div><div className="bs-rank-label" style={{left:'33%'}}>前排</div><div className="bs-rank-label" style={{left:'67%'}}>前排</div><div className="bs-rank-label" style={{left:'85%'}}>后排</div>
      {(['ally','enemy'] as const).flatMap(side=>Array.from({length:6},(_,slot)=>({side,slot}))).filter(p=>!frame.units.some(u=>u.side===p.side&&u.slot===p.slot)).map(p=>{const pos=position(p as Fighter);return <div className="bs-empty-slot" key={`${p.side}-${p.slot}`} style={{left:`${pos.x}%`,top:`${pos.y}%`}}>◇</div>;})}
      {frame.units.map(u=>{
        const acting = !!cue && u.id === actor?.id;
        const receiving = !!cue && u.id === target?.id;
        const oldHp = previousFrame?.units.find(p=>p.id===u.id)?.hp ?? u.hp;
        const down = u.hp <= 0;
        const hit = receiving && !heal && !cover;
        const pose = down ? 'fallen' : acting ? actorPose : hit ? 'hit' : 'idle';
        return <div key={u.id} className={`bs-unit unit ${u.side} ${acting?'bs-acting':''} ${receiving?'bs-receiving':''} ${down?'bs-down':''}`} style={positionStyle(u)} data-unit-id={u.id} data-actor={acting} data-target={receiving} data-hp={u.hp} aria-label={`${sideName(u)} ${u.name} ${content.jobs[u.job].name} HP ${u.hp}/${u.maxHp}，${u.ap} AP，${u.pp} PP`}>
          <div className="bs-foot-ring"/>
          {(acting||receiving)&&<div className="bs-role-tag">{acting&&receiving?'自我治疗':acting?(cover?'掩护者':'行动者'):cover?'受掩护':heal?'治疗目标':'受击者'}</div>}
          <div className="bs-character" data-character-anchor={u.id} key={down?`${replay}-fallen-${oldHp<=0?'settled':'impact'}-${u.id}`:acting||receiving?`${eventKey}-${u.id}`:`idle-${u.id}`}><CharacterAvatar job={u.job} side={u.side} pose={pose} duration={duration} paused={!playing||(down&&oldHp<=0)}/></div>
          {receiving && <div key={eventKey} className={`bs-floating ${heal?'bs-float-heal':cover?'bs-float-cover':''}`} aria-hidden="true">{cover?'掩护':`${heal?'+':'−'}${cue!.amount}`}<small>{cover?'减伤 45%':down?'击倒':heal?'恢复生命':'伤害'}</small></div>}
          <div className="bs-unit-info"><strong title={u.name}>{u.name}</strong><span className="bs-job">{content.jobs[u.job].name}</span><div className="bs-hp-track"><i className="bs-hp-ghost" style={{width:`${Math.max(oldHp,u.hp)/u.maxHp*100}%`}}/><i style={{width:`${u.hp/u.maxHp*100}%`}}/></div><div className="bs-vitals"><span>{u.hp}<small> / {u.maxHp}</small></span><span>{u.ap} AP · {u.pp} PP</span></div>{down&&<span className="bs-defeated-label">已倒下</span>}</div>
        </div>;
      })}
      <div key={eventKey} className="bs-effects-wrap"><EffectLayer frame={frame} effectId={`${marker}-arrow`}/></div>
      </div><div className="bs-arena-bottom"><span>{cue ? `${sideName(actor)} ${actor?.name} → ${sideName(target)} ${target?.name}` : '前排交锋 · 后排支援'}</span><span>{playing?'演出中':'已暂停'} · 事件 {step+1}</span></div>
    </div>
    {(!inGame || cue) && <div className="bs-action-note">{original ? <><span>↪ 伤害转移</span> 原目标 {original.name}，由 {target?.name} 承受攻击。</> : cover ? <><span>◇ 掩护反应</span> {actor?.name} 为同列的 {target?.name} 举盾；下一次攻击将转向盾卫。</> : cue ? <><span>{heal?'✧ 治疗结算':'⚔ 伤害结算'}</span> {target?.name} 当前生命 <b>{target?.hp} / {target?.maxHp}</b>。{cue.effect==='counter'?'受击后立即反击。':cue.effect==='followup'?'本次为攻击后的额外追击。':cue.effect==='blessing'?'攻击结束后触发祈护。':''}</> : '可暂停查看每次行动，也可拖动时间轴回看战况。'}</div>}
  </section>;
}
